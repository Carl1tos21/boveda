"""
Cabeceras de seguridad de Bóveda.

Una sola fuente de verdad, usada por:
  - tools/serve.py  (para que las pruebas E2E corran CON las cabeceras puestas)
  - tools/build.py  (escribe dist/_headers, que Netlify lee automáticamente)

Nota: GitHub Pages no soporta `_headers`. En ese hosting la app funciona igual,
pero sin estas protecciones.
"""

# script-src 'self' es estricto a propósito: no hay ni un <script> inline.
# style-src necesita 'unsafe-inline' porque la app usa atributos style="..."
# (los estilos en atributo no se pueden autorizar de otra forma).
#
# Se permiten los dominios de Google porque el inicio de sesión de Google
# Identity Services (sincronización con Drive) los necesita: carga su script,
# abre una ventana emergente y consulta la API de Drive. Si no usas la
# sincronización, esos permisos simplemente no se aprovechan.
GOOGLE = 'https://accounts.google.com'
API_GOOGLE = 'https://www.googleapis.com'

CSP = '; '.join([
    "default-src 'self'",
    "script-src 'self' " + GOOGLE,
    "style-src 'self' 'unsafe-inline' " + GOOGLE,
    "img-src 'self' blob: data: https://*.googleusercontent.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' " + API_GOOGLE + " https://oauth2.googleapis.com " + GOOGLE,
    "media-src 'self' blob:",
    "frame-src blob: " + GOOGLE,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
])

HEADERS = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    # camera=(self): el <input capture> abre la app de cámara del sistema y no
    # depende de esta política, pero se permite por si algún navegador la usa.
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(self), payment=(), usb=()',
    # allow-popups: necesario para la ventana de inicio de sesión de Google.
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
}


def as_netlify_file():
    """Devuelve el contenido del archivo `_headers` de Netlify."""
    lines = ['/*']
    for k, v in HEADERS.items():
        lines.append('  %s: %s' % (k, v))
    return '\n'.join(lines) + '\n'
