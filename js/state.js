// État global de l'application.
// On utilise un objet unique pour permettre la mutation depuis n'importe quel module
// sans contourner les live bindings ES modules.
export const state = {
  tokenClient:      null,
  accessToken:      null,
  currentFolder:    'INBOX',
  currentMessageId: null,
  currentMessage:   null,
  pageTokens:       { INBOX: null },
  replyData:        null,
  selectedIds:      new Set(),
  db:               null,
  firebaseUid:      null,
  knownInboxIds:    null,   // null = pas encore initialisé (premier poll)
  pollTimer:        null,
  messageCache:     {},
  silentRefreshTimer: null,
  tokenRefreshTimer:  null,
  sidebarCollapsed: false,
};
