// Zamknięcie miesiąca: podgląd kwot, zamknięcie, ponowne otwarcie, plik DRA, dochód z grudnia poprzedniego roku.
import { warsawToday } from '../dates.ts';
import { HttpError, readForm, redirect, send } from '../http/http.ts';
import { parseAmountInput } from '../http/inputs.ts';
import { closeMonth, loadPayer, payerProblems, previewMonth, reopenMonth, saveDecemberIncome, toDraPayer, type SavedMonthResult } from '../month/close.ts';
import { monthHref } from '../views/format.ts';
import { monthClosePage } from '../views/month-close.ts';
import { buildDraKedu } from '../zus/kedu-dra.ts';
import type { Route, RouteContext } from './context.ts';

async function downloadDra(ctx: RouteContext, year: number, month: number) {
  const { rows: [m] } = await ctx.db.query<{ status: string; results: SavedMonthResult | null }>(
    'SELECT status, results FROM months WHERE year = $1 AND month = $2', [year, month],
  );
  if (m?.status !== 'closed' || !m.results) throw new HttpError(409, 'Plik DRA powstaje po zamknięciu miesiąca.');
  if (m.results.result.holiday) throw new HttpError(409, 'Plik DRA dla miesiąca wakacji składkowych dojdzie w kolejnym etapie.');
  const payer = await loadPayer(ctx.db);
  const missing = payerProblems(payer);
  if (missing.length) throw new HttpError(409, `Uzupełnij w Ustawieniach dane do deklaracji ZUS: ${missing.join(', ')}.`);
  const s = m.results;
  const xml = buildDraKedu({
    year, month, payer: toDraPayer(payer), socialBase: s.socialBase, accidentRate: s.accidentRate,
    social: s.result.socialDue, health: s.result.healthDue, previousMonthIncome: s.previousMonthIncome, filledOn: warsawToday(ctx.now()),
  });
  send(ctx.res, 200, xml, 'application/xml; charset=utf-8', {
    'Content-Disposition': `attachment; filename="DRA-${year}-${String(month).padStart(2, '0')}.xml"`,
  });
}

export const monthCloseRoute: Route = async (ctx) => {
  const m = /^\/miesiac\/(\d{4})\/(\d{2})\/(zamkniecie|zamknij|otworz|dra\.xml|grudzien)$/.exec(ctx.url.pathname);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2020 || year > 2100) throw new HttpError(404, 'Nie ma takiego miesiąca.');
  const action = m[3];

  if (ctx.method === 'GET' && action === 'zamkniecie') {
    const preview = await previewMonth(ctx.db, year, month, ctx.now());
    if (preview.status === 'closed') {
      redirect(ctx.res, monthHref(year, month));
      return true;
    }
    send(ctx.res, 200, monthClosePage({ user: ctx.user, preview }).value);
    return true;
  }
  if (ctx.method === 'GET' && action === 'dra.xml') {
    await downloadDra(ctx, year, month);
    return true;
  }
  if (ctx.method !== 'POST') return false;

  if (action === 'zamknij') {
    try {
      await closeMonth(ctx.db, year, month, ctx.now());
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 409) throw error;
      // Coś się zmieniło od podglądu (np. doszła faktura) – pokazujemy podgląd z aktualnymi przeszkodami.
      const preview = await previewMonth(ctx.db, year, month, ctx.now());
      if (preview.status === 'closed') throw error;
      send(ctx.res, 409, monthClosePage({ user: ctx.user, preview }).value);
      return true;
    }
    redirect(ctx.res, monthHref(year, month));
    return true;
  }
  if (action === 'otworz') {
    const form = await readForm(ctx.req);
    if (form.get('confirm') !== 'tak') throw new HttpError(400, 'Zaznacz potwierdzenie, żeby otworzyć miesiąc ponownie.');
    await reopenMonth(ctx.db, year, month);
    redirect(ctx.res, monthHref(year, month));
    return true;
  }
  if (action === 'grudzien') {
    if (month !== 1) throw new HttpError(404, 'Nie ma takiej strony.');
    const form = await readForm(ctx.req);
    const income = parseAmountInput(form.get('income') ?? undefined, `Dochód z grudnia ${year - 1}`);
    await saveDecemberIncome(ctx.db, year, Math.max(0, income));
    redirect(ctx.res, `/miesiac/${year}/01/zamkniecie`);
    return true;
  }
  return false;
};
