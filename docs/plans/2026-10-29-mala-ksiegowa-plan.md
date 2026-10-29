# Mała Księgowa – plan techniczny

Data: 2026-10-29
Głębokość: standard (nowa, mała aplikacja; ryzyko skupione w KSeF i plikach ZUS)

## Źródła

- Wymagania (źródło prawdy): `docs/brainstorms/2026-10-29-mala-ksiegowa-requirements.md` (R1–R10)
- Ideacja: `docs/ideation/2026-10-29-mala-ksiegowa-ideation.md`
- Rozmowa z Pawłem 2026-10-29: token KSeF działa w 2027; JPK_PKPIR dla nie-VAT-owców od 2028 (poza zakresem); raz w roku wakacje składkowe.

## Problem

Jednoosobowa firma (gabinet), skala podatkowa, bez VAT, pełny ZUS. Co miesiąc: kilka faktur kosztowych z KSeF + jeden raport miesięczny z kasy fiskalnej. Aplikacja ma z tego zrobić KPiR, składki ZUS z plikiem DRA do importu w eZUS oraz zaliczkę PIT. Minimalny zakres – patrz „Czego NIE robimy” w wymaganiach.

## Stan obecny

### Repozytorium
Puste, poza dokumentami w `docs/`. Brak kodu, testów i wzorców do naśladowania w tym repo.

### Hosting (sprawdzone w cPanelu 2026-10-29)
- vh.pl, cPanel, konto `vh20129`, serwer `v102.vh.net.pl`.
- Dostępne środowiska: Node.js do v24 („Skonfiguruj aplikację Node.js”), Python do 3.11, PHP do 8.6, Ruby.
- PostgreSQL (kreator baz + phpPgAdmin), MySQL, „Zadania cron”, Terminal/SSH, Repozytorium Git, JetBackup 5 (kopie zapasowe), uwierzytelnianie dwuskładnikowe dla cPanelu.
- **Połączenie z KSeF z serwera działa**: `POST https://api-test.ksef.mf.gov.pl/v2/auth/challenge` zwrócił HTTP 200.
- Zasoby: dysk 5 GB (zajęte ok. 5%), RAM 2 GB.

### Wzorzec do skopiowania: aplikacja gabinetu
Na tym samym koncie działa `~/za-horyzont-app` – aplikacja Node.js v24 (`server.mjs`, `server/`, `worker/`, `dist/`, `migrations/`), baza PostgreSQL (biblioteka `pg`), wdrażana jako paczka `tar.gz` rozpakowana poza `public_html`, uruchamiana przez „Setup Node.js App”, zmienne środowiskowe w formularzu cPanelu, migracje przez `npm run migrate:postgres`. Instrukcja wdrożenia: `~/za-horyzont-app/VH-WDROZENIE.md`. **Mała Księgowa powiela ten sposób wdrożenia**, żeby Paweł miał jeden znany sobie proces.

## Proponowane podejście

### Technologia (decyzja)
- **Node.js 24 + TypeScript**, ta sama wersja co strona gabinetu. Dlaczego: sprawdzone, że działa na tym hostingu; jeden język i jeden proces wdrożenia dla obu aplikacji; `node:crypto` obsługuje RSA-OAEP/SHA-256 i AES, których wymaga KSeF.
- **Serwer renderuje zwykłe strony HTML** (lekki framework, np. Hono lub Fastify, plus szablony). Bez osobnej aplikacji frontendowej (SPA). Dlaczego: kilka ekranów z formularzami, minimum ruchomych części.
- **PostgreSQL** przez `pg`, osobna baza i osobny użytkownik bazy (jak w instrukcji gabinetu).
- **Kwoty zawsze w groszach (liczby całkowite).** Żadnych ułamków dziesiętnych w obliczeniach.
- **Klient KSeF piszemy sami** (cienka warstwa, ok. 6 wywołań API). Nie znaleziono dojrzałej biblioteki dla Node. Dojrzałe są w PHP (`n1ebieski/ksef-php-client`) i Pythonie (`ksef-client` na PyPI, aktywnie rozwijany) – służą jako wzorzec do podejrzenia, nie jako zależność.
- **Zadanie nocne przez cPanel „Zadania cron”**: raz dziennie uruchamia skrypt synchronizacji KSeF (`node dist/jobs/ksef-sync.js`). Przycisk „sprawdź teraz” wywołuje tę samą funkcję.
- **Adres**: subdomena, np. `ksiegowa.za-horyzont.pl`, osobna aplikacja Node w cPanelu, osobny katalog `~/mala-ksiegowa-app`.

### Przepływ danych
1. Cron → klient KSeF → lista metadanych faktur, gdzie firma jest nabywcą (Podmiot2) → pobranie XML każdej nowej faktury → zapis XML i wyciągniętych pól (dostawca, NIP, numer, numer KSeF, data wystawienia, kwota brutto, pozycje) w bazie, status „do przejrzenia”.
2. Paweł: „koszt firmy” → wpis do KPiR w kolumnie „pozostałe wydatki”, kwota brutto; „nie jest kosztem” → archiwum.
3. Paweł: wpis raportu z kasy (data, kwota) → przychód w KPiR.
4. „Zamknij miesiąc” → obliczenia (moduł reguł) → zapis wyników → plik DRA (KEDU XML) do pobrania → blokada miesiąca.

### Moduł reguł (czyste funkcje, bez bazy i sieci)
Oddzielny katalog z funkcjami: podsumowanie KPiR, składka zdrowotna, składki społeczne, zaliczka PIT, wakacje składkowe. Wszystkie stawki, progi i minima w **pliku ustawień roku** (np. `config/years/2026.json`, `2027.json`), nie w kodzie. Dzięki temu nowy rok to nowy plik, a nie zmiana programu.

## Jednostki pracy

Kolejność ma znaczenie: najpierw ryzyko (KSeF), potem reguły (żeby kwoty były dobre), dopiero potem ekrany.

### Etap 1. Próba KSeF (go / no-go)
- **Cel**: z serwera vh.pl i z komputera deweloperskiego uwierzytelnić się tokenem w środowisku testowym KSeF, wyszukać faktury zakupowe i pobrać jedną fakturę XML.
- **Pliki**: `src/ksef/client.ts`, `src/ksef/auth.ts`, `scripts/ksef-spike.ts`, `package.json`, `tsconfig.json`.
- **Przebieg uwierzytelnienia (KSeF 2.0)**: `POST /auth/challenge` → zaszyfrowanie `token|timestampMs` kluczem publicznym MF (RSA-OAEP, SHA-256; certyfikat „KsefTokenEncryption” z endpointu kluczy publicznych) → `POST /auth/ksef-token` → odpytywanie `GET /auth/{referenceNumber}` → `POST /auth/token/redeem` (jednorazowo) → accessToken + refreshToken (`POST /auth/token/refresh`).
- **Pobieranie**: `POST /invoices/query/metadata` z filtrem podmiotu = nabywca i zakresem dat; `GET /invoices/ksef/{ksefNumber}` dla każdej nowej faktury. Eksport paczek (`/invoices/exports`) niepotrzebny przy kilku fakturach miesięcznie.
- **Ryzyka**: nazwa wartości filtra dla nabywcy (prawdopodobnie `Subject2`) i limity stron niepotwierdzone – sprawdzić w oficjalnej dokumentacji `https://api-test.ksef.mf.gov.pl/docs/v2`. Środowisko testowe jest wspólne – używać losowego NIP-u testowego.
- **Scenariusze testowe**: poprawny token → accessToken; zły token → czytelny błąd; wygasły accessToken → automatyczne odświeżenie; pusta lista faktur; więcej faktur niż jedna strona wyników.
- **Weryfikacja**: skrypt uruchomiony w Terminalu cPanelu pobiera fakturę wystawioną przez nas samych w środowisku testowym (wystawiamy z jednego testowego NIP-u na drugi).
- **Punkt kontrolny z Pawłem**: tak. Jeśli próba się nie uda, wracamy do wyboru technologii, zanim powstanie reszta.

### Etap 2. Moduł reguł podatkowych i składkowych
- **Cel**: czyste funkcje liczące KPiR, ZUS, PIT i wakacje składkowe, pokryte testami na przykładach liczbowych.
- **Pliki**: `src/rules/kpir.ts`, `src/rules/zus.ts`, `src/rules/pit.ts`, `src/rules/holiday.ts`, `config/years/2026.json`, `config/years/2027.json`, `test/rules/*.test.ts`.
- **Reguły do zakodowania (każdą zweryfikować w oficjalnym źródle przed kodowaniem; nie zgadywać)**:
  - Składki społeczne przy pełnym ZUS: stała kwota miesięczna z ustawień roku (podstawa = 60% prognozowanego przeciętnego wynagrodzenia); dobrowolne chorobowe jako przełącznik w ustawieniach.
  - Składka zdrowotna (skala): 9% dochodu, nie mniej niż minimum z ustawień roku. **Do potwierdzenia**: z którego miesiąca dochód jest podstawą (bieżący czy poprzedni) i jak traktowany jest styczeń.
  - Roczne rozliczenie zdrowotnej: poza zakresem teraz, ale moduł zapisuje miesięczne podstawy, żeby dało się je dobudować.
  - Zaliczka PIT (skala): dochód narastająco od stycznia minus zapłacone składki społeczne, zaokrąglenia zgodnie z ordynacją, 12% / 32% powyżej progu, kwota zmniejszająca podatek, minus zaliczki już należne za wcześniejsze miesiące. Składka zdrowotna na skali nie obniża podatku.
  - Wakacje składkowe: jeden miesiąc w roku; w tym miesiącu składki społeczne = 0, zdrowotna normalnie; zaliczka PIT uwzględnia brak składek społecznych w tym miesiącu.
- **Ryzyka**: błąd w regule = zła kwota do zapłaty. To najważniejsze miejsce do testów.
- **Scenariusze testowe**: miesiąc z dochodem dodatnim, ujemnym (strata) i zerowym; minimum składki zdrowotnej; przekroczenie progu 32% w trakcie roku; dochód poniżej kwoty wolnej (zaliczka 0); miesiąc wakacji; drugi miesiąc wakacji w tym samym roku → odrzucony; korekta zamkniętego miesiąca → przeliczenie kolejnych.
- **Weryfikacja**: 2–3 miesiące przeliczone ręcznie (arkusz) lub przez księgową i porównane z wynikiem funkcji. **Punkt kontrolny z Pawłem**: tak – pokazujemy przykładowe wyliczenia.

### Etap 3. Szkielet aplikacji, baza i logowanie
- **Cel**: działająca aplikacja z logowaniem (hasło + kod z aplikacji w telefonie, TOTP), migracjami bazy i pustym ekranem miesiąca.
- **Pliki**: `server.mjs` (punkt startowy dla cPanelu), `src/app.ts`, `src/auth/*`, `src/db/*`, `migrations/*.sql`, `views/*`.
- **Tabele (zarys)**: `invoices` (dane z KSeF + XML + status), `manual_costs`, `cash_reports`, `kpir_entries`, `months` (status otwarty/zamknięty, wyniki obliczeń), `settings` (token KSeF zaszyfrowany, NIP, PESEL, dane do DRA), `users`.
- **Bezpieczeństwo**: token KSeF zaszyfrowany w bazie kluczem ze zmiennej środowiskowej; hasło hashowane (argon2 lub scrypt z `node:crypto`); ciasteczko sesji `HttpOnly`, `Secure`, `SameSite=Strict`; ograniczenie prób logowania; pierwsze konto zakładane jednorazowo skryptem (jak w aplikacji gabinetu).
- **Scenariusze testowe**: logowanie poprawne; złe hasło; zły kod 2FA; blokada po wielu próbach; wejście na stronę bez sesji → przekierowanie do logowania.

### Etap 4. Faktury: synchronizacja, przegląd, koszty ręczne, kasa (R2–R5)
- **Cel**: nocne pobieranie faktur, ekran przeglądu z decyzją „koszt firmy / nie jest kosztem”, formularz kosztu spoza KSeF (z opcjonalnym PDF), formularz raportu z kasy (z opcjonalnym zdjęciem).
- **Pliki**: `src/jobs/ksef-sync.ts`, `src/ksef/parse-fa.ts` (odczyt XML faktury FA(3)), `src/routes/invoices.ts`, `src/routes/costs.ts`, `src/routes/cash.ts`, `views/*`.
- **Ryzyka**: duplikaty (ta sama faktura dwa razy) → unikalny numer KSeF w bazie; korekty faktur (faktura korygująca) → na start pokazujemy je jako osobną pozycję do decyzji, z wyraźnym oznaczeniem „korekta”.
- **Scenariusze testowe**: ponowna synchronizacja nie tworzy duplikatów; faktura korygująca; faktura z wieloma pozycjami; awaria KSeF w nocy → kolejna próba następnej nocy i komunikat na ekranie „ostatnia udana synchronizacja: …”.

### Etap 5. Księga KPiR (R6)
- **Cel**: widok KPiR za miesiąc i rok: numeracja, kolumny zgodne z obowiązującym rozporządzeniem, sumy miesięczne i narastające; wydruk / zapis do PDF (wydruk z przeglądarki ze stylem do druku wystarczy).
- **Do sprawdzenia przed kodowaniem**: aktualny wzór kolumn KPiR na 2026 (w tym czy jest kolumna na numer KSeF).
- **Scenariusze testowe**: numeracja ciągła w roku; suma narastająca; wpis z miesiąca zamkniętego nie zmienia się bez ponownego otwarcia.

### Etap 6. Zamknięcie miesiąca, ZUS i PIT (R7–R9)
- **Cel**: przycisk „zamknij miesiąc” → wyliczenie (moduł z Etapu 2) → ekran z kwotami do zapłaty (ZUS na rachunek składkowy, PIT na mikrorachunek) → pobranie pliku DRA → blokada miesiąca; „otwórz ponownie” z ostrzeżeniem.
- **Plik DRA**: KEDU XML zgodny z aktualnym schematem ZUS. Import w eZUS: ePłatnik → Dokumenty → Dokumenty ubezpieczeniowe → „Import KEDU”. Zaimportowany dokument ląduje jako **roboczy** i niczego nie wysyła, dopóki Paweł go nie podpisze – dzięki temu można bezpiecznie testować na prawdziwym koncie. Plik musi zawierać NIP i PESEL.
- **Pliki**: `src/zus/kedu-dra.ts`, `src/routes/month-close.ts`, `views/*`.
- **Ryzyka**: schemat KEDU (wersja, kody) – pobrać aktualny opis struktury z zus.pl; walidować XML względem schematu w testach.
- **Scenariusze testowe**: zwykły miesiąc; miesiąc wakacji (tylko składka zdrowotna); minimum zdrowotnej; plik przechodzi walidację schematu.
- **Weryfikacja**: Paweł importuje wygenerowany plik w eZUS i potwierdza, że dokument roboczy nie ma błędów krytycznych (nie podpisuje go przy teście). **Punkt kontrolny z Pawłem**: tak.

### Etap 7. Wakacje składkowe (R10)
- **Cel**: w ustawieniach roku zaznaczenie miesiąca wakacji; przypomnienie na ekranie głównym w miesiącu poprzedzającym („złóż wniosek RWS w eZUS do końca tego miesiąca”) z danymi do przepisania; uwzględnienie w obliczeniach (Etap 2) i w DRA (Etap 6).
- **Ustalenie z rozeznania**: wniosek RWS (obecnie wersja 3.0, z polem „Wersja PKD”) składa się **wyłącznie elektronicznie w eZUS**; nie znaleziono możliwości importu pliku. Aplikacja nie generuje więc pliku RWS, tylko przypomina i podaje dane.
- **Do potwierdzenia**: jak wygląda DRA w miesiącu wakacji (czy składa się DRA ze składką zdrowotną i jakie kody) – oficjalna instrukcja RWS / komunikat ZUS.

### Etap 8. Wdrożenie na vh.pl
- **Cel**: aplikacja działa pod subdomeną, z kopią zapasową i nocnym zadaniem.
- **Pliki**: `docs/VH-WDROZENIE.md` (instrukcja krok po kroku dla Pawła, wzorowana na instrukcji gabinetu), `scripts/build-package.sh` (paczka `tar.gz`), `docs/KSEF-TOKEN.md` (jak wygenerować token z samym prawem odczytu faktur w Module Certyfikatów i Uprawnień po zalogowaniu Profilem Zaufanym).
- **Kroki**: subdomena + certyfikat SSL; baza PostgreSQL z osobnym użytkownikiem; paczka do `~/mala-ksiegowa-app`; aplikacja Node 24 w cPanelu; zmienne środowiskowe (klucz szyfrowania, dane bazy); migracje; pierwsze konto; zadanie cron raz dziennie; sprawdzenie, że JetBackup obejmuje bazę i katalog aplikacji.
- **Zasada**: wdrożenie wykonuje Paweł według instrukcji albo Claude przez przeglądarkę po wyraźnej zgodzie – nic nie jest wdrażane automatycznie.

## Ryzyka i zabezpieczenia

| Ryzyko | Zabezpieczenie |
|---|---|
| KSeF nie zadziała z tego hostingu lub uwierzytelnianie okaże się trudniejsze | Etap 1 jako próba go/no-go przed resztą; połączenie z serwerem testowym już potwierdzone |
| Błędna kwota ZUS lub PIT | Reguły w osobnym module z testami; weryfikacja na przykładach przez księgową / ręcznie; miesiąc zamykany świadomie |
| Zmiany przepisów co roku | Stawki i progi w pliku ustawień roku |
| Włamanie przez stronę gabinetu na tym samym koncie | Osobna baza i użytkownik; token tylko do odczytu; token zaszyfrowany; logowanie z 2FA |
| Utrata danych | JetBackup na hostingu; obowiązek przechowywania KPiR – sprawdzić, czy kopie obejmują bazę |
| Plik DRA odrzucony przez eZUS | Walidacja względem schematu; test importu jako dokument roboczy |

## Otwarte pytania (do rozstrzygnięcia w trakcie realizacji)

- Dokładna wartość filtra „nabywca” i limity stron w API KSeF (Etap 1).
- Miesiąc dochodu będący podstawą składki zdrowotnej oraz minimum na 2026/2027 (Etap 2).
- Kwoty składek społecznych przy pełnym ZUS na 2026 i 2027, czy Paweł płaci dobrowolne chorobowe (Etap 2 – zapytać Pawła).
- Aktualny wzór kolumn KPiR (Etap 5).
- Aktualny schemat KEDU dla DRA i postać DRA w miesiącu wakacji (Etapy 6–7).
- Nazwa subdomeny (Etap 8 – zapytać Pawła).

## Czego NIE robimy w tym planie

Wszystko z tabeli „Czego NIE robimy” w wymaganiach, oraz: JPK_PKPIR (od 2028), wysyłka czegokolwiek do ZUS lub US bez udziału Pawła, wystawianie faktur w KSeF, aplikacja mobilna, obsługa wielu firm, osobna aplikacja frontendowa (SPA).

## Następny krok

Etap 1 (próba KSeF). Do tego potrzebny jest tylko dostęp do środowiska testowego KSeF – prawdziwy token Pawła nie jest jeszcze potrzebny.
