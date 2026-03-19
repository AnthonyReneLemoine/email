// Fonctions de décodage et de parsing MIME — aucune dépendance externe.

// ── Décodage base64url → Uint8Array ───────────────────────────────────────

export function base64UrlToBytes(data) {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Détection et normalisation du charset ─────────────────────────────────

export function normalizeCharset(charset) {
  if (!charset) return 'utf-8';
  const v = charset.toLowerCase();
  if (v === 'utf8') return 'utf-8';
  if (v === 'latin1') return 'iso-8859-1';
  if (v === 'cp1252') return 'windows-1252';
  return v;
}

/**
 * Décode des octets en chaîne en essayant plusieurs charsets.
 * Priorité UTF-8 stricte d'abord (corrige les emails Outlook mal encodés).
 */
export function decodeBytes(bytes, preferredCharset = 'utf-8') {
  if (preferredCharset !== 'utf-8') {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) {}
  }
  const candidates = [preferredCharset, 'utf-8', 'windows-1252', 'iso-8859-1'];
  const tested = new Set();
  for (const cs of candidates) {
    if (!cs || tested.has(cs)) continue;
    tested.add(cs);
    try { return new TextDecoder(cs).decode(bytes); } catch (_) {}
  }
  // Fallback byte-par-byte
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return text;
}

// ── Décodage d'une partie de message Gmail ────────────────────────────────


function decodeQuotedPrintableToBytes(input) {
  const normalized = input
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  const bytes = new Uint8Array(normalized.length);
  for (let i = 0; i < normalized.length; i++) bytes[i] = normalized.charCodeAt(i) & 0xff;
  return bytes;
}

function decodeTransferEncodedBody(part, bytes) {
  const transferEncoding = ((part.headers || [])
    .find(h => h.name?.toLowerCase() === 'content-transfer-encoding')?.value || '')
    .trim()
    .toLowerCase();

  if (transferEncoding === 'quoted-printable') {
    const ascii = String.fromCharCode(...bytes);
    return decodeQuotedPrintableToBytes(ascii);
  }

  if (transferEncoding === 'base64') {
    try {
      const ascii = String.fromCharCode(...bytes).replace(/\s+/g, '');
      return Uint8Array.from(atob(ascii), c => c.charCodeAt(0));
    } catch (_) {
      return bytes;
    }
  }

  return bytes;
}

export function decodePartBody(part) {
  const rawBytes = base64UrlToBytes(part.body?.data || '');
  if (!rawBytes.length) return '';
  const bytes = decodeTransferEncodedBody(part, rawBytes);
  const contentType = (part.headers || [])
    .find(h => h.name?.toLowerCase() === 'content-type')?.value || '';
  const charsetRaw = (contentType.match(/charset\s*=\s*['"']?([^;\s'"]+)/i) || [])[1] || '';
  return decodeBytes(bytes, normalizeCharset(charsetRaw));
}

// ── Extraction corps HTML / texte ─────────────────────────────────────────

export function extractBody(payload) {
  let html = '', text = '';

  function walk(part) {
    if (!part) return;
    const mime = (part.mimeType || '').toLowerCase();
    if (mime === 'text/html' && part.body?.data) {
      html = decodePartBody(part);
    } else if (mime === 'text/plain' && part.body?.data && !html) {
      text = decodePartBody(part);
    }
    if (part.parts) part.parts.forEach(walk);
  }

  walk(payload);

  // Message mono-part sans "parts"
  if (!html && !text && payload?.body?.data) {
    const mime = (payload.mimeType || '').toLowerCase();
    if (mime === 'text/html') html = decodePartBody(payload);
    else text = decodePartBody(payload);
  }

  return { html, text };
}

// ── Extraction des pièces jointes ─────────────────────────────────────────

export function extractAttachments(payload) {
  const attachments = [];

  function walk(part) {
    if (!part) return;
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename:     part.filename,
        mimeType:     part.mimeType || 'application/octet-stream',
        attachmentId: part.body.attachmentId,
        size:         part.body.size || 0,
      });
    }
    if (part.parts) part.parts.forEach(walk);
  }

  walk(payload);
  return attachments;
}

// ── Suppression d'une pièce jointe du MIME brut ───────────────────────────

/**
 * Reconstruit un message MIME sans la pièce jointe dont le filename correspond.
 * Retourne null si introuvable.
 */
export function removeMimeAttachment(mimeText, targetFilename) {
  const text = mimeText.replace(/\r\n/g, '\n');
  const sepIdx = text.indexOf('\n\n');
  if (sepIdx === -1) return null;

  const topHeaders = text.substring(0, sepIdx);
  const topBody = text.substring(sepIdx + 2);

  function findBoundary(headers) {
    const matches = headers.match(/Content-Type:[^\n]*(?:\n[ \t]+[^\n]*)*/gi);
    if (!matches) return null;
    for (const ct of matches) {
      const bm = ct.match(/boundary\s*=\s*"?([^"\s;\n]+)"?/i);
      if (bm) return bm[1];
    }
    return null;
  }

  const boundary = findBoundary(topHeaders);
  if (!boundary) return null;

  const delimiter = '--' + boundary;

  function decodeFilename(raw) {
    if (!raw) return '';
    let s = raw.trim().replace(/^["']|["']$/g, '');
    // RFC 2047 encoded-word (=?charset?B/Q?data?=)
    s = s.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, charset, enc, data) => {
      try {
        if (enc.toUpperCase() === 'B') {
          const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
          return new TextDecoder(charset).decode(bytes);
        }
        return data.replace(/_/g, ' ')
          .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      } catch (_) { return data; }
    });
    try { s = decodeURIComponent(s); } catch (_) {}
    return s.trim();
  }

  function filenameFromHeaders(headerText) {
    // Content-Disposition filename
    let m = headerText.match(/Content-Disposition:[^\n]*(?:\n[ \t]+[^\n]*)*/i);
    if (m) {
      let fm = m[0].match(/filename\*\s*=\s*(?:[a-zA-Z0-9-]*'')?([^\s;\r\n]+)/i);
      if (fm) return decodeFilename(fm[1]);
      fm = m[0].match(/filename\s*=\s*(?:"([^"]+)"|(\S+))/i);
      if (fm) return decodeFilename(fm[1] || fm[2]);
    }
    // Content-Type name=
    m = headerText.match(/Content-Type:[^\n]*(?:\n[ \t]+[^\n]*)*/i);
    if (m) {
      let fm = m[0].match(/name\*\s*=\s*(?:[a-zA-Z0-9-]*'')?([^\s;\r\n]+)/i);
      if (fm) return decodeFilename(fm[1]);
      fm = m[0].match(/name\s*=\s*(?:"([^"]+)"|(\S+))/i);
      if (fm) return decodeFilename(fm[1] || fm[2]);
    }
    return '';
  }

  const lines = topBody.split('\n');
  const parts = [];
  let current = null;
  let ended = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed === delimiter + '--') {
      if (current !== null) parts.push(current);
      ended = true;
      break;
    } else if (trimmed === delimiter) {
      if (current !== null) parts.push(current);
      current = [];
    } else if (current !== null) {
      current.push(line);
    }
  }
  if (current !== null && !ended) parts.push(current);

  let removed = false;
  const filteredParts = parts.filter(partLines => {
    const partText = partLines.join('\n');
    const partSep = partText.indexOf('\n\n');
    const partHeaders = partSep === -1 ? partText : partText.substring(0, partSep);
    const fn = filenameFromHeaders(partHeaders);
    if (fn && fn === targetFilename) { removed = true; return false; }
    return true;
  });

  if (!removed) return null;

  let result = topHeaders + '\n\n';
  for (const partLines of filteredParts) {
    result += delimiter + '\n' + partLines.join('\n') + '\n';
  }
  result += delimiter + '--\n';

  return result.replace(/\n/g, '\r\n');
}
