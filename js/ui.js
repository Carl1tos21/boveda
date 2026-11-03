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
  initEnterToSave();
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

  /* Aviso rojo en el menú con los quinquenios vencidos sin gestionar. */
  if (typeof qxUpdateBadge === 'function') qxUpdateBadge();
}

/* ===================== Guardar con Enter ===================== */

/**
 * Pulsar Enter para guardar.
 *
 * Dentro de un diálogo (o del panel lateral), si el foco está en un campo o en
 * un desplegable, Enter pulsa el botón principal — exactamente igual que si se
 * hiciera clic. En las áreas de texto Enter escribe un salto de línea, así que
 * ahí se guarda con Ctrl + Enter (o ⌘ + Enter en Mac).
 */
function initEnterToSave() {
  if (initEnterToSave._done) return;
  initEnterToSave._done = true;

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    const el = e.target;
    if (!el || !el.tagName) return;

    const tag = el.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return;
    if (tag === 'input' && el.type === 'file') return;                 // Enter abre el selector
    if (tag === 'textarea' && !(e.ctrlKey || e.metaKey)) return;       // en el texto, Enter escribe

    const cont = el.closest ? (el.closest('.ov') || el.closest('#drawer')) : null;
    if (!cont) return;                                                 // solo en diálogos y en el panel

    const btn = saveButtonOf(cont);
    if (!btn) return;
    e.preventDefault();
    btn.click();
  });
}

/**
 * Botón de guardado de un diálogo: primero los botones conocidos de guardar y,
 * si no hay ninguno, el último botón «principal» del pie.
 * Los diálogos de confirmación (Eliminar) no tienen botón principal: Enter no
 * los acepta, así no se borra nada sin querer.
 */
function saveButtonOf(cont) {
  const btns = Array.from(cont.querySelectorAll('.btn')).filter(b =>
    !b.disabled && b.dataset.a !== 'close' && b.dataset.a !== 'drawerclose');

  const conocidos = btns.filter(b =>
    /^(fok|nok|iok|mfok|nfok|rfok|msok)$/.test(b.id || '') ||
    /^(qxaddconfirm|qxgsave|qxconstgen|qxcompadd|qxmapconfirm|dsave)$/.test(b.dataset.a || ''));
  if (conocidos.length) return conocidos[0];

  const prim = btns.filter(b => b.classList.contains('p'));
  return prim.length ? prim[prim.length - 1] : null;
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
/* ===================== Guía de uso (Ayuda) ============================= */

/** Secciones de la guía. Se muestran como pestañas dentro de la Ayuda. */
const HELP_SECTIONS = [
  {
    id: 'boveda', t: 'Mi bóveda', html: `
    <div class="pn"><h2 style="font-size:15px">Guardar documentos</h2>
      <div class="mu">Con el botón <b>+</b> del riel: <b>Nota o enlace</b> (texto y links),
      <b>subir archivos</b> (varios a la vez), <b>foto</b> con la cámara, <b>galería</b>,
      <b>escanear</b> varias páginas o <b>crear una carpeta</b>.</div></div>

    <div class="pn"><h2 style="font-size:15px">Carpetas y favoritos</h2>
      <div class="mu">Los documentos se agrupan por <b>carpeta</b>. Puedes <b>arrastrar archivos</b>
      del ordenador encima de una carpeta, y <b>arrastrar un documento</b> a otra carpeta para
      moverlo (en el móvil, <b>Mover</b> en el panel del documento). La ★ marca un favorito.</div></div>

    <div class="pn"><h2 style="font-size:15px">Buscar y ordenar</h2>
      <div class="mu">Arriba está el buscador (por nombre, carpeta o archivo) y el botón de
      <b>ordenar y filtrar</b>. Puedes ver la bóveda en <b>lista</b>, <b>tarjetas</b> o
      <b>filas</b>.</div></div>

    <div class="pn"><h2 style="font-size:15px">Papelera y Deshacer</h2>
      <div class="mu">Lo que borras va a la <b>papelera</b> (<i>Ajustes → Ver papelera</i>) y se
      guarda <b>30 días</b>: puedes <b>Restaurar</b>, borrar para siempre o vaciarla. Además,
      justo después de borrar aparece <b>«Deshacer»</b> en el aviso.</div></div>

    <div class="pn"><h2 style="font-size:15px">Compartir</h2>
      <div class="mu">En el <b>celular</b>, «Compartir» abre el menú del sistema con el archivo
      adjunto (WhatsApp, Gmail…). En la <b>computadora</b> los navegadores no dejan adjuntar
      desde una web: se abre la conversación con el mensaje escrito y descargas el archivo para
      adjuntarlo con el clip 📎.</div></div>`
  },
  {
    id: 'notas', t: 'Notas y enlaces', html: `
    <div class="pn"><h2 style="font-size:15px">Qué son</h2>
      <div class="mu">Desde <b>+ → Nota o enlace</b> guardas <b>texto</b> y/o un <b>link</b>
      cifrado, sin necesidad de tener un archivo. Sirve para apuntes, claves de trámites,
      direcciones web, teléfonos…</div></div>

    <div class="pn"><h2 style="font-size:15px">Cómo se guardan</h2>
      <div class="mu">Se guardan como un <code>.txt</code> normal (el enlace en la primera línea),
      así que siguen siendo legibles si los <b>descargas</b> o los <b>compartes</b>. En la lista
      llevan la etiqueta <b>LINK</b>.</div></div>

    <div class="pn"><h2 style="font-size:15px">Enlaces pulsables</h2>
      <div class="mu">Cualquier <code>https://…</code> que escribas <b>dentro del texto</b> se
      vuelve un enlace azul que puedes pulsar. También hay un botón
      <b>«Abrir enlace»</b> en el visor y en el panel lateral.</div></div>

    <div class="pn"><h2 style="font-size:15px">Editar</h2>
      <div class="mu">El botón <b>Editar</b> reabre el formulario con el título, el enlace y el
      texto tal como los dejaste. También funciona con cualquier archivo <code>.txt</code> que
      subas.</div></div>`
  },
  {
    id: 'escaner', t: 'Escáner', html: `
    <div class="pn"><h2 style="font-size:15px">Escanear documentos</h2>
      <div class="mu">Con <b>+ → Escanear</b> haces varias fotos y la app las junta en
      <b>un solo PDF</b>. Cada página se puede <b>recortar</b> arrastrando las 4 esquinas
      (corrige la perspectiva como si fuera un escáner de verdad), <b>girar</b> y
      <b>repetir</b>.</div></div>

    <div class="pn"><h2 style="font-size:15px">Consejos</h2>
      <div class="mu">Busca buena luz, pon el papel sobre una superficie oscura y encuadra los
      bordes. El PDF se guarda cifrado como cualquier otro documento.</div></div>`
  },
  {
    id: 'datos', t: 'Mis datos', html: `
    <div class="pn"><h2 style="font-size:15px">Pares etiqueta / valor</h2>
      <div class="mu">En <b>Mis datos</b> guardas información corta: números de documento,
      cuentas, contactos, direcciones… Cada dato se cifra por separado y se puede
      <b>copiar</b> al portapapeles con un toque.</div></div>

    <div class="pn"><h2 style="font-size:15px">Diferencia con las notas</h2>
      <div class="mu">Aquí cada dato es una <b>etiqueta</b> con su <b>valor</b> (ideal para
      consultar y copiar). Si necesitas texto largo o un enlace, usa
      <b>+ → Nota o enlace</b>.</div></div>`
  },
  {
    id: 'quin', t: 'Quin/Adel', html: `
    <div class="pn"><h2 style="font-size:15px">Para qué sirve</h2>
      <div class="mu">Es el módulo de <b>Recursos Humanos</b> que reemplaza tu Excel
      <code>MACRO_QUINQUENIOS.xlsx</code>. Controla el <b>quinquenio</b> (el bono por antigüedad
      cada 5 años: 1.º a los 5, 2.º a los 10, 3.º a los 15) y los <b>adelantos</b> que pide el
      trabajador. Trae precargada la base de <b>338 trabajadores</b>, todo cifrado.</div></div>

    <div class="pn"><h2 style="font-size:15px">Las 4 pestañas</h2>
      <div class="mu"><b>MACRO</b> · buscador: escribes un nombre, cédula, cargo o departamento y
      abres su ficha.<br>
      <b>Panel RRHH</b> · tu tablero diario (ver abajo).<br>
      <b>Hoja 1</b> · las 25 columnas del Excel, editables: quinquenios, periodos, visados y
      adelantos. Se puede buscar, filtrar, ordenar y editar.<br>
      <b>Hoja 3</b> · los 18 datos de RRHH (dirección, puesto, categoría, departamento,
      sindicato, jefe, N.º de personal, sueldo…).</div></div>

    <div class="pn"><h2 style="font-size:15px">Panel RRHH</h2>
      <div class="mu">📈 <b>Avance de la gestión</b>: cuántos quinquenios vencidos ya están
      marcados y cuántos quedan.<br>
      ⏰ <b>Próximos vencimientos</b>: quién cumple en los próximos 3, 6 o 12 meses.<br>
      ⚠️ <b>Pendientes de gestionar</b>: los que ya vencieron y siguen sin cerrar, con
      <b>casillas</b> para marcarlos <b>en lote</b>.<br>
      🔎 <b>Datos a revisar</b>: sin fecha de ingreso, CUMPLE antes de tiempo, adelantos sin
      detalle, N.º de personal repetido o vacío, sin departamento, sin datos de RRHH y periodos
      que no cuadran.<br>
      📅 <b>Calendario</b> de 12 meses y 🏢 <b>resumen por departamento</b>.</div></div>

    <div class="pn"><h2 style="font-size:15px">El flujo de trabajo</h2>
      <div class="mu">Cada quinquenio lleva un <b>trámite</b>:
      <b>Pendiente → En proceso → Aprobado → Pagado</b> (o Rechazado), con <b>fecha</b>,
      <b>responsable</b> y <b>nota</b>. Se edita desde la ficha o con el botón <b>«Gestionar»</b>
      del Panel.</div></div>

    <div class="pn"><h2 style="font-size:15px">Botones útiles</h2>
      <div class="mu"><b>Calcular periodos</b>: rellena los periodos desde la fecha de ingreso
      (como el <code>DATEDIF</code> del Excel).<br>
      <b>Poner la base al día</b>: de golpe rellena los periodos vacíos, copia el <b>cargo</b>
      desde la Hoja 3 (el <code>BUSCARV</code> del Excel) y limpia valores inválidos. Nunca pisa
      lo escrito a mano.<br>
      <b>Constancia</b>: el PDF formal que se entrega al trabajador, con datos de la empresa y
      firmas.<br>
      <b>Comprobantes</b>: adjunta el comprobante del pago (se guarda cifrado en la bóveda).<br>
      <b>Historial</b>: auditoría de todo lo que se editó.<br>
      <b>Importar / Exportar</b>: lee tu <code>.xlsx</code> y devuelve un Excel real con las 3
      hojas.</div></div>

    <div class="pn"><h2 style="font-size:15px">El aviso del menú</h2>
      <div class="mu">Sobre el icono del reloj aparece un <b>número rojo</b> con los quinquenios
      vencidos sin gestionar: así sabes que hay trabajo pendiente <b>sin entrar</b>.</div></div>`
  },
  {
    id: 'excel', t: 'Excel y Drive', html: `
    <div class="pn"><h2 style="font-size:15px">Excel Online (Microsoft)</h2>
      <div class="mu">Para abrir tus hojas con el <b>Excel de Microsoft</b>, la app sube una copia
      a tu <b>OneDrive</b> y abre el enlace de Office. Necesita un <b>ID de cliente de Azure</b>
      (gratis, una sola vez): en <b>portal.azure.com</b> → <i>Microsoft Entra ID → Registros de
      aplicaciones → Nuevo registro</i>, tipo <b>Aplicación de página única (SPA)</b>, y en
      <i>URI de redirección</i> pon <code>TU-SITIO/ms-auth.html</code>. Pega el ID cuando la app
      te lo pida.</div>
      <div class="mu" style="margin-top:8px"><b>Sincronización automática:</b> lo que edites en
      Excel Online se trae solo a la bóveda <b>al volver a la app</b> (o con
      <b>«Traer de OneDrive»</b>).</div></div>

    <div class="pn"><h2 style="font-size:15px">Ver con Drive (Google)</h2>
      <div class="mu">Sube una copia <b>SIN CIFRAR</b> de ese documento a tu Drive para que el
      visor de Google lo muestre. Es opcional, documento por documento, y se puede borrar con
      <b>«Quitar de Drive»</b>.</div></div>

    <div class="pn"><h2 style="font-size:15px">Respaldos y sincronización</h2>
      <div class="mu">En <b>Ajustes</b> exportas un respaldo <b>cifrado</b> y puedes conectar tu
      <b>Google Drive</b> para ver lo mismo en el celular y la computadora. A Drive solo sube el
      archivo cifrado: Google no puede leerlo.</div></div>`
  },
  {
    id: 'ajustes', t: 'Ajustes', html: `
    <div class="pn"><h2 style="font-size:15px">Seguridad</h2>
      <div class="mu">Aquí cambias el <b>bloqueo automático</b> por inactividad y decides si este
      dispositivo <b>recuerda la llave</b> (para entrar con Google sin escribir la contraseña).
      Esa llave se guarda <b>no extraíble</b> y nunca se sube a Drive.</div></div>

    <div class="pn"><h2 style="font-size:15px">Respaldo</h2>
      <div class="mu"><b>Exportar respaldo</b> guarda un archivo cifrado con todo (documentos,
      datos, carpetas y papelera). <b>Importar respaldo</b> lo restaura o lo fusiona. Necesitarás
      la contraseña maestra.</div></div>

    <div class="pn"><h2 style="font-size:15px">Protección de datos</h2>
      <div class="mu">Pulsa <b>«Proteger almacenamiento»</b>: si el navegador está corto de
      espacio podría borrar la bóveda, y así se lo impides. Aun así, <b>exporta respaldos con
      frecuencia</b>.</div></div>

    <div class="pn"><h2 style="font-size:15px">Papelera</h2>
      <div class="mu"><b>Ver papelera</b> muestra lo que has borrado (30 días) para restaurarlo.
      <b>Borrar toda la bóveda</b> elimina todo sin vuelta atrás.</div></div>`
  },
  {
    id: 'trucos', t: 'Trucos', html: `
    <div class="pn"><h2 style="font-size:15px">Teclado</h2>
      <div class="mu"><b>Enter</b> guarda en cualquier formulario (en las áreas de texto,
      <b>Ctrl + Enter</b>).<br>
      <b>Ctrl + K</b> (o ⌘ + K) enfoca el buscador.<br>
      <b>/</b> también abre el buscador.</div></div>

    <div class="pn"><h2 style="font-size:15px">Deshacer</h2>
      <div class="mu">Al borrar un documento o dar de baja a un trabajador sale un aviso con
      <b>«Deshacer»</b>. Y todo lo borrado espera 30 días en la <b>papelera</b>.</div></div>

    <div class="pn"><h2 style="font-size:15px">Instálala como app</h2>
      <div class="mu">Desde el navegador puedes <b>añadirla a la pantalla de inicio</b> y usarla
      como una app normal, incluso <b>sin conexión</b>.</div></div>

    <div class="pn"><h2 style="font-size:15px">Sin conexión</h2>
      <div class="mu">La app funciona entera <b>offline</b>: el cascarón se guarda en caché y tus
      datos viven cifrados en el dispositivo. Solo necesitas internet para Drive y Excel
      Online.</div></div>`
  }
];

/**
 * Guía de uso (Ayuda). Se abre en la sección indicada; por defecto, la primera.
 * @param {string} [seccion] id de HELP_SECTIONS
 */
function helpDialog(seccion) {
  const sec = HELP_SECTIONS.find(s => s.id === seccion) || HELP_SECTIONS[0];
  openModal(`<h2>Cómo funciona ${APP_NAME}</h2>
  <div class="mu" style="margin-bottom:10px">Todo se guarda <b>cifrado</b> en este dispositivo. No hay servidores ni cuentas.</div>
  <div class="helptabs">
    ${HELP_SECTIONS.map(s => `<button class="helptab${s.id === sec.id ? ' on' : ''}" data-a="helps" data-s="${s.id}">${esc(s.t)}</button>`).join('')}
  </div>
  <div class="helpbody">${sec.html}</div>
  <div class="fx"><button class="btn p" data-a="close">Entendido</button></div>`, true);
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
