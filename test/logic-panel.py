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
var __view = { innerHTML: '' };
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
var window = {};
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
  return { id: id, nombre: nombre, departamento: dep, cargo: 'Analista', fechaIngreso: ingreso,
    quinquenios: [0, 1, 2].map(function (i) {
      return { estado: (estados && estados[i]) || '', periodo: '', visado: '' };
    }),
    adelantos: [[], [], [], []] };
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
