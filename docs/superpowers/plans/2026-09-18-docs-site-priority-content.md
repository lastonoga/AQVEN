# Priority Content Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the stub body of the four highest-priority documentation pages — Models & Providers, Structured
Output & Types, Designing Reliable Workflows, and For AI Coding Agents — with real content, grounded in AQVEN's
actual mechanics (`project-structure.md`, ADR-0025/0026/0027, DECISIONS.md) and the Lumen showcase's real files,
not invented examples.

**Architecture:** Each task edits exactly one existing stub file under `site/src/content/docs/`, replacing its
placeholder body. Frontmatter (`title`, `description`) is unchanged — it already matches the design spec. No new
pages, no navigation changes; that's already wired from the scaffold plan.

**Tech Stack:** Same Astro/Starlight site from the scaffold plan — no new dependencies.

**A note on this plan's format:** `writing-plans` normally requires the exact final content pre-written in every
step, to remove ambiguity for whoever executes it. For prose documentation (as opposed to code), pre-writing the
exact content *is* the work, not a shortcut around it — so that's what the steps below contain: the complete,
final Markdown for each page, not an outline for someone else to flesh out later.

**Ground truth used for every claim below** (so a reviewer can check it without re-deriving it):
- Provider/output-mode config: `aqven-py/docs/project-structure.md` §7.
- Lumen's real agents, models and the `polish` loop YAML: `aqven-py/examples/showcase/README.md`.
- The `oneOf`/strict-schema-per-provider rule and the allowed-set threshold: `docs/DECISIONS.md`, "Структурированный
  вывод" section.
- The real `AGENTS.md` this plan adapts: `aqven-py/examples/showcase/AGENTS.md`.
- The engineering-judgment claims (compounding error, divergence, critic loops): the workflow-design research
  already reviewed in this conversation (Lusser's law figures, Huang et al. on self-correction, DIPPER on
  diversity sources).
- The structured-output claims (field order, nesting depth, enums/unions): the JSON-schema-design research already
  reviewed in this conversation.

---

### Task 1: Models & Providers

**Files:**
- Modify: `site/src/content/docs/models-and-providers.md`

- [x] **Step 1: Replace the stub body**

Edit `site/src/content/docs/models-and-providers.md`, replacing everything after the frontmatter's closing `---`
with:

```markdown
## Configuring a provider

`aqven.yaml` lists the providers a project may call. An agent then names a model as `provider:model`.

| Key | Meaning |
|---|---|
| `id` | the provider prefix used in `model:` (`openrouter:openai/gpt-oss-20b`) |
| `kind` | `catalog` (default), `code`, or `openai_compatible` |
| `api_key` | `ref:env/NAME`; optional for a keyless provider |
| `base_url` | required for `openai_compatible` |
| `run` | `module:function` factory, only with `kind: code` |
| `data_policy`, `routing` | PII/retention policy, OpenRouter routing (`data_collection`, `zdr`) |

A `catalog` provider forwards straight to the Pydantic AI provider registry — nothing to write. `openai_compatible`
builds an `OpenAIChatModel` over an OpenAI-compatible `base_url` with no code. `code` is for anything else: a
function `def build(model_name: str, context: ProviderContext) -> Model` returns a plain `pydantic_ai.models.Model`,
so it goes through the same guarantee chain as a catalog model — outcome gate, PII redaction, cassettes, budget,
backoff.

The Lumen example runs every agent on OpenRouter, picked for the cheapest endpoint with the capabilities each node
needs:

| Agent | Model |
|---|---|
| `gpt`, `resolver` | `openrouter:openai/gpt-oss-20b` |
| `gemini` | `openrouter:google/gemini-2.5-flash-lite` |
| `mistral`, `researcher` | `openrouter:mistralai/mistral-nemo` |
| `deepseek` | `openrouter:deepseek/deepseek-v4-flash-0731` |
| `qwen` | `openrouter:qwen/qwen3-30b-a3b-instruct-2507` |
| `llama` | `openrouter:meta-llama/llama-3.1-8b-instruct` |
| `painter` | `openrouter:google/gemini-3.1-flash-lite-image`, fallback `openrouter:openai/gpt-5-image-mini` |

## Output mode

An agent declares `output.mode: auto | tool | native | prompted` (default `auto`).

| Mode | What the model is asked to do |
|---|---|
| `tool` | call an output tool with the declared schema |
| `native` | use the provider's native structured-output support |
| `prompted` | answer with JSON described in the instructions |
| `auto` | resolved once at compile time from a table of known models, then the Pydantic AI model profile; mixed fallback models resolve to `prompted` |

`auto` is deterministic — there is no environment flag and no switch at run time. The resolved mode is visible in
`aqven tree`, in the compiled IR, and over the Studio API. `aqven check` reports `W_OUTPUT_MODE_RESOLVED` when
`auto` differs from the profile default, and `E_OUTPUT_MODE_UNSUPPORTED` when an explicit mode is impossible for
that model.

```
uv run aqven models check --project examples/showcase/src/lumen
```

prints what each agent's mode resolves to; `--live` sends one tiny request per mode to confirm it against the real
provider rather than trusting the static table. Run this before picking a model from memory — a provider can change
its structured-output support without notice.

## Choosing a model class for the job

AQVEN's node kinds map onto a small set of jobs, and the jobs differ in what they need from a model:

| Job | Needs | Example in Lumen |
|---|---|---|
| Extractor | Grounded, schema-constrained, cheap | `record.extract` — pulls structured fields from the case description |
| Classifier / router | Fast, closed-set, cheap | `intent` (`switch`), `route` (`switch`) |
| Generator | Fluent, open-ended, can be a stronger model | `drafts` (`parallel` across `gpt`, `mistral`, `gemini`) |
| Judge / critic | Reasoning-capable, ideally a different model family than the generator it's judging | `judge_panel.judges` (`deepseek`, `qwen`, `llama` — three different families voting), `polish.critique` (`mistral`, judging `gpt`'s draft) |
| Aggregator | Deterministic code, not a model call, wherever possible | `tally`, `judge_panel.aggregate` |

The `polish.critique` → `polish.revise` pair is deliberate: the critic (`mistral`) is never the same model family as
what it's grading (`gpt`'s `revise` output). A model judging its own output is a documented failure mode — critic
and generator sharing a model and context makes the critique uninformative. Pick the critic's model before you pick
its prompt.

Cheap, fast models (small OpenRouter endpoints, Haiku-class, Flash-class) are the right default for extractors and
classifiers, where the job is narrow and schema-constrained. Reserve a stronger, more expensive model for the
generator step and for judges that need to catch subtle problems — not for every node in the graph.
```

- [x] **Step 2: Build and verify**

Run: `pnpm --filter @aqven/site build`

Expected: `astro check` reports 0 errors, `astro build` completes, exit code 0.

```bash
grep -q 'openrouter:openai/gpt-oss-20b' site/dist/models-and-providers/index.html && echo OK
```

Expected output: `OK`

- [x] **Step 3: Commit**

```bash
git add site/src/content/docs/models-and-providers.md
git commit -m "$(cat <<'EOF'
Write the Models & Providers page

Provider config, output-mode resolution, and a model-class-to-job
table grounded in the Lumen showcase's real agents — including why
polish.critique deliberately uses a different model family than the
draft it's grading.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Structured Output & Types

**Files:**
- Modify: `site/src/content/docs/structured-output-and-types.md`

- [x] **Step 1: Replace the stub body**

Edit `site/src/content/docs/structured-output-and-types.md`, replacing everything after the frontmatter's closing
`---` with:

```markdown
Getting a model to return valid JSON is solved. Getting it to return *good* JSON — the right values, reasoned in
the right order, without quietly hallucinating a field it couldn't fill — is a schema design problem, and AQVEN's
type system is built around a specific set of answers to it.

## Reasoning before answer

Under constrained decoding, a model emits the fields of a schema in order, left to right, with no ability to revise
an earlier field once a later one is generated. A field placed before an answer field is a real scratchpad — the
model can reason in it before committing. A field placed *after* the answer is a postmortem: it explains a decision
the model already made, not one it's still making.

**Rule: any reasoning, evidence, or rationale field goes before the answer/label field it supports, always.** This
is why `judge_panel`'s `tie_break` inference and every `critique` inference in Lumen declare their rationale field
ahead of the verdict field in `out` — not as a style preference, but because the field order is what the model
actually reasons through.

## Depth and size

Two to three levels of nesting is the comfortable zone; four or more produces systematic errors — values land on
the wrong level, whole nested objects get skipped. AQVEN's own type kinds (`enum`, `id`, `record`, `union`, `value`)
stay flat by design: a `record` composes other named types by reference, not by inlining them, so a type's own
declaration rarely nests more than one level deep even when the composed shape is complex.

If a node's `in`/`out` is approaching a few dozen fields, that's a signal to split it into more than one extractor
node rather than widen a single schema — not a hard limit AQVEN enforces, but a pattern worth building into a
flow's shape from the start.

## Enums and discriminated unions

A closed set of values should be an `enum` type, not a free-text string with a description asking the model to
pick from a list — constraining the token space is the one schema choice that both improves accuracy and removes
an entire class of hallucinated values. Lumen's `types/enums/` folder is full of these: `CaseIntent`,
`ApprovalDecision`, `ReplyCriterion`.

When a value can be one of several *shapes*, not just one of several labels, that's a `union` type with a
discriminator — never a single object with every variant's fields made optional. An optional-everything object
invites a model to fill in fields from two variants at once. Lumen's `types/unions/case_origin.yaml` and
`case_record.yaml` are discriminated unions; each variant carries its own tag, and the tag is what a `switch` node
branches on.

There is no single enum-size ceiling, but past roughly fifty values a static enum stops being the right tool —
retrieve a short candidate list first and constrain the schema to that instead of shipping the full set on every
call.

## Required, nullable, and allowed sets

A `required` field with no nullable path forces a model to invent a value when the source data genuinely doesn't
have one. Anything that can legitimately be absent from the input must be typed so the model can say so, not
coerced into looking complete. `types/ids/` values that reference a real, bounded set of identifiers (an
`allowed_set`) work the same way at the identifier level: up to about fifty values, list them inline; past that,
the identifier moves to an indexed lookup rather than being embedded whole in every schema.

## There is no one strict schema for every provider

OpenAI, Anthropic, and Gemini support different, overlapping subsets of JSON Schema under their strict/native
structured-output modes — `oneOf` behaves differently everywhere, numeric and string constraints aren't enforced
identically, and recursion support varies. AQVEN compiles a schema per **(type × provider)** pair rather than
maintaining one portable schema and hoping every provider interprets it the same way. `output.strict` is resolved
per profile, not assumed on: an agent gets `strict: true` only when its declared output mode and the resolved
provider profile are actually compatible, otherwise AQVEN falls back rather than sending a schema the provider
would reject or silently ignore.
```

- [x] **Step 2: Build and verify**

Run: `pnpm --filter @aqven/site build`

Expected: `astro check` reports 0 errors, `astro build` completes, exit code 0.

```bash
grep -q 'Reasoning before answer' site/dist/structured-output-and-types/index.html && echo OK
```

Expected output: `OK`

- [x] **Step 3: Commit**

```bash
git add site/src/content/docs/structured-output-and-types.md
git commit -m "$(cat <<'EOF'
Write the Structured Output & Types page

Field-order, nesting-depth, enum/union, and nullable-field rules,
each grounded in a real Lumen type or inference rather than an
abstract example, plus the per-(type x provider) strict-schema rule
from DECISIONS.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Designing Reliable Workflows

**Files:**
- Modify: `site/src/content/docs/designing-reliable-workflows.md`

- [x] **Step 1: Replace the stub body**

Edit `site/src/content/docs/designing-reliable-workflows.md`, replacing everything after the frontmatter's closing
`---` with:

```markdown
A flow is a graph of decisions about where a single model call isn't enough. This page is the judgment behind
those decisions — when to split a step in two, when to run several attempts in parallel, when a critic loop earns
its cost, and when to stop adding nodes and add error recovery instead.

## Start with one call

The default shape is a single LLM node with good context and a clear schema. Split it only when you hit a concrete
reason to: the step needs a different *kind* of judgment partway through, the cost of a wrong answer justifies a
checkpoint, there's a deterministically checkable artifact you can gate on, or one part of the job is cheap and
narrow while another is expensive and open-ended. "It might need this later" is not a reason — added nodes are
added chances to fail, not just added capability.

## Compounding error is a budget, not a detail

Every LLM node's accuracy multiplies with every other node downstream of it: five nodes at 95% each compound to
roughly 77% end to end; ten nodes at 95% drop to roughly 59%. Past about five to seven LLM nodes without a gate
between them, the fix is not "add more nodes carefully" — it's adding error recovery: a `try` around the risky
step, a retry at the subtask level, or a `gate` that stops a bad intermediate result from ever reaching node six.
Lumen's `support_case` flow has around fifteen top-level nodes precisely because several of them are `code` steps
and gates, not LLM calls — the LLM-node count on any single path through the graph stays well inside the budget.

## Divergence: when running N attempts actually helps

Running the same step multiple times and combining the results (`map` + an aggregator, or `parallel` + a vote)
only pays off when the errors between attempts are independent. If the task has one correct, checkable answer and
variance comes from temperature or sampling, divergence works — that's exactly what Lumen's `vote` (`map` over
perspectives) feeding `tally` does for intent classification. If the answer is open-ended, or the variance comes
from the prompt or context rather than the sampling, running it three more times just produces three more similar
mistakes for the price of three more calls.

Diverse *prompts or models* separate attempts far better than temperature alone on the same prompt and model — a
homogeneous ensemble is a more expensive single attempt in disguise. `judge_panel.judges` runs `deepseek`, `qwen`
and `llama` — three different model families — in parallel for exactly this reason, not three temperature-varied
calls to one model.

## Critic loops: only with an external signal

A model reviewing its own output, in its own context, with no outside signal, is not a reliable way to catch
errors — self-review without an external check has a well-documented tendency to leave correct answers alone at
best and talk the model out of correct answers at worst. A critic loop earns its cost only when there's something
outside the generator to check against: a schema, a test, a retrieval-grounded fact, or — as in Lumen's `polish`
loop — a critic that is a genuinely different model than the generator it's reviewing.

```yaml
node: "loop"
body:
  - "revise"
  - "critique"
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

`revise` runs on `gpt`; `critique` runs on `mistral` — a different family, so the critique isn't the generator
grading its own homework. Two `stop` policies bound the loop from two directions: `threshold` ends it as soon as
the score is good enough, `stagnation` ends it when another iteration stopped helping, so the loop doesn't grind on
past the point of diminishing returns. `select: best` means even if the loop runs out its `max_iter` without
crossing the threshold, the best iteration seen wins rather than whatever happened to run last. Most of a critic
loop's benefit shows up in its first one or two iterations — `max_iter: 3` is a sensible default ceiling, not a
number to raise reflexively when quality still isn't good enough (that's usually a sign the prompt or the model
needs to change, not that the loop needs another round).

## Gates between steps

Anywhere a step produces something checkable — a schema, a range, a reference that must resolve — check it in code
immediately after the step, before the result feeds the next node. `aqven check`'s simulated run does this for an
entire flow before any real model is ever called: it generates values from the schemas, runs every node with
simulated answers, and reports `E_SIM_NODE_FAILED`, `E_SIM_OUTPUT_INVALID` and `W_SIM_NODE_UNREACHED` for anything
that doesn't hold together. Catching a broken contract there costs nothing; catching it three nodes downstream
after a real model call costs tokens, latency, and a harder-to-read failure.

## What not to do

| Pattern | Symptom | Instead |
|---|---|---|
| One node doing everything | Silent partial failure, no single piece is testable | Split where the kind of judgment changes |
| More than 5-7 LLM nodes with no gate between them | Errors compound invisibly until the output is unusable | Add gates and per-step retry, not more nodes |
| Divergence on an open-ended or prompt-sensitive task | N calls, N similar mistakes, no accuracy gain | Fix the prompt/context, or diverge on model/prompt instead of temperature |
| A critic loop with no external signal, same model as the generator | Loop can degrade a correct answer as easily as fix a wrong one | Use a different model as critic, or add a real verifier |
| A loop with only `max_iter`, no `stop` condition | Runs to the cap even after it stopped helping | Add `threshold`/`stagnation` stop policies |
| No gate after a step with a checkable output | Bad data flows downstream before anyone notices | `aqven check`'s simulated run, or an explicit `gate` node |
```

- [x] **Step 2: Build and verify**

Run: `pnpm --filter @aqven/site build`

Expected: `astro check` reports 0 errors, `astro build` completes, exit code 0.

```bash
grep -q 'Compounding error is a budget' site/dist/designing-reliable-workflows/index.html && echo OK
```

Expected output: `OK`

- [x] **Step 3: Commit**

```bash
git add site/src/content/docs/designing-reliable-workflows.md
git commit -m "$(cat <<'EOF'
Write the Designing Reliable Workflows page

Decomposition, compounding-error budget, divergence, and critic-loop
rules, with Lumen's real polish loop (revise/critique/stop/select) as
the worked example instead of an abstract one, plus an anti-pattern
table.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: For AI Coding Agents

**Files:**
- Modify: `site/src/content/docs/for-ai-agents.md`

- [x] **Step 1: Replace the stub body**

Edit `site/src/content/docs/for-ai-agents.md`, replacing everything after the frontmatter's closing `---` with:

```markdown
If you're an AI coding agent working in an AQVEN project — or a developer setting one up for an agent to work
in — this page is the starting point.

## The MCP contract

Every AQVEN project exposes an `aqven` MCP server (`.mcp.json`, `uv run aqven mcp <project>`) with the tools an
agent needs to read and change the project without hand-editing every file:

| Tool | Use it for |
|---|---|
| `flow_list`, `flow_get` | Read the current plan |
| `flow_patch` | Structural and cross-file edits: renaming or moving a flow, node, agent, tool or type; adding or removing a node |
| `aqven_check` | Run after every edit — the project's gate |
| `prompt_preview` | Run after every prompt edit — see the exact messages a node will send |
| `pyright_check`, `pytest_run` | Type-check and test code changes |
| `run_start`, `run_get`, `run_events` | Run a flow and inspect what happened |

## Edit rules

- **Edit directly** (Read/Edit/Write) for prompt text, one node's settings, descriptions, point fixes.
- **Edit only through `flow_patch`** for anything structural or cross-file: renames, moves, adding or removing a
  node. It updates every reference and writes the rename journal that lineage tracking depends on.
- Optimistic locking is content-hash based (CAS): `flow_patch` answers `STALE_FILE` when the file changed under
  you — re-read it and repeat the intended change. Never overwrite by force.
- Never hand-edit a project's generated `types.py` — it's rebuilt from the YAML and every edit is overwritten.
  Change the YAML source and run `aqven generate`.

## The check loop

`aqven check` is the whole safety net in a project that has no test suite of its own: it validates every file
statically, then simulates every flow end to end with generated values — no network, no tokens spent — and
reports diagnostics with a code, a file path, and usually a hint that names the exact fix.

| Code prefix | Meaning |
|---|---|
| `E_` | Error — the project isn't runnable. Fix before finishing; `aqven check` exits 1 while any error remains. |
| `W_` | Warning — it runs, but something's unclear or unpinned. |
| `E_SIM_*` | A simulated run of a flow failed; the hint carries the input the simulation used. |
| `W_SIM_NODE_UNREACHED` | No simulated input reaches this node — check the branches above it. |

Run it after every edit, not just before finishing. In projects configured with Claude Code hooks, this happens
automatically: `PostToolUse` runs `aqven check --static` after each file edit, `Stop` runs the full check (static
plus simulated runs) before the turn ends.

## A working `AGENTS.md`

Every AQVEN project should ship an `AGENTS.md` a coding agent reads first. This is adapted from the real one in
the Lumen example — the full version also covers `.aqven/` and test-fixture rules — copy it as a starting point
and adjust the project-specific facts (module path, tool names):

```markdown
# Rules for coding agents

`lumen` is an aqven project: AI workflows are YAML files next to the Python code they use.

## Rules

1. **`aqven check` must pass after every change.** It is the gate of this project. Fix every error before you
   finish; do not ask a model to try the flow instead.
2. Never edit the generated `types.py`. Change the YAML instead.
3. Structural changes across files go through the `flow_patch` tool of the `aqven` MCP server. Edit by hand only
   inside one file: prompt text, descriptions, settings, one node. If `flow_patch` answers `STALE_FILE`, read the
   file again and repeat the change; never overwrite a file by force.
4. **After editing a prompt, run `aqven prompt preview <flow>.<node> --project <path>`** and read what the model
   will actually receive.
5. **Choose a model with `aqven models check`, not from memory.**
6. API keys live only in the project's `.env`, gitignored. Never read, print or edit `.env` files.
7. **Tests never call model providers.** They replace models with `FunctionModel` through the `aqven_engine`
   fixture; force a branch in a scenario test with a node output override, never by hoping a model answers a
   certain way.
```

## Where the rest of the rules live

This page is the index, not the whole story — the rules an agent needs for the decisions inside a flow live where
every reader finds them:

- [Models & Providers](/models-and-providers/) — which model class fits which node, and how to verify a choice
  instead of assuming it.
- [Structured Output & Types](/structured-output-and-types/) — field order, nesting, enums, unions, the rules that
  make a schema get good answers instead of just valid JSON.
- [Designing Reliable Workflows](/designing-reliable-workflows/) — when to split a node, when divergence helps,
  when a critic loop is worth its cost, and the compounding-error budget that caps how long a chain of LLM nodes
  should get before it needs a gate instead of another node.
```

- [x] **Step 2: Build and verify**

Run: `pnpm --filter @aqven/site build`

Expected: `astro check` reports 0 errors, `astro build` completes, exit code 0.

```bash
grep -q 'flow_patch' site/dist/for-ai-agents/index.html && echo OK
```

Expected output: `OK`

- [x] **Step 3: Commit**

```bash
git add site/src/content/docs/for-ai-agents.md
git commit -m "$(cat <<'EOF'
Write the For AI Coding Agents page

The MCP tool contract, edit rules (direct vs flow_patch-only, CAS/
STALE_FILE), the aqven check diagnostic loop, a condensed real
AGENTS.md template, and cross-links to the three rule pages this one
indexes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** these are the four pages the user specifically flagged as important after reviewing the
  scaffold plan's stub pages — model-selection rules, structured-output rules, workflow-design rules, and the
  agent-facing section. The remaining eleven stub pages (Getting Started, Core Concepts, Building Flows, Testing &
  Evaluation, the four generated-reference pages, Examples) are unaffected and stay as scaffold-plan placeholders
  until a later content pass.
- **Placeholder scan:** every task's Step 1 is the complete, final page body — no outline, no "expand this later."
- **Fact-checking:** every concrete claim about AQVEN's own mechanics (provider config keys, output-mode table,
  the `polish` loop YAML, the real `AGENTS.md` rules) is copied or directly derived from files already read in
  this conversation, not invented; the `AGENTS.md` reproduction is explicitly labeled "adapted," not verbatim,
  since it's condensed from nine rules to seven.
- **Link consistency:** the cross-links added to the For AI Coding Agents page (`/models-and-providers/`,
  `/structured-output-and-types/`, `/designing-reliable-workflows/`) match the slugs the scaffold plan already
  built and verified.
