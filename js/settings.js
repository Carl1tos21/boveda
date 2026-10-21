/* ==========================================================================
 * Bóveda · settings.js
 * Preferencias locales, tema, cambio de contraseña maestra, respaldos
 * cifrados (exportar/importar) y borrado total.
 * ========================================================================== */
'use strict';

/* --------------------------- Preferencias ------------------------------ */
function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) prefs = Object.assign(prefs, JSON.parse(raw));
  } catch (e) { /* localStorage no disponible */ }
}

function savePrefs() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { }
}

/** Aplica el tema elegido ('auto' | 'light' | 'dark') al documento. */
function applyTheme() {
  const t = prefs.theme || 'auto';
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;

  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const m = $('meta[name=theme-color]');
  if (m) m.setAttribute('content', dark ? '#0f1b3d' : '#f3f5fa');
}

/* ----------------------------- Ajustes --------------------------------- */
/** Pinta la vista de ajustes. */
function renderSet() {
  const v = $('#view');
  const tot = docs.reduce((a, d) => a + d.size, 0);
  const th = prefs.theme || 'auto';
  const al = Number(prefs.autolock) || 0;
  const opt = (val, txt) => `<option value="${val}"${al === val ? ' selected' : ''}>${txt}</option>`;

  v.innerHTML = `<h1>Ajustes</h1><div class="mu">Todo se guarda cifrado en este dispositivo${mem ? ' (modo memoria: los cambios no se conservarán al cerrar)' : ''}</div>
  <div style="height:14px"></div>

  <div class="pn"><h2>Apariencia</h2>
    <div class="f"><label>Tema</label><select id="sttheme">
      <option value="auto"${th === 'auto' ? ' selected' : ''}>Automático (según el sistema)</option>
      <option value="light"${th === 'light' ? ' selected' : ''}>Claro</option>
      <option value="dark"${th === 'dark' ? ' selected' : ''}>Oscuro</option>
    </select></div>
  </div>

  <div class="pn"><h2>Seguridad</h2>
    <div class="mu" style="margin-bottom:10px">La contraseña maestra cifra todo. Si la olvidas, no hay forma de recuperar los datos.</div>
    <div class="f"><label>Bloqueo automático por inactividad</label><select id="stauto">
      ${opt(0, 'Nunca')}${opt(1, '1 minuto')}${opt(5, '5 minutos')}${opt(15, '15 minutos')}${opt(30, '30 minutos')}${opt(60, '1 hora')}
    </select></div>
    <div class="f" style="margin-top:12px"><label class="ck"><input type="checkbox" id="stremember"${prefs.rememberDevice ? ' checked' : ''}>Entrar con Google sin escribir la contraseña en este dispositivo</label></div>
    <div class="mu" style="margin:-4px 0 10px">La llave se guarda aquí cifrada y <b>no extraíble</b>: el código puede usarla, pero nadie puede copiarla. <b>Nunca se sube a Drive</b>, así que Google sigue sin poder leer tus documentos. Si desactivas esto, se pedirá la contraseña cada vez.</div>
    <div class="row"><div class="l">Llave en este dispositivo</div><div class="v" id="stdevkey">Comprobando…</div></div>
    <div class="fx" style="justify-content:flex-start">
      <button class="btn" data-a="chpw">${ic('lock')}Cambiar contraseña</button>
      <button class="btn" data-a="lockn">${ic('lock')}Bloquear ahora</button>
      <button class="btn d" data-a="forgetdev" hidden>${ic('tr')}Olvidar este dispositivo</button>
    </div>
  </div>

  <div class="pn"><h2>Respaldo</h2>
    <div class="mu" style="margin-bottom:10px">El respaldo se guarda cifrado: necesitarás la contraseña maestra del respaldo para restaurarlo.</div>
    <div class="fx" style="justify-content:flex-start">
      <button class="btn" data-a="exp">${ic('dl')}Exportar respaldo</button>
      <button class="btn" data-a="imp">${ic('up')}Importar respaldo</button>
    </div>
  </div>

  ${drivePanelHtml()}

  <div class="pn"><h2>Protección de datos</h2>
    <div class="row"><div class="l">Almacenamiento</div><div class="v" id="stpersist">Comprobando…</div></div>
    <div class="row"><div class="l">Uso / cuota</div><div class="v" id="stquota">—</div></div>
    <div class="row"><div class="l">Instalada como app</div><div class="v">${isStandalone() ? 'Sí ✅' : 'No'}</div></div>
    <div class="mu" style="margin:10px 0 0">Si el almacenamiento no está protegido, el navegador podría borrar la bóveda si al dispositivo le falta espacio. Mantén siempre un respaldo exportado.</div>
    <div class="fx" style="justify-content:flex-start"><button class="btn" id="stask">${ic('sh')}Proteger almacenamiento</button></div>
  </div>

  <div class="pn"><h2>Almacenamiento</h2>
    <div class="row"><div class="l">Documentos</div><div class="v">${docs.length}</div></div>
    <div class="row"><div class="l">Datos guardados</div><div class="v">${info.length}</div></div>
    <div class="row"><div class="l">Espacio usado</div><div class="v">${fmt(tot)}</div></div>
    <div class="row"><div class="l">Motor</div><div class="v">${mem ? 'Memoria volátil' : 'IndexedDB'}</div></div>
    <div class="fx" style="justify-content:flex-start"><button class="btn dg" data-a="wipe">${ic('tr')}Borrar toda la bóveda</button></div>
  </div>`;

  $('#sttheme').onchange = e => { prefs.theme = e.target.value; savePrefs(); applyTheme(); };
  $('#stauto').onchange = e => { prefs.autolock = Number(e.target.value); savePrefs(); bump(); toast('Autobloqueo actualizado'); };

  const rem = $('#stremember');
  if (rem) {
    rem.onchange = async () => {
      prefs.rememberDevice = rem.checked;
      savePrefs();
      if (rem.checked) {
        await rememberDevice();
        toast(gdriveReady()
          ? 'Este dispositivo recordará la llave ✅'
          : 'Se activará cuando configures Google Drive');
      } else {
        await forgetDeviceKey();
        toast('Se pedirá la contraseña cada vez');
      }
      renderSet();
    };
  }

  fillStorage();
  fillDrive();
  fillSecurity();
  $('#stask').onclick = async () => {
    const ok = await requestPersistence();
    toast(ok === true
      ? 'Almacenamiento protegido ✅'
      : 'El navegador no lo permitió. Exporta respaldos con frecuencia.');
    fillStorage();
  };
}

/** Rellena el estado de la llave del dispositivo (Ajustes → Seguridad). */
async function fillSecurity() {
  const el = $('#stdevkey');
  if (!el) return;
  const rec = await getDeviceKeyRec();
  el.innerHTML = rec
    ? '<span style="color:var(--ac)">Guardada ✅</span>' + (rec.email ? ' · ' + esc(rec.email) : '')
    : 'No configurada';
  const b = $('[data-a="forgetdev"]');
  if (b) b.hidden = !rec;
}

/** Rellena los indicadores de almacenamiento (se consultan de forma asíncrona). */
async function fillStorage() {
  const s = await storageState();
  const p = $('#stpersist');
  if (p) {
    p.innerHTML = s.persistent === true
      ? '<span style="color:var(--ac)">Protegido ✅</span>'
      : s.persistent === false
        ? '<span style="color:var(--dg)">Sin proteger ⚠️</span>'
        : 'No disponible';
  }
  const q = $('#stquota');
  if (q) q.textContent = s.quota ? fmt(s.usage) + ' de ' + fmt(s.quota) : (s.usage ? fmt(s.usage) : '—');
  const b = $('#stask');
  if (b && s.persistent === true) b.hidden = true;
}

/* ------------------- Cambio de contraseña maestra ---------------------- */
/** Re-cifra toda la bóveda con una nueva clave derivada de la nueva contraseña. */
function changePwDialog() {
  openModal(`<h2>Cambiar contraseña maestra</h2>
  <div class="f"><label>Contraseña actual</label><input id="cp0" type="password" autocomplete="off"></div>
  <div class="f"><label>Nueva contraseña</label><input id="cp1" type="password" autocomplete="off"></div>
  <div class="f"><label>Repite la nueva contraseña</label><input id="cp2" type="password" autocomplete="off"></div>
  <div id="cpe" style="color:var(--dg);font-size:13px;min-height:18px"></div>
  <div class="fx"><button class="btn" data-a="close">Cancelar</button><button class="btn p" id="cpok">${ic('ok')}Cambiar</button></div>`);

  $('#cpok').onclick = async () => {
    const err = t => $('#cpe').textContent = t;
    err('');
    const oldPw = $('#cp0').value, nu = $('#cp1').value, nu2 = $('#cp2').value;
    const btn = $('#cpok'), t0 = btn.innerHTML;
    btn.disabled = true; btn.textContent = 'Re-cifrando...';
    try {
      const m = await getMeta();
      try {
        await D(await derive(oldPw, s2b(m.salt)), s2b(m.chk));
      } catch (e) { return err('La contraseña actual no es correcta'); }

      if (nu.length < 6) return err('La nueva contraseña debe tener al menos 6 caracteres');
      if (nu !== nu2) return err('Las contraseñas nuevas no coinciden');

      const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
      const nk = await derive(nu, salt);

      for (const d of docs) {
        const blob = await getBlob(d);                       // descifra con la clave antigua
        d._eb = await E(nk, await blob.arrayBuffer());       // vuelve a cifrar con la nueva
        await put('docs', {
          id: d.id, date: d.date, blob: d._eb,
          meta: await E(nk, enc.encode(JSON.stringify({ name: d.name, cat: d.cat, notes: d.notes, file: d.file, type: d.type, fav: !!d.fav })))
        });
      }
      for (const i of info) await saveInfo(i, nk);

      await put('meta', { id: 'v', salt: b2s(salt), chk: b2s(await E(nk, enc.encode('ok'))) });
      key = nk;
      closeModal();
      toast('Contraseña actualizada ✅');
    } catch (e) {
      err('Error: ' + e.message);
    } finally {
      btn.disabled = false; btn.innerHTML = t0;
    }
  };
}

/* ----------------------------- Respaldos ------------------------------- */
/** Exporta la bóveda completa cifrada a un archivo .json. */
async function exportBackup() {
  download(new Blob([await buildBackup()], { type: 'application/json' }),
    'boveda-respaldo-' + new Date().toISOString().slice(0, 10) + '.json');
  toast('Respaldo exportado ✅');
}

/** Importa un respaldo cifrado (fusiona o adopta la bóveda si está vacía). */
async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { return toast('Archivo no válido'); }
  if (!data || data.app !== 'boveda') return toast('Este archivo no es un respaldo de ' + APP_NAME);

  const m = await getMeta();
  const empty = !(await all('docs')).length && !(await all('info')).length;

  if (!empty && data.salt !== m.salt) {
    return toast('Este respaldo pertenece a otra bóveda (contraseña distinta)');
  }

  for (const d of data.docs || []) await put('docs', { id: d.id, date: d.date, blob: s2b(d.blob), meta: s2b(d.meta) });
  for (const i of data.info || []) await put('info', { id: i.id, ord: i.ord, c: s2b(i.c) });
  if (data.folders) await put('meta', { id: FOLDERS_ID, c: s2b(data.folders) });

  if (empty) {
    await put('meta', { id: 'v', salt: data.salt, chk: data.chk });
    toast('Respaldo importado. Desbloquea con la contraseña del respaldo.');
    lockNow();
  } else {
    await load();
    toast('Respaldo fusionado ✅');
  }
}

/* --------------------------- Borrado total ----------------------------- */
/** Borra todos los documentos, datos y la base de datos completa. */
async function wipeAll() {
  if (!await confirmDialog('Borrar toda la bóveda', 'Se eliminarán todos los documentos y datos de este dispositivo. Esta acción no se puede deshacer.', 'Borrar todo')) return;
  await destroyDB();
  key = null;
  docs = [];
  info = [];
  folders = [];
  pendingFolder = null;
  urls.forEach(URL.revokeObjectURL); urls = [];
  murls.forEach(URL.revokeObjectURL); murls = [];
  closeScan();
  await showLock();
  toast('Bóveda borrada');
}
