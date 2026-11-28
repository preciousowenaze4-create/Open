import React, { useState } from 'react';
import { getSupabaseClient, mapDomainRow, mapTicketRow } from '../supabase';
import { liveDnsCheckRealTime } from '../utils/api';
import {
  DomainRecord,
  LiveDnsLookupResult,
  PortalSection,
  ShopOrder,
  SupportTicket,
  UserProfile,
} from '../types';
import { DnsRecordsEditor } from './DnsRecordsEditor';
import { DomainManageMenu } from './DomainManagementViews';
import { DomainDiagnosticsPanel } from './DomainDiagnosticsPanel';
import {
  RefreshCw,
  Cloud,
  ExternalLink,
  ShoppingBag,
  Trash2,
  CheckCircle2,
  Copy,
  Check,
  Send,
  Globe,
  Server,
} from 'lucide-react';

export const ManageDnsView: React.FC<{
  domains: DomainRecord[];
  onOpenCloudflare: (domain: DomainRecord) => void;
  onSelectDomainAction: (domain: DomainRecord, section: PortalSection) => void;
  onNavigate: (sec: PortalSection) => void;
  sessionTokensByDomain?: Record<string, string>;
  desecToken?: string;
  onSaveDesecToken?: (token: string) => void;
  dynv6Token?: string;
  onSaveDynv6Token?: (token: string) => void;
}> = ({
  domains,
  onOpenCloudflare,
  onSelectDomainAction,
  onNavigate,
  sessionTokensByDomain,
  desecToken,
  onSaveDesecToken,
  dynv6Token,
  onSaveDynv6Token,
}) => {
  const [selectedDomain, setSelectedDomain] = useState(domains[0]?.domain || '');
  const [liveDns, setLiveDns] = useState<LiveDnsLookupResult | null>(null);
  const [loading, setLoading] = useState(false);

  const runLiveLookup = async (domainName: string) => {
    if (!domainName) return;
    setLoading(true);
    try {
      const data = await liveDnsCheckRealTime(domainName);
      setLiveDns(data);
    } catch {
      // ignore lookup error
    } finally {
      setLoading(false);
    }
  };

  const matched = domains.find((d) => d.domain === selectedDomain);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
          Portal Home
        </button>
        <span>/</span>
        <span>Domains</span>
        <span>/</span>
        <span className="text-blue-600 font-medium">Manage DNS</span>
      </div>

      <h1 className="text-2xl font-extrabold text-slate-900">Manage DNS</h1>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {domains.length > 0 ? (
            <select
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-blue-600"
            >
              {domains.map((d) => (
                <option key={d.id} value={d.domain}>
                  {d.domain}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
              placeholder="Enter any domain to inspect live DNS..."
              className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
            />
          )}

          <button
            type="button"
            onClick={() => runLiveLookup(selectedDomain)}
            disabled={loading || !selectedDomain}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Check DNS Propagation</span>
          </button>

          {matched && (
            <>
              <button
                type="button"
                onClick={() => onSelectDomainAction(matched, 'manage_nameservers')}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Server className="w-3.5 h-3.5" />
                <span>Nameservers</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenCloudflare(matched)}
                className="px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Cloud className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span>Cloudflare DNS</span>
              </button>
            </>
          )}
        </div>

        {liveDns && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>
                Domain: <strong className="text-blue-600">{liveDns.domain}</strong>
              </span>
              <span className="tabular-nums">
                Checked {new Date(liveDns.checkedAt).toLocaleTimeString()}
              </span>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="p-3">Type</th>
                  <th className="p-3">Value</th>
                  <th className="p-3 text-right">TTL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {liveDns.records.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-slate-400">
                      No public A, NS, or TXT records propagating yet.
                    </td>
                  </tr>
                ) : (
                  liveDns.records.map((r, i) => (
                    <tr key={i}>
                      <td className="p-3 font-bold">{r.type}</td>
                      <td className="p-3 break-all text-slate-700">{r.data}</td>
                      <td className="p-3 text-right tabular-nums text-slate-500">{r.TTL}s</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {matched && (
        <>
          <DnsRecordsEditor
            domain={matched}
            sessionToken={sessionTokensByDomain?.[matched.id]}
            desecToken={desecToken}
            onSaveDesecToken={onSaveDesecToken}
            dynv6Token={dynv6Token}
            onSaveDynv6Token={onSaveDynv6Token}
          />
          <DomainDiagnosticsPanel domain={matched.domain} />
          <DomainManageMenu
            activeSection="manage_dns"
            activeDomain={matched}
            onNavigate={onNavigate}
          />
        </>
      )}
    </div>
  );
};

export const RenewalsView: React.FC<{
  domains: DomainRecord[];
  onNavigate: (sec: PortalSection) => void;
  onDomainUpdated: (domain: DomainRecord) => void;
}> = ({ domains, onNavigate, onDomainUpdated }) => {
  const [renewedMsg, setRenewedMsg] = useState('');

  const toggleRenew = async (d: DomainRecord) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from('domains')
      .update({ auto_renew: !d.autoRenew })
      .eq('id', d.id)
      .select('*')
      .single();
    if (!error && data) onDomainUpdated(mapDomainRow(data));
  };

  const handleRenewNow = async (d: DomainRecord) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const baseYear = d.expiresAt
      ? parseInt(d.expiresAt.slice(0, 4), 10) || new Date().getFullYear()
      : new Date().getFullYear();
    const nextExpiry = `${baseYear + 1}-12-31`;
    const { data, error } = await supabase
      .from('domains')
      .update({ expires_at: nextExpiry })
      .eq('id', d.id)
      .select('*')
      .single();
    if (!error && data) {
      onDomainUpdated(mapDomainRow(data));
      setRenewedMsg(`Renewed ${d.domain} for 1 year ($0.00). New expiry: ${nextExpiry}.`);
      setTimeout(() => setRenewedMsg(''), 4000);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
          Portal Home
        </button>
        <span>/</span>
        <span className="text-blue-600 font-medium">Domain Renewals</span>
      </div>

      <h1 className="text-2xl font-extrabold text-slate-900">Domain Renewals</h1>

      {renewedMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{renewedMsg}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200">
        {domains.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No domains to renew yet.</div>
        ) : (
          domains.map((d) => (
            <div key={d.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <a
                  href={d.siteUrl || `https://${d.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-blue-600 hover:underline underline-offset-2"
                >
                  {d.domain}
                </a>
                <div className="text-xs text-slate-500 mt-1">
                  Renewal Cost: <strong className="text-emerald-700">$0.00 / year</strong>
                  {d.expiresAt ? ` · Expires ${d.expiresAt}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => toggleRenew(d)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                    d.autoRenew
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-slate-50 border-slate-300 text-slate-600'
                  }`}
                >
                  Auto-Renew: {d.autoRenew ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={() => handleRenewNow(d)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Renew 1 Year ($0)
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const StoreOrdersView: React.FC<{
  orders: ShopOrder[];
  domains: DomainRecord[];
  onOpenCloudflare: (domain: DomainRecord) => void;
  onSelectDomainAction: (domain: DomainRecord, section: PortalSection) => void;
  onNavigate: (sec: PortalSection) => void;
  onOrderDeleted: (orderId: string) => void;
}> = ({ orders, domains, onOpenCloudflare, onSelectDomainAction, onNavigate, onOrderDeleted }) => {
  const handleRemoveOrder = async (orderId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (!error) onOrderDeleted(orderId);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
          Portal Home
        </button>
        <span>/</span>
        <span className="text-blue-600 font-medium">Domain Shop</span>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-amber-500" />
            <span>Domain Shop</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Claimed domains in your account ($0.00 Free Open-World Tier).
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('register_domain')}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
        >
          Register Another Domain
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200">
        {orders.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <Globe className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-medium text-slate-700">Your Domain Shop is empty</p>
            <button
              type="button"
              onClick={() => onNavigate('register_domain')}
              className="px-5 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              Find a Domain
            </button>
          </div>
        ) : (
          orders.map((ord) => {
            const matchedDomain = domains.find((d) => d.domain === ord.domain);
            return (
              <div key={ord.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <a
                    href={matchedDomain?.siteUrl || `https://${ord.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-blue-600 hover:underline underline-offset-2 text-base inline-flex items-center gap-1"
                  >
                    <span>{ord.domain}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Price: <strong className="text-emerald-700">{ord.amountLabel}</strong> · Status:{' '}
                    {matchedDomain?.cloudflareZoneId
                      ? `Cloudflare (${matchedDomain.cloudflareAccountLabel || 'Active'})`
                      : matchedDomain?.nameservers && matchedDomain.nameservers.length > 0
                        ? 'Custom Nameservers Active'
                        : 'Ready to Connect'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {matchedDomain && (
                    <>
                      <button
                        type="button"
                        onClick={() => onSelectDomainAction(matchedDomain, 'manage_nameservers')}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Server className="w-3.5 h-3.5" />
                        <span>Nameservers</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenCloudflare(matchedDomain)}
                        className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Cloud className="w-3.5 h-3.5 fill-white" />
                        <span>Connect Cloudflare</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveOrder(ord.id)}
                    className="p-2 text-slate-400 hover:text-red-600 cursor-pointer"
                    title="Remove order entry"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export const SupportTicketsView: React.FC<{
  profile: UserProfile;
  tickets: SupportTicket[];
  onNavigate: (sec: PortalSection) => void;
  onTicketCreated: (ticket: SupportTicket) => void;
  onTicketUpdated: (ticket: SupportTicket) => void;
}> = ({ profile, tickets, onNavigate, onTicketCreated, onTicketUpdated }) => {
  const [subject, setSubject] = useState('');
  const [department, setDepartment] = useState<SupportTicket['department']>('Cloudflare DNS');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOpenTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 3 || message.trim().length < 5) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setSubmitting(true);
    const id = `tkt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      const { data, error } = await supabase
        .from('tickets')
        .insert({
          id,
          user_id: profile.uid,
          subject: subject.trim(),
          department,
          message: message.trim(),
          status: 'open',
        })
        .select('*')
        .single();
      if (!error && data) {
        onTicketCreated(mapTicketRow(data));
        setSubject('');
        setMessage('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseTicket = async (ticket: SupportTicket) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from('tickets')
      .update({ status: 'closed' })
      .eq('id', ticket.id)
      .select('*')
      .single();
    if (!error && data) onTicketUpdated(mapTicketRow(data));
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
          Portal Home
        </button>
        <span>/</span>
        <span className="text-blue-600 font-medium">Support Tickets</span>
      </div>

      <h1 className="text-2xl font-extrabold text-slate-900">Support Tickets</h1>

      <form onSubmit={handleOpenTicket} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-900">Open a New Ticket</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (e.g. Cloudflare nameserver setup)"
            required
            minLength={3}
            className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
          />
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value as any)}
            className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
          >
            <option value="Cloudflare DNS">Cloudflare DNS</option>
            <option value="Domain Registry">Domain Registry</option>
            <option value="Free Hosting & SSL">Free Hosting & SSL</option>
            <option value="General Support">General Support</option>
          </select>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe your question or issue..."
          required
          minLength={5}
          rows={3}
          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 resize-none"
        />
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-2 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{submitting ? 'Submitting...' : 'Submit Ticket'}</span>
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200">
        {tickets.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No support tickets submitted yet.</div>
        ) : (
          tickets.map((t) => (
            <div key={t.id} className="p-4 sm:p-5 flex items-start justify-between gap-4">
              <div>
                <div className="font-semibold text-sm text-slate-900">{t.subject}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {t.department} · Status: <strong className="uppercase">{t.status}</strong>
                </div>
                <p className="text-xs text-slate-600 mt-2">{t.message}</p>
              </div>
              {t.status !== 'closed' && (
                <button
                  type="button"
                  onClick={() => handleCloseTicket(t)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
                >
                  Close
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const AffiliatesView: React.FC<{
  profile: UserProfile;
  onNavigate: (sec: PortalSection) => void;
}> = ({ profile, onNavigate }) => {
  const [copied, setCopied] = useState(false);
  const shareLink = `${window.location.origin}/?ref=${profile.workspaceHandle}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
          Portal Home
        </button>
        <span>/</span>
        <span className="text-blue-600 font-medium">Affiliates & Referral</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Share OpenHost Portal</h1>
        <p className="text-sm text-slate-600">
          Invite creators and developers to register free domains and connect Cloudflare.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={shareLink}
            className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-800"
          />
          <button
            type="button"
            onClick={copyLink}
            className="px-4 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Link'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const BillingView: React.FC<{
  orders: ShopOrder[];
  onNavigate: (sec: PortalSection) => void;
}> = ({ orders, onNavigate }) => (
  <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
    <div className="text-xs text-slate-500 flex items-center gap-2">
      <button type="button" onClick={() => onNavigate('dashboard')} className="hover:text-blue-600 cursor-pointer">
        Portal Home
      </button>
      <span>/</span>
      <span className="text-blue-600 font-medium">Billing & Plan</span>
    </div>

    <div className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Free Open-World Plan</h1>
        <p className="text-xs text-slate-500 mt-1">All portal domains, nameserver updates, and websites are $0.00.</p>
      </div>
      <div className="text-2xl font-bold tabular-nums text-emerald-700">$0.00/mo</div>
    </div>

    <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200">
      {orders.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">No receipts yet.</div>
      ) : (
        orders.map((o) => (
          <div key={o.id} className="p-4 flex items-center justify-between text-xs">
            <span className="font-bold text-blue-600">{o.domain}</span>
            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> {o.amountLabel}
            </span>
          </div>
        ))
      )}
    </div>
  </div>
);
