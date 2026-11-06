/* --------------------------- Impresión (PDF) ---------------------------- */
'use strict';

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
  /* Historial de cambios y comprobantes */
  qxhist: () => qxHistDialog(),
  qxhistclear: () => qxHistClear(),
  qxcomp: el => qxComprobanteDialog(el.dataset.id, +el.dataset.i),
  qxcompadd: el => qxComprobanteAdd(el.dataset.id, +el.dataset.i),
  qxcompdel: el => qxComprobanteDel(el.dataset.id, +el.dataset.i, el.dataset.doc),
  /* Adelantos */
  qxadelnew: () => qxAdelDialog(null, 0, 0),
  qxadeled: el => qxAdelDialog(el.dataset.id, +el.dataset.k, +el.dataset.j),
  qxadelsave: el => qxAdelSave(el.dataset.id || '', +el.dataset.k, +el.dataset.j),
  qxadeldel: el => qxAdelDel(el.dataset.id, +el.dataset.k, +el.dataset.j),
  qxadelexport: () => qxAdelExportXlsx(),
  /* Avance, puesta al día y acciones en lote */
  qxpuestaaldia: () => qxPonerAlDia(),
  qxsel: el => qxSelToggle(el.dataset.k),
  qxselall: () => qxSelAll(true),
  qxselnone: () => qxSelAll(false),
  qxselcumple: () => qxSelAplicar('CUMPLE'),
  qxselgestion: () => qxSelAplicar('GESTION'),
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
