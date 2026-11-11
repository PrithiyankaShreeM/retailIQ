import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Bot, CheckCircle2, AlertCircle, X, Maximize2, LoaderCircle } from 'lucide-react';
import { get } from './api';
import { AppContext } from './context';
import Layout from './components/Layout';
import VihziChat from './components/VihziChat';
import { Logo, Loading } from './components/UI';
import Auth from './pages/Auth';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Billing = lazy(() => import('./pages/Billing'));
const Products = lazy(() => import('./pages/Products'));
const Sales = lazy(() => import('./pages/Sales'));
const Stock = lazy(() => import('./pages/Stock'));
const Forecast = lazy(() => import('./pages/Forecast'));
const Vihzi = lazy(() => import('./pages/Vihzi'));
const Settings = lazy(() => import('./pages/Settings'));

const validPages = ['shop', 'billing', 'products', 'sales', 'stock', 'forecast', 'vihzi', 'settings'];

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(Boolean(localStorage.getItem('retailiq_token')));
  const [page, setPage] = useState(() => { const hash = window.location.hash.slice(1); return validPages.includes(hash) ? hash : 'shop'; });
  const [toasts, setToasts] = useState([]);
  const [vihziOpen, setVihziOpen] = useState(false);

  const notify = useCallback((message, tone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500);
  }, []);
  const logout = useCallback(() => {
    localStorage.removeItem('retailiq_token'); setSession(null); setVihziOpen(false);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  const refreshStore = useCallback(async () => {
    const result = await get('/auth/me');
    setSession((current) => ({ ...(current || {}), ...result, token: localStorage.getItem('retailiq_token') }));
    return result;
  }, []);
  const navigate = useCallback((next) => {
    if (!validPages.includes(next)) return;
    setPage(next); window.history.replaceState(null, '', `#${next}`); setVihziOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('retailiq_token')) { setChecking(false); return; }
    get('/auth/me').then((result) => setSession({ ...result, token: localStorage.getItem('retailiq_token') })).catch(() => localStorage.removeItem('retailiq_token')).finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    const expired = () => logout();
    const hash = () => { const next = window.location.hash.slice(1); if (validPages.includes(next)) setPage(next); };
    window.addEventListener('retailiq:unauthorized', expired); window.addEventListener('hashchange', hash);
    return () => { window.removeEventListener('retailiq:unauthorized', expired); window.removeEventListener('hashchange', hash); };
  }, [logout]);

  if (checking) return <div className="grid min-h-screen place-items-center bg-canvas"><div className="flex flex-col items-center gap-4"><Logo /><LoaderCircle className="animate-spin text-forest-500" size={22} /><p className="text-xs text-muted">Opening your secure shop workspace…</p></div></div>;
  if (!session) return <Auth onAuth={(result) => { setSession(result); setPage('shop'); window.history.replaceState(null, '', '#shop'); }} />;

  const pages = {
    shop: <Dashboard />, billing: <Billing />, products: <Products />, sales: <Sales />,
    stock: <Stock />, forecast: <Forecast />, vihzi: <Vihzi />, settings: <Settings />,
  };
  const context = { user: session.user, store: session.store, notify, refreshStore, logout, navigate };
  return <AppContext.Provider value={context}>
    <Layout page={page} onVihzi={() => setVihziOpen(true)}><Suspense fallback={<Loading />}>{pages[page]}</Suspense></Layout>

    {page !== 'vihzi' && <button onClick={() => setVihziOpen((value) => !value)} className="fixed bottom-5 right-5 z-40 flex h-14 items-center gap-2 rounded-2xl bg-forest-600 px-4 text-white shadow-float transition hover:-translate-y-0.5 hover:bg-forest-700" aria-label="Ask Vihzi"><div className="grid h-8 w-8 place-items-center rounded-xl bg-saffron-500 text-forest-900"><Bot size={18} /></div><span className="hidden text-xs font-bold sm:inline">Ask Vihzi</span><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-forest-600 bg-emerald-400" /></button>}
    {vihziOpen && page !== 'vihzi' && <div className="fixed bottom-[84px] right-3 z-50 flex h-[570px] max-h-[calc(100vh-110px)] w-[calc(100vw-24px)] max-w-[400px] animate-slide-up flex-col overflow-hidden rounded-3xl border border-[#dfe6e1] bg-white shadow-float sm:right-5">
      <div className="flex items-center justify-between bg-forest-600 px-4 py-2.5 text-white"><div className="flex items-center gap-2 text-xs font-bold"><Bot size={16} className="text-saffron-400" /> Vihzi quick assistant</div><div className="flex"><button className="icon-btn !h-8 !w-8 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => navigate('vihzi')} title="Open full assistant"><Maximize2 size={14} /></button><button className="icon-btn !h-8 !w-8 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setVihziOpen(false)}><X size={16} /></button></div></div>
      <div className="min-h-0 flex-1"><VihziChat compact /></div>
    </div>}

    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[calc(100vw-32px)] max-w-sm flex-col gap-2">{toasts.map((toast) => <div key={toast.id} className={`pointer-events-auto flex animate-slide-up items-start gap-3 rounded-2xl border bg-white p-4 text-xs leading-5 shadow-float ${toast.tone === 'error' ? 'border-red-100 text-red-700' : 'border-forest-100 text-forest-700'}`} role="status">{toast.tone === 'error' ? <AlertCircle size={18} className="shrink-0" /> : <CheckCircle2 size={18} className="shrink-0" />}<span className="flex-1">{toast.message}</span><button onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} className="text-muted"><X size={14} /></button></div>)}</div>
  </AppContext.Provider>;
}
