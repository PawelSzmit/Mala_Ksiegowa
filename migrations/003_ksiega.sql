-- Etap 5: kolumny księgi wg wzoru obowiązującego od 2026 r. (Dz.U. 2025 poz. 1299).
ALTER TABLE kpir_entries
  ADD COLUMN ksef_number          text,  -- kolumna 3: numer faktury w KSeF
  ADD COLUMN counterparty_tax_id  text,  -- kolumna 5: identyfikator podatkowy kontrahenta (z kodem kraju)
  ADD COLUMN notes                text;  -- kolumna 19: uwagi
-- Data otrzymania kosztu spoza KSeF (decyduje o miesiącu wpisu, jak przy fakturach z KSeF).
ALTER TABLE manual_costs ADD COLUMN received_date date;
UPDATE manual_costs SET received_date = cost_date WHERE received_date IS NULL;
