# Mała Księgowa – przykładowe wyliczenia (rok 2026)

Do sprawdzenia przez Pawła lub księgową. Dane są wymyślone, liczy je ten sam kod, który będzie w aplikacji (`src/rules/`).

**Założenia:** skala podatkowa, bez VAT, pełny ZUS bez dobrowolnego chorobowego. Co miesiąc 12 000 zł z kasy i 1 500 zł kosztów; maj słabszy (3 000 zł przychodu, 4 000 zł kosztów). Wakacje składkowe w sierpniu. Dochód z grudnia 2025: 9 000 zł. Składki społeczne za dany miesiąc płacone w następnym miesiącu (do 20.), więc tam odliczane od dochodu, a Fundusz Pracy wliczany do kosztów.

| | luty | maj | czerwiec | sierpień | wrzesień | grudzień |
|---|---:|---:|---:|---:|---:|---:|
| Przychód | 12 000,00 zł | 3 000,00 zł | 12 000,00 zł | 12 000,00 zł | 12 000,00 zł | 12 000,00 zł |
| Koszty (z FP zapłaconym w miesiącu) | 1 638,47 zł | 4 138,47 zł | 1 638,47 zł | 1 638,47 zł | 1 500,00 zł | 1 638,47 zł |
| Składki społeczne odliczone (zapłacone w miesiącu) | 1 649,82 zł | 1 649,82 zł | 1 649,82 zł | 1 649,82 zł | 0,00 zł | 1 649,82 zł |
| Dochód do zdrowotnej (podstawa na następny miesiąc) | 8 711,71 zł | 0,00 zł | 5 923,42 zł | 8 711,71 zł | 10 500,00 zł | 8 711,71 zł |
| **ZUS za miesiąc: społeczne** | 1 788,29 zł | 1 788,29 zł | 1 788,29 zł | 0,00 zł | 1 788,29 zł | 1 788,29 zł |
| **ZUS za miesiąc: zdrowotna** | 784,05 zł | 784,05 zł | 432,54 zł (minimum) | 784,05 zł | 784,05 zł | 784,05 zł |
| Podstawa PIT narastająco | 17 423,00 zł | 32 059,00 zł | 40 770,00 zł | 58 194,00 zł | 68 694,00 zł | 94 829,00 zł |
| **Zaliczka PIT za miesiąc** | 0,00 zł | 0,00 zł | 710,00 zł | 1 045,00 zł | 1 260,00 zł | 1 045,00 zł |
| **Razem do zapłaty do 20. następnego miesiąca** | 2 572,34 zł | 2 572,34 zł | 2 930,83 zł | 1 829,05 zł | 3 832,34 zł | 3 617,34 zł |

## Pełny rok (zaliczki i składki)

| Miesiąc | ZUS społeczne | ZUS zdrowotna | Zaliczka PIT | Razem |
|---|---:|---:|---:|---:|
| styczeń | 1 788,29 zł | 810,00 zł | 0,00 zł | 2 598,29 zł |
| luty | 1 788,29 zł | 784,05 zł | 0,00 zł | 2 572,34 zł |
| marzec | 1 788,29 zł | 784,05 zł | 0,00 zł | 2 572,34 zł |
| kwiecień | 1 788,29 zł | 784,05 zł | 582,00 zł | 3 154,34 zł |
| maj | 1 788,29 zł | 784,05 zł | 0,00 zł | 2 572,34 zł |
| czerwiec | 1 788,29 zł | 432,54 zł | 710,00 zł | 2 930,83 zł |
| lipiec | 1 788,29 zł | 533,11 zł | 1 046,00 zł | 3 367,40 zł |
| sierpień (wakacje) | 0,00 zł | 784,05 zł | 1 045,00 zł | 1 829,05 zł |
| wrzesień | 1 788,29 zł | 784,05 zł | 1 260,00 zł | 3 832,34 zł |
| październik | 1 788,29 zł | 945,00 zł | 1 046,00 zł | 3 779,29 zł |
| listopad | 1 788,29 zł | 784,05 zł | 1 045,00 zł | 3 617,34 zł |
| grudzień | 1 788,29 zł | 784,05 zł | 1 045,00 zł | 3 617,34 zł |

## Na co zwrócić uwagę przy sprawdzaniu

1. **Zdrowotna liczona od dochodu z poprzedniego miesiąca** (art. 81 ust. 2c ustawy o świadczeniach opieki zdrowotnej). Dochód = przychód − koszty − składki społeczne zapłacone w tym miesiącu (bez Funduszu Pracy, który jest kosztem).
2. **Słabszy maj**: dochód 0 → zdrowotna za czerwiec od minimum (432,54 zł). Strata z maja obniża dochód czerwca (liczenie narastające) – to nasza interpretacja, prosimy o potwierdzenie.
3. **Wakacje w sierpniu**: za sierpień tylko zdrowotna, społecznych 0 zł. We wrześniu nie ma więc czego odliczyć od dochodu i nie ma FP w kosztach.
4. **Zaliczka PIT** narastająco: 12% minus 3 600 zł kwoty zmniejszającej, podstawa i podatek zaokrąglone do pełnych złotych. Składka zdrowotna nie obniża podatku.
5. Kwoty 2026 z komunikatu ZUS z 2.02.2026: społeczne 1 788,29 zł (bez chorobowego), minimum zdrowotnej 314,96 zł za styczeń i 432,54 zł od lutego.

