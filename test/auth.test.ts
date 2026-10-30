import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { hashPassword, passwordProblem, verifyPassword } from '../src/auth/password.ts';
import { base32Decode, base32Encode, currentStep, totpCode, verifyTotp } from '../src/auth/totp.ts';
import { parseEncryptionKey } from '../src/config.ts';
import { decryptSecret, encryptSecret } from '../src/crypto/secret-box.ts';
import { html } from '../src/views/html.ts';

describe('kody z telefonu (TOTP)', () => {
  it('zgodne z wektorem testowym RFC 6238 (SHA-1, T=59 s)', () => {
    const secret = Buffer.from('12345678901234567890', 'ascii');
    assert.equal(totpCode(secret, currentStep(59_000), 8), '94287082');
    assert.equal(totpCode(secret, currentStep(1_111_111_109_000), 8), '07081804');
  });
  it('Base32 tam i z powrotem', () => {
    const data = randomBytes(20);
    assert.deepEqual(base32Decode(base32Encode(data)), data);
    assert.equal(base32Encode(Buffer.from('12345678901234567890')), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });
  it('przyjmuje kod z bieżącego i sąsiedniego okna, odrzuca starszy i ten sam drugi raz', () => {
    const secret = base32Encode(randomBytes(20));
    const now = 1_800_000_000_000;
    const step = currentStep(now);
    const code = (s: number) => totpCode(base32Decode(secret), s);
    assert.equal(verifyTotp(secret, code(step), 0, now), step);
    assert.equal(verifyTotp(secret, code(step - 1), 0, now), step - 1);
    assert.equal(verifyTotp(secret, code(step - 2), 0, now), null);
    assert.equal(verifyTotp(secret, code(step), step, now), null); // już użyty
    assert.equal(verifyTotp(secret, '12ab56', 0, now), null);
  });
});

describe('hasła', () => {
  it('weryfikuje poprawne hasło i odrzuca złe', async () => {
    const stored = await hashPassword('bardzo-tajne-haslo');
    assert.match(stored, /^scrypt\$/);
    assert.equal(await verifyPassword('bardzo-tajne-haslo', stored), true);
    assert.equal(await verifyPassword('bardzo-tajne-hasl0', stored), false);
    assert.equal(await verifyPassword('cokolwiek', 'zepsuty'), false);
  });
  it('wymaga co najmniej 12 znaków', () => {
    assert.ok(passwordProblem('krotkie'));
    assert.equal(passwordProblem('wystarczajaco-dlugie'), null);
  });
});

describe('szyfrowanie sekretów', () => {
  const key = randomBytes(32);
  it('szyfruje i odszyfrowuje; ta sama wartość daje za każdym razem inny szyfrogram', () => {
    const a = encryptSecret('token-ksef', key);
    assert.notEqual(a, encryptSecret('token-ksef', key));
    assert.ok(!a.includes('token-ksef'));
    assert.equal(decryptSecret(a, key), 'token-ksef');
  });
  it('wykrywa zmianę danych i zły klucz', () => {
    const sealed = encryptSecret('token-ksef', key);
    const parts = sealed.split(':');
    parts[3] = Buffer.from('podmiana').toString('base64');
    assert.throws(() => decryptSecret(parts.join(':'), key));
    assert.throws(() => decryptSecret(sealed, randomBytes(32)));
  });
  it('klucz musi mieć 32 bajty', () => {
    assert.throws(() => parseEncryptionKey(randomBytes(16).toString('base64')), /32 bajty/);
    assert.equal(parseEncryptionKey(key.toString('base64')).length, 32);
  });
});

describe('HTML', () => {
  it('escapuje wstawiane wartości', () => {
    assert.equal(html`<p>${'<script>"x"</script>'}</p>`.value, '<p>&lt;script&gt;&quot;x&quot;&lt;/script&gt;</p>');
    assert.equal(html`<p>${html`<b>ok</b>`}</p>`.value, '<p><b>ok</b></p>');
  });
});
