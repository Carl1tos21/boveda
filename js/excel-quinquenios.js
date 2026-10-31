/* ==========================================================================
 * Bóveda · excel-quinquenios.js
 * «Quin/Adel»: réplica funcional de la hoja MACRO del Excel
 * MACRO_QUINQUENIOS.xlsx.
 *   - Base de 337 empleados cifrada en IndexedDB (registro oculto qx_base).
 *   - Buscador por nombre, ficha editable con 3 quinquenios y 3 gestiones
 *     de 4 adelantos cada una.
 *   - Antigüedad calculada al vuelo (estilo DATEDIF de Excel).
 *   - Importación del Excel MACRO con auto-detección de columnas.
 *   - Impresión PDF de la ficha y del listado general.
 * ========================================================================== */
'use strict';

const QX_DOC_ID = 'qx_base';      // id del registro-documento que guarda la base
const QX_CAT_HIDDEN = '_qx';      // categoría oculta en «Mi bóveda»

let qxData = null;    // { v, origen, gen, empleados: [...] } | null
let qxLoaded = false;
let qxView = { mode: 'home', id: null };
let qxCatView = null; // 'adelantos' | 'quinquenios'
let qxBuscar = '';
let qxMap = null;     // mapeo manual pendiente { headers, rows }
let qxSaveTimer = null;
let qxDirty = false;     // hay cambios sin guardar (indicador + volcado al cerrar)
let qxSheet = 'macro';   // hoja activa: 'macro' | 'hoja1' | 'hoja3'
let qxPage = 0;          // página actual de la hoja de cálculo
let qxPageSize = 50;     // filas por página
let qxFilter = '';       // filtro de la hoja de cálculo
let qxVencMeses = 6;     // plazo del panel de RRHH (3, 6 o 12 meses)
let qxSort = { col: -1, dir: 1 };  // orden de la hoja activa (índice de columna)
let qxFDepto = '';       // filtro de la hoja por departamento
let qxFQuin = '';        // filtro de la hoja por estado del quinquenio
let qxFGest = '';        // filtro de la hoja por estado del trámite

const QX_QUIN_LABELS = ['1er Quinquenio', '2do Quinquenio', '3er Quinquenio'];
const QX_ADEL_LABELS = ['Primer Adelanto', 'Segundo Adelanto', 'Tercer Adelanto', 'Cuarto Adelanto'];

/**
 * Campos extra de la hoja «Hoja3» del Excel (datos de RRHH).
 * Se guardan en el mismo registro del empleado para poder editarlos como
 * una hoja de cálculo y exportarlos de vuelta al Excel.
 */
const QX_HOJA3_KEYS = [
  'direccion', 'fechaNacimiento', 'codUbicacion', 'codPuesto', 'nombrePuesto',
  'categoria', 'familiaPuesto', 'departamento', 'sindicato', 'jefe',
  'numPersona', 'codPuesto2', 'nombrePuesto2', 'categoriaAsignacion', 'sueldoBruto'
];

/* Estados de la «hoja de cálculo» (pestañas MACRO · Hoja 1 · Hoja 3). */
const QX_QUIN_OPTS = ['CUMPLE', 'NO CUMPLE'];
const QX_VISADO_OPTS = ['Sí', 'No'];

/* Flujo de gestión del trámite de cada quinquenio (lo que hace RRHH). */
const QX_GESTION_OPTS = ['Pendiente', 'En proceso', 'Aprobado', 'Pagado', 'Rechazado'];

/** Nombres de los meses (calendario y constancias). */
const QX_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/* --------------------------- Utilidades --------------------------------- */

/** Minúsculas sin acentos (para comparar nombres como en el buscador). */
function qxNorm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Identificador estable a partir del nombre completo. */
function qxSlug(nombre) {
  return qxNorm(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || ('emp-' + Date.now().toString(36));
}

/** Empleado vacío con la estructura completa del Excel MACRO + Hoja3. */
function qxEmptyEmpleado(nombre) {
  const e = {
    id: qxSlug(nombre),
    nombre: String(nombre || '').trim(),
    fechaIngreso: '',
    cargo: '',
    quinquenios: [0, 1, 2].map(() => ({ estado: '', periodo: '', visado: '', gestion: '', fechaGestion: '', responsable: '', nota: '' })),
    adelantos: [0, 1, 2].map(() => [0, 1, 2, 3].map(() => ({ detalle: '', periodo: '', anios: '', visado: '' })))
  };
  QX_HOJA3_KEYS.forEach(k => { e[k] = ''; });
  return e;
}

/** Rellena estructuras heredadas de archivos antiguos por si faltan ramas. */
function qxFixEmpleado(e) {
  const base = qxEmptyEmpleado(e && e.nombre);
  const out = Object.assign(base, e || {});
  out.id = out.id || qxSlug(out.nombre);
  out.quinquenios = [0, 1, 2].map(i => Object.assign({ estado: '', periodo: '', visado: '', gestion: '', fechaGestion: '', responsable: '', nota: '' }, (e && e.quinquenios && e.quinquenios[i]) || {}));
  out.adelantos = [0, 1, 2].map(i => [0, 1, 2, 3].map(j => Object.assign({ detalle: '', periodo: '', anios: '', visado: '' }, (e && e.adelantos && e.adelantos[i] && e.adelantos[i][j]) || {})));
  QX_HOJA3_KEYS.forEach(k => { if (out[k] == null) out[k] = ''; });
  return out;
}

/** Antigüedad en formato «X años y Y meses» (réplica de DATEDIF en Excel). */
function qxAntiguedad(iso) {
  if (!iso) return '';
  const f = new Date(iso + 'T00:00:00');
  if (isNaN(f.getTime())) return '';
  const hoy = new Date();
  let años = hoy.getFullYear() - f.getFullYear();
  let meses = hoy.getMonth() - f.getMonth();
  if (hoy.getDate() < f.getDate()) meses--;
  if (meses < 0) { años--; meses += 12; }
  const totalMeses = años * 12 + meses;
  if (totalMeses < 1) return 'Menos de 1 mes';
  if (años === 0) return meses + ' meses';
  return años + ' años y ' + meses + ' meses';
}

/** Suma años a una fecha ISO (YYYY-MM-DD) y devuelve otra fecha ISO. */
function qxMasAnios(iso, n) {
  if (!iso) return '';
  const f = new Date(iso + 'T00:00:00');
  if (isNaN(f.getTime())) return '';
  const d = new Date(f.getFullYear() + n, f.getMonth(), f.getDate());
  const p = v => String(v).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** Fecha ISO -> «dd/mm/aaaa». */
function qxFmtCorto(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? (m[3] + '/' + m[2] + '/' + m[1]) : '';
}

/**
 * Periodo del quinquenio número i (0, 1, 2) calculado desde la fecha de
 * ingreso: el 1.º va del año 5 al 10, el 2.º del 10 al 15 y el 3.º del 15 al 20.
 */
function qxPeriodoQuin(fechaIngreso, i) {
  const a = qxMasAnios(fechaIngreso, i * 5);
  const b = qxMasAnios(fechaIngreso, (i + 1) * 5);
  if (!a || !b) return '';
  return qxFmtCorto(a) + ' - ' + qxFmtCorto(b);
}

/**
 * Rellena los periodos de los 3 quinquenios usando la fecha de ingreso.
 * Solo toca los que están VACÍOS (o todos si `forzar` es true), para no
 * pisar lo que ya hayas escrito a mano.
 * @returns {number} cuántos periodos se rellenaron
 */
function qxCalcPeriodos(e, forzar) {
  if (!e || !e.fechaIngreso) return 0;
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const p = qxPeriodoQuin(e.fechaIngreso, i);
    if (!p) continue;
    const actual = e.quinquenios[i].periodo;
    if ((!actual || forzar) && actual !== p) {
      e.quinquenios[i].periodo = p;
      n++;
    }
  }
  return n;
}

/** Clase CSS para colorear un selector según el estado. */
const qxEstadoCls = v => (v === 'CUMPLE' ? 'qx-ok' : v === 'NO CUMPLE' ? 'qx-no' : '');

/** Clase CSS del selector de estado del trámite (colorea el select). */
const qxGestionCls = v => (v === 'Pagado' || v === 'Aprobado' ? 'qx-ok' : v === 'Rechazado' ? 'qx-no' : '');

/** Clase CSS del badge del trámite en los listados. */
const qxGestionBadge = v => (v === 'Pagado' || v === 'Aprobado' ? 'ok' : v === 'Rechazado' ? 'no' : 'ac');

/** Fecha ISO (aaaa-mm-dd) desde Date de Excel, serial o texto dd/mm/aaaa. */
function qxToISO(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p = n => String(n).padStart(2, '0');
    return v.getFullYear() + '-' + p(v.getMonth() + 1) + '-' + p(v.getDate());
  }
  if (typeof v === 'number' && v > 20000 && v < 60000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    const p = n => String(n).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

/** Normaliza un estado a la lista de validación del Excel. */
function qxEstado(v) {
  const s = qxNorm(v).toUpperCase();
  if (s === 'CUMPLE' || s === 'CUMPLE ') return 'CUMPLE';
  if (s.indexOf('NO CUMPLE') === 0) return 'NO CUMPLE';
  return '';
}

/** Normaliza un visado a la lista Sí/No del Excel. */
function qxVisado(v) {
  const s = qxNorm(v).toUpperCase();
  if (s === 'SI') return 'Sí';
  if (s === 'NO') return 'No';
  return '';
}

/** Muestra de texto plano (evita «undefined» en tablas). */
const qxDash = v => (v == null || v === '' ? '—' : String(v));

/* ------------------------- Persistencia cifrada ------------------------- */

/** Registro-documento que almacena la base completa (ya cifrada en IDB). */
const qxGetDoc = () => docs.find(x => x.id === QX_DOC_ID);

/** Carga la base descifrada desde IndexedDB (una sola vez por sesión). */
async function qxLoad() {
  if (qxLoaded) return;
  const d = qxGetDoc();
  if (d) {
    try { qxData = JSON.parse(await (await getBlob(d)).text()); }
    catch (e) { qxData = null; }
  }
  if (!qxData || !Array.isArray(qxData.empleados)) qxData = null;
  else qxData.empleados = qxData.empleados.map(qxFixEmpleado);
  qxLoaded = true;
  qxUpdateBadge();
}

/** Persiste qxData cifrado (AES-GCM) como registro de la bóveda. */
async function qxPersist() {
  if (!qxData) return;
  qxSetStatus('saving');
  qxData.gen = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const json = JSON.stringify(qxData);
  let d = qxGetDoc();
  if (!d) {
    d = { id: QX_DOC_ID, date: Date.now(), name: 'Base de quinquenios', cat: QX_CAT_HIDDEN, notes: 'Base interna de la vista Quin/Adel', file: 'base-quinquenios.json', type: 'application/json' };
    docs.push(d);
  }
  d._b = new Blob([json], { type: 'application/json' });
  d.date = Date.now();
  await saveDoc(d, key, true);
  qxDirty = false;
  qxSetStatus('saved');
  qxUpdateBadge();
}

/** Guardado diferido (los edits de la ficha no bloquean la interfaz). */
function qxScheduleSave() {
  qxDirty = true;
  qxSetStatus('pending');
  clearTimeout(qxSaveTimer);
  qxSaveTimer = setTimeout(qxFlush, 700);
}

/**
 * Vuelca AHORA los cambios pendientes, sin esperar el retardo.
 * Se llama al ocultar o cerrar la pestaña para no perder el último edit.
 */
async function qxFlush() {
  clearTimeout(qxSaveTimer);
  qxSaveTimer = null;
  if (!qxDirty || !qxData) return;
  try {
    await qxPersist();
  } catch (e) {
    qxSetStatus('error');
    toast('No se pudo guardar la base');
  }
}

/** Indicador de guardado en la cabecera (si esa vista está en pantalla). */
function qxSetStatus(state) {
  const el = document.getElementById('qxstatus');
  if (!el) return;
  const map = {
    pending: ['Guardando…', 'var(--mu)'],
    saving: ['Guardando…', 'var(--mu)'],
    saved: ['Guardado ✓', 'var(--ok)'],
    error: ['No se pudo guardar', 'var(--dg)']
  };
  const m = map[state] || map.saved;
  el.textContent = m[0];
  el.style.color = m[1];
}

/* ------------------------ Importación desde Excel ----------------------- */

/** Lee un .xlsx/.xls y devuelve el workbook de SheetJS. */
function qxReadWorkbook(file) {
  return new Promise((resolve, reject) => {
    if (!window.XLSX) return reject(new Error('SheetJS no está cargado. Recarga la página.'));
    const reader = new FileReader();
    reader.onload = e => {
      try { resolve(XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true })); }
      catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsArrayBuffer(file);
  });
}

/** Devuelve la fila-encabezado de una hoja cuyo nombre de columna cumpla un predicado. */
function qxFindHeaderRow(ws, probe) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const r = rows[i] || [];
    if (r.some(c => probe(qxNorm(c)))) return { idx: i, rows };
  }
  return { idx: -1, rows };
}

/**
 * Columnas de la hoja «Hoja3» (datos de RRHH). `h` es el encabezado tal cual
 * aparece en el Excel, `qx` la clave del empleado y `nth` la aparición cuando
 * el encabezado se repite (p. ej. «Name» aparece dos veces).
 */
const QX_HOJA3_SHEET_COLS = [
  { h: 'Name', qx: 'nombre', w: 220, cls: 'qxname' },
  { h: 'Fecha Antigüedad', qx: 'fecha', type: 'date', w: 150 },
  { h: 'Address Line 1', qx: 'direccion', w: 280 },
  { h: 'Person Date of Birth', qx: 'fechaNacimiento', type: 'date', w: 160 },
  { h: 'Location Code', qx: 'codUbicacion', w: 120 },
  { h: 'Job Name', qx: 'cargo', w: 240 },
  { h: 'Position Code', qx: 'codPuesto', w: 150 },
  { h: 'Position Name', qx: 'nombrePuesto', w: 240 },
  { h: 'Worker Category', qx: 'categoria', w: 150 },
  { h: 'Job Family', qx: 'familiaPuesto', w: 170 },
  { h: 'Department Name', qx: 'departamento', w: 240 },
  { h: 'Union Name', qx: 'sindicato', w: 240 },
  { h: 'Name', qx: 'jefe', nth: 2, w: 240 },
  { h: 'Person Number', qx: 'numPersona', w: 130 },
  { h: 'Position Code', qx: 'codPuesto2', nth: 2, w: 150 },
  { h: 'Position Name', qx: 'nombrePuesto2', nth: 2, w: 240 },
  { h: 'Assignment Category', qx: 'categoriaAsignacion', w: 170 },
  { h: 'Sueldo Bruto', qx: 'sueldoBruto', w: 130 }
];

/** Índice de la n-ésima aparición de un encabezado (o -1). */
function qxHeaderIndex(hdr, h, nth) {
  let seen = 0;
  for (let i = 0; i < hdr.length; i++) {
    if (hdr[i] === h) { seen++; if (seen === (nth || 1)) return i; }
  }
  return -1;
}

/** Lee la hoja tipo «Hoja3» y devuelve un mapa { nombreNormalizado: campos }. */
function qxReadHoja3Map(wb, skipSheet) {
  const out = {};
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || ws === skipSheet) continue;
    const found = qxFindHeaderRow(ws, c => c === 'name' || c === 'job name');
    if (found.idx < 0) continue;
    const hdr = (found.rows[found.idx] || []).map(qxNorm);
    if (hdr.indexOf('job name') < 0) continue;
    const cols = QX_HOJA3_SHEET_COLS.map(c => ({ c: c, i: qxHeaderIndex(hdr, qxNorm(c.h), c.nth) }));
    const iName = qxHeaderIndex(hdr, 'name', 1);
    for (let i = found.idx + 1; i < found.rows.length; i++) {
      const r = found.rows[i] || [];
      const nm = String(r[iName] == null ? '' : r[iName]).trim();
      if (!nm) continue;
      const rec = {};
      cols.forEach(m => {
        if (m.i < 0) return;
        const raw = r[m.i];
        const key = m.c.qx === 'fecha' ? 'fechaIngreso' : m.c.qx;
        rec[key] = m.c.type === 'date' ? qxToISO(raw) : String(raw == null ? '' : raw).trim();
      });
      rec.nombre = nm;
      out[qxNorm(nm)] = rec;
    }
    break;
  }
  return out;
}

/**
 * Intenta importar el libro con la estructura exacta del Excel MACRO:
 * hoja con «NOMBRE COMPLETO» (25 columnas) y hoja con «Name»/«Job Name».
 * Devuelve la lista de empleados o null si el archivo no tiene esa forma.
 */
function qxTryMacroImport(wb) {
  let dataSheet = null, dataRows = null, headerIdx = -1;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const found = qxFindHeaderRow(ws, c => c.indexOf('nombre completo') === 0);
    if (found.idx >= 0) { dataSheet = ws; dataRows = found.rows; headerIdx = found.idx; break; }
  }
  if (!dataSheet) return null;

  /* Mapa completo de datos RRHH desde la hoja tipo «Hoja3» (Name | ... | Job Name). */
  const hoja3 = qxReadHoja3Map(wb, dataSheet);
  const cargos = {};
  Object.keys(hoja3).forEach(k => { if (hoja3[k].cargo) cargos[k] = hoja3[k].cargo; });

  const out = [];
  for (let i = headerIdx + 1; i < dataRows.length; i++) {
    const r = dataRows[i] || [];
    const nombre = String(r[0] || '').trim();
    if (!nombre) continue;
    const e = qxEmptyEmpleado(nombre);
    e.fechaIngreso = qxToISO(r[1]);
    e.cargo = cargos[qxNorm(nombre)] || String(r[2] || '').trim();
    const h3 = hoja3[qxNorm(nombre)];
    if (h3) {
      if (!e.cargo) e.cargo = h3.cargo || '';
      if (!e.fechaIngreso) e.fechaIngreso = h3.fechaIngreso || '';
      QX_HOJA3_KEYS.forEach(k => { e[k] = h3[k] || ''; });
    }
    /* Columnas fijas del MACRO (ver análisis de las 25 columnas de Hoja1). */
    const quinCols = [[4, 5, 6], [11, 12, 13], [18, 19, 20]];
    quinCols.forEach((cols, k) => {
      e.quinquenios[k].estado = qxEstado(r[cols[0]]);
      e.quinquenios[k].periodo = String(r[cols[1]] == null ? '' : r[cols[1]]).trim();
      e.quinquenios[k].visado = qxVisado(r[cols[2]]);
    });
    const adelCols = [[7, 8, 9, 10], [14, 15, 16, 17], [21, 22, 23, 24]];
    adelCols.forEach((cols, k) => {
      e.adelantos[k][0].detalle = String(r[cols[0]] == null ? '' : r[cols[0]]).trim();
      e.adelantos[k][0].periodo = String(r[cols[1]] == null ? '' : r[cols[1]]).trim();
      e.adelantos[k][0].anios = String(r[cols[2]] == null ? '' : r[cols[2]]).trim();
      e.adelantos[k][0].visado = qxVisado(r[cols[3]]);
    });
    out.push(e);
  }

  /* Empleados que solo aparecen en la Hoja3 (sin fila en la Hoja1). */
  const vistos = new Set(out.map(e => qxNorm(e.nombre)));
  Object.keys(hoja3).forEach(nm => {
    if (vistos.has(nm)) return;
    const rec = hoja3[nm];
    const e = qxEmptyEmpleado(rec.nombre || '');
    if (!e.nombre) return;
    e.fechaIngreso = rec.fechaIngreso || '';
    e.cargo = rec.cargo || '';
    QX_HOJA3_KEYS.forEach(k => { e[k] = rec[k] || ''; });
    out.push(e);
  });

  return out.length ? out : null;
}

/** Fusiona empleados importados sobre la base actual (por id). */
function qxMergeEmpleados(list) {
  if (!qxData) qxData = { v: 1, origen: '', gen: '', empleados: [] };
  const byId = new Map(qxData.empleados.map(e => [e.id, e]));
  let nuevos = 0, actualizados = 0;
  for (const inc of list) {
    const e = qxFixEmpleado(inc);
    const cur = byId.get(e.id);
    if (!cur) { qxData.empleados.push(e); byId.set(e.id, e); nuevos++; continue; }
    /* Actualiza solo los campos con contenido (no borra ediciones previas). */
    if (e.fechaIngreso) cur.fechaIngreso = e.fechaIngreso;
    if (e.cargo) cur.cargo = e.cargo;
    QX_HOJA3_KEYS.forEach(k => { if (e[k]) cur[k] = e[k]; });
    e.quinquenios.forEach((q, i) => {
      if (q.estado) cur.quinquenios[i].estado = q.estado;
      if (q.periodo) cur.quinquenios[i].periodo = q.periodo;
      if (q.visado) cur.quinquenios[i].visado = q.visado;
    });
    e.adelantos.forEach((bloque, i) => bloque.forEach((a, j) => {
      if (a.detalle) cur.adelantos[i][j].detalle = a.detalle;
      if (a.periodo) cur.adelantos[i][j].periodo = a.periodo;
      if (a.anios) cur.adelantos[i][j].anios = a.anios;
      if (a.visado) cur.adelantos[i][j].visado = a.visado;
    }));
    actualizados++;
  }
  qxData.empleados.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { nuevos, actualizados };
}

/* --------------------- Carga de la base incluida ------------------------ */

/** Descarga data/base-quinquenios.json y lo guarda cifrado en la bóveda. */
async function qxSeedBase() {
  try {
    const res = await fetch('./data/base-quinquenios.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const base = await res.json();
    if (!base || !Array.isArray(base.empleados) || !base.empleados.length) throw new Error('archivo vacío');
    const r = qxMergeEmpleados(base.empleados.map(qxFixEmpleado));
    if (!qxData.origen) qxData.origen = base.origen || 'MACRO_QUINQUENIOS.xlsx';
    await qxPersist();
    renderQx();
    toast('Base cargada: ' + r.nuevos + ' nuevos, ' + r.actualizados + ' actualizados ✅');
  } catch (e) {
    toast('No se pudo cargar la base incluida (¿sin conexión?)');
  }
}

/* ------------------------------ Vistas ---------------------------------- */

/** Busca empleados por nombre (insensible a mayúsculas/acentos). */
function qxSearch(q) {
  const t = qxNorm(q);
  const list = (qxData && qxData.empleados) || [];
  if (!t) return [];
  return list.filter(e => {
    const hay = [e.nombre, e.numPersona, e.cargo, e.departamento, e.codUbicacion, e.categoria].join(' ');
    return qxNorm(hay).indexOf(t) >= 0;
  }).slice(0, 40);
}

/** Estadísticas rápidas para las tarjetas del inicio. */
function qxStats() {
  const emps = (qxData && qxData.empleados) || [];
  const q = [0, 0, 0], noq = [0, 0, 0];
  let conAdel = 0;
  emps.forEach(e => {
    e.quinquenios.forEach((quin, i) => {
      if (quin.estado === 'CUMPLE') q[i]++;
      else if (quin.estado === 'NO CUMPLE') noq[i]++;
    });
    const tiene = e.adelantos.some(bloque => bloque.some(a => a.detalle || a.periodo || a.anios));
    if (tiene) conAdel++;
  });
  return { emps, q, noq, conAdel };
}

/* ============== Panel de RRHH: vencimientos y pendientes =============== */

/** Fecha (ISO) en la que se cumple el quinquenio i (0, 1, 2) del empleado. */
const qxFechaQuin = (e, i) => qxMasAnios(e && e.fechaIngreso, (i + 1) * 5);

/** Días que faltan para una fecha ISO (negativo si ya pasó). */
function qxDiasPara(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const f = new Date(+m[1], +m[2] - 1, +m[3]);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.round((f - hoy) / 86400000);
}

/**
 * Analiza la base entera para el panel de RRHH.
 *   proximos   -> quinquenios que se cumplen dentro del plazo elegido
 *   pendientes -> quinquenios cuya fecha YA pasó y siguen sin gestionar
 *   revisar    -> datos incompletos o incoherentes
 */
function qxAnalizaVenc(meses) {
  const emps = (qxData && qxData.empleados) || [];
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const limite = new Date(hoy.getFullYear(), hoy.getMonth() + (meses || 6), hoy.getDate());

  const proximos = [], pendientes = [], revisar = [];
  let conFecha = 0;

  for (const e of emps) {
    /* Adelantos con datos pero sin detalle: se revisa siempre, tenga o no fecha de ingreso */
    const ad = (e.adelantos || []).reduce((a, b) => a + b.filter(x => (x.anios || x.periodo) && !x.detalle).length, 0);
    if (ad) revisar.push({ e, texto: ad + ' adelanto(s) sin detalle' });

    if (!e.fechaIngreso) { revisar.push({ e, texto: 'Sin fecha de ingreso' }); continue; }
    conFecha++;

    for (let i = 0; i < 3; i++) {
      const iso = qxFechaQuin(e, i);
      const dias = qxDiasPara(iso);
      if (dias === null) { revisar.push({ e, texto: 'Fecha de ingreso no válida' }); break; }
      const f = new Date(iso + 'T00:00:00');
      const q = e.quinquenios[i] || {};

      if (q.estado === 'CUMPLE') {
        if (dias > 0) revisar.push({ e, texto: QX_QUIN_LABELS[i] + ': CUMPLE marcado y aún faltan ' + dias + ' días' });
        continue;
      }
      if (f >= hoy && f <= limite) proximos.push({ e, i, iso, dias });
      else if (f < hoy) pendientes.push({ e, i, iso, dias: -dias });
    }
  }

  proximos.sort((a, b) => a.dias - b.dias);        // los más urgentes primero
  pendientes.sort((a, b) => b.dias - a.dias);      // los más antiguos primero
  return { proximos, pendientes, revisar, total: emps.length, conFecha, meses: meses || 6 };
}

/* --------- Aviso en el menú: quinquenios vencidos sin gestionar --------- */

/** Nº de quinquenios ya vencidos que siguen sin gestionar. */
function qxPendientesCount() {
  if (!qxData || !Array.isArray(qxData.empleados)) return 0;
  return qxAnalizaVenc(qxVencMeses).pendientes.length;
}

let qxBadgeN = -1;   // último valor pintado (para no tocar el DOM en balde)

/** Pinta (o quita) el aviso rojo en los botones «Quin/Adel» del menú. */
function qxUpdateBadge() {
  const n = qxPendientesCount();
  if (n === qxBadgeN) return;
  qxBadgeN = n;
  const botones = document.querySelectorAll('[data-v="qx"]');
  for (let k = 0; k < botones.length; k++) {
    const b = botones[k];
    let bd = b.querySelector('.qxnb');
    if (!n) { if (bd) bd.remove(); continue; }
    if (!bd) { bd = document.createElement('span'); bd.className = 'qxnb'; b.appendChild(bd); }
    bd.textContent = n > 99 ? '99+' : String(n);
    bd.title = n + ' quinquenio(s) vencido(s) sin gestionar';
  }
}

/** Desglose de la plantilla por departamento (para el panel de RRHH). */
function qxPorDepto(meses) {
  const emps = (qxData && qxData.empleados) || [];
  const r = qxAnalizaVenc(meses);
  const map = new Map();
  const get = d => {
    const k = d || '(sin departamento)';
    if (!map.has(k)) map.set(k, { dep: k, emps: 0, cumplidos: 0, pendientes: 0, proximos: 0 });
    return map.get(k);
  };
  for (const e of emps) {
    const g = get(e.departamento);
    g.emps++;
    g.cumplidos += e.quinquenios.filter(q => q.estado === 'CUMPLE').length;
  }
  for (const x of r.pendientes) get(x.e.departamento).pendientes++;
  for (const x of r.proximos) get(x.e.departamento).proximos++;
  return [...map.values()].sort((a, b) => b.emps - a.emps);
}

/** «2027-03» → «Marzo 2027». */
function qxMesLargo(clave) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(clave || ''));
  return m ? QX_MESES[+m[2] - 1] + ' ' + m[1] : String(clave || '');
}

/**
 * Calendario de los próximos `n` meses: devuelve todos los meses del horizonte
 * (aunque estén vacíos) con los quinquenios que vencen en cada uno.
 */
function qxCalendario(n) {
  const r = qxAnalizaVenc(n);
  const hoy = new Date();
  const out = [];
  for (let k = 0; k < n; k++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + k, 1);
    const clave = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    out.push({ clave: clave, mes: qxMesLargo(clave), items: [] });
  }
  const idx = {};
  out.forEach((m, k) => { idx[m.clave] = k; });
  r.proximos.forEach(x => {
    const k = idx[String(x.iso).slice(0, 7)];
    if (k != null) out[k].items.push(x);
  });
  return out;
}

/** Tabla del calendario de vencimientos (para el panel de RRHH). */
function qxCalHTML(n) {
  const cal = qxCalendario(n);
  const filas = cal.map(m => `<tr${m.items.length ? '' : ' class="vacio"'}>
      <td><b>${esc(m.mes)}</b></td>
      <td class="n">${m.items.length}</td>
      <td>${m.items.length
        ? m.items.map(x => esc(x.e.nombre) + ' <span class="mu">(' +
          esc(QX_QUIN_LABELS[x.i].split(' ')[0]) + ', en ' + x.dias + ' días)</span>').join('<br>')
        : '<span class="mu">—</span>'}</td>
    </tr>`).join('');
  return `
    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 8px">📅 Calendario de los próximos ${n} meses</h2>
      <div class="qxdep"><table>
        <thead><tr><th>Mes</th><th class="n">Vencimientos</th><th>Trabajadores</th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>
    </div>`;
}

/** Exporta el calendario de vencimientos a un .xlsx real. */
function qxCalExportXlsx() {
  if (!window.XLSX) return toast('Falta la librería de Excel');
  const cal = qxCalendario(12);
  const aoa = [['MES', 'VENCIMIENTOS', 'TRABAJADOR', 'QUINQUENIO', 'FECHA', 'DÍAS', 'DEPARTAMENTO', 'ESTADO DEL TRÁMITE']];
  cal.forEach(m => {
    if (!m.items.length) { aoa.push([m.mes, 0, '', '', '', '', '', '']); return; }
    m.items.forEach((x, k) => aoa.push([
      k === 0 ? m.mes : '', k === 0 ? m.items.length : '',
      x.e.nombre, QX_QUIN_LABELS[x.i], qxFmtCorto(x.iso), x.dias,
      x.e.departamento || '', x.e.quinquenios[x.i].gestion || ''
    ]));
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 32 }, { wch: 16 }, { wch: 12 },
    { wch: 7 }, { wch: 20 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vencimientos');
  XLSX.writeFile(wb, 'VENCIMIENTOS_QUINQUENIOS.xlsx');
  toast('Calendario exportado ✅');
}

/** Tabla de resumen por departamento. */
function qxDeptoHTML(filas) {
  if (!filas.length) return '';
  const tot = filas.reduce((a, f) => ({
    emps: a.emps + f.emps, cumplidos: a.cumplidos + f.cumplidos,
    pendientes: a.pendientes + f.pendientes, proximos: a.proximos + f.proximos
  }), { emps: 0, cumplidos: 0, pendientes: 0, proximos: 0 });
  const tr = (f, esTot) => `<tr${esTot ? ' class="tot"' : ''}>
      <td>${esc(f.dep)}</td><td class="n">${f.emps}</td><td class="n">${f.cumplidos}</td>
      <td class="n">${f.pendientes}</td><td class="n">${f.proximos}</td></tr>`;
  return `
    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 8px">🏢 Resumen por departamento</h2>
      <div class="qxdep"><table>
        <thead><tr><th>Departamento</th><th class="n">Empleados</th><th class="n">Cumplidos</th>
          <th class="n">Pendientes</th><th class="n">Próximos venc.</th></tr></thead>
        <tbody>${filas.map(f => tr(f)).join('')}${tr({ dep: 'TOTAL', ...tot }, true)}</tbody>
      </table></div>
    </div>`;
}

/** Pinta el «Panel de RRHH»: vencimientos, pendientes y datos a revisar. */
function qxRenderVenc() {
  const v = $('#view');
  const r = qxAnalizaVenc(qxVencMeses);

  const fila = (e, titulo, detalle, i) => `
    <div class="row2" data-a="qxficha" data-id="${esc(e.id)}" data-from="venc" style="padding-left:14px">
      <span class="tile" style="background:${tileColor(e.departamento || 'General')}">${ic('id')}</span>
      <span class="nm">
        <span class="nm-top"><b>${esc(e.nombre)}</b></span>
        <span class="nm-sub">${esc(e.cargo || 'Sin cargo')}${e.departamento ? ' · ' + esc(e.departamento) : ''}</span>
      </span>
      <span class="hide-m" style="text-align:right;margin-right:10px;flex:none">
        <b>${esc(titulo)}</b><br><span class="mu">${esc(detalle)}</span>
      </span>
      ${i == null ? '' : '<button class="btn qxgbtn" data-a="qxgestion" data-id="' + esc(e.id) + '" data-i="' + i + '" title="Registrar la gestión del trámite">' + ic('ok') + 'Gestionar</button>'}
      ${ic('chevron')}
    </div>`;

  const mesBtn = n => `<button class="qxps${qxVencMeses === n ? ' on' : ''}" data-a="qxvencmes" data-n="${n}">${n} meses</button>`;
  const bloque = (titulo, lista, vacio) => `
    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 8px">${titulo}</h2>
      ${lista ? '<div class="tree">' + lista + '</div>' : '<div class="mu">' + vacio + '</div>'}
    </div>`;

  v.innerHTML = `
    <div class="vhead"><h1>Panel de RRHH</h1></div>
    ${qxSheetTabs()}
    <div class="mu" style="margin-bottom:12px">${r.total} empleado(s) en la base · ${r.conFecha} con fecha de ingreso</div>

    <div class="qxtools">
      <span class="mu">Vencimientos de los próximos:</span>
      ${mesBtn(3)}${mesBtn(6)}${mesBtn(12)}
      <span class="sp"></span>
      <button class="btn" data-a="qxcalxlsx">${ic('dl')}Exportar calendario</button>
      <button class="btn" data-a="qxvencprint">${ic('pr')}Imprimir panel</button>
    </div>

    <div class="qxcards">
      <div class="qxc amber">
        <span class="ico">${ic('clock')}</span>
        <span class="tx"><span class="num">${r.proximos.length}</span>
        <span class="lab">vencen en los próximos<br>${r.meses} meses</span></span>
      </div>
      <div class="qxc teal">
        <span class="ico">${ic('ok')}</span>
        <span class="tx"><span class="num">${r.pendientes.length}</span>
        <span class="lab">ya vencieron y siguen<br>sin gestionar</span></span>
      </div>
      <div class="qxc blue">
        <span class="ico">${ic('help')}</span>
        <span class="tx"><span class="num">${r.revisar.length}</span>
        <span class="lab">datos a revisar<br>(incompletos o incoherentes)</span></span>
      </div>
    </div>

    ${bloque('⏰ Próximos vencimientos',
      r.proximos.map(x => fila(x.e, QX_QUIN_LABELS[x.i], qxFmtCorto(x.iso) + ' · en ' + x.dias + ' días', x.i)).join(''),
      'Ningún quinquenio vence en los próximos ' + r.meses + ' meses.')}

    ${bloque('⚠️ Pendientes de gestionar (ya vencieron)',
      r.pendientes.map(x => fila(x.e, QX_QUIN_LABELS[x.i], qxFmtCorto(x.iso) + ' · hace ' + x.dias + ' días', x.i)).join(''),
      'Todo al día ✅')}

    ${bloque('🔎 Datos a revisar',
      r.revisar.map(x => fila(x.e, '⚠️ Revisar', x.texto)).join(''),
      'Los datos están completos ✅')}

    ${qxCalHTML(12)}

    ${qxDeptoHTML(qxPorDepto(r.meses))}`;
}

/** PDF del panel de RRHH (próximos vencimientos, pendientes y revisión). */
function qxPrintVenc() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) return toast('Motor de PDF no disponible');
  const r = qxAnalizaVenc(qxVencMeses);
  const doc = new jsPDF();
  const M = 14;
  let y = 16;

  doc.setFontSize(14); doc.setFont(undefined, 'bold');
  doc.text('Panel de RRHH · Quinquenios y Adelantos', M, y); y += 7;
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text('Generado: ' + new Date().toLocaleDateString('es-VE') + '   ·   Próximos ' + r.meses + ' meses', M, y); y += 10;

  const seccion = (titulo, filas) => {
    if (y > 265) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.text(titulo, M, y); y += 6;
    doc.setFontSize(9); doc.setFont(undefined, 'normal');
    if (!filas.length) { doc.text('(ninguno)', M + 2, y); y += 6; }
    filas.forEach(t => {
      if (y > 282) { doc.addPage(); y = 20; }
      doc.text(String(t).slice(0, 110), M + 2, y); y += 5;
    });
    y += 4;
  };

  seccion('Proximos vencimientos (' + r.proximos.length + ')',
    r.proximos.map(x => qxFmtCorto(x.iso) + '  ·  ' + x.e.nombre + '  ·  ' + QX_QUIN_LABELS[x.i] + '  ·  en ' + x.dias + ' dias'));
  seccion('Pendientes de gestionar (' + r.pendientes.length + ')',
    r.pendientes.map(x => qxFmtCorto(x.iso) + '  ·  ' + x.e.nombre + '  ·  ' + QX_QUIN_LABELS[x.i] + '  ·  hace ' + x.dias + ' dias'));
  seccion('Datos a revisar (' + r.revisar.length + ')',
    r.revisar.map(x => x.e.nombre + '  ·  ' + x.texto));

  qxOpenPrint(doc);
}

/* --------- Gestión del trámite (Pendiente → En proceso → Pagado) -------- */

/** Abre el diálogo para gestionar el quinquenio i del empleado. */
function qxGestionDialog(id, i) {
  const e = ((qxData && qxData.empleados) || []).find(x => x.id === id);
  if (!e || !e.quinquenios[i]) return;
  const q = e.quinquenios[i];
  const fecha = qxFechaQuin(e, i);
  const dias = qxDiasPara(fecha);
  const cuando = dias === null ? '' :
    (dias >= 0 ? ' · faltan ' + dias + ' días' : ' · vencido hace ' + (-dias) + ' días');
  openModal(`<h2>Gestionar ${QX_QUIN_LABELS[i]}</h2>
    <div class="mu" style="margin-bottom:12px">${esc(e.nombre)} · ${esc(e.cargo || 'sin cargo')}<br>
      Se cumple el <b>${esc(qxFmtCorto(fecha) || '—')}</b>${esc(cuando)}</div>
    <div class="f"><label>Estado del trámite</label>
      <select id="qxg-gestion">${qxSelOpts(QX_GESTION_OPTS, q.gestion, '—')}</select></div>
    <div class="f"><label>Fecha de gestión</label><input id="qxg-fecha" type="date" value="${esc(q.fechaGestion)}"></div>
    <div class="f"><label>Responsable</label><input id="qxg-resp" type="text" value="${esc(q.responsable)}" placeholder="Quién lo tramita"></div>
    <div class="f"><label>Nota</label><input id="qxg-nota" type="text" value="${esc(q.nota)}" placeholder="Observaciones"></div>
    <label class="qxchk"><input type="checkbox" id="qxg-cumple"${q.estado === 'CUMPLE' ? ' checked' : ''}>
      <span>El quinquenio <b>se cumple</b> (marcar CUMPLE)</span></label>
    <div class="fx"><button class="btn" data-a="close">Cancelar</button>
      <button class="btn p" data-a="qxgsave" data-id="${esc(id)}" data-i="${i}">${ic('ok')}Guardar</button></div>`);
}

/** Guarda el estado del trámite de un quinquenio. */
async function qxGestionSave(id, i) {
  const e = ((qxData && qxData.empleados) || []).find(x => x.id === id);
  if (!e || !e.quinquenios[i]) return;
  const q = e.quinquenios[i];
  const g = document.getElementById('qxg-gestion');
  const f = document.getElementById('qxg-fecha');
  const r = document.getElementById('qxg-resp');
  const n = document.getElementById('qxg-nota');
  const c = document.getElementById('qxg-cumple');
  if (g) q.gestion = g.value;
  if (f) q.fechaGestion = f.value;
  if (r) q.responsable = r.value.trim();
  if (n) q.nota = n.value.trim();
  if (c) {
    if (c.checked) q.estado = 'CUMPLE';
    else if (q.estado === 'CUMPLE') q.estado = '';
  }
  /* Si se marca CUMPLE y nadie puso estado de trámite, se da por aprobado. */
  if (q.estado === 'CUMPLE' && !q.gestion) q.gestion = 'Aprobado';
  await qxPersist();
  closeModal();
  qxBadgeN = -1;             // fuerza el recálculo del aviso del menú
  renderQx();
  toast('Gestión guardada ✅');
}

/* ------------------- Constancia de quinquenio (PDF) --------------------- */

/** Diálogo para emitir la constancia: datos de la empresa y del firmante. */
function qxConstanciaDialog(id, i) {
  const e = ((qxData && qxData.empleados) || []).find(x => x.id === id);
  if (!e || !e.quinquenios[i]) return;
  const emp = (qxData && qxData.empresa) || {};
  const fecha = qxFechaQuin(e, i);
  openModal(`<h2>Constancia · ${QX_QUIN_LABELS[i]}</h2>
    <div class="mu" style="margin-bottom:12px">${esc(e.nombre)}<br>
      ${QX_QUIN_LABELS[i]} cumplido el <b>${esc(qxFmtCorto(fecha) || '—')}</b></div>
    <div class="f"><label>Nombre de la empresa</label><input id="qxc-emp" type="text" value="${esc(emp.nombre || '')}" placeholder="Razón social"></div>
    <div class="f"><label>RIF</label><input id="qxc-rif" type="text" value="${esc(emp.rif || '')}" placeholder="J-12345678-9"></div>
    <div class="f"><label>Ciudad</label><input id="qxc-ciudad" type="text" value="${esc(emp.ciudad || '')}" placeholder="Caracas"></div>
    <div class="f"><label>Cargo del firmante</label><input id="qxc-cargo" type="text" value="${esc(emp.cargoFirma || '')}" placeholder="Gerente de Recursos Humanos"></div>
    <div class="f"><label>Nombre del firmante</label><input id="qxc-firma" type="text" value="${esc(emp.nombreFirma || '')}"></div>
    <div class="mu">Estos datos se recuerdan para las próximas constancias.</div>
    <div class="fx"><button class="btn" data-a="close">Cancelar</button>
      <button class="btn p" data-a="qxconstgen" data-id="${esc(id)}" data-i="${i}">${ic('pr')}Generar PDF</button></div>`);
}

/** Guarda los datos de la empresa, arma la constancia y abre la impresión. */
async function qxConstanciaGen(id, i) {
  const e = ((qxData && qxData.empleados) || []).find(x => x.id === id);
  if (!e || !e.quinquenios[i]) return;
  const val = k => { const el = document.getElementById(k); return el ? String(el.value || '').trim() : ''; };
  qxData.empresa = {
    nombre: val('qxc-emp'), rif: val('qxc-rif'), ciudad: val('qxc-ciudad'),
    cargoFirma: val('qxc-cargo'), nombreFirma: val('qxc-firma')
  };
  await qxPersist();
  closeModal();
  const doc = qxConstanciaPDF(e, i, qxData.empresa);
  if (doc) qxOpenPrint(doc);
}

/** Arma el PDF de la constancia de quinquenio (documento para el trabajador). */
function qxConstanciaPDF(e, i, emp) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { toast('Motor de PDF no disponible'); return null; }
  const q = e.quinquenios[i] || {};
  const doc = new jsPDF();
  const W = 210, M = 24;
  let y = 26;

  doc.setFontSize(13); doc.setFont(undefined, 'bold');
  doc.text(emp.nombre || 'LA EMPRESA', W / 2, y, { align: 'center' }); y += 6;
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  if (emp.rif) { doc.text(emp.rif, W / 2, y, { align: 'center' }); y += 5; }
  doc.text('Recursos Humanos', W / 2, y, { align: 'center' }); y += 13;

  doc.setFontSize(14); doc.setFont(undefined, 'bold');
  doc.text('CONSTANCIA DE QUINQUENIO', W / 2, y, { align: 'center' }); y += 14;

  doc.setFontSize(11); doc.setFont(undefined, 'normal');
  const texto = 'Quien suscribe, ' + (emp.cargoFirma || 'en su carácter de representante de la empresa') +
    ', hace constar que el(la) ciudadano(a) ' + (e.nombre || '—') +
    ', titular de la cédula de identidad N.º ' + (e.numPersona || '—') +
    ', ingresó a esta empresa el ' + (qxFmtCorto(e.fechaIngreso) || '—') +
    ', y en consecuencia cumplió su ' + QX_QUIN_LABELS[i] +
    ' el ' + (qxFmtCorto(qxFechaQuin(e, i)) || '—') +
    ', correspondiente al período ' + (q.periodo || '—') + '.';
  const lineas = doc.splitTextToSize(texto, W - M * 2);
  doc.text(lineas, M, y); y += lineas.length * 5.5 + 10;

  /* Cuadro de datos */
  doc.setFontSize(10);
  [
    ['Trabajador(a)', e.nombre || '—'],
    ['Cédula / N.º de personal', e.numPersona || '—'],
    ['Cargo', e.cargo || '—'],
    ['Departamento', e.departamento || '—'],
    ['Fecha de ingreso', qxFmtCorto(e.fechaIngreso) || '—'],
    ['Antigüedad', qxAntiguedad(e.fechaIngreso) || '—'],
    [QX_QUIN_LABELS[i], (qxFmtCorto(qxFechaQuin(e, i)) || '—') + '  ·  ' + (q.periodo || 'sin período')],
    ['Estado del trámite', q.gestion || '—'],
    ['Fecha de gestión', qxFmtCorto(q.fechaGestion) || '—']
  ].forEach(f => {
    doc.setFont(undefined, 'bold'); doc.text(f[0] + ':', M, y);
    doc.setFont(undefined, 'normal'); doc.text(String(f[1]), M + 64, y);
    y += 6;
  });
  y += 8;

  doc.setFontSize(11);
  const hoy = new Date();
  doc.text('Se expide la presente constancia en ' + (emp.ciudad || '—') + ', a los ' +
    hoy.getDate() + ' días del mes de ' + QX_MESES[hoy.getMonth()].toLowerCase() +
    ' de ' + hoy.getFullYear() + '.', M, y);
  y += 32;

  /* Líneas de firma */
  doc.setDrawColor(120); doc.setLineWidth(0.4);
  doc.line(M, y, M + 68, y);
  doc.line(W - M - 68, y, W - M, y);
  doc.setFontSize(9);
  doc.text(emp.nombreFirma || 'Firma autorizada', M, y + 5);
  doc.text(emp.cargoFirma || '', M, y + 10);
  doc.text(e.nombre || '', W - M - 68, y + 5);
  doc.text('Trabajador(a)', W - M - 68, y + 10);

  return doc;
}

/** Vista principal «Quin/Adel»: pestañas MACRO · Hoja 1 · Hoja 3. */
async function renderQx() {
  await qxLoad();
  qxCatView = null;
  qxView = { mode: 'home', id: null };
  if (qxSheet === 'venc') return qxRenderVenc();
  if (qxSheet === 'hoja1' || qxSheet === 'hoja3') return qxRenderSheet(qxSheet);
  return qxRenderMacro();
}

/** Pestaña «MACRO»: buscador + tarjetas + importar (clon de la hoja MACRO). */
async function qxRenderMacro() {
  const v = $('#view');
  const st = qxStats();
  const conBase = st.emps.length > 0;

  const totalQ = st.q[0] + st.q[1] + st.q[2];
  const tarjetas = conBase ? `
    <div class="qxcards">
      <div class="qxc teal" data-a="qxcat" data-cat="quinquenios" title="Ver quinquenios">
        <span class="ico">${ic('clock')}</span>
        <span class="tx">
          <span class="num">${totalQ}</span>
          <span class="lab">quinquenios cumplidos<br>1er: <b>${st.q[0]}</b> · 2do: <b>${st.q[1]}</b> · 3er: <b>${st.q[2]}</b></span>
        </span>
      </div>
      <div class="qxc amber" data-a="qxcat" data-cat="adelantos" title="Ver adelantos">
        <span class="ico">${ic('dl')}</span>
        <span class="tx">
          <span class="num">${st.conAdel}</span>
          <span class="lab">empleados con adelantos<br>registrados</span>
        </span>
      </div>
      <div class="qxc blue">
        <span class="ico">${ic('id')}</span>
        <span class="tx">
          <span class="num">${st.emps.length}</span>
          <span class="lab">empleados en la base</span>
        </span>
      </div>
    </div>` : '';

  const buscador = conBase ? `
    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 8px">Buscar empleado</h2>
      <div class="mu" style="font-size:13px;margin-bottom:8px">Seleccione o ingrese el Nombre de la Persona:</div>
      <input type="text" id="qxsearch" placeholder="Nombre, cédula, cargo o departamento…" value="${esc(qxBuscar)}" autocomplete="off">
      <div id="qxresults" style="margin-top:10px">${qxResultsHtml()}</div>
    </div>` : `
    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 8px">Cargar base inicial</h2>
      <div class="mu" style="font-size:13px;margin-bottom:10px">La app incluye la base del archivo MACRO_QUINQUENIOS.xlsx (338 trabajadores, hojas Hoja 1 y Hoja 3). Tócala para precargarla cifrada en tu bóveda (solo en este dispositivo, bajo tu contraseña).</div>
      <button class="btn p" data-a="qxseed" style="width:100%">Cargar base inicial</button>
    </div>`;

  v.innerHTML = `
    <div class="vhead"><h1>Quinquenios y Adelantos</h1><span class="sp"></span><span id="qxstatus" class="mu"></span></div>
    ${qxSheetTabs()}
    <div class="mu" style="margin-bottom:14px">${st.emps.length} empleado${st.emps.length === 1 ? '' : 's'} en la base · clon de la hoja MACRO${qxData && qxData.gen ? ' · guardado ' + esc(qxData.gen) : ''}</div>
    ${buscador}
    ${tarjetas}
    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 8px">Importar desde Excel</h2>
      <div class="mu" style="font-size:13px">Archivo .xlsx/.xls. Si tiene la estructura del MACRO (hoja con «NOMBRE COMPLETO») se importa automáticamente; si no, te pide mapear las columnas.</div>
      <input type="file" id="qxfile" accept=".xlsx,.xls" style="margin:8px 0;width:100%">
      <button class="btn" data-a="qximport" style="width:100%">Seleccionar archivo Excel</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" data-a="qxprintall">${ic('pr')}Imprimir listado</button>
      ${conBase ? '<button class="btn" data-a="qxcalcall">' + ic('rot') + 'Calcular periodos vacíos</button>' : ''}
      ${conBase ? '<button class="btn" data-a="qxexportxlsx">' + ic('dl') + 'Exportar Excel (.xlsx)</button>' : ''}
      ${conBase ? '<button class="btn" data-a="qxexport">' + ic('dl') + 'Exportar base (JSON)</button>' : ''}
    </div>`;

  /* Manejadores por listener (la CSP prohíbe los atributos on*= inline). */
  const sb = document.getElementById('qxsearch');
  if (sb) sb.oninput = () => qxSearchUpdate();
  const fq = document.getElementById('qxfile');
  if (fq) fq.onchange = () => QX_ACTIONS.qximportfile();
}

/** HTML de los resultados del buscador (tabla «RESULTADOS DE BÚSQUEDA»). */
function qxResultsHtml() {
  if (!qxBuscar.trim()) return '<div class="mu" style="font-size:13px">Escribe al menos una parte del nombre para ver resultados.</div>';
  const res = qxSearch(qxBuscar);
  if (!res.length) return '<div class="mu" style="font-size:13px">Sin resultados para «' + esc(qxBuscar) + '».</div>';
  return '<div style="border:1px solid var(--bd);border-radius:12px;overflow:hidden">' + res.map(e => `
    <div class="row2" data-a="qxficha" data-id="${esc(e.id)}" style="padding-left:12px">
      <span class="tile" style="background:#3949ab">${ic('id')}</span>
      <span class="nm"><b>${esc(e.nombre)}</b><span>${esc(e.cargo || 'Sin cargo')} · ing. ${esc(qxDash(e.fechaIngreso))}</span></span>
      ${ic('chevron')}
    </div>`).join('') + '</div>';
}

/** Actualiza solo la zona de resultados (mantiene el foco en el input). */
function qxSearchUpdate() {
  const inp = document.getElementById('qxsearch');
  if (!inp) return;
  qxBuscar = inp.value;
  const box = document.getElementById('qxresults');
  if (box) box.innerHTML = qxResultsHtml();
}

/** Lista por categoría (adelantos / quinquenios) como en la hoja MACRO. */
async function renderQxList(cat) {
  await qxLoad();
  qxCatView = cat;
  qxView = { mode: 'list', id: null };
  const st = qxStats();
  const v = $('#view');
  const esQuinq = cat === 'quinquenios';
  const list = st.emps.filter(e => esQuinq
    ? e.quinquenios.some(q => q.estado)
    : e.adelantos.some(bloque => bloque.some(a => a.detalle || a.periodo || a.anios)));

  const filas = list.map(e => {
    let detalle;
    if (esQuinq) {
      detalle = e.quinquenios.map((q, i) => q.estado
        ? `<span class="qxbadge ${q.estado === 'CUMPLE' ? 'ok' : 'no'}"><span class="dot"></span>${QX_QUIN_LABELS[i].split(' ')[0]}: ${q.estado}</span>`
        : '').filter(Boolean).join(' ');
    } else {
      const n = e.adelantos.reduce((a, bloque) => a + bloque.filter(x => x.detalle || x.periodo || x.anios).length, 0);
      detalle = `<span class="qxbadge ac">${n} adelanto${n === 1 ? '' : 's'}</span>`;
    }
    return `<div class="row2" data-a="qxficha" data-id="${esc(e.id)}" data-from="${esc(cat)}" style="padding-left:12px">
      <span class="tile" style="background:${esQuinq ? '#00695c' : '#e65100'}">${esQuinq ? ic('clock') : ic('dl')}</span>
      <span class="nm"><b>${esc(e.nombre)}</b><span>${esc(e.cargo || '—')} · ${esc(qxAntiguedad(e.fechaIngreso) || 'sin fecha')}</span></span>
      <span class="hide-m" style="margin-right:8px">${detalle}</span>
      ${ic('chevron')}
    </div>`;
  }).join('');

  v.innerHTML = `
    <div class="vhead"><h1>${esQuinq ? 'Quinquenios' : 'Adelantos'}</h1></div>
    <div style="margin-bottom:12px"><button class="btn" data-a="qxback">${ic('chevron')}Volver</button></div>
    <div class="mu" style="margin-bottom:10px">${list.length} empleado${list.length === 1 ? '' : 's'} · toca uno para abrir su ficha</div>
    ${list.length ? '<div style="border:1px solid var(--bd);border-radius:12px;overflow:hidden">' + filas + '</div>' : '<div class="empty">' + ic('search') + '<br>Sin registros en esta categoría.</div>'}`;
}

/* ------------------ Hoja de cálculo (MACRO · Hoja 1 · Hoja 3) ------------ */

/** Barra de pestañas con las 3 hojas del Excel. */
function qxSheetTabs() {
  const tabs = [['macro', 'MACRO'], ['venc', 'Panel RRHH'], ['hoja1', 'Hoja 1'], ['hoja3', 'Hoja 3']];
  return '<div class="qxtabs">' + tabs.map(t =>
    '<button class="qxtab' + (qxSheet === t[0] ? ' on' : '') + '" data-a="qxsheet" data-s="' + t[0] + '">' + t[1] + '</button>'
  ).join('') + '</div>';
}

/** Columnas de la hoja «Hoja 1» (25 columnas del Excel MACRO). */
function qxHoja1Cols() {
  const cols = [
    { h: 'NOMBRE COMPLETO', qx: 'nombre', w: 230, cls: 'qxname' },
    { h: 'FECHA DE INGRESO', qx: 'fecha', type: 'date', w: 140 },
    { h: 'CARGO', qx: 'cargo', w: 240 },
    { h: 'ANTIGÜEDAD (AÑOS)', calc: 'ant', w: 160 }
  ];
  const quins = ['1ER QUINQUENIO', '2DO QUINQUENIO', '3ER QUINQUENIO'];
  const adels = ['PRIMER ADELANTO', 'SEGUNDO ADELANTO', 'TERCER ADELANTO'];
  for (let k = 0; k < 3; k++) {
    cols.push({ h: quins[k], qx: 'quin-estado', i: k, type: 'select', opts: QX_QUIN_OPTS, w: 150 });
    cols.push({ h: 'PERIODO', qx: 'quin-periodo', i: k, w: 190 });
    cols.push({ h: 'ESTADO DEL VISADO', qx: 'quin-visado', i: k, type: 'select', opts: QX_VISADO_OPTS, w: 150 });
    cols.push({ h: adels[k], qx: 'adel-detalle', i: k, j: 0, w: 190 });
    cols.push({ h: 'PERIODO', qx: 'adel-periodo', i: k, j: 0, w: 190 });
    cols.push({ h: 'AÑOS', qx: 'adel-anios', i: k, j: 0, w: 90 });
    cols.push({ h: 'ESTADO DEL VISADO', qx: 'adel-visado', i: k, j: 0, type: 'select', opts: QX_VISADO_OPTS, w: 150 });
  }
  return cols;
}

/** Lee el valor de una columna para un empleado (a prueba de bases incompletas). */
function qxColValue(e, c) {
  const t = c.qx;
  if (t === 'nombre') return e.nombre;
  if (t === 'fecha') return e.fechaIngreso;
  if (t === 'cargo') return e.cargo;
  const q = (e.quinquenios && e.quinquenios[c.i]) || {};
  if (t === 'quin-estado') return q.estado || '';
  if (t === 'quin-periodo') return q.periodo || '';
  if (t === 'quin-visado') return q.visado || '';
  const a = (e.adelantos && e.adelantos[c.i] && e.adelantos[c.i][c.j || 0]) || {};
  if (t === 'adel-detalle') return a.detalle || '';
  if (t === 'adel-periodo') return a.periodo || '';
  if (t === 'adel-anios') return a.anios || '';
  if (t === 'adel-visado') return a.visado || '';
  return e[t] == null ? '' : e[t];
}

/** Celda editable (input/select) o calculada (antigüedad). */
function qxCellHtml(e, c) {
  if (c.calc === 'ant') return '<span data-ant>' + esc(qxAntiguedad(e.fechaIngreso) || '—') + '</span>';
  const val = qxColValue(e, c);
  const attrs = 'data-qx="' + esc(c.qx) + '"' +
    (c.i != null ? ' data-i="' + c.i + '"' : '') +
    (c.j != null ? ' data-j="' + c.j + '"' : '');
  if (c.type === 'select') return '<select ' + attrs + '>' + qxSelOpts(c.opts, val, '—') + '</select>';
  if (c.type === 'date') return '<input type="date" ' + attrs + ' value="' + esc(val) + '">';
  return '<input type="text" ' + attrs + ' value="' + esc(val) + '">';
}

/** Empleados filtrados por el buscador de la hoja (ordenados por nombre). */
function qxSheetList() {
  const t = qxNorm(qxFilter);
  let list = ((qxData && qxData.empleados) || []).slice();

  /* Buscador de texto libre. */
  if (t) {
    list = list.filter(e => {
      const hay = [e.nombre, e.cargo, e.departamento, e.numPersona, e.codUbicacion, e.sindicato, e.categoria].join(' ');
      return qxNorm(hay).indexOf(t) >= 0;
    });
  }
  /* Filtros por departamento, estado del quinquenio y estado del trámite. */
  if (qxFDepto) list = list.filter(e => (e.departamento || '') === qxFDepto);
  if (qxFQuin) list = list.filter(e => qxFQuin === 'sin'
    ? !e.quinquenios.some(q => q.estado)
    : e.quinquenios.some(q => q.estado === qxFQuin));
  if (qxFGest) list = list.filter(e => qxFGest === 'sin'
    ? !e.quinquenios.some(q => q.gestion)
    : e.quinquenios.some(q => q.gestion === qxFGest));

  /* Orden por la columna elegida (clic en el encabezado). */
  const cols = qxSheet === 'hoja1' ? qxHoja1Cols() : QX_HOJA3_SHEET_COLS;
  if (qxSort.col >= 0 && qxSort.col < cols.length) {
    const c = cols[qxSort.col];
    list.sort((a, b) => qxSort.dir * qxCmp(qxSortVal(a, c), qxSortVal(b, c)));
  }
  return list;
}

/** Compara dos valores de la hoja: números, fechas ISO o texto en español. */
function qxCmp(a, b) {
  const sa = String(a == null ? '' : a).trim();
  const sb = String(b == null ? '' : b).trim();
  const num = s => (/^-?[\d.,]+$/.test(s) ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : NaN);
  const na = num(sa), nb = num(sb);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  if (!sa) return 1;              // los vacíos, al final
  if (!sb) return -1;
  return qxNorm(sa).localeCompare(qxNorm(sb), 'es', { numeric: true, sensitivity: 'base' });
}

/** Valor de una columna para ordenar (la antigüedad se ordena por fecha de ingreso). */
function qxSortVal(e, c) {
  if (c.calc === 'ant') return e.fechaIngreso || '';
  return qxColValue(e, c);
}

/** Departamentos distintos de la base (para el filtro de la hoja). */
function qxDeptos() {
  const set = {};
  ((qxData && qxData.empleados) || []).forEach(e => {
    const d = String(e.departamento || '').trim();
    if (d) set[d] = 1;
  });
  return Object.keys(set).sort((a, b) => a.localeCompare(b, 'es'));
}

/** Opciones de un filtro de la hoja, con «—» y una opción extra para los vacíos. */
function qxFiltroOpts(vals, cur, vacio, sin) {
  return '<option value=""' + (cur ? '' : ' selected') + '>' + esc(vacio) + '</option>' +
    vals.map(o => '<option value="' + esc(o) + '"' + (cur === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') +
    '<option value="sin"' + (cur === 'sin' ? ' selected' : '') + '>' + esc(sin) + '</option>';
}

/** Repinta solo la tabla de la hoja (al ordenar, filtrar o paginar). */
function qxGridRefresh() {
  const wrap = document.getElementById('qxgridwrap');
  if (wrap) wrap.innerHTML = qxGridAreaHtml();
}

/** ¿Hay algún filtro u orden activo en la hoja? */
const qxFiltrosActivos = () => !!(qxFilter || qxFDepto || qxFQuin || qxFGest || qxSort.col >= 0);

/** HTML de la tabla + paginador de la hoja activa. */
function qxGridAreaHtml() {
  const cols = qxSheet === 'hoja1' ? qxHoja1Cols() : QX_HOJA3_SHEET_COLS;
  const list = qxSheetList();
  if (!list.length) return '<div class="empty">' + ic('search') + '<br>No hay filas que coincidan.</div>';
  const total = list.length;
  const size = qxPageSize > 0 ? qxPageSize : total;
  const pages = Math.max(1, Math.ceil(total / size));
  if (qxPage >= pages) qxPage = pages - 1;
  if (qxPage < 0) qxPage = 0;
  const from = qxPage * size;
  const rows = list.slice(from, from + size);
  const head = '<tr><th class="qxn">#</th>' +
    cols.map((c, k) => {
      const on = qxSort.col === k;
      return '<th' + (c.cls ? ' class="' + c.cls + '"' : '') + ' style="min-width:' + c.w + 'px">' +
        '<button class="qxsorth' + (on ? ' on' : '') + '" data-a="qxsort" data-k="' + k + '" title="Ordenar por «' + esc(c.h) + '»">' +
        esc(c.h) + (on ? (qxSort.dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>';
    }).join('') +
    '<th class="qxa">·</th></tr>';
  const body = rows.map((e, idx) => {
    const tds = cols.map(c => '<td data-h="' + esc(c.h) + '"' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + qxCellHtml(e, c) + '</td>').join('');
    return '<tr data-id="' + esc(e.id) + '">' +
      '<td class="qxn" data-h="#"><button class="qxopen" data-a="qxficha" data-id="' + esc(e.id) + '" data-from="' + qxSheet + '" title="Abrir ficha">' + (from + idx + 1) + '</button></td>' +
      tds +
      '<td class="qxa" data-h="·"><button class="qxdel" data-a="qxdelrow" data-id="' + esc(e.id) + '" title="Eliminar trabajador">×</button></td>' +
      '</tr>';
  }).join('');
  const pager = '<div class="qxpager">' +
    '<button class="btn" data-a="qxpage" data-p="' + (qxPage - 1) + '"' + (qxPage <= 0 ? ' disabled' : '') + '>‹ Anterior</button>' +
    '<span class="mu">Página ' + (qxPage + 1) + ' de ' + pages + ' · ' + total + ' fila' + (total === 1 ? '' : 's') + '</span>' +
    '<button class="btn" data-a="qxpage" data-p="' + (qxPage + 1) + '"' + (qxPage >= pages - 1 ? ' disabled' : '') + '>Siguiente ›</button>' +
    '<span class="sp"></span><span class="mu">Filas por página:</span>' +
    [50, 100, 200, 0].map(n => '<button class="qxps' + (qxPageSize === n ? ' on' : '') + '" data-a="qxpagesize" data-n="' + n + '">' + (n || 'Todas') + '</button>').join('') +
    '</div>';
  return '<div class="qxgrid"><table class="qxs"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' + pager;
}

/** Pestaña de una hoja de cálculo (Hoja 1 / Hoja 3), totalmente editable. */
async function qxRenderSheet(sheet) {
  const v = $('#view');
  const emps = (qxData && qxData.empleados) || [];
  if (!qxData || !emps.length) {
    v.innerHTML = '<div class="vhead"><h1>Quinquenios y Adelantos</h1></div>' + qxSheetTabs() +
      '<div class="pn"><h2 style="font-size:15px">Cargar base inicial</h2>' +
      '<div class="mu" style="margin-bottom:10px">Todavía no hay datos. Carga la base incluida o importa tu Excel.</div>' +
      '<button class="btn p" data-a="qxseed" style="width:100%">Cargar base inicial</button></div>';
    return;
  }
  const isH1 = sheet === 'hoja1';
  v.innerHTML = `
    <div class="vhead"><h1>${isH1 ? 'Hoja 1' : 'Hoja 3'} · ${emps.length} trabajadores</h1><span class="sp"></span><span id="qxstatus" class="mu"></span></div>
    ${qxSheetTabs()}
    <div class="qxtools">
      <input type="text" id="qxfilter" placeholder="Filtrar por nombre, cargo, depto…" value="${esc(qxFilter)}" autocomplete="off">
      <select id="qxfdepto">${qxFiltroOpts(qxDeptos(), qxFDepto, 'Departamento: todos', 'Sin departamento')}</select>
      <select id="qxfquin">${qxFiltroOpts(['CUMPLE', 'NO CUMPLE'], qxFQuin, 'Quinquenio: todos', 'Sin definir')}</select>
      <select id="qxfgest">${qxFiltroOpts(QX_GESTION_OPTS, qxFGest, 'Trámite: todos', 'Sin trámite')}</select>
      ${qxFiltrosActivos() ? '<button class="btn" data-a="qxfiltros">Limpiar filtros</button>' : ''}
      <button class="btn p" data-a="qxadd">${ic('plus')}Añadir trabajador</button>
      <button class="btn" data-a="qximport">${ic('dl')}Importar Excel</button>
      <button class="btn" data-a="qxexportxlsx">${ic('dl')}Exportar .xlsx</button>
      <button class="btn" data-a="qxreload" title="Vuelve a aplicar la base incluida sin borrar tus ediciones">Recargar base</button>
    </div>
    <div class="mu" style="margin:8px 0">Haz clic en cualquier celda para editarla; los cambios se guardan solos (cifrados). Pulsa un encabezado para ordenar y el número de fila para abrir la ficha completa (con los 4 adelantos por gestión).</div>
    <div id="qxgridwrap">${qxGridAreaHtml()}</div>`;
  const fi = document.getElementById('qxfilter');
  if (fi) fi.oninput = () => qxFilterUpdate();
  ['qxfdepto', 'qxfquin', 'qxfgest'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.onchange = () => {
      qxFDepto = (document.getElementById('qxfdepto') || {}).value || '';
      qxFQuin = (document.getElementById('qxfquin') || {}).value || '';
      qxFGest = (document.getElementById('qxfgest') || {}).value || '';
      qxPage = 0;
      renderQx();          // hay que repintar también la barra (botón «Limpiar filtros»)
    };
  });
  qxBindGrid();
}

/** Escucha los cambios de las celdas de la hoja de cálculo. */
function qxBindGrid() {
  const wrap = document.getElementById('qxgridwrap');
  if (!wrap || wrap.dataset.bound) return;
  wrap.dataset.bound = '1';
  wrap.addEventListener('change', ev => {
    const el = ev.target.closest('[data-qx]');
    if (!el) return;
    const tr = el.closest('tr');
    const id = tr && tr.dataset.id;
    const e = ((qxData && qxData.empleados) || []).find(x => x.id === id);
    if (!e) return;
    qxApplyEdit(e, el);
    if (el.dataset.qx === 'fecha') {
      const ant = tr.querySelector('[data-ant]');
      if (ant) ant.textContent = qxAntiguedad(e.fechaIngreso) || '—';
    }
  });
}

/** Cambia de hoja (pestañas MACRO · Hoja 1 · Hoja 3). */
function qxSwitchSheet(s) {
  if (['macro', 'venc', 'hoja1', 'hoja3'].indexOf(s) < 0) return;
  qxSheet = s; qxPage = 0; qxFilter = '';
  qxFDepto = ''; qxFQuin = ''; qxFGest = '';
  qxSort = { col: -1, dir: 1 };      // cada hoja tiene sus propias columnas
  renderQx();
}

/** Actualiza solo la tabla al filtrar (mantiene el foco en el input). */
function qxFilterUpdate() {
  const inp = document.getElementById('qxfilter');
  if (inp) qxFilter = inp.value;
  qxPage = 0;
  qxGridRefresh();
}

/** Diálogo «Añadir trabajador». */
function qxAddWorkerDialog() {
  openModal(`<h2>Añadir trabajador</h2>
    <div class="f"><label>Nombre completo *</label><input id="qxnew-nombre" type="text" placeholder="Nombres y apellidos"></div>
    <div class="f"><label>Fecha de ingreso</label><input id="qxnew-fecha" type="date"></div>
    <div class="f"><label>Cargo</label><input id="qxnew-cargo" type="text"></div>
    <div class="fx"><button class="btn" data-a="close">Cancelar</button><button class="btn p" data-a="qxaddconfirm">${ic('ok')}Añadir</button></div>`);
  setTimeout(() => { const i = document.getElementById('qxnew-nombre'); if (i) i.focus(); }, 60);
}

/** Crea el trabajador y lo guarda cifrado. */
async function qxAddWorkerConfirm() {
  const nombre = (document.getElementById('qxnew-nombre') || {}).value || '';
  const fecha = (document.getElementById('qxnew-fecha') || {}).value || '';
  const cargo = (document.getElementById('qxnew-cargo') || {}).value || '';
  if (!nombre.trim()) return toast('Escribe el nombre del trabajador');
  await qxLoad();
  if (!qxData) qxData = { v: 1, origen: '', gen: '', empleados: [] };
  let id = qxSlug(nombre);
  if (qxData.empleados.some(x => x.id === id)) id = id + '-' + Date.now().toString(36).slice(-4);
  const e = qxEmptyEmpleado(nombre.trim());
  e.id = id;
  e.fechaIngreso = qxToISO(fecha) || fecha;
  e.cargo = cargo.trim();
  qxData.empleados.push(e);
  qxData.empleados.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  await qxPersist();
  closeModal();
  renderQx();
  toast('Trabajador añadido ✅');
}

/** Elimina un trabajador de la base. */
async function qxDeleteWorker(id) {
  const e = ((qxData && qxData.empleados) || []).find(x => x.id === id);
  if (!e) return;
  const ok = await confirmDialog('Eliminar trabajador', 'Se eliminará «' + e.nombre + '» de la base.', 'Eliminar');
  if (!ok) return;
  qxData.empleados = qxData.empleados.filter(x => x.id !== id);
  await qxPersist();
  renderQx();
  toast('Trabajador eliminado');
}

/**
 * Crea una hoja a partir de una matriz y le aplica el ANCHO de cada columna.
 *
 * Sin `!cols`, Excel deja todas las columnas con el ancho por defecto (~8
 * caracteres), así que el texto se ve apretado, cortado o amontonado: eso era
 * lo que «distorsionaba» el Excel exportado. Aquí se traduce el ancho en
 * píxeles de cada columna (c.w) al ancho en caracteres que usa Excel (wch).
 */
function qxMakeSheet(aoa, cols) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = cols.map(c => ({ wch: Math.max(8, Math.round((c.w || 120) / 7)) }));
  ws['!rows'] = [{ hpt: 24 }];   // cabecera un poco más alta, para que se lea
  if (aoa.length > 1 && cols.length) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: cols.length - 1 } })
    };
  }
  return ws;
}

/** Exporta las 3 hojas a un archivo .xlsx real (con SheetJS). */
function qxExportXlsx() {
  if (!window.XLSX) return toast('SheetJS no está cargado');
  const emps = (qxData && qxData.empleados) || [];
  if (!emps.length) return toast('No hay datos para exportar');

  /* Hoja 1: columnas del Excel MACRO (con anchos). */
  const cols1 = qxHoja1Cols();
  const aoa1 = [cols1.map(c => c.h)];
  emps.forEach(e => aoa1.push(cols1.map(c => (c.calc === 'ant' ? qxAntiguedad(e.fechaIngreso) : qxColValue(e, c)))));

  /* Hoja 3: datos de RRHH (con anchos). */
  const aoa3 = [QX_HOJA3_SHEET_COLS.map(c => c.h)];
  emps.forEach(e => aoa3.push(QX_HOJA3_SHEET_COLS.map(c => qxColValue(e, c))));

  /* MACRO: resumen por empleado (con anchos). */
  const colsM = [
    { h: 'NOMBRE COMPLETO', w: 230 },
    { h: 'FECHA DE INGRESO', w: 140 },
    { h: 'CARGO', w: 240 },
    { h: 'ANTIGÜEDAD (AÑOS)', w: 160 },
    { h: '1ER QUINQUENIO', w: 150 },
    { h: '2DO QUINQUENIO', w: 150 },
    { h: '3ER QUINQUENIO', w: 150 },
    { h: 'ADELANTOS', w: 110 }
  ];
  const aoaM = [colsM.map(c => c.h)];
  emps.forEach(e => aoaM.push([
    e.nombre, e.fechaIngreso, e.cargo, qxAntiguedad(e.fechaIngreso),
    e.quinquenios[0].estado, e.quinquenios[1].estado, e.quinquenios[2].estado,
    e.adelantos.reduce((a, b) => a + b.filter(x => x.detalle || x.periodo || x.anios).length, 0)
  ]));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, qxMakeSheet(aoaM, colsM), 'MACRO');
  XLSX.utils.book_append_sheet(wb, qxMakeSheet(aoa1, cols1), 'Hoja1');
  XLSX.utils.book_append_sheet(wb, qxMakeSheet(aoa3, QX_HOJA3_SHEET_COLS), 'Hoja3');
  XLSX.writeFile(wb, 'MACRO_QUINQUENIOS.xlsx');
  toast('Excel exportado ✅');
}


/* --------------------------- Ficha editable ----------------------------- */

/** Opciones de la validación de datos del Excel (CUMPLE/NO CUMPLE · Sí/No). */
function qxSelOpts(vals, cur, placeholder) {
  return '<option value=""' + (cur ? '' : ' selected') + '>' + placeholder + '</option>' +
    vals.map(o => '<option value="' + esc(o) + '"' + (cur === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('');
}

/** Ficha del empleado: réplica editable de las dos tablas de la hoja MACRO. */
async function renderQxFicha(id, from) {
  await qxLoad();
  const e = ((qxData && qxData.empleados) || []).find(x => x.id === id);
  if (!e) { renderQx(); return; }
  qxView = { mode: 'ficha', id: id, from: from || null };
  const v = $('#view');

  /* Tabla 1: datos personales, antigüedad en vivo y los 3 quinquenios. */
  const filasQuinq = QX_QUIN_LABELS.map((lab, i) => {
    const q = e.quinquenios[i];
    return `<tr>
      <td><b>${lab}</b> (${(i + 1) * 5} años)</td>
      <td><select class="${qxEstadoCls(q.estado)}" data-qx="quin-estado" data-i="${i}">${qxSelOpts(['CUMPLE', 'NO CUMPLE'], q.estado, '—')}</select></td>
      <td><input type="text" data-qx="quin-periodo" data-i="${i}" value="${esc(q.periodo)}" placeholder="dd/mm/aaaa - dd/mm/aaaa"></td>
      <td><select data-qx="quin-visado" data-i="${i}">${qxSelOpts(['Sí', 'No'], q.visado, '—')}</select></td>
    </tr>`;
  }).join('');

  /* Tabla 2: 3 gestiones × (fila Gestión + 4 adelantos). */
  const bloquesAdel = e.adelantos.map((bloque, k) => {
    const filas = bloque.map((a, j) => `<tr>
      <td>${QX_ADEL_LABELS[j]}</td>
      <td><input type="text" data-qx="adel-detalle" data-i="${k}" data-j="${j}" value="${esc(a.detalle)}"></td>
      <td><input type="text" data-qx="adel-periodo" data-i="${k}" data-j="${j}" value="${esc(a.periodo)}" placeholder="dd/mm/aaaa - dd/mm/aaaa"></td>
      <td style="max-width:90px"><input type="text" data-qx="adel-anios" data-i="${k}" data-j="${j}" value="${esc(a.anios)}" inputmode="numeric"></td>
      <td style="max-width:110px"><select data-qx="adel-visado" data-i="${k}" data-j="${j}">${qxSelOpts(['Sí', 'No'], a.visado, '—')}</select></td>
    </tr>`).join('');
    return `
      <h2 style="font-size:15px;margin:18px 0 8px">Gestión ${k + 1} · ${QX_QUIN_LABELS[k]}</h2>
      <div style="overflow-x:auto"><table class="qxt">
        <tr><th style="min-width:150px">Adelanto</th><th style="min-width:150px">Detalle</th><th style="min-width:170px">Periodo</th><th style="max-width:90px">Años</th><th style="max-width:110px">Estado del Visado</th></tr>
        <tr><td><b>Gestión ${k + 1}</b></td><td colspan="4" class="mu">Quinquenio: ${esc(qxDash(e.quinquenios[k].periodo))}</td></tr>
        ${filas}
      </table></div>`;
  }).join('');

  /* Tabla 3: estado del trámite de cada quinquenio (flujo de trabajo de RRHH). */
  const filasGestion = QX_QUIN_LABELS.map((lab, i) => {
    const q = e.quinquenios[i];
    return `<tr>
      <td><b>${lab}</b></td>
      <td><select class="${qxGestionCls(q.gestion)}" data-qx="quin-gestion" data-i="${i}">${qxSelOpts(QX_GESTION_OPTS, q.gestion, '—')}</select></td>
      <td><input type="date" data-qx="quin-fechag" data-i="${i}" value="${esc(q.fechaGestion)}"></td>
      <td><input type="text" data-qx="quin-resp" data-i="${i}" value="${esc(q.responsable)}" placeholder="Quién lo tramita"></td>
      <td><input type="text" data-qx="quin-nota" data-i="${i}" value="${esc(q.nota)}" placeholder="Observaciones"></td>
      <td><button class="btn qxgbtn" data-a="qxconst" data-id="${esc(e.id)}" data-i="${i}" title="Emitir la constancia de quinquenio">${ic('pr')}Constancia</button></td>
    </tr>`;
  }).join('');

  v.innerHTML = `
    <div class="vhead"><h1>${esc(e.nombre)}</h1><span class="sp"></span><span id="qxstatus" class="mu"></span></div>
    <div style="margin-bottom:12px"><button class="btn" data-a="qxback">${ic('chevron')}Volver</button></div>
    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 8px">Datos y quinquenios</h2>
      <div class="fgrid">
        <div class="f"><label>Nombre completo</label><input type="text" data-qx="nombre" value="${esc(e.nombre)}"></div>
        <div class="f"><label>Fecha de ingreso</label><input type="date" data-qx="fecha" value="${esc(e.fechaIngreso)}"></div>
        <div class="f"><label>Cargo</label><input type="text" data-qx="cargo" value="${esc(e.cargo)}"></div>
        <div class="f"><label>Antigüedad</label><input type="text" id="qxant" value="${esc(qxAntiguedad(e.fechaIngreso))}" readonly style="opacity:.8"></div>
      </div>
      <div style="overflow-x:auto;margin-top:12px"><table class="qxt">
        <tr><th style="min-width:180px">Datos y concepto</th><th style="min-width:140px">Detalle / Cumplimiento</th><th style="min-width:180px">Periodo</th><th style="min-width:120px">Estado del Visado</th></tr>
        ${filasQuinq}
      </table></div>
    </div>
    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 4px">Adelantos por gestión</h2>
      ${bloquesAdel}
    </div>
    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 4px">Gestión del trámite</h2>
      <div class="mu" style="margin-bottom:8px">Pendiente → En proceso → Aprobado → Pagado. Sirve para saber qué queda por cerrar.</div>
      <div style="overflow-x:auto"><table class="qxt">
        <tr><th style="min-width:150px">Quinquenio</th><th style="min-width:140px">Estado del trámite</th><th style="min-width:150px">Fecha de gestión</th><th style="min-width:170px">Responsable</th><th style="min-width:200px">Nota</th><th>·</th></tr>
        ${filasGestion}
      </table></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn p" data-a="qxprint" data-id="${esc(e.id)}">${ic('pr')}Imprimir ficha (PDF)</button>
      <button class="btn" data-a="qxcalc">${ic('rot')}Calcular periodos</button>
      <button class="btn" data-a="qxback">Volver al listado</button>
    </div>
    <div class="mu" style="margin-top:10px">Los cambios se guardan solos, cifrados con tu contraseña.</div>`;

  /* Los edits escriben directamente sobre el empleado en memoria. */
  v.querySelectorAll('[data-qx]').forEach(el => {
    el.addEventListener('change', () => qxApplyEdit(e, el));
  });
  /* La fecha recalcula al instante la antigüedad mostrada. */
  const fec = v.querySelector('[data-qx="fecha"]');
  if (fec) fec.addEventListener('change', () => QX_ACTIONS.qxfec());
}

/** Escribe un campo de la ficha en el empleado y agenda el guardado. */
function qxApplyEdit(e, el) {
  const t = el.dataset.qx, i = +el.dataset.i, j = +el.dataset.j;
  const val = String(el.value || '').trim();
  if (t === 'nombre') {
    e.nombre = val;
    const h = document.querySelector('#view .vhead h1');
    if (h) h.textContent = val || 'Empleado';
  }
  else if (t === 'fecha') e.fechaIngreso = val;
  else if (t === 'cargo') e.cargo = val;
  else if (t === 'quin-estado') {
    e.quinquenios[i].estado = qxEstado(val);
    el.className = qxEstadoCls(e.quinquenios[i].estado);   // colorea el selector al instante
  }
  else if (t === 'quin-periodo') e.quinquenios[i].periodo = val;
  else if (t === 'quin-visado') e.quinquenios[i].visado = qxVisado(val);
  else if (t === 'quin-gestion') {
    e.quinquenios[i].gestion = val;
    el.className = qxGestionCls(val);   // colorea el selector al instante
  }
  else if (t === 'quin-fechag') e.quinquenios[i].fechaGestion = val;
  else if (t === 'quin-resp') e.quinquenios[i].responsable = val;
  else if (t === 'quin-nota') e.quinquenios[i].nota = val;
  else if (t === 'adel-detalle') e.adelantos[i][j].detalle = val;
  else if (t === 'adel-periodo') e.adelantos[i][j].periodo = val;
  else if (t === 'adel-anios') e.adelantos[i][j].anios = val;
  else if (t === 'adel-visado') e.adelantos[i][j].visado = qxVisado(val);
  else if (QX_HOJA3_KEYS.indexOf(t) >= 0) e[t] = val;   // campos de la Hoja3
  qxScheduleSave();
}

/* --------------------------- Impresión (PDF) ---------------------------- */

/** Abre el PDF generado y lanza el diálogo de impresión del navegador. */
function qxOpenPrint(pdf) {
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) { URL.revokeObjectURL(url); return toast('Permite las ventanas emergentes para imprimir'); }
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) { } }, 900);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** PDF de la ficha del empleado (una página, réplica de la hoja MACRO). */
function qxPrintFicha(id) {
  const e = ((qxData && qxData.empleados) || []).find(x => x.id === id);
  if (!e) return toast('Empleado no encontrado');
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) return toast('Motor de PDF no disponible');
  const doc = new jsPDF();
  const W = 210, M = 14;
  let y = 16;

  doc.setFontSize(14); doc.setFont(undefined, 'bold');
  doc.text('Quinquenios y Adelantos · Ficha del empleado', M, y); y += 7;
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text('Generado: ' + new Date().toLocaleDateString('es-VE'), M, y); y += 8;

  const line = (label, value) => {
    doc.setFont(undefined, 'bold'); doc.text(label, M, y);
    doc.setFont(undefined, 'normal');
    doc.text(String(qxDash(value)).slice(0, 95), M + 42, y);
    y += 6;
  };
  doc.setDrawColor(200); doc.setLineWidth(0.2);
  line('Nombre:', e.nombre);
  line('Fecha de Ingreso:', e.fechaIngreso || '—');
  line('Cargo:', e.cargo || '—');
  line('Antigüedad:', qxAntiguedad(e.fechaIngreso) || '—');
  y += 3;

  const tabla = (cols, widths, rows) => {
    doc.setFillColor(235, 238, 240); doc.rect(M, y - 4, W - 2 * M, 7, 'F');
    let x = M;
    doc.setFont(undefined, 'bold');
    cols.forEach((c, i) => { doc.text(c, x + 1, y); x += widths[i]; });
    doc.setFont(undefined, 'normal');
    y += 2; doc.line(M, y, W - M, y); y += 5;
    rows.forEach(r => {
      if (y > 280) { doc.addPage(); y = 20; }
      let xr = M;
      r.forEach((c, i) => { doc.text(String(qxDash(c)).slice(0, Math.floor(widths[i] / 2)), xr + 1, y); xr += widths[i]; });
      y += 6; doc.line(M, y - 4, W - M, y - 4);
    });
    y += 4;
  };

  tabla(['Quinquenio', 'Cumplimiento', 'Periodo', 'Visado'], [50, 45, 65, 22],
    e.quinquenios.map((q, i) => [QX_QUIN_LABELS[i], q.estado, q.periodo, q.visado]));

  e.adelantos.forEach((bloque, k) => {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFont(undefined, 'bold'); doc.setFontSize(11);
    doc.text('Gestión ' + (k + 1) + ' · ' + QX_QUIN_LABELS[k], M, y); y += 6;
    doc.setFontSize(9); doc.setFont(undefined, 'normal');
    tabla(['Adelanto', 'Detalle', 'Periodo', 'Años', 'Visado'], [35, 65, 55, 15, 14],
      bloque.map((a, j) => [QX_ADEL_LABELS[j], a.detalle, a.periodo, a.anios, a.visado]));
  });

  qxOpenPrint(doc);
}

/** PDF del listado general de empleados (una fila por empleado). */
function qxPrintAll() {
  const emps = (qxData && qxData.empleados) || [];
  if (!emps.length) return toast('No hay empleados en la base');
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) return toast('Motor de PDF no disponible');
  const doc = new jsPDF({ orientation: 'landscape' });
  const W = 297, M = 12;
  let y = 16;
  doc.setFontSize(13); doc.setFont(undefined, 'bold');
  doc.text('Quinquenios y Adelantos · Listado general (' + emps.length + ' empleados)', M, y); y += 8;
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  const cols = ['#', 'Nombre', 'Cargo', 'Ingreso', 'Antigüedad', '1er', '2do', '3er', 'Adel.'];
  const widths = [10, 75, 65, 25, 40, 20, 20, 20, 10];
  const header = () => {
    doc.setFillColor(235, 238, 240); doc.rect(M, y - 4, W - 2 * M, 7, 'F');
    let x = M;
    doc.setFont(undefined, 'bold');
    cols.forEach((c, i) => { doc.text(c, x + 1, y); x += widths[i]; });
    doc.setFont(undefined, 'normal');
    y += 2; doc.line(M, y, W - M, y); y += 6;
  };
  header();
  emps.forEach((e, idx) => {
    if (y > 195) { doc.addPage(); y = 20; header(); }
    const nAdel = e.adelantos.reduce((a, b) => a + b.filter(x => x.detalle || x.periodo || x.anios).length, 0);
    const fila = [String(idx + 1), e.nombre, e.cargo, e.fechaIngreso, qxAntiguedad(e.fechaIngreso),
      e.quinquenios[0].estado, e.quinquenios[1].estado, e.quinquenios[2].estado, nAdel ? String(nAdel) : ''];
    let x = M;
    fila.forEach((c, i) => { doc.text(String(qxDash(c)).slice(0, Math.floor(widths[i] / 1.9)), x + 1, y); x += widths[i]; });
    y += 5.5;
  });
  qxOpenPrint(doc);
}

/* -------------------- Mapeo manual (Excel genérico) --------------------- */

const QX_MAP_FIELDS = {
  nombre: 'Nombre del empleado',
  fecha: 'Fecha de ingreso',
  cargo: 'Cargo / Puesto',
  quin1: '1er Quinquenio (estado)',
  quin2: '2do Quinquenio (estado)',
  quin3: '3er Quinquenio (estado)'
};
let qxMapping = {};

function qxMappingHtml() {
  const headers = qxMap ? qxMap.headers : [];
  const fields = Object.keys(QX_MAP_FIELDS).map(k => {
    const sel = qxMapping[k] || '';
    return '<div class="f"><label>' + esc(QX_MAP_FIELDS[k]) + (k === 'nombre' ? ' *' : '') + '</label>' +
      '<select id="qxmap-' + k + '"><option value="">— no usar —</option>' +
      headers.map(h => '<option value="' + esc(h) + '"' + (sel === h ? ' selected' : '') + '>' + esc(h) + '</option>').join('') +
      '</select></div>';
  }).join('');
  return '<h2>Mapear columnas del Excel</h2><div class="mu">Elige qué columna corresponde a cada dato. Solo el nombre es obligatorio.</div>' +
    '<div style="display:grid;gap:10px">' + fields + '</div>' +
    '<div class="fx"><button class="btn" data-a="qxmapback">← Volver</button><button class="btn p" data-a="qxmapconfirm">Importar empleados ✅</button></div>';
}

function qxMapConfirm() {
  if (!qxMap) return closeModal();
  Object.keys(QX_MAP_FIELDS).forEach(k => {
    const el = document.getElementById('qxmap-' + k);
    qxMapping[k] = el ? el.value : '';
  });
  if (!qxMapping.nombre) return toast('La columna de nombre es obligatoria');
  const get = (row, k) => (qxMapping[k] ? row[qxMapping[k]] : '');
  const list = qxMap.rows.map(row => {
    const e = qxEmptyEmpleado(String(get(row, 'nombre') || '').trim());
    e.fechaIngreso = qxToISO(get(row, 'fecha'));
    e.cargo = String(get(row, 'cargo') || '').trim();
    e.quinquenios[0].estado = qxEstado(get(row, 'quin1'));
    e.quinquenios[1].estado = qxEstado(get(row, 'quin2'));
    e.quinquenios[2].estado = qxEstado(get(row, 'quin3'));
    return e;
  }).filter(e => e.nombre);
  if (!list.length) return toast('No se reconocieron filas con nombre');
  const r = qxMergeEmpleados(list);
  qxPersist().then(() => {
    closeModal();
    renderQx();
    toast(r.nuevos + ' nuevos, ' + r.actualizados + ' actualizados ✅');
  });
}

/* ------------------------------ Acciones -------------------------------- */

const QX_ACTIONS = {
  qximport: () => { const i = document.getElementById('qxfile'); if (i) i.click(); },

  qximportfile: async () => {
    const input = document.getElementById('qxfile');
    const file = input && input.files && input.files[0];
    if (!file) return;
    input.value = '';
    try {
      const wb = await qxReadWorkbook(file);
      const macro = qxTryMacroImport(wb);
      if (macro) {
        const r = qxMergeEmpleados(macro);
        await qxPersist();
        renderQx();
        toast(r.nuevos + ' nuevos, ' + r.actualizados + ' actualizados ✅');
        return;
      }
      /* Forma genérica: mapeo manual de columnas. */
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      if (!rows.length) return toast('El archivo está vacío');
      let hi = 0;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        if ((rows[i] || []).some(c => String(c).trim())) { hi = i; break; }
      }
      const headers = (rows[hi] || []).map((h, i) => String(h || '').trim() || ('Columna ' + (i + 1)));
      const data = [];
      for (let i = hi + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        if (!r.some(c => String(c || '').trim())) continue;
        const obj = {};
        headers.forEach((h, j) => { obj[h] = r[j] != null ? r[j] : ''; });
        data.push(obj);
      }
      qxMapping = {};
      qxMap = { headers, rows: data };
      openModal(qxMappingHtml(), true);
    } catch (err) {
      toast('No se pudo leer el archivo: ' + (err && err.message ? err.message : 'error desconocido'));
    }
  },

  qxmapconfirm: () => qxMapConfirm(),
  qxmapback: () => { closeModal(); qxMap = null; qxMapping = {}; },

  qxseed: () => qxSeedBase(),

  /* Calcula los periodos de los quinquenios desde la fecha de ingreso. */
  qxcalc: async () => {
    const e = ((qxData && qxData.empleados) || []).find(x => x.id === qxView.id);
    if (!e) return;
    if (!e.fechaIngreso) return toast('Pon primero la fecha de ingreso del empleado');
    const n = qxCalcPeriodos(e);
    if (!n) return toast('Los periodos ya estaban puestos');
    await qxPersist();
    renderQxFicha(e.id, qxView.from);
    toast(n + ' periodo' + (n === 1 ? '' : 's') + ' calculado' + (n === 1 ? '' : 's') + ' ✅');
  },

  qxcalcall: async () => {
    await qxLoad();
    const emps = (qxData && qxData.empleados) || [];
    if (!emps.length) return toast('No hay base cargada');
    const ok = await confirmDialog('Calcular periodos',
      'Se rellenan los periodos VACÍOS de los 3 quinquenios con la fecha de ingreso de cada empleado. Los que ya tengan un periodo escrito NO se tocan.',
      'Calcular');
    if (!ok) return;
    let total = 0, cuantos = 0;
    for (const e of emps) {
      const n = qxCalcPeriodos(e);
      if (n) { total += n; cuantos++; }
    }
    if (!total) return toast('No había periodos vacíos que calcular');
    await qxPersist();
    renderQx();
    toast(total + ' periodo(s) en ' + cuantos + ' empleado(s) ✅');
  },
  qxcat: el => renderQxList(el.dataset.cat),
  qxback: () => {
    if (qxView.mode !== 'ficha') return renderQx();
    const f = qxView.from;
    if (f === 'quinquenios' || f === 'adelantos') return renderQxList(f);
    if (f === 'venc') { qxSheet = 'venc'; return renderQx(); }
    renderQx();
  },
  qxficha: el => renderQxFicha(el.dataset.id, el.dataset.from || null),
  qxsearch: () => qxSearchUpdate(),

  /* Hoja de cálculo (pestañas MACRO · Hoja 1 · Hoja 3) */
  qxsheet: el => qxSwitchSheet(el.dataset.s),
  qxadd: () => qxAddWorkerDialog(),
  qxaddconfirm: () => qxAddWorkerConfirm(),
  qxdelrow: el => qxDeleteWorker(el.dataset.id),
  qxpage: el => { qxPage = +el.dataset.p; renderQx(); },
  qxpagesize: el => { qxPageSize = +el.dataset.n; qxPage = 0; renderQx(); },
  qxfilter: () => qxFilterUpdate(),
  /* Orden por columnas y filtros de la hoja */
  qxsort: el => {
    const k = +el.dataset.k;
    if (qxSort.col === k) qxSort.dir = -qxSort.dir;
    else { qxSort.col = k; qxSort.dir = 1; }
    qxPage = 0;
    qxGridRefresh();
  },
  qxfiltros: () => {
    qxFilter = ''; qxFDepto = ''; qxFQuin = ''; qxFGest = '';
    qxSort = { col: -1, dir: 1 };
    qxPage = 0;
    renderQx();
  },
  qxreload: () => qxSeedBase(),
  qxexportxlsx: () => qxExportXlsx(),

  qxfec: () => {
    const ant = document.getElementById('qxant');
    const inp = document.querySelector('[data-qx="fecha"]');
    if (ant && inp) {
      ant.value = qxAntiguedad(inp.value);
      const e = ((qxData && qxData.empleados) || []).find(x => x.id === qxView.id);
      if (e) { e.fechaIngreso = qxToISO(inp.value) || inp.value; qxScheduleSave(); }
    }
  },
  qxprint: el => qxPrintFicha(el.dataset.id),
  qxprintall: () => qxPrintAll(),
  /* Panel de RRHH */
  qxvencmes: el => { qxVencMeses = +el.dataset.n || 6; renderQx(); },
  qxvencprint: () => qxPrintVenc(),
  /* Gestión del trámite */
  qxgestion: el => qxGestionDialog(el.dataset.id, +el.dataset.i),
  qxgsave: el => qxGestionSave(el.dataset.id, +el.dataset.i),
  /* Constancia de quinquenio y calendario */
  qxconst: el => qxConstanciaDialog(el.dataset.id, +el.dataset.i),
  qxconstgen: el => qxConstanciaGen(el.dataset.id, +el.dataset.i),
  qxcalxlsx: () => qxCalExportXlsx(),
  qxexport: async () => {
    if (!qxData) return toast('No hay base para exportar');
    download(new Blob([JSON.stringify(qxData, null, 1)], { type: 'application/json' }),
      'quinquenios-' + new Date().toISOString().slice(0, 10) + '.json');
    toast('Base exportada (sin cifrar: cuídala)');
  }
};

/* No perder el último cambio: volcar al ocultar o cerrar la pestaña. */
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') qxFlush(); });
addEventListener('pagehide', () => { qxFlush(); });

window.QxActions = QX_ACTIONS;
window.renderQx = renderQx;
