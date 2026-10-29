# Mała Księgowa – pomysły na start (ideacja)

Data: 2026-10-29
Status: przegląd pomysłów, przed brainstormem. Nic nie zostało jeszcze zbudowane.

## Punkt wyjścia

- Repozytorium jest puste – zaczynamy od zera, nie ma czego poprawiać.
- Skala: kilka faktur kosztowych miesięcznie + jeden dokument przychodowy (raport z kasy fiskalnej).
- Muszą działać trzy rzeczy: pobieranie faktur kosztowych z KSeF, zaksięgowanie ich, przygotowanie deklaracji ZUS.
- Odpada: aplikacja w Swift (na iPhone/Maca).

## Ile pomysłów rozważono

Zebrano 22 pomysły (8 o tym, *na czym* to zbudować, 14 o tym, *co* aplikacja ma robić). Po odsiewie zostało 5 „głównych” plus 3 dodatki na później.

---

## Najpierw trzy rzeczy, które trzeba wiedzieć (bez tego nie da się dobrze zaprojektować)

1. **Forma opodatkowania decyduje o wszystkim.**
   - Ryczałt – faktury kosztowe w ogóle nie wpływają na podatek. Księgujesz tylko przychód. Wtedy „księgowanie kosztów” to po prostu archiwum.
   - Skala lub podatek liniowy – koszty obniżają podatek i składkę zdrowotną. Wtedy aplikacja prowadzi księgę przychodów i rozchodów (KPiR) i liczy co miesiąc zaliczkę na podatek.
2. **VAT.** Kasa fiskalna sugeruje sprzedaż klientom indywidualnym. Jeśli firma jest płatnikiem VAT, to najważniejszym comiesięcznym obowiązkiem jest plik JPK_V7 do urzędu skarbowego, a nie ZUS. Jeśli VAT nie dotyczy (zwolnienie) – temat odpada i wszystko robi się dużo prostsze.
3. **ZUS nie ma „otwartych drzwi” dla aplikacji.** Do KSeF można się legalnie podłączyć automatem (Ministerstwo udostępnia do tego oficjalne wejście). Do ZUS – nie. Realny sposób: aplikacja liczy składki i tworzy gotowy plik deklaracji DRA, a Ty wgrywasz go jednym kliknięciem w eZUS (PUE ZUS ma funkcję importu takiego pliku). To jest jak przygotowany przelew, który tylko zatwierdzasz.

---

## Pomysły, które przetrwały odsiew

### 1. Prosta aplikacja w przeglądarce, na małym serwerze (REKOMENDACJA – technologia)

**Na czym polega:** strona internetowa tylko dla Ciebie (z logowaniem), którą można też „przypiąć” na telefonie jak aplikację – tak jak zrobiłeś w poprzednim projekcie PWA. Pod spodem mały serwer, który sam co noc zagląda do KSeF i ściąga nowe faktury.

**Dlaczego:** działa na Macu, telefonie i każdym komputerze bez instalacji. Brak sklepu Apple, brak Swifta. Serwer może sam pracować w tle (pobierać faktury, przypominać o terminach), nawet gdy laptop jest zamknięty.

**Proste porównanie:** to jak skrzynka pocztowa, która sama odbiera listy (faktury) i układa je w segregatorze – Ty tylko zaglądasz, czy wszystko się zgadza.

**Koszt:** średni (kilka dni pracy z Claude). Hosting: kilkanaście–kilkadziesiąt zł miesięcznie (np. mały serwer VPS).

**Rekomendacja:** robić teraz – jako fundament.

### 2. Automatyczne pobieranie faktur kosztowych z KSeF

**Na czym polega:** aplikacja łączy się z KSeF Twoim tokenem/certyfikatem, raz dziennie pyta „czy są nowe faktury, na których jestem nabywcą?”, pobiera je i pokazuje czytelnie (dostawca, kwota netto/VAT/brutto, data).

**Dlaczego:** to serce całej aplikacji i to, czego wprost chcesz. Faktury z KSeF są „cyfrowe od urodzenia” – wszystkie kwoty są już w środku, nic nie trzeba przepisywać ani rozpoznawać ze zdjęcia.

**Na co uważać:** logowanie do KSeF w wersji 2.0 jest dość skomplikowane (szyfrowanie, certyfikaty). Warto najpierw zrobić małą próbę na środowisku testowym KSeF, zanim zbuduje się resztę. Ministerstwo zapowiadało przejście z tokenów na certyfikaty – trzeba to sprawdzić na etapie planowania.

**Koszt:** średni. **Rekomendacja:** robić teraz, jako pierwszy krok techniczny.

### 3. Księga z „zapamiętywaniem” kategorii

**Na czym polega:** każda pobrana faktura trafia do księgi (KPiR albo prostej ewidencji przy ryczałcie). Przy pierwszej fakturze od danego dostawcy wybierasz kategorię (np. „paliwo”, „towar”, „usługi obce”), a aplikacja zapamiętuje to na przyszłość. Przy kilku fakturach miesięcznie po 2–3 miesiącach wszystko księguje się samo, a Ty tylko klikasz „zatwierdź”.

**Dlaczego:** zamienia księgowanie w przegląd listy, a nie w pracę.

**Koszt:** niski. **Rekomendacja:** robić teraz.

### 4. Wpisanie raportu z kasy fiskalnej w 30 sekund

**Na czym polega:** jeden prosty formularz miesięczny: kwota sprzedaży brutto, z podziałem na stawki VAT (jeśli dotyczy), data raportu. Na później: zrobienie zdjęcia wydruku raportu i automatyczne odczytanie kwot przez AI.

**Dlaczego:** to jedyny przychód, więc musi być bezbłędny. Formularz jest szybszy i pewniejszy niż rozpoznawanie zdjęcia, więc zdjęcie dopiero w drugiej kolejności.

**Uwaga:** jeśli masz kasę online, dane i tak trafiają do urzędu automatycznie – ale do Ciebie ich nie da się łatwo pobrać, więc wpis ręczny zostaje.

**Koszt:** niski. **Rekomendacja:** robić teraz (formularz), zdjęcie – później.

### 5. Wyliczanie ZUS i plik DRA do wgrania w eZUS

**Na czym polega:** aplikacja zna Twoje składki społeczne (pełny/mały ZUS/preferencyjny) i liczy składkę zdrowotną z dochodu z księgi (przy skali/liniowym zależy ona od dochodu, przy ryczałcie od progu przychodu). Tworzy gotowy plik deklaracji DRA, który importujesz w PUE ZUS, oraz podaje kwotę do przelewu na Twój rachunek składkowy.

**Dlaczego:** to drugi z Twoich celów. Uczciwie: w pełni automatycznego wysłania do ZUS nie da się zrobić, ale „jedno kliknięcie wgraj” jest bardzo blisko.

**Na co uważać:** roczne rozliczenie składki zdrowotnej (w deklaracji za kwiecień) – warto o nim pomyśleć od razu, żeby aplikacja zbierała dane przez cały rok.

**Koszt:** średni (najwięcej pracy w poprawnym pliku, nie w liczeniu). **Rekomendacja:** robić teraz, zaraz po KSeF.

---

## Dodatki na później

| Pomysł | Dlaczego później |
|---|---|
| Przypomnienia o terminach (ZUS i podatek do 20., VAT do 25.) – mail lub powiadomienie | Tanie i przydatne, ale dopiero gdy jest co przypominać |
| Wyliczenie miesięcznej zaliczki na podatek | Potrzebne tylko przy skali/liniowym; zależy od odpowiedzi z sekcji „trzy rzeczy” |
| Dodawanie kosztów spoza KSeF (zdjęcie paragonu, faktura zagraniczna np. za oprogramowanie) | Takie koszty się zdarzą (np. Google, Apple, OpenAI nie wystawiają faktur w KSeF), ale na start można je wpisać ręcznie |

## Pomysły odrzucone (i dlaczego)

- **Aplikacja w Swift** – sam ją odrzuciłeś; poza tym zamyka Cię w świecie Apple.
- **Sam n8n + arkusz Google** – kuszące, bo n8n znasz, ale logowanie do KSeF wymaga szyfrowania, które w n8n robi się „na siłę” i łatwo się psuje. Arkusz jako księga też nie daje kontroli nad błędami. n8n może się przydać później do drobnych automatyzacji (np. przypomnień), ale nie jako fundament.
- **Aplikacja tylko na Macu (uruchamiana lokalnie)** – dane zostają w domu, co jest plusem, ale komputer musi być włączony, żeby ściągać faktury, i nie zajrzysz z telefonu.
- **Od razu wersja dla wielu firm (produkt SaaS na sprzedaż)** – za dużo na start: bezpieczeństwo danych wielu klientów, RODO, odpowiedzialność za błędy w podatkach. Najpierw niech zadziała dla Ciebie.
- **Automatyczne wysyłanie do ZUS** – brak oficjalnego wejścia dla takich aplikacji; obejścia byłyby kruche i ryzykowne.
- **AI odczytujące faktury** – zbędne przy KSeF, bo faktury mają już wszystkie dane w środku. AI ma sens tylko przy paragonach/zdjęciach.
- **Łączenie z bankiem i dopasowywanie przelewów** – przy kilku fakturach miesięcznie więcej pracy niż pożytku.

## Szczera uwaga: kup zamiast budować?

Gotowe programy online (np. inFakt, wFirma, Fakturownia z księgowością) kosztują kilkadziesiąt zł miesięcznie i już robią KSeF, KPiR i ZUS. Jeśli celem jest wyłącznie „mieć księgowość z głowy” – to tańsza i bezpieczniejsza droga. Budowanie ma sens, jeśli chcesz mieć coś swojego, prostszego, albo traktujesz to jako wprawkę/pomysł na usługę dla klientów. To decyzja do brainstormu, nie powód, żeby nie zaczynać.

## Ranking i rodzaj inwestycji

| # | Pomysł | Rodzaj | Rekomendacja |
|---|---|---|---|
| 1 | Aplikacja w przeglądarce na małym serwerze | fundament, średnia inwestycja | teraz |
| 2 | Pobieranie faktur z KSeF | średnia inwestycja, największe ryzyko techniczne | teraz – jako pierwsza próba |
| 3 | Księga z zapamiętywaniem kategorii | szybka wygrana | teraz |
| 4 | Formularz raportu z kasy | szybka wygrana | teraz |
| 5 | ZUS + plik DRA do eZUS | średnia inwestycja | teraz, po KSeF |

## Następny krok

Brainstorm (dev-brainstorm) z trzema pytaniami na start:
1. Jaka forma opodatkowania: ryczałt, skala czy liniowy?
2. Czy firma jest płatnikiem VAT?
3. Jaki ZUS płacisz (pełny, mały ZUS plus, preferencyjny, ulga na start)?
