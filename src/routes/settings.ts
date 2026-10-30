// Ustawienia KSeF: NIP, token (zapisywany zaszyfrowany, nigdy nie wyświetlany), data początkowa, środowisko.
import { encryptSecret } from '../crypto/secret-box.ts';
import { HttpError, readForm, send } from '../http/http.ts';
import { parseDateInput, parseNip } from '../http/inputs.ts';
import { warsawToday } from '../dates.ts';
import { settingsPage, type SettingsValues } from '../views/forms.ts';
import type { Route, RouteContext } from './context.ts';

async function load(ctx: RouteContext): Promise<SettingsValues> {
  const { rows: [s] } = await ctx.db.query<{ nip: string | null; ksef_env: string; ksef_sync_from: string | null; has_token: boolean }>(
    'SELECT nip, ksef_env, ksef_sync_from, ksef_token_enc IS NOT NULL AS has_token FROM settings WHERE id = 1',
  );
  return { nip: s!.nip ?? '', ksef_env: s!.ksef_env, ksef_sync_from: s!.ksef_sync_from ?? '', hasToken: s!.has_token };
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
    send(ctx.res, 200, settingsPage({ user: ctx.user, values: await load(ctx), saved: true }).value);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    send(ctx.res, error.status, settingsPage({ user: ctx.user, values, error: error.message }).value);
  }
}

export const settingsRoute: Route = async (ctx) => {
  if (ctx.url.pathname !== '/ustawienia') return false;
  if (ctx.method === 'GET') {
    send(ctx.res, 200, settingsPage({ user: ctx.user, values: await load(ctx) }).value);
    return true;
  }
  if (ctx.method === 'POST') {
    await save(ctx);
    return true;
  }
  return false;
};
