# Showcase: Lumen support

The `support_case` workflow and the `judge_panel` workflow it calls show every aqven pattern and execution mode. The
design is in [DESIGN.md](DESIGN.md), the module is `lumen/`, the host is `lumen/app.py` and `lumen/__main__.py`, the
tests are in `tests/`. The layout is the one a project created by `aqven new` gets.

```
prepare → triage → vote(map) → tally → intent(switch: cascade) → case_form → record(loop: extract-validate-repair)
→ to_record(narrow) → search_kb → route(switch: router, agent) → drafts(parallel) → panel(call judge_panel)
→ polish(loop: critic-revise) → illustrate → voice → clip(wait) → approvals(parallel humans) → finalize
```

## Critique and revision: `polish`

The panel's winning draft is revised until a critic from another family gives it 0.85, or the score stops rising.
A pass is the outputs of the body nodes — there is no separate state block; stopping and selection are built-in
policies. The file is `flows/support_case/nodes/polish/polish.node.yaml`.

```yaml
node: "loop"
body:
- "revise"
- "critique"
init:
  revise:
  - name: "previous"
    from: "$panel.out.winner"
max_iter: 3
stop:
- use: "threshold"
  with:
    path: "$iter.critique.out.score"
    gte: 0.85
- use: "stagnation"
  with:
    path: "$iter.critique.out.score"
    window: 1
    min_delta: 0.02
select:
  use: "best"
  with:
    path: "$iter.critique.out.score"
```

The body nodes sit flat in the same `nodes/polish/` folder. `revise.node.yaml` has its own `revise` inference @ `gpt`
(`revise.inference.yaml`, `revise.prompt.md`, `revise.variants/lamp_guide/`): on the first pass `previous` comes from
`init`, after that `previous ← $acc.revise.out.reply` and `critique ← $acc.critique.out`. `critique.node.yaml` has its
own `critique` inference @ `mistral`, and its check `critique_consistent` lives in `critique.py` beside it. The same
`critique` inference, on the `deepseek` agent, is the judge check of the experiments `reply_look` and
`reply_noninferior_mistral`. The evaluator `promises_match_resolution` from `code/support_case.py` is a check on
`revise`; its sibling `reply_keeps_resolution` applies the same promise rules to the `polish` range of the `reply_*`
experiments, where the decision comes from the `route` output in the case's `node_outputs`.

## Layout

The loader finds definitions by their `kind` anywhere in the module; only `aqven.yaml` is fixed. The standard layout
gives every kind one place. An id is the file name up to the first dot (for `flow.yaml`, the folder name), and the
files that belong to an entity sit beside it under the same prefix. An agent in one file is `agents/<agent>.yaml`, an
agent with companion files gets the folder `agents/<agent>/`. Every top-level node has its own `nodes/<node>/` folder,
and all of its descendants, however deep, sit flat inside it.

```
pyproject.toml                       one lumen package, the module at the project root
.mcp.json                            the project MCP server over stdio: uv run aqven mcp lumen
AGENTS.md, CLAUDE.md, .claude/       rules and hooks for coding agents: aqven check after edits and on stop
lumen/
  app.py                             the host: the ASGI app, mounting into another app, calling in process
  __main__.py                        starting the server: python -m lumen
  samples/                           inputs of the example: case_request.json, answers.json, a photo and an invoice
  .env.example                       OPENROUTER_API_KEY and the AQVEN_* variables
  aqven.yaml
  types.py                           models of every type and of inference, tool and code step inputs and outputs:
                                     aqven generate, not committed, first line is the DO NOT EDIT header
  agents/<agent>.yaml                deepseek, gemini, gpt, llama, mistral, painter, qwen, researcher
  agents/resolver/                   resolver.yaml, resolver.instructions.md,
                                     research_policy.inference.yaml, research_policy.prompt.md — the subagent inference
  tools/<tool>.yaml, functions.py    tools and their functions
  mcp/helpdesk.yaml
  types/enums/, ids/, records/, unions/, values/
  fragments/                         brand_voice, citation_rules, judge_protocol, safety_escalation, untrusted_input
  code/support_case.py               Python used in several places: a check on the revise inference and in experiments
  datasets/                          cases of a flow or of an experiment arm: input, expected output, tags
  experiments/<experiment>/          experiment.yaml, experiment.md, arms/<arm>/ — see Experiments below
  flows/
    support_case/
      flow.yaml
      nodes/triage/                  triage.node.yaml, triage.inference.yaml, triage.prompt.md — with no inference key
      nodes/prepare/                 prepare.node.yaml, prepare.py — run: "prepare"
      nodes/record/                  record.node.yaml, record.py, extract.node.yaml, extract.inference.yaml,
                                     extract.prompt.md, validate.node.yaml, validate.py
      nodes/polish/                  polish.node.yaml, revise.node.yaml, revise.inference.yaml, revise.prompt.md,
                                     revise.variants/lamp_guide/, critique.node.yaml, critique.inference.yaml,
                                     critique.prompt.md, critique.py
      nodes/vote/, tally/, intent/, case_form/, to_record/, search_kb/, route/, drafts/, panel/, illustrate/, voice/,
            clip/, approvals/, finalize/
    judge_panel/
      flow.yaml
      nodes/judges/, aggregate/, decide/, pick/
```

| What | Where |
|---|---|
| The inference of one node | beside the node under its name: `nodes/triage/triage.inference.yaml`, `nodes/record/extract.inference.yaml`, `nodes/route/resolve.inference.yaml`, `nodes/illustrate/illustrate.inference.yaml` |
| A shared inference | at the first node that owns it, the rest reference it with `inference: <id>`: `revise` — `drafts__gpt`, `drafts__mistral`, `drafts__gemini`; `ballot` — `intent__escalate`; `tie_break` — `judges__deepseek`, `judges__qwen`, `judges__llama`; `critique` — the judge checks of the experiments; the experiment arms reference `triage`, `ballot`, `critique` and `tie_break` the same way |
| A subagent inference | in the agent's folder: `agents/resolver/research_policy.inference.yaml` |
| Child nodes | flat in the folder of the top-level node: `nodes/route/resolve.node.yaml`, `flows/judge_panel/nodes/judges/deepseek.node.yaml`; the expanded id is `route__resolve`, `judges__deepseek` |
| A prompt | `<inference>.prompt.md` beside `<inference>.inference.yaml`; at level 3 it is `prompt: "illustrate_prompt"` from `nodes/illustrate/illustrate.py` |
| Variants by lamp kind | `flows/support_case/nodes/polish/revise.variants/lamp_guide/` |
| Prompt fragments | `fragments/` at the root, `{% include "fragments/untrusted_input" %}` from any depth |
| Policies: built-in `use`, your own `run` | `join`, `stop`, `select`, `on_item_error` in the nodes; your own in `flows/judge_panel/nodes/judges/judges.py`, `flows/support_case/nodes/record/record.py` |
| Evaluators | `checks` in `<inference>.inference.yaml` at run time, and `checks` in `experiments/<experiment>/experiment.yaml` on every attempt of an experiment |
| Types | YAML only, under `types/` at the root; the code imports the models of types and of inference inputs and outputs (`ReviseIn`, `ReviseOut`), of tools (`SearchKbOut`) and of `code` steps (`SupportCasePrepareOut`) from `lumen.types` (`from lumen.types import CaseRequest`); a step whose output equals a registry type returns that type (`pick` — `PanelOutcome`, `finalize` — `CaseOutcome`) |
| Code references | `run: "tally"` — `tally.py` beside `tally.node.yaml`, loaded by file path; `@root.tools.functions:…` and `@root.code.support_case:…` — an import path from the package root; the full path `lumen.code.support_case:promises_match_resolution` works too |

`aqven tree` lists entities by kind with their file paths and the output mode of every agent, experiments and their
arms included; an arm's nodes read `<experiment>.<arm>.<node>`. Prompts, variants, fragments and Python are not in it.

```
$ uv run aqven tree examples/lumen
project (1)
  lumen  aqven.yaml
agent (9)
  deepseek    agents/deepseek.yaml           output.mode prompted -> prompted (declared)
  gemini      agents/gemini.yaml             output.mode auto -> tool (profile)
  gpt         agents/gpt.yaml                output.mode prompted -> prompted (declared)
  llama       agents/llama.yaml              output.mode auto -> tool (profile)
  mistral     agents/mistral.yaml            output.mode prompted -> prompted (declared)
  painter     agents/painter.yaml            output.mode prompted -> prompted (declared)
  qwen        agents/qwen.yaml               output.mode tool -> tool (declared)
  researcher  agents/researcher.yaml         output.mode prompted -> prompted (declared)
  resolver    agents/resolver/resolver.yaml  output.mode native -> native (declared)
tool (6)
  find_tickets        tools/find_tickets.yaml
  issue_store_credit  tools/issue_store_credit.yaml
  lookup_order        tools/lookup_order.yaml
  render_clip         tools/render_clip.yaml
  search_kb           tools/search_kb.yaml
  synthesize_voice    tools/synthesize_voice.yaml
mcp_server (1)
  helpdesk  mcp/helpdesk.yaml
type (52)
  Agreement         types/enums/agreement.yaml
  ApprovalDecision  types/enums/approval_decision.yaml
  CascadeTier       types/enums/cascade_tier.yaml
  CaseIntent        types/enums/case_intent.yaml
  CaseOrigin        types/unions/case_origin.yaml
  CaseOutcome       types/records/case_outcome.yaml
  CaseRecord        types/unions/case_record.yaml
  CaseRequest       types/records/case_request.yaml
  CaseStatus        types/enums/case_status.yaml
  Channel           types/enums/channel.yaml
  Citation          types/records/citation.yaml
  CriterionScore    types/records/criterion_score.yaml
  Critique          types/records/critique.yaml
  CritiqueVerdict   types/records/critique_verdict.yaml
  CurrencyCode      types/enums/currency_code.yaml
  Customer          types/records/customer.yaml
  CustomerId        types/ids/customer_id.yaml
  CustomerTier      types/enums/customer_tier.yaml
  DefectSymptom     types/enums/defect_symptom.yaml
  DeliveryDamage    types/enums/delivery_damage.yaml
  IntentBallot      types/records/intent_ballot.yaml
  Issue             types/records/issue.yaml
  IssueSeverity     types/enums/issue_severity.yaml
  JudgeVerdict      types/records/judge_verdict.yaml
  KbChunk           types/records/kb_chunk.yaml
  KbChunkId         types/ids/kb_chunk_id.yaml
  LampKind          types/enums/lamp_kind.yaml
  Marketplace       types/enums/marketplace.yaml
  MediaApproval     types/records/media_approval.yaml
  Money             types/records/money.yaml
  Observation       types/records/observation.yaml
  OrderId           types/ids/order_id.yaml
  PanelOutcome      types/records/panel_outcome.yaml
  PanelRequest      types/records/panel_request.yaml
  PanelVerdict      types/records/panel_verdict.yaml
  Policy            types/records/policy.yaml
  PolicyId          types/ids/policy_id.yaml
  ProductCategory   types/enums/product_category.yaml
  ProductRef        types/records/product_ref.yaml
  ReplyApproval     types/records/reply_approval.yaml
  ReplyCriterion    types/enums/reply_criterion.yaml
  ReplyDraft        types/records/reply_draft.yaml
  ReplyMedia        types/records/reply_media.yaml
  ReplyReview       types/records/reply_review.yaml
  ReplyVerdict      types/enums/reply_verdict.yaml
  Resolution        types/records/resolution.yaml
  ResolutionAction  types/enums/resolution_action.yaml
  Score             types/values/score.yaml
  SignalDef         types/records/signal_def.yaml
  SignalKey         types/ids/signal_key.yaml
  SkuId             types/ids/sku_id.yaml
  VotePerspective   types/enums/vote_perspective.yaml
inference (12)
  ballot            flows/support_case/nodes/vote/ballot.inference.yaml
  classify_message  experiments/intent_split_long_messages/arms/one_step/nodes/classify_message/classify_message.inference.yaml
  classify_summary  experiments/intent_split_long_messages/arms/two_step/nodes/classify_summary/classify_summary.inference.yaml
  condense_message  experiments/intent_split_long_messages/arms/two_step/nodes/condense_message/condense_message.inference.yaml
  critique          flows/support_case/nodes/polish/critique.inference.yaml
  extract           flows/support_case/nodes/record/extract.inference.yaml
  illustrate        flows/support_case/nodes/illustrate/illustrate.inference.yaml
  research_policy   agents/resolver/research_policy.inference.yaml
  resolve           flows/support_case/nodes/route/resolve.inference.yaml
  revise            flows/support_case/nodes/polish/revise.inference.yaml
  tie_break         flows/judge_panel/nodes/decide/tie_break.inference.yaml
  triage            flows/support_case/nodes/triage/triage.inference.yaml
flow (2)
  judge_panel   flows/judge_panel/flow.yaml
  support_case  flows/support_case/flow.yaml  run context: date, tenant_id
node (56)
  critique_planted_defects.critique_only.critique       experiments/critique_planted_defects/arms/critique_only/nodes/critique/critique.node.yaml
  critique_planted_defects.critique_only.verdict        experiments/critique_planted_defects/arms/critique_only/nodes/verdict/verdict.node.yaml
  intent_ballot_pair.pair.evidence                      experiments/intent_ballot_pair/arms/pair/nodes/evidence/evidence.node.yaml
  intent_ballot_pair.pair.prepare                       experiments/intent_ballot_pair/arms/pair/nodes/prepare/prepare.node.yaml
  intent_ballot_pair.pair.settle                        experiments/intent_ballot_pair/arms/pair/nodes/settle/settle.node.yaml
  intent_ballot_pair.pair.triage                        experiments/intent_ballot_pair/arms/pair/nodes/triage/triage.node.yaml
  intent_ballot_pair.pair.words                         experiments/intent_ballot_pair/arms/pair/nodes/words/words.node.yaml
  intent_ballot_pair.single.ballot                      experiments/intent_ballot_pair/arms/single/nodes/ballot/ballot.node.yaml
  intent_ballot_pair.single.prepare                     experiments/intent_ballot_pair/arms/single/nodes/prepare/prepare.node.yaml
  intent_ballot_pair.single.triage                      experiments/intent_ballot_pair/arms/single/nodes/triage/triage.node.yaml
  intent_escalation_agents.escalation.escalate          experiments/intent_escalation_agents/arms/escalation/nodes/escalate/escalate.node.yaml
  intent_escalation_agents.escalation.prepare           experiments/intent_escalation_agents/arms/escalation/nodes/prepare/prepare.node.yaml
  intent_escalation_agents.escalation.triage            experiments/intent_escalation_agents/arms/escalation/nodes/triage/triage.node.yaml
  intent_split_long_messages.one_step.classify_message  experiments/intent_split_long_messages/arms/one_step/nodes/classify_message/classify_message.node.yaml
  intent_split_long_messages.two_step.classify_summary  experiments/intent_split_long_messages/arms/two_step/nodes/classify_summary/classify_summary.node.yaml
  intent_split_long_messages.two_step.condense_message  experiments/intent_split_long_messages/arms/two_step/nodes/condense_message/condense_message.node.yaml
  judge_panel.aggregate                                 flows/judge_panel/nodes/aggregate/aggregate.node.yaml
  judge_panel.decide                                    flows/judge_panel/nodes/decide/decide.node.yaml
  judge_panel.decide__tie_break                         flows/judge_panel/nodes/decide/tie_break.node.yaml
  judge_panel.judges                                    flows/judge_panel/nodes/judges/judges.node.yaml
  judge_panel.judges__deepseek                          flows/judge_panel/nodes/judges/deepseek.node.yaml
  judge_panel.judges__llama                             flows/judge_panel/nodes/judges/llama.node.yaml
  judge_panel.judges__qwen                              flows/judge_panel/nodes/judges/qwen.node.yaml
  judge_panel.pick                                      flows/judge_panel/nodes/pick/pick.node.yaml
  panel_single_judge.single_judge.judge                 experiments/panel_single_judge/arms/single_judge/nodes/judge/judge.node.yaml
  panel_single_judge.single_judge.pick                  experiments/panel_single_judge/arms/single_judge/nodes/pick/pick.node.yaml
  support_case.approvals                                flows/support_case/nodes/approvals/approvals.node.yaml
  support_case.approvals__brand                         flows/support_case/nodes/approvals/brand.node.yaml
  support_case.approvals__lead                          flows/support_case/nodes/approvals/lead.node.yaml
  support_case.case_form                                flows/support_case/nodes/case_form/case_form.node.yaml
  support_case.clip                                     flows/support_case/nodes/clip/clip.node.yaml
  support_case.drafts                                   flows/support_case/nodes/drafts/drafts.node.yaml
  support_case.drafts__gemini                           flows/support_case/nodes/drafts/gemini.node.yaml
  support_case.drafts__gpt                              flows/support_case/nodes/drafts/gpt.node.yaml
  support_case.drafts__mistral                          flows/support_case/nodes/drafts/mistral.node.yaml
  support_case.finalize                                 flows/support_case/nodes/finalize/finalize.node.yaml
  support_case.illustrate                               flows/support_case/nodes/illustrate/illustrate.node.yaml
  support_case.intent                                   flows/support_case/nodes/intent/intent.node.yaml
  support_case.intent__escalate                         flows/support_case/nodes/intent/escalate.node.yaml
  support_case.panel                                    flows/support_case/nodes/panel/panel.node.yaml
  support_case.polish                                   flows/support_case/nodes/polish/polish.node.yaml
  support_case.polish__critique                         flows/support_case/nodes/polish/critique.node.yaml
  support_case.polish__revise                           flows/support_case/nodes/polish/revise.node.yaml
  support_case.prepare                                  flows/support_case/nodes/prepare/prepare.node.yaml
  support_case.record                                   flows/support_case/nodes/record/record.node.yaml
  support_case.record__extract                          flows/support_case/nodes/record/extract.node.yaml
  support_case.record__validate                         flows/support_case/nodes/record/validate.node.yaml
  support_case.route                                    flows/support_case/nodes/route/route.node.yaml
  support_case.route__resolve                           flows/support_case/nodes/route/resolve.node.yaml
  support_case.search_kb                                flows/support_case/nodes/search_kb/search_kb.node.yaml
  support_case.tally                                    flows/support_case/nodes/tally/tally.node.yaml
  support_case.to_record                                flows/support_case/nodes/to_record/to_record.node.yaml
  support_case.triage                                   flows/support_case/nodes/triage/triage.node.yaml
  support_case.voice                                    flows/support_case/nodes/voice/voice.node.yaml
  support_case.vote                                     flows/support_case/nodes/vote/vote.node.yaml
  support_case.vote__ballot                             flows/support_case/nodes/vote/ballot.node.yaml
dataset (7)
  judge_panel_cases             datasets/judge_panel_cases.yaml
  long_customer_messages        datasets/long_customer_messages.yaml
  planted_defect_replies        datasets/planted_defect_replies.yaml
  support_case_cases            datasets/support_case_cases.yaml
  support_case_csv_review       datasets/support_case_csv_review.yaml
  support_case_csv_ui_demo      datasets/support_case_csv_ui_demo.yaml
  support_case_multimodal_demo  datasets/support_case_multimodal_demo.yaml
experiment (13)
  critique_planted_defects    experiments/critique_planted_defects/experiment.yaml
  critique_recall_by_agent    experiments/critique_recall_by_agent/experiment.yaml
  intent_ballot_pair          experiments/intent_ballot_pair/experiment.yaml
  intent_escalation_agents    experiments/intent_escalation_agents/experiment.yaml
  intent_split_long_messages  experiments/intent_split_long_messages/experiment.yaml
  judge_panel_agents          experiments/judge_panel_agents/experiment.yaml
  panel_aa_noise              experiments/panel_aa_noise/experiment.yaml
  panel_failure_scan          experiments/panel_failure_scan/experiment.yaml
  panel_single_judge          experiments/panel_single_judge/experiment.yaml
  reply_look                  experiments/reply_look/experiment.yaml
  reply_noninferior_mistral   experiments/reply_noninferior_mistral/experiment.yaml
  reply_overpromise_risk      experiments/reply_overpromise_risk/experiment.yaml
  reply_stage_budget          experiments/reply_stage_budget/experiment.yaml
arm (8)
  critique_planted_defects.critique_only  experiments/critique_planted_defects/arms/critique_only/flow.yaml
  critique_recall_by_agent.critic         experiments/critique_recall_by_agent/arms/critic/flow.py
  intent_ballot_pair.pair                 experiments/intent_ballot_pair/arms/pair/flow.yaml
  intent_ballot_pair.single               experiments/intent_ballot_pair/arms/single/flow.yaml
  intent_escalation_agents.escalation     experiments/intent_escalation_agents/arms/escalation/flow.yaml
  intent_split_long_messages.one_step     experiments/intent_split_long_messages/arms/one_step/flow.yaml
  intent_split_long_messages.two_step     experiments/intent_split_long_messages/arms/two_step/flow.yaml
  panel_single_judge.single_judge         experiments/panel_single_judge/arms/single_judge/flow.yaml
```

## Experiments

An experiment asks one quality question of a subject: a flow, a range of its top-level nodes, or an arm — a small
flow in `experiments/<experiment>/arms/<arm>/` (`flow.yaml` or `flow.py`) that only this experiment runs. Its
`description` states the hypothesis with its number, `failure_mode` names the failure it tests, its variants swap the
agents of nodes or swap arms, its cases come from a dataset, selected by tags, and its checks are the same evaluator
references an inference uses. `plan` is the series size the author recommends, not a limit. `lumen/experiments/`
covers every question kind and every kind of variant:

| Experiment | Failure mode | Subject and variants | Question |
|---|---|---|---|
| `reply_look` | | `support_case`, only `polish`, the regression cases | `look`: every case with its checks, no verdict |
| `reply_overpromise_risk` | `overpromise` | `support_case`, only `polish` | `threshold`: `promises` above 0.97 |
| `reply_stage_budget` | | `support_case`, `drafts` to `panel`, three drafting line-ups | `threshold`: `cost_usd` below one cent for each |
| `reply_noninferior_mistral` | `reply_quality` | `support_case`, only `polish`; gpt or mistral on `polish__revise` | `noninferior`: `critique` within 0.05, `cost_of_pass` guardrail |
| `judge_panel_agents` | `panel_wrong_winner` | `judge_panel`; gpt or deepseek on `decide__tie_break` | `compare`: `winner`, cost and latency guardrails |
| `panel_aa_noise` | | `judge_panel`, two identical variants | `compare` with margin 0: the noise floor of panel comparisons |
| `panel_failure_scan` | | `judge_panel`; gpt or mistral on the tie-break | `look`: nine built-in evaluators and its own `weakest_criterion` |
| `panel_single_judge` | `panel_wrong_winner` | `judge_panel` or the arm `single_judge`, on deepseek or qwen | `compare`: `latency_p50_ms`, with `winner` and failure guardrails |
| `intent_split_long_messages` | `intent_misread` | arms `one_step` and `two_step` | `compare`: `intent`, `cost_of_pass` guardrail |
| `intent_ballot_pair` | `intent_misread` | arms `single` and `pair` | `compare`: `intent`, `schema_valid_first_try` guardrail |
| `intent_escalation_agents` | `intent_misread` | arm `escalation`, only `escalate`, three agents | `noninferior`: `intent` within 0.1 |
| `critique_planted_defects` | `judge_misses_defect` | arm `critique_only` on planted defects | `threshold`: the verdict matches the label above 0.85; the `validated_by` of every `critique` judge check |
| `critique_recall_by_agent` | `judge_misses_defect` | arm `critic` written in Python (`flow.py`), three critic agents | `threshold`: `blocked` above 0.8 |

`aqven check` validates every experiment: the subject and its range, the arms, the agents of every variant, the
dataset and its tag filter, the references of the checks and the fields they read, the metric names, `validated_by`,
an `expected_output` on every case an `expected` check reads, and the finding files.

A series runs an experiment on the project server: every selected case for every variant, `repeats` times, each
attempt an ordinary run with a trace, the attempts interleaved case by case. The agent starts one with the MCP tools
`series_start` and `series_get` (with `wait_seconds`), a person with `uv run aqven series reply_look --path lumen` or
from Studio's Research mode. The server splits every dataset into `dev` and `holdout` cases by a hash of the case
name. **Explore** runs `dev` cases: numbers and failing cases to read, a `signal` at most. **Confirm** runs `holdout`
cases once the change is done: its verdict (`confirmed`, `refuted`, `inconclusive`, or a `signal` when the deciding
judge has no `validated_by`) writes a finding, `lumen/experiments/<experiment>/findings/<series>.yaml`, once, and
regenerates `lumen/FINDINGS.md`, grouped by failure mode; an `invalid` series and a look write none. A series whose estimate is above the project spend cap
(`research.spend_cap_usd`, $1.00 by default) waits for a person to approve it in Studio. Every attempt calls the
models live; the tests of this example never start a series.

A model that breaks the output contract is a result, not an infrastructure error. The `gemini` agent
(`gemini-2.5-flash-lite`) on `support_case.triage` broke the `maxLength: 200` of an observation on its first answer
and on both retries: the run ended `MODEL_RETRIES_EXHAUSTED`, and the series counted the attempt as a failure of that
variant. The engine refused the invalid output as designed, and the experiment made the risk visible before
production. Provider errors, timeouts and missing keys are infrastructure errors: they are not counted, and above 5%
of the attempts they make the series `invalid`.

[AGENTS.md](AGENTS.md) holds the loop a coding agent runs with these tools: build the flow, check it, look at the
cases, turn the failures it reads into hypotheses, explore them on `dev`, confirm once on `holdout`, apply the
finding, and repeat until the flow is reliable.

## Models

The example runs on the cheapest OpenRouter models that have the capabilities its agent nodes need (owner's decision
of 2026-09-17). `aqven.yaml` declares one provider, `openrouter`, with `routing {data_collection: deny, zdr: false}`:
the cheapest endpoints of some models, and the `painter` fallback, are not ZDR. The agent table, the exceptions and
the reasons are in [DESIGN.md](DESIGN.md) §6.1–§6.2.

| Agent | Model |
|---|---|
| `gpt`, `resolver` | `openrouter:openai/gpt-oss-20b` |
| `gemini` | `openrouter:google/gemini-2.5-flash-lite` |
| `mistral`, `researcher` | `openrouter:mistralai/mistral-nemo` |
| `deepseek` | `openrouter:deepseek/deepseek-v4-flash-0731` |
| `qwen` | `openrouter:qwen/qwen3-30b-a3b-instruct-2507` |
| `llama` | `openrouter:meta-llama/llama-3.1-8b-instruct` |
| `painter` | `openrouter:google/gemini-3.1-flash-lite-image`, fallback `openrouter:openai/gpt-5-image-mini` |

The key is `OPENROUTER_API_KEY`, in the project `.env` or in the process environment. `uv run aqven models check
--project examples/lumen` prints the output mode of every agent, and `--live` sends one tiny request per mode.

## Load

Two knobs, both optional ([ADR-0044](../docs/adr/0044-provider-rate-limit-and-worker-pool.md)).

**The request rate to the provider** is declared on the provider in `aqven.yaml`, and in this example it is
`limits.rpm: 60` — one request a second. Slots are handed out at an even interval and idle time does not earn the
right to a burst, so the limit is never exceeded. The value is illustrative: the real ceiling depends on your plan,
so raise it to yours.

**How many nodes run at once** is not set by a file but by the project setting `runtime.max_parallel` — that is a
property of the machine rather than of the workflow, and a laptop and a CI runner want different numbers. Override it
for one run with a flag:

```
uv run aqven run --flow support_case --input examples/lumen/samples/case_request.json --max-parallel 4
```

Both are independent of the node-level knob: the `map` in `support_case/nodes/vote` carries `concurrency: 3`, and the
effective concurrency is the smallest of the three.

## Running it

```
uv run aqven generate examples/lumen
uv run aqven check examples/lumen
uv run aqven tree examples/lumen
uv run aqven refs inference:revise examples/lumen
uv run pytest examples
```

The scenario tests replay cassettes from `tests/cassettes/support_case/<scenario>/` with no network. Re-recording a
scenario is a separate pytest run with an OpenRouter key:
`AQVEN_LIVE=1 uv run pytest examples/tests/test_support_case.py -k <scenario>`; the `record_new` mode replays what is
already recorded and appends only the new requests.

`run`, `serve`, `studio`, `dev` and `mcp` work; `fmt`, `plan` and `build` still answer "not implemented" with exit
code 2.

## Four ways to start it

`lumen/app.py` loads `lumen/.env`, reads typed environment settings and assembles the application the same way
`aqven serve` does: API, Studio, MCP, the engine and the access token. `lumen/__main__.py` runs it under uvicorn.

| Way | Command or code |
|---|---|
| Developer CLI | `uv run aqven dev lumen` — the server, file watching and Studio in the browser |
| Its own entry point | `uv run python -m lumen`, or the console command `uv run lumen` — uvicorn on `AQVEN_HOST:AQVEN_PORT`, printing the URL with the token |
| Your own uvicorn | `uv run uvicorn lumen.app:app` — the same application under your own server |
| Inside another application | `lumen.app.host_application()` — a `FastAPI` that mounts `lumen.app.app` at `/aqven` and carries its lifespan through `local_app_lifespan` |

In process, with no server: `await lumen.app.handle_case(lumen.app.sample_request())` — `Project.load` → `flow_typed`
→ `run`; `start`, `events`, `waits`, `resume`, `fork` and `cancel` are available the same way.

Your own guard instead of the local token: `create_local_app(root, LocalAppOptions(access=None))` returns the
application unprotected, so the host closes it with its own authentication; `access=<your object>` wraps the
application in your own ASGI guard. Studio does not work under a path prefix (the bundle references absolute
`/assets/...` paths); the API, SSE and MCP do.

## Environment variables

They are read after `.env`; process variables win over `.env`, and explicit arguments in code and on the CLI win over
both. A wrong value stops startup with an error that names the variable.

| Variable | Default | Meaning |
|---|---|---|
| `AQVEN_STUDIO` | `true` | `false` — API, SSE and MCP only: no Studio page, no chat, no browser |
| `AQVEN_HOST` | `127.0.0.1` | bind address |
| `AQVEN_PORT` | `5180` | port |
| `AQVEN_OPEN_BROWSER` | `false` for `python -m lumen` and `aqven serve`, `true` for `aqven dev` | whether to open a browser |

## Any HTTP and MCP client

The contract is OpenAPI at `/api/openapi.json`, the event schemas are at `/api/schemas/events`, events are plain SSE,
and authorization is `Authorization: Bearer <token>` (the same token is in `.aqven/server.json` and in the URL that
`python -m lumen` prints).

```
TOKEN=$(python -c "import json,sys; print(json.load(open('lumen/.aqven/server.json'))['token'])")
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:5180/api/project
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"flow_id\":\"support_case\",\"mode\":\"live\",\"input\":$(cat lumen/samples/case_request.json)}" \
  http://127.0.0.1:5180/api/runs
curl -N -H "Authorization: Bearer $TOKEN" http://127.0.0.1:5180/api/runs/$RUN/events
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"address":{"node_id":"approvals__lead","branch_key":"lead"},"attempt":1,"payload":{"decision":"approve"},"client_op_id":"01JBQ7WV3M9XYZK4T8S2D6N0PQ"}' \
  http://127.0.0.1:5180/api/runs/$RUN/resume
```

MCP over stdio (the project's `.mcp.json`) — for Claude Code, Cursor and any other client:

```json
{"mcpServers": {"aqven": {"type": "stdio", "command": "uv", "args": ["run", "aqven", "mcp", "lumen"]}}}
```

The same set of tools is available over streamable HTTP at `http://127.0.0.1:5180/mcp/` with the same bearer token,
and `aqven.app.create_mcp_server(root)` returns an `mcp` 2.2.0 server object — you can run it over stdio, mount it on
any path, or combine it with your own tools.
