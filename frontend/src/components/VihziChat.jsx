import { useEffect, useRef, useState } from 'react';
import {
  Send, Mic, MicOff, Volume2, VolumeX, Sparkles, ShieldCheck, Bot,
  Loader2, CheckCircle2, AlertTriangle, Play, Square,
} from 'lucide-react';
import { post, get } from '../api';
import { cx } from '../utils';
import { useApp } from '../context';

const suggestionsByLang = {
  English: [
    'How much did I earn today?',
    'Which product sells the most?',
    'What is my total stock valuation?',
    'Which products are low on stock?',
  ],
  Tamil: [
    'இன்றைய விற்பனை என்ன?',
    'எந்த பொருள் அதிகம் விற்றது?',
    'குறைந்த இருப்பில் உள்ள பொருட்கள் எவை?',
    'மொத்த சரக்கு மதிப்பு எவ்வளவு?',
  ],
  Tanglish: [
    'Innikku sales evlo aachu?',
    'Enna stock kammiya irukku?',
    'Top selling product edhu?',
    'Total inventory valuation evlo?',
  ],
};

export default function VihziChat({ compact = false }) {
  const { store, notify } = useApp();
  const [messages, setMessages] = useState([
    {
      id: 1,
      from: 'vihzi',
      text: 'Vanakkam! I’m Vizhi, your retail intelligence assistant. Ask me about your sales, stock, products or bills in English, Tamil, or Tanglish.',
      language: 'English',
    },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voice, setVoice] = useState(false);
  const [language, setLanguage] = useState(store?.language || 'English');
  const [sarvamConfigured, setSarvamConfigured] = useState(false);

  const bottomRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const recognitionRef = useRef(null);

  // Check Sarvam status on mount
  useEffect(() => {
    get('/vihzi/status')
      .then((res) => {
        if (res?.sarvam_configured) setSarvamConfigured(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking, recording]);

  // Clean up media streams and speech on unmount
  useEffect(() => {
    return () => {
      stopRecordingCleanup();
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    };
  }, []);

  const stopRecordingCleanup = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
      try {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      } catch {}
    }
    setRecording(false);
    setRecordingSeconds(0);
  };

  const playVoiceResponse = async (text, lang) => {
    if (!voice) return;

    // Try Sarvam AI TTS first
    try {
      const res = await post('/vihzi/text-to-speech', { text, language: lang });
      if (res?.success && res?.audio_base64) {
        if (audioPlayerRef.current) audioPlayerRef.current.pause();
        const audio = new Audio(`data:${res.format || 'audio/mp3'};base64,${res.audio_base64}`);
        audioPlayerRef.current = audio;
        setSpeaking(true);
        audio.onended = () => setSpeaking(false);
        audio.onerror = () => {
          setSpeaking(false);
          fallbackBrowserSpeak(text, lang);
        };
        await audio.play();
        return;
      }
    } catch {}

    // Fallback to browser SpeechSynthesis
    fallbackBrowserSpeak(text, lang);
  };

  const fallbackBrowserSpeak = (text, lang) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'Tamil' ? 'ta-IN' : 'en-IN';
    utterance.rate = 0.98;
    setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  };

  const ask = async (question, extra = {}) => {
    const query = (question || input).trim();
    if (!query || thinking) return;

    stopSpeaking();
    setInput('');
    setMessages((current) => [...current, { id: Date.now(), from: 'me', text: query }]);
    setThinking(true);

    try {
      // Build conversation history for context continuity
      const history = messages.slice(-6).map((m) => ({
        role: m.from === 'me' ? 'user' : 'assistant',
        text: m.text,
      }));

      const payload = {
        query,
        language,
        history,
        ...extra,
      };

      const result = await post('/vihzi/query', payload);
      const resLang = result.language || language;

      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          from: 'vihzi',
          text: result.answer,
          intent: result.intent,
          language: resLang,
          requires_confirmation: result.requires_confirmation,
          action_payload: result.action_payload,
        },
      ]);

      if (voice) {
        playVoiceResponse(result.answer, resLang);
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          from: 'vihzi',
          text: `I couldn’t retrieve your shop records just now: ${error.message}`,
          error: true,
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const handleConfirmAction = (message) => {
    if (!message.action_payload) return;
    ask('Yes, confirm the action', {
      confirm_action: true,
      action_payload: message.action_payload,
    });
  };

  const handleCancelAction = () => {
    setMessages((current) => [
      ...current,
      { id: Date.now(), from: 'me', text: 'Cancel action' },
      { id: Date.now() + 1, from: 'vihzi', text: 'Action cancelled. Your records remain unchanged.' },
    ]);
  };

  // Browser SpeechRecognition fallback
  const startBrowserSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      notify('Voice recognition is not supported in this browser. You can type to Vizhi.', 'error');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = language === 'Tamil' ? 'ta-IN' : 'en-IN';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      ask(transcript);
    };
    recognition.onerror = () => {
      notify('Could not recognize speech clearly. Please try speaking again or type your question.', 'error');
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  // Sarvam AI Voice Recording & STT
  const startVoiceRecording = async () => {
    if (speaking) stopSpeaking();

    // Check if browser supports MediaRecorder
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      startBrowserSpeechRecognition();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stopRecordingCleanup();
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/wav' });
        if (audioBlob.size < 100) return;

        setTranscribing(true);
        try {
          // Send to backend Sarvam STT endpoint
          const formData = new FormData();
          formData.append('file', audioBlob, 'voice_input.webm');
          const sttResult = await post('/vihzi/speech-to-text', formData);

          if (sttResult?.success && sttResult?.transcript) {
            ask(sttResult.transcript);
          } else if (sttResult?.error && !sttResult?.configured) {
            // Sarvam is unconfigured on backend, fallback to Web Speech
            startBrowserSpeechRecognition();
          } else {
            notify(sttResult?.error || 'Could not understand audio. Try typing or speaking again.', 'error');
          }
        } catch (err) {
          // Fallback to browser recognition if network / Sarvam fails
          startBrowserSpeechRecognition();
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      setRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((sec) => sec + 1);
      }, 1000);
    } catch (err) {
      const msg = String(err?.message || err).toLowerCase();
      if (msg.includes('permission') || msg.includes('denied')) {
        notify('Microphone permission was denied. Please allow microphone access in your browser settings to speak to Vizhi.', 'error');
      } else {
        notify('Could not access microphone. Please type your query.', 'error');
      }
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const currentSuggestions = suggestionsByLang[language] || suggestionsByLang.English;

  return (
    <div className={cx('flex h-full flex-col', compact ? '' : 'min-h-[580px]')}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#e5eae6] p-4">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[#faf4e8]">
          <img
            src="/vihzi.png"
            alt="Vizhi"
            className="vihzi-image absolute left-1/2 -top-1 h-[120px] w-[95px] max-w-none -translate-x-1/2 object-cover object-top"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-bold">
            Vizhi <Sparkles size={13} className="text-saffron-500" />
            <span className="rounded-md bg-forest-50 px-1.5 py-0.5 text-[9px] font-semibold text-forest-700">
              AI Retail Assistant
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Connected to {store?.name} · {sarvamConfigured ? 'Sarvam AI Speech' : 'Browser Speech'}
          </div>
        </div>

        {/* Voice Playback Toggle */}
        <button
          className={cx(
            'icon-btn !h-8 !w-8 transition',
            voice ? 'bg-forest-50 text-forest-600 ring-2 ring-forest-500/20' : 'text-muted'
          )}
          onClick={() => {
            if (voice) stopSpeaking();
            setVoice((v) => !v);
          }}
          title={voice ? 'Voice playback is ON (click to mute)' : 'Turn ON spoken responses'}
        >
          {voice ? <Volume2 size={17} /> : <VolumeX size={17} />}
        </button>

        {speaking && (
          <button
            onClick={stopSpeaking}
            className="flex items-center gap-1 rounded-lg bg-saffron-100 px-2 py-1 text-[10px] font-bold text-saffron-800"
            title="Stop audio playback"
          >
            <Square size={10} className="fill-current" /> Stop
          </button>
        )}
      </div>

      {/* Messages */}
      <div className={cx('chat-scroll flex-1 space-y-4 overflow-y-auto p-4', compact ? 'h-[330px]' : 'min-h-[310px]')}>
        {messages.map((message) => (
          <div key={message.id} className={cx('flex gap-2', message.from === 'me' ? 'justify-end' : 'justify-start')}>
            {message.from === 'vihzi' && (
              <div className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-saffron-500 text-forest-900">
                <Bot size={13} />
              </div>
            )}
            <div
              className={cx(
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-5',
                message.from === 'me'
                  ? 'rounded-br-md bg-forest-600 text-white'
                  : 'rounded-bl-md bg-[#f0f4f0] text-ink',
                message.error && 'bg-red-50 text-red-700'
              )}
            >
              <div>{message.text}</div>

              {/* Action Confirmation Card */}
              {message.requires_confirmation && message.action_payload && (
                <div className="mt-3 rounded-xl border border-saffron-300 bg-saffron-50 p-3 text-ink">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-saffron-900">
                    <AlertTriangle size={14} className="text-saffron-600" /> Confirm Stock Action
                  </div>
                  <div className="mt-1 text-[11px] text-muted">
                    Product: <b>{message.action_payload.product_name}</b> · Quantity: <b>+{message.action_payload.quantity} units</b>
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={() => handleConfirmAction(message)}
                      className="rounded-lg bg-forest-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-forest-700"
                    >
                      Confirm Action
                    </button>
                    <button
                      onClick={handleCancelAction}
                      className="rounded-lg border border-[#d2dcd5] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-muted hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Intent and Language Badges */}
              {message.intent && message.intent !== 'help' && (
                <div className="mt-1.5 flex items-center gap-2 text-[8px] font-semibold uppercase tracking-wider text-muted">
                  <span>Verified · {message.intent.replaceAll('_', ' ')}</span>
                  {message.language && <span>· {message.language}</span>}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Thinking & Transcribing states */}
        {transcribing && (
          <div className="flex items-center gap-2 rounded-xl bg-forest-50 p-2.5 text-xs font-semibold text-forest-700">
            <Loader2 size={15} className="animate-spin text-forest-600" />
            <span>Processing speech with Sarvam AI…</span>
          </div>
        )}

        {thinking && (
          <div className="flex gap-2">
            <div className="grid h-6 w-6 place-items-center rounded-lg bg-saffron-500 text-forest-900">
              <Bot size={13} />
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-[#f0f4f0] px-4 py-3">
              <span className="text-[11px] text-muted mr-1">Checking store records…</span>
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-forest-500"
                  style={{ animationDelay: `${dot * 130}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestion Chips */}
      {messages.length <= 3 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2">
          {currentSuggestions.slice(0, compact ? 2 : 4).map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => ask(suggestion)}
              className="shrink-0 rounded-full border border-[#dce4de] bg-white px-3 py-1.5 text-[10px] text-muted transition hover:border-forest-500 hover:text-forest-600"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-[#e5eae6] p-3">
        {/* Active Recording Banner */}
        {recording && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
              </span>
              <span>Recording voice… ({recordingSeconds}s)</span>
            </div>
            <button
              onClick={stopVoiceRecording}
              className="rounded-lg bg-red-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-red-700"
            >
              Stop & Ask
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 rounded-2xl border border-[#d9e2db] bg-white p-1.5 focus-within:border-forest-500 focus-within:ring-4 focus-within:ring-forest-500/10">
          {/* Mic Button */}
          <button
            onClick={recording ? stopVoiceRecording : startVoiceRecording}
            className={cx(
              'icon-btn !h-9 !w-9 shrink-0 transition',
              recording && 'animate-soft-pulse bg-red-100 text-red-600 ring-2 ring-red-500/30'
            )}
            title={recording ? 'Click to stop recording' : 'Speak to Vizhi (Two-way voice)'}
            aria-label="Microphone"
          >
            {recording ? <MicOff size={17} /> : <Mic size={17} />}
          </button>

          <textarea
            rows="1"
            className="max-h-24 min-h-[36px] flex-1 resize-none bg-transparent px-1 py-2 text-xs outline-none"
            placeholder={
              recording
                ? 'Listening to your question…'
                : language === 'Tamil'
                ? 'தமிழில் கேளுங்கள்… (எ.கா: இன்றைய விற்பனை என்ன?)'
                : language === 'Tanglish'
                ? 'Tanglish-la kelunga… (Eg: Innikku sales evlo?)'
                : 'Ask in English, Tamil or Tanglish…'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
          />

          <button
            disabled={!input.trim() || thinking || recording}
            onClick={() => ask()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-forest-600 text-white transition hover:bg-forest-700 disabled:opacity-40"
            aria-label="Send question"
          >
            <Send size={16} />
          </button>
        </div>

        {/* Footer controls: trust badge & language selector */}
        <div className="mt-2 flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1 text-[9px] text-muted">
            <ShieldCheck size={11} className="text-forest-500" /> Grounded in store database
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted">Language:</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="rounded-md border border-[#dbe2dc] bg-white px-2 py-0.5 text-[10px] font-semibold text-forest-700 outline-none"
            >
              <option value="English">English</option>
              <option value="Tamil">Tamil (தமிழ்)</option>
              <option value="Tanglish">Tanglish</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
