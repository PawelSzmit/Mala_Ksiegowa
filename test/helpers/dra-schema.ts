// Sprawdzenie pliku DRA (i raportów RCA z miesiąca wakacji) względem schematu kedu_5_7.xsd (BIP ZUS, specyfikacja EWD 2.27, ważna od 25.04.2026).
// Pełnego walidatora XSD nie ma w Node bez zależności, więc tu są przepisane ze schematu kolejność elementów
// i ograniczenia typów dla tych części KEDU, ZUSDRA i ZUSRCA, które może zawierać nasz plik.
import { parseXml, type XmlNode } from '../../src/ksef/xml.ts';

type Rule = RegExp | ((v: string) => boolean) | Schema;
interface Schema { seq: [name: string, rule: Rule, optional?: boolean][] }

const d = (n: number) => new RegExp(`^\\d{1,${n}}\\.\\d{2}$`);
const K = d(9);
const len = (min: number, max: number) => (v: string) => v.length >= min && v.length <= max;
const date = /^\d{4}-\d{2}-\d{2}$/;
const bool = /^(true|false)$/;
const ps = (types: Rule[]): Schema => ({ seq: types.map((t, i) => [`p${i + 1}`, t, true] as [string, Rule, boolean]) });

const PAYER = ps([/^\d{10}$/, /^(\d{9}|\d{14})$/, /^\d{11}$/, len(0, 1), len(0, 9), len(0, 31), len(1, 31), len(1, 22), date]);
const HEALTH_INFO = ps([bool, d(8), d(8), d(8), bool, d(8), d(8), d(8), bool, d(8), d(8), bool, d(8), bool, d(8), d(8), d(8), bool, d(8), d(8)]);
const TITLE: Schema = { seq: [['p1', /^\d{4}$/], ['p2', /^\d$/], ['p3', /^\d$/]] };

// t_RCA → t_DDORCA (blok III, powtarzalny) → A, B (t_DDORCA_B), C, D, E (t_ZDR).
const RCA_III: Schema = {
  seq: [
    ['A', { seq: [['p1', len(1, 31)], ['p2', len(1, 22)], ['p3', len(1, 1)], ['p4', len(1, 11)]] }],
    ['B', { seq: [
      ['p1', TITLE], ['p2', len(1, 1), true], ['p3', { seq: [['p1', /^\d{3}$/], ['p2', /^\d{3}$/]] }, true],
      ...[4, 5, 6].map((n) => [`p${n}`, d(6), true] as [string, Rule, boolean]),
      ...Array.from({ length: 22 }, (_, i) => [`p${i + 7}`, d(5), true] as [string, Rule, boolean]),
      ['p29', d(6), true],
    ] }],
    ['C', ps([d(8), d(5), d(5), d(7), d(5)]), true],
    ['D', ps([d(5), d(5), d(5), d(6)]), true],
    ['E', HEALTH_INFO, true],
  ],
};
const RCA: Schema = {
  seq: [
    ['I', { seq: [['p1', { seq: [['p1', /^\d{2}$/], ['p2', /^\d{4}-\d{2}$/]] }]] }],
    ['II', PAYER, true],
    ['III', RCA_III],
    ['IV', ps([date]), true],
  ],
};

const HEADER: Schema = {
  seq: [['naglowek.KEDU', { seq: [['program', { seq: [['producent', len(1, 64)], ['symbol', len(1, 64)], ['wersja', len(1, 32)]] }], ['data_utworzenia_KEDU', date, true]] }]],
};

const DRA: Schema = {
  seq: [
    ['I', { seq: [['p1', /^\d$/], ['p2', { seq: [['p1', /^\d{2}$/], ['p2', /^\d{4}-\d{2}$/]] }], ['p3', date, true], ['p4', len(0, 20), true], ['p5', len(0, 12), true]] }],
    ['II', PAYER, true],
    ['III', ps([/^\d{1,6}$/, len(0, 1), /^\d{1,2}\.\d{2}$/]), true],
    ['IV', ps([...Array<RegExp>(36).fill(K), d(10)]), true],
    ['V', ps([K, K, K, K, d(10)]), true],
    ['VI', ps([K, K, K, K, K, d(8), d(10)]), true],
    ['VII', ps([K, K, d(10)]), true],
    ['IX', ps([d(11), d(11)]), true],
    ['X', ps([{ seq: [['p1', /^\d{4}$/], ['p2', /^\d$/], ['p3', /^\d$/]] }, d(8), d(8), d(8), d(8), len(0, 1)]), true],
    ['XI', HEALTH_INFO, true],
    ['XIII', ps([date]), true],
  ],
};

function check(node: XmlNode, schema: Schema, path: string, errors: string[]): void {
  const kids = node.children.filter((c) => c.name !== '#text');
  let i = 0;
  for (const [name, rule, optional] of schema.seq) {
    const child = kids[i];
    if (child?.name !== name) {
      if (!optional) errors.push(`${path}: brak ${name}`);
      continue;
    }
    i++;
    const p = `${path}/${name}`;
    if (rule instanceof RegExp) { if (!rule.test(child.text)) errors.push(`${p}: „${child.text}” nie pasuje do ${rule}`); }
    else if (typeof rule === 'function') { if (!rule(child.text)) errors.push(`${p}: „${child.text}” – zła długość`); }
    else check(child, rule, p, errors);
  }
  for (const extra of kids.slice(i)) errors.push(`${path}: nieoczekiwany lub nie po kolei ${extra.name}`);
}

/** Lista niezgodności ze schematem (pusta = zgodny). Dokumenty w KEDU: dowolna liczba ZUSDRA i ZUSRCA (xs:choice). */
export function draSchemaErrors(xml: string): string[] {
  const errors: string[] = [];
  if (!/<KEDU wersja_schematu="1" xmlns="http:\/\/www\.zus\.pl\/2026\/KEDU_5_7">/.test(xml)) errors.push('KEDU: zła przestrzeń nazw lub brak wersja_schematu="1"');
  for (const m of xml.matchAll(/<(ZUSDRA|ZUSRCA)( [^>]*)?>/g)) if (!/^ id_dokumentu="\d{1,10}"$/.test(m[2] ?? '')) errors.push(`${m[1]}: brak id_dokumentu`);
  for (const rca of xml.match(/<ZUSRCA[\s\S]*?<\/ZUSRCA>/g) ?? []) {
    for (const m of rca.matchAll(/<III( [^>]*)?>/g)) if (!/^ id_bloku="\d+"$/.test(m[1] ?? '')) errors.push('ZUSRCA/III: brak id_bloku');
  }
  const ids = [...xml.matchAll(/id_dokumentu="(\d+)"/g)].map((m) => m[1]);
  if (new Set(ids).size !== ids.length) errors.push('KEDU: powtórzony id_dokumentu');
  const root = parseXml(xml).children.find((c) => c.name === 'KEDU');
  if (!root) return [...errors, 'brak elementu KEDU'];
  const kids = root.children.filter((c) => c.name !== '#text');
  check({ ...root, children: kids.slice(0, 1) }, HEADER, 'KEDU', errors);
  if (!kids.slice(1).length) errors.push('KEDU: brak dokumentów');
  for (const doc of kids.slice(1)) {
    if (doc.name === 'ZUSDRA') check(doc, DRA, 'KEDU/ZUSDRA', errors);
    else if (doc.name === 'ZUSRCA') check(doc, RCA, 'KEDU/ZUSRCA', errors);
    else errors.push(`KEDU: nieoczekiwany ${doc.name}`);
  }
  return errors;
}

/** Tekst elementu po ścieżce, np. "ZUSDRA/IV/p37"; kolejny dokument tego samego rodzaju: "ZUSRCA[2]/III/B/p29". */
export function draValue(xml: string, path: string): string | undefined {
  let node: XmlNode | undefined = parseXml(xml).children.find((c) => c.name === 'KEDU');
  for (const part of path.split('/')) {
    const [, name, nth] = /^([^[]+)(?:\[(\d+)\])?$/.exec(part)!;
    node = node?.children.filter((c) => c.name === name)[Number(nth ?? 1) - 1];
  }
  return node?.text;
}
