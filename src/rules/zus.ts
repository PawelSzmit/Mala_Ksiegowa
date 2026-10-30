import type { YearConfig } from './config.ts';
import { percentOf } from './money.ts';

export interface SocialContributions {
  emerytalne: number;
  rentowe: number;
  wypadkowe: number;
  chorobowe: number;
  funduszPracy: number;
  /** Część odliczana od dochodu (emerytalne + rentowe + chorobowe + wypadkowe). Fundusz Pracy to koszt, nie odliczenie. */
  deductible: number;
  total: number;
}

const ZERO: SocialContributions = { emerytalne: 0, rentowe: 0, wypadkowe: 0, chorobowe: 0, funduszPracy: 0, deductible: 0, total: 0 };

/**
 * Składki społeczne za jeden miesiąc przy pełnym ZUS (podstawa 60% prognozowanego wynagrodzenia).
 * W miesiącu wakacji składkowych – zero (zdrowotną liczy się osobno).
 */
export function socialContributions(config: YearConfig, opts: { holiday?: boolean; voluntarySickness?: boolean } = {}): SocialContributions {
  if (opts.holiday) return { ...ZERO };
  const { base, rates } = config.social;
  const emerytalne = percentOf(base, rates.emerytalne);
  const rentowe = percentOf(base, rates.rentowe);
  const wypadkowe = percentOf(base, rates.wypadkowe);
  const chorobowe = opts.voluntarySickness ? percentOf(base, rates.chorobowe) : 0;
  const funduszPracy = percentOf(base, rates.funduszPracy);
  const deductible = emerytalne + rentowe + wypadkowe + chorobowe;
  return { emerytalne, rentowe, wypadkowe, chorobowe, funduszPracy, deductible, total: deductible + funduszPracy };
}

export interface HealthIncomeInput {
  revenue: number;
  costs: number;
  /** Składki społeczne (bez FP) faktycznie zapłacone w tym miesiącu. */
  socialPaid: number;
}

export interface HealthIncomeRow {
  /** Dochód miesiąca – podstawa zdrowotnej za NASTĘPNY miesiąc (przed porównaniem z minimum). */
  income: number;
  /** Ile zapłaconych składek społecznych odliczono w tym miesiącu. */
  socialDeducted: number;
}

/**
 * Miesięczny dochód do składki zdrowotnej (skala), art. 81 ust. 2c ustawy o świadczeniach opieki zdrowotnej:
 * narastająco od początku roku (przychody − koszty), minus dochody już ustalone za poprzednie miesiące,
 * minus składki społeczne zapłacone od początku roku, a jeszcze nieodliczone.
 * „Dochody za poprzednie miesiące” bierzemy przed odliczeniem składek – inaczej składki z wcześniejszych
 * miesięcy wracałyby do dochodu (dosłowne czytanie przepisu daje taki absurd; programy księgowe liczą jak tu:
 * w praktyce dochód miesiąca = przychód − koszty − składki zapłacone w tym miesiącu).
 *
 * Przyjęta interpretacja (do potwierdzenia z księgową, punkt kontrolny etapu 2):
 * - dochód nie bywa ujemny – strata daje 0, a przez liczenie narastające obniża dochód kolejnych miesięcy;
 * - składki odliczamy tylko do wysokości dochodu, nadwyżka przechodzi na kolejne miesiące.
 * Ewentualne różnice i tak wyrównuje roczne rozliczenie zdrowotnej.
 */
export function healthIncomes(months: HealthIncomeInput[]): HealthIncomeRow[] {
  let cumulativeRevenueMinusCosts = 0;
  let cumulativeSocialPaid = 0;
  let beforeSocialSoFar = 0;
  let socialDeductedSoFar = 0;
  return months.map((m) => {
    cumulativeRevenueMinusCosts += m.revenue - m.costs;
    cumulativeSocialPaid += m.socialPaid;
    const beforeSocial = Math.max(0, cumulativeRevenueMinusCosts - beforeSocialSoFar);
    const socialAvailable = cumulativeSocialPaid - socialDeductedSoFar;
    const socialDeducted = Math.min(beforeSocial, socialAvailable);
    const income = beforeSocial - socialDeducted;
    beforeSocialSoFar += beforeSocial;
    socialDeductedSoFar += socialDeducted;
    return { income, socialDeducted };
  });
}

export interface HealthContribution {
  base: number;
  minimumApplied: boolean;
  amount: number;
}

/** Składka zdrowotna za miesiąc `month` od dochodu z miesiąca poprzedniego (styczeń: od dochodu z grudnia). */
export function healthContribution(config: YearConfig, month: number, previousMonthIncome: number): HealthContribution {
  const minimum = month === 1 ? config.health.minBaseJanuary : config.health.minBaseFromFebruary;
  const base = Math.max(previousMonthIncome, minimum);
  return { base, minimumApplied: base === minimum && previousMonthIncome < minimum, amount: percentOf(base, config.health.rate) };
}
