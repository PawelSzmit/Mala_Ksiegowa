import { html, type Html } from './html.ts';
import { layout, type LayoutUser } from './layout.ts';
import { amountInput, monthHref } from './format.ts';
import { MONTH_NAMES } from './pages.ts';

const errorBox = (error?: string) => (error ? html`<p class="error" role="alert">${error}</p>` : '');

export interface ManualCostValues {
  cost_date?: string;
  document_number?: string;
  counterparty?: string;
  description?: string;
  amount?: string;
}

export function manualCostPage(p: { user: LayoutUser; year: number; month: number; values: ManualCostValues; error?: string }): Html {
  const v = p.values;
  return layout(
    'Koszt spoza KSeF',
    html`<div class="card">
  <h1>Koszt spoza KSeF</h1>
  <p class="muted">Np. paragon z NIP, faktura zagraniczna, rachunek. Kwota brutto – firma nie jest płatnikiem VAT.</p>
  ${errorBox(p.error)}
  <form method="post" action="/koszty" enctype="multipart/form-data">
    <label for="cost_date">Data wystawienia dokumentu</label>
    <input id="cost_date" name="cost_date" type="date" required value="${v.cost_date ?? ''}">
    <label for="document_number">Numer dokumentu</label>
    <input id="document_number" name="document_number" required maxlength="100" value="${v.document_number ?? ''}">
    <label for="counterparty">Sprzedawca (nazwa i ewentualnie NIP)</label>
    <input id="counterparty" name="counterparty" required maxlength="200" value="${v.counterparty ?? ''}">
    <label for="description">Czego dotyczy</label>
    <input id="description" name="description" required maxlength="200" value="${v.description ?? ''}">
    <label for="amount">Kwota brutto (zł)</label>
    <input id="amount" name="amount" inputmode="decimal" required placeholder="np. 123,45" value="${v.amount ?? ''}">
    <label for="attachment">Skan lub PDF (opcjonalnie)</label>
    <input id="attachment" name="attachment" type="file" accept="application/pdf,image/jpeg,image/png,image/heic">
    <p class="hint">PDF, JPG, PNG lub HEIC, najwyżej 8 MB.</p>
    <div class="actions"><button type="submit">Zapisz koszt</button><a href="${monthHref(p.year, p.month)}">Anuluj</a></div>
  </form>
</div>`,
    p.user,
    'miesiac',
  );
}

export interface CashValues {
  report_date?: string;
  amount?: string;
}

export function cashReportPage(p: { user: LayoutUser; year: number; month: number; values: CashValues; existing: { hasPhoto: boolean; amount: number } | null; error?: string }): Html {
  const label = `${MONTH_NAMES[p.month - 1]} ${p.year}`;
  const base = `/kasa/${p.year}/${String(p.month).padStart(2, '0')}`;
  return layout(
    'Raport z kasy',
    html`<div class="card">
  <h1>Raport z kasy – ${label}</h1>
  <p class="muted">Raport miesięczny z kasy fiskalnej. Kwota sprzedaży brutto trafi do księgi jako przychód.</p>
  ${errorBox(p.error)}
  <form method="post" action="${base}" enctype="multipart/form-data">
    <label for="report_date">Data raportu</label>
    <input id="report_date" name="report_date" type="date" required value="${p.values.report_date ?? ''}">
    <label for="amount">Sprzedaż brutto z raportu (zł)</label>
    <input id="amount" name="amount" inputmode="decimal" required placeholder="np. 8450,00" value="${p.values.amount ?? (p.existing ? amountInput(p.existing.amount) : '')}">
    <label for="photo">Zdjęcie raportu (opcjonalnie)</label>
    <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/heic,application/pdf">
    ${p.existing?.hasPhoto ? html`<p class="hint">Zapisane zdjęcie: <a href="${base}/zdjecie">otwórz</a>. Nowe zdjęcie zastąpi poprzednie.</p>` : html`<p class="hint">JPG, PNG, HEIC lub PDF, najwyżej 8 MB.</p>`}
    <div class="actions"><button type="submit">${p.existing ? 'Zapisz zmiany' : 'Zapisz raport'}</button><a href="${monthHref(p.year, p.month)}">Anuluj</a></div>
  </form>
</div>`,
    p.user,
    'miesiac',
  );
}

export interface SettingsValues {
  nip: string;
  ksef_env: string;
  ksef_sync_from: string;
  hasToken: boolean;
}

export function settingsPage(p: { user: LayoutUser; values: SettingsValues; error?: string; saved?: boolean }): Html {
  const v = p.values;
  const env = (value: string, label: string) => html`<option value="${value}" ${v.ksef_env === value ? html`selected` : ''}>${label}</option>`;
  return layout(
    'Ustawienia',
    html`<div class="card">
  <h1>Ustawienia KSeF</h1>
  ${errorBox(p.error)}
  ${p.saved ? html`<p class="notice" role="status">Zapisano.</p>` : ''}
  <form method="post" action="/ustawienia">
    <label for="nip">NIP firmy</label>
    <input id="nip" name="nip" inputmode="numeric" required value="${v.nip}">
    <label for="ksef_token">Token KSeF (tylko do odczytu faktur)</label>
    <input id="ksef_token" name="ksef_token" type="password" autocomplete="off" placeholder="${v.hasToken ? 'zapisany – zostaw puste, żeby nie zmieniać' : 'wklej token wygenerowany w KSeF'}">
    <p class="hint">Token jest przechowywany w zaszyfrowanej postaci i nie jest już nigdzie wyświetlany.</p>
    <label for="ksef_sync_from">Pobieraj faktury otrzymane od dnia</label>
    <input id="ksef_sync_from" name="ksef_sync_from" type="date" required value="${v.ksef_sync_from}">
    <p class="hint">Zmiana tej daty albo NIP-u rozpocznie pobieranie od nowa (bez duplikatów).</p>
    <label for="ksef_env">Środowisko KSeF</label>
    <select id="ksef_env" name="ksef_env">${env('prod', 'produkcyjne (prawdziwe faktury)')}${env('test', 'testowe')}${env('demo', 'demo')}</select>
    <button type="submit">Zapisz</button>
  </form>
</div>`,
    p.user,
    'ustawienia',
  );
}
