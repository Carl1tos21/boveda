#!/usr/bin/env bash
# ==========================================================================
# Bóveda · prueba de extremo a extremo en Firefox headless.
#
#   uso:  bash tools/smoke.sh [puerto] [dist]
#
#     bash tools/smoke.sh              -> prueba el código fuente
#     bash tools/smoke.sh 5173 dist    -> prueba la carpeta dist/ ya construida
#
# Levanta tools/serve.py (con las cabeceras de seguridad de producción),
# verifica las cabeceras por HTTP, abre /__test en Firefox headless, espera
# el informe y lo imprime. Código de salida 0 = todo correcto.
# ==========================================================================
set -u

PORT="${1:-5173}"
MODE="${2:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT="${BOVEDA_REPORT:-/tmp/boveda-smoke-report.json}"
SERVER_LOG=/tmp/boveda-smoke-server.log
FIREFOX_LOG=/tmp/boveda-smoke-firefox.log
PROFILE="$(mktemp -d)"
BASE="http://127.0.0.1:$PORT"

if [ "$MODE" = "dist" ]; then
  export BOVEDA_ROOT="dist"
else
  export BOVEDA_ROOT=""
fi

cleanup() {
  [ -n "${FF_PID:-}" ] && kill "$FF_PID" 2>/dev/null
  [ -n "${SRV_PID:-}" ] && kill "$SRV_PID" 2>/dev/null
  rm -rf "$PROFILE"
}
trap cleanup EXIT

rm -f "$REPORT"

BOVEDA_REPORT="$REPORT" python3 "$ROOT/tools/serve.py" "$PORT" > "$SERVER_LOG" 2>&1 &
SRV_PID=$!
sleep 1

echo "== Servidor: $(head -1 "$SERVER_LOG" 2>/dev/null) =="

# --- 1. Cabeceras de seguridad -------------------------------------------
python3 "$ROOT/tools/check_headers.py" "$BASE/index.html"
HEADERS_OK=$?

# --- 2. Prueba funcional en el navegador ---------------------------------
firefox --headless --no-remote --profile "$PROFILE" "$BASE/__test" > "$FIREFOX_LOG" 2>&1 &
FF_PID=$!

for _ in $(seq 1 90); do
  [ -f "$REPORT" ] && break
  sleep 1
done

kill "$FF_PID" 2>/dev/null || true

if [ ! -f "$REPORT" ]; then
  echo "No se generó informe. Revisa $FIREFOX_LOG y $SERVER_LOG"
  exit 1
fi

python3 - "$REPORT" <<'PY'
import json, sys

data = json.load(open(sys.argv[1], encoding='utf-8'))
for s in data['steps']:
    mark = 'PASS' if s['ok'] else 'FAIL'
    extra = '' if s['extra'] is None else '  ' + json.dumps(s['extra'], ensure_ascii=False)
    print('[%s] %s%s' % (mark, s['name'], extra))

if data.get('errors'):
    print('\nErrores de JavaScript capturados:')
    for e in data['errors']:
        print('  -', e)

ok = sum(1 for s in data['steps'] if s['ok'])
print('\n%d/%d comprobaciones OK' % (ok, len(data['steps'])))
sys.exit(0 if data['ok'] else 1)
PY
BODY_OK=$?

if [ "$HEADERS_OK" -ne 0 ] || [ "$BODY_OK" -ne 0 ]; then
  exit 1
fi
exit 0
