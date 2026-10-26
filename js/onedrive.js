/* ==========================================================================
 * Bóveda · onedrive.js
 * «Excel Online»: abre una hoja de cálculo con el Excel de Microsoft.
 *
 * CÓMO FUNCIONA (y qué implica):
 *   Excel Online solo puede abrir archivos que estén en OneDrive. Así que al
 *   pulsar el botón, la app sube ESE archivo a tu OneDrive (carpeta «Bóveda»)
 *   y abre el enlace de Microsoft, que lo muestra con el Excel de verdad.
 *
 *   ⚠️ La copia en OneDrive está SIN CIFRAR (Microsoft necesita leerla).
 *      La bóveda sigue guardando el original cifrado en tu dispositivo.
 *
 *   El permiso se pide una sola vez: el token se guarda CIFRADO en la bóveda.
 * ========================================================================== */
'use strict';

const MS_AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_GRAPH = 'https://graph.microsoft.com/v1.0';
const MS_SCOPE = 'offline_access Files.ReadWrite User.Read';
const MS_ID_KEY = 'boveda-ms-client-id';
const MS_META_ID = 'msauth';

/** Página de retorno (la que se registra en Azure como URI de redirección). */
const msRedirect = () => new URL('ms-auth.html', location.href).href;

/** ID de cliente de Microsoft (Azure), guardado en este dispositivo. */
function msClientId() { try { return localStorage.getItem(MS_ID_KEY) || ''; } catch (e) { return ''; } }
function saveMsClientId(id) { try { localStorage.setItem(MS_ID_KEY, String(id || '').trim()); } catch (e) { } }

/** ¿Está configurado el inicio de sesión de Microsoft? */
const msReady = () => !!msClientId();

let msToken = null;    // { token, exp } en memoria
let msRefresh = '';    // refresh token (se guarda cifrado en la bóveda)

/* ------------------------------ PKCE ----------------------------------- */

const b64url = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Par verificador/reto para el flujo Authorization Code + PKCE. */
async function msPkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
  return { verifier, challenge };
}

/* ------------------------ Token (guardado cifrado) --------------------- */

async function msSaveRefresh(rt) {
  await put('meta', { id: MS_META_ID, c: await E(key, enc.encode(rt || '')) });
}

async function msLoadRefresh() {
  try {
    const r = await getRec(MS_META_ID);
    if (!r || !r.c) return '';
    return dec.decode(await D(key, r.c));
  } catch (e) { return ''; }
}

async function msStoreToken(j) {
  msToken = { token: j.access_token, exp: Date.now() + ((Number(j.expires_in) || 3600) - 60) * 1000 };
  if (j.refresh_token && j.refresh_token !== msRefresh) {
    msRefresh = j.refresh_token;
    try { await msSaveRefresh(msRefresh); } catch (e) { }
  }
  return msToken.token;
}

/** Token de acceso: silencioso si ya hay permiso, o abriendo la ventana. */
async function msAccessToken(interactive) {
  if (msToken && Date.now() < msToken.exp) return msToken.token;

  if (!msRefresh) msRefresh = await msLoadRefresh();
  if (msRefresh) {
    try {
      const r = await fetch(MS_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: msClientId(), grant_type: 'refresh_token',
          refresh_token: msRefresh, scope: MS_SCOPE
        })
      });
      const j = await r.json();
      if (j.access_token) return msStoreToken(j);
    } catch (e) { /* se pedirá permiso otra vez */ }
  }

  if (!interactive) return null;
  const { code, verifier } = await msAuthorize();
  return msExchange(code, verifier);
}

/* --------------------- Ventana de inicio de sesión --------------------- */

/** Abre la ventana de Microsoft y espera el código de autorización. */
async function msAuthorize() {
  const { verifier, challenge } = await msPkce();
  const url = MS_AUTH + '?' + new URLSearchParams({
    client_id: msClientId(),
    response_type: 'code',
    redirect_uri: msRedirect(),
    response_mode: 'query',
    scope: MS_SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  }).toString();

  const w = window.open(url, 'msauth', 'width=520,height=700');
  if (!w) throw new Error('permite las ventanas emergentes');

  const code = await new Promise((resolve, reject) => {
    const t = setTimeout(() => { fin(); reject(new Error('se agotó el tiempo de conexión')); }, 180000);
    function onMsg(e) {
      if (e.origin !== location.origin || !e.data || e.data.boveda !== 'msauth') return;
      fin();
      if (e.data.code) resolve(e.data.code);
      else reject(new Error(e.data.desc || 'no se autorizó el acceso'));
    }
    function fin() { clearTimeout(t); removeEventListener('message', onMsg); try { w.close(); } catch (x) { } }
    addEventListener('message', onMsg);
  });
  return { code, verifier };
}

/** Canjea el código de autorización por un token de acceso. */
async function msExchange(code, verifier) {
  const r = await fetch(MS_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: msClientId(), grant_type: 'authorization_code',
      code: code, redirect_uri: msRedirect(), code_verifier: verifier
    })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(j.error_description || 'no se pudo obtener el permiso');
  return msStoreToken(j);
}

/* ----------------------------- OneDrive -------------------------------- */

/** Crea (o reutiliza) la carpeta «Bóveda» en OneDrive. */
async function msEnsureFolder(token) {
  try {
    const r = await fetch(MS_GRAPH + '/me/drive/root:/Bóveda', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (r.ok) return true;
    const c = await fetch(MS_GRAPH + '/me/drive/root/children', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bóveda', folder: {}, '@microsoft.graph.conflictBehavior': 'replace' })
    });
    return c.ok;
  } catch (e) { return false; }
}

/**
 * Sube el archivo a OneDrive y devuelve sus datos:
 *   { id, url, mod }  → id del archivo, enlace para abrirlo y fecha de cambio.
 */
async function msUpload(token, d, blob) {
  await msEnsureFolder(token);
  const name = encodeURIComponent(d.file || d.name || 'documento.xlsx');
  const r = await fetch(MS_GRAPH + '/me/drive/root:/Bóveda/' + name + ':/content', {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': blob.type || 'application/octet-stream'
    },
    body: blob
  });
  if (!r.ok) throw new Error('OneDrive respondió ' + r.status);
  const j = await r.json();
  return { id: j.id || '', url: j.webUrl || '', mod: j.lastModifiedDateTime || '' };
}

/* ---------------- Traer de vuelta los cambios de Excel Online ----------- */

/** Datos del archivo en OneDrive (fecha de cambio y enlace de descarga). */
async function msItemMeta(token, id) {
  try {
    const r = await fetch(MS_GRAPH + '/me/drive/items/' + encodeURIComponent(id) +
      '?$select=id,name,size,lastModifiedDateTime,@microsoft.graph.downloadUrl', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

/** Descarga el contenido de un archivo de OneDrive. */
async function msDownload(token, id, meta) {
  /* 1) Enlace directo (el que recomienda Microsoft para el navegador). */
  const direct = meta && meta['@microsoft.graph.downloadUrl'];
  if (direct) {
    try {
      const r = await fetch(direct);
      if (r.ok) return await r.blob();
    } catch (e) { /* se intenta por la API */ }
  }
  /* 2) Por la API de Graph. */
  try {
    const r = await fetch(MS_GRAPH + '/me/drive/items/' + encodeURIComponent(id) + '/content', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (r.ok) return await r.blob();
  } catch (e) { /* sin conexión */ }
  return null;
}

/**
 * Trae a la bóveda los cambios hechos en Excel Online.
 * @param {object} d      documento
 * @param {string} token  token de Microsoft
 * @returns {Promise<boolean>} true si se actualizó
 */
async function msPullDoc(d, token) {
  if (!d || !d.msId) return false;
  const meta = await msItemMeta(token, d.msId);
  if (!meta) return false;
  /* Sin cambios desde la última vez: nada que hacer. */
  if (d.msMod && meta.lastModifiedDateTime === d.msMod) return false;

  const blob = await msDownload(token, d.msId, meta);
  if (!blob || !blob.size) return false;

  d._b = blob;                                   // contenido nuevo descifrado en memoria
  d.msMod = meta.lastModifiedDateTime || '';
  d.size = blob.size;
  await saveDoc(d, key, true);                   // se vuelve a cifrar en la bóveda
  return true;
}

let msPullBusy = false;
let msLastCheck = 0;

/**
 * Comprueba en segundo plano si Excel Online cambió algún archivo y lo trae.
 * Se llama al volver a la app (no gasta datos si no hay nada vinculado).
 */
async function msAutoPull(force) {
  if (msPullBusy || !key) return;
  if (!force && Date.now() - msLastCheck < 30000) return;
  const vinculados = docs.filter(d => d.msId);
  if (!vinculados.length) return;

  msPullBusy = true;
  msLastCheck = Date.now();
  try {
    const token = await msAccessToken(false);    // silencioso: sin ventanas
    if (!token) return;
    let n = 0;
    for (const d of vinculados) {
      try { if (await msPullDoc(d, token)) n++; } catch (e) { }
    }
    if (n) {
      await load();
      toast(n + ' archivo' + (n === 1 ? '' : 's') + ' actualizado' + (n === 1 ? '' : 's') + ' desde Excel Online ✅');
    }
  } catch (e) { /* silencioso */ }
  finally { msPullBusy = false; }
}

/** Botón «Traer de OneDrive»: trae los cambios a mano, avisando siempre. */
async function msPullManual(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  if (!d.msId) return toast('Primero ábrelo con «Excel Online»');
  if (location.protocol === 'file:') return toast('Abre la app desde https:// para usar Excel Online');
  try {
    const token = await msAccessToken(true);
    if (!token) return toast('No se autorizó el acceso a Microsoft');
    const ok = await msPullDoc(d, token);
    if (ok) { await load(); toast('Cambios traídos de Excel Online ✅'); }
    else toast('No hay cambios nuevos en Excel Online');
  } catch (e) {
    toast('No se pudo traer: ' + (e.message || 'error'));
  }
}

/* ------------------------------ Acciones ------------------------------- */

/**
 * Abre una hoja de cálculo con Excel Online.
 * Si se pasa un id, sube ESE archivo a OneDrive (solo la primera vez) y lo
 * abre. Sin id, abre Excel Online en general.
 */
async function openExcelOnline(id) {
  const d = id ? docs.find(x => x.id === id) : null;
  if (id && !d) return;
  if (location.protocol === 'file:') return toast('Abre la app desde https:// para usar Excel Online');
  if (!msReady()) return msSetupDialog();

  try {
    toast('Preparando Excel Online…');
    const token = await msAccessToken(true);
    if (!token) return toast('No se autorizó el acceso a Microsoft');

    let url = d ? (d.msUrl || '') : '';
    if (d && !url) {
      const up = await msUpload(token, d, await getBlob(d));
      if (!up.url) return toast('No se pudo subir el archivo a OneDrive');
      d.msId = up.id;
      d.msUrl = up.url;
      d.msMod = up.mod;
      await saveDoc(d);
      url = up.url;
    }
    if (!url) url = 'https://www.office.com/launch/excel';

    const w = window.open(url, '_blank', 'noopener');
    if (!w) toast('Permite las ventanas emergentes');
  } catch (e) {
    toast('No se pudo abrir Excel Online: ' + (e.message || 'error'));
  }
}

/** Diálogo para configurar el ID de cliente de Microsoft. */
function msSetupDialog() {
  openModal(`<h2>Abrir con Excel Online</h2>
  <div class="mu" style="margin-bottom:12px">Para abrir tus hojas de cálculo con el <b>Excel de Microsoft</b> hace falta un <b>ID de cliente</b> (gratis, una sola vez). Los pasos están en <b>Ayuda → Excel Online</b>.</div>
  <div class="f"><label>ID de cliente de Microsoft (Azure)</label>
    <input id="msid" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value="${esc(msClientId())}"></div>
  <div class="mu" style="margin-bottom:10px">⚠️ Al usarlo, la hoja se sube <b>sin cifrar</b> a tu OneDrive para que Microsoft pueda mostrarla. La bóveda sigue guardando el original cifrado.</div>
  <div class="fx"><button class="btn" data-a="close">Cancelar</button><button class="btn p" id="msok">${ic('ok')}Guardar</button></div>`);
  const inp = $('#msid');
  if (inp) inp.focus();
  $('#msok').onclick = () => {
    const v = inp ? inp.value.trim() : '';
    if (!v) return toast('Pega el ID de cliente de Azure');
    saveMsClientId(v);
    closeModal();
    toast('ID guardado ✅ Vuelve a pulsar «Excel Online»');
  };
}

/** Olvida el permiso de Microsoft guardado en este dispositivo. */
async function msDisconnect() {
  msToken = null;
  msRefresh = '';
  try { await del('meta', MS_META_ID); } catch (e) { }
  toast('Microsoft desconectado');
}

/* Al volver a la app, se comprueba si Excel Online cambió algo. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') msAutoPull(false);
});
addEventListener('focus', () => msAutoPull(false));

window.MsActions = {
  openExcelOnline, msSetupDialog, msDisconnect, msPullManual, msAutoPull,
  msClientId, saveMsClientId
};