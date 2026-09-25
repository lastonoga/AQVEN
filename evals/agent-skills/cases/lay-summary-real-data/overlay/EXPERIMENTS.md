# Experiments journal

## Now

Goal: stop replies that break the decision or state what the knowledge base does not say, before they reach the
customer. Stage: the critic of the polish loop. Its metric is recall on replies with a defect; clean replies let
through are the control.

## What holdout settled

- 2026-09-19, `critique_planted_defects`, holdout: **confirmed**. On synthetic replies with one planted defect each
  (8 scenarios, each with a clean twin), the DeepSeek critic's verdict matched the label in 91% of attempts.
- 2026-09-24, `critique_real_replies`, holdout series `0199a2e7-1c4d-7f20-9b3a-5e6f7a8b9c01`: **confirmed**. On 150
  real replies from the June support log that support leads had reviewed (60 with a real defect, 90 clean), the
  critic with the `claims_first` prompt stopped 43 of the 60 defective replies (72%), against 35 of 60 (58%) with the
  prompt as written: +13 points, n = 60 defective replies. It let 84 of the 90 clean replies through (93%), against
  86 of 90 (96%).

## What works (dev signals)

- 2026-09-21, `planted_defect_grades` on dev: on synthetic replies with a planted defect at three levels of
  subtlety, `claims_first` stopped 100% of obvious, 88% of moderate and 79% of subtle defects, against 90%, 75% and
  63% with the prompt as written. 8 cases × 3 repeats per level. A signal, not a finding.
- 2026-09-23, `critique_recall_by_agent` on dev: qwen as the critic stopped 7 of 8 planted defects, llama 5 of 8.

## What does not

- A second critic from another family added nothing on real replies (dev, 2026-09-22): recall 71% against 72%.

## How we measure

- Real replies: the June support log, each reply reviewed by a support lead as "would send" or "would not send".
- Synthetic replies: clean replies with one planted defect each, `planted_defect_replies` and its graded copy.

## Open questions

- The critic still lets 17 of 60 real defective replies through; most are unsupported delivery promises.

## Spend

- 2026-09-19 to 2026-09-24: $0.92 of the $1.00 project cap.
