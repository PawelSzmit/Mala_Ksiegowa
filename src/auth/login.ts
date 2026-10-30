import type { Db } from '../db/pool.ts';
import { decryptSecret } from '../crypto/secret-box.ts';
import { hashPassword, verifyPassword } from './password.ts';
import { verifyTotp } from './totp.ts';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export type LoginResult = { ok: true; userId: number } | { ok: false; reason: 'invalid' | 'locked'; lockedUntil?: Date };

// Hash do porównania, gdy użytkownik nie istnieje – żeby czas odpowiedzi nie zdradzał, czy login jest poprawny.
const dummyHash = hashPassword('nieistniejace-konto');

interface UserRow {
  id: number;
  password_hash: string;
  totp_secret_enc: string;
  totp_last_step: number;
  failed_logins: number;
  locked_until: Date | null;
}

/**
 * Logowanie: hasło + kod z telefonu. Po 5 nieudanych próbach konto jest blokowane na 15 minut.
 * Komunikat dla użytkownika nie mówi, co było złe (login, hasło czy kod).
 */
export async function attemptLogin(
  db: Db,
  key: Buffer,
  input: { username: string; password: string; code: string },
  nowMs = Date.now(),
): Promise<LoginResult> {
  const { rows } = await db.query<UserRow>(
    'SELECT id, password_hash, totp_secret_enc, totp_last_step, failed_logins, locked_until FROM users WHERE username = $1',
    [input.username.trim()],
  );
  const user = rows[0];
  if (!user) {
    await verifyPassword(input.password, await dummyHash);
    return { ok: false, reason: 'invalid' };
  }
  if (user.locked_until && user.locked_until.getTime() > nowMs) {
    return { ok: false, reason: 'locked', lockedUntil: user.locked_until };
  }

  const passwordOk = await verifyPassword(input.password, user.password_hash);
  const step = passwordOk ? verifyTotp(decryptSecret(user.totp_secret_enc, key), input.code.trim(), Number(user.totp_last_step), nowMs) : null;

  // Liczniki zmieniamy jednym zapytaniem w bazie, a nie „odczytaj → zapisz”: wiele prób wysłanych naraz
  // nie może zgubić porażek ani dwa razy przepuścić tego samego kodu.
  if (step !== null) {
    const ok = await db.query(
      'UPDATE users SET failed_logins = 0, locked_until = NULL, totp_last_step = $2 WHERE id = $1 AND totp_last_step < $2 AND (locked_until IS NULL OR locked_until <= $3) RETURNING id',
      [user.id, step, new Date(nowMs)],
    );
    if (ok.rowCount) return { ok: true, userId: user.id };
  }

  const lockedUntil = new Date(nowMs + LOCK_MINUTES * 60_000);
  const { rows: [after] } = await db.query<{ failed_logins: number; locked_until: Date | null }>(
    `UPDATE users SET
       failed_logins = CASE WHEN failed_logins + 1 >= $2 THEN 0 ELSE failed_logins + 1 END,
       locked_until  = CASE WHEN failed_logins + 1 >= $2 THEN $3 ELSE locked_until END
     WHERE id = $1 RETURNING failed_logins, locked_until`,
    [user.id, MAX_FAILED_LOGINS, lockedUntil],
  );
  if (after?.locked_until && after.locked_until.getTime() > nowMs) return { ok: false, reason: 'locked', lockedUntil: after.locked_until };
  return { ok: false, reason: 'invalid' };
}
