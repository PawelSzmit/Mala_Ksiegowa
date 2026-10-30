# Review etapu 5 – księga KPiR

Data: 2026-10-30 · Gałąź: `claude/project-thread-eptw6o` (etap 5 wypchnięty w `b14ead7`, drzewo czyste)
Decyzja: **można iść dalej z zastrzeżeniami** – 0×P1, 2×P2, 4×P3.

## Ustalenia

### P2-1. Faktura za poprzedni miesiąc, o której Paweł zdecyduje po 10., zmienia miesiąc już rozliczony
Zasada 9. dnia liczy się od dnia **otrzymania** faktury (nadanie numeru KSeF), a nie od dnia, w którym Paweł kliknie „Koszt firmy”. Tak ma być, bo to jest dzień zgodny z przepisami i z ustaleniem Pawła. Aplikacja jednak nigdzie nie przypomina, że takie faktury trzeba rozstrzygnąć przed 10.

- **Przykład:** faktura z 28.10 dotarła do KSeF 3.11. Paweł otwiera aplikację dopiero 15.11, a ZUS za październik zapłacił już 10.11. Po kliknięciu „Koszt firmy” koszt trafia do października (`src/routes/invoices.ts`, `costBookingDate`). Zmienia się dochód października i składka zdrowotna, choć przelew już poszedł.
- **Dziś** skończy się to tylko inną kwotą w księdze, bo zamykania miesiąca jeszcze nie ma. **Po etapie 6** zapis odbije się od zamkniętego października (409), a Paweł nie będzie wiedział, co dalej.
- **Do zrobienia (etap 6):**
  - od 1. do 9. dnia na stronie miesiąca i na liście faktur pokazywać ostrzeżenie: „N faktur za poprzedni miesiąc czeka na decyzję – rozstrzygnij przed zapłatą ZUS 10.”;
  - przy zamykaniu miesiąca blokować albo ostrzegać, gdy czekają faktury, które do niego należą;
  - po 9. dniu, jeśli miesiąc jest już zamknięty, dać wybór: „otwórz ponownie i przelicz” albo (gdy Paweł tak zdecyduje) księgować w bieżącym miesiącu.

### P2-2. Koszty spoza KSeF nie mają osobno NIP-u sprzedawcy ani adresu (kol. 5 i 7)
Wzór od 2026 r. wymaga dla kontrahenta identyfikatora podatkowego (kol. 5) **albo** nazwy i adresu (kol. 6–7). Dziś:

- formularz kosztu ma jedno pole „Sprzedawca (nazwa i ewentualnie NIP)”, które w całości trafia do kol. 6 (`src/views/forms.ts`, `src/routes/costs.ts`);
- kol. 5 dla kosztów ręcznych jest zawsze pusta, a kol. 7 (adres) pusta dla wszystkich wpisów (`src/views/book.ts`, funkcja `row`).

Przykład: faktura od zagranicznej firmy (np. abonament z Irlandii) albo rachunek od osoby bez NIP-u daje wpis z samą nazwą, bez identyfikatora i adresu. Przy kontroli taki wpis jest niepełny.

**Do zrobienia:** w formularzu kosztu dodać osobne pola „NIP / numer VAT UE (z kodem kraju)” i „Adres”. Wymagać adresu, gdy NIP jest pusty. Zapisywać je w `counterparty_tax_id` i nowej kolumnie `counterparty_address`. To samo dotyczy rzadkiej faktury z KSeF bez NIP-u sprzedawcy.

### P3
1. **Spóźniona faktura przenumerowuje późniejsze wpisy.** Faktura zaksięgowana wstecz pod datą wystawienia (np. 30.10, dopisana 5.11) dostaje miejsce w październiku, a liczba porządkowa wszystkich późniejszych wpisów rośnie o jeden (`src/rules/kpir-book.ts`, `compareEntries` + `buildBook`). Wcześniej wydrukowany PDF ma wtedy inne numery niż księga. Księga jest prowadzona elektronicznie, więc to nie błąd, ale warto przed etapem 6 rozważyć „zamrożenie” numeracji przy zamknięciu miesiąca (zapis `lp` w bazie).
2. **Data otrzymania zapasowo z chwili pobrania.** Gdy KSeF nie poda daty trwałego zapisu, aplikacja bierze `created_at`, czyli moment pobrania (`src/routes/invoices.ts`, `COLUMNS`). Przy pierwszym pobraniu historii faktura z 3.11 pobrana 20.11 trafiłaby do listopada zamiast października. KSeF według dokumentacji zawsze podaje tę datę, więc ryzyko jest małe. Warto zapisać w `parse_error`/logu, gdy jej brak.
3. **Brakujące testy:**
   - karta faktury z komunikatem „Koszt trafi do księgi: …” w obu wariantach (do 9. i po 9.);
   - usunięcie kosztu ręcznego zaksięgowanego w innym miesiącu niż data wystawienia (przekierowanie do właściwego miesiąca);
   - strona roku dla lat bez zapisów (np. 2027 w 2026).
4. **Nagłówek księgi bez imienia i nazwiska.** Kolumny `first_name`/`last_name` istnieją, ale nie ma ich gdzie wpisać, więc w nagłówku jest tylko NIP. Już zapisane na etap 6 w zadaniach.

## Zgodność z planem
- Wszystkie punkty etapu 5 z zadań są zrobione: zasada 9. dnia, wzór z Dz.U. 2025 poz. 1299, widok miesiąca i roku, druk/PDF, testy numeracji i sum.
- Świadome przesunięcie: **Fundusz Pracy jako wpis w kol. 15** (w planie przy etapie 5, punkt z review fazy 1) przeniesiony na etap 6, bo wpis powstaje przy zamknięciu miesiąca. Moduł reguł nadal dolicza FP do kosztów, więc wyliczenia są poprawne, a w księdze go jeszcze nie widać. Zapisane w zadaniach.

## Co sprawdziłem i co jest dobrze
- **Zasada 9. dnia** (`src/rules/booking.ts`): krótka i czytelna; testy obejmują dzień 9 i 10, fakturę sprzed dwóch miesięcy i przełom roku (grudzień → styczeń). Działa tak samo dla faktur z KSeF i kosztów ręcznych; data otrzymania wcześniejsza niż wystawienia jest odrzucana (test).
- **Księga zgodna ze wzorem:** 19 kolumn z numerami, numeracja ciągła w roku po dacie, sumy kol. 9–16 po miesiącu, sumy od początku roku i do poprzedniego miesiąca (objaśnienia pkt 2 i 19). Raport z kasy bez kol. 3–7, jak każą objaśnienia. Korekty zmniejszają sumy (test).
- **Bezpieczeństwo:** `/ksiega` jest za logowaniem (bramka przed wszystkimi trasami w `src/app.ts`); dane z faktur (nazwy sprzedawców, uwagi) przechodzą przez escapowanie szablonu; jedyny skrypt to osobny plik `/static/app.js`, więc zakaz skryptów w treści strony (CSP) zostaje w mocy; zapytania z parametrami; rok i miesiąc z adresu sprawdzane (404 poza zakresem).
- **Spójność danych:** zapis wpisu i decyzji w jednej transakcji, sprawdzanie otwartego miesiąca liczone od miesiąca **wpisu**, a nie wystawienia; usuwanie kosztu wraca do miesiąca, w którym wpis faktycznie był.
- **Testy:** 108/108 z bazą, 73 bez bazy, typecheck czysty (uruchomione ponownie przy review).

## Wydajność
Strona roku pobiera wszystkie wpisy roku jednym zapytaniem i układa je w pamięci (12 przejść po liście). Przy kilkudziesięciu–kilkuset wpisach rocznie to ułamek milisekundy. Indeks `(year, month)` na `kpir_entries` nie jest potrzebny przy tej skali.
