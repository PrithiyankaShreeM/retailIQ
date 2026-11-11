const API_ROOT = '/api';

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, options = {}) {
  const token = localStorage.getItem('retailiq_token');
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_ROOT}${path}`, { ...options, headers, credentials: 'include' });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({ detail: 'The server returned an unreadable response.' }));
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      localStorage.removeItem('retailiq_token');
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
