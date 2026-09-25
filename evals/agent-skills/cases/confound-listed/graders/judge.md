---
type: "llm"
weight: 3
---
The experiment pairing_steps_by_agent claims to measure whether mistral works out which lamp the customer has and
gives the matching setup steps as well as gpt. But the `revise` inference has a variant slot, `lamp_guide`, chosen by
`product.lamp_kind` (its `on:` key), and the chosen guide text is pasted into the prompt as `{{ variants.lamp_guide }}`.
The check `steps_match_lamp` scores the reply against the case's `lamp_kind` tag, the same label. So the prompt hands
each model the steps for the right lamp, and the check rewards repeating the guide, not recognising the lamp.
Pass only if the answer:
- names this confound: the label the check scores also chooses the instructions the model gets;
- says what the result would then mean (both agents can pass by copying the guide; the comparison cannot show
  whether mistral recognises the lamp kind);
- proposes a fix before any series: hold the slot fixed for every case (for example the `unknown` guide, or no lamp
  kind in the product input) or balance it (cases where the guide and the label disagree), or restate the question
  as "does mistral follow the guide as well as gpt" and change the claim to match.
Fail if the answer calls the experiment ready, or only proposes more cases, more repeats or another margin.
