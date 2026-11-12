/* ------------------------------ Vistas ---------------------------------- */
'use strict';

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
 *   revisar    -> datos incompletos o incoherentes (cada uno con su `tipo`)
 *   vencidos / marcados -> para medir el avance real de la gestión
 */
function qxAnalizaVenc(meses) {
  const emps = (qxData && qxData.empleados) || [];
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const limite = new Date(hoy.getFullYear(), hoy.getMonth() + (meses || 6), hoy.getDate());

  const proximos = [], pendientes = [], revisar = [];
  let conFecha = 0, vencidos = 0, marcados = 0;

  /* N.º de personal repetidos: se cuentan una sola vez (O(n) en vez de O(n²)). */
  const cedCount = {};
  emps.forEach(x => {
    const c = String(x.numPersona || '').trim();
    if (c) cedCount[c] = (cedCount[c] || 0) + 1;
  });

  for (const e of emps) {
    /* --- Datos del trabajador que no dependen de la fecha de ingreso --- */
    const ad = (e.adelantos || []).reduce((a, b) => a + b.filter(x => (x.anios || x.periodo) && !x.detalle).length, 0);
    if (ad) revisar.push({ e, tipo: 'adelanto', texto: ad + ' adelanto(s) sin detalle' });

    const ced = String(e.numPersona || '').trim();
    if (!ced) revisar.push({ e, tipo: 'sin-numero', texto: 'Sin N.º de personal' });
    else if (cedCount[ced] > 1) {
      revisar.push({ e, tipo: 'duplicado', texto: 'N.º de personal repetido: ' + ced + ' (' + cedCount[ced] + ' trabajadores)' });
    }

    if (!String(e.nombrePuesto || '').trim() && !String(e.codUbicacion || '').trim() && !ced) {
      revisar.push({ e, tipo: 'sin-hoja3', texto: 'Sin datos de la Hoja 3 (RRHH)' });
    }
    if (!String(e.departamento || '').trim()) {
      revisar.push({ e, tipo: 'sin-departamento', texto: 'Sin departamento' });
    }

    /* --- Quinquenios (necesitan la fecha de ingreso) --- */
    if (!e.fechaIngreso) { revisar.push({ e, tipo: 'sin-fecha', texto: 'Sin fecha de ingreso' }); continue; }
    conFecha++;

    for (let i = 0; i < 3; i++) {
      const iso = qxFechaQuin(e, i);
      const dias = qxDiasPara(iso);
      if (dias === null) { revisar.push({ e, tipo: 'fecha-invalida', texto: 'Fecha de ingreso no válida' }); break; }
      const f = new Date(iso + 'T00:00:00');
      const q = e.quinquenios[i] || {};

      /* Un periodo escrito a mano debe coincidir con la fecha de ingreso. */
      const per = String(q.periodo || '').trim();
      const esperado = qxPeriodoQuin(e.fechaIngreso, i);
      if (per && esperado && per !== esperado &&
        /^\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}$/.test(per)) {
        revisar.push({ e, tipo: 'periodo', texto: QX_QUIN_LABELS[i] + ': el periodo no coincide con la fecha de ingreso' });
      }

      if (q.estado === 'CUMPLE') {
        if (dias > 0) revisar.push({ e, tipo: 'adelantado', texto: QX_QUIN_LABELS[i] + ': CUMPLE marcado y aún faltan ' + dias + ' días' });
        else { vencidos++; marcados++; }
        continue;
      }
      if (f >= hoy && f <= limite) proximos.push({ e, i, iso, dias });
      else if (f < hoy) { pendientes.push({ e, i, iso, dias: -dias }); vencidos++; }
    }
  }

  proximos.sort((a, b) => a.dias - b.dias);        // los más urgentes primero
  pendientes.sort((a, b) => b.dias - a.dias);      // los más antiguos primero
  return {
    proximos, pendientes, revisar, total: emps.length, conFecha,
    vencidos, marcados, meses: meses || 6
  };
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

/* --------- Avance de la gestión y puesta al día de la base ------------- */

/** Indicadores de avance de la gestión y de calidad de la base. */
function qxAvance(meses) {
  const emps = (qxData && qxData.empleados) || [];
  const r = qxAnalizaVenc(meses);
  const hoy = new Date();
  let totalQ = 0, conPeriodo = 0, sinNum = 0, sinDepto = 0, sinH3 = 0;
  const ant = { '5': 0, '10': 0, '15': 0, '20': 0 };

  emps.forEach(e => {
    if (!String(e.numPersona || '').trim()) sinNum++;
    if (!String(e.departamento || '').trim()) sinDepto++;
    if (!String(e.nombrePuesto || '').trim() && !String(e.codUbicacion || '').trim() &&
      !String(e.numPersona || '').trim()) sinH3++;
    e.quinquenios.forEach(q => {
      totalQ++;
      if (String(q.periodo || '').trim()) conPeriodo++;
    });
    const f = new Date(String(e.fechaIngreso || '') + 'T00:00:00');
    if (!isNaN(f.getTime())) {
      let a = hoy.getFullYear() - f.getFullYear();
      const m = hoy.getMonth() - f.getMonth();
      if (m < 0 || (m === 0 && hoy.getDate() < f.getDate())) a--;
      if (a >= 20) ant['20']++;
      else if (a >= 15) ant['15']++;
      else if (a >= 10) ant['10']++;
      else if (a >= 5) ant['5']++;
    }
  });

  const pct = r.vencidos ? Math.round((r.marcados / r.vencidos) * 100) : 0;
  return { r, totalQ, conPeriodo, pct, ant, sinNum, sinDepto, sinH3, emps: emps.length };
}

/** Bloque «Avance de la gestión» con barra, antigüedad y puesta al día. */
function qxAvanceHTML(meses) {
  const a = qxAvance(meses);
  const r = a.r;
  const chip = (n, etq) => `<span class="qxant"><b>${n}</b> ${etq}</span>`;
  return `
    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 8px">📈 Avance de la gestión</h2>
      <div class="qxbar" title="${a.pct} %"><span style="width:${a.pct}%"></span></div>
      <div class="mu" style="margin:6px 0 12px">
        <b>${r.marcados}</b> de <b>${r.vencidos}</b> quinquenios vencidos ya están marcados CUMPLE
        (<b>${a.pct} %</b>) · quedan <b>${r.pendientes.length}</b> por gestionar.
      </div>
      <div class="qxants">
        ${chip(a.ant['5'], 'con 5+ años')}
        ${chip(a.ant['10'], 'con 10+ años')}
        ${chip(a.ant['15'], 'con 15+ años')}
        ${chip(a.ant['20'], 'con 20+ años')}
        ${chip(a.totalQ - a.conPeriodo, 'periodos sin calcular')}
        ${chip(a.sinNum, 'sin N.º de personal')}
        ${chip(a.sinDepto, 'sin departamento')}
        ${chip(a.sinH3, 'sin datos de Hoja 3')}
      </div>
      <div class="qxtools" style="margin:12px 0 0">
        <button class="btn p" data-a="qxpuestaaldia">${ic('rot')}Poner la base al día</button>
        <span class="mu">Rellena los periodos vacíos, copia el cargo desde la Hoja 3 y limpia los valores no válidos.</span>
      </div>
    </div>`;
}

/** Núcleo sincrónico de la puesta al día: periodos vacíos, cargos y valores válidos. */
function qxPonerAlDiaBase(emps) {
  let periodos = 0, cargos = 0, limpiados = 0;
  (emps || []).forEach(e => {
    periodos += qxCalcPeriodos(e);
    const puesto = String(e.nombrePuesto || '').trim();
    if (puesto && !String(e.cargo || '').trim()) { e.cargo = puesto; cargos++; }
    e.quinquenios.forEach(q => {
      const est = qxEstado(q.estado);
      if (est !== q.estado) { q.estado = est; limpiados++; }
      const vis = qxVisado(q.visado);
      if (vis !== q.visado) { q.visado = vis; limpiados++; }
    });
  });
  return { periodos, cargos, limpiados };
}

/** Pone la base al día: periodos vacíos, cargos desde la Hoja 3 y valores válidos. */
async function qxPonerAlDia() {
  await qxLoad();
  const emps = (qxData && qxData.empleados) || [];
  if (!emps.length) return toast('No hay base cargada');
  const ok = await confirmDialog('Poner la base al día',
    'Se rellenan los periodos VACÍOS con la fecha de ingreso, se copia el CARGO desde los datos de RRHH ' +
    '(Job Name de la Hoja 3) cuando esté vacío y se limpian los estados o visados con valores no válidos. ' +
    'No se toca nada que ya esté escrito a mano.', 'Poner al día');
  if (!ok) return;

  const n = qxPonerAlDiaBase(emps);
  qxHist('Puesta al día',
    n.periodos + ' periodo(s) · ' + n.cargos + ' cargo(s) · ' + n.limpiados + ' valor(es)');
  await qxPersist();
  qxBadgeN = -1;
  renderQx();
  toast(n.periodos + ' periodo(s), ' + n.cargos + ' cargo(s) y ' + n.limpiados + ' valor(es) ✅');
}

/* ------------- Selección en lote de los quinquenios del panel ---------- */

let qxSel = {};   // { 'idEmpleado|indiceQuinquenio': 1 }

/** Nº de quinquenios seleccionados en el panel. */
const qxSelCount = () => Object.keys(qxSel).length;

/** Marca o desmarca un quinquenio (sin repintar, para no perder el scroll). */
function qxSelToggle(k) {
  if (qxSel[k]) delete qxSel[k]; else qxSel[k] = 1;
  const el = document.querySelector('[data-a="qxsel"][data-k="' + k + '"]');
  if (el) {
    el.classList.toggle('on');
    el.textContent = qxSel[k] ? '✓' : '';
  }
  const n = document.getElementById('qxseln');
  if (n) n.textContent = String(qxSelCount());
}

/** Selecciona todos los pendientes del panel, o los quita todos. */
function qxSelAll(todos) {
  qxSel = {};
  if (todos) {
    qxAnalizaVenc(qxVencMeses).pendientes.forEach(x => { qxSel[x.e.id + '|' + x.i] = 1; });
  }
  renderQx();
}

/** Núcleo sincrónico: aplica estado y/o trámite a las claves «id|i» indicadas. */
function qxSelAplicarBase(keys, estado, gestion) {
  const hoy = new Date().toISOString().slice(0, 10);
  let n = 0;
  (keys || []).forEach(k => {
    const p = String(k).split('|');
    const e = ((qxData && qxData.empleados) || []).find(x => x.id === p[0]);
    const q = e && e.quinquenios[+p[1]];
    if (!q) return;
    if (estado) { q.estado = estado; if (!q.gestion) q.gestion = 'Aprobado'; }
    if (gestion) { q.gestion = gestion; if (!q.fechaGestion) q.fechaGestion = hoy; }
    n++;
  });
  return n;
}

/** Aplica «CUMPLE» o un estado del trámite a todos los seleccionados. */
async function qxSelAplicar(modo) {
  const keys = Object.keys(qxSel);
  if (!keys.length) return toast('Selecciona al menos un quinquenio');
  let estado = '', gestion = '';
  if (modo === 'CUMPLE') {
    estado = 'CUMPLE';
  } else {
    const sel = document.getElementById('qxselgest');
    gestion = sel ? sel.value : '';
    if (!gestion) return toast('Elige el estado del trámite');
  }
  const ok = await confirmDialog('Aplicar a ' + keys.length + ' quinquenio(s)',
    modo === 'CUMPLE'
      ? 'Se marcarán como CUMPLE los ' + keys.length + ' quinquenios seleccionados.'
      : 'Se pondrá el trámite en «' + gestion + '» a los ' + keys.length + ' quinquenios seleccionados.',
    'Aplicar');
  if (!ok) return;

  const n = qxSelAplicarBase(keys, estado, gestion);
  qxHist('En lote', n + ' quinquenio(s) · ' + (estado || gestion));
  qxSel = {};
  await qxPersist();
  qxBadgeN = -1;
  renderQx();
  toast(n + ' quinquenio(s) actualizados ✅');
}

/** Barra de acciones en lote de la lista de pendientes. */
function qxSelBar() {
  return `<div class="qxtools" style="margin:0 0 8px">
    <span class="mu"><b id="qxseln">${qxSelCount()}</b> seleccionado(s)</span>
    <button class="btn qxgbtn" data-a="qxselall">Seleccionar todos</button>
    <button class="btn qxgbtn" data-a="qxselnone">Quitar selección</button>
    <span class="sp"></span>
    <button class="btn qxgbtn p" data-a="qxselcumple">${ic('ok')}Marcar CUMPLE</button>
    <select id="qxselgest" style="max-width:190px">${qxSelOpts(QX_GESTION_OPTS, '', 'Trámite: sin cambio')}</select>
    <button class="btn qxgbtn" data-a="qxselgestion">Aplicar trámite</button>
  </div>`;
}

