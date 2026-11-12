/* ==================== Adelantos (módulo dedicado) ====================== */
'use strict';

/** Todos los adelantos con datos de la base, con su empleado y su hueco. */
function qxAdelList() {
  const out = [];
  ((qxData && qxData.empleados) || []).forEach(e => {
    (e.adelantos || []).forEach((bloque, k) => {
      (bloque || []).forEach((a, j) => {
        if (a && (a.detalle || a.periodo || a.anios || a.visado)) out.push({ e, k, j, a });
      });
    });
  });
  return out;
}

/** Totales de adelantos: cuántos hay, años adelantados y quiénes. */
function qxAdelStats() {
  const l = qxAdelList();
  const emps = new Set();
  let anios = 0, sinVisado = 0, porVisado = 0;
  l.forEach(x => {
    emps.add(x.e.id);
    const n = parseFloat(String(x.a.anios || '').replace(',', '.'));
    if (!isNaN(n)) anios += n;
    if (!x.a.visado) sinVisado++;
    else porVisado++;
  });
  return { total: l.length, anios, empleados: emps.size, sinVisado, porVisado };
}

/** Adelantos filtrados por el buscador del módulo. */
function qxAdelFiltrados() {
  const t = qxNorm(qxAdelBuscar);
  const l = qxAdelList();
  if (!t) return l;
  return l.filter(x => {
    const hay = [x.e.nombre, x.e.numPersona, x.e.departamento,
      x.a.detalle, x.a.periodo, x.a.anios, x.a.visado].join(' ');
    return qxNorm(hay).indexOf(t) >= 0;
  });
}

/** Diálogo para registrar o editar un adelanto. */
function qxAdelDialog(id, k, j) {
  const emps = (qxData && qxData.empleados) || [];
  const e = id ? emps.find(x => x.id === id) : null;
  const a = (e && e.adelantos[k] && e.adelantos[k][j]) || { detalle: '', periodo: '', anios: '', visado: '' };

  openModal(`<h2>${id ? 'Editar adelanto' : 'Registrar adelanto'}</h2>
    <div class="mu" style="margin-bottom:12px">${e ? esc(e.nombre) : 'Elige el trabajador y en qué gestión va el adelanto.'}</div>
    ${id ? '' : `<div class="f"><label>Trabajador</label>
      <input id="qad-emp" list="qademps" placeholder="Escribe el nombre…" autocomplete="off">
      <datalist id="qademps">${emps.map(x => `<option value="${esc(x.nombre)}"></option>`).join('')}</datalist></div>`}
    <div class="f"><label>Gestión (quinquenio)</label>
      <select id="qad-k">${QX_QUIN_LABELS.map((l, i) => `<option value="${i}"${i === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    <div class="f"><label>N.º de adelanto</label>
      <select id="qad-j">${QX_ADEL_LABELS.map((l, i) => `<option value="${i}"${i === j ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    <div class="f"><label>Detalle</label><input id="qad-det" value="${esc(a.detalle)}" placeholder="Motivo o concepto del adelanto"></div>
    <div class="f"><label>Periodo</label><input id="qad-per" value="${esc(a.periodo)}" placeholder="dd/mm/aaaa - dd/mm/aaaa"></div>
    <div class="f"><label>Años</label><input id="qad-an" value="${esc(a.anios)}" inputmode="numeric" placeholder="Ej: 1"></div>
    <div class="f"><label>Estado del visado</label>
      <select id="qad-vis">${qxSelOpts(QX_VISADO_OPTS, a.visado, '—')}</select></div>
    <div class="mu">Pulsa <b>Enter</b> para guardar.</div>
    <div class="fx"><button class="btn" data-a="close">Cancelar</button>
      <button class="btn p" data-a="qxadelsave" data-id="${esc(id || '')}" data-k="${k}" data-j="${j}">${ic('ok')}Guardar</button></div>`);
}

/** Guarda el adelanto del diálogo. */
async function qxAdelSave(id, k, j) {
  const val = s => { const el = document.getElementById(s); return el ? String(el.value || '').trim() : ''; };
  let e = id ? ((qxData && qxData.empleados) || []).find(x => x.id === id) : null;

  if (!e) {
    const nombre = val('qad-emp');
    if (!nombre) return toast('Escribe el nombre del trabajador');
    e = ((qxData && qxData.empleados) || []).find(x => qxNorm(x.nombre) === qxNorm(nombre));
    if (!e) return toast('No encontré ese trabajador en la base');
  }
  const kk = id ? k : (parseInt(val('qad-k'), 10) || 0);
  const jj = id ? j : (parseInt(val('qad-j'), 10) || 0);
  const destino = e.adelantos[kk][jj];
  destino.detalle = val('qad-det');
  destino.periodo = val('qad-per');
  destino.anios = val('qad-an');
  destino.visado = qxVisado(val('qad-vis'));

  if (!destino.detalle && !destino.periodo && !destino.anios && !destino.visado) {
    return toast('Escribe al menos el detalle o los años');
  }
  qxHist('Adelanto', e.nombre + ' · ' + QX_QUIN_LABELS[kk] + ' · ' + QX_ADEL_LABELS[jj] +
    (destino.anios ? ' · ' + destino.anios + ' año(s)' : ''));
  await qxPersist();
  closeModal();
  renderQx();
  toast('Adelanto guardado ✅');
}

/** Quita un adelanto (pide confirmación). */
async function qxAdelDel(id, k, j) {
  const e = ((qxData && qxData.empleados) || []).find(x => x.id === id);
  if (!e || !e.adelantos[k] || !e.adelantos[k][j]) return;
  const ok = await confirmDialog('Quitar adelanto',
    'Se borrarán los datos de «' + QX_ADEL_LABELS[j] + '» de ' + QX_QUIN_LABELS[k] + ' de ' + e.nombre + '.', 'Quitar');
  if (!ok) return;
  e.adelantos[k][j] = { detalle: '', periodo: '', anios: '', visado: '' };
  qxHist('Adelanto quitado', e.nombre + ' · ' + QX_QUIN_LABELS[k] + ' · ' + QX_ADEL_LABELS[j]);
  await qxPersist();
  renderQx();
  toast('Adelanto quitado');
}

/** Exporta el listado de adelantos a un .xlsx real. */
function qxAdelExportXlsx() {
  if (!window.XLSX) return toast('Falta la librería de Excel');
  const aoa = [['TRABAJADOR', 'N.º DE PERSONAL', 'DEPARTAMENTO', 'GESTIÓN', 'ADELANTO', 'DETALLE', 'PERIODO', 'AÑOS', 'VISADO']];
  qxAdelFiltrados().forEach(x => aoa.push([
    x.e.nombre, x.e.numPersona || '', x.e.departamento || '',
    QX_QUIN_LABELS[x.k], QX_ADEL_LABELS[x.j], x.a.detalle || '', x.a.periodo || '', x.a.anios || '', x.a.visado || ''
  ]));
  const st = qxAdelStats();
  aoa.push([]);
  aoa.push(['TOTAL', st.total + ' adelanto(s)', st.empleados + ' trabajador(es)', '', '', '', '', st.anios + ' año(s)', '']);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 16 },
    { wch: 28 }, { wch: 22 }, { wch: 7 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Adelantos');
  XLSX.writeFile(wb, 'ADELANTOS_QUINQUENIOS.xlsx');
  toast('Adelantos exportados ✅');
}

/** Pestaña «Adelantos»: resumen, listado editable y exportación. */
function qxRenderAdel() {
  const v = $('#view');
  const st = qxAdelStats();
  const list = qxAdelFiltrados();

  const filas = list.map(x => `<tr>
      <td><button class="qxopen" data-a="qxficha" data-id="${esc(x.e.id)}" data-from="adel" title="Abrir la ficha">${esc(x.e.nombre)}</button></td>
      <td class="mu">${esc(QX_QUIN_LABELS[x.k])}</td>
      <td class="mu">${QX_ADEL_LABELS[x.j]}</td>
      <td>${esc(qxDash(x.a.detalle))}</td>
      <td class="mu">${esc(qxDash(x.a.periodo))}</td>
      <td class="mu">${esc(qxDash(x.a.anios))}</td>
      <td>${x.a.visado ? '<span class="qxbadge ok">' + esc(x.a.visado) + '</span>' : '<span class="qxbadge">sin visado</span>'}</td>
      <td style="white-space:nowrap">
        <button class="btn qxgbtn" data-a="qxadeled" data-id="${esc(x.e.id)}" data-k="${x.k}" data-j="${x.j}" title="Editar este adelanto">${ic('ed')}</button>
        <button class="btn qxgbtn dg" data-a="qxadeldel" data-id="${esc(x.e.id)}" data-k="${x.k}" data-j="${x.j}" title="Quitar este adelanto">×</button>
      </td>
    </tr>`).join('');

  /* Totales por trabajador (los que más años han adelantado). */
  const porEmp = new Map();
  qxAdelList().forEach(x => {
    const g = porEmp.get(x.e.id) || { e: x.e, n: 0, anios: 0 };
    g.n++;
    const num = parseFloat(String(x.a.anios || '').replace(',', '.'));
    if (!isNaN(num)) g.anios += num;
    porEmp.set(x.e.id, g);
  });
  const ranking = [...porEmp.values()].sort((a, b) => b.anios - a.anios || b.n - a.n).slice(0, 10);

  v.innerHTML = `
    <div class="vhead"><h1>Adelantos</h1><span class="sp"></span><span id="qxstatus" class="mu"></span></div>
    ${qxSheetTabs()}
    <div class="mu" style="margin:10px 0 12px">Los adelantos que pide el trabajador sobre su quinquenio. Se guardan en la misma base cifrada y aparecen también en la Hoja 1.</div>

    <div class="qxcards">
      <div class="qxc amber">
        <span class="ico">${ic('dl')}</span>
        <span class="tx"><span class="num">${st.total}</span>
        <span class="lab">adelanto${st.total === 1 ? '' : 's'} registrado${st.total === 1 ? '' : 's'}</span></span>
      </div>
      <div class="qxc teal">
        <span class="ico">${ic('clock')}</span>
        <span class="tx"><span class="num">${st.anios}</span>
        <span class="lab">año${st.anios === 1 ? '' : 's'} adelantado${st.anios === 1 ? '' : 's'} en total</span></span>
      </div>
      <div class="qxc blue">
        <span class="ico">${ic('id')}</span>
        <span class="tx"><span class="num">${st.empleados}</span>
        <span class="lab">trabajador${st.empleados === 1 ? '' : 'es'} con adelantos</span></span>
      </div>
    </div>

    <div class="qxtools">
      <input type="text" id="qxadelfilter" placeholder="Buscar por trabajador, detalle o periodo…" value="${esc(qxAdelBuscar)}" autocomplete="off">
      <span class="sp"></span>
      <button class="btn p" data-a="qxadelnew">${ic('plus')}Registrar adelanto</button>
      <button class="btn" data-a="qxadelexport">${ic('dl')}Exportar .xlsx</button>
    </div>

    ${list.length
      ? `<div class="qxgrid" style="max-height:none"><table class="qxs"><thead><tr>
          <th style="min-width:200px">TRABAJADOR</th><th>GESTIÓN</th><th>ADELANTO</th>
          <th style="min-width:180px">DETALLE</th><th style="min-width:150px">PERIODO</th>
          <th>AÑOS</th><th>VISADO</th><th>·</th></tr></thead>
          <tbody>${filas}</tbody></table></div>
        <div class="mu" style="margin-top:8px">${list.length} de ${st.total} adelanto(s)${qxAdelBuscar ? ' (filtrado)' : ''}${st.sinVisado ? ' · ' + st.sinVisado + ' sin visado' : ''}</div>`
      : '<div class="empty">' + ic('dl') + '<br>' +
        (qxAdelBuscar ? 'Ningún adelanto coincide con la búsqueda.' :
          'Todavía no hay adelantos registrados.<br>Pulsa <b>Registrar adelanto</b> para añadir el primero.') + '</div>'}

    ${ranking.length ? `
      <div class="pn" style="margin-top:14px">
        <h2 style="font-size:15px;margin:0 0 8px">🏆 Quiénes más han adelantado</h2>
        <div class="qxdep"><table>
          <thead><tr><th>Trabajador</th><th class="n">Adelantos</th><th class="n">Años</th></tr></thead>
          <tbody>${ranking.map(g => `<tr>
            <td>${esc(g.e.nombre)}</td><td class="n">${g.n}</td><td class="n">${g.anios}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>` : ''}`;

  const fi = document.getElementById('qxadelfilter');
  if (fi) fi.oninput = () => { qxAdelBuscar = fi.value; qxRenderAdel(); };
}

/** Pinta el «Panel de RRHH»: vencimientos, pendientes y datos a revisar. */
function qxRenderVenc() {
  const v = $('#view');
  const r = qxAnalizaVenc(qxVencMeses);

  const fila = (e, titulo, detalle, i) => {
    const k = i == null ? '' : e.id + '|' + i;
    return `
    <div class="row2" data-a="qxficha" data-id="${esc(e.id)}" data-from="venc" style="padding-left:14px">
      ${k ? '<button class="qxsl' + (qxSel[k] ? ' on' : '') + '" data-a="qxsel" data-k="' + esc(k) + '" title="Seleccionar para acciones en lote">' + (qxSel[k] ? '✓' : '') + '</button>' : ''}
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
  };

  const mesBtn = n => `<button class="qxps${qxVencMeses === n ? ' on' : ''}" data-a="qxvencmes" data-n="${n}">${n} meses</button>`;
  const bloque = (titulo, lista, vacio, cabecera) => `
    <div class="pn">
      <h2 style="font-size:15px;margin:0 0 8px">${titulo}</h2>
      ${cabecera || ''}
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
      <button class="btn" data-a="qxhist">${ic('clock')}Historial</button>
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

    ${qxAvanceHTML(r.meses)}

    ${bloque('⏰ Próximos vencimientos',
      r.proximos.map(x => fila(x.e, QX_QUIN_LABELS[x.i], qxFmtCorto(x.iso) + ' · en ' + x.dias + ' días', x.i)).join(''),
      'Ningún quinquenio vence en los próximos ' + r.meses + ' meses.')}

    ${bloque('⚠️ Pendientes de gestionar (ya vencieron)',
      r.pendientes.map(x => fila(x.e, QX_QUIN_LABELS[x.i], qxFmtCorto(x.iso) + ' · hace ' + x.dias + ' días', x.i)).join(''),
      'Todo al día ✅',
      r.pendientes.length ? qxSelBar() : '')}

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
  qxHist('Trámite', (e.nombre || 'sin nombre') + ' · ' + QX_QUIN_LABELS[i] + ': ' +
    (q.gestion || 'sin estado') + (q.estado ? ' · ' + q.estado : ''));
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

/* -------------------- Historial de cambios (auditoría) ------------------ */

/** Diálogo con el historial de cambios de la base. */
function qxHistDialog() {
  const h = qxHistorial();
  const filas = h.slice(0, 200).map(x => `<div class="row" style="margin:0;box-shadow:none;border-radius:0">
      <div class="l mu" style="width:128px;flex:none">${esc(x.f)}</div>
      <div class="v"><b>${esc(x.a)}</b> · ${esc(x.d)}</div>
    </div>`).join('');
  openModal(`<h2>Historial de cambios</h2>
    <div class="mu" style="margin-bottom:12px">${h.length} movimiento${h.length === 1 ? '' : 's'} · se guardan cifrados con la base (se conservan los últimos ${QX_HIST_MAX}).</div>
    ${h.length
      ? '<div style="max-height:52vh;overflow:auto;border:1px solid var(--bd);border-radius:12px">' + filas +
        (h.length > 200 ? '<div class="mu" style="padding:8px 12px">… y ' + (h.length - 200) + ' más.</div>' : '') + '</div>'
      : '<div class="mu">Todavía no hay movimientos registrados.</div>'}
    <div class="fx">
      ${h.length ? '<button class="btn dg" data-a="qxhistclear">Vaciar historial</button>' : ''}
      <button class="btn p" data-a="close">Cerrar</button></div>`);
}

/** Vacía el historial de cambios (no toca la base de trabajadores). */
async function qxHistClear() {
  const ok = await confirmDialog('Vaciar historial',
    'Se borrarán todos los movimientos registrados. La base de trabajadores no se toca.', 'Vaciar');
  if (!ok) return;
  qxData.hist = [];
  await qxPersist();
  closeModal();
  renderQx();
  toast('Historial vaciado');
}

/* ----------------- Comprobantes del quinquenio (bóveda) ----------------- */

/** Comprobantes enlazados a un quinquenio que todavía existen en la bóveda. */
const qxComps = q => ((q && q.comprobantes) || []).filter(c => docs.some(d => d.id === c.id));

/** Diálogo para ver y adjuntar los comprobantes de un quinquenio. */
function qxComprobanteDialog(id, i) {
  const e = ((qxData && qxData.empleados) || []).find(x => x.id === id);
  if (!e || !e.quinquenios[i]) return;
  const lista = qxComps(e.quinquenios[i]);
  openModal(`<h2>Comprobantes · ${QX_QUIN_LABELS[i]}</h2>
    <div class="mu" style="margin-bottom:12px">${esc(e.nombre)}</div>
    ${lista.length
      ? '<div style="border:1px solid var(--bd);border-radius:12px;overflow:hidden;margin-bottom:12px">' +
        lista.map(c => `<div class="row2" style="padding-left:12px">
          <span class="tile" style="background:#455a64">${ic('file')}</span>
          <span class="nm"><b>${esc(c.name)}</b><span>${esc(c.f)} · ${esc(fmt(c.size || 0))}</span></span>
          <button class="btn qxgbtn" data-a="open" data-id="${esc(c.id)}">${ic('eye')}Abrir</button>
          <button class="btn qxgbtn dg" data-a="qxcompdel" data-id="${esc(id)}" data-i="${i}" data-doc="${esc(c.id)}" title="Quitarlo de la ficha (el archivo sigue en la bóveda)">×</button>
        </div>`).join('') + '</div>'
      : '<div class="mu" style="margin-bottom:12px">Todavía no hay comprobantes enlazados.</div>'}
    <div class="f"><label>Añadir comprobante (se guarda cifrado en tu bóveda)</label>
      <input type="file" id="qxcomp-file"></div>
    <div class="fx"><button class="btn" data-a="close">Cerrar</button>
      <button class="btn p" data-a="qxcompadd" data-id="${esc(id)}" data-i="${i}">${ic('up')}Adjuntar</button></div>`);
}

/** Guarda el comprobante en la bóveda y lo enlaza al quinquenio. */
async function qxComprobanteAdd(id, i) {
  const e = ((qxData && qxData.empleados) || []).find(x => x.id === id);
  const inp = document.getElementById('qxcomp-file');
  const f = inp && inp.files && inp.files[0];
  if (!e || !e.quinquenios[i]) return;
  if (!f) return toast('Elige un archivo');

  const d = {
    id: 'qxc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: Date.now(),
    name: baseName(f.name),
    cat: 'Comprobantes',
    notes: 'Comprobante de ' + e.nombre + ' · ' + QX_QUIN_LABELS[i],
    file: f.name,
    type: f.type || 'application/octet-stream',
    _b: f
  };
  await saveDoc(d, key, true);
  docs.push(d);

  const q = e.quinquenios[i];
  if (!Array.isArray(q.comprobantes)) q.comprobantes = [];
  q.comprobantes.push({ id: d.id, name: d.name, f: new Date().toISOString().slice(0, 10), size: f.size || 0 });
  qxHist('Comprobante', e.nombre + ' · ' + QX_QUIN_LABELS[i] + ' · ' + f.name);
  await qxPersist();
  closeModal();
  renderQxFicha(id, qxView.from);
  toast('Comprobante guardado en tu bóveda ✅');
}

/** Quita un comprobante de la ficha (el archivo permanece en la bóveda). */
async function qxComprobanteDel(id, i, docId) {
  const e = ((qxData && qxData.empleados) || []).find(x => x.id === id);
  if (!e || !e.quinquenios[i]) return;
  const q = e.quinquenios[i];
  q.comprobantes = ((q.comprobantes) || []).filter(c => c.id !== docId);
  qxHist('Comprobante quitado', e.nombre + ' · ' + QX_QUIN_LABELS[i]);
  await qxPersist();
  closeModal();
  renderQxFicha(id, qxView.from);
  toast('Quitado de la ficha (sigue en «Mi bóveda»)');
}

/** Vista principal «Quin/Adel»: pestañas MACRO · Hoja 1 · Hoja 3. */
async function renderQx() {
  await qxLoad();
  qxCatView = null;
  qxView = { mode: 'home', id: null };
  if (qxSheet === 'venc') return qxRenderVenc();
  if (qxSheet === 'adel') return qxRenderAdel();
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

