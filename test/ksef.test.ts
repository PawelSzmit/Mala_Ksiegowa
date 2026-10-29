import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { constants, privateDecrypt, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import { KsefClient } from '../src/ksef/client.ts';
import { encryptKsefToken } from '../src/ksef/crypto.ts';
import { KsefError } from '../src/ksef/types.ts';

const privateKeyPem = readFileSync(new URL('./fixtures/fake-ksef-key.pem', import.meta.url), 'utf8');
const certPem = readFileSync(new URL('./fixtures/fake-ksef-cert.pem', import.meta.url), 'utf8');
const certDerBase64 = new X509Certificate(certPem).raw.toString('base64');

const NIP = '1234563218';
const GOOD_TOKEN = 'dobry-token-testowy';

/** Udawany KSeF: trzyma się opisu z oficjalnej dokumentacji (logowanie tokenem, metadane, faktura). */
class FakeKsef {
  server!: Server;
  baseUrl = '';
  accessTokenValid = true;
  redeemed = new Set<string>();
  authPollsLeft = 1;
  invoices: { ksefNumber: string; invoiceNumber: string; issueDate: string; grossAmount: number }[] = [];
  seen: { method: string; url: string; auth?: string; body?: any }[] = [];
  rateLimitOnce = false;
  truncated = false;

  async start() {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.baseUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/v2`;
  }
  stop() {
    this.server.close();
  }
  reset() {
    this.accessTokenValid = true;
    this.redeemed.clear();
    this.authPollsLeft = 1;
    this.invoices = [];
    this.seen = [];
    this.rateLimitOnce = false;
    this.truncated = false;
  }

  private json(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    const body = raw ? JSON.parse(raw) : undefined;
    const auth = req.headers.authorization?.replace('Bearer ', '');
    const url = new URL(req.url!, 'http://x');
    const path = url.pathname.replace('/v2', '');
    this.seen.push({ method: req.method!, url: req.url!, auth, body });

    if (this.rateLimitOnce && path === '/auth/challenge') {
      this.rateLimitOnce = false;
      res.writeHead(429, { 'retry-after': '0' });
      return res.end('{}');
    }

    if (req.method === 'POST' && path === '/auth/challenge') {
      return this.json(res, 200, { challenge: 'chal-123', timestamp: new Date(1_700_000_000_000).toISOString(), timestampMs: 1_700_000_000_000 });
    }
    if (req.method === 'GET' && path === '/security/public-key-certificates') {
      return this.json(res, 200, [
        { certificate: 'AAAA', validFrom: '2020-01-01T00:00:00Z', validTo: '2099-01-01T00:00:00Z', usage: ['SymmetricKeyEncryption'] },
        { certificate: certDerBase64, validFrom: '2020-01-01T00:00:00Z', validTo: '2099-01-01T00:00:00Z', usage: ['KsefTokenEncryption'] },
      ]);
    }
    if (req.method === 'POST' && path === '/auth/ksef-token') {
      const decrypted = privateDecrypt(
        { key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        Buffer.from(body.encryptedToken, 'base64'),
      ).toString('utf8');
      if (decrypted !== `${GOOD_TOKEN}|1700000000000` || body.contextIdentifier?.value !== NIP) {
        return this.json(res, 401, { status: { code: 401, description: 'Unauthorized' } });
      }
      return this.json(res, 202, { referenceNumber: 'ref-1', authenticationToken: { token: 'temp-1', validUntil: '2099-01-01T00:00:00Z' } });
    }
    if (req.method === 'GET' && path === '/auth/ref-1') {
      if (auth !== 'temp-1') return this.json(res, 401, {});
      if (this.authPollsLeft-- > 0) return this.json(res, 200, { status: { code: 100, description: 'Uwierzytelnianie w toku' } });
      return this.json(res, 200, { status: { code: 200, description: 'Uwierzytelnianie zakończone sukcesem' } });
    }
    if (req.method === 'POST' && path === '/auth/token/redeem') {
      if (auth !== 'temp-1' || this.redeemed.has(auth)) return this.json(res, 400, { status: { code: 400 } });
      this.redeemed.add(auth);
      return this.json(res, 200, {
        accessToken: { token: 'access-1', validUntil: '2099-01-01T00:00:00Z' },
        refreshToken: { token: 'refresh-1', validUntil: '2099-01-08T00:00:00Z' },
      });
    }
    if (req.method === 'POST' && path === '/auth/token/refresh') {
      if (auth !== 'refresh-1') return this.json(res, 401, {});
      this.accessTokenValid = true;
      return this.json(res, 200, { accessToken: { token: 'access-2', validUntil: '2099-01-01T00:00:00Z' } });
    }

    // Od tej pory wymagany ważny token dostępu.
    const expected = this.accessTokenValid ? 'access-1' : 'access-2';
    if (auth !== expected && auth !== 'access-2') return this.json(res, 401, {});
    if (auth === 'access-1' && !this.accessTokenValid) return this.json(res, 401, {});

    if (req.method === 'POST' && path === '/invoices/query/metadata') {
      const offset = Number(url.searchParams.get('pageOffset'));
      const size = Number(url.searchParams.get('pageSize'));
      const slice = this.invoices.slice(offset * size, offset * size + size);
      return this.json(res, 200, { hasMore: (offset + 1) * size < this.invoices.length, isTruncated: this.truncated, invoices: slice });
    }
    if (req.method === 'GET' && path.startsWith('/invoices/ksef/')) {
      res.writeHead(200, { 'content-type': 'application/xml' });
      return res.end(`<Faktura><NrKSeF>${decodeURIComponent(path.split('/').pop()!)}</NrKSeF></Faktura>`);
    }
    return this.json(res, 404, {});
  }
}

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
    assert.match(xml, /<NrKSeF>1234563218-20261001-ABC<\/NrKSeF>/);
  });

  it('czeka i ponawia po odpowiedzi 429 (zbyt wiele żądań)', async () => {
    fake.rateLimitOnce = true;
    const session = await newClient().authenticateWithToken(GOOD_TOKEN, NIP);
    assert.equal(session.accessToken.token, 'access-1');
  });

  it('zapytanie bez logowania daje błąd, a nie wysyła żądania', async () => {
    await assert.rejects(newClient().getInvoiceXml('X'), (e: unknown) => e instanceof KsefError && e.status === 401);
    assert.equal(fake.seen.length, 0);
  });
});
