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
var document = {
  visibilityState: 'visible',
  querySelectorAll: function(){ return []; },
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
ok('revisar = 2 (DIEGO sin fecha + adelanto sin detalle)', r.revisar.length === 2, r.revisar.length);
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
ok('las 4 pestanas estan', (html.match(/data-a="qxsheet"/g) || []).length === 4,
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
