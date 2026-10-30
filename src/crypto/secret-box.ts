import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Szyfrowanie sekretów w bazie (token KSeF, sekret TOTP): AES-256-GCM, format "v1:iv:tag:dane" (Base64).
// Wyciek samej bazy nie ujawnia sekretów – klucz jest tylko w zmiennej środowiskowej.

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(sealed: string, key: Buffer): string {
  const [version, iv, tag, data] = sealed.split(':');
  if (version !== 'v1' || !iv || !tag || data === undefined) throw new Error('Nieznany format zaszyfrowanej wartości');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
