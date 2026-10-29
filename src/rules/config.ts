import { readFileSync } from 'node:fs';

export interface YearConfig {
  year: number;
  /** "potwierdzone" albo "prognoza" – prognozy pokazujemy w aplikacji z ostrzeżeniem. */
  status: 'potwierdzone' | 'prognoza';
  notes: string[];
  social: {
    base: number;
    rates: { emerytalne: number; rentowe: number; wypadkowe: number; chorobowe: number; funduszPracy: number };
  };
  health: {
    rate: number;
    /** Minimalna podstawa za styczeń (ostatni miesiąc poprzedniego roku składkowego). */
    minBaseJanuary: number;
    /** Minimalna podstawa za luty–grudzień (100% płacy minimalnej z 1 lutego). */
    minBaseFromFebruary: number;
  };
  pit: {
    brackets: { upTo: number | null; rate: number }[];
    taxReducingAmount: number;
  };
}

const isInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

/** Sprawdza plik ustawień roku – lepiej wywrócić się przy starcie niż policzyć złą kwotę. */
export function validateYearConfig(raw: unknown): YearConfig {
  const c = raw as YearConfig;
  const problems: string[] = [];
  if (!isInt(c?.year)) problems.push('year');
  if (c?.status !== 'potwierdzone' && c?.status !== 'prognoza') problems.push('status');
  if (!isInt(c?.social?.base)) problems.push('social.base');
  for (const key of ['emerytalne', 'rentowe', 'wypadkowe', 'chorobowe', 'funduszPracy'] as const) {
    if (!isInt(c?.social?.rates?.[key])) problems.push(`social.rates.${key}`);
  }
  for (const key of ['rate', 'minBaseJanuary', 'minBaseFromFebruary'] as const) {
    if (!isInt(c?.health?.[key])) problems.push(`health.${key}`);
  }
  const brackets = c?.pit?.brackets;
  if (!Array.isArray(brackets) || brackets.length === 0 || brackets.at(-1)?.upTo !== null) problems.push('pit.brackets');
  else brackets.forEach((b, i) => {
    if (!isInt(b.rate) || (i < brackets.length - 1 && !isInt(b.upTo))) problems.push(`pit.brackets[${i}]`);
  });
  if (!isInt(c?.pit?.taxReducingAmount)) problems.push('pit.taxReducingAmount');
  if (problems.length) throw new Error(`Błędny plik ustawień roku: ${problems.join(', ')}`);
  return c;
}

export function loadYearConfig(year: number): YearConfig {
  const url = new URL(`../../config/years/${year}.json`, import.meta.url);
  let text: string;
  try {
    text = readFileSync(url, 'utf8');
  } catch {
    throw new Error(`Brak pliku ustawień dla roku ${year} (config/years/${year}.json)`);
  }
  const config = validateYearConfig(JSON.parse(text));
  if (config.year !== year) throw new Error(`Plik config/years/${year}.json opisuje rok ${config.year}`);
  return config;
}
