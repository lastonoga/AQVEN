# Experiments journal

## Now

Goal: the polished reply answers every question of the case and never promises more than the decision gives. Stage:
the polish loop; its critic is the check that scores the reply.

## What holdout settled

- 2026-09-22, `critique_planted_defects`, holdout series `0199a0f3-5d21-7b4e-8c11-2a3b4c5d6e70`: **confirmed**. The
  DeepSeek critic's verdict matched the label in 91% of attempts (95% interval 86 to 95%), 8 holdout scenarios with a
  clean and a defective reply each, 3 repeats: it stopped 94% of the replies with a planted defect and let 88% of the
  clean ones through. The `critique` check is validated; `validated_by` in reply_look and reply_noninferior_mistral
  points at this experiment.

## What works (dev signals)

- 2026-09-23, `reply_noninferior_mistral` on dev: mistral in `revise` scored 0.03 below gpt on `critique`, inside the
  0.05 margin, 20% dearer per passing reply. A signal, not a finding.

## What does not

- 2026-09-24: "the critic passes almost every reply" came from a look whose check read the wrong field (`score` of
  the draft before polishing). Refuted by re-reading the same runs with the right field: the critic blocked 5 of 12
  regression replies. Keep `critique` as a check.

## How we measure

- `critique`: the DeepSeek critic's score of the polished reply, validated by `critique_planted_defects`.
- `promises`: the code check `reply_keeps_resolution` in `code/support_case.py`.

## Open questions

- Does the polished reply answer every question when a customer asks more than one? No check yet.

## Spend

- 2026-09-22 to 2026-09-24: $0.74 of the $1.00 project cap.
