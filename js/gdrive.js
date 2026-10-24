/* ==========================================================================
 * Bóveda · gdrive.js
 * Sincronización con Google Drive.
 *
 * Idea clave: a Drive se sube SIEMPRE el respaldo ya cifrado
 * (boveda-respaldo.json). Google solo ve un archivo ilegible; la llave sigue
 * siendo tu contraseña maestra, que nunca sale del dispositivo.
 *
 *   - Autenticación: Google Identity Services (token de acceso, sin backend).
 *   - Permiso: `drive.file` -> la app SOLO ve los archivos que ella crea.
 *   - Estrategia: se compara el hash del contenido local con el último
 *     sincronizado y la fecha del archivo remoto, para decidir si toca
 *     subir, bajar o preguntar.
 *
 * `driveAuth` y `drive` son objetos con métodos intercambiables: las pruebas
 * automáticas los sustituyen por dobles para validar toda la lógica sin
 * depender de los servidores de Google.
 * ========================================================================== */
'use strict';

let syncBusy = false;    // hay una sincronización en curso
let pushT = null;        // temporizador de subida diferida
let tokenCache = null;   // { token, exp }

/** ¿Está configurada la sincronización? */
const gdriveReady = () => !!effectiveDriveClientId();
/** ¿El usuario conectó su Drive? */
const driveConnected = () => !!prefs.driveConnected;

/* ------------------- Autenticación (Google Identity Services) ---------- */

/** Carga el script de Google la primera vez que hace falta. */
async function loadGis() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar el inicio de sesión de Google'));
    document.head.appendChild(s);
  });
}

let tClient = null;

/** Cliente de tokens de Google (se crea una sola vez). */
function tokenClient() {
  if (tClient) return tClient;
  tClient = google.accounts.oauth2.initTokenClient({
    client_id: effectiveDriveClientId(),
    scope: DRIVE_SCOPE,
    callback: () => { }
  });
  return tClient;
}

/** Traduce los errores de Google Identity Services a algo entendible. */
const GIS_ERRORS = {
  popup_closed_by_user: 'Cerraste la ventana de Google antes de terminar',
  popup_failed_to_open: 'El navegador bloqueó la ventana de Google: permite las ventanas emergentes',
  access_denied: 'No se autorizó el acceso a tu Drive',
  origin_mismatch: 'Esta web no está autorizada en Google Cloud. Añade su origen en «Orígenes de JavaScript autorizados».',
  idpiframe_initialization_failed: 'Google rechazó el origen de la app. Revisa los orígenes autorizados en Google Cloud.'
};

/** Mensaje legible a partir de un error de Google Identity Services. */
function gisError(err) {
  const t = (err && err.type) || '';
  return GIS_ERRORS[t] || (err && err.message) || t || 'Error de Google';
}

/**
 * Pide un token de acceso.
 * @param {string} prompt '' = silencioso (si ya autorizó) | 'consent' = interactivo
 */
function requestToken(prompt) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, arg) => { if (!done) { done = true; fn(arg); } };

    let client;
    try { client = tokenClient(); }
    catch (e) { return finish(reject, e); }

    client.callback = resp => {
      if (resp && resp.access_token) {
        tokenCache = {
          token: resp.access_token,
          exp: Date.now() + ((Number(resp.expires_in) || 3600) - 60) * 1000
        };
        finish(resolve, tokenCache.token);
      } else {
        finish(reject, new Error((resp && resp.error) || 'No se autorizó el acceso'));
      }
    };
    client.error_callback = err => finish(reject, new Error(gisError(err)));

    try { client.requestAccessToken({ prompt }); }
    catch (e) { finish(reject, e); }
  });
}

/** Métodos de autenticación (sustituibles en las pruebas). */
const driveAuth = {
  /** Token válido y silencioso; null si hace falta que el usuario reconecte. */
  async token() {
    if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.token;
    await loadGis();
    try { return await requestToken(''); } catch (e) { return null; }
  },

  /** Conexión interactiva: abre la ventana de Google. */
  async connect() {
    await loadGis();
    return requestToken('consent');
  },

  /** Correo de la cuenta conectada (solo para mostrarlo en Ajustes). */
  async email(token) {
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!r.ok) return '';
      const j = await r.json();
      return j.email || '';
    } catch (e) { return ''; }
  },

  async signOut() {
    try {
      if (tokenCache && window.google && google.accounts.oauth2.revoke) {
        google.accounts.oauth2.revoke(tokenCache.token);
      }
    } catch (e) { }
    tokenCache = null;
  }
};

/* ----------------------- API REST de Drive (v3) ------------------------ */

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

const drive = {
  /** Busca el archivo de respaldo en el Drive del usuario. */
  async list(token) {
    const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
    const url = `${DRIVE_API}?spaces=drive&q=${q}&orderBy=modifiedTime desc&pageSize=5&fields=files(id,name,modifiedTime,size)`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('Drive respondió ' + r.status);
    const j = await r.json();
    const f = (j.files || [])[0];
    return f ? { id: f.id, modifiedTime: f.modifiedTime, size: Number(f.size || 0) } : null;
  },

  /** Crea el archivo de respaldo. */
  async create(token, blob) {
    const r1 = await fetch(DRIVE_API + '?fields=id', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DRIVE_FILE_NAME, mimeType: 'application/json' })
    });
    if (!r1.ok) throw new Error('Drive respondió ' + r1.status);
    const created = await r1.json();
    return drive.update(token, created.id, blob);
  },

  /** Sobrescribe el contenido de un archivo existente. */
  async update(token, id, blob) {
    const url = `${DRIVE_UPLOAD}/${encodeURIComponent(id)}?uploadType=media&fields=id,modifiedTime`;
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: blob
    });
    if (!r.ok) throw new Error('Drive respondió ' + r.status);
    const j = await r.json();
    return { id: j.id, modifiedTime: j.modifiedTime };
  },

  /** Descarga el respaldo como texto. */
  async download(token, id) {
    const r = await fetch(`${DRIVE_API}/${encodeURIComponent(id)}?alt=media`,
      { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('Drive respondió ' + r.status);
    return r.text();
  }
};

/* ------------- Visor de Google: copia visible del documento ------------- */
/*
 * Para VER un documento con el visor de Google hace falta que el archivo esté
 * SIN CIFRAR en Drive (Google necesita leerlo para convertirlo).
 * Por eso estas funciones SOLO se usan cuando el usuario lo pide expresamente
 * y acepta el aviso. La bóveda sigue guardando el original cifrado.
 */

const DRIVE_FOLDER_NAME = 'Bóveda';

/** Enlace para incrustar la vista previa de Drive dentro de la app. */
const drivePreviewUrl = id => 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview';

/** Enlace para abrir el archivo directamente en Drive. */
const driveOpenUrl = id => 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view';

/** Token válido, pidiéndolo al usuario si hace falta. */
async function driveTokenForAction() {
  let t = await driveAuth.token();
  if (!t) t = await driveAuth.connect();
  return t;
}

/** Busca (o crea) la carpeta «Bóveda» en Drive y devuelve su id. */
async function driveEnsureFolder(token) {
  try {
    const q = encodeURIComponent(
      "name='" + DRIVE_FOLDER_NAME + "' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const r = await fetch(`${DRIVE_API}?spaces=drive&q=${q}&pageSize=1&fields=files(id)`,
      { headers: { Authorization: 'Bearer ' + token } });
    if (r.ok) {
      const j = await r.json();
      if (j.files && j.files[0]) return j.files[0].id;
    }
  } catch (e) { /* se intenta crear */ }
  try {
    const c = await fetch(DRIVE_API + '?fields=id', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
    });
    if (!c.ok) return '';
    const cj = await c.json();
    return cj.id || '';
  } catch (e) { return ''; }
}

/** Sube el archivo ORIGINAL (sin cifrar) a Drive y devuelve su id. */
async function driveUploadOriginal(token, d, blob) {
  const parent = await driveEnsureFolder(token);
  const meta = { name: d.file || d.name || 'documento' };
  if (parent) meta.parents = [parent];
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('file', blob, meta.name);
  const r = await fetch(DRIVE_UPLOAD + '?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: form
  });
  if (!r.ok) throw new Error('Drive respondió ' + r.status);
  const j = await r.json();
  return j.id || '';
}

/** Borra de Drive la copia visible de un documento (si la tiene). */
async function driveDeleteOriginal(d) {
  if (!d || !d.driveId) return;
  try {
    const t = await driveAuth.token();
    if (!t) return;
    await fetch(`${DRIVE_API}/${encodeURIComponent(d.driveId)}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + t }
    });
  } catch (e) { /* sin conexión o ya borrado: se ignora */ }
}

/* --------------------- Estado de la sincronización --------------------- */

const SYNC_ID = 'drive';

const getSyncState = () => getRec(SYNC_ID);
const saveSyncState = s => put('meta', Object.assign({ id: SYNC_ID }, s));

/**
 * Huella (SHA-256) de todo el contenido cifrado de la bóveda.
 * Sirve para saber si algo cambió desde la última sincronización sin tener
 * que subir nada. Se calcula sobre los bytes cifrados, no sobre base64.
 */
async function vaultDigest() {
  const parts = [];
  const m = await getMeta();
  parts.push(enc.encode('v:' + (m ? m.salt : '')));

  const ds = (await all('docs')).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const r of ds) {
    parts.push(enc.encode('d:' + r.id + ':' + r.date + ':'));
    parts.push(new Uint8Array(r.blob));
    parts.push(new Uint8Array(r.meta));
  }

  const is = (await all('info')).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const r of is) {
    parts.push(enc.encode('i:' + r.id + ':' + r.ord + ':'));
    parts.push(new Uint8Array(r.c));
  }

  const fr = await getRec(FOLDERS_ID);   // las carpetas también cuentan como cambio
  if (fr && fr.c) {
    parts.push(enc.encode('f:'));
    parts.push(new Uint8Array(fr.c));
  }

  let len = 0;
  for (const p of parts) len += p.length;
  const buf = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { buf.set(p, off); off += p.length; }

  return b2s(await crypto.subtle.digest('SHA-256', buf));
}

/* ------------------------ Motor de sincronización ---------------------- */

/** Sube la bóveda a Drive (crea el archivo o lo sobrescribe). */
async function pushVault(token, fileId) {
  const blob = new Blob([await buildBackup()], { type: 'application/json' });
  const res = fileId ? await drive.update(token, fileId, blob) : await drive.create(token, blob);
  await saveSyncState({
    fileId: res.id,
    lastSync: res.modifiedTime,
    lastHash: await vaultDigest(),
    at: Date.now()
  });
  prefs.driveLast = Date.now();
  prefs.driveError = '';
  savePrefs();
  return res;
}

/** Trae la copia de Drive y sustituye la bóveda local. */
async function pullVault(token, remote) {
  const text = await drive.download(token, remote.id);
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('La copia de Drive está dañada'); }
  if (!data || data.app !== 'boveda' || !data.salt || !data.chk) {
    throw new Error('La copia de Drive no es un respaldo de ' + APP_NAME);
  }

  const current = await getMeta();
  const sameKey = !!(current && current.salt === data.salt);

  await clearStore('docs');
  await clearStore('info');
  for (const d of data.docs || []) {
    await put('docs', { id: d.id, date: d.date, blob: s2b(d.blob), meta: s2b(d.meta) });
  }
  for (const i of data.info || []) {
    await put('info', { id: i.id, ord: i.ord, c: s2b(i.c) });
  }
  await put('meta', { id: 'v', salt: data.salt, chk: data.chk });

  await saveSyncState({
    fileId: remote.id,
    lastSync: remote.modifiedTime,
    lastHash: await vaultDigest(),
    at: Date.now()
  });
  prefs.driveLast = Date.now();
  prefs.driveError = '';
  savePrefs();

  if (sameKey) {
    await load();
  } else {
    // La copia se cifró con otra contraseña: hay que desbloquear con la suya.
    lockNow();
    toast('Copia traída de Drive. Desbloquea con la contraseña de esa bóveda.');
  }
  return true;
}

/** Diálogo para decidir qué hacer cuando los dos lados cambiaron. */
function askConflict(remote) {
  const localBytes = docs.reduce((a, d) => a + d.size, 0);
  const remoteDate = new Date(remote.modifiedTime).toLocaleString('es');
  return new Promise(resolve => {
    openModal(`<h2>Hay cambios en los dos lados</h2>
      <div class="mu" style="margin-bottom:12px">No se puede saber cuál es el correcto. Elige qué quieres conservar.</div>
      <div class="row"><div class="l">Este dispositivo</div><div class="v">${docs.length} documento(s) · ${fmt(localBytes)}</div></div>
      <div class="row"><div class="l">Tu Google Drive</div><div class="v">${remote.size ? fmt(remote.size) : '—'} · ${esc(remoteDate)}</div></div>
      <div class="fx">
        <button class="btn" id="cfno">Cancelar</button>
        <button class="btn" id="cfdl">${ic('dl')}Traer de Drive</button>
        <button class="btn p" id="cfup">${ic('up')}Subir el de aquí</button>
      </div>`);
    $('#cfno').onclick = () => { closeModal(); resolve('cancel'); };
    $('#cfdl').onclick = () => { closeModal(); resolve('download'); };
    $('#cfup').onclick = () => { closeModal(); resolve('upload'); };
  });
}

/**
 * Sincroniza con Drive: decide entre subir, bajar, no hacer nada o preguntar.
 * @param {{auto?: boolean}} [opts]
 * @returns {Promise<{status: string, remote?: object, message?: string}>}
 */
async function syncNow(opts) {
  const auto = !!(opts && opts.auto);
  if (!gdriveReady()) return { status: 'unconfigured' };
  if (!driveConnected()) return { status: 'disconnected' };
  if (syncBusy) return { status: 'busy' };

  syncBusy = true;
  try {
    const token = await driveAuth.token();
    if (!token) { prefs.driveNeedsAuth = true; savePrefs(); return { status: 'no-auth' }; }
    prefs.driveNeedsAuth = false;

    const state = await getSyncState();
    const localHash = await vaultDigest();
    const localEmpty = !(await all('docs')).length && !(await all('info')).length;
    const remote = await drive.list(token);

    // 1. Todavía no hay copia en Drive -> subir.
    if (!remote) {
      await pushVault(token, null);
      return { status: 'uploaded' };
    }

    // 2. Primera sincronización en este dispositivo.
    if (!state || (!state.lastSync && !state.lastHash)) {
      if (localEmpty) { await pullVault(token, remote); return { status: 'downloaded' }; }
      const choice = await askConflict(remote);
      if (choice === 'upload') { await pushVault(token, remote.id); return { status: 'uploaded' }; }
      if (choice === 'download') { await pullVault(token, remote); return { status: 'downloaded' }; }
      return { status: 'cancelled' };
    }

    const remoteChanged = remote.modifiedTime > state.lastSync;
    const localChanged = localHash !== state.lastHash;

    if (!remoteChanged && !localChanged) return { status: 'uptodate' };
    if (localChanged && !remoteChanged) { await pushVault(token, remote.id); return { status: 'uploaded' }; }
    if (!localChanged && remoteChanged) { await pullVault(token, remote); return { status: 'downloaded' }; }

    // 3. Cambiaron los dos.
    prefs.driveConflict = true; savePrefs();
    if (auto) {
      toast('Hay cambios en los dos lados. Ve a Ajustes → Sincronizar ahora.');
      return { status: 'conflict', remote };
    }
    const choice = await askConflict(remote);
    if (choice === 'upload') {
      await pushVault(token, remote.id);
      prefs.driveConflict = false; savePrefs();
      return { status: 'uploaded' };
    }
    if (choice === 'download') {
      await pullVault(token, remote);
      prefs.driveConflict = false; savePrefs();
      return { status: 'downloaded' };
    }
    return { status: 'cancelled' };
  } catch (e) {
    prefs.driveError = e.message;
    savePrefs();
    return { status: 'error', message: e.message };
  } finally {
    syncBusy = false;
  }
}

/** Programa una subida diferida tras un cambio (no sube en cada pulsación). */
function schedulePush() {
  if (syncBusy || !driveConnected() || !prefs.driveAuto) return;
  clearTimeout(pushT);
  pushT = setTimeout(() => { syncNow({ auto: true }); }, DRIVE_PUSH_DELAY);
}

/* ------------------------------ Interfaz ------------------------------- */

/** Guarda el ID de cliente pegado en Ajustes (sin tocar el código). */
function saveDriveIdFromForm() {
  const el = $('#drvid');
  const v = el ? el.value.trim() : '';
  if (!v) return toast('Pega el ID de cliente');
  if (!looksLikeClientId(v)) return toast('Ese no parece un ID de cliente válido');

  saveDriveClientId(v);
  tClient = null;   // el cliente de tokens se recreará con el ID nuevo
  toast('ID guardado ✅ Ahora pulsa «Conectar con Google Drive»');
  renderSet();
}

/** Conecta la cuenta de Google del usuario. */
async function driveConnect() {
  if (!gdriveReady()) return toast('Falta configurar el ID de cliente de Google');
  if (location.protocol === 'file:') {
    return toast('Abre la app desde https:// o http://localhost para conectar con Google');
  }
  try {
    const token = await driveAuth.connect();
    prefs.driveConnected = true;
    prefs.driveAuto = true;
    prefs.driveNeedsAuth = false;
    prefs.driveConflict = false;
    prefs.driveError = '';
    const mail = await driveAuth.email(token);
    if (mail) prefs.driveEmail = mail;
    savePrefs();
    toast('Google Drive conectado ✅');
    if (view === 'set') renderSet();
    await syncNow();
    if (view === 'set' && !$('#app').hidden) renderSet();
  } catch (e) {
    toast('No se pudo conectar: ' + e.message);
  }
}

/** Desconecta la cuenta (no borra nada de Drive). */
async function driveDisconnect() {
  const ok = await confirmDialog('Desconectar Google Drive',
    'Se deja de sincronizar en este dispositivo. Tu bóveda y la copia de Drive se conservan; puedes volver a conectarte cuando quieras.',
    'Desconectar');
  if (!ok) return;

  await driveAuth.signOut();
  prefs.driveConnected = false;
  prefs.driveEmail = '';
  prefs.driveNeedsAuth = false;
  prefs.driveConflict = false;
  savePrefs();
  toast('Google Drive desconectado');
  if (view === 'set') renderSet();
}

/** Acción del botón «Sincronizar ahora». */
async function driveSyncManual() {
  const r = await syncNow();
  const msg = {
    uploaded: 'Subido a Google Drive ✅',
    downloaded: 'Traído de Google Drive ✅',
    uptodate: 'Ya estaba todo sincronizado ✅',
    'no-auth': 'Google pide volver a autorizar',
    conflict: 'Elige qué conservar',
    cancelled: 'Cancelado',
    busy: 'Ya hay una sincronización en curso',
    error: 'Error: ' + (r.message || 'desconocido')
  }[r.status];
  if (msg) toast(msg);
  if (view === 'set' && !$('#app').hidden) renderSet();
}

/** Sincroniza al desbloquear (silencioso, sin molestar). */
async function driveAutoSync() {
  if (!driveConnected() || !prefs.driveAuto) return;
  await syncNow({ auto: true });
  if (view === 'set' && !$('#app').hidden) renderSet();
}

/** HTML del panel de Ajustes. */
function drivePanelHtml() {
  if (location.protocol === 'file:') {
    return `<div class="pn"><h2>Sincronización con Google Drive</h2>
      <div class="mu">No disponible al abrir el archivo directamente desde el disco. Publica la app en una dirección <b>https://</b> (o ábrela en <b>http://localhost</b>) y vuelve aquí.</div>
    </div>`;
  }
  if (!gdriveReady()) {
    return `<div class="pn"><h2>Sincronización con Google Drive</h2>
      <div class="mu" style="margin-bottom:10px">Para usar tu Drive como base de datos hace falta un <b>ID de cliente de Google</b>. Se crea gratis una sola vez (unos 10 minutos); los pasos están en el README, en «Sincronización con Google Drive».</div>
      <div class="f"><label>Pega aquí tu ID de cliente</label>
        <input id="drvid" placeholder="123456789012-xxxxxxxxxxxx.apps.googleusercontent.com" value="${esc(savedDriveClientId())}"></div>
      <div class="fx" style="justify-content:flex-start"><button class="btn p" data-a="gsaveid">${ic('ok')}Guardar ID</button></div>
      <div class="mu" style="margin-top:10px">El ID no es un secreto: solo identifica a la app ante Google. Recuerda que el dominio donde tengas publicada la bóveda debe estar autorizado en Google Cloud.</div>
      <div class="mu" style="margin-top:8px">Si lo pones en <code>js/gdrive-config.js</code> y vuelves a publicar, quedará configurado en <b>todos</b> tus dispositivos; si lo pegas aquí, solo en este.</div>
    </div>`;
  }
  if (!driveConnected()) {
    return `<div class="pn"><h2>Sincronización con Google Drive</h2>
      <div class="mu" style="margin-bottom:12px">Guarda una copia <b>cifrada</b> de tu bóveda en tu propio Google Drive. Así ves los mismos documentos en la computadora y en el celular. Google solo verá un archivo ilegible.</div>
      <div class="row"><div class="l">Origen de la app</div><div class="v" style="word-break:break-all">${esc(location.origin)}</div></div>
      <div class="mu" style="margin-top:8px">Si al conectar aparece <b>«origin_mismatch»</b> o <b>«Error 400»</b>, añade exactamente ese origen en Google Cloud Console → <i>Credenciales</i> → tu cliente OAuth → <b>Orígenes de JavaScript autorizados</b>, y vuelve a intentarlo.</div>
      <div class="fx" style="justify-content:flex-start"><button class="btn p" data-a="gconnect">${ic('up')}Conectar con Google Drive</button></div>
    </div>`;
  }

  const when = prefs.driveLast ? new Date(prefs.driveLast).toLocaleString('es') : 'Todavía no';
  const warn = (txt) => `<div class="row" style="border-color:var(--dg)"><div class="l" style="color:var(--dg)">Aviso</div><div class="v" style="color:var(--dg)">${esc(txt)}</div></div>`;

  return `<div class="pn"><h2>Sincronización con Google Drive</h2>
    <div class="row"><div class="l">Cuenta</div><div class="v">${esc(prefs.driveEmail || 'Conectada')}</div></div>
    <div class="row"><div class="l">Última sincronización</div><div class="v">${esc(when)}</div></div>
    ${prefs.driveNeedsAuth ? warn('Google pide volver a autorizar. Pulsa «Sincronizar ahora».') : ''}
    ${prefs.driveConflict ? warn('Hay cambios en los dos lados. Pulsa «Sincronizar ahora» y elige qué conservar.') : ''}
    ${prefs.driveError ? warn(prefs.driveError) : ''}
    <div style="margin:12px 0 4px"><label class="ck"><input type="checkbox" id="drvauto"${prefs.driveAuto ? ' checked' : ''}>Sincronizar automáticamente</label></div>
    <div class="mu">Se sube y se baja el respaldo <b>cifrado</b>. La contraseña maestra nunca sale de este dispositivo.</div>
    <div class="fx" style="justify-content:flex-start">
      <button class="btn p" data-a="gsync">${ic('rot')}Sincronizar ahora</button>
      <button class="btn" data-a="gdisconnect">Desconectar</button>
    </div>
  </div>`;
}

/** Conecta el interruptor del panel (los elementos ya están en el DOM). */
function fillDrive() {
  const c = $('#drvauto');
  if (c) {
    c.onchange = () => {
      prefs.driveAuto = c.checked;
      savePrefs();
      toast(c.checked ? 'Sincronización automática activada' : 'Sincronización automática desactivada');
    };
  }
}
