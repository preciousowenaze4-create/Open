import React, { useState, useEffect, useRef } from 'react';
import { DomainSearchResult, PortalSection } from '../types';
import { getTldStatsRealTime, searchDomainsRealTime } from '../utils/api';
import { getSupabaseClient } from '../supabase';
import { Search, Globe, Check, ArrowRight, Loader2, Filter, ExternalLink } from 'lucide-react';

interface SearchViewProps {
  onGetDomain: (result: DomainSearchResult) => Promise<void>;
  acquiringDomain: string | null;
  onNavigate: (sec: PortalSection) => void;
  ownedDomains?: string[];
}

export const SearchView: React.FC<SearchViewProps> = ({
  onGetDomain,
  acquiringDomain,
  onNavigate,
  ownedDomains = [],
}) => {
  const [appName, setAppName] = useState('');
  const [mode, setMode] = useState<'free' | 'all'>('free');
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
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getTldStatsRealTime()
      .then((d) => {
        if (d.freeCount) setFreeTotal(d.freeCount);
        if (d.totalExtensions) setGlobalTotal(d.totalExtensions);
      })
      .catch(() => {});
  }, []);

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
      runSearch(clean, mode, 1, 0, tldFilter, false);
    }, 350);

    return () => clearTimeout(timer);
  }, [appName, mode, tldFilter]);

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
      let currentCursor = cursor;
      let latestHasMore = false;
      let latestTotalExtensions = 0;
      let collected: DomainSearchResult[] = [];
      let attempts = 0;

      // Keep scanning cleanly if an early page hits taken/claimed domains so user sees plenty of blue results
      while (collected.length < 18 && attempts < 2) {
        const data = await searchDomainsRealTime({
          query,
          mode: searchMode,
          page: targetPage + attempts,
          cursor: currentCursor,
          limit: 24,
          tldFilter: filter,
          signal: controller.signal,
        });

        const cleanBatch = await filterOutClaimedDomains(data.results || []);
        collected = [...collected, ...cleanBatch];
        currentCursor = data.nextCursor ?? currentCursor + 24;
        latestHasMore = Boolean(data.hasMore);
        latestTotalExtensions = data.totalExtensions || latestTotalExtensions;
        attempts += 1;

        if (!latestHasMore || currentCursor >= latestTotalExtensions) break;
      }

      setResults((prev) => {
        const base = append ? prev : [];
        const seen = new Set(base.map((b) => b.domain.toLowerCase()));
        const uniqueNew = collected.filter((c) => {
          const key = c.domain.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return [...base, ...uniqueNew];
      });
      setPage(targetPage);
      setNextCursor(currentCursor);
      setHasMore(latestHasMore);
      setTotalExtensions(latestTotalExtensions);
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
      runSearch(clean, mode, page + 1, nextCursor, tldFilter, true);
    }
  };

  const visibleCountLabel =
    globalTotal > 0 ? `${globalTotal.toLocaleString()}+ & .com` : '9,000+ & .com';
  const freeCountLabel =
    freeTotal > 0 ? `${freeTotal.toLocaleString()}+` : '2,500+';

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

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="inline-flex p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setMode('free')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'free' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Free Open Registries ({freeCountLabel})
            </button>
            <button
              type="button"
              onClick={() => setMode('all')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'all' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Global Extensions ({visibleCountLabel})
            </button>
          </div>

          {results.length > 0 && (
            <span className="text-xs text-slate-500 tabular-nums">
              {results.length} live ready · Endless real-time catalog active
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* Selected Link Preview Card when user taps a domain link */}
      {selectedPreview && (
        <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="text-xs font-semibold text-blue-800">Selected Domain Link</div>
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={`https://${selectedPreview.domain}`}
                target="_blank"
                rel="noreferrer"
                className="text-base font-bold text-blue-700 underline underline-offset-2 inline-flex items-center gap-1 break-all"
              >
                <span>https://{selectedPreview.domain}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
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
            <span>Claim {selectedPreview.domain} ($0.00)</span>
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
                      className="text-base font-bold text-blue-600 hover:text-blue-800 underline underline-offset-2 text-left cursor-pointer break-all"
                    >
                      https://{item.domain}
                    </button>
                    <span className="text-xs text-slate-500">· {item.providerLabel}</span>
                  </div>
                  <div className="text-xs mt-1 flex items-center gap-2 flex-wrap">
                    <span className="text-emerald-700 font-semibold">
                      {item.dnsStatus} · No Expiry
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                  <span className="text-xs font-bold text-emerald-700">$0.00 / Free</span>
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
