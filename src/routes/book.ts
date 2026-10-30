// Księga przychodów i rozchodów: rok i miesiąc, gotowe do wydruku / zapisu jako PDF z przeglądarki.
import { currentMonth } from '../dates.ts';
import { HttpError, redirect, send } from '../http/http.ts';
import { buildBook, type BookEntry } from '../rules/kpir-book.ts';
import { bookMonthPage, bookYearPage, type BookHeader } from '../views/book.ts';
import type { Route, RouteContext } from './context.ts';

async function load(ctx: RouteContext, year: number): Promise<{ entries: BookEntry[]; header: BookHeader }> {
  const [entries, settings] = await Promise.all([
    ctx.db.query<BookEntry>(
      `SELECT id, month, entry_date, document_number, ksef_number, counterparty, counterparty_tax_id, counterparty_address, description, revenue, other_costs, notes, source
       FROM kpir_entries WHERE year = $1`, [year],
    ),
    ctx.db.query<{ nip: string | null; owner: string | null }>(
      "SELECT nip, NULLIF(trim(concat_ws(' ', first_name, last_name)), '') AS owner FROM settings WHERE id = 1",
    ),
  ]);
  return { entries: entries.rows, header: settings.rows[0] ?? { nip: null, owner: null } };
}

export const bookRoute: Route = async (ctx) => {
  if (ctx.method !== 'GET') return false;
  if (ctx.url.pathname === '/ksiega') {
    redirect(ctx.res, `/ksiega/${currentMonth(ctx.now()).year}`);
    return true;
  }
  const m = /^\/ksiega\/(\d{4})(?:\/(\d{2}))?$/.exec(ctx.url.pathname);
  if (!m) return false;
  const year = Number(m[1]);
  if (year < 2020 || year > 2100) throw new HttpError(404, 'Nie ma takiego roku.');
  const { entries, header } = await load(ctx, year);

  if (m[2]) {
    const month = Number(m[2]);
    if (month < 1 || month > 12) throw new HttpError(404, 'Nie ma takiego miesiąca.');
    const months = buildBook(entries, month);
    send(ctx.res, 200, bookMonthPage({ user: ctx.user, year, month: months[month - 1]!, header }).value);
    return true;
  }

  // Rok: do bieżącego miesiąca (rok bieżący), cały (lata minione) – zawsze co najmniej do ostatniego miesiąca z zapisami.
  const now = currentMonth(ctx.now());
  const lastWithEntries = entries.reduce((max, e) => Math.max(max, e.month), 0);
  const upTo = Math.max(year < now.year ? 12 : year === now.year ? now.month : 1, lastWithEntries);
  send(ctx.res, 200, bookYearPage({ user: ctx.user, year, months: buildBook(entries, upTo), header }).value);
  return true;
};
