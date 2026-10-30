// Etap 6 przez HTTP: zamknięcie miesiąca, kwoty ZUS i PIT, plik DRA, ponowne otwarcie, dane płatnika (+ poprawki z review 6). Wymaga TEST_DATABASE_URL.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { createSession, SESSION_COOKIE } from '../src/auth/sessions.ts';
import type { Db } from '../src/db/pool.ts';
import { draSchemaErrors, draValue } from './helpers/dra-schema.ts';
import { freshTestDb, skipWithoutDb } from './helpers/test-db.ts';

const PESEL = '44051401359';

describe('zamknięcie miesiąca, ZUS i PIT', { skip: skipWithoutDb }, () => {
  let db: Db;
  let server: Server;
  let base = '';
  let cookie = '';
  let nowMs = 0;

  const get = (path: string) => fetch(base + path, { headers: { Cookie: cookie }, redirect: 'manual' });
  const post = (path: string, form: Record<string, string> = {}) =>
    fetch(base + path, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
  const postFile = (path: string, fields: Record<string, string>) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return fetch(base + path, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie }, body: form });
  };
  const cash = (year: number, month: number, amount: string) =>
    postFile(`/kasa/${year}/${String(month).padStart(2, '0')}`, { report_date: `${year}-${String(month).padStart(2, '0')}-28`, amount });
  const cost = (date: string, amount: string) =>
    postFile('/koszty', { cost_date: date, document_number: `R/${amount}`, counterparty: 'Sklep', counterparty_address: 'ul. Długa 1, Kraków', description: 'Toner', amount });
  const monthStatus = async (year: number, month: number) =>
    (await db.query('SELECT status FROM months WHERE year = $1 AND month = $2', [year, month])).rows[0]?.status ?? 'open';
  const addInvoice = async (issueDate: string, receivedAt: string) => {
    const { rows } = await db.query(
      `INSERT INTO invoices (ksef_number, invoice_number, seller_nip, seller_name, issue_date, gross_amount, xml, permanent_storage_date)
       VALUES ($1, 'FV/OKT', '5260250274', 'Hurtownia', $2, 24600, '<Faktura/>', $3) RETURNING id`,
      [`K-${Math.random()}`, issueDate, receivedAt],
    );
    return rows[0].id as number;
  };

  before(async () => {
    db = await freshTestDb();
    server = createServer(createApp({ db, encryptionKey: randomBytes(32), cookieSecure: false, now: () => nowMs }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const { rows } = await db.query("INSERT INTO users (username, password_hash, totp_secret_enc) VALUES ('pawel', 'x', 'x') RETURNING id");
    cookie = `${SESSION_COOKIE}=${await createSession(db, rows[0].id)}`;
  });
  after(async () => {
    server.close();
    await db.end();
  });
  beforeEach(async () => {
    nowMs = Date.parse('2026-11-05T10:00:00Z');
    await db.query('TRUNCATE invoices, manual_costs, cash_reports, kpir_entries, months, years');
    await db.query("UPDATE settings SET nip = '5260250274', pesel = $1, first_name = 'Paweł', last_name = 'Kowalski', regon = NULL, short_name = NULL", [PESEL]);
    // KSeF ustawiony i „świeży” (data w przyszłości = zawsze mniej niż 2 dni temu); scenariusze KSeF ustawiają to same.
    await db.query("UPDATE settings SET ksef_token_enc = 'x', ksef_sync_from = '2026-01-01', ksef_last_success_at = '2100-01-01', ksef_last_error = NULL");
  });

  it('podgląd: kwoty ZUS i PIT z terminami; przeszkody: brak raportu z kasy, faktura do decyzji, miesiąc w trakcie', async () => {
    let page = await (await get('/miesiac/2026/10/zamkniecie')).text();
    assert.match(page, /Wpisz raport z kasy/);
    assert.match(page, /Brak zapisów za: styczeń, luty, marzec, kwiecień, maj, czerwiec, lipiec, sierpień, wrzesień/);
    assert.match(page, /<button type="submit" disabled>Zamknij miesiąc/);

    await cash(2026, 10, '10 000');
    await cost('2026-10-07', '500');
    const inv = await addInvoice('2026-10-28', '2026-11-03T09:00:00+01:00');
    page = await (await get('/miesiac/2026/10/zamkniecie')).text();
    assert.match(page, /czekają na decyzję: 1/);
    // Bieżący listopad (5. dzień): ostrzeżenie o fakturze za październik przed zapłatą ZUS 10.
    assert.match(await (await get('/miesiac/2026/11')).text(), /Faktury za październik czekają na decyzję: 1/);
    await post(`/faktury/${inv}/decyzja`, { decision: 'not_cost' });

    page = await (await get('/miesiac/2026/10/zamkniecie')).text();
    assert.doesNotMatch(page, /Zanim zamkniesz/);
    // Bez chorobowego: 1103,27 + 452,16 + 94,39 = 1649,82; FP 138,47; zdrowotna od dochodu z września (0) → minimum 432,54.
    assert.match(page, /Składka zdrowotna<br><span class="muted">minimalna/);
    assert.match(page, /ZUS razem<\/strong> – zapłać do 10\.11\.2026[\s\S]*2 220,83 zł/);
    assert.match(page, /Zaliczka na PIT<\/strong> – zapłać do 20\.11\.2026[\s\S]*0,00 zł/);
    assert.doesNotMatch(page, /Składka chorobowa/);

    // Listopad jeszcze trwa.
    await cash(2026, 11, '100');
    const nov = await post('/miesiac/2026/11/zamknij');
    assert.equal(nov.status, 409);
    assert.match(await nov.text(), /Miesiąc jeszcze trwa/);
  });

  it('zamknięcie: Fundusz Pracy w księdze (kol. 15), zapisane kwoty, blokada zmian, plik DRA zgodny ze schematem', async () => {
    await cash(2026, 10, '10 000');
    const res = await post('/miesiac/2026/10/zamknij');
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/miesiac/2026/10');
    assert.equal(await monthStatus(2026, 10), 'closed');

    const fp = (await db.query("SELECT entry_date, other_costs, description, counterparty_address FROM kpir_entries WHERE source = 'fp'")).rows;
    assert.deepEqual(fp.map((r) => [r.entry_date, r.other_costs]), [['2026-10-10', 13847]]);
    assert.match(fp[0].description, /Fundusz Pracy i Fundusz Solidarnościowy za wrzesień 2026/);
    assert.match(await (await get('/ksiega/2026/10')).text(), /Fundusz Pracy[\s\S]*138,47/);

    const month = await (await get('/miesiac/2026/10')).text();
    assert.match(month, /Zamknięty/);
    assert.match(month, /Pobierz plik DRA/);
    assert.match(month, /2 220,83 zł/);
    assert.equal((await cash(2026, 10, '1')).status, 409);
    assert.equal((await post('/miesiac/2026/10/zamknij')).status, 409);

    const dra = await get('/miesiac/2026/10/dra.xml');
    assert.equal(dra.headers.get('content-disposition'), 'attachment; filename="ZUS-2026-10.xml"');
    const xml = await dra.text();
    assert.deepEqual(draSchemaErrors(xml), []);
    assert.deepEqual(
      ['II/p1', 'II/p3', 'II/p7', 'I/p2/p2', 'IV/p37', 'VI/p7', 'VII/p1', 'IX/p2', 'XI/p2', 'XI/p3', 'XIII/p1'].map((p) => draValue(xml, `ZUSDRA/${p}`)),
      ['5260250274', PESEL, 'KOWALSKI', '2026-10', '1649.82', '432.54', '138.47', '2220.83', '0.00', '4806.00', '2026-11-05'],
    );
  });

  it('kolejność: listopada nie zamkniesz przed październikiem; października nie otworzysz, gdy listopad jest zamknięty', async () => {
    nowMs = Date.parse('2026-12-03T10:00:00Z');
    await cash(2026, 10, '10 000');
    await cash(2026, 11, '12 000');
    const early = await post('/miesiac/2026/11/zamknij');
    assert.equal(early.status, 409);
    assert.match(await early.text(), /Najpierw zamknij październik/);
    assert.equal((await post('/miesiac/2026/10/zamknij')).status, 303);
    assert.equal((await post('/miesiac/2026/11/zamknij')).status, 303);

    const blocked = await post('/miesiac/2026/10/otworz', { confirm: 'tak' });
    assert.equal(blocked.status, 409);
    assert.match(await blocked.text(), /Najpierw otwórz listopad 2026/);
    assert.equal((await post('/miesiac/2026/11/otworz')).status, 400, 'bez potwierdzenia');
    assert.equal((await post('/miesiac/2026/11/otworz', { confirm: 'tak' })).status, 303);
    assert.equal(await monthStatus(2026, 11), 'open');
  });

  it('ponowne otwarcie i poprawka: porównanie kwot, ponowne zamknięcie bez dublowania Funduszu Pracy', async () => {
    nowMs = Date.parse('2026-12-03T10:00:00Z');
    await cash(2026, 10, '10 000');
    await cash(2026, 11, '40 000');
    await post('/miesiac/2026/10/zamknij');
    await post('/miesiac/2026/11/zamknij');
    const before = (await db.query('SELECT results FROM months WHERE year = 2026 AND month = 11')).rows[0].results;

    await post('/miesiac/2026/11/otworz', { confirm: 'tak' });
    await cost('2026-11-15', '3 000');
    const page = await (await get('/miesiac/2026/11/zamkniecie')).text();
    assert.match(page, /Kwoty zmieniły się od poprzedniego zamknięcia/);
    assert.equal((await post('/miesiac/2026/11/zamknij')).status, 303);
    const afterRes = (await db.query('SELECT results FROM months WHERE year = 2026 AND month = 11')).rows[0].results;
    assert.ok(afterRes.result.pitAdvance < before.result.pitAdvance, 'koszt obniża zaliczkę PIT');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM kpir_entries WHERE source = 'fp'")).rows[0].n, 2, 'po jednym FP na październik i listopad');
  });

  it('faktura do 9. dnia za zamknięty miesiąc: karta mówi, że trzeba otworzyć miesiąc, z linkiem', async () => {
    await cash(2026, 10, '10 000');
    await post('/miesiac/2026/10/zamknij');
    const id = await addInvoice('2026-10-30', '2026-11-04T09:00:00+01:00');
    const list = await (await get('/faktury')).text();
    assert.match(list, /ten miesiąc jest już zamknięty[\s\S]*<a href="\/miesiac\/2026\/10">otwórz październik 2026 ponownie<\/a>/);
    assert.equal((await post(`/faktury/${id}/decyzja`, { decision: 'cost' })).status, 409);
  });

  it('styczeń: dochód z grudnia poprzedniego roku wpisany ręcznie jest podstawą zdrowotnej', async () => {
    nowMs = Date.parse('2027-02-04T10:00:00Z');
    await cash(2027, 1, '9 000');
    let page = await (await get('/miesiac/2027/01/zamkniecie')).text();
    assert.match(page, /Dochód z grudnia 2026/);
    assert.equal((await post('/miesiac/2027/01/grudzien', { income: '10 000' })).status, 303);
    page = await (await get('/miesiac/2027/01/zamkniecie')).text();
    assert.doesNotMatch(page, /Dochód z grudnia 2026 \(zł\)/);
    assert.match(page, /9% dochodu z poprzedniego miesiąca \(10 000,00 zł\)[\s\S]*900,00 zł/);
  });

  it('bez danych płatnika nie da się zamknąć; ustawienia sprawdzają PESEL i zapisują dane', async () => {
    await db.query('UPDATE settings SET pesel = NULL, first_name = NULL');
    await cash(2026, 10, '1 000');
    assert.match(await (await get('/miesiac/2026/10/zamkniecie')).text(), /dane do deklaracji ZUS: PESEL, imię/);

    const bad = await post('/ustawienia/dane', { first_name: 'Paweł', last_name: 'Kowalski', pesel: '44051401358', regon: '', short_name: '' });
    assert.equal(bad.status, 400);
    assert.match(await bad.text(), /PESEL: wpisz poprawny/);
    const ok = await post('/ustawienia/dane', { first_name: 'Paweł', last_name: 'Kowalski', pesel: PESEL, regon: '123-456-785', short_name: 'Gabinet' });
    assert.equal(ok.status, 200);
    const s = (await db.query('SELECT first_name, pesel, regon, short_name FROM settings')).rows[0];
    assert.deepEqual(s, { first_name: 'Paweł', pesel: PESEL, regon: '123456785', short_name: 'Gabinet' });
    assert.equal((await post('/miesiac/2026/10/zamknij')).status, 303);
  });

  it('koszt spoza KSeF: NIP z kodem kraju albo adres – trafiają do kol. 5 i 7 księgi', async () => {
    assert.equal((await postFile('/koszty', { cost_date: '2026-10-07', document_number: 'A/1', counterparty: 'Sklep', description: 'Toner', amount: '5' })).status, 400);
    await postFile('/koszty', { cost_date: '2026-10-07', document_number: 'A/2', counterparty: 'Google Ireland', counterparty_tax_id: 'ie 6388047v', description: 'Abonament', amount: '50' });
    await postFile('/koszty', { cost_date: '2026-10-08', document_number: 'A/3', counterparty: 'Sklep', counterparty_tax_id: '5260250274', description: 'Toner', amount: '5' });
    await cost('2026-10-09', '7');
    const rows = (await db.query("SELECT counterparty_tax_id, counterparty_address FROM kpir_entries WHERE source = 'manual_cost' ORDER BY entry_date")).rows;
    assert.deepEqual(rows.map((r) => [r.counterparty_tax_id, r.counterparty_address]), [['IE6388047V', null], ['PL5260250274', null], [null, 'ul. Długa 1, Kraków']]);
    assert.match(await (await get('/ksiega/2026/10')).text(), /<td><\/td><td>Sklep<\/td><td>ul. Długa 1, Kraków<\/td>/);
  });
  it('stawki roku to prognoza (2027): zamknięcie zablokowane z jasnym komunikatem', async () => {
    nowMs = Date.parse('2027-02-04T10:00:00Z');
    await cash(2027, 1, '9 000');
    await post('/miesiac/2027/01/grudzien', { income: '0' });
    const page = await (await get('/miesiac/2027/01/zamkniecie')).text();
    assert.match(page, /Stawki na 2027 rok \(podstawa składek ZUS, skala PIT\) są jeszcze prognozą/);
    assert.match(page, /<button type="submit" disabled>Zamknij miesiąc/);
    const res = await post('/miesiac/2027/01/zamknij');
    assert.equal(res.status, 409);
    assert.equal(await monthStatus(2027, 1), 'open');
  });

  it('KSeF: data ostatniego pobrania na ekranie; błąd, brak ustawień albo stare pobranie wymagają potwierdzenia', async () => {
    await cash(2026, 10, '1 000');
    await db.query("UPDATE settings SET ksef_last_success_at = '2026-11-05T08:00:00Z'");
    let page = await (await get('/miesiac/2026/10/zamkniecie')).text();
    assert.match(page, /Faktury z KSeF ostatnio pobrane: 5 lis 2026/);
    assert.doesNotMatch(page, /name="ksef_ok"/);

    await db.query("UPDATE settings SET ksef_last_error = 'Token wygasł'");
    page = await (await get('/miesiac/2026/10/zamkniecie')).text();
    assert.match(page, /Ostatnie pobieranie z KSeF nie powiodło się \(Token wygasł\)/);
    assert.match(page, /name="ksef_ok" value="tak" required/);
    let res = await post('/miesiac/2026/10/zamknij');
    assert.equal(res.status, 409);
    assert.match(await res.text(), /Zaznacz potwierdzenie/);
    assert.equal(await monthStatus(2026, 10), 'open');

    await db.query("UPDATE settings SET ksef_last_error = NULL, ksef_last_success_at = '2026-11-02T08:00:00Z'");
    assert.match(await (await get('/miesiac/2026/10/zamkniecie')).text(), /nie były pobierane od ponad 2 dni/);
    await db.query('UPDATE settings SET ksef_token_enc = NULL');
    assert.match(await (await get('/miesiac/2026/10/zamkniecie')).text(), /Pobieranie faktur z KSeF nie jest ustawione/);

    res = await post('/miesiac/2026/10/zamknij', { ksef_ok: 'tak' });
    assert.equal(res.status, 303);
    assert.equal(await monthStatus(2026, 10), 'closed');
  });

  it('zamykanie w dniach 1–9: uwaga o fakturach, które mogą jeszcze przyjść; później jej nie ma', async () => {
    await cash(2026, 10, '1 000');
    assert.match(await (await get('/miesiac/2026/10/zamkniecie')).text(), /Do 9\. dnia mogą jeszcze przyjść faktury za ten miesiąc/);
    nowMs = Date.parse('2026-11-10T10:00:00Z');
    assert.doesNotMatch(await (await get('/miesiac/2026/10/zamkniecie')).text(), /Do 9\. dnia mogą jeszcze przyjść/);
  });

  it('grudnia nie otworzysz, gdy zamknięty jest styczeń następnego roku', async () => {
    nowMs = Date.parse('2027-01-12T10:00:00Z');
    await cash(2026, 12, '1 000');
    assert.equal((await post('/miesiac/2026/12/zamknij')).status, 303);
    await db.query("INSERT INTO months (year, month, status) VALUES (2027, 1, 'closed')");
    const res = await post('/miesiac/2026/12/otworz', { confirm: 'tak' });
    assert.equal(res.status, 409);
    assert.match(await res.text(), /Najpierw otwórz styczeń 2027/);
    assert.equal(await monthStatus(2026, 12), 'closed');
  });
});
