// Aktualizacja bazy: wykonuje brakujące pliki z migrations/.  Użycie: DATABASE_URL=... node scripts/migrate.ts
import { createPool } from '../src/db/pool.ts';
import { migrate } from '../src/db/migrate.ts';

if (!process.env.DATABASE_URL) throw new Error('Ustaw DATABASE_URL');
const db = createPool(process.env.DATABASE_URL);
try {
  const applied = await migrate(db);
  console.log(applied.length ? `Wykonano: ${applied.join(', ')}` : 'Baza jest aktualna.');
} finally {
  await db.end();
}
