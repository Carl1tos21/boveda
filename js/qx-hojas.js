/* ------------------ Hoja de cálculo (MACRO · Hoja 1 · Hoja 3) ------------ */
'use strict';

/** Barra de pestañas con las 3 hojas del Excel. */
function qxSheetTabs() {
  const tabs = [['macro', 'MACRO'], ['venc', 'Panel RRHH'], ['adel', 'Adelantos'], ['hoja1', 'Hoja 1'], ['hoja3', 'Hoja 3']];
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
  if (['macro', 'venc', 'adel', 'hoja1', 'hoja3'].indexOf(s) < 0) return;
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
  qxHist('Alta', e.nombre + (e.fechaIngreso ? ' · ing. ' + qxFmtCorto(e.fechaIngreso) : ''));
  await qxPersist();
  closeModal();
  renderQx();
  toast('Trabajador añadido ✅');
}

/** Elimina un trabajador de la base (se puede deshacer). */
async function qxDeleteWorker(id) {
  const e = ((qxData && qxData.empleados) || []).find(x => x.id === id);
  if (!e) return;
  const ok = await confirmDialog('Eliminar trabajador', 'Se eliminará «' + e.nombre + '» de la base.', 'Eliminar');
  if (!ok) return;
  const pos = qxData.empleados.indexOf(e);
  qxData.empleados = qxData.empleados.filter(x => x.id !== id);
  qxHist('Baja', e.nombre);
  await qxPersist();
  qxBadgeN = -1;
  renderQx();
  toastAction('Trabajador eliminado', 'Deshacer', async () => {
    qxData.empleados.splice(pos < 0 ? 0 : pos, 0, e);
    qxHist('Baja anulada', e.nombre);
    await qxPersist();
    qxBadgeN = -1;
    renderQx();
    toast('Trabajador restaurado ✅');
  });
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
    const nComp = qxComps(q).length;
    return `<tr>
      <td><b>${lab}</b></td>
      <td><select class="${qxGestionCls(q.gestion)}" data-qx="quin-gestion" data-i="${i}">${qxSelOpts(QX_GESTION_OPTS, q.gestion, '—')}</select></td>
      <td><input type="date" data-qx="quin-fechag" data-i="${i}" value="${esc(q.fechaGestion)}"></td>
      <td><input type="text" data-qx="quin-resp" data-i="${i}" value="${esc(q.responsable)}" placeholder="Quién lo tramita"></td>
      <td><input type="text" data-qx="quin-nota" data-i="${i}" value="${esc(q.nota)}" placeholder="Observaciones"></td>
      <td style="white-space:nowrap">
        <button class="btn qxgbtn" data-a="qxconst" data-id="${esc(e.id)}" data-i="${i}" title="Emitir la constancia de quinquenio">${ic('pr')}Constancia</button>
        <button class="btn qxgbtn" data-a="qxcomp" data-id="${esc(e.id)}" data-i="${i}" title="Comprobantes del quinquenio">${ic('file')}Comprobantes${nComp ? ' (' + nComp + ')' : ''}</button>
      </td>
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
  qxHist('Edición', (e.nombre || 'sin nombre') + ' · ' + qxFieldLabel(t, i, j) + ': ' + (val || '(vacío)'));
  qxScheduleSave();
}

