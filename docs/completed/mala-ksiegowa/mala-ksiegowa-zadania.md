# Mała Księgowa – lista zadań

Ostatnia aktualizacja: 2026-10-29 (wieczór)
Oznaczenia: [ ] do zrobienia, [x] zrobione. **Claude** = zadanie dla Claude, **Paweł** = zadanie dla Pawła.

## Przygotowanie
- [x] Ideacja, wymagania, plan techniczny (Claude)
- [x] Sprawdzenie hostingu w cPanelu (Claude, za zgodą Pawła)
- [x] Dokumentacja wykonawcza w `docs/completed/mala-ksiegowa/` (Claude)

## Etap 1. Próba KSeF (go/no-go)
Stan (2026-10-29 wieczór): próba na testowym KSeF udana – logowanie tokenem, lista faktur kosztowych i pobranie XML działają. Próba z serwera vh.pl też udana. Zostało: decyzja go/no-go Pawła.
- [x] Przeczytać oficjalną dokumentację API KSeF 2.0: logowanie tokenem, pobieranie faktur, limity (Claude)
- [x] Założyć projekt Node + TypeScript bez zależności produkcyjnych: `package.json`, `tsconfig.json`, testy wbudowane w Node (Claude)
- [x] Klient `src/ksef/client.ts`: challenge → szyfrowanie tokenu → ksef-token → status → redeem → refresh, zapytanie o faktury (nabywca), pobranie XML, ponawianie po 429 (Claude)
- [x] Szyfrowanie tokenu `src/ksef/crypto.ts` (RSA-OAEP SHA-256), sprawdzone też poleceniem `openssl` (Claude)
- [x] Skrypt `scripts/ksef-spike.ts` (Claude)
- [x] Testy z udawanym KSeF (10 zielonych): zły token, zły NIP, odświeżenie dostępu, pusta lista, wiele stron, 429, brak logowania (Claude)
- [x] Zdobyć testowy token KSeF: logowanie certyfikatem testowym (XAdES, samopodpisanym) dla wymyślonego NIP-u, potem `POST /tokens` z uprawnieniem `InvoiceRead` (Claude) → `scripts/ksef-test-token.ts`
- [x] Mieć w testowym KSeF co najmniej jedną fakturę zakupową: wystawić z drugiego testowego NIP-u na pierwszy (wymaga sesji z szyfrowaniem i poprawnej faktury FA(3)) albo użyć aplikacji testowej MF (Claude) → `scripts/ksef-test-invoice.ts`
- [x] Uruchomić `scripts/ksef-spike.ts` na testowym KSeF z komputera z siecią i potwierdzić nazwy pól w odpowiedziach (Claude) – WYNIK: OK, typy poprawione (nabywca, isTruncated)
- [x] Uruchomić skrypt na serwerze vh.pl w Terminalu cPanelu (Claude, za zgodą Pawła) – WYNIK: OK (Node 24.12.1), katalog próbny usunięty
- [x] **Punkt kontrolny**: pokazać Pawłowi wynik i decyzję go/no-go – Paweł zdecydował „idziemy dalej”

## Do poprawy po review fazy 1
Raport: `docs/completed/mala-ksiegowa/review-faza-1.md`. Decyzja: można iść dalej z zastrzeżeniami (0×P1, 2×P2, 6×P3). P2 zamknąć przed/w etapie 4.
- [x] P2-1: górny limit czekania po 429; przycisk „sprawdź teraz” bez ponawiania i z blokadą częstych kliknięć; XML trzymany w bazie (Claude, etap 4) → zrobione w etapie 4 (`maxRetryWaitSeconds`, przycisk bez ponawiania, 5 min przerwy)
- [x] P2-2: pobieranie oknami od `permanentStorageHwmDate` z `restrictToPermanentStorageHwmDate`, kontynuacja przy `isTruncated` zamiast błędu, punkt startowy zapisany w bazie (Claude, etap 4) → zrobione w etapie 4 (`queryMetadataWindow`, `settings.ksef_next_from`)
- [x] P3-1: kwoty z KSeF do groszy przez `Math.round` lub z tekstu XML (Claude, etap 4) → zrobione (`decimalToGrosze` z tekstu XML)
- [x] P3-2: test „wygasły refreshToken → ponowne logowanie” (Claude, etap 4) → zrobione
- [x] P3-3: jedna synchronizacja na raz (blokada) (Claude, etap 4) → zrobione (blokada w bazie)
- [x] P3-5: w instrukcji wdrożenia: token tylko w zmiennych środowiskowych / zaszyfrowanej bazie (Claude, etap 8) → `docs/VH-WDROZENIE.md`, `docs/KSEF-TOKEN.md`
- [ ] P3-6: poprawić nieaktualne fragmenty planu i kontekstu (gałąź, „tylko dokumenty”, otwarte pytanie o filtr) (Claude)

## Etap 2. Reguły podatkowe i składkowe
Stan (2026-10-29): moduł reguł gotowy, 28 nowych testów zielonych. Punkt kontrolny zaliczony 2026-10-30.
- [x] Zapytać Pawła: czy płaci dobrowolne chorobowe (Claude → Paweł) – **nie płaci**
- [x] Sprawdzić w oficjalnych źródłach i zapisać w `config/years/2026.json` i `2027.json`: składki społeczne, minimum zdrowotnej, progi i stawki PIT, kwota zmniejszająca (Claude) – 2026 potwierdzone (zus.pl), 2027 częściowo prognoza
- [x] Potwierdzić, od dochodu z którego miesiąca liczy się składka zdrowotna i jak wygląda styczeń (Claude) – z poprzedniego miesiąca; za styczeń od dochodu z grudnia (art. 81 ust. 2c)
- [x] `src/rules/kpir.ts`: sumy miesięczne i narastające (Claude)
- [x] `src/rules/zus.ts`: składki społeczne i zdrowotna (Claude)
- [x] `src/rules/pit.ts`: zaliczka narastająco, 12%/32%, zaokrąglenia (Claude)
- [x] `src/rules/holiday.ts`: jeden miesiąc wakacji w roku (Claude)
- [x] `src/rules/year.ts`: cały rok w jednym wywołaniu (składki płacone w następnym miesiącu, FP jako koszt) (Claude)
- [x] Testy: strata, zero, minimum zdrowotnej, przekroczenie progu, dochód poniżej kwoty wolnej, miesiąc wakacji, drugi miesiąc wakacji odrzucony, korekta wcześniejszego miesiąca (Claude)
- [x] Tabela przykładowych miesięcy: `docs/completed/mala-ksiegowa/przyklad-wyliczen.md` (generuje `node scripts/rules-example.ts`) (Claude)
- [x] **Punkt kontrolny** (2026-10-30: Paweł potwierdził, że wyliczenia są prawidłowe): Paweł lub jego księgowa sprawdza tabelę, zwłaszcza interpretację straty i nadwyżki składek w zdrowotnej (Claude → Paweł)
- [ ] W grudniu 2026: potwierdzić podstawę składek 2027 (komunikat ZUS po budżecie) i skalę PIT 2027 (projekt 130 tys./24%/150 tys. w Sejmie); zmienić `status` w `2027.json` na „potwierdzone” (Claude)
- [x] Etap 5: Fundusz Pracy zapłacony w miesiącu ma się pojawić w KPiR jako koszt automatycznie (moduł reguł już go dolicza; nie wpisywać ręcznie, żeby nie liczyć podwójnie) (Claude) → etap 6: wpis `source = 'fp'` przy zamknięciu, wyłączony z danych dla modułu reguł
- [ ] Etap 6: zapisywać faktyczne daty i kwoty wpłat składek (domyślnie: składki za miesiąc płacone w następnym) (Claude)

## Do poprawy po review fazy 2
Raport: `docs/completed/mala-ksiegowa/review-faza-2.md`. Decyzja: można iść dalej z zastrzeżeniami (0×P1, 2×P2, 6×P3).
- [x] P2-1 (potwierdzone przez Pawła 2026-10-30): potwierdzić z księgową / kalkulatorem ZUS interpretację zdrowotnej po stracie i przy nadwyżce składek (przykład maj–lipiec); w razie różnicy poprawić `healthIncomes` (Paweł + Claude, punkt kontrolny etapu 2)
- [x] P2-2: dopuścić ujemne sumy miesięczne w `summarizeKpir` (faktury korygujące) + test (Claude, najpóźniej etap 4/5) → zrobione w etapie 4
- [ ] P3-3: sprawdzać rosnącą kolejność progów PIT w `validateYearConfig` + test (Claude)
- [ ] P3-4: testy: wakacje w styczniu, ręczne `socialPaid`, kwoty 2027, chorobowe w `computeYear` (Claude)
- [x] P3-5: przy wdrożeniu sprawdzić ścieżkę do `config/years` (Claude, etap 8) → ścieżka liczona względem pliku modułu; sprawdzone na rozpakowanej paczce
- [ ] P3-2: jeśli stopa wypadkowa zmieni się od kwietnia – dodać do pliku ustawień stawkę „od kwietnia” (Claude, w razie potrzeby)

## Etap 3. Szkielet, baza, logowanie
- [x] `server.mjs` i serwer HTTP z szablonami stron (Claude)
- [x] Połączenie z PostgreSQL i system migracji (Claude)
- [x] Tabele: `users`, `settings`, `invoices`, `manual_costs`, `cash_reports`, `kpir_entries`, `months` (Claude)
- [x] Logowanie: hasło (hash) + kod TOTP, sesja w bezpiecznym ciasteczku, limit prób (Claude)
- [x] Skrypt zakładający pierwsze konto (Claude)
- [x] Szyfrowanie tokenu KSeF kluczem ze zmiennej środowiskowej (Claude)
- [x] Testy logowania i dostępu bez sesji (Claude)

## Do poprawy po review fazy 3
- [x] P2-1: blokada logowania i zapis kroku TOTP jednym zapytaniem (odporne na równoległe próby) + test (Claude) → zrobione w etapie 4
- [x] P2-2: zepsute ciasteczko nie może dawać 500 – pomijać je przy odczycie + test (Claude) → zrobione w etapie 4
- [ ] P3-1: ten sam komunikat / blokada także dla nieistniejącego loginu (Claude, opcjonalnie)
- [x] P3-3: przy wdrożeniu sprawdzić, czy Passenger zachowuje nagłówek Host (logowanie bez 403) (Claude, etap 8) – krok 9.3 instrukcji – potwierdzone 2026-10-30: logowanie i zapis Ustawień (token KSeF) działają na produkcji
- [x] P3-4: `pool.on('error')` z logiem w `src/db/pool.ts` (Claude) → zrobione
- [x] P3-5: test aplikacji odmawia pracy na bazie bez „test” w nazwie (Claude) → zrobione (`test/helpers/test-db.ts`)
- [x] P3-6: `/zdrowie` sprawdza połączenie z bazą (Claude, etap 8)

## Etap 4. Faktury, koszty, kasa
Stan (2026-10-30): gotowe. 98 testów zielonych; próba na prawdziwym testowym KSeF udana (faktura pobrana z treścią i pozycjami).
- [x] Odczyt XML faktury FA(3): dostawca, NIP, numer, numer KSeF, data, kwota brutto, pozycje (Claude)
- [x] Zadanie nocne `src/jobs/ksef-sync.ts` + przycisk „sprawdź teraz” (Claude)
- [x] Brak duplikatów (unikalny numer KSeF); oznaczanie korekt (Claude)
- [x] Ekran przeglądu: „koszt firmy” / „nie jest kosztem” (Claude)
- [x] Formularz kosztu spoza KSeF z opcjonalnym PDF (Claude)
- [x] Formularz raportu z kasy z opcjonalnym zdjęciem (Claude)
- [x] Komunikat „ostatnia udana synchronizacja” (Claude)
- [x] Testy: ponowna synchronizacja, korekta, wiele pozycji, awaria KSeF (Claude)

## Do sprawdzenia po etapie 4
- [ ] Gdy treść faktury (XML) dotrze dopiero po decyzji „koszt firmy” i kwota z XML różni się od kwoty z listy KSeF, wpis w księdze się nie zmienia – rzadkie; ewentualnie dodać ostrzeżenie (Claude, etap 5)

## Do poprawy po review fazy 4
Raport: `review-faza-4.md`. Decyzja: można iść dalej z zastrzeżeniami (0×P1, 1×P2, 7×P3).
- [x] P2-1 (Paweł 2026-10-30: do 9. dnia → poprzedni miesiąc, później → bieżący; zrobione w etapie 5): ustalić z księgową, pod jaką datą księgować fakturę kosztową (wystawienia czy otrzymania = nadania numeru KSeF); od tego zależy, co się dzieje z fakturą, która przyjdzie po zamknięciu miesiąca (Paweł + księgowa, przed etapem 6)
- [ ] P3-1: błąd KSeF 21183 (start okna po znaczniku kompletności) traktować jak „brak nowych faktur” (Claude)
- [ ] P3-2: komunikat „wpisz token ponownie” po zmianie klucza szyfrowania; błąd sieci rozpoznawany precyzyjniej (Claude)
- [ ] P3-3: za duży plik – powrót do formularza z wpisanymi danymi (Claude)
- [ ] P3-4: oznaczenie faktur zaliczkowych/rozliczeniowych + zasada księgowania do potwierdzenia z księgową (Claude + Paweł)
- [ ] P3-6: testy: okno 90 dni i wznowienie po 5 oknach, HEIC, limit 8 MB (Claude)
- [x] P3-7: w instrukcji wdrożenia – startujemy z pustą bazą (faktury testowe nie mieszają się z prawdziwymi) (Claude, etap 8)

## Etap 5. Księga KPiR
Stan (2026-10-30): gotowe. 108 testów zielonych; wydruk miesiąca mieści się na 1 stronie A4 poziomo.
- [x] Zasada Pawła: faktura za poprzedni miesiąc otrzymana do 9. dnia → poprzedni miesiąc, później → miesiąc otrzymania (`src/rules/booking.ts`) (Claude)
- [x] Sprawdzić aktualny wzór kolumn KPiR (Claude) → Dz.U. 2025 poz. 1299, 19 kolumn, od 1.01.2026
- [x] Widok miesiąca i roku z numeracją i sumami (Claude)
- [x] Styl do druku / zapis jako PDF (Claude)
- [x] Testy: ciągła numeracja, sumy narastające (Claude)

## Do zrobienia w etapie 6 (z etapu 5)
- [x] Faktura za poprzedni miesiąc, która przyjdzie do 9. dnia, gdy poprzedni miesiąc jest już zamknięty: zaproponować ponowne otwarcie i przeliczenie dochodu i składek (Claude, etap 6)
- [x] Fundusz Pracy jako wpis w kol. 15 księgi (`source = 'fp'`) przy zamknięciu miesiąca (Claude, etap 6)
- [x] Imię i nazwisko (i ewentualnie adres) w ustawieniach – nagłówek księgi i plik DRA (Claude, etap 6)

## Do poprawy po review fazy 5
Raport: `docs/completed/mala-ksiegowa/review-faza-5.md`. Decyzja: można iść dalej z zastrzeżeniami (0×P1, 2×P2, 4×P3).
- [x] P2-1: od 1. do 9. dnia ostrzeżenie o fakturach za poprzedni miesiąc czekających na decyzję; zamknięcie miesiąca blokuje/ostrzega, gdy czekają jego faktury; po zamknięciu wybór „otwórz ponownie i przelicz” (Claude, etap 6)
- [x] P2-2: koszt ręczny – osobne pola „NIP / VAT UE (z kodem kraju)” i „Adres” (adres wymagany bez NIP-u), kol. 5 i 7 w księdze (Claude, etap 6)
- [ ] P3-1: rozważyć zapis liczby porządkowej przy zamknięciu miesiąca, żeby spóźniona faktura nie zmieniała numerów w wydrukowanych miesiącach (Claude, odłożone – kolejność zamykania miesięcy po kolei ogranicza problem do ponownego otwarcia)
- [ ] P3-2: log/ostrzeżenie, gdy KSeF nie poda daty trwałego zapisu (data otrzymania z chwili pobrania) (Claude, opcjonalnie)
- [ ] P3-3: testy: komunikat „Koszt trafi do księgi” (do 9. i po 9.), usunięcie kosztu zaksięgowanego w innym miesiącu, strona roku bez zapisów (Claude)
- [x] P3-4: imię i nazwisko w nagłówku księgi – patrz „Do zrobienia w etapie 6” (Claude, etap 6)

## Etap 6. Zamknięcie miesiąca, ZUS, PIT
Stan (2026-10-30): gotowe poza punktem kontrolnym z Pawłem. 124 testy zielone (81 bez bazy).
- [x] Pobrać aktualny opis struktury KEDU z zus.pl (Claude) → kedu_5_7.xsd + przykładowe DRA.xml + Załącznik 1 (BIP ZUS, EWD 2.27 od 25.04.2026) i poradnik „ZUS DRA. Jak wypełnić” (przykład maj 2026)
- [x] `src/zus/kedu-dra.ts`: plik DRA z NIP i PESEL, walidacja względem schematu (Claude) → test sprawdza kolejność i typy pól przepisane z XSD (`test/helpers/dra-schema.ts`)
- [x] Ekran „zamknij miesiąc”: kwoty do zapłaty (ZUS, PIT), pobranie DRA (Claude)
- [x] Blokada zamkniętego miesiąca i „otwórz ponownie” z ostrzeżeniem (Claude)
- [x] Testy: zwykły miesiąc, minimum zdrowotnej, poprawność XML (Claude); miesiąc wakacji → etap 7 (DRA dla wakacji jeszcze zablokowany)
- [ ] **Punkt kontrolny**: Paweł importuje plik w eZUS jako dokument roboczy (bez podpisywania) i potwierdza brak błędów krytycznych (Paweł) – plik z prawdziwymi danymi powstanie po wdrożeniu (etap 8) albo wcześniej z lokalnie uruchomionej aplikacji
- [x] Decyzja Pawła: start księgi od stycznia 2027 (Paweł, 2026-10-30) → przy zamknięciu stycznia 2027 wpisać dochód z grudnia 2026; w Ustawieniach KSeF data początkowa 2027-01-01
- [ ] Przed pierwszym prawdziwym DRA porównać z ePłatnikiem: czy eZUS przyjmuje plik bez REGON-u i nazwy skróconej (pola opcjonalne w schemacie) (Paweł/Claude)

## Do poprawy po review fazy 6
Raport: `docs/completed/mala-ksiegowa/review-faza-6.md`. Decyzja: można iść dalej z zastrzeżeniami (0×P1, 2×P2, 5×P3).
- [x] P2-1: blokada zamknięcia, gdy ustawienia roku mają status „prognoza” (2027 do potwierdzenia przed zamknięciem stycznia 2027) + test (Claude, przed wdrożeniem)
- [x] P2-2: ekran zamknięcia pokazuje datę ostatniego udanego pobrania z KSeF; przeszkoda/ostrzeżenie, gdy pobieranie nie działa lub jest starsze niż ~2 dni (Claude, przed wdrożeniem) → potwierdzenie „zamykam mimo to” (2026-10-30)
- [x] P3-1: uwaga przy zamykaniu w dniach 1–9: „do 9. mogą jeszcze przyjść faktury za ten miesiąc” (Claude)
- [x] P3-2: `assertMonthOpen` z `FOR SHARE` (zapis czeka na trwające zamknięcie) (Claude, opcjonalnie)
- [x] P3-3: zapytać Pawła, czy w grudniu 2026 bierze wakacje składkowe → nie bierze (Paweł, 2026-10-30)
- [x] P3-4: jedna lista nazw miesięcy (Claude, porządki) → `src/dates.ts`
- [x] P3-5: testy: zamknięcie miesiąca wakacji (etap 7), rok z prognozą, otwarcie grudnia przy zamkniętym styczniu, KSeF, dni 1–9 (Claude)

## Etap 7. Wakacje składkowe
- [x] Potwierdzić postać DRA w miesiącu wakacji (Claude) → instrukcja ZUS: DRA + RCA 05 14 + RCA 05 10 w jednym pliku
- [x] Zaznaczanie miesiąca wakacji w ustawieniach roku (Claude) → Ustawienia → „Wakacje składkowe”
- [x] Przypomnienie w miesiącu poprzedzającym + dane do wniosku RWS (Claude)
- [x] Plik dla eZUS w miesiącu wakacji (DRA + 2×RCA) i testy (Claude)
- [x] Zapytać Pawła o miesiąc wakacji w 2027 (Claude → Paweł) → nie wie; wpisze sam w Ustawieniach, kiedy zdecyduje (2026-10-30)
- [ ] Przy pierwszym miesiącu wakacji: import pliku z trzema dokumentami w eZUS jako roboczych, bez błędów krytycznych (Paweł)

## Do poprawy po review fazy 7
Raport: `docs/completed/mala-ksiegowa/review-faza-7.md`. Decyzja: gotowe do dalszej pracy (0×P1, 1×P2 poprawione, 5×P3).
- [x] P2-1: wakacje do wpisania w każdej chwili (po terminie RWS tylko ostrzeżenie), także na poprzedni rok + test (Claude, 2026-10-30)
- [ ] P3-1: import pliku miesiąca wakacji (DRA + 2×RCA) w eZUS przy pierwszych wakacjach (Paweł) – ten sam punkt co w etapie 7
- [x] P3-2: `closeMonth` czyta wiersz `years` z `FOR SHARE` (zamknięcie nie minie się ze zmianą wakacji) (Claude, opcjonalnie)
- [x] P3-3: nazwa pliku `ZUS-RRRR-MM.xml` zamiast `DRA-…` (Claude, kosmetyka)
- [ ] P3-4: Paweł pamięta o RWS sam, gdy nie zagląda do aplikacji w miesiącu przed wakacjami (bez powiadomień – świadomie)
- [x] P3-5: łamanie „Rok 2026” na telefonie; test przypomnienia bez pliku ustawień roku (Claude)

## Etap 8. Wdrożenie na vh.pl
- [x] Zapytać Pawła o nazwę subdomeny – zatwierdzona `ksiegowa.za-horyzont.pl` (2026-10-30)
- [x] `docs/KSEF-TOKEN.md`: jak wygenerować token tylko do odczytu po zalogowaniu Profilem Zaufanym (Claude) – **token trzeba wygenerować do 31.12.2026** (Aplikacja Podatnika generuje tokeny do końca 2026; token ważny do unieważnienia)
- [x] `docs/VH-WDROZENIE.md`: instrukcja krok po kroku na wzór instrukcji gabinetu (Claude) – przećwiczona lokalnie na rozpakowanej paczce (npm ci, .env, migracje, /zdrowie, cron)
- [x] `scripts/build-package.sh`: paczka `tar.gz` (Claude) – `npm run package`
- [x] Subdomena + SSL (AutoSSL), baza `vh20129_ksiegowa`, użytkownik `vh20129_ksiegowa_app` (Claude za zgodą Pawła + skrypt setup-vh, 2026-10-30)
- [x] Kod przez cPanel Git (gałąź `claude/project-thread-eptw6o`), aplikacja Node 24.22.1 Production, `.env`, migracje, konto `pawel` (2026-10-30; `/zdrowie` = ok, strona logowania działa)
- [x] Pierwsze logowanie na produkcji i zapis tokenu KSeF w Ustawieniach (2026-10-30); login zmieniany na `marta` poleceniem w Terminalu (podane Pawłowi 2026-10-30; aplikacji używa żona Pawła)
- [ ] Uzupełnić w Ustawieniach dane płatnika do DRA (PESEL, imię, nazwisko), jeśli jeszcze nie są wpisane – aplikacja i tak nie pozwoli zamknąć miesiąca bez nich (Marta/Paweł)
- [x] Wygenerowanie prawdziwego tokenu KSeF i wpisanie go w aplikacji (Paweł, 2026-10-30)
- [x] Zadanie cron codziennie 6:15 (`ksef-sync.ts`, log w `~/mala-ksiegowa-logs/ksef-sync.log`; do czasu tokenu loguje „pominięto”)
- [x] JetBackup 5: codzienne kopie baz PostgreSQL (15 kopii) i katalogu domowego – nowa baza wejdzie do kopii od najbliższej nocy
- [ ] Pierwsze zamknięcie prawdziwego miesiąca razem z Pawłem (Paweł)
- [ ] Ryzyko po 2026: gdyby token przestał działać (unieważnienie, wyciek), nowego może nie dać się wygenerować – wtedy uwierzytelnianie certyfikatem KSeF (XAdES, mamy próbę z etapu 1) (Claude, w razie potrzeby)
