// Faktury z KSeF: lista do przejrzenia, decyzja „koszt firmy / nie jest kosztem”, cofnięcie, „sprawdź teraz”.
import { deleteKpirEntry, inTransaction, upsertKpirEntry } from '../db/books.ts';
import { HttpError, readForm, redirect, send } from '../http/http.ts';
import { parseAmountInput } from '../http/inputs.ts';
import { syncKsef } from '../jobs/ksef-sync.ts';
import type { FaItem } from '../ksef/parse-fa.ts';
import { invoicesPage, type InvoiceRow } from '../views/invoices.ts';
import { idFrom, loadSyncStatus, type Route, type RouteContext } from './context.ts';

const COLUMNS = `id, ksef_number, invoice_number, seller_nip, seller_name, issue_date, gross_amount, currency, is_correction, corrected,
  correction_reason, items, status, decided_at, xml IS NOT NULL AS has_xml, parse_error, pln_amount`;

async function renderList(ctx: RouteContext, notice?: { text: string; error?: boolean }, status = 200) {
  const [toReview, decided, sync] = await Promise.all([
    ctx.db.query<InvoiceRow>(`SELECT ${COLUMNS} FROM invoices WHERE status = 'to_review' ORDER BY issue_date, id`),
    ctx.db.query<InvoiceRow>(`SELECT ${COLUMNS} FROM invoices WHERE status <> 'to_review' ORDER BY decided_at DESC NULLS LAST, id DESC LIMIT 20`),
    loadSyncStatus(ctx.db),
  ]);
  send(ctx.res, status, invoicesPage({ user: ctx.user, toReview: toReview.rows, decided: decided.rows, sync, notice }).value);
}

/** Opis wpisu w księdze: pozycje faktury (bez „stanu przed korektą”), a gdy ich brak – ogólny opis. */
function describe(inv: { items: FaItem[] | null; is_correction: boolean; corrected: { invoiceNumber?: string }[] | null }): string {
  const names = (inv.items ?? []).filter((i) => !i.before).map((i) => i.name);
  const base = names.length ? names.join(', ') : 'Zakup wg faktury';
  const ref = inv.corrected?.map((c) => c.invoiceNumber).filter(Boolean).join(', ');
  const text = inv.is_correction ? `Korekta${ref ? ` faktury ${ref}` : ''}: ${base}` : base;
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}

async function decide(ctx: RouteContext, id: number) {
  const form = await readForm(ctx.req);
  const decision = form.get('decision');
  if (decision !== 'cost' && decision !== 'not_cost') throw new HttpError(400, 'Nieznana decyzja.');

  await inTransaction(ctx.db, async (tx) => {
    const { rows: [inv] } = await tx.query<InvoiceRow>(`SELECT ${COLUMNS} FROM invoices WHERE id = $1 FOR UPDATE`, [id]);
    if (!inv) throw new HttpError(404, 'Nie ma takiej faktury.');
    if (inv.status !== 'to_review') throw new HttpError(409, 'Ta faktura jest już rozpatrzona. Odśwież stronę.');
    let plnAmount: number | null = null;
    if (decision === 'cost') {
      if (inv.currency !== 'PLN') plnAmount = parseAmountInput(form.get('pln_amount') ?? undefined, `Kwota w zł (faktura w ${inv.currency})`);
      await upsertKpirEntry(tx, {
        entryDate: inv.issue_date,
        documentNumber: inv.invoice_number,
        counterparty: [inv.seller_name, inv.seller_nip ? `NIP ${inv.seller_nip}` : null].filter(Boolean).join(', ') || null,
        description: describe(inv),
        otherCosts: plnAmount ?? inv.gross_amount,
        source: 'invoice',
        sourceId: inv.id,
      });
    }
    await tx.query('UPDATE invoices SET status = $2, decided_at = $3, pln_amount = $4 WHERE id = $1', [id, decision, new Date(ctx.now()), plnAmount]);
  });
  redirect(ctx.res, '/faktury');
}

async function undo(ctx: RouteContext, id: number) {
  await inTransaction(ctx.db, async (tx) => {
    const { rows: [inv] } = await tx.query<{ status: string }>('SELECT status FROM invoices WHERE id = $1 FOR UPDATE', [id]);
    if (!inv) throw new HttpError(404, 'Nie ma takiej faktury.');
    await deleteKpirEntry(tx, 'invoice', id);
    await tx.query("UPDATE invoices SET status = 'to_review', decided_at = NULL, pln_amount = NULL WHERE id = $1", [id]);
  });
  redirect(ctx.res, '/faktury');
}

export const invoicesRoute: Route = async (ctx) => {
  const { url, method } = ctx;
  if (url.pathname === '/faktury' && method === 'GET') {
    await renderList(ctx);
    return true;
  }
  if (url.pathname === '/faktury/sprawdz' && method === 'POST') {
    const result = await syncKsef(ctx.db, ctx.encryptionKey, { interactive: true, now: ctx.now, ...ctx.syncOptions });
    const text = result.status === 'ok'
      ? result.newInvoices ? `Pobrano nowe faktury: ${result.newInvoices}.` : 'Brak nowych faktur.'
      : result.message;
    await renderList(ctx, { text, error: result.status === 'error' });
    return true;
  }
  const m = /^\/faktury\/(\d+)\/(decyzja|cofnij)$/.exec(url.pathname);
  if (m && method === 'POST') {
    const id = idFrom(m[1]);
    if (!id) throw new HttpError(404, 'Nie ma takiej faktury.');
    try {
      await (m[2] === 'decyzja' ? decide(ctx, id) : undo(ctx, id));
    } catch (error) {
      // Błąd w formularzu albo zamknięty miesiąc: zostajemy na liście z komunikatem.
      if (!(error instanceof HttpError) || error.status === 404) throw error;
      await renderList(ctx, { text: error.message, error: true }, error.status);
    }
    return true;
  }
  return false;
};
