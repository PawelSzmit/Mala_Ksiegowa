// Próba połączenia z KSeF: logowanie tokenem, lista faktur kosztowych, pobranie jednej faktury.
// Nie wystawia ani nie zmienia niczego w KSeF. Tokenu nie wypisuje.
//
// Użycie (token i NIP podajemy w zmiennych środowiska, nigdy w pliku):
//   KSEF_ENV=test KSEF_NIP=... KSEF_TOKEN=... node scripts/ksef-spike.ts
import { KsefClient } from '../src/ksef/client.ts';
import { KSEF_BASE_URLS, KsefError, type KsefEnvironment } from '../src/ksef/types.ts';

const env = (process.env.KSEF_ENV ?? 'test') as KsefEnvironment;
const nip = process.env.KSEF_NIP;
const token = process.env.KSEF_TOKEN;
const days = Number(process.env.KSEF_DAYS ?? 60);

if (!(env in KSEF_BASE_URLS)) throw new Error(`KSEF_ENV musi być jednym z: ${Object.keys(KSEF_BASE_URLS).join(', ')}`);
if (!nip || !token) throw new Error('Ustaw KSEF_NIP i KSEF_TOKEN');

const client = new KsefClient({ baseUrl: KSEF_BASE_URLS[env] });

try {
  console.log(`Środowisko: ${env}`);
  const session = await client.authenticateWithToken(token, nip);
  console.log(`Logowanie OK. Token dostępu ważny do: ${session.accessToken.validUntil}`);

  const from = new Date(Date.now() - days * 24 * 3600 * 1000);
  const invoices = await client.queryInvoiceMetadata({ from, subjectType: 'Subject2' });
  console.log(`Faktury kosztowe z ostatnich ${days} dni: ${invoices.length}`);

  const first = invoices[0];
  if (first) {
    console.log(`Pierwsza: ${first.invoiceNumber} | ${first.seller?.name ?? '?'} | brutto ${first.grossAmount ?? '?'} ${first.currency ?? ''}`);
    const xml = await client.getInvoiceXml(first.ksefNumber);
    console.log(`XML faktury pobrany (${xml.length} znaków), początek: ${xml.slice(0, 120).replace(/\s+/g, ' ')}`);
  } else {
    console.log('Brak faktur w tym zakresie – logowanie i zapytanie działają, ale pobrania XML nie sprawdzono.');
  }
  console.log('WYNIK: OK');
} catch (error) {
  if (error instanceof KsefError) {
    console.error(`WYNIK: BŁĄD ${error.message}`);
    console.error(JSON.stringify(error.details, null, 2));
  } else {
    console.error('WYNIK: BŁĄD', error);
  }
  process.exit(1);
}
