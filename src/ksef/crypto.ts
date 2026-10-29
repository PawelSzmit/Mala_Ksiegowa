import { X509Certificate, constants, publicEncrypt } from 'node:crypto';

/**
 * Szyfruje "{token}|{timestampMs}" kluczem publicznym MF.
 * Wymóg KSeF 2.0: RSA-OAEP, SHA-256 (także w MGF1), wynik w Base64.
 */
export function encryptKsefToken(token: string, timestampMs: number, certificateDerBase64: string): string {
  const cert = new X509Certificate(Buffer.from(certificateDerBase64, 'base64'));
  const encrypted = publicEncrypt(
    { key: cert.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(`${token}|${timestampMs}`, 'utf8'),
  );
  return encrypted.toString('base64');
}
