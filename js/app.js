// Point d'entrée principal — charge les modules et expose les fonctions
// nécessaires aux gestionnaires d'événements inline du HTML.

import { CLIENT_ID } from './config.js';
import { initFirebase, initGoogleAuth, signIn, signOut } from './auth.js';
import { loadFolder, refreshCurrentFolder, searchEmails, viewSource, closeSource } from './mail.js';
import { openCompose, closeCompose, replyEmail, forwardEmail, sendEmail } from './compose.js';
import { toggleRead, archiveEmail, deleteEmail, trashEmailFromList, toggleSelect, clearSelection, deleteSelected } from './actions.js';
import { openSigModal, closeSigModal, saveSig, clearSig } from './signature.js';
import { showEmptyState, resizeMsgIframe, toggleSidebar, initSidebarToggle } from './ui.js';
import { primeNotificationAudio } from './notifications.js';

// ── Exposition globale (pour les handlers inline du HTML) ─────────────────
// On préfixe window.* pour rendre l'intention explicite.

window.signIn               = signIn;
window.signOut              = signOut;
window.loadFolder           = loadFolder;
window.refreshCurrentFolder = refreshCurrentFolder;
window.searchEmails         = searchEmails;
window.openCompose          = openCompose;
window.closeCompose         = closeCompose;
window.replyEmail           = replyEmail;
window.forwardEmail         = forwardEmail;
window.sendEmail            = sendEmail;
window.toggleRead           = toggleRead;
window.archiveEmail         = archiveEmail;
window.deleteEmail          = deleteEmail;
window.trashEmailFromList   = trashEmailFromList;
window.toggleSelect         = toggleSelect;
window.clearSelection       = clearSelection;
window.deleteSelected       = deleteSelected;
window.openSigModal         = openSigModal;
window.closeSigModal        = closeSigModal;
window.saveSig              = saveSig;
window.clearSig             = clearSig;
window.showEmptyState       = showEmptyState;
window.resizeMsgIframe      = resizeMsgIframe;
window.toggleSidebar        = toggleSidebar;
window.viewSource           = viewSource;
window.closeSource          = closeSource;

// ── Initialisation ────────────────────────────────────────────────────────

window.addEventListener('load', () => {
  initFirebase();
  primeNotificationAudio();

  initSidebarToggle();

  // Raccourcis clavier
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeCompose(); closeSource(); }
    if (
      e.key === 'c' && !e.ctrlKey && !e.metaKey &&
      document.activeElement.tagName !== 'INPUT' &&
      document.activeElement.tagName !== 'TEXTAREA'
    ) {
      openCompose();
    }
  });

  // Avertissement si CLIENT_ID non configuré
  if (CLIENT_ID === 'COLLE_TON_CLIENT_ID_ICI') {
    document.getElementById('config-notice').style.display = 'block';
  }

  // Chargement de la librairie Google Identity Services
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.onload = initGoogleAuth;
  s.onerror = () => {
    console.error('[app] Impossible de charger la librairie Google Identity');
  };
  document.head.appendChild(s);
});
