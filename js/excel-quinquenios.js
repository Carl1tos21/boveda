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

const QX_QUIN_LABELS = ['1er Quinquenio', '2do Quinquenio', '3er Quinquenio'];
const QX_ADEL_LABELS = ['Primer Adelanto', 'Segundo Adelanto', 'Tercer Adelanto', 'Cuarto Adelanto'];

/* --------------------------- Utilidades --------------------------------- */

/** Minúsculas sin acentos (para comparar nombres como en el buscador). */
function qxNorm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Identificador estable a partir del nombre completo. */
function qxSlug(nombre) {
  return qxNorm(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || ('emp-' + Date.now().toString(36));
}

/** Empleado vacío con la estructura completa del Excel MACRO. */
function qxEmptyEmpleado(nombre) {
  return {
    id: qxSlug(nombre),
    nombre: String(nombre || '').trim(),
    fechaIngreso: '',
    cargo: '',
    quinquenios: [0, 1, 2].map(() => ({ estado: '', periodo: '', visado: '' })),
    adelantos: [0, 1, 2].map(() => [0, 1, 2, 3].map(() => ({ detalle: '', periodo: '', anios: '', visado: '' })))
  };
}

/** Rellena estructuras heredadas de archivos antiguos por si faltan ramas. */
function qxFixEmpleado(e) {
  const base = qxEmptyEmpleado(e && e.nombre);
  const out = Object.assign(base, e || {});
  out.id = out.id || qxSlug(out.nombre);
  out.quinquenios = [0, 1, 2].map(i => Object.assign({ estado: '', periodo: '', visado: '' }, (e && e.quinquenios && e.quinquenios[i]) || {}));
  out.adelantos = [0, 1, 2].map(i => [0, 1, 2, 3].map(j => Object.assign({ detalle: '', periodo: '', anios: '', visado: '' }, (e && e.adelantos && e.adelantos[i] && e.adelantos[i][j]) || {})));
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
}

/** Persiste qxData cifrado (AES-GCM) como registro de la bóveda. */
async function qxPersist() {
  if (!qxData) return;
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
}

/** Guardado diferido (los edits de la ficha no bloquean la interfaz). */
function qxScheduleSave() {
  clearTimeout(qxSaveTimer);
  qxSaveTimer = setTimeout(() => { qxPersist().catch(() => toast('No se pudo guardar la base')); }, 700);
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

  /* Mapa de cargos desde la hoja tipo «Hoja3» (Name | ... | Job Name). */
  const cargos = {};
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || ws === dataSheet) continue;
    const found = qxFindHeaderRow(ws, c => c === 'name' || c === 'job name');
    if (found.idx < 0) continue;
    const hdr = (found.rows[found.idx] || []).map(qxNorm);
    const iName = hdr.indexOf('name');
    const iJob = hdr.indexOf('job name');
    if (iName < 0 || iJob < 0) continue;
    for (let i = found.idx + 1; i < found.rows.length; i++) {
      const r = found.rows[i] || [];
      const nm = String(r[iName] || '').trim();
      const job = String(r[iJob] || '').trim();
      if (nm && job) cargos[qxNorm(nm)] = job;
    }
    break;
  }

  const out = [];
  for (let i = headerIdx + 1; i < dataRows.length; i++) {
    const r = dataRows[i] || [];
    const nombre = String(r[0] || '').trim();
    if (!nombre) continue;
    const e = qxEmptyEmpleado(nombre);
    e.fechaIngreso = qxToISO(r[1]);
    e.cargo = cargos[qxNorm(nombre)] || String(r[2] || '').trim();
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
  return list.filter(e => qxNorm(e.nombre).indexOf(t) >= 0).slice(0, 40);
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

/** Vista principal «Quin/Adel» (clon de la hoja MACRO buscador). */
async function renderQx() {
  await qxLoad();
  qxCatView = null;
  qxView = { mode: 'home', id: null };
  const v = $('#view');
  const st = qxStats();
  const conBase = st.emps.length > 0;

  const tarjetas = conBase ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <div class="pn" data-a="qxcat" data-cat="adelantos" style="cursor:pointer">
        <h2 style="font-size:15px;margin:0 0 6px">Adelantos</h2>
        <div class="mu" style="font-size:13px">${st.conAdel} empleado${st.conAdel === 1 ? '' : 's'} con adelantos registrados</div>
      </div>
      <div class="pn" data-a="qxcat" data-cat="quinquenios" style="cursor:pointer">
        <h2 style="font-size:15px;margin:0 0 6px">Quinquenios</h2>
        <div class="mu" style="font-size:13px">1er: ${st.q[0]} cumplen · 2do: ${st.q[1]} · 3er: ${st.q[2]}</div>
      </div>
    </div>` : '';

  const buscador = conBase ? `
    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 8px">Buscar empleado</h2>
      <div class="mu" style="font-size:13px;margin-bottom:8px">Seleccione o ingrese el Nombre de la Persona:</div>
      <input type="text" id="qxsearch" placeholder="Nombre del empleado…" value="${esc(qxBuscar)}" autocomplete="off" oninput="QxActions.qxsearch()">
      <div id="qxresults" style="margin-top:10px">${qxResultsHtml()}</div>
    </div>` : `
    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 8px">Cargar base inicial</h2>
      <div class="mu" style="font-size:13px;margin-bottom:10px">La app incluye la base del archivo MACRO_QUINQUENIOS.xlsx (337 empleados). Tócala para precargarla cifrada en tu bóveda (solo en este dispositivo, bajo tu contraseña).</div>
      <button class="btn p" data-a="qxseed" style="width:100%">Cargar base inicial</button>
    </div>`;

  v.innerHTML = `
    <div class="vhead"><h1>Quinquenios y Adelantos</h1></div>
    <div class="mu" style="margin-bottom:14px">${st.emps.length} empleado${st.emps.length === 1 ? '' : 's'} en la base · clon de la hoja MACRO${qxData && qxData.gen ? ' · guardado ' + esc(qxData.gen) : ''}</div>
    ${buscador}
    ${tarjetas}
    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 8px">Importar desde Excel</h2>
      <div class="mu" style="font-size:13px">Archivo .xlsx/.xls. Si tiene la estructura del MACRO (hoja con «NOMBRE COMPLETO») se importa automáticamente; si no, te pide mapear las columnas.</div>
      <input type="file" id="qxfile" accept=".xlsx,.xls" style="margin:8px 0;width:100%" onchange="QxActions.qximportfile()">
      <button class="btn" data-a="qximport" style="width:100%">Seleccionar archivo Excel</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" data-a="qxprintall">${ic('pr')}Imprimir listado</button>
      ${conBase ? '<button class="btn" data-a="qxexport">' + ic('dl') + 'Exportar base (JSON)</button>' : ''}
    </div>`;
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
        ? `<span class="tag" style="background:${q.estado === 'CUMPLE' ? '#1b5e20' : '#b71c1c'};color:#fff">${QX_QUIN_LABELS[i].split(' ')[0]}: ${q.estado}</span>`
        : '').filter(Boolean).join(' ');
    } else {
      const n = e.adelantos.reduce((a, bloque) => a + bloque.filter(x => x.detalle || x.periodo || x.anios).length, 0);
      detalle = `<span class="tag">${n} adelanto${n === 1 ? '' : 's'}</span>`;
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
      <td><select data-qx="quin-estado" data-i="${i}">${qxSelOpts(['CUMPLE', 'NO CUMPLE'], q.estado, '—')}</select></td>
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

  v.innerHTML = `
    <div class="vhead"><h1>${esc(e.nombre)}</h1></div>
    <div style="margin-bottom:12px"><button class="btn" data-a="qxback">${ic('chevron')}Volver</button></div>
    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 8px">Datos y quinquenios</h2>
      <div class="fgrid">
        <div class="f"><label>Nombre completo</label><input type="text" data-qx="nombre" value="${esc(e.nombre)}"></div>
        <div class="f"><label>Fecha de ingreso</label><input type="date" data-qx="fecha" value="${esc(e.fechaIngreso)}" onchange="QxActions.qxfec()"></div>
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
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn p" data-a="qxprint" data-id="${esc(e.id)}">${ic('pr')}Imprimir ficha (PDF)</button>
      <button class="btn" data-a="qxback">Volver al listado</button>
    </div>
    <div class="mu" style="margin-top:10px">Los cambios se guardan solos, cifrados con tu contraseña.</div>`;

  /* Los edits escriben directamente sobre el empleado en memoria. */
  v.querySelectorAll('[data-qx]').forEach(el => {
    if (el.getAttribute('onchange')) return;
    el.addEventListener('change', () => qxApplyEdit(e, el));
  });
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
  else if (t === 'quin-estado') e.quinquenios[i].estado = qxEstado(val);
  else if (t === 'quin-periodo') e.quinquenios[i].periodo = val;
  else if (t === 'quin-visado') e.quinquenios[i].visado = qxVisado(val);
  else if (t === 'adel-detalle') e.adelantos[i][j].detalle = val;
  else if (t === 'adel-periodo') e.adelantos[i][j].periodo = val;
  else if (t === 'adel-anios') e.adelantos[i][j].anios = val;
  else if (t === 'adel-visado') e.adelantos[i][j].visado = qxVisado(val);
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
  qxcat: el => renderQxList(el.dataset.cat),
  qxback: () => {
    if (qxView.mode === 'ficha' && qxView.from) renderQxList(qxView.from);
    else renderQx();
  },
  qxficha: el => renderQxFicha(el.dataset.id, el.dataset.from || null),
  qxsearch: () => qxSearchUpdate(),
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
  qxexport: async () => {
    if (!qxData) return toast('No hay base para exportar');
    download(new Blob([JSON.stringify(qxData, null, 1)], { type: 'application/json' }),
      'quinquenios-' + new Date().toISOString().slice(0, 10) + '.json');
    toast('Base exportada (sin cifrar: cuídala)');
  }
};

window.QxActions = QX_ACTIONS;
window.renderQx = renderQx;
