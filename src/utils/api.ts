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

const CURATED_FREE_OPEN_DOMAINS: { tld: string; providerLabel: string }[] = [
  { tld: '.is-a.dev', providerLabel: 'Open Developer Registry (Free)' },
  { tld: '.js.org', providerLabel: 'JS.org Open Registry (Free)' },
  { tld: '.dpdns.org', providerLabel: 'DigitalPlat DNS (Free)' },
  { tld: '.us.kg', providerLabel: 'DigitalPlat Free Domain' },
  { tld: '.qzz.io', providerLabel: 'Open Subdomain (Free)' },
  { tld: '.dedyn.io', providerLabel: 'deSEC Free DNS' },
  { tld: '.dynv6.net', providerLabel: 'Dynv6 Free Open DNS' },
  { tld: '.eu.org', providerLabel: 'EU.org Open Registry (Free)' },
  { tld: '.pages.dev', providerLabel: 'Cloudflare Pages (Free)' },
  { tld: '.workers.dev', providerLabel: 'Cloudflare Workers (Free)' },
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

interface BrowserSuffixCatalog {
  freeTargets: { tld: string; isFree: boolean; providerLabel: string }[];
  icannTlds: string[];
  allTargets: { tld: string; isFree: boolean; providerLabel: string }[];
}

const ASCII_SUFFIX_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+){0,2}$/;

let cachedBrowserCatalog: BrowserSuffixCatalog | null = null;
let browserCatalogFetchedAt = 0;

function parseBrowserPublicSuffixText(text: string): BrowserSuffixCatalog {
  let section: 'icann' | 'private' = 'icann';
  const icannSet = new Set<string>();
  const privateSet = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.includes('===BEGIN ICANN DOMAINS===')) {
      section = 'icann';
      continue;
    }
    if (line.includes('===BEGIN PRIVATE DOMAINS===')) {
      section = 'private';
      continue;
    }
    if (!line || line.startsWith('//') || line.startsWith('!')) continue;

    const rule = line.replace(/^\*\./, '').toLowerCase();
    if (!rule || rule.includes('*') || rule.includes('xn--') || !ASCII_SUFFIX_PATTERN.test(rule)) {
      continue;
    }

    const dotted = `.${rule}`;
    if (section === 'icann') {
      icannSet.add(dotted);
    } else {
      privateSet.add(dotted);
    }
  }

  const freeTargets: { tld: string; isFree: boolean; providerLabel: string }[] = [];
  const seenFree = new Set<string>();

  for (const item of CURATED_FREE_OPEN_DOMAINS) {
    if (!seenFree.has(item.tld)) {
      seenFree.add(item.tld);
      freeTargets.push({ tld: item.tld, isFree: true, providerLabel: item.providerLabel });
    }
  }

  for (const priv of privateSet) {
    if (!seenFree.has(priv)) {
      seenFree.add(priv);
      freeTargets.push({
        tld: priv,
        isFree: true,
        providerLabel: 'Open Public Suffix Registry ($0)',
      });
    }
  }

  const prioritySet = new Set(PRIORITY_GLOBAL_TLDS);
  const icannList = [
    ...PRIORITY_GLOBAL_TLDS.filter((t) => icannSet.has(t)),
    ...Array.from(icannSet).filter((t) => !prioritySet.has(t)),
  ];

  const allTargets: { tld: string; isFree: boolean; providerLabel: string }[] = [...freeTargets];
  for (const tld of icannList) {
    if (!seenFree.has(tld)) {
      allTargets.push({
        tld,
        isFree: false,
        providerLabel: 'IANA / ICANN Official Extension',
      });
    }
  }

  return {
    freeTargets,
    icannTlds: icannList,
    allTargets,
  };
}

async function loadBrowserPublicSuffixCatalog(signal?: AbortSignal): Promise<BrowserSuffixCatalog> {
  const oneDay = 24 * 60 * 60 * 1000;
  if (
    cachedBrowserCatalog &&
    cachedBrowserCatalog.allTargets.length > 500 &&
    Date.now() - browserCatalogFetchedAt < oneDay
  ) {
    return cachedBrowserCatalog;
  }

  const sources = [
    'https://publicsuffix.org/list/public_suffix_list.dat',
    'https://raw.githubusercontent.com/publicsuffix/list/master/public_suffix_list.dat',
  ];

  for (const url of sources) {
    try {
      const resp = await fetch(url, { signal });
      if (resp.ok) {
        const text = await resp.text();
        const catalog = parseBrowserPublicSuffixText(text);
        if (catalog.allTargets.length > 500) {
          cachedBrowserCatalog = catalog;
          browserCatalogFetchedAt = Date.now();
          return catalog;
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
    }
  }

  const fallbackFree = CURATED_FREE_OPEN_DOMAINS.map((f) => ({
    tld: f.tld,
    isFree: true,
    providerLabel: f.providerLabel,
  }));
  const fallbackSet = new Set(fallbackFree.map((f) => f.tld));
  return {
    freeTargets: fallbackFree,
    icannTlds: PRIORITY_GLOBAL_TLDS,
    allTargets: [
      ...fallbackFree,
      ...PRIORITY_GLOBAL_TLDS.filter((t) => !fallbackSet.has(t)).map((t) => ({
        tld: t,
        isFree: false,
        providerLabel: 'IANA / ICANN Official Extension',
      })),
    ],
  };
}

async function checkDomainViaGoogleDoH(
  domain: string,
  tld: string,
  isFree: boolean,
  providerLabel: string,
  signal?: AbortSignal
): Promise<DomainSearchResult> {
  const start = Date.now();
  let available = false;
  let dnsStatus = 'Checking...';
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
          } else if (aData.Status === 0 || aData.Status === 3) {
            available = true;
            dnsStatus = 'Available · Free Domain Ready';
          }
        }
      } else {
        available = false;
        dnsStatus = 'Unavailable';
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    available = false;
    dnsStatus = 'Retry Lookup';
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
    const data = await fetchJson('/api/domains/tlds/stats');
    if (data && typeof data.totalExtensions === 'number' && data.totalExtensions > 0) {
      return data;
    }
  } catch {
    // Fallback to live browser catalog
  }
  const catalog = await loadBrowserPublicSuffixCatalog();
  return {
    freeCount: catalog.freeTargets.length,
    ianaTotalCount: catalog.icannTlds.length,
    totalExtensions: catalog.allTargets.length,
  };
}

export async function searchDomainsRealTime(params: {
  query: string;
  mode: 'free' | 'all';
  page: number;
  cursor?: number;
  limit: number;
  tldFilter?: string;
  signal?: AbortSignal;
}): Promise<{
  query: string;
  mode: 'free' | 'all';
  page: number;
  cursor: number;
  nextCursor: number;
  limit: number;
  totalExtensions: number;
  hasMore: boolean;
  results: DomainSearchResult[];
}> {
  const startCursor = typeof params.cursor === 'number' && params.cursor >= 0 ? params.cursor : 0;
  const qs = new URLSearchParams({
    q: params.query,
    mode: params.mode,
    page: String(params.page),
    cursor: String(startCursor),
    limit: String(params.limit),
  });
  if (params.tldFilter?.trim()) qs.set('tldFilter', params.tldFilter.trim());

  try {
    const data = await fetchJson(`/api/domains/search?${qs.toString()}`, {
      signal: params.signal,
    });
    return {
      ...data,
      cursor: typeof data.cursor === 'number' ? data.cursor : startCursor,
      nextCursor: typeof data.nextCursor === 'number' ? data.nextCursor : startCursor + params.limit,
      results: Array.isArray(data.results) ? data.results.filter((r: DomainSearchResult) => r.available) : [],
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    const cleanName = params.query
      .toLowerCase()
      .trim()
      .replace(/\.[a-z0-9.-]+$/i, '')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-+|-+$/g, '');

    if (cleanName.length < 2) {
      throw new Error('Enter at least 2 alphanumeric characters for your app name.');
    }

    const catalog = await loadBrowserPublicSuffixCatalog(params.signal);
    let targets = params.mode === 'free' ? catalog.freeTargets : catalog.allTargets;

    const filterText = (params.tldFilter || '').toLowerCase().trim();
    if (filterText) {
      targets = targets.filter(
        (t) => t.tld.includes(filterText) || t.providerLabel.toLowerCase().includes(filterText)
      );
    }

    const totalCount = targets.length;
    const availableResults: DomainSearchResult[] = [];
    let idx = Math.min(startCursor, totalCount);
    let scanned = 0;
    const maxScan = 98;

    while (idx < totalCount && availableResults.length < params.limit && scanned < maxScan) {
      const remainingNeeded = params.limit - availableResults.length;
      const batchSize = Math.min(14, remainingNeeded + 4, totalCount - idx, maxScan - scanned);
      if (batchSize <= 0) break;

      const batchTargets = targets.slice(idx, idx + batchSize);
      const batchChecks = await Promise.all(
        batchTargets.map((item) =>
          checkDomainViaGoogleDoH(
            `${cleanName}${item.tld}`,
            item.tld,
            item.isFree,
            item.providerLabel,
            params.signal
          )
        )
      );

      for (let i = 0; i < batchChecks.length; i++) {
        idx += 1;
        scanned += 1;
        if (batchChecks[i].available) {
          availableResults.push(batchChecks[i]);
          if (availableResults.length >= params.limit) {
            break;
          }
        }
      }
    }

    return {
      query: cleanName,
      mode: params.mode,
      page: params.page,
      cursor: startCursor,
      nextCursor: idx,
      limit: params.limit,
      totalExtensions: totalCount,
      hasMore: idx < totalCount,
      results: availableResults,
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

export async function verifyDnsRecordRealTime(payload: {
  domain: string;
  type: 'A' | 'CNAME' | 'TXT' | 'MX';
  host: string;
  value: string;
}): Promise<{
  fqdn: string;
  type: string;
  livePropagated: boolean;
  targetReachable: boolean;
  targetIps: string[];
  liveAnswers: string[];
  checkedAt: string;
}> {
  try {
    return await fetchJson('/api/dns/verify-record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    const cleanDomain = payload.domain.toLowerCase().trim();
    const cleanHost = payload.host.toLowerCase().trim();
    const fqdn =
      cleanHost === '@' || cleanHost === cleanDomain
        ? cleanDomain
        : cleanHost.endsWith(`.${cleanDomain}`)
          ? cleanHost
          : `${cleanHost}.${cleanDomain}`;

    const [fqdnRes, targetRes] = await Promise.all([
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(fqdn)}&type=${encodeURIComponent(payload.type)}`)
        .then((r) => r.json())
        .catch(() => ({ Status: 2, Answer: [] })),
      payload.type === 'CNAME' || payload.type === 'MX'
        ? fetch(`https://dns.google/resolve?name=${encodeURIComponent(payload.value.replace(/\.+$/, ''))}&type=A`)
            .then((r) => r.json())
            .catch(() => ({ Status: 2, Answer: [] }))
        : Promise.resolve(null),
    ]);

    const liveAnswers = (fqdnRes.Answer || []).map((a: any) =>
      String(a.data || '').replace(/^"+|"+$/g, '').replace(/\.$/, '').toLowerCase()
    );
    const normalizedExpected = payload.value.replace(/^"+|"+$/g, '').replace(/\.$/, '').toLowerCase();
    const livePropagated = liveAnswers.some(
      (ans: string) => ans === normalizedExpected || ans.includes(normalizedExpected)
    );
    const targetIps = (targetRes?.Answer || []).map((a: any) => String(a.data));

    return {
      fqdn,
      type: payload.type,
      livePropagated,
      targetReachable:
        payload.type === 'A' || payload.type === 'TXT'
          ? true
          : Boolean(targetRes && targetRes.Status === 0 && targetIps.length > 0),
      targetIps: targetIps.slice(0, 3),
      liveAnswers,
      checkedAt: new Date().toISOString(),
    };
  }
}

