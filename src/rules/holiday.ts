/**
 * Wakacje składkowe: najwyżej jeden miesiąc w roku kalendarzowym.
 * W tym miesiącu nie płaci się składek społecznych ani na Fundusz Pracy/FS; zdrowotna – normalnie.
 * Wniosek RWS składa się w eZUS w miesiącu poprzedzającym miesiąc wakacji.
 */
export function validateHolidayMonths(year: number, months: number[]): number | null {
  const unique = [...new Set(months)];
  for (const m of unique) {
    if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error(`Nieprawidłowy miesiąc wakacji: ${m}`);
  }
  if (unique.length > 1) {
    throw new Error(`W roku ${year} można wziąć wakacje składkowe tylko raz (zaznaczono miesiące: ${unique.sort((a, b) => a - b).join(', ')})`);
  }
  return unique[0] ?? null;
}

/** Miesiąc, w którym trzeba złożyć wniosek RWS (miesiąc przed wakacjami). */
export function rwsApplicationMonth(year: number, holidayMonth: number): { year: number; month: number } {
  return holidayMonth === 1 ? { year: year - 1, month: 12 } : { year, month: holidayMonth - 1 };
}
