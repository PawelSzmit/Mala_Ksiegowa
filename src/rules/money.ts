// Kwoty zawsze w groszach (liczby całkowite), stawki w punktach bazowych: 1952 = 19,52%.

/** Procent od kwoty, zaokrąglony do pełnego grosza (połówki w górę). */
export function percentOf(amount: number, rateBp: number): number {
  const raw = amount * rateBp;
  const sign = raw < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(raw) + 5000) / 10000);
}

/**
 * Zaokrąglenie do pełnych złotych wg art. 63 § 1 Ordynacji podatkowej:
 * końcówki poniżej 50 gr pomija się, 50 gr i więcej podwyższa do pełnego złotego.
 */
export function roundToZloty(amount: number): number {
  const sign = amount < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(amount) + 50) / 100) * 100;
}

/** 123456 → "1 234,56 zł" (do wydruków i komunikatów). */
export function formatPln(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const zl = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${zl},${String(abs % 100).padStart(2, '0')} zł`;
}
