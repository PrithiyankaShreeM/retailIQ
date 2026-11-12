import { useEffect } from 'react';
import { X, Inbox, LoaderCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cx } from '../utils';

export function Logo({ light = false, compact = false }) {
  return <div className="flex items-center gap-2.5">
    <div className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', light ? 'bg-white text-forest-600' : 'bg-forest-600 text-white')}>
      <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" aria-hidden="true"><path d="M8 7h16v5H13v4h9v5h-9v4H8V7Z" fill="currentColor"/><circle cx="23" cy="8" r="4" fill="#f2a516"/></svg>
    </div>
    {!compact && <div><div className={cx('text-[22px] font-extrabold leading-none tracking-[-.04em]', light ? 'text-white' : 'text-forest-700')}>Retail<span className={light ? 'text-saffron-400' : 'text-forest-500'}>IQ</span></div></div>}
  </div>;
}

export function PageHeader({ eyebrow, title, description, children }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
    <div>
      {eyebrow && <div className="mb-1 text-[11px] font-bold uppercase tracking-[.14em] text-forest-500">{eyebrow}</div>}
      <h1 className="text-[28px] font-extrabold tracking-[-.035em] text-ink sm:text-[32px]">{title}</h1>
      {description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">{description}</p>}
    </div>
    {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
  </div>;
}

export function StatCard({ label, value, icon: Icon, helper, tone = 'plain', trend }) {
  const tones = {
    plain: 'border-[#dfe6e1] bg-white text-ink',
    hero: 'border-forest-600 bg-forest-600 text-white',
    gold: 'border-saffron-100 bg-saffron-50 text-ink',
  };
  return <div className={cx('relative overflow-hidden rounded-2xl border p-4 shadow-card sm:p-5', tones[tone])}>
    {tone === 'hero' && <div className="absolute -right-7 -top-9 h-28 w-28 rounded-full border-[22px] border-white/5" />}
    <div className="relative flex items-start justify-between gap-3">
      <div className={cx('text-xs font-medium', tone === 'hero' ? 'text-white/70' : 'text-muted')}>{label}</div>
      {Icon && <div className={cx('grid h-8 w-8 place-items-center rounded-lg', tone === 'hero' ? 'bg-white/10 text-saffron-400' : 'bg-forest-50 text-forest-600')}><Icon size={16} strokeWidth={1.8} /></div>}
    </div>
    <div className="relative mt-2 truncate text-[23px] font-extrabold tracking-[-.035em] sm:text-[26px]" title={String(value)}>{value}</div>
    <div className={cx('relative mt-1.5 flex min-h-[16px] items-center gap-1 text-[11px]', tone === 'hero' ? 'text-white/60' : 'text-muted')}>
      {trend !== undefined && trend !== null && (trend >= 0 ? <ArrowUpRight size={13} className="text-emerald-500" /> : <ArrowDownRight size={13} className="text-orange-500" />)}
      <span className="truncate">{helper}</span>
    </div>
  </div>;
}

export function Badge({ children, tone = 'green', dot = false }) {
  const tones = {
    green: 'bg-forest-50 text-forest-700', gold: 'bg-saffron-50 text-[#8a5a00]',
    red: 'bg-red-50 text-red-700', grey: 'bg-slate-100 text-slate-600', blue: 'bg-blue-50 text-blue-700',
  };
  return <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold', tones[tone])}>
    {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}{children}
  </span>;
}

export function Modal({ open, onClose, title, description, children, size = 'lg' }) {
  useEffect(() => {
    if (!open) return undefined;
    const listener = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', listener);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', listener); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' };
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-forest-900/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={title} className={cx('max-h-[92vh] w-full overflow-auto rounded-t-3xl bg-white shadow-float animate-slide-up sm:rounded-3xl', widths[size])}>
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#e8ede9] bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
        <div><h2 className="text-lg font-bold tracking-[-.02em]">{title}</h2>{description && <p className="mt-0.5 text-xs leading-5 text-muted">{description}</p>}</div>
        <button className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close dialog"><X size={19} /></button>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  </div>;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return <div className="flex flex-col items-center px-5 py-10 text-center">
    <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-forest-50 text-forest-500"><Icon size={22} strokeWidth={1.6} /></div>
    <h3 className="text-sm font-bold">{title}</h3>
    <p className="mt-1 max-w-sm text-xs leading-5 text-muted">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>;
}

export function Loading({ label = 'Reading your shop records…' }) {
  return <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-muted"><LoaderCircle className="animate-spin text-forest-500" size={26} /><span className="text-xs">{label}</span></div>;
}

export function SectionTitle({ title, subtitle, children }) {
  return <div className="mb-4 flex items-start justify-between gap-3">
    <div><h2 className="text-[15px] font-bold tracking-[-.015em]">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}</div>
    {children}
  </div>;
}
