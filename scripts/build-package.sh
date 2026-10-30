#!/usr/bin/env bash
# Paczka do wgrania na vh.pl (instrukcja: docs/VH-WDROZENIE.md).
# Zawiera tylko to, co potrzebne do działania: bez testów, bez node_modules (instaluje je `npm ci --omit=dev` na serwerze),
# bez plików .env i skryptów do testowego KSeF. Przed spakowaniem uruchamia sprawdzenie typów i testy bez bazy.
# Użycie: bash scripts/build-package.sh   →   dist/mala-ksiegowa-RRRR-MM-DD-<commit>.tar.gz (+ .sha256)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "Najpierw zapisz zmiany (git commit) – paczka ma odpowiadać konkretnej wersji." >&2
  exit 1
fi
npm run --silent typecheck
npm test --silent > /dev/null

name="mala-ksiegowa-$(date +%F)-$(git rev-parse --short HEAD)"
mkdir -p dist
files=(
  server.mjs package.json package-lock.json
  src migrations config
  scripts/migrate.ts scripts/create-user.ts scripts/ksef-sync.ts
  docs/VH-WDROZENIE.md docs/KSEF-TOKEN.md
)
# git archive bierze pliki z zapisanej wersji, więc do paczki nie trafi nic spoza repozytorium (np. .env).
git archive --format=tar.gz -o "dist/$name.tar.gz" HEAD "${files[@]}"
(cd dist && sha256sum "$name.tar.gz" > "$name.tar.gz.sha256")
echo "Gotowe: dist/$name.tar.gz"
cat "dist/$name.tar.gz.sha256"
