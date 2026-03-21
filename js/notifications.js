import { state } from './state.js';
import { gmailGet } from './api.js';
import { showToast, updateInboxBadge } from './ui.js';
import { loadFolder } from './mail.js';

// ── Son de notification ────────────────────────────────────────────────────

const _notificationAudio = new Audio('new_mail.wav');

export function primeNotificationAudio() {
  // Déverrouille la lecture audio sur le premier geste utilisateur
  const unlock = () => {
    _notificationAudio.play().then(() => {
      _notificationAudio.pause();
      _notificationAudio.currentTime = 0;
    }).catch(() => {});
  };
  ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(evt => {
    document.addEventListener(evt, unlock, { once: true, passive: true });
  });
}

async function playNotificationSound() {
  try {
    _notificationAudio.currentTime = 0;
    await _notificationAudio.play();
  } catch (e) {
    console.error('[notifications] playNotificationSound:', e);
  }
}

// ── Polling boîte de réception ────────────────────────────────────────────

async function pollInbox() {
  try {
    const data = await gmailGet('users/me/messages', { labelIds: 'INBOX', maxResults: 20 });
    const ids = (data.messages || []).map(m => m.id);

    if (state.knownInboxIds === null) {
      state.knownInboxIds = new Set(ids);
      return;
    }

    const newIds = ids.filter(id => !state.knownInboxIds.has(id));
    if (newIds.length > 0) {
      newIds.forEach(id => state.knownInboxIds.add(id));
      playNotificationSound();
      const n = newIds.length;
      showToast(`${n} nouveau${n > 1 ? 'x' : ''} message${n > 1 ? 's' : ''}`, 'success');
      updateInboxBadge();
      if (state.currentFolder === 'INBOX') loadFolder('INBOX');
    }
  } catch (e) {
    console.error('[notifications] pollInbox:', e);
  }
}

export function startPolling() {
  pollInbox(); // initialise knownInboxIds au premier appel
  state.pollTimer = setInterval(pollInbox, 60_000);
}
