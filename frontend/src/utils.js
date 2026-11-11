export const inr = (value, compact = false) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: compact ? 1 : 0,
  notation: compact ? 'compact' : 'standard',
}).format(Number(value || 0));

export const formatDate = (value, withTime = false) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: withTime ? undefined : 'numeric',
    hour: withTime ? '2-digit' : undefined, minute: withTime ? '2-digit' : undefined,
  }).format(new Date(value));
};

export const cx = (...classes) => classes.filter(Boolean).join(' ');

export function downloadText(filename, content, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

export const stockLabel = (status) => ({ out: 'Out of stock', low: 'Low stock', ok: 'In stock' }[status] || status);

export const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
