import express from 'express';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json({ limit: '1mb' }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const DATA_DIR = process.env.VERCEL
  ? '/tmp/openhost-data'
  : path.resolve(process.cwd(), 'data');
const SITES_FILE = path.resolve(DATA_DIR, 'published-sites.json');

interface PublishedSite {
  domain: string;
  title: string;
  htmlContent: string;
  updatedAt: string;
  visits: number;
}

function loadPublishedSites(): Record<string, PublishedSite> {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(SITES_FILE)) {
      return JSON.parse(fs.readFileSync(SITES_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Could not load published sites:', err);
  }
  return {};
}

function savePublishedSites(sites: Record<string, PublishedSite>) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SITES_FILE, JSON.stringify(sites, null, 2), 'utf-8');
  } catch (err) {
    console.error('Could not save published sites:', err);
  }
}

const publishedSites = loadPublishedSites();

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

interface SuffixCatalog {
  freeTargets: { tld: string; isFree: boolean; providerLabel: string }[];
  icannTlds: string[];
  allTargets: { tld: string; isFree: boolean; providerLabel: string }[];
}

const ASCII_SUFFIX_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+){0,2}$/;

let cachedCatalog: SuffixCatalog | null = null;
let catalogFetchedAt = 0;

function parsePublicSuffixText(text: string): SuffixCatalog {
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

async function getLivePublicSuffixCatalog(): Promise<SuffixCatalog> {
  const oneDay = 24 * 60 * 60 * 1000;
  if (cachedCatalog && cachedCatalog.allTargets.length > 500 && Date.now() - catalogFetchedAt < oneDay) {
    return cachedCatalog;
  }

  const sources = [
    'https://publicsuffix.org/list/public_suffix_list.dat',
    'https://raw.githubusercontent.com/publicsuffix/list/master/public_suffix_list.dat',
  ];

  for (const url of sources) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (resp.ok) {
        const text = await resp.text();
        const catalog = parsePublicSuffixText(text);
        if (catalog.allTargets.length > 500) {
          cachedCatalog = catalog;
          catalogFetchedAt = Date.now();
          return catalog;
        }
      }
    } catch (err) {
      console.warn(`Could not fetch public suffix list from ${url}:`, err);
    }
  }

  const fallbackFree = CURATED_FREE_OPEN_DOMAINS.map((f) => ({
    tld: f.tld,
    isFree: true,
    providerLabel: f.providerLabel,
  }));
  const fallbackSet = new Set(fallbackFree.map((f) => f.tld));
  const fallbackAll = [
    ...fallbackFree,
    ...PRIORITY_GLOBAL_TLDS.filter((t) => !fallbackSet.has(t)).map((t) => ({
      tld: t,
      isFree: false,
      providerLabel: 'IANA / ICANN Official Extension',
    })),
  ];

  return {
    freeTargets: fallbackFree,
    icannTlds: PRIORITY_GLOBAL_TLDS,
    allTargets: fallbackAll,
  };
}

async function checkRealDomainAvailability(
  domain: string,
  tld: string,
  isFree: boolean,
  providerLabel: string
) {
  const start = Date.now();
  let available = false;
  let dnsStatus = 'Checking...';
  let nameservers: string[] = [];
  let lookupSource = 'Google Public DNS (Live)';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    const nsRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=NS`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (nsRes.ok) {
      const nsData = (await nsRes.json()) as {
        Status: number;
        Answer?: { type: number; data: string }[];
      };

      if (nsData.Answer && nsData.Answer.length > 0) {
        nameservers = nsData.Answer.filter((a) => a.type === 2).map((a) => a.data.replace(/\.$/, ''));
      }

      if (nsData.Status === 3) {
        available = true;
        dnsStatus = 'Available · Free Domain Ready';
      } else if (nsData.Status === 0) {
        if (nameservers.length > 0) {
          available = false;
          dnsStatus = 'Registered';
        } else {
          const aController = new AbortController();
          const aTimer = setTimeout(() => aController.abort(), 2400);
          const aRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`, {
            signal: aController.signal,
          });
          clearTimeout(aTimer);
          if (aRes.ok) {
            const aData = (await aRes.json()) as { Status: number; Answer?: { data: string }[] };
            if (aData.Answer && aData.Answer.length > 0) {
              available = false;
              dnsStatus = 'Active Site Online';
            } else if (aData.Status === 0 || aData.Status === 3) {
              available = true;
              dnsStatus = 'Available · Free Domain Ready';
            }
          }
        }
      } else {
        available = false;
        dnsStatus = 'Unavailable';
      }
    }
  } catch {
    lookupSource = 'Registry Timeout';
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
    lookupSource,
  };
}

app.get('/api/domains/tlds/stats', async (_req, res) => {
  const catalog = await getLivePublicSuffixCatalog();
  res.json({
    freeCount: catalog.freeTargets.length,
    ianaTotalCount: catalog.icannTlds.length,
    totalExtensions: catalog.allTargets.length,
  });
});

app.get('/api/domains/search', async (req, res) => {
  const rawQuery = (req.query.q as string) || '';
  const cleanName = rawQuery
    .toLowerCase()
    .trim()
    .replace(/\.[a-z0-9.-]+$/i, '')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');

  if (!cleanName || cleanName.length < 2) {
    return res.status(400).json({ error: 'Enter at least 2 alphanumeric characters for your app name.' });
  }

  const mode = (req.query.mode as string) === 'all' ? 'all' : 'free';
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
  const limit = Math.min(30, Math.max(10, parseInt((req.query.limit as string) || '24', 10) || 24));
  const rawCursor = req.query.cursor !== undefined ? parseInt(String(req.query.cursor), 10) : NaN;
  const startCursor = Number.isFinite(rawCursor) && rawCursor >= 0 ? rawCursor : (page - 1) * limit;
  const filterText = ((req.query.tldFilter as string) || '').toLowerCase().trim();

  const catalog = await getLivePublicSuffixCatalog();
  let targets = mode === 'free' ? catalog.freeTargets : catalog.allTargets;

  if (filterText) {
    targets = targets.filter(
      (t) => t.tld.includes(filterText) || t.providerLabel.toLowerCase().includes(filterText)
    );
  }

  const totalCount = targets.length;
  const availableResults: Awaited<ReturnType<typeof checkRealDomainAvailability>>[] = [];
  let idx = Math.min(startCursor, totalCount);
  let scanned = 0;
  const maxScan = 98;

  while (idx < totalCount && availableResults.length < limit && scanned < maxScan) {
    const remainingNeeded = limit - availableResults.length;
    const batchSize = Math.min(14, remainingNeeded + 4, totalCount - idx, maxScan - scanned);
    if (batchSize <= 0) break;

    const batchTargets = targets.slice(idx, idx + batchSize);
    const batchChecks = await Promise.all(
      batchTargets.map((item) =>
        checkRealDomainAvailability(`${cleanName}${item.tld}`, item.tld, item.isFree, item.providerLabel)
      )
    );

    for (let i = 0; i < batchChecks.length; i++) {
      idx += 1;
      scanned += 1;
      if (batchChecks[i].available) {
        availableResults.push(batchChecks[i]);
        if (availableResults.length >= limit) {
          break;
        }
      }
    }
  }

  res.json({
    query: cleanName,
    mode,
    page,
    cursor: startCursor,
    nextCursor: idx,
    limit,
    totalExtensions: totalCount,
    hasMore: idx < totalCount,
    results: availableResults,
  });
});

async function cloudflareFetch(endpoint: string, apiToken: string, options: RequestInit = {}) {
  const resp = await fetch(`https://api.cloudflare.com/client/v4${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken.trim()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = (await resp.json()) as {
    success: boolean;
    errors?: { code: number; message: string }[];
    result?: any;
  };
  if (!resp.ok || !data.success) {
    const msg = data.errors?.[0]?.message || `Cloudflare API error (${resp.status})`;
    throw new Error(msg);
  }
  return data.result;
}

app.post('/api/cloudflare/verify', async (req, res) => {
  const { apiToken } = req.body || {};
  if (!apiToken || typeof apiToken !== 'string' || apiToken.trim().length < 10) {
    return res.status(400).json({ error: 'Please enter a valid Cloudflare API Token.' });
  }

  try {
    const tokenInfo = await cloudflareFetch('/user/tokens/verify', apiToken);
    const [zones, accounts] = await Promise.all([
      cloudflareFetch('/zones?per_page=50', apiToken),
      cloudflareFetch('/accounts?per_page=5', apiToken).catch(() => []),
    ]);
    res.json({
      verified: true,
      tokenStatus: tokenInfo?.status || 'active',
      accountLabel: accounts?.[0]?.name || '',
      zones: (zones || []).map((z: any) => ({
        id: z.id,
        name: z.name,
        status: z.status,
        nameservers: z.name_servers || [],
        planName: z.plan?.name || 'Free',
        accountName: z.account?.name || accounts?.[0]?.name || 'Cloudflare Account',
      })),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Cloudflare token verification failed.' });
  }
});

app.post('/api/cloudflare/connect', async (req, res) => {
  const { domain, apiToken, zoneId, createNewZone } = req.body || {};
  if (!domain || !apiToken) {
    return res.status(400).json({ error: 'Domain and Cloudflare API Token are required.' });
  }

  const cleanDomain = String(domain).toLowerCase().trim();

  try {
    let zone: any;

    if (zoneId) {
      zone = await cloudflareFetch(`/zones/${encodeURIComponent(zoneId)}`, apiToken);
    } else if (createNewZone) {
      const accounts = await cloudflareFetch('/accounts?per_page=5', apiToken);
      const accountId = accounts?.[0]?.id;
      if (!accountId) {
        throw new Error('No Cloudflare Account found for this API token.');
      }
      zone = await cloudflareFetch('/zones', apiToken, {
        method: 'POST',
        body: JSON.stringify({
          name: cleanDomain,
          account: { id: accountId },
          jump_start: true,
          type: 'full',
        }),
      });
    } else {
      const matched = await cloudflareFetch(`/zones?name=${encodeURIComponent(cleanDomain)}`, apiToken);
      if (!matched || matched.length === 0) {
        return res.status(404).json({
          error: `Zone "${cleanDomain}" was not found in your Cloudflare account. Select an existing zone or click "Add Zone to Cloudflare".`,
          canCreateZone: true,
        });
      }
      zone = matched[0];
    }

    const cfRecords = await cloudflareFetch(`/zones/${encodeURIComponent(zone.id)}/dns_records?per_page=100`, apiToken);

    res.json({
      success: true,
      cloudflare: {
        zoneId: zone.id,
        zoneName: zone.name,
        status: zone.status || 'pending',
        nameservers: zone.name_servers || [],
        planName: zone.plan?.name || 'Free Website',
        accountLabel: zone.account?.name || 'Cloudflare Account',
      },
      dnsRecords: (cfRecords || []).map((r: any) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        content: r.content,
        ttl: r.ttl,
        proxied: r.proxied,
      })),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to connect domain to Cloudflare.' });
  }
});

app.post('/api/cloudflare/dns/list', async (req, res) => {
  const { zoneId, apiToken } = req.body || {};
  if (!zoneId || !apiToken) {
    return res.status(400).json({ error: 'Cloudflare Zone ID and API Token are required.' });
  }

  try {
    const cfRecords = await cloudflareFetch(`/zones/${encodeURIComponent(zoneId)}/dns_records?per_page=100`, apiToken);
    res.json({
      records: (cfRecords || []).map((r: any) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        content: r.content,
        ttl: r.ttl,
        proxied: r.proxied,
      })),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to load Cloudflare DNS records.' });
  }
});

app.post('/api/cloudflare/dns/create', async (req, res) => {
  const { zoneId, apiToken, type, name, content, proxied } = req.body || {};
  if (!zoneId || !apiToken || !type || !name || !content) {
    return res.status(400).json({ error: 'Zone ID, API Token, record type, name, and content are required.' });
  }

  try {
    const created = await cloudflareFetch(
      `/zones/${encodeURIComponent(zoneId)}/dns_records`,
      apiToken,
      {
        method: 'POST',
        body: JSON.stringify({
          type,
          name,
          content,
          ttl: 1,
          proxied: Boolean(proxied),
        }),
      }
    );

    res.status(201).json({
      record: {
        id: created.id,
        type: created.type,
        name: created.name,
        content: created.content,
        ttl: created.ttl,
        proxied: created.proxied,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create Cloudflare DNS record.' });
  }
});

app.post('/api/cloudflare/dns/delete', async (req, res) => {
  const { zoneId, apiToken, recordId } = req.body || {};
  if (!zoneId || !apiToken || !recordId) {
    return res.status(400).json({ error: 'Zone ID, API Token, and recordId are required.' });
  }

  try {
    await cloudflareFetch(
      `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
      apiToken,
      { method: 'DELETE' }
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to delete Cloudflare DNS record.' });
  }
});

app.get('/api/dns/live-check', async (req, res) => {
  const domain = ((req.query.domain as string) || '').toLowerCase().trim();
  if (!domain) {
    return res.status(400).json({ error: 'Domain query parameter is required.' });
  }

  try {
    const [aRes, nsRes, txtRes] = await Promise.all([
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`),
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=NS`),
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=TXT`),
    ]);
    const [aData, nsData, txtData] = (await Promise.all([aRes.json(), nsRes.json(), txtRes.json()])) as any[];

    const records = [
      ...(aData.Answer || []),
      ...(nsData.Answer || []),
      ...(txtData.Answer || []),
    ].map((ans: any) => ({
      type: ans.type === 1 ? 'A' : ans.type === 2 ? 'NS' : ans.type === 16 ? 'TXT' : String(ans.type),
      name: ans.name,
      data: ans.data,
      TTL: ans.TTL,
    }));

    const nameservers = (nsData.Answer || [])
      .filter((a: any) => a.type === 2)
      .map((a: any) => a.data.replace(/\.$/, ''));

    res.json({
      domain,
      records,
      nameservers,
      status: aData.Status ?? nsData.Status ?? 0,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Live DNS check failed.' });
  }
});

function detectDnsProvider(ns: string): string {
  const host = ns.toLowerCase();
  if (host.endsWith('.ns.cloudflare.com') || host.includes('cloudflare')) return 'Cloudflare DNS';
  if (host.includes('vercel-dns.com')) return 'Vercel DNS';
  if (host.includes('nsone.net') || host.includes('netlify.com')) return 'Netlify / NS1 DNS';
  if (host.includes('digitalocean.com')) return 'DigitalOcean DNS';
  if (host.includes('awsdns-')) return 'Amazon Route 53';
  if (host.includes('googledomains.com') || host.includes('.ns.google.') || host.includes('google.com')) return 'Google Cloud DNS';
  if (host.includes('registrar-servers.com') || host.includes('namecheap')) return 'Namecheap DNS';
  if (host.includes('domaincontrol.com') || host.includes('godaddy')) return 'GoDaddy DNS';
  if (host.includes('dns-parking.com') || host.includes('hostinger')) return 'Hostinger DNS';
  if (host.includes('hetzner.')) return 'Hetzner DNS';
  if (host.includes('linode.com') || host.includes('akam.net')) return 'Akamai / Linode DNS';
  if (host.includes('bunny.net')) return 'Bunny DNS';
  if (host.includes('desec.')) return 'deSEC DNS';
  if (host.includes('afraid.org')) return 'FreeDNS';
  if (host.includes('duckdns.org')) return 'DuckDNS';
  if (host.includes('openhost.world')) return 'OpenHost Managed DNS';
  const parts = host.split('.');
  if (parts.length >= 2) {
    return `Custom DNS (${parts.slice(-2).join('.')})`;
  }
  return 'Custom DNS Provider';
}

app.post('/api/dns/verify-nameservers', async (req, res) => {
  const { domain, nameservers, mode, apiToken, providerName } = req.body || {};
  const cleanDomain = String(domain || '').toLowerCase().trim();
  if (!cleanDomain) {
    return res.status(400).json({ error: 'Domain name is required.' });
  }

  const cleanedNs: string[] = Array.isArray(nameservers)
    ? nameservers
        .map((ns: unknown) => String(ns || '').trim().toLowerCase().replace(/\.+$/, ''))
        .filter((ns: string) => ns.length > 0)
        .slice(0, 5)
    : [];

  if (mode === 'custom' && cleanedNs.length < 1) {
    return res.status(400).json({ error: 'Enter at least one valid nameserver hostname (e.g. ns1.vercel-dns.com or courtney.ns.cloudflare.com).' });
  }

  const hostPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
  for (const ns of cleanedNs) {
    if (!hostPattern.test(ns) || ns.length > 253) {
      return res.status(400).json({ error: `Invalid nameserver hostname: "${ns}"` });
    }
  }

  try {
    const nsChecks = await Promise.all(
      cleanedNs.map(async (ns) => {
        const provider = detectDnsProvider(ns);
        try {
          const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(ns)}&type=A`);
          const data = (await r.json()) as { Status: number; Answer?: { data: string }[] };
          const ips = (data.Answer || []).map((a) => a.data).filter(Boolean);
          return {
            nameserver: ns,
            reachable: data.Status === 0 && ips.length > 0,
            ips: ips.slice(0, 2),
            isCloudflare: ns.endsWith('.ns.cloudflare.com'),
            provider,
          };
        } catch {
          return {
            nameserver: ns,
            reachable: false,
            ips: [],
            isCloudflare: ns.endsWith('.ns.cloudflare.com'),
            provider,
          };
        }
      })
    );

    const unreachable = nsChecks.find((c) => !c.reachable);
    if (unreachable && mode === 'custom') {
      return res.status(400).json({
        error: `Nameserver "${unreachable.nameserver}" did not resolve on global DNS. Check the spelling and try again.`,
        nsChecks,
      });
    }

    const detectedProvider =
      (typeof providerName === 'string' && providerName.trim()) ||
      nsChecks[0]?.provider ||
      'OpenHost Managed DNS';

    let liveDomainNs: string[] = [];
    try {
      const domRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(cleanDomain)}&type=NS`);
      const domData = (await domRes.json()) as { Answer?: { type: number; data: string }[] };
      liveDomainNs = (domData.Answer || [])
        .filter((a) => a.type === 2)
        .map((a) => a.data.replace(/\.$/, '').toLowerCase());
    } catch {
      // keep empty
    }

    let cloudflareZone: any = null;
    if (apiToken && typeof apiToken === 'string' && apiToken.trim().length >= 10) {
      try {
        const matched = await cloudflareFetch(`/zones?name=${encodeURIComponent(cleanDomain)}`, apiToken);
        if (matched && matched.length > 0) {
          const z = matched[0];
          cloudflareZone = {
            zoneId: z.id,
            zoneName: z.name,
            status: z.status,
            nameservers: z.name_servers || [],
            accountLabel: z.account?.name || detectedProvider,
          };
        }
      } catch {
        // Token optional
      }
    }

    const usesCloudflareNs = nsChecks.some((c) => c.isCloudflare);
    const liveMatched = cleanedNs.length > 0 && cleanedNs.some((ns) => liveDomainNs.includes(ns));

    res.json({
      verified: true,
      domain: cleanDomain,
      mode: mode === 'default' ? 'default' : 'custom',
      nameservers: cleanedNs,
      nsChecks,
      detectedProvider,
      liveDomainNs,
      liveMatched,
      usesCloudflareNs,
      cloudflareZone,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Nameserver verification failed.' });
  }
});

app.post('/api/sites/build', async (req, res) => {
  const { domain, businessName, description, ownerName } = req.body || {};
  if (!domain || typeof domain !== 'string') {
    return res.status(400).json({ error: 'Domain name is required to build a website.' });
  }

  const cleanDomain = domain.toLowerCase().trim();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cleanDomain)) {
    return res.status(400).json({ error: 'Invalid domain format.' });
  }

  let htmlContent = '';
  if (process.env.GEMINI_API_KEY) {
    try {
      const aiRes = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Create a clean, modern, mobile-ready, SEO-optimised single-file HTML5 website using Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>) for the free domain "${cleanDomain}".
Business / App Name: ${businessName || cleanDomain}
Owner: ${ownerName || 'Creator'}
Description: ${description || 'Modern web application and digital presence'}
Return ONLY valid raw HTML starting with <!DOCTYPE html> and ending with </html>.`,
      });
      const generated = (aiRes.text || '')
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      if (generated.startsWith('<!DOCTYPE html') || generated.startsWith('<html')) {
        htmlContent = generated;
      }
    } catch (err) {
      console.warn('Gemini site generation fallback:', err);
    }
  }

  if (!htmlContent) {
    const escHtml = (val: string) =>
      val
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const safeTitle = escHtml(String(businessName || cleanDomain));
    const safeDomain = escHtml(cleanDomain);
    const safeDesc = escHtml(
      String(description || 'Live open-world website hosted free with SSL and global edge readiness.')
    );
    htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-6 font-sans">
  <div class="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-8">
    <p class="text-xs font-mono text-emerald-400 mb-2">${safeDomain}</p>
    <h1 class="text-3xl font-bold mb-3">${safeTitle}</h1>
    <p class="text-slate-300 text-sm mb-6 leading-relaxed">${safeDesc}</p>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 text-xs">
      <div class="p-4 bg-slate-950 rounded-xl border border-slate-800"><strong class="block text-white mb-1">Mobile-ready</strong>Responsive layout</div>
      <div class="p-4 bg-slate-950 rounded-xl border border-slate-800"><strong class="block text-white mb-1">SEO-optimised</strong>Clean semantic HTML</div>
      <div class="p-4 bg-slate-950 rounded-xl border border-slate-800"><strong class="block text-white mb-1">Free SSL</strong>Global edge ready</div>
    </div>
    <a href="/" class="inline-block px-5 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg">Manage in Client Area</a>
  </div>
</body>
</html>`;
  }

  publishedSites[cleanDomain] = {
    domain: cleanDomain,
    title: businessName || cleanDomain,
    htmlContent,
    updatedAt: new Date().toISOString(),
    visits: publishedSites[cleanDomain]?.visits || 0,
  };
  savePublishedSites(publishedSites);

  res.json({
    success: true,
    siteUrl: `/site/${cleanDomain}`,
    domain: cleanDomain,
  });
});

app.get('/api/public-config', (_req, res) => {
  const rawUrl = (
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  )
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
  let supabaseUrl = '';
  if (rawUrl) {
    const withProto = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : rawUrl.includes('.')
        ? `https://${rawUrl}`
        : `https://${rawUrl}.supabase.co`;
    try {
      supabaseUrl = new URL(withProto).origin;
    } catch {
      supabaseUrl = withProto.replace(/\/+$/, '');
    }
  }
  const supabaseAnonKey = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    ''
  )
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
  res.json({ supabaseUrl, supabaseAnonKey });
});

const handleServeSite = (req: express.Request, res: express.Response) => {
  const domainName = (req.params.domain || '').toLowerCase().trim();
  const site = publishedSites[domainName];
  if (!site) {
    return res
      .status(404)
      .send(
        `<!DOCTYPE html><html><body style="background:#0f172a;color:#f8fafc;font-family:sans-serif;text-align:center;padding:60px;"><h1>Site Not Built Yet</h1><p>Click "Build my website — it's free" or "Site" in your Client Area for ${domainName}.</p><a href="/" style="color:#3b82f6;">Back to Client Area</a></body></html>`
      );
  }
  site.visits += 1;
  savePublishedSites(publishedSites);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(site.htmlContent);
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/site/:domain', handleServeSite);
app.get('/api/site/:domain', handleServeSite);

export default app;
