import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CameraOff, AlertCircle, Scan, Check } from 'lucide-react';

export default function QrScanner({ onScan, active }) {
  const elementId = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`);
  const scanner = useRef(null);
  const lastScan = useRef('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);
  const [scannedFeedback, setScannedFeedback] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    let disposed = false;
    setError('');
    setStarting(true);

    const formats = [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
    ];

    const instance = new Html5Qrcode(elementId.current, {
      formatsToSupport: formats,
      verbose: false,
    });
    scanner.current = instance;

    instance
      .start(
        { facingMode: 'environment' },
        {
          fps: 12,
          qrbox: { width: 250, height: 200 },
          aspectRatio: 1.25,
        },
        (decodedText) => {
          if (decodedText === lastScan.current) return;
          lastScan.current = decodedText;
          setScannedFeedback(true);
          onScan(decodedText);
          window.setTimeout(() => {
            lastScan.current = '';
            setScannedFeedback(false);
          }, 1200);
        },
        () => {},
      )
      .then(() => {
        if (!disposed) setStarting(false);
      })
      .catch((err) => {
        if (disposed) return;
        setStarting(false);
        const msg = String(err?.message || err || '').toLowerCase();
        if (msg.includes('permission') || msg.includes('notallowed')) {
          setError('Camera permission denied. Please allow camera access in your browser to scan product codes.');
        } else if (msg.includes('notfound') || msg.includes('device')) {
          setError('No camera device detected on this device. You can type the Product ID or barcode manually below.');
        } else {
          setError('Camera could not be started. Please check permissions or enter the code manually.');
        }
      });

    return () => {
      disposed = true;
      if (instance) {
        try {
          if (instance.isScanning) {
            instance.stop().then(() => instance.clear()).catch(() => {});
          } else {
            instance.clear();
          }
        } catch {
          // ignore cleanup errors on unmount
        }
      }
    };
  }, [active, onScan]);

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-[#081814] shadow-inner">
        <div id={elementId.current} className="min-h-[280px] w-full [&>video]:h-[280px] [&>video]:object-cover" />

        {/* Viewfinder Overlay */}
        {!starting && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className={`relative h-[200px] w-[250px] rounded-xl border-2 transition-all ${scannedFeedback ? 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_25px_rgba(52,211,153,0.5)]' : 'border-saffron-400/80 shadow-[0_0_15px_rgba(242,165,22,0.25)]'}`}>
              {/* Corner brackets */}
              <span className="absolute -left-1 -top-1 h-5 w-5 border-l-4 border-t-4 border-saffron-400" />
              <span className="absolute -right-1 -top-1 h-5 w-5 border-r-4 border-t-4 border-saffron-400" />
              <span className="absolute -bottom-1 -left-1 h-5 w-5 border-b-4 border-l-4 border-saffron-400" />
              <span className="absolute -bottom-1 -right-1 h-5 w-5 border-b-4 border-r-4 border-saffron-400" />

              {/* Scanning laser line */}
              <div className="absolute inset-x-2 top-0 h-0.5 animate-scan bg-gradient-to-r from-transparent via-saffron-400 to-transparent" />

              {scannedFeedback && (
                <div className="absolute inset-0 flex items-center justify-center bg-forest-900/40 text-emerald-300">
                  <Check size={36} className="animate-scale-in" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading and Error states */}
        {(starting || error) && (
          <div className="absolute inset-0 grid place-items-center bg-[#081814] p-8 text-center text-white">
            <div className="max-w-[280px]">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-saffron-400">
                {error ? <CameraOff size={24} className="text-red-400" /> : <Camera size={24} className="animate-pulse" />}
              </div>
              <p className="text-sm font-semibold text-white/90">
                {error || 'Starting camera scanner…'}
              </p>
              {!error && (
                <p className="mt-1 text-xs text-white/60">
                  Point the camera at any RetailIQ product QR code or standard retail barcode.
                </p>
              )}
              {error && (
                <div className="mt-2.5 flex items-center justify-center gap-1.5 text-xs text-red-300">
                  <AlertCircle size={14} /> Enter the Product ID below
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted">
        <Scan size={14} className="text-forest-500" />
        <span>Supports QR codes, EAN-13, EAN-8, Code-128 & UPC retail barcodes</span>
      </div>
    </div>
  );
}
