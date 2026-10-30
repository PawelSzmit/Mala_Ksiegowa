import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Db } from '../db/pool.ts';
import type { SyncOptions } from '../jobs/ksef-sync.ts';
import type { SyncStatus } from '../views/invoices.ts';

/** Wszystko, czego potrzebuje obsługa jednej strony po zalogowaniu. */
export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  method: string;
  user: { id: number; username: string };
  db: Db;
  encryptionKey: Buffer;
  now: () => number;
  /** Do testów: udawany KSeF. */
  syncOptions?: Pick<SyncOptions, 'createClient'>;
}

/** Zwraca true, gdy ścieżka została obsłużona. */
export type Route = (ctx: RouteContext) => Promise<boolean>;

export async function loadSyncStatus(db: Db): Promise<SyncStatus> {
  const { rows: [s] } = await db.query<{
    configured: boolean; ksef_last_success_at: Date | null; ksef_last_attempt_at: Date | null; ksef_last_error: string | null; pending: number;
  }>(`SELECT (nip IS NOT NULL AND ksef_token_enc IS NOT NULL AND ksef_sync_from IS NOT NULL) AS configured,
             ksef_last_success_at, ksef_last_attempt_at, ksef_last_error,
             (SELECT count(*)::int FROM invoices WHERE xml IS NULL) AS pending
      FROM settings WHERE id = 1`);
  return {
    configured: s!.configured,
    lastSuccessAt: s!.ksef_last_success_at,
    lastAttemptAt: s!.ksef_last_attempt_at,
    lastError: s!.ksef_last_error,
    xmlPending: s!.pending,
  };
}

/** Numer z adresu, np. /faktury/12/decyzja → 12. */
export const idFrom = (value: string | undefined) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
