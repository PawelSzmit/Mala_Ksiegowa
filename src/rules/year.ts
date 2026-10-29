// Cały rok w jednym miejscu: z miesięcznych przychodów i kosztów liczy składki ZUS i zaliczki PIT.
// Czysta funkcja – bez bazy i sieci. Poprawka wcześniejszego miesiąca = ponowne wywołanie z nowymi danymi.
import type { YearConfig } from './config.ts';
import { validateHolidayMonths } from './holiday.ts';
import { summarizeKpir } from './kpir.ts';
import { advancePayments } from './pit.ts';
import { healthContribution, healthIncomes, socialContributions, type HealthContribution, type SocialContributions } from './zus.ts';

export interface YearMonthInput {
  month: number;
  /** Przychód z raportu kasy fiskalnej. */
  revenue: number;
  /** Koszty z księgi BEZ Funduszu Pracy (FP dolicza ten moduł z faktycznych wpłat). */
  costs: number;
  /** Faktycznie zapłacone w tym miesiącu składki społeczne – gdy pominięte: składki za poprzedni miesiąc. */
  socialPaid?: { deductible: number; funduszPracy: number };
}

export interface YearInput {
  config: YearConfig;
  /** Ustawienia poprzedniego roku – potrzebne do składek za grudzień płaconych w styczniu. */
  previousConfig?: YearConfig;
  months: YearMonthInput[];
  holidayMonths?: number[];
  /** Czy w grudniu poprzedniego roku były wakacje składkowe (wtedy w styczniu nie płaci się społecznych). */
  previousDecemberHoliday?: boolean;
  /** Dochód z grudnia poprzedniego roku – podstawa zdrowotnej za styczeń. */
  previousDecemberHealthIncome?: number;
  voluntarySickness?: boolean;
}

export interface YearMonthResult {
  month: number;
  revenue: number;
  /** Koszty z księgi + Fundusz Pracy zapłacony w tym miesiącu. */
  costs: number;
  /** Składki społeczne ZA ten miesiąc (do DRA, płatne do 20. dnia następnego miesiąca). */
  socialDue: SocialContributions;
  /** Składka zdrowotna ZA ten miesiąc (od dochodu z poprzedniego miesiąca). */
  healthDue: HealthContribution;
  /** Składki społeczne zapłacone W tym miesiącu (odliczane od dochodu). */
  socialPaid: { deductible: number; funduszPracy: number };
  /** Dochód tego miesiąca – podstawa zdrowotnej za następny miesiąc. */
  healthIncome: number;
  taxBase: number;
  pitAdvance: number;
  /** Razem do zapłaty do 20. dnia następnego miesiąca: ZUS (DRA) + PIT. */
  zusToPay: number;
  totalToPay: number;
  holiday: boolean;
}

export interface YearResult {
  year: number;
  holidayMonth: number | null;
  months: YearMonthResult[];
  warnings: string[];
}

export function computeYear(input: YearInput): YearResult {
  const { config } = input;
  const holidayMonth = validateHolidayMonths(config.year, input.holidayMonths ?? []);
  const warnings: string[] = [];
  if (config.status === 'prognoza') warnings.push(`Ustawienia roku ${config.year} są prognozą – kwoty mogą się zmienić.`);

  const kpir = summarizeKpir(input.months.map(({ month, revenue, costs }) => ({ month, revenue, costs })));
  const socialOpts = { voluntarySickness: input.voluntarySickness ?? false };
  const socialDue = kpir.map((m) => socialContributions(config, { ...socialOpts, holiday: m.month === holidayMonth }));

  const decemberDue = socialContributions(input.previousConfig ?? config, { ...socialOpts, holiday: input.previousDecemberHoliday });
  if (!input.previousConfig && input.months.length > 0 && !input.months[0]!.socialPaid) {
    warnings.push('Brak ustawień poprzedniego roku – składki za grudzień zapłacone w styczniu przyjęto według bieżącego roku.');
  }
  const socialPaid = input.months.map((m, i) => {
    if (m.socialPaid) return m.socialPaid;
    const due = i === 0 ? decemberDue : socialDue[i - 1]!;
    return { deductible: due.deductible, funduszPracy: due.funduszPracy };
  });

  const costs = kpir.map((m, i) => m.costs + socialPaid[i]!.funduszPracy);
  const incomeInput = kpir.map((m, i) => ({ revenue: m.revenue, costs: costs[i]!, socialPaid: socialPaid[i]!.deductible }));
  const health = healthIncomes(incomeInput);
  const pit = advancePayments(config, incomeInput);

  if (input.previousDecemberHealthIncome === undefined && kpir.length > 0) {
    warnings.push('Brak dochodu z grudnia poprzedniego roku – składkę zdrowotną za styczeń policzono od minimum.');
  }

  const months = kpir.map((m, i): YearMonthResult => {
    const previousIncome = i === 0 ? (input.previousDecemberHealthIncome ?? 0) : health[i - 1]!.income;
    const healthDue = healthContribution(config, m.month, previousIncome);
    const zusToPay = socialDue[i]!.total + healthDue.amount;
    return {
      month: m.month,
      revenue: m.revenue,
      costs: costs[i]!,
      socialDue: socialDue[i]!,
      healthDue,
      socialPaid: socialPaid[i]!,
      healthIncome: health[i]!.income,
      taxBase: pit[i]!.taxBase,
      pitAdvance: pit[i]!.advance,
      zusToPay,
      totalToPay: zusToPay + pit[i]!.advance,
      holiday: m.month === holidayMonth,
    };
  });

  return { year: config.year, holidayMonth, months, warnings };
}
