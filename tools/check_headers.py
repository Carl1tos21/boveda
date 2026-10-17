#!/usr/bin/env python3
"""
Comprueba que un servidor envía las cabeceras de seguridad de Bóveda.

Sirve tanto para el servidor local de pruebas como para el sitio ya publicado:

    python3 tools/check_headers.py http://127.0.0.1:5173/index.html
    python3 tools/check_headers.py https://mi-boveda.netlify.app/index.html
"""
import sys
import urllib.request

REQUIRED = {
    'content-security-policy': ["default-src 'self'", "script-src 'self'",
                                "object-src 'none'", "frame-ancestors 'none'"],
    'x-content-type-options': ['nosniff'],
    'referrer-policy': ['no-referrer'],
    'x-frame-options': ['deny'],
    'permissions-policy': ['camera'],
    'cross-origin-opener-policy': ['same-origin-allow-popups'],
}

DEFAULT_URL = 'http://127.0.0.1:5173/index.html'


def main(url):
    try:
        with urllib.request.urlopen(url, timeout=15) as res:
            headers = {k.lower(): v for k, v in res.headers.items()}
    except Exception as exc:                                  # noqa: BLE001
        print('No se pudo conectar a %s: %s' % (url, exc))
        return 1

    fails = []
    for name, needles in REQUIRED.items():
        value = headers.get(name, '')
        if not value:
            fails.append('falta la cabecera %s' % name)
            continue
        for needle in needles:
            if needle.lower() not in value.lower():
                fails.append('%s no contiene "%s"' % (name, needle))

    if fails:
        print('CABECERAS DE SEGURIDAD:')
        for f in fails:
            print('  [FAIL] %s' % f)
        return 1

    print('[PASS] %d cabeceras de seguridad presentes y correctas' % len(REQUIRED))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL))
