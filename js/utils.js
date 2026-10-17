/* ==========================================================================
 * Bóveda · utils.js
 * Utilidades de DOM, formato, conversión binaria y avisos.
 * ========================================================================== */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/** Icono SVG por nombre (ver ICONS en config.js). */
const ic = n => `<svg class="i" viewBox="0 0 24 24">${ICONS[n] || ''}</svg>`;

/** Escapa texto para inyectarlo de forma segura en HTML. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const enc = new TextEncoder();
const dec = new TextDecoder();
const sleep = t => new Promise(r => setTimeout(r, t));

/** ArrayBuffer -> base64 (por trozos para no desbordar la pila). */
const b2s = b => {
  const u = new Uint8Array(b);
  let s = '';
  for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
  return btoa(s);
};
/** base64 -> ArrayBuffer. */
const s2b = s => {
  const t = atob(s), u = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
  return u.buffer;
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const clamp01 = v => Math.min(1, Math.max(0, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const baseName = n => String(n || 'documento').replace(/\.[^.]+$/, '');
const extOf = d => (String(d.file || '').match(/\.([a-z0-9]+)$/i) || [, 'file'])[1].toUpperCase().slice(0, 4);
const dateStr = ts => new Date(ts).toLocaleDateString('es');

/** Aviso flotante temporal. */
function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.style.display = 'block';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.style.display = 'none', 3200);
}

/** Fuerza la descarga de un Blob con el nombre indicado. */
function download(blob, name) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}

/** Copia texto al portapapeles con aviso. */
async function copyText(txt) {
  try {
    await navigator.clipboard.writeText(txt);
    toast('Copiado ✅');
  } catch (e) {
    toast('No se pudo copiar');
  }
}
