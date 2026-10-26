/* ==========================================================================
 * Bóveda · ui.js
 * Cascarón de la interfaz: riel de iconos, barra superior, navegación inferior
 * y barra de estado (todo al estilo Keeper). Enrutado de vistas y modales.
 * ========================================================================== */
'use strict';

/** Iniciales para el avatar (a partir del correo de la cuenta conectada). */
function initials(s) {
  const parts = String(s || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
  if (!parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Construye los elementos fijos de la interfaz (una sola vez). */
function chrome() {
  $('#rail').innerHTML =
    `<button class="rb add" data-a="new" title="Agregar documento">${ic('plus')}</button>
     <div id="nav">
       <button class="rb" data-v="docs" title="Mi bóveda">${ic('sh')}</button>
       <button class="rb" data-v="info" title="Mis datos">${ic('id')}</button>
       <button class="rb" data-v="qx" title="Quinquenios y Adelantos">${ic('clock')}</button>
       <button class="rb" data-v="xls" title="Excel">${ic('file')}</button>
       <button class="rb" data-a="scan" title="Escanear documento">${ic('scan')}</button>
       <button class="rb" data-a="sharepick" title="Compartir un documento">${ic('share')}</button>
       <button class="rb" data-a="help" title="Ayuda">${ic('help')}</button>
     </div>
     <span class="sep"></span>
     <button class="rb" data-v="set" title="Ajustes">${ic('cfg')}</button>
     <div class="sp"></div>
     <button class="rb" data-a="lockn" title="Bloquear ahora">${ic('lock')}</button>`;

  $('#topbar').innerHTML =
    `<div class="tb-brand"><span>${ic('sh')}</span><b>Bóveda</b></div>
     <div class="sr" id="srw"></div>
     <button class="ibtn" data-a="filtermenu" title="Ordenar y mostrar">${ic('filter')}</button>
     <div class="sp"></div>
     <button class="ibtn" data-a="scan" title="Escanear">${ic('scan')}</button>
     <div class="who" id="who" data-a="whomenu" title="Tu cuenta"></div>`;

  const esMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  $('#srw').innerHTML = ic('search') + '<input id="q" placeholder="Buscar en tu bóveda...">' +
    `<span class="kbd"><kbd>${esMac ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd></span>`;
  $('#q').oninput = e => {
    qs = e.target.value.toLowerCase();
    if (view !== 'docs') view = 'docs';
    render();
  };

  $('#bot').innerHTML =
    `<button data-v="docs">${ic('file')}Docs</button>
     <button data-v="info">${ic('id')}Datos</button>
     <button data-v="qx">${ic('clock')}Quin/Adel</button>
     <button data-v="xls">${ic('file')}Excel</button>
     <button class="sc" data-a="scan">${ic('scan')}</button>
     <button data-a="new">${ic('plus')}Subir</button>
     <button data-v="set">${ic('cfg')}Ajustes</button>`;

  const st = $('#status');
  st.hidden = false;
  st.innerHTML =
    `<span class="ok">🔒 cifrado: ACTIVADO</span>
     <div class="grow"></div>
     <button data-a="gsync">${ic('rot')}Sincronizar</button>
     <button data-a="help">${ic('help')}Ayuda</button>
     <button data-a="privacy">${ic('sh')}Política de privacidad</button>`;

  updateWho();
}

/** Avatar + correo de la cuenta conectada (o «Sin cuenta»). */
function updateWho() {
  const el = $('#who');
  if (!el) return;
  const mail = (prefs.driveConnected && prefs.driveEmail) ? prefs.driveEmail : '';
  el.innerHTML = `<span class="ava">${esc(initials(mail || APP_NAME))}</span>` +
    `<b>${esc(mail || 'Sin cuenta')}</b>`;
}

/** Pinta la vista activa. */
function render() {
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  $$('[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === view));
  $('#srw').style.visibility = view === 'docs' ? 'visible' : 'hidden';
  updateWho();

  if (view === 'info') renderInfo();
  else if (view === 'set') renderSet();
  else if (view === 'qx') renderQx();
  else if (view === 'xls') renderXls();
  else renderDocs();
}

/* ===================== Modales ===================== */

/** Abre un modal. big=true usa el diálogo grande (visor de documentos). */
function openModal(html, big) {
  closeModal();
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = `<div class="md${big ? ' big' : ''}">${html}</div>`;
  ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
  document.body.appendChild(ov);
  return ov;
}

/** Cierra todos los modales y libera sus object URLs. */
function closeModal() {
  $$('.ov').forEach(o => o.remove());
  murls.forEach(URL.revokeObjectURL);
  murls = [];
}

/** Diálogo de confirmación reutilizable. */
function confirmDialog(title, msg, okLabel = 'Eliminar') {
  return new Promise(res => {
    openModal(`<h2>${esc(title)}</h2><div class="mu" style="margin-bottom:6px">${esc(msg)}</div>
      <div class="fx"><button class="btn" id="cfno">Cancelar</button><button class="btn dg" id="cfok">${esc(okLabel)}</button></div>`);
    $('#cfno').onclick = () => { closeModal(); res(false); };
    $('#cfok').onclick = () => { closeModal(); res(true); };
  });
}

/* ===================== Ayuda y privacidad ===================== */

/** Ventana de ayuda rápida (barra de estado). */
function helpDialog() {
  openModal(`<h2>Cómo funciona ${APP_NAME}</h2>
  <div class="mu" style="margin-bottom:12px">Todo se guarda <b>cifrado</b> en este dispositivo. No hay servidores ni cuentas.</div>

  <div class="pn" style="margin-bottom:10px"><h2 style="font-size:15px">Guardar documentos</h2>
    <div class="mu">Con el botón <b>+</b> del riel: sube un archivo, toma una foto o escanea varias páginas (se juntan en un PDF).</div></div>

  <div class="pn" style="margin-bottom:10px"><h2 style="font-size:15px">Carpetas y favoritos</h2>
    <div class="mu">Los documentos se agrupan por <b>carpeta</b>. Con <b>«Nueva carpeta»</b> creas una y con <b>⬆</b> subes archivos dentro. Puedes <b>arrastrar archivos</b> del ordenador <b>encima de una carpeta</b> para guardarlos ahí, y <b>arrastrar un documento</b> a otra carpeta para moverlo (en el móvil, usa <b>Mover</b> en el panel del documento). Pulsa una carpeta para abrirla o cerrarla. La ★ marca un documento como favorito.</div></div>

  <div class="pn" style="margin-bottom:10px"><h2 style="font-size:15px">Compartir</h2>
    <div class="mu">En el <b>celular</b>, «Compartir» abre el menú del sistema con el archivo adjunto (WhatsApp, Gmail…). En la <b>computadora</b>, los navegadores no permiten adjuntar desde una web: se abre la conversación con el mensaje escrito y descargas el archivo para adjuntarlo con el clip 📎.</div></div>

  <div class="pn" style="margin-bottom:10px"><h2 style="font-size:15px">Respaldos y sincronización</h2>
    <div class="mu">En <b>Ajustes</b> puedes exportar un respaldo cifrado y conectar tu Google Drive para ver lo mismo en el celular y la computadora.</div></div>

  <div class="pn" style="margin-bottom:10px"><h2 style="font-size:15px">Excel Online (Microsoft)</h2>
    <div class="mu">Para abrir tus hojas de cálculo con el <b>Excel de Microsoft</b>, la app sube una copia a tu <b>OneDrive</b> y abre el enlace de Office. Necesita un <b>ID de cliente de Azure</b> (gratis, una sola vez): en <b>portal.azure.com</b> → <i>Microsoft Entra ID → Registros de aplicaciones → Nuevo registro</i>, tipo <b>Aplicación de página única (SPA)</b>, y en <i>URI de redirección</i> pon <code>TU-SITIO/ms-auth.html</code>. Pega el ID cuando la app te lo pida.</div>
    <div class="mu" style="margin-top:8px"><b>Sincronización automática:</b> lo que edites y guardes en Excel Online se trae solo a la bóveda <b>al volver a la app</b> (también puedes forzarlo con el botón <b>«Traer de OneDrive»</b>). Los archivos vinculados llevan la marca <b>Excel Online</b> en la lista.</div></div>

  <div class="fx"><button class="btn p" data-a="close">Entendido</button></div>`);
}

/** Ventana de privacidad. */
function privacyDialog() {
  openModal(`<h2>Política de privacidad</h2>
  <div class="mu" style="margin-bottom:12px">Versión corta y honesta: <b>tus datos son tuyos y punto</b>.</div>

  <div class="pn" style="margin-bottom:10px"><h2 style="font-size:15px">Qué se recoge</h2>
    <div class="mu"><b>Nada.</b> No hay analítica, ni cookies de seguimiento, ni publicidad, ni cuentas en servidores.</div></div>

  <div class="pn" style="margin-bottom:10px"><h2 style="font-size:15px">Dónde están tus datos</h2>
    <div class="mu">Solo en este dispositivo, dentro del almacenamiento del navegador, <b>cifrados con AES-GCM 256</b>. La contraseña maestra nunca se envía a ningún sitio.</div></div>

  <div class="pn" style="margin-bottom:10px"><h2 style="font-size:15px">Sincronización con Google Drive</h2>
    <div class="mu">Si la activas, se sube a <b>tu</b> Drive el respaldo <b>ya cifrado</b>: Google solo ve un archivo ilegible. El permiso usado (<code>drive.file</code>) no da acceso al resto de tu Drive. Puedes desconectarla cuando quieras.</div></div>

  <div class="pn" style="margin-bottom:10px"><h2 style="font-size:15px">Ver con el visor de Google (opcional)</h2>
    <div class="mu">Si pulsas <b>«Ver con Drive»</b> en un documento, se sube una copia <b>SIN CIFRAR</b> de ese archivo a tu Drive, para que el visor de Google pueda mostrarlo. <b>Google podrá leerlo.</b> Es opcional, <b>documento por documento</b>, y esa copia se puede borrar con <b>«Quitar de Drive»</b>. Si no lo usas, nada sale de tu dispositivo.</div></div>

  <div class="pn" style="margin-bottom:10px"><h2 style="font-size:15px">Al compartir un documento</h2>
    <div class="mu">El documento <b>sale descifrado</b> de la bóveda: a partir de ahí depende de la app por la que lo envíes. La app te lo avisa cada vez.</div></div>

  <div class="fx"><button class="btn p" data-a="close">Cerrar</button></div>`);
}

/* ===================== Menú desplegable de la cuenta =================== */

/** Abre el menú de la cuenta (avatar de la barra superior). */
function accountMenu() {
  closeAccountMenu();
  const mail = (prefs.driveConnected && prefs.driveEmail) ? prefs.driveEmail : '';
  const box = document.createElement('div');
  box.className = 'usermenu';
  box.id = 'usermenu';
  box.innerHTML = `
    <div class="um-head">
      <b>${esc(mail || 'Sin cuenta')}</b>
      <span>${prefs.driveConnected ? 'Google Drive conectado' : 'Bóveda local (sin Drive)'}</span>
    </div>
    <button data-a="whomenu">${ic('cfg')}Ajustes y respaldo</button>
    <button data-a="lockn">${ic('lock')}Bloquear ahora</button>
    <div class="umsep"></div>
    ${prefs.driveConnected
      ? `<button class="d" data-a="gdisconnect">${ic('cloud')}Desconectar Google Drive</button>`
      : `<button data-a="gconnect">${ic('cloud')}Conectar Google Drive</button>`}`;
  document.body.appendChild(box);
}

/** Cierra el menú de la cuenta si está abierto. */
function closeAccountMenu() {
  const el = document.getElementById('usermenu');
  if (el) el.remove();
}

/* Se cierra al pulsar fuera o con Escape. */
document.addEventListener('click', e => {
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('#usermenu')) { setTimeout(closeAccountMenu, 0); return; }
  if (!t.closest('#who')) closeAccountMenu();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAccountMenu(); });
