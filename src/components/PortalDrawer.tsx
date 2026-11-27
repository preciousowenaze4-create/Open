import React, { useState } from 'react';
import { PortalSection } from '../types';
import {
  ChevronDown,
  ChevronRight,
  Globe,
  RefreshCw,
  Tag,
  ArrowLeftRight,
  X,
} from 'lucide-react';

interface PortalDrawerProps {
  isOpen: boolean;
  activeSection: PortalSection;
  domainsCount: number;
  onSelectSection: (section: PortalSection) => void;
  onClose: () => void;
}

export const PortalDrawer: React.FC<PortalDrawerProps> = ({
  isOpen,
  activeSection,
  domainsCount,
  onSelectSection,
  onClose,
}) => {
  const [servicesOpen, setServicesOpen] = useState(false);
  const [domainsOpen, setDomainsOpen] = useState(true);
  const [billingOpen, setBillingOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);

  const navigate = (sec: PortalSection) => {
    onSelectSection(sec);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <aside className="relative z-10 w-72 max-w-[85vw] bg-white h-full border-r border-slate-200 flex flex-col justify-between overflow-y-auto">
        <div>
          <div className="portal-safe-header border-b border-slate-100">
            <div className="h-16 px-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src="/pwa-192x192.png"
                  alt="OpenHost"
                  className="w-8 h-8 rounded-xl shadow-xs object-cover"
                />
                <span className="font-extrabold text-slate-900 tracking-tight text-lg">
                  Open<span className="text-amber-500">Host</span>
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close navigation menu"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <nav className="p-4 space-y-1 text-sm text-slate-700">
            <button
              type="button"
              onClick={() => navigate('dashboard')}
              className={`w-full text-left px-3 py-2.5 rounded-lg font-medium transition-colors cursor-pointer ${
                activeSection === 'dashboard'
                  ? 'text-blue-600 bg-blue-50/60 font-semibold'
                  : 'hover:bg-slate-50'
              }`}
            >
              Dashboard
            </button>

            <div>
              <button
                type="button"
                onClick={() => setServicesOpen(!servicesOpen)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium hover:bg-slate-50 cursor-pointer"
              >
                <span>Services</span>
                {servicesOpen ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </button>
              {servicesOpen && (
                <div className="ml-4 pl-3 border-l border-slate-200 space-y-1 my-1 text-xs">
                  <button
                    type="button"
                    onClick={() => navigate('services')}
                    className={`w-full text-left px-2.5 py-2 rounded-lg cursor-pointer ${
                      activeSection === 'services' ? 'text-blue-600 font-semibold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Free Websites & SSL
                  </button>
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setDomainsOpen(!domainsOpen)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  [
                    'my_domains',
                    'register_domain',
                    'manage_domain',
                    'manage_nameservers',
                    'edit_contact',
                    'manage_dns',
                    'renewals',
                    'transfer_cloudflare',
                  ].includes(activeSection)
                    ? 'text-blue-600'
                    : 'hover:bg-slate-50'
                }`}
              >
                <span>Domains</span>
                {domainsOpen ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {domainsOpen && (
                <div className="ml-4 pl-3 border-l border-slate-200 space-y-1 my-1 text-[13px]">
                  <button
                    type="button"
                    onClick={() => navigate('manage_dns')}
                    className={`w-full text-left px-2.5 py-2 rounded-lg cursor-pointer ${
                      activeSection === 'manage_dns' ? 'text-blue-600 font-semibold bg-blue-50/50' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Manage DNS
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('my_domains')}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer ${
                      activeSection === 'my_domains' ? 'text-blue-600 font-semibold bg-blue-50/50' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Globe className="w-4 h-4 text-slate-500" />
                      <span>My Domains</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 text-[11px] font-bold tabular-nums">
                      {domainsCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('renewals')}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer ${
                      activeSection === 'renewals' ? 'text-blue-600 font-semibold bg-blue-50/50' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <RefreshCw className="w-4 h-4 text-slate-500" />
                    <span>Domain Renewals</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('register_domain')}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer ${
                      activeSection === 'register_domain' ? 'text-blue-600 font-semibold bg-blue-50/50' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Tag className="w-4 h-4 text-slate-500" />
                    <span>Register a New Domain</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('manage_nameservers')}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer ${
                      activeSection === 'manage_nameservers' ? 'text-blue-600 font-semibold bg-blue-50/50' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowLeftRight className="w-4 h-4 text-slate-500" />
                    <span>Transfer / Nameservers</span>
                  </button>
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setBillingOpen(!billingOpen)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium hover:bg-slate-50 cursor-pointer"
              >
                <span>Billing</span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {billingOpen && (
                <div className="ml-4 pl-3 border-l border-slate-200 space-y-1 my-1 text-xs">
                  <button
                    type="button"
                    onClick={() => navigate('billing')}
                    className="w-full text-left px-2.5 py-2 rounded-lg text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Free Plan & Receipts
                  </button>
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setSupportOpen(!supportOpen)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium hover:bg-slate-50 cursor-pointer"
              >
                <span>Support</span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {supportOpen && (
                <div className="ml-4 pl-3 border-l border-slate-200 space-y-1 my-1 text-xs">
                  <button
                    type="button"
                    onClick={() => navigate('support')}
                    className="w-full text-left px-2.5 py-2 rounded-lg text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    My Support Tickets
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigate('affiliates')}
              className={`w-full text-left px-3 py-2.5 rounded-lg font-medium transition-colors cursor-pointer ${
                activeSection === 'affiliates' ? 'text-blue-600 bg-blue-50/60 font-semibold' : 'hover:bg-slate-50'
              }`}
            >
              Affiliates
            </button>

            <div>
              <button
                type="button"
                onClick={() => setStoreOpen(!storeOpen)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium hover:bg-slate-50 cursor-pointer"
              >
                <span>Store</span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {storeOpen && (
                <div className="ml-4 pl-3 border-l border-slate-200 space-y-1 my-1 text-xs">
                  <button
                    type="button"
                    onClick={() => navigate('store')}
                    className="w-full text-left px-2.5 py-2 rounded-lg text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Domain Shop
                  </button>
                </div>
              )}
            </div>
          </nav>

          <div className="px-4 py-3">
            <button
              type="button"
              onClick={() => navigate('support')}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer"
            >
              Open Ticket
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};
