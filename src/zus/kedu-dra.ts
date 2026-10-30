// Deklaracja ZUS DRA w pliku KEDU do importu w eZUS (ePłatnik → Dokumenty → Dokumenty ubezpieczeniowe → „Import KEDU”).
// Źródła (BIP ZUS, „Dokumenty ubezpieczeniowe”, specyfikacja EWD 2.27 ważna od 25.04.2026):
// - schemat kedu_5_7.xsd (przestrzeń nazw http://www.zus.pl/2026/KEDU_5_7) i przykładowy DRA.xml z zestawu danych testowych;
// - Załącznik nr 1 „Zakres informacyjny dokumentów ubezpieczeniowych” (opis pól ZUS DRA);
// - poradnik ZUS „ZUS DRA. Jak wypełnić i skorygować” – przykład za maj 2026 r. osoby opłacającej składki tylko za siebie,
//   opodatkowanej wg skali: składki społeczne „finansowane przez ubezpieczonego” (IV p4, p5, p22, p23), zdrowotna VI p2,
//   termin przysyłania 6 (do 20. dnia), kod tytułu ubezpieczenia 0510 0 0, blok XI p1–p4.
// Nagłówka i cech dokumentu nie wypełnia się (robi to system ZUS). Plik niczego nie wysyła – w eZUS trafia do roboczych.
import type { HealthContribution, SocialContributions } from '../rules/zus.ts';

export const KEDU_NAMESPACE = 'http://www.zus.pl/2026/KEDU_5_7';

export interface DraPayer {
  nip: string;
  /** 9 albo 14 cyfr; puste, gdy firma nie ma REGON-u. */
  regon?: string | null;
  pesel: string;
  /** Nazwa skrócona z CEIDG (najwyżej 31 znaków). */
  shortName?: string | null;
  lastName: string;
  firstName: string;
}

export interface DraInput {
  year: number;
  month: number;
  payer: DraPayer;
  /** Podstawa składek społecznych (X p2 i p4). */
  socialBase: number;
  /** Stopa wypadkowa w punktach bazowych (167 = 1,67%). */
  accidentRate: number;
  social: SocialContributions;
  health: HealthContribution;
  /** Dochód z miesiąca poprzedzającego (XI p2); ujemny lub zerowy → 0. */
  previousMonthIncome: number;
  /** Data wypełnienia (XIII p1), RRRR-MM-DD. */
  filledOn: string;
  /** Wersja programu w nagłówku KEDU. */
  programVersion?: string;
}

/** PESEL z poprawną cyfrą kontrolną. */
export function isValidPesel(pesel: string): boolean {
  if (!/^\d{11}$/.test(pesel)) return false;
  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(pesel[i]), 0);
  return (10 - (sum % 10)) % 10 === Number(pesel[10]) && birthDateFromPesel(pesel) !== null;
}

/** Data urodzenia zapisana w PESEL-u (miesiąc +20 dla lat 2000–2099, +80 dla 1800–1899 itd.). */
export function birthDateFromPesel(pesel: string): string | null {
  const yy = Number(pesel.slice(0, 2));
  const mmRaw = Number(pesel.slice(2, 4));
  const dd = Number(pesel.slice(4, 6));
  const century = [1900, 2000, 2100, 2200, 1800][Math.floor(mmRaw / 20)];
  const mm = mmRaw % 20;
  if (century === undefined || mm < 1 || mm > 12) return null;
  const year = century + yy;
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** Grosze → „1103.27” (format kwot w KEDU). */
export function keduAmount(grosze: number): string {
  if (!Number.isInteger(grosze) || grosze < 0) throw new Error(`Kwota w DRA musi być nieujemna: ${grosze}`);
  return `${Math.floor(grosze / 100)}.${String(grosze % 100).padStart(2, '0')}`;
}

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Pola bloku: [nazwa, wartość]; puste wartości są pomijane (pól „nie wypełniasz” nie ma w pliku). */
type Fields = [string, string | Fields | null | undefined][];

function block(name: string, fields: Fields, indent = '    '): string {
  const inner = fields
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([n, v]) => (Array.isArray(v) ? block(n, v, `${indent}  `) : `${indent}  <${n}>${escapeXml(v as string)}</${n}>`))
    .join('\n');
  return `${indent}<${name}>\n${inner}\n${indent}</${name}>`;
}

function checkPayer(p: DraPayer): void {
  const problems: string[] = [];
  if (!/^\d{10}$/.test(p.nip)) problems.push('NIP');
  if (p.regon && !/^(\d{9}|\d{14})$/.test(p.regon)) problems.push('REGON');
  if (!isValidPesel(p.pesel)) problems.push('PESEL');
  if (!p.lastName.trim() || p.lastName.length > 31) problems.push('nazwisko');
  if (!p.firstName.trim() || p.firstName.length > 22) problems.push('imię');
  if (p.shortName && p.shortName.length > 31) problems.push('nazwa skrócona');
  if (problems.length) throw new Error(`Brak lub błędne dane płatnika do DRA: ${problems.join(', ')}`);
}

/** Plik KEDU z jedną deklaracją ZUS DRA za `month`/`year` (identyfikator 01 – deklaracja za miesiąc). */
export function buildDraKedu(input: DraInput): string {
  const { payer, social, health } = input;
  checkPayer(payer);
  const pension = social.emerytalne + social.rentowe; // IV p3 i p6
  const sicknessAccident = social.chorobowe + social.wypadkowe; // IV p21 i p24
  const socialTotal = pension + sicknessAccident; // IV p37
  if (socialTotal !== social.deductible) throw new Error('Niespójne składki społeczne');
  const total = socialTotal + health.amount + social.funduszPracy; // IX p2
  const a = keduAmount;
  const sickness = social.chorobowe > 0;

  const dra = [
    block('I', [['p1', '6'], ['p2', [['p1', '01'], ['p2', `${input.year}-${String(input.month).padStart(2, '0')}`]]]]),
    block('II', [
      ['p1', payer.nip], ['p2', payer.regon || null], ['p3', payer.pesel], ['p6', payer.shortName || null],
      ['p7', payer.lastName.trim().toUpperCase()], ['p8', payer.firstName.trim().toUpperCase()], ['p9', birthDateFromPesel(payer.pesel)],
    ]),
    block('III', [['p1', '1'], ['p3', `${Math.floor(input.accidentRate / 100)}.${String(input.accidentRate % 100).padStart(2, '0')}`]]),
    block('IV', [
      ['p1', a(social.emerytalne)], ['p2', a(social.rentowe)], ['p3', a(pension)],
      ['p4', a(social.emerytalne)], ['p5', a(social.rentowe)], ['p6', a(pension)],
      ['p19', sickness ? a(social.chorobowe) : null], ['p20', a(social.wypadkowe)], ['p21', a(sicknessAccident)],
      ['p22', sickness ? a(social.chorobowe) : null], ['p23', a(social.wypadkowe)], ['p24', a(sicknessAccident)],
      ['p37', a(socialTotal)],
    ]),
    block('VI', [['p2', a(health.amount)], ['p5', a(health.amount)], ['p7', a(health.amount)]]),
    block('VII', [['p1', a(social.funduszPracy)], ['p3', a(social.funduszPracy)]]),
    block('IX', [['p2', a(total)]]),
    block('X', [
      ['p1', [['p1', '0510'], ['p2', '0'], ['p3', '0']]],
      ['p2', a(input.socialBase)], ['p3', sickness ? a(input.socialBase) : null], ['p4', a(input.socialBase)], ['p5', a(health.base)],
    ]),
    block('XI', [['p1', 'true'], ['p2', a(Math.max(0, input.previousMonthIncome))], ['p3', a(health.base)], ['p4', a(health.amount)]]),
    block('XIII', [['p1', input.filledOn]]),
  ].join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<KEDU wersja_schematu="1" xmlns="${KEDU_NAMESPACE}">
  <naglowek.KEDU>
    <program>
      <producent>Mala Ksiegowa</producent>
      <symbol>Mala Ksiegowa</symbol>
      <wersja>${escapeXml(input.programVersion ?? '1.0')}</wersja>
    </program>
    <data_utworzenia_KEDU>${input.filledOn}</data_utworzenia_KEDU>
  </naglowek.KEDU>
  <ZUSDRA id_dokumentu="1">
${dra}
  </ZUSDRA>
</KEDU>
`;
}
