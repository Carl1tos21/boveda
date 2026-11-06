#!/usr/bin/env python3
"""
Comprueba que todos los scripts de js/ son JavaScript válido, SIN ejecutarlos.

    uso:  python3 tools/check_js.py

Envuelve cada archivo en una función y lo compila con quickjs: así se detectan
errores de sintaxis sin depender de un navegador ni de Node. Es una red de
seguridad barata para el CI (junto a las pruebas E2E).

Requiere quickjs (pip install quickjs). Si no está instalado, se omite con
código 0, para no bloquear entornos que no lo tengan.
"""
import glob
import pathlib
import sys

try:
    import quickjs
except ImportError:
    print('quickjs no instalado (pip install quickjs) - comprobación omitida')
    raise SystemExit(0)

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = sorted(glob.glob(str(ROOT / 'js' / '*.js')))

bad = 0
for f in FILES:
    rel = pathlib.Path(f).relative_to(ROOT)
    src = pathlib.Path(f).read_text(encoding='utf-8')
    try:
        # '(function(){ ... })' compila (analiza) el archivo sin llamarlo.
        quickjs.Context().eval('(function(){' + src + '\n})')
        print('[OK]   %s' % rel)
    except Exception as e:                                    # noqa: BLE001
        bad += 1
        print('[FAIL] %s -> %s' % (rel, e))

print('\n%d/%d archivos sin errores de sintaxis' % (len(FILES) - bad, len(FILES)))
sys.exit(0 if bad == 0 else 1)
