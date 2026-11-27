import React from 'react';
import { PortalSection } from '../types';
import { LayoutDashboard, Globe, Search, ShoppingBag } from 'lucide-react';

interface MobileTabBarProps {
  activeSection: PortalSection;
  onNavigate: (section: PortalSection) => void;
  domainsCount: number;
  cartCount: number;
}

export const MobileTabBar: React.FC<MobileTabBarProps> = ({
  activeSection,
  onNavigate,
  domainsCount,
  cartCount,
}) => {
  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 px-2 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-4 h-14">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeSection === 'dashboard' ? 'text-blue-600 font-semibold' : 'text-slate-500'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Home</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('my_domains')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeSection === 'my_domains' ? 'text-blue-600 font-semibold' : 'text-slate-500'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Domains ({domainsCount})</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('register_domain')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeSection === 'register_domain' ? 'text-blue-600 font-semibold' : 'text-slate-500'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>Find</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('store')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeSection === 'store' ? 'text-blue-600 font-semibold' : 'text-slate-500'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Shop ({cartCount})</span>
        </button>
      </div>
    </nav>
  );
};
