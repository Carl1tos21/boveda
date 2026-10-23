/* ==========================================================================
 * Bóveda · app.js
 * Punto de entrada: mapa de acciones, delegación de eventos y arranque.
 * ========================================================================== */
'use strict';

/**
 * Acciones declaradas en el HTML mediante data-a="...".
 * La delegación de eventos evita reasignar listeners al repintar las vistas.
 */
const ACTIONS = {
  /* Documentos */
  new: () => openAddMenu(),
  pick: el => { const i = $('#' + el.dataset.src); if (i) { i.value = ''; i.click(); } },
  view: el => viewDoc(el.dataset.id),
  open: el => openDocDrawer(el.dataset.id),
  dl: el => dlDoc(el.dataset.id),
  pr: el => printDoc(el.dataset.id),
  ed: el => editDoc(el.dataset.id),
  rm: el => removeDoc(el.dataset.id),
  pdf: el => pdfDoc(el.dataset.id),
  movedlg: el => moveDocDialog(el.dataset.id),
  moveto: el => moveDocFromDialog(el.dataset.id, el.dataset.f),
  pvsheet: el => pvSheet(el.dataset.s),

  /* Compartir */
  share: el => shareDoc(el.dataset.id),
  sharepick: () => sharePicker(),
  shnative: () => shNative(),
  shwa: () => shWhatsApp(),
  shgm: () => shGmail(),
  shml: () => shMail(),
  shcopy: () => shCopy(),
  shdl: () => shDownload(),

  /* Lista tipo Keeper */
  fold: el => { toggleFolder(el.dataset.f); render(); },
  newfolder: () => newFolderDialog(),
  folderadd: el => pickIntoFolder(el.dataset.f),
  folderren: el => renameFolderDialog(el.dataset.f),
  folderdel: el => deleteFolder(el.dataset.f),
  fav: el => toggleFavorite(el.dataset.id),
  vm: el => setViewMode(el.dataset.m),
  sortmenu: () => sortMenu(),
  filtermenu: () => filterMenu(),
  setsort: el => setSort(el.dataset.k),
  setfilter: el => setFilter(el.dataset.k),

  /* Panel lateral */
  drawerclose: () => closeDrawer(),
  dtab: el => openDocDrawer(drawerId, el.dataset.t),
  dsave: () => drawerSave(),

  /* Ayuda y cuenta */
  help: () => helpDialog(),
  privacy: () => privacyDialog(),
  whomenu: () => { view = 'set'; render(); },

  /* Datos personales */
  inadd: () => infoForm(null),
  inedit: el => infoForm(info.find(i => i.id === el.dataset.id)),
  inrm: el => removeInfo(el.dataset.id),
  incopy: el => copyInfo(el.dataset.id),

  /* Sesión y ajustes */
  lockn: () => lockNow(),
  chpw: () => changePwDialog(),
  exp: () => exportBackup(),
  imp: () => { const i = $('#imp'); if (i) { i.value = ''; i.click(); } },
  wipe: () => wipeAll(),
  forgetdev: () => forgetDevice(),

  /* Pantalla de bloqueo */
  glogin: () => (mode === 'setup' ? googleFetchVault() : googleUnlock()),
  showpw: () => usePasswordInstead(),

  /* Sincronización con Google Drive */
  gconnect: () => driveConnect(),
  gsync: () => driveSyncManual(),
  gdisconnect: () => driveDisconnect(),
  gsaveid: () => saveDriveIdFromForm(),

  /* Modales */
  close: () => closeModal(),

  /* Escáner */
  scan: () => openScan(),
  scanclose: () => closeScan(),
  scancrop: el => scanCrop(Number(el.dataset.i)),
  scandel: el => scanDel(Number(el.dataset.i)),
  scancancel: () => scanCancel(),
  scanapply: () => scanApply(),
  scanrot: () => scanRotate(),
  scansave: () => scanSave(),

  /* Quinquenios y Adelantos */
  qximport: () => QxActions.qximport(),
  qximportfile: () => QxActions.qximportfile(),
  qxmapconfirm: () => QxActions.qxmapconfirm(),
  qxmapback: () => QxActions.qxmapback(),
  qxseed: () => QxActions.qxseed(),
  qxcat: el => QxActions.qxcat(el),
  qxback: () => QxActions.qxback(),
  qxficha: el => QxActions.qxficha(el),
  qxsearch: () => QxActions.qxsearch(),
  qxfec: () => QxActions.qxfec(),
  qxprint: el => QxActions.qxprint(el),
  qxprintall: () => QxActions.qxprintall(),
  qxexport: () => QxActions.qxexport(),
  /* Hojas de cálculo del Excel (MACRO · Hoja 1 · Hoja 3) */
  qxsheet: el => QxActions.qxsheet(el),
  qxadd: () => QxActions.qxadd(),
  qxaddconfirm: () => QxActions.qxaddconfirm(),
  qxdelrow: el => QxActions.qxdelrow(el),
  qxpage: el => QxActions.qxpage(el),
  qxpagesize: el => QxActions.qxpagesize(el),
  qxfilter: () => QxActions.qxfilter(),
  qxreload: () => QxActions.qxreload(),
  qxexportxlsx: () => QxActions.qxexportxlsx()
};

/* --------------------- Delegación de eventos --------------------------- */
document.addEventListener('click', e => {
  const el = e.target.closest ? e.target.closest('[data-v],[data-a],[data-c]') : null;
  if (!el) return;

  // Navegación entre vistas.
  if (el.dataset.v) { view = el.dataset.v; render(); return; }

  // Filtro por categoría (chips de la vista de documentos).
  if (el.classList.contains('chip') && el.hasAttribute('data-c')) { cat = el.dataset.c; render(); return; }

  const a = el.dataset.a;
  const fn = a && ACTIONS[a];
  if (fn) { e.preventDefault(); fn(el); }
});

/* --------------------- Entradas de archivo ----------------------------- */
['fi', 'cam', 'gal'].forEach(id => {
  const inp = document.getElementById(id);
  if (!inp) return;
  inp.addEventListener('change', e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';                       // permite volver a elegir el mismo archivo
    if (!files.length) return;
    if (scan.active) files.forEach(f => scanAdd(f));
    else handleFiles(files);
  });
});

(() => {
  const imp = $('#imp');
  if (!imp) return;
  imp.addEventListener('change', e => {
    const f = (e.target.files || [])[0];
    e.target.value = '';
    if (f) importBackup(f);
  });
})();

/* ------------- Almacenamiento, PWA e instalación en el móvil ----------- */

/**
 * Pide al navegador almacenamiento persistente. Sin esto, si al dispositivo
 * le falta espacio, el navegador puede borrar la bóveda sin avisar.
 * @returns {Promise<boolean|null>} true/false, o null si no se pudo saber.
 */
async function requestPersistence() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (e) { return null; }
}

/** Estado del almacenamiento (para la vista de Ajustes). */
async function storageState() {
  const out = { persistent: null, usage: 0, quota: 0 };
  try {
    if (navigator.storage && navigator.storage.persisted) {
      out.persistent = await navigator.storage.persisted();
    }
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      out.usage = est.usage || 0;
      out.quota = est.quota || 0;
    }
  } catch (e) { }
  return out;
}

/** Registra el service worker: app instalable y uso sin conexión. */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;   // al abrir desde el disco no aplica
  const go = () => navigator.serviceWorker.register('sw.js').catch(() => { });
  // Si el documento ya terminó de cargar, el evento 'load' no volverá a dispararse.
  if (document.readyState === 'complete') go();
  else addEventListener('load', go, { once: true });
}

/** ¿Está abierta como app instalada (pantalla completa)? */
const isStandalone = () =>
  !!navigator.standalone || matchMedia('(display-mode: standalone)').matches;

/**
 * Aviso en iPhone/iPad: Safari borra el almacenamiento de una web tras 7 días
 * sin visitarla. Añadirla a la pantalla de inicio la exime. Es la diferencia
 * entre conservar la bóveda o perderla, así que se avisa la primera vez.
 */
function maybeShowInstallHint() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (!ios || isStandalone() || prefs.hideIosHint) return;

  openModal(`<h2>Guarda la app en tu iPhone</h2>
  <div class="mu" style="margin-bottom:12px">Es importante: Safari borra los datos de una página web si pasan <b>7 días sin abrirla</b>. Si la añades a la pantalla de inicio, tus documentos quedan protegidos y la app abre a pantalla completa.</div>
  <div class="pn" style="margin:0 0 4px">
    <div class="row" style="margin:0 0 8px"><div class="l">1</div><div class="v">Toca <b>Compartir</b> en Safari (el cuadro con la flecha ↑)</div></div>
    <div class="row" style="margin:0 0 8px"><div class="l">2</div><div class="v">Elige <b>Añadir a pantalla de inicio</b></div></div>
    <div class="row" style="margin:0"><div class="l">3</div><div class="v">Ábrela desde ese icono, no desde Safari</div></div>
  </div>
  <div class="fx"><button class="btn" id="iosno">No volver a mostrar</button><button class="btn p" data-a="close">Entendido</button></div>`);

  const b = $('#iosno');
  if (b) b.onclick = () => { prefs.hideIosHint = true; savePrefs(); closeModal(); };
}

/* --------------------------- Arranque ---------------------------------- */
(async function init() {
  loadPrefs();
  applyTheme();
  chrome();
  registerSW();
  paintLock();          // pantalla de bloqueo visible ya, sin esperar a IndexedDB

  // Pantalla de bloqueo.
  $('#lb').onclick = submit;
  ['#lp', '#lp2'].forEach(sel => {
    const el = $(sel);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  });

  // Reaplica el tema si cambia la preferencia del sistema.
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) { }

  await initStore();
  await showLock();

  // App instalable + datos a salvo de limpiezas automáticas del navegador.
  registerSW();
  requestPersistence();

  // Handle de depuración: expone el estado para las pruebas y la consola.
  window.Boveda = {
    get state() {
      return {
        view, qs, mem, unlocked: !!key, dbReady: !!db, docs, info, prefs, scan,
        drawer: drawerId,
        drive: { ready: gdriveReady(), connected: driveConnected() }
      };
    }
  };
})();
