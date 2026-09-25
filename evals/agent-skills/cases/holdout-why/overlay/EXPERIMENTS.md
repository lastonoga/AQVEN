# Lumen research journal

## Now

Goal: make the judge panel cheaper without picking the wrong reply more often. Stage: explore on dev, the merge
rule of the panel is the lead.

## What holdout settled

Nothing yet; see `FINDINGS.md` when a holdout series has run.

## What works (dev signals)

### 2026-09-24 · panel_merge_rule · series 01a0d31f-6a08-7c4b-9e12-5d0b3f8a2c61 · dev

Question: does merging the panel by a two-judge majority alone pick the expected winner as often as the spread rule?
Verdict: "Signal on dev, not a finding: majority_only vs majority_and_spread on winner: +0.00 (95% CI -0.04 to +0.04): not worse by more than the 0.05 margin."
Numbers: expected winner 0.89 for both rules (0 points), the panel settled 78% of attempts without the tie-break
against 44% for the spread rule, n = 3 dev cases × 3 repeats, 0 of 27 attempts with infrastructure errors.
Changes: nothing yet; the merge rule stays as written until holdout says otherwise.

## What does not work

Nothing recorded.

## How we measure

`winner` compares the panel's pick with the reply a support lead picked by hand. `settled_by_panel` counts attempts
where the tie-break judge was not needed.

## Open questions

Is the majority-only merge good enough to drop the spread rule?

## Spend

About $0.40 on dev so far; the project cap is $1.00 per series.
