// Daty w polskiej strefie czasowej (serwer może działać w UTC).
const warsawDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Dzisiejsza data w Polsce, RRRR-MM-DD. */
export const warsawToday = (nowMs = Date.now()) => warsawDate.format(new Date(nowMs));

/** Bieżący miesiąc w polskiej strefie czasowej. */
export function currentMonth(nowMs = Date.now()): { year: number; month: number } {
  const today = warsawToday(nowMs);
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}

/** Ostatni dzień miesiąca, RRRR-MM-DD. */
export function lastDayOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
