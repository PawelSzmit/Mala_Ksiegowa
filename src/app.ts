import type { IncomingMessage, ServerResponse } from 'node:http';
import { attemptLogin, LOCK_MINUTES } from './auth/login.ts';
import { createSession, deleteSession, findSessionUser, SESSION_COOKIE, SESSION_HOURS } from './auth/sessions.ts';
import type { Db } from './db/pool.ts';
import { HttpError, isSameOrigin, parseCookies, readForm, redirect, send, sessionCookie } from './http/http.ts';
import { STYLES } from './views/layout.ts';
import { errorPage, loginPage, monthPage, type MonthView } from './views/pages.ts';

export interface AppDeps {
  db: Db;
  encryptionKey: Buffer;
  cookieSecure: boolean;
  /** Do testów: stały „teraz”. */
  now?: () => number;
}

type User = { id: number; username: string };

/** Bieżący miesiąc w polskiej strefie czasowej. */
export function currentMonth(nowMs = Date.now()): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit' }).formatToParts(new Date(nowMs));
  return { year: Number(parts.find((p) => p.type === 'year')!.value), month: Number(parts.find((p) => p.type === 'month')!.value) };
}

export function createApp(deps: AppDeps) {
  const now = deps.now ?? Date.now;
  const clearCookie = sessionCookie(SESSION_COOKIE, '', { secure: deps.cookieSecure, maxAgeSeconds: 0 });

  async function monthView(year: number, month: number): Promise<MonthView> {
    const [m, inv, cash] = await Promise.all([
      deps.db.query<{ status: 'open' | 'closed' }>('SELECT status FROM months WHERE year = $1 AND month = $2', [year, month]),
      deps.db.query<{ n: number }>("SELECT count(*)::int AS n FROM invoices WHERE status = 'to_review'"),
      deps.db.query('SELECT 1 FROM cash_reports WHERE year = $1 AND month = $2', [year, month]),
    ]);
    return { year, month, status: m.rows[0]?.status ?? 'open', invoicesToReview: inv.rows[0]!.n, hasCashReport: cash.rowCount! > 0 };
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    const cookies = parseCookies(req.headers.cookie);

    if (method === 'POST' && !isSameOrigin(req)) throw new HttpError(403, 'Formularz wysłany z obcej strony.');

    // --- strony bez logowania ---
    if (url.pathname === '/static/app.css') return send(res, 200, STYLES, 'text/css; charset=utf-8');
    if (url.pathname === '/zdrowie') return send(res, 200, 'ok', 'text/plain; charset=utf-8');

    if (url.pathname === '/logowanie') {
      if (method === 'GET') return send(res, 200, loginPage().value);
      if (method === 'POST') {
        const form = await readForm(req);
        const result = await attemptLogin(deps.db, deps.encryptionKey, {
          username: form.get('username') ?? '',
          password: form.get('password') ?? '',
          code: form.get('code') ?? '',
        }, now());
        if (!result.ok) {
          const message = result.reason === 'locked'
            ? `Zbyt wiele nieudanych prób. Spróbuj ponownie za ${LOCK_MINUTES} minut.`
            : 'Nieprawidłowy login, hasło lub kod z telefonu.';
          return send(res, result.reason === 'locked' ? 429 : 401, loginPage(message).value);
        }
        await deleteSession(deps.db, cookies[SESSION_COOKIE]);
        const sessionId = await createSession(deps.db, result.userId);
        return redirect(res, '/', {
          'Set-Cookie': sessionCookie(SESSION_COOKIE, sessionId, { secure: deps.cookieSecure, maxAgeSeconds: SESSION_HOURS * 3600 }),
        });
      }
    }

    // --- od tego miejsca wymagane zalogowanie ---
    const user: User | null = await findSessionUser(deps.db, cookies[SESSION_COOKIE]);
    if (!user) {
      if (method === 'GET') return redirect(res, '/logowanie', cookies[SESSION_COOKIE] ? { 'Set-Cookie': clearCookie } : {});
      throw new HttpError(401, 'Sesja wygasła – zaloguj się ponownie.');
    }

    if (url.pathname === '/wyloguj' && method === 'POST') {
      await deleteSession(deps.db, cookies[SESSION_COOKIE]);
      return redirect(res, '/logowanie', { 'Set-Cookie': clearCookie });
    }

    if (url.pathname === '/' && method === 'GET') {
      const { year, month } = currentMonth(now());
      return redirect(res, `/miesiac/${year}/${String(month).padStart(2, '0')}`);
    }

    const monthMatch = /^\/miesiac\/(\d{4})\/(\d{2})$/.exec(url.pathname);
    if (monthMatch && method === 'GET') {
      const year = Number(monthMatch[1]);
      const month = Number(monthMatch[2]);
      if (month < 1 || month > 12 || year < 2020 || year > 2100) throw new HttpError(404, 'Nie ma takiego miesiąca.');
      return send(res, 200, monthPage(await monthView(year, month), user).value);
    }

    throw new HttpError(404, 'Nie ma takiej strony.');
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      await route(req, res);
    } catch (error) {
      if (error instanceof HttpError) {
        send(res, error.status, errorPage(error.status, error.message).value);
        return;
      }
      console.error('Błąd aplikacji:', error);
      if (!res.headersSent) send(res, 500, errorPage(500, 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie.').value);
      else res.end();
    }
  };
}
