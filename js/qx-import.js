/* ------------------------ Importación desde Excel ----------------------- */
'use strict';

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

