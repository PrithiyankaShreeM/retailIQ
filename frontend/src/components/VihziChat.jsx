import { useEffect, useRef, useState } from 'react';
import { Send, Mic, MicOff, Volume2, VolumeX, Sparkles, ShieldCheck, Bot } from 'lucide-react';
import { post } from '../api';
import { cx } from '../utils';
import { useApp } from '../context';

const suggestions = ['How much did I earn today?', 'Which product sells the most?', 'Enna stock kammiya irukku?', 'What should I expect next week?'];

export default function VihziChat({ compact = false }) {
  const { store, notify } = useApp();
  const [messages, setMessages] = useState([{ id: 1, from: 'vihzi', text: 'Vanakkam! I’m Vihzi. Ask me about your sales, products or stock—I’ll answer only from your shop records.' }]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(false);
  const [language, setLanguage] = useState(store?.language || 'English');
  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, thinking]);
  useEffect(() => () => { recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); }, []);

  const speak = (text) => {
    if (!voice || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'Tamil' ? 'ta-IN' : 'en-IN'; utterance.rate = 0.97;
    window.speechSynthesis.speak(utterance);
  };
  const ask = async (question) => {
    const query = (question || input).trim();
    if (!query || thinking) return;
    setInput(''); setMessages((current) => [...current, { id: Date.now(), from: 'me', text: query }]); setThinking(true);
    try {
      const result = await post('/vihzi/query', { query, language });
      setMessages((current) => [...current, { id: Date.now() + 1, from: 'vihzi', text: result.answer, intent: result.intent }]);
      speak(result.answer);
    } catch (error) {
      setMessages((current) => [...current, { id: Date.now() + 1, from: 'vihzi', text: `I couldn’t read your shop records just now: ${error.message}`, error: true }]);
    } finally { setThinking(false); }
  };
  const startListening = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { notify('Voice input is not supported in this browser. You can still type to Vihzi.', 'error'); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const recognition = new Recognition();
    recognition.lang = language === 'Tamil' ? 'ta-IN' : 'en-IN'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = (event) => { const text = event.results[0][0].transcript; setListening(false); ask(text); };
    recognition.onerror = () => { setListening(false); notify('I couldn’t hear that clearly. Please try again or type your question.', 'error'); };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition; setListening(true); recognition.start();
  };

  return <div className={cx('flex h-full flex-col', compact ? '' : 'min-h-[580px]')}>
    <div className="flex items-center gap-3 border-b border-[#e5eae6] p-4">
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[#faf4e8]"><img src="/vihzi.png" alt="Vihzi" className="vihzi-image absolute left-1/2 -top-1 h-[120px] w-[95px] max-w-none -translate-x-1/2 object-cover object-top" /></div>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 text-sm font-bold">Vihzi <Sparkles size={13} className="text-saffron-500" /></div><div className="flex items-center gap-1.5 text-[10px] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected to {store?.name}</div></div>
      <button className={cx('icon-btn !h-8 !w-8', voice && 'bg-forest-50 text-forest-600')} onClick={() => setVoice((current) => !current)} title={voice ? 'Mute spoken responses' : 'Enable spoken responses'}>{voice ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
    </div>
    <div className={cx('chat-scroll flex-1 space-y-4 overflow-y-auto p-4', compact ? 'h-[330px]' : 'min-h-[310px]')}>
      {messages.map((message) => <div key={message.id} className={cx('flex gap-2', message.from === 'me' ? 'justify-end' : 'justify-start')}>
        {message.from === 'vihzi' && <div className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-saffron-500 text-forest-900"><Bot size={13} /></div>}
        <div className={cx('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-5', message.from === 'me' ? 'rounded-br-md bg-forest-600 text-white' : 'rounded-bl-md bg-[#f0f4f0] text-ink', message.error && 'bg-red-50 text-red-700')}>{message.text}{message.intent && message.intent !== 'help' && <div className="mt-1.5 text-[8px] font-semibold uppercase tracking-wider text-muted">Verified · {message.intent.replaceAll('_', ' ')}</div>}</div>
      </div>)}
      {thinking && <div className="flex gap-2"><div className="grid h-6 w-6 place-items-center rounded-lg bg-saffron-500"><Bot size={13} /></div><div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-[#f0f4f0] px-4 py-3">{[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 animate-bounce rounded-full bg-forest-500" style={{ animationDelay: `${dot * 130}ms` }} />)}</div></div>}
      <div ref={bottomRef} />
    </div>
    {messages.length <= 2 && <div className="flex gap-2 overflow-x-auto px-4 pb-3">{suggestions.slice(0, compact ? 2 : 4).map((suggestion) => <button key={suggestion} onClick={() => ask(suggestion)} className="shrink-0 rounded-full border border-[#dce4de] bg-white px-3 py-1.5 text-[10px] text-muted transition hover:border-forest-500 hover:text-forest-600">{suggestion}</button>)}</div>}
    <div className="border-t border-[#e5eae6] p-3">
      <div className="flex items-end gap-2 rounded-2xl border border-[#d9e2db] bg-white p-1.5 focus-within:border-forest-500 focus-within:ring-4 focus-within:ring-forest-500/10"><button onClick={startListening} className={cx('icon-btn !h-9 !w-9 shrink-0', listening && 'animate-soft-pulse bg-red-50 text-red-600')} title={listening ? 'Stop listening' : 'Speak to Vihzi'}>{listening ? <MicOff size={17} /> : <Mic size={17} />}</button><textarea rows="1" className="max-h-24 min-h-[36px] flex-1 resize-none bg-transparent px-1 py-2 text-xs outline-none" placeholder={listening ? 'Listening…' : 'Ask in English, Tamil or Tanglish…'} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} /><button disabled={!input.trim() || thinking} onClick={() => ask()} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-forest-600 text-white transition hover:bg-forest-700 disabled:opacity-40" aria-label="Send question"><Send size={16} /></button></div>
      <div className="mt-2 flex items-center justify-between gap-2"><div className="flex items-center gap-1 text-[9px] text-muted"><ShieldCheck size={11} className="text-forest-500" /> Grounded in authorised records</div><select value={language} onChange={(e) => setLanguage(e.target.value)} className="bg-transparent text-[9px] font-semibold text-muted outline-none"><option>English</option><option>Tamil</option><option>Tanglish</option></select></div>
    </div>
  </div>;
}
