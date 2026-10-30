// Odczyt faktury FA(3) z KSeF: tylko pola potrzebne do księgi (firma nie jest płatnikiem VAT – liczy się kwota brutto).
// Struktura wg schematu FA(3) (http://crd.gov.pl/wzor/2025/06/25/13775/).
import { child, children, parseXml, textOf } from './xml.ts';

export interface FaItem {
  name: string;
  quantity?: string;
  unit?: string;
  /** Wartość netto pozycji (P_11) w groszach, gdy podana. */
  net?: number;
  /** Wartość brutto pozycji (P_11A) w groszach, gdy podana. */
  gross?: number;
  /** Pozycja „stan przed korektą” (StanPrzed = 1) w fakturze korygującej. */
  before?: boolean;
}

export interface FaCorrected {
  invoiceNumber?: string;
  issueDate?: string;
  ksefNumber?: string;
}

export interface FaInvoice {
  invoiceNumber: string;
  issueDate: string;
  sellerNip?: string;
  sellerName?: string;
  currency: string;
  /** Kwota należności ogółem (P_15) w groszach. W korekcie to różnica – może być ujemna. */
  grossAmount: number;
  /** Np. VAT, KOR, ZAL, ROZ, UPR, KOR_ZAL, KOR_ROZ. */
  invoiceType: string;
  isCorrection: boolean;
  correctionReason?: string;
  corrected: FaCorrected[];
  items: FaItem[];
}

/**
 * Kwota dziesiętna z XML („53.63”, „-12.5”, „0.105”) → grosze, bez liczb zmiennoprzecinkowych.
 * Więcej niż 2 miejsca po przecinku zaokrąglamy „od połowy w górę” (od zera).
 */
export function decimalToGrosze(text: string): number {
  const m = /^(-?)(\d+)(?:[.,](\d+))?$/.exec(text.trim());
  if (!m) throw new Error(`Niepoprawna kwota: „${text}”`);
  const fraction = (m[3] ?? '').padEnd(3, '0');
  let grosze = Number(m[2]) * 100 + Number(fraction.slice(0, 2));
  if (Number(fraction[2]) >= 5) grosze += 1;
  return m[1] && grosze !== 0 ? -grosze : grosze;
}

const optionalAmount = (t: string | undefined) => (t === undefined ? undefined : decimalToGrosze(t));

export function parseFaInvoice(xml: string): FaInvoice {
  const doc = child(parseXml(xml), 'Faktura');
  if (!doc) throw new Error('To nie jest faktura FA (brak elementu Faktura)');
  const fa = child(doc, 'Fa');
  const seller = child(doc, 'Podmiot1', 'DaneIdentyfikacyjne');

  const invoiceNumber = textOf(fa, 'P_2');
  const issueDate = textOf(fa, 'P_1');
  const gross = textOf(fa, 'P_15');
  if (!invoiceNumber || !issueDate || gross === undefined) throw new Error('W fakturze brakuje numeru (P_2), daty (P_1) lub kwoty (P_15)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) throw new Error(`Niepoprawna data wystawienia: ${issueDate}`);

  const invoiceType = textOf(fa, 'RodzajFaktury') ?? 'VAT';
  return {
    invoiceNumber,
    issueDate,
    sellerNip: textOf(seller, 'NIP'),
    sellerName: textOf(seller, 'Nazwa'),
    currency: textOf(fa, 'KodWaluty') ?? 'PLN',
    grossAmount: decimalToGrosze(gross),
    invoiceType,
    isCorrection: invoiceType.startsWith('KOR'),
    correctionReason: textOf(fa, 'PrzyczynaKorekty'),
    corrected: children(fa, 'DaneFaKorygowanej').map((c) => ({
      invoiceNumber: textOf(c, 'NrFaKorygowanej'),
      issueDate: textOf(c, 'DataWystFaKorygowanej'),
      ksefNumber: textOf(c, 'NrKSeFFaKorygowanej'),
    })),
    items: children(fa, 'FaWiersz').map((w) => ({
      name: textOf(w, 'P_7') ?? '(bez nazwy)',
      quantity: textOf(w, 'P_8B'),
      unit: textOf(w, 'P_8A'),
      net: optionalAmount(textOf(w, 'P_11')),
      gross: optionalAmount(textOf(w, 'P_11A')),
      ...(textOf(w, 'StanPrzed') === '1' ? { before: true } : {}),
    })),
  };
}
