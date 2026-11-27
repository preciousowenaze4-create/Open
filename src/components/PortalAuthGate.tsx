import React, { useState } from 'react';
import { signInWithPopup, User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';

interface PortalAuthGateProps {
  firebaseUser: FirebaseUser | null;
  profile: UserProfile | null;
  authReady: boolean;
  onProfileCreated: (profile: UserProfile) => void;
}

export const PortalAuthGate: React.FC<PortalAuthGateProps> = ({
  firebaseUser,
  profile,
  authReady,
  onProfileCreated,
}) => {
  const [displayName, setDisplayName] = useState(firebaseUser?.displayName || '');
  const [workspaceHandle, setWorkspaceHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError(err.message || 'Sign-in was cancelled. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;

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
    const path = `users/${firebaseUser.uid}`;
    try {
      const payload = {
        uid: firebaseUser.uid,
        displayName: cleanName,
        workspaceHandle: cleanHandle,
        email: firebaseUser.email || '',
        plan: 'Free Open-World' as const,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', firebaseUser.uid), payload);
      onProfileCreated(payload);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, path);
      } catch (wrapped: any) {
        setError(wrapped.message || 'Could not save your account.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <img
              src="/pwa-192x192.png"
              alt="OpenHost"
              className="w-11 h-11 rounded-2xl shadow-sm object-cover border border-slate-200"
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
            Sign up or sign in to claim free domains, manage custom nameservers, and connect your Cloudflare accounts in real time.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{loading ? 'Signing in...' : 'Sign In with Google'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="mt-6 pt-5 border-t border-slate-100 space-y-2.5 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Real-time domain search across 1,400+ global extensions</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Independent Cloudflare & nameserver control per domain</span>
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
              className="w-10 h-10 rounded-xl shadow-xs object-cover border border-slate-200"
            />
            <span className="text-lg font-extrabold tracking-tight text-slate-900">
              Open<span className="text-amber-500">Host</span>
            </span>
          </div>

          <h1 className="text-xl font-bold text-slate-900 mb-1">Create Your Free Account</h1>
          <p className="text-xs text-slate-500 mb-6">
            Signed in as <strong className="text-slate-700">{firebaseUser.email}</strong>. Enter your profile details to open your Client Area.
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
