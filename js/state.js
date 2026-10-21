/* ==========================================================================
 * Bóveda · state.js
 * Estado compartido de la sesión (declaraciones de nivel superior para que
 * todos los scripts clásicos puedan leerlo y escribirlo).
 * ========================================================================== */
'use strict';

let db = null;      // conexión IndexedDB activa
let key = null;     // CryptoKey de la sesión (null = bloqueado)
let docs = [];      // documentos descifrados en memoria
let info = [];      // datos personales descifrados en memoria
let folders = [];   // carpetas creadas por el usuario (pueden estar vacías)
let pendingFolder = null;   // carpeta destino del próximo archivo que se suba

let view = 'docs';  // vista activa: docs | info | set
let qs = '';        // texto de búsqueda
let openFolders = null;   // carpetas expandidas (null = todas abiertas)

let urls = [];      // object URLs vivos de la vista (miniaturas)
let murls = [];     // object URLs vivos de los modales
let fails = 0;      // intentos fallidos de contraseña (retardo progresivo)
let mem = false;    // true = IndexedDB no disponible, se usa memoria volátil
let idleT = null;   // temporizador de autobloqueo
let loadSeq = 0;    // se incrementa cada vez que load() termina de recargar

/* Almacén en memoria usado como respaldo si IndexedDB falla. */
const memStore = { docs: new Map(), info: new Map(), meta: new Map() };

/* Preferencias locales (se persisten en localStorage bajo PREF_KEY). */
let prefs = {
  theme: 'auto',        // auto | light | dark
  autolock: 15,         // minutos de inactividad (0 = nunca)
  viewMode: 'list',     // list | grid | rows   (estilo Keeper)
  sortBy: 'name',       // name | date | size
  showFilter: 'all',    // all | fav | img | pdf
  rememberDevice: true  // guardar la llave aquí para entrar solo con Google
};
