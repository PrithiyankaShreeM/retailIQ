import { useState } from 'react';
import {
  LayoutDashboard, ScanLine, Package, ChartNoAxesCombined, Boxes, Sparkles,
  Bot, Settings, Menu, X, Plus, LogOut, Bell, ChevronDown, Store,
} from 'lucide-react';
import { Logo } from './UI';
import { useApp } from '../context';
import { cx } from '../utils';

const navigation = [
  { id: 'shop', label: 'My Shop', icon: LayoutDashboard },
  { id: 'billing', label: 'Billing', icon: ScanLine },
  { id: 'products', label: 'My Products', icon: Package },
  { id: 'sales', label: 'Sales', icon: ChartNoAxesCombined },
  { id: 'stock', label: 'My Stock', icon: Boxes },
  { id: 'forecast', label: "What's Next?", icon: Sparkles },
];

export default function Layout({ children, page, onVihzi }) {
  const { store, user, navigate, logout } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = user?.full_name?.split(' ').map((word) => word[0]).slice(0, 2).join('').toUpperCase() || 'SO';
  const go = (id) => { navigate(id); setMobileOpen(false); };
  const sidebar = <div className="flex h-full flex-col bg-forest-600 px-3.5 py-5 text-white">
    <div className="flex items-center justify-between px-2">
      <Logo light />
      <button className="icon-btn text-white/70 hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setMobileOpen(false)}><X size={19} /></button>
    </div>
    <p className="mb-7 mt-2 px-2.5 text-[10px] tracking-wide text-white/50">Your business, made simpler.</p>
    <div className="mb-3 px-3 text-[9px] font-bold uppercase tracking-[.16em] text-white/35">Workspace</div>
    <nav className="space-y-1" aria-label="Main navigation">
      {navigation.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => go(id)} className={cx('nav-item', page === id && 'nav-item-active')} aria-current={page === id ? 'page' : undefined}>
        <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === 'stock' && store?.low_stock_count > 0 && <span className="ml-auto rounded-full bg-saffron-500 px-1.5 text-[10px] text-forest-900">{store.low_stock_count}</span>}
      </button>)}
    </nav>
    <div className="my-4 px-3 text-[9px] font-bold uppercase tracking-[.16em] text-white/35">Intelligence</div>
    <button onClick={() => { onVihzi(); setMobileOpen(false); }} className="relative mb-4 overflow-hidden rounded-2xl bg-forest-700 p-3 text-left transition hover:bg-forest-900">
      <div className="absolute -right-3 -top-5 h-20 w-20 rounded-full bg-saffron-500/10" />
      <div className="relative flex items-center gap-2.5"><div className="grid h-9 w-9 place-items-center rounded-xl bg-saffron-500 text-forest-900"><Bot size={19} /></div><div><div className="text-xs font-bold">Ask Vihzi</div><div className="text-[10px] text-white/50">Your shop, in conversation</div></div></div>
    </button>
    <div className="mt-auto space-y-1 border-t border-white/10 pt-3">
      <button onClick={() => go('settings')} className={cx('nav-item', page === 'settings' && 'nav-item-active')}><Settings size={18} /><span>Settings</span></button>
      <button onClick={logout} className="nav-item"><LogOut size={18} /><span>Sign out</span></button>
    </div>
    <div className="mt-4 flex items-center gap-2.5 rounded-xl px-2 py-2">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-saffron-500 text-xs font-bold text-forest-900">{initials}</div>
      <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{user?.full_name}</div><div className="truncate text-[10px] text-white/45">{store?.name}</div></div>
      <ChevronDown size={14} className="text-white/40" />
    </div>
  </div>;

  return <div className="min-h-screen bg-canvas">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[228px] lg:block">{sidebar}</aside>
    {mobileOpen && <div className="fixed inset-0 z-50 bg-forest-900/40 lg:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) setMobileOpen(false); }}><aside className="h-full w-[270px] animate-slide-up">{sidebar}</aside></div>}
    <div className="lg:pl-[228px]">
      <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-[#e0e6e1] bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="flex items-center gap-3"><button className="icon-btn lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="lg:hidden"><Logo compact /></div>
          <div className="hidden items-center gap-2 text-xs text-muted sm:flex"><Store size={15} className="text-forest-500" /><span className="font-semibold text-ink">{store?.name}</span>{user?.email === 'demo@retailiq.in' && <span className="rounded-full bg-saffron-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#8a5a00]">Demo records</span>}</div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className="hidden text-right md:block"><div className="text-[11px] font-semibold text-ink">{new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</div><div className="text-[9px] uppercase tracking-wider text-muted">Live shop overview</div></div>
          <button className="icon-btn relative" aria-label="Notifications" onClick={() => go('stock')}><Bell size={18} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-saffron-500" /></button>
          <button className="btn-primary !px-3 sm:!px-4" onClick={() => go('billing')}><Plus size={17} /><span className="hidden sm:inline">New bill</span></button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      <footer className="mx-auto flex max-w-[1500px] flex-col gap-1 px-6 pb-6 pt-2 text-[10px] text-muted sm:flex-row sm:items-center sm:justify-between lg:px-8"><span>RetailIQ · One platform. One connected data system.</span><span>All insights are calculated from your authorised shop records.</span></footer>
    </div>
  </div>;
}
