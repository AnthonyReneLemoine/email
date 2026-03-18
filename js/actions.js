import { state } from './state.js';
import { gmailPost } from './api.js';
import { showToast, showLoadingBar, hideLoadingBar, removeEmailFromList, updateInboxBadge, updateBulkBar } from './ui.js';

// ── Lire / Non lu ─────────────────────────────────────────────────────────

export async function toggleRead() {
  if (!state.currentMessageId) return;
  const msg = state.currentMessage;
  const isUnread = (msg.labelIds || []).includes('UNREAD');
  try {
    await gmailPost(`users/me/messages/${state.currentMessageId}/modify`, {
      [isUnread ? 'removeLabelIds' : 'addLabelIds']: ['UNREAD'],
    });
    if (isUnread) {
      msg.labelIds = (msg.labelIds || []).filter(l => l !== 'UNREAD');
      document.getElementById('btn-toggle-read').textContent = 'Marquer non lu';
      document.querySelector(`.email-item[data-id="${state.currentMessageId}"]`)?.classList.remove('unread');
    } else {
      msg.labelIds = [...(msg.labelIds || []), 'UNREAD'];
      document.getElementById('btn-toggle-read').textContent = 'Marquer lu';
      document.querySelector(`.email-item[data-id="${state.currentMessageId}"]`)?.classList.add('unread');
    }
    updateInboxBadge();
    showToast(isUnread ? 'Marqué lu' : 'Marqué non lu', 'success');
  } catch (e) {
    console.error('[actions] toggleRead:', e);
    showToast('Erreur : ' + e.message, 'error');
  }
}

// ── Archiver ──────────────────────────────────────────────────────────────

export async function archiveEmail() {
  if (!state.currentMessageId) return;
  try {
    await gmailPost(`users/me/messages/${state.currentMessageId}/modify`, {
      removeLabelIds: ['INBOX'],
    });
    removeEmailFromList(state.currentMessageId);
    showToast('Email archivé', 'success');
  } catch (e) {
    console.error('[actions] archiveEmail:', e);
    showToast('Erreur : ' + e.message, 'error');
  }
}

// ── Supprimer (email ouvert) ───────────────────────────────────────────────

export async function deleteEmail() {
  if (!state.currentMessageId) return;
  if (!confirm('Supprimer cet email ?')) return;
  try {
    await gmailPost(`users/me/messages/${state.currentMessageId}/trash`, {});
    removeEmailFromList(state.currentMessageId);
    showToast('Email supprimé', 'success');
  } catch (e) {
    console.error('[actions] deleteEmail:', e);
    showToast('Erreur : ' + e.message, 'error');
  }
}

// ── Supprimer (bouton corbeille dans la liste) ─────────────────────────────

export async function trashEmailFromList(event, id) {
  event.stopPropagation();
  try {
    await gmailPost(`users/me/messages/${id}/trash`, {});
    removeEmailFromList(id);
    showToast('Email supprimé', 'success');
  } catch (e) {
    console.error('[actions] trashEmailFromList:', e);
    showToast('Erreur : ' + e.message, 'error');
  }
}

// ── Sélection multiple ─────────────────────────────────────────────────────

export function toggleSelect(event, id) {
  const el = document.querySelector(`.email-item[data-id="${id}"]`);
  if (event.target.checked) {
    state.selectedIds.add(id);
    el?.classList.add('selected');
  } else {
    state.selectedIds.delete(id);
    el?.classList.remove('selected');
  }
  updateBulkBar();
}

export function clearSelection() {
  state.selectedIds.clear();
  document.querySelectorAll('.email-item.selected').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.email-cb').forEach(cb => { cb.checked = false; });
  updateBulkBar();
}

export async function deleteSelected() {
  if (!state.selectedIds.size) return;
  if (!confirm(`Supprimer ${state.selectedIds.size} email(s) ?`)) return;
  showLoadingBar();
  try {
    await Promise.all(
      [...state.selectedIds].map(id => gmailPost(`users/me/messages/${id}/trash`, {}))
    );
    state.selectedIds.forEach(id => {
      document.querySelector(`.email-item[data-id="${id}"]`)?.remove();
    });
    state.selectedIds.clear();
    updateBulkBar();
    showToast('Emails déplacés dans la corbeille', 'success');
  } catch (e) {
    console.error('[actions] deleteSelected:', e);
    showToast('Erreur : ' + e.message, 'error');
  }
  hideLoadingBar();
}
