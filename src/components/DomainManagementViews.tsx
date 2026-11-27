import React, { useState, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { DomainRecord, NameserverVerificationResult, PortalSection } from '../types';
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

const DomainSwitcherBar: React.FC<DomainSwitcherBarProps> = ({
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
          Register a free domain first to configure nameservers, contact records, or cloud connections.
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
// 1. MANAGE NAMESERVERS (Supports ANY DNS / Cloud Provider + Live Verification)
// =====================================================================
interface ManageNameserversViewProps {
  domains: DomainRecord[];
  activeDomain: DomainRecord | null;
  onSelectDomain: (domain: DomainRecord) => void;
  onOpenCloudflare: (domain: DomainRecord) => void;
  onNavigate: (sec: PortalSection) => void;
  sessionToken?: string;
}

export const ManageNameserversView: React.FC<ManageNameserversViewProps> = ({
  domains,
  activeDomain,
  onSelectDomain,
  onOpenCloudflare,
  onNavigate,
  sessionToken,
}) => {
  const [mode, setMode] = useState<'default' | 'custom'>('custom');
  const [nsList, setNsList] = useState<string[]>(['', '', '', '', '']);
  const [providerName, setProviderName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [verification, setVerification] = useState<NameserverVerificationResult | null>(null);

  useEffect(() => {
    if (!activeDomain) return;
    const savedMode = activeDomain.nameserverMode || 'custom';
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
        const res = await fetch('/api/dns/verify-nameservers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: activeDomain.domain,
            mode: 'custom',
            nameservers: payloadNs,
            providerName: finalProviderName,
            apiToken: sessionToken || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Could not verify nameservers.');
        }
        verifiedResult = data as NameserverVerificationResult;
        setVerification(verifiedResult);
      }

      const path = `domains/${activeDomain.id}`;
      try {
        const isCf =
          mode === 'custom' &&
          (verifiedResult?.usesCloudflareNs ||
            payloadNs.some((n) => n.endsWith('.ns.cloudflare.com')));
        await updateDoc(doc(db, 'domains', activeDomain.id), {
          nameserverMode: mode,
          nameservers: mode === 'custom' ? payloadNs : [],
          cloudflareAccountLabel:
            verifiedResult?.detectedProvider || finalProviderName,
          status:
            isCf || activeDomain.cloudflareZoneId ? 'cloudflare_connected' : 'active',
          cloudflareStatus:
            verifiedResult?.cloudflareZone?.status ||
            (mode === 'custom' ? 'nameservers_verified' : 'default'),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
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
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Nameservers</h1>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              Point your domain to Cloudflare, Vercel, Netlify, Namecheap, Route 53, Hostinger, or any custom DNS provider. Changes verify in real time and may take up to 24 hours to propagate globally.
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
                      Enter nameservers from any DNS provider — the app identifies the host automatically
                    </span>
                  </div>
                </label>

                <div className={`space-y-3.5 pt-1 ${mode === 'default' ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div>
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <label className="block text-sm font-medium text-slate-700">
                        Provider / Account Name
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
                      placeholder="e.g. Vercel Production, Namecheap, Cloudflare Account, Custom VPS"
                      className="w-full bg-slate-50 focus:bg-white border border-slate-300 focus:border-blue-600 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                    />
                  </div>

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
                            ? 'e.g. ns1.vercel-dns.com or courtney.ns.cloudflare.com'
                            : idx === 1
                              ? 'e.g. ns2.vercel-dns.com or dion.ns.cloudflare.com'
                              : ''
                        }
                        className="w-full bg-white border border-slate-300 focus:border-blue-600 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
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
}

export const ManageDomainView: React.FC<ManageDomainViewProps> = ({
  domains,
  activeDomain,
  onSelectDomain,
  onOpenCloudflare,
  onNavigate,
  onBuildSite,
}) => {
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [notice, setNotice] = useState('');

  const handleToggleLock = async () => {
    if (!activeDomain) return;
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'domains', activeDomain.id), {
        registrarLock: !(activeDomain.registrarLock ?? true),
        updatedAt: serverTimestamp(),
      });
      setNotice('Registrar lock updated.');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `domains/${activeDomain.id}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleAutoRenew = async () => {
    if (!activeDomain) return;
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'domains', activeDomain.id), {
        autoRenew: !activeDomain.autoRenew,
        updatedAt: serverTimestamp(),
      });
      setNotice('Auto-renewal preference updated.');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `domains/${activeDomain.id}`);
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
        <span className="text-blue-600 font-medium">Manage Domain</span>
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
}

export const EditContactView: React.FC<EditContactViewProps> = ({
  domains,
  activeDomain,
  defaultName,
  defaultEmail,
  onSelectDomain,
  onNavigate,
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
    setSaving(true);
    setSaved(false);
    try {
      await updateDoc(doc(db, 'domains', activeDomain.id), {
        contactName: contactName.trim().slice(0, 120),
        contactOrg: contactOrg.trim().slice(0, 120),
        contactEmail: contactEmail.trim().slice(0, 200),
        contactPhone: contactPhone.trim().slice(0, 40),
        contactCountry: contactCountry.trim().slice(0, 80),
        updatedAt: serverTimestamp(),
      });
      setSaved(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `domains/${activeDomain.id}`);
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
              Back to Domain Overview
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
