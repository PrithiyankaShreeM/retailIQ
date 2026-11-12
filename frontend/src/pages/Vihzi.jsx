import { MessageCircleQuestion, Mic2, Languages, ShieldCheck, Sparkles, AudioLines, CheckCircle2 } from 'lucide-react';
import { PageHeader, Badge } from '../components/UI';
import VihziChat from '../components/VihziChat';

export default function Vihzi() {
  return (
    <>
      <PageHeader
        eyebrow="Your AI voice assistant"
        title="Meet Vizhi."
        description="A friendly way to understand your business. Speak or type in English, Tamil or Tanglish and get answers grounded in your authorised RetailIQ records."
      >
        <Badge tone="green" dot>Multilingual AI Live</Badge>
      </PageHeader>

      <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[420px_1fr]">
        <section className="relative flex min-h-[580px] flex-col overflow-hidden rounded-3xl bg-forest-600 p-6 text-white shadow-card">
          <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full border-[45px] border-white/[.035]" />
          <div className="absolute bottom-20 right-0 h-44 w-44 rounded-full bg-saffron-500/10 blur-2xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-white/75">
              <AudioLines size={13} className="text-saffron-400" /> TWO-WAY MULTILINGUAL VOICE
            </div>
            <h2 className="mt-5 max-w-[270px] text-[30px] font-extrabold leading-[1.1] tracking-[-.045em]">
              Clarity for your<br />
              <span className="text-saffron-400">everyday business.</span>
            </h2>
            <p className="mt-3 max-w-[300px] text-xs leading-5 text-white/70">
              Vizhi is your shop’s intelligent companion—warm, fluent in Tamil, English & Tanglish, and grounded strictly in your live database records.
            </p>
          </div>
          <div className="relative -mx-6 -mb-6 mt-auto h-[320px] overflow-hidden">
            <img
              src="/vihzi.png"
              alt="Vizhi, a friendly retail assistant"
              className="vihzi-image absolute bottom-[-15px] left-1/2 h-[390px] w-auto max-w-none -translate-x-1/2"
            />
          </div>
        </section>
        <section className="card overflow-hidden">
          <VihziChat />
        </section>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            icon: Languages,
            title: 'English, தமிழ் & Tanglish',
            text: 'Automatic language detection. Ask naturally in any of the three styles and receive responses in the matching language.',
          },
          {
            icon: Mic2,
            title: 'Sarvam AI Speech',
            text: 'Two-way voice conversation powered by official Sarvam AI speech models with seamless browser speech fallback.',
          },
          {
            icon: MessageCircleQuestion,
            title: 'Real DB Intelligence',
            text: 'Instant insights on today’s sales, yesterday’s earnings, product-level stock, top performers and slow-moving items.',
          },
          {
            icon: ShieldCheck,
            title: 'Safe Action Confirmations',
            text: 'Vizhi can recommend inventory updates or adjustments, but requires your explicit confirmation before applying changes.',
          },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="card p-4">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-forest-50 text-forest-600">
              <Icon size={18} />
            </div>
            <h3 className="mt-3 text-xs font-bold">{title}</h3>
            <p className="mt-1.5 text-[11px] leading-5 text-muted">{text}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#dfe6e1] bg-white p-4 text-xs leading-5 text-muted">
        <Sparkles size={17} className="mt-0.5 shrink-0 text-saffron-500" />
        <p>
          <b className="text-ink">Trust & Reliability Boundary:</b> Vizhi retrieves real numbers directly through secure backend database queries. She never generates synthetic or imaginary sales figures, and all inventory adjustments are audited in the movement ledger.
        </p>
      </div>
    </>
  );
}
