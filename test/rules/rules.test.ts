// Reguły podatkowe i składkowe. Źródła kwot: config/years/*.json (pole "notes").
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadYearConfig, validateYearConfig } from '../../src/rules/config.ts';
import { rwsApplicationMonth, validateHolidayMonths } from '../../src/rules/holiday.ts';
import { summarizeKpir } from '../../src/rules/kpir.ts';
import { formatPln, percentOf, roundToZloty } from '../../src/rules/money.ts';
import { advancePayments, taxOnScale } from '../../src/rules/pit.ts';
import { computeYear, type YearMonthInput } from '../../src/rules/year.ts';
import { healthContribution, healthIncomes, socialContributions } from '../../src/rules/zus.ts';

const c2026 = loadYearConfig(2026);
const c2027 = loadYearConfig(2027);
const zl = (v: number) => Math.round(v * 100);

describe('kwoty i zaokrąglenia', () => {
  it('procent zaokrągla do grosza połówkami w górę', () => {
    assert.equal(percentOf(349950, 900), 31496); // 31495,5 gr → 314,96 zł (komunikat ZUS)
    assert.equal(percentOf(565200, 1952), 110327);
  });
  it('do pełnych złotych wg Ordynacji: poniżej 50 gr w dół, od 50 gr w górę', () => {
    assert.equal(roundToZloty(12349), 12300);
    assert.equal(roundToZloty(12350), 12400);
    assert.equal(roundToZloty(0), 0);
  });
  it('formatuje kwoty po polsku', () => {
    assert.equal(formatPln(178829), '1 788,29 zł');
    assert.equal(formatPln(5), '0,05 zł');
  });
});

describe('ustawienia roku', () => {
  it('2026 jest potwierdzony, 2027 to prognoza', () => {
    assert.equal(c2026.status, 'potwierdzone');
    assert.equal(c2027.status, 'prognoza');
  });
  it('odrzuca uszkodzony plik ustawień', () => {
    assert.throws(() => validateYearConfig({ ...c2026, social: { base: 'dużo' } }), /social\.base/);
    assert.throws(() => validateYearConfig({ ...c2026, pit: { brackets: [{ upTo: 100, rate: 1200 }], taxReducingAmount: 0 } }), /pit\.brackets/);
  });
  it('brak pliku dla roku daje czytelny błąd', () => {
    assert.throws(() => loadYearConfig(1999), /Brak pliku ustawień dla roku 1999/);
  });
});

describe('składki społeczne (pełny ZUS)', () => {
  it('2026 bez chorobowego: 1788,29 zł jak w komunikacie ZUS', () => {
    const s = socialContributions(c2026);
    assert.deepEqual(
      [s.emerytalne, s.rentowe, s.wypadkowe, s.chorobowe, s.funduszPracy, s.total],
      [110327, 45216, 9439, 0, 13847, 178829],
    );
    assert.equal(s.deductible, 164982); // bez FP
  });
  it('2026 z dobrowolnym chorobowym: 1926,76 zł', () => {
    assert.equal(socialContributions(c2026, { voluntarySickness: true }).total, 192676);
  });
  it('w miesiącu wakacji składkowych – zero', () => {
    assert.equal(socialContributions(c2026, { holiday: true }).total, 0);
  });
});

describe('składka zdrowotna (skala)', () => {
  it('minimum 2026: 314,96 zł za styczeń, 432,54 zł od lutego; 2027 od lutego 445,50 zł', () => {
    assert.equal(healthContribution(c2026, 1, 0).amount, 31496);
    assert.equal(healthContribution(c2026, 2, 0).amount, 43254);
    assert.equal(healthContribution(c2027, 1, 0).amount, 43254);
    assert.equal(healthContribution(c2027, 2, 0).amount, 44550);
  });
  it('9% dochodu z poprzedniego miesiąca, gdy przekracza minimum', () => {
    const h = healthContribution(c2026, 5, zl(10000));
    assert.equal(h.amount, zl(900));
    assert.equal(h.minimumApplied, false);
  });
  it('dochód miesiąca = przychód − koszty − zapłacone składki', () => {
    const rows = healthIncomes([
      { revenue: zl(8000), costs: zl(1000), socialPaid: zl(1649.82) },
      { revenue: zl(9000), costs: zl(2000), socialPaid: zl(1649.82) },
    ]);
    assert.deepEqual(rows.map((r) => r.income), [zl(5350.18), zl(5350.18)]);
  });
  it('strata nie daje ujemnego dochodu i obniża dochód kolejnego miesiąca (liczenie narastające)', () => {
    const rows = healthIncomes([
      { revenue: 0, costs: zl(1000), socialPaid: 0 },
      { revenue: zl(5000), costs: 0, socialPaid: 0 },
    ]);
    assert.deepEqual(rows.map((r) => r.income), [0, zl(4000)]);
  });
  it('składki większe niż dochód: nadwyżka przechodzi na następny miesiąc', () => {
    const rows = healthIncomes([
      { revenue: zl(1000), costs: 0, socialPaid: zl(1500) },
      { revenue: zl(3000), costs: 0, socialPaid: 0 },
    ]);
    assert.deepEqual(rows.map((r) => [r.income, r.socialDeducted]), [[0, zl(1000)], [zl(2500), zl(500)]]);
  });
});

describe('podatek wg skali i zaliczki', () => {
  it('skala 2026: kwota wolna 30 000 zł, próg 120 000 zł', () => {
    assert.equal(taxOnScale(c2026, zl(30000)), 0);
    assert.equal(taxOnScale(c2026, zl(120000)), zl(10800));
    assert.equal(taxOnScale(c2026, zl(130000)), zl(14000));
  });
  const flat = (n: number, income: number, socialPaid = 0) =>
    Array.from({ length: n }, () => ({ revenue: zl(income), costs: 0, socialPaid: zl(socialPaid) }));

  it('dochód poniżej kwoty wolnej – zaliczki 0, dopiero po przekroczeniu 30 000 zł narastająco', () => {
    const r = advancePayments(c2026, flat(12, 3000));
    assert.deepEqual(r.slice(0, 10).map((m) => m.advance), Array(10).fill(0));
    assert.deepEqual(r.slice(10).map((m) => m.advance), [zl(360), zl(360)]);
  });
  it('przekroczenie progu w trakcie roku: od września 32%', () => {
    const r = advancePayments(c2026, flat(9, 15000));
    assert.equal(r[7]!.taxCumulative, zl(10800));
    assert.equal(r[8]!.advance, zl(4800));
  });
  it('składki społeczne obniżają podstawę, zaokrąglenie do pełnych złotych', () => {
    const r = advancePayments(c2026, [{ revenue: zl(40000.49), costs: 0, socialPaid: zl(1649.82) }]);
    assert.equal(r[0]!.taxBase, zl(38351)); // 38 350,67 → 38 351
    assert.equal(r[0]!.advance, zl(1002)); // 4602,12 − 3600 = 1002,12 → 1002
  });
  it('miesiąc ze stratą: zaliczka 0, bez zwrotu; kolejne miesiące liczone narastająco', () => {
    const r = advancePayments(c2026, [
      { revenue: zl(50000), costs: 0, socialPaid: 0 },
      { revenue: 0, costs: zl(20000), socialPaid: 0 },
      { revenue: zl(20000), costs: 0, socialPaid: 0 },
    ]);
    // marzec: podatek narastająco 2400 zł był już wpłacony w styczniu, więc nic nie dopłacamy
    assert.deepEqual(r.map((m) => m.advance), [zl(2400), 0, 0]);
  });
});

describe('wakacje składkowe', () => {
  it('jeden miesiąc w roku jest w porządku, drugi jest odrzucany', () => {
    assert.equal(validateHolidayMonths(2026, [8]), 8);
    assert.equal(validateHolidayMonths(2026, []), null);
    assert.throws(() => validateHolidayMonths(2026, [3, 8]), /tylko raz/);
    assert.throws(() => validateHolidayMonths(2026, [13]), /Nieprawidłowy/);
  });
  it('wniosek RWS w miesiącu poprzedzającym (dla stycznia – grudzień poprzedniego roku)', () => {
    assert.deepEqual(rwsApplicationMonth(2027, 8), { year: 2027, month: 7 });
    assert.deepEqual(rwsApplicationMonth(2027, 1), { year: 2026, month: 12 });
  });
});

describe('księga: sumy', () => {
  it('liczy sumy miesięczne i narastające', () => {
    const rows = summarizeKpir([
      { month: 1, revenue: zl(100), costs: zl(30) },
      { month: 2, revenue: zl(50), costs: zl(80) },
    ]);
    assert.deepEqual(rows.map((r) => [r.income, r.cumulativeIncome]), [[zl(70), zl(70)], [zl(-30), zl(40)]]);
  });
  it('wymaga miesięcy po kolei i nieujemnych kwot', () => {
    assert.throws(() => summarizeKpir([{ month: 2, revenue: 0, costs: 0 }]), /po kolei/);
    assert.throws(() => summarizeKpir([{ month: 1, revenue: -1, costs: 0 }]), /nieujemnymi/);
  });
});

describe('cały rok', () => {
  const months = (n: number, revenue: number, costs: number): YearMonthInput[] =>
    Array.from({ length: n }, (_, i) => ({ month: i + 1, revenue: zl(revenue), costs: zl(costs) }));

  it('FP zapłacony w miesiącu jest kosztem, a składki za poprzedni miesiąc są odliczane', () => {
    const r = computeYear({ config: c2026, previousConfig: c2026, months: months(2, 12000, 1000), previousDecemberHealthIncome: zl(8000) });
    assert.equal(r.months[1]!.costs, zl(1000) + 13847);
    assert.equal(r.months[1]!.socialPaid.deductible, 164982);
    assert.equal(r.months[0]!.healthDue.amount, zl(720)); // 9% z 8000 zł (grudzień)
    assert.equal(r.months[1]!.healthDue.base, r.months[0]!.healthIncome);
  });
  it('miesiąc wakacji: zero społecznych w DRA, zdrowotna normalnie; w następnym miesiącu nic do odliczenia', () => {
    const r = computeYear({ config: c2026, previousConfig: c2026, months: months(9, 12000, 1000), holidayMonths: [8], previousDecemberHealthIncome: zl(8000) });
    const aug = r.months[7]!;
    const sep = r.months[8]!;
    assert.equal(aug.socialDue.total, 0);
    assert.ok(aug.healthDue.amount > 0);
    assert.equal(aug.zusToPay, aug.healthDue.amount);
    assert.deepEqual(sep.socialPaid, { deductible: 0, funduszPracy: 0 });
    assert.equal(r.holidayMonth, 8);
  });
  it('dwa miesiące wakacji w jednym roku – błąd', () => {
    assert.throws(() => computeYear({ config: c2026, months: months(1, 1, 0), holidayMonths: [2, 7] }), /tylko raz/);
  });
  it('korekta marca zmienia wyniki od marca, a styczeń i luty zostają bez zmian', () => {
    const base = months(12, 12000, 1000);
    const before = computeYear({ config: c2026, previousConfig: c2026, months: base, previousDecemberHealthIncome: zl(8000) });
    const corrected = base.map((m) => (m.month === 3 ? { ...m, costs: zl(6000) } : m));
    const after = computeYear({ config: c2026, previousConfig: c2026, months: corrected, previousDecemberHealthIncome: zl(8000) });
    assert.deepEqual(after.months.slice(0, 2), before.months.slice(0, 2));
    const yearPit = (r: typeof before) => r.months.reduce((sum, m) => sum + m.pitAdvance, 0);
    assert.equal(yearPit(before) - yearPit(after), zl(600)); // 5000 zł więcej kosztów × 12%
    assert.notEqual(after.months[3]!.healthDue.amount, before.months[3]!.healthDue.amount);
  });
  it('ostrzega przy prognozie i brakujących danych z poprzedniego roku', () => {
    const r = computeYear({ config: c2027, months: months(1, 1000, 0) });
    assert.equal(r.warnings.length, 3);
    assert.equal(r.months[0]!.healthDue.amount, 43254); // minimum za styczeń 2027
  });
});
