const API_ROOT = '/api';
const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/demo', '/auth/logout', '/auth/me'];
let runtimeToken = localStorage.getItem('retailiq_token');

export function setRuntimeToken(token) {
  runtimeToken = token || null;
  if (token) localStorage.setItem('retailiq_token', token);
  else localStorage.removeItem('retailiq_token');
}

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, options = {}) {
  // Memory remains authoritative for this tab even when an iframe blocks or
  // prematurely clears Web Storage. The custom header survives proxy auth rewrites.
  const token = runtimeToken || localStorage.getItem('retailiq_token');
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) {
    headers['X-RetailIQ-Token'] = token;
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API_ROOT}${path}`, { ...options, headers, credentials: 'include' });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({ detail: 'The server returned an unreadable response.' }));
  if (!response.ok) {
    if (response.status === 401 && !PUBLIC_AUTH_PATHS.includes(path)) {
      setRuntimeToken(null);
      window.dispatchEvent(new Event('retailiq:unauthorized'));
    }
    const detail = Array.isArray(data.detail)
      ? data.detail.map((item) => item.msg).join(', ')
      : data.detail;
    throw new ApiError(detail || 'Something went wrong. Please try again.', response.status);
  }
  return data;
}

export const get = (path) => api(path);
export const post = (path, body) => api(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) });
export const patch = (path, body) => api(path, { method: 'PATCH', body: JSON.stringify(body) });
