# Mała Księgowa – lista zadań

Ostatnia aktualizacja: 2026-10-29 (wieczór)
Oznaczenia: [ ] do zrobienia, [x] zrobione. **Claude** = zadanie dla Claude, **Paweł** = zadanie dla Pawła.

## Przygotowanie
- [x] Ideacja, wymagania, plan techniczny (Claude)
- [x] Sprawdzenie hostingu w cPanelu (Claude, za zgodą Pawła)
- [x] Dokumentacja wykonawcza w `docs/active/mala-ksiegowa/` (Claude)

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
- [ ] **Punkt kontrolny**: pokazać Pawłowi wynik i decyzję go/no-go (Claude → Paweł)

## Do poprawy po review fazy 1
Raport: `docs/active/mala-ksiegowa/review-faza-1.md`. Decyzja: można iść dalej z zastrzeżeniami (0×P1, 2×P2, 6×P3). P2 zamknąć przed/w etapie 4.
- [ ] P2-1: górny limit czekania po 429; przycisk „sprawdź teraz” bez ponawiania i z blokadą częstych kliknięć; XML trzymany w bazie (Claude, etap 4)
- [ ] P2-2: pobieranie oknami od `permanentStorageHwmDate` z `restrictToPermanentStorageHwmDate`, kontynuacja przy `isTruncated` zamiast błędu, punkt startowy zapisany w bazie (Claude, etap 4)
- [ ] P3-1: kwoty z KSeF do groszy przez `Math.round` lub z tekstu XML (Claude, etap 4)
- [ ] P3-2: test „wygasły refreshToken → ponowne logowanie” (Claude, etap 4)
- [ ] P3-3: jedna synchronizacja na raz (blokada) (Claude, etap 4)
- [ ] P3-5: w instrukcji wdrożenia: token tylko w zmiennych środowiskowych / zaszyfrowanej bazie (Claude, etap 8)
- [ ] P3-6: poprawić nieaktualne fragmenty planu i kontekstu (gałąź, „tylko dokumenty”, otwarte pytanie o filtr) (Claude)

## Etap 2. Reguły podatkowe i składkowe
Stan (2026-10-29): moduł reguł gotowy, 28 nowych testów zielonych. Czeka na punkt kontrolny z Pawłem/księgową.
- [x] Zapytać Pawła: czy płaci dobrowolne chorobowe (Claude → Paweł) – **nie płaci**
- [x] Sprawdzić w oficjalnych źródłach i zapisać w `config/years/2026.json` i `2027.json`: składki społeczne, minimum zdrowotnej, progi i stawki PIT, kwota zmniejszająca (Claude) – 2026 potwierdzone (zus.pl), 2027 częściowo prognoza
- [x] Potwierdzić, od dochodu z którego miesiąca liczy się składka zdrowotna i jak wygląda styczeń (Claude) – z poprzedniego miesiąca; za styczeń od dochodu z grudnia (art. 81 ust. 2c)
- [x] `src/rules/kpir.ts`: sumy miesięczne i narastające (Claude)
- [x] `src/rules/zus.ts`: składki społeczne i zdrowotna (Claude)
- [x] `src/rules/pit.ts`: zaliczka narastająco, 12%/32%, zaokrąglenia (Claude)
- [x] `src/rules/holiday.ts`: jeden miesiąc wakacji w roku (Claude)
- [x] `src/rules/year.ts`: cały rok w jednym wywołaniu (składki płacone w następnym miesiącu, FP jako koszt) (Claude)
- [x] Testy: strata, zero, minimum zdrowotnej, przekroczenie progu, dochód poniżej kwoty wolnej, miesiąc wakacji, drugi miesiąc wakacji odrzucony, korekta wcześniejszego miesiąca (Claude)
- [x] Tabela przykładowych miesięcy: `docs/active/mala-ksiegowa/przyklad-wyliczen.md` (generuje `node scripts/rules-example.ts`) (Claude)
- [ ] **Punkt kontrolny**: Paweł lub jego księgowa sprawdza tabelę, zwłaszcza interpretację straty i nadwyżki składek w zdrowotnej (Claude → Paweł)
- [ ] W grudniu 2026: potwierdzić podstawę składek 2027 (komunikat ZUS po budżecie) i skalę PIT 2027 (projekt 130 tys./24%/150 tys. w Sejmie); zmienić `status` w `2027.json` na „potwierdzone” (Claude)
- [ ] Etap 5: Fundusz Pracy zapłacony w miesiącu ma się pojawić w KPiR jako koszt automatycznie (moduł reguł już go dolicza; nie wpisywać ręcznie, żeby nie liczyć podwójnie) (Claude)
- [ ] Etap 6: zapisywać faktyczne daty i kwoty wpłat składek (domyślnie: składki za miesiąc płacone w następnym) (Claude)

## Etap 3. Szkielet, baza, logowanie
- [ ] `server.mjs` i serwer HTTP z szablonami stron (Claude)
- [ ] Połączenie z PostgreSQL i system migracji (Claude)
- [ ] Tabele: `users`, `settings`, `invoices`, `manual_costs`, `cash_reports`, `kpir_entries`, `months` (Claude)
- [ ] Logowanie: hasło (hash) + kod TOTP, sesja w bezpiecznym ciasteczku, limit prób (Claude)
- [ ] Skrypt zakładający pierwsze konto (Claude)
- [ ] Szyfrowanie tokenu KSeF kluczem ze zmiennej środowiskowej (Claude)
- [ ] Testy logowania i dostępu bez sesji (Claude)

## Etap 4. Faktury, koszty, kasa
- [ ] Odczyt XML faktury FA(3): dostawca, NIP, numer, numer KSeF, data, kwota brutto, pozycje (Claude)
- [ ] Zadanie nocne `src/jobs/ksef-sync.ts` + przycisk „sprawdź teraz” (Claude)
- [ ] Brak duplikatów (unikalny numer KSeF); oznaczanie korekt (Claude)
- [ ] Ekran przeglądu: „koszt firmy” / „nie jest kosztem” (Claude)
- [ ] Formularz kosztu spoza KSeF z opcjonalnym PDF (Claude)
- [ ] Formularz raportu z kasy z opcjonalnym zdjęciem (Claude)
- [ ] Komunikat „ostatnia udana synchronizacja” (Claude)
- [ ] Testy: ponowna synchronizacja, korekta, wiele pozycji, awaria KSeF (Claude)

## Etap 5. Księga KPiR
- [ ] Sprawdzić aktualny wzór kolumn KPiR (Claude)
- [ ] Widok miesiąca i roku z numeracją i sumami (Claude)
- [ ] Styl do druku / zapis jako PDF (Claude)
- [ ] Testy: ciągła numeracja, sumy narastające (Claude)

## Etap 6. Zamknięcie miesiąca, ZUS, PIT
- [ ] Pobrać aktualny opis struktury KEDU z zus.pl (Claude)
- [ ] `src/zus/kedu-dra.ts`: plik DRA z NIP i PESEL, walidacja względem schematu (Claude)
- [ ] Ekran „zamknij miesiąc”: kwoty do zapłaty (ZUS, PIT), pobranie DRA (Claude)
- [ ] Blokada zamkniętego miesiąca i „otwórz ponownie” z ostrzeżeniem (Claude)
- [ ] Testy: zwykły miesiąc, minimum zdrowotnej, miesiąc wakacji, poprawność XML (Claude)
- [ ] **Punkt kontrolny**: Paweł importuje plik w eZUS jako dokument roboczy (bez podpisywania) i potwierdza brak błędów krytycznych (Paweł)

## Etap 7. Wakacje składkowe
- [ ] Potwierdzić postać DRA w miesiącu wakacji (Claude)
- [ ] Zaznaczanie miesiąca wakacji w ustawieniach roku (Claude)
- [ ] Przypomnienie w miesiącu poprzedzającym + dane do wniosku RWS (Claude)
- [ ] Zapytać Pawła o miesiąc wakacji w 2027 (Claude → Paweł)

## Etap 8. Wdrożenie na vh.pl
- [ ] Zapytać Pawła o nazwę subdomeny (Claude → Paweł)
- [ ] `docs/KSEF-TOKEN.md`: jak wygenerować token tylko do odczytu po zalogowaniu Profilem Zaufanym (Claude)
- [ ] `docs/VH-WDROZENIE.md`: instrukcja krok po kroku na wzór instrukcji gabinetu (Claude)
- [ ] `scripts/build-package.sh`: paczka `tar.gz` (Claude)
- [ ] Subdomena + SSL, baza PostgreSQL z osobnym użytkownikiem (Paweł lub Claude za zgodą)
- [ ] Wgranie paczki, aplikacja Node 24 w cPanelu, zmienne środowiskowe, migracje, pierwsze konto (Paweł lub Claude za zgodą)
- [ ] Wygenerowanie prawdziwego tokenu KSeF i wpisanie go w aplikacji (Paweł)
- [ ] Zadanie cron raz dziennie (Paweł lub Claude za zgodą)
- [ ] Sprawdzić, że JetBackup obejmuje bazę i katalog aplikacji (Claude)
- [ ] Pierwsze zamknięcie prawdziwego miesiąca razem z Pawłem (Paweł)
