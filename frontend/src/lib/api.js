const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

let getTokenFn = null;

export function setTokenGetter(fn) {
  getTokenFn = fn;
}

async function getToken(skipCache = false) {
  if (!getTokenFn) return null;
  try {
    return await getTokenFn(skipCache);
  } catch {
    return null;
  }
}

async function doFetch(path, options, skipCache) {
  const token = await getToken(skipCache);
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  return fetch(`${API_URL}${path}`, { ...options, headers });
}

export async function apiFetch(path, options = {}) {
  let res = await doFetch(path, options, false);

  if (res.status === 401) {
    res = await doFetch(path, options, true);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}
