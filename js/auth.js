/* ==========================================================================
 * Bóveda · auth.js
 * Pantalla de bloqueo, contraseña maestra, «llave del dispositivo» (entrar con
 * Google sin escribir la contraseña) y autobloqueo por inactividad.
 *
 * CÓMO SE PROTEGE (importante):
 *   Google es la IDENTIDAD. La contraseña maestra es la LLAVE.
 *   La primera vez en cada dispositivo hay que escribir la contraseña; a partir
 *   de ahí el navegador guarda la llave como objeto CryptoKey NO extraíble, así
 *   que se puede usar para descifrar pero nadie puede copiar sus bytes.
 *   La llave NUNCA viaja a Drive: Google sigue sin poder leer nada.
 * ========================================================================== */
'use strict';

let mode = 'setup';   // 'setup' | 'login' | 'google'

/** ¿Se puede ofrecer el botón de Google en este contexto? */
const canUseGoogle = () => gdriveReady() && location.protocol !== 'file:';

/** Muestra la pantalla de bloqueo al instante, sin esperar a IndexedDB. */
function paintLock() {
  $('#lg').innerHTML = ic('lock');
  $('#lock').style.display = 'flex';
  $('#app').hidden = true;
  $('#lt').textContent = 'Cargando…';
  $('#ls').textContent = '';
  $('#lgbtn').hidden = true;
  $('#lor').hidden = true;
  $('#lp').hidden = false;
  $('#lp2').hidden = true;
  $('#lb').hidden = false;
  $('#lb').disabled = true;
  $('#lb').textContent = 'Cargando…';
  $('#lshowpw').hidden = true;
  $('#le').textContent = '';
}

/**
 * Configura la pantalla de bloqueo según el estado:
 *   setup  -> no hay bóveda en este dispositivo (crear o traer de Drive)
 *   google -> hay llave guardada: se entra solo con Google, sin contraseña
 *   login  -> hay bóveda pero no llave: hace falta la contraseña
 */
async function showLock() {
  paintLock();

  let m = null;
  try { m = await getMeta(); } catch (e) { mem = true; m = null; }

  const rec = m ? await getDeviceKeyRec() : null;
  const google = canUseGoogle();
  const useGoogle = !!rec && google && prefs.rememberDevice;

  const btnG = $('#lgbtn'), or = $('#lor'), pw = $('#lp'), pw2 = $('#lp2'),
    btn = $('#lb'), link = $('#lshowpw');

  btn.disabled = false;

  /* ---- Sin bóveda en este dispositivo: crear o traer de Drive ---- */
  if (!m) {
    mode = 'setup';
    $('#lt').textContent = 'Crea tu ' + APP_NAME + ' segura';
    $('#ls').textContent = 'Elige una contraseña maestra. Cifra todo en tu dispositivo. Si la olvidas, NO se puede recuperar.';
    pw.hidden = false;
    pw2.hidden = false;
    btn.hidden = false;
    btn.textContent = 'Crear ' + APP_NAME;
    pw.value = pw2.value = '';

    if (google) {
      btnG.hidden = false;
      btnG.innerHTML = '<span class="gmark">G</span>Traer mi bóveda de Google Drive';
      or.hidden = false;
      $('#ls').textContent = 'Trae tu bóveda desde tu Google Drive, o crea una nueva.';
    }
    pw.focus();
    return;
  }

  /* ---- Hay llave guardada: se entra con Google, sin contraseña ---- */
  if (useGoogle) {
    mode = 'google';
    $('#lt').textContent = APP_NAME + ' segura';
    $('#ls').textContent = 'Entra con tu cuenta de Google. En este dispositivo no hace falta contraseña.';
    pw.hidden = true;
    pw2.hidden = true;
    btn.hidden = true;
    btnG.hidden = false;
    btnG.innerHTML = '<span class="gmark">G</span>Iniciar sesión con Google';
    link.hidden = false;
    return;
  }

  /* ---- Hay bóveda pero no llave: contraseña ---- */
  mode = 'login';
  $('#lt').textContent = 'Desbloquear ' + APP_NAME;
  $('#ls').textContent = 'Ingresa tu contraseña maestra.';
  pw.hidden = false;
  pw2.hidden = true;
  btn.hidden = false;
  btn.textContent = 'Entrar';
  pw.value = pw2.value = '';
  pw.focus();
}

/** En el bloqueo: muestra el formulario de contraseña en vez del botón de Google. */
function usePasswordInstead() {
  mode = 'login';
  $('#lgbtn').hidden = true;
  $('#lshowpw').hidden = true;
  $('#lt').textContent = 'Desbloquear ' + APP_NAME;
  $('#ls').textContent = 'Ingresa tu contraseña maestra.';
  $('#lp').hidden = false;
  $('#lp2').hidden = true;
  $('#lb').hidden = false;
  $('#lb').textContent = 'Entrar';
  $('#lp').value = '';
  $('#lp').focus();
}

/* ============================ Desbloqueo =============================== */

/**
 * Entra en la bóveda con una clave ya derivada (de la contraseña o de la llave
 * guardada en este dispositivo).
 * @param {CryptoKey} k
 * @param {boolean} remember true = guardar la llave en este dispositivo
 */
async function unlockWith(k, remember) {
  key = k;
  $('#lock').style.display = 'none';
  $('#app').hidden = false;
  $('#view').innerHTML = '<div class="mu" style="padding:40px 0">Descifrando tu bóveda…</div>';

  await migrate();
  await load();
  bump();
  maybeShowInstallHint();
  driveAutoSync();

  if (remember) await rememberDevice();
}

/**
 * Guarda la llave en este dispositivo para no volver a pedir la contraseña.
 * Solo tiene sentido si Google está configurado: es lo que ata la llave a una
 * identidad. Sin Google no se guarda nada (si no, no habría autenticación).
 */
async function rememberDevice() {
  if (!prefs.rememberDevice || !canUseGoogle()) return;
  try {
    await saveDeviceKey(key, prefs.driveEmail || '');
  } catch (e) { /* el navegador puede negarse: se sigue pidiendo contraseña */ }
}

/** Valida el formulario de acceso (crear bóveda o desbloquear con contraseña). */
async function submit() {
  const pw = $('#lp').value;
  const err = t => $('#le').textContent = t;
  err('');
  if (!pw) return err('Escribe tu contraseña');
  if (!cryptoOK()) return err(cryptoProblemMsg());

  const b = $('#lb'), t0 = b.textContent;
  b.disabled = true;
  b.textContent = 'Procesando...';
  try {
    if (mode === 'setup') {
      if (pw.length < 6) return err('Mínimo 6 caracteres');
      if (pw !== $('#lp2').value) return err('Las contraseñas no coinciden');
      const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
      const k = await derive(pw, salt);
      await put('meta', { id: 'v', salt: b2s(salt), chk: b2s(await E(k, enc.encode('ok'))) });
      $('#lp').value = $('#lp2').value = '';
      await unlockWith(k, true);
    } else {
      const m = await getMeta();
      try {
        const k = await derive(pw, s2b(m.salt));
        await D(k, s2b(m.chk));   // lanza excepción si la contraseña no es válida
        fails = 0;
        $('#lp').value = '';
        await unlockWith(k, true);
      } catch (e) {
        fails++;
        await sleep(Math.min(fails, 5) * 1000);   // retardo progresivo anti fuerza bruta
        return err('Contraseña incorrecta');
      }
    }
  } catch (e) {
    err('Error: ' + e.message);
  } finally {
    b.disabled = false;
    b.textContent = t0;
  }
}

/* ========================= Entrar con Google =========================== */

/** Pide un token: primero en silencio y, si hace falta, con la ventana de Google. */
async function googleToken() {
  let t = await driveAuth.token();
  if (!t) t = await driveAuth.connect();
  return t;
}

/**
 * Entra SIN contraseña usando la llave guardada en este dispositivo.
 * Comprueba que la cuenta de Google sea la misma a la que se ató la llave.
 */
async function googleUnlock() {
  const err = t => $('#le').textContent = t;
  err('');
  if (!gdriveReady()) return err('Falta configurar el ID de cliente de Google');
  if (!cryptoOK()) return err(cryptoProblemMsg());

  const b = $('#lgbtn'), t0 = b.innerHTML;
  b.disabled = true;
  b.innerHTML = '<span class="gmark">G</span>Conectando con Google…';
  try {
    const token = await googleToken();
    const mail = await driveAuth.email(token);
    if (mail) {
      prefs.driveEmail = mail;
      prefs.driveConnected = true;
      savePrefs();
    }

    const rec = await getDeviceKeyRec();
    if (!rec) return err('Este dispositivo no tiene la llave. Entra con tu contraseña.');

    if (rec.email && mail && rec.email.toLowerCase() !== mail.toLowerCase()) {
      return err('Esa cuenta no es la de esta bóveda (' + rec.email + ').');
    }
    await unlockWith(rec.key, false);
  } catch (e) {
    err('No se pudo entrar con Google: ' + e.message);
  } finally {
    b.disabled = false;
    b.innerHTML = t0;
  }
}

/**
 * En un dispositivo nuevo: trae la bóveda desde Google Drive.
 * Después pedirá la contraseña de esa bóveda (una sola vez).
 */
async function googleFetchVault() {
  const err = t => $('#le').textContent = t;
  err('');
  if (!gdriveReady()) return err('Falta configurar el ID de cliente de Google');

  const b = $('#lgbtn'), t0 = b.innerHTML;
  b.disabled = true;
  b.innerHTML = '<span class="gmark">G</span>Buscando tu bóveda…';
  try {
    const token = await googleToken();
    const mail = await driveAuth.email(token);
    if (mail) prefs.driveEmail = mail;

    const remote = await drive.list(token);
    if (!remote) {
      err('No hay ninguna bóveda en tu Google Drive. Crea una nueva.');
      return;
    }
    prefs.driveConnected = true;
    prefs.driveAuto = true;
    savePrefs();
    await pullVault(token, remote);   // termina bloqueando y pidiendo la contraseña
  } catch (e) {
    err('No se pudo traer la bóveda: ' + e.message);
  } finally {
    b.disabled = false;
    b.innerHTML = t0;
  }
}

/** Olvida la llave de este dispositivo: volverá a pedir la contraseña. */
async function forgetDevice() {
  await forgetDeviceKey();
  toast('Este dispositivo ya no recuerda la llave');
  if (view === 'set') renderSet();
  if (!key) await showLock();
}

/* ====================== Autobloqueo y bloqueo ========================== */

/** Reinicia el temporizador de autobloqueo (minutos en prefs.autolock, 0 = off). */
function bump() {
  clearTimeout(idleT);
  if (!key) return;
  const m = Number(prefs.autolock) || 0;
  if (!m) return;
  idleT = setTimeout(() => {
    lockNow();
    toast('Bóveda bloqueada por inactividad');
  }, m * 60000);
}
['click', 'keydown', 'pointerdown', 'touchstart'].forEach(e => addEventListener(e, bump, { passive: true }));

/** Cierra la sesión: olvida la clave, limpia la memoria y vuelve al bloqueo. */
function lockNow() {
  key = null;
  docs = [];
  info = [];
  urls.forEach(URL.revokeObjectURL); urls = [];
  murls.forEach(URL.revokeObjectURL); murls = [];
  clearTimeout(idleT);
  $$('.ov').forEach(o => o.remove());
  closeDrawer();
  closeScan();
  showLock();
}
