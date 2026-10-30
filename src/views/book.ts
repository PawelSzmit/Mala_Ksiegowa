import type { BookMonth, BookRow, BookTotals } from '../rules/kpir-book.ts';
import { html, type Html } from './html.ts';
import { layout, type LayoutUser } from './layout.ts';
import { date, monthHref } from './format.ts';
import { MONTH_NAMES } from './pages.ts';

/** Kwota w komórce księgi: „1 234,56” (bez „zł” – nagłówek kolumny mówi „zł gr”); zero w zapisie = puste pole. */
export function cell(grosze: number, showZero = false): string {
  if (!grosze && !showZero) return '';
  const sign = grosze < 0 ? '-' : '';
  const abs = Math.abs(grosze);
  return `${sign}${Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${String(abs % 100).padStart(2, '0')}`;
}

const HEAD = html`<thead>
<tr>
  <th rowspan="2">Lp.</th><th rowspan="2">Data zdarzenia gospodarczego</th>
  <th colspan="2">Oznaczenie dowodu księgowego</th>
  <th colspan="3">Kontrahent</th>
  <th rowspan="2">Opis zdarzenia gospodarczego</th>
  <th colspan="3">Przychód</th>
  <th rowspan="2">Zakup towarów handlowych i materiałów wg cen zakupu</th>
  <th rowspan="2">Koszty uboczne zakupu</th>
  <th colspan="3">Wydatki (koszty)</th>
  <th colspan="2">Koszty działalności badawczo-rozwojowej (art. 26e ustawy o PIT)</th>
  <th rowspan="2">Uwagi</th>
</tr>
<tr>
  <th>numer identyfikujący fakturę w KSeF</th><th>numer dowodu księgowego</th>
  <th>identyfikator podatkowy</th><th>imię i nazwisko (nazwa firmy)</th><th>adres</th>
  <th>wartość sprzedanych towarów i usług</th><th>pozostałe przychody</th><th>razem przychód (9+10)</th>
  <th>wynagrodzenia w gotówce i w naturze</th><th>pozostałe wydatki</th><th>razem wydatki (14+15)</th>
  <th>opis kosztu</th><th>wartość</th>
</tr>
<tr class="colnums">${Array.from({ length: 19 }, (_, i) => html`<th>${i + 1}</th>`)}</tr>
</thead>`;

function row(r: BookRow): Html {
  const revenue = r.revenue;
  const costs = r.other_costs;
  // Kontrahent: przy identyfikatorze podatkowym nazwy i adresu nie trzeba (objaśnienia pkt 5); dla czytelności zostawiamy nazwę.
  // Raport z kasy: kolumn 3–7 nie wypełnia się (objaśnienia pkt 1 i 5).
  const isCash = r.source === 'cash_report';
  return html`<tr>
  <td class="num">${r.lp}</td><td>${date(r.entry_date)}</td>
  <td class="ksef">${r.ksef_number ?? ''}</td><td>${r.ksef_number ? '' : r.document_number}</td>
  <td>${isCash ? '' : r.counterparty_tax_id ?? ''}</td><td>${isCash ? '' : r.counterparty ?? ''}</td><td></td>
  <td>${r.description}</td>
  <td class="amt">${cell(revenue)}</td><td class="amt"></td><td class="amt">${cell(revenue)}</td>
  <td class="amt"></td><td class="amt"></td>
  <td class="amt"></td><td class="amt">${cell(costs)}</td><td class="amt">${cell(costs)}</td>
  <td></td><td class="amt"></td>
  <td>${[r.ksef_number ? `nr faktury: ${r.document_number}` : null, r.notes].filter(Boolean).join('; ')}</td>
</tr>`;
}

function sumRow(label: string, t: BookTotals, cls: string): Html {
  return html`<tr class="${cls}"><td colspan="8">${label}</td>
  <td class="amt">${cell(t.sales, true)}</td><td class="amt">${cell(t.otherRevenue, true)}</td><td class="amt">${cell(t.revenue, true)}</td>
  <td class="amt">${cell(t.purchases, true)}</td><td class="amt">${cell(t.incidental, true)}</td>
  <td class="amt">${cell(t.wages, true)}</td><td class="amt">${cell(t.otherCosts, true)}</td><td class="amt">${cell(t.costs, true)}</td>
  <td></td><td></td><td></td></tr>`;
}

export function monthTable(m: BookMonth, year: number): Html {
  const name = `${MONTH_NAMES[m.month - 1]} ${year}`;
  return html`<section class="book-month">
<h2>${name}</h2>
<div class="table-wrap"><table class="book">${HEAD}<tbody>
${m.rows.length ? m.rows.map(row) : html`<tr><td colspan="19" class="muted">Brak zapisów w tym miesiącu.</td></tr>`}
${sumRow(`Razem ${MONTH_NAMES[m.month - 1].toLowerCase()}`, m.totals, 'sum')}
${m.month > 1 ? sumRow('Od początku roku do końca poprzedniego miesiąca', m.previous, 'sum-prev') : ''}
${sumRow('Od początku roku', m.cumulative, 'sum-cum')}
</tbody></table></div>
</section>`;
}

function annualSummary(months: BookMonth[], year: number): Html {
  const last = months[months.length - 1];
  return html`<section class="book-month">
<h2>Zestawienie ${months.length === 12 ? 'roczne' : 'od początku roku'} ${year}</h2>
<div class="table-wrap"><table class="book summary"><thead><tr><th>Miesiąc</th><th>Przychód (kol. 11)</th><th>Wydatki (kol. 16)</th><th>Dochód</th><th>Przychód narastająco</th><th>Wydatki narastająco</th><th>Dochód narastająco</th></tr></thead><tbody>
${months.map((m) => html`<tr><td>${MONTH_NAMES[m.month - 1]}</td><td class="amt">${cell(m.totals.revenue, true)}</td><td class="amt">${cell(m.totals.costs, true)}</td>
  <td class="amt">${cell(m.totals.revenue - m.totals.costs, true)}</td><td class="amt">${cell(m.cumulative.revenue, true)}</td>
  <td class="amt">${cell(m.cumulative.costs, true)}</td><td class="amt">${cell(m.cumulative.revenue - m.cumulative.costs, true)}</td></tr>`)}
${last ? html`<tr class="sum-cum"><td>Razem</td><td class="amt">${cell(last.cumulative.revenue, true)}</td><td class="amt">${cell(last.cumulative.costs, true)}</td><td class="amt">${cell(last.cumulative.revenue - last.cumulative.costs, true)}</td><td></td><td></td><td></td></tr>` : ''}
</tbody></table></div>
</section>`;
}

export interface BookHeader {
  nip: string | null;
  owner: string | null;
}

function bookHeader(h: BookHeader, year: number, subtitle: string): Html {
  return html`<div class="book-title">
  <h1>Podatkowa księga przychodów i rozchodów</h1>
  <p>${subtitle} · rok ${year}${h.owner ? html` · ${h.owner}` : ''}${h.nip ? html` · NIP ${h.nip}` : ''}</p>
  <p class="muted print-only">Wzór wg rozporządzenia Ministra Finansów i Gospodarki z 6 września 2025 r. (Dz.U. 2025 poz. 1299).</p>
</div>`;
}

const toolbar = (links: Html) => html`<div class="actions no-print">${links}<button type="button" data-print>Drukuj / zapisz jako PDF</button></div>`;

export function bookMonthPage(p: { user: LayoutUser; year: number; month: BookMonth; header: BookHeader }): Html {
  const mm = String(p.month.month).padStart(2, '0');
  return layout(
    `Księga ${MONTH_NAMES[p.month.month - 1]} ${p.year}`,
    html`${bookHeader(p.header, p.year, MONTH_NAMES[p.month.month - 1])}
${toolbar(html`<a href="${monthHref(p.year, p.month.month)}">← wróć do miesiąca</a><a href="/ksiega/${p.year}">cały rok ${p.year}</a>`)}
${monthTable(p.month, p.year)}
<p class="muted no-print">Plik: księga-${p.year}-${mm}. W oknie drukowania wybierz „Zapisz jako PDF” i układ poziomy.</p>`,
    p.user,
    'ksiega',
    { wide: true },
  );
}

export function bookYearPage(p: { user: LayoutUser; year: number; months: BookMonth[]; header: BookHeader }): Html {
  return layout(
    `Księga ${p.year}`,
    html`${bookHeader(p.header, p.year, 'Cały rok')}
${toolbar(html`<a href="/ksiega/${p.year - 1}">← ${p.year - 1}</a><a href="/ksiega/${p.year + 1}">${p.year + 1} →</a>`)}
${p.months.map((m) => monthTable(m, p.year))}
${annualSummary(p.months, p.year)}`,
    p.user,
    'ksiega',
    { wide: true },
  );
}
