// Aplikacja na prawdziwym PostgreSQL. Wymaga TEST_DATABASE_URL (pustej bazy testowej – test ją czyści!).
// Lokalnie: TEST_DATABASE_URL=postgres://mk:mk_test@127.0.0.1/mk_test npm test
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createApp, currentMonth } from '../src/app.ts';
import { LOCK_MINUTES, MAX_FAILED_LOGINS } from '../src/auth/login.ts';
import { hashPassword } from '../src/auth/password.ts';
import { base32Decode, base32Encode, currentStep, totpCode } from '../src/auth/totp.ts';
import { encryptSecret } from '../src/crypto/secret-box.ts';
import { migrate } from '../src/db/migrate.ts';
import type { Db } from '../src/db/pool.ts';
import { freshTestDb, skipWithoutDb } from './helpers/test-db.ts';

const PASSWORD = 'haslo-testowe-123';
const SECRET = base32Encode(randomBytes(20));
const KEY = randomBytes(32);
const START = Date.parse('2026-10-15T10:00:00Z');

describe('aplikacja: logowanie i dostęp', { skip: skipWithoutDb }, () => {
  let db: Db;
  let server: Server;
  let base = '';
  let nowMs = START;
  const code = (offsetSteps = 0) => totpCode(base32Decode(SECRET), currentStep(nowMs) + offsetSteps);

  const request = (path: string, init: { method?: string; form?: Record<string, string>; cookie?: string; origin?: string } = {}) =>
    fetch(base + path, {
      method: init.method ?? (init.form ? 'POST' : 'GET'),
      redirect: 'manual',
      headers: {
        ...(init.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(init.cookie ? { Cookie: init.cookie } : {}),
        ...(init.origin ? { Origin: init.origin } : {}),
      },
      body: init.form ? new URLSearchParams(init.form).toString() : undefined,
    });
  const login = (over: Partial<Record<'username' | 'password' | 'code', string>> = {}) =>
    request('/logowanie', { form: { username: 'pawel', password: PASSWORD, code: code(), ...over } });
  const cookieFrom = (res: Response) => res.headers.get('set-cookie')!.split(';')[0]!;

  before(async () => {
    db = await freshTestDb();
    server = createServer(createApp({ db, encryptionKey: KEY, cookieSecure: true, now: () => nowMs }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    server.close();
    await db.end();
  });
  beforeEach(async () => {
    nowMs += 120_000; // nowe okno TOTP w każdym teście
    await db.query('TRUNCATE users, sessions CASCADE');
    await db.query('INSERT INTO users (username, password_hash, totp_secret_enc) VALUES ($1, $2, $3)', [
      'pawel', await hashPassword(PASSWORD), encryptSecret(SECRET, KEY),
    ]);
  });

  it('migracje są idempotentne, a sekret TOTP nie leży w bazie jawnym tekstem', async () => {
    assert.deepEqual(await migrate(db), []);
    const { rows } = await db.query('SELECT totp_secret_enc FROM users');
    assert.ok(!rows[0].totp_secret_enc.includes(SECRET));
  });

  it('/zdrowie bez logowania: „ok”, gdy jest połączenie z bazą', async () => {
    const res = await request('/zdrowie');
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
  });

  it('bez sesji: strony przekierowują do logowania, a POST jest odrzucany', async () => {
    for (const path of ['/', '/miesiac/2026/10']) {
      const res = await request(path);
      assert.equal(res.status, 303);
      assert.equal(res.headers.get('location'), '/logowanie');
    }
    assert.equal((await request('/wyloguj', { method: 'POST' })).status, 401);
    assert.equal((await request('/miesiac/2026/10', { cookie: 'mk_sesja=zmyslona' })).status, 303);
  });

  it('poprawne logowanie daje bezpieczne ciasteczko i dostęp do ekranu miesiąca', async () => {
    const res = await login();
    assert.equal(res.status, 303);
    const setCookie = res.headers.get('set-cookie')!;
    for (const attr of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/']) assert.ok(setCookie.includes(attr), attr);
    const cookie = cookieFrom(res);

    const home = await request('/', { cookie });
    const { year, month } = currentMonth(nowMs);
    assert.equal(home.headers.get('location'), `/miesiac/${year}/${String(month).padStart(2, '0')}`);

    const page = await request('/miesiac/2026/10', { cookie });
    assert.equal(page.status, 200);
    const body = await page.text();
    assert.match(body, /Październik 2026/);
    assert.match(body, /Otwarty/);
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
  });

  it('złe hasło i zły kod: ten sam ogólny komunikat', async () => {
    for (const res of [await login({ password: 'zle-haslo-123456' }), await login({ code: code(5) }), await login({ username: 'ktos' })]) {
      assert.equal(res.status, 401);
      assert.match(await res.text(), /Nieprawidłowy login, hasło lub kod/);
    }
  });

  it('ten sam kod nie zadziała drugi raz', async () => {
    assert.equal((await login()).status, 303);
    assert.equal((await login()).status, 401);
  });

  it(`po ${MAX_FAILED_LOGINS} nieudanych próbach blokada na ${LOCK_MINUTES} minut, potem można się zalogować`, async () => {
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) assert.equal((await login({ password: 'zle-haslo-123456' })).status, 401);
    assert.equal((await login({ password: 'zle-haslo-123456' })).status, 429);
    const blocked = await login();
    assert.equal(blocked.status, 429);
    assert.match(await blocked.text(), /Zbyt wiele nieudanych prób/);
    nowMs += LOCK_MINUTES * 60_000 + 1000;
    assert.equal((await login()).status, 303);
  });

  it('równoległe próby nie omijają blokady ani nie przepuszczają kodu dwa razy', async () => {
    const bad = await Promise.all(Array.from({ length: 20 }, () => login({ password: 'zle-haslo-123456' })));
    assert.ok(bad.some((r) => r.status === 429), 'konto powinno zostać zablokowane');
    assert.equal((await login()).status, 429);
    nowMs += LOCK_MINUTES * 60_000 + 1000;
    const same = await Promise.all(Array.from({ length: 5 }, () => login()));
    assert.equal(same.filter((r) => r.status === 303).length, 1);
  });

  it('uszkodzone ciasteczko nie psuje strony logowania', async () => {
    const res = await request('/logowanie', { cookie: 'obce=%E0%A4%A; mk_sesja=x' });
    assert.equal(res.status, 200);
  });

  it('wylogowanie unieważnia sesję', async () => {
    const cookie = cookieFrom(await login());
    assert.equal((await request('/wyloguj', { method: 'POST', cookie })).status, 303);
    assert.equal((await request('/miesiac/2026/10', { cookie })).status, 303);
  });

  it('formularz z obcej strony jest odrzucany', async () => {
    const cookie = cookieFrom(await login());
    assert.equal((await request('/wyloguj', { method: 'POST', cookie, origin: 'https://zla-strona.example' })).status, 403);
    assert.equal((await request('/miesiac/2026/10', { cookie })).status, 200);
  });

  it('nieistniejąca strona i zły miesiąc → 404', async () => {
    const cookie = cookieFrom(await login());
    assert.equal((await request('/nie-ma', { cookie })).status, 404);
    assert.equal((await request('/miesiac/2026/13', { cookie })).status, 404);
  });
});
