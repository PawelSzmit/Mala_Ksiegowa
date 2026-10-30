// Raport miesięczny z kasy fiskalnej: jeden na miesiąc, przychód w księdze, opcjonalne zdjęcie.
import { inTransaction, upsertKpirEntry, assertMonthOpen } from '../db/books.ts';
import { HttpError, redirect, send } from '../http/http.ts';
import { parseAmountInput, parseDateInput, safeFilename, sniffFileType } from '../http/inputs.ts';
import { readMultipart } from '../http/multipart.ts';
import { lastDayOfMonth } from '../dates.ts';
import { monthHref } from '../views/format.ts';
import { cashReportPage, type CashValues } from '../views/forms.ts';
import type { Route, RouteContext } from './context.ts';
import { sendFile } from './files.ts';

interface CashRow { id: number; report_date: string; amount: number; has_photo: boolean }

async function load(ctx: RouteContext, year: number, month: number) {
  const { rows } = await ctx.db.query<CashRow>(
    'SELECT id, report_date, amount, photo IS NOT NULL AS has_photo FROM cash_reports WHERE year = $1 AND month = $2', [year, month],
  );
  return rows[0] ?? null;
}

async function save(ctx: RouteContext, year: number, month: number) {
  const form = await readMultipart(ctx.req);
  const values: CashValues = Object.fromEntries(form.fields);
  try {
    const reportDate = parseDateInput(values.report_date, 'Data raportu');
    const amount = parseAmountInput(values.amount, 'Sprzedaż brutto');
    if (amount < 0) throw new HttpError(400, 'Sprzedaż brutto: kwota nie może być ujemna');
    const photo = form.files.get('photo');
    const photoType = photo ? sniffFileType(photo.data) : null;
    if (photo && !photoType) throw new HttpError(400, 'Zdjęcie: dozwolone są pliki JPG, PNG, HEIC i PDF');

    await inTransaction(ctx.db, async (tx) => {
      await assertMonthOpen(tx, year, month);
      // Nowe zdjęcie zastępuje stare; bez nowego zdjęcia zostaje poprzednie.
      const { rows: [row] } = await tx.query<{ id: number }>(
        `INSERT INTO cash_reports (year, month, report_date, amount, photo_name, photo, photo_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (year, month) DO UPDATE SET report_date = EXCLUDED.report_date, amount = EXCLUDED.amount,
           photo_name = COALESCE(EXCLUDED.photo_name, cash_reports.photo_name),
           photo = COALESCE(EXCLUDED.photo, cash_reports.photo),
           photo_type = COALESCE(EXCLUDED.photo_type, cash_reports.photo_type)
         RETURNING id`,
        [year, month, reportDate, amount, photo ? safeFilename(photo.filename) : null, photo?.data ?? null, photoType],
      );
      // Przychód zawsze w księdze miesiąca, którego dotyczy raport – także gdy raport wydrukowano 1. dnia kolejnego miesiąca.
      await upsertKpirEntry(tx, {
        entryDate: reportDate.startsWith(`${year}-${String(month).padStart(2, '0')}`) ? reportDate : lastDayOfMonth(year, month),
        documentNumber: `Raport miesięczny ${String(month).padStart(2, '0')}/${year}`,
        counterparty: null,
        description: 'Sprzedaż wg raportu miesięcznego z kasy fiskalnej',
        revenue: amount,
        source: 'cash_report',
        sourceId: row!.id,
      });
    });
    redirect(ctx.res, monthHref(year, month));
  } catch (error) {
    if (!(error instanceof HttpError) || error.status === 413) throw error;
    const existing = await load(ctx, year, month);
    send(ctx.res, error.status, cashReportPage({ user: ctx.user, year, month, values, existing: existing && { hasPhoto: existing.has_photo, amount: existing.amount }, error: error.message }).value);
  }
}

export const cashRoute: Route = async (ctx) => {
  const m = /^\/kasa\/(\d{4})\/(\d{2})(\/zdjecie)?$/.exec(ctx.url.pathname);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2020 || year > 2100) throw new HttpError(404, 'Nie ma takiego miesiąca.');

  if (m[3]) {
    if (ctx.method !== 'GET') return false;
    const { rows: [f] } = await ctx.db.query<{ photo: Buffer | null; photo_type: string | null; photo_name: string | null }>(
      'SELECT photo, photo_type, photo_name FROM cash_reports WHERE year = $1 AND month = $2', [year, month],
    );
    if (!f?.photo) throw new HttpError(404, 'Brak zdjęcia raportu.');
    sendFile(ctx.res, f.photo, f.photo_type, f.photo_name);
    return true;
  }
  if (ctx.method === 'GET') {
    const existing = await load(ctx, year, month);
    send(ctx.res, 200, cashReportPage({
      user: ctx.user, year, month,
      values: { report_date: existing?.report_date ?? lastDayOfMonth(year, month) },
      existing: existing && { hasPhoto: existing.has_photo, amount: existing.amount },
    }).value);
    return true;
  }
  if (ctx.method === 'POST') {
    await save(ctx, year, month);
    return true;
  }
  return false;
};
