-- Etap 4: pobieranie faktur z KSeF, przegląd, koszty spoza KSeF, raport z kasy.

-- Faktura trafia do bazy od razu z metadanymi; XML dociągamy osobno (gdy pobranie się nie uda, spróbujemy przy następnej synchronizacji).
ALTER TABLE invoices ALTER COLUMN xml DROP NOT NULL;
ALTER TABLE invoices
  ADD COLUMN is_correction     boolean NOT NULL DEFAULT false,
  ADD COLUMN corrected         jsonb,      -- [{invoiceNumber, issueDate, ksefNumber}] z faktury korygującej
  ADD COLUMN correction_reason text,
  ADD COLUMN items             jsonb,      -- pozycje faktury (nazwa, ilość, kwoty)
  ADD COLUMN parse_error       text,       -- gdy XML nie dał się odczytać
  ADD COLUMN pln_amount        bigint;     -- kwota w zł do księgi, gdy faktura jest w obcej walucie (wpisuje Paweł)
CREATE INDEX invoices_missing_xml ON invoices (id) WHERE xml IS NULL;

-- Stan synchronizacji z KSeF (jeden wiersz ustawień).
ALTER TABLE settings
  ADD COLUMN ksef_sync_from        date,          -- od kiedy pobierać faktury (pierwsza synchronizacja)
  ADD COLUMN ksef_next_from        timestamptz,   -- początek następnego okna (znacznik kompletności KSeF)
  ADD COLUMN ksef_last_success_at  timestamptz,
  ADD COLUMN ksef_last_attempt_at  timestamptz,
  ADD COLUMN ksef_last_error       text;

ALTER TABLE manual_costs ADD COLUMN attachment_type text;
ALTER TABLE cash_reports ADD COLUMN photo_type text;
