import React, { useState, useEffect } from 'react';
import { getSupabaseClient, mapDomainRow } from '../supabase';
import { fetchJson } from '../utils/api';
import { CloudflareDnsRecord, DomainRecord } from '../types';
import { X, Cloud, Key, CheckCircle2, AlertCircle, Plus, Trash2, Loader2, Server } from 'lucide-react';

interface CloudflareConnectModalProps {
  domains: DomainRecord[];
  initialDomain?: DomainRecord | null;
  sessionTokensByDomain: Record<string, string>;
  onSaveSessionToken: (domainId: string, token: string) => void;
  onOpenNameservers: (domain: DomainRecord) => void;
  onDomainUpdated: (domain: DomainRecord) => void;
  onClose: () => void;
}

interface CfZone {
  id: string;
  name: string;
  status: string;
  nameservers: string[];
  planName: string;
  accountName?: string;
}

export const CloudflareConnectModal: React.FC<CloudflareConnectModalProps> = ({
  domains,
  initialDomain,
  sessionTokensByDomain,
  onSaveSessionToken,
  onOpenNameservers,
  onDomainUpdated,
  onClose,
}) => {
  const [selectedDomainId, setSelectedDomainId] = useState<string>(
    initialDomain?.id || domains[0]?.id || ''
  );
  const [customDomain, setCustomDomain] = useState<string>(initialDomain?.domain || '');
  const [accountLabel, setAccountLabel] = useState<string>(
    initialDomain?.cloudflareAccountLabel || ''
  );
  const [apiToken, setApiToken] = useState<string>(
    (initialDomain?.id && sessionTokensByDomain[initialDomain.id]) || ''
  );
  const [zones, setZones] = useState<CfZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [canCreateZone, setCanCreateZone] = useState(false);

  const [records, setRecords] = useState<CloudflareDnsRecord[]>([]);
  const [recType, setRecType] = useState<'A' | 'CNAME' | 'TXT'>('A');
  const [recName, setRecName] = useState('@');
  const [recContent, setRecContent] = useState('');
  const [recProxied, setRecProxied] = useState(true);

  const selectedDomainObj = domains.find((d) => d.id === selectedDomainId) || null;
  const activeDomainName = selectedDomainObj?.domain || customDomain.trim().toLowerCase();

  useEffect(() => {
    if (selectedDomainObj) {
      setCustomDomain(selectedDomainObj.domain);
      setAccountLabel(selectedDomainObj.cloudflareAccountLabel || '');
      const savedToken = sessionTokensByDomain[selectedDomainObj.id] || '';
      setApiToken(savedToken);
      setZones([]);
      setSelectedZoneId(selectedDomainObj.cloudflareZoneId || '');
      setVerified(false);
      setRecords([]);
      setError('');
      setSuccess('');
      setCanCreateZone(false);

      if (savedToken && selectedDomainObj.cloudflareZoneId) {
        loadExistingRecords(selectedDomainObj.cloudflareZoneId, savedToken);
      }
    }
  }, [selectedDomainId]);

  const loadExistingRecords = async (zoneId: string, token: string) => {
    try {
      const data = await fetchJson('/api/cloudflare/dns/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoneId, apiToken: token }),
      });
      if (data.records) setRecords(data.records);
    } catch {
      // ignore initial list failure
    }
  };

  const handleVerifyToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiToken.trim()) {
      setError('Paste a Cloudflare API Token for this domain first.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const data = await fetchJson('/api/cloudflare/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken: apiToken.trim() }),
      });

      if (selectedDomainObj) {
        onSaveSessionToken(selectedDomainObj.id, apiToken.trim());
      }

      setVerified(true);
      setZones(data.zones || []);
      if (data.accountLabel && !accountLabel.trim()) {
        setAccountLabel(data.accountLabel);
      }

      const match = (data.zones || []).find(
        (z: CfZone) => z.name.toLowerCase() === activeDomainName.toLowerCase()
      );
      if (match) {
        setSelectedZoneId(match.id);
        if (match.accountName) setAccountLabel(match.accountName);
      } else if (data.zones?.length > 0) {
        setSelectedZoneId(data.zones[0].id);
      }

      setSuccess(
        `API Key verified (${data.zones?.length || 0} Cloudflare zones found${data.accountLabel ? ` under ${data.accountLabel}` : ''}).`
      );
    } catch (err: any) {
      setVerified(false);
      setError(err.message || 'Could not verify Cloudflare API key.');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectDomain = async (createNewZone = false) => {
    if (!activeDomainName || !apiToken.trim()) {
      setError('Domain name and Cloudflare API Token are required.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setCanCreateZone(false);

    try {
      const res = await fetch('/api/cloudflare/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: activeDomainName,
          apiToken: apiToken.trim(),
          zoneId: createNewZone ? undefined : selectedZoneId || undefined,
          createNewZone,
        }),
      });
      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        throw new Error(`Cloudflare connect failed (HTTP ${res.status}).`);
      }
      if (!res.ok) {
        if (data.canCreateZone) setCanCreateZone(true);
        throw new Error(data.error || 'Could not connect Cloudflare zone.');
      }

      if (selectedDomainObj) {
        onSaveSessionToken(selectedDomainObj.id, apiToken.trim());
      }

      setRecords(data.dnsRecords || []);
      const resolvedAccountLabel =
        (accountLabel.trim() || data.cloudflare.accountLabel || 'Cloudflare Account').slice(0, 120);
      setAccountLabel(resolvedAccountLabel);

      const cfNameservers: string[] = (data.cloudflare.nameservers || []).slice(0, 5);

      if (selectedDomainObj) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data: updatedRow, error: dbErr } = await supabase
            .from('domains')
            .update({
              status: 'cloudflare_connected',
              cloudflare_zone_id: data.cloudflare.zoneId,
              cloudflare_zone_name: data.cloudflare.zoneName,
              cloudflare_status: data.cloudflare.status,
              cloudflare_nameservers: cfNameservers,
              cloudflare_account_label: resolvedAccountLabel,
              nameserver_mode:
                cfNameservers.length > 0 ? 'custom' : selectedDomainObj.nameserverMode || 'default',
              nameservers: cfNameservers.length > 0 ? cfNameservers : selectedDomainObj.nameservers || [],
            })
            .eq('id', selectedDomainObj.id)
            .select('*')
            .single();

          if (dbErr) throw dbErr;
          if (updatedRow) onDomainUpdated(mapDomainRow(updatedRow));
        }
      }

      setSuccess(
        `Connected ${activeDomainName} to ${resolvedAccountLabel} (${data.cloudflare.zoneName}) and synced nameservers.`
      );
    } catch (err: any) {
      setError(err.message || 'Connection failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    const zoneId = selectedDomainObj?.cloudflareZoneId || selectedZoneId;
    if (!zoneId || !apiToken.trim() || !recName.trim() || !recContent.trim()) return;

    setLoading(true);
    setError('');
    try {
      const data = await fetchJson('/api/cloudflare/dns/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zoneId,
          apiToken: apiToken.trim(),
          type: recType,
          name: recName.trim(),
          content: recContent.trim(),
          proxied: recType !== 'TXT' ? recProxied : false,
        }),
      });

      setRecords((prev) => [data.record, ...prev]);
      setRecContent('');
      setSuccess('DNS record published to Cloudflare.');
    } catch (err: any) {
      setError(err.message || 'Failed to create record.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    const zoneId = selectedDomainObj?.cloudflareZoneId || selectedZoneId;
    if (!zoneId || !apiToken.trim()) return;

    setLoading(true);
    try {
      await fetchJson('/api/cloudflare/dns/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoneId, apiToken: apiToken.trim(), recordId }),
      });
      setRecords((prev) => prev.filter((r) => r.id !== recordId));
    } catch (err: any) {
      setError(err.message || 'Failed to delete record.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Cloud className="w-6 h-6 text-amber-500 fill-amber-500" />
            <div>
              <h2 className="text-base font-bold text-slate-900">DNS & Cloud Account Connect</h2>
              <p className="text-xs text-slate-500">
                Link this domain to Cloudflare API or any external DNS provider & account label
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p>{error}</p>
                {canCreateZone && (
                  <button
                    type="button"
                    onClick={() => handleConnectDomain(true)}
                    className="px-3 py-1.5 bg-red-700 text-white font-semibold rounded-lg text-xs cursor-pointer"
                  >
                    Add {activeDomainName} to Cloudflare Now
                  </button>
                )}
              </div>
            </div>
          )}

          {success && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Switch Between Domains + General Provider / Account Label */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {domains.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Switch Domain ({domains.length})
                </label>
                <select
                  value={selectedDomainId}
                  onChange={(e) => setSelectedDomainId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-semibold text-blue-600"
                >
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.domain}
                      {d.cloudflareAccountLabel ? ` · ${d.cloudflareAccountLabel}` : ''}
                    </option>
                  ))}
                  <option value="">-- Enter custom domain --</option>
                </select>
              </div>
            )}

            <div className={domains.length > 0 ? '' : 'sm:col-span-2'}>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Provider / Account Name
              </label>
              <input
                type="text"
                maxLength={120}
                value={accountLabel}
                onChange={(e) => setAccountLabel(e.target.value)}
                placeholder="e.g. Cloudflare, Vercel, Namecheap, Client Server"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-900"
              />
            </div>

            {!selectedDomainId && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Domain Name
                </label>
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="Enter domain (e.g. myapp.pages.dev)"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-900"
                />
              </div>
            )}
          </div>

          {/* API Key Input */}
          <form onSubmit={handleVerifyToken} className="space-y-2.5">
            <label className="block text-xs font-semibold text-slate-700">
              API Token for {activeDomainName || 'this domain'} (Cloudflare Zone:Edit · Session Only)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Paste Cloudflare API Token..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !apiToken.trim()}
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Verify Key</span>
              </button>
            </div>
          </form>

          {/* Zone Selection & Connect */}
          {verified && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="text-xs font-semibold text-slate-800">
                Select Cloudflare Zone ({zones.length} available)
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={selectedZoneId}
                  onChange={(e) => setSelectedZoneId(e.target.value)}
                  className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900"
                >
                  <option value="">-- Match {activeDomainName} --</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} ({z.status})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleConnectDomain(false)}
                  disabled={loading}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl cursor-pointer whitespace-nowrap"
                >
                  Connect Zone
                </button>
              </div>
            </div>
          )}

          {/* Connected Zone & Nameservers */}
          {selectedDomainObj && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                {selectedDomainObj.cloudflareZoneId ? (
                  <>
                    <div className="font-bold text-emerald-800">
                      Connected Zone: {selectedDomainObj.cloudflareZoneName} (
                      {selectedDomainObj.cloudflareAccountLabel || 'Cloudflare'})
                    </div>
                    {selectedDomainObj.cloudflareNameservers &&
                      selectedDomainObj.cloudflareNameservers.length > 0 && (
                        <div className="text-slate-600">
                          Nameservers: {selectedDomainObj.cloudflareNameservers.join(', ')}
                        </div>
                      )}
                  </>
                ) : (
                  <div className="text-slate-600">
                    Already copied your Cloudflare nameservers (e.g. courtney.ns.cloudflare.com)?
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenNameservers(selectedDomainObj);
                }}
                className="px-3.5 py-2 bg-white border border-slate-300 hover:border-blue-600 text-blue-600 font-semibold rounded-xl inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Server className="w-3.5 h-3.5" />
                <span>Edit Nameservers</span>
              </button>
            </div>
          )}

          {/* Live Cloudflare DNS Records */}
          {records.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-800">Cloudflare DNS Records</div>
              <form onSubmit={handleAddRecord} className="grid grid-cols-12 gap-2">
                <select
                  value={recType}
                  onChange={(e) => setRecType(e.target.value as any)}
                  className="col-span-3 bg-slate-50 border border-slate-300 rounded-lg px-2 py-2 text-xs font-semibold"
                >
                  <option value="A">A</option>
                  <option value="CNAME">CNAME</option>
                  <option value="TXT">TXT</option>
                </select>
                <input
                  type="text"
                  value={recName}
                  onChange={(e) => setRecName(e.target.value)}
                  placeholder="Name"
                  className="col-span-3 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-xs"
                />
                <input
                  type="text"
                  value={recContent}
                  onChange={(e) => setRecContent(e.target.value)}
                  placeholder="IPv4 / Target"
                  className="col-span-4 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-xs"
                />
                <button
                  type="submit"
                  disabled={loading || !recContent.trim()}
                  className="col-span-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5">Name</th>
                      <th className="p-2.5">Content</th>
                      <th className="p-2.5 text-right">Del</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {records.map((r) => (
                      <tr key={r.id}>
                        <td className="p-2.5 font-bold">{r.type}</td>
                        <td className="p-2.5 truncate max-w-[120px]">{r.name}</td>
                        <td className="p-2.5 truncate max-w-[160px]">{r.content}</td>
                        <td className="p-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteRecord(r.id)}
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
