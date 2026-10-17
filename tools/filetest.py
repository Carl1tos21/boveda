#!/usr/bin/env python3
"""
Prueba E2E de Bóveda abriendo index.html DIRECTAMENTE desde el disco (file://).

Comprueba el escenario "doble clic": contexto seguro, crypto.subtle e
IndexedDB disponibles sin ningún servidor.

Genera una copia temporal de index.html (con el capturador de errores y
test/runner.js inyectados) dentro de la raíz del proyecto —para que las rutas
relativas sigan funcionando—, la abre en Firefox headless con dump() habilitado
y extrae el informe del flujo de errores.

    uso:  python3 tools/filetest.py
"""
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
MARK = '__BOVEDA_REPORT__'

CAPTURE = """<script>
window.__errs = [];
addEventListener('error', function (e) {
  window.__errs.push({ type: 'error', msg: String(e.message),
                       at: String(e.filename || '') + ':' + (e.lineno || 0) });
});
addEventListener('unhandledrejection', function (e) {
  window.__errs.push({ type: 'rejection',
                       msg: String((e.reason && e.reason.message) || e.reason) });
});
</script>"""


def build_page(target='.'):
    """Genera <target>/.filetest.html con el capturador y el runner inyectados."""
    base = ROOT if target == '.' else ROOT / target
    page = base / '.filetest.html'
    runner = (ROOT / 'test' / 'runner.js').as_uri()   # ruta absoluta: sirve igual en dist/

    html = (base / 'index.html').read_text(encoding='utf-8')
    html = html.replace('<head>', '<head>' + CAPTURE, 1)
    html = html.replace('</body>', '<script src="%s"></script></body>' % runner, 1)
    page.write_text(html, encoding='utf-8')
    return page


def make_profile():
    prof = pathlib.Path(tempfile.mkdtemp(prefix='boveda-ff-'))
    (prof / 'user.js').write_text(
        'user_pref("browser.dom.window.dump.enabled", true);\n'
        'user_pref("browser.dump.enabled", true);\n',
        encoding='utf-8')
    return prof


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else '.'
    page = build_page(target)
    prof = make_profile()
    log = pathlib.Path(tempfile.gettempdir()) / 'boveda-filetest-firefox.log'
    url = page.as_uri()
    print('Abriendo %s' % url, flush=True)

    with open(log, 'w', encoding='utf-8') as fh:
        proc = subprocess.Popen(
            ['firefox', '--headless', '--no-remote', '--profile', str(prof), url],
            stdout=fh, stderr=fh)

    report = None
    deadline = time.time() + 120
    while time.time() < deadline:
        time.sleep(1)
        try:
            text = log.read_text(encoding='utf-8', errors='replace')
        except OSError:
            continue
        for line in text.splitlines():
            if line.startswith(MARK):
                report = json.loads(line[len(MARK):])
                break
        if report:
            break

    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()

    shutil.rmtree(prof, ignore_errors=True)
    page.unlink(missing_ok=True)

    if report is None:
        print('No se obtuvo informe. Revisa %s' % log)
        return 1

    for s in report['steps']:
        mark = 'PASS' if s['ok'] else 'FAIL'
        extra = '' if s['extra'] is None else '  ' + json.dumps(s['extra'], ensure_ascii=False)
        print('[%s] %s%s' % (mark, s['name'], extra))

    if report.get('errors'):
        print('\nErrores de JavaScript capturados:')
        for e in report['errors']:
            print('  -', e)

    ok = sum(1 for s in report['steps'] if s['ok'])
    print('\n%d/%d comprobaciones OK (file://)' % (ok, len(report['steps'])))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
