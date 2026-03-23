import { CLIENT_ID, SCOPES, FIREBASE_CONFIG } from './config.js';
import { state } from './state.js';
import { gmailGet } from './api.js';
import { showToast, showLoginLoading, showLoginForm, updateInboxBadge } from './ui.js';

// ── Firebase ───────────────────────────────────────────────────────────────

export function initFirebase() {
  if (!FIREBASE_CONFIG) return;
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    state.db = firebase.firestore();
  } catch (e) {
    console.warn('[auth] Firebase init échouée:', e);
  }
}

export async function firebaseSignIn() {
  if (!state.db || !state.accessToken) return;
  try {
    const credential = firebase.auth.GoogleAuthProvider.credential(null, state.accessToken);
    const result = await firebase.auth().signInWithCredential(credential);
    state.firebaseUid = result.user.uid;
  } catch (e) {
    console.warn('[auth] Firebase sign-in échouée:', e);
  }
}

export async function loadSigFromFirebase() {
  if (!state.db || !state.firebaseUid) return null;
  try {
    const doc = await state.db.collection('users').doc(state.firebaseUid).get();
    return doc.exists ? (doc.data().signature ?? null) : null;
  } catch (e) {
    console.error('[auth] loadSigFromFirebase:', e);
    return null;
  }
}

export async function saveSigToFirebase(sig) {
  if (!state.db || !state.firebaseUid) return;
  try {
    await state.db.collection('users').doc(state.firebaseUid).set({ signature: sig }, { merge: true });
  } catch (e) {
    console.error('[auth] saveSigToFirebase:', e);
  }
}

// ── Profil utilisateur ─────────────────────────────────────────────────────

export async function fetchUserInfo() {
  const data = await gmailGet('users/me/profile');
  document.getElementById('user-email').textContent = data.emailAddress;
  return data;
}

// ── Session ────────────────────────────────────────────────────────────────

/**
 * Tente de restaurer la session depuis sessionStorage au démarrage.
 */
export function tryRestoreSession() {
  const token = sessionStorage.getItem('gmail_token');
  const expiry = parseInt(sessionStorage.getItem('gmail_token_expiry') || '0');
  if (token && Date.now() < expiry - 60_000) {
    state.accessToken = token;
    scheduleTokenRefresh((expiry - Date.now()) / 1000);
    showLoginLoading('Restauration de la session…');
    fetchUserInfo().then(showApp).catch(() => trySilentRefresh());
  } else if (token) {
    trySilentRefresh();
  }
  // Sinon : pas de token → l'écran de login reste visible avec le bouton
}

export function trySilentRefresh() {
  showLoginLoading('Reconnexion…');
  state.silentRefreshTimer = setTimeout(() => showLoginForm(), 8000);
  state.tokenClient.requestAccessToken({ prompt: '' });
}

/**
 * Planifie un rafraîchissement silencieux du token 5 minutes avant son expiration,
 * afin que la session dure jusqu'à la fermeture de l'onglet.
 */
function scheduleTokenRefresh(expiresInSeconds) {
  if (state.tokenRefreshTimer) clearTimeout(state.tokenRefreshTimer);
  const delay = Math.max(0, expiresInSeconds - 300) * 1000;
  state.tokenRefreshTimer = setTimeout(() => {
    state.tokenClient.requestAccessToken({ prompt: '' });
  }, delay);
}

/**
 * Callback appelé par Google Identity Services après obtention du token.
 */
export function handleToken(resp) {
  clearTimeout(state.silentRefreshTimer);
  if (resp.error) {
    sessionStorage.removeItem('gmail_token');
    sessionStorage.removeItem('gmail_token_expiry');
    showLoginForm();
    if (resp.error !== 'user_logged_out' && resp.error !== 'access_denied') {
      showToast('Erreur d\'authentification : ' + resp.error, 'error');
    }
    return;
  }
  state.accessToken = resp.access_token;
  const expiresIn = resp.expires_in || 3600;
  const expiry = Date.now() + expiresIn * 1000;
  sessionStorage.setItem('gmail_token', state.accessToken);
  sessionStorage.setItem('gmail_token_expiry', String(expiry));
  scheduleTokenRefresh(expiresIn);
  fetchUserInfo().then(showApp).catch(() => showLoginForm());
}

// ── Affichage de l'app après connexion ────────────────────────────────────

export async function showApp() {
  // Import dynamique pour éviter les dépendances circulaires au chargement
  const { loadFolder } = await import('./mail.js');
  const { loadUserLabels } = await import('./labels.js');
  const { startPolling } = await import('./notifications.js');

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'flex';

  loadFolder('INBOX');
  updateInboxBadge();
  loadUserLabels();
  startPolling();

  // Firebase : signer + charger la signature
  await firebaseSignIn();
  const remoteSig = await loadSigFromFirebase();
  if (remoteSig !== null) localStorage.setItem('mail_signature', remoteSig);
}

// ── Connexion / déconnexion ────────────────────────────────────────────────

export function initGoogleAuth() {
  state.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: handleToken,
  });
  tryRestoreSession();
}

export function signIn() {
  if (!state.tokenClient) {
    showToast('Librairie Google non chargée', 'error');
    return;
  }
  state.tokenClient.requestAccessToken({ prompt: 'consent' });
}

export function signOut() {
  if (state.accessToken) {
    google.accounts.oauth2.revoke(state.accessToken, () => {});
  }
  state.accessToken = null;
  sessionStorage.removeItem('gmail_token');
  sessionStorage.removeItem('gmail_token_expiry');
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  if (state.tokenRefreshTimer) { clearTimeout(state.tokenRefreshTimer); state.tokenRefreshTimer = null; }
  state.knownInboxIds = null;
  document.getElementById('main-app').style.display = 'none';
  showLoginForm();
  document.getElementById('login-screen').style.display = 'flex';
}
