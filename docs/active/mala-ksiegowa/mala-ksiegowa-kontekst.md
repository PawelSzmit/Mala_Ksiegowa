# Mała Księgowa – kontekst

Gałąź: `claude/project-thread-tqtl79`
Ostatnia aktualizacja: 2026-10-29
Stan: dokumentacja gotowa, kod jeszcze nie powstał. Następny krok: Etap 1.

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
- Niepotwierdzone: dokładna wartość filtra „nabywca” (prawdopodobnie `Subject2`), limity stron. Sprawdzić w oficjalnej dokumentacji w Etapie 1.
- Źródło: nieoficjalna kopia dokumentacji MF (flopsstuff.github.io/ksef-docs) – weryfikować z oficjalną.

### ZUS
- DRA: import pliku KEDU w eZUS → ePłatnik → Dokumenty → Dokumenty ubezpieczeniowe → „Import KEDU”. Dokument trafia do roboczych i nic nie jest wysyłane bez podpisu (Profil Zaufany / e-dowód / podpis kwalifikowany). Plik musi zawierać NIP i PESEL; nie edytować go przed importem.
- Termin: DRA i składki do 20. dnia następnego miesiąca, jednym przelewem na rachunek składkowy (NRS).
- Wakacje składkowe: wniosek RWS (wersja 3.0 od 26.06.2026, pole „Wersja PKD”) składa się wyłącznie w eZUS, w miesiącu poprzedzającym miesiąc wakacji. Importu pliku nie znaleziono – aplikacja tylko przypomina i podaje dane.
- Niepotwierdzone: postać DRA w miesiącu wakacji (kody), aktualny schemat KEDU.

## Otwarte pytania

| Pytanie | Kto / kiedy |
|---|---|
| Filtr „nabywca” i limity stron w KSeF | Etap 1, dokumentacja MF |
| Z którego miesiąca dochód jest podstawą zdrowotnej, jak liczy się styczeń, minimum 2026/2027 | Etap 2, oficjalne źródła ZUS |
| Kwoty składek społecznych 2026/2027; czy Paweł płaci dobrowolne chorobowe | Etap 2, zapytać Pawła |
| Aktualny wzór kolumn KPiR (np. kolumna na numer KSeF) | Etap 5, rozporządzenie MF |
| Schemat KEDU i postać DRA w miesiącu wakacji | Etapy 6–7, zus.pl |
| Nazwa subdomeny | Etap 8, zapytać Pawła |
| Który miesiąc Paweł wybiera na wakacje w 2027 | Etap 7, zapytać Pawła |

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
