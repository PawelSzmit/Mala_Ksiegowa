// Udawany serwer KSeF do testów (bez sieci). Trzyma się oficjalnej dokumentacji API KSeF 2.0.
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { constants, privateDecrypt, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const privateKeyPem = readFileSync(new URL('../fixtures/fake-ksef-key.pem', import.meta.url), 'utf8');
const certPem = readFileSync(new URL('../fixtures/fake-ksef-cert.pem', import.meta.url), 'utf8');
export const certDerBase64 = new X509Certificate(certPem).raw.toString('base64');

export const NIP = '1234563218';
export const GOOD_TOKEN = 'dobry-token-testowy';

/** Udawany KSeF: trzyma się opisu z oficjalnej dokumentacji (logowanie tokenem, metadane, faktura). */
export class FakeKsef {
  server!: Server;
  baseUrl = '';
  accessTokenValid = true;
  redeemed = new Set<string>();
  authPollsLeft = 1;
  invoices: FakeInvoice[] = [];
  /** XML faktur po numerze KSeF; brak wpisu → prosta faktura zbudowana z metadanych. */
  xml = new Map<string, string>();
  /** Znacznik kompletności zwracany w odpowiedzi na zapytanie o metadane. */
  hwm = '2026-10-20T12:00:00.000Z';
  /** Ucina wynik po tylu fakturach (isTruncated), jak KSeF po 10 000. */
  truncateAfter = Infinity;
  /** Odpowiedź 429 na zapytanie o metadane, z takim Retry-After (s). */
  rateLimitMetadataSeconds = 0;
  /** Token odświeżający wygasł → /auth/token/refresh daje 401. */
  refreshExpired = false;
  /** Pobranie XML kończy się błędem 500. */
  xmlFails = false;
  /** Zapytanie o listę faktur kończy się błędem 503 (awaria KSeF). */
  metadataFails = false;
  logins = 0;
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
    this.xml.clear();
    this.seen = [];
    this.rateLimitOnce = false;
    this.truncated = false;
    this.hwm = '2026-10-20T12:00:00.000Z';
    this.truncateAfter = Infinity;
    this.rateLimitMetadataSeconds = 0;
    this.refreshExpired = false;
    this.xmlFails = false;
    this.metadataFails = false;
    this.logins = 0;
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
      this.logins += 1;
      return this.json(res, 202, { referenceNumber: `ref-${this.logins}`, authenticationToken: { token: `temp-${this.logins}`, validUntil: '2099-01-01T00:00:00Z' } });
    }
    if (req.method === 'GET' && /^\/auth\/ref-\d+$/.test(path)) {
      if (auth !== `temp-${path.split('-')[1]}`) return this.json(res, 401, {});
      if (this.authPollsLeft-- > 0) return this.json(res, 200, { status: { code: 100, description: 'Uwierzytelnianie w toku' } });
      return this.json(res, 200, { status: { code: 200, description: 'Uwierzytelnianie zakończone sukcesem' } });
    }
    if (req.method === 'POST' && path === '/auth/token/redeem') {
      if (!auth?.startsWith('temp-') || this.redeemed.has(auth)) return this.json(res, 400, { status: { code: 400 } });
      this.redeemed.add(auth);
      this.accessTokenValid = true;
      return this.json(res, 200, {
        accessToken: { token: 'access-1', validUntil: '2099-01-01T00:00:00Z' },
        refreshToken: { token: 'refresh-1', validUntil: '2099-01-08T00:00:00Z' },
      });
    }
    if (req.method === 'POST' && path === '/auth/token/refresh') {
      if (auth !== 'refresh-1' || this.refreshExpired) return this.json(res, 401, {});
      this.accessTokenValid = true;
      return this.json(res, 200, { accessToken: { token: 'access-2', validUntil: '2099-01-01T00:00:00Z' } });
    }

    // Od tej pory wymagany ważny token dostępu.
    const expected = this.accessTokenValid ? 'access-1' : 'access-2';
    if (auth !== expected && auth !== 'access-2') return this.json(res, 401, {});
    if (auth === 'access-1' && !this.accessTokenValid) return this.json(res, 401, {});

    if (req.method === 'POST' && path === '/invoices/query/metadata') {
      if (this.metadataFails) return this.json(res, 503, {});
      if (this.rateLimitMetadataSeconds) {
        res.writeHead(429, { 'retry-after': String(this.rateLimitMetadataSeconds) });
        return res.end('{}');
      }
      const offset = Number(url.searchParams.get('pageOffset'));
      const size = Number(url.searchParams.get('pageSize'));
      const range = body?.dateRange ?? {};
      const from = range.from ? Date.parse(range.from) : -Infinity;
      const upTo = Math.min(range.to ? Date.parse(range.to) : Infinity, range.restrictToPermanentStorageHwmDate ? Date.parse(this.hwm) : Infinity);
      // Faktury bez daty trwałego zapisu (stare testy) traktujemy jak zapisane od zawsze.
      const matching = this.invoices
        .filter((i) => !i.permanentStorageDate || (Date.parse(i.permanentStorageDate) >= from && Date.parse(i.permanentStorageDate) < upTo))
        .sort((a, b) => Date.parse(a.permanentStorageDate ?? '0') - Date.parse(b.permanentStorageDate ?? '0'));
      const limited = matching.slice(0, this.truncateAfter);
      const truncated = this.truncated || matching.length > limited.length;
      const slice = limited.slice(offset * size, offset * size + size);
      const hasMore = (offset + 1) * size < limited.length || (truncated && (offset + 1) * size >= limited.length && matching.length > limited.length);
      return this.json(res, 200, { hasMore, isTruncated: truncated, permanentStorageHwmDate: this.hwm, invoices: slice });
    }
    if (req.method === 'GET' && path.startsWith('/invoices/ksef/')) {
      if (this.xmlFails) return this.json(res, 500, {});
      const ksefNumber = decodeURIComponent(path.split('/').pop()!);
      res.writeHead(200, { 'content-type': 'application/xml' });
      return res.end(this.xml.get(ksefNumber) ?? simpleInvoiceXml(this.invoices.find((i) => i.ksefNumber === ksefNumber), ksefNumber));
    }
    return this.json(res, 404, {});
  }
}


export interface FakeInvoice {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  grossAmount: number;
  permanentStorageDate?: string;
  seller?: { nip: string; name?: string };
  currency?: string;
  invoiceType?: string;
}

/** Najprostsza poprawna faktura FA(3) z jedną pozycją. */
export function simpleInvoiceXml(meta: FakeInvoice | undefined, ksefNumber: string): string {
  const gross = (meta?.grossAmount ?? 1).toFixed(2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza><WariantFormularza>3</WariantFormularza></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>${meta?.seller?.nip ?? '5260250274'}</NIP><Nazwa>${meta?.seller?.name ?? 'Dostawca Sp. z o.o.'}</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>${NIP}</NIP></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>${meta?.currency ?? 'PLN'}</KodWaluty>
    <P_1>${meta?.issueDate ?? '2026-10-01'}</P_1>
    <P_2>${meta?.invoiceNumber ?? ksefNumber}</P_2>
    <P_15>${gross}</P_15>
    <RodzajFaktury>VAT</RodzajFaktury>
    <FaWiersz><NrWierszaFa>1</NrWierszaFa><P_7>Usługa</P_7><P_8A>szt.</P_8A><P_8B>1</P_8B><P_11A>${gross}</P_11A></FaWiersz>
  </Fa>
</Faktura>`;
}
