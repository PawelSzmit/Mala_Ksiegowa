// Pomocnik WYŁĄCZNIE do środowiska testowego KSeF: logowanie podpisem XAdES certyfikatem samopodpisanym.
// Aplikacja produkcyjna tego nie używa (tam Paweł tworzy token Profilem Zaufanym).
//
// Podpis jest składany ręcznie, bez bibliotek XML: dokument budujemy od razu w postaci kanonicznej
// (exc-c14n: bez zbędnych spacji, przestrzenie nazw zadeklarowane tam, gdzie są użyte), więc skróty
// liczymy po prostu z tych samych napisów, które trafiają do dokumentu.
import { createHash, createSign, randomInt, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { KsefSession, TokenWithExpiry } from '../../src/ksef/types.ts';

const DS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES = 'http://uri.etsi.org/01903/v1.3.2#';
const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';

export interface TestCertificate {
  certPem: string;
  keyPem: string;
  der: Buffer;
  issuerRfc2253: string;
  serialDecimal: string;
}

/** Losowy, poprawny NIP (z cyfrą kontrolną). Środowisko testowe jest wspólne, więc nie używamy prawdziwych NIP-ów. */
export function randomNip(): string {
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  for (;;) {
    const digits = [randomInt(1, 10), ...Array.from({ length: 8 }, () => randomInt(0, 10))];
    const check = digits.reduce((sum, d, i) => sum + d * weights[i]!, 0) % 11;
    if (check !== 10) return digits.join('') + check;
  }
}

/** Certyfikat samopodpisany „osoby fizycznej” z NIP-em w polu serialNumber (wzorzec TINPL-<NIP>). */
export function createTestCertificate(nip: string): TestCertificate {
  const dir = mkdtempSync(join(tmpdir(), 'ksef-cert-'));
  try {
    const key = join(dir, 'key.pem');
    const crt = join(dir, 'cert.pem');
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '30',
      '-keyout', key, '-out', crt,
      '-subj', `/GN=Jan/SN=Testowy/serialNumber=TINPL-${nip}/CN=Jan Testowy/C=PL`,
    ], { stdio: 'pipe' });
    const certPem = readFileSync(crt, 'utf8');
    const issuer = execFileSync('openssl', ['x509', '-in', crt, '-noout', '-issuer', '-nameopt', 'RFC2253'], { encoding: 'utf8' });
    const x509 = new X509Certificate(certPem);
    return {
      certPem,
      keyPem: readFileSync(key, 'utf8'),
      der: x509.raw,
      issuerRfc2253: issuer.replace(/^issuer=/, '').trim(),
      serialDecimal: BigInt(`0x${x509.serialNumber}`).toString(10),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const sha256b64 = (data: string | Buffer) => createHash('sha256').update(data).digest('base64');
const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');

/** Dokument AuthTokenRequest podpisany XAdES-BES (podpis otaczany, enveloped). */
export function signedAuthTokenRequest(challenge: string, nip: string, cert: TestCertificate): string {
  const ns = 'http://ksef.mf.gov.pl/auth/token/2.0';
  const body =
    `<Challenge>${challenge}</Challenge>` +
    `<ContextIdentifier><Nip>${nip}</Nip></ContextIdentifier>` +
    `<SubjectIdentifierType>certificateSubject</SubjectIdentifierType>`;
  // Postać kanoniczna dokumentu po usunięciu podpisu (transformata enveloped-signature + exc-c14n).
  const documentDigest = sha256b64(`<AuthTokenRequest xmlns="${ns}">${body}</AuthTokenRequest>`);

  const signedProperties =
    `<xades:SignedProperties xmlns:xades="${XADES}" Id="SignedProperties">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</xades:SigningTime>` +
    `<xades:SigningCertificate><xades:Cert>` +
    `<xades:CertDigest><ds:DigestMethod xmlns:ds="${DS}" Algorithm="${SHA256}"></ds:DigestMethod>` +
    `<ds:DigestValue xmlns:ds="${DS}">${sha256b64(cert.der)}</ds:DigestValue></xades:CertDigest>` +
    `<xades:IssuerSerial><ds:X509IssuerName xmlns:ds="${DS}">${escapeText(cert.issuerRfc2253)}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber xmlns:ds="${DS}">${cert.serialDecimal}</ds:X509SerialNumber></xades:IssuerSerial>` +
    `</xades:Cert></xades:SigningCertificate>` +
    `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties>`;

  const signedInfo =
    `<ds:SignedInfo xmlns:ds="${DS}">` +
    `<ds:CanonicalizationMethod Algorithm="${EXC_C14N}"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="${RSA_SHA256}"></ds:SignatureMethod>` +
    `<ds:Reference URI=""><ds:Transforms>` +
    `<ds:Transform Algorithm="${DS}enveloped-signature"></ds:Transform>` +
    `<ds:Transform Algorithm="${EXC_C14N}"></ds:Transform>` +
    `</ds:Transforms><ds:DigestMethod Algorithm="${SHA256}"></ds:DigestMethod>` +
    `<ds:DigestValue>${documentDigest}</ds:DigestValue></ds:Reference>` +
    `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#SignedProperties"><ds:Transforms>` +
    `<ds:Transform Algorithm="${EXC_C14N}"></ds:Transform>` +
    `</ds:Transforms><ds:DigestMethod Algorithm="${SHA256}"></ds:DigestMethod>` +
    `<ds:DigestValue>${sha256b64(signedProperties)}</ds:DigestValue></ds:Reference>` +
    `</ds:SignedInfo>`;

  const signatureValue = createSign('RSA-SHA256').update(signedInfo).sign(cert.keyPem, 'base64');

  const signature =
    `<ds:Signature xmlns:ds="${DS}" Id="Signature">` +
    signedInfo +
    `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
    `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${cert.der.toString('base64')}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` +
    `<ds:Object><xades:QualifyingProperties xmlns:xades="${XADES}" Target="#Signature">${signedProperties}</xades:QualifyingProperties></ds:Object>` +
    `</ds:Signature>`;

  return `<?xml version="1.0" encoding="utf-8"?><AuthTokenRequest xmlns="${ns}">${body}${signature}</AuthTokenRequest>`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Proste wywołanie API z czytelnym błędem. */
export async function call<T>(baseUrl: string, method: string, path: string, opts: { bearer?: string; json?: unknown; xml?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.bearer) headers.Authorization = `Bearer ${opts.bearer}`;
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.xml !== undefined) {
    headers['Content-Type'] = 'application/xml';
    body = opts.xml;
  }
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} → HTTP ${response.status}: ${text}`);
  return (text && (response.headers.get('content-type') ?? '').includes('json') ? JSON.parse(text) : text) as T;
}

/** Logowanie XAdES certyfikatem testowym w kontekście danego NIP-u. Zwraca tokeny dostępu. */
export async function loginWithTestCertificate(baseUrl: string, nip: string, cert: TestCertificate): Promise<KsefSession> {
  const { challenge } = await call<{ challenge: string }>(baseUrl, 'POST', '/auth/challenge');
  const init = await call<{ referenceNumber: string; authenticationToken: TokenWithExpiry }>(
    baseUrl, 'POST', '/auth/xades-signature?verifyCertificateChain=false',
    { xml: signedAuthTokenRequest(challenge, nip, cert) },
  );
  const temp = init.authenticationToken.token;
  for (let i = 0; i < 30; i++) {
    const st = await call<{ status: { code: number; description: string; details?: string[] } }>(
      baseUrl, 'GET', `/auth/${init.referenceNumber}`, { bearer: temp },
    );
    if (st.status.code === 200) return call<KsefSession>(baseUrl, 'POST', '/auth/token/redeem', { bearer: temp });
    if (st.status.code !== 100) throw new Error(`Logowanie XAdES odrzucone: ${JSON.stringify(st.status)}`);
    await sleep(1000);
  }
  throw new Error('Logowanie XAdES trwa zbyt długo');
}
