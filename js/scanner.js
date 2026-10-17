/* ==========================================================================
 * Bóveda · scanner.js
 * Escáner multipágina: captura desde cámara/galería, recorte en perspectiva
 * (ajuste de 4 esquinas), rotación y generación de un PDF con jsPDF.
 * ========================================================================== */
'use strict';

const scan = {
  pages: [],    // [{ canvas, thumb }]
  crop: null,   // { i, pts:[[x,y]x4] } coordenadas normalizadas 0..1
  active: false
};

/* ------------------------- Utilidades de imagen ------------------------ */

/** Carga un archivo de imagen como canvas, respetando la orientación EXIF. */
async function fileToCanvas(file) {
  let src = null;
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    try { src = await createImageBitmap(file); }
    catch (e2) {
      src = await new Promise((res, rej) => {
        const im = new Image(), u = URL.createObjectURL(file);
        im.onload = () => { URL.revokeObjectURL(u); res(im); };
        im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('imagen no válida')); };
        im.src = u;
      });
    }
  }
  return downscale(src);
}

/** Copia una imagen a un canvas, reduciendo el lado mayor a MAX_IMAGE_SIDE. */
function downscale(src) {
  const w0 = src.width, h0 = src.height;
  const s = Math.min(1, MAX_IMAGE_SIDE / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * s));
  c.height = Math.max(1, Math.round(h0 * s));
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(src, 0, 0, c.width, c.height);
  if (src.close) src.close();
  return c;
}

/** Miniatura JPEG (dataURL) para la rejilla de páginas. */
function thumbURL(c) {
  const s = Math.min(1, THUMB_MAX / Math.max(c.width, c.height));
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(c.width * s));
  t.height = Math.max(1, Math.round(c.height * s));
  t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.7);
}

/* --------------------------- Pantalla completa -------------------------- */

/** Abre (o reactiva) el escáner a pantalla completa. */
function openScan() {
  closeModal();
  if (!scan.active) {
    const sv = document.createElement('div');
    sv.className = 'scv';
    sv.id = 'scv';
    sv.innerHTML = `<div class="sh"><b>Escanear documento</b><button class="btn s" data-a="scanclose" title="Cerrar">✕</button></div>
      <div class="sb" id="scb"></div><div class="sf" id="scf"></div>`;
    document.body.appendChild(sv);
    scan.active = true;
  }
  scanRender();
}

/** Cierra el escáner descartando las páginas no guardadas. */
function closeScan() {
  const el = document.getElementById('scv');
  if (el) el.remove();
  scan.pages = [];
  scan.crop = null;
  scan.active = false;
}

/** Añade una página a partir de un archivo de imagen. */
async function scanAdd(file) {
  if (!/^image\//.test(file.type)) return toast('Solo se pueden escanear imágenes');
  try {
    const c = await fileToCanvas(file);
    scan.pages.push({ canvas: c, thumb: thumbURL(c) });
    scan.crop = null;
    scanRender();
  } catch (e) {
    toast('No se pudo leer la imagen');
  }
}

/** Quita la página indicada. */
function scanDel(i) {
  scan.pages.splice(i, 1);
  scan.crop = null;
  scanRender();
}

/** Redibuja el cuerpo y el pie del escáner según el estado actual. */
function scanRender() {
  const b = document.getElementById('scb'), f = document.getElementById('scf');
  if (!b || !f) return;

  if (scan.crop) return renderCropStage(b, f);

  if (!scan.pages.length) {
    b.className = 'sb c';
    b.innerHTML = `<div class="empty" style="border-color:#33405e;color:#9fb0d0;max-width:420px">${ic('cam')}<br>Agrega la primera página<br>con la cámara o la galería.<br><br>Podrás recortar cada hoja antes de generar el PDF.</div>`;
  } else {
    b.className = 'sb';
    b.innerHTML = `<div class="pg">${scan.pages.map((p, i) => `<div>
      <img src="${p.thumb}" alt="Página ${i + 1}" data-a="scancrop" data-i="${i}">
      <button data-a="scandel" data-i="${i}" title="Quitar">✕</button><span>${i + 1}</span></div>`).join('')}</div>
      <div class="mu">Toca una página para recortar o rotar · ${scan.pages.length} página${scan.pages.length === 1 ? '' : 's'}.</div>`;
  }

  f.innerHTML = `<button class="btn" data-a="pick" data-src="cam">${ic('cam')}Cámara</button>
    <button class="btn" data-a="pick" data-src="gal">${ic('up')}Galería</button>
    <button class="btn p" data-a="scansave"${scan.pages.length ? '' : ' disabled'}>${ic('ok')}Guardar PDF</button>`;
}

/* ------------------------ Recorte en perspectiva ----------------------- */

/** Entra en modo recorte para la página i (esquinas iniciales al 4% del borde). */
function scanCrop(i) {
  if (!scan.pages[i]) return;
  scan.crop = { i, pts: [[0.04, 0.04], [0.96, 0.04], [0.96, 0.96], [0.04, 0.96]] };
  scanRender();
}

/** Sal del recorte sin aplicar cambios. */
function scanCancel() {
  scan.crop = null;
  scanRender();
}

/** Pinta el lienzo con las 4 asas de recorte y el polígono guía. */
function renderCropStage(b, f) {
  const p = scan.pages[scan.crop.i];
  b.className = 'sb c';
  b.innerHTML = `<div class="stg" id="stg">
    <canvas id="stc"></canvas>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon id="stp" points=""></polygon></svg>
    ${[0, 1, 2, 3].map(k => `<div class="hd" data-h="${k}"></div>`).join('')}
  </div>`;

  const c = document.getElementById('stc');
  c.width = p.canvas.width;
  c.height = p.canvas.height;
  c.getContext('2d').drawImage(p.canvas, 0, 0);
  drawPoly();

  f.innerHTML = `<button class="btn" data-a="scancancel">Cancelar</button>
    <button class="btn" data-a="scanrot">${ic('rot')}Rotar</button>
    <button class="btn p" data-a="scanapply">${ic('ok')}Aplicar</button>`;
}

/** Sincroniza el polígono y las asas con scan.crop.pts. */
function drawPoly() {
  const st = document.getElementById('stg');
  if (!st || !scan.crop) return;
  const pts = scan.crop.pts;
  const poly = document.getElementById('stp');
  if (poly) poly.setAttribute('points', pts.map(p => `${p[0] * 100},${p[1] * 100}`).join(' '));
  st.querySelectorAll('.hd').forEach((h, i) => {
    h.style.left = (pts[i][0] * 100) + '%';
    h.style.top = (pts[i][1] * 100) + '%';
  });
}

/* Arrastre de las asas (ratón y táctil, vía Pointer Events). */
document.addEventListener('pointerdown', e => {
  const h = e.target.closest && e.target.closest('.hd');
  if (!h || !scan.crop) return;
  const i = Number(h.dataset.h);
  const stage = document.getElementById('stg');
  if (!stage) return;

  const move = ev => {
    const r = stage.getBoundingClientRect();
    scan.crop.pts[i] = [
      clamp01((ev.clientX - r.left) / r.width),
      clamp01((ev.clientY - r.top) / r.height)
    ];
    drawPoly();
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
  e.preventDefault();
});

/** Aplica el recorte: rectifica el cuadrilátero y sustituye la página. */
function scanApply() {
  if (!scan.crop) return;
  const p = scan.pages[scan.crop.i];
  const W = p.canvas.width, H = p.canvas.height;
  const q = scan.crop.pts.map(pt => [pt[0] * W, pt[1] * H]);   // TL, TR, BR, BL
  const w = Math.max(1, Math.round(Math.max(dist(q[0], q[1]), dist(q[3], q[2]))));
  const h = Math.max(1, Math.round(Math.max(dist(q[0], q[3]), dist(q[1], q[2]))));

  const out = warp(p.canvas, q, w, h);
  p.canvas = out;
  p.thumb = thumbURL(out);
  scan.crop = null;
  scanRender();
}

/** Rota 90° en sentido horario la página en edición. */
function scanRotate() {
  const p = scan.pages[scan.crop.i];
  const c = document.createElement('canvas');
  c.width = p.canvas.height;
  c.height = p.canvas.width;
  const x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2);
  x.rotate(Math.PI / 2);
  x.drawImage(p.canvas, -p.canvas.width / 2, -p.canvas.height / 2);

  p.canvas = c;
  p.thumb = thumbURL(c);
  scan.crop.pts = [[0.04, 0.04], [0.96, 0.04], [0.96, 0.96], [0.04, 0.96]];
  scanRender();
}

/* --------------------- Álgebra: rectificación 2D ---------------------- */

/** Resuelve un sistema lineal 8x8 por eliminación gaussiana con pivoteo. */
function solve8(A, b) {
  const n = 8;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    if (p !== i) {
      const t = A[i]; A[i] = A[p]; A[p] = t;
      const tb = b[i]; b[i] = b[p]; b[p] = tb;
    }
    const d = A[i][i] || 1e-12;
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / d;
      if (!f) continue;
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / (A[i][i] || 1e-12);
  }
  return x;
}

/** Homografía (matriz 3x3 aplanada) que lleva los 4 puntos `from` a `to`. */
function solveH(from, to) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i], [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve8(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/**
 * Rectifica el cuadrilátero `quad` (en píxeles del canvas origen) a un
 * rectángulo de w×h mediante muestreo inverso + interpolación bilineal.
 * @returns {HTMLCanvasElement}
 */
function warp(src, quad, w, h) {
  const sw = src.width, sh = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, sw, sh).data;

  const dst = document.createElement('canvas');
  dst.width = w;
  dst.height = h;
  const dctx = dst.getContext('2d');
  const od = dctx.createImageData(w, h);
  const o = od.data;

  // Homografía rectángulo destino -> cuadrilátero origen.
  const Hm = solveH([[0, 0], [w, 0], [w, h], [0, h]], quad);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      const d = Hm[6] * cx + Hm[7] * cy + 1;
      const sx = (Hm[0] * cx + Hm[1] * cy + Hm[2]) / d;
      const sy = (Hm[3] * cx + Hm[4] * cy + Hm[5]) / d;
      const k = (y * w + x) * 4;

      if (!(sx >= 0 && sy >= 0 && sx < sw - 1 && sy < sh - 1)) {
        o[k] = o[k + 1] = o[k + 2] = o[k + 3] = 255;   // fuera del original -> blanco
        continue;
      }
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        const t = sd[i00 + c] + (sd[i10 + c] - sd[i00 + c]) * fx;
        const u = sd[i01 + c] + (sd[i11 + c] - sd[i01 + c]) * fx;
        o[k + c] = t + (u - t) * fy;
      }
      o[k + 3] = 255;
    }
  }
  dctx.putImageData(od, 0, 0);
  return dst;
}

/* ---------------------------- Guardar PDF ----------------------------- */

/** Genera un PDF con todas las páginas y abre el formulario de guardado. */
async function scanSave() {
  if (!scan.pages.length) return;
  if (!window.jspdf || !window.jspdf.jsPDF) return toast('No se pudo cargar el generador de PDF');

  const { jsPDF } = window.jspdf;
  let pdf = null;
  try {
    for (const p of scan.pages) {
      const c = p.canvas;
      const w = c.width, h = c.height;
      const data = c.toDataURL('image/jpeg', 0.82);
      const orient = w > h ? 'l' : 'p';
      if (!pdf) pdf = new jsPDF({ unit: 'px', format: [w, h], orientation: orient, compress: true });
      else pdf.addPage([w, h], orient);
      pdf.addImage(data, 'JPEG', 0, 0, w, h, undefined, 'FAST');
    }
  } catch (e) {
    return toast('Error al generar el PDF: ' + e.message);
  }

  const blob = pdf.output('blob');
  const n = scan.pages.length;
  closeScan();
  docForm({
    name: 'Escaneo ' + new Date().toLocaleDateString('es'),
    cat: 'Escaneos',
    notes: n + ' página' + (n === 1 ? '' : 's'),
    file: 'escaneo.pdf',
    type: 'application/pdf',
    _b: blob
  }, true);
}

