import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAmountInput, parseDateInput, parseNip, sniffFileType } from '../src/http/inputs.ts';
import { parseMultipart } from '../src/http/multipart.ts';

describe('pola formularzy', () => {
  it('kwota po polsku', () => {
    assert.equal(parseAmountInput('1 234,56', 'Kwota'), 123456);
    assert.equal(parseAmountInput('1234.5', 'Kwota'), 123450);
    assert.equal(parseAmountInput('99 zł', 'Kwota'), 9900);
    assert.throws(() => parseAmountInput('12,345', 'Kwota'), /Kwota: wpisz kwotę/);
    assert.throws(() => parseAmountInput('', 'Kwota'));
  });
  it('data musi istnieć w kalendarzu', () => {
    assert.equal(parseDateInput('2026-02-28', 'Data'), '2026-02-28');
    assert.throws(() => parseDateInput('2026-02-30', 'Data'), /poprawną datę/);
    assert.throws(() => parseDateInput('28.02.2026', 'Data'));
  });
  it('NIP z sumą kontrolną', () => {
    assert.equal(parseNip('526-025-02-74'), '5260250274');
    assert.throws(() => parseNip('5260250275'), /NIP/);
    assert.throws(() => parseNip('123'), /NIP/);
  });
  it('rodzaj pliku po zawartości, nie po nazwie', () => {
    assert.equal(sniffFileType(Buffer.from('%PDF-1.7 ...')), 'application/pdf');
    assert.equal(sniffFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'image/jpeg');
    assert.equal(sniffFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png');
    assert.equal(sniffFileType(Buffer.from('<html><script>alert(1)</script>')), null);
  });
  it('formularz z plikiem (multipart)', () => {
    const b = 'XyZ';
    const body = Buffer.concat([
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="amount"\r\n\r\n12,50\r\n`),
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="attachment"; filename="skan.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      Buffer.from('%PDF-1.4\r\n\r\nbinarne\r\n--nie-separator'),
      Buffer.from(`\r\n--${b}\r\nContent-Disposition: form-data; name="photo"; filename=""\r\n\r\n\r\n--${b}--\r\n`),
    ]);
    const form = parseMultipart(body, b);
    assert.equal(form.fields.get('amount'), '12,50');
    assert.equal(form.files.get('attachment')!.data.toString(), '%PDF-1.4\r\n\r\nbinarne\r\n--nie-separator');
    assert.equal(form.files.has('photo'), false, 'puste pole pliku = brak pliku');
  });
});
