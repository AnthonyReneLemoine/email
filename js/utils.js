// Fonctions utilitaires pures (pas d'effets de bord, pas d'accès au DOM).

/**
 * Échappe les caractères HTML pour éviter les injections dans du texte affiché via innerHTML.
 */
export function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Retourne la valeur d'un header Gmail (case-insensitive).
 */
export function getHeader(msg, name) {
  return (msg.payload?.headers || [])
    .find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

/**
 * Formate une date pour la liste d'emails : heure si aujourd'hui, sinon jour/mois.
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr.substring(0, 10);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/**
 * Formate une date complète pour l'en-tête d'un email ouvert.
 */
export function formatDateFull(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Formate une taille en octets en chaîne lisible (o / Ko / Mo).
 */
export function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

/**
 * Retourne l'emoji représentant le type MIME d'une pièce jointe.
 */
export function attIcon(mime) {
  if (mime.startsWith('image/')) return '🖼';
  if (mime.startsWith('video/')) return '▶';
  if (mime.startsWith('audio/')) return '♪';
  if (mime.includes('pdf')) return '📄';
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('archive')) return '📦';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return '📊';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📊';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  return '📎';
}
