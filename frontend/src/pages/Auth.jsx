import { useState } from 'react';
import {
  ArrowRight, Eye, EyeOff, ScanLine, BarChart3, Boxes, ShieldCheck,
  CheckCircle2, Store, Sparkles, LockKeyhole,
} from 'lucide-react';
import { post } from '../api';
import { Logo } from '../components/UI';
import { cx } from '../utils';

const emptyRegister = { full_name: '', email: '', password: '', shop_name: '', shop_address: '', contact: '', business_category: 'Grocery & Daily Needs' };
const demoCredentials = { email: 'demo@retailiq.in', password: 'Vihzi$Lakshmi#2026' };

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [login, setLogin] = useState({ ...demoCredentials });
  const [register, setRegister] = useState(emptyRegister);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const authenticate = async (credentials, isRegister = false) => {
    setBusy(true); setError(''); setInfo('');
    try {
      const result = await post(isRegister ? '/auth/register' : '/auth/login', credentials);
      localStorage.setItem('retailiq_token', result.token); onAuth(result);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const submitLogin = (event) => { event.preventDefault(); authenticate(login); };
  const submitRegister = (event) => { event.preventDefault(); authenticate(register, true); };
  const switchMode = (next) => { setMode(next); setError(''); setInfo(''); };

  return <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1.02fr_1fr]">
    <section className="relative hidden min-h-screen overflow-hidden bg-forest-600 p-10 text-white lg:flex lg:flex-col xl:p-14">
      <div className="absolute -right-32 -top-32 h-[440px] w-[440px] rounded-full border-[80px] border-white/[.025]" /><div className="absolute -bottom-20 -left-24 h-[360px] w-[360px] rounded-full bg-saffron-500/10 blur-3xl" />
      <div className="relative"><Logo light /><p className="mt-2 pl-[50px] text-[10px] text-white/45">Your business, made simpler.</p></div>
      <div className="relative my-auto max-w-xl py-10"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-white/65"><Sparkles size={13} className="text-saffron-400" /> ONE CONNECTED RETAIL SYSTEM</div><h1 className="text-[44px] font-extrabold leading-[1.08] tracking-[-.05em] xl:text-[52px]">Every bill tells you<br />something <span className="text-saffron-400">valuable.</span></h1><p className="mt-5 max-w-lg text-sm leading-7 text-white/55">Scan products, print receipts, receive supplier stock and turn everyday transactions into clear business decisions—with Vihzi by your side.</p>
        <div className="mt-9 grid max-w-lg grid-cols-3 gap-3">{[{ icon: ScanLine, title: 'QR billing', text: 'Fast, accurate checkout' }, { icon: Boxes, title: 'Live inventory', text: 'Every unit accounted for' }, { icon: BarChart3, title: 'Clear analytics', text: 'Insights from real records' }].map(({ icon: Icon, title, text }) => <div key={title} className="rounded-2xl border border-white/10 bg-white/[.055] p-4"><Icon size={20} className="text-saffron-400" /><div className="mt-3 text-xs font-bold">{title}</div><div className="mt-1 text-[10px] leading-4 text-white/40">{text}</div></div>)}</div>
        <div className="mt-8 flex max-w-lg items-center gap-3 rounded-2xl bg-white p-3.5 text-ink shadow-float"><div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[#faf4e8]"><img src="/vihzi.png" alt="Vihzi" className="absolute left-1/2 top-0 h-[130px] w-[103px] max-w-none -translate-x-1/2" /></div><div className="flex-1"><div className="text-[10px] font-bold text-forest-600">VIHZI · YOUR AI ASSISTANT</div><div className="mt-1 text-xs text-muted">“Your shop records are connected. What would you like to know?”</div></div></div>
      </div>
      <div className="relative flex items-center gap-2 text-[10px] text-white/35"><ShieldCheck size={14} /> Secure, independent workspaces for every shop.</div>
    </section>

    <section className="flex min-h-screen items-center justify-center bg-[#fbfcfa] px-5 py-10 sm:px-10">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 lg:hidden"><Logo /><p className="mb-8 mt-2 pl-[50px] text-[10px] text-muted">Your business, made simpler.</p></div>
        <div className="mb-7"><div className="mb-3 flex rounded-xl bg-[#eef2ee] p-1"><button onClick={() => switchMode('login')} className={cx('flex-1 rounded-lg py-2 text-xs font-semibold transition', mode === 'login' ? 'bg-white text-forest-700 shadow-sm' : 'text-muted')}>Sign in</button><button onClick={() => switchMode('register')} className={cx('flex-1 rounded-lg py-2 text-xs font-semibold transition', mode === 'register' ? 'bg-white text-forest-700 shadow-sm' : 'text-muted')}>Create account</button></div><h2 className="text-[28px] font-extrabold tracking-[-.04em]">{mode === 'login' ? 'Welcome back.' : 'Set up your shop.'}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{mode === 'login' ? 'Sign in to see what’s happening in your shop today.' : 'Register your independent RetailIQ workspace in under a minute.'}</p></div>
        {error && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-700">{error}</div>}
        {info && <div className="mb-4 rounded-xl border border-saffron-100 bg-saffron-50 p-3 text-xs leading-5 text-[#76500b]">{info}</div>}
        {mode === 'login' ? <form onSubmit={submitLogin} className="space-y-4">
          <div><label className="label">Email address</label><input required type="email" autoComplete="email" className="input !py-3" placeholder="you@yourshop.in" value={login.email} onChange={(e) => setLogin((value) => ({ ...value, email: e.target.value }))} /></div>
          <div><div className="flex items-center justify-between"><label className="label">Password</label><button type="button" onClick={() => setInfo('Password reset email is not configured in this local demo. Use the demo credentials or create a new shop account.')} className="mb-1.5 text-[10px] font-semibold text-forest-600">Forgot password?</button></div><div className="relative"><input required type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="input !py-3 !pr-11" value={login.password} onChange={(e) => setLogin((value) => ({ ...value, password: e.target.value }))} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
          <button disabled={busy} className="btn-primary w-full !py-3.5">{busy ? 'Opening your shop…' : <>Sign in to My Shop <ArrowRight size={17} /></>}</button>
          <div className="flex items-center gap-3 py-1"><div className="h-px flex-1 bg-[#e2e8e3]" /><span className="text-[9px] font-bold uppercase tracking-widest text-muted">or explore instantly</span><div className="h-px flex-1 bg-[#e2e8e3]" /></div>
          <button type="button" disabled={busy} onClick={() => authenticate(demoCredentials)} className="btn-secondary w-full !py-3.5"><Store size={16} /> Explore Lakshmi Provisions demo</button>
          <div className="rounded-xl bg-forest-50 p-3 text-center text-[10px] leading-5 text-forest-700"><b>Demo:</b> demo@retailiq.in · Vihzi$Lakshmi#2026<br /><span className="text-forest-600/60">Figures are calculated from persisted demo transactions, not browser-only sample values.</span></div>
        </form> : <form onSubmit={submitRegister} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="label">Your full name *</label><input required minLength="2" autoComplete="name" className="input" value={register.full_name} onChange={(e) => setRegister((v) => ({ ...v, full_name: e.target.value }))} /></div><div><label className="label">Shop name *</label><input required minLength="2" className="input" value={register.shop_name} onChange={(e) => setRegister((v) => ({ ...v, shop_name: e.target.value }))} /></div></div>
          <div><label className="label">Email address *</label><input required type="email" autoComplete="email" className="input" placeholder="you@yourshop.in" value={register.email} onChange={(e) => setRegister((v) => ({ ...v, email: e.target.value }))} /></div>
          <div><label className="label">Password (8+ characters) *</label><div className="relative"><input required minLength="8" type={showPassword ? 'text' : 'password'} autoComplete="new-password" className="input !pr-10" value={register.password} onChange={(e) => setRegister((v) => ({ ...v, password: e.target.value }))} /><button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="label">Contact information</label><input className="input" placeholder="+91 …" value={register.contact} onChange={(e) => setRegister((v) => ({ ...v, contact: e.target.value }))} /></div><div><label className="label">Business category</label><select className="input" value={register.business_category} onChange={(e) => setRegister((v) => ({ ...v, business_category: e.target.value }))}><option>Grocery & Daily Needs</option><option>Supermarket</option><option>Pharmacy</option><option>Electronics</option><option>Clothing & Apparel</option><option>Bakery</option><option>Other Retail</option></select></div></div>
          <div><label className="label">Shop address</label><textarea className="input min-h-[70px]" value={register.shop_address} onChange={(e) => setRegister((v) => ({ ...v, shop_address: e.target.value }))} /></div>
          <button disabled={busy} className="btn-primary w-full !py-3.5">{busy ? 'Creating your secure workspace…' : <>Create shop & open dashboard <ArrowRight size={17} /></>}</button>
          <p className="flex items-start gap-2 text-[10px] leading-4 text-muted"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-forest-500" />Your new shop starts with empty, honest records. Add products and receive supplier stock to get started.</p>
        </form>}
        <div className="mt-8 flex items-center justify-center gap-2 text-[10px] text-muted"><LockKeyhole size={12} /> Passwords hashed · Sessions authenticated · Stores isolated</div>
      </div>
    </section>
  </div>;
}
