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

  if (step === null) {
    const failed = user.failed_logins + 1;
    if (failed >= MAX_FAILED_LOGINS) {
      const lockedUntil = new Date(nowMs + LOCK_MINUTES * 60_000);
      await db.query('UPDATE users SET failed_logins = 0, locked_until = $2 WHERE id = $1', [user.id, lockedUntil]);
      return { ok: false, reason: 'locked', lockedUntil };
    }
    await db.query('UPDATE users SET failed_logins = $2 WHERE id = $1', [user.id, failed]);
    return { ok: false, reason: 'invalid' };
  }

  await db.query('UPDATE users SET failed_logins = 0, locked_until = NULL, totp_last_step = $2 WHERE id = $1', [user.id, step]);
  return { ok: true, userId: user.id };
}
