// Koszty spoza KSeF: formularz z opcjonalnym skanem/PDF, usuwanie, pobranie załącznika.
import { deleteKpirEntry, inTransaction, periodOf, upsertKpirEntry, assertMonthOpen } from '../db/books.ts';
import { HttpError, redirect, send } from '../http/http.ts';
import { parseAmountInput, parseDateInput, parseTaxId, requiredText, safeFilename, sniffFileType } from '../http/inputs.ts';
import { readMultipart } from '../http/multipart.ts';
import { costBookingDate } from '../rules/booking.ts';
import { date, monthHref } from '../views/format.ts';
import { manualCostPage, type ManualCostValues } from '../views/forms.ts';
import { currentMonth, warsawToday } from '../dates.ts';
import { idFrom, type Route, type RouteContext } from './context.ts';
import { sendFile } from './files.ts';

function periodFromQuery(ctx: RouteContext) {
  const m = /^(\d{4})-(\d{2})$/.exec(ctx.url.searchParams.get('miesiac') ?? '');
  const p = m ? { year: Number(m[1]), month: Number(m[2]) } : currentMonth(ctx.now());
  if (p.month < 1 || p.month > 12) return currentMonth(ctx.now());
  return p;
}

async function create(ctx: RouteContext) {
  const form = await readMultipart(ctx.req);
  const values: ManualCostValues = Object.fromEntries(form.fields);
  try {
    const costDate = parseDateInput(values.cost_date, 'Data wystawienia');
    const receivedDate = values.received_date?.trim() ? parseDateInput(values.received_date, 'Data otrzymania') : costDate;
    if (receivedDate < costDate) throw new HttpError(400, 'Data otrzymania: nie może być wcześniejsza niż data wystawienia');
    const entryDate = costBookingDate(costDate, receivedDate);
    const documentNumber = requiredText(values.document_number, 'Numer dokumentu', 100);
    const counterparty = requiredText(values.counterparty, 'Sprzedawca');
    const counterpartyTaxId = parseTaxId(values.counterparty_tax_id);
    const counterpartyAddress = values.counterparty_address?.trim()
      ? requiredText(values.counterparty_address, 'Adres sprzedawcy')
      : null;
    if (!counterpartyTaxId && !counterpartyAddress) throw new HttpError(400, 'Adres sprzedawcy: wpisz adres albo NIP sprzedawcy');
    const description = requiredText(values.description, 'Czego dotyczy');
    const amount = parseAmountInput(values.amount, 'Kwota brutto');
    if (amount <= 0) throw new HttpError(400, 'Kwota brutto: musi być większa od zera');
    const file = form.files.get('attachment');
    const fileType = file ? sniffFileType(file.data) : null;
    if (file && !fileType) throw new HttpError(400, 'Załącznik: dozwolone są pliki PDF, JPG, PNG i HEIC');

    await inTransaction(ctx.db, async (tx) => {
      const { year, month } = periodOf(entryDate);
      await assertMonthOpen(tx, year, month);
      const { rows: [row] } = await tx.query<{ id: number }>(
        `INSERT INTO manual_costs (cost_date, received_date, document_number, counterparty, description, amount, attachment_name, attachment, attachment_type,
           counterparty_tax_id, counterparty_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [costDate, receivedDate, documentNumber, counterparty, description, amount, file ? safeFilename(file.filename) : null, file?.data ?? null, fileType,
          counterpartyTaxId, counterpartyAddress],
      );
      await upsertKpirEntry(tx, {
        entryDate, documentNumber, counterparty, counterpartyTaxId, counterpartyAddress, description, otherCosts: amount, source: 'manual_cost', sourceId: row!.id,
        notes: entryDate !== costDate ? `Dokument z ${date(costDate)}, otrzymany ${date(receivedDate)}` : null,
      });
    });
    const { year, month } = periodOf(entryDate);
    redirect(ctx.res, monthHref(year, month));
  } catch (error) {
    if (!(error instanceof HttpError) || error.status === 413) throw error;
    const period = values.cost_date && /^\d{4}-\d{2}/.test(values.cost_date) ? periodOf(values.cost_date) : currentMonth(ctx.now());
    send(ctx.res, error.status, manualCostPage({ user: ctx.user, ...period, values, error: error.message }).value);
  }
}

async function remove(ctx: RouteContext, id: number) {
  const date = await inTransaction(ctx.db, async (tx) => {
    const { rows: [cost] } = await tx.query<{ entry_date: string | null }>(
      `SELECT k.entry_date FROM manual_costs m LEFT JOIN kpir_entries k ON k.source = 'manual_cost' AND k.source_id = m.id WHERE m.id = $1 FOR UPDATE OF m`, [id],
    );
    if (!cost) throw new HttpError(404, 'Nie ma takiego kosztu.');
    await deleteKpirEntry(tx, 'manual_cost', id);
    await tx.query('DELETE FROM manual_costs WHERE id = $1', [id]);
    return cost.entry_date ?? warsawToday(ctx.now());
  });
  const { year, month } = periodOf(date);
  redirect(ctx.res, monthHref(year, month));
}

export const costsRoute: Route = async (ctx) => {
  const { url, method } = ctx;
  if (url.pathname === '/koszty/nowy' && method === 'GET') {
    const { year, month } = periodFromQuery(ctx);
    const today = warsawToday(ctx.now());
    const defaultDate = today.startsWith(`${year}-${String(month).padStart(2, '0')}`) ? today : `${year}-${String(month).padStart(2, '0')}-01`;
    send(ctx.res, 200, manualCostPage({ user: ctx.user, year, month, values: { cost_date: defaultDate } }).value);
    return true;
  }
  if (url.pathname === '/koszty' && method === 'POST') {
    await create(ctx);
    return true;
  }
  const m = /^\/koszty\/(\d+)\/(usun|zalacznik)$/.exec(url.pathname);
  if (m) {
    const id = idFrom(m[1]);
    if (!id) throw new HttpError(404, 'Nie ma takiego kosztu.');
    if (m[2] === 'usun' && method === 'POST') {
      await remove(ctx, id);
      return true;
    }
    if (m[2] === 'zalacznik' && method === 'GET') {
      const { rows: [f] } = await ctx.db.query<{ attachment: Buffer | null; attachment_type: string | null; attachment_name: string | null }>(
        'SELECT attachment, attachment_type, attachment_name FROM manual_costs WHERE id = $1', [id],
      );
      if (!f?.attachment) throw new HttpError(404, 'Ten koszt nie ma załącznika.');
      sendFile(ctx.res, f.attachment, f.attachment_type, f.attachment_name);
      return true;
    }
  }
  return false;
};
