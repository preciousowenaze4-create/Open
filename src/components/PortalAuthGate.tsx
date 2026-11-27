import React, { useState, useEffect } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { getSupabaseClient, mapProfileRow } from '../supabase';
import { UserProfile } from '../types';
import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';

interface PortalAuthGateProps {
  supabaseUser: SupabaseUser | null;
  profile: UserProfile | null;
  authReady: boolean;
  supabaseReady: boolean;
  onProfileCreated: (profile: UserProfile) => void;
}

export const PortalAuthGate: React.FC<PortalAuthGateProps> = ({
  supabaseUser,
  profile,
  authReady,
  supabaseReady,
  onProfileCreated,
}) => {
  const [displayName, setDisplayName] = useState(
    (supabaseUser?.user_metadata?.full_name as string | undefined) ||
      (supabaseUser?.user_metadata?.name as string | undefined) ||
      ''
  );
  const [workspaceHandle, setWorkspaceHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [iframeAuthUrl, setIframeAuthUrl] = useState('');
  const [copiedOrigin, setCopiedOrigin] = useState(false);

  useEffect(() => {
    const metaName =
      (supabaseUser?.user_metadata?.full_name as string | undefined) ||
      (supabaseUser?.user_metadata?.name as string | undefined) ||
      '';
    if (metaName && !displayName) {
      setDisplayName(metaName);
    }
  }, [supabaseUser?.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errDesc = params.get('error_description') || params.get('error');
    if (errDesc) {
      setError(decodeURIComponent(errDesc.replace(/\+/g, ' ')));
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <img
            src="/pwa-192x192.png"
            alt="OpenHost"
            className="w-14 h-14 rounded-2xl shadow-md mx-auto animate-pulse"
          />
          <p className="text-sm font-medium text-slate-600">Loading Client Area...</p>
        </div>
      </div>
    );
  }

  if (!supabaseReady) {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <img
              src="/pwa-192x192.png"
              alt="OpenHost"
              className="w-11 h-11 rounded-2xl shadow-sm object-cover"
            />
            <div>
              <span className="text-xl font-extrabold tracking-tight text-slate-900 block leading-none">
                Open<span className="text-amber-500">Host</span>
              </span>
              <span className="text-xs text-slate-500">Supabase Connection Pending</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2 leading-relaxed">
            <p className="font-bold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Waiting for Supabase .env credentials in this environment</span>
            </p>
            <p>
              Add <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong>{' '}
              (or <strong>SUPABASE_URL</strong> / <strong>SUPABASE_ANON_KEY</strong>) in your{' '}
              <code>.env</code> or Vercel Environment Variables and redeploy.
            </p>
          </div>

          {currentOrigin && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="font-semibold text-slate-700">
                Supabase Redirect URL to allow in Authentication → URL Configuration:
              </div>
              <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                <span className="font-mono text-[11px] truncate text-slate-800">{currentOrigin}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(currentOrigin);
                    setCopiedOrigin(true);
                    setTimeout(() => setCopiedOrigin(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 text-blue-600 font-semibold shrink-0 cursor-pointer"
                >
                  {copiedOrigin ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedOrigin ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const handleGoogleSignIn = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setLoading(true);
    setError('');
    setIframeAuthUrl('');

    const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

    try {
      const { data, error: authErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          skipBrowserRedirect: isInIframe,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (authErr) {
        throw authErr;
      }

      if (isInIframe && data?.url) {
        setIframeAuthUrl(data.url);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not start Google Sign-In. Please check your Supabase Google provider settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase || !supabaseUser) return;

    const cleanName = displayName.trim();
    const cleanHandle = workspaceHandle
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '');

    if (cleanName.length < 1) {
      setError('Please enter your full name.');
      return;
    }
    if (cleanHandle.length < 2) {
      setError('Please choose an account handle (at least 2 lowercase letters or numbers).');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data, error: upsertErr } = await supabase
        .from('profiles')
        .upsert(
          {
            id: supabaseUser.id,
            display_name: cleanName,
            workspace_handle: cleanHandle,
            email: supabaseUser.email || '',
            plan: 'Free Open-World',
          },
          { onConflict: 'id' }
        )
        .select('*')
        .single();

      if (upsertErr) throw upsertErr;
      onProfileCreated(mapProfileRow(data));
    } catch (err: any) {
      setError(
        err?.message ||
          'Could not save your profile. Make sure you ran the Supabase SQL script in SQL Editor.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!supabaseUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <img
              src="/pwa-192x192.png"
              alt="OpenHost"
              className="w-11 h-11 rounded-2xl shadow-sm object-cover"
            />
            <div>
              <span className="text-xl font-extrabold tracking-tight text-slate-900 block leading-none">
                Open<span className="text-amber-500">Host</span>
              </span>
              <span className="text-xs text-slate-500">Free Domain & Cloud Portal</span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome to Client Area</h1>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            Sign up or sign in with Google via Supabase to claim free domains, configure custom nameservers, and connect your cloud providers in real time.
          </p>

          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs space-y-1">
              <p>{error}</p>
            </div>
          )}

          {iframeAuthUrl ? (
            <div className="mb-3 p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-3 text-xs text-blue-900">
              <p className="font-semibold">
                Google login must open outside the embedded preview frame:
              </p>
              <a
                href={iframeAuthUrl}
                target="_top"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <span>Open Google Sign-In</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{loading ? 'Connecting to Google...' : 'Sign In with Google'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          <div className="mt-6 pt-5 border-t border-slate-100 space-y-2.5 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Real-time domain search across 1,400+ global extensions</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Independent provider & nameserver control per domain</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <img
              src="/pwa-192x192.png"
              alt="OpenHost"
              className="w-10 h-10 rounded-xl shadow-xs object-cover"
            />
            <span className="text-lg font-extrabold tracking-tight text-slate-900">
              Open<span className="text-amber-500">Host</span>
            </span>
          </div>

          <h1 className="text-xl font-bold text-slate-900 mb-1">Create Your Free Account</h1>
          <p className="text-xs text-slate-500 mb-6">
            Signed in as <strong className="text-slate-700">{supabaseUser.email}</strong>. Enter your profile details to open your Client Area.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleCompleteSignUp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Full Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex Mercer"
                required
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Account Handle</label>
              <input
                type="text"
                value={workspaceHandle}
                onChange={(e) => setWorkspaceHandle(e.target.value)}
                placeholder="e.g. mybrand"
                required
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">Lowercase letters, numbers, and hyphens only.</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer"
            >
              {loading ? 'Creating Account...' : 'Create Free Account & Continue'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return null;
};
