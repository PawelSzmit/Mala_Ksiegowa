// Ustawienia KSeF: NIP, token (zapisywany zaszyfrowany, nigdy nie wyświetlany), data początkowa, środowisko.
// Dane płatnika do DRA: imię, nazwisko, PESEL, REGON, nazwa skrócona.
import { encryptSecret } from '../crypto/secret-box.ts';
import { HttpError, readForm, send } from '../http/http.ts';
import { parseDateInput, parseNip, requiredText } from '../http/inputs.ts';
import { isValidPesel } from '../zus/kedu-dra.ts';
import { warsawToday } from '../dates.ts';
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
    send(ctx.res, 200, settingsPage({ user: ctx.user, values: await load(ctx), payer: await loadPayer(ctx), payerSaved: true }).value);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    send(ctx.res, error.status, settingsPage({ user: ctx.user, values: await load(ctx), payer: values, payerError: error.message }).value);
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
    send(ctx.res, 200, settingsPage({ user: ctx.user, values: await load(ctx), saved: true, payer: await loadPayer(ctx) }).value);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    send(ctx.res, error.status, settingsPage({ user: ctx.user, values, error: error.message, payer: await loadPayer(ctx) }).value);
  }
}

export const settingsRoute: Route = async (ctx) => {
  if (ctx.url.pathname === '/ustawienia/dane' && ctx.method === 'POST') {
    await savePayer(ctx);
    return true;
  }
  if (ctx.url.pathname !== '/ustawienia') return false;
  if (ctx.method === 'GET') {
    send(ctx.res, 200, settingsPage({ user: ctx.user, values: await load(ctx), payer: await loadPayer(ctx) }).value);
    return true;
  }
  if (ctx.method === 'POST') {
    await save(ctx);
    return true;
  }
  return false;
};
