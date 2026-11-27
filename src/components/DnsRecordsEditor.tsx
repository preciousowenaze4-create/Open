import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getSupabaseClient, mapDnsRecordRow } from '../supabase';
import { fetchJson, getDnsRecordTypesRealTime, verifyDnsRecordRealTime } from '../utils/api';
import { parseRawDnsText, ParsedDnsInput, validateDnsRecordInput } from '../utils/dnsParser';
import { DnsRecordItem, DnsRecordType, DnsRecordTypeOption, DomainRecord } from '../types';
import {
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  ClipboardPaste,
  RefreshCw,
  FileCode2,
  ChevronDown,
  Search,
} from 'lucide-react';

interface DnsRecordsEditorProps {
  domain: DomainRecord;
  sessionToken?: string;
  compact?: boolean;
}

function getValuePlaceholder(type: string): string {
  switch (type.toUpperCase()) {
    case 'A':
      return 'e.g. 216.198.79.1 or 76.76.21.21';
    case 'AAAA':
      return 'e.g. 2606:4700:4700::1111';
    case 'CNAME':
      return 'e.g. cname.vercel-dns.com';
    case 'MX':
      return 'e.g. mx1.improvmx.com or aspmx.l.google.com';
    case 'NS':
      return 'e.g. ns1.vercel-dns.com';
    case 'TXT':
    case 'SPF':
      return 'e.g. vc-domain-verify=... or v=spf1 include:_spf.google.com ~all';
    case 'SRV':
      return 'e.g. 10 5060 sipserver.example.com';
    case 'CAA':
      return 'e.g. 0 issue "letsencrypt.org"';
    case 'PTR':
      return 'e.g. host.example.com';
    case 'HTTPS':
    case 'SVCB':
      return 'e.g. 1 . alpn="h2,h3"';
    case 'TLSA':
      return 'e.g. 3 1 1 abc123def456...';
    case 'SSHFP':
      return 'e.g. 4 2 123456789abcdef...';
    case 'DS':
      return 'e.g. 12345 13 2 1234567890ABCDEF...';
    case 'URI':
      return 'e.g. 1 "https://example.com"';
    default:
      return `Enter ${type} record value / data...`;
  }
}

export const DnsRecordsEditor: React.FC<DnsRecordsEditorProps> = ({
  domain,
  sessionToken,
  compact = false,
}) => {
  const [records, setRecords] = useState<DnsRecordItem[]>([]);
  const [availableTypes, setAvailableTypes] = useState<DnsRecordTypeOption[]>([
    { type: 'A', code: 1, meaning: 'IPv4 host address', category: 'common' },
    { type: 'AAAA', code: 28, meaning: 'IPv6 host address', category: 'common' },
    { type: 'CNAME', code: 5, meaning: 'Canonical name alias', category: 'common' },
    { type: 'TXT', code: 16, meaning: 'Text & verification strings', category: 'common' },
    { type: 'MX', code: 15, meaning: 'Mail exchange server', category: 'common' },
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [recType, setRecType] = useState<DnsRecordType>('A');
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [typeSearch, setTypeSearch] = useState('');
  const typePickerRef = useRef<HTMLDivElement | null>(null);

  const [host, setHost] = useState('@');
  const [value, setValue] = useState('');
  const [priority, setPriority] = useState<number>(10);
  const [proxied, setProxied] = useState(false);

  const [showPasteBox, setShowPasteBox] = useState(false);
  const [rawPasteText, setRawPasteText] = useState('');
  const [parsedBatch, setParsedBatch] = useState<ParsedDnsInput[]>([]);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const hasCloudflareToken = Boolean(domain.cloudflareZoneId && sessionToken?.trim());

  useEffect(() => {
    getDnsRecordTypesRealTime()
      .then((res) => {
        if (res.types && res.types.length > 0) {
          setAvailableTypes(res.types);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!typePickerOpen) return;
    const onOutsideClick = (ev: MouseEvent) => {
      if (typePickerRef.current && !typePickerRef.current.contains(ev.target as Node)) {
        setTypePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [typePickerOpen]);

  const filteredTypeOptions = useMemo(() => {
    const q = typeSearch.trim().toLowerCase();
    if (!q) return availableTypes;
    return availableTypes.filter(
      (opt) =>
        opt.type.toLowerCase().includes(q) ||
        opt.meaning.toLowerCase().includes(q) ||
        String(opt.code) === q
    );
  }, [availableTypes, typeSearch]);

  const selectedTypeMeta = useMemo(
    () =>
      availableTypes.find((t) => t.type.toUpperCase() === recType.toUpperCase()) || {
        type: recType,
        code: 0,
        meaning: 'Custom DNS record type',
        category: 'iana' as const,
      },
    [availableTypes, recType]
  );

  const loadRecords = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      const { data, error: dbErr } = await supabase
        .from('dns_records')
        .select('*')
        .eq('domain_id', domain.id)
        .order('created_at', { ascending: false });

      if (dbErr) {
        if (dbErr.code === '42P01' || dbErr.code === 'PGRST205') {
          setError(
            'Run the DNS Records SQL setup in your Supabase SQL Editor to enable saved DNS records.'
          );
        }
        setLoading(false);
        return;
      }

      setRecords((data || []).map(mapDnsRecordRow));
    } catch {
      // ignore transient load failures
    } finally {
      setLoading(false);
    }
  }, [domain.id]);

  useEffect(() => {
    setLoading(true);
    setEditingId(null);
    setError('');
    setNotice('');
    setParsedBatch([]);
    setRawPasteText('');
    loadRecords();

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`openhost-dns-${domain.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dns_records', filter: `domain_id=eq.${domain.id}` },
        () => loadRecords()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [domain.id, loadRecords]);

  const handleParsePaste = (textToParse: string) => {
    setRawPasteText(textToParse);
    setError('');
    const parsed = parseRawDnsText(
      textToParse,
      domain.domain,
      availableTypes.map((t) => t.type)
    );
    setParsedBatch(parsed);

    if (parsed.length > 0) {
      const first = parsed[0];
      setRecType(first.type);
      setHost(first.host || '@');
      setValue(first.value);
      if (typeof first.priority === 'number') setPriority(first.priority);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setRecType('A');
    setHost('@');
    setValue('');
    setPriority(10);
    setProxied(false);
  };

  const persistSingleRecord = async (input: {
    type: DnsRecordType;
    host: string;
    value: string;
    priority?: number;
    proxied?: boolean;
    editRecord?: DnsRecordItem | null;
  }) => {
    const validation = validateDnsRecordInput(
      {
        type: input.type,
        host: input.host,
        value: input.value,
        priority: input.priority,
      },
      domain.domain
    );
    if (!validation.valid || !validation.normalized) {
      throw new Error(validation.error || 'Invalid DNS record.');
    }

    const norm = validation.normalized;
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client is not initialized.');

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id || domain.userId;

    let cloudflareRecordId = input.editRecord?.cloudflareRecordId;
    let syncStatus: DnsRecordItem['syncStatus'] = 'saved';

    if (hasCloudflareToken && domain.cloudflareZoneId && sessionToken) {
      if (cloudflareRecordId) {
        const cfRes = await fetchJson('/api/cloudflare/dns/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            zoneId: domain.cloudflareZoneId,
            apiToken: sessionToken,
            recordId: cloudflareRecordId,
            type: norm.type,
            name: norm.host === '@' ? domain.domain : norm.host,
            content: norm.value,
            priority: norm.priority,
            proxied: Boolean(input.proxied),
          }),
        });
        cloudflareRecordId = cfRes?.record?.id || cloudflareRecordId;
        syncStatus = 'cloudflare_synced';
      } else {
        const cfRes = await fetchJson('/api/cloudflare/dns/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            zoneId: domain.cloudflareZoneId,
            apiToken: sessionToken,
            type: norm.type,
            name: norm.host === '@' ? domain.domain : norm.host,
            content: norm.value,
            priority: norm.priority,
            proxied: Boolean(input.proxied),
          }),
        });
        cloudflareRecordId = cfRes?.record?.id;
        syncStatus = 'cloudflare_synced';
      }
    } else {
      const verify = await verifyDnsRecordRealTime({
        domain: domain.domain,
        type: norm.type,
        host: norm.host,
        value: norm.value,
      }).catch(() => null);

      if (verify?.livePropagated) {
        syncStatus = 'propagated';
      }
    }

    if (input.editRecord) {
      const { data: updatedRow, error: updErr } = await supabase
        .from('dns_records')
        .update({
          record_type: norm.type,
          host: norm.host,
          value: norm.value,
          priority: norm.priority ?? null,
          proxied: Boolean(input.proxied),
          cloudflare_record_id: cloudflareRecordId ?? null,
          sync_status: syncStatus,
        })
        .eq('id', input.editRecord.id)
        .select('*')
        .single();

      if (updErr) throw updErr;
      const mapped = mapDnsRecordRow(updatedRow);
      setRecords((prev) => prev.map((r) => (r.id === mapped.id ? mapped : r)));
      return mapped;
    } else {
      const recordId = `dns_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const { data: insertedRow, error: insErr } = await supabase
        .from('dns_records')
        .insert({
          id: recordId,
          user_id: userId,
          domain_id: domain.id,
          domain: domain.domain,
          record_type: norm.type,
          host: norm.host,
          value: norm.value,
          ttl: 300,
          priority: norm.priority ?? null,
          proxied: Boolean(input.proxied),
          cloudflare_record_id: cloudflareRecordId ?? null,
          sync_status: syncStatus,
        })
        .select('*')
        .single();

      if (insErr) throw insErr;
      const mapped = mapDnsRecordRow(insertedRow);
      setRecords((prev) => [mapped, ...prev.filter((r) => r.id !== mapped.id)]);
      return mapped;
    }
  };

  const handleSubmitRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);

    try {
      const editTarget = editingId ? records.find((r) => r.id === editingId) || null : null;
      const saved = await persistSingleRecord({
        type: recType,
        host,
        value,
        priority,
        proxied,
        editRecord: editTarget,
      });

      resetForm();
      setParsedBatch([]);
      setRawPasteText('');
      setShowPasteBox(false);
      setNotice(
        `${saved.type} record (${saved.host} -> ${saved.value}) ${
          editTarget ? 'updated' : 'saved'
        } in real time. You can add another record anytime.`
      );
      setTimeout(() => setNotice(''), 5000);
    } catch (err: any) {
      setError(err?.message || 'Could not save DNS record.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAllParsed = async () => {
    if (parsedBatch.length === 0) return;
    setError('');
    setNotice('');
    setSaving(true);

    let savedCount = 0;
    try {
      for (const item of parsedBatch) {
        await persistSingleRecord({
          type: item.type,
          host: item.host,
          value: item.value,
          priority: item.priority,
          proxied: false,
        });
        savedCount += 1;
      }

      resetForm();
      setParsedBatch([]);
      setRawPasteText('');
      setShowPasteBox(false);
      setNotice(`Saved ${savedCount} DNS record${savedCount > 1 ? 's' : ''} for ${domain.domain}.`);
      setTimeout(() => setNotice(''), 5000);
    } catch (err: any) {
      setError(
        savedCount > 0
          ? `Saved ${savedCount} record(s), stopped on error: ${err?.message}`
          : err?.message || 'Failed to save pasted records.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (rec: DnsRecordItem) => {
    setEditingId(rec.id);
    setRecType(rec.type);
    setHost(rec.host);
    setValue(rec.value);
    setPriority(rec.priority ?? 10);
    setProxied(Boolean(rec.proxied));
    setError('');
    setNotice('');
  };

  const handleDeleteRecord = async (rec: DnsRecordItem) => {
    setError('');
    setNotice('');
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      if (rec.cloudflareRecordId && domain.cloudflareZoneId && sessionToken) {
        await fetchJson('/api/cloudflare/dns/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            zoneId: domain.cloudflareZoneId,
            apiToken: sessionToken,
            recordId: rec.cloudflareRecordId,
          }),
        }).catch(() => {});
      }

      const { error: delErr } = await supabase.from('dns_records').delete().eq('id', rec.id);
      if (delErr) throw delErr;
      setRecords((prev) => prev.filter((r) => r.id !== rec.id));
      if (editingId === rec.id) resetForm();
    } catch (err: any) {
      setError(err?.message || 'Could not delete DNS record.');
    }
  };

  const handleVerifyLive = async (rec: DnsRecordItem) => {
    setCheckingId(rec.id);
    setError('');
    try {
      const res = await verifyDnsRecordRealTime({
        domain: domain.domain,
        type: rec.type,
        host: rec.host,
        value: rec.value,
      });

      const nextStatus: DnsRecordItem['syncStatus'] = res.livePropagated
        ? 'propagated'
        : rec.cloudflareRecordId
          ? 'cloudflare_synced'
          : 'saved';

      if (nextStatus !== rec.syncStatus) {
        const supabase = getSupabaseClient();
        if (supabase) {
          await supabase
            .from('dns_records')
            .update({ sync_status: nextStatus })
            .eq('id', rec.id);
          setRecords((prev) =>
            prev.map((r) => (r.id === rec.id ? { ...r, syncStatus: nextStatus } : r))
          );
        }
      }

      setNotice(
        res.livePropagated
          ? `Live on global DNS: ${res.fqdn} (${rec.type}) resolves to ${rec.value}.`
          : res.targetReachable
            ? `Saved cleanly. Target ${rec.value} is reachable; public propagation for ${res.fqdn} is pending.`
            : `Saved for ${res.fqdn}. Waiting for DNS propagation.`
      );
      setTimeout(() => setNotice(''), 5500);
    } catch (err: any) {
      setError(err?.message || 'Live verification check failed.');
    } finally {
      setCheckingId(null);
    }
  };

  const handleCopyValue = (rec: DnsRecordItem) => {
    navigator.clipboard.writeText(rec.value);
    setCopiedId(rec.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const showsPriority =
    recType.toUpperCase() === 'MX' ||
    recType.toUpperCase() === 'SRV' ||
    recType.toUpperCase() === 'URI' ||
    recType.toUpperCase() === 'KX';

  const supportsCloudflareProxy =
    hasCloudflareToken &&
    (recType.toUpperCase() === 'A' ||
      recType.toUpperCase() === 'AAAA' ||
      recType.toUpperCase() === 'CNAME');

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl ${compact ? 'p-5' : 'p-6'} space-y-4`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <FileCode2 className="w-4 h-4 text-blue-600 shrink-0" />
            <h2 className="text-base font-bold text-slate-900">
              DNS Records ({records.length})
            </h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
              {hasCloudflareToken ? 'Cloudflare + Supabase Live' : 'Realtime Sync'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Supports {availableTypes.length}+ IANA record types for <strong>{domain.domain}</strong>
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowPasteBox((v) => !v)}
          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <ClipboardPaste className="w-3.5 h-3.5 text-blue-600" />
          <span>{showPasteBox ? 'Hide Paste Box' : 'Paste Raw DNS Text'}</span>
        </button>
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

      {/* Raw DNS Paste Box */}
      {showPasteBox && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="text-xs font-semibold text-slate-800">
              Paste copied DNS record text (from Vercel, Cloudflare, Namecheap, or any host)
            </label>
            {parsedBatch.length > 0 && (
              <span className="text-xs font-semibold text-blue-600">
                Detected {parsedBatch.length} record{parsedBatch.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <textarea
            rows={3}
            value={rawPasteText}
            onChange={(e) => handleParsePaste(e.target.value)}
            placeholder={
              'Examples:\nA  @  76.76.21.21\nAAAA  @  2606:4700:4700::1111\nCNAME  www  cname.vercel-dns.com\nType: TXT  Name: _vercel  Value: vc-domain-verify=...'
            }
            className="w-full bg-white border border-slate-300 focus:border-blue-600 rounded-xl p-3 text-xs text-slate-900 font-mono focus:outline-none"
          />

          {parsedBatch.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="text-[11px] text-slate-600">
                First record auto-filled below, or save all {parsedBatch.length} records at once:
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveAllParsed}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl cursor-pointer inline-flex items-center gap-1.5"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save All {parsedBatch.length} Records</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Single Record Form */}
      <form onSubmit={handleSubmitRecord} className="space-y-3 bg-slate-50/70 border border-slate-200 rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Searchable IANA Record Type Selector */}
          <div className="sm:col-span-4 relative" ref={typePickerRef}>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-semibold text-slate-600">Record Type</label>
              <span className="text-[10px] font-medium text-blue-600">
                {availableTypes.length} IANA types
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setTypePickerOpen((open) => !open);
                setTypeSearch('');
              }}
              className="w-full bg-white border border-slate-300 focus:border-blue-600 rounded-xl px-3 py-2.5 text-left flex items-center justify-between gap-2 cursor-pointer"
            >
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-xs font-extrabold text-slate-900 shrink-0">{selectedTypeMeta.type}</span>
                <span className="text-[11px] text-slate-500 truncate">{selectedTypeMeta.meaning}</span>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
            </button>

            {typePickerOpen && (
              <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl z-40 overflow-hidden">
                <div className="p-2 border-b border-slate-100 bg-slate-50">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      autoFocus
                      value={typeSearch}
                      onChange={(e) => setTypeSearch(e.target.value)}
                      placeholder="Find type (TXT, AAAA, CNAME, SRV, CAA...)"
                      className="w-full bg-white border border-slate-300 focus:border-blue-600 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-900 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {filteredTypeOptions.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-500">
                      No matching IANA record type found.
                    </div>
                  ) : (
                    filteredTypeOptions.map((opt) => {
                      const active = opt.type.toUpperCase() === recType.toUpperCase();
                      return (
                        <button
                          key={opt.type}
                          type="button"
                          onClick={() => {
                            setRecType(opt.type);
                            setTypePickerOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                            active ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold flex items-center gap-1.5">
                              <span>{opt.type}</span>
                              {opt.category === 'common' && (
                                <span className="text-[10px] font-medium px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                                  Popular
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">{opt.meaning}</div>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            #{opt.code}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="sm:col-span-3">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Name / Host
            </label>
            <input
              type="text"
              required
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="@ or www"
              className="w-full bg-white border border-slate-300 focus:border-blue-600 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none"
            />
          </div>

          <div className={showsPriority ? 'sm:col-span-3' : 'sm:col-span-5'}>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Value / Target
            </label>
            <input
              type="text"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={getValuePlaceholder(recType)}
              className="w-full bg-white border border-slate-300 focus:border-blue-600 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none"
            />
          </div>

          {showsPriority && (
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Priority</label>
              <input
                type="number"
                min={0}
                max={65535}
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value, 10) || 10)}
                className="w-full bg-white border border-slate-300 focus:border-blue-600 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {supportsCloudflareProxy ? (
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={proxied}
                onChange={(e) => setProxied(e.target.checked)}
                className="accent-amber-500 rounded cursor-pointer"
              />
              <span>Proxy via Cloudflare CDN</span>
            </label>
          ) : (
            <span className="text-[11px] text-slate-500">
              Tip: Use <strong>@</strong> for root domain or tap Type above to search all {availableTypes.length}+ IANA record types
            </span>
          )}

          <div className="flex items-center gap-2">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-3.5 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving || !value.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>{editingId ? 'Update Record' : 'Save DNS Record'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Saved Records List */}
      {loading ? (
        <div className="py-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          <span>Loading DNS records...</span>
        </div>
      ) : records.length === 0 ? (
        <div className="py-5 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
          No custom DNS records added yet for <strong>{domain.domain}</strong>. Add any IANA record type above or paste from Vercel / Cloudflare.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200">
          {records.map((rec) => (
            <div
              key={rec.id}
              className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50/70"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-[11px] font-bold">
                    {rec.type}
                  </span>
                  <span className="text-xs font-bold text-slate-900">{rec.host}</span>
                  {typeof rec.priority === 'number' && (
                    <span className="text-[11px] text-slate-500">Priority {rec.priority}</span>
                  )}
                  <span
                    className={`text-[11px] font-semibold ${
                      rec.syncStatus === 'propagated' || rec.syncStatus === 'cloudflare_synced'
                        ? 'text-emerald-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {rec.syncStatus === 'propagated'
                      ? 'Live DNS Propagated'
                      : rec.syncStatus === 'cloudflare_synced'
                        ? 'Cloudflare Synced'
                        : 'Saved'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-mono break-all">
                  <span>{rec.value}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyValue(rec)}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer shrink-0"
                    title="Copy value"
                  >
                    {copiedId === rec.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleVerifyLive(rec)}
                  disabled={checkingId === rec.id}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                  title="Check live DNS propagation"
                >
                  <RefreshCw className={`w-3 h-3 ${checkingId === rec.id ? 'animate-spin text-blue-600' : ''}`} />
                  <span>Check</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleStartEdit(rec)}
                  className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                  title="Edit record"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteRecord(rec)}
                  className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                  title="Delete record"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
