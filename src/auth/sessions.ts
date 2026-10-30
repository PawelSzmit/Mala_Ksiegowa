import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db/pool.ts';

export const SESSION_COOKIE = 'mk_sesja';
export const SESSION_HOURS = 12;

const hashId = (id: string) => createHash('sha256').update(id).digest('hex');

/** Nowa sesja: w ciasteczku losowy identyfikator, w bazie tylko jego skrót. */
export async function createSession(db: Db, userId: number): Promise<string> {
  const id = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [hashId(id), userId, SESSION_HOURS],
  );
  // Przy okazji sprzątamy wygasłe sesje.
  await db.query('DELETE FROM sessions WHERE expires_at < now()');
  return id;
}

export async function findSessionUser(db: Db, id: string | undefined): Promise<{ id: number; username: string } | null> {
  if (!id) return null;
  const { rows } = await db.query<{ id: number; username: string }>(
    `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id_hash = $1 AND s.expires_at > now()`,
    [hashId(id)],
  );
  return rows[0] ?? null;
}

export async function deleteSession(db: Db, id: string | undefined): Promise<void> {
  if (id) await db.query('DELETE FROM sessions WHERE id_hash = $1', [hashId(id)]);
}
