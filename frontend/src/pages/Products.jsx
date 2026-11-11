import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Plus, Search, Download, Pencil, QrCode, Package, Tag, Printer,
  MoreHorizontal, Boxes, ArrowDownToLine,
} from 'lucide-react';
import { get, post, patch } from '../api';
import { inr, stockLabel, downloadText } from '../utils';
import { PageHeader, Badge, Modal, EmptyState, Loading } from '../components/UI';
import { useApp } from '../context';

const blank = { name: '', sku: '', category: 'Grocery', selling_price: '', cost_price: '', initial_stock: 0, reorder_threshold: 5, description: '' };

export default function Products() {
  const { notify, navigate } = useApp();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [qrProduct, setQrProduct] = useState(null);
  const qrRef = useRef(null);

  const load = () => { setLoading(true); get('/products').then((data) => { setProducts(data.products); setCategories(data.categories); }).catch((e) => notify(e.message, 'error')).finally(() => setLoading(false)); };
  useEffect(load, []);
  const filtered = products.filter((product) => (!category || product.category === category) && `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase()));
  const openAdd = () => { setEditing(null); setForm(blank); setFormOpen(true); };
  const openEdit = (product) => { setEditing(product); setForm({ ...product, initial_stock: product.stock, cost_price: product.cost_price || '' }); setFormOpen(true); };
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async (event) => {
    event.preventDefault(); setSaving(true);
    try {
      if (editing) {
        await patch(`/products/${editing.id}`, {
          name: form.name, category: form.category, description: form.description,
          selling_price: Number(form.selling_price), cost_price: Number(form.cost_price || 0),
          reorder_threshold: Number(form.reorder_threshold), active: form.active,
        });
        notify('Product details updated. Existing bill prices remain unchanged.', 'success');
      } else {
        const product = await post('/products', { ...form, sku: form.sku || null, selling_price: Number(form.selling_price), cost_price: Number(form.cost_price || 0), initial_stock: Number(form.initial_stock || 0), reorder_threshold: Number(form.reorder_threshold || 0) });
        notify(`${product.name} registered with QR reference ${product.sku}`, 'success');
        setQrProduct(product);
      }
      setFormOpen(false); load();
    } catch (error) { notify(error.message, 'error'); }
    finally { setSaving(false); }
  };
  const downloadQr = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 980;
    const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, 800, 980);
    const image = new Image();
    image.onload = () => {
      context.drawImage(image, 100, 60, 600, 600);
      context.fillStyle = '#14231f'; context.textAlign = 'center'; context.font = 'bold 38px sans-serif'; context.fillText(qrProduct.name, 400, 740);
      context.font = '30px monospace'; context.fillText(qrProduct.sku, 400, 800);
      context.font = '24px sans-serif'; context.fillStyle = '#64746f'; context.fillText('Scan with RetailIQ', 400, 870);
      const link = document.createElement('a'); link.download = `${qrProduct.sku}-retailiq-label.png`; link.href = canvas.toDataURL('image/png'); link.click();
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  };
  const exportCatalogue = () => {
    const rows = [['product_id', 'product_name', 'category', 'selling_price', 'stock', 'reorder_threshold'], ...products.map((p) => [p.sku, p.name, p.category, p.selling_price, p.stock, p.reorder_threshold])];
    downloadText('retailiq-products.csv', rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n'));
  };

  return <>
    <PageHeader eyebrow="Product catalogue" title="My Products" description="Manage your catalogue, database-backed prices and printable QR labels. New stock is received separately through supplier bills in My Stock.">
      <button className="btn-secondary" onClick={exportCatalogue} disabled={!products.length}><ArrowDownToLine size={16} /> Export</button><button className="btn-primary" onClick={openAdd}><Plus size={17} /> Add product</button>
    </PageHeader>
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#e4eae5] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input className="input !pl-10" placeholder="Search products or Product ID…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="flex items-center gap-2"><Tag size={15} className="text-muted" /><select className="input !w-auto" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><Badge tone="grey">{filtered.length} products</Badge></div>
      </div>
      {loading ? <Loading label="Loading your product catalogue…" /> : filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[950px] border-collapse"><thead><tr className="table-head"><th className="px-5 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Selling price</th><th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3 text-right">Sold · 30d</th><th className="px-4 py-3">Performance</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody>
        {filtered.map((product) => <tr key={product.id} className="group transition hover:bg-[#fafbf9]"><td className="table-cell !px-5"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-forest-50 text-forest-600"><Package size={18} /></div><div><div className="font-semibold">{product.name}{!product.active && <Badge tone="grey">Inactive</Badge>}</div><div className="mt-0.5 font-mono text-[10px] text-muted">{product.sku}</div></div></div></td><td className="table-cell"><Badge tone="grey">{product.category}</Badge></td><td className="table-cell text-right font-semibold">{inr(product.selling_price)}</td><td className="table-cell text-right"><div className="font-semibold">{product.stock}</div><Badge tone={product.status === 'out' ? 'red' : product.status === 'low' ? 'gold' : 'green'}>{stockLabel(product.status)}</Badge></td><td className="table-cell text-right"><div className="font-semibold">{product.sold_30}</div><div className="text-[10px] text-muted">{inr(product.revenue_30)}</div></td><td className="table-cell"><Badge tone={product.performance === 'Selling well' ? 'green' : product.performance === 'Slow moving' ? 'gold' : 'grey'}>{product.performance}</Badge></td><td className="table-cell !px-5"><div className="flex justify-end gap-1"><button className="icon-btn !h-8 !w-8" title="View QR label" onClick={() => setQrProduct(product)}><QrCode size={16} /></button><button className="icon-btn !h-8 !w-8" title="Edit product" onClick={() => openEdit(product)}><Pencil size={15} /></button></div></td></tr>)}
      </tbody></table></div> : <EmptyState icon={Package} title={search || category ? 'No products match these filters' : 'Add your first product'} description={search || category ? 'Clear the search or choose another category.' : 'Register a product to generate its unique QR reference. You can then receive stock using a supplier bill.'} action={!search && !category && <button className="btn-primary" onClick={openAdd}><Plus size={16} /> Add product</button>} />}
    </section>
    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-saffron-100 bg-saffron-50 p-4 text-xs leading-5 text-[#76500b]"><Boxes size={18} className="mt-0.5 shrink-0" /><div><b>Stock has a clear source.</b> Opening stock is recorded when a product is created. Later quantities must come from a supplier purchase bill, CSV/Excel/PDF stock upload, or an audited manual adjustment in <button className="font-bold underline" onClick={() => navigate('stock')}>My Stock</button>—never from editing the selling price.</div></div>

    <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit ${editing.name}` : 'Register a new product'} description={editing ? `${editing.sku} · Stock changes are handled in My Stock for a complete audit trail.` : 'A unique Product ID and QR reference will be generated after registration.'}>
      <form onSubmit={save} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">Product name *</label><input required className="input" placeholder="e.g. Basmati Rice 1kg" value={form.name} onChange={(e) => update('name', e.target.value)} /></div>
        <div><label className="label">Product ID {editing ? '' : '(optional)'}</label><input className="input font-mono" placeholder="Auto-generated PRD011" value={form.sku} onChange={(e) => update('sku', e.target.value.toUpperCase())} disabled={Boolean(editing)} /></div>
        <div><label className="label">Category *</label><input required className="input" list="category-list" value={form.category} onChange={(e) => update('category', e.target.value)} /><datalist id="category-list">{categories.map((item) => <option key={item}>{item}</option>)}</datalist></div>
        <div><label className="label">Selling price (₹) *</label><input required min="0.01" step="0.01" type="number" className="input" value={form.selling_price} onChange={(e) => update('selling_price', e.target.value)} /></div>
        <div><label className="label">Cost price (₹)</label><input min="0" step="0.01" type="number" className="input" value={form.cost_price} onChange={(e) => update('cost_price', e.target.value)} /></div>
        {!editing && <div><label className="label">Opening stock quantity</label><input min="0" type="number" className="input" value={form.initial_stock} onChange={(e) => update('initial_stock', e.target.value)} /></div>}
        <div><label className="label">Reorder alert at *</label><input required min="0" type="number" className="input" value={form.reorder_threshold} onChange={(e) => update('reorder_threshold', e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="label">Description (optional)</label><textarea className="input min-h-[80px] resize-none" placeholder="Pack size, brand or other useful details" value={form.description || ''} onChange={(e) => update('description', e.target.value)} /></div>
        {editing && <label className="flex items-center gap-2 text-xs font-semibold sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-forest-600" checked={form.active} onChange={(e) => update('active', e.target.checked)} /> Available for billing</label>}
        <div className="flex justify-end gap-2 border-t border-[#e6ebe7] pt-4 sm:col-span-2"><button type="button" className="btn-secondary" onClick={() => setFormOpen(false)}>Cancel</button><button disabled={saving} className="btn-primary">{saving ? 'Saving…' : editing ? 'Save changes' : 'Register & create QR'}</button></div>
      </form>
    </Modal>

    <Modal open={Boolean(qrProduct)} onClose={() => setQrProduct(null)} title="Product QR label" description="The label carries only a product reference—not a price or editable stock value." size="sm">
      {qrProduct && <><div ref={qrRef} className="print-area mx-auto max-w-[310px] rounded-2xl border border-dashed border-[#bdc9c0] bg-white p-6 text-center"><div className="mb-4 text-xs font-bold text-forest-600">RetailIQ PRODUCT LABEL</div><QRCodeSVG value={qrProduct.qr_reference} size={210} level="H" includeMargin marginSize={1} className="mx-auto" /><h3 className="mt-4 text-base font-bold">{qrProduct.name}</h3><div className="mt-1 font-mono text-sm tracking-widest">{qrProduct.sku}</div><div className="mt-1 text-[10px] text-muted">Scan at RetailIQ checkout</div></div><div className="mt-5 rounded-xl bg-forest-50 p-3 text-[11px] leading-5 text-forest-700"><b>Database reference:</b> {qrProduct.qr_reference}<br />Current selling price: {inr(qrProduct.selling_price)} · fetched at billing time.</div><div className="mt-4 grid grid-cols-2 gap-2 no-print"><button className="btn-secondary" onClick={() => window.print()}><Printer size={16} /> Print label</button><button className="btn-primary" onClick={downloadQr}><Download size={16} /> Download PNG</button></div></>}
    </Modal>
  </>;
}
