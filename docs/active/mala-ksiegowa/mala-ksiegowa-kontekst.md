# Mała Księgowa – kontekst

Gałąź: `claude/project-thread-eptw6o` (kontynuacja `claude/project-thread-tqtl79`)
Ostatnia aktualizacja: 2026-10-30
Stan: Etapy 1–7 gotowe (KSeF, reguły, logowanie, faktury/koszty/kasa, księga KPiR, zamknięcie miesiąca z DRA, wakacje składkowe). Start księgi: 1.01.2027 (decyzja Pawła 2026-10-30). Czeka: import DRA w eZUS przez Pawła po wdrożeniu; miesiąc wakacji w 2027 (pytanie do Pawła). Następny: poprawki P2 z review 6, potem etap 8 (wdrożenie).

## Kim jest użytkownik

Paweł – właściciel firmy, nie programista. Komunikacja po polsku, prostym językiem, bez żargonu. Decyzje produktowe należą do niego; techniczne podejmujemy sami i tłumaczymy obrazowo.

## Fakty o firmie (ustalone, nie pytać ponownie)

- Gabinet, strona za-horyzont.pl. Usługi, brak towarów (brak spisu z natury).
- Skala podatkowa → KPiR i miesięczna zaliczka PIT.
- Nie jest płatnikiem VAT → koszty księgowane w kwocie brutto, brak JPK_V7.
- Pełny ZUS → składki społeczne stałe w roku, składka zdrowotna 9% dochodu (z minimum) → DRA co miesiąc.
- Raz w roku wakacje składkowe.
- Nie płaci dobrowolnego ubezpieczenia chorobowego (Paweł, 2026-10-29).
- Przychód: tylko miesięczny raport z kasy fiskalnej.
- Do KSeF Paweł loguje się Profilem Zaufanym; aplikacja dostaje od niego token KSeF z prawem tylko do odczytu faktur. Tokeny działają w 2027 (Paweł potwierdził na stronie MF).
- JPK_PKPIR dla firm bez VAT obowiązuje od 2028 – poza zakresem.

## Hosting (sprawdzone w cPanelu 2026-10-29)

- vh.pl, cPanel, konto `vh20129`, serwer `v102.vh.net.pl`. Baza danych: host `localhost`, prefiks nazw `vh20129_`.
- Node.js do v24, Python 3.11, PHP do 8.6, PostgreSQL (z phpPgAdmin), cron („Zadania cron”), Terminal/SSH, Git, JetBackup 5, 2FA dla cPanelu.
- Zasoby: dysk 5 GB (ok. 5% zajęte), RAM 2 GB.
- `POST https://api-test.ksef.mf.gov.pl/v2/auth/challenge` z serwera → HTTP 200.
- **Wzorzec do skopiowania**: aplikacja gabinetu `~/za-horyzont-app` (Node 24, `server.mjs`, `server/`, `worker/`, `dist/`, `migrations/`, biblioteka `pg`). Wdrażana jako paczka `tar.gz` rozpakowana poza `public_html`, uruchamiana przez „Setup Node.js App”, zmienne środowiskowe w formularzu cPanelu, migracje `npm run migrate:postgres`, pierwsze konto zakładane skryptem. Instrukcja: `~/za-horyzont-app/VH-WDROZENIE.md`.
- **Nie ruszać** aplikacji gabinetu ani jej bazy. Mała Księgowa ma osobny katalog (`~/mala-ksiegowa-app`), osobną bazę i osobną aplikację Node.

## Decyzje techniczne

| Decyzja | Dlaczego |
|---|---|
| Node.js 24 + TypeScript | Działa na tym hostingu; ten sam język i proces wdrożenia co strona gabinetu; `node:crypto` ma RSA-OAEP/SHA-256 i AES potrzebne w KSeF |
| Strony HTML renderowane na serwerze, wbudowany `node:http` bez frameworka (zmiana względem planu: Hono/Fastify), bez SPA | Kilka ekranów z formularzami; jedna zależność mniej do aktualizacji na hostingu |
| PostgreSQL przez `pg` | Dostępny na hostingu, ten sam co w aplikacji gabinetu |
| Kwoty w groszach (liczby całkowite) | Brak błędów zaokrągleń |
| Własny cienki klient KSeF | Brak dojrzałej biblioteki w Node; wzorce do podejrzenia: `n1ebieski/ksef-php-client` (PHP), `ksef-client` (Python, PyPI) |
| Stawki/progi w `config/years/<rok>.json` | Nowy rok = nowy plik, bez zmian w kodzie |
| Synchronizacja KSeF przez cron cPanelu raz dziennie + przycisk „sprawdź teraz” | Prosto i niezależnie od tego, czy ktoś ma otwartą aplikację |
| Subdomena np. `ksiegowa.za-horyzont.pl` | Oddzielenie od strony gabinetu (nazwa do potwierdzenia z Pawłem) |

## Ustalenia z rozeznania

### KSeF 2.0 (token)
- Przebieg: `POST /auth/challenge` → szyfrowanie `token|timestampMs` kluczem publicznym MF (RSA-OAEP SHA-256, certyfikat „KsefTokenEncryption” z endpointu kluczy publicznych) → `POST /auth/ksef-token` → odpytywanie `GET /auth/{referenceNumber}` → `POST /auth/token/redeem` (jednorazowo) → accessToken (kilka minut) + refreshToken (do 7 dni) → `POST /auth/token/refresh`.
- Faktury: `POST /invoices/query/metadata` (filtr podmiotu – nabywca, zakres dat, stronicowanie), `GET /invoices/ksef/{ksefNumber}`.
- Uprawnienia tokenu ustalane przy tworzeniu i niezmienne; dla nas tylko `InvoiceRead`.
- Środowiska: test `https://api-test.ksef.mf.gov.pl` (dokumentacja `/docs/v2`), demo `https://api-demo.ksef.mf.gov.pl`, produkcja `https://api.ksef.mf.gov.pl/v2`. Środowisko testowe jest wspólne – używać losowych NIP-ów.
- Potwierdzone na teście: filtr „nabywca” = `Subject2`; `pageSize` 10–250; odpowiedź ma `hasMore` i `isTruncated`.
- Źródło: nieoficjalna kopia dokumentacji MF (flopsstuff.github.io/ksef-docs) – weryfikować z oficjalną.

### ZUS
- DRA: import pliku KEDU w eZUS → ePłatnik → Dokumenty → Dokumenty ubezpieczeniowe → „Import KEDU”. Dokument trafia do roboczych i nic nie jest wysyłane bez podpisu (Profil Zaufany / e-dowód / podpis kwalifikowany). Plik musi zawierać NIP i PESEL; nie edytować go przed importem.
- Termin: DRA i składki do 20. dnia następnego miesiąca, jednym przelewem na rachunek składkowy (NRS).
- Wakacje składkowe: wniosek RWS (wersja 3.0 od 26.06.2026, pole „Wersja PKD”) składa się wyłącznie w eZUS, w miesiącu poprzedzającym miesiąc wakacji. Importu pliku nie znaleziono – aplikacja tylko przypomina i podaje dane.
- Niepotwierdzone: postać DRA w miesiącu wakacji (kody), aktualny schemat KEDU.

## Otwarte pytania

| Pytanie | Kto / kiedy |
|---|---|
| Interpretacja straty i nadwyżki składek w zdrowotnej | Punkt kontrolny etapu 2, księgowa |
| Podstawa składek 2027 (po budżecie) i skala PIT 2027 (projekt w Sejmie) | Grudzień 2026 |
| Aktualny wzór kolumn KPiR (np. kolumna na numer KSeF) | Etap 5, rozporządzenie MF |
| Schemat KEDU i postać DRA w miesiącu wakacji | Etapy 6–7, zus.pl |
| Nazwa subdomeny | Etap 8, zapytać Pawła |
| Który miesiąc Paweł wybiera na wakacje w 2027 | Etap 7, zapytać Pawła |

## Etap 1 – co zrobione i co odkryto (2026-10-29)

- Środowisko, w którym pracowano, nie miało dostępu do `api-test.ksef.mf.gov.pl` (blokada sieci), dlatego prawdziwej próby nie wykonano. Paweł dodał potem środowisko z dostępem – próbę robi nowa sesja.
- Oficjalna dokumentacja jest w repozytorium `CIRFMF/ksef-docs` (pliki `.md` dostępne przez `raw.githubusercontent.com`). Nieoficjalna kopia `flopsstuff.github.io` nie była dostępna z tego środowiska.
- Zrobione: `src/ksef/types.ts`, `src/ksef/crypto.ts`, `src/ksef/client.ts`, `scripts/ksef-spike.ts`, `test/ksef.test.ts` (udawany serwer KSeF z prawdziwym szyfrowaniem RSA), klucz i certyfikat wyłącznie testowe w `test/fixtures/`.
- Uruchamianie: `npm install`, `npm test`, `npm run typecheck`. Node 22.18+ uruchamia pliki `.ts` bez budowania (importy z rozszerzeniem `.ts`, bez enumów i innych składni nieusuwalnych). Na serwerze jest Node 24.
- Kształt odpowiedzi KSeF w kliencie (`timestampMs`, `authenticationToken.token`, `status.code` 100/200, `hasMore`, `invoices[]`) wzięty z dokumentacji i opisów; **do potwierdzenia na prawdziwym teście** (typy są luźne, żeby nie wywrócić się na drobnych różnicach).
- **Odkrycie: token testowy wymaga logowania certyfikatem (XAdES).** Token KSeF można wygenerować tylko po jednorazowym zalogowaniu podpisem XAdES (na środowisku TEST dozwolony certyfikat samopodpisany). To nie jest potrzebne w aplikacji produkcyjnej (Paweł tworzy token Profilem Zaufanym), tylko do przygotowania testu. Do zrobienia osobnym skryptem w `scripts/` (nie w aplikacji).
- Faktura testowa: żeby sprawdzić pobieranie XML, w KSeF musi być faktura zakupowa. Wystawienie wymaga sesji z szyfrowaniem (klucz AES zaszyfrowany RSA) i poprawnego pliku FA(3). Alternatywa: aplikacja testowa MF. Jeśli to zbyt kosztowne – pobranie XML sprawdzimy dopiero z prawdziwą fakturą w etapie 8, a w etapie 1 wystarczy logowanie i zapytanie o listę.
- Poprawka do planu: filtr „nabywca” = `Subject2` (zgodnie z typami podmiotów w dokumentacji: Subject1 sprzedawca, Subject2 nabywca) – nadal do potwierdzenia na teście.

## Etap 1 – próba na testowym KSeF (2026-10-29 wieczór)

Wynik: **działa od początku do końca.** Środowisko tej sesji ma dostęp do `api-test.ksef.mf.gov.pl`.

Jak powtórzyć (wszystko na środowisku testowym, wymyślone NIP-y):
1. `node scripts/ksef-test-token.ts` – losuje NIP, tworzy certyfikat samopodpisany (`openssl`), loguje się podpisem XAdES, tworzy token z jednym uprawnieniem `InvoiceRead`. NIP i token zapisuje do `.ksef-test.env` (ignorowany przez git), nie na ekran.
2. `set -a; . ./.ksef-test.env; set +a`
3. `node scripts/ksef-test-invoice.ts` – drugi wymyślony NIP wystawia jedną fakturę FA(3) na NIP z punktu 1 (sesja z szyfrowaniem AES, szablon `scripts/fixtures/fa3-test-invoice.xml` z oficjalnego klienta MF). Numer KSeF przychodzi po kilku sekundach.
4. `node scripts/ksef-spike.ts` → „Faktury kosztowe: 1”, XML pobrany, `WYNIK: OK`.

Co potwierdzono na prawdziwym teście:
- Logowanie tokenem: `timestampMs` w challenge, `authenticationToken.token`, status 100 → 200, redeem zwraca `accessToken`/`refreshToken` z polami `token` i `validUntil`. Odświeżenie (`/auth/token/refresh`) zwraca nowy `accessToken`. Token dostępu ważny ok. 15 minut.
- Zły token → status 450 „Uwierzytelnianie zakończone niepowodzeniem z powodu błędnego tokenu” (klient zamienia to na czytelny błąd).
- Token KSeF zawiera znaki `|` (postać `numer|nip-XXXXXXXXXX|sekret`) – w plikach `.env` musi być w cudzysłowie.
- Metadane faktury: `ksefNumber`, `invoiceNumber`, `issueDate`, `invoicingDate`, `acquisitionDate`, `permanentStorageDate`, `seller{nip,name}`, `buyer{identifier{type,value},name}` (uwaga: nabywca NIE ma pola `nip`), `netAmount`/`grossAmount`/`vatAmount` jako liczby dziesiętne w złotych (np. 53.63), `currency`, `invoiceType` (np. `Vat`), `invoiceHash`, `formCode`.
- Faktura jest widoczna z datą `PermanentStorage` po ok. 1 sekundzie od przyjęcia.
- Specyfikacja OpenAPI do sprawdzania pól: `https://api-test.ksef.mf.gov.pl/docs/v2/openapi.json`.
- Logowanie XAdES zbudowane bez bibliotek (`scripts/lib/ksef-test-auth.ts`): KSeF przyjął ręcznie złożony podpis XAdES-BES (RSA-SHA256, exc-c14n, `verifyCertificateChain=false`). To narzędzie tylko do testów – aplikacja go nie używa.

### Próba z serwera vh.pl (2026-10-29, za zgodą Pawła)
- Node na serwerze nie jest w PATH: pełna ścieżka `/opt/alt/alt-nodejs24/root/usr/bin/node` (v24.12.1). Dostępne też inne wersje w `/opt/alt/alt-nodejsXX`. `openssl` jest w `/bin/openssl`.
- Skrypt próby złożony w jeden plik `.mjs` (typy usunięte przez `module.stripTypeScriptTypes`), przeniesiony przez Terminal jako base64+gzip do `~/mala-ksiegowa-proba`, uruchomiony z testowym tokenem → `WYNIK: OK` (logowanie, 1 faktura kosztowa, XML pobrany). Katalog usunięty po próbie, historia poleceń wyczyszczona.

### Review etapu 1 (2026-10-29)
- Raport: `review-faza-1.md`. Decyzja: **można iść dalej z zastrzeżeniami** (0×P1, 2×P2, 6×P3).
- Najważniejsze: (1) limit MF 20 zapytań o listę faktur na godzinę i rosnące blokady po 429 – przycisk „sprawdź teraz” nie może czekać ani ponawiać; (2) nocne pobieranie ma iść przylegającymi oknami od `permanentStorageHwmDate` (oficjalny dokument „przyrostowe pobieranie faktur”), a nie „ostatnie N dni”. Oba do zrobienia w etapie 4.
- Świadoma decyzja: pobieramy tylko rolę nabywcy (`Subject2`).

## Etap 2 – reguły podatkowe i składkowe (2026-10-29)

Pliki: `config/years/2026.json`, `config/years/2027.json`, `src/rules/{money,config,kpir,zus,pit,holiday,year}.ts`, `test/rules/rules.test.ts`, `scripts/rules-example.ts`, `docs/active/mala-ksiegowa/przyklad-wyliczen.md`. Testy: `npm test` 39/39 (11 KSeF + 28 reguł), `npm run typecheck` czysto.

Źródła (sandbox nie ma dostępu do zus.pl/sejm.gov.pl – czytane przez przeglądarkę Pawła):
- zus.pl „Informacja o wysokości składek na ubezpieczenia społeczne w 2026 r.” (2.02.2026): podstawa 5652 zł, emerytalne 1103,27, rentowe 452,16, wypadkowe 94,39 (1,67%), chorobowe 138,47, FP+FS 138,47; razem bez chorobowego 1788,29 zł. Minimum zdrowotnej (skala): 314,96 zł za styczeń 2026, 432,54 zł od lutego 2026 do stycznia 2027.
- Art. 81 ust. 2c ustawy o świadczeniach opieki zdrowotnej (tekst jedn. Dz.U. 2024 poz. 146, przez api.sejm.gov.pl): podstawa = dochód z miesiąca poprzedniego, liczony narastająco, pomniejszony o zapłacone składki emerytalne, rentowe, chorobowe, wypadkowe (bez FP).
- Dz.U. 2026 poz. 1213: płaca minimalna 2027 = 4950 zł → minimum zdrowotnej od lutego 2027 = 445,50 zł.
- 2027 prognoza: przeciętne wynagrodzenie z projektu budżetu 10 033 zł → podstawa 6019,80 zł; skala PIT 2027 – projekt zmian w Sejmie, w pliku na razie skala 2026.

Decyzje:
- Kwoty w groszach, stawki w punktach bazowych; każdą składkę ZUS zaokrąglamy do grosza osobno (tak jak ZUS – suma zgadza się z komunikatem).
- Podstawa i podatek PIT do pełnych złotych (art. 63 Ordynacji). Zaliczka = podatek narastająco − zaliczki należne wcześniej, nigdy ujemna.
- Fundusz Pracy nie jest odliczeniem, tylko kosztem; `computeYear` dolicza zapłacony FP do kosztów sam – KPiR nie może go mieć drugi raz z ręki.
- Domyślnie składki za miesiąc M są płacone w M+1 (termin 20.) i wtedy odliczane; można podać faktyczne wpłaty (`socialPaid`).
- Zdrowotna: dochód nie bywa ujemny; strata i nadwyżka składek przechodzą na kolejne miesiące (liczenie narastające). Dosłowne czytanie art. 81 ust. 2c pkt 4 („minus dochody za poprzednie miesiące” po odliczeniu składek) dodawałoby składki z powrotem – liczymy jak programy księgowe. Potwierdzone przez Pawła 2026-10-30; różnice wyrównuje i tak roczne rozliczenie zdrowotnej.
- Wakacje: w tym miesiącu społeczne i FP = 0, zdrowotna normalnie; w następnym miesiącu nie ma czego odliczyć. Wniosek RWS w miesiącu poprzedzającym (`rwsApplicationMonth`).

### Review etapu 2 (2026-10-30)
- Raport: `review-faza-2.md`. Decyzja: **można iść dalej z zastrzeżeniami** (0×P1, 2×P2, 6×P3).
- Najważniejsze: (1) interpretacja zdrowotnej po stracie/nadwyżce składek czeka na potwierdzenie księgowej; (2) ujemne koszty miesiąca (faktury korygujące) wywracają `summarizeKpir` – poprawić przed etapem 4/5.

## Etap 3 – szkielet, baza, logowanie (2026-10-30)
- Pliki: `server.mjs` → `src/server.ts` → `src/app.ts` (trasy), `src/http/http.ts` (ciasteczka, formularze do 16 KB, nagłówki bezpieczeństwa, sprawdzanie Origin), `src/views/` (HTML z automatycznym escapowaniem, CSS pod `/static/app.css`), `src/auth/` (hasło scrypt, TOTP RFC 6238, sesje 12 h, blokada po 5 błędach na 15 min, ochrona przed ponownym użyciem kodu), `src/crypto/secret-box.ts` (AES-256-GCM na token KSeF i sekret TOTP), `src/db/` (pula `pg`, migracje w transakcji z blokadą), `migrations/001_init.sql`.
- Zmienne środowiskowe: `DATABASE_URL`, `APP_ENCRYPTION_KEY` (32 bajty base64, np. `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`), `COOKIE_SECURE` (domyślnie true; `false` tylko lokalnie bez https), `PORT`.
- Polecenia: `npm run migrate`, `npm run create-user -- <login>` (tylko pierwsze konto; hasło ukryte, kod z telefonu sprawdzany przed zapisem), `npm start`.
- Testy: `npm test` (48); z bazą `TEST_DATABASE_URL=postgres://… npm test` (57) – test aplikacji kasuje i odtwarza schemat bazy testowej, nigdy nie wskazywać bazy produkcyjnej.
- Sprawdzone: 57/57, typecheck czysty; ręcznie: założenie konta skryptem (także przez potok), logowanie hasłem + kodem, strona miesiąca, wylogowanie.
- Uwaga: utrata `APP_ENCRYPTION_KEY` = trzeba od nowa wpisać token KSeF i założyć konto (TOTP). Klucz trzymać tylko w zmiennych środowiskowych cPanelu.

### Review etapu 3 (2026-10-30)
- Raport: `review-faza-3.md`. Decyzja: **można iść dalej z zastrzeżeniami** (0×P1, 2×P2, 6×P3).
- Najważniejsze: (1) równoległe próby logowania omijają limit 5 prób (sprawdzone: 20 prób → licznik 2) – poprawić atomowym UPDATE; (2) zepsute ciasteczko daje 500 nawet na stronie logowania. Obie poprawki małe, zrobić na początku etapu 4.

## Etap 4 – faktury, koszty, kasa (2026-10-30)
- **Pobieranie z KSeF** (`src/jobs/ksef-sync.ts`, cron: `npm run sync` = `node scripts/ksef-sync.ts`; przycisk „Sprawdź teraz” na `/faktury`):
  - okna po dacie `PermanentStorage` z `restrictToPermanentStorageHwmDate`, start = `settings.ksef_next_from` (pierwszy raz: północ czasu polskiego z `ksef_sync_from`), okno najwyżej 90 dni, najwyżej 5 okien na uruchomienie; przy ucięciu (`isTruncated`) kolejne okno od daty ostatniej faktury;
  - najpierw zapis metadanych (unikalny numer KSeF = brak duplikatów), potem XML dla faktur bez treści (do 20 na uruchomienie); nieudane pobranie XML zostawia fakturę z kwotą z listy i ponawia następnym razem;
  - przycisk: bez ponawiania po 429 i nie częściej niż co 5 min (`MANUAL_SYNC_COOLDOWN_MINUTES`); cron: czeka po 429 najwyżej 10 s;
  - jedna synchronizacja naraz (`pg_try_advisory_lock`); komunikaty dla Pawła bez tokenu i szczegółów technicznych; stan w `settings.ksef_last_success_at/attempt_at/error`.
  - Sprawdzone na prawdziwym testowym KSeF: znacznik kompletności (HWM) jest ok. 1–2 min za „teraz”, więc świeżo wystawiona faktura pojawia się przy kolejnym pobraniu – zgodnie z zasadami MF.
- **Odczyt FA(3)**: `src/ksef/xml.ts` (mały, ścisły czytnik XML bez zależności), `src/ksef/parse-fa.ts` (P_2, P_1, Podmiot1 NIP/Nazwa, P_15, KodWaluty, RodzajFaktury, DaneFaKorygowanej, PrzyczynaKorekty, FaWiersz z P_11/P_11A i StanPrzed). Kwoty z tekstu na grosze bez liczb zmiennoprzecinkowych.
- **Decyzje i księga**: `src/db/books.ts` – wpis do `kpir_entries` jednym `upsert` na dokument, zamknięty miesiąc (`months.status = 'closed'`) blokuje zmiany (409). Faktura → koszt w miesiącu daty wystawienia, kwota brutto (korekta: ujemna różnica). Waluta obca → Paweł wpisuje kwotę w zł (kurs NBP z dnia przed wystawieniem). „Cofnij decyzję” usuwa wpis.
- **Koszt spoza KSeF** (`/koszty/nowy`) i **raport z kasy** (`/kasa/RRRR/MM`, jeden na miesiąc, przychód zawsze w miesiącu raportu): pliki do 8 MB, rodzaj rozpoznawany po zawartości (PDF/JPG/PNG/HEIC), trzymane w bazie, wydawane z nagłówkiem `CSP: sandbox`.
- **Ustawienia** (`/ustawienia`): NIP z sumą kontrolną, token zapisywany zaszyfrowany i nigdy niepokazywany (puste pole = bez zmian), data początkowa nie z przyszłości, środowisko. Zmiana NIP/środowiska/daty = pobieranie od nowa.
- Trasy podzielone na `src/routes/{invoices,costs,cash,settings}.ts`; migracja `002_faktury_koszty_kasa.sql`.
- Przy okazji poprawki z review: etap 3 (P2-1 blokada logowania odporna na równoległe próby, P2-2 zepsute ciasteczko, P3-4, P3-5), etap 2 (P2-2 ujemne koszty), etap 1 (P2-1, P2-2, P3-1, P3-2, P3-3).
- Testy: `npm test` 66 bez bazy, 98 z `TEST_DATABASE_URL` (testy z bazą idą po kolei: `--test-concurrency=1`). Udawany KSeF w `test/helpers/fake-ksef.ts`.

### Review etapu 4 (2026-10-30)
- Raport: `review-faza-4.md`. Decyzja: **można iść dalej z zastrzeżeniami** (0×P1, 1×P2, 7×P3).
- Najważniejsze: (1) data księgowania faktury kosztowej (wystawienia vs otrzymania w KSeF) do ustalenia z księgową przed etapem 6 – decyduje o fakturach, które przyjdą po zamknięciu miesiąca; (2) drobne: błąd 21183 tuż po północy, czytelniejsze komunikaty, faktury zaliczkowe bez oznaczenia.
- Sprawdzone przy review: PDF z nagłówkiem `CSP: sandbox` wyświetla się w Chromium; za duży plik daje czytelny komunikat 413; KSeF odrzuca zapytanie z `from` po HWM kodem 21183.

## Etap 5 – księga KPiR (2026-10-30)
- **Wzór**: rozporządzenie MFiG z 6.09.2025 w sprawie prowadzenia podatkowej księgi przychodów i rozchodów, **Dz.U. 2025 poz. 1299**, obowiązuje od 1.01.2026 (tekst przeczytany w PDF z api.sejm.gov.pl przez przeglądarkę Pawła). 19 kolumn: 1 Lp., 2 data zdarzenia, 3 numer faktury w KSeF, 4 numer (innego) dowodu, 5 identyfikator podatkowy kontrahenta (z kodem kraju), 6 nazwa, 7 adres, 8 opis, 9 sprzedaż, 10 pozostałe przychody, 11 razem przychód, 12 zakup towarów, 13 koszty uboczne, 14 wynagrodzenia, 15 pozostałe wydatki, 16 razem wydatki, 17–18 B+R, 19 uwagi.
  - Objaśnienia: przy identyfikatorze w kol. 5 kol. 6–7 można pominąć; przy raportach fiskalnych kol. 3–7 się nie wypełnia; raport miesięczny z kasy dozwolony (§ 12 ust. 2); po miesiącu suma kol. 9–16, opcjonalnie sumy od początku roku (pkt 19), inaczej zestawienie roczne (pkt 20); FP właściciela to „pozostałe wydatki” (kol. 15); księga tylko w postaci elektronicznej.
- **Zasada Pawła (2026-10-30)**: PIT płaci 20., ZUS 10. dnia. Faktura za poprzedni miesiąc otrzymana do 9. dnia → poprzedni miesiąc (przeliczyć dochód i składki), po 9. → miesiąc otrzymania. „Otrzymana” = nadanie numeru KSeF; dla kosztów spoza KSeF – pole „data otrzymania” (domyślnie data wystawienia). `src/rules/booking.ts`; na liście faktur widać, do którego miesiąca trafi koszt i dlaczego; w uwagach (kol. 19) zapis „Faktura z …, otrzymana …”.
- **Widok**: `/ksiega/RRRR` (miesiące do bieżącego + zestawienie), `/ksiega/RRRR/MM`; `src/rules/kpir-book.ts` (numeracja ciągła w roku po dacie, sumy miesiąca / do poprzedniego / od początku roku), `src/views/book.ts`, `src/routes/book.ts`, migracja `003_ksiega.sql` (ksef_number, counterparty_tax_id, notes w `kpir_entries`; received_date w `manual_costs`).
- **Druk**: styl `@media print` (A4 poziomo, bez menu), przycisk „Drukuj / zapisz jako PDF” przez `/static/app.js` (CSP nie pozwala na skrypty w treści). Sprawdzone: przykładowy miesiąc mieści się na jednej stronie.
- Decyzja: dla faktur z KSeF numer KSeF w kol. 3, kol. 4 pusta („innego numeru dowodu”), numer faktury w uwagach. Do potwierdzenia przy JPK_PKPIR (od 2028).
- Testy: 73 bez bazy, 108 z bazą.

- **Review etapu 5 (2026-10-30)**: można iść dalej z zastrzeżeniami (0×P1, 2×P2, 4×P3), raport `review-faza-5.md`. Najważniejsze: (1) faktura za poprzedni miesiąc rozstrzygnięta po 10. zmienia miesiąc już opłacony – etap 6 musi ostrzegać od 1. do 9. dnia i obsłużyć zamknięty miesiąc; (2) koszty ręczne nie mają osobno NIP-u i adresu kontrahenta (kol. 5 i 7 wzoru).

## Etap 6 – zamknięcie miesiąca, ZUS, PIT (2026-10-30)
- **Źródła DRA** (czytane przez przeglądarkę Pawła; sandbox nie ma dostępu do zus.pl): BIP ZUS → Wymagania dla oprogramowania interfejsowego → Dokumenty ubezpieczeniowe: specyfikacja EWD 2.27, schemat `kedu_5_7.xsd` (przestrzeń nazw `http://www.zus.pl/2026/KEDU_5_7`, ważny od 25.04.2026), zestaw danych testowych (DRA.xml), Załącznik nr 1 (opis pól DRA). Poradnik ZUS „ZUS DRA. Jak wypełnić i skorygować” (zus.pl/documents/10182/167567/poradnik+ZUS+DRA.pdf) – przykład za maj 2026, osoba płacąca tylko za siebie, skala.
- **Pola DRA dla Pawła**: I p1=6 (do 20.), p2=01/RRRR-MM; II NIP, (REGON), PESEL, (nazwa skrócona), NAZWISKO, IMIĘ, data urodzenia z PESEL; III p1=1, p3=1.67; IV p1–p6 i p20,p21,p23,p24 (chorobowe p19/p22 tylko przy dobrowolnym), p37; VI p2,p5,p7 = zdrowotna; VII p1,p3 = FP+FS; IX p2 = razem; X kod 0510 0 0, podstawy (p3 tylko z chorobowym), p5 podstawa zdrowotnej; XI p1=true (skala), p2 dochód z poprzedniego miesiąca (≥0), p3 podstawa (przy minimum = płaca minimalna 4806 zł), p4 składka; XIII p1 data wypełnienia. Nagłówka i cech dokumentu nie wypełnia się. Składki samozatrudnionego są „finansowane przez ubezpieczonego”.
- **Pomyłka w poradniku ZUS**: IX p2 podane jako 2826,77 zł, a suma jego pól to 2826,76 zł – trzymamy się sumy.
- **Zamknięcie** (`src/month/close.ts`, `src/routes/month-close.ts`, `src/views/month-close.ts`, migracja `004_zamkniecie_miesiaca.sql`):
  - miesiące roku zamyka się po kolei; miesiące bez żadnych zapisów są pomijane z ostrzeżeniem (liczone jak zero przychodu, ale z założeniem, że składki były płacone);
  - przeszkody: brak raportu z kasy, faktury do decyzji należące do miesiąca (zasada 9. dnia), miesiąc jeszcze trwa, brak danych płatnika (NIP, PESEL z sumą kontrolną, imię, nazwisko);
  - przy zamknięciu wpis FP do księgi (kol. 15, data 10. dnia – dzień płatności Pawła, kontrahent ZUS z adresem centrali ul. Szamocka 3, 5, 01-748 Warszawa), zapis wyniku w `months.results`;
  - ponowne otwarcie tylko z potwierdzeniem i gdy późniejsze miesiące są otwarte; poprzedni wynik zostaje do porównania („kwoty zmieniły się…”);
  - DRA (`/miesiac/RRRR/MM/dra.xml`) tylko dla zamkniętego miesiąca, z zapisanego wyniku i aktualnych danych płatnika; miesiąc wakacji – patrz etap 7;
  - styczeń: gdy grudnia poprzedniego roku nie ma w aplikacji, pole „dochód z grudnia” (`years.previous_december_income`).
- **Terminy na ekranie**: ZUS do 10. (dzień Pawła; ustawowo 20.), PIT do 20. następnego miesiąca.
- **Z review 5**: ostrzeżenie na stronie bieżącego miesiąca od 1. do 9. dnia o fakturach za poprzedni miesiąc; karta faktury mówi, gdy jej miesiąc jest zamknięty (link do otwarcia); koszt spoza KSeF z NIP/VAT UE (`parseTaxId`) albo adresem (kol. 5 i 7); dane płatnika w Ustawieniach (`/ustawienia/dane`).
- **Start**: Paweł prowadzi księgę w aplikacji od 1.01.2027 (decyzja 2026-10-30) – żadnego „stanu na start”, tylko dochód z grudnia 2026 przy zamknięciu stycznia.
- **Otwarte**: Paweł importuje DRA w eZUS po wdrożeniu (punkt kontrolny, zgoda jest).
- Testy: `test/zus/dra.test.ts` (przykład ZUS co do grosza, schemat, PESEL), `test/month-close.test.ts` (8 scenariuszy przez HTTP). 124 z bazą, 81 bez.

- **Review etapu 6 (2026-10-30)**: można iść dalej z zastrzeżeniami (0×P1, 2×P2, 5×P3), raport `review-faza-6.md`. Najważniejsze: (1) zamknięcie działa na prognozowanych stawkach (2027 to prognoza) – zablokować przy statusie „prognoza”; (2) ekran zamknięcia nie ostrzega, gdy pobieranie z KSeF nie działa. Oba przed wdrożeniem.

## Etap 7 – wakacje składkowe (2026-10-30)
- **Źródło**: instrukcja ZUS „Jak wypełnić dokumenty rozliczeniowe, gdy uzyskasz zwolnienie z obowiązku opłacenia składek za wybrany miesiąc (tzw. wakacje składkowe)”, grudzień 2024 (docx na zus.pl, link w adnotacjach poradnika DRA), przykład 1; schemat `kedu_5_7.xsd` (t_RCA, t_DDORCA_B/C, t_ZDR) i `DRA_RCA.xml` z zestawu testowego BIP (identyfikator ubezpieczonego „P” = PESEL; p7–p10 finansuje ubezpieczony, p11–p14 płatnik, p15–p18 budżet).
- **Ważne odkrycie**: w miesiącu wakacji sam DRA nie wystarcza. Plik KEDU zawiera trzy dokumenty:
  - ZUS RCA z kodem 05 14 00: podstawy (III.B p4–p6; p5 tylko z chorobowym), składki „finansowane przez budżet państwa” p15–p18, suma p29;
  - ZUS RCA z kodem 05 10 00: tylko kod w III.B, zdrowotna w III.C (p1 podstawa, p4 kwota) i III.E (forma opodatkowania, dochód, podstawa, kwota);
  - ZUS DRA: IV p1–p3 i p10–p12, p20/p21 i p29/p30 (chorobowe p19/p28 tylko przy dobrowolnym), p37 = 0; VI zdrowotna; IX p2 = zdrowotna; bez VII (zwolnienia z FP przy opłacaniu tylko za siebie się nie wykazuje) i bez X/XI.
  - Gdy dokumentów nie ma, ZUS tworzy je z urzędu z minimalną zdrowotną – ale to nie zwalnia z ich wysłania.
- **W aplikacji**:
  - Ustawienia → „Wakacje składkowe” (`/ustawienia/wakacje`): miesiąc na bieżący i następny rok (`years.holiday_month`); nowy miesiąc tylko, gdy termin RWS (miesiąc wcześniej) nie minął; zmiana zablokowana, gdy zamknięty jest miesiąc ≥ min(stary, nowy) – przy grudniu także styczeń następnego roku (`src/month/holiday.ts`).
  - Strona miesiąca przed wakacjami: karta „Złóż wniosek RWS do …” z kwotą zwolnienia i danymi do przepisania (NIP, PESEL, REGON, nazwisko, miesiąc); RWS składa się tylko w eZUS (nie ma importu). Strona miesiąca wakacji: uwaga, że zwolnienie działa tylko po przyjęciu RWS.
  - Zamknięcie miesiąca wakacji zapisuje `exemptSocial` (składki objęte zwolnieniem); plik `dra.xml` buduje wtedy DRA + 2×RCA (`buildDraKedu` z `exempt`). Miesiąc wakacji zamknięty przed tą zmianą wymaga ponownego zamknięcia.
  - Następny miesiąc: nic nie zapłacono za miesiąc wakacji, więc brak wpisu FP i odliczenia składek (już w regułach z etapu 2).
- **Grudzień 2026**: Paweł nie bierze wakacji (2026-10-30) – review 6 P3-3 zamknięte.
- Testy: `test/zus/dra.test.ts` (+3: przykład 1 z instrukcji ZUS co do grosza, bez chorobowego, błędne dane), `test/holiday.test.ts` (4 scenariusze przez HTTP). 131 z bazą, 87 bez; typecheck czysty; ekrany obejrzane w przeglądarce (szerokość telefonu).
- **Do sprawdzenia przy imporcie w eZUS**: plik z trzema dokumentami (ten sam punkt kontrolny co zwykły DRA, gdy przyjdzie miesiąc wakacji).

## Planowany układ plików

```
server.mjs                 punkt startowy dla cPanelu
src/ksef/                  klient KSeF, odczyt faktur FA(3)
src/rules/                 reguły KPiR, ZUS, PIT, wakacje (bez bazy i sieci)
src/zus/                   generowanie pliku DRA (KEDU)
src/jobs/                  zadanie nocne
src/auth/, src/db/, src/routes/
views/                     szablony stron
migrations/                SQL
config/years/              ustawienia roku
scripts/                   próba KSeF, budowa paczki, pierwsze konto
test/                      testy
docs/VH-WDROZENIE.md       instrukcja wdrożenia dla Pawła
docs/KSEF-TOKEN.md         jak wygenerować token tylko do odczytu
```

## Zasady pracy

- Nic nie jest wdrażane ani wysyłane do ZUS/US automatycznie.
- W cPanelu Pawła nie zmieniamy niczego bez jego wyraźnej zgody. Hasła i sekrety wpisuje tylko Paweł.
- Sekretów (token, hasła, klucze) nie zapisujemy w repozytorium, dokumentacji ani czacie.
- Każdą regułę podatkową/składkową sprawdzamy w oficjalnym źródle i zapisujemy źródło w komentarzu testu.

## Notatki dla kolejnej sesji

- Repozytorium: `PawelSzmit/Mala_Ksiegowa`, dotąd tylko dokumenty w `docs/`.
- Kopie dokumentów są też w plikach projektu: `/mnt/project-files/docs/`.

## Źródła

- Wymagania: `docs/brainstorms/2026-10-29-mala-ksiegowa-requirements.md`
- Plan techniczny: `docs/plans/2026-10-29-mala-ksiegowa-plan.md`
- Ideacja: `docs/ideation/2026-10-29-mala-ksiegowa-ideation.md`
- Import DRA w ePłatniku: https://norman.finance/pl/pomoc/import-dra-w-eplatnik
- Wniosek RWS 3.0: https://www.podatki.biz/artykuly/zus-wakacje-skladkowe-nowy-wniosek-od-kiedy-obowiazuje-i-jak-go-wypelnic_16_62631.htm
- Tokeny KSeF 2.0: https://ksef.podatki.gov.pl/wyjasnienia/nowa-funkcjonalnosc-w-module-certyfikatow-i-uprawnien-generowanie-tokenow/
- Dokumentacja API KSeF (test): https://api-test.ksef.mf.gov.pl/docs/v2
