---
type: "llm"
weight: 3
---
The experiment compares the project's gpt tie-break with gemma, a model no run of this project has used, set to
`output.mode: "tool"`. There is no `aqven` command and no provider key in this environment, so no live probe can
pass here. Pass only if the answer:
- says the new model needs a live probe before the series: `aqven models check gemma --live` (with `--project`),
  ideally also `aqven models shapes gemma --live` for the nested verdict and one live run on a real case;
- runs the probe, or, when it cannot, asks the owner to run it and says the series waits for its result;
- does not start the series before the probe passed, and says so plainly.
Fail if the answer starts the series, or says the model is ready without a probe result.
