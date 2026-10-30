// Koszty spoza KSeF: formularz z opcjonalnym skanem/PDF, usuwanie, pobranie załącznika.
import { deleteKpirEntry, inTransaction, periodOf, upsertKpirEntry, assertMonthOpen } from '../db/books.ts';
import { HttpError, redirect, send } from '../http/http.ts';
import { parseAmountInput, parseDateInput, requiredText, safeFilename, sniffFileType } from '../http/inputs.ts';
import { readMultipart } from '../http/multipart.ts';
import { monthHref } from '../views/format.ts';
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
    const documentNumber = requiredText(values.document_number, 'Numer dokumentu', 100);
    const counterparty = requiredText(values.counterparty, 'Sprzedawca');
    const description = requiredText(values.description, 'Czego dotyczy');
    const amount = parseAmountInput(values.amount, 'Kwota brutto');
    if (amount <= 0) throw new HttpError(400, 'Kwota brutto: musi być większa od zera');
    const file = form.files.get('attachment');
    const fileType = file ? sniffFileType(file.data) : null;
    if (file && !fileType) throw new HttpError(400, 'Załącznik: dozwolone są pliki PDF, JPG, PNG i HEIC');

    await inTransaction(ctx.db, async (tx) => {
      const { year, month } = periodOf(costDate);
      await assertMonthOpen(tx, year, month);
      const { rows: [row] } = await tx.query<{ id: number }>(
        `INSERT INTO manual_costs (cost_date, document_number, counterparty, description, amount, attachment_name, attachment, attachment_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [costDate, documentNumber, counterparty, description, amount, file ? safeFilename(file.filename) : null, file?.data ?? null, fileType],
      );
      await upsertKpirEntry(tx, { entryDate: costDate, documentNumber, counterparty, description, otherCosts: amount, source: 'manual_cost', sourceId: row!.id });
    });
    const { year, month } = periodOf(costDate);
    redirect(ctx.res, monthHref(year, month));
  } catch (error) {
    if (!(error instanceof HttpError) || error.status === 413) throw error;
    const period = values.cost_date && /^\d{4}-\d{2}/.test(values.cost_date) ? periodOf(values.cost_date) : currentMonth(ctx.now());
    send(ctx.res, error.status, manualCostPage({ user: ctx.user, ...period, values, error: error.message }).value);
  }
}

async function remove(ctx: RouteContext, id: number) {
  const date = await inTransaction(ctx.db, async (tx) => {
    const { rows: [cost] } = await tx.query<{ cost_date: string }>('SELECT cost_date FROM manual_costs WHERE id = $1 FOR UPDATE', [id]);
    if (!cost) throw new HttpError(404, 'Nie ma takiego kosztu.');
    await deleteKpirEntry(tx, 'manual_cost', id);
    await tx.query('DELETE FROM manual_costs WHERE id = $1', [id]);
    return cost.cost_date;
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
