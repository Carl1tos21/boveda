/* ==========================================================================
 * Bóveda · config.js
 * Constantes globales e iconografía SVG (paths sin recortar del original).
 * ========================================================================== */
'use strict';

const APP_NAME = 'Bóveda';
const DB_NAME = 'boveda2';          // base de datos IndexedDB
const DB_VERSION = 1;
const STORES = ['docs', 'info', 'meta'];
const OLD_DB_NAME = 'misdocs';      // base antigua (migración automática)
const PREF_KEY = 'boveda-local-v1'; // preferencias locales (tema, autobloqueo)
const PBKDF2_ITERATIONS = 250000;   // coste de derivación de la clave maestra
const GCM_OVERHEAD = 28;            // 12 bytes de IV + 16 bytes de etiqueta GCM
const SALT_BYTES = 16;
const IV_BYTES = 12;
const MAX_IMAGE_SIDE = 2400;        // lado máximo al escanear (ahorra memoria/PDF)
const THUMB_MAX = 320;              // lado máximo de las miniaturas
const DEFAULT_CATS = ['General', 'Personal', 'Trabajo', 'Salud', 'Estudios', 'Escaneos'];

/* Rutas SVG (viewBox 0 0 24 24, trazo). */
const ICONS = {
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
  id: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M14 10h4M14 14h4M5 16c.5-1.5 1.5-2 3-2s2.5.5 3 2"/>',
  cfg: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  dl: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/>',
  pr: '<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  tr: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  ed: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  up: '<path d="M12 15V3m0 0L8 7m4-4 4 4M4 21h16"/>',
  rot: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
  ok: '<path d="M5 12l5 5L20 7"/>',
  cp: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  sh: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  /* --- Compartir y navegación tipo Keeper --- */
  share: '<path d="M12 3v11m0-11L8.5 6.5M12 3l3.5 3.5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  chat: '<path d="M21 12a8 8 0 0 1-8 8H7l-4 3 1.4-4.4A8 8 0 1 1 21 12z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7.5 9 6 9-6"/>',
  cloud: '<path d="M7 18a4 4 0 0 1 .7-8A5.5 5.5 0 0 1 18 11a3.5 3.5 0 0 1-.4 7z"/>',
  star: '<path d="M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.5l-5.4 2.9 1-6.1L3.2 10l6.1-.9z"/>',
  starOn: '<path d="M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.5l-5.4 2.9 1-6.1L3.2 10l6.1-.9z" fill="currentColor"/>',
  filter: '<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/>',
  sort: '<path d="m6 9 6 6 6-6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h3.6l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  rows: '<path d="M3 5h18M3 10h18M3 15h18M3 20h18"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.9.7-.9 1.3v.4M12 17h.01"/>',
  paperclip: '<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
  weight: '<path d="M4 18h16M7 18l2.5-9M17 18l-2.5-9M12 5v4M9 9h6"/>'
};
