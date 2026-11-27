import React, { useState, useEffect } from 'react';
import { getSupabaseClient, mapDomainRow } from '../supabase';
import { verifyNameserversRealTime } from '../utils/api';
import {
  DomainRecord,
  NameserverVerificationResult,
  PortalSection,
  PrivateNameserverEntry,
} from '../types';
import { DnsRecordsEditor } from './DnsRecordsEditor';
import {
  Cloud,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  Shield,
  RefreshCw,
  Globe,
  UserCheck,
  Server,
  Sparkles,
  Loader2,
  ArrowRight,
  LayoutGrid,
  CornerUpRight,
  Lock,
  Layers,
  KeyRound,
  FileCode2,
  Plus,
  Trash2,
} from 'lucide-react';

function guessProviderClient(nsList: string[]): string {
  const first = nsList.find((n) => n.trim().length > 0)?.trim().toLowerCase() || '';
  if (!first) return '';
  if (first.includes('cloudflare')) return 'Cloudflare DNS';
  if (first.includes('vercel')) return 'Vercel DNS';
  if (first.includes('nsone') || first.includes('netlify')) return 'Netlify / NS1 DNS';
  if (first.includes('digitalocean')) return 'DigitalOcean DNS';
  if (first.includes('awsdns')) return 'Amazon Route 53';
  if (first.includes('googledomains') || first.includes('.ns.google.')) return 'Google Cloud DNS';
  if (first.includes('registrar-servers') || first.includes('namecheap')) return 'Namecheap DNS';
  if (first.includes('domaincontrol') || first.includes('godaddy')) return 'GoDaddy DNS';
  if (first.includes('dns-parking') || first.includes('hostinger')) return 'Hostinger DNS';
  if (first.includes('hetzner')) return 'Hetzner DNS';
  if (first.includes('linode') || first.includes('akam.net')) return 'Akamai / Linode DNS';
  if (first.includes('bunny.net')) return 'Bunny DNS';
  if (first.includes('desec')) return 'deSEC DNS';
  if (first.includes('openhost.world')) return 'OpenHost Managed DNS';
  const parts = first.split('.').filter(Boolean);
  if (parts.length >= 2) return `Custom DNS (${parts.slice(-2).join('.')})`;
  return 'Custom DNS';
}

interface DomainSwitcherBarProps {
  domains: DomainRecord[];
  activeDomain: DomainRecord | null;
  onSelectDomain: (domain: DomainRecord) => void;
  onNavigate: (sec: PortalSection) => void;
}

export const DomainSwitcherBar: React.FC<DomainSwitcherBarProps> = ({
  domains,
  activeDomain,
  onSelectDomain,
  onNavigate,
}) => {
  if (domains.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
        <Globe className="w-9 h-9 text-slate-300 mx-auto" />
        <p className="text-sm font-semibold text-slate-900">No domains in your account yet</p>
        <p className="text-xs text-slate-500">
          Register a free domain first to configure nameservers, DNS records, contact details, or cloud connections.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('register_domain')}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
        >
          Register a New Domain
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <Globe className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="text-xs font-semibold text-slate-600 shrink-0">Active Domain:</span>
        <select
          value={activeDomain?.id || ''}
          onChange={(e) => {
            const match = domains.find((d) => d.id === e.target.value);
            if (match) onSelectDomain(match);
          }}
          className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-sm font-semibold text-blue-600 focus:outline-none focus:border-blue-600 cursor-pointer max-w-full"
        >
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.domain}
              {d.cloudflareAccountLabel ? ` (${d.cloudflareAccountLabel})` : ''}
            </option>
          ))}
        </select>
      </div>

      {activeDomain && (
        <a
          href={activeDomain.siteUrl || `https://${activeDomain.domain}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-blue-600 hover:underline inline-flex items-center gap-1 shrink-0"
        >
          <span>https://{activeDomain.domain}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
};

// =====================================================================
// SHARED DOMAIN "Manage" NAVIGATION MENU (Matches Client Area Branches)
// =====================================================================
interface DomainManageMenuProps {
  activeSection: PortalSection;
  activeDomain: DomainRecord | null;
  onNavigate: (sec: PortalSection) => void;
}

export const DomainManageMenu: React.FC<DomainManageMenuProps> = ({
  activeSection,
  activeDomain,
  onNavigate,
}) => {
  const items: {
    id: PortalSection;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }[] = [
    { id: 'manage_domain', label: 'Overview', icon: <LayoutGrid className="w-4 h-4" /> },
    {
      id: 'renewals',
      label: 'Auto Renew',
      icon: <RefreshCw className="w-4 h-4" />,
      badge: activeDomain ? (activeDomain.autoRenew ? 'ON' : 'OFF') : undefined,
    },
    { id: 'manage_nameservers', label: 'Nameservers', icon: <CornerUpRight className="w-4 h-4" /> },
    { id: 'manage_dns', label: 'DNS Records', icon: <FileCode2 className="w-4 h-4" /> },
    {
      id: 'registrar_lock',
      label: 'Registrar Lock',
      icon: <Lock className="w-4 h-4" />,
      badge: activeDomain ? ((activeDomain.registrarLock ?? true) ? 'Locked' : 'Unlocked') : undefined,
    },
    { id: 'domain_addons', label: 'Addons', icon: <Layers className="w-4 h-4" /> },
    { id: 'edit_contact', label: 'Contact Information', icon: <UserCheck className="w-4 h-4" /> },
    { id: 'private_nameservers', label: 'Private Nameservers', icon: <Server className="w-4 h-4" /> },
    { id: 'epp_code', label: 'Get EPP Code', icon: <KeyRound className="w-4 h-4" /> },
  ];

  return (
    <section className="pt-2 space-y-2.5">
      <h2 className="text-xl font-bold text-slate-900">Manage</h2>
      <div className="bg-white border border-slate-200 rounded-2xl p-2 space-y-1">
        {items.map((item) => {
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`w-full px-3.5 py-2.5 rounded-xl text-left text-sm flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                active
                  ? 'bg-slate-100 text-blue-600 font-semibold'
                  : 'text-blue-600 hover:bg-slate-50 font-medium'
              }`}
            >
              <span className="flex items-center gap-3">
                <span className={active ? 'text-blue-600' : 'text-blue-600'}>{item.icon}</span>
                <span>{item.label}</span>
              </span>
              {item.badge && (
                <span className="text-[11px] font-semibold text-slate-500">{item.badge}</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};

// =====================================================================
// 1. MANAGE NAMESERVERS (Clean Toggle + Any DNS Provider + Live Verify)
// =====================================================================
interface ManageNameserversViewProps {
  domains: DomainRecord[];
  activeDomain: DomainRecord | null;
  onSelectDomain: (domain: DomainRecord) => void;
  onOpenCloudflare: (domain: DomainRecord) => void;
  onNavigate: (sec: PortalSection) => void;
  onDomainUpdated: (domain: DomainRecord) => void;
  sessionToken?: string;
}

export const ManageNameserversView: React.FC<ManageNameserversViewProps> = ({
  domains,
  activeDomain,
  onSelectDomain,
  onOpenCloudflare,
  onNavigate,
  onDomainUpdated,
  sessionToken,
}) => {
  const [mode, setMode] = useState<'default' | 'custom'>('default');
  const [nsList, setNsList] = useState<string[]>(['', '', '', '', '']);
  const [providerName, setProviderName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [verification, setVerification] = useState<NameserverVerificationResult | null>(null);

  useEffect(() => {
    if (!activeDomain) return;
    const savedMode =
      activeDomain.nameserverMode ||
      (activeDomain.nameservers && activeDomain.nameservers.length > 0 ? 'custom' : 'default');
    setMode(savedMode);
    const existing =
      activeDomain.nameservers && activeDomain.nameservers.length > 0
        ? activeDomain.nameservers
        : activeDomain.cloudflareNameservers || [];
    setNsList([
      existing[0] || '',
      existing[1] || '',
      existing[2] || '',
      existing[3] || '',
      existing[4] || '',
    ]);
    setProviderName(activeDomain.cloudflareAccountLabel || guessProviderClient(existing));
    setVerification(null);
    setError('');
  }, [activeDomain?.id]);

  const handleUpdateNs = (idx: number, val: string) => {
    const updated = nsList.map((item, i) => (i === idx ? val : item));
    setNsList(updated);
    const detected = guessProviderClient(updated);
    if (detected && (!providerName.trim() || providerName.includes('DNS') || providerName.includes('Route 53'))) {
      setProviderName(detected);
    }
  };

  const handleConfirmNameservers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDomain) return;

    setError('');
    setVerification(null);
    setSaving(true);

    const payloadNs =
      mode === 'default'
        ? ['ns1.openhost.world', 'ns2.openhost.world']
        : nsList.map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 5);

    const finalProviderName =
      mode === 'default'
        ? 'OpenHost Managed DNS'
        : (providerName.trim() || guessProviderClient(payloadNs) || 'Custom DNS Provider').slice(0, 120);

    try {
      let verifiedResult: NameserverVerificationResult | null = null;

      if (mode === 'custom') {
        verifiedResult = await verifyNameserversRealTime({
          domain: activeDomain.domain,
          mode: 'custom',
          nameservers: payloadNs,
          providerName: finalProviderName,
          apiToken: sessionToken || undefined,
        });
        setVerification(verifiedResult);
      }

      const isCf =
        mode === 'custom' &&
        (verifiedResult?.usesCloudflareNs ||
          payloadNs.some((n) => n.endsWith('.ns.cloudflare.com')));
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: updatedRow, error: dbErr } = await supabase
          .from('domains')
          .update({
            nameserver_mode: mode,
            nameservers: mode === 'custom' ? payloadNs : [],
            cloudflare_account_label: verifiedResult?.detectedProvider || finalProviderName,
            status: isCf || activeDomain.cloudflareZoneId ? 'cloudflare_connected' : 'active',
            cloudflare_status:
              verifiedResult?.cloudflareZone?.status ||
              (mode === 'custom' ? 'nameservers_verified' : 'default'),
          })
          .eq('id', activeDomain.id)
          .select('*')
          .single();

        if (dbErr) throw dbErr;
        if (updatedRow) onDomainUpdated(mapDomainRow(updatedRow));
      }

      if (mode === 'default') {
        setVerification({
          verified: true,
          domain: activeDomain.domain,
          mode: 'default',
          nameservers: ['ns1.openhost.world', 'ns2.openhost.world'],
          nsChecks: [],
          detectedProvider: 'OpenHost Managed DNS',
          liveDomainNs: [],
          liveMatched: false,
          usesCloudflareNs: false,
          checkedAt: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      setError(err.message || 'Could not update nameservers.');
    } finally {
      setSaving(false);
    }
  };

  const detectedPreview = guessProviderClient(nsList);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
          Portal Home
        </button>
        <span>/</span>
        <button type="button" onClick={() => onNavigate('my_domains')} className="hover:text-blue-600 cursor-pointer">
          My Domains
        </button>
        <span>/</span>
        <span className="text-blue-600 font-medium">Nameservers</span>
      </div>

      <DomainSwitcherBar
        domains={domains}
        activeDomain={activeDomain}
        onSelectDomain={onSelectDomain}
        onNavigate={onNavigate}
      />

      {activeDomain && (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Nameservers</h1>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              You can change where your domain points to here. Please be aware changes can take up to 24 hours to propagate.
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {verification && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    {verification.detectedProvider} verified and saved for {verification.domain}
                  </span>
                </span>
                {verification.usesCloudflareNs && (
                  <button
                    type="button"
                    onClick={() => onOpenCloudflare(activeDomain)}
                    className="text-blue-700 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Manage Zone & API Key</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {verification.nsChecks.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {verification.nsChecks.map((ns) => (
                    <div
                      key={ns.nameserver}
                      className="bg-white border border-emerald-200/80 rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <span className="font-medium text-slate-900 truncate">{ns.nameserver}</span>
                      <span className="text-[11px] font-semibold text-emerald-700 shrink-0">
                        Live ({ns.ips[0] || 'Reachable'})
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {verification.cloudflareZone && (
                <div className="text-emerald-800 font-medium pt-1">
                  Zone status: <strong>{verification.cloudflareZone.status}</strong> (
                  {verification.cloudflareZone.accountLabel})
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleConfirmNameservers} className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-200">
              <label className="flex items-center gap-3.5 p-5 cursor-pointer hover:bg-slate-50/70 transition-colors">
                <input
                  type="radio"
                  name="nsMode"
                  checked={mode === 'default'}
                  onChange={() => setMode('default')}
                  className="w-4 h-4 text-blue-600 accent-blue-600 cursor-pointer"
                />
                <div>
                  <span className="text-sm font-semibold text-slate-900 block">
                    Use default nameservers
                  </span>
                  <span className="text-xs text-slate-500">
                    Manage {activeDomain.domain} with OpenHost default DNS servers
                  </span>
                </div>
              </label>

              <div className="p-5 space-y-4">
                <label className="flex items-center gap-3.5 cursor-pointer">
                  <input
                    type="radio"
                    name="nsMode"
                    checked={mode === 'custom'}
                    onChange={() => setMode('custom')}
                    className="w-4 h-4 text-blue-600 accent-blue-600 cursor-pointer"
                  />
                  <div>
                    <span className="text-sm font-semibold text-slate-900 block">
                      Use custom nameservers (enter below)
                    </span>
                    <span className="text-xs text-slate-500">
                      Enter nameservers from Cloudflare, Vercel, Netlify, or any DNS host
                    </span>
                  </div>
                </label>

                {mode === 'custom' && (
                  <div className="space-y-3.5 pt-2">
                    {[0, 1, 2, 3, 4].map((idx) => (
                      <div key={idx}>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Nameserver {idx + 1}
                        </label>
                        <input
                          type="text"
                          value={nsList[idx] || ''}
                          onChange={(e) => handleUpdateNs(idx, e.target.value)}
                          placeholder={
                            idx === 0
                              ? 'e.g. courtney.ns.cloudflare.com or ns1.vercel-dns.com'
                              : idx === 1
                                ? 'e.g. dion.ns.cloudflare.com or ns2.vercel-dns.com'
                                : ''
                          }
                          className="w-full bg-white border border-slate-300 focus:border-blue-600 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                        />
                      </div>
                    ))}

                    <div className="pt-1">
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <label className="block text-xs font-medium text-slate-600">
                          Provider / Account Label (Optional)
                        </label>
                        {detectedPreview && (
                          <span className="text-xs font-medium text-blue-600">
                            Auto-detected: {detectedPreview}
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        maxLength={120}
                        value={providerName}
                        onChange={(e) => setProviderName(e.target.value)}
                        placeholder="Auto-detected from nameserver or type your label..."
                        className="w-full bg-slate-50 focus:bg-white border border-slate-300 focus:border-blue-600 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{saving ? 'Verifying & Saving...' : 'Change Nameservers'}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenCloudflare(activeDomain)}
                className="px-5 py-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-semibold text-sm rounded-xl transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                <Cloud className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span>Connect API / Zone</span>
              </button>
            </div>
          </form>

          <DomainManageMenu
            activeSection="manage_nameservers"
            activeDomain={activeDomain}
            onNavigate={onNavigate}
          />

          <DnsRecordsEditor domain={activeDomain} sessionToken={sessionToken} compact />
        </div>
      )}
    </div>
  );
};

// =====================================================================
// 2. MANAGE DOMAIN OVERVIEW
// =====================================================================
interface ManageDomainViewProps {
  domains: DomainRecord[];
  activeDomain: DomainRecord | null;
  onSelectDomain: (domain: DomainRecord) => void;
  onOpenCloudflare: (domain: DomainRecord) => void;
  onNavigate: (sec: PortalSection) => void;
  onBuildSite: (domain: DomainRecord) => void;
  onDomainUpdated: (domain: DomainRecord) => void;
  sessionToken?: string;
}

export const ManageDomainView: React.FC<ManageDomainViewProps> = ({
  domains,
  activeDomain,
  onSelectDomain,
  onOpenCloudflare,
  onNavigate,
  onBuildSite,
  onDomainUpdated,
  sessionToken,
}) => {
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [notice, setNotice] = useState('');

  const handleToggleLock = async () => {
    if (!activeDomain) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setUpdating(true);
    try {
      const { data, error } = await supabase
        .from('domains')
        .update({ registrar_lock: !(activeDomain.registrarLock ?? true) })
        .eq('id', activeDomain.id)
        .select('*')
        .single();
      if (error) throw error;
      if (data) onDomainUpdated(mapDomainRow(data));
      setNotice('Registrar lock updated.');
      setTimeout(() => setNotice(''), 3000);
    } catch (err: any) {
      setNotice(err.message || 'Could not update registrar lock.');
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleAutoRenew = async () => {
    if (!activeDomain) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setUpdating(true);
    try {
      const { data, error } = await supabase
        .from('domains')
        .update({ auto_renew: !activeDomain.autoRenew })
        .eq('id', activeDomain.id)
        .select('*')
        .single();
      if (error) throw error;
      if (data) onDomainUpdated(mapDomainRow(data));
      setNotice('Auto-renewal preference updated.');
      setTimeout(() => setNotice(''), 3000);
    } catch (err: any) {
      setNotice(err.message || 'Could not update auto-renewal preference.');
    } finally {
      setUpdating(false);
    }
  };

  const handleCopyDomain = () => {
    if (!activeDomain) return;
    navigator.clipboard.writeText(`https://${activeDomain.domain}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
          Portal Home
        </button>
        <span>/</span>
        <button type="button" onClick={() => onNavigate('my_domains')} className="hover:text-blue-600 cursor-pointer">
          My Domains
        </button>
        <span>/</span>
        <span className="text-blue-600 font-medium">Overview</span>
      </div>

      <DomainSwitcherBar
        domains={domains}
        activeDomain={activeDomain}
        onSelectDomain={onSelectDomain}
        onNavigate={onNavigate}
      />

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{notice}</span>
        </div>
      )}

      {activeDomain && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {activeDomain.providerLabel}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={activeDomain.siteUrl || `https://${activeDomain.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xl sm:text-2xl font-extrabold text-blue-600 hover:underline inline-flex items-center gap-1.5 break-all"
                >
                  <span>https://{activeDomain.domain}</span>
                  <ExternalLink className="w-4 h-4 shrink-0" />
                </a>
                <button
                  type="button"
                  onClick={handleCopyDomain}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                  title="Copy domain URL"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="text-xs text-slate-500">
                Provider:{' '}
                <strong className="text-emerald-700">
                  {activeDomain.cloudflareAccountLabel ||
                    (activeDomain.nameservers && activeDomain.nameservers.length > 0
                      ? guessProviderClient(activeDomain.nameservers)
                      : 'OpenHost Managed DNS')}
                </strong>
                {activeDomain.expiresAt && ` · Renewal: ${activeDomain.expiresAt}`}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenCloudflare(activeDomain)}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Cloud className="w-4 h-4 fill-white" />
                <span>{activeDomain.cloudflareZoneId ? 'Manage Zone' : 'Connect Provider'}</span>
              </button>
              <button
                type="button"
                onClick={() => onBuildSite(activeDomain)}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{activeDomain.siteUrl ? 'Rebuild Site' : 'Build Free Site'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-2">
                  <Server className="w-4 h-4 text-blue-600" />
                  <span>Nameservers</span>
                </div>
                {activeDomain.nameservers && activeDomain.nameservers.length > 0 ? (
                  <ul className="space-y-1 text-xs text-slate-700">
                    {activeDomain.nameservers.map((ns, i) => (
                      <li key={i} className="font-medium">
                        {i + 1}. {ns}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">
                    Using OpenHost default nameservers. Point to any external DNS provider anytime.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onNavigate('manage_nameservers')}
                className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Manage Nameservers
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-2">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  <span>Registrant Contact</span>
                </div>
                {activeDomain.contactName ? (
                  <div className="text-xs text-slate-600 space-y-0.5">
                    <div className="font-semibold text-slate-900">{activeDomain.contactName}</div>
                    {activeDomain.contactOrg && <div>{activeDomain.contactOrg}</div>}
                    <div>{activeDomain.contactEmail}</div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Add or update WHOIS contact details for {activeDomain.domain}.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onNavigate('edit_contact')}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Edit Contact Information
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 md:col-span-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <Shield className="w-5 h-5 text-emerald-600" />
                  <div>
                    <div className="text-sm font-bold text-slate-900">Registrar Lock</div>
                    <div className="text-xs text-slate-500">
                      Protects your domain against unauthorized transfers
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={updating}
                  onClick={handleToggleLock}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                    (activeDomain.registrarLock ?? true)
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-slate-50 border-slate-300 text-slate-700'
                  }`}
                >
                  {(activeDomain.registrarLock ?? true) ? 'Lock Enabled' : 'Lock Disabled'}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <RefreshCw className="w-5 h-5 text-blue-600" />
                  <div>
                    <div className="text-sm font-bold text-slate-900">Auto Renewal Status</div>
                    <div className="text-xs text-slate-500">
                      Automatically renews for $0.00/year before expiration
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={updating}
                  onClick={handleToggleAutoRenew}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                    activeDomain.autoRenew
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-slate-50 border-slate-300 text-slate-700'
                  }`}
                >
                  {activeDomain.autoRenew ? 'Auto-Renew ON' : 'Auto-Renew OFF'}
                </button>
              </div>
            </div>
          </div>

          <DnsRecordsEditor domain={activeDomain} sessionToken={sessionToken} />

          <DomainManageMenu
            activeSection="manage_domain"
            activeDomain={activeDomain}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  );
};

// =====================================================================
// 3. EDIT CONTACT INFORMATION
// =====================================================================
interface EditContactViewProps {
  domains: DomainRecord[];
  activeDomain: DomainRecord | null;
  defaultName: string;
  defaultEmail: string;
  onSelectDomain: (domain: DomainRecord) => void;
  onNavigate: (sec: PortalSection) => void;
  onDomainUpdated: (domain: DomainRecord) => void;
}

export const EditContactView: React.FC<EditContactViewProps> = ({
  domains,
  activeDomain,
  defaultName,
  defaultEmail,
  onSelectDomain,
  onNavigate,
  onDomainUpdated,
}) => {
  const [contactName, setContactName] = useState(defaultName);
  const [contactOrg, setContactOrg] = useState('');
  const [contactEmail, setContactEmail] = useState(defaultEmail);
  const [contactPhone, setContactPhone] = useState('');
  const [contactCountry, setContactCountry] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!activeDomain) return;
    setContactName(activeDomain.contactName || defaultName);
    setContactOrg(activeDomain.contactOrg || '');
    setContactEmail(activeDomain.contactEmail || defaultEmail);
    setContactPhone(activeDomain.contactPhone || '');
    setContactCountry(activeDomain.contactCountry || '');
    setSaved(false);
  }, [activeDomain?.id]);

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDomain) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true);
    setSaved(false);
    try {
      const { data, error } = await supabase
        .from('domains')
        .update({
          contact_name: contactName.trim().slice(0, 120),
          contact_org: contactOrg.trim().slice(0, 120),
          contact_email: contactEmail.trim().slice(0, 200),
          contact_phone: contactPhone.trim().slice(0, 40),
          contact_country: contactCountry.trim().slice(0, 80),
        })
        .eq('id', activeDomain.id)
        .select('*')
        .single();
      if (error) throw error;
      if (data) onDomainUpdated(mapDomainRow(data));
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
          Portal Home
        </button>
        <span>/</span>
        <button type="button" onClick={() => onNavigate('my_domains')} className="hover:text-blue-600 cursor-pointer">
          My Domains
        </button>
        <span>/</span>
        <span className="text-blue-600 font-medium">Edit Contact Information</span>
      </div>

      <DomainSwitcherBar
        domains={domains}
        activeDomain={activeDomain}
        onSelectDomain={onSelectDomain}
        onNavigate={onNavigate}
      />

      {activeDomain && (
        <>
          <form onSubmit={handleSaveContact} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">Contact Information</h1>
              <p className="text-xs text-slate-500 mt-1">
                Update domain owner contact details for <strong>{activeDomain.domain}</strong>
              </p>
            </div>

            {saved && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Contact information saved.</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Organization / Company</label>
                <input
                  type="text"
                  maxLength={120}
                  value={contactOrg}
                  onChange={(e) => setContactOrg(e.target.value)}
                  placeholder="Optional"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  maxLength={200}
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  maxLength={40}
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+1 555 010 9988"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Country</label>
                <input
                  type="text"
                  maxLength={80}
                  value={contactCountry}
                  onChange={(e) => setContactCountry(e.target.value)}
                  placeholder="e.g. United States, Nigeria, United Kingdom"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('manage_domain')}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Back to Overview
              </button>
            </div>
          </form>

          <DomainManageMenu
            activeSection="edit_contact"
            activeDomain={activeDomain}
            onNavigate={onNavigate}
          />
        </>
      )}
    </div>
  );
};

// =====================================================================
// 4. REGISTRAR LOCK VIEW
// =====================================================================
export const RegistrarLockView: React.FC<{
  domains: DomainRecord[];
  activeDomain: DomainRecord | null;
  onSelectDomain: (domain: DomainRecord) => void;
  onNavigate: (sec: PortalSection) => void;
  onDomainUpdated: (domain: DomainRecord) => void;
}> = ({ domains, activeDomain, onSelectDomain, onNavigate, onDomainUpdated }) => {
  const [updating, setUpdating] = useState(false);
  const [notice, setNotice] = useState('');

  const handleToggleLock = async () => {
    if (!activeDomain) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setUpdating(true);
    setNotice('');
    try {
      const nextVal = !(activeDomain.registrarLock ?? true);
      const { data, error } = await supabase
        .from('domains')
        .update({ registrar_lock: nextVal })
        .eq('id', activeDomain.id)
        .select('*')
        .single();
      if (error) throw error;
      if (data) onDomainUpdated(mapDomainRow(data));
      setNotice(
        nextVal
          ? `Registrar Lock enabled for ${activeDomain.domain}.`
          : `Registrar Lock disabled for ${activeDomain.domain}. Transfers are now permitted.`
      );
    } catch (err: any) {
      setNotice(err.message || 'Could not update registrar lock.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
          Portal Home
        </button>
        <span>/</span>
        <button type="button" onClick={() => onNavigate('my_domains')} className="hover:text-blue-600 cursor-pointer">
          My Domains
        </button>
        <span>/</span>
        <span className="text-blue-600 font-medium">Registrar Lock</span>
      </div>

      <DomainSwitcherBar
        domains={domains}
        activeDomain={activeDomain}
        onSelectDomain={onSelectDomain}
        onNavigate={onNavigate}
      />

      {activeDomain && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Shield className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h1 className="text-xl font-extrabold text-slate-900">Registrar Lock</h1>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Registrar Lock prevents your domain <strong>{activeDomain.domain}</strong> from being transferred away without your permission. Unlock temporarily only when transferring to another registrar.
                </p>
              </div>
            </div>

            {notice && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs text-slate-500">Current Lock Status</div>
                <div
                  className={`text-sm font-bold ${
                    (activeDomain.registrarLock ?? true) ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {(activeDomain.registrarLock ?? true) ? 'Enabled (Transfer Protected)' : 'Disabled (Transfer Allowed)'}
                </div>
              </div>
              <button
                type="button"
                disabled={updating}
                onClick={handleToggleLock}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer ${
                  (activeDomain.registrarLock ?? true)
                    ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {updating
                  ? 'Updating...'
                  : (activeDomain.registrarLock ?? true)
                    ? 'Disable Registrar Lock'
                    : 'Enable Registrar Lock'}
              </button>
            </div>
          </div>

          <DomainManageMenu
            activeSection="registrar_lock"
            activeDomain={activeDomain}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  );
};

// =====================================================================
// 5. DOMAIN ADDONS VIEW
// =====================================================================
export const DomainAddonsView: React.FC<{
  domains: DomainRecord[];
  activeDomain: DomainRecord | null;
  onSelectDomain: (domain: DomainRecord) => void;
  onOpenCloudflare: (domain: DomainRecord) => void;
  onBuildSite: (domain: DomainRecord) => void;
  onNavigate: (sec: PortalSection) => void;
}> = ({ domains, activeDomain, onSelectDomain, onOpenCloudflare, onBuildSite, onNavigate }) => {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
          Portal Home
        </button>
        <span>/</span>
        <button type="button" onClick={() => onNavigate('my_domains')} className="hover:text-blue-600 cursor-pointer">
          My Domains
        </button>
        <span>/</span>
        <span className="text-blue-600 font-medium">Addons</span>
      </div>

      <DomainSwitcherBar
        domains={domains}
        activeDomain={activeDomain}
        onSelectDomain={onSelectDomain}
        onNavigate={onNavigate}
      />

      {activeDomain && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">Domain Addons ($0.00 Free)</h1>
              <p className="text-xs text-slate-600 mt-1">
                Free hosting, Cloudflare CDN, DNS Management, and WHOIS privacy addons for <strong>{activeDomain.domain}</strong>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">DNS Zone Management</span>
                  <span className="text-[11px] font-bold text-emerald-700">Active Free</span>
                </div>
                <p className="text-xs text-slate-600">
                  Manage A, AAAA, CNAME, TXT, MX, SRV, CAA, and all IANA DNS records.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('manage_dns')}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Open DNS Records
                </button>
              </div>

              <div className="p-4 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">Cloudflare Edge & SSL</span>
                  <span className="text-[11px] font-bold text-amber-700">
                    {activeDomain.cloudflareZoneId ? 'Connected' : 'Ready'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Link your Cloudflare account zone, inspect API status, and sync edge SSL.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenCloudflare(activeDomain)}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  {activeDomain.cloudflareZoneId ? 'Manage Cloudflare' : 'Connect Cloudflare'}
                </button>
              </div>

              <div className="p-4 border border-slate-200 rounded-xl space-y-3 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">Free Site Hosting & Builder</span>
                  <span className="text-[11px] font-bold text-indigo-700">
                    {activeDomain.siteUrl ? 'Published Online' : '$0.00 Included'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Generate and host a responsive web page on your domain immediately.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onBuildSite(activeDomain)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    {activeDomain.siteUrl ? 'Rebuild Website' : 'Build Free Website'}
                  </button>
                  {activeDomain.siteUrl && (
                    <a
                      href={activeDomain.siteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg inline-flex items-center gap-1"
                    >
                      <span>Open Site</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DomainManageMenu
            activeSection="domain_addons"
            activeDomain={activeDomain}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  );
};

// =====================================================================
// 6. PRIVATE NAMESERVERS (GLUE RECORDS) VIEW
// =====================================================================
export const PrivateNameserversView: React.FC<{
  domains: DomainRecord[];
  activeDomain: DomainRecord | null;
  onSelectDomain: (domain: DomainRecord) => void;
  onNavigate: (sec: PortalSection) => void;
  onDomainUpdated: (domain: DomainRecord) => void;
}> = ({ domains, activeDomain, onSelectDomain, onNavigate, onDomainUpdated }) => {
  const [prefix, setPrefix] = useState('ns1');
  const [ipAddress, setIpAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const handleRegisterPrivateNs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDomain) return;
    setError('');
    setNotice('');

    const cleanPrefix = prefix.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const cleanIp = ipAddress.trim();
    const ipv4Regex =
      /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

    if (!cleanPrefix) {
      setError('Enter a valid host prefix (e.g. ns1 or ns2).');
      return;
    }
    if (!ipv4Regex.test(cleanIp)) {
      setError('Enter a valid IPv4 address (e.g. 192.0.2.10).');
      return;
    }

    const hostname = `${cleanPrefix}.${activeDomain.domain}`;
    const existing = activeDomain.privateNameservers || [];
    const updatedList: PrivateNameserverEntry[] = [
      ...existing.filter((entry) => entry.hostname !== hostname),
      { hostname, ip: cleanIp },
    ];

    setSaving(true);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase client not initialized.');

      const { data, error: dbErr } = await supabase
        .from('domains')
        .update({ private_nameservers: updatedList })
        .eq('id', activeDomain.id)
        .select('*')
        .single();

      if (dbErr) throw dbErr;
      if (data) onDomainUpdated(mapDomainRow(data));
      setIpAddress('');
      setPrefix(cleanPrefix === 'ns1' ? 'ns2' : 'ns1');
      setNotice(`Registered private nameserver ${hostname} -> ${cleanIp}`);
    } catch (err: any) {
      setError(
        err?.message?.includes('private_nameservers')
          ? 'Run the updated Supabase SQL snippet so private_nameservers column is added on domains.'
          : err?.message || 'Could not register private nameserver.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePrivateNs = async (hostname: string) => {
    if (!activeDomain) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const updatedList = (activeDomain.privateNameservers || []).filter(
      (entry) => entry.hostname !== hostname
    );
    const { data, error: dbErr } = await supabase
      .from('domains')
      .update({ private_nameservers: updatedList })
      .eq('id', activeDomain.id)
      .select('*')
      .single();
    if (!dbErr && data) {
      onDomainUpdated(mapDomainRow(data));
      setNotice(`Removed private nameserver ${hostname}.`);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
          Portal Home
        </button>
        <span>/</span>
        <button type="button" onClick={() => onNavigate('my_domains')} className="hover:text-blue-600 cursor-pointer">
          My Domains
        </button>
        <span>/</span>
        <span className="text-blue-600 font-medium">Private Nameservers</span>
      </div>

      <DomainSwitcherBar
        domains={domains}
        activeDomain={activeDomain}
        onSelectDomain={onSelectDomain}
        onNavigate={onNavigate}
      />

      {activeDomain && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">Private Nameservers</h1>
              <p className="text-xs text-slate-600 mt-1">
                Create and manage child glue nameservers (like <strong>ns1.{activeDomain.domain}</strong>) pointing to your own DNS server IPv4.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {notice && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            <form onSubmit={handleRegisterPrivateNs} className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="sm:col-span-5">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Nameserver Host
                </label>
                <div className="flex items-center bg-white border border-slate-300 rounded-xl overflow-hidden">
                  <input
                    type="text"
                    required
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="ns1"
                    className="w-20 px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none"
                  />
                  <span className="pr-3 text-xs text-slate-500 truncate">.{activeDomain.domain}</span>
                </div>
              </div>

              <div className="sm:col-span-5">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Server IPv4 Address
                </label>
                <input
                  type="text"
                  required
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  placeholder="e.g. 192.0.2.10"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2 flex items-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Save</span>
                </button>
              </div>
            </form>

            {(activeDomain.privateNameservers || []).length > 0 && (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-200">
                {(activeDomain.privateNameservers || []).map((entry) => (
                  <div
                    key={entry.hostname}
                    className="p-3.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{entry.hostname}</div>
                      <div className="text-slate-500 font-mono">{entry.ip}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeletePrivateNs(entry.hostname)}
                      className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DomainManageMenu
            activeSection="private_nameservers"
            activeDomain={activeDomain}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  );
};

// =====================================================================
// 7. GET EPP / TRANSFER AUTHORIZATION CODE VIEW
// =====================================================================
function generateCryptoEppCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#';
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  let out = 'OH-';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export const EppCodeView: React.FC<{
  domains: DomainRecord[];
  activeDomain: DomainRecord | null;
  onSelectDomain: (domain: DomainRecord) => void;
  onNavigate: (sec: PortalSection) => void;
  onDomainUpdated: (domain: DomainRecord) => void;
}> = ({ domains, activeDomain, onSelectDomain, onNavigate, onDomainUpdated }) => {
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleGenerateEpp = async () => {
    if (!activeDomain) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setGenerating(true);
    setError('');
    try {
      const code = generateCryptoEppCode();
      const { data, error: dbErr } = await supabase
        .from('domains')
        .update({ epp_code: code })
        .eq('id', activeDomain.id)
        .select('*')
        .single();
      if (dbErr) throw dbErr;
      if (data) onDomainUpdated(mapDomainRow(data));
    } catch (err: any) {
      setError(
        err?.message?.includes('epp_code')
          ? 'Run the updated Supabase SQL snippet so epp_code column is added on domains.'
          : err?.message || 'Could not generate EPP authorization code.'
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
          Portal Home
        </button>
        <span>/</span>
        <button type="button" onClick={() => onNavigate('my_domains')} className="hover:text-blue-600 cursor-pointer">
          My Domains
        </button>
        <span>/</span>
        <span className="text-blue-600 font-medium">Get EPP Code</span>
      </div>

      <DomainSwitcherBar
        domains={domains}
        activeDomain={activeDomain}
        onSelectDomain={onSelectDomain}
        onNavigate={onNavigate}
      />

      {activeDomain && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <KeyRound className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h1 className="text-xl font-extrabold text-slate-900">Get EPP Authorization Code</h1>
                <p className="text-xs text-slate-600 mt-1">
                  Your EPP / Auth code authorizes transferring <strong>{activeDomain.domain}</strong> to another registrar.
                </p>
              </div>
            </div>

            {(activeDomain.registrarLock ?? true) && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span>
                  Registrar Lock is currently <strong>Enabled</strong>. Unlock before initiating a registrar transfer.
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('registrar_lock')}
                  className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 font-semibold rounded-lg cursor-pointer shrink-0"
                >
                  Open Registrar Lock
                </button>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
                {error}
              </div>
            )}

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              {activeDomain.eppCode ? (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-mono text-base font-bold text-slate-900 bg-white border border-slate-300 px-4 py-2 rounded-xl select-all">
                    {activeDomain.eppCode}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(activeDomain.eppCode || '');
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="px-4 py-2 bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy Code'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={generating}
                      onClick={handleGenerateEpp}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      {generating ? 'Generating...' : 'Regenerate'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={generating}
                  onClick={handleGenerateEpp}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 cursor-pointer"
                >
                  {generating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Generate EPP Authorization Code</span>
                </button>
              )}
            </div>
          </div>

          <DomainManageMenu
            activeSection="epp_code"
            activeDomain={activeDomain}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  );
};
