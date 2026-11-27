import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  updateDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
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
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
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

  // Firebase Auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setProfile(null);
        setProfileLoaded(false);
        setDomains([]);
        setOrders([]);
        setTickets([]);
        setSessionTokensByDomain({});
      }
    });
    return () => unsub();
  }, []);

  // Firestore real-time listeners (strictly attached only when authenticated)
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    const userPath = `users/${firebaseUser.uid}`;
    const unsubProfile = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        } else {
          setProfile(null);
        }
        setProfileLoaded(true);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, userPath);
      }
    );

    const domainsQuery = query(
      collection(db, 'domains'),
      where('userId', '==', firebaseUser.uid)
    );
    const unsubDomains = onSnapshot(
      domainsQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as DomainRecord);
        setDomains(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'domains');
      }
    );

    const ordersQuery = query(
      collection(db, 'orders'),
      where('userId', '==', firebaseUser.uid)
    );
    const unsubOrders = onSnapshot(
      ordersQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as ShopOrder);
        setOrders(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'orders');
      }
    );

    const ticketsQuery = query(
      collection(db, 'tickets'),
      where('userId', '==', firebaseUser.uid)
    );
    const unsubTickets = onSnapshot(
      ticketsQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as SupportTicket);
        setTickets(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'tickets');
      }
    );

    return () => {
      unsubProfile();
      unsubDomains();
      unsubOrders();
      unsubTickets();
    };
  }, [authReady, firebaseUser]);

  const activeDomainObj = domains.find((d) => d.id === activeDomainId) || domains[0] || null;

  const handleSaveSessionToken = (domainId: string, token: string) => {
    setSessionTokensByDomain((prev) => ({ ...prev, [domainId]: token }));
  };

  const handleSelectDomainAction = (domain: DomainRecord, section: PortalSection) => {
    setActiveDomainId(domain.id);
    setActiveSection(section);
  };

  // Tap "Get Domain" -> Persist atomically in Firestore (/domains + /orders), update Shop, route to My Domains & Cloudflare setup
  const handleGetDomain = async (result: DomainSearchResult) => {
    if (!firebaseUser) return;

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

    const newDomain: DomainRecord = {
      id: domainId,
      userId: firebaseUser.uid,
      domain: result.domain,
      name: result.name,
      tld: result.tld,
      providerLabel: result.providerLabel,
      status: 'active',
      nameserverMode: 'default',
      registrarLock: true,
      expiresAt: nextYear,
      autoRenew: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const newOrder: ShopOrder = {
      id: orderId,
      userId: firebaseUser.uid,
      domain: result.domain,
      amountLabel: '$0.00 Free',
      status: 'completed',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'domains', domainId), newDomain);
      batch.set(doc(db, 'orders', orderId), newOrder);
      await batch.commit();

      setActiveDomainId(domainId);
      setToast(`${result.domain} added to your account! Configure Cloudflare nameservers or connect via API.`);
      setTimeout(() => setToast(''), 5500);
      setActiveSection('my_domains');
      setCloudflareModalDomain({ ...newDomain });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `domains/${domainId}`);
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

      await updateDoc(doc(db, 'domains', domain.id), {
        siteUrl: data.siteUrl,
        updatedAt: serverTimestamp(),
      });
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

  if (!authReady || !firebaseUser || (profileLoaded && !profile)) {
    return (
      <PortalAuthGate
        firebaseUser={firebaseUser}
        profile={profile}
        authReady={authReady && (!firebaseUser || profileLoaded)}
        onProfileCreated={(created) => setProfile(created)}
      />
    );
  }

  if (!profile) {
    return (
      <PortalAuthGate
        firebaseUser={firebaseUser}
        profile={null}
        authReady={false}
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
        onSignOut={() => signOut(auth)}
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
          <RenewalsView domains={domains} onNavigate={handleSelectSection} />
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
