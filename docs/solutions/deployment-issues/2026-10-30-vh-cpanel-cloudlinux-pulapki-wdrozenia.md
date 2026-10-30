---
title: "Wdrożenie Node + PostgreSQL na vh.pl (cPanel, CloudLinux): trzy pułapki"
date: 2026-10-30
category: deployment-issues
severity: medium
stack:
  - cPanel
  - CloudLinux Node.js Selector
  - PostgreSQL
  - Bash
tags:
  - vh.pl
  - setup-vh
  - nodevenv
  - uapi
status: verified
last_verified: 2026-10-30
---

# Wdrożenie Node + PostgreSQL na vh.pl (cPanel, CloudLinux): trzy pułapki

## Symptoms

1. Skrypt `scripts/setup-vh.sh` zatrzymuje się od razu po starcie:
   ```
   /home/vh20129/nodevenv/mala-ksiegowa-app/24/bin/activate: line 78: CL_VIRTUAL_ENV: unbound variable
   ```
2. Krok zakładania użytkownika bazy kończy się błędem:
   ```
   Użytkownik systemowy „vh20129” nie ma kontroli nad użytkownikiem PostgreSQL o nazwie „vh20129_ksiegowa”.
   STOP: Nie udało się ustawić użytkownika bazy.
   ```
   Prawdziwy komunikat `uapi Postgresql create_user`, ukryty przez fallback na `set_password`, brzmi: *„Baza danych „vh20129_ksiegowa” już istnieje, a Ty — „vh20129” — nie możesz utworzyć użytkownika o tej samej nazwie.”*
3. W phpPgAdmin z cPanelu zapytanie do tabel aplikacji, np. `SELECT … FROM users`, kończy się błędem `permission denied for table users`. Przez phpPgAdmin nie da się więc poprawić danych, np. zmienić loginu.

## Root Cause

1. Skrypt `activate` środowiska Node od CloudLinux, który tworzy „Setup Node.js App”, czyta zmienne, których nie ustawia. Skrypt z `set -euo pipefail` traktuje każdą taką zmienną jako błąd i kończy pracę na `source`.
2. cPanel nie pozwala założyć użytkownika PostgreSQL o nazwie identycznej z istniejącą bazą. W pierwszej wersji `DB_USER` był równy `DB` (`vh20129_ksiegowa`). Skrypt po nieudanym `create_user` próbował `set_password`, a ten zwracał mylący komunikat o braku kontroli.
3. Tabele tworzą migracje uruchamiane jako użytkownik aplikacji (`vh20129_ksiegowa_app`), więc to on jest ich właścicielem. Konto cPanel (`vh20129`), którym loguje się phpPgAdmin, nie dostaje do nich praw. Z punktu widzenia bezpieczeństwa to dobrze.

## Solution

1. W `scripts/setup-vh.sh` wyłączyć `set -u` tylko na czas wczytania środowiska:
   ```bash
   set +u
   # shellcheck disable=SC1090
   source "$activate"
   set -u
   ```
2. Nazwać użytkownika bazy inaczej niż bazę:
   ```bash
   DB="${ACCOUNT}_ksiegowa"
   # cPanel nie pozwala nazwać użytkownika tak samo jak bazę.
   DB_USER="${ACCOUNT}_ksiegowa_app"
   ```
   To samo poprawić w `docs/VH-WDROZENIE.md` (krok 2 i ręczny wariant kroku 6).
3. Zmiany w danych robić w Terminalu cPanelu, poleceniem z danymi logowania z `.env`, zamiast w phpPgAdmin:
   ```bash
   source ~/nodevenv/mala-ksiegowa-app/24/bin/activate && cd ~/mala-ksiegowa-app && node --env-file=.env -e 'const pg=require("pg");const c=new pg.Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>c.query("UPDATE users SET username=$1 WHERE username=$2",["marta","pawel"])).then(r=>{console.log("Zmieniono kont: "+r.rowCount);return c.end()})'
   ```
   Polecenie uruchamia właściciel konta. Nikt nie przepisuje haseł, a `.env` nie pojawia się na ekranie.

Kod aplikacji trafia na serwer przez cPanel → Git Version Control. Po poprawce skryptu wystarczy „Update from Remote” (albo UAPI `VersionControl/update`) i ponowne uruchomienie skryptu. Skrypt jest bezpieczny do powtórzenia: istniejący `.env`, tabele i konto zostają.

## Diagnostic Commands

```bash
# Prawdziwy błąd create_user (bez fallbacku) – w Terminalu cPanelu, hasło losowe i wyrzucane:
uapi --output=json Postgresql create_user name=vh20129_ksiegowa password="$(openssl rand -hex 16)Aa9" | head -c 600

# Jacy użytkownicy PostgreSQL są na koncie:
uapi --output=json Postgresql list_users

# Czy aplikacja żyje i widzi bazę:
curl -s https://ksiegowa.za-horyzont.pl/zdrowie   # „ok” = baza odpowiada
```

## Prevention

- W skryptach z `set -u` każdy `source` cudzego pliku (nodevenv, virtualenv, profile) owijać w `set +u` / `set -u`.
- W cPanelu użytkownik bazy zawsze dostaje inną nazwę niż baza, np. przyrostek `_app`.
- Fallback w skrypcie nie może ukrywać pierwotnego błędu. Przy `create_user || set_password` warto wypisać komunikat z pierwszej próby.
- Nie planować poprawiania danych przez phpPgAdmin. Zmiany w danych idą przez `node --env-file=.env` w Terminalu albo przez skrypt w `scripts/`.

## Related

- `scripts/setup-vh.sh` (commity `2d09826`, `c9511b9`)
- `docs/VH-WDROZENIE.md`: kroki 2, 6, „Skrót” i „Gdy coś nie działa”
- `docs/completed/mala-ksiegowa/mala-ksiegowa-podsumowanie.md`: sekcja „Wnioski”

## Context

- vh.pl, serwer v102.vh.net.pl, cPanel 138, CloudLinux Node.js Selector (Node 24.22.1), PostgreSQL 13.23, październik 2026.
- Pułapki 1 i 2 nie wyszły na lokalnej próbie, bo lokalnie nie ma CloudLinux ani `uapi`. Pojawiły się dopiero przy pierwszym uruchomieniu na serwerze.
- Pułapkę 3 sprawdzono tylko dla tabel tworzonych przez migracje. Nie sprawdzano, czy cPanel pozwala nadać kontu `vh20129` prawa ręcznie (`GRANT`), bo nie było takiej potrzeby.
