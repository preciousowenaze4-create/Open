// server/app.ts
import express from "express";
import path from "path";
import fs from "fs";
import tls from "tls";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
if (!process.env.VERCEL) {
  dotenv.config({ quiet: true });
}
var app = express();
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});
app.use((req, _res, next) => {
  if (req.body !== void 0 && typeof req.body === "object" && !req._body) {
    req._body = true;
  }
  next();
});
app.use(express.json({ limit: "1mb" }));
function getGeminiClient() {
  const apiKey = readEnvSecret("GEMINI_API_KEY", "GOOGLE_GENAI_API_KEY");
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
var DATA_DIR = process.env.VERCEL ? "/tmp/openhost-data" : path.resolve(process.cwd(), "data");
var SITES_FILE = path.resolve(DATA_DIR, "published-sites.json");
function loadPublishedSites() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(SITES_FILE)) {
      return JSON.parse(fs.readFileSync(SITES_FILE, "utf-8"));
    }
  } catch (err) {
    console.error("Could not load published sites:", err);
  }
  return {};
}
function savePublishedSites(sites) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SITES_FILE, JSON.stringify(sites, null, 2), "utf-8");
  } catch (err) {
    console.error("Could not save published sites:", err);
  }
}
var publishedSites = loadPublishedSites();
var CURATED_FREE_OPEN_DOMAINS = [
  { tld: ".dedyn.io", providerLabel: "deSEC Live Global DNS (Free API)" },
  { tld: ".dynv6.net", providerLabel: "Dynv6 Live Global DNS (Free \xB7 No ID)" },
  { tld: ".v6.rocks", providerLabel: "Dynv6 Free Live Domain (No ID)" },
  { tld: ".dns.army", providerLabel: "Dynv6 Free Live Domain (No ID)" },
  { tld: ".dpdns.org", providerLabel: "DigitalPlat DNS (Free \xB7 Cloudflare OK)" },
  { tld: ".us.kg", providerLabel: "DigitalPlat Free Domain (Cloudflare OK)" },
  { tld: ".qzz.io", providerLabel: "DigitalPlat Subdomain (Free \xB7 Cloudflare OK)" },
  { tld: ".duckdns.org", providerLabel: "DuckDNS Free Live Subdomain" },
  { tld: ".is-a.dev", providerLabel: "Open Developer Registry (Free)" },
  { tld: ".js.org", providerLabel: "JS.org Open Registry (Free)" },
  { tld: ".eu.org", providerLabel: "EU.org Open Registry (Free)" },
  { tld: ".pages.dev", providerLabel: "Cloudflare Pages Hosting (Free)" },
  { tld: ".workers.dev", providerLabel: "Cloudflare Workers (Free)" },
  { tld: ".github.io", providerLabel: "GitHub Pages Hosting (Free)" },
  { tld: ".netlify.app", providerLabel: "Netlify Hosting (Free)" },
  { tld: ".vercel.app", providerLabel: "Vercel Hosting (Free)" },
  { tld: ".onrender.com", providerLabel: "Render Cloud Hosting (Free)" }
];
var DESEC_TLDS = /* @__PURE__ */ new Set([".dedyn.io"]);
var DYNV6_TLDS = /* @__PURE__ */ new Set([".dynv6.net", ".v6.rocks", ".dns.army", ".v6.navy", ".dns.navy"]);
var PRIORITY_GLOBAL_TLDS = [
  ".com",
  ".net",
  ".org",
  ".io",
  ".dev",
  ".app",
  ".ai",
  ".co",
  ".xyz",
  ".tech",
  ".site",
  ".online",
  ".store",
  ".cloud",
  ".me",
  ".info",
  ".biz",
  ".live",
  ".pro",
  ".studio",
  ".design",
  ".agency",
  ".digital",
  ".network",
  ".link",
  ".blog",
  ".shop",
  ".world",
  ".space",
  ".so"
];
var ASCII_SUFFIX_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+){0,2}$/;
var cachedCatalog = null;
var catalogFetchedAt = 0;
function parsePublicSuffixText(text) {
  let section = "icann";
  const icannSet = /* @__PURE__ */ new Set();
  const privateSet = /* @__PURE__ */ new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.includes("===BEGIN ICANN DOMAINS===")) {
      section = "icann";
      continue;
    }
    if (line.includes("===BEGIN PRIVATE DOMAINS===")) {
      section = "private";
      continue;
    }
    if (!line || line.startsWith("//") || line.startsWith("!")) continue;
    const rule = line.replace(/^\*\./, "").toLowerCase();
    if (!rule || rule.includes("*") || rule.includes("xn--") || !ASCII_SUFFIX_PATTERN.test(rule)) {
      continue;
    }
    const dotted = `.${rule}`;
    if (section === "icann") {
      icannSet.add(dotted);
    } else {
      privateSet.add(dotted);
    }
  }
  const freeTargets = [];
  const seenFree = /* @__PURE__ */ new Set();
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
        providerLabel: "Open Public Suffix Registry ($0)"
      });
    }
  }
  const prioritySet = new Set(PRIORITY_GLOBAL_TLDS);
  const icannList = [
    ...PRIORITY_GLOBAL_TLDS.filter((t) => icannSet.has(t)),
    ...Array.from(icannSet).filter((t) => !prioritySet.has(t))
  ];
  const seenAll = /* @__PURE__ */ new Set();
  const allTargets = [];
  for (const tld of icannList) {
    if (!seenAll.has(tld)) {
      seenAll.add(tld);
      const freeMatch = CURATED_FREE_OPEN_DOMAINS.find((c) => c.tld === tld);
      allTargets.push({
        tld,
        isFree: Boolean(freeMatch),
        providerLabel: freeMatch ? freeMatch.providerLabel : "IANA / ICANN Official Extension"
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
    allTargets
  };
}
async function fetchIanaRootTlds() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5e3);
    const resp = await fetch("https://data.iana.org/TLD/tlds-alpha-by-domain.txt", {
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) return [];
    const text = await resp.text();
    const list = [];
    for (const line of text.split(/\r?\n/)) {
      const clean = line.trim().toLowerCase();
      if (!clean || clean.startsWith("#") || clean.startsWith("xn--")) continue;
      if (/^[a-z0-9-]+$/.test(clean)) {
        list.push(`.${clean}`);
      }
    }
    return list;
  } catch {
    return [];
  }
}
async function getLivePublicSuffixCatalog() {
  const oneDay = 24 * 60 * 60 * 1e3;
  if (cachedCatalog && cachedCatalog.allTargets.length > 500 && Date.now() - catalogFetchedAt < oneDay) {
    return cachedCatalog;
  }
  const sources = [
    "https://publicsuffix.org/list/public_suffix_list.dat",
    "https://raw.githubusercontent.com/publicsuffix/list/master/public_suffix_list.dat"
  ];
  const ianaPromise = fetchIanaRootTlds();
  for (const url of sources) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7e3);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (resp.ok) {
        const [text, ianaExtras] = await Promise.all([resp.text(), ianaPromise]);
        const catalog = parsePublicSuffixText(text);
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
                providerLabel: "IANA / ICANN Official Extension"
              });
            }
          }
        }
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
    providerLabel: f.providerLabel
  }));
  const fallbackSet = new Set(fallbackFree.map((f) => f.tld));
  const fallbackIcann = PRIORITY_GLOBAL_TLDS.map((t) => ({
    tld: t,
    isFree: false,
    providerLabel: "IANA / ICANN Official Extension"
  }));
  const fallbackAll = [
    ...fallbackIcann,
    ...fallbackFree.filter((f) => !PRIORITY_GLOBAL_TLDS.includes(f.tld))
  ];
  void fallbackSet;
  return {
    freeTargets: fallbackFree,
    icannTlds: PRIORITY_GLOBAL_TLDS,
    allTargets: fallbackAll
  };
}
if (!process.env.VERCEL) {
  void getLivePublicSuffixCatalog().catch(() => {
  });
}
function readEnvSecret(...keys) {
  for (const key of keys) {
    const raw = process.env[key];
    if (typeof raw === "string") {
      const cleaned = raw.trim().replace(/^["']+|["']+$/g, "").trim();
      if (cleaned) return cleaned;
    }
  }
  return "";
}
function getDesecEnvToken() {
  return readEnvSecret(
    "DESEC_API_TOKEN",
    "DESEC_TOKEN",
    "DESEC_API_KEY",
    "DESEC_KEY",
    "VITE_DESEC_API_TOKEN",
    "NEXT_PUBLIC_DESEC_API_TOKEN"
  );
}
function getDynv6EnvToken() {
  return readEnvSecret(
    "DYNV6_API_TOKEN",
    "DYNV6_TOKEN",
    "DYNV6_HTTP_TOKEN",
    "DYNV6_API_KEY",
    "DYNV6_KEY",
    "VITE_DYNV6_API_TOKEN",
    "NEXT_PUBLIC_DYNV6_API_TOKEN"
  );
}
function getDomainCapabilities() {
  return {
    desecConfigured: Boolean(getDesecEnvToken()),
    dynv6Configured: Boolean(getDynv6EnvToken())
  };
}
function isDesecDomain(domainOrTld) {
  const low = domainOrTld.toLowerCase().trim();
  for (const t of DESEC_TLDS) {
    if (low === t || low.endsWith(t)) return true;
  }
  return false;
}
function isDynv6Domain(domainOrTld) {
  const low = domainOrTld.toLowerCase().trim();
  for (const t of DYNV6_TLDS) {
    if (low === t || low.endsWith(t)) return true;
  }
  return false;
}
async function checkRealDomainAvailability(domain, tld, isFree, providerLabel) {
  const start = Date.now();
  let available = false;
  let dnsStatus = "Checking...";
  let nameservers = [];
  let lookupSource = "Google Public DNS (Live)";
  const caps = getDomainCapabilities();
  const isDesec = isDesecDomain(tld);
  const isDynv6 = isDynv6Domain(tld);
  const registrationType = isDesec || isDynv6 ? "live_api" : isFree ? "external_free" : "icann_registrar";
  try {
    if (tld === ".com" || tld === ".net") {
      const rdapEndpoint = tld === ".com" ? `https://rdap.verisign.com/com/v1/domain/${encodeURIComponent(domain)}` : `https://rdap.verisign.com/net/v1/domain/${encodeURIComponent(domain)}`;
      const rCtl = new AbortController();
      const rTimer = setTimeout(() => rCtl.abort(), 2200);
      const rRes = await fetch(rdapEndpoint, { signal: rCtl.signal }).catch(() => null);
      clearTimeout(rTimer);
      if (rRes) {
        lookupSource = "Verisign RDAP Registry (Live)";
        if (rRes.status === 200) {
          available = false;
          dnsStatus = "Registered";
          return {
            domain,
            name: domain.slice(0, domain.length - tld.length),
            tld,
            available,
            isFree,
            registrationType,
            providerLabel,
            dnsStatus,
            nameservers,
            latencyMs: Date.now() - start,
            lookupSource
          };
        }
        if (rRes.status === 404) {
          available = true;
          dnsStatus = "Available \xB7 External Registrar";
          return {
            domain,
            name: domain.slice(0, domain.length - tld.length),
            tld,
            available,
            isFree,
            registrationType,
            providerLabel,
            dnsStatus,
            nameservers,
            latencyMs: Date.now() - start,
            lookupSource
          };
        }
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2200);
    const nsRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=NS`, {
      signal: controller.signal
    });
    clearTimeout(timer);
    if (nsRes.ok) {
      const nsData = await nsRes.json();
      if (nsData.Answer && nsData.Answer.length > 0) {
        nameservers = nsData.Answer.filter((a) => a.type === 2).map((a) => a.data.replace(/\.$/, ""));
      }
      if (nsData.Status === 3) {
        available = true;
        dnsStatus = isDesec ? caps.desecConfigured ? "Available \xB7 1-Click Live DNS Ready (deSEC)" : "Available \xB7 Free Live DNS via deSEC (.dedyn.io)" : isDynv6 ? caps.dynv6Configured ? "Available \xB7 1-Click Live DNS Ready (No ID)" : "Available \xB7 Free Live DNS via Dynv6 (No ID)" : isFree ? "Available \xB7 Free Public Registry" : "Unregistered \xB7 External Registrar";
      } else if (nsData.Status === 0) {
        if (nameservers.length > 0) {
          available = false;
          dnsStatus = "Registered";
        } else {
          const aController = new AbortController();
          const aTimer = setTimeout(() => aController.abort(), 1800);
          const aRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`, {
            signal: aController.signal
          });
          clearTimeout(aTimer);
          if (aRes.ok) {
            const aData = await aRes.json();
            if (aData.Answer && aData.Answer.length > 0) {
              available = false;
              dnsStatus = "Active Site Online";
            } else if (aData.Status === 0 || aData.Status === 3) {
              available = true;
              dnsStatus = isDesec ? caps.desecConfigured ? "Available \xB7 1-Click Live DNS Ready (deSEC)" : "Available \xB7 Free Live DNS via deSEC (.dedyn.io)" : isDynv6 ? caps.dynv6Configured ? "Available \xB7 1-Click Live DNS Ready (No ID)" : "Available \xB7 Free Live DNS via Dynv6 (No ID)" : isFree ? "Available \xB7 Free Public Registry" : "Unregistered \xB7 External Registrar";
            }
          }
        }
      } else {
        available = false;
        dnsStatus = "Unavailable";
      }
    }
  } catch {
    lookupSource = "Registry Timeout";
    available = false;
    dnsStatus = "Retry Lookup";
  }
  return {
    domain,
    name: domain.slice(0, domain.length - tld.length),
    tld,
    available,
    isFree,
    registrationType,
    providerLabel,
    dnsStatus,
    nameservers,
    latencyMs: Date.now() - start,
    lookupSource
  };
}
var BRAND_PREFIXES = [
  "get",
  "use",
  "try",
  "my",
  "go",
  "hey",
  "join",
  "meet",
  "build",
  "run",
  "open",
  "cloud",
  "next",
  "pro",
  "fast",
  "live",
  "real",
  "true",
  "super",
  "team"
];
var BRAND_SUFFIXES = [
  "app",
  "hq",
  "io",
  "dev",
  "tech",
  "cloud",
  "hub",
  "lab",
  "web",
  "pro",
  "ai",
  "go",
  "live",
  "online",
  "site",
  "zone",
  "core",
  "base",
  "flow",
  "sync",
  "link",
  "now",
  "box",
  "bit",
  "plus",
  "next",
  "one",
  "x",
  "studio",
  "works",
  "space",
  "world",
  "net",
  "sys",
  "digital",
  "stack",
  "port",
  "api",
  "data",
  "ops"
];
function buildEndlessCandidate(cleanName, variationIndex, targets) {
  const pool = targets.slice(0, Math.min(24, targets.length));
  const poolLen = Math.max(1, pool.length);
  const target = pool[variationIndex % poolLen];
  const round = Math.floor(variationIndex / poolLen);
  let hostLabel = cleanName;
  const singleModCount = BRAND_PREFIXES.length + BRAND_SUFFIXES.length;
  if (round < BRAND_PREFIXES.length) {
    hostLabel = `${BRAND_PREFIXES[round]}${cleanName}`;
  } else if (round < singleModCount) {
    hostLabel = `${cleanName}${BRAND_SUFFIXES[round - BRAND_PREFIXES.length]}`;
  } else {
    const comboIdx = round - singleModCount;
    const pIdx = comboIdx % BRAND_PREFIXES.length;
    const sIdx = Math.floor(comboIdx / BRAND_PREFIXES.length) % BRAND_SUFFIXES.length;
    const epoch = Math.floor(comboIdx / (BRAND_PREFIXES.length * BRAND_SUFFIXES.length));
    hostLabel = epoch === 0 ? `${BRAND_PREFIXES[pIdx]}${cleanName}${BRAND_SUFFIXES[sIdx]}` : `${cleanName}-${BRAND_SUFFIXES[sIdx]}${epoch}`;
  }
  return {
    domain: `${hostLabel.slice(0, 60)}${target.tld}`,
    tld: target.tld,
    isFree: target.isFree,
    providerLabel: target.providerLabel
  };
}
app.get("/api/domains/tlds/stats", async (_req, res) => {
  const catalog = await getLivePublicSuffixCatalog();
  res.json({
    freeCount: catalog.freeTargets.length,
    ianaTotalCount: catalog.icannTlds.length,
    totalExtensions: catalog.allTargets.length
  });
});
var TECH_DEV_TLDS = /* @__PURE__ */ new Set([
  ".io",
  ".dev",
  ".app",
  ".ai",
  ".tech",
  ".cloud",
  ".so",
  ".is-a.dev",
  ".js.org",
  ".pages.dev",
  ".workers.dev",
  ".github.io",
  ".vercel.app",
  ".netlify.app",
  ".dedyn.io"
]);
app.get("/api/domains/search", async (req, res) => {
  const rawQuery = (req.query.q || "").trim().toLowerCase();
  const explicitExtMatch = rawQuery.match(/^([a-z0-9-]+)(\.[a-z0-9.-]+)$/i);
  const cleanName = (explicitExtMatch ? explicitExtMatch[1] : rawQuery).replace(/\.[a-z0-9.-]+$/i, "").replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
  const explicitExt = explicitExtMatch ? explicitExtMatch[2].toLowerCase() : "";
  if (!cleanName || cleanName.length < 2) {
    return res.status(400).json({ error: "Enter at least 2 alphanumeric characters for your app name." });
  }
  const mode = req.query.mode === "all" ? "all" : "free";
  const domainType = (req.query.domainType || "").trim();
  const page = Math.max(1, parseInt(req.query.page || "1", 10) || 1);
  const limit = Math.min(30, Math.max(10, parseInt(req.query.limit || "24", 10) || 24));
  const rawCursor = req.query.cursor !== void 0 ? parseInt(String(req.query.cursor), 10) : NaN;
  const startCursor = Number.isFinite(rawCursor) && rawCursor >= 0 ? rawCursor : (page - 1) * limit;
  const filterText = (req.query.tldFilter || "").toLowerCase().trim();
  const catalog = await getLivePublicSuffixCatalog();
  let targets;
  if (domainType === "instant_live") {
    targets = catalog.freeTargets.filter((t) => isDesecDomain(t.tld) || isDynv6Domain(t.tld));
  } else if (domainType === "popular_global") {
    const prioritySet = new Set(PRIORITY_GLOBAL_TLDS);
    targets = catalog.allTargets.filter((t) => prioritySet.has(t.tld));
  } else if (domainType === "tech_dev") {
    targets = catalog.allTargets.filter((t) => TECH_DEV_TLDS.has(t.tld));
  } else if (domainType === "all_global") {
    targets = [...catalog.allTargets];
  } else if (domainType === "all_free") {
    targets = [...catalog.freeTargets];
  } else {
    targets = mode === "free" ? [...catalog.freeTargets] : [...catalog.allTargets];
  }
  if (explicitExt) {
    const existingIdx = targets.findIndex((t) => t.tld === explicitExt);
    if (existingIdx > 0) {
      const [found] = targets.splice(existingIdx, 1);
      targets.unshift(found);
    } else if (existingIdx === -1 && /^\.[a-z0-9-]+(\.[a-z0-9-]+){0,2}$/.test(explicitExt)) {
      const isKnownIana = catalog.icannTlds.includes(explicitExt);
      targets.unshift({
        tld: explicitExt,
        isFree: !isKnownIana,
        providerLabel: isKnownIana ? "IANA / ICANN Official Extension" : "Live Custom Extension"
      });
    }
  }
  if (filterText) {
    targets = targets.filter(
      (t) => t.tld.includes(filterText) || t.providerLabel.toLowerCase().includes(filterText)
    );
  }
  if (targets.length === 0) {
    return res.json({
      query: cleanName,
      mode,
      page,
      cursor: startCursor,
      nextCursor: startCursor,
      limit,
      totalExtensions: 0,
      hasMore: false,
      results: []
    });
  }
  const totalExactCount = targets.length;
  const availableResults = [];
  let idx = startCursor;
  let scanned = 0;
  const maxScan = 90;
  const searchDeadline = Date.now() + 3800;
  while (availableResults.length < limit && scanned < maxScan && Date.now() < searchDeadline) {
    const remainingNeeded = limit - availableResults.length;
    const batchSize = Math.min(20, remainingNeeded + 6, maxScan - scanned);
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
          providerLabel: item.providerLabel
        });
      } else {
        batchCandidates.push(buildEndlessCandidate(cleanName, curIdx - totalExactCount, targets));
      }
    }
    const batchChecks = await Promise.all(
      batchCandidates.map(
        (item) => checkRealDomainAvailability(item.domain, item.tld, item.isFree, item.providerLabel)
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
    totalExtensions: totalExactCount,
    hasMore: true,
    results: availableResults
  });
});
app.get("/api/domains/whois", async (req, res) => {
  const rawDomain = String(req.query.domain || "").toLowerCase().trim();
  const cleanDomain = rawDomain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!cleanDomain || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cleanDomain)) {
    return res.status(400).json({ error: "Valid domain parameter is required." });
  }
  try {
    const parts = cleanDomain.split(".");
    const rdapCandidate = parts.length > 2 && (cleanDomain.endsWith(".dedyn.io") || cleanDomain.endsWith(".dynv6.net") || cleanDomain.endsWith(".v6.rocks") || cleanDomain.endsWith(".dns.army") || cleanDomain.endsWith(".us.kg") || cleanDomain.endsWith(".dpdns.org") || cleanDomain.endsWith(".qzz.io")) ? parts.slice(-2).join(".") : cleanDomain;
    const rdapUrl = cleanDomain.endsWith(".com") ? `https://rdap.verisign.com/com/v1/domain/${encodeURIComponent(cleanDomain)}` : cleanDomain.endsWith(".net") ? `https://rdap.verisign.com/net/v1/domain/${encodeURIComponent(cleanDomain)}` : `https://rdap.org/domain/${encodeURIComponent(rdapCandidate)}`;
    const doh = async (qType) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 3e3);
      const r = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(cleanDomain)}&type=${qType}`,
        { signal: ctl.signal }
      );
      clearTimeout(t);
      return await r.json();
    };
    const rdapFetch = async () => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 3800);
        const r = await fetch(rdapUrl, {
          headers: { Accept: "application/rdap+json, application/json" },
          signal: ctl.signal
        });
        clearTimeout(t);
        if (!r.ok) return { status: r.status, data: null };
        return { status: r.status, data: await r.json() };
      } catch {
        return { status: 0, data: null };
      }
    };
    const [rdapRes, nsRes, aRes, aaaaRes, mxRes, txtRes, soaRes] = await Promise.all([
      rdapFetch(),
      doh("NS").catch(() => ({ Status: 2, Answer: [] })),
      doh("A").catch(() => ({ Status: 2, Answer: [] })),
      doh("AAAA").catch(() => ({ Status: 2, Answer: [] })),
      doh("MX").catch(() => ({ Status: 2, Answer: [] })),
      doh("TXT").catch(() => ({ Status: 2, Answer: [] })),
      doh("SOA").catch(() => ({ Status: 2, Answer: [] }))
    ]);
    const rdap = rdapRes.data;
    let registrar;
    if (rdap && Array.isArray(rdap.entities)) {
      const regEnt = rdap.entities.find((e) => Array.isArray(e.roles) && e.roles.includes("registrar")) || rdap.entities[0];
      const fn = regEnt?.vcardArray?.[1]?.find?.((v) => Array.isArray(v) && v[0] === "fn")?.[3];
      if (typeof fn === "string" && fn.trim()) registrar = fn.trim();
    }
    const events = Array.isArray(rdap?.events) ? rdap.events : [];
    const createdDate = events.find((e) => e.eventAction === "registration")?.eventDate;
    const expiryDate = events.find((e) => e.eventAction === "expiration")?.eventDate;
    const updatedDate = events.find((e) => e.eventAction === "last changed")?.eventDate;
    const rdapNs = Array.isArray(rdap?.nameservers) ? rdap.nameservers.map((n) => String(n.ldhName || "").toLowerCase()).filter(Boolean) : [];
    const liveNs = (nsRes.Answer || []).filter((a) => a.type === 2).map((a) => String(a.data).replace(/\.$/, "").toLowerCase());
    const nameservers = Array.from(/* @__PURE__ */ new Set([...liveNs, ...rdapCandidate === cleanDomain ? rdapNs : []]));
    const aRecords = (aRes.Answer || []).filter((a) => a.type === 1).map((a) => String(a.data));
    const aaaaRecords = (aaaaRes.Answer || []).filter((a) => a.type === 28).map((a) => String(a.data));
    const mxRecords = (mxRes.Answer || []).filter((a) => a.type === 15).map((a) => String(a.data).replace(/\.$/, ""));
    const txtRecords = (txtRes.Answer || []).filter((a) => a.type === 16).map((a) => String(a.data).replace(/^"+|"+$/g, ""));
    const soaRecord = (soaRes.Answer || []).find((a) => a.type === 6)?.data;
    const registered = nsRes.Status === 0 || aRecords.length > 0 || aaaaRecords.length > 0 || Boolean(soaRecord) || rdapCandidate === cleanDomain && rdapRes.status === 200;
    res.json({
      domain: cleanDomain,
      registered,
      registrar: registrar || (cleanDomain.endsWith(".dedyn.io") ? "deSEC e.V. (Subdomain Registry)" : isDynv6Domain(cleanDomain) ? "Dynv6 (Subdomain Registry)" : void 0),
      status: Array.isArray(rdap?.status) ? rdap.status : [],
      createdDate,
      expiryDate,
      updatedDate,
      nameservers,
      aRecords,
      aaaaRecords,
      mxRecords,
      txtRecords,
      soaRecord,
      rdapSource: rdap ? cleanDomain.endsWith(".com") || cleanDomain.endsWith(".net") ? "Verisign RDAP" : "RDAP.org" : "Google Public DNS",
      checkedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    res.status(502).json({ error: err?.message || "WHOIS / RDAP lookup failed." });
  }
});
app.get("/api/domains/ssl-check", async (req, res) => {
  const rawDomain = String(req.query.domain || "").toLowerCase().trim();
  const cleanDomain = rawDomain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  if (!cleanDomain || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cleanDomain)) {
    return res.status(400).json({ error: "Valid domain parameter is required." });
  }
  const result = await new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };
    const socket = tls.connect(
      {
        host: cleanDomain,
        port: 443,
        servername: cleanDomain,
        rejectUnauthorized: false
      },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          const protocol = socket.getProtocol() || void 0;
          const authorized = socket.authorized;
          const authorizationError = socket.authorizationError ? String(socket.authorizationError) : void 0;
          const validFrom = cert?.valid_from;
          const validTo = cert?.valid_to;
          const daysRemaining = validTo ? Math.floor((new Date(validTo).getTime() - Date.now()) / (1e3 * 60 * 60 * 24)) : void 0;
          const issuer = cert?.issuer?.O || cert?.issuer?.CN || void 0;
          const subject = cert?.subject?.CN || void 0;
          const altnames = typeof cert?.subjectaltname === "string" ? cert.subjectaltname.split(",").map((s) => s.trim().replace(/^DNS:/, "")).filter(Boolean).slice(0, 8) : [];
          socket.end();
          finish({
            domain: cleanDomain,
            tlsConnected: Boolean(cert && Object.keys(cert).length > 0),
            authorized,
            authorizationError,
            issuer,
            subject,
            validFrom,
            validTo,
            daysRemaining,
            protocol,
            altnames,
            checkedAt: (/* @__PURE__ */ new Date()).toISOString()
          });
        } catch (e) {
          socket.destroy();
          finish({
            domain: cleanDomain,
            tlsConnected: false,
            authorized: false,
            error: e?.message || "Certificate inspection failed.",
            checkedAt: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      }
    );
    socket.setTimeout(3500, () => {
      socket.destroy();
      finish({
        domain: cleanDomain,
        tlsConnected: false,
        authorized: false,
        error: "TLS port 443 timed out \u2014 point A/CNAME DNS records to your host first.",
        checkedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    });
    socket.on("error", (err) => {
      finish({
        domain: cleanDomain,
        tlsConnected: false,
        authorized: false,
        error: err?.code === "ENOTFOUND" ? "Domain does not resolve on public DNS yet." : err?.message || "Could not reach port 443.",
        checkedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    });
  });
  res.json(result);
});
app.get("/api/domains/capabilities", (_req, res) => {
  res.json(getDomainCapabilities());
});
async function dynv6Fetch(endpoint, token, options = {}) {
  const resp = await fetch(`https://dynv6.com/api/v2${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers || {}
    }
  });
  const text = await resp.text();
  let data = null;
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!resp.ok) {
    const msg = data?.message || data?.error || (Array.isArray(data?.errors) ? data.errors.map((e) => e.message || e).join(", ") : "") || `Dynv6 API error (${resp.status})`;
    throw new Error(String(msg));
  }
  return data;
}
async function desecFetch(endpoint, token, options = {}) {
  const resp = await fetch(`https://desec.io/api/v1${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Token ${token.trim()}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers || {}
    }
  });
  const text = await resp.text();
  let data = null;
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }
  if (!resp.ok) {
    const msg = data?.detail || data?.name?.[0] || data?.records?.[0] || data?.message || `deSEC API error (${resp.status})`;
    throw new Error(String(msg));
  }
  return data;
}
function formatDesecRecordValue(type, value, priority) {
  const cleanType = type.toUpperCase().trim();
  const raw = value.trim();
  if (cleanType === "TXT") {
    return raw.startsWith('"') && raw.endsWith('"') ? raw : JSON.stringify(raw);
  }
  if (cleanType === "CNAME" || cleanType === "NS" || cleanType === "PTR" || cleanType === "DNAME") {
    const hostOnly = raw.replace(/\.+$/, "");
    return `${hostOnly}.`;
  }
  if (cleanType === "MX") {
    const parts = raw.split(/\s+/);
    if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
      const target2 = parts[1].replace(/\.+$/, "");
      return `${parts[0]} ${target2}.`;
    }
    const prio = typeof priority === "number" && Number.isFinite(priority) ? priority : 10;
    const target = raw.replace(/\.+$/, "");
    return `${prio} ${target}.`;
  }
  return raw;
}
app.post("/api/domains/verify-desec", async (req, res) => {
  const token = String(req.body?.desecToken || getDesecEnvToken()).trim();
  if (!token || token.length < 6) {
    return res.status(400).json({ error: "Configure DESEC_API_TOKEN in Vercel Environment Variables." });
  }
  try {
    const domains = await desecFetch("/domains/", token);
    res.json({
      verified: true,
      domainsCount: Array.isArray(domains) ? domains.length : 0
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Could not verify deSEC API token." });
  }
});
app.post("/api/desec/dns/upsert", async (req, res) => {
  const { domain, type, host, value, priority, desecToken } = req.body || {};
  const cleanDomain = String(domain || "").toLowerCase().trim();
  const token = String(desecToken || getDesecEnvToken()).trim();
  if (!isDesecDomain(cleanDomain)) {
    return res.status(400).json({ error: "Live deSEC sync applies to .dedyn.io zones." });
  }
  if (!token) {
    return res.status(400).json({ error: "DESEC_API_TOKEN is missing in server environment variables." });
  }
  const cleanType = String(type || "A").toUpperCase().trim();
  const cleanHost = String(host || "@").toLowerCase().trim();
  const isApex = cleanHost === "@" || cleanHost === cleanDomain;
  const subname = isApex ? "" : cleanHost.replace(new RegExp(`\\.${cleanDomain.replace(/\./g, "\\.")}$`), "");
  const formattedRecord = formatDesecRecordValue(cleanType, String(value || ""), priority);
  try {
    const existingDomain = await desecFetch(`/domains/${encodeURIComponent(cleanDomain)}/`, token).catch(
      () => null
    );
    if (!existingDomain) {
      await desecFetch("/domains/", token, {
        method: "POST",
        body: JSON.stringify({ name: cleanDomain })
      });
    }
    const rrset = await desecFetch(`/domains/${encodeURIComponent(cleanDomain)}/rrsets/`, token, {
      method: "PUT",
      body: JSON.stringify([
        {
          subname,
          type: cleanType,
          ttl: 3600,
          records: [formattedRecord]
        }
      ])
    });
    res.json({ success: true, domain: cleanDomain, rrset });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to publish DNS record to deSEC." });
  }
});
app.post("/api/desec/dns/delete", async (req, res) => {
  const { domain, type, host, desecToken } = req.body || {};
  const cleanDomain = String(domain || "").toLowerCase().trim();
  const token = String(desecToken || getDesecEnvToken()).trim();
  if (!cleanDomain || !token || !type) {
    return res.status(400).json({ error: "Domain, type, and deSEC token are required." });
  }
  const cleanType = String(type).toUpperCase().trim();
  const cleanHost = String(host || "@").toLowerCase().trim();
  const isApex = cleanHost === "@" || cleanHost === cleanDomain;
  const subname = isApex ? "" : cleanHost.replace(new RegExp(`\\.${cleanDomain.replace(/\./g, "\\.")}$`), "");
  try {
    await desecFetch(`/domains/${encodeURIComponent(cleanDomain)}/rrsets/`, token, {
      method: "PUT",
      body: JSON.stringify([
        {
          subname,
          type: cleanType,
          ttl: 3600,
          records: []
        }
      ])
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to delete deSEC DNS record." });
  }
});
app.post("/api/domains/verify-dynv6", async (req, res) => {
  const token = String(req.body?.dynv6Token || getDynv6EnvToken()).trim();
  if (!token || token.length < 6) {
    return res.status(400).json({ error: "Configure DYNV6_API_TOKEN in Vercel Environment Variables." });
  }
  try {
    const zones = await dynv6Fetch("/zones", token);
    res.json({
      verified: true,
      zonesCount: Array.isArray(zones) ? zones.length : 0
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Could not verify Dynv6 HTTP Token." });
  }
});
app.post("/api/domains/provision", async (req, res) => {
  const { domain, desecToken, dynv6Token } = req.body || {};
  const cleanDomain = String(domain || "").toLowerCase().trim();
  if (!cleanDomain || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cleanDomain)) {
    return res.status(400).json({ error: "Valid domain name is required." });
  }
  if (isDesecDomain(cleanDomain)) {
    const token = String(desecToken || getDesecEnvToken()).trim();
    if (!token) {
      return res.json({
        provisionedLive: false,
        needsApiKey: "DESEC_API_TOKEN",
        provider: "deSEC Live Global DNS",
        message: "DESEC_API_TOKEN is not active on this server yet. Add it in Vercel Environment Variables and redeploy."
      });
    }
    try {
      const existing = await desecFetch(`/domains/${encodeURIComponent(cleanDomain)}/`, token).catch(
        () => null
      );
      const created = existing || await desecFetch("/domains/", token, {
        method: "POST",
        body: JSON.stringify({ name: cleanDomain })
      });
      return res.status(201).json({
        provisionedLive: true,
        domain: created?.name || cleanDomain,
        provider: "deSEC Live Global DNS",
        nameservers: ["ns1.desec.io", "ns2.desec.org"],
        message: `${cleanDomain} is now LIVE on global DNS (ns1.desec.io, ns2.desec.org)!`
      });
    } catch (err) {
      return res.status(400).json({
        provisionedLive: false,
        error: err.message || "Could not provision domain on deSEC."
      });
    }
  }
  if (isDynv6Domain(cleanDomain)) {
    const token = String(dynv6Token || getDynv6EnvToken()).trim();
    if (!token) {
      return res.json({
        provisionedLive: false,
        needsApiKey: "DYNV6_API_TOKEN",
        provider: "Dynv6 Free Global DNS (No ID)",
        message: "DYNV6_API_TOKEN is not active on this server yet. Add it in Vercel Environment Variables and redeploy."
      });
    }
    try {
      const existingZones = await dynv6Fetch("/zones", token).catch(() => []);
      const existingMatch = Array.isArray(existingZones) ? existingZones.find((z) => String(z.name || "").toLowerCase() === cleanDomain) : null;
      const created = existingMatch || await dynv6Fetch("/zones", token, {
        method: "POST",
        body: JSON.stringify({ name: cleanDomain })
      });
      return res.status(201).json({
        provisionedLive: true,
        zoneId: created?.id,
        domain: created?.name || cleanDomain,
        provider: "Dynv6 Live Global DNS",
        nameservers: ["ns1.dynv6.com", "ns2.dynv6.com"],
        message: `${cleanDomain} is now LIVE on global DNS (ns1.dynv6.com, ns2.dynv6.com)!`
      });
    } catch (err) {
      return res.status(400).json({
        provisionedLive: false,
        error: err.message || "Could not provision domain on Dynv6."
      });
    }
  }
  return res.json({
    provisionedLive: false,
    provider: "External Registry Domain",
    message: "Pick a .dedyn.io domain (with DESEC_API_TOKEN) or a .dynv6.net / .v6.rocks / .dns.army domain (with DYNV6_API_TOKEN) for automatic 1-click live global registration."
  });
});
app.post("/api/dynv6/dns/upsert", async (req, res) => {
  const { domain, type, host, value, dynv6Token } = req.body || {};
  const cleanDomain = String(domain || "").toLowerCase().trim();
  const token = String(dynv6Token || getDynv6EnvToken()).trim();
  if (!isDynv6Domain(cleanDomain)) {
    return res.status(400).json({ error: "Live Dynv6 sync applies to .dynv6.net, .v6.rocks, and .dns.army zones." });
  }
  if (!token) {
    return res.status(400).json({ error: "DYNV6_API_TOKEN is missing in server environment variables." });
  }
  const cleanType = String(type || "A").toUpperCase().trim();
  const cleanHost = String(host || "@").toLowerCase().trim();
  const isApex = cleanHost === "@" || cleanHost === cleanDomain;
  const subname = isApex ? cleanDomain : cleanHost.replace(new RegExp(`\\.${cleanDomain.replace(/\./g, "\\.")}$`), "");
  const cleanVal = String(value || "").trim();
  try {
    const zones = await dynv6Fetch("/zones", token);
    let zone = Array.isArray(zones) ? zones.find((z) => String(z.name || "").toLowerCase() === cleanDomain) : null;
    if (!zone) {
      zone = await dynv6Fetch("/zones", token, {
        method: "POST",
        body: JSON.stringify({ name: cleanDomain })
      });
    }
    const zoneId = zone.id;
    if (isApex && cleanType === "A") {
      await dynv6Fetch(`/zones/${zoneId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ ipv4address: cleanVal })
      });
    } else if (isApex && cleanType === "AAAA") {
      await dynv6Fetch(`/zones/${zoneId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ ipv6prefix: cleanVal })
      });
    }
    const existingRecords = await dynv6Fetch(`/zones/${zoneId}/records`, token).catch(() => []);
    const targetRecName = isApex ? cleanDomain : subname;
    const match = Array.isArray(existingRecords) ? existingRecords.find(
      (r) => String(r.type || "").toUpperCase() === cleanType && (String(r.name || "").toLowerCase() === targetRecName || isApex && (r.name === "" || r.name === "@"))
    ) : null;
    let resultRecord = null;
    if (!(isApex && (cleanType === "A" || cleanType === "AAAA"))) {
      if (match) {
        resultRecord = await dynv6Fetch(`/zones/${zoneId}/records/${match.id}`, token, {
          method: "PATCH",
          body: JSON.stringify({
            name: targetRecName,
            type: cleanType,
            data: cleanVal
          })
        });
      } else {
        resultRecord = await dynv6Fetch(`/zones/${zoneId}/records`, token, {
          method: "POST",
          body: JSON.stringify({
            name: targetRecName,
            type: cleanType,
            data: cleanVal
          })
        });
      }
    }
    res.json({ success: true, zoneId, record: resultRecord });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to publish DNS record to Dynv6." });
  }
});
app.post("/api/dynv6/dns/delete", async (req, res) => {
  const { domain, type, host, dynv6Token } = req.body || {};
  const cleanDomain = String(domain || "").toLowerCase().trim();
  const token = String(dynv6Token || getDynv6EnvToken()).trim();
  if (!cleanDomain || !token || !type) {
    return res.status(400).json({ error: "Domain, type, and Dynv6 token are required." });
  }
  try {
    const zones = await dynv6Fetch("/zones", token);
    const zone = Array.isArray(zones) ? zones.find((z) => String(z.name || "").toLowerCase() === cleanDomain) : null;
    if (!zone) return res.json({ success: true });
    const cleanTypeUpper = String(type).toUpperCase().trim();
    const cleanHost = String(host || "@").toLowerCase().trim();
    const isApex = cleanHost === "@" || cleanHost === cleanDomain;
    if (isApex && cleanTypeUpper === "A") {
      await dynv6Fetch(`/zones/${zone.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ ipv4address: "" })
      });
    } else if (isApex && cleanTypeUpper === "AAAA") {
      await dynv6Fetch(`/zones/${zone.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ ipv6prefix: "" })
      });
    }
    const subname = isApex ? cleanDomain : cleanHost.replace(new RegExp(`\\.${cleanDomain.replace(/\./g, "\\.")}$`), "");
    const existingRecords = await dynv6Fetch(`/zones/${zone.id}/records`, token).catch(() => []);
    const match = Array.isArray(existingRecords) ? existingRecords.find(
      (r) => String(r.type || "").toUpperCase() === cleanTypeUpper && (String(r.name || "").toLowerCase() === subname || isApex && (r.name === "" || r.name === "@"))
    ) : null;
    if (match) {
      await dynv6Fetch(`/zones/${zone.id}/records/${match.id}`, token, { method: "DELETE" });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to delete Dynv6 DNS record." });
  }
});
async function cloudflareFetch(endpoint, apiToken, options = {}) {
  const resp = await fetch(`https://api.cloudflare.com/client/v4${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken.trim()}`,
      "Content-Type": "application/json",
      ...options.headers || {}
    }
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) {
    const msg = data.errors?.[0]?.message || `Cloudflare API error (${resp.status})`;
    throw new Error(msg);
  }
  return data.result;
}
app.post("/api/cloudflare/verify", async (req, res) => {
  const { apiToken } = req.body || {};
  if (!apiToken || typeof apiToken !== "string" || apiToken.trim().length < 10) {
    return res.status(400).json({ error: "Please enter a valid Cloudflare API Token." });
  }
  try {
    const tokenInfo = await cloudflareFetch("/user/tokens/verify", apiToken);
    const [zones, accounts] = await Promise.all([
      cloudflareFetch("/zones?per_page=50", apiToken),
      cloudflareFetch("/accounts?per_page=5", apiToken).catch(() => [])
    ]);
    res.json({
      verified: true,
      tokenStatus: tokenInfo?.status || "active",
      accountLabel: accounts?.[0]?.name || "",
      zones: (zones || []).map((z) => ({
        id: z.id,
        name: z.name,
        status: z.status,
        nameservers: z.name_servers || [],
        planName: z.plan?.name || "Free",
        accountName: z.account?.name || accounts?.[0]?.name || "Cloudflare Account"
      }))
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Cloudflare token verification failed." });
  }
});
app.post("/api/cloudflare/connect", async (req, res) => {
  const { domain, apiToken, zoneId, createNewZone } = req.body || {};
  if (!domain || !apiToken) {
    return res.status(400).json({ error: "Domain and Cloudflare API Token are required." });
  }
  const cleanDomain = String(domain).toLowerCase().trim();
  try {
    let zone;
    if (zoneId) {
      zone = await cloudflareFetch(`/zones/${encodeURIComponent(zoneId)}`, apiToken);
    } else if (createNewZone) {
      const accounts = await cloudflareFetch("/accounts?per_page=5", apiToken);
      const accountId = accounts?.[0]?.id;
      if (!accountId) {
        throw new Error("No Cloudflare Account found for this API token.");
      }
      zone = await cloudflareFetch("/zones", apiToken, {
        method: "POST",
        body: JSON.stringify({
          name: cleanDomain,
          account: { id: accountId },
          jump_start: true,
          type: "full"
        })
      });
    } else {
      const matched = await cloudflareFetch(`/zones?name=${encodeURIComponent(cleanDomain)}`, apiToken);
      if (!matched || matched.length === 0) {
        return res.status(404).json({
          error: `Zone "${cleanDomain}" was not found in your Cloudflare account. Select an existing zone or click "Add Zone to Cloudflare".`,
          canCreateZone: true
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
        status: zone.status || "pending",
        nameservers: zone.name_servers || [],
        planName: zone.plan?.name || "Free Website",
        accountLabel: zone.account?.name || "Cloudflare Account"
      },
      dnsRecords: (cfRecords || []).map((r) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        content: r.content,
        ttl: r.ttl,
        proxied: r.proxied
      }))
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to connect domain to Cloudflare." });
  }
});
app.post("/api/cloudflare/dns/list", async (req, res) => {
  const { zoneId, apiToken } = req.body || {};
  if (!zoneId || !apiToken) {
    return res.status(400).json({ error: "Cloudflare Zone ID and API Token are required." });
  }
  try {
    const cfRecords = await cloudflareFetch(`/zones/${encodeURIComponent(zoneId)}/dns_records?per_page=100`, apiToken);
    res.json({
      records: (cfRecords || []).map((r) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        content: r.content,
        ttl: r.ttl,
        proxied: r.proxied
      }))
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to load Cloudflare DNS records." });
  }
});
app.post("/api/cloudflare/dns/create", async (req, res) => {
  const { zoneId, apiToken, type, name, content, proxied, priority, ttl } = req.body || {};
  if (!zoneId || !apiToken || !type || !name || !content) {
    return res.status(400).json({ error: "Zone ID, API Token, record type, name, and content are required." });
  }
  try {
    const payload = {
      type,
      name,
      content,
      ttl: typeof ttl === "number" && ttl >= 1 ? ttl : 1,
      proxied: type === "A" || type === "CNAME" ? Boolean(proxied) : false
    };
    if (type === "MX") {
      payload.priority = typeof priority === "number" ? priority : 10;
    }
    const created = await cloudflareFetch(
      `/zones/${encodeURIComponent(zoneId)}/dns_records`,
      apiToken,
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    );
    res.status(201).json({
      record: {
        id: created.id,
        type: created.type,
        name: created.name,
        content: created.content,
        ttl: created.ttl,
        priority: created.priority,
        proxied: created.proxied
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to create Cloudflare DNS record." });
  }
});
app.post("/api/cloudflare/dns/update", async (req, res) => {
  const { zoneId, apiToken, recordId, type, name, content, proxied, priority, ttl } = req.body || {};
  if (!zoneId || !apiToken || !recordId || !type || !name || !content) {
    return res.status(400).json({ error: "Zone ID, API Token, recordId, type, name, and content are required." });
  }
  try {
    const payload = {
      type,
      name,
      content,
      ttl: typeof ttl === "number" && ttl >= 1 ? ttl : 1,
      proxied: type === "A" || type === "CNAME" || type === "AAAA" ? Boolean(proxied) : false
    };
    if (type === "MX" || type === "SRV" || type === "URI") {
      payload.priority = typeof priority === "number" ? priority : 10;
    }
    const updated = await cloudflareFetch(
      `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
      apiToken,
      {
        method: "PATCH",
        body: JSON.stringify(payload)
      }
    );
    res.json({
      record: {
        id: updated.id,
        type: updated.type,
        name: updated.name,
        content: updated.content,
        ttl: updated.ttl,
        priority: updated.priority,
        proxied: updated.proxied
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to update Cloudflare DNS record." });
  }
});
app.post("/api/cloudflare/dns/delete", async (req, res) => {
  const { zoneId, apiToken, recordId } = req.body || {};
  if (!zoneId || !apiToken || !recordId) {
    return res.status(400).json({ error: "Zone ID, API Token, and recordId are required." });
  }
  try {
    await cloudflareFetch(
      `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
      apiToken,
      { method: "DELETE" }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to delete Cloudflare DNS record." });
  }
});
var PRIORITY_COMMON_RRTYPES = [
  "A",
  "AAAA",
  "CNAME",
  "TXT",
  "MX",
  "NS",
  "SRV",
  "CAA",
  "PTR",
  "HTTPS",
  "SVCB",
  "SOA",
  "SPF",
  "DS",
  "DNSKEY",
  "TLSA",
  "SSHFP",
  "URI",
  "NAPTR",
  "CERT",
  "DNAME",
  "LOC",
  "OPENPGPKEY",
  "SMIMEA"
];
var BUILTIN_FALLBACK_RRTYPES = [
  { type: "A", code: 1, meaning: "IPv4 host address", category: "common" },
  { type: "AAAA", code: 28, meaning: "IPv6 host address", category: "common" },
  { type: "CNAME", code: 5, meaning: "Canonical name alias", category: "common" },
  { type: "TXT", code: 16, meaning: "Text & verification strings", category: "common" },
  { type: "MX", code: 15, meaning: "Mail exchange server", category: "common" },
  { type: "NS", code: 2, meaning: "Authoritative name server", category: "common" },
  { type: "SRV", code: 33, meaning: "Service locator record", category: "common" },
  { type: "CAA", code: 257, meaning: "Certification Authority Authorization", category: "common" },
  { type: "PTR", code: 12, meaning: "Domain name pointer (Reverse DNS)", category: "common" },
  { type: "HTTPS", code: 65, meaning: "HTTPS service binding", category: "common" },
  { type: "SVCB", code: 64, meaning: "Service binding parameters", category: "common" },
  { type: "SOA", code: 6, meaning: "Start of zone authority", category: "common" },
  { type: "SPF", code: 99, meaning: "Sender Policy Framework", category: "common" },
  { type: "DS", code: 43, meaning: "Delegation Signer (DNSSEC)", category: "common" },
  { type: "DNSKEY", code: 48, meaning: "DNSSEC public key", category: "common" },
  { type: "TLSA", code: 52, meaning: "DANE TLS certificate association", category: "common" },
  { type: "SSHFP", code: 44, meaning: "SSH public key fingerprint", category: "common" },
  { type: "URI", code: 256, meaning: "Uniform Resource Identifier", category: "common" },
  { type: "NAPTR", code: 35, meaning: "Naming Authority Pointer", category: "common" },
  { type: "CERT", code: 37, meaning: "Certificate record", category: "common" },
  { type: "DNAME", code: 39, meaning: "Delegation name", category: "common" },
  { type: "LOC", code: 29, meaning: "Geographic location", category: "common" },
  { type: "OPENPGPKEY", code: 61, meaning: "OpenPGP public key", category: "common" },
  { type: "SMIMEA", code: 53, meaning: "S/MIME certificate association", category: "common" }
];
var cachedRrTypes = [];
var rrTypesFetchedAt = 0;
async function getOfficialIanaRrTypes() {
  const oneDay = 24 * 60 * 60 * 1e3;
  if (cachedRrTypes.length > 30 && Date.now() - rrTypesFetchedAt < oneDay) {
    return cachedRrTypes;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5e3);
    const resp = await fetch("https://www.iana.org/assignments/dns-parameters/dns-parameters-4.csv", {
      signal: controller.signal
    });
    clearTimeout(timer);
    if (resp.ok) {
      const text = await resp.text();
      const byType = /* @__PURE__ */ new Map();
      const commonSet = new Set(PRIORITY_COMMON_RRTYPES);
      for (const line of text.split(/\r\n|\n|\r/)) {
        const m = line.match(/^([A-Z0-9-]+),(\d+),("[^"]*"|[^,]*),/);
        if (!m) continue;
        const type = m[1].trim();
        const code = Number(m[2]);
        const meaning = m[3].replace(/^"|"$/g, "").trim() || type;
        if (!type || type === "Reserved" || type === "Unassigned") continue;
        if (/OBSOLETE|DEPRECATED/i.test(meaning)) continue;
        if (!byType.has(type)) {
          byType.set(type, {
            type,
            code,
            meaning,
            category: commonSet.has(type) ? "common" : "iana"
          });
        }
      }
      if (byType.size > 30) {
        const ordered = [];
        for (const p of PRIORITY_COMMON_RRTYPES) {
          const item = byType.get(p);
          if (item) {
            ordered.push(item);
            byType.delete(p);
          }
        }
        const rest = Array.from(byType.values()).sort((a, b) => a.type.localeCompare(b.type));
        cachedRrTypes = [...ordered, ...rest];
        rrTypesFetchedAt = Date.now();
        return cachedRrTypes;
      }
    }
  } catch (err) {
    console.warn("Could not fetch live IANA RRTYPE CSV:", err);
  }
  return BUILTIN_FALLBACK_RRTYPES;
}
app.get("/api/dns/record-types", async (_req, res) => {
  const types = await getOfficialIanaRrTypes();
  res.json({
    source: "IANA Official DNS Parameters Registry",
    count: types.length,
    types
  });
});
var PUBLIC_IPV4_CHECK = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
function isPublicRoutableIpv4(ip) {
  if (!PUBLIC_IPV4_CHECK.test(ip)) return false;
  const [a, b] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224) return false;
  return true;
}
function isPublicRoutableIp(ip) {
  if (ip.includes(":")) {
    const low = ip.toLowerCase();
    if (low === "::1" || low === "::" || low.startsWith("fe80:") || low.startsWith("fc") || low.startsWith("fd")) {
      return false;
    }
    return /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i.test(low);
  }
  return isPublicRoutableIpv4(ip);
}
function detectPlatformFromText(text) {
  const low = text.toLowerCase();
  if (low.includes("vercel")) return "Vercel, Inc.";
  if (low.includes("cloudflare")) return "Cloudflare, Inc.";
  if (low.includes("netlify")) return "Netlify / NS1";
  if (low.includes("onrender") || low.includes("render.com")) return "Render Cloud";
  if (low.includes("railway")) return "Railway";
  if (low.includes("fly.dev") || low.includes("fly.io")) return "Fly.io";
  if (low.includes("github")) return "GitHub Pages";
  if (low.includes("amazon") || low.includes("aws")) return "Amazon Web Services";
  if (low.includes("google") || low.includes("firebase")) return "Google Cloud / Firebase";
  if (low.includes("microsoft") || low.includes("azure")) return "Microsoft Azure";
  if (low.includes("digitalocean")) return "DigitalOcean";
  if (low.includes("shopify")) return "Shopify";
  if (low.includes("webflow")) return "Webflow";
  if (low.includes("fastly")) return "Fastly Edge";
  if (low.includes("heroku")) return "Heroku";
  return void 0;
}
async function lookupIpRealInternetInfo(ip) {
  if (!isPublicRoutableIp(ip)) {
    return { ptr: void 0, rdapNetwork: null, providerName: void 0 };
  }
  let ptrPromise = Promise.resolve(void 0);
  if (PUBLIC_IPV4_CHECK.test(ip)) {
    const revName = `${ip.split(".").reverse().join(".")}.in-addr.arpa`;
    ptrPromise = (async () => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 3e3);
        const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(revName)}&type=PTR`, {
          signal: ctl.signal
        });
        clearTimeout(t);
        if (!r.ok) return void 0;
        const j = await r.json();
        const firstPtr = j.Answer?.[0]?.data;
        return firstPtr ? firstPtr.replace(/\.$/, "").toLowerCase() : void 0;
      } catch {
        return void 0;
      }
    })();
  }
  const rdapPromise = (async () => {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 3500);
      const r = await fetch(`https://rdap.arin.net/registry/ip/${encodeURIComponent(ip)}`, {
        headers: { Accept: "application/rdap+json, application/json" },
        signal: ctl.signal
      });
      clearTimeout(t);
      if (!r.ok) return null;
      const j = await r.json();
      let org;
      if (Array.isArray(j.entities)) {
        for (const ent of j.entities) {
          const fn = ent?.vcardArray?.[1]?.find?.((v) => Array.isArray(v) && v[0] === "fn")?.[3];
          if (typeof fn === "string" && fn.trim()) {
            org = fn.trim();
            break;
          }
        }
      }
      const cidrObj = Array.isArray(j.cidr0_cidrs) ? j.cidr0_cidrs[0] : null;
      const cidr = cidrObj ? `${cidrObj.v4prefix || cidrObj.v6prefix}/${cidrObj.length}` : void 0;
      return {
        name: typeof j.name === "string" ? j.name : void 0,
        handle: typeof j.handle === "string" ? j.handle : void 0,
        cidr,
        org
      };
    } catch {
      return null;
    }
  })();
  const [ptr, rdapNetwork] = await Promise.all([ptrPromise, rdapPromise]);
  const combinedLabel = [rdapNetwork?.org, rdapNetwork?.name, ptr].filter(Boolean).join(" ");
  const providerName = detectPlatformFromText(combinedLabel) || rdapNetwork?.org || rdapNetwork?.name || void 0;
  return { ptr, rdapNetwork, providerName };
}
function detectTxtRecordProvider(value, host) {
  const lowVal = value.toLowerCase();
  const lowHost = host.toLowerCase();
  if (lowVal.includes("vc-domain-verify") || lowHost.includes("_vercel")) return "Vercel Domain Verification";
  if (lowVal.includes("google-site-verification")) return "Google Workspace / Search";
  if (lowVal.includes("cloudflare-verify")) return "Cloudflare Verification";
  if (lowVal.startsWith("ms=")) return "Microsoft 365 Verification";
  if (lowVal.includes("v=spf1")) return "SPF Email Policy";
  if (lowHost.includes("_dmarc") || lowVal.includes("v=dmarc1")) return "DMARC Email Security";
  if (lowVal.includes("apple-domain-verification")) return "Apple Domain Verification";
  if (lowVal.includes("facebook-domain-verification")) return "Meta Domain Verification";
  if (lowVal.includes("netlify")) return "Netlify Verification";
  return void 0;
}
app.post("/api/dns/verify-record", async (req, res) => {
  const { domain, type, host, value } = req.body || {};
  const cleanDomain = String(domain || "").toLowerCase().trim();
  const cleanType = String(type || "A").toUpperCase().trim();
  const cleanHost = String(host || "@").toLowerCase().trim();
  const cleanValue = String(value || "").trim();
  if (!cleanDomain || !cleanValue) {
    return res.status(400).json({ error: "Domain and record value are required." });
  }
  const fqdn = cleanHost === "@" || cleanHost === cleanDomain ? cleanDomain : cleanHost.endsWith(`.${cleanDomain}`) ? cleanHost : `${cleanHost}.${cleanDomain}`;
  try {
    const googleDoh = async (qName, qType) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 3500);
      const r = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(qName)}&type=${encodeURIComponent(qType)}`,
        { signal: ctl.signal }
      );
      clearTimeout(t);
      return await r.json();
    };
    const cloudflareDoh = async (qName, qType) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 3500);
      const r = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(qName)}&type=${encodeURIComponent(qType)}`,
        {
          headers: { accept: "application/dns-json" },
          signal: ctl.signal
        }
      );
      clearTimeout(t);
      return await r.json();
    };
    const targetHostCandidate = cleanValue.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/\.+$/, "").trim();
    const isDirectIp = cleanType === "A" || cleanType === "AAAA";
    const isHostTargetType = ["CNAME", "MX", "NS", "PTR", "DNAME", "SRV", "HTTPS", "SVCB"].includes(cleanType);
    const cleanedHostTarget = cleanType === "SRV" ? targetHostCandidate.split(/\s+/).pop() || targetHostCandidate : targetHostCandidate;
    const [
      googleFqdnRes,
      cfFqdnRes,
      rootNsRes,
      targetARes,
      targetAAAARes
    ] = await Promise.all([
      googleDoh(fqdn, cleanType).catch(() => ({ Status: 2, Answer: [] })),
      cloudflareDoh(fqdn, cleanType).catch(() => ({ Status: 2, Answer: [] })),
      googleDoh(cleanDomain, "NS").catch(() => ({ Status: 2, Answer: [] })),
      isHostTargetType && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleanedHostTarget) ? googleDoh(cleanedHostTarget, "A").catch(() => ({ Status: 2, Answer: [] })) : Promise.resolve(null),
      isHostTargetType && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleanedHostTarget) ? cloudflareDoh(cleanedHostTarget, "AAAA").catch(() => ({ Status: 2, Answer: [] })) : Promise.resolve(null)
    ]);
    const combinedAnswers = [
      ...googleFqdnRes.Answer || [],
      ...cfFqdnRes.Answer || []
    ].map((a) => String(a.data || "").replace(/^"+|"+$/g, "").replace(/\.$/, "").trim());
    const liveAnswers = Array.from(new Set(combinedAnswers.filter(Boolean)));
    const normalizedExpected = cleanValue.replace(/^"+|"+$/g, "").replace(/\.$/, "").toLowerCase();
    const livePropagated = liveAnswers.some(
      (ans) => ans.toLowerCase() === normalizedExpected || ans.toLowerCase().includes(normalizedExpected)
    );
    const liveDomainNameservers = Array.from(
      new Set(
        (rootNsRes.Answer || []).filter((a) => a.type === 2).map((a) => String(a.data).replace(/\.$/, "").toLowerCase())
      )
    );
    let targetIps = [];
    if (isDirectIp) {
      if (isPublicRoutableIp(cleanValue)) {
        targetIps = [cleanValue];
      }
    } else if (isHostTargetType) {
      targetIps = Array.from(
        /* @__PURE__ */ new Set([
          ...(targetARes?.Answer || []).filter((a) => a.type === 1).map((a) => String(a.data)),
          ...(targetAAAARes?.Answer || []).filter((a) => a.type === 28).map((a) => String(a.data))
        ])
      );
    }
    const primaryPublicIp = targetIps.find((ip) => isPublicRoutableIp(ip));
    const internetInfo = primaryPublicIp ? await lookupIpRealInternetInfo(primaryPublicIp) : { ptr: void 0, rdapNetwork: null, providerName: void 0 };
    let resolvedProvider = internetInfo.providerName;
    if (!resolvedProvider && isHostTargetType) {
      resolvedProvider = detectPlatformFromText(cleanedHostTarget);
    }
    if (!resolvedProvider && (cleanType === "TXT" || cleanType === "SPF")) {
      resolvedProvider = detectTxtRecordProvider(cleanValue, cleanHost);
    }
    const targetReachable = isDirectIp ? Boolean(primaryPublicIp && (internetInfo.rdapNetwork || internetInfo.ptr)) : cleanType === "TXT" || cleanType === "SPF" ? Boolean(resolvedProvider || cleanValue.length >= 4) : isHostTargetType ? targetIps.length > 0 || Boolean(targetARes && targetARes.Status === 0) : true;
    res.json({
      fqdn,
      type: cleanType,
      livePropagated,
      targetReachable,
      targetIps: targetIps.slice(0, 4),
      resolvedProvider,
      reversePtr: internetInfo.ptr,
      rdapNetwork: internetInfo.rdapNetwork,
      liveAnswers,
      liveDomainNameservers,
      resolversChecked: ["Google 8.8.8.8", "Cloudflare 1.1.1.1", "ARIN RDAP Registry"],
      checkedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    res.status(502).json({ error: err.message || "Live record check failed." });
  }
});
app.get("/api/dns/live-check", async (req, res) => {
  const domain = (req.query.domain || "").toLowerCase().trim();
  if (!domain) {
    return res.status(400).json({ error: "Domain query parameter is required." });
  }
  try {
    const [aRes, nsRes, txtRes] = await Promise.all([
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`),
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=NS`),
      fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=TXT`)
    ]);
    const [aData, nsData, txtData] = await Promise.all([aRes.json(), nsRes.json(), txtRes.json()]);
    const records = [
      ...aData.Answer || [],
      ...nsData.Answer || [],
      ...txtData.Answer || []
    ].map((ans) => ({
      type: ans.type === 1 ? "A" : ans.type === 2 ? "NS" : ans.type === 16 ? "TXT" : String(ans.type),
      name: ans.name,
      data: ans.data,
      TTL: ans.TTL
    }));
    const nameservers = (nsData.Answer || []).filter((a) => a.type === 2).map((a) => a.data.replace(/\.$/, ""));
    res.json({
      domain,
      records,
      nameservers,
      status: aData.Status ?? nsData.Status ?? 0,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    res.status(502).json({ error: err.message || "Live DNS check failed." });
  }
});
function detectDnsProvider(ns) {
  const host = ns.toLowerCase();
  if (host.endsWith(".ns.cloudflare.com") || host.includes("cloudflare")) return "Cloudflare DNS";
  if (host.includes("vercel-dns.com")) return "Vercel DNS";
  if (host.includes("nsone.net") || host.includes("netlify.com")) return "Netlify / NS1 DNS";
  if (host.includes("digitalocean.com")) return "DigitalOcean DNS";
  if (host.includes("awsdns-")) return "Amazon Route 53";
  if (host.includes("googledomains.com") || host.includes(".ns.google.") || host.includes("google.com")) return "Google Cloud DNS";
  if (host.includes("registrar-servers.com") || host.includes("namecheap")) return "Namecheap DNS";
  if (host.includes("domaincontrol.com") || host.includes("godaddy")) return "GoDaddy DNS";
  if (host.includes("dns-parking.com") || host.includes("hostinger")) return "Hostinger DNS";
  if (host.includes("hetzner.")) return "Hetzner DNS";
  if (host.includes("linode.com") || host.includes("akam.net")) return "Akamai / Linode DNS";
  if (host.includes("bunny.net")) return "Bunny DNS";
  if (host.includes("dynv6.")) return "Dynv6 DNS";
  if (host.includes("desec.")) return "deSEC DNS";
  if (host.includes("afraid.org")) return "FreeDNS";
  if (host.includes("duckdns.org")) return "DuckDNS";
  if (host.includes("openhost.world")) return "OpenHost Managed DNS";
  const parts = host.split(".");
  if (parts.length >= 2) {
    return `Custom DNS (${parts.slice(-2).join(".")})`;
  }
  return "Custom DNS Provider";
}
app.post("/api/dns/verify-nameservers", async (req, res) => {
  const { domain, nameservers, mode, apiToken, providerName } = req.body || {};
  const cleanDomain = String(domain || "").toLowerCase().trim();
  if (!cleanDomain) {
    return res.status(400).json({ error: "Domain name is required." });
  }
  const cleanedNs = Array.isArray(nameservers) ? nameservers.map((ns) => String(ns || "").trim().toLowerCase().replace(/\.+$/, "")).filter((ns) => ns.length > 0).slice(0, 5) : [];
  if (mode === "custom" && cleanedNs.length < 1) {
    return res.status(400).json({ error: "Enter at least one valid nameserver hostname (e.g. ns1.vercel-dns.com or courtney.ns.cloudflare.com)." });
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
          const data = await r.json();
          const ips = (data.Answer || []).map((a) => a.data).filter(Boolean);
          return {
            nameserver: ns,
            reachable: data.Status === 0 && ips.length > 0,
            ips: ips.slice(0, 2),
            isCloudflare: ns.endsWith(".ns.cloudflare.com"),
            provider
          };
        } catch {
          return {
            nameserver: ns,
            reachable: false,
            ips: [],
            isCloudflare: ns.endsWith(".ns.cloudflare.com"),
            provider
          };
        }
      })
    );
    const unreachable = nsChecks.find((c) => !c.reachable);
    if (unreachable && mode === "custom") {
      return res.status(400).json({
        error: `Nameserver "${unreachable.nameserver}" did not resolve on global DNS. Check the spelling and try again.`,
        nsChecks
      });
    }
    const detectedProvider = typeof providerName === "string" && providerName.trim() || nsChecks[0]?.provider || "OpenHost Managed DNS";
    let liveDomainNs = [];
    try {
      const domRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(cleanDomain)}&type=NS`);
      const domData = await domRes.json();
      liveDomainNs = (domData.Answer || []).filter((a) => a.type === 2).map((a) => a.data.replace(/\.$/, "").toLowerCase());
    } catch {
    }
    let cloudflareZone = null;
    if (apiToken && typeof apiToken === "string" && apiToken.trim().length >= 10) {
      try {
        const matched = await cloudflareFetch(`/zones?name=${encodeURIComponent(cleanDomain)}`, apiToken);
        if (matched && matched.length > 0) {
          const z = matched[0];
          cloudflareZone = {
            zoneId: z.id,
            zoneName: z.name,
            status: z.status,
            nameservers: z.name_servers || [],
            accountLabel: z.account?.name || detectedProvider
          };
        }
      } catch {
      }
    }
    const usesCloudflareNs = nsChecks.some((c) => c.isCloudflare);
    const liveMatched = cleanedNs.length > 0 && cleanedNs.some((ns) => liveDomainNs.includes(ns));
    res.json({
      verified: true,
      domain: cleanDomain,
      mode: mode === "default" ? "default" : "custom",
      nameservers: cleanedNs,
      nsChecks,
      detectedProvider,
      liveDomainNs,
      liveMatched,
      usesCloudflareNs,
      cloudflareZone,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    res.status(502).json({ error: err.message || "Nameserver verification failed." });
  }
});
app.post("/api/sites/build", async (req, res) => {
  const { domain, businessName, description, ownerName } = req.body || {};
  if (!domain || typeof domain !== "string") {
    return res.status(400).json({ error: "Domain name is required to build a website." });
  }
  const cleanDomain = domain.toLowerCase().trim();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cleanDomain)) {
    return res.status(400).json({ error: "Invalid domain format." });
  }
  let htmlContent = "";
  const aiClient = getGeminiClient();
  if (aiClient) {
    try {
      const aiRes = await aiClient.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: `Create a clean, modern, mobile-ready, SEO-optimised single-file HTML5 website using Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>) for the free domain "${cleanDomain}".
Business / App Name: ${businessName || cleanDomain}
Owner: ${ownerName || "Creator"}
Description: ${description || "Modern web application and digital presence"}
Return ONLY valid raw HTML starting with <!DOCTYPE html> and ending with </html>.`
      });
      const generated = (aiRes.text || "").replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
      if (generated.startsWith("<!DOCTYPE html") || generated.startsWith("<html")) {
        htmlContent = generated;
      }
    } catch (err) {
      console.warn("Gemini site generation fallback:", err);
    }
  }
  if (!htmlContent) {
    const escHtml = (val) => val.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const safeTitle = escHtml(String(businessName || cleanDomain));
    const safeDomain = escHtml(cleanDomain);
    const safeDesc = escHtml(
      String(description || "Live open-world website hosted free with SSL and global edge readiness.")
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
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    visits: publishedSites[cleanDomain]?.visits || 0
  };
  savePublishedSites(publishedSites);
  res.json({
    success: true,
    siteUrl: `/site/${cleanDomain}`,
    domain: cleanDomain
  });
});
app.get("/api/public-config", (_req, res) => {
  const rawUrl = (process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/^["']+|["']+$/g, "").trim();
  let supabaseUrl = "";
  if (rawUrl) {
    const withProto = /^https?:\/\//i.test(rawUrl) ? rawUrl : rawUrl.includes(".") ? `https://${rawUrl}` : `https://${rawUrl}.supabase.co`;
    try {
      supabaseUrl = new URL(withProto).origin;
    } catch {
      supabaseUrl = withProto.replace(/\/+$/, "");
    }
  }
  const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "").trim().replace(/^["']+|["']+$/g, "").trim();
  res.json({ supabaseUrl, supabaseAnonKey });
});
var handleServeSite = (req, res) => {
  const domainName = (req.params.domain || "").toLowerCase().trim();
  const site = publishedSites[domainName];
  if (!site) {
    return res.status(404).send(
      `<!DOCTYPE html><html><body style="background:#0f172a;color:#f8fafc;font-family:sans-serif;text-align:center;padding:60px;"><h1>Site Not Built Yet</h1><p>Click "Build my website \u2014 it's free" or "Site" in your Client Area for ${domainName}.</p><a href="/" style="color:#3b82f6;">Back to Client Area</a></body></html>`
    );
  }
  site.visits += 1;
  savePublishedSites(publishedSites);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(site.htmlContent);
};
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    runtime: "node",
    vercel: Boolean(process.env.VERCEL),
    ...getDomainCapabilities()
  });
});
app.get("/site/:domain", handleServeSite);
app.get("/api/site/:domain", handleServeSite);
var app_default = app;
export {
  app_default as default
};
