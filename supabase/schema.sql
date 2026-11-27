-- =====================================================================
-- OpenHost Supabase Database Schema, Row-Level Security & Realtime
-- Paste this entire script into your Supabase Dashboard -> SQL Editor -> Run
-- =====================================================================

-- 1. User Profiles (created during onboarding after Google Sign-In)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  workspace_handle text not null check (workspace_handle ~ '^[a-z0-9-]{2,40}$'),
  email text not null default '',
  plan text not null default 'Free Open-World',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Claimed Domains & Independent Provider / Nameserver Settings
create table if not exists public.domains (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null check (char_length(domain) between 3 and 253),
  name text not null,
  tld text not null,
  provider_label text not null default 'OpenWorld Free Registry',
  status text not null default 'active' check (status in ('active', 'cloudflare_connected', 'pending_dns')),
  cloudflare_zone_id text,
  cloudflare_zone_name text,
  cloudflare_status text,
  cloudflare_nameservers text[] not null default '{}',
  cloudflare_account_label text,
  nameserver_mode text not null default 'default' check (nameserver_mode in ('default', 'custom')),
  nameservers text[] not null default '{}',
  registrar_lock boolean not null default true,
  expires_at text,
  contact_name text,
  contact_org text,
  contact_email text,
  contact_phone text,
  contact_country text,
  site_url text,
  auto_renew boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint domains_user_domain_unique unique (user_id, domain)
);

-- 3. Domain Shop Orders
create table if not exists public.orders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null,
  amount_label text not null default '$0.00 Free',
  status text not null default 'completed' check (status in ('completed', 'cloudflare_linked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Support Tickets
create table if not exists public.tickets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (char_length(subject) between 3 and 200),
  department text not null check (department in ('Domain Registry', 'Cloudflare DNS', 'Free Hosting & SSL', 'General Support')),
  message text not null check (char_length(message) between 5 and 2000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for fast per-user queries
create index if not exists idx_domains_user_id on public.domains(user_id);
create index if not exists idx_orders_user_id on public.orders(user_id);
create index if not exists idx_tickets_user_id on public.tickets(user_id);

-- Automatic updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_domains_updated_at on public.domains;
create trigger trg_domains_updated_at
  before update on public.domains
  for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists trg_tickets_updated_at on public.tickets;
create trigger trg_tickets_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

-- Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.domains enable row level security;
alter table public.orders enable row level security;
alter table public.tickets enable row level security;

-- RLS Policies: profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- RLS Policies: domains
drop policy if exists "domains_select_own" on public.domains;
create policy "domains_select_own"
  on public.domains for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "domains_insert_own" on public.domains;
create policy "domains_insert_own"
  on public.domains for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "domains_update_own" on public.domains;
create policy "domains_update_own"
  on public.domains for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "domains_delete_own" on public.domains;
create policy "domains_delete_own"
  on public.domains for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- RLS Policies: orders
drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own"
  on public.orders for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own"
  on public.orders for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "orders_update_own" on public.orders;
create policy "orders_update_own"
  on public.orders for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "orders_delete_own" on public.orders;
create policy "orders_delete_own"
  on public.orders for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- RLS Policies: tickets
drop policy if exists "tickets_select_own" on public.tickets;
create policy "tickets_select_own"
  on public.tickets for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "tickets_insert_own" on public.tickets;
create policy "tickets_insert_own"
  on public.tickets for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "tickets_update_own" on public.tickets;
create policy "tickets_update_own"
  on public.tickets for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "tickets_delete_own" on public.tickets;
create policy "tickets_delete_own"
  on public.tickets for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Index for portal-wide instant domain availability lookup
create index if not exists idx_domains_domain_lower on public.domains (lower(domain));

-- Security-scoped RPC: returns ONLY already-claimed domain names from candidates (no user PII)
create or replace function public.filter_claimed_domains(candidates text[])
returns table(claimed_domain text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct lower(d.domain) as claimed_domain
  from public.domains d
  where lower(d.domain) = any(
    array(
      select lower(trim(c))
      from unnest(coalesce(candidates, '{}'::text[])) as c
      limit 100
    )
  );
$$;

grant execute on function public.filter_claimed_domains(text[]) to anon, authenticated;

-- 5. Domain DNS Records (Zone Editor: all IANA RRTYPEs)
create table if not exists public.dns_records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  domain_id text not null references public.domains(id) on delete cascade,
  domain text not null check (char_length(domain) between 3 and 253),
  record_type text not null check (record_type ~ '^[A-Z0-9-]{1,20}$'),
  host text not null check (char_length(host) between 1 and 253),
  value text not null check (char_length(value) between 1 and 2048),
  ttl integer not null default 300 check (ttl >= 1 and ttl <= 86400),
  priority integer check (priority is null or (priority >= 0 and priority <= 65535)),
  proxied boolean not null default false,
  cloudflare_record_id text,
  sync_status text not null default 'saved' check (sync_status in ('saved', 'propagated', 'cloudflare_synced')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safe upgrade if earlier 4-type dns_records table already exists
alter table public.dns_records drop constraint if exists dns_records_record_type_check;
alter table public.dns_records add constraint dns_records_record_type_check check (record_type ~ '^[A-Z0-9-]{1,20}$');

-- Safe upgrade for Private Nameservers & EPP Code on domains table
alter table public.domains add column if not exists private_nameservers jsonb not null default '[]'::jsonb;
alter table public.domains add column if not exists epp_code text;

create index if not exists idx_dns_records_user_domain on public.dns_records(user_id, domain_id);

drop trigger if exists trg_dns_records_updated_at on public.dns_records;
create trigger trg_dns_records_updated_at
  before update on public.dns_records
  for each row execute function public.set_updated_at();

alter table public.dns_records enable row level security;

drop policy if exists "dns_records_select_own" on public.dns_records;
create policy "dns_records_select_own"
  on public.dns_records for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "dns_records_insert_own" on public.dns_records;
create policy "dns_records_insert_own"
  on public.dns_records for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "dns_records_update_own" on public.dns_records;
create policy "dns_records_update_own"
  on public.dns_records for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "dns_records_delete_own" on public.dns_records;
create policy "dns_records_delete_own"
  on public.dns_records for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Enable Realtime updates for all 5 tables (safe if re-run)
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.domains;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.tickets;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.dns_records;
exception when duplicate_object then null;
end $$;
