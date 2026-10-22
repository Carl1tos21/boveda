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
    <div class="fx">${d.notes ? `<div class="mu" style="flex:1;text-align:left;align-self:center">${esc(d.notes)}</div>` : ''}
      <button class="btn" data-a="dl" data-id="${d.id}">${ic('dl')}Descargar</button>
      <button class="btn" data-a="pr" data-id="${d.id}">${ic('pr')}Imprimir</button>
      <button class="btn p" data-a="ed" data-id="${d.id}">${ic('ed')}Editar</button>
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

/**
 * Vista previa de un documento de Office: se extrae el TEXTO del XML interno
 * (un .docx/.pptx es un ZIP). No conserva el diseño, pero permite LEERLO sin
 * descargarlo y sin depender de ningún servidor.
 */
async function officePreviewHtml(blob, d) {
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
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(new RegExp(escapar(paraEnd), 'g'), '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

