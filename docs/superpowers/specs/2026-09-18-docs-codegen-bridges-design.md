# Docs site codegen bridges — design

> Status: draft
> Depends on: [2026-09-18-docs-site-design.md](2026-09-18-docs-site-design.md) §3, [ADR-0031](../../adr/0031-public-api-docstrings.md)
> Sources: read directly from `aqven-py/packages/aqven/src` and `aqven-py/packages/aqven-llm/src` in this session — not research docs, the actual current code

## 1. What's already there

Investigation found the engine package is far more built out than the root `CLAUDE.md`'s "no code yet" framing
suggests, and three of the five reference pages need **no new engine code at all** — just calling functions that
already exist:

| Reference page | Real source, already in the code | New code needed |
|---|---|---|
| HTTP API | `aqven.server.openapi.export_openapi()` — builds a full OpenAPI 3.1 spec from a contract-only app, no real project required | None |
| Configuration | `aqven.spec.schema.editor_schema(kind)` for each of the 10 `SpecKind` values (`Project`, `Type`, `Flow`, `Node`, `Dataset`, `Eval`, `Inference`, `Agent`, `Tool`, `McpServer`) — the same schema the engine validates against | None |
| Diagnostics | `aqven.diagnostics.DiagnosticCode` (~110 real `E_*`/`W_*` members), `SEVERITY_BY_PREFIX` (derives severity automatically), `RULE_BY_CODE` (partial — ~28 codes), `DIAGNOSTIC_TEXTS` (partial — ~13 codes have a real message/hint template) | None, but see §4 for the honesty tradeoff this partial coverage forces |
| CLI | `aqven.cli.COMMANDS` — a real registry of 18 subcommands, some (`fmt`, `plan`, `build`, `eval`, `optimize`) are `PendingCommand` stubs that print "not implemented" | None, capture `--help` per command |
| Python API | `aqven.__all__` / `aqven.testing.__all__` / `aqven_llm.__all__` are curated public-surface lists (~100 symbols total), but **none of them have docstrings** — they were banned before ADR-0031 | Yes — writing real docstrings is the actual work here |

## 2. Docstring scope (ADR-0031's "public surface" made concrete)

Not the full ~100-symbol public surface — the subset `project-structure.md` §10 and `building-flows.md` §5
already document as what a host project or its coding agent actually imports and calls:

| Symbol | File |
|---|---|
| `Project`, `ProjectInvalid` | `aqven/runtime/project.py` |
| `RunOptions` | `aqven/runtime/options.py` |
| `AppAccess`, `LocalTokenAccess`, `LocalAppOptions`, `create_local_app`, `create_mcp_server`, `local_app_lifespan` | `aqven/app/local_app.py` |
| `check_project`, `CheckReport` | `aqven/check/__init__.py`, `aqven/check/report.py` |
| `node_output`, `node_failure` | `aqven/runtime/overrides.py` |
| `offline_options` | `aqven/testing/offline.py` |
| `CassetteConfig`, `CassetteMode` | `aqven/models/cassette.py` |
| `AdapterCase`, `check_adapter` | `aqven/testing/providers.py` |
| `ProviderContext` | `aqven_llm/adapters.py` |

18 symbols. The rest of the ~100-symbol public surface (most of `aqven-llm`'s internals, most of
`aqven.testing`) stays undocumented for now — same phased approach already used for the content pages: ship the
part that's actually used first, expand later. The generated reference page only lists symbols that have a
docstring; it doesn't render a broken entry for the other ~80.

## 3. Build orchestration

The docs build gains a Python dependency for the first time. Generator scripts live in `aqven-py/`, not `site/`
— that's where `uv` and the `aqven`/`aqven-llm` packages are already set up as a workspace, and where `griffe`
(a new dev dependency of that workspace) can actually `import aqven`.

- **Location:** `aqven-py/scripts/docs_codegen/` — one script per bridge (`cli.py`, `python_api.py`, `http_api.py`,
  `config.py`, `diagnostics.py`), run via `uv run python -m docs_codegen.<name>` or a single entrypoint that runs
  all five.
- **Output:** JSON files written to `site/src/generated/` — a new directory, gitignored (added to the root
  `.gitignore`), fully derived and never committed, same principle as `types.py`.
- **Consumption:** Astro content collections' `file()`/`glob()` loaders read `site/src/generated/*.json` at
  build time; `starlight-openapi` reads the HTTP API JSON directly.
- **CI:** `.github/workflows/pages.yml` gains a `uv`/Python 3.14 setup step and `uv sync --project aqven-py` +
  the codegen script, before the existing `pnpm --filter @aqven/site build` step. This is the first time the
  Pages workflow needs anything beyond Node/pnpm.

## 4. Scope decisions for the two reference pages with partial source data

- **CLI reference:** all 18 commands from `COMMANDS` are listed. The five `PendingCommand` stubs (`fmt`, `plan`,
  `build`, `eval`, `optimize`) get a distinct "not yet implemented" marker instead of being hidden or documented
  as if they worked — the registry itself already carries this distinction (`PendingCommand` vs. the real
  command classes), so the generator just surfaces it.
- **Diagnostics reference:** the full ~110-code table is generated — code, severity (always derivable), rule
  (from `RULE_BY_CODE` where present, ~28 codes). Message/hint text is shown **only** where `DIAGNOSTIC_TEXTS`
  has a real template (~13 codes) — for the rest, no fabricated prose gets attached to a code; the code name
  itself is usually self-descriptive (`E_SWITCH_NOT_EXHAUSTIVE`, `E_REF_MISSING`), and coverage grows over time
  as `DIAGNOSTIC_TEXTS` grows in the actual engine code. This is the same honesty principle as the docstring
  scope: generate what's real, don't invent what isn't there yet.

## 5. Out of scope for this pass

- Docstrings beyond the 18-symbol list in §2.
- `griffe`, `starlight-openapi` exact version pins — confirmed via `npm view`/PyPI at implementation time, not
  guessed here.
- Any change to the actual diagnostic messages in `aqven/diagnostics.py` — this pass only reads that data, it
  doesn't grow `DIAGNOSTIC_TEXTS` coverage (that's engine work, not docs work).
