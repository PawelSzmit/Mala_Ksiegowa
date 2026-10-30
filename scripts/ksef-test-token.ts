// Przygotowanie próby na TESTOWYM KSeF: wymyślony NIP, certyfikat samopodpisany, logowanie XAdES,
// a potem token KSeF z jednym uprawnieniem: InvoiceRead (tylko odczyt faktur).
// Na produkcji ten krok robi Paweł ręcznie po zalogowaniu Profilem Zaufanym.
//
// Użycie:  node scripts/ksef-test-token.ts [plik-wyjściowy]
// NIP i token trafiają do pliku (domyślnie .ksef-test.env, ignorowany przez git), nie na ekran.
import { writeFileSync } from 'node:fs';
import { KSEF_BASE_URLS } from '../src/ksef/types.ts';
import { call, createTestCertificate, loginWithTestCertificate, randomNip } from './lib/ksef-test-auth.ts';

const baseUrl = KSEF_BASE_URLS.test;
const outFile = process.argv[2] ?? '.ksef-test.env';
const nip = process.env.KSEF_NIP ?? randomNip();

const cert = createTestCertificate(nip);
const session = await loginWithTestCertificate(baseUrl, nip, cert);
console.log(`Logowanie certyfikatem testowym OK (NIP ${nip}).`);

const created = await call<{ referenceNumber: string; token: string }>(baseUrl, 'POST', '/tokens', {
  bearer: session.accessToken.token,
  json: { permissions: ['InvoiceRead'], description: 'Mala Ksiegowa - proba (tylko odczyt)' },
});

for (let i = 0; ; i++) {
  const st = await call<{ status: string; requestedPermissions: string[]; statusDetails?: string[] }>(
    baseUrl, 'GET', `/tokens/${created.referenceNumber}`, { bearer: session.accessToken.token },
  );
  if (st.status === 'Active') {
    console.log(`Token aktywny, uprawnienia: ${st.requestedPermissions.join(', ')}`);
    break;
  }
  if (st.status !== 'Pending' || i >= 30) throw new Error(`Token nie stał się aktywny: ${JSON.stringify(st)}`);
  await new Promise((r) => setTimeout(r, 1000));
}

writeFileSync(outFile, `KSEF_ENV=test\nKSEF_NIP=${nip}\nKSEF_TOKEN='${created.token}'\n`, { mode: 0o600 });
console.log(`Zapisano NIP i token do ${outFile}`);
