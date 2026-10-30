# Review – Etap 2: Reguły podatkowe i składkowe

Data: 2026-10-30
Gałąź: `claude/project-thread-eptw6o` (commit „Etap 2: reguły podatkowe i składkowe…”)
Stan repozytorium w chwili review: czyste; `npm test` 39/39 (28 testów reguł), `npm run typecheck` bez błędów.

## Decyzja

**Można iść dalej, z zastrzeżeniami.** Brak P1. Dwa P2: jedno wymaga potwierdzenia przez księgową (i tak jest punktem kontrolnym etapu), drugie to mała poprawka, którą trzeba zrobić najpóźniej w etapie 4/5 (zanim do księgi trafią faktury korygujące).

| Waga | Liczba |
|---|---|
| P1 (blokujące) | 0 |
| P2 (ważne) | 2 |
| P3 (drobne) | 6 |

## Ustalenia

### P2-1. Interpretacja dochodu do składki zdrowotnej nie jest potwierdzona
- Gdzie: `src/rules/zus.ts` (`healthIncomes`), opis w komentarzu funkcji i w kontekście.
- Co przyjęto: (a) dochód miesiąca nie bywa ujemny, a strata obniża dochód kolejnych miesięcy, (b) składki większe niż dochód przechodzą na kolejne miesiące, (c) „dochody za poprzednie miesiące” odejmujemy w wersji przed odliczeniem składek – czyli świadomie odchodzimy od dosłownego brzmienia art. 81 ust. 2c pkt 4, które dawałoby absurdalny wynik.
- Dlaczego ważne: od tego zależy kwota zdrowotnej po słabszym miesiącu (w przykładzie: czerwiec 432,54 zł zamiast ok. 784 zł, lipiec 533,11 zł). Różnice wyrównuje roczne rozliczenie zdrowotnej, ale miesięczne DRA mogą być inne niż u księgowej.
- Do zrobienia: potwierdzić na punkcie kontrolnym (księgowa / kalkulator składki zdrowotnej na zus.pl) na przykładzie maj–lipiec z `przyklad-wyliczen.md`. Jeśli wynik inny – zmienić tylko `healthIncomes` i oczekiwania w 2 testach.

### P2-2. Ujemne koszty w miesiącu zatrzymają wyliczenie
- Gdzie: `src/rules/kpir.ts:21-23`.
- `summarizeKpir` odrzuca ujemne koszty (i przychód). Faktura korygująca „na minus” (zwrot towaru, rabat) w miesiącu bez innych kosztów da ujemną sumę kosztów – wtedy zamknięcie miesiąca się wywróci z błędem.
- Do zrobienia (etap 4/5, przy obsłudze korekt): dopuścić ujemne sumy miesięczne (nadal wymagać liczb całkowitych), dodać test „korekta większa niż koszty miesiąca”. Funkcje zdrowotnej i PIT już radzą sobie z ujemnym wynikiem miesiąca.

### P3-1. Ustawienia 2027 to prognoza
- `config/years/2027.json` – podstawa składek (6019,80 zł) i skala PIT do potwierdzenia w grudniu 2026. Obsłużone świadomie: `status: "prognoza"`, ostrzeżenie w `computeYear`, zadanie w liście. Bez zmian w kodzie – tylko pilnować terminu.

### P3-2. Stopa wypadkowa może się zmienić od kwietnia
- Stopa 1,67% obowiązuje okresami kwiecień–marzec, a w pliku jest jedna na cały rok kalendarzowy. Dla płatników do 9 osób stopa wynika z rozporządzenia i od lat jest ta sama, więc ryzyko małe. Jeśli się zmieni – plik ustawień potrzebuje stawki „od kwietnia”.

### P3-3. Walidacja progów PIT nie sprawdza kolejności
- `src/rules/config.ts:40-44`: progi muszą rosnąć, ale tego nie sprawdzamy. Błąd w pliku (np. zamienione progi) dałby złe kwoty bez ostrzeżenia. Jedna linia sprawdzenia + test.

### P3-4. Brakujące przypadki testowe
- `test/rules/rules.test.ts`: brak testu dla (a) wakacji w styczniu i `previousDecemberHoliday`, (b) ręcznie podanych wpłat `socialPaid` (np. składki zapłacone w tym samym miesiącu), (c) kwot składek 2027, (d) dobrowolnego chorobowego w `computeYear`. Logika jest prosta, ale te ścieżki będą używane w etapie 6.

### P3-5. Ścieżka do plików ustawień zależy od położenia kodu
- `src/rules/config.ts:51` szuka `../../config/years` względem pliku źródłowego. Działa przy uruchamianiu `.ts` bez budowania (tak wdrażamy), ale przestanie, gdy kod trafi do innego katalogu (np. `dist/`). Przy etapie 8 sprawdzić albo dać ścieżkę ze zmiennej środowiskowej.

### P3-6. Fundusz Pracy liczony w module, nie w księdze
- `src/rules/year.ts` dolicza zapłacony FP do kosztów sam. To decyzja (zapisana w kontekście), ale grozi podwójnym kosztem, jeśli w etapie 5 ktoś wpisze FP do KPiR ręcznie. Zadanie w liście już jest – w etapie 5 wpis FP w KPiR ma powstawać z tych samych danych i nie wchodzić drugi raz do `costs`.

## Przegląd

### Co etap miał dostarczyć (plan techniczny, etap 2)
| Wymaganie | Stan |
|---|---|
| `src/rules/kpir.ts`, `zus.ts`, `pit.ts`, `holiday.ts` | Zrobione, dodatkowo `money.ts`, `config.ts`, `year.ts` |
| `config/years/2026.json`, `2027.json` | Zrobione; 2026 zgodne co do grosza z komunikatem ZUS, 2027 częściowo prognoza |
| Każda reguła sprawdzona w oficjalnym źródle | Tak: zus.pl (kwoty 2026), art. 81 ust. 2c (zdrowotna), Dz.U. 2026 poz. 1213 (płaca minimalna 2027); PIT – art. 27 i 44 z pamięci przepisów, zgodne z opisami portali |
| Scenariusze: strata, zero, minimum zdrowotnej, próg 32%, poniżej kwoty wolnej, wakacje, drugi miesiąc wakacji, korekta miesiąca | Wszystkie mają testy |
| Punkt kontrolny: przykładowe wyliczenia | `przyklad-wyliczen.md` gotowy, czeka na Pawła/księgową |

Brak przekroczenia zakresu (nie ma rocznego rozliczenia zdrowotnej ani PIT-36 – zgodnie z planem; moduł zwraca miesięczne podstawy, więc da się je dobudować).

### Cztery perspektywy
- **Bezpieczeństwo**: czyste funkcje bez sieci i bazy; jedyne wejście z zewnątrz to pliki ustawień, walidowane przy wczytaniu. Brak danych osobowych.
- **Wydajność**: 12 miesięcy na rok, obliczenia liniowe – bez znaczenia.
- **Budowa, nazwy, typy**: kwoty w groszach jako liczby całkowite, stawki w punktach bazowych, zaokrąglenia w jednym miejscu (`money.ts`); `computeYear` jest jedynym punktem wejścia dla ekranów – dobrze pod etap 6. Nazwy po polsku tam, gdzie to pojęcia z przepisów (emerytalne, rentowe), reszta po angielsku – spójnie z klientem KSeF.
- **Scenariusze**: główne ścieżki pokryte; brakujące przypadki w P3-4, ujemne koszty w P2-2.
