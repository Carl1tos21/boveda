/* ==========================================================================
 * Bóveda · viewer.js
 * Visor de documentos: PDF, Word, imágenes, texto y más.
 * Usa PDF.js (Mozilla) para PDF, docx-preview para Word, canvas para imágenes.
 * ================================================================ */
'use strict';

/** Tipo de visor según la extensión del archivo. */
function getViewerType(name) {
  const ext = String(name || '').toLowerCase().replace(/[?#].*$/, '').split('.').pop();
  switch (ext) {
    case 'pdf': return 'pdf';
    case 'doc':
    case 'docx': return 'docx';
    case 'xlsx':
    case 'xls':
    case 'csv': return 'xlsx';
    case 'txt':
    case 'md':
    case 'markdown': return 'text';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'bmp': return 'image';
    default: return 'unknown';
  }
}

/* =================== PDF viewer (PDF.js) =================== */

async function renderPdf(blob, filename, container) {
  const c = document.getElementById(container);
  if (!c) return;

  c.innerHTML = '<div class="vhead"><h1>PDF</h1><div class="mu">Cargando documento…</div></div><div id="pdfcanvas"></div>';

  try {
    const pdf = await pdfjsLib.getDocument({ data: blob, useSystemFonts: true }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.8 });
    const w = Math.min(viewport.width, 900);
    const h = Math.min(viewport.height, 700);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    canvas.classList.add('pdf-page');
    c.querySelector('#pdfcanvas').appendChild(canvas);

    await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: w / viewport.width }) }).promise;
    c.querySelector('.vhead').querySelector('.mu').textContent = 'Página 1 de ' + pdf.numPages;
  } catch (e) {
    c.innerHTML = '<div class="vhead"><h1>PDF</h1><div class="mu">Error al cargar el PDF: ' + esc(e.message) + '</div></div><div class="empty">📄 El archivo PDF no se pudo renderizar. ¿Es corrupto o de formato no compatible?</div>';
  }
}

/* =================== DOCX viewer (docx-preview) =================== */

function renderDocx(blob, container) {
  const c = document.getElementById(container);
  if (!c) return;

  if (typeof docxPreview === 'undefined') {
    c.innerHTML = '<div class="vhead"><h1>DOCX</h1><div class="mu">Librería de previsualización no cargada.</div></div><div class="empty">❌ El visor de Word no está disponible.</div>';
    return;
  }

  c.innerHTML = '<div class="vhead"><h1>DOCX</h1><div class="mu">Cargando documento…</div></div><div id="docx-preview"></div>';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const doc = new docxPreview.PDFDocument(data);
      const pdfData = await doc.getBuffer();
      const pdfBlob = new Blob([pdfData], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);
      const img = document.createElement('img');
      img.src = url;
      img.classList.add('pdf-page');
      img.onload = () => {
        c.querySelector('#docx-preview').innerHTML = '';
        c.querySelector('#docx-preview').appendChild(img);
        if (c.querySelector('.vhead')) c.querySelector('.vhead').querySelector('.mu').textContent = 'Vista previa';
      };
      img.onerror = () => {
        c.querySelector('#docx-preview').innerHTML = '<div class="empty">❌ No se pudo renderizar el documento Word.</div>';
      };
    } catch (err) {
      c.innerHTML = '<div class="vhead"><h1>DOCX</h1><div class="mu">Error: ' + esc(err.message) + '</div></div><div class="empty">❌ El documento Word no se pudo abrir.</div>';
    }
  };
  reader.readAsArrayBuffer(blob);
}


/* =================== VISOR PRINCIPAL =================== */

async function openViewer(doc) {
  const container = 'viewer-container';
  const type = getViewerType(doc.name || doc.file);

  const overlay = document.createElement('div');
  overlay.id = 'viewer-overlay';
  overlay.innerHTML = `
    <div class="viewer">
      <div class="vhead">
        <h1>${esc(doc.name || 'Documento')}</h1>
        <div class="mu">${esc(doc.cat || 'General')} · ${fmt(doc.size)} · ${esc(new Date(doc.date || Date.now()).toLocaleDateString('es'))}</div>
        <div class="fx" style="justify-content:space-between">
          <button class="btn" data-a="viewer-close">Cerrar</button>
          <div class="pager" id="pager" style="display:none">
            <div class="prev" id="prev-btn">‹</div>
            <div class="next" id="next-btn">›</div>
          </div>
        </div>
      </div>
      <div class="viewer-wrap" id="viewer-wrap">
        <div id="${container}" class="viewer-body"></div>
      </div>
      <div class="viewer-foot">
        <span>Documento cifrado · Guardado en tu dispositivo</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const body = document.getElementById(container);

  try {
    const blob = await getBlob(doc);

    switch (type) {
      case 'pdf':
        renderPdf(await blob.arrayBuffer(), doc.name, container);
        break;
      case 'docx':
        renderDocx(blob, container);
        break;
      case 'image':
        renderImage(blob, container);
        break;
      case 'text':
        renderText(blob, container);
        break;
      case 'xlsx':
        body.innerHTML = '<div class="vhead"><h1>HOJA DE CÁLCULO</h1><div class="mu">Vista previa de Excel</div><div class="empty">📊 Archivo de cálculo no compatible con previsualización.</div>';
        break;
      default:
        body.innerHTML = '<div class="vhead"><h1>DOCUMENTO</h1><div class="mu">Tipo de archivo: ' + esc(doc.name || 'desconocido') + '</div><div class="empty">📄 Este tipo de archivo no tiene previsualización.</div>';
    }
  } catch (e) {
    body.innerHTML = '<div class="vhead"><h1>Error</h1><div class="mu">No se pudo mostrar el documento.</div></div><div class="empty">❌ ' + esc(e.message) + '</div>';
  }

  const pager = document.getElementById('pager');
  if (pager) {
    pager.style.display = 'flex';
  }
}

window.closeViewer = () => {
  const ov = document.getElementById('viewer-overlay');
  if (ov) ov.remove();
};


/* =================== IMAGE viewer =================== */

function renderImage(blob, container) {
  const c = document.getElementById(container);
  if (!c) return;

  c.innerHTML = '<div class="vhead"><h1>IMAGEN</h1><div class="mu">Cargando imagen…</div></div><canvas id="imgcanvas"></canvas>';

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 900;
      const scale = Math.min(maxW / img.width, 1);
      const canvas = document.getElementById('imgcanvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      c.querySelector('.vhead').querySelector('.mu').textContent = 'Tamaño: ' + fmt(img.width) + ' × ' + fmt(img.height) + ' px';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(blob);
}

/* =================== TEXT viewer =================== */

function renderText(blob, container) {
  const c = document.getElementById(container);
  if (!c) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const lines = text.split(/\r?\n/);
    let html = '<div class="vhead"><h1>TXT · ' + (blob.name || 'archivo.txt') + '</div><div class="mu">' + fmt(blob.size || 0) + ' · ' + new Date().toLocaleString('es') + '</div><pre class="viewer-text">';
    for (let i = 0; i < Math.min(lines.length, 500); i++) {
      html += esc(lines[i]) + '\n';
    }
    if (lines.length > 500) html += '... <span class="dim">+' + (lines.length - 500) + ' líneas</span>';
    html += '</pre>';
    c.innerHTML = html;
  };
  reader.readAsText(blob);
}
