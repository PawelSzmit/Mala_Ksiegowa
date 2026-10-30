// Ustawienia KSeF: NIP, token (zapisywany zaszyfrowany, nigdy nie wyświetlany), data początkowa, środowisko.
// Dane płatnika do DRA: imię, nazwisko, PESEL, REGON, nazwa skrócona. Miesiąc wakacji składkowych (bieżący i następny rok).
import { encryptSecret } from '../crypto/secret-box.ts';
import { HttpError, readForm, send } from '../http/http.ts';
import { parseDateInput, parseNip, requiredText } from '../http/inputs.ts';
import { isValidPesel } from '../zus/kedu-dra.ts';
import { warsawToday } from '../dates.ts';
import { monthName } from '../month/close.ts';
import { loadHolidayMonths, saveHolidayMonth } from '../month/holiday.ts';
import { rwsApplicationMonth } from '../rules/holiday.ts';
import { settingsPage, type PayerValues, type SettingsValues } from '../views/forms.ts';
import type { Route, RouteContext } from './context.ts';

async function load(ctx: RouteContext): Promise<SettingsValues> {
  const { rows: [s] } = await ctx.db.query<{ nip: string | null; ksef_env: string; ksef_sync_from: string | null; has_token: boolean }>(
    'SELECT nip, ksef_env, ksef_sync_from, ksef_token_enc IS NOT NULL AS has_token FROM settings WHERE id = 1',
  );
  return { nip: s!.nip ?? '', ksef_env: s!.ksef_env, ksef_sync_from: s!.ksef_sync_from ?? '', hasToken: s!.has_token };
}

async function loadPayer(ctx: RouteContext): Promise<PayerValues> {
  const { rows: [p] } = await ctx.db.query<Record<keyof PayerValues, string | null>>(
    'SELECT first_name, last_name, pesel, regon, short_name FROM settings WHERE id = 1',
  );
  return { first_name: p!.first_name ?? '', last_name: p!.last_name ?? '', pesel: p!.pesel ?? '', regon: p!.regon ?? '', short_name: p!.short_name ?? '' };
}

type PageExtras = Partial<Omit<Parameters<typeof settingsPage>[0], 'user' | 'holidays'>>;

/** Strona ustawień z aktualnymi danymi z bazy; `extras` nadpisuje wartości formularza i dodaje komunikaty. */
async function render(ctx: RouteContext, status: number, extras: PageExtras = {}) {
  const year = Number(warsawToday(ctx.now()).slice(0, 4));
  const holidays = await loadHolidayMonths(ctx.db, [year, year + 1]);
  send(ctx.res, status, settingsPage({
    user: ctx.user, values: extras.values ?? await load(ctx), payer: extras.payer ?? await loadPayer(ctx),
    ...extras, holidays: [...holidays].map(([y, month]) => ({ year: y, month })),
  }).value);
}

async function saveHoliday(ctx: RouteContext) {
  const form = await readForm(ctx.req);
  const current = Number(warsawToday(ctx.now()).slice(0, 4));
  const year = Number(form.get('year'));
  const rawMonth = form.get('month') ?? '';
  try {
    if (year !== current && year !== current + 1) throw new HttpError(400, `Wakacje można ustawić na rok ${current} albo ${current + 1}`);
    const month = rawMonth === '' ? null : Number(rawMonth);
    if (month !== null && !(Number.isInteger(month) && month >= 1 && month <= 12)) throw new HttpError(400, 'Wybierz miesiąc z listy');
    const saved = (await loadHolidayMonths(ctx.db, [year])).get(year);
    if (month !== null && month !== saved) {
      // Wniosek RWS składa się w miesiącu przed wakacjami – na miesiąc, którego termin minął, ZUS zwolnienia nie da.
      const rws = rwsApplicationMonth(year, month);
      const today = warsawToday(ctx.now());
      if (`${rws.year}-${String(rws.month).padStart(2, '0')}` < today.slice(0, 7)) {
        throw new HttpError(400, `Na ${monthName(month)} ${year} jest już za późno: wniosek RWS trzeba było złożyć w miesiącu przed wakacjami (${String(rws.month).padStart(2, '0')}/${rws.year}).`);
      }
    }
    await saveHolidayMonth(ctx.db, year, month);
    await render(ctx, 200, { holidaySaved: true });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    await render(ctx, error.status, { holidayError: error.message });
  }
}

async function savePayer(ctx: RouteContext) {
  const form = await readForm(ctx.req);
  const values: PayerValues = {
    first_name: form.get('first_name') ?? '', last_name: form.get('last_name') ?? '', pesel: form.get('pesel') ?? '',
    regon: form.get('regon') ?? '', short_name: form.get('short_name') ?? '',
  };
  try {
    const firstName = requiredText(values.first_name, 'Imię', 22);
    const lastName = requiredText(values.last_name, 'Nazwisko', 31);
    const pesel = values.pesel.replace(/\s/g, '');
    if (!isValidPesel(pesel)) throw new HttpError(400, 'PESEL: wpisz poprawny 11-cyfrowy PESEL');
    const regon = values.regon.replace(/[\s-]/g, '');
    if (regon && !/^(\d{9}|\d{14})$/.test(regon)) throw new HttpError(400, 'REGON: 9 albo 14 cyfr');
    const shortName = values.short_name.trim();
    if (shortName.length > 31) throw new HttpError(400, 'Nazwa skrócona: najwyżej 31 znaków');
    await ctx.db.query(
      'UPDATE settings SET first_name = $1, last_name = $2, pesel = $3, regon = $4, short_name = $5, updated_at = now() WHERE id = 1',
      [firstName, lastName, pesel, regon || null, shortName || null],
    );
    await render(ctx, 200, { payerSaved: true });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    await render(ctx, error.status, { payer: values, payerError: error.message });
  }
}

async function save(ctx: RouteContext) {
  const form = await readForm(ctx.req);
  const current = await load(ctx);
  const values: SettingsValues = {
    nip: form.get('nip') ?? '',
    ksef_env: form.get('ksef_env') ?? 'prod',
    ksef_sync_from: form.get('ksef_sync_from') ?? '',
    hasToken: current.hasToken,
  };
  try {
    const nip = parseNip(values.nip);
    if (!['prod', 'test', 'demo'].includes(values.ksef_env)) throw new HttpError(400, 'Nieznane środowisko KSeF');
    const syncFrom = parseDateInput(values.ksef_sync_from, 'Data początkowa');
    if (syncFrom > warsawToday(ctx.now())) throw new HttpError(400, 'Data początkowa: nie może być z przyszłości');
    const token = (form.get('ksef_token') ?? '').trim();
    if (!token && !current.hasToken) throw new HttpError(400, 'Token KSeF: wklej token wygenerowany w KSeF');
    if (token.length > 1000) throw new HttpError(400, 'Token KSeF: to nie wygląda na token');

    // Inny NIP, środowisko albo data początkowa = pobieranie od nowa. Duplikaty i tak odrzuci baza.
    const restart = nip !== current.nip || values.ksef_env !== current.ksef_env || syncFrom !== current.ksef_sync_from;
    await ctx.db.query(
      `UPDATE settings SET nip = $1, ksef_env = $2, ksef_sync_from = $3,
         ksef_token_enc = COALESCE($4, ksef_token_enc),
         ksef_next_from = CASE WHEN $5 THEN NULL ELSE ksef_next_from END,
         ksef_last_error = CASE WHEN $4 IS NOT NULL OR $5 THEN NULL ELSE ksef_last_error END,
         updated_at = now()
       WHERE id = 1`,
      [nip, values.ksef_env, syncFrom, token ? encryptSecret(token, ctx.encryptionKey) : null, restart],
    );
    await render(ctx, 200, { saved: true });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    await render(ctx, error.status, { values, error: error.message });
  }
}

export const settingsRoute: Route = async (ctx) => {
  if (ctx.url.pathname === '/ustawienia/dane' && ctx.method === 'POST') {
    await savePayer(ctx);
    return true;
  }
  if (ctx.url.pathname === '/ustawienia/wakacje' && ctx.method === 'POST') {
    await saveHoliday(ctx);
    return true;
  }
  if (ctx.url.pathname !== '/ustawienia') return false;
  if (ctx.method === 'GET') {
    await render(ctx, 200);
    return true;
  }
  if (ctx.method === 'POST') {
    await save(ctx);
    return true;
  }
  return false;
};
