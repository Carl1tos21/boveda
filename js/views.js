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

/** ¿La carpeta está expandida? (por defecto, todas abiertas). */
const isFolderOpen = name => !openFolders || openFolders.has(name);

function toggleFolder(name) {
  if (!openFolders) openFolders = new Set(docs.map(d => d.cat || 'General'));
  if (openFolders.has(name)) openFolders.delete(name);
  else openFolders.add(name);
}

/* --------------------------- Vista principal --------------------------- */

function renderDocs() {
  const v = $('#view');
  const tot = docs.reduce((a, d) => a + d.size, 0);
  const list = sortedDocs();
  const mode = prefs.viewMode || 'list';

  v.innerHTML = `
    <div class="vhead"><h1>Mi bóveda</h1></div>
    <div class="tools">
      <button class="sel" data-a="sortmenu">${ic('sort')}Ordenar: <b>${SORT_LABELS[prefs.sortBy] || 'Nombre'}</b></button>
      <button class="sel" data-a="filtermenu">${ic('filter')}Mostrar: <b>${FILTER_LABELS[prefs.showFilter] || 'Todos los registros'}</b></button>
      <div class="vtoggles">
        <button class="vt ${mode === 'list' ? 'on' : ''}" data-a="vm" data-m="list" title="Lista">${ic('list')}</button>
        <button class="vt ${mode === 'grid' ? 'on' : ''}" data-a="vm" data-m="grid" title="Cuadrícula">${ic('grid')}</button>
        <button class="vt ${mode === 'rows' ? 'on' : ''}" data-a="vm" data-m="rows" title="Compacta">${ic('rows')}</button>
      </div>
    </div>
    ${list.length ? (mode === 'grid' ? gridHtml(list) : treeHtml(list, mode === 'rows')) : emptyHtml()}
    <div class="mu" style="margin-top:14px">${docs.length} archivo${docs.length === 1 ? '' : 's'} · ${fmt(tot)} · cifrados${qs ? ' · buscando «' + esc(qs) + '»' : ''}</div>`;

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
  const keys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, 'es'));
  return `<div class="tree${compact ? ' compact' : ''}">` +
    keys.map(k => folderHtml(k, groups.get(k))).join('') + `</div>`;
}

function folderHtml(name, items) {
  const open = isFolderOpen(name);
  const bytes = items.reduce((a, d) => a + d.size, 0);
  return `<div class="fld ${open ? 'open' : ''}" data-a="fold" data-f="${esc(name)}">
      <span class="car">${ic('chevron')}</span>
      <span class="tile" style="background:${tileColor(name)}">${ic('folder')}</span>
      <span class="nm"><b>${esc(name)}</b><span>${items.length} archivo${items.length === 1 ? '' : 's'} · ${fmt(bytes)}</span></span>
    </div>` + (open ? items.map(docRowHtml).join('') : '');
}

function docRowHtml(d) {
  const t = d.fav ? 'Quitar de favoritos' : 'Marcar como favorito';
  return `<div class="row2" data-a="open" data-id="${d.id}">
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

  let preview = `<div class="empty" style="border:0;padding:30px">${ic('file')}<br>Sin vista previa.<br>Usa <b>Descargar</b> para abrirlo.</div>`;
  try {
    const b = await getBlob(d);
    if (/^image\//.test(d.type || '')) {
      const u = URL.createObjectURL(b); murls.push(u);
      preview = `<img src="${u}" alt="">`;
    } else if (/pdf/i.test(d.type || '') || /\.pdf$/i.test(d.file || '')) {
      const u = URL.createObjectURL(b); murls.push(u);
      preview = `<iframe src="${u}" title="PDF"></iframe>`;
    } else if (/^text\//.test(d.type || '')) {
      preview = `<div style="white-space:pre-wrap;text-align:left;padding:14px;width:100%;overflow:auto">${esc(await b.text())}</div>`;
    }
  } catch (e) { }

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
  const cats = Array.from(new Set(DEFAULT_CATS.concat(docs.map(x => x.cat).filter(Boolean))));
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
    ${docs.map(d => `<div class="row2" data-a="share" data-id="${d.id}" style="padding-left:12px;border-radius:10px">
      <span class="tile" style="background:${tileColor(d.cat || 'General')}">${esc(extOf(d))}</span>
      <span class="nm"><b>${esc(d.name)}</b><span>${esc(d.cat || 'General')} · ${fmt(d.size)}</span></span>
      ${ic('share')}
    </div>`).join('')}
  </div>
  <div class="fx"><button class="btn" data-a="close">Cancelar</button></div>`);
}
