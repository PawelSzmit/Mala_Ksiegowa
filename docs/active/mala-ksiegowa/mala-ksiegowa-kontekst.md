# Mała Księgowa – kontekst

Gałąź: `claude/project-thread-eptw6o` (kontynuacja `claude/project-thread-tqtl79`)
Ostatnia aktualizacja: 2026-10-29
Stan: Etap 1 prawie gotowy – próba na testowym KSeF udana (logowanie tokenem, lista faktur kosztowych, pobranie XML). Próba z serwera vh.pl też udana (2026-10-29). Zostało: decyzja go/no-go Pawła.

## Kim jest użytkownik

Paweł – właściciel firmy, nie programista. Komunikacja po polsku, prostym językiem, bez żargonu. Decyzje produktowe należą do niego; techniczne podejmujemy sami i tłumaczymy obrazowo.

## Fakty o firmie (ustalone, nie pytać ponownie)

- Gabinet, strona za-horyzont.pl. Usługi, brak towarów (brak spisu z natury).
- Skala podatkowa → KPiR i miesięczna zaliczka PIT.
- Nie jest płatnikiem VAT → koszty księgowane w kwocie brutto, brak JPK_V7.
- Pełny ZUS → składki społeczne stałe w roku, składka zdrowotna 9% dochodu (z minimum) → DRA co miesiąc.
- Raz w roku wakacje składkowe.
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
| Strony HTML renderowane na serwerze (lekki framework typu Hono/Fastify), bez SPA | Kilka ekranów z formularzami – minimum ruchomych części |
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
| Z którego miesiąca dochód jest podstawą zdrowotnej, jak liczy się styczeń, minimum 2026/2027 | Etap 2, oficjalne źródła ZUS |
| Kwoty składek społecznych 2026/2027; czy Paweł płaci dobrowolne chorobowe | Etap 2, zapytać Pawła |
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
