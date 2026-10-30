// Zamknięcie miesiąca: podgląd kwot przed zamknięciem i karta „do zapłaty” zamkniętego miesiąca.
import type { MonthClosePreview, SavedMonthResult } from '../month/close.ts';
import { PIT_PAYMENT_DAY, ZUS_PAYMENT_DAY } from '../month/close.ts';
import { html, type Html } from './html.ts';
import { layout, type LayoutUser } from './layout.ts';
import { monthHref, pln } from './format.ts';
import { MONTH_NAMES } from './pages.ts';

const next = (year: number, month: number) => (month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 });
const dueDate = (year: number, month: number, day: number) => {
  const n = next(year, month);
  return `${String(day).padStart(2, '0')}.${String(n.m).padStart(2, '0')}.${n.y}`;
};
const mm = (month: number) => String(month).padStart(2, '0');

/** Rozpisanie kwot ZUS i PIT za miesiąc. */
export function amountsTable(s: SavedMonthResult, year: number, month: number): Html {
  const r = s.result;
  const income = pln(Math.max(0, s.previousMonthIncome));
  const healthNote = r.healthDue.minimumApplied
    ? `minimalna – dochód z poprzedniego miesiąca (${income}) był niższy od minimum`
    : `9% dochodu z poprzedniego miesiąca (${income})`;
  return html`<div class="row"><span>Składka emerytalna</span><span class="amount">${pln(r.socialDue.emerytalne)}</span></div>
<div class="row"><span>Składka rentowa</span><span class="amount">${pln(r.socialDue.rentowe)}</span></div>
${r.socialDue.chorobowe ? html`<div class="row"><span>Składka chorobowa</span><span class="amount">${pln(r.socialDue.chorobowe)}</span></div>` : ''}
<div class="row"><span>Składka wypadkowa</span><span class="amount">${pln(r.socialDue.wypadkowe)}</span></div>
<div class="row"><span>Fundusz Pracy i Solidarnościowy</span><span class="amount">${pln(r.socialDue.funduszPracy)}</span></div>
<div class="row"><span>Składka zdrowotna<br><span class="muted">${healthNote}</span></span><span class="amount">${pln(r.healthDue.amount)}</span></div>
<div class="row"><span><strong>ZUS razem</strong> – zapłać do ${dueDate(year, month, ZUS_PAYMENT_DAY)}<br><span class="muted">jednym przelewem na Twój rachunek składkowy (ustawowy termin: ${dueDate(year, month, 20)})</span></span><strong>${pln(r.zusToPay)}</strong></div>
<div class="row"><span><strong>Zaliczka na PIT</strong> – zapłać do ${dueDate(year, month, PIT_PAYMENT_DAY)}<br><span class="muted">na mikrorachunek podatkowy (PIT-36); dochód do opodatkowania od początku roku: ${pln(r.taxBase)}</span></span><strong>${pln(r.pitAdvance)}</strong></div>
<div class="row"><span><strong>Razem do zapłaty</strong></span><strong>${pln(r.totalToPay)}</strong></div>
${r.holiday ? html`<p class="warning">Miesiąc wakacji składkowych: składek społecznych i Funduszu Pracy nie płacisz, zdrowotną tak.</p>` : ''}`;
}

function differences(now: SavedMonthResult, before: SavedMonthResult): Html | '' {
  const a = now.result;
  const b = before.result;
  if (a.zusToPay === b.zusToPay && a.pitAdvance === b.pitAdvance) return '';
  return html`<div class="card notice"><h2>Kwoty zmieniły się od poprzedniego zamknięcia</h2>
  <div class="row"><span>ZUS</span><span class="amount">${pln(b.zusToPay)} → <strong>${pln(a.zusToPay)}</strong></span></div>
  <div class="row"><span>Zaliczka PIT</span><span class="amount">${pln(b.pitAdvance)} → <strong>${pln(a.pitAdvance)}</strong></span></div>
  <p class="hint">Jeśli DRA za ten miesiąc był już wysłany albo składki zapłacone, po zamknięciu pobierz nowy plik DRA i zaimportuj go w eZUS jako korektę, a różnicę dopłać.</p>
</div>`;
}

export function monthClosePage(p: { user: LayoutUser; preview: MonthClosePreview }): Html {
  const v = p.preview;
  const name = `${MONTH_NAMES[v.month - 1]} ${v.year}`;
  const base = `/miesiac/${v.year}/${mm(v.month)}`;
  return layout(
    `Zamknięcie: ${name}`,
    html`<div class="card"><h1>Zamknięcie miesiąca: ${name}</h1>
  <p class="muted">Kwoty policzone z księgi. Po zamknięciu zmiany w tym miesiącu wymagają świadomego ponownego otwarcia.</p>
</div>
${v.blockers.length ? html`<div class="card error" role="alert"><h2>Zanim zamkniesz</h2><ul>${v.blockers.map((b) => html`<li>${b}</li>`)}</ul></div>` : ''}
${v.warnings.length ? html`<div class="card notice"><h2>Uwagi</h2><ul>${v.warnings.map((w) => html`<li>${w}</li>`)}</ul></div>` : ''}
${v.needsDecemberIncome ? html`<div class="card">
  <h2>Dochód z grudnia ${v.year - 1}</h2>
  <p class="hint">Składka zdrowotna za styczeń liczy się od dochodu z grudnia. Grudnia nie ma w aplikacji – wpisz dochód z grudnia (przychód minus koszty minus zapłacone składki społeczne; stratę wpisz jako 0).</p>
  <form method="post" action="${base}/grudzien">
    <label for="income">Dochód z grudnia ${v.year - 1} (zł)</label>
    <input id="income" name="income" inputmode="decimal" required>
    <button type="submit">Zapisz</button>
  </form>
</div>` : ''}
${v.previous ? differences(v, v.previous) : ''}
<div class="card"><h2>Do zapłaty</h2>${amountsTable(v, v.year, v.month)}</div>
<div class="card">
  <form method="post" action="${base}/zamknij">
    <button type="submit" ${v.blockers.length ? html`disabled` : ''}>Zamknij miesiąc</button>
  </form>
  <p class="hint">Po zamknięciu pobierzesz plik DRA do eZUS. <a href="${monthHref(v.year, v.month)}">← wróć do miesiąca</a></p>
</div>`,
    p.user,
    'miesiac',
  );
}

/** Karta zamkniętego miesiąca na stronie miesiąca: kwoty, DRA, ponowne otwarcie. */
export function closedMonthCard(s: SavedMonthResult, year: number, month: number): Html {
  const base = `/miesiac/${year}/${mm(month)}`;
  return html`<div class="card"><h2>Do zapłaty</h2>${amountsTable(s, year, month)}
  ${s.warnings.length ? html`<ul class="hint">${s.warnings.map((w) => html`<li>${w}</li>`)}</ul>` : ''}
  <div class="actions">${s.result.holiday
    ? html`<span class="muted">Plik DRA dla miesiąca wakacji składkowych dojdzie w kolejnym etapie.</span>`
    : html`<a class="button" href="${base}/dra.xml">Pobierz plik DRA</a>`}</div>
  ${s.result.holiday ? '' : html`<p class="hint">W eZUS: ePłatnik → Dokumenty → Dokumenty ubezpieczeniowe → „Import KEDU”. Dokument trafi do roboczych; wysyłasz go dopiero po podpisaniu.</p>`}
</div>
<div class="card">
  <h2>Otwórz ponownie</h2>
  <p class="hint">Tylko gdy trzeba coś poprawić (np. przyszła faktura do 9. dnia). Po zmianach zamknij miesiąc jeszcze raz – kwoty i plik DRA zostaną przeliczone.</p>
  <form method="post" action="${base}/otworz">
    <label><input type="checkbox" name="confirm" value="tak" required> Rozumiem, że kwoty ZUS i PIT mogą się zmienić</label>
    <button type="submit" class="secondary">Otwórz miesiąc ponownie</button>
  </form>
</div>`;
}
