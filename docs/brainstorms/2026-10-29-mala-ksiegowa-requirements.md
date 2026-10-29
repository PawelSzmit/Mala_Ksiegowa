---
date: 2026-10-29
topic: mala-ksiegowa
---

# Mała Księgowa – wymagania (wersja minimalna)

## Problem

Jednoosobowa firma na skali podatkowej, bez VAT, na pełnym ZUS. Co miesiąc kilka faktur kosztowych (przychodzą przez KSeF) i jeden przychód: miesięczny raport z kasy fiskalnej. Trzeba z tego co miesiąc zrobić trzy rzeczy: zapis w księdze (KPiR), deklarację i przelew do ZUS, zaliczkę na podatek. Gotowe programy robią dużo więcej, niż potrzeba. Chodzi o narzędzie, które robi tylko to i nic więcej.

**Zasada nadrzędna: nic ponad absolutne minimum.** Każda funkcja musi odpowiadać na pytanie „czy bez niej nie da się zamknąć miesiąca albo spełnić obowiązku prawnego?”. Jeśli nie, wypada.

## Jak wygląda miesiąc (cały „rytuał”)

1. Faktury kosztowe same spływają z KSeF (aplikacja sprawdza co noc).
2. Na początku miesiąca otwierasz aplikację i widzisz listę nowych faktur za poprzedni miesiąc. Przy każdej klikasz „koszt firmy” albo „nie mój koszt”.
3. Wpisujesz jedną kwotę z miesięcznego raportu kasy fiskalnej.
4. Klikasz „zamknij miesiąc”. Aplikacja pokazuje trzy kwoty do zapłaty (ZUS, podatek) i daje plik DRA do wgrania w eZUS.
5. Płacisz do 20. Koniec.

Cel: cały miesiąc w 5–10 minut.

## Wymagania

- **R1. Logowanie.** Aplikacja jest tylko dla jednej osoby. Dostęp po haśle i drugim zabezpieczeniu (kod z aplikacji w telefonie), bo to dane finansowe na publicznym serwerze.
- **R2. Pobieranie faktur kosztowych z KSeF.** Raz na dobę automatycznie, plus przycisk „sprawdź teraz”. Pobierane są tylko faktury, na których firma jest nabywcą. Aplikacja ma w KSeF wyłącznie prawo **odczytu** faktur. Nie może niczego wystawić ani zmienić.
- **R3. Przegląd faktury.** Czytelny podgląd: dostawca, data, kwota brutto, co kupiono. Jedna decyzja: „koszt firmy” (trafia do księgi w kwocie brutto) albo „nie jest kosztem” (zostaje w archiwum, nie w księdze).
- **R4. Koszt spoza KSeF.** Prosty formularz na fakturę, której nie ma w KSeF (np. zagraniczna usługa internetowa): dostawca, numer, data, kwota, opcjonalnie skan PDF.
- **R5. Przychód z kasy fiskalnej.** Jeden wpis miesięcznie: data i kwota z raportu miesięcznego. Opcjonalnie zdjęcie raportu jako załącznik.
- **R6. Księga przychodów i rozchodów.** Aplikacja sama układa wpisy w KPiR zgodnie z przepisami (numeracja, kolumny, sumy miesięczne i od początku roku). Możliwość wydruku lub zapisania jako PDF.
- **R7. ZUS.** Składki społeczne wpisane raz na rok (przy pełnym ZUS są stałe). Składka zdrowotna liczona co miesiąc: 9% dochodu z miesiąca, nie mniej niż ustawowe minimum. Wynik: kwota do zapłaty i gotowy plik DRA do importu w eZUS.
- **R8. Zaliczka na podatek.** Wyliczana co miesiąc narastająco od początku roku (dochód minus zapłacone składki społeczne, stawka 12%, a po przekroczeniu progu 32%). Wynik: kwota do zapłaty na mikrorachunek.
- **R10. Wakacje składkowe.** Raz w roku możesz zaznaczyć wybrany miesiąc jako „wakacje od ZUS”. Wtedy:
  - aplikacja przypomina, że wniosek (RWS) trzeba złożyć w miesiącu **poprzedzającym** wybrany miesiąc, i przygotowuje dane do niego,
  - w wybranym miesiącu deklaracja DRA zawiera tylko składkę zdrowotną (wakacje nie zwalniają ze zdrowotnej),
  - zaliczka na podatek uwzględnia, że w tym miesiącu nie zapłaciłeś składek społecznych,
  - aplikacja pilnuje limitu: tylko jeden taki miesiąc w roku.
- **R9. Zamknięcie miesiąca.** Po zamknięciu miesiąca nie da się po cichu zmienić jego danych. Poprawka wymaga świadomego „otwórz ponownie” (żeby kwoty w ZUS i podatku zawsze zgadzały się z księgą).

## Kryteria sukcesu

- Miesiąc zamykasz w mniej niż 10 minut, bez otwierania żadnego innego programu poza eZUS i bankiem.
- Kwoty ZUS i zaliczki zgadzają się z tym, co policzyłaby księgowa (sprawdzimy na 2–3 przykładowych miesiącach).
- Żadna faktura z KSeF nie „ucieka” – jeśli pojawi się w KSeF, pojawi się w aplikacji.

## Czego NIE robimy (świadomie wycięte)

| Funkcja | Dlaczego wycięta |
|---|---|
| Kategorie kosztów i „zapamiętywanie dostawców” | Przy firmie usługowej prawie wszystkie koszty trafiają do jednej kolumny księgi („pozostałe wydatki”). Kategorie to przerost formy. |
| Wystawianie faktur | Przychód idzie przez kasę fiskalną. Jeśli ktoś raz na jakiś czas poprosi o fakturę, wystawisz ją w darmowej aplikacji Ministerstwa w KSeF. |
| Odczytywanie zdjęć przez AI | Jeden raport miesięcznie wpisuje się szybciej, niż robi zdjęcie. |
| Przypomnienia o terminach | Wystarczy cykliczne wydarzenie w kalendarzu na 15. dnia miesiąca. |
| Zeznanie roczne PIT-36 | Raz w roku. Aplikacja pokaże sumy roczne z księgi, a formularz wypełnisz w e-Urzędzie Skarbowym. |
| Roczne rozliczenie składki zdrowotnej | Potrzebne dopiero w kwietniu 2027. Aplikacja od początku zbiera dane, żeby dało się je dobudować później. |
| Łączenie z bankiem, wykresy, statystyki, aplikacja mobilna, wersja dla wielu firm | Nie są potrzebne, żeby zamknąć miesiąc. |
| Wysyłka do ZUS bez Twojego udziału | ZUS nie udostępnia takiej możliwości. Wgrywasz plik w eZUS. |

## Kluczowe decyzje

- **Hosting: istniejący serwer vh.pl (cPanel), na którym stoi strona za-horyzont.pl.** Zasobów jest aż nadto (dysk zajęty w ok. 5%, pamięć w ok. 6%, jest baza danych PostgreSQL i zadania wykonywane o określonej godzinie, czyli „cron”). Aplikacja będzie pod osobnym adresem, np. ksiegowa.za-horyzont.pl, z osobną bazą danych.
  - Dlaczego: zero dodatkowych kosztów, hosting już opłacony.
  - Cena tej decyzji: aplikacja dzieli serwer ze stroną gabinetu. Jeśli strona zostałaby kiedyś zhakowana, włamywacz jest „w tym samym budynku”. Dlatego R1 (drugie zabezpieczenie logowania) i R2 (tylko prawo odczytu w KSeF) są obowiązkowe, a nie opcjonalne.
- **Logowanie do KSeF: Profil Zaufany używasz Ty, nie aplikacja.** Profil Zaufany wymaga Twojego potwierdzenia (SMS), więc program nie może się nim logować sam co noc. Rozwiązanie: raz logujesz się Profilem Zaufanym do aplikacji Ministerstwa (Aplikacja Podatnika KSeF) i generujesz tam „klucz” dla programu (token albo certyfikat KSeF) z prawem tylko do odczytu faktur. Ten klucz wklejasz do Mała Księgowej. To jak dorobienie klucza do skrzynki pocztowej dla zaufanej osoby – może wyjmować listy, ale nie może niczego wysłać w Twoim imieniu.
- **Klucz do KSeF: token.** Ministerstwo potwierdziło, że tokeny działają także w 2027 (sprawdził Paweł na stronie MF). Certyfikat nie jest na razie potrzebny.
- **JPK_PKPIR poza zakresem.** Dla firm bez VAT obowiązek wysyłki wchodzi dopiero od 2028. Wrócimy do tego w 2027.
- **Koszty w kwocie brutto, jedna kolumna księgi.** Bez VAT cała kwota faktury jest kosztem.

## Zależności i założenia

- Założenie: firma to gabinet, którego stroną jest za-horyzont.pl (usługi, bez towarów na sprzedaż, więc bez spisu z natury na koniec roku).
- Założenie: jedynym przychodem jest kasa fiskalna. Ewentualne faktury dla pacjentów do paragonu nie zwiększają przychodu (ta kwota już jest w raporcie z kasy).
- Założenie: składki społeczne płacisz w pełnej wysokości przez cały rok, z wyjątkiem jednego miesiąca wakacji składkowych (bez zasiłków i innych ulg).
- Zależność: Ty jednorazowo generujesz w KSeF klucz dla aplikacji (instrukcję przygotujemy).

## Otwarte pytania

### Przed planowaniem
- Czy któraś z wyciętych funkcji jest jednak dla Ciebie niezbędna?

### Do sprawdzenia przy planowaniu (technicznie)
- W jakiej technologii to piszemy. Hosting na pewno obsługuje PHP. Na etapie planowania poprosić Pawła o otwarcie Chrome z zalogowanym cPanelem i samodzielnie sprawdzić, czy da się uruchomić inny język (np. Node.js lub Python) oraz czy serwer może łączyć się z serwerami KSeF.
- Czy wniosek o wakacje składkowe (RWS) da się przygotować jako plik do wgrania w eZUS, czy trzeba go wypełnić bezpośrednio w eZUS (wtedy aplikacja podaje gotowe dane do przepisania).
- Aktualne kwoty na 2026 i 2027: minimalna składka zdrowotna, podstawa składek społecznych, progi podatkowe. Będą w ustawieniach roku, nie w kodzie.
- Jak vh.pl robi kopie zapasowe i czy wystarczą.

## Następny krok

Po potwierdzeniu zakresu: plan techniczny (dev-plan). Pierwszy krok budowy to mała próba: czy z tego hostingu da się pobrać fakturę z testowego KSeF. Jeśli to zadziała, reszta jest prosta.
