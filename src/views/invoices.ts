import type { FaCorrected, FaItem } from '../ksef/parse-fa.ts';
import { html, type Html } from './html.ts';
import { layout, type LayoutUser } from './layout.ts';
import { amountInput, date, dateTime, monthHref, pln } from './format.ts';

export interface InvoiceRow {
  id: number;
  ksef_number: string;
  invoice_number: string;
  seller_nip: string | null;
  seller_name: string | null;
  issue_date: string;
  gross_amount: number;
  currency: string;
  is_correction: boolean;
  corrected: FaCorrected[] | null;
  correction_reason: string | null;
  items: FaItem[] | null;
  status: 'to_review' | 'cost' | 'not_cost';
  decided_at: Date | null;
  has_xml: boolean;
  parse_error: string | null;
  pln_amount: number | null;
}

export interface SyncStatus {
  configured: boolean;
  lastSuccessAt: Date | null;
  lastAttemptAt: Date | null;
  lastError: string | null;
  xmlPending: number;
}

export function syncStatusBox(s: SyncStatus, withButton: boolean): Html {
  if (!s.configured) {
    return html`<div class="card notice">Pobieranie faktur z KSeF nie jest jeszcze ustawione. <a href="/ustawienia">Uzupełnij ustawienia</a>.</div>`;
  }
  return html`<div class="card">
  <div class="row"><span>Ostatnia udana synchronizacja z KSeF</span><strong>${dateTime(s.lastSuccessAt)}</strong></div>
  ${s.lastError ? html`<p class="error" role="alert">Ostatnia próba (${dateTime(s.lastAttemptAt)}) nie powiodła się: ${s.lastError}</p>` : ''}
  ${s.xmlPending ? html`<p class="muted">${s.xmlPending} faktur czeka na pobranie treści – dociągniemy ją przy następnej synchronizacji.</p>` : ''}
  ${withButton ? html`<form method="post" action="/faktury/sprawdz"><button type="submit">Sprawdź teraz</button></form>` : ''}
</div>`;
}

const sellerLine = (inv: InvoiceRow) => html`${inv.seller_name ?? 'Dostawca bez nazwy'}${inv.seller_nip ? html` <span class="muted">· NIP ${inv.seller_nip}</span>` : ''}`;

function itemsList(items: FaItem[] | null): Html | string {
  if (!items?.length) return '';
  return html`<details><summary>Pozycje (${items.length})</summary><ul class="items">${items.map(
    (it) => html`<li>${it.before ? html`<span class="badge">przed korektą</span> ` : ''}${it.name}${it.quantity ? html` <span class="muted">· ${it.quantity} ${it.unit ?? ''}</span>` : ''}${
      it.gross !== undefined ? html` <span class="muted">· ${pln(it.gross)} brutto</span>` : it.net !== undefined ? html` <span class="muted">· ${pln(it.net)} netto</span>` : ''
    }</li>`,
  )}</ul></details>`;
}

function correctionInfo(inv: InvoiceRow): Html | string {
  if (!inv.is_correction) return '';
  const refs = (inv.corrected ?? []).map((c) => [c.invoiceNumber, c.issueDate ? `z ${date(c.issueDate)}` : ''].filter(Boolean).join(' ')).filter(Boolean);
  return html`<p class="warning"><span class="badge badge-warn">KOREKTA</span> ${refs.length ? html`Koryguje fakturę ${refs.join(', ')}.` : 'Faktura korygująca.'}${
    inv.correction_reason ? html` Powód: ${inv.correction_reason}.` : ''
  } Kwota to różnica wynikająca z korekty${inv.gross_amount < 0 ? ' – zmniejszy koszty' : ''}.</p>`;
}

function invoiceCard(inv: InvoiceRow): Html {
  const foreign = inv.currency !== 'PLN';
  return html`<div class="card invoice">
  <div class="row"><strong>${inv.invoice_number}</strong><strong>${foreign ? `${amountInput(inv.gross_amount)} ${inv.currency}` : pln(inv.gross_amount)}</strong></div>
  <p>${sellerLine(inv)}<br><span class="muted">Wystawiona ${date(inv.issue_date)} · nr KSeF ${inv.ksef_number}</span></p>
  ${correctionInfo(inv)}
  ${!inv.has_xml ? html`<p class="muted">Treść faktury jeszcze niepobrana – kwota z listy KSeF.</p>` : ''}
  ${inv.parse_error ? html`<p class="muted">Nie udało się odczytać szczegółów faktury (${inv.parse_error}).</p>` : ''}
  ${itemsList(inv.items)}
  <form method="post" action="/faktury/${inv.id}/decyzja" class="decision">
    ${foreign ? html`<label for="pln-${inv.id}">Kwota w zł do księgi (faktura w ${inv.currency} – przelicz po kursie NBP z dnia przed wystawieniem)</label>
    <input id="pln-${inv.id}" name="pln_amount" inputmode="decimal" placeholder="np. 1234,56">` : ''}
    <button type="submit" name="decision" value="cost">Koszt firmy</button>
    <button type="submit" name="decision" value="not_cost" class="secondary">Nie jest kosztem</button>
  </form>
</div>`;
}

export function invoicesPage(p: { user: LayoutUser; toReview: InvoiceRow[]; decided: InvoiceRow[]; sync: SyncStatus; notice?: { text: string; error?: boolean } }): Html {
  return layout(
    'Faktury',
    html`<h1>Faktury z KSeF</h1>
${p.notice ? html`<div class="card ${p.notice.error ? 'error' : 'notice'}" role="status">${p.notice.text}</div>` : ''}
${syncStatusBox(p.sync, true)}
<h2>Do przejrzenia (${p.toReview.length})</h2>
${p.toReview.length ? p.toReview.map(invoiceCard) : html`<p class="muted">Nic do przejrzenia.</p>`}
<h2>Ostatnio rozpatrzone</h2>
${p.decided.length
  ? html`<div class="card">${p.decided.map((inv) => html`<div class="row">
      <span>${inv.invoice_number} · ${inv.seller_name ?? ''} <span class="muted">· ${date(inv.issue_date)}</span>${inv.is_correction ? html` <span class="badge badge-warn">KOREKTA</span>` : ''}<br>
        <span class="muted">${inv.status === 'cost' ? html`koszt firmy – <a href="${monthHref(Number(inv.issue_date.slice(0, 4)), Number(inv.issue_date.slice(5, 7)))}">w księdze</a>` : 'nie jest kosztem'}</span></span>
      <span><strong>${inv.currency !== 'PLN' && inv.pln_amount !== null ? pln(inv.pln_amount) : inv.currency !== 'PLN' ? `${amountInput(inv.gross_amount)} ${inv.currency}` : pln(inv.gross_amount)}</strong>
        <form method="post" action="/faktury/${inv.id}/cofnij"><button type="submit" class="link">Cofnij decyzję</button></form></span>
    </div>`)}</div>`
  : html`<p class="muted">Jeszcze nic.</p>`}`,
    p.user,
    'faktury',
  );
}
