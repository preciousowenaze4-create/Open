export interface UserProfile {
  uid: string;
  displayName: string;
  workspaceHandle: string;
  email: string;
  plan: 'Free Open-World';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PrivateNameserverEntry {
  hostname: string;
  ip: string;
}

export interface DomainRecord {
  id: string;
  userId: string;
  domain: string;
  name: string;
  tld: string;
  providerLabel: string;
  status: 'active' | 'cloudflare_connected' | 'pending_dns';
  cloudflareZoneId?: string;
  cloudflareZoneName?: string;
  cloudflareStatus?: string;
  cloudflareNameservers?: string[];
  cloudflareAccountLabel?: string;
  nameserverMode?: 'default' | 'custom';
  nameservers?: string[];
  privateNameservers?: PrivateNameserverEntry[];
  eppCode?: string;
  registrarLock?: boolean;
  expiresAt?: string;
  contactName?: string;
  contactOrg?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactCountry?: string;
  siteUrl?: string;
  autoRenew: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ShopOrder {
  id: string;
  userId: string;
  domain: string;
  amountLabel: string;
  status: 'completed' | 'cloudflare_linked';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  department: 'Domain Registry' | 'Cloudflare DNS' | 'Free Hosting & SSL' | 'General Support';
  message: string;
  status: 'open' | 'answered' | 'closed';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DomainSearchResult {
  domain: string;
  name: string;
  tld: string;
  available: boolean;
  isFree: boolean;
  providerLabel: string;
  dnsStatus: string;
  nameservers: string[];
  latencyMs: number;
  lookupSource: string;
}

export type DnsRecordType = string;

export interface DnsRecordTypeOption {
  type: string;
  code: number;
  meaning: string;
  category: 'common' | 'iana';
}

export interface DnsRecordItem {
  id: string;
  userId: string;
  domainId: string;
  domain: string;
  type: DnsRecordType;
  host: string;
  value: string;
  ttl: number;
  priority?: number;
  proxied?: boolean;
  cloudflareRecordId?: string;
  syncStatus: 'saved' | 'propagated' | 'cloudflare_synced';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CloudflareDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied?: boolean;
}

export interface LiveDnsLookupResult {
  domain: string;
  records: {
    type: string;
    name: string;
    data: string;
    TTL: number;
  }[];
  nameservers: string[];
  status: number;
  checkedAt: string;
}

export interface NameserverVerificationResult {
  verified: boolean;
  domain: string;
  mode: 'default' | 'custom';
  nameservers: string[];
  nsChecks: {
    nameserver: string;
    reachable: boolean;
    ips: string[];
    isCloudflare: boolean;
    provider?: string;
  }[];
  detectedProvider: string;
  liveDomainNs: string[];
  liveMatched: boolean;
  usesCloudflareNs: boolean;
  cloudflareZone?: {
    zoneId: string;
    zoneName: string;
    status: string;
    nameservers: string[];
    accountLabel?: string;
  } | null;
  checkedAt: string;
}

export type PortalSection =
  | 'dashboard'
  | 'my_domains'
  | 'register_domain'
  | 'manage_domain'
  | 'manage_nameservers'
  | 'registrar_lock'
  | 'domain_addons'
  | 'edit_contact'
  | 'private_nameservers'
  | 'epp_code'
  | 'manage_dns'
  | 'renewals'
  | 'transfer_cloudflare'
  | 'services'
  | 'billing'
  | 'support'
  | 'affiliates'
  | 'store';
