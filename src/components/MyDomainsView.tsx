import React, { useState } from 'react';
import { doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { DomainRecord, PortalSection } from '../types';
import {
  Search,
  Plus,
  Cloud,
  MoreHorizontal,
  ShoppingBag,
  Sparkles,
  ChevronDown,
  Trash2,
  Globe,
  ExternalLink,
  RefreshCw,
  Tag,
  ArrowLeftRight,
  X,
} from 'lucide-react';

interface MyDomainsViewProps {
  domains: DomainRecord[];
  onAddNew: () => void;
  onOpenCloudflare: (domain: DomainRecord) => void;
  onSelectDomainAction: (domain: DomainRecord, section: PortalSection) => void;
  onNavigate: (section: PortalSection) => void;
  onBuildSite: (domain: DomainRecord) => void;
}

export const MyDomainsView: React.FC<MyDomainsViewProps> = ({
  domains,
  onAddNew,
  onOpenCloudflare,
  onSelectDomainAction,
  onNavigate,
  onBuildSite,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewFilter, setViewFilter] = useState<'all' | 'cloudflare' | 'pending'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 10;

  const filtered = domains.filter((d) => {
    const matchesSearch =
      !searchTerm.trim() ||
      d.domain.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.providerLabel.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.cloudflareAccountLabel || '').toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (viewFilter === 'cloudflare') {
      return Boolean(d.cloudflareZoneId || (d.nameservers && d.nameservers.length > 0));
    }
    if (viewFilter === 'pending') {
      return !d.cloudflareZoneId && (!d.nameservers || d.nameservers.length === 0);
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  const activeMenuDomain = domains.find((d) => d.id === openMenuId) || null;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleToggleAutoRenew = async (domain: DomainRecord) => {
    const path = `domains/${domain.id}`;
    try {
      await updateDoc(doc(db, 'domains', domain.id), {
        autoRenew: !domain.autoRenew,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
    setOpenMenuId(null);
  };

  const handleQuickRenew = async (domain: DomainRecord) => {
    const path = `domains/${domain.id}`;
    const baseYear = domain.expiresAt
      ? parseInt(domain.expiresAt.slice(0, 4), 10) || new Date().getFullYear()
      : new Date().getFullYear();
    const nextExpiry = `${baseYear + 1}-12-31`;
    try {
      await updateDoc(doc(db, 'domains', domain.id), {
        expiresAt: nextExpiry,
        updatedAt: serverTimestamp(),
      });
      setOpenMenuId(null);
      onSelectDomainAction(domain, 'manage_domain');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleDeleteDomain = async (domain: DomainRecord) => {
    const path = `domains/${domain.id}`;
    try {
      await deleteDoc(doc(db, 'domains', domain.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
    setOpenMenuId(null);
  };

  const renderMenuItems = (d: DomainRecord) => (
    <>
      <button
        type="button"
        onClick={() => {
          setOpenMenuId(null);
          onSelectDomainAction(d, 'manage_domain');
        }}
        className="w-full text-left px-4 py-3 sm:py-2.5 hover:bg-slate-50 text-slate-800 font-medium cursor-pointer border-b border-slate-100"
      >
        Manage Domain
      </button>
      <button
        type="button"
        onClick={() => {
          setOpenMenuId(null);
          onSelectDomainAction(d, 'manage_nameservers');
        }}
        className="w-full text-left px-4 py-3 sm:py-2.5 hover:bg-slate-50 text-slate-700 cursor-pointer"
      >
        Manage Nameservers
      </button>
      <button
        type="button"
        onClick={() => {
          setOpenMenuId(null);
          onSelectDomainAction(d, 'edit_contact');
        }}
        className="w-full text-left px-4 py-3 sm:py-2.5 hover:bg-slate-50 text-slate-700 cursor-pointer"
      >
        Edit Contact Information
      </button>
      <button
        type="button"
        onClick={() => handleToggleAutoRenew(d)}
        className="w-full text-left px-4 py-3 sm:py-2.5 hover:bg-slate-50 text-slate-700 cursor-pointer flex items-center justify-between"
      >
        <span>Auto Renewal Status</span>
        <span className={`text-xs font-semibold ${d.autoRenew ? 'text-emerald-600' : 'text-slate-400'}`}>
          {d.autoRenew ? 'ON' : 'OFF'}
        </span>
      </button>
      <button
        type="button"
        onClick={() => handleQuickRenew(d)}
        className="w-full text-left px-4 py-3 sm:py-2.5 hover:bg-slate-50 text-slate-700 cursor-pointer"
      >
        Renew
      </button>
      <div className="my-1 border-t border-slate-100" />
      <button
        type="button"
        onClick={() => handleDeleteDomain(d)}
        className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-red-600 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>Remove Domain</span>
      </button>
    </>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">My Domains</h1>

      {/* Search + Add New */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Enter search term..."
            className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600"
          />
        </div>

        <button
          type="button"
          onClick={onAddNew}
          className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New</span>
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
          Portal Home
        </button>
        <span>/</span>
        <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
          Client Area
        </button>
        <span>/</span>
        <span className="text-blue-600 font-medium">My Domains</span>
      </div>

      {/* Domains Table Card */}
      <div className="bg-white border border-slate-200 rounded-2xl">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-600">View</span>
            <div className="relative">
              <select
                value={viewFilter}
                onChange={(e) => setViewFilter(e.target.value as any)}
                className="appearance-none bg-white border border-slate-300 rounded-lg pl-3 pr-8 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 cursor-pointer"
              >
                <option value="all">All Entries</option>
                <option value="cloudflare">Custom DNS & Cloud Connected</option>
                <option value="pending">Default Nameservers</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2 pointer-events-none" />
            </div>
          </div>

          <span className="text-xs text-slate-500">
            {filtered.length} {filtered.length === 1 ? 'domain' : 'domains'}
          </span>
        </div>

        <div className="grid grid-cols-12 items-center px-4 py-3 border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
          <div className="col-span-6 sm:col-span-7 flex items-center gap-3">
            <span className="w-4" />
            <span>Domain</span>
          </div>
          <div className="col-span-6 sm:col-span-5 text-right pr-2">Services</div>
        </div>

        {paged.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <Globe className="w-9 h-9 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-800">No domains in your account yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Tap <strong>Add New</strong> above to find an available domain and connect any DNS provider.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {paged.map((d) => (
              <div
                key={d.id}
                className="px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
              >
                {/* Left: Expand + Checkbox + Clean Clickable Web Link */}
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelectDomainAction(d, 'manage_domain')}
                    aria-label={`Manage ${d.domain}`}
                    className="text-slate-500 hover:text-blue-600 cursor-pointer shrink-0 p-1"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  <input
                    type="checkbox"
                    checked={selectedIds.has(d.id)}
                    onChange={() => toggleSelect(d.id)}
                    aria-label={`Select ${d.domain}`}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 shrink-0 cursor-pointer"
                  />

                  <div className="min-w-0">
                    <a
                      href={d.siteUrl || `https://${d.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-800 inline-flex items-center gap-1 break-all"
                    >
                      <span>https://{d.domain}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>

                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                      <span>{d.providerLabel}</span>
                      <span>·</span>
                      {d.cloudflareZoneId ? (
                        <span className="text-emerald-700 font-medium">
                          {d.cloudflareAccountLabel || d.cloudflareZoneName} · Active
                        </span>
                      ) : d.nameservers && d.nameservers.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => onSelectDomainAction(d, 'manage_nameservers')}
                          className="text-blue-700 hover:underline font-medium cursor-pointer"
                        >
                          {d.cloudflareAccountLabel ? `${d.cloudflareAccountLabel} · ` : ''}
                          {d.nameservers[0]}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectDomainAction(d, 'manage_nameservers')}
                          className="text-amber-700 hover:underline font-medium cursor-pointer"
                        >
                          Set Nameservers
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: ... Options + Cloud Button + Site + eShop */}
                <div className="flex items-center justify-end gap-2.5 shrink-0 relative">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(openMenuId === d.id ? null : d.id)}
                      aria-label="Domain options"
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-xl cursor-pointer"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>

                    {/* Desktop/Tablet Popover (>= sm) */}
                    {openMenuId === d.id && (
                      <div className="hidden sm:block absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-40 text-sm">
                        {renderMenuItems(d)}
                      </div>
                    )}
                  </div>

                  {/* Cloud / DNS Connect Button */}
                  <button
                    type="button"
                    onClick={() => onOpenCloudflare(d)}
                    title="Connect Cloud / DNS Provider"
                    className="w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  >
                    <Cloud className="w-5 h-5 fill-white" />
                  </button>

                  {/* Site & eShop stacked buttons */}
                  <div className="flex flex-col gap-1.5">
                    {d.siteUrl ? (
                      <a
                        href={d.siteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Site</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onBuildSite(d)}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Site</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onNavigate('store')}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-indigo-300 text-indigo-600 text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <ShoppingBag className="w-3 h-3" />
                      <span>eShop</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>Show</span>
            <span className="px-2.5 py-1 border border-slate-300 rounded-lg tabular-nums">10</span>
            <span>entries</span>
          </div>

          <div className="inline-flex items-center border border-slate-300 rounded-lg overflow-hidden">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50 border-r border-slate-300 cursor-pointer"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 bg-blue-50 text-blue-600 font-semibold tabular-nums">
              {page}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50 border-l border-slate-300 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Floating Action Sheet (< sm) - Never clips off screen edges */}
      {activeMenuDomain && (
        <div className="sm:hidden">
          <div
            className="fixed inset-0 z-40 bg-slate-900/35 backdrop-blur-[1px]"
            onClick={() => setOpenMenuId(null)}
          />
          <div className="fixed inset-x-4 bottom-20 z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden text-sm">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-900 truncate">{activeMenuDomain.domain}</span>
              <button
                type="button"
                onClick={() => setOpenMenuId(null)}
                aria-label="Close options"
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>{renderMenuItems(activeMenuDomain)}</div>
          </div>
        </div>
      )}

      {/* Actions Section */}
      <section className="pt-2 space-y-3">
        <h2 className="text-xl font-bold text-slate-800">Actions</h2>
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          <button
            type="button"
            onClick={() => onNavigate('renewals')}
            className="w-full px-5 py-3.5 text-left text-sm font-medium text-blue-600 hover:bg-slate-50 flex items-center gap-3 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Renew Domains</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('register_domain')}
            className="w-full px-5 py-3.5 text-left text-sm font-medium text-blue-600 hover:bg-slate-50 flex items-center gap-3 cursor-pointer"
          >
            <Tag className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Register a New Domain</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (domains[0]) {
                onSelectDomainAction(domains[0], 'manage_nameservers');
              } else {
                onNavigate('manage_nameservers');
              }
            }}
            className="w-full px-5 py-3.5 text-left text-sm font-medium text-blue-600 hover:bg-slate-50 flex items-center gap-3 cursor-pointer"
          >
            <ArrowLeftRight className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Transfer in a Domain</span>
          </button>
        </div>
      </section>
    </div>
  );
};
