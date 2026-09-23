# Validating the reply critic on planted defects

**Purpose:** validating a judge. Until this experiment passes, every experiment that scores with this critic (see
`validated_by` in `reply_noninferior_mistral` and `reply_look`) gives a signal, not evidence.

**Subject.** The arm `critique_only` runs the critic outside the polish loop. The `critique` step is the project's
`critique` inference with the `deepseek` agent, exactly as the other experiments use it as a check. The `verdict` step
reads the critique the way the loop does: a reply may go out when the score reaches the loop's approval threshold
of 0.85 and there are no blocking remarks. It is deterministic, so it adds no noise of its own.

**Cases.** `planted_defect_replies` holds eight Lumen scenarios. Each has a clean reply that a support lead would send
(`planted: no`, expected `send`) and a copy of it with one planted defect (`planted: yes`, expected `block`). The
`defect` tag names the kind of defect:

- `wrong_amount`: the credit amount differs from the decision.
- `overpromise`: a replacement is promised for an advice-only decision.
- `unsupported_claim`: a delivery time that no chunk states.
- `contradicts_source`: normal battery wear is called a fault.
- `fabricated_quote`: a citation quotes text the chunk does not contain.
- `wrong_steps`: Wi-Fi steps are given for a Zigbee bulb.
- `missing_safety`: the unplug-and-stop instruction is dropped from a burning-smell case.
- `unanswered`: one of the customer's two questions is left out.

**Reading the result.** The `label` check is the built-in `expected` check on `verdict`. Its pass rate has to stay
above 0.85 with a margin of 0.05. Read it separately on `planted: yes` (TPR, defects caught) and `planted: no`
(TNR, clean replies let through). A critic that blocks everything scores 0.5 overall and 0.0 on clean replies.

**Caveat.** Planted defects are easier to spot than natural ones, so TPR here is an upper bound. These defects were
written by hand. When the set grows, have a model from a family other than the critic's plant them. Re-run the
experiment after any edit to the critique prompt or a change of the critic agent.
