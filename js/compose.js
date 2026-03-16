import { state } from './state.js';
import { gmailPost } from './api.js';
import { getHeader } from './utils.js';
import { showToast } from './ui.js';

// ── Ouverture / fermeture du modal ─────────────────────────────────────────

export function openCompose(toAddr = '', subject = '', body = '', title = 'Nouveau message') {
  const sig = localStorage.getItem('mail_signature') || '';
  const isNew = title === 'Nouveau message';
  document.getElementById('compose-to').value = toAddr;
  document.getElementById('compose-cc').value = '';
  document.getElementById('compose-subject').value = subject;
  document.getElementById('compose-body-field').value =
    isNew && sig ? body + '\n\n-- \n' + sig : body;
  document.getElementById('compose-title').textContent = title;
  document.getElementById('compose-overlay').classList.add('open');
  setTimeout(() => document.getElementById('compose-to').focus(), 50);
  state.replyData = null;
}

export function closeCompose() {
  document.getElementById('compose-overlay').classList.remove('open');
}

// ── Répondre / Transférer ─────────────────────────────────────────────────

export function replyEmail() {
  if (!state.currentMessage) return;
  const from    = getHeader(state.currentMessage, 'From');
  const subject = getHeader(state.currentMessage, 'Subject');
  const date    = getHeader(state.currentMessage, 'Date');

  const fromAddr = (from.match(/<(.+?)>/) || [, ''])[1] || from;
  const body = `\n\n---\nDe : ${from}\nDate : ${date}\n\n${state.currentMessage.snippet}`;

  state.replyData = { threadId: state.currentMessage.threadId, inReplyTo: state.currentMessage.id };
  openCompose(fromAddr, 'Re: ' + subject.replace(/^Re:\s*/i, ''), body, '↩ Répondre');
}

export function forwardEmail() {
  if (!state.currentMessage) return;
  const subject = getHeader(state.currentMessage, 'Subject');
  const from    = getHeader(state.currentMessage, 'From');
  const date    = getHeader(state.currentMessage, 'Date');

  const body = `\n\n---\n🔄 Transféré de : ${from}\nDate : ${date}\n\n${state.currentMessage.snippet}`;
  state.replyData = null;
  openCompose('', 'Fwd: ' + subject.replace(/^Fwd:\s*/i, ''), body, '↪ Transférer');
}

// ── Envoi ─────────────────────────────────────────────────────────────────

export async function sendEmail() {
  const to      = document.getElementById('compose-to').value.trim();
  const cc      = document.getElementById('compose-cc').value.trim();
  const subject = document.getElementById('compose-subject').value.trim();
  const body    = document.getElementById('compose-body-field').value;

  if (!to) { showToast('Destinataire requis', 'error'); return; }

  // Encode le sujet en RFC 2047 base64 UTF-8 pour les accents
  const subjectBytes = new TextEncoder().encode(subject);
  let subjectBin = '';
  const chunk = 3 * 1024;
  for (let i = 0; i < subjectBytes.length; i += chunk) {
    subjectBin += String.fromCharCode(...subjectBytes.subarray(i, i + chunk));
  }
  const subjectB64 = btoa(subjectBin);

  // Encode le corps en base64 UTF-8
  const bodyBytes = new TextEncoder().encode(body);
  let bodyBin = '';
  for (let i = 0; i < bodyBytes.length; i += chunk) {
    bodyBin += String.fromCharCode(...bodyBytes.subarray(i, i + chunk));
  }
  const bodyB64 = btoa(bodyBin);

  const rawParts = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: =?UTF-8?B?${subjectB64}?=`,
    state.replyData ? `In-Reply-To: ${state.replyData.inReplyTo}` : null,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    bodyB64,
  ].filter(l => l !== null).join('\r\n');

  const mimeBytes = new TextEncoder().encode(rawParts);
  let mimeBin = '';
  for (let i = 0; i < mimeBytes.length; i += chunk) {
    mimeBin += String.fromCharCode(...mimeBytes.subarray(i, i + chunk));
  }
  const encoded = btoa(mimeBin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const payload = { raw: encoded };
  if (state.replyData) payload.threadId = state.replyData.threadId;

  try {
    await gmailPost('users/me/messages/send', payload);
    closeCompose();
    showToast('Email envoyé ✓', 'success');
  } catch (e) {
    console.error('[compose] sendEmail:', e);
    showToast('Erreur d\'envoi : ' + e.message, 'error');
  }
}
