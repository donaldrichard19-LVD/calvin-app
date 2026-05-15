const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

let getTokenFn = null;

export function setTokenGetter(fn) {
  getTokenFn = fn;
}

export async function apiFetch(path, options = {}) {
  let token = null;
  if (getTokenFn) {
    try {
      token = await getTokenFn();
    } catch {}
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}
