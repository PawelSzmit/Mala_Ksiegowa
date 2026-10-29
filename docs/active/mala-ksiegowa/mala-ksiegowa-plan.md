# Mała Księgowa – plan wykonawczy

Gałąź: `claude/project-thread-tqtl79`
Ostatnia aktualizacja: 2026-10-29

## Cel

Prosta aplikacja internetowa tylko dla Pawła, która co miesiąc:
1. sama pobiera faktury kosztowe z KSeF,
2. pozwala jednym kliknięciem zaksięgować je w KPiR (lub odrzucić),
3. przyjmuje jedną kwotę z raportu kasy fiskalnej,
4. po kliknięciu „zamknij miesiąc” podaje kwoty do zapłaty (ZUS, zaliczka PIT) i plik DRA do wgrania w eZUS,
5. obsługuje raz w roku wakacje składkowe.

Firma: gabinet (za-horyzont.pl), skala podatkowa, bez VAT, pełny ZUS. Cel czasowy: cały miesiąc zamknięty w 5–10 minut.

## Zakres

W zakresie: wymagania R1–R10 z dokumentu wymagań (logowanie z 2FA, pobieranie z KSeF tylko do odczytu, przegląd faktur, koszty spoza KSeF, raport z kasy, KPiR z wydrukiem, ZUS z plikiem DRA, zaliczka PIT, zamykanie miesiąca, wakacje składkowe) oraz wdrożenie na hostingu vh.pl.

Poza zakresem: kategorie kosztów, wystawianie faktur, AI do zdjęć, przypomnienia mailowe, PIT-36, roczne rozliczenie składki zdrowotnej (tylko zbieramy dane), JPK_PKPIR (obowiązek od 2028), łączenie z bankiem, aplikacja mobilna, wiele firm, automatyczna wysyłka do ZUS/US.

## Fazy

| # | Etap | Co powstaje | Punkt kontrolny z Pawłem |
|---|---|---|---|
| 1 | Próba KSeF (go/no-go) | Skrypt, który loguje się tokenem do testowego KSeF i pobiera fakturę zakupową – z komputera i z serwera vh.pl | Tak – wynik decyduje, czy idziemy dalej |
| 2 | Reguły podatkowe i składkowe | Moduł liczący KPiR, ZUS, PIT, wakacje + testy + pliki ustawień roku 2026/2027 | Tak – przykładowe wyliczenia do sprawdzenia |
| 3 | Szkielet, baza, logowanie | Działająca aplikacja z logowaniem hasło + kod z telefonu | Nie |
| 4 | Faktury, koszty, kasa | Nocne pobieranie z KSeF, ekran przeglądu, formularze kosztu i kasy | Nie |
| 5 | Księga KPiR | Widok miesiąca i roku, wydruk/PDF | Nie |
| 6 | Zamknięcie miesiąca, ZUS, PIT | Kwoty do zapłaty, plik DRA (KEDU), blokada miesiąca | Tak – Paweł importuje DRA w eZUS jako wersję roboczą |
| 7 | Wakacje składkowe | Zaznaczenie miesiąca, przypomnienie o wniosku RWS, uwzględnienie w obliczeniach i DRA | Nie |
| 8 | Wdrożenie | Instrukcja dla Pawła, paczka, aplikacja pod subdomeną, zadanie nocne, kopie | Tak – Paweł wykonuje lub zatwierdza wdrożenie |

Kolejność: najpierw największe ryzyko (KSeF), potem poprawność kwot (reguły), dopiero potem ekrany.

## Kryteria akceptacji

- Faktura wystawiona w KSeF na NIP firmy pojawia się w aplikacji najpóźniej następnego dnia, bez duplikatów.
- Kwoty ZUS i zaliczki PIT dla 2–3 przykładowych miesięcy zgadzają się z wyliczeniem ręcznym lub księgowej co do grosza.
- Plik DRA importuje się w eZUS bez błędów krytycznych.
- Miesiąc wakacji: DRA zawiera tylko składkę zdrowotną, a drugi taki miesiąc w roku jest blokowany.
- Zamkniętego miesiąca nie da się zmienić bez świadomego „otwórz ponownie”.
- Logowanie wymaga hasła i kodu z telefonu. Token KSeF ma tylko prawo odczytu faktur i jest zaszyfrowany w bazie.
- Paweł zamyka miesiąc w mniej niż 10 minut.

## Ryzyka

| Ryzyko | Co robimy |
|---|---|
| Uwierzytelnienie lub pobieranie z KSeF nie zadziała | Etap 1 jako próba przed resztą; połączenie z serwera już sprawdzone (HTTP 200) |
| Zła kwota ZUS/PIT | Osobny moduł reguł z testami; każda reguła sprawdzona w oficjalnym źródle; weryfikacja przez Pawła/księgową |
| Zmiana przepisów w nowym roku | Stawki i progi w pliku ustawień roku |
| Włamanie przez stronę gabinetu (to samo konto hostingowe) | Osobna baza i użytkownik, token tylko do odczytu i zaszyfrowany, 2FA |
| Plik DRA odrzucony | Walidacja względem schematu KEDU; import testowy jako dokument roboczy |
| Utrata danych | JetBackup na hostingu – sprawdzić, że obejmuje bazę |

## Źródła

- Wymagania: `docs/brainstorms/2026-10-29-mala-ksiegowa-requirements.md`
- Plan techniczny: `docs/plans/2026-10-29-mala-ksiegowa-plan.md`
- Ideacja: `docs/ideation/2026-10-29-mala-ksiegowa-ideation.md`
