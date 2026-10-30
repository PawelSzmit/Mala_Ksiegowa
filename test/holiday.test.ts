// Etap 7 przez HTTP: wybór miesiąca wakacji składkowych, przypomnienie o RWS, zamknięcie miesiąca wakacji i plik dla eZUS. Wymaga TEST_DATABASE_URL.
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

describe('wakacje składkowe', { skip: skipWithoutDb }, () => {
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

  const setHoliday = (year: number, month: number | null) => post('/ustawienia/wakacje', { year: String(year), month: month === null ? '' : String(month) });
  const holidayInDb = (year: number, month: number) => db.query('INSERT INTO years (year, holiday_month) VALUES ($1, $2)', [year, month]);

  it('ustawienia: miesiąc wpisany w dowolnej chwili na poprzedni, bieżący i następny rok; po terminie RWS tylko ostrzeżenie', async () => {
    let page = await (await get('/ustawienia')).text();
    assert.match(page, /Wakacje składkowe/);
    assert.match(page, /Rok 2025[\s\S]*Rok 2026[\s\S]*Rok 2027/);

    let res = await setHoliday(2026, 12); // RWS w listopadzie – czyli teraz
    assert.equal(res.status, 200);
    page = await res.text();
    assert.match(page, /Zapisano/);
    assert.doesNotMatch(page, /Termin wniosku RWS/);
    // Termin RWS minął (październik) – zapis przechodzi, ale z ostrzeżeniem.
    res = await setHoliday(2026, 11);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Termin wniosku RWS za listopad 2026 już minął \(składa się go w miesiącu przed wakacjami: 10\/2026\)/);
    res = await setHoliday(2027, 3);
    assert.equal(res.status, 200);
    assert.equal((await setHoliday(2025, 12)).status, 200);
    res = await setHoliday(2024, 5);
    assert.equal(res.status, 400);
    res = await post('/ustawienia/wakacje', { year: '2027', month: '13' });
    assert.equal(res.status, 400);

    const { rows } = await db.query('SELECT year, holiday_month FROM years ORDER BY year');
    assert.deepEqual(rows, [{ year: 2025, holiday_month: 12 }, { year: 2026, holiday_month: 11 }, { year: 2027, holiday_month: 3 }]);
    page = await (await get('/ustawienia')).text();
    assert.match(page, /<option value="11" selected>listopad/);
    assert.match(page, /<option value="3" selected>marzec/);

    // Usunięcie wakacji („bez wakacji”) – bez ostrzeżeń.
    res = await setHoliday(2027, null);
    assert.equal(res.status, 200);
    assert.doesNotMatch(await res.text(), /Termin wniosku RWS/);
    assert.equal((await db.query('SELECT holiday_month FROM years WHERE year = 2027')).rows[0].holiday_month, null);
  });

  it('przypomnienie o RWS w miesiącu przed wakacjami, z danymi do wniosku i kwotą zwolnienia; styczeń → grudzień poprzedniego roku', async () => {
    await setHoliday(2026, 12);
    let page = await (await get('/miesiac/2026/11')).text();
    assert.match(page, /Złóż wniosek RWS do 30\.11\.2026/);
    assert.match(page, /Wakacje składkowe za grudzień 2026/);
    // 1649,82 zł społecznych + 138,47 zł FP (2026, bez chorobowego).
    assert.match(page, /około <strong>1 788,29 zł<\/strong>/);
    assert.match(page, /12\/2026[\s\S]*5260250274[\s\S]*44051401359/);
    assert.doesNotMatch(await (await get('/miesiac/2026/10')).text(), /wniosek RWS/);
    assert.match(await (await get('/miesiac/2026/12')).text(), /Miesiąc wakacji składkowych\./);

    await setHoliday(2026, null);
    await setHoliday(2027, 1);
    page = await (await get('/miesiac/2026/12')).text();
    assert.match(page, /Złóż wniosek RWS do 31\.12\.2026/);
    assert.match(page, /Wakacje składkowe za styczeń 2027/);
    assert.doesNotMatch(await (await get('/miesiac/2026/11')).text(), /wniosek RWS/);
  });

  it('zamknięcie miesiąca wakacji: tylko zdrowotna, plik z DRA i dwoma RCA; w następnym miesiącu bez Funduszu Pracy i bez odliczenia', async () => {
    await holidayInDb(2026, 10);
    await cash(2026, 10, '10 000');
    let page = await (await get('/miesiac/2026/10/zamkniecie')).text();
    assert.match(page, /ZUS razem<\/strong> – zapłać do 10\.11\.2026[\s\S]*432,54 zł/);
    assert.match(page, /Oszczędzasz 1 788,29 zł/);
    assert.equal((await post('/miesiac/2026/10/zamknij')).status, 303);

    page = await (await get('/miesiac/2026/10')).text();
    assert.match(page, /Pobierz plik DRA/);
    assert.match(page, /trzy dokumenty/);
    const res = await get('/miesiac/2026/10/dra.xml');
    assert.equal(res.status, 200);
    const xml = await res.text();
    assert.deepEqual(draSchemaErrors(xml), []);
    assert.deepEqual([draValue(xml, 'ZUSDRA/IV/p37'), draValue(xml, 'ZUSDRA/IX/p2'), draValue(xml, 'ZUSDRA/IV/p12')], ['0.00', '432.54', '1555.43']);
    assert.deepEqual([draValue(xml, 'ZUSRCA[1]/III/B/p1/p1'), draValue(xml, 'ZUSRCA[1]/III/B/p29')], ['0514', '1649.82']);
    assert.deepEqual([draValue(xml, 'ZUSRCA[2]/III/B/p1/p1'), draValue(xml, 'ZUSRCA[2]/III/C/p4'), draValue(xml, 'ZUSRCA[2]/III/E/p2')], ['0510', '432.54', '0.00']);

    // Listopad: za październik nic nie zapłacono, więc brak wpisu FP i odliczenia składek; za listopad – pełne składki.
    nowMs = Date.parse('2026-12-05T10:00:00Z');
    await cash(2026, 11, '5 000');
    assert.equal((await post('/miesiac/2026/11/zamknij')).status, 303);
    // Wpis FP jest tylko w październiku (zapłacony 10.10 za wrzesień); w listopadzie nie ma czego wpisać.
    const fp = await db.query("SELECT month FROM kpir_entries WHERE source = 'fp' ORDER BY month");
    assert.deepEqual(fp.rows.map((r) => r.month), [10]);
    const nov = (await db.query('SELECT results FROM months WHERE year = 2026 AND month = 11')).rows[0].results;
    assert.deepEqual(nov.result.socialPaid, { deductible: 0, funduszPracy: 0 });
    assert.equal(nov.result.socialDue.deductible, 164982);
    assert.equal(nov.exemptSocial, undefined);
  });

  it('zmiana wakacji zablokowana, gdy miesiąc wakacji (lub późniejszy) jest zamknięty; grudzień blokuje też zamknięty styczeń', async () => {
    await holidayInDb(2026, 10);
    await cash(2026, 10, '1000');
    await post('/miesiac/2026/10/zamknij');
    const res = await setHoliday(2026, null);
    assert.equal(res.status, 409);
    assert.match(await res.text(), /Najpierw otwórz październik 2026/);
    assert.equal((await db.query('SELECT holiday_month FROM years WHERE year = 2026')).rows[0].holiday_month, 10);

    // Grudzień 2026 → wpływa na styczeń 2027 (składki za grudzień odlicza się w styczniu).
    await db.query("INSERT INTO months (year, month, status) VALUES (2027, 1, 'closed')");
    nowMs = Date.parse('2026-11-05T10:00:00Z');
    const dec = await setHoliday(2026, 12);
    assert.equal(dec.status, 409);
    assert.match(await dec.text(), /styczeń 2027/);
  });
  it('przypomnienie o RWS bez pliku stawek roku wakacji: dane do wniosku są, kwoty „około …” nie ma', async () => {
    nowMs = Date.parse('2027-12-05T10:00:00Z');
    await holidayInDb(2028, 1); // config/years/2028.json jeszcze nie istnieje
    const page = await (await get('/miesiac/2027/12')).text();
    assert.match(page, /Złóż wniosek RWS do 31\.12\.2027/);
    assert.match(page, /01\/2028/);
    assert.doesNotMatch(page, /Zwolnienie obejmie około/);
  });
});
