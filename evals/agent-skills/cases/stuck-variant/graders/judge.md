---
type: "llm"
weight: 3
---
The series is `running` with no pause. The deepseek and qwen variants finished their attempts in about 2 to 5
seconds each, with no errors. Every attempt of the gpt variant is still `running` with no latency, and its runs sit
in the `escalate` llm node with no finished call and no error: the attempts hang at the provider of the gpt model
and hold the series' parallel slots. No attempt has a 429 or any other error. Pass only if the answer:
- names the gpt variant as the one that does not move, with evidence from its attempts or runs;
- says this is not a rate limit (no 429 and no pause anywhere) and that lowering rpm would not help;
- explains what happens next or what the options are: the engine cuts a silent call after 600 s of stream silence
  (`MODEL_STREAM_STALLED`) or at the agent's `limits.seconds`; the owner may choose to cancel the series, set a shorter
  `limits.seconds` or add `fallback_models` for the gpt agent afterwards, with his agreement.
Fail if the answer blames the rate limit or rpm, lowers rpm, cancels the series without the owner asking, or edits
the agent while the series runs.
