/* ==========================================================================
 * Bóveda · Quin/Adel (1/6) · qx-datos.js
 * «Quin/Adel»: réplica funcional de la hoja MACRO del Excel
 * MACRO_QUINQUENIOS.xlsx. Este módulo se reparte en seis archivos que comparten
 * el mismo ámbito global y se cargan EN ORDEN:
 *   1) qx-datos.js     · datos, utilidades y persistencia
 *   2) qx-import.js    · importación desde Excel y carga de la base incluida
 *   3) qx-panel.js     · Panel de RRHH (vencimientos, avance, selección)
 *   4) qx-adelantos.js · Adelantos, gestión, constancia, historial y comprobantes
 *   5) qx-hojas.js     · Hoja de cálculo (MACRO · Hoja 1 · Hoja 3) y ficha
 *   6) qx-pdf.js       · Impresión PDF, mapeo manual y mapa de acciones
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
let qxAdelBuscar = '';   // buscador del módulo de adelantos
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

/** Máximo de entradas del historial de cambios (se conservan las más nuevas). */
const QX_HIST_MAX = 500;

/**
 * Anota un cambio en el historial de auditoría de la base.
 * @param {string} accion  qué se hizo («Edición», «Trámite», «Alta»…)
 * @param {string} detalle sobre quién y qué
 */
function qxHist(accion, detalle) {
  if (!qxData) return;
  if (!Array.isArray(qxData.hist)) qxData.hist = [];
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  qxData.hist.unshift({
    f: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()),
    a: String(accion || ''),
    d: String(detalle || '')
  });
  if (qxData.hist.length > QX_HIST_MAX) qxData.hist.length = QX_HIST_MAX;
}

/** Historial de cambios de la base (lo más nuevo primero). */
const qxHistorial = () => ((qxData && qxData.hist) || []).slice();

/** Nombre legible de cada campo editable (para el historial de cambios). */
const QX_FIELD_LABEL = {
  nombre: 'Nombre completo', fecha: 'Fecha de ingreso', cargo: 'Cargo',
  'quin-estado': 'Estado del quinquenio', 'quin-periodo': 'Periodo del quinquenio',
  'quin-visado': 'Visado del quinquenio', 'quin-gestion': 'Estado del trámite',
  'quin-fechag': 'Fecha de gestión', 'quin-resp': 'Responsable', 'quin-nota': 'Nota',
  'adel-detalle': 'Detalle', 'adel-periodo': 'Periodo',
  'adel-anios': 'Años', 'adel-visado': 'Visado'
};

/** Etiqueta completa de un campo editado, indicando quinquenio y adelanto. */
function qxFieldLabel(t, i, j) {
  const base = QX_FIELD_LABEL[t] || t;
  if (/^quin-/.test(t) && i >= 0) return QX_QUIN_LABELS[i] + ' · ' + base;
  if (/^adel-/.test(t) && i >= 0 && j >= 0) return QX_QUIN_LABELS[i] + ' · ' + QX_ADEL_LABELS[j] + ' · ' + base;
  return base;
}

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
    quinquenios: [0, 1, 2].map(() => ({ estado: '', periodo: '', visado: '', gestion: '', fechaGestion: '', responsable: '', nota: '', comprobantes: [] })),
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
  out.quinquenios = [0, 1, 2].map(i => Object.assign({ estado: '', periodo: '', visado: '', gestion: '', fechaGestion: '', responsable: '', nota: '', comprobantes: [] }, (e && e.quinquenios && e.quinquenios[i]) || {}));
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

