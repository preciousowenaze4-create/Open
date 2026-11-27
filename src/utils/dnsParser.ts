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

const HOSTNAME_REGEX =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const HOST_LABEL_REGEX = /^(@|\*|(\*\.)?[a-z0-9_-]+(\.[a-z0-9_-]+)*)$/i;

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
  const type = input.type;
  const host = normalizeDnsHost(input.host, domainName);
  let value = input.value.trim();

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
  } else if (type === 'CNAME' || type === 'MX') {
    value = value.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/\.+$/, '').toLowerCase();
    if (!HOSTNAME_REGEX.test(value) || value.length > 253) {
      return {
        valid: false,
        error: `Invalid target hostname "${input.value}" for ${type} record (e.g. cname.vercel-dns.com).`,
      };
    }
  } else if (type === 'TXT') {
    value = value.replace(/^"+|"+$/g, '').trim();
    if (value.length < 1 || value.length > 1024) {
      return {
        valid: false,
        error: 'TXT value must be between 1 and 1024 characters.',
      };
    }
  }

  const priority =
    type === 'MX'
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

function isSupportedType(token: string): token is DnsRecordType {
  const upper = token.toUpperCase();
  return upper === 'A' || upper === 'CNAME' || upper === 'TXT' || upper === 'MX';
}

function stripQuotes(val: string): string {
  return val.trim().replace(/^"+|"+$/g, '').trim();
}

/**
 * Parses raw pasted DNS text from Vercel, Cloudflare, Namecheap, Hostinger, Render, or BIND zone files.
 * Supports:
 * - Key-value blocks ("Type: CNAME\nName: www\nValue: cname.vercel-dns.com")
 * - Table / tab / multi-space rows ("A  @  76.76.21.21" or "CNAME www cname.vercel-dns.com")
 * - BIND zone format ("www.example.com. 300 IN CNAME cname.vercel-dns.com.")
 * - Smart bare values ("76.76.21.21" -> A @, "cname.vercel-dns.com" -> CNAME www, "vc-domain-verify=..." -> TXT)
 */
export function parseRawDnsText(rawText: string, domainName?: string): ParsedDnsInput[] {
  const text = rawText.trim();
  if (!text) return [];

  // 1. Check labelled key-value style first (single or multi-record blocks)
  const kvBlocks = text.split(/\n\s*\n+/);
  const kvResults: ParsedDnsInput[] = [];
  for (const block of kvBlocks) {
    const typeMatch = block.match(/(?:^|\n|\|)\s*(?:record\s*)?type\s*[:=]\s*(A|CNAME|TXT|MX)\b/i);
    const hostMatch = block.match(/(?:^|\n|\|)\s*(?:name|host|subdomain)\s*[:=]\s*([^\n|]+)/i);
    const valueMatch = block.match(/(?:^|\n|\|)\s*(?:value|target|content|points?\s*to|address|destination)\s*[:=]\s*([^\n|]+)/i);
    const prioMatch = block.match(/(?:^|\n|\|)\s*(?:priority|prio)\s*[:=]\s*(\d+)/i);

    if (typeMatch && valueMatch) {
      const recType = typeMatch[1].toUpperCase() as DnsRecordType;
      const host = normalizeDnsHost(hostMatch ? hostMatch[1] : '@', domainName);
      const val = stripQuotes(valueMatch[1]).replace(/\.+$/, '');
      const priority = prioMatch ? parseInt(prioMatch[1], 10) : recType === 'MX' ? 10 : undefined;
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

  // 2. Line-by-line parsing (tabular / space / BIND zone / bare values)
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(';') && !l.startsWith('#'));

  const results: ParsedDnsInput[] = [];

  for (const line of lines) {
    // Skip common header rows copied from provider tables
    if (/^(type\s+name\s+value|type\s+host|name\s+type\s+value)/i.test(line)) {
      continue;
    }

    // Quoted TXT value anywhere in line: preserve spaces inside quotes
    const quotedMatch = line.match(/"([^"]+)"/);
    const lineWithoutQuotes = quotedMatch ? line.replace(quotedMatch[0], '__QUOTED_TXT__') : line;
    const tokens = lineWithoutQuotes
      .split(/[\t,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (tokens.length === 0) continue;

    // Case A: Starts with record type: "A @ 76.76.21.21" or "MX @ 10 mail.host.com"
    if (isSupportedType(tokens[0])) {
      const recType = tokens[0].toUpperCase() as DnsRecordType;
      if (recType === 'TXT') {
        const host = normalizeDnsHost(tokens[1] || '@', domainName);
        const rawVal = quotedMatch
          ? quotedMatch[1]
          : stripQuotes(line.replace(/^[A-Za-z]+\s+\S+\s*/, ''));
        if (rawVal) results.push({ type: 'TXT', host, value: rawVal });
        continue;
      }
      if (recType === 'MX') {
        const host = normalizeDnsHost(tokens[1] || '@', domainName);
        let priority = 10;
        let target = tokens[2] || '';
        if (/^\d+$/.test(tokens[2] || '') && tokens[3]) {
          priority = parseInt(tokens[2], 10);
          target = tokens[3];
        } else if (/^\d+$/.test(tokens[3] || '')) {
          priority = parseInt(tokens[3], 10);
        }
        if (target) {
          results.push({ type: 'MX', host, value: target.replace(/\.+$/, ''), priority });
        }
        continue;
      }
      // A or CNAME
      if (tokens.length >= 3) {
        const host = normalizeDnsHost(tokens[1], domainName);
        const value = tokens[2].replace(/\.+$/, '');
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

    // Case B: BIND or Reverse-order: "<host> [ttl] [IN] <TYPE> [priority] <value>"
    const typeIdx = tokens.findIndex((t, idx) => idx > 0 && isSupportedType(t));
    if (typeIdx > 0) {
      const recType = tokens[typeIdx].toUpperCase() as DnsRecordType;
      const host = normalizeDnsHost(tokens[0], domainName);
      if (recType === 'TXT') {
        const afterType = line.slice(line.toUpperCase().indexOf('TXT') + 3).trim();
        const val = quotedMatch ? quotedMatch[1] : stripQuotes(afterType);
        if (val) results.push({ type: 'TXT', host, value: val });
        continue;
      }
      if (recType === 'MX') {
        const firstAfter = tokens[typeIdx + 1] || '';
        const secondAfter = tokens[typeIdx + 2] || '';
        if (/^\d+$/.test(firstAfter) && secondAfter) {
          results.push({
            type: 'MX',
            host,
            priority: parseInt(firstAfter, 10),
            value: secondAfter.replace(/\.+$/, ''),
          });
        } else if (firstAfter) {
          results.push({
            type: 'MX',
            host,
            priority: 10,
            value: firstAfter.replace(/\.+$/, ''),
          });
        }
        continue;
      }
      const valueToken = tokens[typeIdx + 1];
      if (valueToken) {
        results.push({ type: recType, host, value: valueToken.replace(/\.+$/, '') });
        continue;
      }
    }

    // Case C: Single bare value pasted ("76.76.21.21" or "cname.vercel-dns.com" or "v=spf1 ...")
    if (tokens.length === 1) {
      const single = stripQuotes(tokens[0]).replace(/\.+$/, '');
      if (IPV4_REGEX.test(single)) {
        results.push({ type: 'A', host: '@', value: single });
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
