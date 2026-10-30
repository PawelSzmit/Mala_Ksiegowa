// Plik DRA (KEDU 5.7). Kwoty wzorcowe: poradnik ZUS „ZUS DRA. Jak wypełnić i skorygować”, przykład za maj 2026 r.
// (osoba opłacająca składki tylko za siebie, skala podatkowa, z chorobowym, dochód z kwietnia 10 000 zł).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadYearConfig } from '../../src/rules/config.ts';
import { healthContribution, socialContributions } from '../../src/rules/zus.ts';
import { birthDateFromPesel, buildDraKedu, isValidPesel, keduAmount, type DraInput } from '../../src/zus/kedu-dra.ts';
import { draSchemaErrors, draValue } from '../helpers/dra-schema.ts';

const config = loadYearConfig(2026);
const PESEL = '44051401359';
const payer = { nip: '5260250274', pesel: PESEL, firstName: 'Paweł', lastName: 'Kowalski' };

function input(over: Partial<DraInput> & { income?: number; sickness?: boolean } = {}): DraInput {
  const income = over.income ?? 1_000_000;
  return {
    year: 2026, month: 5, payer, socialBase: config.social.base, accidentRate: config.social.rates.wypadkowe,
    social: socialContributions(config, { voluntarySickness: over.sickness ?? false }),
    health: healthContribution(config, 5, income),
    previousMonthIncome: income, filledOn: '2026-06-08', ...over,
  };
}

describe('plik DRA dla eZUS (KEDU 5.7)', () => {
  it('przykład z poradnika ZUS (maj 2026, z chorobowym): te same kwoty co do grosza (poza pomyłką w sumie poradnika)', () => {
    const xml = buildDraKedu(input({ sickness: true }));
    assert.deepEqual(draSchemaErrors(xml), []);
    const v = (p: string) => draValue(xml, `ZUSDRA/${p}`);
    assert.deepEqual([v('I/p1'), v('I/p2/p1'), v('I/p2/p2')], ['6', '01', '2026-05']);
    assert.deepEqual([v('III/p1'), v('III/p3')], ['1', '1.67']);
    assert.deepEqual([v('IV/p1'), v('IV/p2'), v('IV/p3'), v('IV/p4'), v('IV/p5'), v('IV/p6')], ['1103.27', '452.16', '1555.43', '1103.27', '452.16', '1555.43']);
    assert.deepEqual([v('IV/p19'), v('IV/p20'), v('IV/p21'), v('IV/p22'), v('IV/p23'), v('IV/p24'), v('IV/p37')], ['138.47', '94.39', '232.86', '138.47', '94.39', '232.86', '1788.29']);
    assert.equal(v('IV/p7'), undefined, 'pól „finansowane przez płatnika” nie wypełnia się');
    assert.deepEqual([v('VI/p1'), v('VI/p2'), v('VI/p5'), v('VI/p7')], [undefined, '900.00', '900.00', '900.00']);
    assert.deepEqual([v('VII/p1'), v('VII/p3')], ['138.47', '138.47']);
    // Poradnik podaje 2826,77 zł, ale jego własne składniki dają 1788,29 + 900 + 138,47 = 2826,76 zł (pomyłka w przykładzie).
    assert.equal(v('IX/p2'), '2826.76');
    assert.deepEqual([v('X/p1/p1'), v('X/p1/p2'), v('X/p1/p3'), v('X/p2'), v('X/p3'), v('X/p4'), v('X/p5')], ['0510', '0', '0', '5652.00', '5652.00', '5652.00', '10000.00']);
    assert.deepEqual([v('XI/p1'), v('XI/p2'), v('XI/p3'), v('XI/p4')], ['true', '10000.00', '10000.00', '900.00']);
    assert.equal(v('XIII/p1'), '2026-06-08');
  });

  it('bez dobrowolnego chorobowego (jak Paweł): pola chorobowej puste, razem 1649,82 zł składek społecznych', () => {
    const xml = buildDraKedu(input());
    assert.deepEqual(draSchemaErrors(xml), []);
    const v = (p: string) => draValue(xml, `ZUSDRA/${p}`);
    assert.deepEqual([v('IV/p19'), v('IV/p22'), v('X/p3')], [undefined, undefined, undefined]);
    assert.deepEqual([v('IV/p21'), v('IV/p24'), v('IV/p37')], ['94.39', '94.39', '1649.82']);
    assert.equal(v('IX/p2'), '2688.29'); // 1649,82 + 900 + 138,47
  });

  it('dochód poniżej minimum: podstawa zdrowotnej = płaca minimalna, w XI p2 faktyczny dochód; strata jako 0', () => {
    const low = buildDraKedu(input({ income: 100_000 }));
    assert.deepEqual([draValue(low, 'ZUSDRA/XI/p2'), draValue(low, 'ZUSDRA/XI/p3'), draValue(low, 'ZUSDRA/XI/p4'), draValue(low, 'ZUSDRA/X/p5')],
      ['1000.00', '4806.00', '432.54', '4806.00']);
    const loss = buildDraKedu(input({ income: 0, previousMonthIncome: -50_000 }));
    assert.equal(draValue(loss, 'ZUSDRA/XI/p2'), '0.00');
    assert.deepEqual(draSchemaErrors(loss), []);
  });

  it('dane płatnika: wielkie litery, data urodzenia z PESEL-u, REGON i nazwa skrócona gdy są, znaki specjalne escapowane', () => {
    const xml = buildDraKedu(input({ payer: { ...payer, regon: '123456785', shortName: 'Gabinet „A&B” <Kowalski>' } }));
    assert.deepEqual(draSchemaErrors(xml), []);
    assert.match(xml, /<p6>Gabinet „A&amp;B” &lt;Kowalski&gt;<\/p6>/);
    const v = (p: string) => draValue(xml, `ZUSDRA/II/${p}`);
    assert.deepEqual([v('p1'), v('p2'), v('p3'), v('p7'), v('p8'), v('p9')], ['5260250274', '123456785', PESEL, 'KOWALSKI', 'PAWEŁ', '1944-05-14']);
  });

  it('nie powstanie plik z błędnym PESEL-em, NIP-em albo bez nazwiska', () => {
    assert.throws(() => buildDraKedu(input({ payer: { ...payer, pesel: '44051401358' } })), /PESEL/);
    assert.throws(() => buildDraKedu(input({ payer: { ...payer, nip: '123' } })), /NIP/);
    assert.throws(() => buildDraKedu(input({ payer: { ...payer, lastName: ' ' } })), /nazwisko/);
  });

  it('PESEL: suma kontrolna i data urodzenia w różnych stuleciach', () => {
    assert.equal(isValidPesel(PESEL), true);
    assert.equal(isValidPesel('44051401358'), false);
    assert.equal(isValidPesel('4405140135'), false);
    assert.equal(birthDateFromPesel('02270803628'), '2002-07-08');
    assert.equal(birthDateFromPesel('44023012345'), null, '30 lutego nie istnieje');
  });

  it('sprawdzenie schematu wyłapuje złą kolejność, zły format kwoty i brak bloku', () => {
    const xml = buildDraKedu(input());
    assert.notDeepEqual(draSchemaErrors(xml.replace(/(<VI>[\s\S]*?<\/VI>)\s*(<VII>[\s\S]*?<\/VII>)/, '$2\n$1')), []);
    assert.notDeepEqual(draSchemaErrors(xml.replace('<p37>1649.82</p37>', '<p37>1649,82</p37>')), []);
    assert.notDeepEqual(draSchemaErrors(xml.replace(/<I>[\s\S]*?<\/I>/, '')), []);
  });

  it('kwoty w formacie KEDU', () => {
    assert.equal(keduAmount(0), '0.00');
    assert.equal(keduAmount(565200), '5652.00');
    assert.equal(keduAmount(5), '0.05');
    assert.throws(() => keduAmount(-1));
  });
});
