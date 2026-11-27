import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Cloud,
  ShoppingCart,
  Bell,
  User as UserIcon,
  ChevronDown,
  Smartphone,
  LogOut,
  Globe,
  X,
} from 'lucide-react';
import { PortalSection, UserProfile, DomainRecord } from '../types';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PortalHeaderProps {
  profile: UserProfile;
  domains: DomainRecord[];
  cartCount: number;
  onToggleDrawer: () => void;
  onNavigate: (section: PortalSection) => void;
  onOpenCloudflareConnect: () => void;
  onSelectDomainForAction: (domain: DomainRecord, section: PortalSection) => void;
  onSignOut: () => void;
}

export const PortalHeader: React.FC<PortalHeaderProps> = ({
  profile,
  domains,
  cartCount,
  onToggleDrawer,
  onNavigate,
  onOpenCloudflareConnect,
  onSelectDomainForAction,
  onSignOut,
}) => {
  const [notifOpen, setNotifOpen] = useState(false);
  const [cornerOpen, setCornerOpen] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installTip, setInstallTip] = useState('');
  const notifRef = useRef<HTMLDivElement>(null);
  const cornerRef = useRef<HTMLDivElement>(null);
  const { canPromptNative, isInstalled, isIOS, install } = usePWAInstall();

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (cornerRef.current && !cornerRef.current.contains(e.target as Node)) setCornerOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const handleInstall = async () => {
    if (canPromptNative) {
      const ok = await install();
      if (ok) setCornerOpen(false);
      return;
    }
    if (isIOS) {
      setCornerOpen(false);
      setShowIOSGuide(true);
      return;
    }
    setInstallTip('Open your browser menu and choose "Add to Home Screen" or "Install OpenHost".');
    setTimeout(() => setInstallTip(''), 4500);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Left: Hamburger + Sharp App Store Brand Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleDrawer}
            aria-label="Open navigation menu"
            className="p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Menu className="w-6 h-6" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <img
              src="/pwa-192x192.png"
              alt="OpenHost"
              className="w-8 h-8 rounded-xl shadow-xs object-cover border border-slate-200"
            />
            <span className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
              Open<span className="text-amber-500">Host</span>
            </span>
          </button>
        </div>

        {/* Right: Three-Corner Navigation (Shop Cart, Notifications Bell, Account & Cloudflare Menu) */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('store')}
            aria-label="Open Domain Shop"
            className="relative p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <ShoppingCart className="w-5 h-5 text-amber-500" />
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
              {cartCount}
            </span>
          </button>

          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => {
                setNotifOpen(!notifOpen);
                setCornerOpen(false);
              }}
              aria-label="Notifications"
              className="p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer relative"
            >
              <Bell className="w-5 h-5 fill-slate-500 text-slate-500" />
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 z-50">
                <div className="text-xs font-bold text-slate-900 pb-2 mb-2 border-b border-slate-100">
                  Domain Alerts
                </div>
                {domains.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">
                    Register a domain to view live nameserver and Cloudflare status updates here.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {domains.slice(0, 6).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setNotifOpen(false);
                          onSelectDomainForAction(d, 'manage_nameservers');
                        }}
                        className="w-full text-left p-2.5 rounded-xl hover:bg-slate-50 text-xs cursor-pointer"
                      >
                        <div className="font-semibold text-blue-600 underline underline-offset-2 truncate">
                          {d.domain}
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          {d.cloudflareZoneId
                            ? `Cloudflare active · ${d.cloudflareAccountLabel || d.cloudflareZoneName}`
                            : d.nameservers && d.nameservers.length > 0
                              ? `${d.nameservers.length} custom nameservers configured`
                              : 'Tap to set nameservers or link Cloudflare'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative" ref={cornerRef}>
            <button
              type="button"
              onClick={() => {
                setCornerOpen(!cornerOpen);
                setNotifOpen(false);
              }}
              aria-label="Account and Cloudflare menu"
              className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <UserIcon className="w-5 h-5 fill-slate-600 text-slate-600" />
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {cornerOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 z-50">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 mb-2">
                  <div className="text-sm font-bold text-slate-900 truncate">{profile.displayName}</div>
                  <div className="text-xs text-slate-500 truncate">{profile.email}</div>
                  <div className="text-[11px] font-medium text-emerald-700 mt-1">
                    {profile.plan}
                  </div>
                </div>

                <div className="space-y-1 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => {
                      setCornerOpen(false);
                      onOpenCloudflareConnect();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Cloud className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span>Connect Cloudflare Account</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCornerOpen(false);
                      onNavigate('my_domains');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
                  >
                    <Globe className="w-4 h-4 text-blue-600" />
                    <span>My Domains ({domains.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCornerOpen(false);
                      onNavigate('store');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
                  >
                    <ShoppingCart className="w-4 h-4 text-amber-500" />
                    <span>Domain Shop ({cartCount})</span>
                  </button>

                  {!isInstalled && (
                    <button
                      type="button"
                      onClick={handleInstall}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 text-blue-700 transition-colors cursor-pointer"
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>Add to Home Screen</span>
                    </button>
                  )}

                  {installTip && (
                    <div className="p-2.5 text-[11px] text-slate-600 bg-slate-50 rounded-lg border border-slate-200">
                      {installTip}
                    </div>
                  )}

                  <div className="pt-1 mt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setCornerOpen(false);
                        onSignOut();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl relative border border-slate-200">
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-3">
              <img
                src="/pwa-192x192.png"
                alt="OpenHost"
                className="w-11 h-11 rounded-2xl shadow-sm object-cover border border-slate-200"
              />
              <div>
                <h3 className="text-base font-bold text-slate-900">Install OpenHost</h3>
                <p className="text-[11px] text-slate-500">Add to your iPhone or iPad Home Screen</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              1. Tap the <strong>Share</strong> icon in your browser bar.<br />
              2. Scroll and tap <strong>Add to Home Screen</strong>.<br />
              3. Tap <strong>Add</strong> to launch OpenHost as a full mobile app with your app icon.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};
