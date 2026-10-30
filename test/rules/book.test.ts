import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { costBookingDate } from '../../src/rules/booking.ts';
import { buildBook, type BookEntry } from '../../src/rules/kpir-book.ts';

describe('miesiąc kosztu (zasada Pawła: do 9. dnia → poprzedni miesiąc)', () => {
  it('faktura otrzymana w miesiącu wystawienia: data wystawienia', () => {
    assert.equal(costBookingDate('2026-10-05', '2026-10-28'), '2026-10-05');
  });
  it('za poprzedni miesiąc, otrzymana do 9. dnia włącznie: zostaje w poprzednim miesiącu', () => {
    assert.equal(costBookingDate('2026-10-30', '2026-11-09'), '2026-10-30');
    assert.equal(costBookingDate('2026-10-30', '2026-11-01'), '2026-10-30');
  });
  it('otrzymana po 9. dniu: koszt przechodzi na miesiąc otrzymania', () => {
    assert.equal(costBookingDate('2026-10-30', '2026-11-10'), '2026-11-10');
  });
  it('sprzed dwóch miesięcy: zawsze miesiąc otrzymania, nawet na początku miesiąca', () => {
    assert.equal(costBookingDate('2026-09-15', '2026-11-03'), '2026-11-03');
  });
  it('przełom roku: grudniowa faktura otrzymana 5 stycznia zostaje w grudniu', () => {
    assert.equal(costBookingDate('2026-12-30', '2027-01-05'), '2026-12-30');
    assert.equal(costBookingDate('2026-12-30', '2027-01-12'), '2027-01-12');
  });
});

const entry = (id: number, month: number, day: number, revenue: number, cost: number): BookEntry => ({
  id, month, entry_date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, document_number: `D/${id}`, ksef_number: null,
  counterparty: null, counterparty_tax_id: null, counterparty_address: null, description: 'x', revenue, other_costs: cost, notes: null, source: revenue ? 'cash_report' : 'invoice',
});

describe('księga: numeracja i sumy (Dz.U. 2025 poz. 1299, objaśnienia pkt 2 i 19)', () => {
  it('liczba porządkowa ciągła w roku, w kolejności dat (nie wpisania)', () => {
    const months = buildBook([entry(5, 2, 3, 0, 100), entry(1, 1, 20, 0, 200), entry(2, 1, 4, 0, 300), entry(9, 2, 1, 0, 50)], 2);
    assert.deepEqual(months.map((m) => m.rows.map((r) => [r.lp, r.id])), [[[1, 2], [2, 1]], [[3, 9], [4, 5]]]);
  });
  it('sumy miesiąca, od początku roku do poprzedniego miesiąca i od początku roku; korekta zmniejsza koszty', () => {
    const months = buildBook([entry(1, 1, 31, 1000_00, 0), entry(2, 1, 5, 0, 200_00), entry(3, 3, 31, 800_00, 0), entry(4, 3, 7, 0, -50_00)], 3);
    const march = months[2]!;
    assert.equal(months.length, 3);
    assert.deepEqual(months[1]!.rows, [], 'luty bez zapisów też jest');
    assert.deepEqual([march.totals.revenue, march.totals.sales, march.totals.costs, march.totals.otherCosts], [800_00, 800_00, -50_00, -50_00]);
    assert.deepEqual([march.previous.revenue, march.previous.costs], [1000_00, 200_00]);
    assert.deepEqual([march.cumulative.revenue, march.cumulative.costs], [1800_00, 150_00]);
  });
});
