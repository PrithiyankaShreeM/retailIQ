import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, ScanLine, Plus, Minus, Trash2, ShoppingCart, CreditCard, Banknote,
  Smartphone, ReceiptText, Printer, CheckCircle2, PackageSearch, Keyboard,
  Barcode, Zap,
} from 'lucide-react';
import { get, post } from '../api';
import { cx, inr, uuid } from '../utils';
import { PageHeader, Badge, Modal, EmptyState, Loading } from '../components/UI';
import QrScanner from '../components/QrScanner';
import Receipt from '../components/Receipt';
import { useApp } from '../context';

export default function Billing() {
  const { store, notify, refreshStore } = useApp();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [payment, setPayment] = useState('Cash');
  const [discount, setDiscount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const clientToken = useRef(uuid());

  const loadProducts = useCallback(() => {
    get('/products')
      .then((data) => setProducts(data.products.filter((p) => p.active)))
      .catch((e) => notify(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [notify]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const addProduct = useCallback(
    (product) => {
      if (product.stock <= 0) {
        notify(`${product.name} is out of stock. Receive incoming supplier stock first.`, 'error');
        return;
      }
      setCart((current) => {
        const existing = current[product.id];
        if ((existing?.quantity || 0) + 1 > product.stock) {
          notify(`Only ${product.stock} units of ${product.name} are available in stock.`, 'error');
          return current;
        }
        return {
          ...current,
          [product.id]: { product, quantity: (existing?.quantity || 0) + 1 },
        };
      });
    },
    [notify]
  );

  const scan = useCallback(
    async (reference) => {
      if (!reference) return;
      try {
        const product = await get(`/products/scan?reference=${encodeURIComponent(reference.trim())}`);
        addProduct(product);
        notify(`${product.name} added to cart`, 'success');
        setScannerOpen(false);
        setManualCode('');
      } catch (error) {
        notify(error.message, 'error');
      }
    },
    [addProduct, notify]
  );

  const filtered = products.filter((product) =>
    `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(search.toLowerCase())
  );
  const lines = Object.values(cart);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + line.product.selling_price * line.quantity, 0);
    const safeDiscount = Math.min(Number(discount) || 0, subtotal);
    const tax = ((subtotal - safeDiscount) * Number(store?.tax_rate || 5)) / 100;
    return {
      subtotal,
      discount: safeDiscount,
      tax,
      total: subtotal - safeDiscount + tax,
      items: lines.reduce((sum, line) => sum + line.quantity, 0),
    };
  }, [lines, discount, store]);

  const setQuantity = (product, quantity) => {
    if (quantity <= 0) {
      setCart((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
      return;
    }
    if (quantity > product.stock) {
      notify(`Only ${product.stock} units in stock for ${product.name}`, 'error');
      return;
    }
    setCart((current) => ({ ...current, [product.id]: { product, quantity } }));
  };

  const completeSale = async () => {
    if (!lines.length || submitting) return;
    setSubmitting(true);
    try {
      const sale = await post('/sales', {
        client_token: clientToken.current,
        items: lines.map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
        payment_method: payment,
        discount: totals.discount,
      });
      setReceipt(sale);
      setCart({});
      setDiscount(0);
      clientToken.current = uuid();
      notify(`Bill ${sale.bill_number} generated! Stock updated in database.`, 'success');
      loadProducts();
      refreshStore();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const searchKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    const term = search.trim();
    if (!term) return;

    // Check exact SKU match
    const exact = products.find((product) => product.sku.toLowerCase() === term.toLowerCase());
    if (exact) {
      addProduct(exact);
      setSearch('');
      notify(`${exact.name} added to bill`, 'success');
      return;
    }

    // Single search result match
    if (filtered.length === 1) {
      addProduct(filtered[0]);
      setSearch('');
      notify(`${filtered[0].name} added to bill`, 'success');
      return;
    }

    // Try scanning reference endpoint (handles barcodes, RETAILIQ: prefixes)
    scan(term);
    setSearch('');
  };

  return (
    <>
      <PageHeader
        eyebrow="Point of Sale"
        title="POS Billing & Counter Checkout"
        description="Scan product QR codes or barcodes, or search your live catalogue. Inventory and prices are atomically updated upon payment."
      >
        <button className="btn-primary" onClick={() => setScannerOpen(true)}>
          <ScanLine size={17} /> Scan Barcode / QR
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_460px]">
        {/* Left Column: Catalogue & Search */}
        <section className="card overflow-hidden">
          <div className="border-b border-[#e6ebe7] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold">Find a product</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Type name/Product ID, scan barcode, or select a product tile below.
                </p>
              </div>
              <Badge tone="green" dot>Live Catalogue ({products.length})</Badge>
            </div>
            <div className="relative mt-4">
              <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="input !py-3 !pl-10 !pr-10"
                placeholder="Search by name, SKU (e.g. PRD001), barcode, or category…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={searchKeyDown}
                autoFocus
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-ink"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <Loading label="Loading product prices and current stock…" />
          ) : filtered.length ? (
            <div className="grid max-h-[670px] grid-cols-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
              {filtered.map((product) => (
                <button
                  key={product.id}
                  disabled={!product.active || product.stock <= 0}
                  onClick={() => addProduct(product)}
                  className={cx(
                    'group relative rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-card',
                    product.status === 'out'
                      ? 'border-red-100 bg-red-50/30 opacity-60'
                      : 'border-[#e1e7e2] bg-white hover:border-forest-500'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div
                      className={cx(
                        'grid h-10 w-10 place-items-center rounded-xl font-bold',
                        product.status === 'out' ? 'bg-red-100 text-red-500' : 'bg-forest-50 text-forest-600'
                      )}
                    >
                      <PackageSearch size={19} />
                    </div>
                    <Badge tone={product.status === 'out' ? 'red' : product.status === 'low' ? 'gold' : 'grey'}>
                      {product.status === 'out' ? 'Out of stock' : `${product.stock} in stock`}
                    </Badge>
                  </div>
                  <div className="mt-4 line-clamp-2 min-h-[40px] text-sm font-bold leading-5">{product.name}</div>
                  <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted">
                    {product.sku} · {product.category}
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div className="text-lg font-extrabold text-forest-600">{inr(product.selling_price)}</div>
                    <div className="grid h-7 w-7 place-items-center rounded-lg bg-forest-600 text-white opacity-80 transition group-hover:opacity-100">
                      <Plus size={15} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title={search ? 'No matching products' : 'Your catalogue is empty'}
              description={
                search
                  ? 'Try another name or Product ID, or scan the QR/barcode label.'
                  : 'Add products in My Products before starting a customer bill.'
              }
            />
          )}
        </section>

        {/* Right Column: Active Cart & POS Checkout */}
        <section className="card sticky top-[88px] overflow-hidden">
          <div className="flex items-center justify-between bg-forest-600 px-5 py-4 text-white">
            <div>
              <h2 className="text-sm font-bold">Current Customer Bill</h2>
              <p className="mt-0.5 text-[10px] text-white/70">
                New transaction · {totals.items} item(s) in cart
              </p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/10">
              <ShoppingCart size={18} />
            </div>
          </div>

          <div className="p-5">
            {lines.length ? (
              <div className="max-h-[300px] space-y-3 overflow-y-auto pr-1">
                {lines.map(({ product, quantity }) => (
                  <div key={product.id} className="rounded-xl border border-[#e5eae6] p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold">{product.name}</div>
                        <div className="mt-0.5 text-[10px] text-muted">
                          {product.sku} · {inr(product.selling_price)} each ({product.stock} avail)
                        </div>
                      </div>
                      <button
                        onClick={() => setQuantity(product, 0)}
                        className="text-muted hover:text-red-600"
                        aria-label={`Remove ${product.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          className="grid h-7 w-7 place-items-center rounded-lg bg-[#f0f3f0] hover:bg-forest-50"
                          onClick={() => setQuantity(product, quantity - 1)}
                        >
                          <Minus size={13} />
                        </button>
                        <input
                          aria-label={`Quantity for ${product.name}`}
                          type="number"
                          min="1"
                          max={product.stock}
                          value={quantity}
                          onChange={(e) => setQuantity(product, Number(e.target.value))}
                          className="h-7 w-12 rounded-md border border-[#dfe6e1] text-center text-xs font-bold outline-none"
                        />
                        <button
                          className="grid h-7 w-7 place-items-center rounded-lg bg-[#f0f3f0] hover:bg-forest-50"
                          onClick={() => setQuantity(product, quantity + 1)}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      <div className="text-sm font-bold text-forest-700">
                        {inr(product.selling_price * quantity)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-forest-50 text-forest-500">
                  <ScanLine size={25} />
                </div>
                <h3 className="mt-3 text-sm font-bold">Ready for the first scan</h3>
                <p className="mt-1 max-w-[250px] text-xs leading-5 text-muted">
                  Scan a QR or retail barcode, or select items from your catalogue.
                </p>
                <button onClick={() => setScannerOpen(true)} className="btn-soft mt-4">
                  <ScanLine size={15} /> Open Scanner
                </button>
              </div>
            )}

            {/* Price Breakdown */}
            <div className="mt-5 space-y-2 border-t border-dashed border-[#d8dfda] pt-4 text-xs">
              <div className="flex justify-between text-muted">
                <span>Subtotal</span>
                <span>{inr(totals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-muted">
                <span>Discount</span>
                <div className="flex w-24 items-center rounded-lg border border-[#dfe6e1] px-2 bg-white">
                  <span>₹</span>
                  <input
                    type="number"
                    min="0"
                    max={totals.subtotal}
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="w-full bg-transparent py-1 pl-1 text-right outline-none text-xs font-semibold"
                  />
                </div>
              </div>
              <div className="flex justify-between text-muted">
                <span>Tax ({store?.tax_rate || 5}%)</span>
                <span>{inr(totals.tax)}</span>
              </div>
              <div className="flex items-end justify-between pt-2">
                <span className="font-semibold text-ink">Grand total</span>
                <span className="text-[26px] font-extrabold tracking-[-.04em] text-forest-600">
                  {inr(totals.total)}
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="mt-4">
              <label className="label">Payment method</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: 'Cash', icon: Banknote },
                  { name: 'UPI', icon: Smartphone },
                  { name: 'Card', icon: CreditCard },
                ].map(({ name, icon: Icon }) => (
                  <button
                    key={name}
                    onClick={() => setPayment(name)}
                    className={cx(
                      'flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-semibold transition',
                      payment === name
                        ? 'border-forest-600 bg-forest-50 text-forest-700 ring-2 ring-forest-600/10'
                        : 'border-[#dfe6e1] text-muted hover:border-forest-500'
                    )}
                  >
                    <Icon size={15} />
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Confirm Checkout Button */}
            <button
              disabled={!lines.length || submitting}
              onClick={completeSale}
              className="btn-gold mt-5 w-full !py-3.5"
            >
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-forest-900/30 border-t-forest-900" />
                  Saving transaction…
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} /> Confirm & Generate Bill
                </>
              )}
            </button>

            <p className="mt-3 text-center text-[10px] leading-4 text-muted">
              Atomic checkout: Stock is automatically deducted only upon completed payment. Duplicate submissions are prevented.
            </p>
          </div>
        </section>
      </div>

      {/* Camera / QR / Barcode Scanner Modal */}
      <Modal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        title="Scan Product QR or Barcode"
        description="Allow camera access to scan, or type the code manually below."
        size="sm"
      >
        <QrScanner active={scannerOpen} onScan={scan} />
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#e3e8e4]" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">or enter code</span>
          <div className="h-px flex-1 bg-[#e3e8e4]" />
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Keyboard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input !pl-9"
              placeholder="e.g. PRD001 or retail barcode…"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualCode.trim()) scan(manualCode);
              }}
            />
          </div>
          <button className="btn-primary" disabled={!manualCode.trim()} onClick={() => scan(manualCode)}>
            Add
          </button>
        </div>
      </Modal>

      {/* Receipt Completed Modal */}
      <Modal
        open={Boolean(receipt)}
        onClose={() => setReceipt(null)}
        title="Transaction Completed"
        description="The sale has been recorded and stock is decremented. You can print the receipt below."
        size="sm"
      >
        <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-forest-50 p-3 text-xs font-semibold text-forest-700">
          <CheckCircle2 size={17} /> {receipt?.bill_number} recorded in database
        </div>
        <Receipt sale={receipt} store={store} />
        <div className="mt-5 grid grid-cols-2 gap-2 no-print">
          <button className="btn-secondary" onClick={() => setReceipt(null)}>
            New Bill
          </button>
          <button className="btn-primary" onClick={() => window.print()}>
            <Printer size={16} /> Print Receipt
          </button>
        </div>
      </Modal>
    </>
  );
}
