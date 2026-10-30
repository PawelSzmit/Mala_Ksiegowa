import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { decimalToGrosze, parseFaInvoice } from '../src/ksef/parse-fa.ts';
import { parseXml, textOf } from '../src/ksef/xml.ts';

// Szablon faktury FA(3) z oficjalnego klienta MF (ten sam, który przyjął testowy KSeF w etapie 1).
const fixture = readFileSync(new URL('../scripts/fixtures/fa3-test-invoice.xml', import.meta.url), 'utf8')
  .replace('#seller_nip#', '5260250274').replace('#buyer_nip#', '1234563218')
  .replace('#issue_date#', '2026-10-05').replace('#invoice_number#', '123').replace('#created#', '2026-10-05T10:00:00Z');

// Faktura korygująca wg schematu FA(3): różnice w P_15, dane faktury korygowanej, wiersze „stan przed”.
const correction = `<?xml version="1.0" encoding="UTF-8"?>
<tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <tns:Podmiot1><tns:DaneIdentyfikacyjne><tns:NIP>5260250274</tns:NIP><tns:Nazwa>Hurtownia &quot;Ala&quot; &amp; S-ka</tns:Nazwa></tns:DaneIdentyfikacyjne></tns:Podmiot1>
  <tns:Fa>
    <tns:KodWaluty>PLN</tns:KodWaluty>
    <tns:P_1>2026-10-12</tns:P_1>
    <tns:P_2>KOR/7/2026</tns:P_2>
    <tns:P_15>-24.60</tns:P_15>
    <tns:RodzajFaktury>KOR</tns:RodzajFaktury>
    <tns:PrzyczynaKorekty>Zwrot towaru</tns:PrzyczynaKorekty>
    <tns:DaneFaKorygowanej>
      <tns:DataWystFaKorygowanej>2026-10-01</tns:DataWystFaKorygowanej>
      <tns:NrFaKorygowanej>FV/100/2026</tns:NrFaKorygowanej>
      <tns:NrKSeF>1</tns:NrKSeF>
      <tns:NrKSeFFaKorygowanej>5260250274-20261001-ABCDEF-12</tns:NrKSeFFaKorygowanej>
    </tns:DaneFaKorygowanej>
    <tns:FaWiersz><tns:NrWierszaFa>1</tns:NrWierszaFa><tns:P_7>Papier A4</tns:P_7><tns:P_8B>2</tns:P_8B><tns:P_11A>49.20</tns:P_11A><tns:StanPrzed>1</tns:StanPrzed></tns:FaWiersz>
    <tns:FaWiersz><tns:NrWierszaFa>2</tns:NrWierszaFa><tns:P_7>Papier A4</tns:P_7><tns:P_8B>1</tns:P_8B><tns:P_11A>24.60</tns:P_11A></tns:FaWiersz>
  </tns:Fa>
</tns:Faktura>`;

describe('odczyt faktury FA(3)', () => {
  it('czyta dostawcę, numer, datę, kwotę brutto i wszystkie pozycje', () => {
    const fa = parseFaInvoice(fixture);
    assert.equal(fa.invoiceNumber, 'FA/GRQMB-123/05/2025');
    assert.equal(fa.issueDate, '2026-10-05');
    assert.equal(fa.sellerNip, '5260250274');
    assert.equal(fa.sellerName, 'Elektrownia S.A.');
    assert.equal(fa.grossAmount, 5363);
    assert.equal(fa.currency, 'PLN');
    assert.equal(fa.isCorrection, false);
    assert.deepEqual(fa.items.map((i) => [i.name, i.quantity, i.unit, i.net]), [
      ['Razem za energię czynną', '20.00', 'kWh', 1800],
      ['Razem za usługi dystrybucji', '1.00', 'okres', 2560],
    ]);
  });

  it('faktura korygująca: ujemna różnica, faktura korygowana, powód, wiersze „przed korektą”, prefiksy i encje', () => {
    const fa = parseFaInvoice(correction);
    assert.equal(fa.isCorrection, true);
    assert.equal(fa.grossAmount, -2460);
    assert.equal(fa.sellerName, 'Hurtownia "Ala" & S-ka');
    assert.equal(fa.correctionReason, 'Zwrot towaru');
    assert.deepEqual(fa.corrected, [{ invoiceNumber: 'FV/100/2026', issueDate: '2026-10-01', ksefNumber: '5260250274-20261001-ABCDEF-12' }]);
    assert.deepEqual(fa.items.map((i) => [i.gross, i.before ?? false]), [[4920, true], [2460, false]]);
  });

  it('odrzuca dokument, który nie jest fakturą, i faktury bez kwoty', () => {
    assert.throws(() => parseFaInvoice('<Inny/>'), /nie jest faktura/);
    assert.throws(() => parseFaInvoice('<Faktura><Fa><P_1>2026-01-01</P_1><P_2>X</P_2></Fa></Faktura>'), /P_15/);
  });

  it('nie przepuszcza uszkodzonego XML', () => {
    assert.throws(() => parseXml('<a><b></a>'), /Niepoprawny XML/);
    assert.throws(() => parseXml('<a>'), /niezamknięty/);
    assert.throws(() => parseXml('<a><<b/></a>'), /Niepoprawny XML/);
    assert.equal(textOf(parseXml('<a><!-- x --><![CDATA[1 < 2]]></a>'), 'a'), '1 < 2');
  });
});

describe('kwoty z XML na grosze (bez liczb zmiennoprzecinkowych)', () => {
  it('zamienia typowe zapisy', () => {
    assert.equal(decimalToGrosze('53.63'), 5363);
    assert.equal(decimalToGrosze('0.1'), 10);
    assert.equal(decimalToGrosze('12'), 1200);
    assert.equal(decimalToGrosze('-12.5'), -1250);
    assert.equal(decimalToGrosze('1,99'), 199);
  });
  it('więcej miejsc po przecinku: zaokrąglenie od połowy w górę', () => {
    assert.equal(decimalToGrosze('0.105'), 11);
    assert.equal(decimalToGrosze('0.10499'), 10);
    assert.equal(decimalToGrosze('-0.004'), 0);
  });
  it('odrzuca śmieci', () => {
    assert.throws(() => decimalToGrosze('12 zł'));
    assert.throws(() => decimalToGrosze(''));
  });
});
