import { state } from './state.js';
import { gmailGet } from './api.js';

const SIDEBAR_PREF_KEY = 'gmail-sidebar-collapsed';
let toastTimer;

export function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3000);
}

export function showLoadingBar() {
  const bar = document.getElementById('loading-bar');
  bar.style.display = 'block';
  bar.style.width = '70%';
}

export function hideLoadingBar() {
  const bar = document.getElementById('loading-bar');
  bar.style.width = '100%';
  setTimeout(() => { bar.style.display = 'none'; bar.style.width = '0'; }, 300);
}

export function showEmptyState() {
  document.getElementById('empty-state').style.display = 'flex';
  document.getElementById('msg-view').style.display = 'none';
}

export function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  if (state.selectedIds.size > 0) {
    bar.style.display = 'flex';
    document.getElementById('bulk-count').textContent =
      `${state.selectedIds.size} sélectionné(s)`;
  } else {
    bar.style.display = 'none';
  }
}

export function removeEmailFromList(id) {
  const el = document.querySelector(`.email-item[data-id="${id}"]`);
  if (el) el.remove();
  state.selectedIds.delete(id);
  updateBulkBar();

  if (state.currentMessageId === id) {
    showEmptyState();
    state.currentMessageId = null;
  }
}

export async function updateInboxBadge() {
  try {
    const data = await gmailGet('users/me/labels/INBOX');
    const count = data.messagesUnread || 0;
    const badge = document.getElementById('badge-inbox');
    badge.textContent = count > 0 ? count : '';
  } catch (e) {
    console.error('[ui] updateInboxBadge:', e);
  }
}

export function showLoginLoading(msg) {
  document.getElementById('login-form').style.display = 'none';
  const loading = document.getElementById('login-loading');
  loading.style.display = 'flex';
  document.getElementById('login-loading-msg').textContent = msg || 'Reconnexion…';
}

export function showLoginForm() {
  document.getElementById('login-loading').style.display = 'none';
  document.getElementById('login-form').style.display = 'flex';
}

export function resizeMsgIframe(iframe) {
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc || !doc.body) return;
    const resize = () => {
      const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
      iframe.style.height = (h + 8) + 'px';
    };
    resize();
    doc.querySelectorAll('img').forEach(img => {
      if (!img.complete) img.addEventListener('load', resize, { once: true });
    });
    const mo = new MutationObserver(resize);
    mo.observe(doc.body, { childList: true, subtree: true, attributes: false });
    setTimeout(() => { resize(); mo.disconnect(); }, 3000);
  } catch (e) {
    console.error('[ui] resizeMsgIframe:', e);
  }
}

export function applySidebarState(collapsed) {
  const app = document.getElementById('app');
  const toggleBtn = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  if (!app || !toggleBtn || !sidebar) return;

  state.sidebarCollapsed = collapsed;
  app.classList.toggle('sidebar-collapsed', collapsed);
  sidebar.setAttribute('aria-hidden', String(collapsed));
  toggleBtn.setAttribute('aria-expanded', String(!collapsed));
  toggleBtn.setAttribute('title', collapsed ? 'Afficher le panneau de gauche' : 'Masquer le panneau de gauche');
  toggleBtn.setAttribute('aria-label', collapsed ? 'Afficher le panneau de gauche' : 'Masquer le panneau de gauche');
  toggleBtn.textContent = collapsed ? '☰' : '←';

  try {
    window.localStorage.setItem(SIDEBAR_PREF_KEY, collapsed ? '1' : '0');
  } catch (e) {
    console.warn('[ui] Impossible de sauvegarder la préférence du panneau latéral:', e);
  }
}

export function toggleSidebar() {
  applySidebarState(!state.sidebarCollapsed);
}

export function initSidebarToggle() {
  let collapsed = false;
  try {
    collapsed = window.localStorage.getItem(SIDEBAR_PREF_KEY) === '1';
  } catch (e) {
    console.warn('[ui] Impossible de lire la préférence du panneau latéral:', e);
  }
  applySidebarState(collapsed);
}
