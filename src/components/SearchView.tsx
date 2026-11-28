import React, { useState, useEffect, useRef } from 'react';
import { DomainSearchCategory, DomainSearchResult, PortalSection } from '../types';
import {
  getDomainCapabilitiesRealTime,
  getTldStatsRealTime,
  searchDomainsRealTime,
} from '../utils/api';
import { getSupabaseClient } from '../supabase';
import { Search, Globe, Check, ArrowRight, Loader2, Filter, ExternalLink, CheckCircle2, Zap, RefreshCw, AlertCircle } from 'lucide-react';

interface SearchViewProps {
  onGetDomain: (result: DomainSearchResult) => Promise<void>;
  acquiringDomain: string | null;
  onNavigate: (sec: PortalSection) => void;
  ownedDomains?: string[];
  desecToken?: string;
  onSaveDesecToken?: (token: string) => void;
  dynv6Token?: string;
  onSaveDynv6Token?: (token: string) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  onGetDomain,
  acquiringDomain,
  onNavigate,
  ownedDomains = [],
  desecToken = '',
  onSaveDesecToken,
  dynv6Token = '',
  onSaveDynv6Token,
}) => {
  const [appName, setAppName] = useState('');
  const [domainType, setDomainType] = useState<DomainSearchCategory>('all_free');
  const [tldFilter, setTldFilter] = useState('');
  const [results, setResults] = useState<DomainSearchResult[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<DomainSearchResult | null>(null);
  const [page, setPage] = useState(1);
  const [nextCursor, setNextCursor] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalExtensions, setTotalExtensions] = useState(0);
  const [freeTotal, setFreeTotal] = useState(0);
  const [globalTotal, setGlobalTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [caps, setCaps] = useState<{
    desecConfigured: boolean;
    dynv6Configured: boolean;
    apiReachable: boolean;
  }>({
    desecConfigured: false,
    dynv6Configured: false,
    apiReachable: true,
  });
  const [capsLoaded, setCapsLoaded] = useState(false);
  const [checkingCaps, setCheckingCaps] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refreshCapabilities = () => {
    setCheckingCaps(true);
    getDomainCapabilitiesRealTime()
      .then((res) => {
        setCaps(res);
      })
      .finally(() => {
        setCapsLoaded(true);
        setCheckingCaps(false);
      });
  };

  useEffect(() => {
    void desecToken;
    void onSaveDesecToken;
    void dynv6Token;
    void onSaveDynv6Token;
    getTldStatsRealTime()
      .then((d) => {
        if (d.freeCount) setFreeTotal(d.freeCount);
        if (d.totalExtensions) setGlobalTotal(d.totalExtensions);
      })
      .catch(() => {});
    refreshCapabilities();
  }, []);

  const effectiveMode: 'free' | 'all' =
    domainType === 'all_free' || domainType === 'instant_live' ? 'free' : 'all';

  useEffect(() => {
    const clean = appName.trim().toLowerCase().replace(/[^a-z0-9.-]/g, '');
    const basePart = clean.split('.')[0] || '';
    if (basePart.length < 2) {
      setResults([]);
      setSelectedPreview(null);
      setError('');
      setHasMore(false);
      setNextCursor(0);
      return;
    }

    const timer = setTimeout(() => {
      runSearch(clean, effectiveMode, domainType, 1, 0, tldFilter, false);
    }, 280);

    return () => clearTimeout(timer);
  }, [appName, domainType, tldFilter]);

  const filterOutClaimedDomains = async (items: DomainSearchResult[]) => {
    const ownedSet = new Set(ownedDomains.map((d) => d.toLowerCase()));
    let filtered = items.filter((item) => item.available && !ownedSet.has(item.domain.toLowerCase()));

    const supabase = getSupabaseClient();
    if (supabase && filtered.length > 0) {
      try {
        const candidates = filtered.map((f) => f.domain.toLowerCase());
        const { data, error: rpcErr } = await supabase.rpc('filter_claimed_domains', {
          candidates,
        });
        if (!rpcErr && Array.isArray(data) && data.length > 0) {
          const claimedSet = new Set(
            data.map((row: any) => String(row.claimed_domain || '').toLowerCase()).filter(Boolean)
          );
          filtered = filtered.filter((item) => !claimedSet.has(item.domain.toLowerCase()));
        }
      } catch {
        // RPC optional until SQL update is run in Supabase
      }
    }

    return filtered;
  };

  const runSearch = async (
    query: string,
    searchMode: 'free' | 'all',
    category: DomainSearchCategory,
    targetPage: number,
    cursor: number,
    filter: string,
    append: boolean
  ) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');

    try {
      const data = await searchDomainsRealTime({
        query,
        mode: searchMode,
        domainType: category,
        page: targetPage,
        cursor,
        limit: 24,
        tldFilter: filter,
        signal: controller.signal,
      });

      const cleanBatch = await filterOutClaimedDomains(data.results || []);
      const nextIdx = data.nextCursor ?? cursor + 24;

      setResults((prev) => {
        const base = append ? prev : [];
        const seen = new Set(base.map((b) => b.domain.toLowerCase()));
        const uniqueNew = cleanBatch.filter((c) => {
          const key = c.domain.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return [...base, ...uniqueNew];
      });
      setPage(targetPage);
      setNextCursor(nextIdx);
      setHasMore(Boolean(data.hasMore));
      setTotalExtensions(data.totalExtensions || 0);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Unable to check domain availability right now.');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    const clean = appName.trim().toLowerCase().replace(/[^a-z0-9.-]/g, '');
    const basePart = clean.split('.')[0] || '';
    if (basePart.length >= 2 && hasMore && !loadingMore) {
      runSearch(clean, effectiveMode, domainType, page + 1, nextCursor, tldFilter, true);
    }
  };

  const visibleCountLabel =
    globalTotal > 0 ? `${globalTotal.toLocaleString()}+` : '9,000+';
  const freeCountLabel =
    freeTotal > 0 ? `${freeTotal.toLocaleString()}+` : '2,500+';

  const quickExtensions = [
    '.dedyn.io',
    '.dynv6.net',
    '.v6.rocks',
    '.dns.army',
    '.us.kg',
    '.dpdns.org',
    '.com',
    '.net',
    '.org',
    '.io',
    '.dev',
    '.app',
    '.ai',
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
          Portal Home
        </button>
        <span>/</span>
        <button type="button" onClick={() => onNavigate('my_domains')} className="hover:text-blue-600 cursor-pointer">
          Domains
        </button>
        <span>/</span>
        <span className="text-blue-600 font-medium">Register a New Domain</span>
      </div>

      {/* Domain Search Box */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Find Your Domain Name</h1>
          <p className="text-sm text-slate-600 mt-1">
            Type your app name (or exact domain like <strong>mybrand.com</strong>) to check endless live-verified domains across{' '}
            {freeCountLabel} open registries and {globalTotal > 0 ? globalTotal.toLocaleString() : '9,000+'} global extensions.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-blue-600 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="Enter app name or domain (e.g. veribox, shopflow.com)..."
              className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl pl-10 pr-10 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
            />
            {loading && <Loader2 className="w-4 h-4 text-blue-600 animate-spin absolute right-3.5 top-3.5" />}
          </div>

          <div className="relative w-full md:w-52">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={tldFilter}
              onChange={(e) => setTldFilter(e.target.value)}
              placeholder="Filter extension (.com, .dev)"
              className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl pl-9 pr-3 py-3 text-xs text-slate-900 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">Select Domain Type</span>
            {results.length > 0 && (
              <span className="text-xs text-slate-500 tabular-nums">
                {results.length} real domains found
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(
              [
                { id: 'all_free', label: `Free Open ($0)`, sub: `${freeCountLabel} suffixes` },
                { id: 'instant_live', label: 'Instant Live DNS', sub: '.dedyn.io / .dynv6.net' },
                { id: 'popular_global', label: 'Global TLDs', sub: '.com, .net, .org, .co' },
                { id: 'tech_dev', label: 'Tech & Apps', sub: '.io, .dev, .app, .ai' },
                { id: 'all_global', label: `All (${visibleCountLabel})`, sub: 'Full IANA catalog' },
              ] as const
            ).map((cat) => {
              const active = domainType === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setDomainType(cat.id)}
                  className={`px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                  }`}
                >
                  <div className="text-xs font-bold truncate">{cat.label}</div>
                  <div
                    className={`text-[10px] truncate ${
                      active ? 'text-blue-100' : 'text-slate-500'
                    }`}
                  >
                    {cat.sub}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <span className="text-[11px] font-medium text-slate-500 mr-1">Quick extension:</span>
            {quickExtensions.map((ext) => {
              const active = tldFilter.trim().toLowerCase() === ext;
              return (
                <button
                  key={ext}
                  type="button"
                  onClick={() => {
                    if (active) {
                      setTldFilter('');
                    } else {
                      setTldFilter(ext);
                      if (
                        ['.com', '.net', '.org', '.io', '.dev', '.app', '.ai'].includes(ext) &&
                        domainType === 'all_free'
                      ) {
                        setDomainType('all_global');
                      }
                    }
                  }}
                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  {ext}
                </button>
              );
            })}
            {tldFilter && (
              <button
                type="button"
                onClick={() => setTldFilter('')}
                className="px-2 py-1 text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
          {!capsLoaded ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
              <span>Checking live DNS provisioning server status...</span>
            </div>
          ) : caps.desecConfigured || caps.dynv6Configured ? (
            <div className="flex items-start gap-2 text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-emerald-800">Instant Live Global DNS Active:</strong>{' '}
                {caps.desecConfigured && (
                  <>
                    Claiming any <strong>.dedyn.io</strong> domain registers it automatically via <strong>deSEC</strong>.{' '}
                  </>
                )}
                {caps.dynv6Configured && (
                  <>
                    Claiming <strong>.dynv6.net / .v6.rocks / .dns.army</strong> registers automatically via <strong>Dynv6</strong>.
                  </>
                )}
              </span>
            </div>
          ) : !caps.apiReachable ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-amber-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Live server endpoint did not respond yet. If you just redeployed Vercel, hard-refresh your browser once to clear the old cache.
                </span>
              </div>
              <button
                type="button"
                onClick={refreshCapabilities}
                disabled={checkingCaps}
                className="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-50 text-amber-800 font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
              >
                <RefreshCw className={`w-3 h-3 ${checkingCaps ? 'animate-spin' : ''}`} />
                <span>Retry</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start gap-2">
                <Globe className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Automatic instant provisioning uses <strong>DESEC_API_TOKEN</strong> (.dedyn.io) or <strong>DYNV6_API_TOKEN</strong> (.dynv6.net) from your server environment variables. Standard DNS management and open domain checks work right now.
                </span>
              </div>
              <button
                type="button"
                onClick={refreshCapabilities}
                disabled={checkingCaps}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
              >
                <RefreshCw className={`w-3 h-3 ${checkingCaps ? 'animate-spin' : ''}`} />
                <span>Recheck</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* Selected Domain Preview Card when user taps a domain */}
      {selectedPreview && (
        <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="text-xs font-semibold text-blue-800">Selected Domain</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-extrabold text-slate-900 break-all">
                {selectedPreview.name}
                <span className="text-blue-600">{selectedPreview.tld}</span>
              </span>
              <a
                href={`https://${selectedPreview.domain}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                title={`Visit ${selectedPreview.domain}`}
              >
                <span>Open</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
              <span className="text-xs text-slate-600">· {selectedPreview.providerLabel}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onGetDomain(selectedPreview)}
            disabled={!!acquiringDomain}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Claim {selectedPreview.domain} ({selectedPreview.isFree ? '$0.00' : 'Save'})</span>
          </button>
        </div>
      )}

      {!appName.trim() && results.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
          <Globe className="w-9 h-9 text-blue-600 mx-auto" />
          <div className="text-base font-bold text-slate-900">Instant Available Domain Search</div>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Enter your desired name above. Unavailable domains are automatically hidden so you only see links ready to claim and connect right away.
          </p>
        </div>
      )}

      {!loading && appName.trim().length >= 2 && results.length === 0 && !error && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <div className="text-sm font-semibold text-slate-800">
            No free matches in this batch yet.
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              {loadingMore ? 'Checking more extensions...' : 'Check Next Batch of Extensions'}
            </button>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-200">
          {results.map((item) => {
            const isAcquiring = acquiringDomain === item.domain;
            return (
              <div
                key={item.domain}
                className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setSelectedPreview(item)}
                      className="text-base font-extrabold text-left cursor-pointer break-all hover:opacity-80"
                    >
                      <span className="text-slate-900">{item.name}</span>
                      <span className="text-blue-600">{item.tld}</span>
                    </button>
                    {item.registrationType === 'live_api' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                        <Zap className="w-3 h-3" />
                        Instant Live
                      </span>
                    )}
                    <span className="text-xs text-slate-500">· {item.providerLabel}</span>
                  </div>
                  <div className="text-xs mt-1 flex items-center gap-2 flex-wrap">
                    <span className="text-emerald-700 font-semibold">
                      {item.dnsStatus} · No Expiry
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                  <span
                    className={`text-xs font-bold ${
                      item.isFree ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {item.isFree ? '$0.00 / Free' : 'ICANN Registrar'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onGetDomain(item)}
                    disabled={!!acquiringDomain}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {isAcquiring ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Adding...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Get Domain</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <div className="p-4 bg-slate-50 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-5 py-2.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 text-xs font-semibold rounded-xl cursor-pointer inline-flex items-center gap-2"
              >
                {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
                <span>
                  {loadingMore
                    ? 'Pulling more available domains...'
                    : totalExtensions > nextCursor
                      ? `Load More Available Domains (${(totalExtensions - nextCursor).toLocaleString()}+ left)`
                      : 'Load More Endless Live Variations'}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
