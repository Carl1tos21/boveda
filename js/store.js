/* ==========================================================================
 * Bóveda · store.js
 * Capa de persistencia. Todo se guarda ya cifrado en IndexedDB.
 *   docs  -> { id, date, blob: ArrayBuffer(cifrado), meta: ArrayBuffer(cifrado) }
 *   info  -> { id, ord, c: ArrayBuffer(cifrado) }
 *   meta  -> { id:'v', salt: base64, chk: base64 }   (verificación de clave)
 * Si IndexedDB no está disponible se usa memStore (modo memoria volátil).
 * ========================================================================== */
'use strict';

/** Abre (o crea) la base de datos. */
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => STORES.forEach(s => {
      if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' });
    });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

/** Inicializa la conexión; si falla activa el modo memoria. */
async function initStore() {
  try {
    db = await openDB();
  } catch (e) {
    mem = true;
    console.warn('IndexedDB no disponible, usando memoria volátil:', e);
  }
}

/** Ejecuta una operación dentro de una transacción. */
const tx = (s, m, f) => new Promise((res, rej) => {
  const t = db.transaction(s, m);
  const q = f(t.objectStore(s));
  t.oncomplete = () => res(q && q.result);
  t.onerror = () => rej(t.error);
  t.onabort = () => rej(t.error);
});

/* --- Operaciones de almacén (con respaldo en memoria) ------------------- */
const all = s => mem ? Promise.resolve(Array.from(memStore[s].values())) : tx(s, 'readonly', o => o.getAll());
const put = (s, v) => mem ? (memStore[s].set(v.id, v), Promise.resolve(v.id)) : tx(s, 'readwrite', o => o.put(v));
const del = (s, k) => mem ? (memStore[s].delete(k), Promise.resolve()) : tx(s, 'readwrite', o => o.delete(k));
const clearStore = s => mem ? (memStore[s].clear(), Promise.resolve()) : tx(s, 'readwrite', o => o.clear());
const getRec = id => mem ? Promise.resolve(memStore.meta.get(id)) : tx('meta', 'readonly', o => o.get(id));
const getMeta = () => getRec('v');

/**
 * Serializa la bóveda completa (cifrada) al formato de respaldo.
 * Es el MISMO contenido que se exporta a archivo y el que se sube a Drive:
 * un JSON con los registros cifrados en base64. Nadie más puede leerlo.
 */
async function buildBackup() {
  const m = await getMeta();
  const out = { app: 'boveda', v: DB_VERSION, date: Date.now(), salt: m.salt, chk: m.chk, docs: [], info: [] };
  for (const r of await all('docs')) out.docs.push({ id: r.id, date: r.date, blob: b2s(r.blob), meta: b2s(r.meta) });
  for (const r of await all('info')) out.info.push({ id: r.id, ord: r.ord, c: b2s(r.c) });
  return JSON.stringify(out);
}

/* --- Documentos --------------------------------------------------------- */
/** Devuelve el Blob descifrado del documento (con caché en d._b). */
async function getBlob(d) {
  if (d._b) return d._b;
  return d._b = new Blob([await D(key, d._eb)], { type: d.type });
}

/**
 * Guarda un documento cifrado.
 * @param {object} d   documento { id, date, name, cat, notes, file, type, _b?, _eb? }
 * @param {CryptoKey} k clave con la que cifrar
 * @param {boolean} rb true = re-cifrar el contenido aunque ya exista _eb
 */
async function saveDoc(d, k = key, rb = false) {
  if (rb || !d._eb) d._eb = await E(k, await (await getBlob(d)).arrayBuffer());
  d.size = d._eb.byteLength - GCM_OVERHEAD;
  await put('docs', {
    id: d.id,
    date: d.date,
    blob: d._eb,
    meta: await E(k, enc.encode(JSON.stringify({
      name: d.name, cat: d.cat, notes: d.notes, file: d.file, type: d.type, fav: !!d.fav
    })))
  });
  return d;
}

/* --- Datos personales --------------------------------------------------- */
async function saveInfo(i, k = key) {
  await put('info', {
    id: i.id,
    ord: i.ord,
    c: await E(k, enc.encode(JSON.stringify({ label: i.label, value: i.value })))
  });
  return i;
}

/* --- Carga completa en memoria ------------------------------------------ */
async function load() {
  docs = [];
  for (const r of await all('docs')) {
    const m = JSON.parse(dec.decode(await D(key, r.meta)));
    docs.push({ id: r.id, date: r.date, ...m, _eb: r.blob, size: r.blob.byteLength - GCM_OVERHEAD });
  }
  docs.sort((a, b) => b.date - a.date);

  info = [];
  for (const r of await all('info')) info.push({ id: r.id, ord: r.ord, ...JSON.parse(dec.decode(await D(key, r.c))) });
  info.sort((a, b) => a.ord - b.ord);

  loadSeq++;        // aviso de que la recarga terminó (lo usan las pruebas)
  if (typeof qxLoaded === 'boolean') qxLoaded = false;   // la base Quin/Adel se recarga tras importar respaldos
  render();
  schedulePush();   // si Drive está conectado, sube los cambios (con retardo)
}

/* --- Llave del dispositivo (permite entrar sin escribir la contraseña) -- */

const DEVKEY_ID = 'devkey';

/**
 * Guarda en ESTE dispositivo la clave de la sesión.
 *
 * El navegador la almacena como objeto CryptoKey NO extraíble: el código puede
 * usarla para descifrar, pero no puede leer sus bytes. Por eso la llave nunca
 * viaja a Drive y Google sigue sin poder leer nada.
 *
 * @param {CryptoKey} k clave derivada de la contraseña maestra
 * @param {string} email cuenta de Google a la que se ata la llave
 */
async function saveDeviceKey(k, email) {
  await put('meta', { id: DEVKEY_ID, key: k, email: email || '', at: Date.now() });
}

/** Recupera la llave guardada en este dispositivo (o null). */
async function getDeviceKeyRec() {
  try {
    const r = await getRec(DEVKEY_ID);
    return (r && r.key) ? r : null;
  } catch (e) { return null; }
}

/** Borra la llave de este dispositivo ("Olvidar este dispositivo"). */
const forgetDeviceKey = () => del('meta', DEVKEY_ID);

/* --- Migración desde la versión antigua ('misdocs') --------------------- */
async function migrate() {
  try {
    const l = await indexedDB.databases();
    if (!l.some(x => x.name === OLD_DB_NAME)) return;

    const od = await new Promise((r, j) => {
      const q = indexedDB.open(OLD_DB_NAME);
      q.onsuccess = () => r(q.result);
      q.onerror = j;
    });
    const g = s => new Promise(r => {
      const q = od.transaction(s).objectStore(s).getAll();
      q.onsuccess = () => r(q.result);
    });

    for (const o of await g('docs')) await saveDoc({ id: o.id, date: o.date, name: o.name, cat: o.cat, notes: o.notes, file: o.file, type: o.type, _b: o.blob });
    for (const i of await g('info')) await saveInfo({ id: i.id, ord: i.ord, label: i.label, value: i.value });

    od.close();
    indexedDB.deleteDatabase(OLD_DB_NAME);
    toast('Datos anteriores cifrados ✅');
  } catch (e) { /* sin datos antiguos o sin permisos: se ignora */ }
}

/** Borra la base de datos completa (usado por "Borrar toda la bóveda"). */
async function destroyDB() {
  if (mem) { memStore.docs.clear(); memStore.info.clear(); memStore.meta.clear(); return; }
  try { db.close(); } catch (e) { }
  await new Promise(r => {
    const q = indexedDB.deleteDatabase(DB_NAME);
    q.onsuccess = q.onerror = q.onblocked = () => r();
  });
  db = await openDB();
}
