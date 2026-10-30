import { html, type Html } from './html.ts';
import { layout } from './layout.ts';

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

export interface MonthView {
  year: number;
  month: number;
  status: 'open' | 'closed';
  invoicesToReview: number;
  hasCashReport: boolean;
}

const shift = (year: number, month: number, delta: number) => {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};
const monthHref = ({ year, month }: { year: number; month: number }) => `/miesiac/${year}/${String(month).padStart(2, '0')}`;

export function monthPage(view: MonthView, user: { username: string }): Html {
  const prev = shift(view.year, view.month, -1);
  const next = shift(view.year, view.month, 1);
  return layout(
    `${MONTH_NAMES[view.month - 1]} ${view.year}`,
    html`<nav class="months">
  <a href="${monthHref(prev)}">← ${MONTH_NAMES[prev.month - 1]} ${prev.year}</a>
  <a href="${monthHref(next)}">${MONTH_NAMES[next.month - 1]} ${next.year} →</a>
</nav>
<div class="card">
  <h1>${MONTH_NAMES[view.month - 1]} ${view.year}</h1>
  <span class="badge">${view.status === 'closed' ? 'Zamknięty' : 'Otwarty'}</span>
</div>
<div class="card">
  <div class="row"><span>Faktury do przejrzenia</span><strong>${view.invoicesToReview}</strong></div>
  <div class="row"><span>Raport z kasy</span><strong>${view.hasCashReport ? 'wpisany' : 'brak'}</strong></div>
  <button type="button" disabled title="Dostępne w kolejnych etapach">Zamknij miesiąc</button>
</div>`,
    user,
  );
}

export function errorPage(status: number, message: string, user?: { username: string }): Html {
  return layout('Błąd', html`<div class="card"><h1>${status === 404 ? 'Nie ma takiej strony' : 'Coś poszło nie tak'}</h1><p>${message}</p><p><a href="/">Wróć do bieżącego miesiąca</a></p></div>`, user);
}
