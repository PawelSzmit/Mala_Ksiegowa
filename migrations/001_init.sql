-- Mała Księgowa: schemat początkowy. Kwoty w groszach (bigint).

CREATE TABLE users (
  id            serial PRIMARY KEY,
  username      text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  totp_secret_enc text NOT NULL,           -- sekret TOTP zaszyfrowany kluczem APP_ENCRYPTION_KEY
  totp_last_step bigint NOT NULL DEFAULT 0, -- ostatni użyty krok TOTP (ten sam kod nie zadziała drugi raz)
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id_hash     text PRIMARY KEY,             -- SHA-256 losowego identyfikatora z ciasteczka
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_expires_at ON sessions (expires_at);

-- Jeden wiersz: dane firmy i dostęp do KSeF.
CREATE TABLE settings (
  id             smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nip            text,
  pesel          text,
  first_name     text,
  last_name      text,
  ksef_env       text NOT NULL DEFAULT 'prod' CHECK (ksef_env IN ('test', 'demo', 'prod')),
  ksef_token_enc text,                      -- token KSeF zaszyfrowany kluczem APP_ENCRYPTION_KEY
  voluntary_sickness boolean NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
INSERT INTO settings (id) VALUES (1);

-- Ustawienia roku zależne od Pawła (stawki i progi są w config/years/*.json).
CREATE TABLE years (
  year          integer PRIMARY KEY,
  holiday_month integer CHECK (holiday_month BETWEEN 1 AND 12)  -- wakacje składkowe: najwyżej jeden miesiąc
);

CREATE TABLE invoices (
  id                     serial PRIMARY KEY,
  ksef_number            text NOT NULL UNIQUE,  -- chroni przed duplikatami przy ponownym pobraniu
  invoice_number         text NOT NULL,
  seller_nip             text,
  seller_name            text,
  issue_date             date NOT NULL,
  permanent_storage_date timestamptz,
  gross_amount           bigint NOT NULL,
  currency               text NOT NULL DEFAULT 'PLN',
  invoice_type           text,
  xml                    text NOT NULL,
  status                 text NOT NULL DEFAULT 'to_review' CHECK (status IN ('to_review', 'cost', 'not_cost')),
  decided_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoices_status ON invoices (status);

CREATE TABLE manual_costs (
  id            serial PRIMARY KEY,
  cost_date     date NOT NULL,
  document_number text NOT NULL,
  counterparty  text NOT NULL,
  description   text NOT NULL,
  amount        bigint NOT NULL,
  attachment_name text,
  attachment    bytea,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cash_reports (
  id          serial PRIMARY KEY,
  year        integer NOT NULL,
  month       integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  report_date date NOT NULL,
  amount      bigint NOT NULL,
  photo_name  text,
  photo       bytea,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

-- Księga przychodów i rozchodów. Dokładny układ kolumn doprecyzuje etap 5.
CREATE TABLE kpir_entries (
  id              serial PRIMARY KEY,
  year            integer NOT NULL,
  month           integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  entry_date      date NOT NULL,
  document_number text NOT NULL,
  counterparty    text,
  description     text NOT NULL,
  revenue         bigint NOT NULL DEFAULT 0,
  other_costs     bigint NOT NULL DEFAULT 0,
  source          text NOT NULL CHECK (source IN ('invoice', 'manual_cost', 'cash_report', 'fp')),
  source_id       integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);
CREATE INDEX kpir_entries_period ON kpir_entries (year, month);

CREATE TABLE months (
  year       integer NOT NULL,
  month      integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  results    jsonb,                          -- wynik computeYear zapisany przy zamknięciu
  closed_at  timestamptz,
  PRIMARY KEY (year, month)
);
