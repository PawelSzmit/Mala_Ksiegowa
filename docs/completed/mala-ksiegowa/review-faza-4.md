# Review etapu 4 – faktury, koszty, kasa

Data: 2026-10-30 · Gałąź: `claude/project-thread-eptw6o` (etap 4 wypchnięty, drzewo czyste)
Decyzja: **można iść dalej z zastrzeżeniami** – 0×P1, 1×P2, 7×P3.

## Ustalenia

### P2-1. Faktura, która dotrze po zamknięciu miesiąca, nie da się zaksięgować bez otwierania tego miesiąca
`src/routes/invoices.ts` (decyzja „koszt firmy”) księguje koszt pod **datą wystawienia** (`issue_date`). `src/db/books.ts:13` odrzuca zapis do zamkniętego miesiąca (409).

Przykład: faktura wystawiona 30.10 trafia do KSeF albo do aplikacji 3.11. Październik jest już zamknięty, a ZUS i PIT za niego policzone. Paweł musiałby otworzyć październik ponownie i przeliczyć wszystko.

- **Dziś to nie przeszkadza**, bo zamykanie miesiąca dochodzi dopiero w etapie 6. Ale od tego wyboru zależy, jak ma działać etap 6.
- **Możliwe rozwiązanie:** księgować koszt pod datą otrzymania faktury. Dla KSeF datą otrzymania jest moment nadania numeru KSeF (dokumentacja MF „przyrostowe pobieranie faktur”). Można też dać do wyboru: „miesiąc wystawienia” albo „bieżący otwarty miesiąc”.
- **Do zrobienia:** potwierdzić z księgową, który dzień jest właściwy przy KPiR (art. 22 ust. 5d i 6b ustawy o PIT), i ustalić to przed etapem 6.

### P3
1. **Pierwsze pobranie tuż po północy kończy się błędem 400.** Gdy data początkowa to „dziś”, a pobranie rusza w pierwszych 1–2 minutach doby, początek okna wypada po znaczniku kompletności KSeF.
   - Sprawdzone na testowym KSeF: kod 21183 „Zakres filtrowania wykracza poza dostępny zakres danych”.
   - Paweł zobaczyłby „KSeF zwrócił błąd 400”.
   - Poprawka (`src/jobs/ksef-sync.ts`): błąd 21183 traktować jako „brak nowych faktur” i nie przesuwać punktu startowego.
2. **Mylące komunikaty błędów** (`describeError` w `src/jobs/ksef-sync.ts`).
   - Po zmianie `APP_ENCRYPTION_KEY` tokenu nie da się odszyfrować, a Paweł widzi „Nieoczekiwany błąd”. Powinien zobaczyć „wpisz token ponownie w ustawieniach”.
   - Każdy `TypeError`, także błąd w kodzie, jest opisywany jako „Brak połączenia z KSeF”. Lepiej rozpoznawać błąd sieci po `cause` w `fetch`.
3. **Za duży plik (> 8 MB).**
   - Sprawdzone w przeglądarce: komunikat „Plik jest za duży (najwięcej 8 MB)” pojawia się poprawnie.
   - Problem: dane wpisane w formularz przepadają, a strona błędu nie ma menu.
   - Można wracać do formularza z komunikatem albo sprawdzać rozmiar pliku w przeglądarce przed wysłaniem.
4. **Faktury zaliczkowe i rozliczeniowe** (`Zal`, `Roz`, `KorZal`, `KorRoz`) nie mają na liście żadnego oznaczenia, w przeciwieństwie do korekt.
   - Przy KPiR zaliczka zwykle nie jest jeszcze kosztem. Faktura rozliczeniowa zawiera tylko kwotę pozostałą do zapłaty.
   - Do potwierdzenia z księgową. Na start wystarczy etykieta „ZALICZKA” lub „ROZLICZENIE” z krótką podpowiedzią.
5. **Treść faktury dociągnięta po decyzji nie poprawia wpisu w księdze.** Ten punkt jest już na liście „Do sprawdzenia po etapie 4”, tu tylko przypomnienie.
6. **Braki w testach:**
   - okno 90-dniowe i wznowienie po limicie 5 okien na uruchomienie;
   - plik HEIC;
   - limit 8 MB (sprawdzony tylko ręcznie).
   Logika jest prosta i przeczytana, ale nie ma na nią testu.
7. **Zmiana NIP-u lub środowiska KSeF** zaczyna pobieranie od nowa. Faktury pobrane wcześniej (np. testowe) zostają jednak na liście do przejrzenia. Przy wdrożeniu startujemy z pustą bazą, więc to drobiazg; najwyżej dopisać do instrukcji.

## Co sprawdziłem i co jest dobrze
- **Zgodność z planem:** zakres jak w planie (R2–R5) i wszystkie scenariusze testowe z planu są pokryte: ponowna synchronizacja bez duplikatów, korekta, wiele pozycji, awaria KSeF z kolejną próbą i komunikatem o ostatniej udanej synchronizacji. Dodatkowo zamknięte są zaległe poprawki z review etapów 1–3.
- **Pobieranie zgodne z zasadami MF:**
  - przylegające okna po dacie trwałego zapisu, z `restrictToPermanentStorageHwmDate`;
  - przy ucięciu kontynuacja od daty ostatniej faktury;
  - punkt startowy zapisywany po każdym oknie;
  - limit 20 zapytań na godzinę uszanowany (przycisk co 5 min, bez ponawiania).
  Sprawdzone na prawdziwym testowym KSeF.
- **Bezpieczeństwo:**
  - każda nowa strona wymaga zalogowania (test);
  - formularze chronione sprawdzaniem Origin;
  - HTML escapowany;
  - zapytania SQL z parametrami;
  - token zaszyfrowany i nigdy nie wraca na ekran (test);
  - rodzaj pliku rozpoznawany po zawartości;
  - pliki wydawane z `CSP: sandbox` – PDF mimo to wyświetla się normalnie w Chromium (sprawdzone);
  - czytnik XML nie obsługuje DTD, więc odpada cała klasa ataków przez spreparowany XML.
- **Spójność danych:**
  - decyzja, cofnięcie, koszt i raport z kasy wykonują się w transakcji, a wiersz jest blokowany (`FOR UPDATE`);
  - jeden wpis w księdze na dokument (`UNIQUE(source, source_id)` + upsert);
  - podwójne kliknięcie „Koszt firmy” daje 409, a nie drugi wpis (test);
  - jedna synchronizacja naraz (blokada w bazie, test).
- **Odporność:** nieczytelny XML (np. inny format niż FA, jak PEF) nie blokuje faktury – zostają dane z listy KSeF i opis błędu.
- **Testy:** 98/98 z bazą, 66 bez bazy, typecheck czysty.

## Wydajność
Przy kilku fakturach miesięcznie bez znaczenia:
- strona miesiąca to 5 równoległych zapytań;
- pliki do 8 MB trzymane w bazie, czyli przy raporcie z kasy co miesiąc kilkadziesiąt MB rocznie;
- jedynym prawdziwym ograniczeniem są limity KSeF, a te są uszanowane.
