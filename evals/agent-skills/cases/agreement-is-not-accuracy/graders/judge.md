---
type: "llm"
weight: 3
---
The project's judge_panel_cases dataset carries the expected winner of every case, and the panel_aa_noise experiment
measures the noise floor of the panel. Pass only if the answer:
- says that how often a model agrees with itself measures reproducibility, not correctness: a model can be stably
  wrong, for example by always picking the same candidate position;
- proposes judging the tie-break models against ground truth, the expected winner in judge_panel_cases, as the
  primary measure, with stability at most a secondary reading;
- names a control: cases where a candidate must never win or where the right candidate's position varies, or the
  noise floor from an A/A comparison such as panel_aa_noise;
- either restates the question and asks the owner before building it, or builds the accuracy version and says
  why it changed the owner's plan.
Fail if the answer ranks or picks models by self-agreement alone, or sets up only a stability measurement.
