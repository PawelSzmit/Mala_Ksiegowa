// Odczyt pól formularzy wpisywanych przez Pawła: kwoty po polsku, daty, NIP, pliki.
import { decimalToGrosze } from '../ksef/parse-fa.ts';
import { HttpError } from './http.ts';

/** „1 234,56”, „1234.5”, „12” → grosze. Puste albo niepoprawne → błąd z nazwą pola. */
export function parseAmountInput(value: string | undefined, label: string): number {
  const clean = (value ?? '').replace(/[\s ]/g, '').replace(/zł$/i, '');
  if (!/^-?\d+([.,]\d{1,2})?$/.test(clean)) throw new HttpError(400, `${label}: wpisz kwotę, np. 1234,56`);
  return decimalToGrosze(clean);
}

/** Data z pola typu „date” (RRRR-MM-DD), sprawdzona w kalendarzu. */
export function parseDateInput(value: string | undefined, label: string): string {
  const v = (value ?? '').trim();
  const d = new Date(`${v}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    throw new HttpError(400, `${label}: wpisz poprawną datę`);
  }
  return v;
}

export function requiredText(value: string | undefined, label: string, maxLength = 200): string {
  const v = (value ?? '').trim();
  if (!v) throw new HttpError(400, `${label}: pole jest wymagane`);
  if (v.length > maxLength) throw new HttpError(400, `${label}: najwyżej ${maxLength} znaków`);
  return v;
}

/** NIP z sumą kontrolną (wagi 6,5,7,2,3,4,5,6,7). Myślniki i spacje są pomijane. */
export function parseNip(value: string | undefined): string {
  const nip = (value ?? '').replace(/[\s-]/g, '');
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(nip[i]), 0);
  if (!/^\d{10}$/.test(nip) || sum % 11 !== Number(nip[9])) throw new HttpError(400, 'NIP: wpisz poprawny 10-cyfrowy NIP');
  return nip;
}

/**
 * Identyfikator podatkowy kontrahenta z kodem kraju (kol. 5 KPiR): polski NIP (z sumą kontrolną) → „PL…”,
 * zagraniczny numer VAT – dwie litery kraju i 2–12 znaków. Puste pole → null.
 */
export function parseTaxId(value: string | undefined): string | null {
  const v = (value ?? '').replace(/[\s.-]/g, '').toUpperCase();
  if (!v) return null;
  if (/^(PL)?\d{10}$/.test(v)) return `PL${parseNip(v.replace(/^PL/, ''))}`;
  if (/^[A-Z]{2}[0-9A-Z+*]{2,12}$/.test(v)) return v;
  throw new HttpError(400, 'NIP / numer VAT: wpisz polski NIP albo numer VAT z kodem kraju');
}

export type FileKind = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/heic';

/** Rodzaj pliku po jego zawartości (a nie po nazwie czy deklaracji przeglądarki). */
export function sniffFileType(data: Buffer): FileKind | null {
  if (data.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.subarray(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|mif1|msf1)$/.test(data.subarray(8, 12).toString('latin1'))) return 'image/heic';
  return null;
}

export const safeFilename = (name: string) => name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 100) || 'plik';
