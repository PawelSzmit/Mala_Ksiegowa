#!/usr/bin/env bash
# Jednorazowa konfiguracja Małej Księgowej na vh.pl – kroki 5–8 z docs/VH-WDROZENIE.md jednym poleceniem.
# Uruchamia Paweł w Terminalu cPanelu (po utworzeniu aplikacji w „Setup Node.js App”):
#   bash ~/mala-ksiegowa-app/scripts/setup-vh.sh
# Hasło bazy i klucz szyfrowania losuje serwer i zapisuje wprost do .env (prawa 600) – nikt ich nie widzi ani nie przepisuje.
# Bezpieczne do ponownego uruchomienia: istniejący .env, tabele i konto zostają.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="$(basename "$APP_DIR")"
ACCOUNT="$(whoami)"
DB="${ACCOUNT}_ksiegowa"
DB_USER="$DB"
LOGIN="${1:-pawel}"

step() { printf '\n== %s\n' "$1"; }
fail() { printf '\nSTOP: %s\n' "$1" >&2; exit 1; }

# Środowisko Node utworzone przez „Setup Node.js App” (tam też trafiają zależności).
activate="$(ls -d "$HOME/nodevenv/$APP_NAME"/24*/bin/activate 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$activate" ] || fail "Nie widzę środowiska Node dla $APP_NAME – najpierw utwórz aplikację w „Setup Node.js App” (krok 4)."
# shellcheck disable=SC1090
source "$activate"
cd "$APP_DIR"
node --version | grep -q '^v24\.' || fail "Potrzebny Node 24, a jest $(node --version)."

# Wynik `uapi --output=json`: kończy skrypt, gdy cPanel zgłosi błąd (bez wypisywania haseł).
uapi_ok() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).result;if(!r.status){console.error((r.errors||[]).join(" "));process.exit(1)}})'
}

step "1/5 Zależności (npm ci)"
npm ci --omit=dev --no-audit --no-fund

if [ -f .env ]; then
  step "2/5 Sekrety: plik .env już jest – zostawiam bez zmian"
else
  step "2/5 Sekrety: użytkownik bazy $DB_USER i plik .env"
  umask 077
  pass="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)"
  if ! uapi --output=json Postgresql create_user name="$DB_USER" password="$pass" | uapi_ok 2>/dev/null; then
    # Użytkownik został z poprzedniej, przerwanej próby – nadajemy mu nowe hasło.
    uapi --output=json Postgresql set_password user="$DB_USER" password="$pass" | uapi_ok || fail "Nie udało się ustawić użytkownika bazy."
  fi
  uapi --output=json Postgresql grant_all_privileges user="$DB_USER" database="$DB" | uapi_ok || fail "Nie udało się nadać praw do bazy $DB."
  {
    printf 'APP_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32)"
    printf 'DATABASE_URL=postgres://%s:%s@localhost:5432/%s\n' "$DB_USER" "$pass" "$DB"
  } > .env
  unset pass
  chmod 600 .env
  echo "Zapisano .env (nazwy: $(cut -d= -f1 .env | tr '\n' ' '))"
fi

step "3/5 Tabele w bazie"
node --env-file=.env scripts/migrate.ts

step "4/5 Twoje konto ($LOGIN)"
if node --env-file=.env -e '
  const pg = require("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  c.connect().then(() => c.query("SELECT count(*)::int AS n FROM users")).then((r) => { c.end(); process.exit(r.rows[0].n > 0 ? 0 : 1); });
'; then
  echo "Konto już istnieje – pomijam."
else
  node --env-file=.env scripts/create-user.ts "$LOGIN"
  clear
  echo "Konto „$LOGIN” założone (ekran wyczyszczony, żeby klucz z telefonu nie został na widoku)."
fi

step "5/5 Katalog na logi"
mkdir -p "$HOME/mala-ksiegowa-logs"

printf '\nGotowe. Napisz w czacie „gotowe” – bez haseł, kodów ani zawartości .env.\n'
