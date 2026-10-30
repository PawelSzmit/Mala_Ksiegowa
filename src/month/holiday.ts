// Wakacje składkowe w aplikacji: wybór miesiąca (najwyżej jeden w roku) i przypomnienie o wniosku RWS.
// Zmiana miesiąca wakacji zmienia kwoty od tego miesiąca w górę (składki, odliczenia, zdrowotna następnego miesiąca),
// więc nie wolno jej zrobić, gdy któryś z tych miesięcy jest już zamknięty.
import { inTransaction, type Queryable } from '../db/books.ts';
import type { Db } from '../db/pool.ts';
import { HttpError } from '../http/http.ts';
import { loadYearConfig } from '../rules/config.ts';
import { rwsApplicationMonth, validateHolidayMonths } from '../rules/holiday.ts';
import { socialContributions } from '../rules/zus.ts';
import { loadPayer, monthName, type PayerRow } from './close.ts';

/** Miesiąc wakacji w każdym z podanych lat (null = bez wakacji). */
export async function loadHolidayMonths(db: Queryable, years: number[]): Promise<Map<number, number | null>> {
  const { rows } = await db.query<{ year: number; holiday_month: number | null }>(
    'SELECT year, holiday_month FROM years WHERE year = ANY($1::int[])', [years],
  );
  return new Map(years.map((y) => [y, rows.find((r) => r.year === y)?.holiday_month ?? null]));
}

/** Ustawia (albo usuwa – `month` null) miesiąc wakacji składkowych w roku `year`. */
export async function saveHolidayMonth(db: Db, year: number, month: number | null): Promise<void> {
  validateHolidayMonths(year, month === null ? [] : [month]);
  await inTransaction(db, async (tx) => {
    await tx.query('INSERT INTO years (year) VALUES ($1) ON CONFLICT DO NOTHING', [year]);
    const { rows: [current] } = await tx.query<{ holiday_month: number | null }>('SELECT holiday_month FROM years WHERE year = $1 FOR UPDATE', [year]);
    const old = current!.holiday_month;
    if (old === month) return;
    // Od którego miesiąca zmieniają się kwoty; grudzień wpływa też na styczeń następnego roku (odliczenie składek).
    const from = Math.min(...[old, month].filter((m): m is number => m !== null));
    const touchesDecember = old === 12 || month === 12;
    const { rows: closed } = await tx.query<{ year: number; month: number }>(
      `SELECT year, month FROM months WHERE status = 'closed' AND ((year = $1 AND month >= $2) OR (year = $1 + 1 AND month = 1 AND $3))
       ORDER BY year DESC, month DESC`, [year, from, touchesDecember],
    );
    if (closed.length) {
      throw new HttpError(409, `Najpierw otwórz ${closed.map((r) => `${monthName(r.month)} ${r.year}`).join(', ')} – zmiana wakacji zmieni ich kwoty.`);
    }
    await tx.query('UPDATE years SET holiday_month = $2 WHERE year = $1', [year, month]);
  });
}

export interface RwsReminder {
  /** Miesiąc wakacji, o który trzeba wnioskować. */
  year: number;
  month: number;
  /** Dane do przepisania do wniosku. */
  payer: PayerRow;
  /** Ile wyniosą składki, z których ZUS zwolni (społeczne + FP); null, gdy brak ustawień tamtego roku. */
  saving: number | null;
}

/** W miesiącu `year`/`month` trzeba złożyć RWS, jeśli następny miesiąc jest miesiącem wakacji. */
export async function rwsReminderFor(db: Queryable, year: number, month: number): Promise<RwsReminder | null> {
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const holidays = await loadHolidayMonths(db, [next.year]);
  if (holidays.get(next.year) !== next.month) return null;
  const rws = rwsApplicationMonth(next.year, next.month);
  if (rws.year !== year || rws.month !== month) return null;
  const payer = await loadPayer(db);
  const { rows: [s] } = await db.query<{ voluntary_sickness: boolean }>('SELECT voluntary_sickness FROM settings WHERE id = 1');
  let saving: number | null = null;
  try {
    saving = socialContributions(loadYearConfig(next.year), { voluntarySickness: s!.voluntary_sickness }).total;
  } catch {
    // Brak pliku ustawień roku – kwotę pokażemy, gdy się pojawi.
  }
  return { ...next, payer, saving };
}
