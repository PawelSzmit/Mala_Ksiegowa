// Przykładowe wyliczenia do sprawdzenia przez Pawła lub księgową (punkt kontrolny etapu 2).
// Użycie: node scripts/rules-example.ts > docs/active/mala-ksiegowa/przyklad-wyliczen.md
import { loadYearConfig } from '../src/rules/config.ts';
import { formatPln } from '../src/rules/money.ts';
import { computeYear, type YearMonthInput } from '../src/rules/year.ts';

const zl = (v: number) => Math.round(v * 100);
const NAMES = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

// Wymyślony, ale realistyczny rok gabinetu: 12 000 zł z kasy i 1 500 zł kosztów miesięcznie,
// słabszy maj (urlop: 3 000 zł przychodu, 4 000 zł kosztów), wakacje składkowe w sierpniu.
const months: YearMonthInput[] = NAMES.map((_, i) =>
  i === 4 ? { month: 5, revenue: zl(3000), costs: zl(4000) } : { month: i + 1, revenue: zl(12000), costs: zl(1500) },
);
const config = loadYearConfig(2026);
const result = computeYear({ config, previousConfig: config, months, holidayMonths: [8], previousDecemberHealthIncome: zl(9000) });

const pick = [2, 5, 6, 8, 9, 12];
const rows = result.months.filter((m) => pick.includes(m.month));
const line = (label: string, f: (m: (typeof rows)[number]) => string) => `| ${label} | ${rows.map(f).join(' | ')} |`;

console.log(`# Mała Księgowa – przykładowe wyliczenia (rok 2026)

Do sprawdzenia przez Pawła lub księgową. Dane są wymyślone, liczy je ten sam kod, który będzie w aplikacji (\`src/rules/\`).

**Założenia:** skala podatkowa, bez VAT, pełny ZUS bez dobrowolnego chorobowego. Co miesiąc 12 000 zł z kasy i 1 500 zł kosztów; maj słabszy (3 000 zł przychodu, 4 000 zł kosztów). Wakacje składkowe w sierpniu. Dochód z grudnia 2025: 9 000 zł. Składki społeczne za dany miesiąc płacone w następnym miesiącu (do 20.), więc tam odliczane od dochodu, a Fundusz Pracy wliczany do kosztów.

| | ${rows.map((m) => NAMES[m.month - 1]).join(' | ')} |
|---|${rows.map(() => '---:').join('|')}|
${line('Przychód', (m) => formatPln(m.revenue))}
${line('Koszty (z FP zapłaconym w miesiącu)', (m) => formatPln(m.costs))}
${line('Składki społeczne odliczone (zapłacone w miesiącu)', (m) => formatPln(m.socialPaid.deductible))}
${line('Dochód do zdrowotnej (podstawa na następny miesiąc)', (m) => formatPln(m.healthIncome))}
${line('**ZUS za miesiąc: społeczne**', (m) => formatPln(m.socialDue.total))}
${line('**ZUS za miesiąc: zdrowotna**', (m) => `${formatPln(m.healthDue.amount)}${m.healthDue.minimumApplied ? ' (minimum)' : ''}`)}
${line('Podstawa PIT narastająco', (m) => formatPln(m.taxBase))}
${line('**Zaliczka PIT za miesiąc**', (m) => formatPln(m.pitAdvance))}
${line('**Razem do zapłaty do 20. następnego miesiąca**', (m) => formatPln(m.totalToPay))}

## Pełny rok (zaliczki i składki)

| Miesiąc | ZUS społeczne | ZUS zdrowotna | Zaliczka PIT | Razem |
|---|---:|---:|---:|---:|
${result.months.map((m) => `| ${NAMES[m.month - 1]}${m.holiday ? ' (wakacje)' : ''} | ${formatPln(m.socialDue.total)} | ${formatPln(m.healthDue.amount)} | ${formatPln(m.pitAdvance)} | ${formatPln(m.totalToPay)} |`).join('\n')}

## Na co zwrócić uwagę przy sprawdzaniu

1. **Zdrowotna liczona od dochodu z poprzedniego miesiąca** (art. 81 ust. 2c ustawy o świadczeniach opieki zdrowotnej). Dochód = przychód − koszty − składki społeczne zapłacone w tym miesiącu (bez Funduszu Pracy, który jest kosztem).
2. **Słabszy maj**: dochód 0 → zdrowotna za czerwiec od minimum (432,54 zł). Strata z maja obniża dochód czerwca (liczenie narastające) – to nasza interpretacja, prosimy o potwierdzenie.
3. **Wakacje w sierpniu**: za sierpień tylko zdrowotna, społecznych 0 zł. We wrześniu nie ma więc czego odliczyć od dochodu i nie ma FP w kosztach.
4. **Zaliczka PIT** narastająco: 12% minus 3 600 zł kwoty zmniejszającej, podstawa i podatek zaokrąglone do pełnych złotych. Składka zdrowotna nie obniża podatku.
5. Kwoty 2026 z komunikatu ZUS z 2.02.2026: społeczne 1 788,29 zł (bez chorobowego), minimum zdrowotnej 314,96 zł za styczeń i 432,54 zł od lutego.
`);
