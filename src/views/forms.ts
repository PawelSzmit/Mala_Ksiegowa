import { html, type Html } from './html.ts';
import { layout, type LayoutUser } from './layout.ts';
import { amountInput, monthHref } from './format.ts';
import { MONTH_NAMES } from './pages.ts';

const errorBox = (error?: string) => (error ? html`<p class="error" role="alert">${error}</p>` : '');

export interface ManualCostValues {
  cost_date?: string;
  received_date?: string;
  document_number?: string;
  counterparty?: string;
  counterparty_tax_id?: string;
  counterparty_address?: string;
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
    <label for="received_date">Data otrzymania (tylko jeśli inna niż wystawienia)</label>
    <input id="received_date" name="received_date" type="date" value="${v.received_date ?? ''}">
    <p class="hint">Dokument za poprzedni miesiąc otrzymany do 9. dnia trafia do poprzedniego miesiąca, otrzymany później – do miesiąca otrzymania.</p>
    <label for="document_number">Numer dokumentu</label>
    <input id="document_number" name="document_number" required maxlength="100" value="${v.document_number ?? ''}">
    <label for="counterparty">Sprzedawca (nazwa)</label>
    <input id="counterparty" name="counterparty" required maxlength="200" value="${v.counterparty ?? ''}">
    <label for="counterparty_tax_id">NIP sprzedawcy albo zagraniczny numer VAT (z kodem kraju, np. IE6388047V)</label>
    <input id="counterparty_tax_id" name="counterparty_tax_id" maxlength="20" value="${v.counterparty_tax_id ?? ''}">
    <label for="counterparty_address">Adres sprzedawcy (wymagany, gdy nie ma NIP-u)</label>
    <input id="counterparty_address" name="counterparty_address" maxlength="200" value="${v.counterparty_address ?? ''}">
    <p class="hint">Wzór księgi wymaga NIP-u kontrahenta albo jego nazwy i adresu.</p>
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

export interface PayerValues {
  first_name: string;
  last_name: string;
  pesel: string;
  regon: string;
  short_name: string;
}

function payerCard(v: PayerValues, error?: string, saved?: boolean): Html {
  return html`<div class="card" id="dane">
  <h1>Dane do deklaracji ZUS i księgi</h1>
  ${errorBox(error)}
  ${saved ? html`<p class="notice" role="status">Zapisano.</p>` : ''}
  <form method="post" action="/ustawienia/dane">
    <label for="first_name">Imię</label>
    <input id="first_name" name="first_name" required maxlength="22" autocomplete="given-name" value="${v.first_name}">
    <label for="last_name">Nazwisko</label>
    <input id="last_name" name="last_name" required maxlength="31" autocomplete="family-name" value="${v.last_name}">
    <label for="pesel">PESEL</label>
    <input id="pesel" name="pesel" inputmode="numeric" required maxlength="11" value="${v.pesel}">
    <label for="regon">REGON (jeśli masz)</label>
    <input id="regon" name="regon" inputmode="numeric" maxlength="14" value="${v.regon}">
    <label for="short_name">Nazwa skrócona firmy (jak w CEIDG, jeśli jest)</label>
    <input id="short_name" name="short_name" maxlength="31" value="${v.short_name}">
    <p class="hint">Te dane trafiają do pliku DRA (wraz z NIP-em z ustawień KSeF) i do nagłówka księgi.</p>
    <button type="submit">Zapisz dane</button>
  </form>
</div>`;
}

export interface HolidayYear {
  year: number;
  month: number | null;
}

const HOLIDAY_MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

function holidayCard(years: HolidayYear[], error?: string, saved?: boolean): Html {
  return html`<div class="card" id="wakacje">
  <h1>Wakacje składkowe</h1>
  ${errorBox(error)}
  ${saved ? html`<p class="notice" role="status">Zapisano.</p>` : ''}
  <p class="hint">Raz w roku możesz nie płacić składek społecznych i Funduszu Pracy za wybrany miesiąc (zdrowotną płacisz). Wniosek RWS składasz w eZUS w miesiącu przed wakacjami – aplikacja przypomni o nim na stronie tamtego miesiąca.</p>
  ${years.map((y) => html`<form method="post" action="/ustawienia/wakacje" class="row">
    <input type="hidden" name="year" value="${String(y.year)}">
    <label for="holiday-${String(y.year)}">Rok ${String(y.year)}</label>
    <select id="holiday-${String(y.year)}" name="month">
      <option value="" ${y.month === null ? html`selected` : ''}>bez wakacji</option>
      ${HOLIDAY_MONTHS.map((name, i) => html`<option value="${String(i + 1)}" ${y.month === i + 1 ? html`selected` : ''}>${name}</option>`)}
    </select>
    <button type="submit" class="secondary">Zapisz</button>
  </form>`)}
  <p class="hint">Zmiana jest możliwa, dopóki miesiąc wakacji i późniejsze miesiące nie są zamknięte.</p>
</div>`;
}

export function settingsPage(p: {
  user: LayoutUser; values: SettingsValues; error?: string; saved?: boolean;
  payer: PayerValues; payerError?: string; payerSaved?: boolean;
  holidays: HolidayYear[]; holidayError?: string; holidaySaved?: boolean;
}): Html {
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
</div>
${payerCard(p.payer, p.payerError, p.payerSaved)}
${holidayCard(p.holidays, p.holidayError, p.holidaySaved)}`,
    p.user,
    'ustawienia',
  );
}
