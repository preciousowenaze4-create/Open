import { DnsRecordType } from '../types';

export interface ParsedDnsInput {
  type: DnsRecordType;
  host: string;
  value: string;
  priority?: number;
  ttl?: number;
}

const IPV4_REGEX =
  /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

const IPV6_REGEX = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

const HOSTNAME_REGEX =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const HOST_LABEL_REGEX = /^(@|\*|(\*\.)?[a-z0-9_-]+(\.[a-z0-9_-]+)*)$/i;
const RRTYPE_REGEX = /^[A-Z0-9-]{1,20}$/;

const KNOWN_TYPES = new Set([
  'A', 'AAAA', 'NS', 'CNAME', 'PTR', 'MX', 'TXT', 'SRV', 'CAA', 'SOA',
  'HTTPS', 'SVCB', 'SPF', 'DS', 'DNSKEY', 'TLSA', 'SSHFP', 'URI', 'NAPTR',
  'CERT', 'DNAME', 'LOC', 'OPENPGPKEY', 'SMIMEA', 'RP', 'AFSDB', 'HINFO',
  'IPSECKEY', 'KX', 'APL', 'CDNSKEY', 'CDS', 'CSYNC', 'DHCID', 'EUI48',
  'EUI64', 'HIP', 'NSEC', 'NSEC3', 'WALLET', 'ZONEMD', 'RESINFO', 'TA',
]);

export function normalizeDnsHost(rawHost: string, domainName?: string): string {
  let cleaned = rawHost.trim().toLowerCase().replace(/\.+$/, '');
  if (!cleaned || cleaned === '@') return '@';

  if (domainName) {
    const cleanDomain = domainName.toLowerCase().trim().replace(/\.+$/, '');
    if (cleaned === cleanDomain) return '@';
    if (cleaned.endsWith(`.${cleanDomain}`)) {
      const prefix = cleaned.slice(0, cleaned.length - cleanDomain.length - 1);
      return prefix || '@';
    }
  }

  return cleaned;
}

export function validateDnsRecordInput(
  input: {
    type: DnsRecordType;
    host: string;
    value: string;
    priority?: number;
  },
  domainName?: string
): { valid: boolean; error?: string; normalized?: ParsedDnsInput } {
  const type = String(input.type || 'A').trim().toUpperCase();
  const host = normalizeDnsHost(input.host, domainName);
  let value = input.value.trim();

  if (!RRTYPE_REGEX.test(type)) {
    return { valid: false, error: `Invalid DNS record type "${input.type}".` };
  }

  if (!HOST_LABEL_REGEX.test(host) || host.length > 253) {
    return {
      valid: false,
      error: `Invalid Name / Host "${input.host}". Use @ for root, www, or a valid subdomain.`,
    };
  }

  if (!value) {
    return { valid: false, error: 'Value / Target is required.' };
  }

  if (type === 'A') {
    if (!IPV4_REGEX.test(value)) {
      return {
        valid: false,
        error: `Invalid IPv4 address "${value}" for A record (e.g. 216.198.79.1 or 76.76.21.21).`,
      };
    }
  } else if (type === 'AAAA') {
    if (!IPV6_REGEX.test(value) || !value.includes(':')) {
      return {
        valid: false,
        error: `Invalid IPv6 address "${value}" for AAAA record (e.g. 2606:4700:4700::1111).`,
      };
    }
  } else if (type === 'CNAME' || type === 'MX' || type === 'NS' || type === 'PTR' || type === 'DNAME') {
    value = value.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/\.+$/, '').toLowerCase();
    if (!HOSTNAME_REGEX.test(value) || value.length > 253) {
      return {
        valid: false,
        error: `Invalid target hostname "${input.value}" for ${type} record (e.g. cname.vercel-dns.com).`,
      };
    }
  } else if (type === 'TXT' || type === 'SPF') {
    value = value.replace(/^"+|"+$/g, '').trim();
    if (value.length < 1 || value.length > 2048) {
      return {
        valid: false,
        error: `${type} value must be between 1 and 2048 characters.`,
      };
    }
  } else {
    if (value.length > 2048) {
      return {
        valid: false,
        error: `${type} value must be 2048 characters or fewer.`,
      };
    }
  }

  const needsPriority = type === 'MX' || type === 'SRV' || type === 'URI' || type === 'KX';
  const priority = needsPriority
    ? Math.min(65535, Math.max(0, Number.isFinite(input.priority) ? Number(input.priority) : 10))
    : undefined;

  return {
    valid: true,
    normalized: {
      type,
      host,
      value,
      priority,
    },
  };
}

function isSupportedType(token: string, knownSet?: Set<string>): boolean {
  const upper = token.toUpperCase();
  return KNOWN_TYPES.has(upper) || Boolean(knownSet && knownSet.has(upper));
}

function stripQuotes(val: string): string {
  return val.trim().replace(/^"+|"+$/g, '').trim();
}

export function parseRawDnsText(
  rawText: string,
  domainName?: string,
  extraValidTypes?: string[]
): ParsedDnsInput[] {
  const text = rawText.trim();
  if (!text) return [];

  const knownSet = extraValidTypes && extraValidTypes.length > 0
    ? new Set([...KNOWN_TYPES, ...extraValidTypes.map((t) => t.toUpperCase())])
    : KNOWN_TYPES;

  // 1. Key-value blocks ("Type: CNAME\nName: www\nValue: ...")
  const kvBlocks = text.split(/\n\s*\n+/);
  const kvResults: ParsedDnsInput[] = [];
  for (const block of kvBlocks) {
    const typeMatch = block.match(/(?:^|\n|\|)\s*(?:record\s*)?type\s*[:=]\s*([A-Z0-9-]{1,20})\b/i);
    const hostMatch = block.match(/(?:^|\n|\|)\s*(?:name|host|subdomain)\s*[:=]\s*([^\n|]+)/i);
    const valueMatch = block.match(/(?:^|\n|\|)\s*(?:value|target|content|points?\s*to|address|destination|data)\s*[:=]\s*([^\n|]+)/i);
    const prioMatch = block.match(/(?:^|\n|\|)\s*(?:priority|prio)\s*[:=]\s*(\d+)/i);

    if (typeMatch && valueMatch && isSupportedType(typeMatch[1], knownSet)) {
      const recType = typeMatch[1].toUpperCase();
      const host = normalizeDnsHost(hostMatch ? hostMatch[1] : '@', domainName);
      const val = stripQuotes(valueMatch[1]).replace(/\.+$/, '');
      const priority = prioMatch ? parseInt(prioMatch[1], 10) : recType === 'MX' || recType === 'SRV' ? 10 : undefined;
      kvResults.push({
        type: recType,
        host,
        value: val,
        priority,
      });
    }
  }
  if (kvResults.length > 0) {
    return kvResults;
  }

  // 2. Line-by-line parsing
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(';') && !l.startsWith('#'));

  const results: ParsedDnsInput[] = [];

  for (const line of lines) {
    if (/^(type\s+name\s+value|type\s+host|name\s+type\s+value)/i.test(line)) {
      continue;
    }

    const quotedMatch = line.match(/"([^"]+)"/);
    const lineWithoutQuotes = quotedMatch ? line.replace(quotedMatch[0], '__QUOTED_TXT__') : line;
    const tokens = lineWithoutQuotes
      .split(/[\t,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (tokens.length === 0) continue;

    if (isSupportedType(tokens[0], knownSet)) {
      const recType = tokens[0].toUpperCase();
      if (recType === 'TXT' || recType === 'SPF') {
        const host = normalizeDnsHost(tokens[1] || '@', domainName);
        const rawVal = quotedMatch
          ? quotedMatch[1]
          : stripQuotes(line.replace(/^[A-Za-z0-9-]+\s+\S+\s*/, ''));
        if (rawVal) results.push({ type: recType, host, value: rawVal });
        continue;
      }
      if (recType === 'MX' || recType === 'SRV') {
        const host = normalizeDnsHost(tokens[1] || '@', domainName);
        let priority = 10;
        let target = tokens.slice(2).join(' ');
        if (/^\d+$/.test(tokens[2] || '') && tokens[3]) {
          priority = parseInt(tokens[2], 10);
          target = tokens.slice(3).join(' ');
        }
        if (target) {
          results.push({ type: recType, host, value: target.replace(/\.+$/, ''), priority });
        }
        continue;
      }
      if (tokens.length >= 3) {
        const host = normalizeDnsHost(tokens[1], domainName);
        const value = tokens.slice(2).join(' ').replace(/\.+$/, '');
        results.push({ type: recType, host, value });
        continue;
      }
      if (tokens.length === 2) {
        results.push({
          type: recType,
          host: recType === 'CNAME' ? 'www' : '@',
          value: tokens[1].replace(/\.+$/, ''),
        });
        continue;
      }
    }

    const typeIdx = tokens.findIndex((t, idx) => idx > 0 && isSupportedType(t, knownSet));
    if (typeIdx > 0) {
      const recType = tokens[typeIdx].toUpperCase();
      const host = normalizeDnsHost(tokens[0], domainName);
      if (recType === 'TXT' || recType === 'SPF') {
        const afterType = line.slice(line.toUpperCase().indexOf(recType) + recType.length).trim();
        const val = quotedMatch ? quotedMatch[1] : stripQuotes(afterType);
        if (val) results.push({ type: recType, host, value: val });
        continue;
      }
      if (recType === 'MX' || recType === 'SRV') {
        const firstAfter = tokens[typeIdx + 1] || '';
        const restAfter = tokens.slice(typeIdx + 2).join(' ');
        if (/^\d+$/.test(firstAfter) && restAfter) {
          results.push({
            type: recType,
            host,
            priority: parseInt(firstAfter, 10),
            value: restAfter.replace(/\.+$/, ''),
          });
        } else if (firstAfter) {
          results.push({
            type: recType,
            host,
            priority: 10,
            value: tokens.slice(typeIdx + 1).join(' ').replace(/\.+$/, ''),
          });
        }
        continue;
      }
      const valueToken = tokens.slice(typeIdx + 1).join(' ');
      if (valueToken) {
        results.push({ type: recType, host, value: valueToken.replace(/\.+$/, '') });
        continue;
      }
    }

    if (tokens.length === 1) {
      const single = stripQuotes(tokens[0]).replace(/\.+$/, '');
      if (IPV4_REGEX.test(single)) {
        results.push({ type: 'A', host: '@', value: single });
      } else if (IPV6_REGEX.test(single) && single.includes(':')) {
        results.push({ type: 'AAAA', host: '@', value: single });
      } else if (/^(v=spf1|vc-domain-verify=|google-site-verification=|vercel-domain-verify)/i.test(single)) {
        results.push({ type: 'TXT', host: '@', value: single });
      } else if (HOSTNAME_REGEX.test(single)) {
        results.push({ type: 'CNAME', host: 'www', value: single });
      }
    } else if (/^(v=|google-site-verification=|vc-domain-verify=)/i.test(line)) {
      results.push({ type: 'TXT', host: '@', value: stripQuotes(line) });
    }
  }

  return results;
}
