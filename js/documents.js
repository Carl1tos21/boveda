/* ==========================================================================
 * Bóveda · documents.js
 * Alta, edición, visor, descarga, impresión y borrado de documentos.
 * ========================================================================== */
'use strict';

/** Menú de origen al pulsar "Agregar". */
function openAddMenu() {
  openModal(`<h2>Agregar documento</h2>
  <div class="mu" style="margin-bottom:14px">Elige de dónde tomar el documento</div>
  <div style="display:grid;gap:10px">
    <button class="btn" data-a="pick" data-src="fi" style="justify-content:flex-start">${ic('up')}Subir archivo (PDF, imagen, Word, Excel, texto)</button>
    <button class="btn" data-a="pick" data-src="cam" style="justify-content:flex-start">${ic('cam')}Tomar foto con la cámara</button>
    <button class="btn" data-a="pick" data-src="gal" style="justify-content:flex-start">${ic('eye')}Elegir de la galería</button>
    <button class="btn" data-a="scan" style="justify-content:flex-start">${ic('scan')}Escanear varias páginas</button>
    <button class="btn" data-a="newfolder" style="justify-content:flex-start">${ic('folder')}Crear una carpeta</button>
  </div>
  <div class="fx"><button class="btn" data-a="close">Cancelar</button></div>`);
}

/** Procesa los archivos elegidos en las entradas ocultas. */
async function handleFiles(files) {
  const arr = Array.from(files);
  if (!arr.length) return;

  const cat = pendingFolder || 'General';   // carpeta elegida con «subir a esta carpeta»
  pendingFolder = null;

  if (arr.length > 1) {
    // Varios archivos: se guardan con metadatos por defecto en la carpeta elegida.
    for (const f of arr) {
      await saveDoc({
        id: uid(), date: Date.now(),
        name: baseName(f.name), cat, notes: '',
        file: f.name, type: f.type || 'application/octet-stream', _b: f
      });
    }
    await load();
    toast(arr.length + ' documentos agregados ✅');
    return;
  }

  const f = arr[0];
  docForm({
    name: baseName(f.name), cat, notes: '',
    file: f.name, type: f.type || 'application/octet-stream', _b: f
  }, true);
}

/** Formulario de metadatos (alta y edición). */
function docForm(d, isNew) {
  const cats = Array.from(new Set(DEFAULT_CATS.concat(folders).concat(docs.map(x => x.cat).filter(c => c && c !== '_qx'))));
  const sizeTxt = d._b ? fmt(d._b.size) : (d.size ? fmt(d.size) : '');

  openModal(`<h2>${isNew ? 'Nuevo documento' : 'Editar documento'}</h2>
  <div class="f"><label>Nombre</label><input id="fn" value="${esc(d.name || '')}"></div>
  <div class="f"><label>Categoría</label><input id="fc" list="catlist" value="${esc(d.cat || 'General')}">
    <datalist id="catlist">${cats.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>
  <div class="f"><label>Notas</label><textarea id="fno" rows="3">${esc(d.notes || '')}</textarea></div>
  <div class="mu">${esc(d.file || '')}${sizeTxt ? ' · ' + sizeTxt : ''}</div>
  <div class="fx"><button class="btn" data-a="close">Cancelar</button><button class="btn p" id="fok">${ic('ok')}Guardar</button></div>`);

  $('#fok').onclick = async () => {
    const name = $('#fn').value.trim() || d.file || 'Documento';
    const category = $('#fc').value.trim() || 'General';
    const notes = $('#fno').value.trim();

    if (isNew) {
      const nd = { id: uid(), date: Date.now(), name, cat: category, notes, file: d.file, type: d.type, _b: d._b };
      await saveDoc(nd, key, true);
      closeModal();
      await load();
      toast('Documento guardado ✅');
    } else {
      const o = docs.find(x => x.id === d.id);
      if (!o) return;
      Object.assign(o, { name, cat: category, notes });
      await saveDoc(o);
      closeModal();
      await load();
      toast('Cambios guardados ✅');
    }
  };
}

/** Abre el visor de un documento (imagen, PDF, texto, hoja de cálculo, Office…). */
async function viewDoc(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  const body = await previewBodyOrFallback(d);

  openModal(`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px">
      <div style="min-width:0"><b style="display:block;word-break:break-word">${esc(d.name)}</b>
      <div class="mu"><span class="tag">${esc(d.cat || 'General')}</span>${fmt(d.size)} · ${dateStr(d.date)}</div></div>
      <button class="btn s" data-a="close" title="Cerrar">✕</button>
    </div>
    <div class="view">${body}</div>
    <div class="fx">
      <div class="mu" style="flex:1;text-align:left;align-self:center">
        ${d.notes ? esc(d.notes) + ' · ' : ''}Descargar conserva tu archivo original (${esc(extOf(d))})
      </div>
      ${isSheet(d)
        ? `<button class="btn p" data-a="xlsonline" data-id="${d.id}">${ic('cloud')}Excel Online</button>
           <button class="btn" data-a="xlsopen" data-id="${d.id}">${ic('dl')}Abrir en Excel</button>`
        : `<button class="btn" data-a="dl" data-id="${d.id}">${ic('dl')}Descargar ${esc(extOf(d))}</button>`}
      <button class="btn" data-a="drvview" data-id="${d.id}">${ic('cloud')}Ver con Drive</button>
      <button class="btn" data-a="pdf" data-id="${d.id}">${ic('file')}Guardar como PDF</button>
      <button class="btn" data-a="pr" data-id="${d.id}">${ic('pr')}Imprimir</button>
      <button class="btn${isSheet(d) ? '' : ' p'}" data-a="ed" data-id="${d.id}">${ic('ed')}Editar</button>
    </div>`, true);
}

/** Edita los metadatos de un documento existente. */
function editDoc(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  closeDrawer();
  docForm(d, false);
}

/** Descarga el documento descifrado con su nombre original. */
async function dlDoc(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  try {
    download(await getBlob(d), d.file || d.name);
  } catch (e) { toast('No se pudo descargar'); }
}

/** Abre el documento en una pestaña y lanza el diálogo de impresión. */
async function printDoc(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  try {
    const b = await getBlob(d);
    const u = URL.createObjectURL(b);
    const w = window.open(u, '_blank');
    if (!w) { URL.revokeObjectURL(u); return toast('Permite las ventanas emergentes para imprimir'); }
    if (/^image\//.test(d.type)) {
      w.onload = () => { try { w.focus(); w.print(); } catch (e) { } };
    } else {
      setTimeout(() => { try { w.focus(); w.print(); } catch (e) { } }, 900);
    }
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  } catch (e) { toast('No se pudo imprimir'); }
}

/** Elimina un documento previa confirmación. */
async function removeDoc(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  if (!await confirmDialog('Eliminar documento', `¿Eliminar «${d.name}»? Esta acción no se puede deshacer.`)) return;
  if (d.driveId) driveDeleteOriginal(d);   // borra también la copia sin cifrar de Drive
  await del('docs', id);
  closeDrawer();
  await load();
  toast('Documento eliminado');
}

/* ======================== Vista previa de archivos ====================== */

/**
 * ¿Qué tipo de vista previa corresponde a este documento?
 * Se mira el MIME y, si falta, la extensión del nombre.
 */
function previewKind(d) {
  const t = String(d.type || '').toLowerCase();
  const name = String(d.file || d.name || '').toLowerCase();
  const ext = (name.match(/\.([a-z0-9]+)$/) || [, ''])[1];
  const inList = arr => arr.indexOf(ext) >= 0;

  if (/^image\//.test(t) || inList(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'])) return 'image';
  if (/^video\//.test(t) || inList(['mp4', 'webm', 'ogv', 'mov', 'm4v'])) return 'video';
  if (/^audio\//.test(t) || inList(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac'])) return 'audio';
  if (/pdf/.test(t) || ext === 'pdf') return 'pdf';
  if (inList(['xlsx', 'xlsm', 'xlsb', 'xls', 'ods', 'csv', 'tsv']) || /spreadsheet|ms-excel|csv/.test(t)) return 'sheet';
  if (inList(['docx', 'pptx', 'odt', 'odp'])) return 'office';
  if (/^text\//.test(t) || inList(['txt', 'md', 'markdown', 'json', 'xml', 'log', 'yml', 'yaml', 'ini', 'conf', 'rtf', 'js', 'css', 'html', 'htm', 'sql', 'py'])) return 'text';
  return 'none';
}

/** URL de objeto viva durante el modal/panel (se libera al cerrar). */
function pvURL(blob) {
  const u = URL.createObjectURL(blob);
  murls.push(u);
  return u;
}

/** Cuerpo HTML de la vista previa, o null si el formato no se puede mostrar. */
async function previewBody(d) {
  const kind = previewKind(d);
  if (kind === 'none') return null;
  const b = await getBlob(d);

  if (kind === 'image') return `<img src="${pvURL(b)}" alt="">`;
  if (kind === 'video') return `<video src="${pvURL(b)}" controls playsinline preload="metadata"></video>`;
  if (kind === 'audio') return `<div class="pvaudio"><audio src="${pvURL(b)}" controls preload="metadata"></audio></div>`;
  if (kind === 'pdf') return `<iframe src="${pvURL(b)}" title="PDF"></iframe>`;
  if (kind === 'text') return `<div class="pvtext">${esc((await b.text()).slice(0, 300000))}</div>`;
  if (kind === 'sheet') return await sheetPreviewHtml(b);
  if (kind === 'office') return await officePreviewHtml(b, d);
  return null;
}

/** Igual que previewBody, pero con el aviso de «no disponible» si falla. */
async function previewBodyOrFallback(d) {
  try {
    const html = await previewBody(d);
    if (html) return html;
  } catch (e) { /* formato no soportado o archivo dañado: se avisa abajo */ }
  return `<div class="empty">${ic('file')}<br>Vista previa no disponible para este formato.<br>Usa <b>Descargar</b> para abrirlo.</div>`;
}

/* -------------------- Hojas de cálculo (Excel / CSV) -------------------- */

/** Vista previa de un libro de Excel/CSV, con una pestaña por hoja. */
async function sheetPreviewHtml(blob) {
  if (!window.XLSX) return null;
  const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array', cellDates: true });
  const names = (wb.SheetNames || []).slice(0, 10);
  if (!names.length) return null;

  const tabs = names.map((n, i) =>
    `<button class="pvt${i === 0 ? ' on' : ''}" data-a="pvsheet" data-s="${esc(n)}">${esc(n)}</button>`).join('');
  const panes = names.map((n, i) =>
    `<div class="pvs"${i === 0 ? '' : ' hidden'} data-pv="${esc(n)}">${sheetTableHtml(wb.Sheets[n])}</div>`).join('');

  return `<div class="pvw"><div class="pvtabs">${tabs}</div>${panes}</div>`;
}

/** Tabla HTML de una hoja (limitada para no colgar el móvil). */
function sheetTableHtml(ws, maxRows, maxCols) {
  const lim = maxRows || 300, limC = maxCols || 40;
  const opts = { header: 1, raw: false, defval: '' };
  try {
    const ref = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
    if (ref.e.r > ref.s.r + lim) {
      opts.range = XLSX.utils.encode_range({
        s: ref.s,
        e: { r: ref.s.r + lim, c: Math.min(ref.e.c, ref.s.c + limC - 1) }
      });
    }
  } catch (e) { /* sin rango fiable: se lee entero */ }

  let rows = [];
  try { rows = XLSX.utils.sheet_to_json(ws, opts); } catch (e) { rows = []; }
  if (!rows.length) return '<div class="mu">Hoja vacía.</div>';

  const shown = rows.slice(0, lim + 1).map(r => (r || []).slice(0, limC));
  const head = '<tr>' + (shown[0] || []).map(c => `<th>${esc(String(c))}</th>`).join('') + '</tr>';
  const body = shown.slice(1)
    .map(r => '<tr>' + r.map(c => `<td>${esc(String(c))}</td>`).join('') + '</tr>').join('');
  const more = rows.length > lim
    ? `<div class="mu" style="margin-top:8px">Mostrando las primeras ${lim} filas.</div>` : '';

  return `<div class="pvgrid"><table class="pvtbl"><thead>${head}</thead><tbody>${body}</tbody></table></div>${more}`;
}

/** Cambia de hoja dentro de la vista previa (acción data-a="pvsheet"). */
function pvSheet(name) {
  const root = document.querySelector('.pvw');
  if (!root) return;
  root.querySelectorAll('[data-a="pvsheet"]').forEach(b => b.classList.toggle('on', b.dataset.s === name));
  root.querySelectorAll('[data-pv]').forEach(w => { w.hidden = w.dataset.pv !== name; });
}

/* --------------- Word / PowerPoint / OpenDocument (texto) -------------- */

/* --- Word con diseño real (docx-preview) --- */

let docxLibP = null;

/** Carga (una sola vez y solo cuando hace falta) JSZip + docx-preview. */
function loadDocxLib() {
  if (window.docx && window.docx.renderAsync) return Promise.resolve(true);
  if (docxLibP) return docxLibP;
  const trae = src => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => res(true);
    s.onerror = () => rej(new Error('no se pudo cargar ' + src));
    document.head.appendChild(s);
  });
  docxLibP = trae('vendor/jszip.min.js')
    .then(() => trae('vendor/docx-preview.min.js'))
    .then(() => !!(window.docx && window.docx.renderAsync))
    .catch(() => false);
  return docxLibP;
}

/**
 * Renderiza un .docx con su diseño real (párrafos, tablas, imágenes).
 * Devuelve el HTML o null si la librería no está disponible.
 */
async function docxVisualHtml(blob) {
  if (!await loadDocxLib()) return null;
  const host = document.createElement('div');
  await window.docx.renderAsync(blob, host, null, {
    className: 'docx',
    inWrapper: true,
    breakPages: true,
    ignoreLastRenderedPageBreak: false,
    useBase64URL: true          // las imágenes quedan incrustadas en el HTML
  });
  return host.innerHTML ? `<div class="pvdocx">${host.innerHTML}</div>` : null;
}

/* --- PowerPoint: una tarjeta por diapositiva --- */

/** Vista previa de PowerPoint: diseño real de la diapositiva o tarjetas. */
async function pptxPreviewHtml(blob) {
  try {
    const html = await pptxVisualHtml(blob);
    if (html) return html;
  } catch (e) { /* cae al modo tarjetas */ }
  return pptxCardsHtml(blob);
}

/** Modo alternativo: una tarjeta con el texto de cada diapositiva. */
async function pptxCardsHtml(blob) {
  const slides = await pptxSlides(blob);
  if (!slides || !slides.length) return null;
  const cards = slides.map((s, i) => `
    <div class="pvslide">
      <div class="pvslide-n">Diapositiva ${i + 1}</div>
      ${s.title ? `<h3>${esc(s.title)}</h3>` : ''}
      ${s.lines.length ? `<ul>${s.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    </div>`).join('');
  return `<div class="pvslides">${cards}</div>`;
}

/* --- PowerPoint: dibujo de la diapositiva con posiciones reales --- */

let jszipP = null;

/** Carga JSZip (ya viene en vendor) si aún no está. */
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(true);
  if (jszipP) return jszipP;
  jszipP = new Promise(res => {
    const s = document.createElement('script');
    s.src = 'vendor/jszip.min.js';
    s.onload = () => res(!!window.JSZip);
    s.onerror = () => res(false);
    document.head.appendChild(s);
  });
  return jszipP;
}

/** EMU (unidad interna de Office) -> píxeles CSS. 914400 EMU = 1 pulgada = 96 px. */
const emu2px = v => (Number(v) || 0) / 9525;

/** Lee un archivo de texto dentro de un ZIP ya abierto. */
async function zipStr(zip, name) {
  const f = zip.file(name);
  return f ? f.async('string') : null;
}

/** Imagen del ZIP -> data URL (para poder incrustarla en el HTML). */
async function zipMedia(zip, path) {
  const f = zip.file(path);
  if (!f) return null;
  const ext = (path.match(/\.([a-z0-9]+)$/i) || [, 'png'])[1].toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'gif' ? 'image/gif'
      : ext === 'svg' ? 'image/svg+xml'
        : ext === 'emf' || ext === 'wmf' ? null
          : 'image/png';
  if (!mime) return null;                       // EMF/WMF: no soportados por el navegador
  const b64 = await f.async('base64');
  return 'data:' + mime + ';base64,' + b64;
}

/** Dibuja todas las diapositivas de un .pptx respetando su maquetación. */
async function pptxVisualHtml(blob) {
  if (!await loadJSZip()) return null;
  const zip = await window.JSZip.loadAsync(blob);

  /* Tamaño de la diapositiva (por defecto 4:3). */
  const pres = await zipStr(zip, 'ppt/presentation.xml');
  const sz = /<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(pres || '');
  const SW = emu2px(sz ? sz[1] : 9144000) || 960;
  const SH = emu2px(sz ? sz[2] : 6858000) || 720;

  /* Orden real de las diapositivas. */
  const rels = await zipStr(zip, 'ppt/_rels/presentation.xml.rels');
  const files = [];
  const ids = [...(pres || '').matchAll(/<p:sldId[^>]*r:id="([^"]+)"/g)].map(m => m[1]);
  for (const id of ids) {
    const m = new RegExp('Id="' + id + '"[^>]*Target="([^"]+)"').exec(rels || '');
    if (m) files.push('ppt/' + m[1].replace(/^\.\.\//, '').replace(/^\/+/, ''));
  }
  if (!files.length) {
    for (let i = 1; i <= 300; i++) {
      const f = 'ppt/slides/slide' + i + '.xml';
      if (!zip.file(f)) break;
      files.push(f);
    }
  }
  if (!files.length) return null;

  /* Paleta del tema, para resolver colores como «accent1». */
  const theme = pptxTheme(await zipStr(zip, 'ppt/theme/theme1.xml'));

  const scale = Math.min(1, 780 / SW);
  const boxes = [];
  for (let i = 0; i < files.length; i++) {
    boxes.push(await pptxSlideBox(zip, files[i], SW, SH, i + 1, scale, theme));
  }
  return `<div class="pvdeck">${boxes.join('')}</div>`;
}

/** Paleta del tema: nombre de color -> «#RRGGBB». */
function pptxTheme(xml) {
  const t = {};
  if (!xml) return t;
  const scheme = /<a:clrScheme[\s\S]*?<\/a:clrScheme>/.exec(xml);
  if (!scheme) return t;
  const re = /<a:(\w+)>\s*<a:(?:srgbClr val="([0-9A-Fa-f]{6})"|sysClr[^>]*lastClr="([0-9A-Fa-f]{6})")/g;
  for (const m of scheme[0].matchAll(re)) t[m[1]] = '#' + (m[2] || m[3]);
  return t;
}

/** Color de un fragmento XML: directo (srgbClr) o del tema (schemeClr). */
function pptxColor(frag, theme) {
  const s = frag || '';
  const rgb = /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(s);
  if (rgb) return '#' + rgb[1];
  const sch = /<a:schemeClr val="(\w+)"/.exec(s);
  if (sch) {
    const n = sch[1], th = theme || {};
    if (th[n]) return th[n];
    if (n === 'tx1') return th.dk1 || '#000000';
    if (n === 'tx2') return th.dk2 || '#44546A';
    if (n === 'bg1') return th.lt1 || '#FFFFFF';
    if (n === 'bg2') return th.lt2 || '#E7E6E6';
  }
  const sys = /<a:sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"/.exec(s);
  return sys ? '#' + sys[1] : null;
}

/** Dibuja UNA diapositiva: cada forma en su posición, con su texto o imagen. */
async function pptxSlideBox(zip, file, SW, SH, num, scale, theme) {
  const xml = await zipStr(zip, file);
  if (!xml) return '';
  const rels = await zipStr(zip, file.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'));
  const k = v => Math.round(v * scale);
  const th = theme || {};
  const partes = [];

  /* Fondo de la diapositiva (si la propia diapositiva lo define). */
  const bgXml = (/<p:bg>[\s\S]*?<\/p:bg>/.exec(xml) || [''])[0];
  const bg = pptxColor(bgXml, th) || '#FFFFFF';

  /* Formas con texto (cuadros de texto, títulos…). */
  for (const sp of (xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [])) {
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(sp);
    if (!off) continue;
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(sp);
    const body = xmlToText(sp, '</a:p>');
    if (!body) continue;

    const szm = /<a:rPr[^>]*sz="(\d+)"/.exec(sp);
    const size = Math.max(8, Math.round((szm ? Number(szm[1]) / 100 : 18) * scale));
    const bold = /<a:rPr[^>]*b="1"/.test(sp) ? 'font-weight:700;' : '';
    const ital = /<a:rPr[^>]*i="1"/.test(sp) ? 'font-style:italic;' : '';

    /* El color del TEXTO va dentro de <a:rPr>, después de las propiedades. */
    const iRpr = sp.indexOf('<a:rPr');
    const color = pptxColor(iRpr >= 0 ? sp.slice(iRpr, iRpr + 600) : '', th) || '#111111';

    const fam = /<a:latin typeface="([^"]+)"/.exec(sp);
    const font = fam ? `font-family:'${fam[1].replace(/['"]/g, '')}',sans-serif;` : '';

    const am = /<a:pPr[^>]*algn="(ctr|r|just)"/.exec(sp);
    const align = am ? ({ ctr: 'center', r: 'right', just: 'justify' })[am[1]] : 'left';
    const an = /<a:bodyPr[^>]*anchor="(ctr|b)"/.exec(sp);
    const flex = an ? 'display:flex;flex-direction:column;justify-content:' + (an[1] === 'ctr' ? 'center' : 'flex-end') + ';' : '';

    const x = emu2px(off[1]), y = emu2px(off[2]);
    const w = ext ? emu2px(ext[1]) : SW - x;
    const h = ext ? emu2px(ext[2]) : 60;
    const st = `left:${k(x)}px;top:${k(y)}px;width:${k(w)}px;height:${k(h)}px;font-size:${size}px;text-align:${align};${bold}${ital}${font}${flex}color:${color};`;
    partes.push(`<div class="pvsp" style="${st}">${esc(body).replace(/\n/g, '<br>')}</div>`);
  }

  /* Imágenes (se incrustan como data URL: nada sale del dispositivo). */
  for (const pic of (xml.match(/<p:pic>[\s\S]*?<\/p:pic>/g) || [])) {
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(pic);
    const rid = /r:embed="([^"]+)"/.exec(pic);
    if (!off || !rid || !rels) continue;
    const m = new RegExp('Id="' + rid[1] + '"[^>]*Target="([^"]+)"').exec(rels);
    if (!m) continue;
    const path = 'ppt/' + m[1].replace(/^\.\.\//, '').replace(/^\/+/, '');
    const url = await zipMedia(zip, path);
    if (!url) continue;
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(pic);
    const x = emu2px(off[1]), y = emu2px(off[2]);
    const w = ext ? emu2px(ext[1]) : 200, h = ext ? emu2px(ext[2]) : 150;
    partes.push(`<img class="pvsp" src="${url}" alt="" style="left:${k(x)}px;top:${k(y)}px;width:${k(w)}px;height:${k(h)}px">`);
  }

  return `<div class="pvbox">
    <div class="pvslide-n">Diapositiva ${num}</div>
    <div class="pvcanvas" style="width:${k(SW)}px;height:${k(SH)}px;background:${bg}">${partes.join('')}</div>
  </div>`;
}

/** Texto de cada diapositiva (título + viñetas) de un .pptx. */
async function pptxSlides(blob) {
  if (typeof DecompressionStream === 'undefined') return null;
  const buf = new Uint8Array(await blob.arrayBuffer());
  const out = [];
  for (let i = 1; i <= 300; i++) {
    const xml = await zipText(buf, 'ppt/slides/slide' + i + '.xml');
    if (!xml) break;
    out.push(pptxSlideText(xml));
  }
  return out;
}

/** Separa el título del resto del texto dentro del XML de una diapositiva. */
function pptxSlideText(xml) {
  const shapes = String(xml).match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
  let title = '';
  const lines = [];
  for (const sp of shapes) {
    const esTitulo = /<p:ph[^>]*type="(title|ctrTitle)"/.test(sp);
    const txt = xmlToText(sp, '</a:p>');
    if (!txt) continue;
    const parts = txt.split('\n').map(s => s.trim()).filter(Boolean);
    if (esTitulo && !title && parts.length) title = parts.shift();
    lines.push(...parts);
  }
  return { title, lines };
}

/** Vista previa de un documento de Office: se extrae el TEXTO del XML interno
 *  (un .docx/.pptx es un ZIP). No conserva el diseño, pero permite LEERLO sin
 *  descargarlo y sin depender de ningún servidor. */
async function officePreviewHtml(blob, d) {
  const name = String(d.file || d.name || '').toLowerCase();
  const ext = (name.match(/\.([a-z0-9]+)$/) || [, ''])[1];

  if (ext === 'docx') {
    try { const html = await docxVisualHtml(blob); if (html) return html; } catch (e) { /* al texto */ }
  }
  if (ext === 'pptx') {
    try { const html = await pptxPreviewHtml(blob); if (html) return html; } catch (e) { /* al texto */ }
  }

  const txt = await officeText(blob, d);
  if (!txt) return null;
  return `<div class="pvtext">${esc(txt)}</div>`;
}

/** Texto plano de un .docx / .pptx / .odt / .odp. */
async function officeText(blob, d) {
  if (typeof DecompressionStream === 'undefined') return null;   // navegador antiguo
  const name = String(d.file || d.name || '').toLowerCase();
  const ext = (name.match(/\.([a-z0-9]+)$/) || [, ''])[1];
  const buf = new Uint8Array(await blob.arrayBuffer());
  const out = [];

  if (ext === 'docx') {
    const xml = await zipText(buf, 'word/document.xml');
    if (xml) out.push(xmlToText(xml, '</w:p>'));

  } else if (ext === 'pptx') {
    for (let i = 1; i <= 300; i++) {
      const xml = await zipText(buf, 'ppt/slides/slide' + i + '.xml');
      if (!xml) break;
      out.push('── Diapositiva ' + i + ' ──\n' + xmlToText(xml, '</a:p>'));
    }

  } else if (ext === 'odt' || ext === 'odp') {
    const xml = await zipText(buf, 'content.xml');
    if (xml) out.push(xmlToText(xml, '</text:p>'));
  }

  const res = out.join('\n\n').trim();
  return res || null;
}

/** Lee un archivo de texto dentro de un ZIP (por su ruta interna). */
async function zipText(buf, entryName) {
  const data = await zipEntry(buf, entryName);
  return data ? new TextDecoder().decode(data) : null;
}

/**
 * Extrae un archivo de un ZIP sin librerías externas.
 * Recorre el «directorio central» (la parte fiable del ZIP) y descomprime
 * con DecompressionStream cuando el método es deflate (8).
 */
async function zipEntry(buf, wanted) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);

  /* 1. Localizar el «End Of Central Directory» (0x06054b50). */
  let eocd = -1;
  const desde = Math.max(0, u.length - 66000);
  for (let i = u.length - 22; i >= desde; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;

  const total = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const dec2 = new TextDecoder();

  /* 2. Recorrer las entradas del directorio central. */
  for (let i = 0; i < total && off + 46 <= u.length; i++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const nm = dec2.decode(u.subarray(off + 46, off + 46 + nameLen));

    if (nm === wanted) {
      /* 3. Saltar la cabecera local para llegar a los datos. */
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const data = u.subarray(start, start + compSize);
      if (method === 0) return data;            // sin comprimir
      if (method !== 8) return null;            // otros métodos: no soportados
      const ds = new DecompressionStream('deflate-raw');
      const st = new Blob([data]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(st).arrayBuffer());
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** XML -> texto plano legible (párrafos, tabuladores y entidades). */
function xmlToText(xml, paraEnd) {
  const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(xml)
    .replace(/<(?:w|a):tab[^>]*\/>/g, '\t')
    .replace(/<(?:w|a):br[^>]*\/>/g, '\n')
    .replace(new RegExp(escapar(paraEnd), 'g'), '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* --------------------- Generar un PDF de la vista ---------------------- */

/**
 * Genera un PDF «de verdad» a partir de lo que se ve en la vista previa.
 *
 * Usa el diálogo de impresión del navegador: el PDF sale VECTORIAL (texto
 * seleccionable, nítido a cualquier zoom) y sin librerías extra.
 *
 * ⚠️ NO toca el archivo original: lo que se descargue con «Descargar» sigue
 * siendo el .docx / .xlsx / .pptx nativo, intacto.
 */
async function printRendered(d) {
  const body = await previewBodyOrFallback(d);
  const w = window.open('', '_blank');
  if (!w) return toast('Permite las ventanas emergentes para generar el PDF');

  const est = `
    @page{size:auto;margin:12mm}
    html,body{margin:0;background:#fff;color:#000;font:12px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    img,video{max-width:100%}
    iframe{width:100%;height:250mm;border:0}
    .pvtabs{display:none}
    .pvs[hidden]{display:block!important;margin-bottom:12mm}
    .pvslide-n{display:none}
    .pvbox,.card,.pn{page-break-inside:avoid}
    .pvcanvas{border:0;box-shadow:none;max-width:100%}
    .docx-wrapper{background:#fff;padding:0}
    .docx-wrapper>section.docx{box-shadow:none;margin:0 0 10mm;background:#fff;color:#000}
    .pvtext{font-size:10px;white-space:pre-wrap;word-break:break-word}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #888;padding:3px 5px;font-size:9px;text-align:left}
    .empty{display:none}
  `;

  w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' +
    esc(d.name || 'Documento') + '</title><style>' + est + '</style></head><body>' + body + '</body></html>');
  w.document.close();

  setTimeout(() => { try { w.focus(); w.print(); } catch (e) { } }, 900);
}

/** Acción: generar el PDF a partir de la vista previa del documento. */
function pdfDoc(id) {
  const d = docs.find(x => x.id === id);
  if (d) printRendered(d);
}

/* --------------- Visor de Google Drive (copia visible) ----------------- */

/**
 * Muestra el documento con el visor de Google Drive, incrustado en la app.
 *
 * ⚠️ El visor de Google necesita el archivo SIN CIFRAR en Drive, así que la
 * primera vez se sube una copia (con aviso previo y permiso del usuario).
 * La bóveda sigue guardando el original cifrado.
 */
async function drivePreviewDoc(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  if (location.protocol === 'file:') return toast('Abre la app desde https:// para usar el visor de Drive');
  if (!gdriveReady()) return toast('Falta configurar el ID de cliente de Google');
  if (!driveConnected()) return toast('Conecta Google Drive en Ajustes → Sincronización');

  let fid = d.driveId;

  if (!fid) {
    const ok = await confirmDialog(
      'Ver con el visor de Google',
      'Para verlo con el visor de Google, «' + d.name + '» se sube SIN CIFRAR a tu Google Drive. ' +
      'Google podrá leerlo, y también cualquiera que entre en tu cuenta. ' +
      'Tu bóveda seguirá guardando el original cifrado. ¿Continuar?',
      'Subir y ver');
    if (!ok) return;

    toast('Subiendo a Drive…');
    try {
      const token = await driveTokenForAction();
      if (!token) return toast('No se autorizó el acceso a Drive');
      const blob = await getBlob(d);
      fid = await driveUploadOriginal(token, d, blob);
      if (!fid) return toast('No se pudo subir el archivo');
      d.driveId = fid;
      await saveDoc(d);
      toast('Copia subida a Drive ✅');
    } catch (e) {
      return toast('No se pudo subir: ' + (e.message || 'error'));
    }
  }

  closeDrawer();
  openModal(`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px">
      <div style="min-width:0"><b style="display:block;word-break:break-word">${esc(d.name)}</b>
      <div class="mu"><span class="tag">${esc(d.cat || 'General')}</span>Visor de Google Drive</div></div>
      <button class="btn s" data-a="close" title="Cerrar">✕</button>
    </div>
    <div class="view"><iframe src="${drivePreviewUrl(fid)}" title="Vista previa de Drive" allowfullscreen></iframe></div>
    <div class="fx">
      <div class="mu" style="flex:1;text-align:left;align-self:center">⚠️ Esta copia está <b>sin cifrar</b> en tu Drive.</div>
      <button class="btn" data-a="drvopen" data-id="${esc(fid)}">${ic('cloud')}Abrir en Drive</button>
      <button class="btn d" data-a="drvremove" data-id="${esc(d.id)}">${ic('tr')}Quitar de Drive</button>
      <button class="btn p" data-a="close">Cerrar</button>
    </div>`, true);
}

/** Abre la copia de Drive en una pestaña nueva. */
function driveOpen(fid) {
  const w = window.open(driveOpenUrl(fid), '_blank', 'noopener');
  if (!w) toast('Permite las ventanas emergentes');
}

/** Borra la copia sin cifrar de Drive y olvida su id. */
async function driveRemoveCopy(id) {
  const d = docs.find(x => x.id === id);
  if (!d || !d.driveId) return;
  const ok = await confirmDialog('Quitar de Drive',
    'Se borrará la copia SIN CIFRAR que está en tu Google Drive. Tu documento seguirá en la bóveda, cifrado.',
    'Borrar de Drive');
  if (!ok) return;
  await driveDeleteOriginal(d);
  d.driveId = '';
  await saveDoc(d);
  closeModal();
  toast('Copia de Drive eliminada');
}

