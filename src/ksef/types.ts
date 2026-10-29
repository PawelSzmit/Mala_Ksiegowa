export type KsefEnvironment = 'test' | 'demo' | 'prod';

export const KSEF_BASE_URLS: Record<KsefEnvironment, string> = {
  test: 'https://api-test.ksef.mf.gov.pl/v2',
  demo: 'https://api-demo.ksef.mf.gov.pl/v2',
  prod: 'https://api.ksef.mf.gov.pl/v2',
};

export interface AuthChallenge {
  challenge: string;
  timestampMs: number;
}

export interface PublicKeyCertificate {
  certificate: string; // DER w Base64
  validFrom: string;
  validTo: string;
  usage: string[];
}

export interface TokenWithExpiry {
  token: string;
  validUntil: string;
}

export interface KsefSession {
  accessToken: TokenWithExpiry;
  refreshToken: TokenWithExpiry;
}

/** Podmiot faktury, jak w odpowiedzi /invoices/query/metadata. */
export interface InvoiceParty {
  nip?: string;
  name?: string;
}

export interface InvoiceMetadata {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  invoicingDate?: string;
  permanentStorageDate?: string;
  seller?: InvoiceParty;
  buyer?: InvoiceParty;
  netAmount?: number;
  grossAmount?: number;
  vatAmount?: number;
  currency?: string;
}

export interface InvoiceQueryOptions {
  /** Subject1 = sprzedawca, Subject2 = nabywca (nas interesują faktury kosztowe). */
  subjectType?: 'Subject1' | 'Subject2' | 'Subject3' | 'SubjectAuthorized';
  dateType?: 'Issue' | 'Invoicing' | 'PermanentStorage';
  from: Date;
  to?: Date;
  pageSize?: number;
}

export class KsefError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'KsefError';
    this.status = status;
    this.details = details;
  }
}
