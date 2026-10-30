import assert from 'node:assert/strict';
import { constants, privateDecrypt } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { KsefClient } from '../src/ksef/client.ts';
import { encryptKsefToken } from '../src/ksef/crypto.ts';
import { KsefError } from '../src/ksef/types.ts';
import { certDerBase64, FakeKsef, GOOD_TOKEN, NIP, privateKeyPem } from './helpers/fake-ksef.ts';

const fake = new FakeKsef();
const newClient = () => new KsefClient({ baseUrl: fake.baseUrl, pollIntervalMs: 1, pollAttempts: 5 });
const makeInvoices = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ ksefNumber: `KSEF-${i + 1}`, invoiceNumber: `FV/${i + 1}`, issueDate: '2026-10-01', grossAmount: 123 + i }));

describe('szyfrowanie tokenu', () => {
  it('szyfruje "token|timestamp" tak, że da się go odczytać kluczem prywatnym (RSA-OAEP, SHA-256)', () => {
    const encrypted = encryptKsefToken('abc', 42, certDerBase64);
    const plain = privateDecrypt({ key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(encrypted, 'base64'));
    assert.equal(plain.toString('utf8'), 'abc|42');
  });
});

describe('klient KSeF', () => {
  before(() => fake.start());
  after(() => fake.stop());
  beforeEach(() => fake.reset());

  it('loguje się poprawnym tokenem i odbiera tokeny dostępu (po jednym sprawdzeniu statusu "w toku")', async () => {
    const session = await newClient().authenticateWithToken(GOOD_TOKEN, NIP);
    assert.equal(session.accessToken.token, 'access-1');
    assert.equal(fake.seen.filter((r) => r.url === '/v2/auth/ref-1').length, 2);
  });

  it('zły token kończy się czytelnym błędem KsefError i nie ujawnia tokenu w komunikacie', async () => {
    await assert.rejects(
      newClient().authenticateWithToken('zly-token', NIP),
      (error: unknown) => error instanceof KsefError && error.status === 401 && !error.message.includes('zly-token'),
    );
  });

  it('zły NIP kończy się błędem logowania', async () => {
    await assert.rejects(newClient().authenticateWithToken(GOOD_TOKEN, '0000000000'), KsefError);
  });

  it('zwraca pustą listę, gdy nie ma faktur', async () => {
    const client = newClient();
    await client.authenticateWithToken(GOOD_TOKEN, NIP);
    assert.deepEqual(await client.queryInvoiceMetadata({ from: new Date('2026-01-01') }), []);
  });

  it('pobiera wszystkie strony wyników i pyta o faktury, gdzie firma jest nabywcą', async () => {
    fake.invoices = makeInvoices(5);
    const client = newClient();
    await client.authenticateWithToken(GOOD_TOKEN, NIP);
    const result = await client.queryInvoiceMetadata({ from: new Date('2026-01-01'), pageSize: 2 });
    assert.equal(result.length, 5);
    const queries = fake.seen.filter((r) => r.url.startsWith('/v2/invoices/query/metadata'));
    assert.equal(queries.length, 3);
    assert.equal(queries[0]!.body.subjectType, 'Subject2');
  });

  it('ucięty wynik (isTruncated) daje błąd zamiast po cichu pominąć faktury', async () => {
    fake.invoices = makeInvoices(1);
    fake.truncated = true;
    const client = newClient();
    await client.authenticateWithToken(GOOD_TOKEN, NIP);
    await assert.rejects(client.queryInvoiceMetadata({ from: new Date('2026-01-01') }), KsefError);
  });

  it('po wygaśnięciu tokenu dostępu odświeża go i ponawia zapytanie', async () => {
    fake.invoices = makeInvoices(1);
    const client = newClient();
    await client.authenticateWithToken(GOOD_TOKEN, NIP);
    fake.accessTokenValid = false;
    const result = await client.queryInvoiceMetadata({ from: new Date('2026-01-01') });
    assert.equal(result.length, 1);
    assert.ok(fake.seen.some((r) => r.url === '/v2/auth/token/refresh'));
  });

  it('pobiera XML faktury po numerze KSeF', async () => {
    const client = newClient();
    await client.authenticateWithToken(GOOD_TOKEN, NIP);
    const xml = await client.getInvoiceXml('1234563218-20261001-ABC');
    assert.match(xml, /<P_2>1234563218-20261001-ABC<\/P_2>/);
  });

  it('czeka i ponawia po odpowiedzi 429 (zbyt wiele żądań)', async () => {
    fake.rateLimitOnce = true;
    const session = await newClient().authenticateWithToken(GOOD_TOKEN, NIP);
    assert.equal(session.accessToken.token, 'access-1');
  });

  it('okno przyrostowe: pyta po dacie trwałego zapisu z ograniczeniem do HWM i zwraca HWM jako początek kolejnego okna', async () => {
    fake.invoices = [
      { ...makeInvoices(1)[0]!, permanentStorageDate: '2026-10-05T10:00:00.000Z' },
      { ...makeInvoices(2)[1]!, permanentStorageDate: '2026-10-25T10:00:00.000Z' }, // po HWM – jeszcze niekompletne
    ];
    const client = newClient();
    await client.authenticateWithToken(GOOD_TOKEN, NIP);
    const window = await client.queryMetadataWindow({ from: '2026-10-01T00:00:00.000Z' });
    assert.deepEqual(window.invoices.map((i) => i.ksefNumber), ['KSEF-1']);
    assert.equal(window.nextFrom, fake.hwm);
    assert.equal(window.truncated, false);
    const body = fake.seen.find((r) => r.url.startsWith('/v2/invoices/query/metadata'))!.body;
    assert.deepEqual(body.dateRange, { dateType: 'PermanentStorage', from: '2026-10-01T00:00:00.000Z', restrictToPermanentStorageHwmDate: true });
  });

  it('okno z datą końcową wcześniejszą niż HWM kończy się na tej dacie', async () => {
    const client = newClient();
    await client.authenticateWithToken(GOOD_TOKEN, NIP);
    const window = await client.queryMetadataWindow({ from: '2026-01-01T00:00:00.000Z', to: '2026-04-01T00:00:00.000Z' });
    assert.equal(window.nextFrom, '2026-04-01T00:00:00.000Z');
  });

  it('ucięty wynik: okno kończy się na dacie ostatniej faktury i oznacza ucięcie', async () => {
    fake.invoices = makeInvoices(3).map((inv, i) => ({ ...inv, permanentStorageDate: `2026-10-0${i + 1}T10:00:00.000Z` }));
    fake.truncateAfter = 2;
    const client = newClient();
    await client.authenticateWithToken(GOOD_TOKEN, NIP);
    const window = await client.queryMetadataWindow({ from: '2026-10-01T00:00:00.000Z', pageSize: 10 });
    assert.equal(window.invoices.length, 2);
    assert.equal(window.truncated, true);
    assert.equal(window.nextFrom, '2026-10-02T10:00:00.000Z');
  });

  it('429 z długim czekaniem albo bez ponawiania: od razu czytelny błąd z czasem przerwy', async () => {
    fake.rateLimitMetadataSeconds = 600;
    const client = new KsefClient({ baseUrl: fake.baseUrl, pollIntervalMs: 1, maxRateLimitRetries: 3, maxRetryWaitSeconds: 10 });
    await client.authenticateWithToken(GOOD_TOKEN, NIP);
    await assert.rejects(client.queryMetadataWindow({ from: '2026-10-01T00:00:00.000Z' }), (e: unknown) =>
      e instanceof KsefError && e.status === 429 && /10 min/.test(e.message));
  });

  it('wygasły token odświeżający → logowanie od nowa i ponowienie zapytania', async () => {
    const client = newClient();
    await client.authenticateWithToken(GOOD_TOKEN, NIP);
    fake.accessTokenValid = false;
    fake.refreshExpired = true;
    const window = await client.queryMetadataWindow({ from: '2026-10-01T00:00:00.000Z' });
    assert.equal(window.truncated, false);
    assert.equal(fake.logins, 2);
  });

  it('zapytanie bez logowania daje błąd, a nie wysyła żądania', async () => {
    await assert.rejects(newClient().getInvoiceXml('X'), (e: unknown) => e instanceof KsefError && e.status === 401);
    assert.equal(fake.seen.length, 0);
  });
});
