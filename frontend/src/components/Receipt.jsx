import { formatDate, inr } from '../utils';

export default function Receipt({ sale, store }) {
  if (!sale) return null;
  return <div className="receipt-paper print-area mx-auto w-full max-w-[380px] border border-dashed border-[#cbd4ce] p-5 text-[12px] leading-[1.6] shadow-sm">
    <div className="text-center">
      <div className="text-[17px] font-bold uppercase">{store?.name}</div>
      <div className="mx-auto mt-1 max-w-[280px] text-[10px]">{store?.address}</div>
      {store?.contact && <div className="text-[10px]">{store.contact}</div>}
    </div>
    <div className="my-3 border-t border-dashed border-black" />
    <div className="flex justify-between"><span>Bill: {sale.bill_number}</span><span>{sale.status}</span></div>
    <div>{formatDate(sale.created_at, true)}</div>
    <div className="my-3 border-t border-dashed border-black" />
    <div className="flex font-bold"><span className="flex-1">ITEM</span><span className="w-8 text-center">QTY</span><span className="w-20 text-right">AMOUNT</span></div>
    {sale.items?.map((item) => <div key={item.product_id} className="mt-1.5">
      <div>{item.product_name}</div>
      <div className="flex text-[11px]"><span className="flex-1 pl-2">@ {inr(item.unit_price)}</span><span className="w-8 text-center">{item.quantity}</span><span className="w-20 text-right">{inr(item.line_total)}</span></div>
    </div>)}
    <div className="my-3 border-t border-dashed border-black" />
    <div className="flex justify-between"><span>Subtotal</span><span>{inr(sale.subtotal)}</span></div>
    <div className="flex justify-between"><span>Tax</span><span>{inr(sale.tax)}</span></div>
    {Number(sale.discount) > 0 && <div className="flex justify-between"><span>Discount</span><span>− {inr(sale.discount)}</span></div>}
    <div className="my-2 border-t border-black" />
    <div className="flex justify-between text-[16px] font-bold"><span>TOTAL</span><span>{inr(sale.total)}</span></div>
    <div className="mt-1 flex justify-between"><span>Payment</span><span>{sale.payment_method}</span></div>
    <div className="my-3 border-t border-dashed border-black" />
    <div className="text-center"><div className="font-bold">Thank you! Visit again.</div><div className="mt-1 text-[10px]">Powered by RetailIQ · {sale.bill_number}</div></div>
  </div>;
}
