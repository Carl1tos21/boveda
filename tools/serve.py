#!/usr/bin/env python3
"""
Servidor de desarrollo y de pruebas para Bóveda.

Uso:
    python3 tools/serve.py                        # http://127.0.0.1:5173
    python3 tools/serve.py 5500                   # otro puerto
    python3 tools/serve.py --https --lan          # HTTPS + red local (MÓVIL)
    python3 tools/serve.py --root dist            # servir la carpeta dist/
    BOVEDA_ROOT=dist python3 tools/serve.py       # lo mismo, por variable de entorno

¿POR QUÉ --https ES IMPRESCINDIBLE PARA EL CELULAR?
Los navegadores solo permiten `crypto.subtle` (el cifrado de la bóveda) en
"contextos seguros": `https://` o `localhost`. Si abres la app desde el móvil
como `http://192.168.x.x`, la app avisará de que no puede cifrar y no dejará
entrar. Con `--https` se genera un certificado autofirmado y el móvil solo tiene
que aceptarlo una vez.

Envía las MISMAS cabeceras de seguridad que dist/_headers (ver
tools/security_headers.py), de modo que las pruebas E2E corran en las mismas
condiciones que en producción.

Rutas especiales (solo para las pruebas automáticas):
    /__test    -> sirve index.html con captura de errores + test/runner.js
    /__demo    -> siembra una bóveda de ejemplo (para capturas de pantalla)
    /__report  -> recibe ?d=<json> y lo guarda en el archivo de informe
"""
import argparse
import http.server
import json
import os
import pathlib
import re
import secrets
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.parse

sys.dont_write_bytecode = True   # no crear __pycache__ en tools/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import security_headers  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 5173
REPORT = os.environ.get('BOVEDA_REPORT', '/tmp/boveda-smoke-report.json')

_raw_root = os.environ.get('BOVEDA_ROOT') or ''
SERVE_ROOT = os.path.join(ROOT, _raw_root) if _raw_root else ROOT

CERT_DIR = pathlib.Path(tempfile.gettempdir()) / 'boveda-https'


def lan_ips():
    """Direcciones IPv4 de la red local (para abrir la app desde el móvil)."""
    ips = []
    try:
        out = subprocess.run(['ip', '-4', 'addr', 'show'],
                             capture_output=True, text=True, timeout=5).stdout
        for m in re.finditer(r'inet (\d+\.\d+\.\d+\.\d+)', out):
            if not m.group(1).startswith('127.'):
                ips.append(m.group(1))
    except Exception:
        pass
    if not ips:
        # Alternativa portable: preguntar al sistema qué IP local usaría.
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('8.8.8.8', 80))
            ips.append(s.getsockname()[0])
            s.close()
        except Exception:
            pass
    return ips


def ensure_cert(hosts):
    """Crea una sola vez un certificado autofirmado válido para esos hosts."""
    cert = CERT_DIR / 'cert.pem'
    key = CERT_DIR / 'key.pem'
    if cert.exists() and key.exists():
        return cert, key

    CERT_DIR.mkdir(parents=True, exist_ok=True)
    san = ','.join(('IP:' + h) if h[0].isdigit() else ('DNS:' + h) for h in hosts)
    subprocess.run([
        'openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', str(key), '-out', str(cert), '-days', '825',
        '-subj', '/CN=boveda.local',
        '-addext', 'subjectAltName=' + san,
        '-addext', 'basicConstraints=critical,CA:TRUE',
    ], check=True, capture_output=True)
    return cert, key


def print_qr(url):
    """Pinta un código QR en la terminal para abrir la URL con el móvil."""
    try:
        import qrcode
        qr = qrcode.QRCode(border=1)
        qr.add_data(url)
        qr.make(fit=True)
        qr.print_ascii(invert=True)
        return True
    except Exception:
        return False


CAPTURE = """<script nonce="__NONCE__">
window.__errs = [];
addEventListener('error', function (e) {
  window.__errs.push({ type: 'error', msg: String(e.message),
                       at: String(e.filename || '') + ':' + (e.lineno || 0) });
});
addEventListener('unhandledrejection', function (e) {
  window.__errs.push({ type: 'rejection',
                       msg: String((e.reason && e.reason.message) || e.reason) });
});
addEventListener('securitypolicyviolation', function (e) {
  window.__errs.push({ type: 'csp',
                       msg: e.violatedDirective + ' -> ' + (e.blockedURI || '(inline)'),
                       at: String(e.sourceFile || '') + ':' + (e.lineNumber || 0) });
});
</script>"""


class Handler(http.server.SimpleHTTPRequestHandler):
    # Ojo: BaseRequestHandler.__init__ ya atiende la petición, así que el nonce
    # debe existir como atributo de clase antes de que corra end_headers().
    nonce = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SERVE_ROOT, **kwargs)

    # --- Cabeceras de seguridad en TODAS las respuestas -------------------
    def end_headers(self):
        for name, value in security_headers.HEADERS.items():
            if name == 'Content-Security-Policy' and self.nonce:
                value = value.replace("script-src 'self'",
                                      "script-src 'self' 'nonce-%s'" % self.nonce)
            self.send_header(name, value)
        super().end_headers()

    # --- /test/* se sirve siempre desde el proyecto, aunque se sirva dist/ -
    def translate_path(self, path):
        clean = path.split('?')[0].split('#')[0]
        if clean.startswith('/test/'):
            rel = clean[len('/test/'):]
            return os.path.join(ROOT, 'test', *[p for p in rel.split('/') if p])
        return super().translate_path(path)

    def _send(self, body, ctype):
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split('?')[0]

        if path == '/__report':
            q = urllib.parse.urlparse(self.path).query
            data = urllib.parse.parse_qs(q).get('d', ['{}'])[0]
            with open(REPORT, 'w', encoding='utf-8') as fh:
                fh.write(data)
            self.send_response(204)
            self.end_headers()
            return

        if path == '/__test':
            self.nonce = secrets.token_urlsafe(16)
            with open(os.path.join(SERVE_ROOT, 'index.html'), encoding='utf-8') as fh:
                html = fh.read()
            html = html.replace('<head>',
                                '<head>' + CAPTURE.replace('__NONCE__', self.nonce), 1)
            html = html.replace('</body>',
                                '<script src="/test/runner.js"></script></body>', 1)
            self._send(html.encode('utf-8'), 'text/html; charset=utf-8')
            return

        # Página de demostración: siembra una bóveda de ejemplo y la deja
        # desbloqueada, para poder hacer capturas de pantalla.
        if path == '/__demo':
            with open(os.path.join(SERVE_ROOT, 'index.html'), encoding='utf-8') as fh:
                html = fh.read()
            hold = ('<img src="/__hold" alt="" '
                    'style="position:fixed;left:-10px;top:-10px;width:1px;height:1px;opacity:0">')
            html = html.replace('</body>',
                                hold + '<script src="/test/demo.js"></script></body>', 1)
            self._send(html.encode('utf-8'), 'text/html; charset=utf-8')
            return

        # Recurso lento: retrasa el evento `load` para que la captura de
        # pantalla se tome con la aplicación ya pintada.
        if path == '/__hold':
            time.sleep(6)
            self._send(b'', 'image/gif')
            return

        return super().do_GET()

    def log_message(self, *args):
        pass

    def log_error(self, fmt, *args):
        sys.stderr.write('ERROR: ' + (fmt % args) + '\n')
        sys.stderr.flush()


def parse_args():
    ap = argparse.ArgumentParser(
        prog='serve.py',
        description='Servidor de desarrollo y pruebas de Bóveda.')
    ap.add_argument('port', nargs='?', type=int, default=5173,
                    help='puerto (por defecto 5173)')
    ap.add_argument('--lan', action='store_true',
                    help='escuchar en toda la red local (para el móvil)')
    ap.add_argument('--https', action='store_true',
                    help='HTTPS con certificado autofirmado (necesario para el móvil)')
    ap.add_argument('--root', default=None,
                    help='carpeta a servir (por defecto, la raíz del proyecto)')
    ap.add_argument('--no-qr', action='store_true', help='no pintar el código QR')
    return ap.parse_args()


def main():
    global PORT, SERVE_ROOT
    args = parse_args()
    PORT = args.port
    if args.root:
        SERVE_ROOT = args.root if os.path.isabs(args.root) else os.path.join(ROOT, args.root)

    if os.path.exists(REPORT):
        os.remove(REPORT)

    host = '0.0.0.0' if args.lan else '127.0.0.1'
    scheme = 'https' if args.https else 'http'
    ips = lan_ips() if args.lan else []

    http.server.ThreadingHTTPServer.allow_reuse_address = True
    httpd = http.server.ThreadingHTTPServer((host, PORT), Handler)

    if args.https:
        try:
            cert, key = ensure_cert(['localhost', '127.0.0.1'] + ips)
        except Exception as exc:
            print('No se pudo crear el certificado (%s). ¿Está instalado openssl?' % exc)
            return 1
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(str(cert), str(key))
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

    # Primera línea en JSON: la leen las pruebas automáticas.
    print(json.dumps({'serving': SERVE_ROOT, 'port': PORT, 'report': REPORT,
                      'https': args.https, 'lan': args.lan}), flush=True)

    print('\n  Bóveda servida desde  %s' % SERVE_ROOT)
    print('  En esta computadora:  %s://localhost:%d' % (scheme, PORT))

    if args.lan and ips:
        url = '%s://%s:%d' % (scheme, ips[0], PORT)
        print('  En el celular:        %s' % url)
        if args.https:
            print('\n  La primera vez el móvil avisará del certificado (es propio y de')
            print('  pruebas): elige «Avanzado» → «Continuar». Solo pasa una vez.')
            if not args.no_qr:
                print('\n  Escanea este código con el celular:\n')
                print_qr(url)
        else:
            print('\n  ⚠️  AVISO: sin --https el cifrado NO funcionará en el móvil.')
            print('      Los navegadores solo permiten crypto.subtle en https:// o localhost.')
            print('      Reinícialo así:   python3 tools/serve.py %d --https --lan' % PORT)
    elif args.lan:
        print('\n  ⚠️  No se ha detectado ninguna IP de red local.')
        print('      Comprueba que el equipo esté conectado al WiFi.')

    print('\n  (Ctrl+C para parar)\n')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n  Servidor detenido.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
