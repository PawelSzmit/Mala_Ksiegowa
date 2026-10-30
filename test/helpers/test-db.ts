// Wspólne dla testów na prawdziwym PostgreSQL. Baza testowa jest czyszczona przy każdym uruchomieniu,
// dlatego odmawiamy pracy na bazie, której nazwa nie zawiera „test” (ochrona przed pomyłką z produkcją).
import { migrate } from '../../src/db/migrate.ts';
import { createPool, type Db } from '../../src/db/pool.ts';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL;
export const skipWithoutDb: string | false = TEST_DB_URL ? false : 'brak TEST_DATABASE_URL – pomijam testy z bazą';

export async function freshTestDb(): Promise<Db> {
  const name = decodeURIComponent(new URL(TEST_DB_URL!).pathname.slice(1));
  if (!/test/i.test(name)) throw new Error(`TEST_DATABASE_URL wskazuje bazę „${name}” – testy działają tylko na bazie z „test” w nazwie`);
  const db = createPool(TEST_DB_URL!);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  return db;
}
