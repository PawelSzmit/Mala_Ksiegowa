# Review etapu 7 – wakacje składkowe

Data: 2026-10-30 · Gałąź: `claude/project-thread-eptw6o` (etap 7 w `9109be1`)
Decyzja: **gotowe do dalszej pracy**. Znaleziono 0×P1, 1×P2 i 5×P3. P2 jest poprawione w ramach tego review, na prośbę Pawła.

## Ustalenia

### P2-1. Wakacji nie dało się wpisać po terminie wniosku RWS (POPRAWIONE)
**Gdzie:** `src/routes/settings.ts` (`saveHoliday`). Aplikacja odrzucała miesiąc wakacji, jeśli minął już miesiąc na złożenie RWS.

**Przykład:** Paweł składa RWS w eZUS w lutym 2027 na marzec, ale do aplikacji wpisuje to dopiero w marcu.
- Aplikacja mówiła „za późno”.
- Marzec liczył się z pełnymi składkami.
- DRA nie zawierał raportów RCA.

Do tego dało się wybrać tylko bieżący i następny rok. Grudnia nie dało się więc wpisać w styczniu, przed zamknięciem grudnia.

**Prośba Pawła (2026-10-30):** „żeby można to było w każdej chwili wpisać w aplikacji”.

**Poprawka:**
- Miesiąc można wpisać zawsze, na poprzedni, bieżący i następny rok.
- Po terminie RWS zapis przechodzi z ostrzeżeniem: „zostaw wakacje tylko, jeśli wniosek złożyłeś i ZUS go przyjął”.
- Jedyna blokada została tam, gdzie jest potrzebna: miesiąc wakacji (albo późniejszy) jest już zamknięty. Wtedy aplikacja prosi o ponowne otwarcie, bo kwoty muszą się przeliczyć.
- Test `test/holiday.test.ts` sprawdza wpis po terminie i rok poprzedni.

### P3
1. **Plik dla miesiąca wakacji nie był jeszcze importowany w eZUS.** Skład pliku pochodzi z dwóch źródeł:
   - opis słowny w instrukcji ZUS (przykład 1); wypełnionych formularzy z instrukcji nie dało się odczytać, bo są obrazkami;
   - schemat `kedu_5_7.xsd`.

   Test odtwarza kwoty z instrukcji co do grosza. Ostatecznym sprawdzianem jest jednak import w eZUS przy pierwszych wakacjach. Ten punkt jest już w zadaniach etapu 7.
2. **Wyścig: zmiana wakacji w trakcie zamykania miesiąca.** `saveHolidayMonth` blokuje wiersz roku, ale `closeMonth` go nie czyta z blokadą. Przy jednym użytkowniku to praktycznie niemożliwe. Poprawka: `SELECT … FROM years … FOR SHARE` w `closeMonth`.
3. **Nazwa pliku.** W miesiącu wakacji plik nazywa się `DRA-RRRR-MM.xml`, a zawiera też dwa RCA. Karta to opisuje, więc to tylko kosmetyka (np. `ZUS-RRRR-MM.xml`).
4. **Przypomnienie o RWS widać tylko na stronie miesiąca przed wakacjami.** Jeśli Paweł nie otworzy aplikacji w tym miesiącu, nie zobaczy go. Bez powiadomień, zgodnie z założeniem „minimum funkcji”. Warto, żeby Paweł sam pamiętał o RWS.
5. **Kosmetyka ekranu ustawień.** Na telefonie „Rok 2026” łamie się na dwie linie. Brakuje też testu przypomnienia bez pliku ustawień roku (kwota „około …” ukryta).

## Zgodność z planem
Wszystkie punkty etapu 7 są zrobione:
- miesiąc wakacji w ustawieniach (najwyżej jeden w roku);
- przypomnienie w miesiącu poprzedzającym z danymi do RWS;
- uwzględnienie w obliczeniach (już z etapu 2) i w pliku dla eZUS.

Pytanie o miesiąc wakacji 2027 jest zamknięte: Paweł nie wie, więc wpisze go sam, kiedy zdecyduje (P2-1).

**Odstępstwo od wymagań, uzasadnione źródłem:** R10 zakładało „DRA tylko ze składką zdrowotną”. Instrukcja ZUS wymaga DRA i dwóch raportów RCA (05 14 00 i 05 10 00). Zrobione zgodnie z ZUS.

## Co sprawdziłem i co jest dobrze
- **Kwoty:**
  - w miesiącu wakacji do zapłaty jest tylko zdrowotna;
  - w następnym miesiącu nie ma wpisu FP ani odliczenia niezapłaconych składek (test przez HTTP);
  - kwoty objęte zwolnieniem są zapisywane przy zamknięciu (`exemptSocial`), więc plik nie zmieni się, gdy później zmieni się plik stawek;
  - starsze zamknięcie bez tych kwot daje jasny komunikat zamiast złego pliku.
- **Plik KEDU:**
  - pola i źródła finansowania zgodne z przykładem 1 instrukcji ZUS (budżet: DRA IV p10–p12, p28–p30; RCA III.B p15–p18);
  - kody 05 14 00 i 05 10 00, identyfikator „P” jak w `DRA_RCA.xml` z BIP;
  - `id_bloku` jest wymagany przez schemat i jest w pliku;
  - wariant bez chorobowego (jak u Pawła) pomija pola chorobowej.
- **Spójność danych:**
  - zmiana wakacji jest zablokowana przy zamkniętym miesiącu ≥ min(stary, nowy);
  - grudzień blokuje też zamknięty styczeń następnego roku, bo składki za grudzień odlicza się w styczniu;
  - zmiana działa w transakcji z blokadą wiersza roku.
- **Bezpieczeństwo:** nowy formularz jest za logowaniem i ma sprawdzanie Origin. Rok i miesiąc są sprawdzane po stronie serwera. Dane w przypomnieniu to dane samego Pawła, widoczne tylko po zalogowaniu.
- **Wydajność:** strona miesiąca robi 1–3 dodatkowe drobne zapytania (przypomnienie RWS). Bez znaczenia.
- **Testy:** 131/131 z bazą, typecheck czysty (uruchomione ponownie po poprawce).
