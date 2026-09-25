# The panel judges' prompt

**Purpose:** choosing a prompt for several nodes at once.

The three panel judges, `deepseek`, `qwen` and `llama` inside `judges`, share the `tie_break` inference and its prompt,
and so does the tie-break judge in `decide`. The panel's failure mode on record is a wrong winner, and the usual way a
judge gets there is a well-written draft with an amount or a quote that no chunk supports. The hypothesis is that a
prompt which makes each judge check the claims of every draft against the chunks before scoring picks the expected
winner more often.

**Variants.** The factor is the prompt of the three judges (`varies: what: prompt, nodes: [deepseek, qwen, llama]`). A
variant names a file in `prompts/`; the text replaces the prompt of those nodes only, and the inputs, the output schema
and the checks of `tie_break` stay as they are. The tie-break judge is not in the factor and keeps its prompt, so the
dispute rule does not change.

| Variant | Judges' prompt |
|---|---|
| `as_written` | `flows/judge_panel/nodes/decide/tie_break.prompt.md` |
| `claims_first` | `prompts/claims_first.md`: every claim and quote checked against the chunks, an unconfirmed claim caps grounding at 2 |
| `anchored_scale` | `prompts/anchored_scale.md`: fixed anchors for 1, 3 and 5 on each criterion |

`anchored_scale` is measured on the same cases for the Pareto view: fixed anchors should narrow the score spread
between the judges, which the panel's merge reads, but they do not target ungrounded drafts.

**Checks.** The columns of every row:

- `winner`: the built-in `expected` check on the winner a support lead picked.
- `winner_quotes_in_chunks`: the winner's quotes appear word for word in the chunks it cites. A prompt that checks
  claims first should raise it.

**Reading the result.** `claims_first` has to beat `as_written` on `winner` by more than 0.05, and a correct pick may
cost at most 25% more (`cost_of_pass`): a judge that checks claims writes longer reasoning. Read the `contest: close`
slice first; the clear contests rarely change.

**Caveat.** The prompt goes to three families at once. If one family gains and another loses, the mean hides it: open
the traces by judge before you adopt the prompt.
