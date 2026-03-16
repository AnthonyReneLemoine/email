import { state } from './state.js';
import { gmailGet } from './api.js';
import { showToast, updateInboxBadge } from './ui.js';
import { loadFolder } from './mail.js';

// ── Son de notification ────────────────────────────────────────────────────

let _audioCtx = null;

function getAudioContext() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

function unlockAudio() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) {
    console.error('[notifications] unlockAudio:', e);
  }
}

['click', 'keydown', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, unlockAudio, { once: false, passive: true });
});

async function playNotificationSound() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const notes = [
      { freq: 523.25, start: 0,    dur: 0.12 },
      { freq: 659.25, start: 0.13, dur: 0.12 },
      { freq: 783.99, start: 0.26, dur: 0.22 },
    ];
    notes.forEach(({ freq, start, dur }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + start + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    });
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
