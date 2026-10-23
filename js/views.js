/* ==========================================================================
 * Bóveda · views.js
 * Vista «Mi bóveda» al estilo Keeper: carpetas expandibles, tres modos de
 * vista (lista / cuadrícula / compacta), favoritos, orden, filtro y panel
 * lateral de detalle.
 * ========================================================================== */
'use strict';

const SORT_LABELS = { name: 'Nombre', date: 'Fecha', size: 'Tamaño' };
const FILTER_LABELS = {
  all: 'Todos los registros',
  fav: 'Solo favoritos',
  img: 'Solo imágenes',
  pdf: 'Solo PDF'
};

/** Colores de las fichas; se elige uno estable a partir del nombre. */
const TILE_COLORS = ['#3b6cf6', '#e5337f', '#12a06a', '#f59f00', '#8b5cf6', '#0ea5e9', '#d92d20', '#0f766e'];

function tileColor(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}

/** ¿Pasa el documento la búsqueda y el filtro activos? */
function passesFilter(d) {
  if (d.cat === '_qx') return false;   // registro interno de la vista Quin/Adel
  const hay = ((d.name || '') + (d.notes || '') + (d.cat || '') + (d.file || '')).toLowerCase();
  if (qs && !hay.includes(qs)) return false;

  const f = prefs.showFilter || 'all';
  if (f === 'fav') return !!d.fav;
  if (f === 'img') return /^image\//.test(d.type || '');
  if (f === 'pdf') return /pdf/i.test(d.type || '') || /\.pdf$/i.test(d.file || '');
  return true;
}

/** Documentos filtrados y ordenados. */
function sortedDocs() {
  const l = docs.filter(passesFilter);
  const c = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
  const by = prefs.sortBy || 'name';
  if (by === 'date') l.sort((a, b) => b.date - a.date);
  else if (by === 'size') l.sort((a, b) => b.size - a.size);
  else l.sort((a, b) => c(a.name, b.name));
  return l;
}

/** Nombres de todas las carpetas: las de los documentos + las creadas vacías. */
function allFolderNames(list) {
  const s = new Set(folders);
  for (const d of list) {
    const k = d.cat || 'General';
    if (k !== '_qx') s.add(k);   // '_qx' es interna (base de Quin/Adel)
  }
  return Array.from(s).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
}

/** ¿La carpeta está expandida? (por defecto, todas abiertas). */
const isFolderOpen = name => !openFolders || openFolders.has(name);

function toggleFolder(name) {
  if (!openFolders) openFolders = new Set(allFolderNames(docs));
  if (openFolders.has(name)) openFolders.delete(name);
  else openFolders.add(name);
}

/* --------------------------- Vista principal --------------------------- */

function renderDocs() {
  const v = $('#view');
  const tot = docs.filter(d => d.cat !== '_qx').reduce((a, d) => a + d.size, 0);
  const list = sortedDocs();
  const mode = prefs.viewMode || 'list';
  const hayAlgo = list.length > 0 || folders.length > 0;   // las carpetas vacías también cuentan

  v.innerHTML = `
    <div class="vhead"><h1>Mi bóveda</h1></div>
    <div class="tools">
      <button class="sel" data-a="sortmenu">${ic('sort')}Ordenar: <b>${SORT_LABELS[prefs.sortBy] || 'Nombre'}</b></button>
      <button class="sel" data-a="filtermenu">${ic('filter')}Mostrar: <b>${FILTER_LABELS[prefs.showFilter] || 'Todos los registros'}</b></button>
      <button class="sel" data-a="newfolder">${ic('plus')}Nueva carpeta</button>
      <div class="vtoggles">
        <button class="vt ${mode === 'list' ? 'on' : ''}" data-a="vm" data-m="list" title="Lista">${ic('list')}</button>
        <button class="vt ${mode === 'grid' ? 'on' : ''}" data-a="vm" data-m="grid" title="Cuadrícula">${ic('grid')}</button>
        <button class="vt ${mode === 'rows' ? 'on' : ''}" data-a="vm" data-m="rows" title="Compacta">${ic('rows')}</button>
      </div>
    </div>
    ${hayAlgo
      ? (mode === 'grid' && list.length ? gridHtml(list) : treeHtml(list, mode === 'rows'))
      : emptyHtml()}
    <div class="mu" style="margin-top:14px">${docs.filter(d => d.cat !== '_qx').length} archivo${docs.filter(d => d.cat !== '_qx').length === 1 ? '' : 's'} · ${fmt(tot)} · cifrados${qs ? ' · buscando «' + esc(qs) + '»' : ''}</div>`;

  thumbnails(list);
}

function emptyHtml() {
  if (docs.length) {
    return `<div class="empty">${ic('search')}<br>Sin resultados.<br>Prueba a cambiar el filtro o la búsqueda.</div>`;
  }
  return `<div class="empty">${ic('file')}<br>Tu bóveda está vacía.<br>Toca <b>Escanear</b> o <b>+</b> para guardar tu primer documento.</div>`;
}

/** Árbol de carpetas (categorías) con sus documentos dentro. */
function treeHtml(list, compact) {
  const groups = new Map();
  for (const d of list) {
    const k = d.cat || 'General';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  const keys = allFolderNames(list);   // incluye las carpetas creadas y vacías
  return `<div class="tree${compact ? ' compact' : ''}">` +
    keys.map(k => folderHtml(k, groups.get(k) || [])).join('') + `</div>`;
}

function folderHtml(name, items) {
  const open = isFolderOpen(name);
  const bytes = items.reduce((a, d) => a + d.size, 0);
  const info = items.length
    ? `${items.length} archivo${items.length === 1 ? '' : 's'} · ${fmt(bytes)}`
    : 'Carpeta vacía';
  const protegida = name === 'General';
  return `<div class="fld ${open ? 'open' : ''}" data-a="fold" data-f="${esc(name)}">
      <span class="car">${ic('chevron')}</span>
      <span class="tile" style="background:${tileColor(name)}">${ic('folder')}</span>
      <span class="nm"><b>${esc(name)}</b><span>${info}</span></span>
      <span class="fa">
        <button data-a="folderadd" data-f="${esc(name)}" title="Subir archivos a esta carpeta">${ic('up')}</button>
        <button data-a="folderren" data-f="${esc(name)}" title="Renombrar carpeta">${ic('ed')}</button>
        ${protegida ? '' : `<button class="d" data-a="folderdel" data-f="${esc(name)}" title="Eliminar carpeta">${ic('tr')}</button>`}
      </span>
    </div>` + (open
      ? (items.length
        ? items.map(docRowHtml).join('')
        : `<div class="fld-add" data-a="folderadd" data-f="${esc(name)}">${ic('up')}Subir archivos a «${esc(name)}»</div>`)
      : '');
}

function docRowHtml(d) {
  const t = d.fav ? 'Quitar de favoritos' : 'Marcar como favorito';
  return `<div class="row2" draggable="true" data-drag="doc" data-a="open" data-id="${d.id}">
    <span class="tile" data-th="${d.id}" style="background:${tileColor(d.cat || 'General')}">${esc(extOf(d))}</span>
    <span class="nm"><b>${esc(d.name)}</b><span>${esc(d.file || '')} · ${fmt(d.size)} · ${dateStr(d.date)}</span></span>
    <span class="qa">
      <button data-a="fav" data-id="${d.id}" class="${d.fav ? 'fav' : ''}" title="${t}">${ic(d.fav ? 'starOn' : 'star')}</button>
      <button data-a="share" data-id="${d.id}" title="Compartir">${ic('share')}</button>
      <button data-a="open" data-id="${d.id}" title="Abrir">${ic('more')}</button>
    </span>
  </div>`;
}

/** Modo cuadrícula (tarjetas). */
function gridHtml(list) {
  return `<div class="grid">` + list.map(d => `<div class="card">
    <div class="th" data-a="open" data-id="${d.id}" data-th="${d.id}"><span class="bd">${esc(extOf(d))}</span>${ic('file').replace('class="i"', 'class="i big"')}</div>
    <div class="ci"><b>${esc(d.name)}</b><div class="mu" style="margin-top:4px"><span class="tag">${esc(d.cat || 'General')}</span>${fmt(d.size)} · ${dateStr(d.date)}</div>${d.notes ? `<div class="mu" style="margin-top:4px">${esc(d.notes)}</div>` : ''}</div>
    <div class="acts">
      <button class="btn s" title="Abrir" data-a="open" data-id="${d.id}">${ic('eye')}</button>
      <button class="btn s" title="Compartir" data-a="share" data-id="${d.id}">${ic('share')}</button>
      <button class="btn s" title="Descargar" data-a="dl" data-id="${d.id}">${ic('dl')}</button>
      <button class="btn s" title="Editar" data-a="ed" data-id="${d.id}">${ic('ed')}</button>
      <button class="btn s d" title="Eliminar" data-a="rm" data-id="${d.id}">${ic('tr')}</button>
    </div></div>`).join('') + `</div>`;
}

/** Sustituye la ficha por una miniatura real en los documentos de imagen. */
function thumbnails(list) {
  list.filter(d => /^image\//.test(d.type || '')).forEach(async d => {
    try {
      const u = URL.createObjectURL(await getBlob(d));
      urls.push(u);
      const e = document.querySelector(`[data-th="${d.id}"]`);
      if (!e) return;
      e.innerHTML = e.classList.contains('th')
        ? `<span class="bd">${esc(extOf(d))}</span><img src="${u}" alt="">`
        : `<img src="${u}" alt="">`;
    } catch (x) { /* documento ilegible: se deja la ficha con la extensión */ }
  });
}

/* ------------------- Panel lateral de detalle (Keeper) ------------------ */

let drawerId = null;

/** Cierra el panel lateral. */
function closeDrawer() {
  const el = document.getElementById('drawer');
  if (el) el.remove();
  drawerId = null;
}

/**
 * Abre el panel lateral de un documento.
 * @param {string} id
 * @param {'preview'|'info'} [tab]
 */
async function openDocDrawer(id, tab) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  const activeTab = tab || 'preview';

  const preview = await previewBodyOrFallback(d);

  closeDrawer();
  const wrap = document.createElement('div');
  wrap.id = 'drawer';
  wrap.innerHTML = `<div class="backdrop" data-a="drawerclose"></div>
    <aside class="drawer">
      <div class="dh">
        <span class="tile" style="background:${tileColor(d.cat || 'General')}">${esc(extOf(d))}</span>
        <b>${esc(d.name)}</b>
        <button class="btn s" data-a="drawerclose" title="Cerrar">✕</button>
      </div>
      <div class="db">
        <div class="tabs">
          <button class="tab ${activeTab === 'preview' ? 'on' : ''}" data-a="dtab" data-t="preview">Vista previa</button>
          <button class="tab ${activeTab === 'info' ? 'on' : ''}" data-a="dtab" data-t="info">Detalles</button>
        </div>
        <div id="dbody">${activeTab === 'info' ? drawerInfoHtml(d) : `<div class="prev">${preview}</div>`}</div>
      </div>
      <div class="df">
        <button class="btn p" data-a="share" data-id="${d.id}">${ic('share')}Compartir</button>
        <button class="btn" data-a="dl" data-id="${d.id}">${ic('dl')}Descargar</button>
        <button class="btn" data-a="movedlg" data-id="${d.id}">${ic('folder')}Mover</button>
        <button class="btn" data-a="pdf" data-id="${d.id}">${ic('file')}PDF</button>
        <button class="btn" data-a="pr" data-id="${d.id}">${ic('pr')}Imprimir</button>
        <button class="btn" data-a="fav" data-id="${d.id}">${ic(d.fav ? 'starOn' : 'star')}${d.fav ? 'En favoritos' : 'Favorito'}</button>
        <button class="btn d" data-a="rm" data-id="${d.id}">${ic('tr')}Eliminar</button>
      </div>
    </aside>`;
  document.body.appendChild(wrap);
  drawerId = id;
}

/** Formulario editable de la pestaña «Detalles». */
function drawerInfoHtml(d) {
  const cats = Array.from(new Set(DEFAULT_CATS.concat(folders).concat(docs.map(x => x.cat).filter(c => c && c !== '_qx'))));
  return `
  <div class="f"><label>Nombre</label><input id="dn" value="${esc(d.name || '')}"></div>
  <div class="f"><label>Categoría (carpeta)</label><input id="dc" list="dclist" value="${esc(d.cat || 'General')}">
    <datalist id="dclist">${cats.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>
  <div class="f"><label>Notas</label><textarea id="dno" rows="3">${esc(d.notes || '')}</textarea></div>
  <div class="f"><label class="ck"><input type="checkbox" id="dfav"${d.fav ? ' checked' : ''}>Marcar como favorito</label></div>
  <div class="row"><div class="l">Archivo</div><div class="v">${esc(d.file || '—')}</div></div>
  <div class="row"><div class="l">Tipo</div><div class="v">${esc(d.type || '—')}</div></div>
  <div class="row"><div class="l">Tamaño</div><div class="v">${fmt(d.size)}</div></div>
  <div class="row"><div class="l">Guardado</div><div class="v">${dateStr(d.date)}</div></div>
  <div class="fx"><button class="btn" data-a="drawerclose">Cancelar</button><button class="btn p" data-a="dsave">${ic('ok')}Guardar</button></div>`;
}

/** Guarda los cambios hechos en el panel lateral. */
async function drawerSave() {
  const d = docs.find(x => x.id === drawerId);
  if (!d) return;
  d.name = $('#dn').value.trim() || d.file || 'Documento';
  d.cat = $('#dc').value.trim() || 'General';
  d.notes = $('#dno').value.trim();
  d.fav = $('#dfav').checked;
  await saveDoc(d);
  await load();
  toast('Cambios guardados ✅');
  openDocDrawer(d.id, 'info');
}

/* ------------------------ Orden, filtro y favoritos -------------------- */

function sortMenu() {
  openModal(`<h2>Ordenar por</h2>
  ${Object.keys(SORT_LABELS).map(k => `<button class="btn" data-a="setsort" data-k="${k}" style="justify-content:flex-start;width:100%;margin-bottom:8px">${prefs.sortBy === k ? ic('ok') : ic('sort')}${SORT_LABELS[k]}</button>`).join('')}
  <div class="fx"><button class="btn" data-a="close">Cerrar</button></div>`);
}

function filterMenu() {
  openModal(`<h2>Mostrar</h2>
  ${Object.keys(FILTER_LABELS).map(k => `<button class="btn" data-a="setfilter" data-k="${k}" style="justify-content:flex-start;width:100%;margin-bottom:8px">${prefs.showFilter === k ? ic('ok') : ic('filter')}${FILTER_LABELS[k]}</button>`).join('')}
  <div class="fx"><button class="btn" data-a="close">Cerrar</button></div>`);
}

function setSort(k) { prefs.sortBy = k; savePrefs(); closeModal(); render(); }
function setFilter(k) { prefs.showFilter = k; savePrefs(); closeModal(); render(); }
function setViewMode(m) { prefs.viewMode = m; savePrefs(); render(); }

/* ------------------------- Gestión de carpetas -------------------------- */

/** Diálogo para crear una carpeta nueva (puede quedar vacía). */
function newFolderDialog() {
  openModal(`<h2>Nueva carpeta</h2>
  <div class="mu" style="margin-bottom:12px">Las carpetas agrupan tus documentos. Puedes crear una vacía y subir archivos dentro después con el botón ⬆.</div>
  <div class="f"><label>Nombre de la carpeta</label><input id="nfname" placeholder="Ej: Contratos"></div>
  <div class="fx"><button class="btn" data-a="close">Cancelar</button><button class="btn p" id="nfok">${ic('ok')}Crear carpeta</button></div>`);
  const inp = $('#nfname');
  if (inp) {
    inp.focus();
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') createFolder(); });
  }
  $('#nfok').onclick = () => createFolder();
}

/** Crea la carpeta con el nombre escrito en el diálogo. */
async function createFolder() {
  const inp = $('#nfname');
  const name = inp ? inp.value.trim() : '';
  if (!name) return toast('Escribe un nombre para la carpeta');
  if (name === '_qx') return toast('Ese nombre está reservado');
  if (allFolderNames(docs).some(f => f.toLowerCase() === name.toLowerCase())) {
    return toast('Ya existe una carpeta con ese nombre');
  }
  folders.push(name);
  folders.sort((a, b) => a.localeCompare(b, 'es'));
  await saveFolders(folders);
  if (openFolders) openFolders.add(name);   // que la nueva aparezca abierta
  closeModal();
  render();
  toast('Carpeta «' + name + '» creada ✅');
}

/** Abre el selector de archivos para subirlos directamente a una carpeta. */
function pickIntoFolder(name) {
  pendingFolder = name;
  const i = $('#fi');
  if (i) { i.value = ''; i.click(); }
}

/** Diálogo para renombrar una carpeta (renombra también sus documentos). */
function renameFolderDialog(name) {
  openModal(`<h2>Renombrar carpeta</h2>
  <div class="mu" style="margin-bottom:12px">Se cambiará el nombre en los documentos que hay dentro de «${esc(name)}».</div>
  <div class="f"><label>Nuevo nombre</label><input id="rfname" value="${esc(name)}"></div>
  <div class="fx"><button class="btn" data-a="close">Cancelar</button><button class="btn p" id="rfok">${ic('ok')}Guardar</button></div>`);
  const inp = $('#rfname');
  if (inp) { inp.focus(); inp.select(); }
  $('#rfok').onclick = () => renameFolder(name, inp ? inp.value.trim() : '');
}

async function renameFolder(oldName, newName) {
  if (!newName) return toast('Escribe un nombre');
  if (newName === oldName) return closeModal();
  if (newName === '_qx') return toast('Ese nombre está reservado');
  if (allFolderNames(docs).some(f => f.toLowerCase() === newName.toLowerCase())) {
    return toast('Ya existe una carpeta con ese nombre');
  }
  folders = folders.map(f => (f === oldName ? newName : f));
  await saveFolders(folders);
  if (openFolders && openFolders.has(oldName)) { openFolders.delete(oldName); openFolders.add(newName); }
  for (const d of docs) {
    if ((d.cat || 'General') === oldName) { d.cat = newName; await saveDoc(d); }
  }
  closeModal();
  await load();
  toast('Carpeta renombrada ✅');
}

/** Elimina una carpeta; sus documentos se mueven a «General». */
async function deleteFolder(name) {
  if (name === 'General') return toast('La carpeta «General» no se puede eliminar');
  const items = docs.filter(d => (d.cat || 'General') === name);
  const msg = items.length
    ? `«${name}» tiene ${items.length} documento${items.length === 1 ? '' : 's'}. Se moverán a la carpeta «General» y se eliminará la carpeta.`
    : `¿Eliminar la carpeta «${name}»?`;
  if (!await confirmDialog('Eliminar carpeta', msg, 'Eliminar')) return;
  folders = folders.filter(f => f !== name);
  await saveFolders(folders);
  if (openFolders) openFolders.delete(name);
  for (const d of items) { d.cat = 'General'; await saveDoc(d); }
  await load();
  toast('Carpeta eliminada');
}

/** Marca o desmarca un documento como favorito. */
async function toggleFavorite(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  d.fav = !d.fav;
  await saveDoc(d);
  await load();
  toast(d.fav ? 'Añadido a favoritos ★' : 'Quitado de favoritos');
  if (drawerId === id) openDocDrawer(id, 'preview');
}

/** Selector de documento para compartir (botón del riel). */
function sharePicker() {
  if (!docs.length) return toast('Todavía no tienes documentos');
  openModal(`<h2>Compartir un documento</h2>
  <div class="mu" style="margin-bottom:12px">Elige cuál quieres compartir.</div>
  <div style="max-height:52vh;overflow:auto">
    ${docs.filter(d => d.cat !== '_qx').map(d => `<div class="row2" data-a="share" data-id="${d.id}" style="padding-left:12px;border-radius:10px">
      <span class="tile" style="background:${tileColor(d.cat || 'General')}">${esc(extOf(d))}</span>
      <span class="nm"><b>${esc(d.name)}</b><span>${esc(d.cat || 'General')} · ${fmt(d.size)}</span></span>
      ${ic('share')}
    </div>`).join('')}
  </div>
  <div class="fx"><button class="btn" data-a="close">Cancelar</button></div>`);
}

/* -------------------- Arrastrar y soltar archivos ---------------------- */

/** Guarda una lista de archivos dentro de una carpeta (o en «General»). */
async function addFilesToFolder(name, files) {
  const cat = name || 'General';
  let n = 0;
  for (const f of files) {
    try {
      await saveDoc({
        id: uid(), date: Date.now(),
        name: baseName(f.name), cat, notes: '',
        file: f.name, type: f.type || 'application/octet-stream', _b: f
      });
      n++;
    } catch (e) { /* archivo ilegible: se ignora */ }
  }
  if (!n) return toast('No se pudo guardar ningún archivo');
  if (openFolders) openFolders.add(cat);   // que la carpeta quede abierta
  await load();
  toast(n + ' archivo' + (n === 1 ? '' : 's') + ' guardado' + (n === 1 ? '' : 's') + ' en «' + cat + '» ✅');
}

/**
 * Arrastrar y soltar sobre una carpeta:
 *   • archivos del sistema   -> se GUARDAN en esa carpeta
 *   • un documento de la app -> se MUEVE a esa carpeta
 */
let draggedDocId = null;   // documento que se arrastra dentro de la propia app

(function initFolderDrop() {
  const carpetaDe = el => (el && el.closest) ? el.closest('.fld') : null;

  /* Empezar a arrastrar un documento de la lista. */
  document.addEventListener('dragstart', e => {
    const row = (e.target && e.target.closest) ? e.target.closest('[data-drag="doc"]') : null;
    if (!row) return;
    draggedDocId = row.dataset.id;
    row.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', draggedDocId); } catch (x) { }
    }
  });

  document.addEventListener('dragend', () => {
    draggedDocId = null;
    $$('.row2.dragging').forEach(r => r.classList.remove('dragging'));
    $$('.fld.drop').forEach(f => f.classList.remove('drop'));
  });

  document.addEventListener('dragover', e => {
    if (view !== 'docs') return;
    const f = carpetaDe(e.target);
    if (!f) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = draggedDocId ? 'move' : 'copy';
    $$('.fld.drop').forEach(x => { if (x !== f) x.classList.remove('drop'); });
    f.classList.add('drop');
  });

  document.addEventListener('dragleave', e => {
    const f = carpetaDe(e.target);
    if (f) f.classList.remove('drop');
  });

  document.addEventListener('drop', async e => {
    if (view !== 'docs') return;
    const f = carpetaDe(e.target);
    if (!f) return;
    e.preventDefault();
    f.classList.remove('drop');

    /* 1) Un documento de la bóveda -> mover de carpeta. */
    if (draggedDocId) {
      const id = draggedDocId;
      draggedDocId = null;
      await moveDocToFolder(id, f.dataset.f);
      return;
    }

    /* 2) Archivos del sistema -> guardarlos en esa carpeta. */
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (!files.length) return;
    await addFilesToFolder(f.dataset.f, files);
  });
})();

/** Mueve un documento a otra carpeta (cambia su categoría). */
async function moveDocToFolder(id, folder) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  const actual = d.cat || 'General';
  if (actual === folder) return toast('«' + d.name + '» ya está en «' + folder + '»');
  d.cat = folder;
  await saveDoc(d);
  if (openFolders) openFolders.add(folder);   // que la carpeta destino quede abierta
  await load();
  toast('Movido a «' + folder + '» ✅');
}

/** Diálogo para mover un documento a otra carpeta (útil en el móvil). */
function moveDocDialog(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  const actual = d.cat || 'General';
  const otras = allFolderNames(docs).filter(f => f !== actual);
  if (!otras.length) return toast('No hay otras carpetas. Crea una con «Nueva carpeta».');
  openModal(`<h2>Mover a otra carpeta</h2>
  <div class="mu" style="margin-bottom:12px">«${esc(d.name)}» está en <b>${esc(actual)}</b>. Elige la carpeta de destino:</div>
  <div style="display:grid;gap:8px;max-height:52vh;overflow:auto">
    ${otras.map(f => `<button class="btn" data-a="moveto" data-id="${esc(d.id)}" data-f="${esc(f)}" style="justify-content:flex-start">${ic('folder')}${esc(f)}</button>`).join('')}
  </div>
  <div class="fx"><button class="btn" data-a="close">Cancelar</button></div>`);
}

/** Acción: mover el documento a la carpeta elegida en el diálogo. */
async function moveDocFromDialog(id, folder) {
  closeModal();
  await moveDocToFolder(id, folder);
}
