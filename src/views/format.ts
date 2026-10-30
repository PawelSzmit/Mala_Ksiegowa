import { formatPln } from '../rules/money.ts';

export const pln = formatPln;

/** Kwota do pola formularza: 123456 → „1234,56”. */
export const amountInput = (grosze: number | null | undefined) =>
  grosze === null || grosze === undefined ? '' : `${grosze < 0 ? '-' : ''}${Math.floor(Math.abs(grosze) / 100)},${String(Math.abs(grosze) % 100).padStart(2, '0')}`;

const dateTimeFormat = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'medium', timeStyle: 'short' });
export const dateTime = (d: Date | null | undefined) => (d ? dateTimeFormat.format(d) : '—');

/** „2026-10-05” → „05.10.2026”. */
export const date = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export const monthHref = (year: number, month: number) => `/miesiac/${year}/${String(month).padStart(2, '0')}`;
