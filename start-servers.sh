#!/usr/bin/env bash
# ============================================================
#  Fibre-FTTH - Start All Servers (Bash / Git Bash / WSL)
#  Launches each server in the background, writing logs to
#  ./logs/ so nothing hangs on the terminal.
#  Usage:  bash start-servers.sh
# ============================================================
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="python"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

# Prefer the project's Anaconda python if the default isn't found
if ! command -v "$PY" >/dev/null 2>&1; then
  PY="/c/Users/HP/anaconda3/python.exe"
fi

# ------------------------------------------------------------
# Load local environment (DB credentials etc.) from .env.
# The .env file is git-ignored; copy .env.example to create it.
# ------------------------------------------------------------
ENV_FILE="$ROOT/.env"
if [ -f "$ENV_FILE" ]; then
  # Read KEY=VALUE literally — do NOT `. "$ENV_FILE"`. Sourcing runs the file as
  # shell, so `$`, backticks and quotes inside a value are interpreted: a value
  # holding `$ab` loses it, and a value holding an apostrophe is shortened. Both
  # failures are silent, and the servers then run with a secret that is not the
  # one in the file (locally: DJANGO_SECRET_KEY 52 -> 50 chars, so a signed
  # token minted here does not verify on the host that got the real key).
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in ''|*[!A-Za-z0-9_]*) continue ;; esac
    value="${value%$'\r'}"
    export "$key=$value"
  done < "$ENV_FILE"
else
  echo "WARNING: .env not found at $ENV_FILE"
  echo "         Copy .env.example to .env and fill in the DB credentials."
  echo
fi

# ------------------------------------------------------------
# The engine injects QGIS site-packages into its qgis_process
# subprocesses itself. A global PYTHONPATH/PYTHONHOME (e.g. from .env)
# makes uvicorn/Django import QGIS's Python312 packages/stdlib, whose
# compiled modules (pydantic_core) crash the Anaconda 3.11 interpreter.
# Keep the servers' environment clean.
# ------------------------------------------------------------
unset PYTHONPATH PYTHONHOME

# The engine now refuses mutating requests (runs, stops, deletes) unless they
# carry FTTH_ENGINE_API_KEY, and answers 503 when it has no key at all. Local
# development needs the same value on both halves, so .env wins and a session
# that does not set one gets this dev-only value. It is not a secret and is
# never used in production -- a deployment sets its own on both services.
FTTH_ENGINE_API_KEY="${FTTH_ENGINE_API_KEY:-local-dev-engine-key}"
export FTTH_ENGINE_API_KEY

echo "============================================="
echo " Fibre-FTTH Server Launcher"
echo " Root:   $ROOT"
echo " Python: $PY"
echo "============================================="
echo

# ------------------------------------------------------------
# 0. Kill anything already holding our ports (stale/hung)
# ------------------------------------------------------------
echo "[0/5] Cleaning stale processes on ports 3000, 8000, 8080, 8081, 8180 ..."
for port in 3000 8000 8080 8081 8180; do
  pids=$(netstat -ano 2>/dev/null | grep ":$port " | grep LISTENING | awk '{print $NF}' | sort -u)
  for pid in $pids; do
    echo "      Killing PID $pid on port $port"
    taskkill //F //PID "$pid" >/dev/null 2>&1 || kill -9 "$pid" 2>/dev/null
  done
done
sleep 2
echo "      Done."
echo

# ------------------------------------------------------------
# 1. Fiber Frontend (static) -> :3000
# ------------------------------------------------------------
echo "[1/5] Starting Fiber Frontend  -> http://localhost:3000"
(
  cd "$ROOT/fiber-fe" || exit 1
  "$PY" -m http.server 3000 --bind 0.0.0.0
) > "$LOG_DIR/frontend.log" 2>&1 &
echo "      PID $! (log: logs/frontend.log)"

# ------------------------------------------------------------
# 2. Fiber Backend (Django) -> :8000
# ------------------------------------------------------------
echo "[2/5] Starting Fiber Backend   -> http://localhost:8000"
(
  cd "$ROOT/fiber-backend" || exit 1
  export FTTH_ENGINE_URL="${FTTH_ENGINE_URL:-http://127.0.0.1:8080}"
  export DJANGO_DEBUG="${DJANGO_DEBUG:-true}"
  export PGDATABASE="${PGDATABASE:-zeabur}"
  export PGUSER="${PGUSER:-root}"
  export PGPASSWORD="${PGPASSWORD:-}"
  export PGHOST="${PGHOST:-localhost}"
  export PGPORT="${PGPORT:-5432}"
  # QGIS injects PYTHONPATH pointing at its Python312 site-packages; Django
  # runs Anaconda Python3.11 and that path contains a broken Pillow (wrong
  # C extension).  Clear it so Django uses its own site-packages.
  unset PYTHONPATH
  "$PY" manage.py runserver 0.0.0.0:8000
) > "$LOG_DIR/backend.log" 2>&1 &
echo "      PID $! (log: logs/backend.log)"

# ------------------------------------------------------------
# 3. HLD Planning Backend (FastAPI engine with QGIS) -> :8080
#    Django's FTTH_ENGINE_URL points here — this is the engine
#    that holds the pipeline outputs, so it MUST run on 8080.
# ------------------------------------------------------------
echo "[3/5] Starting HLD Engine       -> http://localhost:8080"
(
  cd "$ROOT/HLD_Planning_01/web/backend" || exit 1
  export QGIS_EXECUTABLE="C:/Program Files/QGIS 3.44.6/bin/qgis_process-qgis.bat"
  export QGIS_PLUGINPATH="$ROOT/HLD_Planning_01"
  export QT_QPA_PLATFORM="offscreen"
  export PYTHONUNBUFFERED="1"
  export OSM_PAVEMENT_CARRIERS="${OSM_PAVEMENT_CARRIERS:-1}"
  export OSM_PAVEMENT_ARTERIALS="${OSM_PAVEMENT_ARTERIALS:-1}"
  export FTTH_ENGINE_API_KEY="$FTTH_ENGINE_API_KEY"
  "$PY" -m uvicorn main:app --host 0.0.0.0 --port 8080
) > "$LOG_DIR/engine.log" 2>&1 &
echo "      PID $! (log: logs/engine.log)"

# ------------------------------------------------------------
# 4. Survey App Expo Web Build -> :8081
#    Serves the built Expo web app (survey map). The admin
#    frontend links here for "View on Map" with ?token=&project=.
# ------------------------------------------------------------
echo "[4/5] Starting Survey App Web   -> http://localhost:8081"
if [ -d "$ROOT/FTTH_SURVEY_APP/fibre-mobile/web-prod" ] && command -v node >/dev/null 2>&1; then
  (
    cd "$ROOT/FTTH_SURVEY_APP/fibre-mobile" || exit 1
    node serve-web.mjs web-prod 8081
  ) > "$LOG_DIR/expo-web.log" 2>&1 &
  echo "      PID $! (log: logs/expo-web.log)"
else
  echo "      [SKIP] web-prod build or node not found — serving web-dist via python if present"
  if [ -d "$ROOT/FTTH_SURVEY_APP/fibre-mobile/web-dist" ]; then
    (
      cd "$ROOT/FTTH_SURVEY_APP/fibre-mobile/web-dist" || exit 1
      "$PY" -m http.server 8081 --bind 0.0.0.0
    ) > "$LOG_DIR/expo-web.log" 2>&1 &
    echo "      PID $! (log: logs/expo-web.log)"
  else
    echo "      [WARN] No Expo web build found"
  fi
fi

# ------------------------------------------------------------
# 5. Import/Geo microservice (fiber-import) -> :8180
#    Parses uploaded GeoPackages for the Field Supervision stage and
#    hands geometry back to Django. The engine owns 8080, so 8180.
# ------------------------------------------------------------
echo "[5/5] Starting Import Service  -> http://localhost:8180"
if [ -f "$ROOT/fiber-import/server.py" ]; then
  (
    cd "$ROOT/fiber-import" || exit 1
    unset PYTHONPATH PYTHONHOME
    "$PY" server.py
  ) > "$LOG_DIR/fiber-import.log" 2>&1 &
  echo "      PID $! (log: logs/fiber-import.log)"
else
  echo "      [SKIP] fiber-import/server.py not found"
fi

echo
echo " All servers launched. Waiting for them to come up ..."
sleep 8
echo

# ------------------------------------------------------------
# Health checks
# ------------------------------------------------------------
echo " ------------------------------------------------------------"
echo "  Health Check Results"
echo " ------------------------------------------------------------"
check_port() {
  local port="$1" name="$2"
  if netstat -ano 2>/dev/null | grep ":$port " | grep -q LISTENING; then
    echo "  [OK]   $name is listening on port $port"
  else
    echo "  [!!]   $name did NOT start on port $port (see logs/)"
  fi
}
check_port 3000 "Fiber Frontend"
check_port 8000 "Fiber Backend (Django)"
check_port 8080 "HLD Engine (QGIS)"
check_port 8081 "Survey App Web (Expo)"
check_port 8180 "Import Service (fiber-import)"
echo " ------------------------------------------------------------"
echo
echo " Open http://localhost:3000 in your browser."
echo " Logs are in ./logs/  |  Stop all servers with: bash stop-servers.sh"
echo
