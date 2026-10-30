# Review – Etap 1: Próba KSeF (go/no-go)

Data: 2026-10-29
Gałąź: `claude/project-thread-eptw6o` (commity `c240757`, `Etap 1: udana próba…`, `Etap 1: próba z serwera vh.pl udana`)
Stan repozytorium w chwili review: czyste (`git status --short` pusty), `npm test` 11/11, `npm run typecheck` bez błędów.

## Decyzja

**Można iść dalej, z zastrzeżeniami.** Brak P1. Dwa P2 dotyczą tego, jak klient KSeF będzie używany w etapie 4 (nocne pobieranie) – nie blokują etapu 2 (reguły podatkowe), ale trzeba je zamknąć przed etapem 4.

| Waga | Liczba |
|---|---|
| P1 (blokujące) | 0 |
| P2 (ważne) | 2 |
| P3 (drobne) | 6 |

## Ustalenia

### P2-1. Limit 20 zapytań o listę faktur na godzinę, a klient potrafi długo czekać po odpowiedzi 429
- Gdzie: `src/ksef/client.ts:185-189` (ponawianie po 429), `src/ksef/client.ts:130-151` (stronicowanie).
- Oficjalne limity (`limity/limity-api.md`): `POST /invoices/query/metadata` – 8/s, 16/min, **20/h**; `GET /invoices/ksef/{nr}` – 64/h. Blokada po 429 jest „dynamiczna” i rośnie przy powtórnych przekroczeniach; czas podaje `Retry-After` (przykład w dokumentacji: 30 s).
- Problem: `request()` czeka tyle, ile każe `Retry-After`, bez górnej granicy, do 3 razy. W zadaniu nocnym to nie szkodzi, ale przycisk „sprawdź teraz” (etap 4) mógłby wisieć minutami. Do tego kilkukrotne kliknięcie przycisku + noc + każda strona wyników zjada pulę 20/h.
- Do zrobienia w etapie 4: górny limit czekania (np. 10 s) i dla wywołań z przycisku brak ponawiania – komunikat „KSeF prosi o przerwę, spróbuj za X min”; blokada przycisku, jeśli ostatnie sprawdzenie było < kilka minut temu; XML zapisywany w bazie (nie pobierać ponownie przy wyświetlaniu – tak zaleca też MF).

### P2-2. Nocne pobieranie musi iść „oknami” od znacznika kompletności (HWM), a nie „ostatnie N dni”
- Gdzie: `src/ksef/client.ts:130-151`, `scripts/ksef-spike.ts` (zakres „ostatnie 60 dni”).
- Oficjalny dokument `pobieranie-faktur/przyrostowe-pobieranie-faktur.md`: kolejne zapytania mają być przylegającymi oknami po dacie `PermanentStorage`, z `restrictToPermanentStorageHwmDate = true`; początek następnego okna = `permanentStorageHwmDate` z odpowiedzi (albo data ostatniej faktury, gdy `isTruncated`). Tylko tak KSeF gwarantuje, że żadna faktura nie zginie.
- Obecnie klient: nie przekazuje `restrictToPermanentStorageHwmDate`, nie zwraca `permanentStorageHwmDate`, a przy `isTruncated` rzuca błąd (`client.ts:148`) zamiast kontynuować od ostatniej daty. Na próbę wystarczało, do produkcji nie.
- Do zrobienia w etapie 4: `queryInvoiceMetadata` zwraca też `permanentStorageHwmDate`; zadanie nocne zapamiętuje w bazie punkt startowy następnego okna; przy `isTruncated` kontynuacja od `permanentStorageDate` ostatniej faktury; duplikaty i tak odcina unikalny numer KSeF w bazie.

### P3-1. Kwoty z KSeF to liczby dziesiętne w złotych
- `src/ksef/types.ts` (`grossAmount` itd., np. `53.63`). Przy zapisie do bazy w groszach używać `Math.round(kwota * 100)`, nigdy samego mnożenia/obcinania (`53.63 * 100 = 5362.999…`). Najlepiej brać kwotę z XML (pole `P_15`) jako tekst i zamieniać bez liczb zmiennoprzecinkowych. Etap 4.

### P3-2. Nieprzetestowana ścieżka „token odświeżający wygasł → zaloguj od nowa”
- `src/ksef/client.ts:117-123`. Zakładamy, że KSeF odpowie 401 na wygasły `refreshToken`; nie sprawdzone na teście i brak testu z udawanym serwerem. Przy zadaniu raz na dobę logujemy się i tak od nowa przy każdym uruchomieniu, więc ryzyko małe. Dodać test w etapie 4.

### P3-3. Równoległe odświeżanie tokenu
- `src/ksef/client.ts:162-171`. Dwa równoczesne zapytania po wygaśnięciu tokenu odświeżą go dwa razy. Przy jednym zadaniu nocnym bez znaczenia; jeśli przycisk i noc mogą działać naraz – uruchamiać synchronizację pod blokadą (jedna na raz). Etap 4.

### P3-4. Tylko faktury, gdzie firma jest „nabywcą” (Subject2)
- `src/ksef/client.ts:139`. MF zaleca pobierać osobno dla każdej roli. Dla gabinetu koszty to praktycznie zawsze rola nabywcy; rola „Podmiot 3” (np. płatnik za kogoś) nie dotyczy Pawła. Świadoma decyzja – zapisać w kontekście, wrócić tylko jeśli Paweł zgłosi brak faktury.

### P3-5. Token wpisany w wierszu poleceń na serwerze
- W próbie na vh.pl testowy token był podany w poleceniu w Terminalu (historia wyczyszczona, katalog usunięty). Dla tokenu testowego bez znaczenia, ale w produkcji token ma trafić wyłącznie do zmiennych środowiskowych w formularzu „Setup Node.js App” lub do zaszyfrowanej bazy – nigdy w poleceniu ani w pliku w katalogu domowym. Dopisać do `docs/VH-WDROZENIE.md` w etapie 8.

### P3-6. Nieaktualne fragmenty dokumentacji
- `docs/active/mala-ksiegowa/mala-ksiegowa-plan.md` – gałąź `tqtl79` zamiast `eptw6o`.
- `docs/active/mala-ksiegowa/mala-ksiegowa-kontekst.md:132` – „dotąd tylko dokumenty w docs/” (już jest kod).
- `docs/plans/2026-10-29-mala-ksiegowa-plan.md:60,128` – filtr „nabywca” i limity stron wciąż jako otwarte pytanie (potwierdzone: `Subject2`, `pageSize` 10–250).

## Przegląd

### Co etap miał dostarczyć (plan techniczny, etap 1)
| Wymaganie | Stan |
|---|---|
| Logowanie tokenem: challenge → szyfrowanie → ksef-token → status → redeem → refresh | Zrobione, potwierdzone na testowym KSeF |
| Lista faktur zakupowych (nabywca, zakres dat) i pobranie XML | Zrobione, potwierdzone (1 faktura, XML 3378 znaków) |
| Scenariusze: dobry token, zły token, wygasły accessToken, pusta lista, wiele stron | Testy z udawanym KSeF (11 testów); zły token i odświeżenie sprawdzone też na prawdziwym teście (kod 450, nowy accessToken) |
| Próba z komputera i z serwera vh.pl | Obie udane (serwer: Node 24.12.1) |
| Faktura wystawiona przez nas z jednego testowego NIP-u na drugi | Zrobione (`scripts/ksef-test-invoice.ts`) |
| Punkt kontrolny z Pawłem | Wynik pokazany; czeka na jego „go” |

Różnice względem planu bez znaczenia: logowanie jest w `client.ts`, nie w osobnym `auth.ts`; doszły skrypty pomocnicze tylko do testów (`scripts/ksef-test-token.ts`, `scripts/ksef-test-invoice.ts`, `scripts/lib/ksef-test-auth.ts`).

### Cztery perspektywy
- **Bezpieczeństwo**: brak sekretów w repo (pliki `.ksef-test*.env` ignorowane, zapisywane z prawami 600); skrypty nie wypisują tokenu; komunikaty błędów nie zawierają tokenu (test); `openssl` wywoływany bez powłoki (`execFileSync` z listą argumentów). Klient nie ma żadnej funkcji zapisu w KSeF; wystawianie faktury istnieje tylko w skrypcie testowym przypiętym do `KSEF_BASE_URLS.test`.
- **Wydajność i skala**: przy kilku fakturach miesięcznie bez znaczenia; jedyne realne ograniczenie to limity MF (P2-1).
- **Budowa, nazwy, typy**: zero zależności produkcyjnych, typy metadanych zgodne z OpenAPI i prawdziwą odpowiedzią; luźne typowanie odpowiedzi logowania było świadome i okazało się trafne.
- **Scenariusze**: brak testów dla wygasłego refreshToken (P3-2) i ucięcia wyników z kontynuacją (P2-2); reszta pokryta.
