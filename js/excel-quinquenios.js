/* ==========================================================================
 * Bóveda · excel-quinquenios.js
 * Importación de Excel (adelantos y quinquenios de empleados), gestión de
 * registros y generación de PDF para imprimir recibos/certificados.
 * ========================================================================== */
'use strict';

let qxCols = [];
let qxMapping = {};

const QX_CAT_ADELANTO = 'Adelantos';
const QX_CAT_QUINQUENIO = 'Quinquenios';

const QX_FIELD_LABELS = {
  nombre: 'Nombre del empleado',
  cedula: 'Cédula / Identidad',
  cargo: 'Cargo / Puesto',
  departamento: 'Departamento',
  tipo: 'Tipo de registro',
  monto: 'Monto',
  fecha: 'Fecha',
  periodo: 'Periodo',
  observaciones: 'Observaciones',
  anos_servicio: 'Años de servicio'
};

async function readExcelFile(file) {
  if (!window.XLSX) {
    throw new Error('SheetJS no está cargado. Recarga la página.');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsArrayBuffer(file);
  });
}

function detectHeaderRow(rows) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.some(cell => cell != null && String(cell).trim() !== '')) return i;
  }
  return 0;
}

function parseExcelRows(rows) {
  if (!rows || rows.length === 0) return { headers: [], data: [] };
  const headerIdx = detectHeaderRow(rows);
  const headers = rows[headerIdx].map(h => (h != null ? String(h).trim() : 'Columna ' + (headerIdx + 1)));
  const data = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(cell => cell == null || String(cell).trim() === '')) continue;
    const obj = {};
    headers.forEach((h, j) => { obj[h] = row[j] != null ? row[j] : ''; });
    data.push(obj);
  }
  return { headers, data };
}

function qxMappingHtml(headers) {
  const fields = Object.entries(QX_FIELD_LABELS).map(([key, label]) => {
    const selected = qxMapping[key] || '';
    return '<div class="f"><label>' + esc(label) + '</label><select id="qxmap-' + key + '"><option value="">— no usar —</option>' + headers.map(h => '<option value="' + esc(h) + '"' + (selected === h ? ' selected' : '') + '>' + esc(h) + '</option>').join('') + '</select></div>';
  }).join('');
  return '<h2>Mapear columnas del Excel</h2><div class="mu">Elige qué columna de tu Excel corresponde a cada dato. Nombre y monto son obligatorios.</div><div style="display:grid;gap:10px">' + fields + '</div><div class="fx"><button class="btn" data-a="qxmapback">← Volver</button><button class="btn p" data-a="qxmapconfirm">Importar registros ✅</button></div>';
}

function qxMappingValid() { return !!(qxMapping.nombre && qxMapping.monto); }

async function importRowToDoc(row, idx) {
  const get = (field) => { const col = qxMapping[field]; return col != null ? row[col] : ''; };
  const nombre = String(get('nombre') || 'Empleado ' + (idx + 1)).trim();
  const cedula = String(get('cedula') || '').trim();
  const cargo = String(get('cargo') || '').trim();
  const departamento = String(get('departamento') || '').trim();
  const tipo = String(get('tipo') || QX_CAT_ADELANTO).trim();
  const monto = String(get('monto') || '0').trim();
  const fecha = String(get('fecha') || '').trim();
  const periodo = String(get('periodo') || '').trim();
  const obs = String(get('observaciones') || '').trim();
  const anos = String(get('anos_servicio') || '').trim();
  const cat = (tipo.toLowerCase().includes('quinquen') || tipo.toLowerCase().includes('quinq')) ? QX_CAT_QUINQUENIO : QX_CAT_ADELANTO;
  const notesParts = [];
  if (cedula) notesParts.push('Cédula: ' + cedula);
  if (cargo) notesParts.push('Cargo: ' + cargo);
  if (departamento) notesParts.push('Departamento: ' + departamento);
  if (tipo) notesParts.push('Tipo: ' + tipo);
  if (monto) notesParts.push('Monto: ' + monto);
  if (fecha) notesParts.push('Fecha: ' + fecha);
  if (periodo) notesParts.push('Periodo: ' + periodo);
  if (anos) notesParts.push('Años de servicio: ' + anos);
  if (obs) notesParts.push('Observaciones: ' + obs);
  const notes = notesParts.join(' | ');
  const existing = docs.find(d => d.cat === cat && d.name === nombre && d.notes && d.notes.includes('Fecha: ' + fecha));
  if (existing) return { imported: false, skipped: true, id: existing.id };
  const doc = { id: uid(), date: Date.now() + idx, name: nombre, cat: cat, notes: notes, file: 'quinquenios-import.xlsx', type: 'application/json', _b: new Blob([JSON.stringify({ source: 'excel-import', row: idx, data: row })], { type: 'application/json' }) };
  await saveDoc(doc, key, true);
  return { imported: true, id: doc.id, cat };
}

async function qxImportAll(rows) {
  let imported = 0, skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    const res = await importRowToDoc(rows[i], i);
    if (res.skipped) { skipped++; } else { imported++; }
  }
  await load();
  return { imported, skipped };
}

function extractNote(notes, key) {
  if (!notes) return '';
  const regex = new RegExp(escRegExp(key) + ':\\s*([^|]+)', 'i');
  const m = notes.match(regex);
  return m ? m[1].trim() : '';
}
function escRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '$&'); }

async function qxPrintDoc(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { toast('Motor de PDF no disponible'); return; }
  const monto = extractNote(d.notes, 'Monto') || '0';
  const fecha = extractNote(d.notes, 'Fecha') || '—';
  const cedula = extractNote(d.notes, 'Cédula') || '—';
  const cargo = extractNote(d.notes, 'Cargo') || '—';
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text('Bóveda · Recibo de Pago', 20, 20);
  doc.setFontSize(12);
  doc.text('Empleado: ' + d.name, 20, 40);
  doc.text('Cédula: ' + cedula, 20, 52);
  doc.text('Cargo: ' + cargo, 20, 64);
  doc.text('Monto: Bs. ' + monto, 20, 100);
  doc.text('Fecha: ' + fecha, 20, 112);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) return toast('Permite ventanas emergentes para imprimir');
  setTimeout(() => { try { w.focus(); w.print(); } catch(e) {} }, 800);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function qxPrintCat(cat) {
  const list = docs.filter(d => d.cat === cat).sort((a, b) => b.date - a.date);
  if (!list.length) return toast('No hay registros para imprimir');
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { toast('Motor de PDF no disponible'); return; }
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text('Bóveda · ' + cat, 20, 20);
  doc.setFontSize(11);
  doc.text('Total de registros: ' + list.length, 20, 32);
  const total = list.reduce((a, d) => a + (parseFloat(extractNote(d.notes, 'Monto')) || 0), 0);
  doc.text('Monto total: Bs. ' + total.toFixed(2), 20, 44);
  doc.text('Generado: ' + new Date().toLocaleDateString('es-VE'), 20, 56);
  let y = 74;
  doc.setFontSize(10);
  doc.text('Empleado', 20, y);
  doc.text('Cédula', 60, y);
  doc.text('Cargo', 110, y);
  doc.text('Fecha', 160, y);
  doc.text('Monto', 200, y);
  y += 8;
  for (const d of list) {
    if (y > 280) { doc.addPage(); y = 30; }
    const monto = extractNote(d.notes, 'Monto') || '0';
    const fecha = extractNote(d.notes, 'Fecha') || '—';
    const cedula = extractNote(d.notes, 'Cédula') || '—';
    const cargo = extractNote(d.notes, 'Cargo') || '—';
    doc.text(String(d.name).slice(0, 35), 20, y);
    doc.text(String(cedula).slice(0, 20), 60, y);
    doc.text(String(cargo).slice(0, 30), 110, y);
    doc.text(String(fecha).slice(0, 16), 160, y);
    doc.text('Bs. ' + String(monto).slice(0, 25), 200, y);
    y += 8;
  }
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) return toast('Permite ventanas emergentes para imprimir');
  setTimeout(() => { try { w.focus(); w.print(); } catch(e) {} }, 800);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const QX_ACTIONS = {
  qximport: () => { const input = document.getElementById('qxfile'); if (input) input.click(); },
  qximportfile: async () => {
    const input = document.getElementById('qxfile');
    const file = input ? input.files && input.files[0] : null;
    if (!file) return;
    try {
      toast('Leyendo Excel...');
      const rows = await readExcelFile(file);
      const parsed = parseExcelRows(rows);
      qxCols = parsed.headers;
      qxMapping = {};
      openModal(qxMappingHtml(qxCols));
    } catch (e) { toast('Error al leer Excel: ' + e.message); }
  },
  qxmapconfirm: async () => {
    const map = {};
    Object.keys(QX_FIELD_LABELS).forEach(k => {
      const el = document.getElementById('qxmap-' + k);
      if (el && el.value) map[k] = el.value;
    });
    qxMapping = map;
    if (!qxMappingValid()) return toast('Debes mapear al menos nombre y monto');
    closeModal();
    toast('Importando registros...');
    const input = document.getElementById('qxfile');
    const file = input ? input.files && input.files[0] : null;
    if (!file) return toast('No se encontró el archivo');
    const rows = await readExcelFile(file);
    const parsed = parseExcelRows(rows);
    const res = await qxImportAll(parsed.data);
    renderQx();
    toast(res.imported + ' registros importados' + (res.skipped ? ' (' + res.skipped + ' duplicados omitidos)' : ''));
  },
  qxmapback: () => { closeModal(); },
  qxviewcat: el => { renderQxList(el.dataset.cat); },
  qxback: renderQx,
  qxopen: el => openDocDrawer(el.dataset.id, 'preview'),
  qxrm: async el => {
    const id = el.dataset.id;
    const d = docs.find(x => x.id === id);
    if (!d) return;
    if (!await confirmDialog('Eliminar registro', '¿Eliminar «' + d.name + '» de ' + d.cat + '?')) return;
    await del('docs', id);
    await load();
    renderQx();
    toast('Registro eliminado');
  },
  qxprint: el => qxPrintDoc(el.dataset.id),
  qxprintcat: el => qxPrintCat(el.dataset.cat),
  qxprintall: async () => {
    const adelantos = docs.filter(d => d.cat === QX_CAT_ADELANTO);
    const quinquenios = docs.filter(d => d.cat === QX_CAT_QUINQUENIO);
    if (!adelantos.length && !quinquenios.length) return toast('No hay registros para imprimir');
    await qxPrintCat(QX_CAT_ADELANTO);
    await qxPrintCat(QX_CAT_QUINQUENIO);
  },
  qxexport: exportBackup
};

window.QxActions = QX_ACTIONS;
window.renderQx = renderQx;

/* esc() viene de utils.js: no redeclararla aquí (rompía la carga de todo el script). */

function renderQx() {
  const v = $('#view');
  const adelantos = docs.filter(d => d.cat === QX_CAT_ADELANTO);
  const quinquenios = docs.filter(d => d.cat === QX_CAT_QUINQUENIO);
  const totalA = adelantos.reduce((a, d) => a + (parseFloat(extractNote(d.notes, 'Monto')) || 0), 0);
  const totalQ = quinquenios.reduce((a, d) => a + (parseFloat(extractNote(d.notes, 'Monto')) || 0), 0);
  v.innerHTML = '<h1>Quinquenios y Adelantos</h1><div class="mu">' + adelantos.length + ' adelanto' + (adelantos.length !== 1 ? 's' : '') + ' · ' + quinquenios.length + ' quinquenio' + (quinquenios.length !== 1 ? 's' : '') + '</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px"><div class="pn"><h2 style="font-size:15px;margin:0 0 8px">Adelantos</h2><div class="mu" style="font-size:13px">' + adelantos.length + ' registro' + (adelantos.length !== 1 ? 's' : '') + ' · total Bs. ' + totalA.toFixed(2) + '</div><button class="btn p" data-a="qxviewcat" data-cat="' + esc(QX_CAT_ADELANTO) + '" style="width:100%">Ver adelantos</button></div><div class="pn"><h2 style="font-size:15px;margin:0 0 8px">Quinquenios</h2><div class="mu" style="font-size:13px">' + quinquenios.length + ' registro' + (quinquenios.length !== 1 ? 's' : '') + ' · total Bs. ' + totalQ.toFixed(2) + '</div><button class="btn p" data-a="qxviewcat" data-cat="' + esc(QX_CAT_QUINQUENIO) + '" style="width:100%">Ver quinquenios</button></div></div><div class="pn"><h2 style="font-size:15px;margin:0 0 8px">Importar desde Excel</h2><div class="mu">Sube tu archivo .xlsx o .xls con la base de datos de empleados.</div><input type="file" id="qxfile" accept=".xlsx,.xls" style="margin:8px 0;width:100%" onchange="QxActions.qximportfile()"><button class="btn" data-a="qximport" style="width:100%">Seleccionar archivo Excel</button></div><div style="margin-top:10px"><button class="btn" data-a="qxprintall" style="margin-right:8px">Imprimir todo</button><button class="btn" data-a="qxexport" style="margin-right:8px">Exportar respaldo</button></div>';
}

function renderQxList(cat) {
  const list = docs.filter(d => d.cat === cat).sort((a, b) => b.date - a.date);
  const v = $('#view');
  const total = list.reduce((a, d) => a + (parseFloat(extractNote(d.notes, 'Monto')) || 0), 0);
  v.innerHTML = '<div class="vhead"><h1>' + cat + '</h1><div class="mu">' + list.length + ' registro' + (list.length !== 1 ? 's' : '') + ' · total Bs. ' + total.toFixed(2) + '</div></div><div class="tools"><button class="sel" data-a="qxback">← Volver</button><button class="sel" data-a="qxprintcat" data-cat="' + esc(cat) + '">Imprimir esta lista</button></div>' + (list.length ? list.map(d => qxListItemHtml(d, cat)).join('') : '<div class="empty">No hay registros de ' + cat.toLowerCase() + ' todavía.</div>');
}

function qxListItemHtml(d, cat) {
  const monto = extractNote(d.notes, 'Monto') || '0';
  const fecha = extractNote(d.notes, 'Fecha') || '';
  const cedula = extractNote(d.notes, 'Cédula') || '';
  const cargo = extractNote(d.notes, 'Cargo') || '';
  const color = cat === QX_CAT_QUINQUENIO ? '#12a06a' : '#e5337f';
  return '<div class="row" style="border:1px solid var(--borde);border-radius:10px;padding:12px;margin-bottom:8px;background:var(--fondo)"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div style="flex:1;min-width:0"><div style="display:flex;gap:8px;align-items:center;margin-bottom:4px"><span class="tile" style="background:' + color + '">' + esc(d.name.charAt(0).toUpperCase()) + '</span><b style="font-size:15px">' + esc(d.name) + '</b>' + (d.fav ? '<span style="color:#f59f00">★</span>' : '') + '</div><div class="mu" style="font-size:13px">' + (cedula ? 'Cédula: ' + esc(cedula) + ' · ' : '') + (cargo ? 'Cargo: ' + esc(cargo) + ' · ' : '') + (fecha ? 'Fecha: ' + esc(fecha) + ' · ' : '') + 'Monto: Bs. ' + esc(monto) + '</div></div><div style="display:flex;gap:6px"><button class="btn s" data-a="qxopen" data-id="' + d.id + '">' + ic('eye') + 'Ver</button><button class="btn s" data-a="qxprint" data-id="' + d.id + '">' + ic('pr') + 'Imprimir</button><button class="btn s d" data-a="qxrm" data-id="' + d.id + '">' + ic('tr') + '</button></div></div></div>';
}

