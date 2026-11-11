import { useEffect, useState } from 'react';
import {
  IndianRupee, ShoppingBasket, ReceiptText, Trophy, PackageMinus, CalendarDays,
  ArrowRight, TrendingUp, Lightbulb, Package, ChevronRight,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { get } from '../api';
import { inr, formatDate, cx } from '../utils';
import { PageHeader, StatCard, SectionTitle, Badge, Loading, EmptyState } from '../components/UI';
import { useApp } from '../context';

const COLORS = ['#0f5c4d', '#f2a516', '#58a58e', '#87b8a7', '#d9b568', '#9aaea5'];

export default function Dashboard() {
  const { navigate, store } = useApp();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { setData(null); get(`/dashboard?days=${days}`).then(setData).catch((e) => setError(e.message)); }, [days]);
  if (error) return <EmptyState title="Dashboard unavailable" description={error} />;
  if (!data) return <Loading />;
  const { kpis } = data;
  const firstName = store?.name?.split(' ')[0] || 'Shop owner';

  return <>
    <PageHeader eyebrow="My Shop" title={`Good to see you, ${firstName}.`} description="Here’s what’s happening across your shop, calculated from completed bills and stock movements.">
      <div className="flex items-center gap-2 rounded-xl border border-[#dfe6e1] bg-white px-3 py-2 text-xs text-muted"><CalendarDays size={15} className="text-forest-500" /><select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-transparent font-semibold text-ink outline-none"><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></div>
    </PageHeader>

    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Today's sales" value={inr(kpis.today_sales)} helper={`${kpis.today_transactions} completed bills`} icon={IndianRupee} tone="hero" trend={kpis.week_change} />
      <StatCard label="Items sold today" value={kpis.today_items} helper="Across all categories" icon={ShoppingBasket} />
      <StatCard label="Monthly revenue" value={inr(kpis.month_revenue)} helper="Current calendar month" icon={TrendingUp} />
      <StatCard label="Transactions" value={kpis.today_transactions} helper={`${inr(kpis.average_bill)} average bill`} icon={ReceiptText} />
      <StatCard label="Best-selling product" value={kpis.best_seller} helper={`By units · last ${days} days`} icon={Trophy} />
      <StatCard label="Stock alerts" value={kpis.low_stock_count} helper="Low or out of stock" icon={PackageMinus} tone={kpis.low_stock_count ? 'gold' : 'plain'} />
    </div>

    <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
      <section className="card p-5 xl:col-span-2">
        <SectionTitle title="Sales overview" subtitle={`Daily recorded revenue · last ${days} days`}>
          <Badge tone="green" dot>Live records</Badge>
        </SectionTitle>
        <div className="h-[275px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.trend} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
              <defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16745f" stopOpacity={0.25}/><stop offset="95%" stopColor="#16745f" stopOpacity={0.01}/></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#e8ede9" strokeDasharray="3 3" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} interval={days > 30 ? 13 : days > 14 ? 4 : 1} dy={8} />
              <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `₹${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="rounded-xl border border-[#dfe6e1] bg-white p-3 text-xs shadow-float"><div className="mb-1 font-bold">{label}</div><div className="text-forest-600">Revenue: <b>{inr(payload[0].value)}</b></div><div className="mt-1 text-muted">{payload[0].payload.transactions} transactions · {payload[0].payload.items} items</div></div> : null} />
              <Area type="monotone" dataKey="revenue" stroke="#0f5c4d" strokeWidth={2.5} fill="url(#salesFill)" activeDot={{ r: 5, fill: '#f2a516', stroke: '#fff', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl bg-forest-600 p-5 text-white shadow-card">
        <div className="absolute -bottom-12 -right-8 h-40 w-40 rounded-full border-[35px] border-white/[.035]" />
        <div className="relative flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-xl bg-saffron-500 text-forest-900"><Lightbulb size={17} /></div><div><h2 className="text-[15px] font-bold">Business insights</h2><p className="text-[10px] text-white/50">Grounded in your records</p></div></div>
        <div className="relative mt-5 space-y-3">
          {data.insights.map((insight, index) => <div key={index} className="flex gap-3 rounded-xl bg-white/[.07] p-3 text-xs leading-5 text-white/85"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 text-[9px] font-bold text-saffron-400">{index + 1}</span><span>{insight}</span></div>)}
        </div>
        <button onClick={() => navigate('vihzi')} className="relative mt-5 flex items-center gap-2 text-xs font-semibold text-saffron-400 hover:text-saffron-100">Ask Vihzi about your shop <ArrowRight size={14} /></button>
      </section>
    </div>

    <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
      <section className="card p-5 xl:col-span-2">
        <SectionTitle title="Product performance" subtitle={`Units and revenue · last ${days} days`}><button onClick={() => navigate('products')} className="flex items-center gap-1 text-xs font-semibold text-forest-600">View catalogue <ChevronRight size={14} /></button></SectionTitle>
        {data.top_products.length ? <div className="overflow-x-auto"><table className="w-full min-w-[540px] border-collapse"><thead><tr className="table-head"><th className="px-3 py-2.5">Product</th><th className="px-3 py-2.5">Category</th><th className="px-3 py-2.5 text-right">Units sold</th><th className="px-3 py-2.5 text-right">Revenue</th><th className="px-3 py-2.5">Performance</th></tr></thead><tbody>
          {data.top_products.slice(0, 5).map((product, index) => <tr key={product.id} className="transition hover:bg-[#fafbf9]"><td className="table-cell !px-3"><div className="flex items-center gap-2.5"><div className="grid h-8 w-8 place-items-center rounded-lg bg-forest-50 text-forest-600"><Package size={15} /></div><div><div className="font-semibold">{product.name}</div><div className="text-[10px] text-muted">{product.sku}</div></div></div></td><td className="table-cell !px-3 text-muted">{product.category}</td><td className="table-cell !px-3 text-right font-semibold">{product.sold_30}</td><td className="table-cell !px-3 text-right">{inr(product.revenue_30)}</td><td className="table-cell !px-3"><Badge tone={product.performance === 'Selling well' ? 'green' : product.performance === 'Slow moving' ? 'gold' : 'grey'}>{product.performance}</Badge></td></tr>)}
        </tbody></table></div> : <EmptyState title="No product performance yet" description="Completed customer bills will appear here automatically." action={<button className="btn-primary" onClick={() => navigate('billing')}>Create first bill</button>} />}
      </section>

      <section className="card p-5">
        <SectionTitle title="Inventory alerts" subtitle="Products at or below reorder level"><button onClick={() => navigate('stock')} className="text-xs font-semibold text-forest-600">Manage</button></SectionTitle>
        {data.alerts.length ? <div className="space-y-2.5">{data.alerts.slice(0, 5).map((product) => <button key={product.id} onClick={() => navigate('stock')} className="flex w-full items-center gap-3 rounded-xl border border-[#edf0ed] p-3 text-left transition hover:border-saffron-400">
          <div className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', product.status === 'out' ? 'bg-red-50 text-red-600' : 'bg-saffron-50 text-saffron-600')}><PackageMinus size={17} /></div>
          <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{product.name}</div><div className="text-[10px] text-muted">{product.stock} left · reorder at {product.reorder_threshold}</div></div>
          <Badge tone={product.status === 'out' ? 'red' : 'gold'}>{product.status === 'out' ? 'Out' : 'Low'}</Badge>
        </button>)}</div> : <EmptyState icon={Package} title="Everything is well stocked" description="No products are below their configured reorder thresholds." />}
      </section>
    </div>

    <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
      <section className="card p-5 lg:col-span-2">
        <SectionTitle title="Recent transactions" subtitle="Latest completed and refunded bills"><button onClick={() => navigate('sales')} className="flex items-center gap-1 text-xs font-semibold text-forest-600">All sales <ChevronRight size={14} /></button></SectionTitle>
        <div className="space-y-1">{data.recent_sales.length ? data.recent_sales.map((sale) => <button onClick={() => navigate('sales')} key={sale.id} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-[#fafbf9]"><div className="grid h-9 w-9 place-items-center rounded-xl bg-forest-50 text-forest-600"><ReceiptText size={16} /></div><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{sale.bill_number}</div><div className="text-[10px] text-muted">{formatDate(sale.created_at, true)} · {sale.item_count} items</div></div><Badge tone={sale.status === 'Paid' ? 'green' : 'grey'}>{sale.payment_method}</Badge><div className="w-20 text-right text-xs font-bold">{inr(sale.total)}</div></button>) : <EmptyState title="No transactions yet" description="Your latest customer bills will appear here." />}</div>
      </section>
      <section className="card p-5">
        <SectionTitle title="Category contribution" subtitle="Product revenue before tax and discounts" />
        {data.categories.length ? <><div className="h-[155px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.categories} dataKey="value" innerRadius={47} outerRadius={68} paddingAngle={3} stroke="none">{data.categories.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => inr(value)} /></PieChart></ResponsiveContainer></div><div className="mt-2 space-y-2">{data.categories.slice(0, 4).map((category, index) => <div key={category.name} className="flex items-center gap-2 text-xs"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[index % COLORS.length] }} /><span className="flex-1 text-muted">{category.name}</span><span className="font-semibold">{inr(category.value)}</span></div>)}</div></> : <EmptyState title="No category revenue" description="Sales by category will be shown after your first completed bill." />}
      </section>
    </div>
  </>;
}
