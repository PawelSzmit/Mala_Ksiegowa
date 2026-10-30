// Zadanie nocne (cron w cPanelu): pobiera nowe faktury kosztowe z KSeF.
// Użycie: DATABASE_URL=... APP_ENCRYPTION_KEY=... node scripts/ksef-sync.ts
import { loadConfig } from '../src/config.ts';
import { createPool } from '../src/db/pool.ts';
import { syncKsef } from '../src/jobs/ksef-sync.ts';

const config = loadConfig();
const db = createPool(config.databaseUrl);
try {
  const result = await syncKsef(db, config.encryptionKey);
  const stamp = new Date().toISOString();
  if (result.status === 'ok') {
    console.log(`${stamp} KSeF OK: nowe faktury ${result.newInvoices}, pobrane treści ${result.xmlDownloaded}, czeka na treść ${result.xmlPending}`);
  } else {
    console.log(`${stamp} KSeF ${result.status === 'error' ? 'BŁĄD' : 'pominięto'}: ${result.message}`);
    if (result.status === 'error') process.exitCode = 1;
  }
} finally {
  await db.end();
}
