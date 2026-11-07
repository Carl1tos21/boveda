#!/usr/bin/env python3
"""
Construye dist/ lista para publicar (Netlify, GitHub Pages, Vercel, Cloudflare...).

    uso:  python3 tools/build.py

Qué hace:
  - Copia SOLO lo necesario para producción (nunca test/ ni tools/).
  - Escribe dist/_headers con las cabeceras de seguridad (Netlify lo lee solo).
  - Sella sw.js con un hash del contenido: cada despliegue invalida la caché
    automáticamente, sin que haya que subir versiones a mano.
  - Verifica que no falte ningún archivo referenciado por index.html, sw.js
    ni manifest.json.
"""
import hashlib
import os
import pathlib
import re
import shutil
import sys

sys.dont_write_bytecode = True   # no crear __pycache__ en tools/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import security_headers  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'

INCLUDE = [
    'index.html',
    'ms-auth.html',
    'manifest.json',
    'sw.js',
    'css',
    'js',
    'icons',
    'vendor',
    'data',
]

EXCLUDE_NAMES = {'.DS_Store', 'Thumbs.db', '__pycache__', 'README.md'}
EXCLUDE_SUFFIX = {'.pyc', '.pyo', '.map'}


def clean():
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)


def copy_entry(rel):
    src = ROOT / rel
    if src.is_dir():
        for item in sorted(src.rglob('*')):
            if item.is_dir():
                continue
            if item.name in EXCLUDE_NAMES or item.suffix in EXCLUDE_SUFFIX:
                continue
            out = DIST / item.relative_to(ROOT)
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, out)
    else:
        (DIST / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, DIST / rel)


def build_hash():
    h = hashlib.sha256()
    for f in sorted(DIST.rglob('*')):
        if f.is_file():
            h.update(str(f.relative_to(DIST)).encode())
            h.update(f.read_bytes())
    return h.hexdigest()[:12]


def stamp_sw(build):
    sw = DIST / 'sw.js'
    text = sw.read_text(encoding='utf-8')
    if '__BUILD__' not in text:
        raise SystemExit('ERROR: sw.js no contiene el marcador __BUILD__')
    sw.write_text(text.replace('__BUILD__', build), encoding='utf-8')


def stamp_csp():
    """
    Mete el CSP dentro de los HTML como <meta http-equiv>.

    GitHub Pages no permite enviar cabeceras propias, así que sin esto la app
    publicada se quedaría sin la política de seguridad. Va justo después de
    <meta charset> para que valga desde el primer recurso que se carga.
    """
    meta = ('<meta http-equiv="Content-Security-Policy" content="%s">'
            % security_headers.META_CSP)
    for name in ('index.html', 'ms-auth.html'):
        f = DIST / name
        if not f.exists():
            continue
        text = f.read_text(encoding='utf-8')
        if 'Content-Security-Policy' in text:
            continue
        marca = '<meta charset="utf-8">'
        if marca not in text:
            raise SystemExit('ERROR: %s no tiene %s' % (name, marca))
        f.write_text(text.replace(marca, marca + '\n' + meta, 1), encoding='utf-8')


def stamp_base():
    """Añade la etiqueta <base> para rutas relativas en GitHub Pages.

    GitHub Pages sirve los project pages en /<repo-name>/, así que añadimos
    href="/boveda/" para que los recursos CSS/JS se carguen correctamente.
    """
    base = '<base href="/boveda/">\n'
    for name in ('index.html', 'ms-auth.html'):
        f = DIST / name
        if not f.exists():
            continue
        text = f.read_text(encoding='utf-8')
        if '<base' in text:
            # Ya hay un <base>, actualízalo
            text = re.sub(r'<base[^>]*>', base.strip(), text)
        else:
            # Inserta <base> después de <meta charset>
            marca = '<meta charset="utf-8">'
            if marca in text:
                text = text.replace(marca, marca + '\n' + base, 1)
        f.write_text(text, encoding='utf-8')


def check_csp():
    """Comprueba que el CSP quedó dentro de los HTML publicados."""
    faltan = []
    for name in ('index.html', 'ms-auth.html'):
        f = DIST / name
        if f.exists() and 'Content-Security-Policy' not in f.read_text(encoding='utf-8'):
            faltan.append(name)
    return faltan


def check_references():
    """Comprueba que exista todo lo que index.html, sw.js y el manifest referencian."""
    missing = []

    html = (DIST / 'index.html').read_text(encoding='utf-8')
    for ref in re.findall(r'(?:src|href)="([^"]+)"', html):
        if ref.startswith(('data:', 'http:', 'https:', '#', '/')):
            continue
        if not (DIST / ref).exists():
            missing.append('index.html -> ' + ref)

    sw = (DIST / 'sw.js').read_text(encoding='utf-8')
    for ref in re.findall(r"'\./([^']*)'", sw):
        if ref and not (DIST / ref).exists():
            missing.append('sw.js -> ' + ref)

    manifest = (DIST / 'manifest.json').read_text(encoding='utf-8')
    for ref in re.findall(r'"src"\s*:\s*"([^"]+)"', manifest):
        if not (DIST / ref).exists():
            missing.append('manifest.json -> ' + ref)

    return missing


def main():
    clean()
    for entry in INCLUDE:
        if not (ROOT / entry).exists():
            raise SystemExit('ERROR: falta %s' % (ROOT / entry))
        copy_entry(entry)

    (DIST / '_headers').write_text(security_headers.as_netlify_file(), encoding='utf-8')

    stamp_csp()          # el CSP viaja también dentro del HTML (GitHub Pages)

    stamp_base()       # añade <base href="/boveda/"> para rutas relativas

    build = build_hash()
    stamp_sw(build)

    missing = check_references()
    if missing:
        print('Faltan archivos referenciados:')
        for m in missing:
            print('  -', m)
        return 1

    sin_csp = check_csp()
    if sin_csp:
        print('ERROR: falta el CSP dentro de: ' + ', '.join(sin_csp))
        return 1

    files = [f for f in sorted(DIST.rglob('*')) if f.is_file()]
    total = sum(f.stat().st_size for f in files)
    print('dist/ listo — build %s' % build)
    print('  %d archivos · %.2f MB' % (len(files), total / 1048576))
    for f in files:
        print('    %-42s %8.1f KB' % (f.relative_to(DIST), f.stat().st_size / 1024))
    print('\nSiguiente paso: arrastra la carpeta dist/ a https://app.netlify.com/drop')
    return 0


if __name__ == '__main__':
    sys.exit(main())
