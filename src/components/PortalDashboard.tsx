import React, { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { DomainRecord, PortalSection, SupportTicket, UserProfile } from '../types';
import {
  Server,
  Globe,
  Cloud,
  MessageSquare,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react';

interface PortalDashboardProps {
  profile: UserProfile;
  domains: DomainRecord[];
  tickets: SupportTicket[];
  onNavigate: (section: PortalSection) => void;
  onSelectDomainAction: (domain: DomainRecord, section: PortalSection) => void;
  onOpenCloudflare: (domain?: DomainRecord) => void;
}

export const PortalDashboard: React.FC<PortalDashboardProps> = ({
  profile,
  domains,
  tickets,
  onNavigate,
  onSelectDomainAction,
  onOpenCloudflare,
}) => {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [selectedDomainId, setSelectedDomainId] = useState(domains[0]?.id || '');
  const [businessName, setBusinessName] = useState(profile.displayName || '');
  const [description, setDescription] = useState('');
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState('');

  const activeSites = domains.filter((d) => Boolean(d.siteUrl));
  const cfConnectedCount = domains.filter(
    (d) => Boolean(d.cloudflareZoneId || (d.nameservers && d.nameservers.length > 0))
  ).length;
  const openTicketsCount = tickets.filter((t) => t.status !== 'closed').length;

  const handleBuildFreeWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = domains.find((d) => d.id === selectedDomainId) || domains[0];
    if (!target) {
      onNavigate('register_domain');
      return;
    }

    setBuilding(true);
    setBuildError('');
    try {
      const res = await fetch('/api/sites/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: target.domain,
          businessName: businessName.trim() || target.name,
          description: description.trim() || 'Modern mobile-ready website with free SSL.',
          ownerName: profile.displayName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not build website.');

      const path = `domains/${target.id}`;
      try {
        await updateDoc(doc(db, 'domains', target.id), {
          siteUrl: data.siteUrl,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }

      setBuilderOpen(false);
      window.open(data.siteUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      setBuildError(err.message || 'Website generation failed.');
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <span>Portal Home</span>
        <span>/</span>
        <span className="text-blue-600 font-medium">Client Area</span>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('services')}
          className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between hover:border-blue-300 transition-colors text-left cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-slate-400 shrink-0" />
            <span className="text-sm font-medium text-slate-700">Services</span>
          </div>
          <span className="text-2xl font-light tabular-nums text-blue-600">
            {activeSites.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('my_domains')}
          className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between hover:border-blue-300 transition-colors text-left cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-slate-400 shrink-0" />
            <span className="text-sm font-medium text-slate-700">Domains</span>
          </div>
          <span className="text-2xl font-light tabular-nums text-blue-600">
            {domains.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (domains[0]) onSelectDomainAction(domains[0], 'manage_nameservers');
            else onOpenCloudflare();
          }}
          className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between hover:border-amber-300 transition-colors text-left cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Cloud className="w-5 h-5 text-amber-500 shrink-0" />
            <span className="text-sm font-medium text-slate-700">Cloudflare</span>
          </div>
          <span className="text-2xl font-light tabular-nums text-blue-600">
            {cfConnectedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('support')}
          className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between hover:border-blue-300 transition-colors text-left cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-slate-400 shrink-0" />
            <span className="text-sm font-medium text-slate-700">Tickets</span>
          </div>
          <span className="text-2xl font-light tabular-nums text-blue-600">
            {openTicketsCount}
          </span>
        </button>
      </div>

      {/* Quick Action Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Domains & Cloudflare Nameservers
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Register free domains, set custom Cloudflare nameservers, or connect separate Cloudflare accounts per domain.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('register_domain')}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Find a Domain
          </button>
          <button
            type="button"
            onClick={() => onOpenCloudflare(domains[0])}
            className="px-4 py-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Cloud className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span>Connect Cloudflare</span>
          </button>
        </div>
      </div>

      {/* My websites section */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">My websites</h2>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          <div className="max-w-2xl space-y-4">
            <p className="text-xs font-bold tracking-wider uppercase text-blue-600">
              Your website, in minutes
            </p>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight text-balance">
              Launch a beautiful website before lunch.
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Answer a few quick questions and our builder publishes a mobile-ready, high-converting website for your domain at zero cost.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs font-medium text-slate-700">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>AI-written copy</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Mobile-ready</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>SEO-optimised</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Free SSL</span>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  if (domains.length === 0) {
                    onNavigate('register_domain');
                  } else {
                    setSelectedDomainId(domains[0].id);
                    setBuilderOpen(true);
                  }
                }}
                className="px-6 py-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 font-semibold text-sm rounded-xl transition-colors cursor-pointer"
              >
                Build my website — it's free
              </button>

              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <Clock className="w-3.5 h-3.5" />
                <span>Ready in ~5 minutes</span>
              </span>
            </div>
          </div>

          {activeSites.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">
              <div className="text-xs font-bold text-slate-700">Live Published Websites</div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {activeSites.map((d) => (
                  <div
                    key={d.id}
                    className="p-3.5 flex items-center justify-between gap-4 text-xs"
                  >
                    <div className="min-w-0">
                      <a
                        href={d.siteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-800"
                      >
                        https://{d.domain}
                      </a>
                      <span className="text-slate-400 mx-2">·</span>
                      <span className="text-slate-500">{d.providerLabel}</span>
                    </div>
                    <a
                      href={d.siteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg inline-flex items-center gap-1 shrink-0"
                    >
                      <span>Open Site</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {builderOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 p-6 shadow-xl relative">
            <button
              type="button"
              onClick={() => setBuilderOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Build Free Website</h3>
            <p className="text-xs text-slate-500 mb-5">
              Choose a domain and describe your project to publish a live website right away.
            </p>

            {buildError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
                {buildError}
              </div>
            )}

            <form onSubmit={handleBuildFreeWebsite} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Domain</label>
                <select
                  value={selectedDomainId}
                  onChange={(e) => setSelectedDomainId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
                >
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.domain}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Business / App Name</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Site Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Describe your product, store, or portfolio..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBuilderOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={building}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-2 cursor-pointer"
                >
                  {building && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{building ? 'Publishing Site...' : 'Publish Website'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
