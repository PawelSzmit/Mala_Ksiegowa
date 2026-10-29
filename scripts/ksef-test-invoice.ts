// Wystawia JEDNĄ fakturę testową na TESTOWYM KSeF: sprzedawca to nowy wymyślony NIP,
// nabywca to NIP z próby (KSEF_NIP). Dzięki temu próba ma co pobrać jako fakturę kosztową.
// Aplikacja produkcyjna nic nie wystawia – to wyłącznie przygotowanie testu.
//
// Użycie:  KSEF_NIP=<NIP nabywcy> node scripts/ksef-test-invoice.ts
// Wzór faktury: scripts/fixtures/fa3-test-invoice.xml (szablon z oficjalnego klienta MF, FA(3)).
import { createCipheriv, createHash, randomBytes, constants, publicEncrypt, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { KSEF_BASE_URLS, type PublicKeyCertificate } from '../src/ksef/types.ts';
import { call, createTestCertificate, loginWithTestCertificate, randomNip } from './lib/ksef-test-auth.ts';

const baseUrl = KSEF_BASE_URLS.test;
const buyerNip = process.env.KSEF_NIP;
if (!buyerNip) throw new Error('Ustaw KSEF_NIP (NIP nabywcy z próby)');
const sellerNip = randomNip();

const now = new Date();
const invoiceXml = readFileSync(new URL('./fixtures/fa3-test-invoice.xml', import.meta.url), 'utf8')
  .replace('#seller_nip#', sellerNip)
  .replace('#buyer_nip#', buyerNip)
  .replace('#invoice_number#', String(now.getTime()))
  .replace('#created#', now.toISOString())
  .replace('#issue_date#', now.toISOString().slice(0, 10));
const invoice = Buffer.from(invoiceXml, 'utf8');

const session = await loginWithTestCertificate(baseUrl, sellerNip, createTestCertificate(sellerNip));
const bearer = session.accessToken.token;
console.log(`Sprzedawca ${sellerNip} zalogowany.`);

// Klucz AES-256 dla tej sesji, zaszyfrowany kluczem publicznym MF (RSA-OAEP SHA-256).
const certs = await call<PublicKeyCertificate[]>(baseUrl, 'GET', '/security/public-key-certificates');
const mfCert = certs.find((c) => c.usage.includes('SymmetricKeyEncryption'));
if (!mfCert) throw new Error('Brak klucza MF do szyfrowania sesji');
const key = randomBytes(32);
const iv = randomBytes(16);
const encryptedKey = publicEncrypt(
  { key: new X509Certificate(Buffer.from(mfCert.certificate, 'base64')).publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
  key,
);

const opened = await call<{ referenceNumber: string }>(baseUrl, 'POST', '/sessions/online', {
  bearer,
  json: {
    formCode: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' },
    encryption: { encryptedSymmetricKey: encryptedKey.toString('base64'), initializationVector: iv.toString('base64') },
  },
});

const cipher = createCipheriv('aes-256-cbc', key, iv);
const encrypted = Buffer.concat([cipher.update(invoice), cipher.final()]);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('base64');
const sent = await call<{ referenceNumber: string }>(baseUrl, 'POST', `/sessions/online/${opened.referenceNumber}/invoices`, {
  bearer,
  json: {
    invoiceHash: sha(invoice),
    invoiceSize: invoice.length,
    encryptedInvoiceHash: sha(encrypted),
    encryptedInvoiceSize: encrypted.length,
    encryptedInvoiceContent: encrypted.toString('base64'),
  },
});

let ksefNumber: string | undefined;
for (let i = 0; i < 60 && !ksefNumber; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const st = await call<{ ksefNumber?: string; status: { code: number; description: string; details?: string[] } }>(
    baseUrl, 'GET', `/sessions/${opened.referenceNumber}/invoices/${sent.referenceNumber}`, { bearer },
  );
  if (st.ksefNumber) ksefNumber = st.ksefNumber;
  else if (st.status.code >= 300) throw new Error(`Faktura odrzucona: ${JSON.stringify(st.status)}`);
}
await call(baseUrl, 'POST', `/sessions/online/${opened.referenceNumber}/close`, { bearer });
if (!ksefNumber) throw new Error('Faktura nie dostała numeru KSeF w rozsądnym czasie');
console.log(`Faktura przyjęta, numer KSeF: ${ksefNumber}`);
