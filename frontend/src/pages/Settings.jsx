import { useEffect, useState } from 'react';
import {
  Store, ReceiptText, Bell, Save, LockKeyhole, ShieldCheck, Database,
  LogOut, CheckCircle2, UploadCloud, Eye, EyeOff,
} from 'lucide-react';
import { patch, post } from '../api';
import { PageHeader, SectionTitle, Badge } from '../components/UI';
import { useApp } from '../context';

export default function Settings() {
  const { store, user, notify, refreshStore, logout, navigate } = useApp();
  const [form, setForm] = useState(store);
  const [saving, setSaving] = useState(false);
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  useEffect(() => setForm(store), [store]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async (event) => {
    event.preventDefault(); setSaving(true);
    try { await patch('/settings', { ...form, tax_rate: Number(form.tax_rate), printer_width: Number(form.printer_width) }); await refreshStore(); notify('Shop and billing settings saved', 'success'); }
    catch (error) { notify(error.message, 'error'); }
    finally { setSaving(false); }
  };
  const changePassword = async (event) => {
    event.preventDefault(); setPasswordBusy(true);
    try { await post('/auth/change-password', passwords); setPasswords({ current_password: '', new_password: '' }); notify('Password updated securely', 'success'); }
    catch (error) { notify(error.message, 'error'); }
    finally { setPasswordBusy(false); }
  };
  if (!form) return null;
  return <>
    <PageHeader eyebrow="Workspace preferences" title="Settings & Profile" description="Manage your shop identity, billing configuration, language and account security. These preferences apply only to your store." />
    <form onSubmit={save} className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <section className="card p-5 sm:p-6"><SectionTitle title="Shop profile" subtitle="Shown on receipts and throughout your workspace"><div className="grid h-9 w-9 place-items-center rounded-xl bg-forest-50 text-forest-600"><Store size={18} /></div></SectionTitle><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="label">Shop name *</label><input required className="input" value={form.name} onChange={(e) => update('name', e.target.value)} /></div><div><label className="label">Contact information</label><input className="input" value={form.contact} onChange={(e) => update('contact', e.target.value)} /></div><div className="sm:col-span-2"><label className="label">Shop address</label><textarea className="input min-h-[80px]" value={form.address} onChange={(e) => update('address', e.target.value)} /></div><div><label className="label">Business category</label><select className="input" value={form.business_category} onChange={(e) => update('business_category', e.target.value)}><option>Grocery & Daily Needs</option><option>Grocery</option><option>Supermarket</option><option>Pharmacy</option><option>Electronics</option><option>Clothing & Apparel</option><option>Bakery</option><option>Other Retail</option></select></div><div><label className="label">Account owner</label><input className="input" value={`${user.full_name} · ${user.email}`} disabled /></div></div></section>
        <section className="card p-5 sm:p-6"><SectionTitle title="Billing & receipt setup" subtitle="Tax applies after discount; receipt reprints remain available from Sales"><div className="grid h-9 w-9 place-items-center rounded-xl bg-forest-50 text-forest-600"><ReceiptText size={18} /></div></SectionTitle><div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><div><label className="label">Default tax rate (%)</label><input min="0" max="100" step="0.01" type="number" className="input" value={form.tax_rate} onChange={(e) => update('tax_rate', e.target.value)} /></div><div><label className="label">Thermal receipt width</label><select className="input" value={form.printer_width} onChange={(e) => update('printer_width', e.target.value)}><option value={80}>80 mm thermal</option><option value={58}>58 mm thermal</option></select></div><div><label className="label">Vihzi language</label><select className="input" value={form.language} onChange={(e) => update('language', e.target.value)}><option>English</option><option>Tamil</option><option>Tanglish</option></select></div></div><div className="mt-4 rounded-xl bg-[#f6f8f5] p-3 text-[11px] leading-5 text-muted">Browser printing uses your system print dialog. For unattended thermal printing in a production shop, connect a local POS printer bridge; a printer failure never rolls back a saved sale.</div></section>
        <section className="card p-5 sm:p-6"><SectionTitle title="Notifications" subtitle="Choose which operational reminders matter to you"><div className="grid h-9 w-9 place-items-center rounded-xl bg-forest-50 text-forest-600"><Bell size={18} /></div></SectionTitle><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e3e9e4] p-4"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-forest-600" checked={form.notifications} onChange={(e) => update('notifications', e.target.checked)} /><span><span className="block text-xs font-bold">Low-stock and restocking alerts</span><span className="mt-1 block text-[11px] leading-5 text-muted">Show products at or below their reorder threshold in My Shop and My Stock.</span></span></label></section>
      </div>
      <div className="space-y-5">
        <section className="card p-5"><SectionTitle title="Save preferences" /><p className="text-xs leading-5 text-muted">Review your changes, then apply them to this shop’s backend profile.</p><button disabled={saving} className="btn-primary mt-4 w-full"><Save size={16} />{saving ? 'Saving changes…' : 'Save all changes'}</button></section>
        <section className="card p-5"><SectionTitle title="Connected data" /><div className="space-y-3"><div className="flex gap-3"><Database size={17} className="mt-0.5 text-forest-500" /><div><div className="text-xs font-bold">Centralized store records</div><p className="mt-1 text-[10px] leading-4 text-muted">Billing, products, purchases, movements and analytics share the same store ID.</p></div></div><div className="flex gap-3"><ShieldCheck size={17} className="mt-0.5 text-forest-500" /><div><div className="text-xs font-bold">Store-level access control</div><p className="mt-1 text-[10px] leading-4 text-muted">Every API checks your authenticated session and authorised store.</p></div></div></div><button type="button" onClick={() => navigate('stock')} className="btn-soft mt-4 w-full"><UploadCloud size={15} /> Manage stock imports</button></section>
        <button type="button" onClick={logout} className="btn-secondary w-full !text-red-600"><LogOut size={16} /> Sign out of RetailIQ</button>
      </div>
    </form>
    <section className="card mt-5 p-5 sm:p-6"><SectionTitle title="Account security" subtitle="Passwords are salted and hashed with PBKDF2-SHA256; active sessions expire after 7 days"><Badge tone="green"><ShieldCheck size={12} /> Protected</Badge></SectionTitle><form onSubmit={changePassword} className="grid max-w-3xl grid-cols-1 items-end gap-4 sm:grid-cols-3"><div><label className="label">Current password</label><input required type="password" autoComplete="current-password" className="input" value={passwords.current_password} onChange={(e) => setPasswords((p) => ({ ...p, current_password: e.target.value }))} /></div><div><label className="label">New password (8+ characters)</label><div className="relative"><input required minLength="8" type={showPassword ? 'text' : 'password'} autoComplete="new-password" className="input !pr-10" value={passwords.new_password} onChange={(e) => setPasswords((p) => ({ ...p, new_password: e.target.value }))} /><button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></div><button disabled={passwordBusy} className="btn-secondary"><LockKeyhole size={15} />{passwordBusy ? 'Updating…' : 'Change password'}</button></form></section>
  </>;
}
