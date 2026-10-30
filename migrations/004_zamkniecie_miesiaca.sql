-- Etap 6: zamknięcie miesiąca, ZUS (DRA), PIT.

-- Dane płatnika do DRA (imię, nazwisko i PESEL są już w tabeli od etapu 3).
ALTER TABLE settings
  ADD COLUMN regon       text,   -- 9 albo 14 cyfr (opcjonalnie)
  ADD COLUMN short_name  text;   -- nazwa skrócona z CEIDG (opcjonalnie)

-- Dochód z grudnia poprzedniego roku, gdy tamtego roku nie ma w aplikacji (podstawa zdrowotnej za styczeń).
ALTER TABLE years ADD COLUMN previous_december_income bigint;

-- Kontrahent kosztu spoza KSeF: identyfikator podatkowy (kol. 5) albo adres (kol. 7) – wzór KPiR od 2026 r.
ALTER TABLE manual_costs
  ADD COLUMN counterparty_tax_id  text,
  ADD COLUMN counterparty_address text;
ALTER TABLE kpir_entries ADD COLUMN counterparty_address text;
