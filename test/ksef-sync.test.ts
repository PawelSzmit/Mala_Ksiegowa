// Pobieranie faktur z KSeF do bazy: udawany KSeF + prawdziwy PostgreSQL (TEST_DATABASE_URL).
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { encryptSecret } from '../src/crypto/secret-box.ts';
import type { Db } from '../src/db/pool.ts';
import { MANUAL_SYNC_COOLDOWN_MINUTES, syncKsef, warsawMidnightIso, type SyncOptions } from '../src/jobs/ksef-sync.ts';
import { KsefClient } from '../src/ksef/client.ts';
import { FakeKsef, GOOD_TOKEN, NIP, simpleInvoiceXml, type FakeInvoice } from './helpers/fake-ksef.ts';
import { freshTestDb, skipWithoutDb } from './helpers/test-db.ts';

const KEY = randomBytes(32);
const fake = new FakeKsef();

const invoice = (n: number, storedAt: string, extra: Partial<FakeInvoice> = {}): FakeInvoice => ({
  ksefNumber: `5260250274-20261001-${String(n).padStart(6, '0')}-AA`, invoiceNumber: `FV/${n}/2026`, issueDate: '2026-10-01',
  grossAmount: 100 + n + 0.23, permanentStorageDate: storedAt, seller: { nip: '5260250274', name: `Dostawca ${n}` }, ...extra,
});

describe('pobieranie faktur z KSeF do bazy', { skip: skipWithoutDb }, () => {
  let db: Db;
  let nowMs = Date.parse('2026-10-20T13:00:00Z');
  const options = (extra: Partial<SyncOptions> = {}): SyncOptions => ({
    now: () => nowMs,
    createClient: (_env, interactive) => new KsefClient({ baseUrl: fake.baseUrl, pollIntervalMs: 1, ...(interactive ? { maxRateLimitRetries: 0 } : {}) }),
    ...extra,
  });
  const settings = async () => (await db.query('SELECT * FROM settings WHERE id = 1')).rows[0];
  const invoices = async () => (await db.query('SELECT * FROM invoices ORDER BY ksef_number')).rows;

  before(async () => {
    db = await freshTestDb();
    await fake.start();
  });
  after(async () => {
    fake.stop();
    await db.end();
  });
  beforeEach(async () => {
    fake.reset();
    nowMs += 3600_000;
    await db.query('TRUNCATE invoices');
    await db.query(`UPDATE settings SET nip = $1, ksef_env = 'test', ksef_token_enc = $2, ksef_sync_from = '2026-10-01',
      ksef_next_from = NULL, ksef_last_success_at = NULL, ksef_last_attempt_at = NULL, ksef_last_error = NULL`, [NIP, encryptSecret(GOOD_TOKEN, KEY)]);
  });

  it('bez ustawień nic nie robi i mówi, czego brakuje', async () => {
    await db.query('UPDATE settings SET ksef_token_enc = NULL');
    const result = await syncKsef(db, KEY, options());
    assert.equal(result.status, 'skipped');
    assert.match((result as { message: string }).message, /token KSeF/);
    assert.equal(fake.seen.length, 0);
  });

  it('pierwsza synchronizacja: od północy dnia początkowego, zapis faktur z treścią i pozycjami, zapamiętany znacznik', async () => {
    fake.invoices = [invoice(1, '2026-10-02T08:00:00.000Z'), invoice(2, '2026-10-03T08:00:00.000Z')];
    const result = await syncKsef(db, KEY, options());
    assert.deepEqual(result, { status: 'ok', newInvoices: 2, xmlDownloaded: 2, xmlPending: 0 });
    const query = fake.seen.find((r) => r.url.startsWith('/v2/invoices/query/metadata'))!.body;
    assert.equal(query.dateRange.from, warsawMidnightIso('2026-10-01'));
    assert.equal(query.dateRange.from, '2026-09-30T22:00:00.000Z');
    const rows = await invoices();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].gross_amount, 10123);
    assert.equal(rows[0].status, 'to_review');
    assert.equal(rows[0].seller_name, 'Dostawca 1');
    assert.deepEqual(rows[0].items.map((i: { name: string }) => i.name), ['Usługa']);
    const s = await settings();
    assert.equal(s.ksef_next_from.toISOString(), fake.hwm);
    assert.equal(s.ksef_last_success_at.getTime(), nowMs);
    assert.equal(s.ksef_last_error, null);
  });

  it('ponowna synchronizacja nie tworzy duplikatów i zaczyna od zapamiętanego znacznika', async () => {
    fake.invoices = [invoice(1, '2026-10-02T08:00:00.000Z')];
    await syncKsef(db, KEY, options());
    fake.seen = [];
    fake.invoices.push(invoice(2, '2026-10-20T11:00:00.000Z'));
    fake.hwm = '2026-10-21T00:00:00.000Z';
    // KSeF zwraca też starą fakturę (np. na granicy okna) – baza ją odrzuca.
    await db.query('UPDATE settings SET ksef_next_from = $1', ['2026-10-02T08:00:00.000Z']);
    const result = await syncKsef(db, KEY, options());
    assert.equal(result.status === 'ok' && result.newInvoices, 1);
    assert.equal((await invoices()).length, 2);
    assert.equal(fake.seen.find((r) => r.url.startsWith('/v2/invoices/query/metadata'))!.body.dateRange.from, '2026-10-02T08:00:00.000Z');
  });

  it('faktura korygująca jest oznaczona, a wiele pozycji zapisane w kolejności', async () => {
    const kor = invoice(3, '2026-10-05T08:00:00.000Z', { invoiceType: 'Kor', grossAmount: -24.6 });
    fake.invoices = [kor];
    fake.xml.set(kor.ksefNumber, simpleInvoiceXml(kor, kor.ksefNumber)
      .replace('<RodzajFaktury>VAT</RodzajFaktury>', '<RodzajFaktury>KOR</RodzajFaktury><DaneFaKorygowanej><NrFaKorygowanej>FV/1/2026</NrFaKorygowanej></DaneFaKorygowanej>')
      .replace('</FaWiersz>', '</FaWiersz><FaWiersz><NrWierszaFa>2</NrWierszaFa><P_7>Druga</P_7></FaWiersz><FaWiersz><NrWierszaFa>3</NrWierszaFa><P_7>Trzecia</P_7></FaWiersz>'));
    await syncKsef(db, KEY, options());
    const [row] = await invoices();
    assert.equal(row.is_correction, true);
    assert.equal(row.gross_amount, -2460);
    assert.deepEqual(row.corrected, [{ invoiceNumber: 'FV/1/2026' }]);
    assert.deepEqual(row.items.map((i: { name: string }) => i.name), ['Usługa', 'Druga', 'Trzecia']);
  });

  it('awaria KSeF: zapisany komunikat, data ostatniego sukcesu bez zmian, kolejna próba pobiera wszystko', async () => {
    fake.invoices = [invoice(1, '2026-10-02T08:00:00.000Z')];
    fake.metadataFails = true;
    const failed = await syncKsef(db, KEY, options());
    assert.equal(failed.status, 'error');
    let s = await settings();
    assert.match(s.ksef_last_error, /KSeF chwilowo nie działa/);
    assert.equal(s.ksef_last_success_at, null);
    assert.equal(s.ksef_next_from, null);

    fake.metadataFails = false;
    nowMs += 24 * 3600_000;
    assert.equal((await syncKsef(db, KEY, options())).status, 'ok');
    s = await settings();
    assert.equal(s.ksef_last_error, null);
    assert.equal((await invoices()).length, 1);
  });

  it('nieudane pobranie treści nie gubi faktury – treść dociąga następna synchronizacja', async () => {
    fake.invoices = [invoice(1, '2026-10-02T08:00:00.000Z')];
    fake.xmlFails = true;
    const first = await syncKsef(db, KEY, options());
    assert.deepEqual(first, { status: 'ok', newInvoices: 1, xmlDownloaded: 0, xmlPending: 1 });
    assert.equal((await invoices())[0].xml, null);
    fake.xmlFails = false;
    const second = await syncKsef(db, KEY, options());
    assert.deepEqual(second, { status: 'ok', newInvoices: 0, xmlDownloaded: 1, xmlPending: 0 });
  });

  it('ucięty wynik: kolejne okno w tym samym uruchomieniu od daty ostatniej faktury', async () => {
    fake.invoices = [1, 2, 3].map((n) => invoice(n, `2026-10-0${n + 1}T08:00:00.000Z`));
    fake.truncateAfter = 2;
    const result = await syncKsef(db, KEY, options());
    assert.equal(result.status === 'ok' && result.newInvoices, 3);
    const froms = fake.seen.filter((r) => r.url.startsWith('/v2/invoices/query/metadata?sortOrder=Asc&pageOffset=0')).map((r) => r.body.dateRange.from);
    assert.equal(froms[1], '2026-10-03T08:00:00.000Z');
  });

  it('przycisk „sprawdź teraz”: nie częściej niż co kilka minut i bez czekania na KSeF przy 429', async () => {
    fake.rateLimitMetadataSeconds = 120;
    const limited = await syncKsef(db, KEY, options({ interactive: true }));
    assert.equal(limited.status, 'error');
    assert.match((limited as { message: string }).message, /przerwę.*2 min/);
    const again = await syncKsef(db, KEY, options({ interactive: true }));
    assert.equal(again.status, 'skipped');
    assert.match((again as { message: string }).message, new RegExp(`${MANUAL_SYNC_COOLDOWN_MINUTES} min`));
  });

  it('dwie synchronizacje naraz: druga czeka na swoją kolej (pomija), nie dubluje pracy', async () => {
    fake.invoices = [invoice(1, '2026-10-02T08:00:00.000Z')];
    const [a, b] = await Promise.all([syncKsef(db, KEY, options()), syncKsef(db, KEY, options())]);
    assert.deepEqual([a.status, b.status].sort(), ['ok', 'skipped']);
    assert.equal(fake.logins, 1);
  });

  it('zły token: zrozumiały komunikat bez treści tokenu', async () => {
    await db.query('UPDATE settings SET ksef_token_enc = $1', [encryptSecret('zly-token-123', KEY)]);
    const result = await syncKsef(db, KEY, options());
    assert.equal(result.status, 'error');
    assert.match((result as { message: string }).message, /odrzucił token/);
    assert.ok(!(result as { message: string }).message.includes('zly-token'));
  });
});
