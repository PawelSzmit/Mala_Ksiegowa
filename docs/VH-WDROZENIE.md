# Mała Księgowa na VH.pl – instrukcja krok po kroku

Instrukcja jest wzorowana na wdrożeniu aplikacji gabinetu. Kończy się działającą aplikacją pod adresem `https://ksiegowa.za-horyzont.pl` (nazwa do potwierdzenia). Aplikacja codziennie pobiera faktury z KSeF.

**Mała Księgowa niczego nie wysyła do ZUS ani do urzędu skarbowego.** Plik DRA pobierasz sam i sam importujesz w eZUS.

## Zanim zaczniesz

1. **Nie dotykaj aplikacji gabinetu.** Nie zmieniaj katalogu `za-horyzont-app`, jej bazy ani jej ustawień w „Setup Node.js App”. Mała Księgowa ma wszystko osobno.
2. **Sekrety zostają u Ciebie.** Hasła, hasło bazy, token KSeF, klucz szyfrowania i kod z aplikacji w telefonie:
   - nie wklejaj ich do czatu (także do Claude) ani do maili;
   - nie rób im zrzutów ekranu;
   - przechowuj je tylko w menedżerze haseł.
3. Miej na komputerze paczkę `mala-ksiegowa-…tar.gz` i plik `.sha256` z jej sumą kontrolną.
4. Token KSeF wygenerujesz na końcu, według `KSEF-TOKEN.md`. **Termin: przed 31 grudnia 2026 r.**

Poniżej `vh20129` to nazwa Twojego konta w cPanelu. Gdy cPanel pokaże inne dokładne nazwy (np. z prefiksem), używaj tych z cPanelu.

## 1. Subdomena i certyfikat SSL

1. W cPanelu otwórz **„Domeny”** i kliknij **„Utwórz nową domenę”**.
2. Wpisz `ksiegowa.za-horyzont.pl`.
3. Odznacz „Udostępnij katalog główny dokumentów” (subdomena ma mieć własny katalog) i zapisz.
4. Otwórz **„SSL/TLS Status”**, zaznacz `ksiegowa.za-horyzont.pl` i kliknij **„Run AutoSSL”**. Poczekaj, aż przy nazwie pojawi się zielona kłódka. Może to potrwać kilkanaście minut.

Strona `za-horyzont.pl` i aplikacja gabinetu się przy tym nie zmieniają.

## 2. Baza PostgreSQL

1. Otwórz **„Kreator baz danych PostgreSQL”**.
2. Utwórz bazę `ksiegowa`. cPanel doda prefiks, więc pełna nazwa to np. `vh20129_ksiegowa`.
3. Utwórz osobnego użytkownika `ksiegowa_app` (np. `vh20129_ksiegowa_app`; cPanel nie pozwala nazwać go tak samo jak bazę). Hasło wygeneruj przyciskiem „Generator haseł” i zapisz w menedżerze haseł.
4. Przypisz użytkownika do tej bazy z **wszystkimi prawami**, tylko do tej jednej bazy.
5. Zapisz w menedżerze haseł pełną nazwę bazy, pełną nazwę użytkownika i hasło.

## 3. Wgranie kodu

**Sposób użyty przy wdrożeniu (30.10.2026): Git w cPanelu.** Repozytorium na GitHubie jest publiczne, więc serwer sam pobiera kod.

1. Otwórz **„Git™ Version Control”** → „Create”.
2. Ustaw adres `https://github.com/PawelSzmit/Mala_Ksiegowa.git` i ścieżkę `/home/vh20129/mala-ksiegowa-app`, czyli obok `public_html`, a **nie** w środku.
3. Po sklonowaniu wejdź w „Manage” → „Basic Information” i wybierz gałąź `claude/project-thread-eptw6o`.
4. Sprawdź, że w `mala-ksiegowa-app` są: `server.mjs`, `package.json`, `src/`, `migrations/`, `config/`, `scripts/`, `docs/`.

**Sposób zapasowy: paczka `tar.gz`** (`npm run package`, np. gdy repozytorium przestanie być publiczne).

1. W **„Menedżerze plików”** utwórz `/home/vh20129/mala-ksiegowa-app`.
2. Wgraj do niego paczkę i ją rozpakuj (prawy przycisk → „Extract”).
3. Usuń wgrany plik `tar.gz` z serwera. Oryginał zostaje na komputerze.

## 4. Aplikacja Node w cPanelu

1. Otwórz **„Setup Node.js App”** → **„Create application”**.
2. Ustaw:
   - **Node.js version:** najnowsza 24.x (np. 24.21.0, ta sama co gabinet);
   - **Application mode:** Production;
   - **Application root:** `mala-ksiegowa-app`;
   - **Application URL:** `ksiegowa.za-horyzont.pl`, a pole ścieżki puste (katalog główny);
   - **Application startup file:** `server.mjs`.
3. Kliknij „Create”. Zmiennych środowiskowych **nie dodawaj**: sekrety trafią do pliku `.env` w kroku 6.
4. U góry strony aplikacji cPanel pokazuje polecenie typu `source /home/vh20129/nodevenv/mala-ksiegowa-app/24/bin/activate && cd /home/vh20129/mala-ksiegowa-app`. Skopiuj je do notatki, przyda się w krokach 5–10. Nie jest tajne.

## Skrót: kroki 5–8 jednym poleceniem

Po kroku 4 możesz zamiast kroków 5–8 wykonać w Terminalu jedno polecenie:

```
bash ~/mala-ksiegowa-app/scripts/setup-vh.sh
```

Skrypt robi kolejno:
- instaluje zależności;
- tworzy użytkownika bazy `vh20129_ksiegowa_app` z losowym hasłem i nadaje mu prawa do bazy `vh20129_ksiegowa`;
- zapisuje plik `.env` z losowym kluczem;
- tworzy tabele;
- zakłada Twoje konto.

Hasła do bazy i klucza nikt nie widzi, bo trafiają prosto do `.env`. Ty podajesz tylko hasło do aplikacji i kod z telefonu. Bazę (krok 2) trzeba mieć wcześniej utworzoną, ale bez użytkownika. Skrypt można bezpiecznie uruchomić ponownie.

## 5. Zależności

1. Otwórz **„Terminal”** w cPanelu.
2. Wklej polecenie z kroku 4.4 i naciśnij Enter.
3. `node --version` ma pokazać `v24.…`.
4. Wykonaj `npm ci --omit=dev`.
5. Jeśli pojawi się błąd, zatrzymaj się. Nie używaj `--force`.

## 6. Sekrety w pliku `.env`

Plik `.env` leży w katalogu aplikacji, poza `public_html`, z prawami tylko dla Ciebie. Czytają go aplikacja i zadanie cron. Wartości wpisujesz tak, że nie pojawiają się na ekranie.

W Terminalu, w katalogu aplikacji (po poleceniu z kroku 4.4), wykonaj kolejno:

1. Klucz szyfrowania. Losuje go serwer, Ty go nie widzisz:
   ```
   umask 077 && printf 'APP_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32)" > .env
   ```
2. Połączenie z bazą. Polecenie zapyta o hasło do bazy (z kroku 2), a wpisywanie nie będzie widoczne. Jeśli nazwy są inne niż baza `vh20129_ksiegowa` i użytkownik `vh20129_ksiegowa_app`, popraw je w poleceniu:
   ```
   read -rs -p "Hasło bazy: " P && echo && P="$P" node -e 'console.log("DATABASE_URL=postgres://vh20129_ksiegowa_app:" + encodeURIComponent(process.env.P) + "@localhost:5432/vh20129_ksiegowa")' >> .env && unset P
   ```
3. Sprawdź, że w pliku są dwie nazwy. Pokażą się same nazwy, bez wartości:
   ```
   chmod 600 .env && cut -d= -f1 .env
   ```
   Wynik: `APP_ENCRYPTION_KEY` i `DATABASE_URL`.
4. **Kopia klucza:**
   - wykonaj `grep APP_ENCRYPTION_KEY .env`;
   - skopiuj wartość do menedżera haseł, bez zrzutu ekranu;
   - wyczyść ekran poleceniem `clear`.

   Utrata tego klucza oznacza zakładanie konta od nowa i nowy token KSeF, a po 2026 r. nowego tokenu może nie dać się wygenerować.

## 7. Baza: tabele

```
npm run migrate
```

Poprawny wynik to `Wykonano: 001_init.sql, …, 004_zamkniecie_miesiaca.sql`. Ponowne uruchomienie ma powiedzieć `Baza jest aktualna.`

Aplikacja startuje z pustą bazą. Faktury z testowego KSeF nie mieszają się z prawdziwymi.

## 8. Twoje konto

1. Wykonaj:
   ```
   npm run create-user -- pawel
   ```
2. Podaj hasło (co najmniej 12 znaków), dwa razy.
3. Skrypt pokaże klucz do aplikacji z kodami w telefonie (np. Google Authenticator, Aegis). Dodaj go w telefonie.
4. Wpisz 6-cyfrowy kod z telefonu.
5. Wyczyść ekran poleceniem `clear`.

Konto zakłada się tylko raz. Skrypt odmówi, jeśli konto już istnieje.

## 9. Uruchomienie i sprawdzenie

1. W **„Setup Node.js App”** kliknij **„Restart”** przy aplikacji `mala-ksiegowa-app`.
2. Otwórz `https://ksiegowa.za-horyzont.pl/zdrowie`. Ma się pokazać `ok`. Jeśli widzisz `brak połączenia z bazą`, sprawdź krok 6.2.
3. Wejdź na `https://ksiegowa.za-horyzont.pl` i zaloguj się: login, hasło i kod z telefonu.
   - Jeśli zamiast tego pojawi się „Formularz wysłany z obcej strony”, zatrzymaj się i daj znać Claude (bez sekretów). To znaczy, że serwer zmienia adres w nagłówkach i trzeba to poprawić w aplikacji.
4. Sprawdź na telefonie, czy strona miesiąca się wyświetla.

## 10. Ustawienia w aplikacji

1. **Ustawienia → Dane do deklaracji ZUS:** imię, nazwisko, PESEL, REGON (jeśli masz), nazwa skrócona z CEIDG (jeśli jest).
2. **Ustawienia KSeF:**
   - NIP;
   - token według `KSEF-TOKEN.md`;
   - „Pobieraj faktury otrzymane od dnia”: `2027-01-01`;
   - środowisko: produkcyjne.
3. **Faktury → „Sprawdź teraz”.** Ma się pokazać data udanej synchronizacji.
4. **Ustawienia → Wakacje składkowe:** wpisz miesiąc, gdy już zdecydujesz. Możesz to zrobić w każdej chwili.

## 11. Codzienne pobieranie faktur (cron)

1. Utwórz w Menedżerze plików katalog `/home/vh20129/mala-ksiegowa-logs`, poza `public_html` i poza katalogiem aplikacji.
2. Otwórz **„Zadania cron”** → „Dodaj nowe zadanie cron”.
3. Ustaw czas raz dziennie, np. minuta `15`, godzina `6`, pozostałe pola `*`.
4. Polecenie to polecenie z kroku 4.4, a za nim dopisek:
   ```
   … && node --env-file=.env scripts/ksef-sync.ts >> /home/vh20129/mala-ksiegowa-logs/ksef-sync.log 2>&1
   ```
   Całość wygląda np. tak: `source /home/vh20129/nodevenv/mala-ksiegowa-app/24/bin/activate && cd /home/vh20129/mala-ksiegowa-app && node --env-file=.env scripts/ksef-sync.ts >> /home/vh20129/mala-ksiegowa-logs/ksef-sync.log 2>&1`.
5. Sprawdź to raz ręcznie: wklej to samo polecenie w Terminalu, a potem wykonaj `tail -3 /home/vh20129/mala-ksiegowa-logs/ksef-sync.log`. Ostatnia linia ma zaczynać się datą i `KSeF OK`.
6. W polu e-mail zadań cron możesz zostawić swój adres. Przy błędzie przyjdzie wiadomość, ale bez sekretów: log nie zawiera tokenu.

## 12. Kopie zapasowe

1. Otwórz **JetBackup 5** i sprawdź, że kopie obejmują katalog domowy (w tym `mala-ksiegowa-app` z plikiem `.env`) oraz bazę `vh20129_ksiegowa` (zakładka kopii baz danych).
2. Zapisz, jak często robione są kopie i ile dni są trzymane.

## Nowa wersja aplikacji (aktualizacja)

1. **„Git™ Version Control”** → „Manage” przy `mala-ksiegowa-app` → zakładka „Pull or Deploy” → **„Update from Remote”**. Przy paczce: wgraj ją i rozpakuj, nadpisując pliki. Plik `.env` zostaje w obu przypadkach.
2. W Terminalu: polecenie z kroku 4.4, potem `npm ci --omit=dev` i `npm run migrate`.
3. W „Setup Node.js App” kliknij **Restart** i sprawdź `/zdrowie`.

## Gdy coś nie działa

- **Strona nie wstaje:** w „Setup Node.js App” sprawdź log błędów aplikacji. Komunikat „Brak zmiennych środowiskowych” oznacza brak pliku `.env` albo literówkę w nazwach (krok 6.3).
- **Pobieranie z KSeF nie działa:** komunikat jest na stronie Faktury i w logu z kroku 11. Najczęstsza przyczyna to unieważniony token.
- Do Claude wysyłaj opis i komunikat błędu, **nigdy** zawartości `.env` ani tokenu.
