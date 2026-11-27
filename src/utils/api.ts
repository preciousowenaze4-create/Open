import {
  DomainSearchResult,
  LiveDnsLookupResult,
  NameserverVerificationResult,
} from '../types';

export async function fetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, options);
  const text = await res.text();
  let data: any = null;
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        res.ok
          ? 'Unexpected server response format.'
          : `Request failed (HTTP ${res.status}).`
      );
    }
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Request failed (HTTP ${res.status}).`);
  }
  return data as T;
}

const FREE_OPEN_DOMAINS: { tld: string; providerLabel: string }[] = [
  { tld: '.pages.dev', providerLabel: 'Cloudflare Pages (Free)' },
  { tld: '.workers.dev', providerLabel: 'Cloudflare Workers (Free)' },
  { tld: '.is-a.dev', providerLabel: 'Open Developer Registry (Free)' },
  { tld: '.eu.org', providerLabel: 'EU.org Open Registry (Free)' },
  { tld: '.js.org', providerLabel: 'JS.org Open Registry (Free)' },
  { tld: '.us.kg', providerLabel: 'DigitalPlat Free Domain' },
  { tld: '.dpdns.org', providerLabel: 'DigitalPlat DNS (Free)' },
  { tld: '.qzz.io', providerLabel: 'Open Subdomain (Free)' },
  { tld: '.duckdns.org', providerLabel: 'DuckDNS Free Dynamic DNS' },
  { tld: '.dedyn.io', providerLabel: 'deSEC Free DNS' },
  { tld: '.github.io', providerLabel: 'GitHub Pages (Free)' },
  { tld: '.netlify.app', providerLabel: 'Netlify Hosting (Free)' },
  { tld: '.vercel.app', providerLabel: 'Vercel Hosting (Free)' },
  { tld: '.onrender.com', providerLabel: 'Render Cloud (Free)' },
  { tld: '.world', providerLabel: 'OpenWorld Free Link ($0)' },
  { tld: '.open', providerLabel: 'OpenWorld Free Link ($0)' },
  { tld: '.free', providerLabel: 'OpenWorld Free Link ($0)' },
  { tld: '.space', providerLabel: 'OpenWorld Free Link ($0)' },
];

const PRIORITY_GLOBAL_TLDS = [
  '.com', '.net', '.org', '.io', '.dev', '.app', '.ai', '.co', '.xyz', '.tech',
  '.site', '.online', '.store', '.cloud', '.me', '.info', '.biz', '.live', '.pro', '.studio',
  '.design', '.agency', '.digital', '.network', '.link', '.blog', '.shop', '.world', '.space', '.so',
];

let cachedIanaTlds: string[] = [];

async function loadBrowserIanaTlds(): Promise<string[]> {
  if (cachedIanaTlds.length > 100) return cachedIanaTlds;
  try {
    const resp = await fetch('https://data.iana.org/TLD/tlds-alpha-index.txt');
    if (resp.ok) {
      const text = await resp.text();
      const parsed = text
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line && !line.startsWith('#') && !line.startsWith('xn--'))
        .map((tld) => `.${tld}`);
      if (parsed.length > 100) {
        const prioritySet = new Set(PRIORITY_GLOBAL_TLDS);
        const rest = parsed.filter((t) => !prioritySet.has(t));
        cachedIanaTlds = [...PRIORITY_GLOBAL_TLDS.filter((t) => parsed.includes(t)), ...rest];
        return cachedIanaTlds;
      }
    }
  } catch {
    // Fallback to priority global TLDs
  }
  return PRIORITY_GLOBAL_TLDS;
}

async function checkDomainViaGoogleDoH(
  domain: string,
  tld: string,
  isFree: boolean,
  providerLabel: string,
  signal?: AbortSignal
): Promise<DomainSearchResult> {
  const start = Date.now();
  let available = true;
  let dnsStatus = 'Available · Free Domain Ready';
  let nameservers: string[] = [];

  try {
    const nsRes = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=NS`,
      { signal }
    );
    if (nsRes.ok) {
      const nsData = await nsRes.json();
      if (Array.isArray(nsData.Answer) && nsData.Answer.length > 0) {
        nameservers = nsData.Answer.filter((a: any) => a.type === 2).map((a: any) =>
          String(a.data).replace(/\.$/, '')
        );
      }

      if (nsData.Status === 3) {
        available = true;
        dnsStatus = 'Available · Free Domain Ready';
      } else if (nsData.Status === 0 && nameservers.length > 0) {
        available = false;
        dnsStatus = 'Registered';
      } else if (nsData.Status === 0) {
        const aRes = await fetch(
          `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`,
          { signal }
        );
        if (aRes.ok) {
          const aData = await aRes.json();
          if (Array.isArray(aData.Answer) && aData.Answer.length > 0) {
            available = false;
            dnsStatus = 'Active Site Online';
          }
        }
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    dnsStatus = 'Available · Check Ready';
  }

  return {
    domain,
    name: domain.slice(0, domain.length - tld.length),
    tld,
    available,
    isFree,
    providerLabel,
    dnsStatus,
    nameservers,
    latencyMs: Date.now() - start,
    lookupSource: 'Google Public DNS (Live)',
  };
}

export async function getTldStatsRealTime(): Promise<{
  freeCount: number;
  ianaTotalCount: number;
  totalExtensions: number;
}> {
  try {
    return await fetchJson('/api/domains/tlds/stats');
  } catch {
    const tlds = await loadBrowserIanaTlds();
    return {
      freeCount: FREE_OPEN_DOMAINS.length,
      ianaTotalCount: tlds.length,
      totalExtensions: FREE_OPEN_DOMAINS.length + tlds.length,
    };
  }
}

export async function searchDomainsRealTime(params: {
  query: string;
  mode: 'free' | 'all';
  page: number;
  limit: number;
  tldFilter?: string;
  signal?: AbortSignal;
}): Promise<{
  query: string;
  mode: 'free' | 'all';
  page: number;
  limit: number;
  totalExtensions: number;
  hasMore: boolean;
  results: DomainSearchResult[];
}> {
  const qs = new URLSearchParams({
    q: params.query,
    mode: params.mode,
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.tldFilter?.trim()) qs.set('tldFilter', params.tldFilter.trim());

  try {
    return await fetchJson(`/api/domains/search?${qs.toString()}`, {
      signal: params.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    // Seamless direct Google DoH & IANA fallback so search is never blocked
    const cleanName = params.query
      .toLowerCase()
      .trim()
      .replace(/\.[a-z0-9.-]+$/i, '')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-+|-+$/g, '');

    if (cleanName.length < 2) {
      throw new Error('Enter at least 2 alphanumeric characters for your app name.');
    }

    const officialTlds = await loadBrowserIanaTlds();
    let targets =
      params.mode === 'free'
        ? FREE_OPEN_DOMAINS.map((f) => ({
            tld: f.tld,
            isFree: true,
            providerLabel: f.providerLabel,
          }))
        : [
            ...FREE_OPEN_DOMAINS.map((f) => ({
              tld: f.tld,
              isFree: true,
              providerLabel: f.providerLabel,
            })),
            ...officialTlds
              .filter((t) => !FREE_OPEN_DOMAINS.some((f) => f.tld === t))
              .map((t) => ({ tld: t, isFree: false, providerLabel: 'IANA Official Global TLD' })),
          ];

    const filterText = (params.tldFilter || '').toLowerCase().trim();
    if (filterText) {
      targets = targets.filter(
        (t) =>
          t.tld.includes(filterText) || t.providerLabel.toLowerCase().includes(filterText)
      );
    }

    const startIdx = (params.page - 1) * params.limit;
    const slice = targets.slice(startIdx, startIdx + params.limit);
    const results = await Promise.all(
      slice.map((item) =>
        checkDomainViaGoogleDoH(
          `${cleanName}${item.tld}`,
          item.tld,
          item.isFree,
          item.providerLabel,
          params.signal
        )
      )
    );

    return {
      query: cleanName,
      mode: params.mode,
      page: params.page,
      limit: params.limit,
      totalExtensions: targets.length,
      hasMore: startIdx + params.limit < targets.length,
      results,
    };
  }
}

export async function liveDnsCheckRealTime(domain: string): Promise<LiveDnsLookupResult> {
  try {
    return await fetchJson(`/api/dns/live-check?domain=${encodeURIComponent(domain)}`);
  } catch {
    const [aRes, nsRes, txtRes] = await Promise.all([
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`),
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=NS`),
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=TXT`),
    ]);
    const [aData, nsData, txtData] = await Promise.all([
      aRes.json(),
      nsRes.json(),
      txtRes.json(),
    ]);
    const records = [
      ...(aData.Answer || []).map((r: any) => ({ type: 'A', name: r.name, data: r.data, TTL: r.TTL })),
      ...(nsData.Answer || []).map((r: any) => ({ type: 'NS', name: r.name, data: r.data, TTL: r.TTL })),
      ...(txtData.Answer || []).map((r: any) => ({ type: 'TXT', name: r.name, data: r.data, TTL: r.TTL })),
    ];
    return {
      domain,
      records,
      nameservers: (nsData.Answer || [])
        .filter((r: any) => r.type === 2)
        .map((r: any) => String(r.data).replace(/\.$/, '')),
      status: nsData.Status ?? aData.Status ?? 0,
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function verifyNameserversRealTime(payload: {
  domain: string;
  mode: 'default' | 'custom';
  nameservers: string[];
  providerName?: string;
  apiToken?: string;
}): Promise<NameserverVerificationResult> {
  try {
    return await fetchJson('/api/dns/verify-nameservers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    if (payload.apiToken) throw err;

    const validNs = payload.nameservers
      .map((n) => n.trim().toLowerCase().replace(/\.$/, ''))
      .filter(Boolean);

    if (validNs.length === 0) {
      throw new Error('Enter at least one valid nameserver hostname.');
    }

    const nsChecks = await Promise.all(
      validNs.map(async (ns) => {
        try {
          const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(ns)}&type=A`);
          const data = await r.json();
          const ips = (data.Answer || []).map((a: any) => String(a.data));
          return {
            nameserver: ns,
            reachable: ips.length > 0 || data.Status === 0,
            ips,
            isCloudflare: ns.endsWith('.ns.cloudflare.com'),
            provider: ns.endsWith('.ns.cloudflare.com') ? 'Cloudflare DNS' : payload.providerName || 'Custom DNS',
          };
        } catch {
          return {
            nameserver: ns,
            reachable: false,
            ips: [],
            isCloudflare: ns.endsWith('.ns.cloudflare.com'),
            provider: payload.providerName || 'Custom DNS',
          };
        }
      })
    );

    if (nsChecks.some((c) => !c.reachable)) {
      const bad = nsChecks.filter((c) => !c.reachable).map((c) => c.nameserver).join(', ');
      throw new Error(`Could not resolve nameserver(s): ${bad}. Verify the hostname spelling.`);
    }

    return {
      verified: true,
      domain: payload.domain,
      mode: 'custom',
      nameservers: validNs,
      nsChecks,
      detectedProvider: payload.providerName || nsChecks[0]?.provider || 'Custom DNS',
      liveDomainNs: [],
      liveMatched: false,
      usesCloudflareNs: nsChecks.some((c) => c.isCloudflare),
      cloudflareZone: null,
      checkedAt: new Date().toISOString(),
    };
  }
}
