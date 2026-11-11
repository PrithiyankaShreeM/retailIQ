import { MessageCircleQuestion, Mic2, Languages, ShieldCheck, Sparkles, AudioLines } from 'lucide-react';
import { PageHeader, Badge } from '../components/UI';
import VihziChat from '../components/VihziChat';

export default function Vihzi() {
  return <>
    <PageHeader eyebrow="Your AI voice assistant" title="Meet Vihzi." description="A friendly way to understand your business. Speak or type in English, Tamil or Tanglish and get answers grounded in your authorised RetailIQ records."><Badge tone="green" dot>Ready to help</Badge></PageHeader>
    <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[420px_1fr]">
      <section className="relative flex min-h-[580px] flex-col overflow-hidden rounded-3xl bg-forest-600 p-6 text-white shadow-card">
        <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full border-[45px] border-white/[.035]" /><div className="absolute bottom-20 right-0 h-44 w-44 rounded-full bg-saffron-500/10 blur-2xl" />
        <div className="relative"><div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-white/75"><AudioLines size={13} className="text-saffron-400" /> YOUR SHOP, IN CONVERSATION</div><h2 className="mt-5 max-w-[270px] text-[30px] font-extrabold leading-[1.1] tracking-[-.045em]">Clarity for your<br /><span className="text-saffron-400">everyday business.</span></h2><p className="mt-3 max-w-[300px] text-xs leading-5 text-white/55">“Vihzi” is your shop’s intelligent companion—warm, direct and always honest about what the records can tell us.</p></div>
        <div className="relative -mx-6 -mb-6 mt-auto h-[320px] overflow-hidden"><img src="/vihzi.png" alt="Vihzi, a friendly South Asian retail assistant in emerald green, waving and holding a holographic chart" className="vihzi-image absolute bottom-[-15px] left-1/2 h-[390px] w-auto max-w-none -translate-x-1/2" /></div>
      </section>
      <section className="card overflow-hidden"><VihziChat /></section>
    </div>
    <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[{ icon: MessageCircleQuestion, title: 'Ask naturally', text: 'Today’s earnings, best sellers, average bills and product-level stock answers.' }, { icon: Mic2, title: 'Speak & listen', text: 'Browser speech recognition and optional spoken responses for hands-free queries.' }, { icon: Languages, title: 'Three ways to talk', text: 'English, தமிழ் and everyday Tanglish, with automatic intent recognition.' }, { icon: ShieldCheck, title: 'No invented numbers', text: 'Every answer is calculated from authorised sales and inventory records.' }].map(({ icon: Icon, title, text }) => <div key={title} className="card p-4"><div className="grid h-9 w-9 place-items-center rounded-xl bg-forest-50 text-forest-600"><Icon size={18} /></div><h3 className="mt-3 text-xs font-bold">{title}</h3><p className="mt-1.5 text-[11px] leading-5 text-muted">{text}</p></div>)}
    </div>
    <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#dfe6e1] bg-white p-4 text-xs leading-5 text-muted"><Sparkles size={17} className="mt-0.5 shrink-0 text-saffron-500" /><p><b className="text-ink">A useful boundary:</b> Vihzi can explain recorded business information, but she does not guess missing sales, create stock from nowhere or present a forecast as a guarantee. New shops receive an honest request for more history.</p></div>
  </>;
}
