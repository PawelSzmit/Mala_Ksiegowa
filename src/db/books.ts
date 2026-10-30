// Wspólne zasady zapisu do księgi: zamknięty miesiąc jest nietykalny, każdy dokument ma najwyżej jeden wpis.
import type pg from 'pg';
import { HttpError } from '../http/http.ts';
import type { Db } from './pool.ts';

export type Queryable = Db | pg.PoolClient;

/** Dzień otrzymania faktury z KSeF (nadanie numeru KSeF), czas polski – decyduje o miesiącu kosztu (zasada 9. dnia). */
export const RECEIVED_DATE_SQL = "to_char(COALESCE(permanent_storage_date, created_at) AT TIME ZONE 'Europe/Warsaw', 'YYYY-MM-DD')";

export const periodOf = (isoDate: string) => ({ year: Number(isoDate.slice(0, 4)), month: Number(isoDate.slice(5, 7)) });

export async function assertMonthOpen(db: Queryable, year: number, month: number): Promise<void> {
  // FOR SHARE: gdy właśnie trwa zamykanie tego miesiąca (FOR UPDATE), zapis czeka na jego koniec i dostaje „zamknięty”.
  const { rows } = await db.query<{ status: string }>('SELECT status FROM months WHERE year = $1 AND month = $2 FOR SHARE', [year, month]);
  if (rows[0]?.status === 'closed') {
    throw new HttpError(409, `Miesiąc ${String(month).padStart(2, '0')}.${year} jest zamknięty – zmiany w nim wymagają ponownego otwarcia.`);
  }
}

export interface KpirEntryInput {
  entryDate: string;
  documentNumber: string;
  counterparty: string | null;
  description: string;
  revenue?: number;
  otherCosts?: number;
  source: 'invoice' | 'manual_cost' | 'cash_report' | 'fp';
  sourceId: number;
  /** Kolumna 3: numer faktury w KSeF. */
  ksefNumber?: string | null;
  /** Kolumna 5: identyfikator podatkowy kontrahenta z kodem kraju, np. PL5260250274. */
  counterpartyTaxId?: string | null;
  /** Kolumna 7: adres kontrahenta (gdy brak identyfikatora podatkowego). */
  counterpartyAddress?: string | null;
  /** Kolumna 19: uwagi. */
  notes?: string | null;
}

/** Wpis do księgi dla dokumentu; ponowny zapis tego samego dokumentu nadpisuje wpis zamiast tworzyć drugi. */
export async function upsertKpirEntry(db: Queryable, e: KpirEntryInput): Promise<void> {
  const { year, month } = periodOf(e.entryDate);
  await assertMonthOpen(db, year, month);
  await db.query(
    `INSERT INTO kpir_entries (year, month, entry_date, document_number, counterparty, description, revenue, other_costs, source, source_id,
       ksef_number, counterparty_tax_id, notes, counterparty_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (source, source_id) DO UPDATE SET
       year = EXCLUDED.year, month = EXCLUDED.month, entry_date = EXCLUDED.entry_date, document_number = EXCLUDED.document_number,
       counterparty = EXCLUDED.counterparty, description = EXCLUDED.description, revenue = EXCLUDED.revenue, other_costs = EXCLUDED.other_costs,
       ksef_number = EXCLUDED.ksef_number, counterparty_tax_id = EXCLUDED.counterparty_tax_id, notes = EXCLUDED.notes,
       counterparty_address = EXCLUDED.counterparty_address`,
    [year, month, e.entryDate, e.documentNumber, e.counterparty, e.description, e.revenue ?? 0, e.otherCosts ?? 0, e.source, e.sourceId,
      e.ksefNumber ?? null, e.counterpartyTaxId ?? null, e.notes ?? null, e.counterpartyAddress ?? null],
  );
}

/** Usuwa wpis dokumentu z księgi (miesiąc wpisu musi być otwarty). */
export async function deleteKpirEntry(db: Queryable, source: KpirEntryInput['source'], sourceId: number): Promise<void> {
  const { rows } = await db.query<{ year: number; month: number }>('SELECT year, month FROM kpir_entries WHERE source = $1 AND source_id = $2', [source, sourceId]);
  if (!rows[0]) return;
  await assertMonthOpen(db, rows[0].year, rows[0].month);
  await db.query('DELETE FROM kpir_entries WHERE source = $1 AND source_id = $2', [source, sourceId]);
}

/** Kilka zapytań jako całość: albo wszystkie, albo żadne. */
export async function inTransaction<T>(db: Db, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
