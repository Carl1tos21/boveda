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
  </div>
  <div class="fx"><button class="btn" data-a="close">Cancelar</button></div>`);
}

/** Procesa los archivos elegidos en las entradas ocultas. */
async function handleFiles(files) {
  const arr = Array.from(files);
  if (!arr.length) return;

  if (arr.length > 1) {
    // Varios archivos: se guardan con metadatos por defecto.
    for (const f of arr) {
      await saveDoc({
        id: uid(), date: Date.now(),
        name: baseName(f.name), cat: 'General', notes: '',
        file: f.name, type: f.type || 'application/octet-stream', _b: f
      });
    }
    await load();
    toast(arr.length + ' documentos agregados ✅');
    return;
  }

  const f = arr[0];
  docForm({
    name: baseName(f.name), cat: 'General', notes: '',
    file: f.name, type: f.type || 'application/octet-stream', _b: f
  }, true);
}

/** Formulario de metadatos (alta y edición). */
function docForm(d, isNew) {
  const cats = Array.from(new Set(DEFAULT_CATS.concat(docs.map(x => x.cat).filter(Boolean))));
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

/** Abre el visor de un documento (imagen, PDF o texto). */
async function viewDoc(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  let body;
  try {
    const b = await getBlob(d);
    if (/^image\//.test(d.type)) {
      const u = URL.createObjectURL(b); murls.push(u);
      body = `<img src="${u}" alt="">`;
    } else if (/pdf/i.test(d.type) || /\.pdf$/i.test(d.file || '')) {
      const u = URL.createObjectURL(b); murls.push(u);
      body = `<iframe src="${u}" title="PDF"></iframe>`;
    } else if (/^text\//.test(d.type) || /\.txt$/i.test(d.file || '')) {
      body = `<div style="white-space:pre-wrap;text-align:left;padding:16px;width:100%;overflow:auto">${esc(await b.text())}</div>`;
    } else {
      body = `<div class="empty">${ic('file')}<br>Vista previa no disponible.<br>Usa <b>Descargar</b> para abrirlo.</div>`;
    }
  } catch (e) {
    body = `<div class="empty">${ic('file')}<br>No se pudo leer el archivo.</div>`;
  }

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

