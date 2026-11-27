import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DomainRecord, ShopOrder, SupportTicket, UserProfile } from './types';

declare const __SUPABASE_URL__: string | undefined;
declare const __SUPABASE_ANON_KEY__: string | undefined;

function readInitialSupabaseEnv(): { url: string; anonKey: string } {
  const url =
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
    (typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '') ||
    '';
  const anonKey =
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
    (typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : '') ||
    '';
  return { url: url.trim(), anonKey: anonKey.trim() };
}

let currentConfig = readInitialSupabaseEnv();
let clientInstance: SupabaseClient | null =
  currentConfig.url && currentConfig.anonKey
    ? createClient(currentConfig.url, currentConfig.anonKey, {
        auth: {
          flowType: 'pkce',
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export function getSupabaseClient(): SupabaseClient | null {
  return clientInstance;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(clientInstance && currentConfig.url && currentConfig.anonKey);
}

export async function ensureSupabaseInitialized(): Promise<SupabaseClient | null> {
  if (clientInstance) return clientInstance;
  try {
    const res = await fetch('/api/public-config');
    if (res.ok) {
      const data = await res.json();
      const url = typeof data.supabaseUrl === 'string' ? data.supabaseUrl.trim() : '';
      const anonKey = typeof data.supabaseAnonKey === 'string' ? data.supabaseAnonKey.trim() : '';
      if (url && anonKey) {
        currentConfig = { url, anonKey };
        clientInstance = createClient(url, anonKey, {
          auth: {
            flowType: 'pkce',
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true,
          },
        });
      }
    }
  } catch {
    // Ignore runtime config fallback network errors
  }
  return clientInstance;
}

export function mapProfileRow(row: any): UserProfile {
  return {
    uid: row.id,
    displayName: row.display_name || '',
    workspaceHandle: row.workspace_handle || '',
    email: row.email || '',
    plan: 'Free Open-World',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDomainRow(row: any): DomainRecord {
  return {
    id: row.id,
    userId: row.user_id,
    domain: row.domain,
    name: row.name,
    tld: row.tld,
    providerLabel: row.provider_label || 'OpenWorld Free Registry',
    status: row.status || 'active',
    cloudflareZoneId: row.cloudflare_zone_id || undefined,
    cloudflareZoneName: row.cloudflare_zone_name || undefined,
    cloudflareStatus: row.cloudflare_status || undefined,
    cloudflareNameservers: Array.isArray(row.cloudflare_nameservers)
      ? row.cloudflare_nameservers
      : [],
    cloudflareAccountLabel: row.cloudflare_account_label || undefined,
    nameserverMode: row.nameserver_mode || 'default',
    nameservers: Array.isArray(row.nameservers) ? row.nameservers : [],
    registrarLock: row.registrar_lock ?? true,
    expiresAt: row.expires_at || undefined,
    contactName: row.contact_name || undefined,
    contactOrg: row.contact_org || undefined,
    contactEmail: row.contact_email || undefined,
    contactPhone: row.contact_phone || undefined,
    contactCountry: row.contact_country || undefined,
    siteUrl: row.site_url || undefined,
    autoRenew: row.auto_renew ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapOrderRow(row: any): ShopOrder {
  return {
    id: row.id,
    userId: row.user_id,
    domain: row.domain,
    amountLabel: row.amount_label || '$0.00 Free',
    status: row.status || 'completed',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTicketRow(row: any): SupportTicket {
  return {
    id: row.id,
    userId: row.user_id,
    subject: row.subject,
    department: row.department,
    message: row.message,
    status: row.status || 'open',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
