import { FOLDER_LABELS, FOLDER_NAMES } from './config.js';
import { state } from './state.js';
import { gmailGet, gmailPost } from './api.js';
import { escHtml, getHeader, formatDate, formatDateFull, formatSize, attIcon } from './utils.js';
import { extractBody, extractAttachments, base64UrlToBytes, removeMimeAttachment } from './mime.js';
import {
  showToast, showLoadingBar, hideLoadingBar, showEmptyState,
  updateInboxBadge, removeEmailFromList, resizeMsgIframe,
} from './ui.js';

// ── Chargement d'un dossier ────────────────────────────────────────────────

export async function loadFolder(folder, navEl) {
  state.currentFolder = folder;
  state.currentMessageId = null;
  clearSelection();
  showEmptyState();

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (navEl) {
    navEl.classList.add('active');
  } else {
    const el = document.querySelector(`[data-folder="${folder}"]`);
    if (el) el.classList.add('active');
  }

  document.getElementById('list-title').textContent = FOLDER_NAMES[folder] || folder;
  document.getElementById('email-list').innerHTML =
    '<div style="padding:40px;text-align:center;"><div class="spinner"></div></div>';

  try {
    await fetchMessages(folder, false);
  } catch (e) {
    console.error('[mail] loadFolder:', e);
    const msg = escHtml(e.message || 'Erreur inconnue');
    document.getElementById('email-list').innerHTML =
      `<div style="padding:20px;color:var(--danger);font-size:12px;font-family:var(--mono);">Erreur : ${msg}</div>`;
  }
}

export function refreshCurrentFolder() {
  loadFolder(state.currentFolder);
}

// ── Récupération des messages ──────────────────────────────────────────────

export async function fetchMessages(folder, append) {
  const labelId = FOLDER_LABELS[folder] || folder;
  const params = { labelIds: labelId, maxResults: 30, format: 'metadata' };
  if (append && state.pageTokens[folder]) params.pageToken = state.pageTokens[folder];

  const data = await gmailGet('users/me/messages', params);
  state.pageTokens[folder] = data.nextPageToken || null;

  const messages = data.messages || [];

  const details = await Promise.all(
    messages.map(m =>
      gmailGet(`users/me/messages/${m.id}`, {
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      }).catch(e => {
        console.error('[mail] fetchMessages metadata:', e);
        return null;
      })
    )
  );

  const list = document.getElementById('email-list');
  if (!append) list.innerHTML = '';

  const oldBtn = list.querySelector('.load-more-btn');
  if (oldBtn) oldBtn.remove();

  details.filter(Boolean).forEach(msg => {
    state.messageCache[msg.id] = msg;
    list.appendChild(buildEmailItem(msg));
  });

  if (state.pageTokens[folder]) {
    const btn = document.createElement('button');
    btn.className = 'load-more-btn';
    btn.textContent = '↓ Charger plus';
    btn.onclick = () => fetchMessages(folder, true);
    list.appendChild(btn);
  }

  if (!list.children.length) {
    list.innerHTML =
      '<div style="padding:40px;text-align:center;font-size:12px;font-family:var(--mono);color:var(--text3);">Aucun email</div>';
  }
}

// ── Construction d'un élément de liste ────────────────────────────────────

export function buildEmailItem(msg) {
  const from    = getHeader(msg, 'From');
  const subject = getHeader(msg, 'Subject') || '(Sans objet)';
  const date    = getHeader(msg, 'Date');
  const snippet = msg.snippet || '';
  const isUnread = (msg.labelIds || []).includes('UNREAD');

  const fromName = from.replace(/<.*?>/, '').trim().replace(/^"|"$/g, '') || from.split('@')[0];
  const dateStr  = formatDate(date);
  const hasAtt   = hasAttachments(msg);

  const el = document.createElement('div');
  el.className = 'email-item' + (isUnread ? ' unread' : '');
  el.dataset.id = msg.id;
  el.innerHTML = `
    <div class="email-from">
      <span>${escHtml(fromName.substring(0, 30))}</span>
      <div class="email-date-wrap">
        <label class="email-cb-area" onclick="event.stopPropagation()">
          <input type="checkbox" class="email-cb" onchange="window.toggleSelect(event, '${msg.id}')">
        </label>
        <span class="email-date">${dateStr}</span>
        <div class="email-item-icons">
          ${hasAtt ? '<span class="email-attach-icon" title="Pièce jointe">📎</span>' : ''}
          <button class="email-trash-btn" title="Supprimer" aria-label="Supprimer"
            onclick="window.trashEmailFromList(event, '${msg.id}')">🗑</button>
        </div>
      </div>
    </div>
    <div class="email-subject">${escHtml(subject)}</div>
    <div class="email-snippet">${escHtml(snippet.substring(0, 80))}</div>
  `;

  el.onclick = () => openMessage(msg.id, el);

  el.draggable = true;
  el.addEventListener('dragstart', e => {
    const selected = [...document.querySelectorAll('.email-item.selected')];
    const ids = selected.length > 0 && selected.some(s => s.dataset.id === msg.id)
      ? selected.map(s => s.dataset.id)
      : [msg.id];
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({ ids }));
    setTimeout(() => el.classList.add('dragging'), 0);
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));

  return el;
}

function hasAttachments(msg) {
  const mime = msg.payload?.mimeType || '';
  return mime === 'multipart/mixed' || mime === 'multipart/related';
}

// ── Ouverture et rendu d'un message ───────────────────────────────────────


function getPartHeader(part, name) {
  return (part.headers || []).find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

async function partBodyToDataUrl(messageId, part) {
  let data = part.body?.data || '';
  if (!data && part.body?.attachmentId) {
    const att = await gmailGet(`users/me/messages/${messageId}/attachments/${part.body.attachmentId}`);
    data = att.data || '';
  }
  if (!data) return null;
  const mimeType = part.mimeType || 'application/octet-stream';
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return `data:${mimeType};base64,${b64}`;
}

async function buildInlineImageMap(messageId, payload) {
  const inlineParts = [];

  function walk(part) {
    if (!part) return;
    const cid = getPartHeader(part, 'Content-ID').trim().replace(/^<|>$/g, '');
    const disposition = getPartHeader(part, 'Content-Disposition').toLowerCase();
    const mime = (part.mimeType || '').toLowerCase();
    const isInlineCandidate = mime.startsWith('image/') && (cid || disposition.includes('inline'));
    if (isInlineCandidate) inlineParts.push({ cid, part });
    if (part.parts) part.parts.forEach(walk);
  }

  walk(payload);

  const entries = await Promise.all(inlineParts.map(async ({ cid, part }) => {
    const url = await partBodyToDataUrl(messageId, part);
    if (!url) return null;
    const keys = new Set();
    if (cid) {
      keys.add(`cid:${cid}`);
      keys.add(`cid:<${cid}>`);
    }
    const filename = part.filename?.trim();
    if (filename) keys.add(filename);
    return { keys: [...keys], url };
  }));

  const map = new Map();
  entries.filter(Boolean).forEach(({ keys, url }) => keys.forEach(key => map.set(key, url)));
  return map;
}


function buildMessageHtmlDoc(safeHtml) {
  return `<!DOCTYPE html><html><head>
<base target="_blank">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 20px 24px; font-family: Arial,sans-serif; font-size: 14px; line-height: 1.6; color: #202124; word-break: break-word; overflow-wrap: break-word; }
  img { max-width: 100%; height: auto; }
  a { color: #1a73e8; }
  pre, code { white-space: pre-wrap; word-break: break-all; background: #f1f3f4; padding: 2px 4px; border-radius: 3px; font-size: 13px; }
  table { max-width: 100%; border-collapse: collapse; }
  blockquote { border-left: 3px solid #dadce0; margin: 8px 0; padding: 4px 12px; color: #5f6368; }
</style></head><body>${safeHtml}</body></html>`;
}

function writeMessageIframe(iframe, safeHtml) {
  iframe.srcdoc = buildMessageHtmlDoc(safeHtml);
}

function normalizeEmailHtml(rawHtml, inlineImageMap) {
  const doc = new DOMParser().parseFromString(rawHtml, ‘text/html’);

  doc.querySelectorAll(‘img’).forEach(img => {
    const lazySrc = img.getAttribute(‘src’)
      || img.getAttribute(‘data-src’)
      || img.getAttribute(‘data-original’)
      || img.getAttribute(‘data-original-src’)
      || img.getAttribute(‘data-lazy-src’);
    if (lazySrc) img.setAttribute(‘src’, lazySrc.trim());

    const src = img.getAttribute(‘src’) || ‘’;
    if (inlineImageMap.has(src)) img.setAttribute(‘src’, inlineImageMap.get(src));
    if (!img.getAttribute(‘alt’)) img.setAttribute(‘alt’, ‘Image de l\’email’);
    img.setAttribute(‘loading’, ‘eager’);
    img.removeAttribute(‘srcset’);
    img.removeAttribute(‘data-srcset’);
  });

  doc.querySelectorAll(‘[style]’).forEach(el => {
    const style = el.getAttribute(‘style’) || ‘’;
    if (/background-image\s*:/i.test(style) && /cid:/i.test(style)) {
      const nextStyle = style.replace(/url\(([^)]+)\)/gi, (match, rawUrl) => {
        const cleanedUrl = rawUrl.trim().replace(/^[‘"]|[‘"]$/g, ‘’);
        return inlineImageMap.has(cleanedUrl) ? `url(${inlineImageMap.get(cleanedUrl)})` : match;
      });
      el.setAttribute(‘style’, nextStyle);
    }
  });

  // Préserve les styles CSS définis dans le <head> de l’email
  const headStyles = [...doc.head.querySelectorAll(‘style’)]
    .map(s => s.outerHTML).join(‘’);

  return headStyles + (doc.body.innerHTML || rawHtml);
}

export async function openMessage(id, el) {
  document.querySelectorAll('.email-item').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  state.currentMessageId = id;

  showLoadingBar();
  try {
    const msg = await gmailGet(`users/me/messages/${id}`, { format: 'full' });
    state.currentMessage = msg;
    await renderMessage(msg);

    if ((msg.labelIds || []).includes('UNREAD')) {
      await gmailPost(`users/me/messages/${id}/modify`, { removeLabelIds: ['UNREAD'] });
      el.classList.remove('unread');
      updateInboxBadge();
    }
    document.getElementById('btn-toggle-read').textContent = 'Marquer non lu';
  } catch (e) {
    console.error('[mail] openMessage:', e);
    showToast('Erreur chargement : ' + e.message, 'error');
  }
  hideLoadingBar();
}

export async function renderMessage(msg) {
  const subject  = getHeader(msg, 'Subject') || '(Sans objet)';
  const from     = getHeader(msg, 'From');
  const to       = getHeader(msg, 'To');
  const date     = getHeader(msg, 'Date');

  const fromName = from.replace(/<.*?>/, '').trim().replace(/^"|"$/g, '') || from;
  const initials = fromName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

  document.getElementById('msg-subject').textContent = subject;
  document.getElementById('msg-avatar').textContent = initials;
  document.getElementById('msg-from').textContent =
    fromName + (from.includes('<') ? ' <' + (from.match(/<(.+?)>/)?.[1] || '') + '>' : '');
  document.getElementById('msg-to').textContent = 'À : ' + (to || '');
  document.getElementById('msg-time').textContent = formatDateFull(date);

  const { html, text } = extractBody(msg.payload);
  const bodyInner = document.getElementById('msg-body-inner');
  const iframe    = document.getElementById('msg-iframe');

  if (html) {
    const inlineImageMap = await buildInlineImageMap(msg.id, msg.payload);
    const normalizedHtml = normalizeEmailHtml(html, inlineImageMap);
    bodyInner.style.display = 'none';
    iframe.style.display = 'block';
    iframe.style.height = '200px';

    // Sanitisation via DOMPurify + isolation dans un iframe sandboxé
    const safeHtml = DOMPurify.sanitize(normalizedHtml, {
      FORCE_BODY: true,
      ADD_TAGS: ['style'],
      ADD_ATTR: ['target', 'src', 'data-src', 'data-original', 'data-original-src', 'data-lazy-src', 'style', 'class', 'id', 'loading', 'referrerpolicy'],
    });

    writeMessageIframe(iframe, safeHtml);
  } else {
    iframe.style.display = 'none';
    bodyInner.style.display = 'block';
    bodyInner.textContent = text || msg.snippet || '';
  }

  // Pièces jointes
  const attachments = extractAttachments(msg.payload);
  const attEl = document.getElementById('msg-attachments');
  if (attachments.length) {
    attEl.style.display = 'flex';
    attEl.innerHTML = '';
    attachments.forEach(att => {
      const chip = document.createElement('div');
      chip.className = 'attachment-chip';
      chip.innerHTML = `
        <span class="att-icon">${attIcon(att.mimeType)}</span>
        <span>${escHtml(att.filename)}</span>
        <span class="att-size">${formatSize(att.size)}</span>
        <button class="att-delete-btn" title="Supprimer cette pièce jointe">×</button>
      `;
      chip.addEventListener('click', () =>
        downloadAttachment(att.attachmentId, att.filename, att.mimeType, msg)
      );
      chip.querySelector('.att-delete-btn').addEventListener('click', e => {
        e.stopPropagation();
        deleteAttachment(msg.id, att.filename, att.attachmentId);
      });
      attEl.appendChild(chip);
    });
  } else {
    attEl.style.display = 'none';
    attEl.innerHTML = '';
  }

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('msg-view').style.display = 'flex';
}

// ── Téléchargement d'une pièce jointe ─────────────────────────────────────

export async function downloadAttachment(attachmentId, filename, mimeType, msg) {
  showLoadingBar();
  try {
    const data = await gmailGet(`users/me/messages/${msg.id}/attachments/${attachmentId}`);
    const binary = atob(data.data.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    console.error('[mail] downloadAttachment:', e);
    showToast('Erreur téléchargement : ' + e.message, 'error');
  }
  hideLoadingBar();
}

// ── Suppression d'une pièce jointe (reconstruction MIME) ──────────────────

export async function deleteAttachment(messageId, filename, attachmentId) {
  if (!confirm(`Supprimer la pièce jointe "${filename}" ?\nCette action est irréversible.`)) return;
  showLoadingBar();
  try {
    const rawMsg = await gmailGet(`users/me/messages/${messageId}`, { format: 'raw' });
    const mimeText = new TextDecoder('utf-8', { fatal: false })
      .decode(base64UrlToBytes(rawMsg.raw));

    const newMime = removeMimeAttachment(mimeText, filename);
    if (!newMime) throw new Error('Pièce jointe introuvable dans le MIME');

    const chunkSize = 3 * 1024;
    const newBytes = new TextEncoder().encode(newMime);
    let binary = '';
    for (let i = 0; i < newBytes.length; i += chunkSize) {
      binary += String.fromCharCode(...newBytes.subarray(i, i + chunkSize));
    }
    const newRaw = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

    const inserted = await gmailPost('users/me/messages/insert?internalDateSource=dateHeader', {
      raw: newRaw,
    });

    const labelsToAdd = (rawMsg.labelIds || []).filter(l => l !== 'UNREAD' && l !== 'SENT');
    if (labelsToAdd.length > 0) {
      await gmailPost(`users/me/messages/${inserted.id}/modify`, {
        addLabelIds: labelsToAdd,
        removeLabelIds: [],
      });
    }

    await gmailPost(`users/me/messages/${messageId}/trash`, {});

    delete state.messageCache[messageId];
    delete state.messageCache[inserted.id];

    showToast('Pièce jointe supprimée ✓', 'success');

    state.currentMessageId = inserted.id;
    const newMsg = await gmailGet(`users/me/messages/${inserted.id}`, { format: 'full' });
    state.messageCache[inserted.id] = newMsg;
    state.currentMessage = newMsg;
    await renderMessage(newMsg);

    const oldItem = document.querySelector(`.email-item[data-id="${messageId}"]`);
    if (oldItem) {
      oldItem.dataset.id = inserted.id;
      oldItem.onclick = () => openMessage(inserted.id, oldItem);
      const trashBtn = oldItem.querySelector('.email-trash-btn');
      if (trashBtn) {
        trashBtn.onclick = e => window.trashEmailFromList(e, inserted.id);
      }
    }
  } catch (e) {
    console.error('[mail] deleteAttachment:', e);
    showToast('Erreur : ' + e.message, 'error');
  }
  hideLoadingBar();
}

// ── Code source de l'email ─────────────────────────────────────────────────

export async function viewSource() {
  const id = state.currentMessageId;
  if (!id) return;
  showLoadingBar();
  try {
    const rawMsg = await gmailGet(`users/me/messages/${id}`, { format: 'raw' });
    const mimeText = new TextDecoder('utf-8', { fatal: false })
      .decode(base64UrlToBytes(rawMsg.raw));
    document.getElementById('source-content').textContent = mimeText;
    document.getElementById('source-overlay').classList.add('open');
  } catch (e) {
    console.error('[mail] viewSource:', e);
    showToast('Erreur chargement source : ' + e.message, 'error');
  }
  hideLoadingBar();
}

export function closeSource() {
  document.getElementById('source-overlay').classList.remove('open');
}

// ── Recherche ──────────────────────────────────────────────────────────────

export async function searchEmails() {
  const q = document.getElementById('search').value.trim();
  if (!q) { loadFolder(state.currentFolder); return; }

  document.getElementById('list-title').textContent = `Résultats : "${q}"`;
  document.getElementById('email-list').innerHTML =
    '<div style="padding:40px;text-align:center;"><div class="spinner"></div></div>';
  showEmptyState();

  try {
    const data = await gmailGet('users/me/messages', { q, maxResults: 30 });
    const messages = data.messages || [];
    const details = await Promise.all(
      messages.map(m =>
        gmailGet(`users/me/messages/${m.id}`, {
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date'],
        }).catch(e => { console.error('[mail] searchEmails metadata:', e); return null; })
      )
    );

    const list = document.getElementById('email-list');
    list.innerHTML = '';
    details.filter(Boolean).forEach(msg => {
      state.messageCache[msg.id] = msg;
      list.appendChild(buildEmailItem(msg));
    });

    if (!list.children.length) {
      list.innerHTML =
        '<div style="padding:40px;text-align:center;font-size:12px;font-family:var(--mono);color:var(--text3);">Aucun résultat</div>';
    }
  } catch (e) {
    console.error('[mail] searchEmails:', e);
    showToast('Erreur recherche : ' + e.message, 'error');
  }
}

// ── Sélection multiple (délégué depuis actions.js) ─────────────────────────

export function clearSelection() {
  state.selectedIds.clear();
  document.querySelectorAll('.email-item.selected').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.email-cb').forEach(cb => { cb.checked = false; });
  // Import dynamique pour éviter la circularité mail ↔ ui
  import('./ui.js').then(({ updateBulkBar }) => updateBulkBar());
}
