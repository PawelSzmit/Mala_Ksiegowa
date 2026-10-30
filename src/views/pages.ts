import { html, type Html } from './html.ts';
import { layout } from './layout.ts';
import { date, monthHref, pln } from './format.ts';
import { syncStatusBox, type SyncStatus } from './invoices.ts';

export const MONTH_NAMES = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

export function loginPage(error?: string): Html {
  return layout(
    'Logowanie',
    html`<div class="card">
  <h1>Logowanie</h1>
  <p class="muted">Hasło i 6-cyfrowy kod z aplikacji w telefonie.</p>
  ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
  <form method="post" action="/logowanie">
    <label for="username">Login</label>
    <input id="username" name="username" autocomplete="username" required>
    <label for="password">Hasło</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <label for="code">Kod z telefonu</label>
    <input id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
    <button type="submit">Zaloguj</button>
  </form>
</div>`,
  );
}

export interface MonthEntry {
  source: 'invoice' | 'manual_cost' | 'cash_report' | 'fp';
  source_id: number | null;
  entry_date: string;
  document_number: string;
  counterparty: string | null;
  description: string;
  revenue: number;
  other_costs: number;
  has_attachment: boolean;
}

export interface MonthView {
  year: number;
  month: number;
  status: 'open' | 'closed';
  invoicesToReview: number;
  cashReport: { amount: number; hasPhoto: boolean } | null;
  entries: MonthEntry[];
  sync: SyncStatus;
}

const shift = (year: number, month: number, delta: number) => {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};
const href = ({ year, month }: { year: number; month: number }) => monthHref(year, month);
const SOURCE_LABEL = { invoice: 'faktura KSeF', manual_cost: 'spoza KSeF', cash_report: 'raport z kasy', fp: 'Fundusz Pracy' } as const;

function entryRow(e: MonthEntry, open: boolean): Html {
  const amount = e.revenue ? html`<strong>+${pln(e.revenue)}</strong>` : html`<strong>${pln(e.other_costs)}</strong>`;
  return html`<div class="row">
  <span>${date(e.entry_date)} · ${e.document_number}${e.counterparty ? html` · ${e.counterparty}` : ''}<br><span class="muted">${e.description} · ${SOURCE_LABEL[e.source]}</span>${
    e.source === 'manual_cost' && e.has_attachment ? html` · <a href="/koszty/${e.source_id}/zalacznik">załącznik</a>` : ''
  }</span>
  <span>${amount}${open && e.source === 'manual_cost' ? html`<form method="post" action="/koszty/${e.source_id}/usun"><button type="submit" class="link">Usuń</button></form>` : ''}</span>
</div>`;
}

export function monthPage(view: MonthView, user: { username: string }, notice?: string): Html {
  const prev = shift(view.year, view.month, -1);
  const next = shift(view.year, view.month, 1);
  const open = view.status === 'open';
  const mm = String(view.month).padStart(2, '0');
  const costs = view.entries.filter((e) => !e.revenue);
  const totalCosts = costs.reduce((sum, e) => sum + e.other_costs, 0);
  return layout(
    `${MONTH_NAMES[view.month - 1]} ${view.year}`,
    html`<nav class="months">
  <a href="${href(prev)}">← ${MONTH_NAMES[prev.month - 1]} ${prev.year}</a>
  <a href="${href(next)}">${MONTH_NAMES[next.month - 1]} ${next.year} →</a>
</nav>
<div class="card">
  <h1>${MONTH_NAMES[view.month - 1]} ${view.year}</h1>
  <span class="badge">${open ? 'Otwarty' : 'Zamknięty'}</span>
</div>
${notice ? html`<div class="card notice" role="status">${notice}</div>` : ''}
${view.invoicesToReview ? html`<div class="card notice">Faktury z KSeF do przejrzenia: <strong>${view.invoicesToReview}</strong> · <a href="/faktury">Przejrzyj</a></div>` : ''}
<div class="card">
  <h2>Przychód</h2>
  <div class="row"><span>Raport z kasy</span><strong>${view.cashReport ? pln(view.cashReport.amount) : 'brak'}</strong></div>
  ${open ? html`<div class="actions"><a class="button" href="/kasa/${view.year}/${mm}">${view.cashReport ? 'Popraw raport z kasy' : 'Wpisz raport z kasy'}</a></div>` : ''}
</div>
<div class="card">
  <h2>Koszty</h2>
  ${costs.length ? costs.map((e) => entryRow(e, open)) : html`<p class="muted">Brak kosztów w tym miesiącu.</p>`}
  ${costs.length ? html`<div class="row"><span>Razem</span><strong>${pln(totalCosts)}</strong></div>` : ''}
  ${open ? html`<div class="actions"><a class="button" href="/koszty/nowy?miesiac=${view.year}-${mm}">Dodaj koszt spoza KSeF</a></div>` : ''}
</div>
<div class="card"><a href="/ksiega/${view.year}/${mm}">Zobacz zapisy tego miesiąca w księdze (KPiR) →</a></div>
${syncStatusBox(view.sync, false)}
<div class="card">
  <button type="button" disabled title="Dostępne w kolejnych etapach">Zamknij miesiąc</button>
</div>`,
    user,
    'miesiac',
  );
}

export function errorPage(status: number, message: string, user?: { username: string }): Html {
  return layout('Błąd', html`<div class="card"><h1>${status === 404 ? 'Nie ma takiej strony' : 'Coś poszło nie tak'}</h1><p>${message}</p><p><a href="/">Wróć do bieżącego miesiąca</a></p></div>`, user);
}
