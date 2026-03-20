import { FOLDER_NAMES } from './config.js';
import { state } from './state.js';
import { gmailPost, gmailGet } from './api.js';
import { escHtml } from './utils.js';
import { showToast, showEmptyState } from './ui.js';
import { loadFolder } from './mail.js';

export async function loadUserLabels() {
  try {
    const data = await gmailGet('users/me/labels');
    const userLabels = (data.labels || [])
      .filter(l => l.type === 'user' && l.labelListVisibility !== 'labelHide')
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!userLabels.length) return;

    const list = document.getElementById('labels-list');
    list.innerHTML = '';

    userLabels.forEach(label => {
      const item = document.createElement('div');
      item.className = 'nav-item';
      item.title = label.name;
      item.dataset.folder = label.id;
      item.innerHTML = `<span class="nav-icon" style="font-size:11px;">⊞</span><span class="nav-item-label">${escHtml(label.name)}</span>`;

      item.onclick = () => {
        FOLDER_NAMES[label.id] = label.name;
        loadFolder(label.id, item);
      };

      // Drag & drop : déposer des emails sur un libellé
      item.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        item.classList.add('drop-target');
      });
      item.addEventListener('dragleave', e => {
        if (!item.contains(e.relatedTarget)) item.classList.remove('drop-target');
      });
      item.addEventListener('drop', async e => {
        e.preventDefault();
        item.classList.remove('drop-target');
        try {
          const { ids } = JSON.parse(e.dataTransfer.getData('application/json'));
          await Promise.all(ids.map(id =>
            gmailPost(`users/me/messages/${id}/modify`, {
              addLabelIds: [label.id],
              removeLabelIds: ['INBOX'],
            })
          ));
          if (state.currentFolder === 'INBOX') {
            ids.forEach(id => {
              document.querySelector(`.email-item[data-id="${id}"]`)?.remove();
            });
            if (state.currentMessageId && ids.includes(state.currentMessageId)) {
              showEmptyState();
            }
          }
          const n = ids.length;
          showToast(`${n} email${n > 1 ? 's' : ''} déplacé${n > 1 ? 's' : ''} dans "${label.name}"`, 'success');
        } catch (err) {
          console.error('[labels] drop:', err);
          showToast('Erreur lors du déplacement', 'error');
        }
      });

      list.appendChild(item);
    });

    document.getElementById('labels-section').style.display = 'block';
  } catch (e) {
    console.error('[labels] loadUserLabels:', e);
  }
}
