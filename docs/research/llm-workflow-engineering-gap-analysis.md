# LLM workflow engineering practices — gap analysis against AQVEN

**Purpose:** this file is the synthesis a coding agent should read before doing engineering work on
AQVEN's compiler, type system, provider layer, evals, or its own workflow-authoring guidance. It cross-
checks three external research documents on production LLM-workflow engineering against AQVEN's own
pre-implementation design docs (`docs/*.md`, `docs/adr/*.md`) and its real implemented code
(`packages/aqven/`, `packages/aqven-llm/`). Produced 2026-09-22 by 8 parallel research passes, each
reading the source research in full and verifying every claim against real files — not from memory.

**Source documents** (preserved in full as evidentiary base, per this project's `docs/research/`
convention — never delete, treat `UNVERIFIED:`-style caveats in them as real):
- [`llm-workflow-production-patterns-and-providers.md`](llm-workflow-production-patterns-and-providers.md)
  ("Doc 1") — production LLM-workflow problems/patterns, model/provider capability profiles, structured-
  output guarantees per provider, OpenRouter/Together practice, constrained-decoding engines.
- [`llm-workflow-decomposition-decision-framework.md`](llm-workflow-decomposition-decision-framework.md)
  ("Doc 2") — an engineering decision framework: when to decompose a task into steps, when divergence/
  self-consistency pays off, when a critic/judge loop pays off, context sufficiency, testing by node
  archetype, node-archetype heuristics, anti-patterns.
- [`json-schema-design-rules.md`](json-schema-design-rules.md) ("Doc 3") — JSON Schema design rules for
  reliable structured output: field ordering, nesting depth, enum sizing, unions, nullable fields,
  arrays, recursion, descriptions, strict-mode tradeoffs, a 20-rule linter checklist.

**How to read this file:** each of the 8 sections below states what the research recommends, what
AQVEN's own *design docs* already say (which may be pre-Python-pivot and unreconciled — check the
`✅`/`⚠️` marker in `docs/README.md`), and what the *real code* actually does today — these two layers
diverge in several places, and the divergence itself is often the most important finding. Citations to
`file:line` and doc sections are for the engineer/agent reading this file — they do not belong on the
public documentation site (`apps/site/`), per `apps/site/CONVENTIONS.md`.

---

## TL;DR — the findings that matter most

Ranked by how much they matter if left unaddressed, not by section order:

1. **A silently-ignored config value.** `AgentOutputSpec.on_refusal` / `on_truncated` (values
   `fail`/`fallback`) are real spec fields, threaded through spec → IR → compiler, and `aqven check`
   accepts them without complaint. **Nothing in the runtime reads them.** Setting `fallback` behaves
   identically to `fail` — the elaborate recovery routing described in `docs/10-runtime.md` §4.2 and
   ADR-0029 §3 (bump `max_tokens` → fall back to a larger-context profile → escalate to a human) has zero
   real implementation. This is worse than an unbuilt feature: it's a config surface that *looks*
   implemented and silently isn't — exactly the anti-pattern Doc 1/Doc 2 warn about. See §4.

2. **A likely live correctness bug in discriminated unions.** AQVEN's own type compiler
   (`spec/modelgen.py`) emits Pydantic-style `oneOf` + `discriminator` schemas for every discriminated
   union — confirmed live via a real test asserting `"oneOf" in shape["json_schema"]` for the showcase's
   `CaseRecord` union. Doc 3 §4.1 states `oneOf` is rejected outright by OpenAI strict mode (root and
   nested) and silently *not enforced* by Gemini. AQVEN has no `oneOf`→`anyOf` rewrite of its own, and no
   test confirming whether Pydantic AI's built-in per-provider transformer fixes this before the wire
   request. This needs a golden wire-schema test before it's safe to assume the union type system works
   correctly on OpenAI or Gemini. See §2.

3. **OpenRouter's silent guarantee-degradation risk has a design but no code.** `docs/11-providers.md`
   §7.1 already designs the exact mitigation Doc 1 recommends (`require_parameters: true`,
   `allow_fallbacks: false`, provider `order` pinning) and calls the current default "a silent
   degradation of typing" — but the real `OpenRouterRouting` dataclass
   (`packages/aqven-llm/src/aqven_llm/routing.py`) implements only the PII/privacy fields
   (`data_collection`, `zdr`); none of the reliability fields exist. Every AQVEN workflow routed through
   OpenRouter today has zero code-level protection against a request silently routing to a provider that
   doesn't actually support the schema strictness the workflow author asked for. See §2, §4.

4. **AQVEN's own design docs already specify most of what this research recommends — and the compiler
   doesn't implement it.** `docs/07-compiler.md` names real rule codes — R-35 (reasoning-before-answer,
   matching Doc 3 §1.1 almost verbatim), R-36 (nesting depth ≤3, matching Doc 3 §2.2's "3 is the
   ceiling"), R-37a (a tiered enum-size budget more precise than Doc 3's own numbers, grounded in
   OpenAI's real limits) — but **none of the three is actually implemented as a compiler check.** Worse,
   `diagnostics.py`'s `RULE_BY_CODE` maps the label "R-36" to `E_TYPE_RECURSIVE`, an unrelated check for
   self-referential types with no depth-counting logic at all — so a future reader trusting the code's own
   rule-code mapping will be misled about what R-36 actually checks. See §3.

5. **A previously-planned public-docs page on exactly this material was scoped, then silently dropped.**
   An earlier site-design draft (`docs/superpowers/specs/2026-09-18-docs-site-design.md`, item 7 of the
   site structure) explicitly planned a page — "Designing Reliable Workflows" — covering decomposition
   heuristics, divergence, critic-loop rules, and compounding-error math, citing "the research doc's
   existing ASCII decision tree" (this same research, or an earlier version of it). The site-IA redesign
   that superseded that draft and now governs the live site
   (`docs/superpowers/specs/2026-09-21-aqven-docs-ia-design.md`) has 11 Concepts pages and none of them
   is this page — the cut is undocumented, with no recorded rationale. See §8.

6. **The showcase project already demonstrates every good pattern this research recommends for
   divergence/critic loops — but nothing forces new flows to follow them.** `examples/lumen`'s
   `judge_panel` flow uses a family-diverse judge panel with a compiler-enforced `requires:` contract
   (`families_distinct`, `family_disjoint_from_input`); `support_case`'s `polish` loop sets both a
   `threshold` and `stagnation` stop policy with a cross-family critic, matching Doc 2 §3.4's stop-
   condition guidance almost exactly. But the `requires:` contract is opt-in per flow, `LoopNodeSpec.stop`
   is optional with no compiler nudge to set it, and there's no built-in majority-vote join policy (two
   showcase flows hand-roll their own, slightly different Counter-based vote logic). Nothing stops a new
   flow from building an unguarded self-judging critic loop today. See §5.

7. **Judge calibration is designed in unusual depth and has zero real implementation.**
   `docs/13-evals-and-gates.md` and ADR-0029 §10 specify a hard BLOCK/WARN/OFF admission gate on judge
   quality (quadratic-weighted Cohen's κ ≥ 0.70, Krippendorff's α ≥ 0.80, ≥100 labeled examples) and even
   name the exact `statsmodels`/`numpy` calls to use — more rigorous than Doc 2's own illustrative
   numbers. `packages/aqven/src/aqven/evals/statistics.py` has no κ/α/ICC/τ implementation at all, and
   `gate.py`'s admission rules never reference judge calibration. This is pure implementation debt, not a
   design gap. See §6.

8. **AQVEN has a substantial, detailed pre-Python-pivot "archetype" design (extractor, classifier,
   scorer, generator, judge, aggregator, critic_reviser, planner, router, ...) that maps closely onto Doc
   2's own node-archetype taxonomy — and its post-pivot fate has never been decided.** No ADR from 0025
   onward affirms, drops, or rescopes it; the real spec has zero trace of it; several existing open
   questions (F-20, F-21, L-34, PR-01) already assume it exists without anyone deciding whether it
   should. See §1.

None of the above are new architectural decisions this file is making — they're existing, already-
written-down AQVEN decisions (or genuinely open, already-tracked-as-unresolved AQVEN questions) that this
research pass either confirms independently or sharpens with a concrete, previously-unverified risk.
Candidate open-questions-registry entries and rule-code proposals are listed per-section below and
consolidated in [Action items](#action-items) at the end.

---

## 1. Node/agent archetypes and workflow decomposition

**What the research says (Doc 2 §1, §7, and the unified Decision Framework):** decompose a task into
separate LLM steps only at boundaries where the *type of uncertainty* changes (grounded extraction vs.
open-ended generation vs. closed-set classification vs. deterministic aggregation), where error cost or a
verifiable intermediate artifact changes, or where latency/cost class changes — never "just in case."
Compounding error gives a hard numeric budget (Lusser's Law): at 95% per-step reliability, 5 steps ≈77%
end-to-end, 10 steps ≈59%. The stated heuristic: **more than 5-7 sequential LLM steps with no gate between
them → stop adding steps, add error-recovery instead** (subtask-level retry, fallback, human escalation).
Each node "archetype" is defined by a falsifiable test, not a vibe: extractor = every output token traces
to a source span; generator = introduces new facts; classifier = label consumed as data; router = label
selects the next node (needs confidence + fallback); scorer = calibrated pointwise scalar; judge =
defensible accept/reject or pairwise verdict+rationale, needing a critic with a *different* context/model
than the generator it judges (self-evaluation is provably unreliable — Huang et al., ICLR 2024); planner
is fixed-topology only when subtasks/order are enumerable at design time, otherwise dynamic.

**AQVEN's design docs:** `docs/06-registries.md` §6 "Архетипы узлов" already has a detailed 12-row
archetype table (extractor, classifier, scorer, generator, judge, aggregator, critic_reviser,
summarizer, planner, router, bounded_agent, consensus_extractor) with default checks, core primitives,
and profile requirements per archetype — formalized as a registry entity
(`ArchetypeBody = {skeleton, parameters, needs, contracts, param_policies}`), plus a §7 component-library
lifecycle (draft → propose → review → library, with MCP tools `component_list/get/define/expand/
propose_to_library`). **This entire file is marked `⚠️` (not cleaned up) in `docs/README.md`, and its
staleness is not just a self-report** — ADR-0026's own Open Question 9 explicitly flags that 06's
node-kind and key-set content still needs to be reconciled post-pivot. Even `docs/14-mcp-contract.md`,
which *is* marked `✅` cleaned, still lists the `component_*` tools as "не реализовано" (not implemented)
and its §10.2 still requires an `archetype` YAML key and references node kinds (`gate`, `try`) absent
from the real 10-kind set. No Python-pivot ADR (0025 through 0044) mentions archetypes at all — the only
textual anchor is a pre-pivot ADR-0020 header clause never independently re-ratified.

**Real code:** `packages/aqven/src/aqven/spec/nodes.py` has exactly 10 node kinds — `llm`, `code`, `tool`,
`human`, `parallel`, `map`, `switch`, `loop`, `call`, `narrow` — and zero occurrences of "archetype"
anywhere in `packages/aqven/src` or `packages/aqven-llm` (grepped repo-wide). No registry, no
`ArchetypeBody`-equivalent, no component-library MCP tools. The closest real equivalent is coarser and
informal: the `call` node references a whole named Flow as a reusable unit (`examples/lumen`'s
`support_case`'s `panel` node calls the separate `judge_panel` flow) — component reuse today happens at
the granularity of a full Flow, not a parametrized node-level archetype. The real compiler's static-cost
rules (R-46/R-57/R-58 in `docs/07-compiler.md` §5, covering call-count/cost/latency) have no counterpart
for Doc 2's compounding-*reliability* budget — nothing in `diagnostics.py`'s ~95-code `DiagnosticCode`
enum checks step count against a reliability threshold.

**Gap:** two distinct things, not one. (a) The archetype registry's post-pivot status is genuinely
undecided — not dropped, not kept, just never revisited by a Python-era ADR, while several open questions
quietly assume it will exist. (b) Doc 2's compounding-error/step-count-without-gate heuristic has no
counterpart in either the docs-level rule catalog or the real diagnostic codes.

**Candidate next steps** (not resolved here — decisions for the doc owner):
- A new ADR deciding whether the archetype/component-library layer ships in any form for v0, or whether
  the pattern AQVEN already uses in practice (a named `call`-able Flow + naming convention, as in
  `judge_panel`) is the intentional, permanent answer.
- A candidate compiler warning (e.g. `W_FLOW_STEP_BUDGET`) that fires when a flow has more than ~5-7
  sequential `llm` nodes on one path with no intervening `switch`/`human`/gate-like `code` node — additive
  to the existing cost/latency estimates, which measure a different thing.
- A `docs/99-open-questions.md` entry recording that the archetype registry's fate is unresolved,
  cross-referencing F-20, F-21, L-34, PR-01, and ADR-0026's Open Question 9.

---

## 2. Provider-specific structured-output guarantees and quirks

**What the research says (Doc 1 Block Б, Doc 3 §1.2/§2/§4):** every major provider's structured-output
mechanism has real, documented limits that differ from each other: OpenAI's Structured Outputs accept
only a JSON-Schema *subset* (≤5 nesting levels, ≤100 properties total, no `default`, no root `anyOf`, all
fields forced into `required` with nullable unions for optionality, and **no `oneOf`/`allOf` anywhere,
root or nested**). Anthropic's newer beta structured-outputs header enforces schema shape but not numeric/
string constraints or recursion (those must move into `description` text). Gemini uses a `responseSchema`
(OpenAPI 3.0 subset) where field-emission order is driven by a separate `propertyOrdering` key — and, per
independent (unofficial, Sept-2026) production observation, when `propertyOrdering` is unset, emission
order actually follows the `required` array's order, not the `properties` order. **The only union keyword
portable across OpenAI/Anthropic/Gemini is `anyOf` — never `oneOf`**, which is exactly what Pydantic
emits by default for a discriminated union. OpenRouter/Together aggregators default `require_parameters`
to `false`, so a structured-output request can silently route to a provider/endpoint that doesn't support
it, degrading to `json_object` mode or worse (documented cases: silent empty `200 OK`, multi-minute
hangs).

**AQVEN's design docs:** `docs/11-providers.md` (marked `⚠️`, not fully cleaned) has a detailed §6
structured-output matrix that is, in places, *more precise* than the source research — it already states
OpenAI strict forbids `oneOf`/`allOf`, documents Anthropic's lack of native numeric/recursion enforcement
with concrete limits, and plans a custom `anthropic-strict` schema transformer. It flags Gemini's
`propertyOrdering` effect as explicitly unverified. §7.1 independently designs the exact OpenRouter
mitigation Doc 1 recommends and calls the false default "a silent degradation of typing" — but this whole
§1-§7 design (a `schema_profiles.py` module, a `SCHEMA_PROFILES` registry, a 26-value `CapabilityFlag`
enum, capability-probe gating, enum-size threshold/index-selection) does not exist in the real repo. The
doc also never mentions Anthropic's dedicated `structured-outputs-2025-11-13` beta feature at all — only
the older tool-call plumbing.

**Real code:** the real provider layer is much thinner. `packages/aqven-llm/src/aqven_llm/connectors.py`
builds 28 provider model instances with **no schema/`json_schema_transformer` logic anywhere** — AQVEN
relies entirely on Pydantic AI's own built-in per-model transformer for every provider-specific rewrite.
Whether a model is `strict` is a single hardcoded boolean per literal model string
(`packages/aqven/src/aqven/spec/profiles.py`). Confirmed as a concrete, live risk: AQVEN's own union-type
compiler (`packages/aqven/src/aqven/spec/modelgen.py`'s `_union`) builds discriminated unions the Pydantic
way, which is confirmed — via a real test asserting `"oneOf" in shape["json_schema"]` for the showcase's
`CaseRecord` union — to actually emit `oneOf` in AQVEN's canonical schema. There is no `oneOf`→`anyOf`
rewrite anywhere, and no golden wire-schema test proving Pydantic AI's transformer fixes this before the
request reaches OpenAI or Gemini. `packages/aqven-llm/src/aqven_llm/routing.py`'s `OpenRouterRouting`
implements only `data_collection`/`zdr` — none of `require_parameters`, `allow_fallbacks`, `order`,
`only`, `quantizations`, `seed` exist.

**Gap:** a real, currently-unverified correctness risk on every discriminated-union output schema sent to
OpenAI (would likely be rejected outright) or Gemini (would silently not be enforced) — plus a fully
unimplemented OpenRouter reliability-routing layer that AQVEN's own docs already call mandatory.

**Candidate next steps:**
- Write a golden wire-schema test (`httpx2.MockTransport`, as `docs/11-providers.md` §6 already promises)
  sending the showcase's `CaseRecord` union through OpenAI/Anthropic/Gemini and asserting the literal
  on-wire schema, to determine empirically whether Pydantic AI 2.43.0 already fixes `oneOf`→`anyOf`. If
  not, this is a live bug needing a fix (candidate rule `E_UNION_ONEOF` next to `modelgen.py`'s
  `normalized_schema()`). If Pydantic AI already handles it, `docs/11-providers.md`'s planned
  hand-written `schema_profiles.py` layer is likely unnecessary per `CLAUDE.md`'s "не изобретать
  велосипед" — strike it from the plan rather than build it.
- Extend `OpenRouterRouting` with `require_parameters`/`allow_fallbacks`/`order` per
  `docs/11-providers.md` §7.1's already-designed `reproducible_routing()` — this closes existing open
  question F-14's code-side gap.
- Research and document whether Pydantic AI 2.43.0 exposes Anthropic's dedicated
  `structured-outputs-2025-11-13` feature at all (currently an unresearched blind spot on both the docs
  and code side).

---

## 3. JSON Schema field-design rules: ordering, nesting, enums, nullability

**What the research says (Doc 3 §1, §2, §3, §4.3, §5.2, §10.3):** reasoning/evidence fields must be
declared *before* answer/label/decision fields — constrained decoding emits tokens left-to-right, so a
late reasoning field is post-hoc rationalization of an already-committed answer, not real reasoning.
Nesting depth ≥4 causes systematic, benchmarked degradation (DeepJSONEval: 17-30 percentage-point drops
at 5-7 levels); 2 levels is comfortable, 3 is the practical ceiling. Enum lists are comfortable to
~10-20 values; grammar-compilation timeout risk appears near ~50. A required field over data that may be
genuinely absent in the source **forces the model to hallucinate a value** unless it's typed nullable
(kept in `required`, but `anyOf[T, null]`). Constrained-decoding automata statistically under-produce the
empty-array path, so models fabricate elements rather than honestly returning `[]` — mitigation is an
explicit description permitting empty results, plus an optional companion boolean field.

**AQVEN's design docs already converge with Doc 3 on four of five sub-topics** — apparently derived
independently from OpenAI/Anthropic/Gemini's own documented limits, not from this research:
- Field ordering: `docs/07-compiler.md` §3.3 defines **rule R-35**, "reasoning field before decision
  field, IR field order is never sorted" — essentially Doc 3 §1.1's rule verbatim.
- Nesting depth: **rule R-36**, "schema nesting depth ≤ 3 levels" — the exact number Doc 3 gives.
- Enum size: `docs/05-type-system.md` §4.2 gives a four-tier policy (≤50 → `enum`; >50 → indexed
  selection; >416 → narrowing becomes mandatory, tied to OpenAI's real 15,000-character single-enum
  limit; >1000 → `enum` forbidden outright) — **more precise than Doc 3's own generic numbers**, because
  it's grounded in OpenAI's documented hard limits rather than reasoning-quality benchmarks. This is
  **rule R-37a**.
- Nullable vs. required: `docs/05-type-system.md` forbids field defaults outright and mandates
  optionality only via `T?` → nullable-in-`required` — structurally identical to Doc 3 §4.3's rule, and
  arguably stronger (there's no way to write a "silently optional" field at all).
- Empty-array pathology (Doc 3 §5.2): **absent from AQVEN's docs entirely.** This is the one sub-topic
  where AQVEN's design layer has not considered the problem at all, not just failed to implement it.

**Real code implements almost none of this**, despite the rule codes existing:
- R-35 (reasoning-before-answer): zero implementation. There is no mechanism in any `FieldDecl`/
  `OutputField` to even mark which field plays which semantic role — nothing a checker could key off.
- R-36 (nesting depth ≤3): **`diagnostics.py`'s `RULE_BY_CODE` maps the label "R-36" to
  `E_TYPE_RECURSIVE`**, whose actual check (`check/types.py`'s `_recursion`) only detects a type reachable
  from itself — a flat recursion ban, not a depth counter. No depth-counting logic exists anywhere. This
  is a real docs/code label mismatch, independent of the Doc 3 gap.
- R-37a (enum budget): only the `≤50` cutoff is implemented, and only at **runtime**
  (`engine/llm/allowed.py`'s `DEFAULT_MAX_ENUM = 50`, used in `shape_output`), with no fallback above 50
  — an oversized allowed-set silently passes through unshaped rather than failing loudly at compile time,
  which is the opposite of `docs/05-type-system.md` §4.3's own stated principle ("failing with a clear
  error beats a 400 from the API").
- Nullable/required: the `T?` optional syntax is real (`spec/typeref.py`), matching the design at the
  syntax level.
- Description-required-on-every-field (Doc 3's checklist rule 15): already enforced by construction —
  `FieldHead.description: str = Field(min_length=1)` makes a missing description a hard validation
  failure at YAML-load time, before any check pass runs.
- Empty-array pathology: zero code trace, matching the docs gap.

**Gap:** the docs already specify the right rules (and, for enum sizing, a *better* rule than the
source research), but the compiler doesn't implement R-35 or a real R-36, R-37a is partial and
runtime-only, and the empty-array pathology is a genuine blind spot in both layers.

**Candidate next steps:**
- A `docs/99-open-questions.md` entry on how to mark field role for R-35 (a naming convention vs. an
  explicit `role: reasoning | answer` key vs. a position-only convention) — R-35 can't be built until
  this is decided.
- Free the "R-36" label for an actual depth-counting check (walk record/union field trees, ≤3), and give
  the existing recursion-ban check its own code — or, if the recursion ban is judged to already be a
  strictly stronger superset, correct `docs/07-compiler.md`'s R-36 row to say so explicitly instead of
  leaving the mismatch implicit.
- Promote R-37a from a runtime-only `≤50` cutoff to the full tiered compile-time check
  `docs/05-type-system.md` §4.2 already specifies.
- A new candidate rule (e.g. `E_ARRAY_EMPTY_UNDOCUMENTED`) requiring every array-typed output field's
  `description` to state that an empty list is a valid result — mirroring how field descriptions are
  already mandatory and machine-checked.

---

## 4. Model-call guarantee chain: outcomes, retry, PII redaction

**What the research says (Doc 1):** native provider strict mode everywhere, plus client-side schema
validation with a repair loop that feeds the model the *exact* violated field/constraint (not a generic
"try again" — Tyen et al. 2024 show location-specific feedback works where generic retry doesn't); dated-
version model pinning plus a regression suite on every provider update, as consensus/mandatory practice;
and, for OpenRouter/Together, `require_parameters: true` + provider-order pinning once a 10-request probe
of a fixed schema scores below 9/10 across providers.

**This exact topic (outcomes, retry, PII) was already exhaustively researched this same project cycle**,
grounded in real code, for the public page `apps/site/src/content/docs/concepts/
what-happens-when-a-model-is-called.md` — this section re-confirms and sharpens that page's findings
rather than re-deriving them, and adds two angles that page didn't cover.

**AQVEN's design docs** (ADR-0029, still current, and `docs/10-runtime.md`, marked `✅` cleaned)
describe a `WrapperModel` chain (Instrumentation → OutcomeGate → Redacting → Cassette → Limiter →
Backoff → provider) gating three outcomes (`ok`/`refusal`/`truncated`) before any parsing, then a bounded
schema-validation repair loop carrying the exact violated field/constraint/limit — closely matching Doc
1's stage-1 recommendations. **The docs also narrate a much richer automatic recovery routing than what's
built**: truncated → bump `max_tokens` → fall back to a larger-context profile → escalate to a human;
refusal → fallback profile or human escalation — modeled as a named-handler dispatch table
(`retry_with_larger_limit`, `fall_back_provider`, `fail_with_refusal`), driven by
`AgentOutputSpec.on_refusal`/`on_truncated: fail|fallback`.

**Real code:** the chain order, the outcome gate, the transport retry (transient-only, honors
`retry-after`), and the repair-loop's exact-location feedback are all real and match the design closely
— see the already-published concept page for detail. **What's newly confirmed here**: `on_refusal`/
`on_truncated` exist only as declared-but-unconsumed fields threaded through `spec/agent.py` →
`ir/registry.py` → `compiler/registry.py`. A repo-wide grep for any *read* of these fields (not just
their declaration) returns zero hits. None of the named handler functions the docs describe
(`retry_with_larger_limit`, `fall_back_provider`, `fail_with_refusal`) exist anywhere in the codebase.
**Setting `on_refusal: fallback` in a real agent's YAML passes `aqven check` and compiles cleanly, then
behaves identically to `fail` at runtime — a silent no-op.** Separately: `OpenRouterRouting` (see §2)
implements none of the reliability-routing fields Doc 1 and `docs/11-providers.md` both call mandatory.
AQVEN's answer to model-drift protection is architecturally different from Doc 1's dated-string-pinning
recommendation — it's an append-only catalog-snapshot pinning mechanism protecting *eval comparability*,
not the identity of the string in a workflow's `model:` field — and the `model:` field itself neither
requires nor validates a dated-version suffix; pinning is left entirely to user discipline.

**Gap:** an unimplemented feature with a spec surface that already looks implemented — the most
concerning shape of gap this whole pass found, because nothing currently stops a workflow author from
believing `on_refusal: fallback` provides a safety net it does not provide.

**Candidate next steps:**
- A compiler check rejecting or warning on `on_refusal: fallback` / `on_truncated: fallback` until the
  routing handlers actually exist (candidate code `E_OUTCOME_POLICY_UNIMPLEMENTED`) — so `aqven check`
  can't silently pass a spec value with zero runtime effect. Track the real implementation separately.
- Extend open question F-14 to name the concrete code gap in `OpenRouterRouting` (see §2).
- This makes a genuinely good worked example, if the "Designing Reliable Workflows" page (§8) gets
  written: a concrete internal instance of "a config knob that looks like a guarantee but isn't" — the
  exact anti-pattern this whole research corpus warns against.

---

## 5. Divergence (parallel/voting) and critic-loop patterns

**What the research says (Doc 2 §2, §3, §8):** self-consistency/best-of-N pays off for closed-form/
verifiable answers or with an external verifier; for a single deterministic answer whose variance comes
from prompt/context rather than temperature, it's an "expensive habit" that shouldn't be built. Diversity
ranking: different prompts/models beat temperature/seed on the same prompt (weakest, highly correlated).
A critic/judge loop pays off *only* with an external verifiable signal (tests, compiler, schema,
retrieval-grounding) or a rubric a human can articulate — same-model, same-context self-correction
degrades reasoning accuracy (Huang et al., ICLR 2024) because generator/self-evaluator errors are
correlated. Effective critic design: specific + localized feedback, rationale stated *before* the
verdict/score, and — critically — the critic should be a different model or fresh context to break error
correlation. Named anti-patterns: divergence for no reason, a critic loop without an external verifier,
and a loop with only `max_iter` as its stop condition (reward-hacking risk); the empirical default is
`max_iter=3`, since most of the gain lands in iteration 1 and plateaus by iteration 3.

**AQVEN's real code already implements almost every one of these good patterns — in the showcase, as
convention, not as a platform guarantee.** `ParallelNodeSpec.join` and `LoopNodeSpec.stop`/`select` are
generic policy slots; real built-ins include `join_all`/`join_any`/`first_success`/`quorum(min_ok)` and
`threshold(path)`/`stagnation(path, window, min_delta)` plus `select: best(path)`/`last`. Custom `run:`
policies are statically type/shape-checked against real Protocol contracts. `examples/lumen`'s
`judge_panel` flow uses a family-diverse panel (deepseek/qwen/llama) with a 4th distinct-family tie-break
judge, compiler-enforced via real, generic contract predicates
(`families_distinct`/`family_disjoint_from_input`/`field_before`, mapped to rule **R-J2**) — a close,
real match to Doc 2 §3.3's "ensemble + different model breaks correlated bias." `support_case`'s `drafts`
node runs 3 different-model-family parallel drafts with `quorum(min_ok=2)` (matching Doc 2's #1 diversity
source); its `vote`/`ballot` uses one cheap model with 3 different prompt-perspective variants (matching
Doc 2's #2 diversity source). `support_case`'s `polish` loop sets `stop: [threshold(score≥0.85),
stagnation(window=1, min_delta=0.02)], select: best(score), max_iter: 3` with a cross-family critic —
a near-literal match to Doc 2 §3.4's stop-condition guidance and `max_iter=3` default.

**The gap is enforcement, not design or example quality.** (1) There is **no first-class majority-vote-
by-value join policy** — two showcase flows already hand-roll two slightly different Counter-based
implementations of the same idea. (2) The family-separation/anti-self-judging protection (`requires:`
contracts) is **opt-in per flow** — nothing auto-detects "an all-`llm` parallel/loop scoring another
`llm`'s output" and forces the contract; a flow author can build an unguarded self-judging critic loop
today with no compiler objection. (3) `LoopNodeSpec.stop` is optional with **no compiler nudge to set
it**, and there is no platform-level `max_iter=3` default documented or enforced anywhere current — it's
one showcase flow's own choice. (4) `docs/07-compiler.md`'s R-J5 (disagreement/tie-break policy required)
and R-J6 (judge calibration gating) exist only as design text — no matching `DiagnosticCode` or
calibration-table code exists (R-J6 overlaps §6 below).

**Candidate next steps:**
- Add a built-in `majority`/`vote` join policy generalizing the showcase's two hand-rolled
  implementations into one reusable, compiler-checked primitive.
- Add a compiler check (candidate `E_JUDGE_FAMILY_UNGUARDED`) warning when an all-`llm` `parallel`/`loop`
  scores another `llm`'s output with no accompanying `families_distinct`/`family_disjoint_from_input`
  contract — this is what would make Doc 2 §8's "critic-loop without a verifier" anti-pattern get caught
  by default rather than only when a flow author remembers to opt in.
- Document a platform `max_iter=3` recommendation and add a `W_LOOP_NO_STOP` warning for `loop` nodes
  that omit `stop:`.
- A `docs/99-open-questions.md` entry reconciling `docs/13-evals-and-gates.md`'s judge-calibration design
  (R-J6) with the real ADR-0029 statistical-gate layer — see §6, same underlying gap.
- A short ADR or `DECISIONS.md` entry recording explicitly that AQVEN has no reusable "archetype"/
  component-library layer (see §1) — the shipped design instead composes the 10 primitive node kinds with
  generic `requires:` contracts to reach equivalent guarantees, so a reader following `docs/06`'s
  `component:judge_panel@7` framing isn't misled into expecting something that doesn't exist.

---

## 6. Testing/evals design: golden sets, judge calibration, archetype-specific tests

**What the research says (Doc 2 §6):** golden sets should mix 4 buckets (production-sample /
adversarial / edge-case / failure-replay), sized minimum 50-100, production-ready 200-500, mature 1000+.
Property-based/metamorphic testing — checking invariants like paraphrase-idempotency or semantic
monotonicity, rather than single input-output pairs — is a growing complement to example-based testing.
CI cadence: smoke 20-50 on every PR, regression 200-500 on merge, benchmark 1000+ on release, with prompt
rotation and a sealed holdout on major model releases. The judge itself needs calibration against human
labels (Cohen's κ, Krippendorff's α, ICC, Kendall's τ), with human inter-rater agreement treated as a
ceiling on achievable judge quality.

**AQVEN's design docs are unusually far ahead of the research here, and the implementation gap is
correspondingly the more important half of this finding.** `docs/13-evals-and-gates.md` (marked `⚠️`,
still VoltAgent-era prose in places, but with ADR-0029 as the current authority for the statistics)
already turns judge calibration into a hard three-tier admission gate — **quadratic-weighted Cohen's κ
≥ 0.70 AND Krippendorff's α ≥ 0.80** on ≥100 human-labeled, class-balanced examples, with WARN/BLOCK/OFF
tiers — re-derived in ADR-0029 §10 down to the exact `statsmodels.stats.inter_rater.cohens_kappa
(wt='quadratic')` call and a custom ~40-line numpy Krippendorff's alpha (deliberately avoiding the
GPL-licensed `krippendorff` package). Golden-set sizing has its own numeric tiers derived from the docs'
own Monte-Carlo power simulations (`MIN_DATASET_SIZE = {smoke: 30, gate: 200, strict: 500}`), not from
Doc 2's practitioner-range language — and ADR-0029's own Open Question 16 already flags that `docs/13`
and `docs/08` disagree with each other on the size floor, unresolved. Property-based/metamorphic testing
has no real counterpart in the docs — the closest concept ("perturbation" dataset generation) produces
more paraphrase-derived examples for the ordinary example-based pipeline, never a cross-case invariant
check. No AQVEN document specifies a smoke/regression/benchmark CI cadence.

**Real code lags the docs substantially, in exactly the areas this research covers.**
`spec/evals.py`'s `GateSpec.min_dataset` is a bare unconstrained int with no tier enum tied to any
guidance. `JudgeAdmission` (`min_weighted_kappa`, `min_krippendorff_alpha`, `calibration_dataset`) exists
as a Pydantic field, but `check/evals.py`'s calibration check only verifies the referenced dataset
*exists* — **it never computes κ or α, and never enforces the thresholds.**
`packages/aqven/src/aqven/evals/statistics.py`'s `Statistics` protocol declares only `paired`/`holm`/
`fdr` — a repo-wide grep for "kappa" or "krippendorff" finds only the two unused Pydantic field
declarations. `gate.py`'s real admission rules (`_too_small`, `_too_many_dropped`, `_no_pairs`,
`_insufficient_discordant`) never reference judge calibration at all — there is no `judge_not_calibrated`
outcome in the real gate, even though the design's own `GATE()` pseudocode includes one. The eval data
model is strictly example-based (`DatasetCase = {inputs, context, expected_output}`); none of the real
built-in evaluators compares related cases or asserts a cross-case relationship — no property-based or
metamorphic testing support exists at all. The real CI workflow has no eval/gate/dataset job of any kind.

**Gap:** golden-set sizing is a docs-internal disagreement, already tracked (ADR-0029 OQ16), not a new
finding. Judge calibration is pure implementation debt — the design is already the decision, the code
just hasn't caught up, and ADR-0029 §10 already names the exact library calls to write. Property-based/
metamorphic testing and CI cadence are genuine new design gaps with no ADR coverage at all.

**Candidate next steps:**
- Judge calibration: implement κ/α/ICC/τ in `evals/statistics.py` per ADR-0029 §10's already-specified
  calls, and wire a real `judge_not_calibrated` admission rule into `gate.py` — implementation work, not
  a new decision.
- Golden-set sizing: fold into resolving ADR-0029's existing Open Question 16 when `docs/13` gets its
  Python-era rewrite (tracked in `docs/README.md`'s cleanup backlog).
- A new `docs/99-open-questions.md` entry for property-based/metamorphic testing (whether AQVEN wants a
  "paraphrase group" case concept and a semantic-consistency evaluator) — genuinely undecided, not
  implementation debt.
- A new `docs/99-open-questions.md` entry for CI cadence policy, once the eval runner has any CI
  attachment point at all (currently nothing in CI calls the eval/gate machinery).

---

## 7. Context sufficiency/minimization vs. AQVEN's dynamic-shape framework

**What the research says (Doc 2 §5):** context quality degrades with input length even well below the
context window's limit ("context rot," Chroma, Jul 2025, across 18 frontier models) plus "lost in the
middle" effects. Design-time context should contain every decision variable, constraint, and boundary
few-shot — and nothing else: no unused downstream fields, no "just in case" content, and — counter-
intuitively — coherent-but-redundant text can create distractors that hurt more than shuffled content.
A formal, ground-truth-free test exists for this: "Sufficient Context" (Joren et al., ICLR 2025) — "could
a diligent reader answer using only the provided context?" — run as an autorater pass over golden inputs
*before* launch, independent of token-budget concerns.

**This is not the same axis as AQVEN's existing dynamic-shape framework, and neither subsumes the
other — they answer different questions that happen to share the word "context."** ADR-0027's "take the
least dynamic case that solves the task" rule (the 5-case table already covered in this project's public
docs, `apps/site/src/content/docs/concepts/five-dynamic-shape-cases.md`) governs *how much of a field's
structure* can be fixed at compile time vs. deferred to data — a type-system axis. Doc 2 §5 governs,
*given a field is already typed and going into a node's context, does it actually belong there at all* —
a content-curation/signal axis. A field can be fully static-shaped and still be context-rot noise in a
specific node; conversely a field can pass every sufficiency test and still need full dynamic-shape
escalation because its structure is only known at run time.

**AQVEN's design docs:** `docs/09-context-model.md` (marked `✅` cleaned, but still `Статус: draft`) is
the actual home for context-inclusion concerns — it models a context need as a typed
`(Type, OriginContract, Verification)` tuple and has an R-C1..R-C8 rule family, including R-C8 (a
two-directional "dead need" check — an unused need, or a node slot with no declared need, is an error) —
structurally similar in spirit to Doc 2's "no unused downstream fields" item, but framed as completeness/
no-dead-code, not signal quality. Its §8 compression machinery (R-C7 + `drop_optional`/`top_k_cut`/
`summarize`/`map_reduce`/`chunk`) manages context *size* against a token budget, reactively — it fires
only near/over budget, which does not address Chroma's core finding that quality degrades well below the
budget ceiling. Nowhere in `docs/09` is there anything resembling the "Sufficient Context" formal test,
nor Doc 2's root-causing table (missing-context vs. model-not-using-context vs. context-rot vs.
distractor-interference), nor guidance about field *ordering* (front/back-loading high-signal content) as
distinct from bounding size.

**Real code:** ADR-0027's core rules ARE implemented for real (R-D1/R-D2/R-D3/R-D5, wired into
`check/dynamic.py`) — unlike `docs/09`'s R-C family, which is **entirely absent from real code**: a
repo-wide grep for `ContextNeed`/`context_needs`/`R-C1`..`R-C8` returns zero hits; the two modules whose
names suggest otherwise (`check/context.py`, `check/context_keys.py`) handle unrelated concerns (a
resolver bundle, and `$run.context.*` key propagation only). What IS implemented and genuinely relevant
to Doc 2's "no unused downstream fields" item is **`E_PROMPT_INPUT_UNUSED` (rule R-T2)** — a real, tested,
100%-precision static check that a node's declared `in` field is actually referenced by its own prompt.
This is AQVEN's real but much narrower analog: it catches *literally unreferenced* fields, not fields
that are referenced but low-signal, redundant, or badly ordered — and it lives in the R-T (prompt) rule
family, not R-C, since R-C8 itself was never actually implemented to fulfil this.

**Gap:** genuinely orthogonal design questions, both under-addressed. R-D6 (ADR-0027's own proposed
"unnecessary dynamism" warning — AQVEN's direct analog of "don't include more machinery than the task
needs") is unimplemented and advisory-only. No formal sufficiency test, no root-causing procedure, and no
proactive (budget-independent) minimization pressure exist in either docs or code.

**Candidate next steps:**
- A new `VerifyKind` entry in `docs/09-context-model.md` (e.g. `SUFFICIENT_CONTEXT`) letting a
  `ContextNeed` opt into a Joren-et-al.-style pre-launch autorater pass over golden inputs — this
  naturally belongs with the pydantic-evals judge machinery (`docs/13`, the R-J family) since sufficiency
  is inherently probabilistic, not statically decidable. Needs an owner decision (new ADR), since
  `DECISIONS.md` is the closing authority and this also touches `docs/09`'s own unresolved Open Question
  13 (the JUDGE/R-J boundary).
- Add Doc 2 §5.3's root-causing table as new content in `docs/09`'s debugger-panel section or
  `docs/12-observability.md` — it directly extends existing provenance/lineage tooling.
- Before adding any *new* R-C rule, decide whether the R-C family ships at all for the phase-0 spike, or
  whether the narrower, already-real `E_PROMPT_INPUT_UNUSED` stays the sole enforcement mechanism —
  recommending new rules atop an entirely doc-only framework risks compounding unimplemented design debt.
- Implement ADR-0027's own already-open R-D6 (excess-dynamism warning) while in this area.

---

## 8. Anti-patterns and whether AQVEN teaches this to its own users

**What the research says (Doc 2 §8 and the closing 10-step Decision Framework):** a tabulated set of
11 anti-patterns (monolith prompt, over-decomposition, divergence-for-no-reason, critic-loop-without-a-
verifier, loop-without-a-stop-condition, missing gates, context bloat, oversized/overlapping tool sets,
premature autonomous agents, evaluating steps in isolation, and the "schema-valid ≠ correct" fallacy),
plus a unified step-by-step decision procedure translating everything in Doc 2 into one practical
sequence a workflow author can follow.

**This content was explicitly planned for AQVEN's public documentation site once, and then silently
dropped.** An earlier site-design draft, `docs/superpowers/specs/2026-09-18-docs-site-design.md`, item 7
of its 16-item site structure, scoped a page — **"Designing Reliable Workflows"** — covering
"decomposition heuristics, divergence/self-consistency, critic-loop rules, compounding-error math, gates
— mapped onto real node/policy vocabulary," explicitly citing "the research doc's existing ASCII decision
tree" (this same research, or an earlier version of it, was already informing the site's design before
this gap-analysis pass). The site-IA redesign that superseded that draft and governs the live site today
(`docs/superpowers/specs/2026-09-21-aqven-docs-ia-design.md`, status "ready," and the actual basis for
every wave of this project's `apps/site/` rewrite) lists exactly 11 Concepts pages, and none of them is
this page. Nothing in that doc's own follow-up sections records why it was cut, and `docs/99-open-
questions.md` has no entry tracking the drop either — **it reads as a scoped-and-cut decision with no
recorded rationale, not an oversight nobody considered.**

**The live site (authored this session, all 47 pages) confirms the gap.** `concepts/ten-kinds-of-nodes.md`
is purely descriptive (a map + links), with only one narrow decomposition hint ("a step needs two things
at once ... usually two nodes, not one") — no general rule, no anti-pattern list, no thresholds.
`engine/loop-node.md`'s own worked example (the showcase's `polish` node) *silently does two things
right* — it always sets a `stop` policy, and its critic uses a different model family from the node it's
critiquing (exactly Doc 2 §3.3's external-verifier pattern) — but the page presents this purely as "here
is what the showcase does," never generalizes it into a rule, and its prose about an unset `stop` policy
("the loop always runs to `max_iter`") carries no warning that this is exactly Doc 2's "loop without a
stop condition" anti-pattern. A site-wide search for anti-pattern/decomposition/divergence/critic-loop
terminology finds nothing else. `apps/site/CONVENTIONS.md`'s Concept-page template already has the right
slot for this content with zero new page-type convention needed — its mandatory `## How this shapes what
you do` section is exactly where Doc 2's decision rules belong, translated into AQVEN's real node/policy
vocabulary. On the enforcement side, `aqven check`'s full warning catalog is entirely about spec/prompt
consistency and staleness — none of it is a workflow-design-smell check (see §1, §5's proposed
`W_FLOW_STEP_BUDGET`/`W_LOOP_NO_STOP`/`E_JUDGE_FAMILY_UNGUARDED`, all of which this page would eventually
want to be able to point a reader at).

**This is the one finding in this file that is a recommendation about `apps/site/` content, not
`docs/`** — the public documentation site's information architecture (`docs/superpowers/specs/
2026-09-21-aqven-docs-ia-design.md`) is a decided, "ready"-status design this project has been executing
against all session; adding a 12th Concepts page changes that scope and is a call for the project owner,
not something to do unprompted alongside this gap analysis.

**Candidate next step:** restore a "Designing Reliable Workflows" (or similarly named) Concepts page —
reusing the exact scope already drafted once — anchored on `engine/loop-node.md`'s existing `polish`
example (already, silently, doing the right things) with the rule made explicit instead of implicit.
Cross-reference §1 and §5's candidate compiler warnings as a natural "the platform will eventually warn
you about this" callout once/if they exist. This would need either restoring the item to the 2026-09-21
IA design doc's Concepts list, or a `docs/99-open-questions.md` entry recording the decision to add it
now, so a future reader of that "ready"-status doc doesn't wonder why an 12th page appeared unexplained.

---

## Action items

Everything below is a *candidate* — none of it is a decision this file makes; all of it needs the
project owner's sign-off before it becomes law, per this project's own convention that open questions get
recorded, not resolved silently.

**Candidate new ADRs:**
- Archetype/component-library layer's post-pivot fate (§1): keep, drop, or rescope the `docs/06-
  registries.md` §6-7 design; if dropped, formally record that AQVEN's answer is composing the 10
  primitive node kinds with generic `requires:` contracts (§5's closing recommendation).
- Whether `docs/09-context-model.md`'s R-C family ships for phase-0, and where a new context-sufficiency
  autorater check would live relative to the existing `VerifyKind`/R-J judge machinery (§7).

**Candidate compiler rules/warnings** (none currently implemented; codes are suggestions, not final):
- `E_UNION_ONEOF` — reject/rewrite `oneOf` in a schema profile targeting a provider that doesn't support
  it at the root or nested level, once the golden wire-schema test (§2) confirms this is a real problem.
- `W_FLOW_STEP_BUDGET` — warn on >5-7 sequential `llm` nodes on one path with no intervening gate (§1).
- A real depth-counting check under a freed "R-36" label, distinct from the existing recursion ban (§3).
- Promote R-37a (enum budget) to a full compile-time tiered check (§3).
- `E_ARRAY_EMPTY_UNDOCUMENTED` — require an explicit "empty is valid" note on array output fields (§3).
- `E_OUTCOME_POLICY_UNIMPLEMENTED` — reject `on_refusal`/`on_truncated: fallback` until the routing
  handlers exist (§4).
- A built-in majority/vote join policy (§5).
- `E_JUDGE_FAMILY_UNGUARDED` — warn when an all-`llm` parallel/loop scores another `llm`'s output with no
  `families_distinct`/`family_disjoint_from_input` contract (§5).
- `W_LOOP_NO_STOP` — warn on a `loop` node with no `stop:` policy (§5).
- A real `judge_not_calibrated` admission rule wired to actual κ/α computation (§6, implementation work
  more than a new rule — the design already exists in ADR-0029 §10).

**Candidate `docs/99-open-questions.md` entries** (exact IDs and table placement are for the doc owner —
this file only identifies what's missing from the registry, not where it slots in):
- Archetype registry's post-pivot status, cross-referencing F-20, F-21, L-34, PR-01, ADR-0026 OQ9 (§1).
- `oneOf`/`anyOf` schema-portability risk needing a golden wire-schema test (§2).
- `OpenRouterRouting`'s missing reliability fields, extending F-14 (§2, §4).
- Field-role tagging mechanism needed before R-35 can be implemented (§3).
- Property-based/metamorphic testing — new capability, no design yet (§6).
- CI cadence policy for evals (smoke/regression/benchmark tiers) — no attachment point in CI yet (§6).
- Whether/how to restore the "Designing Reliable Workflows" page to the site IA (§8).

**Candidate public-site content:** a 12th Concepts page, "Designing Reliable Workflows" — requires the
project owner's go-ahead to expand the already-"ready"-status site IA (§8).

**Pure implementation debt (design already correct, code just hasn't caught up — lower urgency to decide,
higher urgency to schedule):** judge calibration (κ/α computation, §6); OpenRouter reliability routing
fields (§2, §4).
