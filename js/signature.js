import { showToast } from './ui.js';
import { saveSigToFirebase } from './auth.js';

export function openSigModal() {
  document.getElementById('sig-textarea').value =
    localStorage.getItem('mail_signature') || '';
  document.getElementById('sig-overlay').classList.add('open');
  setTimeout(() => document.getElementById('sig-textarea').focus(), 50);
}

export function closeSigModal() {
  document.getElementById('sig-overlay').classList.remove('open');
}

export async function saveSig() {
  const val = document.getElementById('sig-textarea').value.trim();
  if (val) localStorage.setItem('mail_signature', val);
  else localStorage.removeItem('mail_signature');
  closeSigModal();
  showToast('Signature enregistrée', 'success');
  await saveSigToFirebase(val);
}

export async function clearSig() {
  localStorage.removeItem('mail_signature');
  document.getElementById('sig-textarea').value = '';
  closeSigModal();
  showToast('Signature supprimée', 'success');
  await saveSigToFirebase('');
}
