import { encryptKsefToken } from './crypto.ts';
import {
  KsefError,
  type AuthChallenge,
  type InvoiceMetadata,
  type InvoiceQueryOptions,
  type KsefSession,
  type PublicKeyCertificate,
  type TokenWithExpiry,
} from './types.ts';

export interface KsefClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Odstęp między sprawdzaniem statusu logowania (ms). */
  pollIntervalMs?: number;
  /** Ile razy sprawdzać status logowania, zanim się poddamy. */
  pollAttempts?: number;
  /** Ile razy czekać po odpowiedzi 429 (zbyt wiele żądań). 0 = od razu błąd (przycisk „sprawdź teraz”). */
  maxRateLimitRetries?: number;
  /** Najdłuższe czekanie po 429 (s). Gdy KSeF każe czekać dłużej, zgłaszamy błąd zamiast wisieć. */
  maxRetryWaitSeconds?: number;
}

/** Wynik jednego okna przyrostowego pobierania (wg „przyrostowe pobieranie faktur” MF). */
export interface MetadataWindow {
  invoices: InvoiceMetadata[];
  /** Od tej chwili zaczyna się następne okno: HWM, `to` albo – przy ucięciu – data ostatniej faktury. */
  nextFrom: string;
  /** true, gdy KSeF uciął wynik (limit 10 000) – trzeba od razu pobrać kolejne okno. */
  truncated: boolean;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Cienki klient KSeF 2.0. Loguje się tokenem KSeF i czyta faktury.
 * Nic nie wystawia ani nie zmienia w KSeF.
 */
export class KsefClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly pollAttempts: number;
  private readonly maxRateLimitRetries: number;
  private readonly maxRetryWaitSeconds: number;

  private session: KsefSession | null = null;
  private credentials: { ksefToken: string; nip: string } | null = null;

  constructor(options: KsefClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.pollAttempts = options.pollAttempts ?? 30;
    this.maxRateLimitRetries = options.maxRateLimitRetries ?? 3;
    this.maxRetryWaitSeconds = options.maxRetryWaitSeconds ?? 10;
  }

  // --- logowanie -----------------------------------------------------------

  async getChallenge(): Promise<AuthChallenge> {
    const body = await this.request<{ challenge: string; timestamp?: string; timestampMs?: number }>('POST', '/auth/challenge');
    const timestampMs = body.timestampMs ?? (body.timestamp ? Date.parse(body.timestamp) : NaN);
    if (!body.challenge || !Number.isFinite(timestampMs)) {
      throw new KsefError('KSeF zwrócił niepełną odpowiedź na /auth/challenge', 502, { fields: Object.keys(body) });
    }
    return { challenge: body.challenge, timestampMs };
  }

  async getPublicKeyCertificates(): Promise<PublicKeyCertificate[]> {
    return this.request<PublicKeyCertificate[]>('GET', '/security/public-key-certificates');
  }

  /** Pełne logowanie tokenem KSeF: wyzwanie, szyfrowanie, status, odbiór tokenów dostępu. */
  async authenticateWithToken(ksefToken: string, nip: string): Promise<KsefSession> {
    this.credentials = { ksefToken, nip };

    const challenge = await this.getChallenge();
    const certs = await this.getPublicKeyCertificates();
    const now = Date.now();
    const cert = certs.find(
      (c) => c.usage?.includes('KsefTokenEncryption') && Date.parse(c.validFrom) <= now && now <= Date.parse(c.validTo),
    );
    if (!cert) throw new KsefError('KSeF nie opublikował ważnego klucza do szyfrowania tokenu', 502);

    const submitted = await this.request<{ referenceNumber: string; authenticationToken: TokenWithExpiry }>(
      'POST',
      '/auth/ksef-token',
      {
        body: {
          challenge: challenge.challenge,
          contextIdentifier: { type: 'Nip', value: nip },
          encryptedToken: encryptKsefToken(ksefToken, challenge.timestampMs, cert.certificate),
        },
      },
    );
    const temporaryToken = submitted.authenticationToken.token;

    await this.waitForAuthentication(submitted.referenceNumber, temporaryToken);

    this.session = await this.request<KsefSession>('POST', '/auth/token/redeem', { bearer: temporaryToken });
    return this.session;
  }

  private async waitForAuthentication(referenceNumber: string, temporaryToken: string): Promise<void> {
    for (let attempt = 0; attempt < this.pollAttempts; attempt++) {
      const status = await this.request<{ status: { code: number; description?: string; details?: string[] } }>(
        'GET',
        `/auth/${encodeURIComponent(referenceNumber)}`,
        { bearer: temporaryToken },
      );
      const code = status.status.code;
      if (code === 200) return;
      if (code !== 100) {
        throw new KsefError(`Logowanie do KSeF odrzucone: ${status.status.description ?? 'brak opisu'} (kod ${code})`, 401, status.status);
      }
      await sleep(this.pollIntervalMs);
    }
    throw new KsefError('Logowanie do KSeF trwa zbyt długo', 504);
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.session) throw new KsefError('Brak sesji KSeF do odświeżenia', 401);
    try {
      const refreshed = await this.request<{ accessToken: TokenWithExpiry }>('POST', '/auth/token/refresh', {
        bearer: this.session.refreshToken.token,
      });
      this.session = { ...this.session, accessToken: refreshed.accessToken };
    } catch (error) {
      // Token odświeżający wygasł (do 7 dni) – logujemy się od nowa.
      if (error instanceof KsefError && error.status === 401 && this.credentials) {
        await this.authenticateWithToken(this.credentials.ksefToken, this.credentials.nip);
        return;
      }
      throw error;
    }
  }

  // --- faktury -------------------------------------------------------------

  /** Metadane wszystkich faktur z zakresu, strona po stronie. Domyślnie: faktury, na których firma jest nabywcą. */
  async queryInvoiceMetadata(options: InvoiceQueryOptions): Promise<InvoiceMetadata[]> {
    const pageSize = options.pageSize ?? 100;
    const all: InvoiceMetadata[] = [];

    for (let pageOffset = 0; ; pageOffset += 1) {
      const page = await this.authorized<{ hasMore?: boolean; isTruncated?: boolean; invoices?: InvoiceMetadata[] }>(
        'POST',
        `/invoices/query/metadata?sortOrder=Asc&pageOffset=${pageOffset}&pageSize=${pageSize}`,
        {
          subjectType: options.subjectType ?? 'Subject2',
          dateRange: {
            dateType: options.dateType ?? 'PermanentStorage',
            from: options.from.toISOString(),
            ...(options.to ? { to: options.to.toISOString() } : {}),
          },
        },
      );
      // isTruncated: KSeF uciął wynik (limit liczby faktur na jedno zapytanie) – trzeba zawęzić zakres dat.
      if (page.isTruncated) throw new KsefError('Za dużo faktur w jednym zapytaniu – zawęź zakres dat', 422);
      all.push(...(page.invoices ?? []));
      if (!page.hasMore) return all;
    }
  }

  /**
   * Jedno okno pobierania przyrostowego: faktury trwale zapisane od `from` (po dacie PermanentStorage),
   * ograniczone do znacznika kompletności (HWM), strona po stronie. Gdy KSeF utnie wynik, zwraca to, co dostał,
   * i `truncated = true` – następne okno zaczyna się od daty ostatniej faktury (duplikaty odcina baza).
   */
  async queryMetadataWindow(options: { from: string; to?: string; pageSize?: number; subjectType?: InvoiceQueryOptions['subjectType'] }): Promise<MetadataWindow> {
    const pageSize = options.pageSize ?? 100;
    const invoices: InvoiceMetadata[] = [];
    for (let pageOffset = 0; ; pageOffset += 1) {
      const page = await this.authorized<{ hasMore?: boolean; isTruncated?: boolean; permanentStorageHwmDate?: string | null; invoices?: InvoiceMetadata[] }>(
        'POST',
        `/invoices/query/metadata?sortOrder=Asc&pageOffset=${pageOffset}&pageSize=${pageSize}`,
        {
          subjectType: options.subjectType ?? 'Subject2',
          dateRange: {
            dateType: 'PermanentStorage',
            from: options.from,
            ...(options.to ? { to: options.to } : {}),
            restrictToPermanentStorageHwmDate: true,
          },
        },
      );
      invoices.push(...(page.invoices ?? []));
      if (page.isTruncated && page.hasMore) {
        const last = invoices[invoices.length - 1];
        if (!last) throw new KsefError('KSeF uciął pusty wynik – nieoczekiwana odpowiedź', 502, page);
        return { invoices, nextFrom: last.permanentStorageDate, truncated: true };
      }
      if (!page.hasMore) {
        const hwm = page.permanentStorageHwmDate ?? undefined;
        // Koniec okna: wcześniejsza z dat `to` i HWM (przy restrictToPermanentStorageHwmDate KSeF nie wyjdzie poza HWM).
        const end = options.to && hwm ? (Date.parse(options.to) < Date.parse(hwm) ? options.to : hwm) : (hwm ?? options.to);
        if (!end) throw new KsefError('KSeF nie zwrócił znacznika kompletności (permanentStorageHwmDate)', 502, page);
        return { invoices, nextFrom: end, truncated: false };
      }
    }
  }

  /** Surowy XML faktury (format FA(3)) po numerze KSeF. */
  async getInvoiceXml(ksefNumber: string): Promise<string> {
    return this.authorized<string>('GET', `/invoices/ksef/${encodeURIComponent(ksefNumber)}`);
  }

  // --- wspólne -------------------------------------------------------------

  /** Wywołanie z tokenem dostępu; po 401 odświeża token i próbuje jeszcze raz. */
  private async authorized<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.session) throw new KsefError('Najpierw zaloguj się do KSeF', 401);
    try {
      return await this.request<T>(method, path, { body, bearer: this.session.accessToken.token });
    } catch (error) {
      if (!(error instanceof KsefError) || error.status !== 401) throw error;
      await this.refreshAccessToken();
      return this.request<T>(method, path, { body, bearer: this.session.accessToken.token });
    }
  }

  private async request<T>(method: string, path: string, init: { body?: unknown; bearer?: string } = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json, application/xml',
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(init.bearer ? { Authorization: `Bearer ${init.bearer}` } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });

      if (response.status === 429) {
        const waitSeconds = Number(response.headers.get('Retry-After')) || 1;
        if (attempt < this.maxRateLimitRetries && waitSeconds <= this.maxRetryWaitSeconds) {
          await sleep(waitSeconds * 1000);
          continue;
        }
        throw new KsefError(`KSeF prosi o przerwę (zbyt wiele zapytań), spróbuj za ${Math.ceil(waitSeconds / 60)} min`, 429, { retryAfterSeconds: waitSeconds });
      }

      const text = await response.text();
      if (!response.ok) {
        let details: unknown = text;
        try {
          details = JSON.parse(text);
        } catch {
          /* odpowiedź nie jest JSON-em – zostaje tekst */
        }
        throw new KsefError(`KSeF ${method} ${path.split('?')[0]} → HTTP ${response.status}`, response.status, details);
      }

      const contentType = response.headers.get('content-type') ?? '';
      return (contentType.includes('json') ? JSON.parse(text) : text) as T;
    }
  }
}
