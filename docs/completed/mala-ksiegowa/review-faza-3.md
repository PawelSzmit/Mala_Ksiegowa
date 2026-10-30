# Review etapu 3 – szkielet, baza, logowanie

Data: 2026-10-30 · Gałąź: `claude/project-thread-eptw6o` (commit etapu 3 wypchnięty, drzewo czyste)
Decyzja: **można iść dalej z zastrzeżeniami** – 0×P1, 2×P2, 6×P3.

## Ustalenia

### P2-1. Równoległe próby logowania omijają blokadę i ochronę przed ponownym użyciem kodu
`src/auth/login.ts:34-61` najpierw czyta `failed_logins` i `totp_last_step`, a potem zapisuje nową wartość. Gdy przyjdzie wiele prób naraz, każda widzi ten sam stary licznik.
- **Sprawdzone:** 20 równoległych błędnych prób dało `failed_logins = 2` i konto nie zostało zablokowane. Limit 5 prób chroni więc tylko przed atakiem „po kolei”.
- **Ten sam mechanizm przy kodzie TOTP:** dwa jednoczesne logowania tym samym kodem mogą oba przejść.
- **Skala ryzyka:** napastnik nadal potrzebuje hasła i kodu, a scrypt ogranicza tempo zgadywania. Mimo to blokada jest główną obroną konta z danymi finansowymi.
- **Poprawka:**
  - zwiększać licznik w jednym zapytaniu (`UPDATE … SET failed_logins = failed_logins + 1 … RETURNING`);
  - zapisywać krok TOTP warunkowo (`UPDATE … WHERE totp_last_step < $krok RETURNING id`; brak zwróconego wiersza oznacza odmowę);
  - dodać test z równoległymi próbami.

### P2-2. Zepsute ciasteczko w przeglądarce blokuje całą aplikację (błąd 500)
`src/http/http.ts:9`: `decodeURIComponent` rzuca wyjątek na niepoprawnym `%`. Ciasteczka są czytane przed obsługą `/logowanie`, więc nie da się nawet otworzyć strony logowania.
- **Sprawdzone:** ciasteczko `x=%E0%A4%A` daje 500 na `/logowanie`.
- **Skąd takie ciasteczko:** może je zostawić inna aplikacja w tej samej domenie (np. strona za-horyzont.pl, jeśli ustawi ciasteczko na całą domenę).
- **Skutek:** Paweł widzi tylko „nieoczekiwany błąd” i nie wie, że pomoże wyczyszczenie ciasteczek.
- **Poprawka:** przy błędzie dekodowania pominąć dane ciasteczko; dodać test.

### P3
1. **Odgadnięcie loginu:** po 5 próbach na istniejący login pojawia się komunikat o blokadzie, a na nieistniejący nigdy (`src/app.ts:56-59`). Pozwala to sprawdzić, czy login jest prawdziwy. Przy jednym koncie to niewielkie ryzyko. Można zwracać ten sam komunikat albo blokować także nieistniejące loginy.
2. **Celowe blokowanie Pawła:** obcy może co 15 minut zablokować konto Pawła. To akceptowalne przy jednym użytkowniku. Odnotowane, bez zmian.
3. **Sprawdzanie adresu formularza za pośrednikiem:** `isSameOrigin` (`src/http/http.ts:59`) porównuje Origin z nagłówkiem Host. Jeśli Passenger w cPanelu podmieni Host, logowanie na produkcji dostanie 403. Do sprawdzenia przy wdrożeniu (etap 8).
4. **Zerwanie połączenia z bazą:** `src/db/pool.ts` nie nasłuchuje zdarzenia `error` puli `pg`. Gdy baza zerwie bezczynne połączenie, proces się wywraca. Passenger go podniesie, ale lepiej dopisać `pool.on('error', …)` z logiem.
5. **Test kasuje schemat bazy z `TEST_DATABASE_URL`:** `test/app.test.ts` nie ma zabezpieczenia przed wskazaniem prawdziwej bazy. Warto odmawiać, gdy nazwa bazy nie zawiera „test”.
6. **`/zdrowie` nie sprawdza bazy:** zwraca „ok” także wtedy, gdy baza nie działa. Do rozważenia przy wdrożeniu.

## Co jest dobrze
- **Hasła i sesje:**
  - hasła w scrypt z porównaniem odpornym na pomiar czasu;
  - przy nieistniejącym loginie liczony jest „udawany” hash;
  - w bazie leży tylko skrót identyfikatora sesji;
  - przy logowaniu powstaje nowa sesja, a stara jest kasowana;
  - wylogowanie działa wyłącznie przez POST.
- **Ciasteczko:** HttpOnly, SameSite=Strict, Secure (domyślnie włączone).
- **Nagłówki i strony:** komplet nagłówków bezpieczeństwa (CSP bez skryptów, zakaz osadzania w ramce, brak cache). HTML escapowany automatycznie.
- **Sekrety:** sekret TOTP i token KSeF szyfrowane AES-256-GCM kluczem spoza bazy.
- **Migracje:** wykonywane w transakcji, z blokadą przed równoległym uruchomieniem, ponowne uruchomienie niczego nie psuje.
- **Testy:** 57/57 (48 bez bazy), typecheck czysty. Pokrywają przekierowania, ciasteczko, blokadę i odblokowanie, ponowne użycie kodu, obcy Origin i 404.
- **Zgodność z planem:** zakres zgodny. Odejście od Hono/Fastify na rzecz `node:http` jest uzasadnione i zapisane w kontekście.

## Wydajność
Przy jednym użytkowniku bez znaczenia:
- scrypt trwa ok. 50–100 ms na logowanie;
- sprzątanie wygasłych sesji odbywa się przy każdym logowaniu;
- indeks na `expires_at` jest założony.
