import { readdirSync, readFileSync } from 'node:fs';
import type { Db } from './pool.ts';

const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);
const LOCK_ID = 7_406_211; // dowolna stała – blokada, żeby dwie migracje nie szły naraz

/** Wykonuje brakujące pliki migrations/NNN_*.sql po kolei, każdy w osobnej transakcji. Zwraca nazwy wykonanych. */
export async function migrate(db: Db, dir: URL = MIGRATIONS_DIR): Promise<string[]> {
  const client = await db.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
    const applied: string[] = [];
    for (const file of files) {
      if (done.has(file)) continue;
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(new URL(file, dir), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migracja ${file} nie powiodła się: ${(error as Error).message}`);
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}
