import { useState } from 'react';
import { formatDate, inr } from '../utils';

export default function Receipt({ sale, store }) {
  const [width, setWidth] = useState(store?.printer_width || 80);
  if (!sale) return null;

  const is58 = width === 58;

  return (
    <div>
      {/* Printer Width Selector for Counter Operator */}
      <div className="mb-3 flex items-center justify-between no-print px-1 text-xs">
        <span className="text-muted">Thermal format:</span>
        <div className="flex gap-1.5 rounded-lg bg-[#f0f3f0] p-1">
          <button
            onClick={() => setWidth(58)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              is58 ? 'bg-white text-forest-700 shadow-sm' : 'text-muted'
            }`}
          >
            58 mm (2")
          </button>
          <button
            onClick={() => setWidth(80)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              !is58 ? 'bg-white text-forest-700 shadow-sm' : 'text-muted'
            }`}
          >
            80 mm (3")
          </button>
        </div>
      </div>

      <div
        className={`receipt-paper print-area mx-auto w-full border border-dashed border-[#cbd4ce] p-5 leading-[1.6] shadow-sm ${
          is58 ? 'max-w-[280px] text-[11px]' : 'max-w-[380px] text-[12px]'
        }`}
      >
        <div className="text-center">
          <div className="text-[17px] font-extrabold uppercase tracking-wide">{store?.name || 'RetailIQ Shop'}</div>
          {store?.address && <div className="mx-auto mt-1 max-w-[280px] text-[10px] text-zinc-700">{store.address}</div>}
          {store?.contact && <div className="text-[10px] text-zinc-700">Phone: {store.contact}</div>}
          <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
            TAX INVOICE · RETAIL POS
          </div>
        </div>

        <div className="my-2.5 border-t border-dashed border-black" />

        <div className="flex justify-between">
          <span className="font-bold">Bill: {sale.bill_number}</span>
          <span className="font-semibold text-zinc-800">{sale.status || 'Paid'}</span>
        </div>
        <div className="text-[11px] text-zinc-700">
          Date: {formatDate(sale.created_at, true)}
        </div>

        <div className="my-2.5 border-t border-dashed border-black" />

        <div className="flex font-extrabold text-[11px]">
          <span className="flex-1">ITEM</span>
          <span className="w-10 text-center">QTY</span>
          <span className="w-20 text-right">AMOUNT</span>
        </div>

        <div className="my-1.5 border-t border-dotted border-zinc-400" />

        {sale.items?.map((item) => (
          <div key={item.product_id} className="mt-1.5">
            <div className="font-bold leading-tight">{item.product_name}</div>
            <div className="flex text-[11px] text-zinc-700">
              <span className="flex-1 pl-2">@ {inr(item.unit_price)}</span>
              <span className="w-10 text-center font-semibold">{item.quantity}</span>
              <span className="w-20 text-right font-bold text-black">{inr(item.line_total)}</span>
            </div>
          </div>
        ))}

        <div className="my-2.5 border-t border-dashed border-black" />

        <div className="space-y-1 text-zinc-800">
          <div className="flex justify-between">
            <span>Subtotal ({sale.item_count || sale.items?.reduce((s, i) => s + i.quantity, 0)} items)</span>
            <span>{inr(sale.subtotal)}</span>
          </div>
          {Number(sale.discount) > 0 && (
            <div className="flex justify-between text-zinc-900">
              <span>Discount</span>
              <span>− {inr(sale.discount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Tax ({store?.tax_rate || 5}%)</span>
            <span>{inr(sale.tax)}</span>
          </div>
        </div>

        <div className="my-2 border-t-2 border-black" />

        <div className="flex justify-between text-[16px] font-extrabold">
          <span>GRAND TOTAL</span>
          <span>{inr(sale.total)}</span>
        </div>

        <div className="mt-1 flex justify-between text-[11px] text-zinc-800">
          <span>Payment Method</span>
          <span className="font-bold uppercase">{sale.payment_method || 'Cash'}</span>
        </div>
        <div className="flex justify-between text-[11px] text-zinc-800">
          <span>Payment Status</span>
          <span className="font-semibold text-emerald-800">Completed</span>
        </div>

        <div className="my-3 border-t border-dashed border-black" />

        <div className="text-center text-[11px] leading-5 text-zinc-800">
          <div className="font-bold">Thank you for shopping with us!</div>
          <div>Please visit again.</div>
          <div className="mt-1 text-[9px] text-zinc-500">
            Powered by RetailIQ · {sale.bill_number}
          </div>
        </div>
      </div>
    </div>
  );
}
