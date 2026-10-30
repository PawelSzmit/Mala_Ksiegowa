# Token KSeF dla Małej Księgowej

Aplikacja pobiera z KSeF Twoje faktury kosztowe. Żeby mogła to robić bez codziennego logowania Profilem Zaufanym, potrzebuje **tokenu**, czyli długiego ciągu znaków. Działa jak klucz, który otwiera tylko jedne drzwi: oglądanie faktur. Token nie pozwala wystawiać faktur w Twoim imieniu.

## Termin: wygeneruj token przed 31 grudnia 2026 r.

Ministerstwo Finansów podaje, że Aplikacja Podatnika KSeF 2.0 generuje tokeny **do 31 grudnia 2026 r.** (strona „Aplikacja Podatnika KSeF 2.0” na ksef.podatki.gov.pl, stan na 15.10.2026).

Token wygenerowany wcześniej działa dalej. Podręcznik KSeF 2.0 (cz. I, rozdz. 2.4.2) mówi: *„Wygenerowany token pozostaje ważny do czasu jego unieważnienia przez użytkownika”*.

Najlepiej więc zrobić to w grudniu 2026, razem z wdrożeniem aplikacji.

## Krok po kroku

Na podstawie Podręcznika KSeF 2.0 cz. I, rozdz. 2.4.6. Jest też film instruktażowy „10 Generowanie tokena” w zakładce „Pliki do pobrania KSeF” na ksef.podatki.gov.pl.

1. Wejdź na **https://ap.ksef.mf.gov.pl** (Aplikacja Podatnika KSeF 2.0, wersja produkcyjna).
2. Zaloguj się **Profilem Zaufanym** („Węzeł krajowy”), we własnym imieniu, na swój NIP.
3. W menu wybierz **Tokeny → Generuj token**.
4. Wpisz nazwę tokenu, np. `Mała Księgowa – odczyt`.
5. Zaznacz **tylko uprawnienie do przeglądania (dostępu do) faktur**. Nie zaznaczaj wystawiania faktur ani zarządzania uprawnieniami.
6. Kliknij **„Generuj token”**.
7. Token wyświetla się **tylko raz**. Skopiuj go od razu i od razu wklej w Małej Księgowej: **Ustawienia → Token KSeF → Zapisz**. Przy pierwszym ustawieniu wpisz też NIP i datę „Pobieraj faktury otrzymane od dnia” = `2027-01-01`.
8. Na stronie **Faktury** kliknij „Sprawdź teraz”. Powinien pojawić się czas ostatniej udanej synchronizacji.

## Czego nie robić

- Nie wysyłaj tokenu mailem ani w czacie (także do Claude). Nie zapisuj go w notatkach ani na zrzucie ekranu.
- Jeśli musisz go gdzieś przechować, to tylko w menedżerze haseł.
- Aplikacja trzyma token zaszyfrowany i nigdzie go już nie pokazuje.

## Gdy coś pójdzie nie tak

- **Token mógł wyciec** (np. trafił do maila): w Aplikacji Podatnika wejdź w **Tokeny**, unieważnij go (film „11 Unieważnienie tokena”), wygeneruj nowy i wklej w Ustawieniach.
  - Uwaga: po 31.12.2026 nowego tokenu może nie dać się wygenerować. Wtedy aplikacja będzie potrzebowała certyfikatu KSeF, a to osobna praca do zrobienia z Claude.
- **Aplikacja pokazuje błąd pobierania z KSeF:**
  - sprawdź komunikat na stronie Faktury;
  - token przestaje działać po jego unieważnieniu albo po odebraniu uprawnień;
  - przy zamykaniu miesiąca aplikacja ostrzeże, jeśli pobieranie nie działa od ponad 2 dni.
