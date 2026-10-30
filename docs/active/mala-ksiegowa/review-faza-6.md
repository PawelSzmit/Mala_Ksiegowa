# Review etapu 6 – zamknięcie miesiąca, ZUS, PIT

Data: 2026-10-30 · Gałąź: `claude/project-thread-eptw6o` (etap 6 wypchnięty w `50bc22e`, drzewo czyste)
Decyzja: **można iść dalej z zastrzeżeniami** – 0×P1, 2×P2, 5×P3.

## Ustalenia

### P2-1. Miesiąc da się zamknąć na prognozowanych stawkach – plik DRA miałby złe kwoty
`src/month/close.ts` (`previewMonth`): gdy plik ustawień roku ma `status: "prognoza"`, aplikacja tylko dopisuje uwagę, a przycisk „Zamknij miesiąc” działa. `config/years/2027.json` jest dziś prognozą: podstawa składek 6019,80 zł z projektu budżetu i skala PIT z 2026 r.

- **Przykład:** Paweł zaczyna od stycznia 2027 i zamyka styczeń na początku lutego.
- Jeśli do tego czasu nikt nie potwierdzi kwot na 2027 (komunikat ZUS wychodzi zwykle w styczniu/lutym), DRA i przelew będą liczone od prognozy.
- Uwaga łatwo ginie wśród innych komunikatów.

**Do zrobienia:** przy statusie „prognoza” zablokować zamknięcie z jasnym komunikatem („stawki na 2027 nie są jeszcze potwierdzone – trzeba je zaktualizować”). Do tego przypomnienie w zadaniach: potwierdzić 2027 w grudniu 2026 / styczniu 2027 (punkt istnieje w kontekście, warto go powiązać z blokadą).

### P2-2. Zamknięcie nie sprawdza, czy faktury z KSeF są świeże
Ekran zamknięcia (`src/views/month-close.ts`) nie pokazuje stanu pobierania z KSeF, a `previewMonth` go nie sprawdza.

- **Przykład:** token wygasł albo KSeF zwraca błąd od tygodnia. Paweł zamyka miesiąc bez części kosztów, czyli płaci za wysoki PIT i składkę zdrowotną następnego miesiąca.
- Da się to potem naprawić ponownym otwarciem, ale nic go nie ostrzega.

**Do zrobienia:** na ekranie zamknięcia pokazać datę ostatniego udanego pobrania. Gdy jest starsza niż ok. 2 dni, gdy ostatnia próba skończyła się błędem albo gdy KSeF nie jest skonfigurowany, pokazać wyraźną przeszkodę (albo ostrzeżenie z potwierdzeniem).

### P3
1. **Zamykanie przed 10. dniem bez ostrzeżenia.** Zamknięcie października 5 listopada jest dozwolone. Faktura za październik, która przyjdzie 6–9 listopada, wymaga wtedy ponownego otwarcia, a ZUS (płacony 10.) mógł być już policzony bez niej. Karta faktury dobrze to obsługuje (link do otwarcia), ale warto przy zamknięciu w dniach 1–9 dodać uwagę: „do 9. mogą jeszcze przyjść faktury za ten miesiąc”.
2. **Wyścig zamknięcia z dopisaniem kosztu.** `closeMonth` blokuje tylko wiersz miesiąca. Koszt dopisywany w tej samej chwili sprawdza `assertMonthOpen` bez blokady, więc teoretycznie może wejść do księgi po wyliczeniu, a przed zamknięciem. Przy jednym użytkowniku ryzyko jest znikome; poprawka to `SELECT … FOR SHARE` na wierszu `months` w `assertMonthOpen` (wtedy zapis czeka na zamknięcie i dostaje 409).
3. **Wakacje w grudniu 2026.** Gdyby Paweł wziął wakacje składkowe w grudniu 2026, styczeń 2027 odliczyłby składki, których nie zapłacił (`previousDecemberHoliday` czytane z tabeli `years`, a roku 2026 w aplikacji nie będzie). Do potwierdzenia w etapie 7 razem z miesiącem wakacji.
4. **Trzy kopie nazw miesięcy** (`src/views/pages.ts` `MONTH_NAMES`, `src/views/invoices.ts` `MONTHS`, `src/month/close.ts`). Drobiazg porządkowy – jedna lista w `src/dates.ts`.
5. **Brakujące testy:** zamknięcie miesiąca wakacji (DRA zablokowany, kwoty bez społecznych), rok z prognozą (po poprawce P2-1), grudzień → otwarcie przy zamkniętym styczniu kolejnego roku.

## Zgodność z planem
- Wszystkie punkty etapu 6 z planu są zrobione:
  - kwoty ZUS i PIT po kliknięciu „zamknij miesiąc”;
  - plik DRA (KEDU) z NIP i PESEL;
  - blokada miesiąca;
  - „otwórz ponownie” z ostrzeżeniem.
- Zamknięte są też punkty z review etapu 5: ostrzeżenie o fakturach do 9. dnia, zamknięty miesiąc na karcie faktury, NIP/adres kosztu spoza KSeF, Fundusz Pracy w kol. 15, dane płatnika.
- Plan mówił o „walidacji względem schematu”. Pełnego walidatora XSD nie ma bez dodatkowych bibliotek, więc test sprawdza kolejność i typy pól przepisane z `kedu_5_7.xsd` (`test/helpers/dra-schema.ts`). Rozsądne, ale ostatecznym sprawdzianem pozostaje import w eZUS (punkt kontrolny po wdrożeniu).
- DRA dla miesiąca wakacji jest świadomie zablokowany do etapu 7.

## Co sprawdziłem i co jest dobrze
- **Plik DRA:**
  - pola i źródła finansowania zgodne z poradnikiem ZUS dla osoby płacącej tylko za siebie (skala), kwoty co do grosza z przykładem za maj 2026;
  - wykryta pomyłka w sumie poradnika (1 gr) – kod liczy z pól;
  - PESEL sprawdzany sumą kontrolną, data urodzenia z PESEL-u;
  - XML escapowany (test ze znakami `&`, `<`, cudzysłowami);
  - nagłówek i cechy dokumentu niewypełniane, zgodnie z opisem ZUS.
- **Poprawność kwot:**
  - Fundusz Pracy wpisany do księgi jest wyłączony z danych dla modułu reguł (`source <> 'fp'`), więc nie liczy się podwójnie (test: po ponownym zamknięciu nadal jeden wpis FP na miesiąc);
  - podstawa zdrowotnej w XI p3/X p5 przy minimum to płaca minimalna (4806 zł), jak w poradniku.
- **Kolejność i spójność:**
  - miesiące roku zamyka się po kolei, a ponownie otwiera od końca (testy);
  - zapis w transakcji z blokadą wiersza miesiąca;
  - poprzednie wyliczenie zostaje do porównania;
  - zapytania przy zamykaniu idą po kolei (bez ostrzeżenia biblioteki `pg` o równoległych zapytaniach na jednym połączeniu).
- **Bezpieczeństwo:**
  - nowe strony za logowaniem;
  - formularze POST chronione sprawdzaniem Origin;
  - otwarcie wymaga zaznaczenia potwierdzenia;
  - DRA tylko dla zamkniętego miesiąca, bez skutków ubocznych;
  - dane płatnika i PESEL walidowane przy zapisie;
  - pobieranie pliku z `Content-Disposition: attachment`.
- **Zasada 9. dnia w praktyce:** ostrzeżenie na stronie bieżącego miesiąca (1.–9. dnia), przeszkoda przy zamykaniu, a na karcie faktury za zamknięty miesiąc link do otwarcia (testy).
- **Testy:** 124/124 z bazą, 81 bez bazy, typecheck czysty (uruchomione ponownie przy review). Ekrany obejrzane w przeglądarce (szerokość telefonu).

## Wydajność
- Podgląd zamknięcia to 7 prostych zapytań po kolei plus obliczenie roku w pamięci (≤12 miesięcy).
- `pendingInvoicesFor` czyta wszystkie faktury czekające na decyzję – zwykle kilka sztuk.
- Bez znaczenia przy tej skali.
