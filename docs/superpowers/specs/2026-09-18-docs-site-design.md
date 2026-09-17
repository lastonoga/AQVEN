# AQVEN documentation site — design

> Status: draft
> Depends on: [project-structure.md](../../../aqven-py/docs/project-structure.md), [examples/showcase](../../../aqven-py/examples/showcase/), ADR-0026 (proposed amendment, see §7)
> Sources: web research on Astro Starlight, mkdocs-material, griffe, llms.txt (Sept 2026, see §8); repo inspection of `site/`, `aqven-py/`, `apps/studio/`

## 1. Why this layer exists

AQVEN has no public-facing developer documentation yet — only internal Russian planning docs in `docs/` (ADRs,
decisions, specs for building the platform) and a static placeholder at `site/` for aqvenstudio.com. Developers
and coding agents adopting AQVEN need a Laravel-style guide (narrative + step-by-step + generated reference) built
against the one real, working example that exists: `aqven-py/examples/showcase` (Lumen). This spec covers the
tooling, build pipeline and information architecture for that site. It does not cover Studio's own UI documentation
or the future marketing/landing page — both are explicitly out of scope (§6).

## 2. Decisions

| Decision | What we take | Why |
|---|---|---|
| Site framework | Astro + Starlight (MIT) | Component islands give full design freedom for the future landing page; huge, actively maintained plugin ecosystem (`starlight-openapi`, `starlight-llms-txt`) covers every generated-reference need here. |
| Python→docs bridge | `griffe` (2.0.0, MIT) — the same extraction engine mkdocstrings is built on | `griffe dump` serializes a package's public signatures and docstrings to JSON; Astro content collections read JSON natively at build time. No dependency on mkdocs itself. |
| Docs language | English | Matches `aqven-py`'s existing docs and the showcase's own `AGENTS.md`/`CLAUDE.md`; internal `docs/` stays Russian per the existing CLAUDE.md rule, which this does not change. |
| Repo location | `site/` itself becomes the real Astro/Starlight project (`site/src/`, `site/astro.config.mjs`, `site/package.json`, codegen scripts) | `site/` already exists specifically for aqvenstudio.com; its own commit message says "landing page and documentation will replace it." A repo-structure refactor is planned later — `site/` was never part of `apps/` or `aqven-py/`'s conventions, so nothing here is coupled to a structure that's about to change. |
| Deploy | GitHub Pages, via the existing `.github/workflows/pages.yml` | Change the workflow from "upload `site/` as-is" to "build `site/`, upload `site/dist/`" — one step added, no new infrastructure. |
| OpenAPI source | The Python package's own FastAPI app (`create_local_app`, `/api/openapi.json`) | This is engine-owned, not Studio-owned — `apps/studio` is just one HTTP client of it. Available now; not gated on Studio being finished. |
| Rejected: mkdocs-material | — | Zero-glue Python docstring rendering, but Jinja2/CSS theming is a worse fit for the bespoke landing page that's coming later, and it's a second toolchain alongside the TS-based `apps/studio`. |
| Rejected: Fumadocs (Next.js) | — | No advantage over Starlight for this project (neither the engine nor Studio is Next.js), and static GitHub Pages export is more native to Astro. |
| Rejected: Mintlify / Kapa.ai-style SaaS "Ask AI" widgets | — | Paid SaaS; conflicts with the project's cheap-OpenRouter-only preference and self-hosted ethos. |
| Diagrams | `astro-mermaid` (client-side rendering) over `rehype-mermaid`/`@beoe/rehype-mermaid` | Build-time SVG rendering needs a headless Chromium via Playwright in CI; client-side rendering avoids that dependency entirely for a small client-bundle cost, which is the right trade for a docs site. |

## 3. Build-time codegen

Everything below runs as a pre-build step in CI (and locally via an npm script) and emits JSON/MD that Astro
content collections or a `starlight-openapi`/`starlight-llms-txt` plugin consumes. Nothing here is hand-retyped
from a source that already exists as data or working code.

| Reference | Source of truth | Bridge |
|---|---|---|
| CLI reference | `aqven`'s `argparse`-based `Command` tree (`aqven-py/packages/aqven/src/aqven/cli.py`) | capture `--help` output per subcommand → generated MD pages. (Not Typer/Click, so no drop-in plugin — this is genuinely "no library exists for this," consistent with the project's own build-vs-buy rule.) |
| Python API reference | Docstrings on the public surface of `aqven` / `aqven-llm` (new, scoped — §7) | `griffe dump` → JSON → Astro `file()` loader → generated pages |
| HTTP API reference | The engine's own OpenAPI spec (`create_local_app` → `/api/openapi.json`) | `starlight-openapi` |
| Configuration reference | Pydantic `model_json_schema()` per kind (Flow, Node, Agent, Tool, Type, Inference...) | JSON → generated tables: field, type, description straight from the schema |
| Diagnostics reference | The `E_*`/`W_*` diagnostic catalog (07-compiler.md's rule registry, once it exists as code) | same data the compiler carries internally → generated pages |
| Code snippets in prose | Real files under `aqven-py/examples/showcase/` | `remark-code-import`-style plugin, whole-file or explicit line range. No region-comment markers, since the codebase bans comments — most Lumen files are already small and single-purpose, so whole-file embeds cover most cases. |
| `/llms.txt`, `/llms-full.txt` | The built docs themselves | `starlight-llms-txt` |

## 4. Site structure

Laravel-style: narrative + step-by-step + generated reference, cross-linked, every example sourced from Lumen.

1. **Introduction** — what AQVEN is, when to reach for it (condensed from the positioning doc)
2. **Getting Started** — install → first flow → run it → directory layout, tutorial-ized from `project-structure.md`
3. **Core Concepts** — files-as-source-of-truth, kinds, the step-as-layout-unit, convention-over-configuration
4. **Building Flows** — bindings/references, shapes, tools, and a node-kind decision table (revised 2026-09-18: written as one unified how-to guide, not one page per node kind — the source material reads as unified wiring mechanics)
5. **Writing Prompts** — prompt levels, the Liquid template rules, `{{ output_format }}`, variants, message blocks (added 2026-09-18: substantial enough to be its own guide, not a Building Flows subsection)
6. **Models & Providers** — configuring providers, output modes, and model-selection guidance (which model class fits extractor/classifier/generator/judge)
7. **Designing Reliable Workflows** — decomposition heuristics, divergence/self-consistency, critic-loop rules, compounding-error math, gates — mapped onto real node/policy vocabulary (`quorum`, `stop`, `select`)
8. **Structured Output & Types** — reasoning-before-answer field order, nesting limits, enum/union design, strict-mode tradeoffs, framed as how AQVEN's type system already encodes these rules
9. **Testing & Evaluation** — `aqven check`, cassettes, scenario tests, evals/gates
10. **CLI Reference** *(generated)*
11. **Python API Reference** *(generated)* — in-process usage: `Project`, `RunOptions`, `create_local_app`, `create_mcp_server`, testing helpers
12. **HTTP API Reference** *(generated)* — the OpenAPI contract for any HTTP client
13. **Configuration Reference** *(generated)*
14. **Diagnostics Reference** *(generated)*
15. **For AI Coding Agents** — how to read these docs as an agent, the MCP tool contract, condensed workflow/model/schema rules, the `AGENTS.md` template (reusing Lumen's own)
16. **Examples** — the full `support_case` flow walked end-to-end, node by node

## 5. Visual content plan

Placeholders only — no diagram or screenshot gets produced as part of this spec. Each row is a marker for what
belongs on that page and how it should eventually be made, so a future content pass knows what to draw instead of
guessing. `[VISUAL: ...]` markers go directly in the MDX source at these points.

| Page | Visual | Shows | Make it by |
|---|---|---|---|
| Introduction | Pipeline concept diagram | Input → Context → Strategies → Aggregation → Judge → Output, the shape from the positioning doc's §2 | Hand-drawn mermaid flowchart |
| Core Concepts | File-path → kind → id resolution diagram | A handful of real Lumen paths (`triage.node.yaml`, `flows/support_case/flow.yaml`) mapped to their resolved kind and id | Hand-drawn mermaid diagram |
| Building Flows | One small control-flow shape per node kind | How `switch`, `parallel`, `loop`, `map`, `race` branch and rejoin, in the abstract | Hand-drawn mermaid, one per node-kind page |
| Building Flows / Examples | Full `support_case` flow graph | All ~15 top-level stages of the real Lumen flow, from `prepare` to `finalize` | **Generated, not hand-drawn** — a build-time script parses `flow.yaml` + each node's `body`/`cases` into a mermaid flowchart, so the diagram can never drift from the real example. Real engineering work, not a placeholder task — track as a follow-up item, start with a hand-drawn stand-in. |
| Designing Reliable Workflows | Decision trees (decompose? diverge? critic-loop?) | The decision tables from the workflow-design research, e.g. "is there an external verifiable signal for this node?" | Hand-drawn mermaid, distilled from the research doc's existing ASCII decision tree |
| Testing & Evaluation | Check/test pipeline diagram | static check → simulated run → scenario test → live cassette recording | Hand-drawn mermaid |
| For AI Coding Agents | MCP tool contract flow | agent → MCP tools → `flow_patch` → CAS/rename journal → `aqven check` loop | Hand-drawn mermaid |
| Examples (walkthrough) | Same generated flow graph as above, with the current stage highlighted per section | Reader's "you are here" anchor while reading the node-by-node walkthrough | Same generator, highlight param per section |
| Getting Started, Examples | Studio screenshots ("what this looks like in Studio") | Real UI, once it exists | Deferred entirely to Part 2 — do not block Part 1 content on these; leave `[VISUAL: Studio screenshot — pending Part 2]` markers only |

## 6. "Ask AI" widget

A visitor-facing chat box grounded in the docs content, distinct from §4.14/the `llms.txt` output (which is for
external agents like Claude Code or Cursor reading the site, not a UI feature).

- A Cloudflare Worker (free tier) holds the OpenRouter key server-side and proxies chat requests — the browser
  never sees the key. GitHub Pages itself is static-only, so this is the one piece of infrastructure beyond the
  docs build.
- Grounding: the Worker is given the site's own generated `llms-full.txt` as context, rather than a separate
  vector-search pipeline — the corpus is small enough early on, and it's the same artifact already produced for
  external agents, so there is one corpus instead of two retrieval systems.
- Model: a cheap, high-context OpenRouter model, matching the existing OpenRouter-only preference.
- Deliberate v1 shortcut: once the engine exists past the phase-0 spike, this is a natural candidate to rebuild as
  an actual AQVEN flow — the docs site's own chat agent, built with AQVEN.

## 7. Out of scope

- The marketing/landing page itself (will live at `site/` alongside the docs once designed; not part of this spec).
- Studio *frontend* documentation (screens, canvas, debugger, screenshots) — Studio isn't finished; its own docs
  section is a placeholder nav entry with no content until it stabilizes. Its API is already covered by §4.11.
- Any change to the internal `docs/` planning corpus, which stays Russian and unaffected by this site.

## 8. Required follow-up: ADR-0026 §8 amendment

ADR-0026 §8 / CLAUDE.md currently state a hard, repo-wide rule: no comments in code, and "a docstring counts as a
comment." This spec depends on docstrings existing on the public API surface of `aqven` and `aqven-llm` (owner
decision, this conversation, 2026-09-18) to drive griffe-based API-reference generation. Scope: **public API
surface only** — the exported entry points a host project imports (`Project`, `RunOptions`, `create_local_app`,
`create_mcp_server`, testing helpers, and equivalents in `aqven-llm`). Node/workflow implementation code and the
Lumen example keep the no-comment rule unchanged. This needs its own ADR entry before implementation starts,
not just this spec — it changes a documented law.

## 9. Research notes (verification, Sept 2026)

- Griffe 2.0.0 (Feb 2026, MIT) — `griffe dump <package> -s <path>` serializes public signatures + docstrings to
  JSON on the command line, independent of mkdocs.
- Astro content collections' `file()`/`glob()` loaders read JSON/YAML/MD/MDX from anywhere on the filesystem at
  build time — this is the documented, native pattern for "generate pages from external data," not a workaround.
- `starlight-openapi` (HiDeoo) supports Swagger 2.0, OpenAPI 3.0 and 3.1, local and remote schemas.
- `starlight-llms-txt` (delucis) generates `llms.txt`, `llms-full.txt`, and a filtered `llms-small.txt`. Note:
  Astro's own docs team removed their own `llms.txt` output in April 2026 (per a public writeup) — this is about
  their specific docs, not evidence the plugin or the broader llms.txt ecosystem is abandoned; Anthropic, Stripe,
  Vercel, Cloudflare and others still publish one as of mid-2026, and IDE agents (Claude Code, Cursor, Windsurf,
  Copilot, Cline, Aider) routinely fetch `/llms.txt`/`/llms-full.txt` when pointed at a docs site.
- `aqven`'s CLI is stdlib `argparse` with a custom `Command` wrapper (confirmed by reading `cli.py`), not
  Typer/Click — no drop-in CLI-doc plugin exists for this combination, hence the `--help`-capture approach in §3.
- mkdocs-material + mkdocstrings-python (1.0.4 / 2.0.3, current) was evaluated and rejected — see §2.
- `astro-mermaid` and `rehype-mermaid`/`@beoe/rehype-mermaid` are the current actively maintained options for
  mermaid diagrams in Astro/Starlight; the build-time option needs Playwright/headless Chromium in CI, which is
  the reason to prefer client-side rendering here.

## 10. Open questions

1. Diagnostics-reference generation (§3, §4.13) assumes the `E_*`/`W_*` catalog is structured data inside the
   compiler, not scattered string literals. Confirm against the actual code once it exists past the phase-0 spike;
   if it's not structured, this page starts hand-written and gets generated later.
2. Exact npm/uv wiring for the pre-build codegen step (single `npm run build` orchestrating both the Python-side
   scripts and the Astro build, vs. a separate CI step) is an implementation detail for the plan, not this spec.
3. The flow-graph-to-mermaid generator (§5) is real engineering, not a content task: it has to parse `flow.yaml`
   plus every node's `body`/`cases` recursively, including nested `parallel`/`loop`/`switch` bodies, and needs its
   own scoping before implementation. Content for Building Flows and Examples should ship with a hand-drawn
   stand-in diagram first rather than block on this.
