import {
  DnsRecordTypeOption,
  DomainSearchCategory,
  DomainSearchResult,
  LiveDnsLookupResult,
  NameserverVerificationResult,
  SslCheckResult,
  WhoisLookupResult,
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
  { tld: '.dedyn.io', providerLabel: 'deSEC Live Global DNS (Free API)' },
  { tld: '.dynv6.net', providerLabel: 'Dynv6 Live Global DNS (Free · No ID)' },
  { tld: '.v6.rocks', providerLabel: 'Dynv6 Free Live Domain (No ID)' },
  { tld: '.dns.army', providerLabel: 'Dynv6 Free Live Domain (No ID)' },
  { tld: '.dpdns.org', providerLabel: 'DigitalPlat DNS (Free · Cloudflare OK)' },
  { tld: '.us.kg', providerLabel: 'DigitalPlat Free Domain (Cloudflare OK)' },
  { tld: '.qzz.io', providerLabel: 'DigitalPlat Subdomain (Free · Cloudflare OK)' },
  { tld: '.duckdns.org', providerLabel: 'DuckDNS Free Live Subdomain' },
  { tld: '.is-a.dev', providerLabel: 'Open Developer Registry (Free)' },
  { tld: '.js.org', providerLabel: 'JS.org Open Registry (Free)' },
  { tld: '.eu.org', providerLabel: 'EU.org Open Registry (Free)' },
  { tld: '.pages.dev', providerLabel: 'Cloudflare Pages Hosting (Free)' },
  { tld: '.workers.dev', providerLabel: 'Cloudflare Workers (Free)' },
  { tld: '.github.io', providerLabel: 'GitHub Pages Hosting (Free)' },
  { tld: '.netlify.app', providerLabel: 'Netlify Hosting (Free)' },
  { tld: '.vercel.app', providerLabel: 'Vercel Hosting (Free)' },
  { tld: '.onrender.com', providerLabel: 'Render Cloud Hosting (Free)' },
];

export const DESEC_TLDS = ['.dedyn.io'];
export const DYNV6_TLDS = ['.dynv6.net', '.v6.rocks', '.dns.army', '.v6.navy', '.dns.navy'];

export function isDesecDomainClient(domain: string): boolean {
  const clean = domain.toLowerCase().trim();
  return DESEC_TLDS.some((t) => clean.endsWith(t));
}

export function isDynv6DomainClient(domain: string): boolean {
  const clean = domain.toLowerCase().trim();
  return DYNV6_TLDS.some((t) => clean.endsWith(t));
}

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

  const seenAll = new Set<string>();
  const allTargets: { tld: string; isFree: boolean; providerLabel: string }[] = [];

  for (const tld of icannList) {
    if (!seenAll.has(tld)) {
      seenAll.add(tld);
      const freeMatch = CURATED_FREE_OPEN_DOMAINS.find((c) => c.tld === tld);
      allTargets.push({
        tld,
        isFree: Boolean(freeMatch),
        providerLabel: freeMatch ? freeMatch.providerLabel : 'IANA / ICANN Official Extension',
      });
    }
  }

  for (const item of freeTargets) {
    if (!seenAll.has(item.tld)) {
      seenAll.add(item.tld);
      allTargets.push(item);
    }
  }

  return {
    freeTargets,
    icannTlds: icannList,
    allTargets,
  };
}

async function fetchBrowserIanaRootTlds(signal?: AbortSignal): Promise<string[]> {
  try {
    const resp = await fetch('https://data.iana.org/TLD/tlds-alpha-by-domain.txt', { signal });
    if (!resp.ok) return [];
    const text = await resp.text();
    const list: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      const clean = line.trim().toLowerCase();
      if (!clean || clean.startsWith('#') || clean.startsWith('xn--')) continue;
      if (/^[a-z0-9-]+$/.test(clean)) {
        list.push(`.${clean}`);
      }
    }
    return list;
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    return [];
  }
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

  const ianaPromise = fetchBrowserIanaRootTlds(signal);

  for (const url of sources) {
    try {
      const resp = await fetch(url, { signal });
      if (resp.ok) {
        const [text, ianaExtras] = await Promise.all([resp.text(), ianaPromise]);
        const catalog = parseBrowserPublicSuffixText(text);
        if (ianaExtras.length > 0) {
          const icannExisting = new Set(catalog.icannTlds);
          const allExisting = new Set(catalog.allTargets.map((t) => t.tld));
          for (const ext of ianaExtras) {
            if (!icannExisting.has(ext)) {
              icannExisting.add(ext);
              catalog.icannTlds.push(ext);
            }
            if (!allExisting.has(ext)) {
              allExisting.add(ext);
              catalog.allTargets.push({
                tld: ext,
                isFree: false,
                providerLabel: 'IANA / ICANN Official Extension',
              });
            }
          }
        }
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
  const fallbackIcann = PRIORITY_GLOBAL_TLDS.map((t) => ({
    tld: t,
    isFree: false,
    providerLabel: 'IANA / ICANN Official Extension',
  }));
  return {
    freeTargets: fallbackFree,
    icannTlds: PRIORITY_GLOBAL_TLDS,
    allTargets: [
      ...fallbackIcann,
      ...fallbackFree.filter((f) => !PRIORITY_GLOBAL_TLDS.includes(f.tld)),
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

      const isDesec = isDesecDomainClient(domain);
      const isDynv6 = isDynv6DomainClient(domain);

      if (nsData.Status === 3) {
        available = true;
        dnsStatus = isDesec
          ? 'Available · Free Live DNS via deSEC (.dedyn.io)'
          : isDynv6
            ? `Available · Free on Dynv6 (${tld} · No ID)`
            : isFree
              ? 'Available · Free Public Registry'
              : 'Unregistered · External Registrar';
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
            dnsStatus = isDesec
              ? 'Available · Free Live DNS via deSEC (.dedyn.io)'
              : isDynv6
                ? `Available · Free on Dynv6 (${tld} · No ID)`
                : isFree
                  ? 'Available · Free Public Registry'
                  : 'Unregistered · External Registrar';
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
    registrationType:
      isDesecDomainClient(domain) || isDynv6DomainClient(domain)
        ? 'live_api'
        : isFree
          ? 'external_free'
          : 'icann_registrar',
    providerLabel,
    dnsStatus,
    nameservers,
    latencyMs: Date.now() - start,
    lookupSource: 'Google Public DNS (Live)',
  };
}

export async function getDomainCapabilitiesRealTime(): Promise<{
  desecConfigured: boolean;
  dynv6Configured: boolean;
  apiReachable: boolean;
}> {
  try {
    const data = await fetchJson(`/api/domains/capabilities?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    return {
      desecConfigured: Boolean(data?.desecConfigured),
      dynv6Configured: Boolean(data?.dynv6Configured),
      apiReachable: true,
    };
  } catch {
    return { desecConfigured: false, dynv6Configured: false, apiReachable: false };
  }
}

export async function verifyDesecTokenRealTime(desecToken: string): Promise<{
  verified: boolean;
  domainsCount: number;
}> {
  return await fetchJson('/api/domains/verify-desec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ desecToken }),
  });
}

export async function verifyDynv6TokenRealTime(dynv6Token: string): Promise<{
  verified: boolean;
  zonesCount: number;
}> {
  return await fetchJson('/api/domains/verify-dynv6', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dynv6Token }),
  });
}

export async function provisionLiveDomainRealTime(payload: {
  domain: string;
  desecToken?: string;
  dynv6Token?: string;
}): Promise<{
  provisionedLive: boolean;
  provider?: string;
  nameservers?: string[];
  needsApiKey?: string;
  message?: string;
}> {
  return await fetchJson('/api/domains/provision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function syncDesecDnsRecordRealTime(payload: {
  domain: string;
  type: string;
  host: string;
  value: string;
  priority?: number;
  desecToken?: string;
}) {
  return await fetchJson('/api/desec/dns/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteDesecDnsRecordRealTime(payload: {
  domain: string;
  type: string;
  host: string;
  desecToken?: string;
}) {
  return await fetchJson('/api/desec/dns/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function syncDynv6DnsRecordRealTime(payload: {
  domain: string;
  type: string;
  host: string;
  value: string;
  ttl?: number;
  priority?: number;
  dynv6Token?: string;
}) {
  return await fetchJson('/api/dynv6/dns/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteDynv6DnsRecordRealTime(payload: {
  domain: string;
  type: string;
  host: string;
  dynv6Token?: string;
}) {
  return await fetchJson('/api/dynv6/dns/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getTldStatsRealTime(): Promise<{
  freeCount: number;
  ianaTotalCount: number;
  totalExtensions: number;
}> {
  try {
    const data = await fetchJson('/api/domains/tlds/stats', { cache: 'no-store' });
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

const BROWSER_PREFIXES = [
  'get', 'use', 'try', 'my', 'go', 'hey', 'join', 'meet', 'build', 'run',
  'open', 'cloud', 'next', 'pro', 'fast', 'live', 'real', 'true', 'super', 'team',
];

const BROWSER_SUFFIXES = [
  'app', 'hq', 'io', 'dev', 'tech', 'cloud', 'hub', 'lab', 'web', 'pro',
  'ai', 'go', 'live', 'online', 'site', 'zone', 'core', 'base', 'flow', 'sync',
  'link', 'now', 'box', 'bit', 'plus', 'next', 'one', 'x', 'studio', 'works',
  'space', 'world', 'net', 'sys', 'digital', 'stack', 'port', 'api', 'data', 'ops',
];

function buildBrowserEndlessCandidate(
  cleanName: string,
  variationIndex: number,
  targets: { tld: string; isFree: boolean; providerLabel: string }[]
) {
  const pool = targets.slice(0, Math.min(24, targets.length));
  const poolLen = Math.max(1, pool.length);
  const target = pool[variationIndex % poolLen];
  const round = Math.floor(variationIndex / poolLen);
  const singleModCount = BROWSER_PREFIXES.length + BROWSER_SUFFIXES.length;

  let hostLabel = cleanName;
  if (round < BROWSER_PREFIXES.length) {
    hostLabel = `${BROWSER_PREFIXES[round]}${cleanName}`;
  } else if (round < singleModCount) {
    hostLabel = `${cleanName}${BROWSER_SUFFIXES[round - BROWSER_PREFIXES.length]}`;
  } else {
    const comboIdx = round - singleModCount;
    const pIdx = comboIdx % BROWSER_PREFIXES.length;
    const sIdx = Math.floor(comboIdx / BROWSER_PREFIXES.length) % BROWSER_SUFFIXES.length;
    const epoch = Math.floor(comboIdx / (BROWSER_PREFIXES.length * BROWSER_SUFFIXES.length));
    hostLabel =
      epoch === 0
        ? `${BROWSER_PREFIXES[pIdx]}${cleanName}${BROWSER_SUFFIXES[sIdx]}`
        : `${cleanName}-${BROWSER_SUFFIXES[sIdx]}${epoch}`;
  }

  return {
    domain: `${hostLabel.slice(0, 60)}${target.tld}`,
    tld: target.tld,
    isFree: target.isFree,
    providerLabel: target.providerLabel,
  };
}

const TECH_DEV_BROWSER_TLDS = new Set([
  '.io', '.dev', '.app', '.ai', '.tech', '.cloud', '.so', '.is-a.dev', '.js.org',
  '.pages.dev', '.workers.dev', '.github.io', '.vercel.app', '.netlify.app', '.dedyn.io',
]);

export async function searchDomainsRealTime(params: {
  query: string;
  mode: 'free' | 'all';
  domainType?: DomainSearchCategory;
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
  if (params.domainType) qs.set('domainType', params.domainType);
  if (params.tldFilter?.trim()) qs.set('tldFilter', params.tldFilter.trim());

  try {
    const data = await fetchJson(`/api/domains/search?${qs.toString()}`, {
      signal: params.signal,
      cache: 'no-store',
    });
    return {
      ...data,
      cursor: typeof data.cursor === 'number' ? data.cursor : startCursor,
      nextCursor: typeof data.nextCursor === 'number' ? data.nextCursor : startCursor + params.limit,
      results: Array.isArray(data.results) ? data.results.filter((r: DomainSearchResult) => r.available) : [],
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    const rawQuery = params.query.trim().toLowerCase();
    const explicitExtMatch = rawQuery.match(/^([a-z0-9-]+)(\.[a-z0-9.-]+)$/i);
    const cleanName = (explicitExtMatch ? explicitExtMatch[1] : rawQuery)
      .replace(/\.[a-z0-9.-]+$/i, '')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-+|-+$/g, '');
    const explicitExt = explicitExtMatch ? explicitExtMatch[2].toLowerCase() : '';

    if (cleanName.length < 2) {
      throw new Error('Enter at least 2 alphanumeric characters for your app name.');
    }

    const catalog = await loadBrowserPublicSuffixCatalog(params.signal);
    let targets =
      params.domainType === 'instant_live'
        ? catalog.freeTargets.filter((t) => isDesecDomainClient(t.tld) || isDynv6DomainClient(t.tld))
        : params.domainType === 'popular_global'
          ? catalog.allTargets.filter((t) => PRIORITY_GLOBAL_TLDS.includes(t.tld))
          : params.domainType === 'tech_dev'
            ? catalog.allTargets.filter((t) => TECH_DEV_BROWSER_TLDS.has(t.tld))
            : params.domainType === 'all_global'
              ? [...catalog.allTargets]
              : params.domainType === 'all_free'
                ? [...catalog.freeTargets]
                : params.mode === 'free'
                  ? [...catalog.freeTargets]
                  : [...catalog.allTargets];

    if (explicitExt) {
      const existingIdx = targets.findIndex((t) => t.tld === explicitExt);
      if (existingIdx > 0) {
        const [found] = targets.splice(existingIdx, 1);
        targets.unshift(found);
      }
    }

    const filterText = (params.tldFilter || '').toLowerCase().trim();
    if (filterText) {
      targets = targets.filter(
        (t) => t.tld.includes(filterText) || t.providerLabel.toLowerCase().includes(filterText)
      );
    }

    if (targets.length === 0) {
      return {
        query: cleanName,
        mode: params.mode,
        page: params.page,
        cursor: startCursor,
        nextCursor: startCursor,
        limit: params.limit,
        totalExtensions: 0,
        hasMore: false,
        results: [],
      };
    }

    const totalExactCount = targets.length;
    const availableResults: DomainSearchResult[] = [];
    let idx = startCursor;
    let scanned = 0;
    const maxScan = 98;

    while (availableResults.length < params.limit && scanned < maxScan) {
      const remainingNeeded = params.limit - availableResults.length;
      const batchSize = Math.min(14, remainingNeeded + 4, maxScan - scanned);
      if (batchSize <= 0) break;

      const batchCandidates = [];
      for (let k = 0; k < batchSize; k++) {
        const curIdx = idx + k;
        if (curIdx < totalExactCount) {
          const item = targets[curIdx];
          batchCandidates.push({
            domain: `${cleanName}${item.tld}`,
            tld: item.tld,
            isFree: item.isFree,
            providerLabel: item.providerLabel,
          });
        } else {
          batchCandidates.push(buildBrowserEndlessCandidate(cleanName, curIdx - totalExactCount, targets));
        }
      }

      const batchChecks = await Promise.all(
        batchCandidates.map((item) =>
          checkDomainViaGoogleDoH(
            item.domain,
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
      totalExtensions: totalExactCount,
      hasMore: true,
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

export async function getDnsRecordTypesRealTime(): Promise<{
  source: string;
  count: number;
  types: DnsRecordTypeOption[];
}> {
  try {
    const data = await fetchJson('/api/dns/record-types');
    if (data && Array.isArray(data.types) && data.types.length > 0) {
      return data;
    }
  } catch {
    // Fallback list below when offline
  }

  const fallback: DnsRecordTypeOption[] = [
    { type: 'A', code: 1, meaning: 'IPv4 host address', category: 'common' },
    { type: 'AAAA', code: 28, meaning: 'IPv6 host address', category: 'common' },
    { type: 'CNAME', code: 5, meaning: 'Canonical name alias', category: 'common' },
    { type: 'TXT', code: 16, meaning: 'Text & verification strings', category: 'common' },
    { type: 'MX', code: 15, meaning: 'Mail exchange server', category: 'common' },
    { type: 'NS', code: 2, meaning: 'Authoritative name server', category: 'common' },
    { type: 'SRV', code: 33, meaning: 'Service locator record', category: 'common' },
    { type: 'CAA', code: 257, meaning: 'Certification Authority Authorization', category: 'common' },
    { type: 'PTR', code: 12, meaning: 'Domain name pointer', category: 'common' },
    { type: 'HTTPS', code: 65, meaning: 'HTTPS service binding', category: 'common' },
    { type: 'SVCB', code: 64, meaning: 'Service binding parameters', category: 'common' },
    { type: 'SOA', code: 6, meaning: 'Start of zone authority', category: 'common' },
    { type: 'SPF', code: 99, meaning: 'Sender Policy Framework', category: 'common' },
    { type: 'DS', code: 43, meaning: 'Delegation Signer (DNSSEC)', category: 'common' },
    { type: 'DNSKEY', code: 48, meaning: 'DNSSEC public key', category: 'common' },
    { type: 'TLSA', code: 52, meaning: 'DANE TLS certificate association', category: 'common' },
    { type: 'SSHFP', code: 44, meaning: 'SSH public key fingerprint', category: 'common' },
    { type: 'URI', code: 256, meaning: 'Uniform Resource Identifier', category: 'common' },
    { type: 'NAPTR', code: 35, meaning: 'Naming Authority Pointer', category: 'common' },
    { type: 'CERT', code: 37, meaning: 'Certificate record', category: 'common' },
    { type: 'DNAME', code: 39, meaning: 'Delegation name', category: 'common' },
    { type: 'LOC', code: 29, meaning: 'Geographic location', category: 'common' },
    { type: 'OPENPGPKEY', code: 61, meaning: 'OpenPGP public key', category: 'common' },
    { type: 'SMIMEA', code: 53, meaning: 'S/MIME certificate association', category: 'common' },
    { type: 'AFSDB', code: 18, meaning: 'AFS Data Base location', category: 'iana' },
    { type: 'APL', code: 42, meaning: 'Address Prefix List', category: 'iana' },
    { type: 'CDNSKEY', code: 60, meaning: 'Child DNSKEY', category: 'iana' },
    { type: 'CDS', code: 59, meaning: 'Child DS', category: 'iana' },
    { type: 'CSYNC', code: 62, meaning: 'Child-To-Parent Synchronization', category: 'iana' },
    { type: 'DHCID', code: 49, meaning: 'DHCID identifier', category: 'iana' },
    { type: 'EUI48', code: 108, meaning: '48-bit MAC address', category: 'iana' },
    { type: 'EUI64', code: 109, meaning: '64-bit MAC address', category: 'iana' },
    { type: 'HINFO', code: 13, meaning: 'Host information', category: 'iana' },
    { type: 'HIP', code: 55, meaning: 'Host Identity Protocol', category: 'iana' },
    { type: 'IPSECKEY', code: 45, meaning: 'IPsec public key', category: 'iana' },
    { type: 'KX', code: 36, meaning: 'Key Exchanger', category: 'iana' },
    { type: 'NSEC', code: 47, meaning: 'Next Secure record', category: 'iana' },
    { type: 'NSEC3', code: 50, meaning: 'NSEC3 hashed denial of existence', category: 'iana' },
    { type: 'RP', code: 17, meaning: 'Responsible Person', category: 'iana' },
    { type: 'WALLET', code: 262, meaning: 'Blockchain wallet mapping', category: 'iana' },
    { type: 'ZONEMD', code: 63, meaning: 'Message Digest for DNS Zones', category: 'iana' },
  ];
  return {
    source: 'IANA DNS Parameters Registry',
    count: fallback.length,
    types: fallback,
  };
}

export async function verifyDnsRecordRealTime(payload: {
  domain: string;
  type: string;
  host: string;
  value: string;
}): Promise<import('../types').DnsRecordVerificationResult> {
  try {
    return await fetchJson('/api/dns/verify-record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    const cleanDomain = payload.domain.toLowerCase().trim();
    const cleanType = payload.type.toUpperCase().trim();
    const cleanHost = payload.host.toLowerCase().trim();
    const cleanValue = payload.value.trim();
    const fqdn =
      cleanHost === '@' || cleanHost === cleanDomain
        ? cleanDomain
        : cleanHost.endsWith(`.${cleanDomain}`)
          ? cleanHost
          : `${cleanHost}.${cleanDomain}`;

    const isDirectIp = cleanType === 'A' || cleanType === 'AAAA';
    const isHostTarget = ['CNAME', 'MX', 'NS', 'PTR', 'DNAME', 'SRV', 'HTTPS', 'SVCB'].includes(cleanType);
    const targetCandidate = cleanValue
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .replace(/\.+$/, '')
      .trim();

    const [fqdnRes, cfRes, targetRes] = await Promise.all([
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(fqdn)}&type=${encodeURIComponent(cleanType)}`)
        .then((r) => r.json())
        .catch(() => ({ Status: 2, Answer: [] })),
      fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(fqdn)}&type=${encodeURIComponent(cleanType)}`, {
        headers: { accept: 'application/dns-json' },
      })
        .then((r) => r.json())
        .catch(() => ({ Status: 2, Answer: [] })),
      isHostTarget
        ? fetch(`https://dns.google/resolve?name=${encodeURIComponent(targetCandidate)}&type=A`)
            .then((r) => r.json())
            .catch(() => ({ Status: 2, Answer: [] }))
        : Promise.resolve(null),
    ]);

    const liveAnswers: string[] = Array.from(
      new Set(
        [...(fqdnRes.Answer || []), ...(cfRes.Answer || [])]
          .map((a: any) => String(a.data || '').replace(/^"+|"+$/g, '').replace(/\.$/, '').trim())
          .filter(Boolean)
      )
    );

    const normalizedExpected = cleanValue.replace(/^"+|"+$/g, '').replace(/\.$/, '').toLowerCase();
    const livePropagated = liveAnswers.some(
      (ans) => ans.toLowerCase() === normalizedExpected || ans.toLowerCase().includes(normalizedExpected)
    );

    const targetIps: string[] = isDirectIp
      ? [cleanValue]
      : (targetRes?.Answer || []).filter((a: any) => a.type === 1).map((a: any) => String(a.data));

    let rdapNetwork: { name?: string; handle?: string; cidr?: string; org?: string } | null = null;
    let resolvedProvider: string | undefined;
    const primaryIp = targetIps.find((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip));
    if (primaryIp) {
      try {
        const r = await fetch(`https://rdap.arin.net/registry/ip/${encodeURIComponent(primaryIp)}`, {
          headers: { accept: 'application/rdap+json, application/json' },
        });
        if (r.ok) {
          const j = await r.json();
          const fn = j.entities?.[0]?.vcardArray?.[1]?.find?.((v: any) => Array.isArray(v) && v[0] === 'fn')?.[3];
          rdapNetwork = { name: j.name, handle: j.handle, org: fn };
          resolvedProvider = fn || j.name;
        }
      } catch {
        // ignore browser rdap timeout
      }
    }

    return {
      fqdn,
      type: cleanType,
      livePropagated,
      targetReachable: isDirectIp ? Boolean(rdapNetwork || primaryIp) : targetIps.length > 0 || cleanType === 'TXT',
      targetIps: targetIps.slice(0, 4),
      resolvedProvider,
      rdapNetwork,
      liveAnswers,
      resolversChecked: ['Google 8.8.8.8', 'Cloudflare 1.1.1.1', 'ARIN RDAP Registry'],
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function getDomainWhoisRealTime(domain: string): Promise<WhoisLookupResult> {
  try {
    return await fetchJson(`/api/domains/whois?domain=${encodeURIComponent(domain)}`);
  } catch {
    const cleanDomain = domain.toLowerCase().trim();
    const [nsRes, aRes, mxRes, txtRes] = await Promise.all([
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(cleanDomain)}&type=NS`).then((r) => r.json()).catch(() => ({ Answer: [], Status: 2 })),
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(cleanDomain)}&type=A`).then((r) => r.json()).catch(() => ({ Answer: [], Status: 2 })),
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(cleanDomain)}&type=MX`).then((r) => r.json()).catch(() => ({ Answer: [], Status: 2 })),
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(cleanDomain)}&type=TXT`).then((r) => r.json()).catch(() => ({ Answer: [], Status: 2 })),
    ]);
    const nameservers = (nsRes.Answer || []).filter((a: any) => a.type === 2).map((a: any) => String(a.data).replace(/\.$/, '').toLowerCase());
    const aRecords = (aRes.Answer || []).filter((a: any) => a.type === 1).map((a: any) => String(a.data));
    const mxRecords = (mxRes.Answer || []).filter((a: any) => a.type === 15).map((a: any) => String(a.data).replace(/\.$/, ''));
    const txtRecords = (txtRes.Answer || []).filter((a: any) => a.type === 16).map((a: any) => String(a.data).replace(/^"+|"+$/g, ''));
    return {
      domain: cleanDomain,
      registered: nsRes.Status === 0 || aRecords.length > 0,
      status: [],
      nameservers,
      aRecords,
      aaaaRecords: [],
      mxRecords,
      txtRecords,
      rdapSource: 'Google Public DNS',
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function checkDomainSslRealTime(domain: string): Promise<SslCheckResult> {
  return await fetchJson(`/api/domains/ssl-check?domain=${encodeURIComponent(domain)}`);
}


