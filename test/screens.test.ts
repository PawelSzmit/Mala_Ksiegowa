// Ekrany etapu 4 przez HTTP: przegląd faktur, koszt spoza KSeF, raport z kasy, ustawienia. Wymaga TEST_DATABASE_URL.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { createSession, SESSION_COOKIE } from '../src/auth/sessions.ts';
import { decryptSecret } from '../src/crypto/secret-box.ts';
import type { Db } from '../src/db/pool.ts';
import { KsefClient } from '../src/ksef/client.ts';
import { FakeKsef, GOOD_TOKEN, NIP } from './helpers/fake-ksef.ts';
import { freshTestDb, skipWithoutDb } from './helpers/test-db.ts';

const KEY = randomBytes(32);
const PDF = Buffer.from('%PDF-1.4\n%test\n');

describe('ekrany: faktury, koszty, kasa, ustawienia', { skip: skipWithoutDb }, () => {
  let db: Db;
  let server: Server;
  let base = '';
  let cookie = '';
  const fake = new FakeKsef();
  let nowMs = Date.parse('2026-10-20T10:00:00Z');

  const get = (path: string) => fetch(base + path, { headers: { Cookie: cookie }, redirect: 'manual' });
  const post = (path: string, form: Record<string, string> = {}) =>
    fetch(base + path, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
  const postFile = (path: string, fields: Record<string, string>, file?: { field: string; name: string; data: Buffer }) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    if (file) form.set(file.field, new Blob([new Uint8Array(file.data)]), file.name);
    return fetch(base + path, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie }, body: form });
  };
  const entries = async () => (await db.query('SELECT source, year, month, entry_date, document_number, revenue, other_costs, description FROM kpir_entries ORDER BY id')).rows;
  const addInvoice = async (over: Record<string, unknown> = {}) => {
    const v = { ksef_number: `K-${Math.random()}`, invoice_number: 'FV/1/2026', seller_nip: '5260250274', seller_name: 'Hurtownia', issue_date: '2026-10-05', gross_amount: 12300, currency: 'PLN', is_correction: false, items: JSON.stringify([{ name: 'Papier' }]), ...over };
    const { rows } = await db.query(
      `INSERT INTO invoices (ksef_number, invoice_number, seller_nip, seller_name, issue_date, gross_amount, currency, is_correction, items, xml)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '<Faktura/>') RETURNING id`,
      [v.ksef_number, v.invoice_number, v.seller_nip, v.seller_name, v.issue_date, v.gross_amount, v.currency, v.is_correction, v.items],
    );
    return rows[0].id as number;
  };

  before(async () => {
    db = await freshTestDb();
    await fake.start();
    server = createServer(createApp({
      db, encryptionKey: KEY, cookieSecure: false, now: () => nowMs,
      syncOptions: { createClient: (_env, interactive) => new KsefClient({ baseUrl: fake.baseUrl, pollIntervalMs: 1, ...(interactive ? { maxRateLimitRetries: 0 } : {}) }) },
    }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const { rows } = await db.query("INSERT INTO users (username, password_hash, totp_secret_enc) VALUES ('pawel', 'x', 'x') RETURNING id");
    cookie = `${SESSION_COOKIE}=${await createSession(db, rows[0].id)}`;
  });
  after(async () => {
    server.close();
    fake.stop();
    await db.end();
  });
  beforeEach(async () => {
    fake.reset();
    nowMs += 3600_000;
    await db.query('TRUNCATE invoices, manual_costs, cash_reports, kpir_entries, months');
    await db.query("UPDATE settings SET nip = NULL, ksef_token_enc = NULL, ksef_sync_from = NULL, ksef_next_from = NULL, ksef_env = 'prod', ksef_last_attempt_at = NULL, ksef_last_success_at = NULL, ksef_last_error = NULL");
  });

  it('nowe strony wymagają zalogowania', async () => {
    for (const path of ['/faktury', '/koszty/nowy', '/kasa/2026/10', '/ustawienia']) {
      const res = await fetch(base + path, { redirect: 'manual' });
      assert.equal(res.status, 303, path);
    }
  });

  it('faktura → „koszt firmy”: wpis w księdze z datą wystawienia, kwotą brutto i pozycjami; cofnięcie usuwa wpis', async () => {
    const id = await addInvoice();
    assert.match(await (await get('/faktury')).text(), /Do przejrzenia \(1\)[\s\S]*FV\/1\/2026[\s\S]*Hurtownia/);
    assert.equal((await post(`/faktury/${id}/decyzja`, { decision: 'cost' })).status, 303);
    assert.deepEqual(await entries(), [{ source: 'invoice', year: 2026, month: 10, entry_date: '2026-10-05', document_number: 'FV/1/2026', revenue: 0, other_costs: 12300, description: 'Papier' }]);
    assert.match(await (await get('/miesiac/2026/10')).text(), /FV\/1\/2026[\s\S]*123,00 zł/);
    // Druga decyzja na tej samej fakturze nie tworzy drugiego wpisu.
    assert.equal((await post(`/faktury/${id}/decyzja`, { decision: 'cost' })).status, 409);
    assert.equal((await entries()).length, 1);
    assert.equal((await post(`/faktury/${id}/cofnij`)).status, 303);
    assert.deepEqual(await entries(), []);
    assert.equal((await db.query('SELECT status FROM invoices WHERE id = $1', [id])).rows[0].status, 'to_review');
  });

  it('„nie jest kosztem”: brak wpisu w księdze, faktura znika z listy do przejrzenia', async () => {
    const id = await addInvoice();
    assert.equal((await post(`/faktury/${id}/decyzja`, { decision: 'not_cost' })).status, 303);
    assert.deepEqual(await entries(), []);
    assert.match(await (await get('/faktury')).text(), /Do przejrzenia \(0\)/);
  });

  it('korekta jest wyraźnie oznaczona i zmniejsza koszty (ujemny wpis)', async () => {
    const id = await addInvoice({ invoice_number: 'KOR/1', is_correction: true, gross_amount: -2460 });
    await db.query(`UPDATE invoices SET corrected = '[{"invoiceNumber":"FV/9"}]' WHERE id = $1`, [id]);
    assert.match(await (await get('/faktury')).text(), /KOREKTA[\s\S]*Koryguje fakturę FV\/9/);
    await post(`/faktury/${id}/decyzja`, { decision: 'cost' });
    const [e] = await entries();
    assert.equal(e.other_costs, -2460);
    assert.equal(e.description, 'Korekta faktury FV/9: Papier');
  });

  it('faktura w obcej walucie wymaga kwoty w zł', async () => {
    const id = await addInvoice({ currency: 'EUR', gross_amount: 5000 });
    const missing = await post(`/faktury/${id}/decyzja`, { decision: 'cost' });
    assert.equal(missing.status, 400);
    assert.match(await missing.text(), /Kwota w zł/);
    await post(`/faktury/${id}/decyzja`, { decision: 'cost', pln_amount: '215,40' });
    assert.equal((await entries())[0].other_costs, 21540);
  });

  it('zamknięty miesiąc: decyzja, koszt i raport z kasy są odrzucane z wyjaśnieniem', async () => {
    await db.query("INSERT INTO months (year, month, status) VALUES (2026, 10, 'closed')");
    const id = await addInvoice();
    const res = await post(`/faktury/${id}/decyzja`, { decision: 'cost' });
    assert.equal(res.status, 409);
    assert.match(await res.text(), /zamknięty/);
    assert.equal((await db.query('SELECT status FROM invoices WHERE id = $1', [id])).rows[0].status, 'to_review');
    const cost = await postFile('/koszty', { cost_date: '2026-10-07', document_number: 'P/1', counterparty: 'Sklep', description: 'Toner', amount: '10' });
    assert.equal(cost.status, 409);
    assert.equal((await postFile('/kasa/2026/10', { report_date: '2026-10-31', amount: '100' })).status, 409);
    assert.deepEqual(await entries(), []);
  });

  it('koszt spoza KSeF z PDF: wpis w księdze, załącznik do pobrania w piaskownicy, usunięcie', async () => {
    const res = await postFile('/koszty', { cost_date: '2026-10-07', document_number: 'P/7', counterparty: 'Sklep Papierniczy', description: 'Toner', amount: '1 234,56' }, { field: 'attachment', name: 'skan<1>.pdf', data: PDF });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/miesiac/2026/10');
    const [e] = await entries();
    assert.deepEqual([e.source, e.other_costs, e.document_number], ['manual_cost', 123456, 'P/7']);
    const { rows: [cost] } = await db.query('SELECT id, attachment_name FROM manual_costs');
    assert.equal(cost.attachment_name, 'skan_1_.pdf');
    const file = await get(`/koszty/${cost.id}/zalacznik`);
    assert.equal(file.headers.get('content-type'), 'application/pdf');
    assert.match(file.headers.get('content-security-policy')!, /sandbox/);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), PDF);
    assert.match(await (await get('/miesiac/2026/10')).text(), /P\/7[\s\S]*załącznik/);
    assert.equal((await post(`/koszty/${cost.id}/usun`)).status, 303);
    assert.deepEqual(await entries(), []);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM manual_costs')).rows[0].n, 0);
  });

  it('koszt spoza KSeF: błędy formularza wracają z wpisanymi danymi; zły typ pliku odrzucony', async () => {
    const bad = await postFile('/koszty', { cost_date: '2026-10-07', document_number: 'P/8', counterparty: 'Sklep', description: 'Toner', amount: 'dużo' });
    assert.equal(bad.status, 400);
    const html = await bad.text();
    assert.match(html, /Kwota brutto: wpisz kwotę/);
    assert.match(html, /value="P\/8"/);
    const exe = await postFile('/koszty', { cost_date: '2026-10-07', document_number: 'P/9', counterparty: 'Sklep', description: 'Toner', amount: '5' }, { field: 'attachment', name: 'faktura.pdf', data: Buffer.from('<script>alert(1)</script>') });
    assert.equal(exe.status, 400);
    assert.match(await exe.text(), /dozwolone są pliki PDF/);
    assert.deepEqual(await entries(), []);
  });

  it('raport z kasy: przychód w księdze; poprawka nadpisuje zamiast dublować i zachowuje zdjęcie', async () => {
    const form = await (await get('/kasa/2026/10')).text();
    assert.match(form, /value="2026-10-31"/);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    assert.equal((await postFile('/kasa/2026/10', { report_date: '2026-10-31', amount: '8 450,00' }, { field: 'photo', name: 'raport.jpg', data: jpg })).status, 303);
    assert.equal((await postFile('/kasa/2026/10', { report_date: '2026-11-01', amount: '8 500' })).status, 303);
    const all = await entries();
    assert.equal(all.length, 1);
    // Raport wydrukowany 1. listopada nadal należy do października.
    assert.deepEqual([all[0].source, all[0].month, all[0].entry_date, all[0].revenue], ['cash_report', 10, '2026-10-31', 850000]);
    const photo = await get('/kasa/2026/10/zdjecie');
    assert.equal(photo.headers.get('content-type'), 'image/jpeg');
    assert.match(await (await get('/miesiac/2026/10')).text(), /Raport z kasy<\/span><strong>8 500,00 zł/);
  });

  it('ustawienia: sprawdzony NIP, token zaszyfrowany i nigdy niepokazywany, zmiana daty zaczyna pobieranie od nowa', async () => {
    const badNip = await post('/ustawienia', { nip: '1234567890', ksef_env: 'test', ksef_sync_from: '2026-10-01', ksef_token: 'tok' });
    assert.equal(badNip.status, 400);
    assert.match(await badNip.text(), /NIP: wpisz poprawny/);
    const ok = await post('/ustawienia', { nip: NIP, ksef_env: 'test', ksef_sync_from: '2026-10-01', ksef_token: GOOD_TOKEN });
    assert.equal(ok.status, 200);
    let s = (await db.query('SELECT * FROM settings')).rows[0];
    assert.equal(decryptSecret(s.ksef_token_enc, KEY), GOOD_TOKEN);
    assert.ok(!s.ksef_token_enc.includes(GOOD_TOKEN));
    assert.ok(!(await (await get('/ustawienia')).text()).includes(GOOD_TOKEN));

    await db.query("UPDATE settings SET ksef_next_from = '2026-10-15T00:00:00Z'");
    await post('/ustawienia', { nip: NIP, ksef_env: 'test', ksef_sync_from: '2026-10-01', ksef_token: '' }); // bez zmian, token zostaje
    s = (await db.query('SELECT * FROM settings')).rows[0];
    assert.ok(s.ksef_next_from, 'bez zmian znacznik zostaje');
    assert.equal(decryptSecret(s.ksef_token_enc, KEY), GOOD_TOKEN);
    await post('/ustawienia', { nip: NIP, ksef_env: 'test', ksef_sync_from: '2026-09-01', ksef_token: '' });
    assert.equal((await db.query('SELECT ksef_next_from FROM settings')).rows[0].ksef_next_from, null);
    const future = await post('/ustawienia', { nip: NIP, ksef_env: 'test', ksef_sync_from: '2099-01-01', ksef_token: '' });
    assert.match(await future.text(), /nie może być z przyszłości/);
  });

  it('„sprawdź teraz” pobiera faktury z KSeF i pokazuje wynik oraz datę ostatniej udanej synchronizacji', async () => {
    await post('/ustawienia', { nip: NIP, ksef_env: 'test', ksef_sync_from: '2026-10-01', ksef_token: GOOD_TOKEN });
    fake.invoices = [{ ksefNumber: 'K-1', invoiceNumber: 'FV/77', issueDate: '2026-10-03', grossAmount: 49.99, permanentStorageDate: '2026-10-03T09:00:00.000Z', seller: { nip: '5260250274', name: 'Drukarnia' } }];
    const html = await (await post('/faktury/sprawdz')).text();
    assert.match(html, /Pobrano nowe faktury: 1/);
    assert.match(html, /FV\/77[\s\S]*49,99 zł/);
    assert.doesNotMatch(html, /Ostatnia udana synchronizacja z KSeF<\/span><strong>—/);
    const again = await (await post('/faktury/sprawdz')).text();
    assert.match(again, /Spróbuj za \d+ min/);
  });
});
