import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff } from 'lucide-react';

export default function QrScanner({ onScan, active }) {
  const elementId = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`);
  const scanner = useRef(null);
  const lastScan = useRef('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    if (!active) return undefined;
    let disposed = false;
    const instance = new Html5Qrcode(elementId.current, { verbose: false });
    scanner.current = instance;
    setStarting(true); setError('');
    instance.start(
      { facingMode: 'environment' },
      { fps: 8, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
      (decoded) => {
        if (decoded === lastScan.current) return;
        lastScan.current = decoded;
        onScan(decoded);
        window.setTimeout(() => { lastScan.current = ''; }, 1200);
      },
      () => {},
    ).then(() => { if (!disposed) setStarting(false); }).catch(() => {
      if (!disposed) { setError('Camera unavailable. Allow camera access or enter the Product ID below.'); setStarting(false); }
    });
    return () => {
      disposed = true;
      if (instance.isScanning) instance.stop().then(() => instance.clear()).catch(() => {});
      else instance.clear();
    };
  }, [active, onScan]);

  return <div>
    <div className="relative overflow-hidden rounded-2xl bg-forest-900">
      <div id={elementId.current} className="min-h-[280px] w-full [&>video]:h-[280px] [&>video]:object-cover" />
      {(starting || error) && <div className="absolute inset-0 grid place-items-center bg-forest-900 p-8 text-center text-white">
        <div><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white/10">{error ? <CameraOff /> : <Camera className="animate-pulse" />}</div><p className="text-sm font-semibold">{error || 'Starting your camera…'}</p>{!error && <p className="mt-1 text-xs text-white/60">Point the camera at a RetailIQ product QR label.</p>}</div>
      </div>}
    </div>
    <p className="mt-3 text-center text-xs leading-5 text-muted">The QR contains only a product reference. Current price and stock are always fetched securely from your catalogue.</p>
  </div>;
}
