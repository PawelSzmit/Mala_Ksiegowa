import { html, type Html } from './html.ts';
import { layout } from './layout.ts';
import { date, monthHref, pln } from './format.ts';
import { syncStatusBox, type SyncStatus } from './invoices.ts';
import type { SavedMonthResult } from '../month/close.ts';
import type { RwsReminder } from '../month/holiday.ts';
import { closedMonthCard } from './month-close.ts';

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
  /** Wyliczenie zapisane przy zamknięciu (tylko zamknięty miesiąc). */
  closed: SavedMonthResult | null;
  /** Od 1. do 9. dnia: faktury za poprzedni miesiąc czekające na decyzję. */
  pendingPrevious: { year: number; month: number; count: number } | null;
  /** Następny miesiąc to wakacje składkowe – w tym miesiącu trzeba złożyć wniosek RWS. */
  rws: RwsReminder | null;
  /** Ten miesiąc to miesiąc wakacji składkowych. */
  holiday: boolean;
}

/** Przypomnienie o wniosku RWS z danymi do przepisania (wniosek składa się tylko w eZUS, pliku nie da się zaimportować). */
function rwsCard(r: RwsReminder, year: number, month: number): Html {
  const target = `${MONTH_NAMES[r.month - 1]!.toLowerCase()} ${r.year}`;
  const p = r.payer;
  const row = (label: string, value: string | null) => html`<div class="row"><span>${label}</span><strong>${value || '—'}</strong></div>`;
  return html`<div class="card notice" id="rws">
  <h2>Złóż wniosek RWS do ${lastDay(year, month)}</h2>
  <p>Wakacje składkowe za ${target} – wniosek trzeba złożyć w eZUS w tym miesiącu, później ZUS go nie uwzględni.${
    r.saving !== null ? html` Zwolnienie obejmie około <strong>${pln(r.saving)}</strong> składek społecznych i Funduszu Pracy (zdrowotną płacisz normalnie).` : ''}</p>
  <p class="hint">W eZUS znajdź wniosek „RWS” (o zwolnienie z obowiązku opłacenia składek za wybrany miesiąc) – najprościej wpisując RWS w wyszukiwarkę dokumentów. Dane do wniosku:</p>
  ${row('Miesiąc zwolnienia', `${String(r.month).padStart(2, '0')}/${r.year}`)}
  ${row('NIP', p.nip)}
  ${row('PESEL', p.pesel)}
  ${row('REGON', p.regon)}
  ${row('Nazwisko i imię', p.last_name || p.first_name ? `${p.last_name ?? ''} ${p.first_name ?? ''}`.trim() : null)}
  <p class="hint">Kod PKD i jego wersję przepisz z CEIDG. Gdy ZUS odmówi zwolnienia, usuń wakacje w <a href="/ustawienia#wakacje">Ustawieniach</a> – składki za ${target} trzeba wtedy zapłacić normalnie.</p>
</div>`;
}

const lastDay = (year: number, month: number) => {
  const d = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${d}.${String(month).padStart(2, '0')}.${year}`;
};

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
${view.rws ? rwsCard(view.rws, view.year, view.month) : ''}
${view.holiday && open ? html`<div class="card notice"><strong>Miesiąc wakacji składkowych.</strong> Składek społecznych i Funduszu Pracy za ten miesiąc nie płacisz, zdrowotną tak. Zwolnienie działa tylko wtedy, gdy ZUS przyjął wniosek RWS – jeśli odmówił, usuń wakacje w <a href="/ustawienia#wakacje">Ustawieniach</a>.</div>` : ''}
${view.pendingPrevious ? html`<div class="card error" role="alert"><strong>Faktury za ${MONTH_NAMES[view.pendingPrevious.month - 1]!.toLowerCase()} czekają na decyzję: ${view.pendingPrevious.count}.</strong> Przyszły do 9. dnia, więc należą do poprzedniego miesiąca – rozstrzygnij je przed zapłatą ZUS 10. i przed zamknięciem tamtego miesiąca. · <a href="/faktury">Przejrzyj</a></div>` : ''}
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
${view.closed
  ? closedMonthCard(view.closed, view.year, view.month)
  : html`<div class="card"><div class="actions"><a class="button" href="/miesiac/${view.year}/${mm}/zamkniecie">Zamknij miesiąc</a></div>
  <p class="hint">Najpierw zobaczysz kwoty ZUS i PIT do zapłaty; po zamknięciu pobierzesz plik DRA.</p></div>`}`,
    user,
    'miesiac',
  );
}

export function errorPage(status: number, message: string, user?: { username: string }): Html {
  return layout('Błąd', html`<div class="card"><h1>${status === 404 ? 'Nie ma takiej strony' : 'Coś poszło nie tak'}</h1><p>${message}</p><p><a href="/">Wróć do bieżącego miesiąca</a></p></div>`, user);
}
