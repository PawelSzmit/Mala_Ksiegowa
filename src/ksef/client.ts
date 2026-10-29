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
  /** Ile razy czekać po odpowiedzi 429 (zbyt wiele żądań). */
  maxRateLimitRetries?: number;
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

  private session: KsefSession | null = null;
  private credentials: { ksefToken: string; nip: string } | null = null;

  constructor(options: KsefClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.pollAttempts = options.pollAttempts ?? 30;
    this.maxRateLimitRetries = options.maxRateLimitRetries ?? 3;
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
      const page = await this.authorized<{ hasMore?: boolean; invoices?: InvoiceMetadata[] }>(
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
      all.push(...(page.invoices ?? []));
      if (!page.hasMore) return all;
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

      if (response.status === 429 && attempt < this.maxRateLimitRetries) {
        const waitSeconds = Number(response.headers.get('Retry-After')) || 1;
        await sleep(waitSeconds * 1000);
        continue;
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
