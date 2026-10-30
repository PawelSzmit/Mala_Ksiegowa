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

/** Kształt pól potwierdzony na testowym KSeF 2026-10-29 (scripts/ksef-spike.ts). */
export interface InvoiceSeller {
  nip: string;
  name?: string;
}

export interface InvoiceBuyer {
  identifier: { type: string; value?: string }; // type: Nip, VatUe, Other, None
  name?: string;
}

export interface InvoiceMetadata {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  invoicingDate: string;
  acquisitionDate: string;
  permanentStorageDate: string;
  seller: InvoiceSeller;
  buyer: InvoiceBuyer;
  /** Kwoty w złotych jako liczby dziesiętne (np. 53.63) – do bazy zamieniamy na grosze. */
  netAmount: number;
  grossAmount: number;
  vatAmount: number;
  currency: string;
  invoiceType?: string; // np. Vat, Kor, Zal
  invoiceHash?: string;
}

export interface InvoiceQueryOptions {
  /** Subject1 = sprzedawca, Subject2 = nabywca (nas interesują faktury kosztowe). */
  subjectType?: 'Subject1' | 'Subject2' | 'Subject3' | 'SubjectAuthorized';
  dateType?: 'Issue' | 'Invoicing' | 'PermanentStorage';
  from: Date;
  to?: Date;
  /** Rozmiar strony: KSeF przyjmuje 10–250. */
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
