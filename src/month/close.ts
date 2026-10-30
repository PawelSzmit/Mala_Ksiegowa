// Zamknięcie miesiąca: wyliczenie ZUS i PIT z księgi (moduł reguł z etapu 2), zapis wyniku, blokada miesiąca.
// Kolejność: miesiące roku zamyka się po kolei, bo PIT i zdrowotna liczą się narastająco od stycznia.
import { assertMonthOpen, deleteKpirEntry, inTransaction, RECEIVED_DATE_SQL, upsertKpirEntry, type Queryable } from '../db/books.ts';
import type { Db } from '../db/pool.ts';
import { lastDayOfMonth, warsawToday } from '../dates.ts';
import { HttpError } from '../http/http.ts';
import { costBookingDate } from '../rules/booking.ts';
import { loadYearConfig, type YearConfig } from '../rules/config.ts';
import { computeYear, type YearMonthResult } from '../rules/year.ts';
import { isValidPesel, type DraPayer } from '../zus/kedu-dra.ts';

const MONTH_NAMES = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
export const monthName = (month: number) => MONTH_NAMES[month - 1]!;
const mm = (month: number) => String(month).padStart(2, '0');

/** Dzień, w którym Paweł płaci składki ZUS (ustawowy termin to 20.); FP zapłacony tego dnia trafia do księgi. */
export const ZUS_PAYMENT_DAY = 10;
/** Termin zaliczki PIT (mikrorachunek podatkowy). */
export const PIT_PAYMENT_DAY = 20;

/** Wynik zapisany przy zamknięciu – z niego powstaje plik DRA i ekran kwot. */
export interface SavedMonthResult {
  result: YearMonthResult;
  warnings: string[];
  /** Dochód z miesiąca poprzedzającego (DRA, blok XI p2). */
  previousMonthIncome: number;
  socialBase: number;
  accidentRate: number;
  configStatus: YearConfig['status'];
}

export interface MonthClosePreview extends SavedMonthResult {
  year: number;
  month: number;
  status: 'open' | 'closed';
  /** Powody, dla których nie można zamknąć miesiąca. */
  blockers: string[];
  /** Brak dochodu z grudnia poprzedniego roku – pokazujemy pole do wpisania (tylko styczeń). */
  needsDecemberIncome: boolean;
  /** Poprzednie wyliczenie (po ponownym otwarciu) – do porównania kwot. */
  previous: SavedMonthResult | null;
}

export interface PayerRow {
  nip: string | null;
  pesel: string | null;
  first_name: string | null;
  last_name: string | null;
  regon: string | null;
  short_name: string | null;
}

/** Braki w danych płatnika potrzebnych do DRA (pusta lista = komplet). */
export function payerProblems(p: PayerRow): string[] {
  const missing: string[] = [];
  if (!p.nip) missing.push('NIP');
  if (!p.pesel || !isValidPesel(p.pesel)) missing.push('PESEL');
  if (!p.first_name?.trim()) missing.push('imię');
  if (!p.last_name?.trim()) missing.push('nazwisko');
  return missing;
}

export const toDraPayer = (p: PayerRow): DraPayer => ({
  nip: p.nip!, pesel: p.pesel!, firstName: p.first_name!, lastName: p.last_name!, regon: p.regon, shortName: p.short_name,
});

export async function loadPayer(db: Queryable): Promise<PayerRow> {
  const { rows: [p] } = await db.query<PayerRow>('SELECT nip, pesel, first_name, last_name, regon, short_name FROM settings WHERE id = 1');
  return p!;
}

/** Faktury czekające na decyzję, których koszt trafi do miesiąca `year`/`month` (zasada 9. dnia). */
export async function pendingInvoicesFor(db: Queryable, year: number, month: number): Promise<number> {
  const { rows } = await db.query<{ issue_date: string; received_date: string }>(
    `SELECT issue_date, ${RECEIVED_DATE_SQL} AS received_date FROM invoices WHERE status = 'to_review'`,
  );
  const prefix = `${year}-${mm(month)}`;
  return rows.filter((r) => costBookingDate(r.issue_date, r.received_date).startsWith(prefix)).length;
}

function tryLoadConfig(year: number): YearConfig | undefined {
  try {
    return loadYearConfig(year);
  } catch {
    return undefined;
  }
}

/** Wylicza miesiąc (bez zapisu) i sprawdza, czy da się go zamknąć. */
export async function previewMonth(db: Queryable, year: number, month: number, nowMs: number): Promise<MonthClosePreview> {
  // Po kolei, nie równolegle: przy zamykaniu to jedno połączenie w transakcji (pg nie pozwala na równoległe zapytania).
  const monthsRes = await db.query<{ year: number; month: number; status: 'open' | 'closed'; results: SavedMonthResult | null }>(
    'SELECT year, month, status, results FROM months WHERE (year = $1 AND month <= $2) OR (year = $1 - 1 AND month = 12)', [year, month],
  );
  // Fundusz Pracy (source = 'fp') dolicza moduł reguł z wpłat – w danych wejściowych nie może go być drugi raz.
  const sums = await db.query<{ month: number; revenue: string; costs: string; n: number }>(
    `SELECT month, sum(revenue) AS revenue, coalesce(sum(other_costs) FILTER (WHERE source <> 'fp'), 0) AS costs, count(*)::int AS n
     FROM kpir_entries WHERE year = $1 AND month <= $2 GROUP BY month`, [year, month],
  );
  const cash = await db.query<{ month: number }>('SELECT month FROM cash_reports WHERE year = $1 AND month <= $2', [year, month]);
  const yearsRes = await db.query<{ year: number; holiday_month: number | null; previous_december_income: string | null }>(
    'SELECT year, holiday_month, previous_december_income FROM years WHERE year IN ($1, $1 - 1)', [year],
  );
  const settings = await db.query<{ voluntary_sickness: boolean }>('SELECT voluntary_sickness FROM settings WHERE id = 1');
  const payer = await loadPayer(db);
  const pending = await pendingInvoicesFor(db, year, month);

  const state = (m: number) => monthsRes.rows.find((r) => r.year === year && r.month === m);
  const thisYear = yearsRes.rows.find((r) => r.year === year);
  const lastYear = yearsRes.rows.find((r) => r.year === year - 1);
  const december = monthsRes.rows.find((r) => r.year === year - 1 && r.month === 12);
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Dochód z grudnia poprzedniego roku: z zamkniętego grudnia w aplikacji albo wpisany ręcznie.
  let previousDecemberHealthIncome: number | undefined;
  if (december?.status === 'closed' && december.results) previousDecemberHealthIncome = december.results.result.healthIncome;
  else if (thisYear?.previous_december_income != null) previousDecemberHealthIncome = Number(thisYear.previous_december_income);

  const withData = new Set([...sums.rows.map((r) => r.month), ...cash.rows.map((r) => r.month)]);
  const emptyEarlier: number[] = [];
  for (let m = 1; m < month; m++) {
    if (state(m)?.status === 'closed') continue;
    if (withData.has(m)) blockers.push(`Najpierw zamknij ${monthName(m)} – kwoty liczą się narastająco od stycznia.`);
    else emptyEarlier.push(m);
  }
  if (emptyEarlier.length) {
    warnings.push(`Brak zapisów za: ${emptyEarlier.map(monthName).join(', ')}. Liczę tak, jakby w tych miesiącach nie było przychodu ani kosztów.`);
  }
  if (!cash.rows.some((r) => r.month === month)) blockers.push('Wpisz raport z kasy za ten miesiąc (także gdy sprzedaż była zerowa – wtedy 0).');
  if (pending) blockers.push(`Faktury z KSeF, które należą do tego miesiąca, czekają na decyzję: ${pending}. Rozstrzygnij je najpierw.`);
  if (warsawToday(nowMs) <= lastDayOfMonth(year, month)) blockers.push('Miesiąc jeszcze trwa – zamknąć go można od pierwszego dnia następnego miesiąca.');
  const missing = payerProblems(payer);
  if (missing.length) blockers.push(`Uzupełnij w Ustawieniach dane do deklaracji ZUS: ${missing.join(', ')}.`);
  const status = state(month)?.status ?? 'open';
  if (status === 'closed') blockers.push('Miesiąc jest już zamknięty.');

  const config = tryLoadConfig(year);
  if (!config) throw new HttpError(409, `Brak ustawień stawek na rok ${year} – trzeba je dodać, zanim zamkniesz miesiąc.`);
  const months = Array.from({ length: month }, (_, i) => {
    const row = sums.rows.find((r) => r.month === i + 1);
    return { month: i + 1, revenue: Number(row?.revenue ?? 0), costs: Number(row?.costs ?? 0) };
  });
  const computed = computeYear({
    config,
    previousConfig: tryLoadConfig(year - 1),
    months,
    holidayMonths: thisYear?.holiday_month ? [thisYear.holiday_month] : [],
    previousDecemberHoliday: lastYear?.holiday_month === 12,
    previousDecemberHealthIncome,
    voluntarySickness: settings.rows[0]!.voluntary_sickness,
  });
  const result = computed.months[month - 1]!;
  const previousMonthIncome = month === 1 ? (previousDecemberHealthIncome ?? 0) : computed.months[month - 2]!.healthIncome;

  return {
    year, month, status, blockers,
    // Dochód z grudnia ma znaczenie tylko dla stycznia (zdrowotna) – w innych miesiącach ostrzeżenie byłoby mylące.
    warnings: [...warnings, ...computed.warnings.filter((w) => month === 1 || !w.startsWith('Brak dochodu z grudnia'))],
    needsDecemberIncome: month === 1 && previousDecemberHealthIncome === undefined,
    previous: state(month)?.results ?? null,
    result, previousMonthIncome,
    socialBase: config.social.base,
    accidentRate: config.social.rates.wypadkowe,
    configStatus: config.status,
  };
}

/** Zamyka miesiąc: wpis Funduszu Pracy do księgi (kol. 15), zapis wyliczenia, blokada zmian. */
export async function closeMonth(db: Db, year: number, month: number, nowMs: number): Promise<SavedMonthResult> {
  return inTransaction(db, async (tx) => {
    await tx.query('INSERT INTO months (year, month) VALUES ($1, $2) ON CONFLICT DO NOTHING', [year, month]);
    await tx.query('SELECT 1 FROM months WHERE year = $1 AND month = $2 FOR UPDATE', [year, month]);
    const preview = await previewMonth(tx, year, month, nowMs);
    if (preview.blockers.length) throw new HttpError(409, preview.blockers.join(' '));

    // Fundusz Pracy zapłacony w tym miesiącu (za poprzedni) to koszt tego miesiąca – wpis w księdze, kol. 15.
    const fp = preview.result.socialPaid.funduszPracy;
    const fpId = year * 100 + month;
    if (fp > 0) {
      const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
      await upsertKpirEntry(tx, {
        entryDate: `${year}-${mm(month)}-${String(ZUS_PAYMENT_DAY).padStart(2, '0')}`,
        documentNumber: `Przelew ZUS za ${mm(prev.m)}/${prev.y}`,
        counterparty: 'Zakład Ubezpieczeń Społecznych',
        counterpartyAddress: 'ul. Szamocka 3, 5, 01-748 Warszawa',
        description: `Składka na Fundusz Pracy i Fundusz Solidarnościowy za ${monthName(prev.m)} ${prev.y}`,
        otherCosts: fp,
        source: 'fp',
        sourceId: fpId,
      });
    } else {
      await deleteKpirEntry(tx, 'fp', fpId);
    }

    const saved: SavedMonthResult = {
      result: preview.result, warnings: preview.warnings, previousMonthIncome: preview.previousMonthIncome,
      socialBase: preview.socialBase, accidentRate: preview.accidentRate, configStatus: preview.configStatus,
    };
    await tx.query("UPDATE months SET status = 'closed', results = $3, closed_at = $4 WHERE year = $1 AND month = $2",
      [year, month, JSON.stringify(saved), new Date(nowMs)]);
    return saved;
  });
}

/** Otwiera miesiąc ponownie. Późniejsze zamknięte miesiące zależą od niego, więc trzeba je otworzyć wcześniej. */
export async function reopenMonth(db: Db, year: number, month: number): Promise<void> {
  await inTransaction(db, async (tx) => {
    const { rows } = await tx.query<{ year: number; month: number; status: string }>(
      `SELECT year, month, status FROM months
       WHERE (year = $1 AND month >= $2) OR (year = $1 + 1 AND month = 1 AND $2 = 12) FOR UPDATE`, [year, month],
    );
    if (rows.find((r) => r.year === year && r.month === month)?.status !== 'closed') throw new HttpError(409, 'Ten miesiąc nie jest zamknięty.');
    const later = rows.filter((r) => r.status === 'closed' && (r.year > year || r.month > month)).sort((a, b) => b.year - a.year || b.month - a.month);
    if (later.length) {
      throw new HttpError(409, `Najpierw otwórz ${later.map((r) => `${monthName(r.month)} ${r.year}`).join(', ')} – ich kwoty zależą od tego miesiąca.`);
    }
    // Wynik zostaje jako „poprzednie wyliczenie”, żeby po poprawkach było widać, co się zmieniło.
    await tx.query("UPDATE months SET status = 'open', closed_at = NULL WHERE year = $1 AND month = $2", [year, month]);
  });
}

/** Zapis dochodu z grudnia poprzedniego roku (gdy tamtego roku nie ma w aplikacji). */
export async function saveDecemberIncome(db: Db, year: number, income: number): Promise<void> {
  await assertMonthOpen(db, year, 1);
  await db.query(
    `INSERT INTO years (year, previous_december_income) VALUES ($1, $2)
     ON CONFLICT (year) DO UPDATE SET previous_december_income = EXCLUDED.previous_december_income`, [year, income],
  );
}
