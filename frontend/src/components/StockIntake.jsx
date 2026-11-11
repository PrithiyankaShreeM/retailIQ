import { useRef, useState } from 'react';
import {
  UploadCloud, FileSpreadsheet, FileText, CheckCircle2, AlertCircle,
  Plus, Trash2, ArrowLeft, Download, PackagePlus, ShieldCheck,
} from 'lucide-react';
import { post } from '../api';
import { cx, inr, downloadText } from '../utils';
import { Modal, Badge } from './UI';
import { useApp } from '../context';

export default function StockIntake({ open, onClose, products, initialMode = 'upload', onSaved }) {
  const { notify } = useApp();
  const [mode, setMode] = useState(initialMode);
  const [supplier, setSupplier] = useState('');
  const [invoice, setInvoice] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [rows, setRows] = useState([{ product_id: '', quantity: 1, unit_cost: 0 }]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const resetAndClose = () => { setSupplier(''); setInvoice(''); setNotes(''); setFile(null); setPreview(null); setRows([{ product_id: '', quantity: 1, unit_cost: 0 }]); setBusy(false); onClose(); };
  const chooseFile = (selected) => { if (selected) { setFile(selected); setPreview(null); } };
  const uploadPreview = async () => {
    if (!file) { notify('Choose a supplier CSV, XLSX or PDF first', 'error'); return; }
    if (!supplier.trim()) { notify('Enter the supplier name before reviewing this stock file', 'error'); return; }
    setBusy(true);
    const body = new FormData(); body.append('file', file);
    try { const result = await post('/imports/purchases/preview', body); setPreview(result); }
    catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  const confirmImport = async () => {
    const validRows = preview.rows.filter((row) => row.valid && Number(row.quantity) > 0);
    if (!validRows.length) return;
    setBusy(true);
    try {
      const purchase = await post('/purchases', {
        supplier_name: supplier, invoice_number: invoice, notes,
        source: preview.source, original_filename: preview.filename,
        items: validRows.map((row) => ({ product_id: row.product_id, quantity: Number(row.quantity), unit_cost: Number(row.unit_cost || 0) })),
      });
      notify(`${purchase.purchase_number} saved: ${validRows.length} stock row(s) received`, 'success');
      onSaved(); resetAndClose();
    } catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  const saveManual = async () => {
    const valid = rows.filter((row) => row.product_id && Number(row.quantity) > 0);
    if (!supplier.trim() || !valid.length) { notify('Enter a supplier and at least one complete product row', 'error'); return; }
    setBusy(true);
    try {
      const purchase = await post('/purchases', {
        supplier_name: supplier, invoice_number: invoice, notes, source: 'Supplier Bill',
        items: valid.map((row) => ({ product_id: row.product_id, quantity: Number(row.quantity), unit_cost: Number(row.unit_cost || 0) })),
      });
      notify(`${purchase.purchase_number} saved. Stock and cost prices are updated.`, 'success'); onSaved(); resetAndClose();
    } catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  const updatePreview = (index, key, value) => setPreview((current) => ({ ...current, rows: current.rows.map((row, i) => i === index ? { ...row, [key]: value } : row) }));
  const template = () => {
    const sample = products.slice(0, 3);
    downloadText('retailiq-stock-template.csv', `product_id,product_name,quantity,unit_cost\n${sample.map((p) => `${p.sku},"${p.name}",10,${p.cost_price || 0}`).join('\n')}\n`);
  };
  const totalUnits = preview ? preview.rows.filter((row) => row.valid).reduce((sum, row) => sum + Number(row.quantity || 0), 0) : 0;

  return <Modal open={open} onClose={resetAndClose} title="Receive supplier stock" description="One pipeline for supplier bills and stock files: validate → review → purchase record → stock movement." size="xl">
    {!preview && <div className="mb-5 grid grid-cols-2 rounded-xl bg-[#f1f4f1] p-1"><button onClick={() => setMode('upload')} className={cx('rounded-lg px-3 py-2.5 text-xs font-semibold transition', mode === 'upload' ? 'bg-white text-forest-700 shadow-sm' : 'text-muted')}><UploadCloud size={15} className="mr-2 inline" />Upload stock file</button><button onClick={() => setMode('manual')} className={cx('rounded-lg px-3 py-2.5 text-xs font-semibold transition', mode === 'manual' ? 'bg-white text-forest-700 shadow-sm' : 'text-muted')}><PackagePlus size={15} className="mr-2 inline" />Enter supplier bill</button></div>}

    {!preview && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><label className="label">Supplier name *</label><input className="input" placeholder="e.g. Chennai Wholesale Mart" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div><div><label className="label">Supplier invoice number</label><input className="input" placeholder="Used to prevent duplicate imports" value={invoice} onChange={(e) => setInvoice(e.target.value)} /></div></div>}

    {!preview && mode === 'upload' && <div className="mt-5">
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.pdf" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0])} />
      <button onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); chooseFile(e.dataTransfer.files?.[0]); }} className={cx('flex w-full flex-col items-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition', file ? 'border-forest-500 bg-forest-50' : 'border-[#cdd9d0] bg-[#fafbf9] hover:border-forest-500')}>
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-forest-600 shadow-sm">{file ? <CheckCircle2 size={26} /> : <UploadCloud size={26} />}</div>
        <div className="mt-3 text-sm font-bold">{file ? file.name : 'Drop your supplier bill here, or browse'}</div>
        <p className="mt-1 text-xs text-muted">{file ? `${(file.size / 1024).toFixed(1)} KB · Ready to validate` : 'CSV, Excel (.xlsx) or PDF · maximum 6 MB'}</p>
      </button>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="rounded-xl bg-[#f6f8f5] p-3"><FileSpreadsheet size={17} className="text-forest-500" /><div className="mt-2 text-xs font-bold">CSV / Excel</div><p className="mt-1 text-[10px] leading-4 text-muted">Columns: product_id, quantity, unit_cost. Product name is optional.</p></div><div className="rounded-xl bg-[#f6f8f5] p-3"><FileText size={17} className="text-saffron-600" /><div className="mt-2 text-xs font-bold">PDF supplier bill</div><p className="mt-1 text-[10px] leading-4 text-muted">Text is extracted for preview. Confirm every row before stock changes.</p></div><div className="rounded-xl bg-[#f6f8f5] p-3"><ShieldCheck size={17} className="text-forest-500" /><div className="mt-2 text-xs font-bold">Nothing auto-posts</div><p className="mt-1 text-[10px] leading-4 text-muted">Unknown products and invalid quantities are rejected before confirmation.</p></div></div>
      <div className="mt-4 flex items-center justify-between gap-3"><button onClick={template} className="flex items-center gap-1.5 text-xs font-semibold text-forest-600 hover:underline"><Download size={14} /> Download CSV template</button><button onClick={uploadPreview} disabled={!file || busy} className="btn-primary">{busy ? 'Validating file…' : 'Preview & validate'}</button></div>
    </div>}

    {!preview && mode === 'manual' && <div className="mt-5">
      <div className="overflow-x-auto rounded-xl border border-[#e1e7e2]"><table className="w-full min-w-[620px]"><thead><tr className="table-head"><th className="px-3 py-2.5">Product received</th><th className="px-3 py-2.5">Quantity</th><th className="px-3 py-2.5">Unit cost ₹</th><th className="px-3 py-2.5 text-right">Line cost</th><th className="w-10" /></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><td className="table-cell !px-3 !py-2"><select className="input !py-2" value={row.product_id} onChange={(e) => { const product = products.find((p) => p.id === e.target.value); setRows((current) => current.map((item, i) => i === index ? { ...item, product_id: e.target.value, unit_cost: product?.cost_price || item.unit_cost } : item)); }}><option value="">Select product…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></td><td className="table-cell !px-3 !py-2"><input type="number" min="1" className="input !w-24 !py-2" value={row.quantity} onChange={(e) => setRows((current) => current.map((item, i) => i === index ? { ...item, quantity: e.target.value } : item))} /></td><td className="table-cell !px-3 !py-2"><input type="number" min="0" step="0.01" className="input !w-28 !py-2" value={row.unit_cost} onChange={(e) => setRows((current) => current.map((item, i) => i === index ? { ...item, unit_cost: e.target.value } : item))} /></td><td className="table-cell !px-3 !py-2 text-right font-semibold">{inr(Number(row.quantity || 0) * Number(row.unit_cost || 0))}</td><td className="table-cell !px-2 !py-2"><button disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((_, i) => i !== index))} className="icon-btn !h-8 !w-8 hover:text-red-600"><Trash2 size={14} /></button></td></tr>)}</tbody></table></div>
      <button className="btn-soft mt-3" onClick={() => setRows((current) => [...current, { product_id: '', quantity: 1, unit_cost: 0 }])}><Plus size={15} /> Add another product</button>
      <div className="mt-4"><label className="label">Notes (optional)</label><input className="input" placeholder="Delivery note, damaged items or other remarks" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="mt-5 flex items-center justify-between border-t border-[#e4eae5] pt-4"><div className="text-xs text-muted">Total purchase cost <b className="ml-2 text-base text-ink">{inr(rows.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.unit_cost || 0), 0))}</b></div><button className="btn-primary" disabled={busy} onClick={saveManual}>{busy ? 'Saving stock…' : 'Confirm & receive stock'}</button></div>
    </div>}

    {preview && <div>
      <button className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-forest-600" onClick={() => setPreview(null)}><ArrowLeft size={14} /> Back to upload</button>
      <div className="flex flex-col justify-between gap-3 rounded-2xl bg-forest-50 p-4 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2 text-sm font-bold text-forest-700"><FileSpreadsheet size={18} />{preview.filename}</div><p className="mt-1 text-[11px] text-muted">{supplier}{invoice ? ` · Invoice ${invoice}` : ''} · {preview.source}</p></div><div className="flex gap-2"><Badge tone="green">{preview.valid_count} valid</Badge><Badge tone={preview.error_count ? 'red' : 'grey'}>{preview.error_count} errors</Badge></div></div>
      {preview.source === 'PDF Import' && <div className="mt-3 rounded-xl border border-saffron-100 bg-saffron-50 p-3 text-xs leading-5 text-[#76500b]"><b>PDF confirmation required:</b> Layouts vary between suppliers. Check the Product ID, quantities and costs below against the original bill.</div>}
      <div className="mt-4 max-h-[360px] overflow-auto rounded-xl border border-[#e1e7e2]"><table className="w-full min-w-[720px]"><thead className="sticky top-0"><tr className="table-head"><th className="px-3 py-2.5">Row</th><th className="px-3 py-2.5">Product</th><th className="px-3 py-2.5">Quantity</th><th className="px-3 py-2.5">Unit cost ₹</th><th className="px-3 py-2.5">Validation</th></tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index} className={row.valid ? '' : 'bg-red-50/40'}><td className="table-cell !px-3 text-muted">{row.row}</td><td className="table-cell !px-3"><div className="font-semibold">{row.product_name || 'Unknown product'}</div><div className="font-mono text-[10px] text-muted">{row.sku || 'No Product ID'}</div></td><td className="table-cell !px-3"><input disabled={!row.valid} type="number" min="1" className="input !w-24 !py-1.5" value={row.quantity} onChange={(e) => updatePreview(index, 'quantity', e.target.value)} /></td><td className="table-cell !px-3"><input disabled={!row.valid} type="number" min="0" className="input !w-28 !py-1.5" value={row.unit_cost} onChange={(e) => updatePreview(index, 'unit_cost', e.target.value)} /></td><td className="table-cell !px-3">{row.valid ? <span className="flex items-center gap-1.5 text-xs font-semibold text-forest-600"><CheckCircle2 size={15} /> Ready</span> : <span className="flex max-w-[240px] items-start gap-1.5 text-[11px] leading-4 text-red-600"><AlertCircle size={15} className="shrink-0" />{row.error}</span>}</td></tr>)}</tbody></table></div>
      {preview.error_count > 0 && <p className="mt-3 text-[11px] leading-5 text-muted">Rows with errors will not be imported. Add missing products in My Products, then upload the file again to include them.</p>}
      <div className="mt-5 flex flex-col items-end justify-between gap-3 border-t border-[#e4eae5] pt-4 sm:flex-row sm:items-center"><div className="text-xs text-muted"><b>{totalUnits} units</b> will be added to current stock.<br />A purchase and stock movement will be recorded for every valid row.</div><button className="btn-primary" disabled={busy || !preview.valid_count} onClick={confirmImport}><CheckCircle2 size={16} />{busy ? 'Receiving stock…' : `Confirm ${preview.valid_count} stock row(s)`}</button></div>
    </div>}
  </Modal>;
}
