import React, { useState, useEffect, useCallback } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import {
  ensureSupabaseInitialized,
  getSupabaseClient,
  isSupabaseConfigured,
  mapDomainRow,
  mapOrderRow,
  mapProfileRow,
  mapTicketRow,
} from './supabase';
import {
  DomainRecord,
  DomainSearchResult,
  PortalSection,
  ShopOrder,
  SupportTicket,
  UserProfile,
} from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PortalAuthGate } from './components/PortalAuthGate';
import { PortalHeader } from './components/PortalHeader';
import { PortalDrawer } from './components/PortalDrawer';
import { PortalDashboard } from './components/PortalDashboard';
import { MyDomainsView } from './components/MyDomainsView';
import { SearchView } from './components/SearchView';
import { CloudflareConnectModal } from './components/CloudflareConnectModal';
import { MobileTabBar } from './components/MobileTabBar';
import {
  ManageDomainView,
  ManageNameserversView,
  EditContactView,
} from './components/DomainManagementViews';
import {
  ManageDnsView,
  RenewalsView,
  StoreOrdersView,
  SupportTicketsView,
  AffiliatesView,
  BillingView,
} from './components/PortalSections';
import { CheckCircle2, X } from 'lucide-react';

function PortalAppContent() {
  const [supabaseReady, setSupabaseReady] = useState(isSupabaseConfigured());
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  const [activeSection, setActiveSection] = useState<PortalSection>('dashboard');
  const [activeDomainId, setActiveDomainId] = useState<string>('');
  const [sessionTokensByDomain, setSessionTokensByDomain] = useState<Record<string, string>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cloudflareModalDomain, setCloudflareModalDomain] = useState<DomainRecord | null | undefined>(
    undefined
  );
  const [acquiringDomain, setAcquiringDomain] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const loadUserWorkspace = useCallback(async (userId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const [profileRes, domainsRes, ordersRes, ticketsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('domains').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('orders').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('tickets').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    ]);

    if (profileRes.data) {
      setProfile(mapProfileRow(profileRes.data));
    } else {
      setProfile(null);
    }
    setProfileLoaded(true);

    if (domainsRes.data) setDomains(domainsRes.data.map(mapDomainRow));
    if (ordersRes.data) setOrders(ordersRes.data.map(mapOrderRow));
    if (ticketsRes.data) setTickets(ticketsRes.data.map(mapTicketRow));
  }, []);

  // Initialize Supabase (build-time or runtime public config) and listen for Auth state
  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | null = null;

    async function init() {
      const supabase = await ensureSupabaseInitialized();
      if (!active) return;

      if (!supabase) {
        setSupabaseReady(false);
        setAuthReady(true);
        return;
      }

      setSupabaseReady(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;
      const initialUser = session?.user ?? null;
      setSupabaseUser(initialUser);
      setAuthReady(true);

      if (initialUser) {
        loadUserWorkspace(initialUser.id);
      }

      const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        const nextUser = nextSession?.user ?? null;
        setSupabaseUser(nextUser);
        setAuthReady(true);
        if (!nextUser) {
          setProfile(null);
          setProfileLoaded(false);
          setDomains([]);
          setOrders([]);
          setTickets([]);
          setSessionTokensByDomain({});
        } else {
          loadUserWorkspace(nextUser.id);
        }
      });

      subscription = listener.subscription;
    }

    init();
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [loadUserWorkspace]);

  // Real-time Postgres change listeners scoped to the signed-in user
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !authReady || !supabaseUser) return;

    const uid = supabaseUser.id;
    const channel = supabase
      .channel(`openhost-user-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
        () => loadUserWorkspace(uid)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'domains', filter: `user_id=eq.${uid}` },
        () => loadUserWorkspace(uid)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${uid}` },
        () => loadUserWorkspace(uid)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets', filter: `user_id=eq.${uid}` },
        () => loadUserWorkspace(uid)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authReady, supabaseUser, loadUserWorkspace]);

  const activeDomainObj = domains.find((d) => d.id === activeDomainId) || domains[0] || null;

  const handleDomainUpdated = (updated: DomainRecord) => {
    setDomains((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  };

  const handleDomainDeleted = (domainId: string) => {
    setDomains((prev) => prev.filter((d) => d.id !== domainId));
  };

  const handleOrderDeleted = (orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  };

  const handleTicketCreated = (ticket: SupportTicket) => {
    setTickets((prev) => [ticket, ...prev]);
  };

  const handleTicketUpdated = (ticket: SupportTicket) => {
    setTickets((prev) => prev.map((t) => (t.id === ticket.id ? ticket : t)));
  };

  const handleSaveSessionToken = (domainId: string, token: string) => {
    setSessionTokensByDomain((prev) => ({ ...prev, [domainId]: token }));
  };

  const handleSelectDomainAction = (domain: DomainRecord, section: PortalSection) => {
    setActiveDomainId(domain.id);
    setActiveSection(section);
  };

  // Tap "Get Domain" -> Persist in Supabase (domains + orders), update Shop, route to My Domains & DNS setup
  const handleGetDomain = async (result: DomainSearchResult) => {
    const supabase = getSupabaseClient();
    if (!supabase || !supabaseUser) return;

    const existing = domains.find((d) => d.domain.toLowerCase() === result.domain.toLowerCase());
    if (existing) {
      setToast(`${existing.domain} is already in your account.`);
      setTimeout(() => setToast(''), 4000);
      setActiveDomainId(existing.id);
      setActiveSection('manage_nameservers');
      return;
    }

    setAcquiringDomain(result.domain);
    const domainId = `dom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nextYear = `${new Date().getFullYear() + 1}-12-31`;

    try {
      const { data: domainRow, error: domErr } = await supabase
        .from('domains')
        .insert({
          id: domainId,
          user_id: supabaseUser.id,
          domain: result.domain,
          name: result.name,
          tld: result.tld,
          provider_label: result.providerLabel,
          status: 'active',
          nameserver_mode: 'default',
          registrar_lock: true,
          expires_at: nextYear,
          auto_renew: true,
        })
        .select('*')
        .single();

      if (domErr) throw domErr;

      const { data: orderRow, error: ordErr } = await supabase
        .from('orders')
        .insert({
          id: orderId,
          user_id: supabaseUser.id,
          domain: result.domain,
          amount_label: '$0.00 Free',
          status: 'completed',
        })
        .select('*')
        .single();

      if (ordErr) throw ordErr;

      const mappedDomain = mapDomainRow(domainRow);
      const mappedOrder = mapOrderRow(orderRow);

      setDomains((prev) => [mappedDomain, ...prev]);
      setOrders((prev) => [mappedOrder, ...prev]);
      setActiveDomainId(domainId);
      setToast(
        `${result.domain} added to your account! Configure custom nameservers or connect your DNS provider.`
      );
      setTimeout(() => setToast(''), 5500);
      setActiveSection('my_domains');
      setCloudflareModalDomain(mappedDomain);
    } catch (err: any) {
      setToast(err?.message || 'Could not claim domain. Check your Supabase SQL tables.');
      setTimeout(() => setToast(''), 4500);
    } finally {
      setAcquiringDomain(null);
    }
  };

  // Build free website directly from My Domains "Site" button
  const handleBuildSiteQuick = async (domain: DomainRecord) => {
    if (!profile) return;
    setToast(`Publishing website for ${domain.domain}...`);
    try {
      const res = await fetch('/api/sites/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domain.domain,
          businessName: domain.name,
          description: `Website hosted on ${domain.domain}`,
          ownerName: profile.displayName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not build site.');

      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: updatedRow, error: dbErr } = await supabase
          .from('domains')
          .update({ site_url: data.siteUrl })
          .eq('id', domain.id)
          .select('*')
          .single();
        if (dbErr) throw dbErr;
        if (updatedRow) handleDomainUpdated(mapDomainRow(updatedRow));
      }

      setToast(`Website published for ${domain.domain}!`);
      setTimeout(() => setToast(''), 4000);
      window.open(data.siteUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setToast(err.message || 'Could not publish website.');
      setTimeout(() => setToast(''), 4000);
    }
  };

  const handleSelectSection = (section: PortalSection) => {
    if (section === 'transfer_cloudflare') {
      setCloudflareModalDomain(activeDomainObj);
      return;
    }
    setActiveSection(section);
  };

  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
  };

  if (!authReady || !supabaseReady || !supabaseUser || (profileLoaded && !profile)) {
    return (
      <PortalAuthGate
        supabaseUser={supabaseUser}
        profile={profile}
        authReady={authReady && (!supabaseReady || !supabaseUser || profileLoaded)}
        supabaseReady={supabaseReady}
        onProfileCreated={(created) => setProfile(created)}
      />
    );
  }

  if (!profile) {
    return (
      <PortalAuthGate
        supabaseUser={supabaseUser}
        profile={null}
        authReady={false}
        supabaseReady={supabaseReady}
        onProfileCreated={() => {}}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col pb-16 md:pb-0">
      <PortalHeader
        profile={profile}
        domains={domains}
        cartCount={orders.length}
        onToggleDrawer={() => setDrawerOpen(true)}
        onNavigate={handleSelectSection}
        onOpenCloudflareConnect={() => setCloudflareModalDomain(activeDomainObj)}
        onSelectDomainForAction={handleSelectDomainAction}
        onSignOut={handleSignOut}
      />

      <PortalDrawer
        isOpen={drawerOpen}
        activeSection={activeSection}
        domainsCount={domains.length}
        onSelectSection={handleSelectSection}
        onClose={() => setDrawerOpen(false)}
      />

      {toast && (
        <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 pt-4">
          <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-xl flex items-center justify-between gap-3 text-xs font-medium">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{toast}</span>
            </span>
            <button
              type="button"
              onClick={() => setToast('')}
              className="text-blue-500 hover:text-blue-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1">
        {(activeSection === 'dashboard' || activeSection === 'services') && (
          <PortalDashboard
            profile={profile}
            domains={domains}
            tickets={tickets}
            onNavigate={handleSelectSection}
            onSelectDomainAction={handleSelectDomainAction}
            onOpenCloudflare={(d) => setCloudflareModalDomain(d || activeDomainObj)}
            onDomainUpdated={handleDomainUpdated}
          />
        )}

        {activeSection === 'my_domains' && (
          <MyDomainsView
            domains={domains}
            onAddNew={() => setActiveSection('register_domain')}
            onOpenCloudflare={(d) => {
              setActiveDomainId(d.id);
              setCloudflareModalDomain(d);
            }}
            onSelectDomainAction={handleSelectDomainAction}
            onNavigate={handleSelectSection}
            onBuildSite={handleBuildSiteQuick}
            onDomainUpdated={handleDomainUpdated}
            onDomainDeleted={handleDomainDeleted}
          />
        )}

        {activeSection === 'manage_domain' && (
          <ManageDomainView
            domains={domains}
            activeDomain={activeDomainObj}
            onSelectDomain={(d) => setActiveDomainId(d.id)}
            onOpenCloudflare={(d) => {
              setActiveDomainId(d.id);
              setCloudflareModalDomain(d);
            }}
            onNavigate={handleSelectSection}
            onBuildSite={handleBuildSiteQuick}
            onDomainUpdated={handleDomainUpdated}
          />
        )}

        {activeSection === 'manage_nameservers' && (
          <ManageNameserversView
            domains={domains}
            activeDomain={activeDomainObj}
            onSelectDomain={(d) => setActiveDomainId(d.id)}
            onOpenCloudflare={(d) => {
              setActiveDomainId(d.id);
              setCloudflareModalDomain(d);
            }}
            onNavigate={handleSelectSection}
            onDomainUpdated={handleDomainUpdated}
            sessionToken={activeDomainObj ? sessionTokensByDomain[activeDomainObj.id] : undefined}
          />
        )}

        {activeSection === 'edit_contact' && (
          <EditContactView
            domains={domains}
            activeDomain={activeDomainObj}
            defaultName={profile.displayName}
            defaultEmail={profile.email}
            onSelectDomain={(d) => setActiveDomainId(d.id)}
            onNavigate={handleSelectSection}
            onDomainUpdated={handleDomainUpdated}
          />
        )}

        {activeSection === 'register_domain' && (
          <SearchView
            onGetDomain={handleGetDomain}
            acquiringDomain={acquiringDomain}
            onNavigate={handleSelectSection}
          />
        )}

        {activeSection === 'manage_dns' && (
          <ManageDnsView
            domains={domains}
            onOpenCloudflare={(d) => {
              setActiveDomainId(d.id);
              setCloudflareModalDomain(d);
            }}
            onSelectDomainAction={handleSelectDomainAction}
            onNavigate={handleSelectSection}
          />
        )}

        {activeSection === 'renewals' && (
          <RenewalsView
            domains={domains}
            onNavigate={handleSelectSection}
            onDomainUpdated={handleDomainUpdated}
          />
        )}

        {activeSection === 'store' && (
          <StoreOrdersView
            orders={orders}
            domains={domains}
            onOpenCloudflare={(d) => {
              setActiveDomainId(d.id);
              setCloudflareModalDomain(d);
            }}
            onSelectDomainAction={handleSelectDomainAction}
            onNavigate={handleSelectSection}
            onOrderDeleted={handleOrderDeleted}
          />
        )}

        {activeSection === 'billing' && (
          <BillingView orders={orders} onNavigate={handleSelectSection} />
        )}

        {activeSection === 'support' && (
          <SupportTicketsView
            profile={profile}
            tickets={tickets}
            onNavigate={handleSelectSection}
            onTicketCreated={handleTicketCreated}
            onTicketUpdated={handleTicketUpdated}
          />
        )}

        {activeSection === 'affiliates' && (
          <AffiliatesView profile={profile} onNavigate={handleSelectSection} />
        )}
      </main>

      {cloudflareModalDomain !== undefined && (
        <CloudflareConnectModal
          domains={domains}
          initialDomain={cloudflareModalDomain}
          sessionTokensByDomain={sessionTokensByDomain}
          onSaveSessionToken={handleSaveSessionToken}
          onOpenNameservers={(d) => handleSelectDomainAction(d, 'manage_nameservers')}
          onDomainUpdated={handleDomainUpdated}
          onClose={() => setCloudflareModalDomain(undefined)}
        />
      )}

      <MobileTabBar
        activeSection={activeSection}
        onNavigate={handleSelectSection}
        domainsCount={domains.length}
        cartCount={orders.length}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <PortalAppContent />
    </ErrorBoundary>
  );
}
