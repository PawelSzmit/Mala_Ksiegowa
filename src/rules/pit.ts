import type { YearConfig } from './config.ts';
import { percentOf, roundToZloty } from './money.ts';

/** Podatek wg skali od podstawy (w groszach, już zaokrąglonej), po odjęciu kwoty zmniejszającej; nigdy ujemny. */
export function taxOnScale(config: YearConfig, base: number): number {
  let tax = 0;
  let lower = 0;
  for (const bracket of config.pit.brackets) {
    const upper = bracket.upTo ?? Infinity;
    if (base > lower) tax += percentOf(Math.min(base, upper) - lower, bracket.rate);
    lower = upper;
  }
  return Math.max(0, tax - config.pit.taxReducingAmount);
}

export interface PitMonthInput {
  revenue: number;
  costs: number;
  /** Składki społeczne (bez FP) zapłacone w tym miesiącu – odliczane od dochodu (art. 26 ust. 1 pkt 2 ustawy o PIT). */
  socialPaid: number;
}

export interface PitMonthResult {
  /** Podstawa opodatkowania narastająco, zaokrąglona do pełnych złotych. */
  taxBase: number;
  /** Podatek narastająco od początku roku, zaokrąglony do pełnych złotych. */
  taxCumulative: number;
  /** Zaliczka do zapłaty za ten miesiąc (do 20. dnia następnego miesiąca). */
  advance: number;
}

/**
 * Zaliczki miesięczne na skali (art. 44 ust. 3a ustawy o PIT): podatek od dochodu narastająco
 * minus zaliczki należne za poprzednie miesiące; ujemna różnica = 0 (bez zwrotu w trakcie roku).
 * Składka zdrowotna na skali nie obniża podatku.
 */
export function advancePayments(config: YearConfig, months: PitMonthInput[]): PitMonthResult[] {
  let income = 0;
  let social = 0;
  let advancesSoFar = 0;
  return months.map((m) => {
    income += m.revenue - m.costs;
    social += m.socialPaid;
    const taxBase = roundToZloty(Math.max(0, income - social));
    const taxCumulative = roundToZloty(taxOnScale(config, taxBase));
    const advance = Math.max(0, taxCumulative - advancesSoFar);
    advancesSoFar += advance;
    return { taxBase, taxCumulative, advance };
  });
}
