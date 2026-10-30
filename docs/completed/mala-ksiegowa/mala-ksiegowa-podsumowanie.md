# Mała Księgowa – podsumowanie projektu

## Data zakończenia

30 października 2026 r. Projekt trwał dwa dni: start 29.10.2026, wdrożenie 30.10.2026.

## Co zostało dostarczone

Działająca aplikacja internetowa do prowadzenia księgowości jednoosobowej firmy Pawła. Adres: **https://ksiegowa.za-horyzont.pl**. Na co dzień korzysta z niej żona Pawła.

| Funkcja | Jak działa |
|---|---|
| Logowanie | Hasło + 6-cyfrowy kod z aplikacji w telefonie. |
| Faktury kosztowe | Pobierane same z KSeF codziennie o 6:15, tokenem tylko do odczytu. Przy każdej wybierasz „Koszt firmy” albo „Nie jest kosztem”. |
| Koszty spoza KSeF | Formularz z dowodem (zdjęcie lub PDF do 8 MB). |
| Przychód | Raport z kasy fiskalnej, jedna kwota na miesiąc. |
| Księga (KPiR) | Wzór z 19 kolumnami (Dz.U. 2025 poz. 1299), widok miesiąca i roku, wydruk lub PDF. |
| Zamknięcie miesiąca | Kwota ZUS (do 10.), zaliczka PIT (do 20.), blokada zmian, ponowne otwarcie z porównaniem kwot. |
| Deklaracja ZUS | Plik DRA (format KEDU 5.7) do importu w eZUS. Nic nie jest wysyłane automatycznie. |
| Wakacje składkowe | Miesiąc wpisywany w Ustawieniach w dowolnej chwili, przypomnienie o wniosku RWS, plik DRA + 2 raporty RCA. |
| Kopie i ciągłość | Codzienne kopie JetBackup, instrukcja wdrożenia i aktualizacji. |

Dokumenty dla użytkownika i administratora:
- `docs/instrukcja/Mala-Ksiegowa-instrukcja.pdf`: instrukcja obsługi, w tym zamykanie miesiąca i deklaracja ZUS krok po kroku. Źródło do edycji: `instrukcja.html`.
- `docs/VH-WDROZENIE.md`: wdrożenie, aktualizacja, rozwiązywanie problemów na vh.pl.
- `docs/KSEF-TOKEN.md`: jak wygenerować i wymienić token KSeF.

## Kluczowe decyzje

- **Technologia:** Node.js 24 + PostgreSQL na istniejącym hostingu vh.pl, ekrany generowane na serwerze. To ten sam wzorzec co aplikacja gabinetu, ale jej nie dotyka: osobny katalog, baza i aplikacja.
- **Minimum funkcji:** świadomie bez kategorii kosztów, wystawiania faktur, przypomnień, PIT-36 i połączenia z bankiem.
- **KSeF przez token tylko do odczytu**, zaszyfrowany w bazie. Token wygenerowany 30.10.2026. Po 31.12.2026 MF nie wydaje nowych tokenów.
- **ZUS jako plik do importu w eZUS**, bo ZUS nie udostępnia publicznego API. Wysyłkę zawsze robi człowiek.
- **Zasada 9. dnia:** faktura za poprzedni miesiąc, która przyjdzie do 9. dnia, trafia do poprzedniego miesiąca. Dlatego miesiąc zamyka się od 10. dnia.
- **Start księgi 1.01.2027.** Bez „stanu na start”, tylko dochód z grudnia 2026 przy zamknięciu stycznia, i to obowiązkowo.
- **Stawki roku w pliku ustawień.** Gdy stawki to tylko „prognoza”, zamknięcie miesiąca jest zablokowane, żeby nie powstała błędna deklaracja.
- **Wakacje składkowe zgodnie z instrukcją ZUS (XII 2024):** DRA + RCA 05 14 + RCA 05 10. Wymaganie R10 zakładało sam DRA, ale instrukcja ZUS wymaga trzech dokumentów.
- **Wdrożenie przez cPanel Git** (repozytorium publiczne). Sekrety generuje na serwerze `scripts/setup-vh.sh` i nikt ich nie widzi.

## Najważniejsze pliki lub obszary

- `src/rules/`: obliczenia KPiR, ZUS, PIT, wakacji, zasada 9. dnia (z testami).
- `config/years/2026.json`, `2027.json`: stawki roku. 2027 to prognoza, do potwierdzenia w grudniu.
- `src/ksef/`, `src/jobs/ksef-sync.ts`, `scripts/ksef-sync.ts`: klient KSeF i nocne pobieranie.
- `src/month/close.ts`, `src/month/holiday.ts`: zamykanie miesiąca i wakacje.
- `src/zus/kedu-dra.ts`: plik DRA/RCA zgodny ze schematem `kedu_5_7.xsd`.
- `src/auth/`, `src/crypto/`: logowanie 2FA, szyfrowanie tokenu.
- `migrations/`: struktura bazy.
- `scripts/setup-vh.sh`, `scripts/build-package.sh`: wdrożenie.
- Testy: 137 przypadków w `test/`, wszystkie przechodzą.

## Co zostało na później

Rzeczy z prawdziwego życia, których nie dało się sprawdzić przed startem księgi:
1. **Grudzień 2026:** potwierdzić stawki na 2027 (podstawa składek ZUS, skala PIT) i zmienić status pliku `2027.json` na „potwierdzone”. Zrobić z Claude.
2. **Ustawienia:** uzupełnić dane płatnika do DRA (PESEL, imię, nazwisko), jeśli jeszcze ich nie ma. Bez nich aplikacja nie zamknie miesiąca.
3. **Luty 2027:** pierwsze zamknięcie prawdziwego miesiąca (styczeń) i pierwszy import DRA w eZUS. Sprawdzić uważnie, zanim deklaracja zostanie podpisana.
4. **Pierwsze wakacje składkowe:** sprawdzić import pliku z trzema dokumentami w eZUS.
5. **Ryzyko:** jeśli token KSeF zostanie unieważniony po 2026 r., potrzebne będzie logowanie certyfikatem KSeF. Mechanizm jest sprawdzony w próbie z etapu 1.

Drobne usprawnienia (P3) z przeglądów etapów są wypisane w `mala-ksiegowa-zadania.md`. Żadne nie blokuje pracy.

## Wnioski

- **Najpierw największe ryzyko.** Próba KSeF w etapie 1 wyłapała, że token testowy wymaga logowania certyfikatem, zanim powstał jakikolwiek ekran.
- **Oficjalne źródło dla każdej reguły.** Poradnik ZUS DRA miał błąd w sumie o 1 grosz. Instrukcja wakacji składkowych wymagała więcej dokumentów, niż zakładały wymagania.
- **Hosting współdzielony ma swoje pułapki:**
  - skrypt środowiska Node w CloudLinux nie działa z `set -u`;
  - cPanel nie pozwala nazwać użytkownika bazy tak samo jak bazy;
  - konto cPanel nie ma praw do tabel aplikacji. To dobrze dla bezpieczeństwa, ale zmiany w danych robi się tylko poleceniem w Terminalu.
- **Sekrety zostają na serwerze.** Skrypt losuje hasła i klucze na miejscu. Do czatu, repozytorium ani dokumentów nie trafił żaden sekret.
- **Automatyczny przegląd kodu się opłacił:** wyłapał brak blokady stycznia bez dochodu z grudnia i rzadki wyścig przy zamykaniu miesiąca.
