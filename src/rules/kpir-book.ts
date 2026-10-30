// Księga przychodów i rozchodów wg wzoru od 2026 r. (rozporządzenie MFiG z 6.09.2025, Dz.U. 2025 poz. 1299):
// liczba porządkowa (kol. 1) ciągła w roku, po zakończeniu miesiąca sumy kolumn 9–16, a pod nimi
// sumy od początku roku do poprzedniego miesiąca i od początku roku (objaśnienia pkt 2 i 19).
export interface BookEntry {
  id: number;
  month: number;
  entry_date: string;
  document_number: string;
  ksef_number: string | null;
  counterparty: string | null;
  counterparty_tax_id: string | null;
  description: string;
  revenue: number;
  other_costs: number;
  notes: string | null;
  source: string;
}

/** Kolumny kwotowe 9–16 (w groszach). */
export interface BookTotals {
  sales: number; // 9 wartość sprzedanych towarów i usług
  otherRevenue: number; // 10 pozostałe przychody
  revenue: number; // 11 razem przychód (9 + 10)
  purchases: number; // 12 zakup towarów handlowych i materiałów
  incidental: number; // 13 koszty uboczne zakupu
  wages: number; // 14 wynagrodzenia
  otherCosts: number; // 15 pozostałe wydatki
  costs: number; // 16 razem wydatki (14 + 15)
}

export interface BookRow extends BookEntry {
  lp: number;
}

export interface BookMonth {
  month: number;
  rows: BookRow[];
  totals: BookTotals;
  /** Od początku roku do końca poprzedniego miesiąca. */
  previous: BookTotals;
  /** Od początku roku do końca tego miesiąca. */
  cumulative: BookTotals;
}

export const zeroTotals = (): BookTotals => ({ sales: 0, otherRevenue: 0, revenue: 0, purchases: 0, incidental: 0, wages: 0, otherCosts: 0, costs: 0 });

const add = (a: BookTotals, b: BookTotals): BookTotals => ({
  sales: a.sales + b.sales, otherRevenue: a.otherRevenue + b.otherRevenue, revenue: a.revenue + b.revenue, purchases: a.purchases + b.purchases,
  incidental: a.incidental + b.incidental, wages: a.wages + b.wages, otherCosts: a.otherCosts + b.otherCosts, costs: a.costs + b.costs,
});

/** Kwoty jednego wpisu w kolumnach 9–16. Przychód z kasy to sprzedaż (kol. 9), koszty firmy to „pozostałe wydatki” (kol. 15). */
export function entryTotals(e: Pick<BookEntry, 'revenue' | 'other_costs'>): BookTotals {
  return { ...zeroTotals(), sales: e.revenue, revenue: e.revenue, otherCosts: e.other_costs, costs: e.other_costs };
}

/** Kolejność zapisów: data, potem kolejność wpisania. */
export const compareEntries = (a: BookEntry, b: BookEntry) => (a.entry_date < b.entry_date ? -1 : a.entry_date > b.entry_date ? 1 : a.id - b.id);

/**
 * Układa wpisy jednego roku w miesiące 1..`upToMonth` z numeracją i sumami.
 * Miesiące bez wpisów też są (z zerowymi sumami), żeby sumy narastające były ciągłe.
 */
export function buildBook(entries: BookEntry[], upToMonth = 12): BookMonth[] {
  const sorted = [...entries].sort(compareEntries);
  let lp = 0;
  let cumulative = zeroTotals();
  const months: BookMonth[] = [];
  for (let month = 1; month <= upToMonth; month++) {
    const rows = sorted.filter((e) => e.month === month).map((e) => ({ ...e, lp: ++lp }));
    const totals = rows.reduce((sum, r) => add(sum, entryTotals(r)), zeroTotals());
    const previous = cumulative;
    cumulative = add(cumulative, totals);
    months.push({ month, rows, totals, previous, cumulative });
  }
  return months;
}
