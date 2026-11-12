import { useEffect, useMemo, useState } from 'react';
import {
  Download, Search, Eye, IndianRupee, ReceiptText, ShoppingBasket, Calculator,
  Printer, RotateCcw, ChevronRight, CalendarDays, CreditCard,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { get, post } from '../api';
import { inr, formatDate, downloadText } from '../utils';
import { PageHeader, StatCard, SectionTitle, Badge, Modal, EmptyState, Loading } from '../components/UI';
import Receipt from '../components/Receipt';
import { useApp } from '../context';

export default function Sales() {
  const { store, notify, refreshStore } = useApp();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const [refunding, setRefunding] = useState(false);
  const load = () => {
    setData(null);
    Promise.all([get(`/sales?days=${days}`), get(`/dashboard?days=${days}`)])
      .then(([salesData, dashboardData]) => { setData(salesData); setDashboard(dashboardData); })
      .catch((error) => notify(error.message, 'error'));
  };
  useEffect(load, [days]);
  const filtered = useMemo(() => data?.sales.filter((sale) => (!status || sale.status === status) && `${sale.bill_number} ${sale.payment_method}`.toLowerCase().includes(search.toLowerCase())) || [], [data, search, status]);
  const exportSales = () => {
    const rows = [['bill_id', 'date', 'items', 'payment_method', 'subtotal', 'tax', 'discount', 'total', 'status'], ...filtered.map((s) => [s.bill_number, s.created_at, s.item_count, s.payment_method, s.subtotal, s.tax, s.discount, s.total, s.status])];
    downloadText(`retailiq-sales-${days}d.csv`, rows.map((row) => row.join(',')).join('\n'));
  };
  const refund = async () => {
    if (!window.confirm(`Refund ${selected.bill_number}? This records a separate return and adds the sold quantities back to stock.`)) return;
    setRefunding(true);
    try { const updated = await post(`/sales/${selected.id}/refund`, {}); setSelected(updated); notify('Return recorded and stock restored', 'success'); load(); refreshStore(); }
    catch (error) { notify(error.message, 'error'); }
    finally { setRefunding(false); }
  };
  if (!data || !dashboard) return <Loading label="Calculating revenue and transaction history…" />;
  const summary = data.summary;
  return <>
    <PageHeader eyebrow="Revenue & transactions" title="Sales Analytics" description="A complete, exportable view of your recorded bills. Refunded bills remain visible and are excluded from paid revenue.">
      <select className="input !w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={1}>Today</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 365 days</option></select><button className="btn-secondary" onClick={exportSales} disabled={!filtered.length}><Download size={16} /> Export CSV</button>
    </PageHeader>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Recorded revenue" value={inr(summary.revenue)} helper={`Last ${days === 1 ? 'day' : `${days} days`}`} icon={IndianRupee} tone="hero" />
      <StatCard label="Paid transactions" value={summary.transactions} helper={`${data.sales.length - summary.transactions} refunded bill(s)`} icon={ReceiptText} />
      <StatCard label="Items sold" value={summary.items} helper="Across paid bills" icon={ShoppingBasket} />
      <StatCard label="Average bill value" value={inr(summary.average_bill)} helper="Paid transactions only" icon={Calculator} />
    </div>
    <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
      <section className="card p-5 xl:col-span-2"><SectionTitle title="Revenue comparison" subtitle="Daily totals from completed, non-refunded bills"><Badge tone="green">{inr(summary.revenue)} total</Badge></SectionTitle><div className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.trend} margin={{ left: -18, right: 5 }}><CartesianGrid vertical={false} stroke="#e8ede9" strokeDasharray="3 3" /><XAxis dataKey="label" axisLine={false} tickLine={false} interval={days > 30 ? Math.floor(days / 10) : days > 7 ? 2 : 0} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `₹${value >= 1000 ? `${value / 1000}k` : value}`} /><Tooltip formatter={(value) => [inr(value), 'Revenue']} cursor={{ fill: '#f4f6f3' }} /><Bar dataKey="revenue" fill="#16745f" radius={[5, 5, 0, 0]} maxBarSize={34} /></BarChart></ResponsiveContainer></div></section>
      <section className="card p-5"><SectionTitle title="Period snapshot" subtitle="Simple answers from the same records" />
        <div className="space-y-3"><div className="rounded-xl bg-forest-50 p-4"><div className="flex items-center gap-2 text-xs text-muted"><CalendarDays size={15} className="text-forest-500" /> Today’s sales</div><div className="mt-1 text-2xl font-extrabold text-forest-700">{inr(dashboard.kpis.today_sales)}</div><div className="mt-1 text-[11px] text-muted">{dashboard.kpis.today_transactions} bills · {dashboard.kpis.today_items} items</div></div>
        <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-[#e4eae5] p-3"><div className="text-[10px] text-muted">Monthly revenue</div><div className="mt-1 text-base font-bold">{inr(dashboard.kpis.month_revenue)}</div></div><div className="rounded-xl border border-[#e4eae5] p-3"><div className="text-[10px] text-muted">Week comparison</div><div className="mt-1 text-base font-bold">{dashboard.kpis.week_change === null ? 'Need history' : `${dashboard.kpis.week_change >= 0 ? '+' : ''}${dashboard.kpis.week_change}%`}</div></div></div>
        <div className="rounded-xl border border-saffron-100 bg-saffron-50 p-3 text-xs leading-5 text-[#76500b]"><b>Best seller:</b> {dashboard.kpis.best_seller}<br /><span className="text-[10px]">By units in the selected analysis period.</span></div></div>
      </section>
    </div>
    <section className="card mt-5 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#e4eae5] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-bold">Transaction history</h2><p className="mt-0.5 text-[11px] text-muted">Open a bill to view, reprint or record a return.</p></div><div className="flex gap-2"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input !w-44 !py-2 !pl-9" placeholder="Bill ID…" value={search} onChange={(e) => setSearch(e.target.value)} /></div><select className="input !w-32 !py-2" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option>Paid</option><option>Refunded</option></select></div></div>
      {filtered.length ? <div className="max-h-[560px] overflow-auto"><table className="w-full min-w-[780px] border-collapse"><thead className="sticky top-0 z-10"><tr className="table-head"><th className="px-5 py-3">Bill ID</th><th className="px-4 py-3">Date & time</th><th className="px-4 py-3 text-right">Items</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Bill</th></tr></thead><tbody>{filtered.map((sale) => <tr key={sale.id} className="cursor-pointer transition hover:bg-[#fafbf9]" onClick={() => setSelected(sale)}><td className="table-cell !px-5 font-mono text-xs font-bold text-forest-600">{sale.bill_number}</td><td className="table-cell text-muted">{formatDate(sale.created_at, true)}</td><td className="table-cell text-right">{sale.item_count}</td><td className="table-cell"><span className="flex items-center gap-1.5"><CreditCard size={14} className="text-muted" />{sale.payment_method}</span></td><td className="table-cell text-right font-bold">{inr(sale.total)}</td><td className="table-cell"><Badge tone={sale.status === 'Paid' ? 'green' : 'grey'} dot>{sale.status}</Badge></td><td className="table-cell !px-5 text-right"><button className="icon-btn !inline-flex !h-8 !w-8" onClick={(event) => { event.stopPropagation(); setSelected(sale); }}><Eye size={16} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={ReceiptText} title="No transactions found" description={search || status ? 'Try clearing the filters.' : 'Completed bills will be recorded here automatically.'} />}
      <div className="flex items-center justify-between border-t border-[#e4eae5] px-5 py-3 text-[11px] text-muted"><span>{filtered.length} transaction(s)</span><span>All values in Indian Rupees</span></div>
    </section>

    <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `Transaction ${selected.bill_number}` : ''} description={selected ? `${formatDate(selected.created_at, true)} · ${selected.source}` : ''} size="sm">
      {selected && <><div className="mb-4 flex items-center justify-between rounded-xl bg-[#f6f8f5] p-3"><Badge tone={selected.status === 'Paid' ? 'green' : 'grey'} dot>{selected.status}</Badge><span className="text-xs text-muted">{selected.item_count} items · {selected.payment_method}</span></div><Receipt sale={selected} store={store} /><div className="mt-5 grid grid-cols-2 gap-2 no-print">{selected.status === 'Paid' ? <button disabled={refunding} onClick={refund} className="btn-secondary !text-red-600"><RotateCcw size={15} /> {refunding ? 'Recording…' : 'Record return'}</button> : <button className="btn-secondary" onClick={() => setSelected(null)}>Close</button>}<button className="btn-primary" onClick={() => window.print()}><Printer size={16} /> Reprint receipt</button></div></>}
    </Modal>
  </>;
}
