# Mała Księgowa – lista zadań

Ostatnia aktualizacja: 2026-10-29
Oznaczenia: [ ] do zrobienia, [x] zrobione. **Claude** = zadanie dla Claude, **Paweł** = zadanie dla Pawła.

## Przygotowanie
- [x] Ideacja, wymagania, plan techniczny (Claude)
- [x] Sprawdzenie hostingu w cPanelu (Claude, za zgodą Pawła)
- [x] Dokumentacja wykonawcza w `docs/active/mala-ksiegowa/` (Claude)

## Etap 1. Próba KSeF (go/no-go)
Stan: kod i testy bez sieci gotowe; próba na prawdziwym testowym KSeF czeka na środowisko z dostępem do sieci.
- [x] Przeczytać oficjalną dokumentację API KSeF 2.0: logowanie tokenem, pobieranie faktur, limity (Claude)
- [x] Założyć projekt Node + TypeScript bez zależności produkcyjnych: `package.json`, `tsconfig.json`, testy wbudowane w Node (Claude)
- [x] Klient `src/ksef/client.ts`: challenge → szyfrowanie tokenu → ksef-token → status → redeem → refresh, zapytanie o faktury (nabywca), pobranie XML, ponawianie po 429 (Claude)
- [x] Szyfrowanie tokenu `src/ksef/crypto.ts` (RSA-OAEP SHA-256), sprawdzone też poleceniem `openssl` (Claude)
- [x] Skrypt `scripts/ksef-spike.ts` (Claude)
- [x] Testy z udawanym KSeF (10 zielonych): zły token, zły NIP, odświeżenie dostępu, pusta lista, wiele stron, 429, brak logowania (Claude)
- [ ] Zdobyć testowy token KSeF: logowanie certyfikatem testowym (XAdES, samopodpisanym) dla wymyślonego NIP-u, potem `POST /tokens` z uprawnieniem `InvoiceRead` (Claude, wymaga sieci do `api-test.ksef.mf.gov.pl`)
- [ ] Mieć w testowym KSeF co najmniej jedną fakturę zakupową: wystawić z drugiego testowego NIP-u na pierwszy (wymaga sesji z szyfrowaniem i poprawnej faktury FA(3)) albo użyć aplikacji testowej MF (Claude)
- [ ] Uruchomić `scripts/ksef-spike.ts` na testowym KSeF z komputera z siecią i potwierdzić nazwy pól w odpowiedziach (Claude)
- [ ] Uruchomić skrypt na serwerze vh.pl w Terminalu cPanelu (Claude, za zgodą Pawła)
- [ ] **Punkt kontrolny**: pokazać Pawłowi wynik i decyzję go/no-go (Claude → Paweł)

## Etap 2. Reguły podatkowe i składkowe
- [ ] Zapytać Pawła: czy płaci dobrowolne chorobowe (Claude → Paweł)
- [ ] Sprawdzić w oficjalnych źródłach i zapisać w `config/years/2026.json` i `2027.json`: składki społeczne, minimum zdrowotnej, progi i stawki PIT, kwota zmniejszająca (Claude)
- [ ] Potwierdzić, od dochodu z którego miesiąca liczy się składka zdrowotna i jak wygląda styczeń (Claude)
- [ ] `src/rules/kpir.ts`: sumy miesięczne i narastające (Claude)
- [ ] `src/rules/zus.ts`: składki społeczne i zdrowotna (Claude)
- [ ] `src/rules/pit.ts`: zaliczka narastająco, 12%/32%, zaokrąglenia (Claude)
- [ ] `src/rules/holiday.ts`: jeden miesiąc wakacji w roku (Claude)
- [ ] Testy: strata, zero, minimum zdrowotnej, przekroczenie progu, dochód poniżej kwoty wolnej, miesiąc wakacji, drugi miesiąc wakacji odrzucony, korekta wcześniejszego miesiąca (Claude)
- [ ] **Punkt kontrolny**: tabela z 2–3 przykładowymi miesiącami do sprawdzenia przez Pawła lub jego księgową (Claude → Paweł)

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
