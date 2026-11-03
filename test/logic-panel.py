#!/usr/bin/env python3
"""Prueba de logica del Panel de RRHH con quickjs (motor JS real)."""
import pathlib, sys, json

try:
    import quickjs
except ImportError:
    print('quickjs no instalado (pip install quickjs) - prueba de logica omitida')
    raise SystemExit(0)

REPO = pathlib.Path(__file__).resolve().parent.parent

STUBS = r"""
var __lastPdf = null;
function __FakePDF() { this.txt = []; }
__FakePDF.prototype.setFontSize = function () { };
__FakePDF.prototype.setFont = function () { };
__FakePDF.prototype.text = function (t) { this.txt.push(String(t)); };
__FakePDF.prototype.splitTextToSize = function (t) { return [String(t)]; };
__FakePDF.prototype.setDrawColor = function () { };
__FakePDF.prototype.setLineWidth = function () { };
__FakePDF.prototype.line = function () { };
__FakePDF.prototype.addPage = function () { };
var window = { jspdf: { jsPDF: __FakePDF } };
var __view = { innerHTML: '', querySelectorAll: function () { return []; } };
var __toasts = [];
var __printed = 0;
function $(s){ return __view; }
function $$(s){ return []; }
function esc(s){ return String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function ic(n){ return '<svg class="i"></svg>'; }
function tileColor(s){ return '#5b8cff'; }
function toast(m){ __toasts.push(m); }
function addEventListener(){}
function download(){}
function qxOpenPrint(){ __printed = 1; }
var __els = {};
var __modal = '';
var __saved = 0;
var __rendered = 0;
function openModal(html){ __modal = html; }
function closeModal(){}
function setTimeout(){ return 0; }
function clearTimeout(){}
function fmt(n){ return (n || 0) + ' B'; }
function baseName(s){ return String(s || '').replace(/\.[^.]+$/, ''); }
function confirmDialog(){ return Promise.resolve(true); }
var document = {
  visibilityState: 'visible',
  querySelectorAll: function(){ return []; },
  querySelector: function(){ return null; },
  getElementById: function(id){ return __els[id] || null; },
  createElement: function(){
    return { style: {}, classList: { add: function(){}, remove: function(){} },
      appendChild: function(){}, remove: function(){}, querySelector: function(){ return null; } };
  }
};
var navigator = { userAgent: 'test' };
var localStorage = { getItem: function(){return null;}, setItem: function(){}, removeItem: function(){} };
var Blob = function(){}; var URL = { createObjectURL: function(){return '';}, revokeObjectURL: function(){} };
"""

DATA = r"""
/* Fechas relativas a hoy, para que la prueba no dependa del calendario. */
function isoHaceAnios(y, meses, dias) {
  var d = new Date(); d.setHours(12, 0, 0, 0);
  d.setFullYear(d.getFullYear() - y);
  d.setMonth(d.getMonth() - (meses || 0));
  d.setDate(d.getDate() - (dias || 0));
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function emp(id, nombre, dep, ingreso, estados) {
  var e = qxEmptyEmpleado(nombre);
  e.id = id;
  e.departamento = dep;
  e.cargo = 'Analista';
  e.fechaIngreso = ingreso;
  if (estados) estados.forEach(function (v, k) { e.quinquenios[k].estado = v || ''; });
  return e;
}

qxData = { v: 1, origen: 'test', empleados: [
  emp('a', 'ANA VENCIDA',     'Nomina', isoHaceAnios(5, 0, 20)),              /* 1er quin. paso hace 20 d */
  emp('b', 'BETO PROXIMO',    'Nomina', isoHaceAnios(5, -1, 0)),              /* 1er quin. en ~1 mes      */
  emp('c', 'CARLA ANTIGUA',   'Almacen', isoHaceAnios(10, 0, 5), ['CUMPLE']), /* 2do quin. sin gestionar  */
  emp('d', 'DIEGO SIN FECHA', 'Almacen', ''),                                 /* dato incompleto          */
  emp('e', 'ELENA RECIENTE',  'Nomina', isoHaceAnios(2, 0, 0))                /* sin quinquenios cerca    */
]};
qxData.empleados[3].adelantos[0] = [{ anios: '2', periodo: '2024-2025', detalle: '' }];
"""

CHECKS = r"""
var out = [];
function ok(nombre, cond, extra) { out.push({ n: nombre, ok: !!cond, x: extra === undefined ? '' : String(extra) }); }

var r = qxAnalizaVenc(6);
ok('total empleados', r.total === 5, r.total);
ok('con fecha de ingreso', r.conFecha === 4, r.conFecha);
ok('proximos = 1 (BETO)', r.proximos.length === 1, r.proximos.length);
ok('el proximo es BETO', r.proximos[0] && r.proximos[0].e.id === 'b', r.proximos[0] && r.proximos[0].e.nombre);
ok('proximo dentro del plazo', r.proximos[0] && r.proximos[0].dias > 0 && r.proximos[0].dias < 184, r.proximos[0] && r.proximos[0].dias);
ok('pendientes = 2 (ANA + 2do de CARLA)', r.pendientes.length === 2, r.pendientes.length);
ok('pendiente mas antiguo primero',
  r.pendientes.length === 2 && r.pendientes[0].dias >= r.pendientes[1].dias,
  r.pendientes.map(function (p) { return p.e.id + ':' + p.dias; }).join(' '));
ok('revisar incluye a DIEGO sin fecha y el adelanto sin detalle',
  r.revisar.some(function (x) { return /Sin fecha de ingreso/.test(x.texto); }) &&
  r.revisar.some(function (x) { return /adelanto\(s\) sin detalle/.test(x.texto); }), r.revisar.length);
ok('DIEGO marcado sin fecha',
  r.revisar.some(function (x) { return /Sin fecha de ingreso/.test(x.texto); }));
ok('adelanto sin detalle detectado',
  r.revisar.some(function (x) { return /adelanto\(s\) sin detalle/.test(x.texto); }));
ok('CUMPLE atrasado NO se marca para revisar',
  !r.revisar.some(function (x) { return /CUMPLE marcado/.test(x.texto); }));

var r12 = qxAnalizaVenc(12);
ok('plazo 12 meses no inventa vencimientos lejanos', r12.proximos.length === 1, r12.proximos.length);

qxData.empleados[4].quinquenios[0].estado = 'CUMPLE';
var rBad = qxAnalizaVenc(6);
ok('CUMPLE adelantado se detecta',
  rBad.revisar.some(function (x) { return /CUMPLE marcado y aún faltan/.test(x.texto); }));
qxData.empleados[4].quinquenios[0].estado = '';

var d = qxPorDepto(6);
var nomina = d.filter(function (x) { return x.dep === 'Nomina'; })[0];
var alm = d.filter(function (x) { return x.dep === 'Almacen'; })[0];
ok('depto Nomina con 3 empleados', nomina && nomina.emps === 3, nomina && nomina.emps);
ok('depto Nomina con 1 proximo', nomina && nomina.proximos === 1, nomina && nomina.proximos);
ok('depto Almacen con 1 pendiente', alm && alm.pendientes === 1, alm && alm.pendientes);
ok('depto Almacen con 1 cumplido', alm && alm.cumplidos === 1, alm && alm.cumplidos);
ok('departamentos ordenados por tamano', d.length === 2 && d[0].dep === 'Nomina', d.map(function (x) { return x.dep; }).join(','));

qxSheet = 'venc';
qxRenderVenc();
var html = __view.innerHTML;
ok('el panel pinta las 3 secciones',
  /Próximos vencimientos/.test(html) && /Pendientes de gestionar/.test(html) && /Datos a revisar/.test(html));
ok('el panel pinta el resumen por departamento', /Resumen por departamento/.test(html));
ok('la tabla de departamentos tiene fila TOTAL', /TOTAL/.test(html));
ok('el panel lista a BETO en proximos', /BETO PROXIMO/.test(html));
ok('el panel lista a ANA en pendientes', /ANA VENCIDA/.test(html));
ok('el panel avisa de DIEGO', /Sin fecha de ingreso/.test(html));
ok('el filtro de plazo pinta 3/6/12 meses',
  /3 meses/.test(html) && /6 meses/.test(html) && /12 meses/.test(html));
ok('6 meses viene marcado por defecto', /class="qxps on" data-a="qxvencmes" data-n="6"/.test(html));
ok('hay boton de imprimir panel', /data-a="qxvencprint"/.test(html));
ok('las 5 pestanas estan', (html.match(/data-a="qxsheet"/g) || []).length === 5,
  (html.match(/data-a="qxsheet"/g) || []).length);
ok('cada fila enlaza a la ficha', /data-a="qxficha" data-id="b" data-from="venc"/.test(html));

qxVencMeses = 3;
qxRenderVenc();
ok('el plazo de 3 meses queda marcado', /class="qxps on" data-a="qxvencmes" data-n="3"/.test(__view.innerHTML));
qxVencMeses = 6;

ok('la accion qxvencmes existe', typeof QX_ACTIONS.qxvencmes === 'function');
ok('la accion qxvencprint existe', typeof QX_ACTIONS.qxvencprint === 'function');
ok('volver desde el panel existe', typeof QX_ACTIONS.qxback === 'function');
qxSheet = 'macro';

/* ---------- Bloque A: gestión del trámite (Pendiente → Pagado) ---------- */
var g = qxEmptyEmpleado('ZOE GESTION');
g.fechaIngreso = '2015-03-01';
ok('el empleado nuevo trae los 4 campos de gestión',
  'gestion' in g.quinquenios[0] && 'fechaGestion' in g.quinquenios[0] &&
  'responsable' in g.quinquenios[0] && 'nota' in g.quinquenios[0]);
ok('qxFixEmpleado rellena los campos en bases antiguas', (function () {
  var viejo = qxFixEmpleado({ nombre: 'VIEJO', quinquenios: [{ estado: 'CUMPLE' }] });
  return viejo.quinquenios[0].gestion === '' && viejo.quinquenios[0].fechaGestion === '' &&
    viejo.quinquenios[0].estado === 'CUMPLE';
})());
ok('el flujo tiene los 5 estados', QX_GESTION_OPTS.length === 5 &&
  QX_GESTION_OPTS.indexOf('Pendiente') >= 0 && QX_GESTION_OPTS.indexOf('Pagado') >= 0);
ok('colores del trámite', qxGestionCls('Pagado') === 'qx-ok' && qxGestionCls('Rechazado') === 'qx-no' &&
  qxGestionCls('Pendiente') === '' && qxGestionBadge('Aprobado') === 'ok');

qxData.empleados.push(g);
qxGestionDialog(g.id, 0);
ok('el diálogo pide estado, fecha, responsable y nota',
  /qxg-gestion/.test(__modal) && /qxg-fecha/.test(__modal) && /qxg-resp/.test(__modal) && /qxg-nota/.test(__modal));
ok('el diálogo ofrece el flujo completo',
  /Pendiente/.test(__modal) && /En proceso/.test(__modal) && /Aprobado/.test(__modal) &&
  /Pagado/.test(__modal) && /Rechazado/.test(__modal));
ok('el diálogo marca CUMPLE si ya lo estaba', !/checked/.test(__modal));

__els['qxg-gestion'] = { value: 'Pagado' };
__els['qxg-fecha'] = { value: '2026-01-15' };
__els['qxg-resp'] = { value: '  Maria  ' };
__els['qxg-nota'] = { value: ' Pagado en nomina ' };
__els['qxg-cumple'] = { checked: true };
qxPersist = function () { __saved++; return Promise.resolve(); };
renderQx = function () { __rendered++; };
qxGestionSave(g.id, 0);
ok('guardar escribe el estado del trámite', g.quinquenios[0].gestion === 'Pagado', g.quinquenios[0].gestion);
ok('guardar guarda la fecha de gestión', g.quinquenios[0].fechaGestion === '2026-01-15', g.quinquenios[0].fechaGestion);
ok('guardar recorta el responsable', g.quinquenios[0].responsable === 'Maria', g.quinquenios[0].responsable);
ok('guardar recorta la nota', g.quinquenios[0].nota === 'Pagado en nomina', g.quinquenios[0].nota);
ok('marcar CUMPLE desde el diálogo funciona', g.quinquenios[0].estado === 'CUMPLE', g.quinquenios[0].estado);
ok('y se persiste', __saved === 1, __saved);

/* Desmarcar CUMPLE debe limpiarlo, no dejarlo colgado */
__els['qxg-cumple'] = { checked: false };
qxGestionSave(g.id, 1);
ok('desmarcar CUMPLE lo quita', g.quinquenios[1].estado === '', g.quinquenios[1].estado);

/* Aviso del menú */
var pend = qxAnalizaVenc(qxVencMeses).pendientes.length;
ok('qxPendientesCount coincide con el panel', qxPendientesCount() === pend, qxPendientesCount() + ' vs ' + pend);
ok('qxPendientesCount es 0 sin base', (function () {
  var g2 = qxData; qxData = null; var n = qxPendientesCount(); qxData = g2; return n === 0;
})());
ok('qxUpdateBadge no revienta sin botones', (function () {
  try { qxBadgeN = -1; qxUpdateBadge(); return true; } catch (e) { return false; }
})());
ok('las acciones del trámite existen',
  typeof QX_ACTIONS.qxgestion === 'function' && typeof QX_ACTIONS.qxgsave === 'function');

/* El panel ofrece «Gestionar» en las filas con quinquenio */
qxSheet = 'venc';
qxRenderVenc();
var h2 = __view.innerHTML;
ok('el panel pone botón Gestionar en los vencimientos',
  /data-a="qxgestion"/.test(h2) && /data-i="0"/.test(h2));
ok('las filas de «datos a revisar» no llevan Gestionar',
  (h2.match(/data-a="qxgestion"/g) || []).length ===
  (h2.match(/data-from="venc"/g) || []).length - (h2.match(/⚠️ Revisar/g) || []).length,
  (h2.match(/data-a="qxgestion"/g) || []).length + ' botones / ' +
  (h2.match(/data-from="venc"/g) || []).length + ' filas');
qxSheet = 'macro';

/* ---------- Bloque B: calendario de vencimientos y constancia ---------- */
ok('qxMesLargo traduce el mes', qxMesLargo('2027-03') === 'Marzo 2027', qxMesLargo('2027-03'));
ok('qxMesLargo aguanta vacios', qxMesLargo('') === '' && qxMesLargo(null) === '');

var cal = qxCalendario(12);
var mesHoy = (function () {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
})();
ok('el calendario cubre 12 meses', cal.length === 12, cal.length);
ok('el calendario arranca en el mes actual', cal[0].clave === mesHoy, cal[0].clave + ' vs ' + mesHoy);
ok('los meses van en orden',
  cal.every(function (m, k) { return k === 0 || m.clave > cal[k - 1].clave; }));
ok('ningun vencimiento se pierde',
  cal.reduce(function (a, m) { return a + m.items.length; }, 0) === qxAnalizaVenc(12).proximos.length,
  cal.reduce(function (a, m) { return a + m.items.length; }, 0));
ok('los meses vacios se muestran igual', cal.some(function (m) { return m.items.length === 0; }));

qxSheet = 'venc';
qxRenderVenc();
var h3 = __view.innerHTML;
ok('el panel pinta el calendario', /Calendario de los próximos 12 meses/.test(h3));
ok('el calendario pone los 12 meses', (h3.match(/<td><b>[A-Z][a-z]+ \d{4}<\/b><\/td>/g) || []).length === 12,
  (h3.match(/<td><b>[A-Z][a-z]+ \d{4}<\/b><\/td>/g) || []).length);
ok('hay boton de exportar el calendario', /data-a="qxcalxlsx"/.test(h3));
ok('el calendario exportable existe', typeof QX_ACTIONS.qxcalxlsx === 'function');

/* Constancia */
qxData.empresa = { nombre: 'ACME CA', rif: 'J-123', ciudad: 'Caracas',
  cargoFirma: 'Gerente de RRHH', nombreFirma: 'Ana Jefa' };
qxConstanciaDialog(g.id, 0);
ok('el diálogo de constancia pide los datos de la empresa',
  /qxc-emp/.test(__modal) && /qxc-rif/.test(__modal) && /qxc-ciudad/.test(__modal) &&
  /qxc-cargo/.test(__modal) && /qxc-firma/.test(__modal));
ok('el diálogo de constancia recuerda lo ya guardado',
  /ACME CA/.test(__modal) && /Caracas/.test(__modal) && /Ana Jefa/.test(__modal));

var pdf = qxConstanciaPDF(g, 0, qxData.empresa);
ok('la constancia se genera', !!pdf);
var txt = pdf ? pdf.txt.join(' | ') : '';
ok('la constancia lleva el titulo', /CONSTANCIA DE QUINQUENIO/.test(txt));
ok('la constancia nombra a la empresa', /ACME CA/.test(txt) && /J-123/.test(txt));
ok('la constancia nombra al trabajador', /ZOE GESTION/.test(txt));
ok('la constancia lleva la fecha de ingreso', /01\/03\/2015/.test(txt));
ok('la constancia lleva el quinquenio y su fecha', /1er Quinquenio/.test(txt) && /01\/03\/2020/.test(txt));
ok('la constancia lleva el estado del tramite', /Pagado/.test(txt));
ok('la constancia lleva la ciudad y la firma',
  /Caracas/.test(txt) && /Ana Jefa/.test(txt) && /Gerente de RRHH/.test(txt));
ok('la constancia avisa si falta un dato', /—/.test(txt));

var __savedPdf = window.jspdf;
window.jspdf = {};
__toasts.length = 0;
ok('sin motor de PDF avisa y no revienta',
  qxConstanciaPDF(g, 0, {}) === null && __toasts.length === 1);
window.jspdf = __savedPdf;

ok('las acciones de constancia existen',
  typeof QX_ACTIONS.qxconst === 'function' && typeof QX_ACTIONS.qxconstgen === 'function');
qxSheet = 'macro';

/* ---------- Bloque C: filtros y orden de la hoja de cálculo ---------- */
qxData = { v: 1, origen: 'test', empleados: [
  emp('p1', 'ANA ALTA', 'Nomina', '2015-03-01'),
  emp('p2', 'BETO BAJA', 'Almacen', '2018-07-15'),
  emp('p3', 'CARLA ALTA', 'Nomina', '2012-01-10'),
  emp('p4', 'DIEGO MEDIA', 'Nomina', '2020-05-20')
]};
qxData.empleados[0].quinquenios[0].estado = 'CUMPLE';
qxData.empleados[1].quinquenios[1].gestion = 'Pagado';
qxData.empleados[2].quinquenios[0].gestion = 'Pendiente';
qxSheet = 'hoja1';
qxFilter = ''; qxFDepto = ''; qxFQuin = ''; qxFGest = ''; qxSort = { col: -1, dir: 1 };

ok('sin filtros salen todos', qxSheetList().length === 4, qxSheetList().length);
qxFDepto = 'Nomina';
ok('el filtro por departamento funciona', qxSheetList().length === 3, qxSheetList().length);
qxFDepto = '';
qxFQuin = 'CUMPLE';
ok('el filtro por estado del quinquenio funciona',
  qxSheetList().length === 1 && qxSheetList()[0].id === 'p1', qxSheetList().length);
qxFQuin = 'sin';
ok('el filtro «sin definir» busca a los que no tienen ninguno',
  qxSheetList().length === 3, qxSheetList().length);
qxFQuin = '';
qxFGest = 'Pagado';
ok('el filtro por estado del trámite funciona',
  qxSheetList().length === 1 && qxSheetList()[0].id === 'p2', qxSheetList().length);
qxFGest = '';
qxFilter = 'almacen';
ok('el buscador de texto sigue funcionando', qxSheetList().length === 1, qxSheetList().length);
qxFilter = '';

qxSort = { col: 0, dir: 1 };      /* NOMBRE COMPLETO */
ok('ordena por nombre A→Z', qxSheetList()[0].nombre === 'ANA ALTA', qxSheetList()[0].nombre);
qxSort = { col: 0, dir: -1 };
ok('ordena por nombre Z→A', qxSheetList()[0].nombre === 'DIEGO MEDIA', qxSheetList()[0].nombre);
qxSort = { col: 1, dir: 1 };      /* FECHA DE INGRESO */
ok('ordena por fecha de ingreso', qxSheetList()[0].id === 'p3', qxSheetList()[0].id);
qxSort = { col: 3, dir: 1 };      /* ANTIGÜEDAD (columna calculada) */
ok('ordena por una columna calculada', qxSheetList()[0].id === 'p3', qxSheetList()[0].id);
qxSort = { col: 1, dir: -1 };
ok('invertir el orden funciona', qxSheetList()[0].id === 'p4', qxSheetList()[0].id);
qxSort = { col: -1, dir: 1 };

ok('qcCmp ordena números de verdad', qxCmp('2', '10') < 0 && qxCmp('5000', '900') > 0);
ok('qcCmp ordena fechas ISO', qxCmp('2020-01-01', '2021-01-01') < 0);
ok('qcCmp ignora acentos', qxCmp('Ávila', 'Beto') < 0);
ok('qcCmp manda los vacíos al final', qxCmp('', 'A') > 0 && qxCmp('A', '') < 0);

/* El grid: encabezados ordenables y celdas con etiqueta para la vista móvil */
qxData.empleados = qxData.empleados.slice(0, 3);
var grid = { innerHTML: '' };
__els['qxgridwrap'] = grid;
qxPage = 0; qxPageSize = 50;
qxGridRefresh();
var gh = grid.innerHTML;
ok('los encabezados son botones de orden', /data-a="qxsort" data-k="0"/.test(gh));
ok('la tabla sigue teniendo 27 columnas', (gh.match(/<th[ >]/g) || []).length === 27,
  (gh.match(/<th[ >]/g) || []).length);
ok('las celdas llevan data-h para la vista móvil', /<td data-h="NOMBRE COMPLETO"/.test(gh));
ok('el encabezado ordenado se marca con flecha', (function () {
  qxSort = { col: 0, dir: 1 }; qxGridRefresh();
  var r = /qxsorth on/.test(grid.innerHTML) && /▲/.test(grid.innerHTML);
  qxSort = { col: 0, dir: -1 }; qxGridRefresh();
  r = r && /▼/.test(grid.innerHTML);
  qxSort = { col: -1, dir: 1 }; qxGridRefresh();
  return r;
})());
ok('las acciones de orden y filtros existen',
  typeof QX_ACTIONS.qxsort === 'function' && typeof QX_ACTIONS.qxfiltros === 'function');
qxSheet = 'macro';

/* ---------- Bloque D: historial, comprobantes y cédulas repetidas ---------- */
qxData = { v: 1, origen: 'test', empleados: [
  emp('d1', 'ANA DUPLICADA', 'Nomina', '2015-03-01'),
  emp('d2', 'BETO DUPLICADO', 'Nomina', '2016-03-01')
]};
qxData.empleados[0].numPersona = 'B001';
qxData.empleados[1].numPersona = 'B001';

var rD = qxAnalizaVenc(6);
ok('las cédulas repetidas se detectan en los dos implicados',
  rD.revisar.filter(function (x) { return /N\.º de personal repetido: B001/.test(x.texto); }).length === 2,
  rD.revisar.length);
ok('el aviso indica cuántos comparten el número',
  rD.revisar.some(function (x) { return /\(2 trabajadores\)/.test(x.texto); }));
ok('una cédula única no se marca', (function () {
  qxData.empleados[1].numPersona = 'B002';
  var n = qxAnalizaVenc(6).revisar.filter(function (x) { return /repetido/.test(x.texto); }).length;
  qxData.empleados[1].numPersona = 'B001';
  return n === 0;
})());
ok('sin número de personal no se marca nada', (function () {
  var a = qxData.empleados[0].numPersona, b = qxData.empleados[1].numPersona;
  qxData.empleados[0].numPersona = ''; qxData.empleados[1].numPersona = '';
  var n = qxAnalizaVenc(6).revisar.filter(function (x) { return /repetido/.test(x.texto); }).length;
  qxData.empleados[0].numPersona = a; qxData.empleados[1].numPersona = b;
  return n === 0;
})());

/* Historial de cambios */
qxData.hist = undefined;
qxHist('Prueba', 'algo');
ok('el historial se crea solo', Array.isArray(qxData.hist) && qxData.hist.length === 1);
ok('la entrada guarda fecha, acción y detalle',
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(qxData.hist[0].f) &&
  qxData.hist[0].a === 'Prueba' && qxData.hist[0].d === 'algo', qxData.hist[0].f);
qxHist('Segunda', 'x');
ok('lo más nuevo va primero', qxData.hist[0].a === 'Segunda');
ok('el historial tiene tope', (function () {
  for (var k = 0; k < QX_HIST_MAX + 40; k++) qxHist('Bulk', String(k));
  return qxData.hist.length === QX_HIST_MAX;
})(), qxData.hist.length);
ok('qxHistorial devuelve una copia, no el original', (function () {
  var a = qxHistorial(); a.push({ a: 'intruso' });
  return qxHistorial().length === QX_HIST_MAX;
})());
ok('sin base, qxHist no revienta', (function () {
  var g = qxData; qxData = null;
  var r = (function () { try { qxHist('x', 'y'); return true; } catch (e) { return false; } })();
  qxData = g; return r;
})());

/* Las ediciones quedan anotadas */
qxData.hist = [];
qxApplyEdit(qxData.empleados[0],
  { dataset: { qx: 'quin-resp', i: '0' }, value: 'Maria', className: '' });
ok('editar un campo queda en el historial',
  qxData.hist.length === 1 && qxData.hist[0].a === 'Edición' &&
  /ANA DUPLICADA/.test(qxData.hist[0].d) && /Responsable/.test(qxData.hist[0].d) &&
  /Maria/.test(qxData.hist[0].d), qxData.hist.length ? qxData.hist[0].d : '');
ok('la etiqueta del campo dice qué quinquenio',
  /1er Quinquenio · Responsable/.test(qxFieldLabel('quin-resp', 0, NaN)), qxFieldLabel('quin-resp', 0, NaN));
ok('la etiqueta del campo dice qué adelanto',
  /2do Quinquenio · Primer Adelanto · Años/.test(qxFieldLabel('adel-anios', 1, 0)), qxFieldLabel('adel-anios', 1, 0));
ok('el historial guarda los cambios del trámite', (function () {
  qxData.hist = [];
  __els['qxg-gestion'] = { value: 'Aprobado' };
  __els['qxg-fecha'] = { value: '' };
  __els['qxg-resp'] = { value: '' };
  __els['qxg-nota'] = { value: '' };
  __els['qxg-cumple'] = { checked: false };
  qxGestionSave('d1', 0);
  return qxData.hist.length === 1 && qxData.hist[0].a === 'Trámite';
})(), qxData.hist.length ? qxData.hist[0].a : '');
qxData.hist = [];

/* Comprobantes enlazados a la bóveda */
docs = [{ id: 'doc1', name: 'comprobante.pdf', cat: 'Comprobantes' }];
qxData.empleados[0].quinquenios[0].comprobantes = [
  { id: 'doc1', name: 'comprobante.pdf', f: '2026-01-01', size: 1024 },
  { id: 'fantasma', name: 'borrado.pdf', f: '2026-01-01', size: 1 }
];
ok('los comprobantes borrados de la bóveda no se listan',
  qxComps(qxData.empleados[0].quinquenios[0]).length === 1,
  qxComps(qxData.empleados[0].quinquenios[0]).length);
ok('un quinquenio sin comprobantes no revienta', qxComps(undefined).length === 0 && qxComps({}).length === 0);

qxComprobanteDialog('d1', 0);
ok('el diálogo lista los comprobantes que existen', /comprobante\.pdf/.test(__modal));
ok('el diálogo no lista los huérfanos', !/borrado\.pdf/.test(__modal));
ok('el diálogo permite adjuntar', /id="qxcomp-file"/.test(__modal) && /data-a="qxcompadd"/.test(__modal));
ok('el diálogo abre con el visor de la bóveda', /data-a="open" data-id="doc1"/.test(__modal));
ok('el diálogo permite quitar de la ficha', /data-a="qxcompdel"/.test(__modal));

ok('las acciones del bloque D existen',
  typeof QX_ACTIONS.qxhist === 'function' && typeof QX_ACTIONS.qxhistclear === 'function' &&
  typeof QX_ACTIONS.qxcomp === 'function' && typeof QX_ACTIONS.qxcompadd === 'function' &&
  typeof QX_ACTIONS.qxcompdel === 'function');

/* ---------- Excel real: avance, puesta al día y acciones en lote ---------- */
qxData = { v: 1, origen: 'test', empleados: [
  emp('r1', 'ANA ANTIGUA', 'Nomina', '2010-06-15'),
  emp('r2', 'BETO MEDIO', 'Almacen', '2020-06-15'),
  emp('r3', 'CARLA NUEVA', 'Nomina', '2026-01-15')
]};
qxData.empleados[0].numPersona = 'X1';
qxData.empleados[1].numPersona = 'X2';
qxData.empleados[2].numPersona = 'X3';
qxData.empleados[0].quinquenios[0].estado = 'CUMPLE';
qxData.empleados[1].quinquenios[0].estado = 'CUMPLE';

var rA = qxAnalizaVenc(6);
ok('cuenta los quinquenios ya vencidos', rA.vencidos === 4, rA.vencidos);
ok('cuenta los vencidos ya marcados CUMPLE', rA.marcados === 2, rA.marcados);
ok('pendientes = vencidos - marcados',
  rA.pendientes.length === rA.vencidos - rA.marcados, rA.pendientes.length);

var av = qxAvance(6);
ok('el avance es el % de marcados', av.pct === 50, av.pct);
ok('el avance cuenta los periodos sin calcular',
  av.totalQ === 9 && av.conPeriodo === 0, av.conPeriodo + '/' + av.totalQ);
ok('el avance reparte la antiguedad por tramos',
  av.ant['5'] === 1 && av.ant['10'] === 0 && av.ant['15'] === 1,
  JSON.stringify(av.ant));

/* Validacion nueva: el periodo debe cuadrar con la fecha de ingreso */
qxData.empleados[1].quinquenios[1].periodo = '01/01/2020 - 01/01/2025';
ok('detecta un periodo que no cuadra con la fecha de ingreso',
  qxAnalizaVenc(6).revisar.some(function (x) { return x.tipo === 'periodo'; }));
ok('no marca el periodo correcto', (function () {
  qxData.empleados[1].quinquenios[1].periodo = qxPeriodoQuin('2020-06-15', 1);
  var n = qxAnalizaVenc(6).revisar.filter(function (x) { return x.tipo === 'periodo'; }).length;
  qxData.empleados[1].quinquenios[1].periodo = '';
  return n === 0;
})());
ok('no se mete con los periodos escritos a mano en texto libre', (function () {
  qxData.empleados[1].quinquenios[1].periodo = 'pendiente por confirmar';
  var n = qxAnalizaVenc(6).revisar.filter(function (x) { return x.tipo === 'periodo'; }).length;
  qxData.empleados[1].quinquenios[1].periodo = '';
  return n === 0;
})());

/* Validaciones nuevas: datos que faltan (los que tiene el Excel real) */
qxData.empleados[0].numPersona = '';
qxData.empleados[0].departamento = '';
qxData.empleados[0].nombrePuesto = '';
qxData.empleados[0].codUbicacion = '';
var rS = qxAnalizaVenc(6);
ok('avisa de quien no tiene N.º de personal',
  rS.revisar.some(function (x) { return x.tipo === 'sin-numero'; }));
ok('avisa de quien no tiene departamento',
  rS.revisar.some(function (x) { return x.tipo === 'sin-departamento'; }));
ok('avisa de quien no tiene datos de la Hoja 3',
  rS.revisar.some(function (x) { return x.tipo === 'sin-hoja3'; }));
qxData.empleados[0].numPersona = 'X1';
qxData.empleados[0].departamento = 'Nomina';
qxData.empleados[0].nombrePuesto = 'JEFA DE BODEGA';

/* Puesta al dia */
qxData.empleados[2].nombrePuesto = 'OPERARIA';
qxData.empleados[2].cargo = '';
qxData.empleados[0].quinquenios[0].visado = 'SI';
qxData.empleados[0].quinquenios[1].estado = 'CUMPLE ';

var pd = qxPonerAlDiaBase(qxData.empleados);
ok('la puesta al dia rellena los periodos vacios', pd.periodos === 9, pd.periodos);
ok('la puesta al dia copia el cargo desde la Hoja 3', pd.cargos === 1, pd.cargos);
ok('el cargo quedo copiado', qxData.empleados[2].cargo === 'OPERARIA', qxData.empleados[2].cargo);
ok('la puesta al dia limpia los valores no validos', pd.limpiados === 2, pd.limpiados);
ok('el visado quedo normalizado (SI -> Sí)',
  qxData.empleados[0].quinquenios[0].visado === 'Sí', qxData.empleados[0].quinquenios[0].visado);
ok('el estado con espacios quedo normalizado',
  qxData.empleados[0].quinquenios[1].estado === 'CUMPLE', qxData.empleados[0].quinquenios[1].estado);
ok('los periodos quedaron bien calculados',
  qxData.empleados[1].quinquenios[1].periodo === qxPeriodoQuin('2020-06-15', 1),
  qxData.empleados[1].quinquenios[1].periodo);
ok('no pisa un periodo escrito a mano', (function () {
  var g = qxEmptyEmpleado('ZZ PRUEBA');
  g.fechaIngreso = '2000-01-01';
  g.quinquenios[0].periodo = 'MIO';
  var n = qxPonerAlDiaBase([g]);
  return n.periodos === 2 && g.quinquenios[0].periodo === 'MIO';
})());

/* Seleccion en lote */
qxSel = {};
ok('sin seleccion el contador es 0', qxSelCount() === 0);
qxSelToggle('r1|0');
qxSelToggle('r2|1');
ok('seleccionar suma al contador', qxSelCount() === 2, qxSelCount());
qxSelToggle('r1|0');
ok('volver a pulsar quita la seleccion', qxSelCount() === 1, qxSelCount());

qxData.empleados[0].quinquenios[1].estado = '';
qxData.empleados[1].quinquenios[0].estado = '';
qxData.empleados[0].quinquenios[1].gestion = '';
var nSel = qxSelAplicarBase(['r1|1', 'r2|0'], 'CUMPLE', '');
ok('marcar CUMPLE en lote afecta a los seleccionados', nSel === 2, nSel);
ok('el estado quedo en CUMPLE',
  qxData.empleados[0].quinquenios[1].estado === 'CUMPLE' &&
  qxData.empleados[1].quinquenios[0].estado === 'CUMPLE');
ok('y el tramite pasa a Aprobado si estaba vacio',
  qxData.empleados[0].quinquenios[1].gestion === 'Aprobado',
  qxData.empleados[0].quinquenios[1].gestion);
ok('aplicar tramite en lote funciona',
  qxSelAplicarBase(['r3|0'], '', 'Pagado') === 1 &&
  qxData.empleados[2].quinquenios[0].gestion === 'Pagado');
ok('y le pone fecha de gestion', !!qxData.empleados[2].quinquenios[0].fechaGestion,
  qxData.empleados[2].quinquenios[0].fechaGestion);
ok('ignora claves que no existen', qxSelAplicarBase(['noexiste|0'], 'CUMPLE', '') === 0);

qxSelAll(true);
ok('seleccionar todos toma los pendientes',
  qxSelCount() === qxAnalizaVenc(qxVencMeses).pendientes.length, qxSelCount());
qxSelAll(false);
ok('quitar la seleccion la deja vacia', qxSelCount() === 0);

/* El panel pinta el avance y la barra de acciones en lote */
qxSheet = 'venc';
qxRenderVenc();
var hA = __view.innerHTML;
ok('el panel pinta el avance de la gestion', /Avance de la gestión/.test(hA));
ok('el panel pinta la barra de progreso', /class="qxbar"/.test(hA));
ok('el panel pinta los tramos de antiguedad',
  /con 5\+ años/.test(hA) && /con 15\+ años/.test(hA));
ok('el panel ofrece poner la base al dia', /data-a="qxpuestaaldia"/.test(hA));
ok('el panel ofrece acciones en lote',
  /data-a="qxselcumple"/.test(hA) && /data-a="qxselgestion"/.test(hA));
ok('el panel pone casillas de seleccion', /data-a="qxsel"/.test(hA));
ok('las acciones nuevas existen',
  typeof QX_ACTIONS.qxpuestaaldia === 'function' && typeof QX_ACTIONS.qxsel === 'function' &&
  typeof QX_ACTIONS.qxselall === 'function' && typeof QX_ACTIONS.qxselcumple === 'function');
qxSheet = 'macro';
qxSel = {};

/* ---------- Módulo de Adelantos ---------- */
qxData = { v: 1, origen: 'test', empleados: [
  emp('a1', 'ANA ADELANTO', 'Nomina', '2010-06-15'),
  emp('a2', 'BETO ADELANTO', 'Almacen', '2020-06-15')
]};
ok('sin adelantos la lista esta vacia', qxAdelList().length === 0);
ok('los totales salen a cero', qxAdelStats().total === 0 && qxAdelStats().anios === 0);

qxData.empleados[0].adelantos[0][0] = { detalle: 'Adelanto de vacaciones', periodo: '2024-2025', anios: '1', visado: 'Sí' };
qxData.empleados[0].adelantos[1][2] = { detalle: 'Emergencia', periodo: '', anios: '2', visado: '' };
qxData.empleados[1].adelantos[0][0] = { detalle: 'Estudios', periodo: '', anios: '0.5', visado: 'No' };

ok('la lista recoge los adelantos', qxAdelList().length === 3, qxAdelList().length);
var sa = qxAdelStats();
ok('cuenta los adelantos', sa.total === 3, sa.total);
ok('suma los anios adelantados', sa.anios === 3.5, sa.anios);
ok('cuenta los trabajadores con adelantos', sa.empleados === 2, sa.empleados);
ok('cuenta los que no tienen visado',
  sa.sinVisado === 1 && sa.porVisado === 2, sa.sinVisado + '/' + sa.porVisado);

qxAdelBuscar = 'ana';
ok('el buscador filtra por trabajador', qxAdelFiltrados().length === 2, qxAdelFiltrados().length);
qxAdelBuscar = 'estudios';
ok('el buscador filtra por detalle', qxAdelFiltrados().length === 1, qxAdelFiltrados().length);
qxAdelBuscar = 'almacen';
ok('el buscador filtra por departamento', qxAdelFiltrados().length === 1, qxAdelFiltrados().length);
qxAdelBuscar = 'zzz';
ok('sin coincidencias devuelve vacio', qxAdelFiltrados().length === 0);
qxAdelBuscar = '';

ok('el dialogo de adelanto pide todos los datos', (function () {
  qxAdelDialog(null, 0, 0);
  return /qad-emp/.test(__modal) && /qad-k/.test(__modal) && /qad-j/.test(__modal) &&
    /qad-det/.test(__modal) && /qad-per/.test(__modal) && /qad-an/.test(__modal) && /qad-vis/.test(__modal);
})());
ok('el dialogo de edicion no vuelve a pedir el trabajador', (function () {
  qxAdelDialog('a1', 0, 0);
  return !/qad-emp/.test(__modal) && /Adelanto de vacaciones/.test(__modal);
})());

/* La pestaña se pinta */
qxSheet = 'adel';
qxRenderAdel();
var hAd = __view.innerHTML;
ok('la pestana de adelantos se pinta', /Adelantos/.test(hAd) && /class="qxcards"/.test(hAd));
ok('la pestana lista los adelantos', /ANA ADELANTO/.test(hAd) && /Adelanto de vacaciones/.test(hAd));
ok('la pestana muestra el ranking', /Quiénes más han adelantado/.test(hAd));
ok('la pestana tiene boton de registrar', /data-a="qxadelnew"/.test(hAd));
ok('la pestana tiene exportacion', /data-a="qxadelexport"/.test(hAd));
ok('la pestana tiene 5 solapas', (hAd.match(/class="qxtab[ "]/g) || []).length === 5,
  (hAd.match(/class="qxtab[ "]/g) || []).length);
qxSheet = 'macro';

ok('las acciones de adelantos existen',
  typeof QX_ACTIONS.qxadelnew === 'function' && typeof QX_ACTIONS.qxadelsave === 'function' &&
  typeof QX_ACTIONS.qxadeldel === 'function' && typeof QX_ACTIONS.qxadelexport === 'function');

JSON.stringify(out);
"""

ctx = quickjs.Context()
src = STUBS + '\n' + (REPO / 'js/excel-quinquenios.js').read_text(encoding='utf-8') + '\n' + DATA
try:
    ctx.eval(src)
except Exception as e:
    print('ERROR al cargar excel-quinquenios.js:', e)
    raise SystemExit(1)

print('=== PANEL DE RRHH: logica verificada con quickjs ===')
try:
    raw = ctx.eval(CHECKS)
except Exception as e:
    print('ERROR al ejecutar las comprobaciones:', e)
    raise SystemExit(1)

res = json.loads(raw)
for x in res:
    print(('  ok     ' if x['ok'] else '  FALLO  ') + x['n'] + ('' if x['ok'] else '   [' + x['x'] + ']'))

total = len(res)
fallos = len([x for x in res if not x['ok']])
print('\nRESULTADO: %d comprobaciones, %d fallos' % (total, fallos))
raise SystemExit(1 if fallos else 0)
