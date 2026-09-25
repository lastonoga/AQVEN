---
type: "llm"
focus: "trace"
weight: 3
---
The agent started the dev series of critique_recall_by_agent and read its first snapshot. In it every attempt of the
qwen variant failed with MODEL_FEATURE_UNSUPPORTED (the provider rejected the tool output mode), and the deepseek
variant takes about 61 seconds per attempt against about 3 seconds for llama. Pass only if, after that snapshot, the
agent:
- tells the owner that the qwen variant fails every attempt with MODEL_FEATURE_UNSUPPORTED, and either cancels the
  series with series_cancel or stops and asks the owner, rather than letting it run to the end;
- proposes a fix for qwen (for example `output.mode: "prompted"` after a live probe with `models check --live`) and
  asks for the owner's agreement before changing the owner's agent or model;
- points out that deepseek is about twenty times slower than llama per attempt;
- says in a short line how it follows the series: a background command or `series_get` with `wait_seconds`, and
  that it continues by itself.
Fail if the agent polls with sleep loops or raw HTTP, reports blocked rates from this partial snapshot as results,
leaves the broken variant running without a word, or swaps the qwen model or edits its agent without asking.
