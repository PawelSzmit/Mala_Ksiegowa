/** Jeden miesiąc księgi w skrócie: przychód (kasa) i koszty (faktury + koszty ręczne + Fundusz Pracy). */
export interface KpirMonthTotals {
  month: number; // 1–12
  revenue: number;
  costs: number;
}

export interface KpirSummaryRow extends KpirMonthTotals {
  income: number; // revenue − costs (może być ujemny)
  cumulativeRevenue: number;
  cumulativeCosts: number;
  cumulativeIncome: number;
}

/** Sumy miesięczne i narastające od stycznia. Miesiące muszą być kolejne, od 1. */
export function summarizeKpir(months: KpirMonthTotals[]): KpirSummaryRow[] {
  let cumulativeRevenue = 0;
  let cumulativeCosts = 0;
  return months.map((m, i) => {
    if (m.month !== i + 1) throw new Error(`Miesiące księgi muszą iść po kolei od stycznia (pozycja ${i + 1} to miesiąc ${m.month})`);
    if (!Number.isInteger(m.revenue) || !Number.isInteger(m.costs) || m.revenue < 0 || m.costs < 0) {
      throw new Error(`Miesiąc ${m.month}: przychód i koszty muszą być nieujemnymi kwotami w groszach`);
    }
    cumulativeRevenue += m.revenue;
    cumulativeCosts += m.costs;
    return {
      ...m,
      income: m.revenue - m.costs,
      cumulativeRevenue,
      cumulativeCosts,
      cumulativeIncome: cumulativeRevenue - cumulativeCosts,
    };
  });
}
