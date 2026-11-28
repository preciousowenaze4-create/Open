import React, { useState, useEffect } from 'react';
import { checkDomainSslRealTime, getDomainWhoisRealTime } from '../utils/api';
import { SslCheckResult, WhoisLookupResult } from '../types';
import {
  ShieldCheck,
  ShieldAlert,
  Globe,
  RefreshCw,
  Loader2,
  Server,
  Calendar,
} from 'lucide-react';

interface DomainDiagnosticsPanelProps {
  domain: string;
}

export const DomainDiagnosticsPanel: React.FC<DomainDiagnosticsPanelProps> = ({ domain }) => {
  const [whois, setWhois] = useState<WhoisLookupResult | null>(null);
  const [ssl, setSsl] = useState<SslCheckResult | null>(null);
  const [loadingWhois, setLoadingWhois] = useState(false);
  const [loadingSsl, setLoadingSsl] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setWhois(null);
    setSsl(null);
    setError('');
  }, [domain]);

  const handleRunDiagnostics = async () => {
    if (!domain) return;
    setError('');
    setLoadingWhois(true);
    setLoadingSsl(true);

    const [whoisRes, sslRes] = await Promise.allSettled([
      getDomainWhoisRealTime(domain),
      checkDomainSslRealTime(domain),
    ]);

    if (whoisRes.status === 'fulfilled') setWhois(whoisRes.value);
    else setError(whoisRes.reason?.message || 'WHOIS check failed.');

    if (sslRes.status === 'fulfilled') setSsl(sslRes.value);

    setLoadingWhois(false);
    setLoadingSsl(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Live Connection Diagnostics (SSL &amp; WHOIS / RDAP)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Verify public WHOIS registration, authoritative nameservers, and HTTPS/SSL certificate activation for <strong>{domain}</strong>.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRunDiagnostics}
          disabled={loadingWhois || loadingSsl}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
        >
          {loadingWhois || loadingSsl ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          <span>{loadingWhois || loadingSsl ? 'Checking Live...' : 'Run SSL & WHOIS Check'}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
          {error}
        </div>
      )}

      {(whois || ssl) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* SSL / HTTPS Card */}
          {ssl && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  {ssl.authorized ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                  )}
                  <span>HTTPS / SSL Certificate</span>
                </span>
                <span
                  className={`font-bold ${
                    ssl.authorized
                      ? 'text-emerald-700'
                      : ssl.tlsConnected
                        ? 'text-amber-700'
                        : 'text-slate-500'
                  }`}
                >
                  {ssl.authorized
                    ? 'Active & Trusted'
                    : ssl.tlsConnected
                      ? 'Certificate Pending / Untrusted'
                      : 'Not Reachable Yet'}
                </span>
              </div>

              {ssl.tlsConnected ? (
                <div className="space-y-1 text-slate-600">
                  {ssl.issuer && (
                    <div>
                      Issuer: <strong className="text-slate-900">{ssl.issuer}</strong>
                    </div>
                  )}
                  {ssl.protocol && (
                    <div>
                      Protocol: <span className="font-mono">{ssl.protocol}</span>
                    </div>
                  )}
                  {ssl.validTo && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        Expires: {new Date(ssl.validTo).toLocaleDateString()}
                        {typeof ssl.daysRemaining === 'number' && ` (${ssl.daysRemaining} days left)`}
                      </span>
                    </div>
                  )}
                  {ssl.authorizationError && (
                    <div className="text-amber-700 font-medium">{ssl.authorizationError}</div>
                  )}
                </div>
              ) : (
                <p className="text-slate-500">
                  {ssl.error || 'Point A/CNAME DNS records to Vercel or Cloudflare and retry in 1–2 minutes.'}
                </p>
              )}
            </div>
          )}

          {/* WHOIS / RDAP Card */}
          {whois && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span>WHOIS / Public Zone ({whois.rdapSource || 'Live'})</span>
                </span>
                <span
                  className={`font-bold ${
                    whois.registered ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  {whois.registered ? 'Live Registered' : 'Unregistered'}
                </span>
              </div>

              <div className="space-y-1 text-slate-600">
                {whois.registrar && (
                  <div>
                    Registry / Registrar: <strong className="text-slate-900">{whois.registrar}</strong>
                  </div>
                )}
                {whois.expiryDate && (
                  <div>
                    RDAP Expiry: <strong>{new Date(whois.expiryDate).toLocaleDateString()}</strong>
                  </div>
                )}
                {whois.nameservers.length > 0 && (
                  <div className="flex items-start gap-1">
                    <Server className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="break-all">
                      NS: <span className="font-mono text-slate-800">{whois.nameservers.join(', ')}</span>
                    </span>
                  </div>
                )}
                {whois.aRecords.length > 0 && (
                  <div>
                    A Record IP: <span className="font-mono text-slate-800">{whois.aRecords.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
