import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getSupabaseClient, mapDnsRecordRow } from '../supabase';
import {
  deleteDesecDnsRecordRealTime,
  deleteDynv6DnsRecordRealTime,
  fetchJson,
  getDnsRecordTypesRealTime,
  getDomainCapabilitiesRealTime,
  isDesecDomainClient,
  isDynv6DomainClient,
  syncDesecDnsRecordRealTime,
  syncDynv6DnsRecordRealTime,
  verifyDesecTokenRealTime,
  verifyDnsRecordRealTime,
  verifyDynv6TokenRealTime,
} from '../utils/api';
import { parseRawDnsText, ParsedDnsInput, validateDnsRecordInput } from '../utils/dnsParser';
import { DnsRecordItem, DnsRecordType, DnsRecordTypeOption, DnsRecordVerificationResult, DomainRecord } from '../types';
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
  Globe,
  KeyRound,
  Download,
  Zap,
} from 'lucide-react';

interface DnsRecordsEditorProps {
  domain: DomainRecord;
  sessionToken?: string;
  desecToken?: string;
  onSaveDesecToken?: (token: string) => void;
  dynv6Token?: string;
  onSaveDynv6Token?: (token: string) => void;
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

interface HostingPreset {
  id: string;
  label: string;
  records: { type: DnsRecordType; host: string; value: string; priority?: number }[];
}

const HOSTING_PRESETS: HostingPreset[] = [
  {
    id: 'vercel',
    label: 'Vercel',
    records: [
      { type: 'A', host: '@', value: '216.198.79.1' },
      { type: 'CNAME', host: 'www', value: 'cname.vercel-dns.com' },
    ],
  },
  {
    id: 'netlify',
    label: 'Netlify',
    records: [
      { type: 'A', host: '@', value: '75.2.60.5' },
      { type: 'CNAME', host: 'www', value: 'apex-loadbalancer.netlify.com' },
    ],
  },
  {
    id: 'render',
    label: 'Render',
    records: [{ type: 'A', host: '@', value: '216.24.57.1' }],
  },
  {
    id: 'github',
    label: 'GitHub Pages',
    records: [
      { type: 'A', host: '@', value: '185.199.108.153' },
      { type: 'A', host: '@', value: '185.199.109.153' },
    ],
  },
  {
    id: 'google_mx',
    label: 'Google Workspace MX',
    records: [
      { type: 'MX', host: '@', value: 'smtp.google.com', priority: 1 },
      { type: 'TXT', host: '@', value: 'v=spf1 include:_spf.google.com ~all' },
    ],
  },
];

export const DnsRecordsEditor: React.FC<DnsRecordsEditorProps> = ({
  domain,
  sessionToken,
  desecToken = '',
  onSaveDesecToken,
  dynv6Token = '',
  onSaveDynv6Token,
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
  const [checkingAll, setCheckingAll] = useState(false);
  const [liveChecks, setLiveChecks] = useState<Record<string, DnsRecordVerificationResult>>({});
  const [providerInput, setProviderInput] = useState(desecToken || dynv6Token);
  const [verifyingProvider, setVerifyingProvider] = useState(false);
  const [serverDesecReady, setServerDesecReady] = useState(false);
  const [serverDynv6Ready, setServerDynv6Ready] = useState(false);

  const isDesecDomain = isDesecDomainClient(domain.domain);
  const isDynv6Domain = isDynv6DomainClient(domain.domain);
  const hasCloudflareToken = Boolean(domain.cloudflareZoneId && sessionToken?.trim());

  useEffect(() => {
    if ((!isDesecDomain && !isDynv6Domain) || (isDesecDomain && desecToken) || (isDynv6Domain && dynv6Token)) {
      return;
    }
    getDomainCapabilitiesRealTime()
      .then((c) => {
        setServerDesecReady(Boolean(c.desecConfigured));
        setServerDynv6Ready(Boolean(c.dynv6Configured));
      })
      .catch(() => {});
  }, [isDesecDomain, isDynv6Domain, desecToken, dynv6Token]);

  const handleAttachProviderToken = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = providerInput.trim();
    if (!cleaned) return;
    setVerifyingProvider(true);
    setError('');
    try {
      if (isDesecDomain) {
        const res = await verifyDesecTokenRealTime(cleaned);
        if (res.verified) {
          onSaveDesecToken?.(cleaned);
          setNotice('deSEC key connected. Saved DNS records will push live to ns1.desec.io / ns2.desec.org.');
          setTimeout(() => setNotice(''), 5000);
        }
      } else {
        const res = await verifyDynv6TokenRealTime(cleaned);
        if (res.verified) {
          onSaveDynv6Token?.(cleaned);
          setNotice('Dynv6 key connected. Saved DNS records will push live to ns1.dynv6.com / ns2.dynv6.com.');
          setTimeout(() => setNotice(''), 5000);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid API token.');
    } finally {
      setVerifyingProvider(false);
    }
  };

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
    }

    if (isDesecDomain && (desecToken || serverDesecReady)) {
      await syncDesecDnsRecordRealTime({
        domain: domain.domain,
        type: norm.type,
        host: norm.host,
        value: norm.value,
        priority: norm.priority,
        desecToken: desecToken || undefined,
      });
      syncStatus = 'propagated';
    }

    if (isDynv6Domain && (dynv6Token || serverDynv6Ready)) {
      await syncDynv6DnsRecordRealTime({
        domain: domain.domain,
        type: norm.type,
        host: norm.host,
        value: norm.value,
        priority: norm.priority,
        dynv6Token: dynv6Token || undefined,
      });
      syncStatus = 'propagated';
    }

    const verifyResult = await verifyDnsRecordRealTime({
      domain: domain.domain,
      type: norm.type,
      host: norm.host,
      value: norm.value,
    }).catch(() => null);

    if (syncStatus === 'saved' && verifyResult?.livePropagated) {
      syncStatus = 'propagated';
    }

    let savedRecord: DnsRecordItem;
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
      savedRecord = mapDnsRecordRow(updatedRow);
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
      savedRecord = mapDnsRecordRow(insertedRow);
    }

    if (verifyResult) {
      setLiveChecks((prev) => ({ ...prev, [savedRecord.id]: verifyResult }));
      savedRecord = {
        ...savedRecord,
        resolvedProvider: verifyResult.resolvedProvider,
        resolvedIps: verifyResult.targetIps,
        reversePtr: verifyResult.reversePtr,
        lastVerifiedAt: verifyResult.checkedAt,
      };

      // Best-effort metadata persistence if user has run the latest Supabase upgrade SQL
      void supabase
        .from('dns_records')
        .update({
          resolved_provider: verifyResult.resolvedProvider ?? null,
          resolved_ips: verifyResult.targetIps ?? [],
          reverse_ptr: verifyResult.reversePtr ?? null,
          last_verified_at: verifyResult.checkedAt,
        })
        .eq('id', savedRecord.id);
    }

    if (input.editRecord) {
      setRecords((prev) => prev.map((r) => (r.id === savedRecord.id ? savedRecord : r)));
    } else {
      setRecords((prev) => [savedRecord, ...prev.filter((r) => r.id !== savedRecord.id)]);
    }

    return savedRecord;
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
        }${saved.resolvedProvider ? ` · Verified target: ${saved.resolvedProvider}` : ''}.`
      );
      setTimeout(() => setNotice(''), 6000);
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

      if (isDesecDomain) {
        await deleteDesecDnsRecordRealTime({
          domain: domain.domain,
          type: rec.type,
          host: rec.host,
          desecToken: desecToken || undefined,
        }).catch(() => {});
      }

      if (isDynv6Domain) {
        await deleteDynv6DnsRecordRealTime({
          domain: domain.domain,
          type: rec.type,
          host: rec.host,
          dynv6Token: dynv6Token || undefined,
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

  const handleVerifyLive = async (rec: DnsRecordItem, silent = false) => {
    setCheckingId(rec.id);
    if (!silent) setError('');
    try {
      const res = await verifyDnsRecordRealTime({
        domain: domain.domain,
        type: rec.type,
        host: rec.host,
        value: rec.value,
      });

      setLiveChecks((prev) => ({ ...prev, [rec.id]: res }));

      const nextStatus: DnsRecordItem['syncStatus'] = res.livePropagated
        ? 'propagated'
        : rec.cloudflareRecordId
          ? 'cloudflare_synced'
          : 'saved';

      const supabase = getSupabaseClient();
      if (supabase) {
        if (nextStatus !== rec.syncStatus) {
          await supabase
            .from('dns_records')
            .update({ sync_status: nextStatus })
            .eq('id', rec.id);
        }
        void supabase
          .from('dns_records')
          .update({
            resolved_provider: res.resolvedProvider ?? null,
            resolved_ips: res.targetIps ?? [],
            reverse_ptr: res.reversePtr ?? null,
            last_verified_at: res.checkedAt,
          })
          .eq('id', rec.id);

        setRecords((prev) =>
          prev.map((r) =>
            r.id === rec.id
              ? {
                  ...r,
                  syncStatus: nextStatus,
                  resolvedProvider: res.resolvedProvider,
                  resolvedIps: res.targetIps,
                  reversePtr: res.reversePtr,
                  lastVerifiedAt: res.checkedAt,
                }
              : r
          )
        );
      }

      if (!silent) {
        const providerPart = res.resolvedProvider ? ` (${res.resolvedProvider})` : '';
        const ipPart = res.targetIps.length > 0 ? ` → ${res.targetIps.join(', ')}` : '';
        setNotice(
          res.livePropagated
            ? `Live on global DNS (8.8.8.8 & 1.1.1.1): ${res.fqdn} (${rec.type})${providerPart}${ipPart}.`
            : res.targetReachable
              ? `Internet Target Verified${providerPart}${ipPart}. Public DNS propagation on ${res.fqdn} is pending.`
              : `Saved for ${res.fqdn}. Target address did not respond on public registries — double check the value.`
        );
        setTimeout(() => setNotice(''), 6500);
      }
    } catch (err: any) {
      if (!silent) setError(err?.message || 'Live verification check failed.');
    } finally {
      setCheckingId(null);
    }
  };

  const handleCheckAllLive = async () => {
    if (records.length === 0 || checkingAll) return;
    setCheckingAll(true);
    setError('');
    setNotice('');
    try {
      for (const rec of records) {
        await handleVerifyLive(rec, true);
      }
      setNotice(`Cross-checked ${records.length} DNS record${records.length > 1 ? 's' : ''} against Google 8.8.8.8, Cloudflare 1.1.1.1, and ARIN RDAP.`);
      setTimeout(() => setNotice(''), 6000);
    } finally {
      setCheckingAll(false);
    }
  };

  const handleCopyValue = (rec: DnsRecordItem) => {
    navigator.clipboard.writeText(rec.value);
    setCopiedId(rec.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleApplyPreset = async (preset: HostingPreset) => {
    setError('');
    setNotice('');
    setSaving(true);
    let added = 0;
    try {
      for (const item of preset.records) {
        await persistSingleRecord({
          type: item.type,
          host: item.host,
          value: item.value,
          priority: item.priority,
          proxied: false,
        });
        added += 1;
      }
      setNotice(
        `Applied ${preset.label} DNS preset (${added} record${added > 1 ? 's' : ''}) for ${domain.domain}.`
      );
      setTimeout(() => setNotice(''), 6000);
    } catch (err: any) {
      setError(
        added > 0
          ? `Applied ${added} record(s) from ${preset.label}, stopped on error: ${err?.message}`
          : err?.message || `Could not apply ${preset.label} preset.`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleExportZoneFile = () => {
    if (records.length === 0) return;
    const lines = [
      `; BIND Zone File exported from OpenHost`,
      `$ORIGIN ${domain.domain}.`,
      `$TTL 300`,
      '',
      ...records.map((r) => {
        const hostCol = r.host === '@' ? '@' : r.host;
        const prioCol =
          r.type.toUpperCase() === 'MX' || r.type.toUpperCase() === 'SRV'
            ? `${r.priority ?? 10} `
            : '';
        const valCol =
          r.type.toUpperCase() === 'TXT' && !r.value.startsWith('"')
            ? `"${r.value}"`
            : r.value;
        return `${hostCol}\t${r.ttl || 300}\tIN\t${r.type.toUpperCase()}\t${prioCol}${valCol}`;
      }),
      '',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${domain.domain}-zone.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {records.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleCheckAllLive}
                disabled={checkingAll}
                className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Globe className={`w-3.5 h-3.5 ${checkingAll ? 'animate-spin' : ''}`} />
                <span>{checkingAll ? 'Checking Internet...' : 'Track All Live DNS'}</span>
              </button>
              <button
                type="button"
                onClick={handleExportZoneFile}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                title="Download standard BIND zone file (.txt)"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Zone</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowPasteBox((v) => !v)}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-blue-600" />
            <span>{showPasteBox ? 'Hide Paste Box' : 'Paste Raw DNS Text'}</span>
          </button>
        </div>
      </div>

      {/* 1-Click Hosting DNS Presets */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="font-semibold text-slate-500 inline-flex items-center gap-1 mr-1">
          <Zap className="w-3 h-3 text-blue-600" />
          1-Click Host Presets:
        </span>
        {HOSTING_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={saving}
            onClick={() => handleApplyPreset(preset)}
            className="px-2.5 py-1 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            + {preset.label}
          </button>
        ))}
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

      {((isDesecDomain && !desecToken && !serverDesecReady) ||
        (isDynv6Domain && !dynv6Token && !serverDynv6Ready)) &&
        !hasCloudflareToken && (
          <form
            onSubmit={handleAttachProviderToken}
            className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center gap-2.5 text-xs"
          >
            <div className="flex items-start gap-2 text-blue-900 flex-1">
              <KeyRound className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                {isDesecDomain ? (
                  <>
                    Paste your <strong>deSEC API token</strong> to publish records live to global DNS for{' '}
                    <strong>{domain.domain}</strong>:
                  </>
                ) : (
                  <>
                    Paste your free{' '}
                    <a
                      href="https://dynv6.com/keys"
                      target="_blank"
                      rel="noreferrer"
                      className="underline font-semibold"
                    >
                      Dynv6 HTTP Token
                    </a>{' '}
                    (email-only, no ID) to publish records live to global DNS when saving:
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={providerInput}
                onChange={(e) => setProviderInput(e.target.value)}
                placeholder={isDesecDomain ? 'Paste deSEC API Token...' : 'Paste Dynv6 HTTP Token...'}
                className="bg-white border border-blue-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 w-48 focus:outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                disabled={verifyingProvider || providerInput.trim().length < 6}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer shrink-0"
              >
                {verifyingProvider ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </form>
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
              'Examples:\nA  @  216.198.79.1\nCNAME  www  cname.vercel-dns.com\nTXT  _vercel  vc-domain-verify=...'
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
              Tip: Use <strong>@</strong> for root domain or paste from Vercel / Cloudflare / Render
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
          {records.map((rec) => {
            const liveMeta = liveChecks[rec.id];
            const detectedProvider = liveMeta?.resolvedProvider || rec.resolvedProvider;
            const resolvedIps = (liveMeta?.targetIps && liveMeta.targetIps.length > 0 ? liveMeta.targetIps : rec.resolvedIps) || [];
            const ptr = liveMeta?.reversePtr || rec.reversePtr;

            return (
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
                          : detectedProvider
                            ? 'text-blue-700'
                            : 'text-slate-500'
                      }`}
                    >
                      {rec.syncStatus === 'propagated'
                        ? 'Live on Global DNS'
                        : rec.syncStatus === 'cloudflare_synced'
                          ? 'Cloudflare Synced'
                          : detectedProvider
                            ? 'Internet Target Verified'
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

                  {(detectedProvider || resolvedIps.length > 0 || ptr) && (
                    <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-0.5">
                      {detectedProvider && (
                        <span className="font-semibold text-emerald-700">
                          Network: {detectedProvider}
                        </span>
                      )}
                      {resolvedIps.length > 0 && (
                        <span className="font-mono text-slate-500">
                          IP: {resolvedIps.slice(0, 2).join(', ')}
                        </span>
                      )}
                      {ptr && <span className="text-slate-500">PTR: {ptr}</span>}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleVerifyLive(rec)}
                    disabled={checkingId === rec.id}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                    title="Check real-time internet DNS & RDAP"
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
            );
          })}
        </div>
      )}
    </div>
  );
};
