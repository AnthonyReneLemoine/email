import { state } from './state.js';

const BASE = 'https://gmail.googleapis.com/gmail/v1/';

function authHeaders() {
  return { Authorization: 'Bearer ' + state.accessToken };
}

/**
 * Requête GET vers l'API Gmail.
 * @param {string} path  - ex. 'users/me/messages'
 * @param {Object} params - query params (les tableaux sont répétés)
 */
export async function gmailGet(path, params = {}) {
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      v.forEach(item => url.searchParams.append(k, item));
    } else {
      url.searchParams.set(k, v);
    }
  });

  const r = await fetch(url, { headers: authHeaders() });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Gmail API GET ${path} — ${r.status}: ${text}`);
  }
  return r.json();
}

/**
 * Requête POST vers l'API Gmail (corps JSON).
 */
export async function gmailPost(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Gmail API POST ${path} — ${r.status}: ${text}`);
  }
  return r.json();
}

/**
 * Requête DELETE vers l'API Gmail.
 */
export async function gmailDelete(path) {
  const r = await fetch(BASE + path, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Gmail API DELETE ${path} — ${r.status}: ${text}`);
  }
}
