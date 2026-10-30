// Pod jaką datą (i w którym miesiącu) zaksięgować koszt – zasada ustalona przez Pawła (2026-10-30):
// faktura za poprzedni miesiąc, która przyjdzie do 9. dnia miesiąca, idzie do poprzedniego miesiąca
// (trzeba przeliczyć dochód i składki); przyszła później – koszt przechodzi na miesiąc otrzymania.
// Termin wynika z kalendarza płatności Pawła: ZUS 10., PIT 20. dnia.
export const LATE_INVOICE_LAST_DAY = 9;

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

/**
 * Data wpisu do księgi dla kosztu wystawionego `issueDate` i otrzymanego `receivedDate` (RRRR-MM-DD, czas polski).
 * Dla faktur z KSeF datą otrzymania jest dzień nadania numeru KSeF.
 */
export function costBookingDate(issueDate: string, receivedDate: string): string {
  const gap = monthIndex(receivedDate) - monthIndex(issueDate);
  if (gap <= 0) return issueDate;
  if (gap === 1 && Number(receivedDate.slice(8, 10)) <= LATE_INVOICE_LAST_DAY) return issueDate;
  return receivedDate;
}
