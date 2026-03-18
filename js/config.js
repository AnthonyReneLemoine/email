// ── Identifiants Google OAuth ──
export const CLIENT_ID = '58430652200-bcn4ohfmg6at6ei5t4eofeppkv7o083j.apps.googleusercontent.com';
export const SCOPES = 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send';

// ── Firebase (optionnel — remplace null par ta config pour activer la synchro de signature) ──
export const FIREBASE_CONFIG = null;
// Exemple : { apiKey: "...", authDomain: "...", projectId: "...", ... }

// ── Correspondance label Gmail ↔ nom affiché ──
export const FOLDER_LABELS = {
  INBOX:   'INBOX',
  SENT:    'SENT',
  STARRED: 'STARRED',
  DRAFT:   'DRAFT',
  TRASH:   'TRASH',
  SPAM:    'SPAM',
};

export const FOLDER_NAMES = {
  INBOX:   'Boîte de réception',
  SENT:    'Envoyés',
  STARRED: 'Suivis',
  DRAFT:   'Brouillons',
  TRASH:   'Corbeille',
  SPAM:    'Spam',
};
