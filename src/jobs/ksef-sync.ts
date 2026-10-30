// Pobieranie faktur kosztowych z KSeF: raz na dobę z crona i na żądanie przyciskiem „sprawdź teraz”.
// Zasady MF („przyrostowe pobieranie faktur”, limity API):
// - przylegające okna po dacie trwałego zapisu, od znacznika kompletności (HWM) zapamiętanego w bazie,
// - limit 20 zapytań o listę na godzinę: mało zapytań na uruchomienie, przycisk nie częściej niż co 5 minut,
// - XML pobieramy raz i trzymamy w bazie (limit 64 pobrań na godzinę).
import { decryptSecret } from '../crypto/secret-box.ts';
import type { Db } from '../db/pool.ts';
import { KsefClient } from '../ksef/client.ts';
import { parseFaInvoice } from '../ksef/parse-fa.ts';
import { KSEF_BASE_URLS, KsefError, type InvoiceMetadata, type KsefEnvironment } from '../ksef/types.ts';

export const MANUAL_SYNC_COOLDOWN_MINUTES = 5;
const LOCK_ID = 7_406_212;
const MAX_WINDOW_DAYS = 90;
const DAY_MS = 24 * 3600 * 1000;

export interface SyncOptions {
  /** Przycisk „sprawdź teraz”: bez czekania po 429 i nie częściej niż co kilka minut. */
  interactive?: boolean;
  now?: () => number;
  createClient?: (env: KsefEnvironment, interactive: boolean) => KsefClient;
  /** Najwięcej okien (zapytań o listę) na jedno uruchomienie. */
  maxWindows?: number;
  /** Najwięcej pobrań XML na jedno uruchomienie. */
  maxXmlDownloads?: number;
}

export type SyncResult =
  | { status: 'ok'; newInvoices: number; xmlDownloaded: number; xmlPending: number }
  | { status: 'skipped'; message: string }
  | { status: 'error'; message: string };

const defaultClient = (env: KsefEnvironment, interactive: boolean) =>
  new KsefClient({ baseUrl: KSEF_BASE_URLS[env], ...(interactive ? { maxRateLimitRetries: 0 } : {}) });

/** Północ czasu polskiego danego dnia jako chwila w UTC (ISO). */
export function warsawMidnightIso(isoDate: string): string {
  const utcMidnight = Date.parse(`${isoDate}T00:00:00Z`);
  const warsawHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', hourCycle: 'h23' }).format(utcMidnight));
  return new Date(utcMidnight - warsawHour * 3600 * 1000).toISOString();
}

/** Komunikat dla Pawła – bez szczegółów technicznych i nigdy z tokenem. */
function describeError(error: unknown): string {
  if (error instanceof KsefError) {
    if (error.status === 429) return error.message;
    if (error.status === 401) return 'KSeF odrzucił token. Sprawdź w ustawieniach NIP i token (może wygasł albo został unieważniony).';
    if (error.status >= 500) return `KSeF chwilowo nie działa (błąd ${error.status}). Spróbujemy przy następnej synchronizacji.`;
    return `KSeF zwrócił błąd ${error.status}. Spróbujemy przy następnej synchronizacji.`;
  }
  if (error instanceof TypeError) return 'Brak połączenia z KSeF. Spróbujemy przy następnej synchronizacji.';
  return 'Nieoczekiwany błąd podczas pobierania faktur. Szczegóły są w logu aplikacji.';
}

async function saveMetadata(db: Db, inv: InvoiceMetadata): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO invoices (ksef_number, invoice_number, seller_nip, seller_name, issue_date, permanent_storage_date, gross_amount, currency, invoice_type, is_correction)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (ksef_number) DO NOTHING`,
    [
      inv.ksefNumber, inv.invoiceNumber, inv.seller?.nip ?? null, inv.seller?.name ?? null, inv.issueDate.slice(0, 10),
      inv.permanentStorageDate ?? null, Math.round(inv.grossAmount * 100), inv.currency ?? 'PLN', inv.invoiceType ?? null,
      /^kor/i.test(inv.invoiceType ?? ''),
    ],
  );
  return rowCount === 1;
}

/** Zapisuje XML i pola odczytane z faktury. Gdy XML jest nieczytelny – zostają dane z metadanych i opis błędu. */
export async function saveInvoiceXml(db: Db, id: number, xml: string): Promise<void> {
  try {
    const fa = parseFaInvoice(xml);
    await db.query(
      `UPDATE invoices SET xml = $2, parse_error = NULL, invoice_number = $3, issue_date = $4, seller_nip = COALESCE($5, seller_nip),
         seller_name = COALESCE($6, seller_name), gross_amount = $7, currency = $8, invoice_type = $9, is_correction = $10,
         corrected = $11, correction_reason = $12, items = $13
       WHERE id = $1`,
      [id, xml, fa.invoiceNumber, fa.issueDate, fa.sellerNip ?? null, fa.sellerName ?? null, fa.grossAmount, fa.currency, fa.invoiceType,
        fa.isCorrection, fa.corrected.length ? JSON.stringify(fa.corrected) : null, fa.correctionReason ?? null, JSON.stringify(fa.items)],
    );
  } catch (error) {
    await db.query('UPDATE invoices SET xml = $2, parse_error = $3 WHERE id = $1', [id, xml, (error as Error).message]);
  }
}

export async function syncKsef(db: Db, encryptionKey: Buffer, options: SyncOptions = {}): Promise<SyncResult> {
  const now = options.now ?? Date.now;
  const interactive = options.interactive ?? false;
  const lock = await db.connect();
  try {
    const { rows: [locked] } = await lock.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_ID]);
    if (!locked?.ok) return { status: 'skipped', message: 'Pobieranie faktur już trwa – odśwież stronę za chwilę.' };
    try {
      return await runSync(db, encryptionKey, options, now, interactive);
    } finally {
      await lock.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
    }
  } finally {
    lock.release();
  }
}

async function runSync(db: Db, key: Buffer, options: SyncOptions, now: () => number, interactive: boolean): Promise<SyncResult> {
  const { rows: [s] } = await db.query<{
    nip: string | null; ksef_env: KsefEnvironment; ksef_token_enc: string | null; ksef_sync_from: string | null;
    ksef_next_from: Date | null; ksef_last_attempt_at: Date | null;
  }>('SELECT nip, ksef_env, ksef_token_enc, ksef_sync_from, ksef_next_from, ksef_last_attempt_at FROM settings WHERE id = 1');
  if (!s?.nip || !s.ksef_token_enc || !s.ksef_sync_from) {
    return { status: 'skipped', message: 'Uzupełnij w ustawieniach NIP, token KSeF i datę, od której pobierać faktury.' };
  }
  if (interactive && s.ksef_last_attempt_at) {
    const waitMs = s.ksef_last_attempt_at.getTime() + MANUAL_SYNC_COOLDOWN_MINUTES * 60_000 - now();
    if (waitMs > 0) {
      return { status: 'skipped', message: `Ostatnie sprawdzenie było przed chwilą. Spróbuj za ${Math.ceil(waitMs / 60_000)} min (KSeF ogranicza liczbę zapytań).` };
    }
  }
  await db.query('UPDATE settings SET ksef_last_attempt_at = $1 WHERE id = 1', [new Date(now())]);

  try {
    const client = (options.createClient ?? defaultClient)(s.ksef_env, interactive);
    await client.authenticateWithToken(decryptSecret(s.ksef_token_enc, key), s.nip);

    // 1. Lista nowych faktur: przylegające okna od zapamiętanego znacznika kompletności.
    let from = s.ksef_next_from?.toISOString() ?? warsawMidnightIso(s.ksef_sync_from);
    let newInvoices = 0;
    for (let i = 0; i < (options.maxWindows ?? 5); i++) {
      const capped = Date.parse(from) + MAX_WINDOW_DAYS * DAY_MS;
      const to = capped < now() ? new Date(capped).toISOString() : undefined;
      const window = await client.queryMetadataWindow({ from, to });
      for (const inv of window.invoices) if (await saveMetadata(db, inv)) newInvoices++;
      // Punkt startowy zapisujemy po każdym oknie – przerwane pobieranie wznowi się bez luk.
      await db.query('UPDATE settings SET ksef_next_from = $1 WHERE id = 1', [window.nextFrom]);
      if (!window.truncated && !to) break;
      from = window.nextFrom;
    }

    // 2. Treść (XML) faktur, których jeszcze nie mamy.
    const { rows: missing } = await db.query<{ id: number; ksef_number: string }>(
      'SELECT id, ksef_number FROM invoices WHERE xml IS NULL ORDER BY id LIMIT $1', [options.maxXmlDownloads ?? 20],
    );
    let xmlDownloaded = 0;
    for (const inv of missing) {
      try {
        await saveInvoiceXml(db, inv.id, await client.getInvoiceXml(inv.ksef_number));
        xmlDownloaded++;
      } catch (error) {
        // Brak treści nie blokuje reszty: faktura jest już na liście, XML dociągniemy następnym razem.
        console.error(`KSeF: nie udało się pobrać XML ${inv.ksef_number}:`, (error as Error).message);
        break;
      }
    }
    const { rows: [pending] } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM invoices WHERE xml IS NULL');

    await db.query('UPDATE settings SET ksef_last_success_at = $1, ksef_last_error = NULL WHERE id = 1', [new Date(now())]);
    return { status: 'ok', newInvoices, xmlDownloaded, xmlPending: pending!.n };
  } catch (error) {
    if (!(error instanceof KsefError)) console.error('KSeF: błąd synchronizacji:', error);
    const message = describeError(error);
    await db.query('UPDATE settings SET ksef_last_error = $1 WHERE id = 1', [message]);
    return { status: 'error', message };
  }
}
