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
       <button class="rb" data-v="qx" title="Quinquenios y Adelantos">${ic('file')}</button>
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

  $('#srw').innerHTML = ic('search') + '<input id="q" placeholder="Buscar en tu bóveda...">';
  $('#q').oninput = e => {
    qs = e.target.value.toLowerCase();
    if (view !== 'docs') view = 'docs';
    render();
  };

  $('#bot').innerHTML =
    `<button data-v="docs">${ic('file')}Docs</button>
     <button data-v="info">${ic('id')}Datos</button>
     <button data-v="qx">${ic('file')}Quin/Adel</button>
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
    <div class="mu">Los documentos se agrupan por <b>categoría</b> (que actúa de carpeta). Pulsa una carpeta para abrirla o cerrarla. La ★ marca un documento como favorito, y «Mostrar» permite ver solo los favoritos.</div></div>

  <div class="pn" style="margin-bottom:10px"><h2 style="font-size:15px">Compartir</h2>
    <div class="mu">En el <b>celular</b>, «Compartir» abre el menú del sistema con el archivo adjunto (WhatsApp, Gmail…). En la <b>computadora</b>, los navegadores no permiten adjuntar desde una web: se abre la conversación con el mensaje escrito y descargas el archivo para adjuntarlo con el clip 📎.</div></div>

  <div class="pn" style="margin-bottom:10px"><h2 style="font-size:15px">Respaldos y sincronización</h2>
    <div class="mu">En <b>Ajustes</b> puedes exportar un respaldo cifrado y conectar tu Google Drive para ver lo mismo en el celular y la computadora.</div></div>

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

  <div class="pn" style="margin-bottom:10px"><h2 style="font-size:15px">Al compartir un documento</h2>
    <div class="mu">El documento <b>sale descifrado</b> de la bóveda: a partir de ahí depende de la app por la que lo envíes. La app te lo avisa cada vez.</div></div>

  <div class="fx"><button class="btn p" data-a="close">Cerrar</button></div>`);
}
