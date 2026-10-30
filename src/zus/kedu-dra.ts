// Deklaracja ZUS DRA w pliku KEDU do importu w eZUS (ePłatnik → Dokumenty → Dokumenty ubezpieczeniowe → „Import KEDU”).
// Źródła (BIP ZUS, „Dokumenty ubezpieczeniowe”, specyfikacja EWD 2.27 ważna od 25.04.2026):
// - schemat kedu_5_7.xsd (przestrzeń nazw http://www.zus.pl/2026/KEDU_5_7) i przykładowy DRA.xml z zestawu danych testowych;
// - Załącznik nr 1 „Zakres informacyjny dokumentów ubezpieczeniowych” (opis pól ZUS DRA);
// - poradnik ZUS „ZUS DRA. Jak wypełnić i skorygować” – przykład za maj 2026 r. osoby opłacającej składki tylko za siebie,
//   opodatkowanej wg skali: składki społeczne „finansowane przez ubezpieczonego” (IV p4, p5, p22, p23), zdrowotna VI p2,
//   termin przysyłania 6 (do 20. dnia), kod tytułu ubezpieczenia 0510 0 0, blok XI p1–p4.
// Nagłówka i cech dokumentu nie wypełnia się (robi to system ZUS). Plik niczego nie wysyła – w eZUS trafia do roboczych.
//
// Miesiąc wakacji składkowych – instrukcja ZUS „Jak wypełnić dokumenty rozliczeniowe, gdy uzyskasz zwolnienie z obowiązku
// opłacenia składek za wybrany miesiąc” (grudzień 2024, przykład 1): zamiast samego DRA trzy dokumenty w jednym pliku:
// - ZUS RCA z kodem 05 14 00: podstawy (III.B p4–p6) i składki społeczne „finansowane przez budżet państwa” (p15–p18), suma p29;
// - ZUS RCA z kodem 05 10 00: tylko kod w III.B, zdrowotna w III.C (p1 podstawa, p4 kwota) i III.E (jak blok XI w DRA);
// - ZUS DRA: w bloku IV te same składki jako finansowane przez budżet (p10–p12, p28–p30), do zapłaty 0 (p37),
//   zdrowotna w VI, bez Funduszu Pracy (zwolnienie z FP przy opłacaniu tylko za siebie się nie wykazuje), bez bloków X i XI.
// Kolejność pól i typy z kedu_5_7.xsd (t_RCA, t_DDORCA_B/C, t_ZDR), identyfikator ubezpieczonego „P” = PESEL (DRA_RCA.xml z BIP).
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
  /**
   * Miesiąc wakacji składkowych: składki społeczne, z których opłacenia ZUS zwolnił (finansuje je budżet państwa).
   * Wtedy `social` musi być zerowe, a plik zawiera DRA i dwa raporty RCA.
   */
  exempt?: SocialContributions;
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

/**
 * Plik KEDU za `month`/`year` (identyfikator 01 – deklaracja za miesiąc): sama deklaracja ZUS DRA,
 * a w miesiącu wakacji składkowych (`exempt`) DRA i dwa raporty ZUS RCA.
 */
export function buildDraKedu(input: DraInput): string {
  checkPayer(input.payer);
  return keduFile(input, input.exempt ? holidayDocuments(input, input.exempt) : [`  <ZUSDRA id_dokumentu="1">\n${regularDra(input)}\n  </ZUSDRA>`]);
}

const rate = (bp: number) => `${Math.floor(bp / 100)}.${String(bp % 100).padStart(2, '0')}`;
const period = (input: DraInput): Fields => [['p1', '01'], ['p2', `${input.year}-${String(input.month).padStart(2, '0')}`]];

function payerBlock(payer: DraPayer): string {
  return block('II', [
    ['p1', payer.nip], ['p2', payer.regon || null], ['p3', payer.pesel], ['p6', payer.shortName || null],
    ['p7', payer.lastName.trim().toUpperCase()], ['p8', payer.firstName.trim().toUpperCase()], ['p9', birthDateFromPesel(payer.pesel)],
  ]);
}

/** Blok XI DRA / III.E RCA: forma opodatkowania (skala), dochód z poprzedniego miesiąca, podstawa i kwota zdrowotnej. */
const healthInfo = (input: DraInput): Fields => [
  ['p1', 'true'], ['p2', keduAmount(Math.max(0, input.previousMonthIncome))], ['p3', keduAmount(input.health.base)], ['p4', keduAmount(input.health.amount)],
];

function regularDra(input: DraInput): string {
  const { payer, social, health } = input;
  const pension = social.emerytalne + social.rentowe; // IV p3 i p6
  const sicknessAccident = social.chorobowe + social.wypadkowe; // IV p21 i p24
  const socialTotal = pension + sicknessAccident; // IV p37
  if (socialTotal !== social.deductible) throw new Error('Niespójne składki społeczne');
  const total = socialTotal + health.amount + social.funduszPracy; // IX p2
  const a = keduAmount;
  const sickness = social.chorobowe > 0;

  return [
    block('I', [['p1', '6'], ['p2', period(input)]]),
    payerBlock(payer),
    block('III', [['p1', '1'], ['p3', rate(input.accidentRate)]]),
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
    block('XI', healthInfo(input)),
    block('XIII', [['p1', input.filledOn]]),
  ].join('\n');
}

/** Miesiąc wakacji: DRA + RCA 05 14 (składki pokrywa budżet) + RCA 05 10 (zdrowotna). */
function holidayDocuments(input: DraInput, exempt: SocialContributions): string[] {
  const { payer, social, health } = input;
  if (social.total !== 0) throw new Error('W miesiącu wakacji składki społeczne do zapłaty muszą być zerowe');
  const pension = exempt.emerytalne + exempt.rentowe;
  const sicknessAccident = exempt.chorobowe + exempt.wypadkowe;
  if (pension + sicknessAccident !== exempt.deductible || exempt.deductible === 0) throw new Error('Niespójne składki objęte zwolnieniem');
  const a = keduAmount;
  const sickness = exempt.chorobowe > 0;
  const base = a(input.socialBase);
  const insured: Fields = [['p1', payer.lastName.trim().toUpperCase()], ['p2', payer.firstName.trim().toUpperCase()], ['p3', 'P'], ['p4', payer.pesel]];
  const title = (code: string): Fields => [['p1', code], ['p2', '0'], ['p3', '0']];

  const dra = [
    block('I', [['p1', '6'], ['p2', period(input)]]),
    payerBlock(payer),
    block('III', [['p1', '1'], ['p3', rate(input.accidentRate)]]),
    block('IV', [
      ['p1', a(exempt.emerytalne)], ['p2', a(exempt.rentowe)], ['p3', a(pension)],
      ['p10', a(exempt.emerytalne)], ['p11', a(exempt.rentowe)], ['p12', a(pension)],
      ['p19', sickness ? a(exempt.chorobowe) : null], ['p20', a(exempt.wypadkowe)], ['p21', a(sicknessAccident)],
      ['p28', sickness ? a(exempt.chorobowe) : null], ['p29', a(exempt.wypadkowe)], ['p30', a(sicknessAccident)],
      ['p37', a(0)],
    ]),
    block('VI', [['p2', a(health.amount)], ['p5', a(health.amount)], ['p7', a(health.amount)]]),
    block('IX', [['p2', a(health.amount)]]),
    block('XIII', [['p1', input.filledOn]]),
  ].join('\n');

  const rca = (id: number, insuredBlocks: string) => `  <ZUSRCA id_dokumentu="${id}">
${block('I', [['p1', period(input)]])}
${payerBlock(payer)}
    <III id_bloku="1">
${block('A', insured, '      ')}
${insuredBlocks}
    </III>
${block('IV', [['p1', input.filledOn]])}
  </ZUSRCA>`;

  const exemptRca = rca(2, block('B', [
    ['p1', title('0514')],
    ['p4', base], ['p5', sickness ? base : null], ['p6', base],
    ['p15', a(exempt.emerytalne)], ['p16', a(exempt.rentowe)], ['p17', sickness ? a(exempt.chorobowe) : null], ['p18', a(exempt.wypadkowe)],
    ['p29', a(exempt.deductible)],
  ], '      '));
  const healthRca = rca(3, [
    block('B', [['p1', title('0510')]], '      '),
    block('C', [['p1', a(health.base)], ['p4', a(health.amount)]], '      '),
    block('E', healthInfo(input), '      '),
  ].join('\n'));

  return [`  <ZUSDRA id_dokumentu="1">\n${dra}\n  </ZUSDRA>`, exemptRca, healthRca];
}

function keduFile(input: DraInput, documents: string[]): string {
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
${documents.join('\n')}
</KEDU>
`;
}
