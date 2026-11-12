import { useEffect, useMemo, useState } from 'react';
import {
  Boxes, PackageMinus, PackageX, IndianRupee, UploadCloud, FilePlus2,
  Search, PackagePlus, SlidersHorizontal, History, ClipboardList, ArrowUpRight,
  ArrowDownRight, Truck, Eye, AlertTriangle, Download, CheckCircle2,
} from 'lucide-react';
import { get, post } from '../api';
import { cx, inr, formatDate, stockLabel, downloadText } from '../utils';
import { PageHeader, StatCard, Badge, Modal, EmptyState, Loading } from '../components/UI';
import StockIntake from '../components/StockIntake';
import { useApp } from '../context';

export default function Stock() {
  const { notify, refreshStore } = useApp();
  const [data, setData] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [tab, setTab] = useState('inventory');
  const [search, setSearch] = useState('');
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeMode, setIntakeMode] = useState('upload');
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [adjustment, setAdjustment] = useState({ direction: 'add', quantity: 1, reason: '' });
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    Promise.all([get('/inventory'), get('/purchases')]).then(([inventoryData, purchaseData]) => { setData(inventoryData); setPurchases(purchaseData.purchases); }).catch((error) => notify(error.message, 'error'));
  };
  useEffect(load, []);
  const products = data?.products || [];
  const filtered = useMemo(() => products.filter((p) => `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(search.toLowerCase())), [products, search]);
  const openIntake = (mode) => { setIntakeMode(mode); setIntakeOpen(true); };
  const saveAdjustment = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await post('/inventory/adjust', { product_id: adjustProduct.id, ...adjustment, quantity: Number(adjustment.quantity) }); notify('Stock adjustment recorded in movement history', 'success'); setAdjustProduct(null); setAdjustment({ direction: 'add', quantity: 1, reason: '' }); load(); refreshStore(); }
    catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  const exportMovements = () => {
    const rows = [['date', 'product_id', 'product', 'type', 'quantity', 'balance_after', 'reference', 'note'], ...data.movements.map((m) => [m.created_at, m.sku, m.product_name, m.type, m.quantity, m.balance_after, m.reference, m.note])];
    downloadText('retailiq-stock-movements.csv', rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n'));
  };
  if (!data) return <Loading label="Reconciling stock and supplier purchases…" />;
  const summary = data.summary;
  const attention = products.filter((p) => p.status !== 'ok' || (p.days_left !== null && p.days_left <= 7)).sort((a, b) => (a.days_left ?? 999) - (b.days_left ?? 999));

  return <>
    <PageHeader eyebrow="Inventory & supplier purchases" title="My Stock" description="Know what you have, where every unit came from, and what needs reordering. Customer bills reduce stock; supplier bills and stock files increase it.">
      <button className="btn-secondary" onClick={() => openIntake('manual')}><FilePlus2 size={16} /> Enter supplier bill</button><button className="btn-primary" onClick={() => openIntake('upload')}><UploadCloud size={16} /> Upload stock file</button>
    </PageHeader>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatCard label="Registered products" value={summary.products} helper="Active catalogue records" icon={Boxes} />
      <StatCard label="Units in stock" value={summary.units.toLocaleString('en-IN')} helper="Current available quantity" icon={PackagePlus} tone="hero" />
      <StatCard label="Low-stock products" value={summary.low_stock} helper="At or below reorder level" icon={PackageMinus} tone={summary.low_stock ? 'gold' : 'plain'} />
      <StatCard label="Out of stock" value={summary.out_of_stock} helper="Unavailable for billing" icon={PackageX} tone={summary.out_of_stock ? 'gold' : 'plain'} />
      <StatCard label="Stock cost value" value={inr(summary.stock_value)} helper="Using latest purchase costs" icon={IndianRupee} />
    </div>

    <div className="mt-5 overflow-hidden rounded-2xl bg-forest-600 text-white shadow-card">
      <div className="flex flex-col items-start justify-between gap-4 p-5 lg:flex-row lg:items-center"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-saffron-500 text-forest-900"><Truck size={20} /></div><div><h2 className="text-sm font-bold">Stock intake is connected end to end</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-white/60">Upload the shopkeeper’s supplier bill as CSV, Excel or PDF—or type it manually. Validated rows create a purchase record, update product costs and quantities, and preserve a movement audit trail.</p></div></div><div className="flex items-center gap-2 text-[10px] font-semibold text-white/65"><span className="rounded-lg bg-white/10 px-3 py-2">1. Validate</span><span>→</span><span className="rounded-lg bg-white/10 px-3 py-2">2. Confirm</span><span>→</span><span className="rounded-lg bg-saffron-500 px-3 py-2 text-forest-900">3. Stock updated</span></div></div>
    </div>

    <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
      <section className="card overflow-hidden xl:col-span-2">
        <div className="flex flex-col gap-3 border-b border-[#e4eae5] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex rounded-xl bg-[#f1f4f1] p-1">{[{ id: 'inventory', label: 'Current stock', icon: Boxes }, { id: 'purchases', label: 'Purchase bills', icon: ClipboardList }, { id: 'movements', label: 'Movements', icon: History }].map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={cx('flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition', tab === id ? 'bg-white text-forest-700 shadow-sm' : 'text-muted')}><Icon size={14} />{label}</button>)}</div>{tab === 'inventory' ? <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input className="input !w-52 !py-2 !pl-9" placeholder="Find product…" value={search} onChange={(e) => setSearch(e.target.value)} /></div> : tab === 'movements' ? <button onClick={exportMovements} className="icon-btn" title="Export movements"><Download size={17} /></button> : <Badge tone="grey">{purchases.length} purchase(s)</Badge>}</div>

        {tab === 'inventory' && (filtered.length ? <div className="max-h-[600px] overflow-auto"><table className="w-full min-w-[760px]"><thead className="sticky top-0 z-10"><tr className="table-head"><th className="px-5 py-3">Product</th><th className="px-4 py-3 text-right">Available</th><th className="px-4 py-3 text-right">Daily sales</th><th className="px-4 py-3 text-right">Days left</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody>{filtered.map((product) => <tr key={product.id} className="hover:bg-[#fafbf9]"><td className="table-cell !px-5"><div className="font-semibold">{product.name}</div><div className="mt-0.5 text-[10px] text-muted">{product.sku} · reorder at {product.reorder_threshold}</div></td><td className="table-cell text-right"><span className="text-base font-extrabold">{product.stock}</span><span className="ml-1 text-[10px] text-muted">units</span></td><td className="table-cell text-right text-muted">{product.daily_velocity}</td><td className="table-cell text-right"><span className={cx('font-semibold', product.days_left !== null && product.days_left <= 7 && 'text-orange-600')}>{product.days_left === null ? '—' : `${product.days_left} days`}</span></td><td className="table-cell"><Badge tone={product.status === 'out' ? 'red' : product.status === 'low' ? 'gold' : 'green'} dot>{stockLabel(product.status)}</Badge></td><td className="table-cell !px-5 text-right"><button className="btn-secondary !px-2.5 !py-1.5 !text-[11px]" onClick={() => setAdjustProduct(product)}><SlidersHorizontal size={13} /> Adjust</button></td></tr>)}</tbody></table></div> : <EmptyState title="No stock records found" description="Add products to your catalogue or clear the current search." />)}

        {tab === 'purchases' && (purchases.length ? <div className="max-h-[600px] overflow-auto"><table className="w-full min-w-[700px]"><thead><tr className="table-head"><th className="px-5 py-3">Purchase</th><th className="px-4 py-3">Supplier / invoice</th><th className="px-4 py-3">Source</th><th className="px-4 py-3 text-right">Units</th><th className="px-4 py-3 text-right">Cost</th><th className="px-5 py-3" /></tr></thead><tbody>{purchases.map((purchase) => <tr key={purchase.id} className="cursor-pointer hover:bg-[#fafbf9]" onClick={() => setSelectedPurchase(purchase)}><td className="table-cell !px-5"><div className="font-mono text-xs font-bold text-forest-600">{purchase.purchase_number}</div><div className="mt-0.5 text-[10px] text-muted">{formatDate(purchase.created_at, true)}</div></td><td className="table-cell"><div className="font-semibold">{purchase.supplier_name}</div><div className="text-[10px] text-muted">{purchase.invoice_number || 'No invoice number'}</div></td><td className="table-cell"><Badge tone={purchase.source.includes('Import') ? 'blue' : 'green'}>{purchase.source}</Badge>{purchase.original_filename && <div className="mt-1 max-w-[130px] truncate text-[9px] text-muted">{purchase.original_filename}</div>}</td><td className="table-cell text-right font-semibold">{purchase.items.reduce((sum, item) => sum + item.quantity, 0)}</td><td className="table-cell text-right font-semibold">{inr(purchase.total_cost)}</td><td className="table-cell !px-5 text-right"><Eye size={16} className="inline text-muted" /></td></tr>)}</tbody></table></div> : <EmptyState icon={Truck} title="No supplier purchases yet" description="Upload your first stock CSV or enter a supplier bill. Incoming quantities will be recorded here." action={<button className="btn-primary" onClick={() => openIntake('upload')}><UploadCloud size={15} /> Upload stock</button>} />)}

        {tab === 'movements' && (data.movements.length ? <div className="max-h-[600px] overflow-auto"><table className="w-full min-w-[700px]"><thead className="sticky top-0"><tr className="table-head"><th className="px-5 py-3">Date / product</th><th className="px-4 py-3">Movement</th><th className="px-4 py-3 text-right">Change</th><th className="px-4 py-3 text-right">Balance</th><th className="px-5 py-3">Reference</th></tr></thead><tbody>{data.movements.map((movement) => <tr key={movement.id}><td className="table-cell !px-5"><div className="font-semibold">{movement.product_name}</div><div className="mt-0.5 text-[10px] text-muted">{formatDate(movement.created_at, true)}</div></td><td className="table-cell"><Badge tone={movement.type === 'sale' ? 'grey' : movement.type === 'purchase' ? 'green' : movement.type === 'return' ? 'blue' : 'gold'}>{movement.type}</Badge><div className="mt-1 max-w-[180px] truncate text-[9px] text-muted" title={movement.note}>{movement.note}</div></td><td className="table-cell text-right"><span className={cx('inline-flex items-center gap-1 font-bold', movement.quantity >= 0 ? 'text-forest-600' : 'text-red-600')}>{movement.quantity >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{movement.quantity > 0 ? '+' : ''}{movement.quantity}</span></td><td className="table-cell text-right font-semibold">{movement.balance_after}</td><td className="table-cell !px-5 font-mono text-[10px] text-muted">{movement.reference || '—'}</td></tr>)}</tbody></table></div> : <EmptyState icon={History} title="No stock movements" description="Purchases, sales, returns and adjustments will appear here." />)}
      </section>

      <section className="card h-fit p-5"><div className="flex items-start justify-between"><div><h2 className="text-[15px] font-bold">Restocking suggestions</h2><p className="mt-0.5 text-xs text-muted">Current stock + recent sales velocity</p></div><div className="grid h-8 w-8 place-items-center rounded-xl bg-saffron-50 text-saffron-600"><AlertTriangle size={16} /></div></div>
        <div className="mt-4 space-y-3">{attention.length ? attention.slice(0, 6).map((product) => { const suggested = Math.max(product.reorder_threshold * 2 - product.stock, Math.ceil(product.daily_velocity * 10 - product.stock), 1); return <div key={product.id} className="rounded-xl border border-[#e6ebe7] p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-xs font-bold">{product.name}</div><div className="mt-1 text-[10px] text-muted">{product.stock} left · {product.daily_velocity}/day{product.days_left !== null ? ` · ~${product.days_left} days` : ''}</div></div><Badge tone={product.status === 'out' ? 'red' : 'gold'}>{product.status === 'out' ? 'Order now' : 'Restock'}</Badge></div><div className="mt-2.5 flex items-center justify-between rounded-lg bg-[#f6f8f5] px-2.5 py-2 text-[10px]"><span className="text-muted">Suggested quantity</span><b className="text-forest-700">+{suggested} units</b></div></div>; }) : <EmptyState icon={CheckCircle2} title="No urgent restocking" description="Products have sufficient stock for their recent sales pace and configured thresholds." />}</div>
        {attention.length > 0 && <button onClick={() => openIntake('manual')} className="btn-soft mt-4 w-full"><PackagePlus size={15} /> Record incoming stock</button>}
        <p className="mt-3 text-center text-[9px] leading-4 text-muted">Suggestions use a 30-day average and reorder thresholds. Supplier lead times are not included unless you allow for them.</p>
      </section>
    </div>

    {intakeOpen && <StockIntake key={intakeMode} open={intakeOpen} onClose={() => setIntakeOpen(false)} products={products.filter((p) => p.active)} initialMode={intakeMode} onSaved={() => { load(); refreshStore(); }} />}

    <Modal open={Boolean(adjustProduct)} onClose={() => setAdjustProduct(null)} title={`Adjust ${adjustProduct?.name || 'stock'}`} description="For corrections, damage or stock counts. Use a supplier purchase for normal incoming stock." size="sm">
      <form onSubmit={saveAdjustment}><div className="mb-4 rounded-xl bg-forest-50 p-3 text-xs text-forest-700">Current available stock: <b className="text-lg">{adjustProduct?.stock}</b> units</div><label className="label">Adjustment direction</label><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setAdjustment((a) => ({ ...a, direction: 'add' }))} className={cx('btn-secondary', adjustment.direction === 'add' && '!border-forest-600 !bg-forest-50')}>+ Add units</button><button type="button" onClick={() => setAdjustment((a) => ({ ...a, direction: 'remove' }))} className={cx('btn-secondary', adjustment.direction === 'remove' && '!border-red-500 !bg-red-50 !text-red-700')}>− Remove units</button></div><div className="mt-4"><label className="label">Quantity *</label><input required min="1" type="number" className="input" value={adjustment.quantity} onChange={(e) => setAdjustment((a) => ({ ...a, quantity: e.target.value }))} /></div><div className="mt-4"><label className="label">Reason *</label><textarea required minLength="2" className="input min-h-[85px]" placeholder="e.g. 2 packets damaged during delivery" value={adjustment.reason} onChange={(e) => setAdjustment((a) => ({ ...a, reason: e.target.value }))} /></div><div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setAdjustProduct(null)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save audited adjustment'}</button></div></form>
    </Modal>

    <Modal open={Boolean(selectedPurchase)} onClose={() => setSelectedPurchase(null)} title={selectedPurchase?.purchase_number || ''} description={selectedPurchase ? `${selectedPurchase.supplier_name} · ${formatDate(selectedPurchase.created_at, true)}` : ''}>
      {selectedPurchase && <><div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-[#f6f8f5] p-4 text-xs"><div><span className="text-muted">Supplier invoice</span><div className="mt-1 font-semibold">{selectedPurchase.invoice_number || 'Not provided'}</div></div><div><span className="text-muted">Recorded source</span><div className="mt-1"><Badge tone="green">{selectedPurchase.source}</Badge></div></div>{selectedPurchase.original_filename && <div className="col-span-2"><span className="text-muted">Original file</span><div className="mt-1 font-semibold">{selectedPurchase.original_filename}</div></div>}</div><table className="w-full"><thead><tr className="table-head"><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2 text-right">Unit cost</th><th className="px-3 py-2 text-right">Total</th></tr></thead><tbody>{selectedPurchase.items.map((item) => <tr key={item.product_id}><td className="table-cell !px-3 font-semibold">{item.product_name}</td><td className="table-cell !px-3 text-right">+{item.quantity}</td><td className="table-cell !px-3 text-right">{inr(item.unit_cost)}</td><td className="table-cell !px-3 text-right">{inr(item.line_total)}</td></tr>)}</tbody></table><div className="mt-4 flex items-center justify-between border-t border-[#e4eae5] pt-4"><span className="text-xs text-muted">Total purchase cost</span><span className="text-xl font-extrabold text-forest-600">{inr(selectedPurchase.total_cost)}</span></div><div className="mt-3 flex items-center gap-2 rounded-xl bg-forest-50 p-3 text-xs text-forest-700"><CheckCircle2 size={16} /> All quantities are included in current stock and movement history.</div></>}
    </Modal>
  </>;
}
