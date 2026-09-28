# Instructions for agents in this repository

**AQVEN** is a platform for reliable AI workflows. The engine, Studio and the documentation site live in this
repository. The design documentation lives in [docs/](docs/) and is written from verified facts: PyPI JSON
metadata and `npm view`, the sources of installed packages, Studio's `.d.ts` files, official docs, and running
the code.

## Read before any task

1. [docs/DECISIONS.md](docs/DECISIONS.md): cross-cutting decisions, the version axis, what we take ready-made,
   what we write ourselves, and where we depart from the original spec. **This is the law.** Code that
   contradicts it is a bug in the code.
2. [docs/CONVENTIONS.md](docs/CONVENTIONS.md): rules for documentation and for the style of examples.
3. The document on the topic of the task; the map is in [docs/README.md](docs/README.md).
4. [docs/99-open-questions.md](docs/99-open-questions.md): if a task runs into an open question, do not
   settle it silently. It is either closed by the owner's decision or it stays open.

## File model of definitions

Workflow definitions are files in the project repository, the database is a rebuildable index, and history
is git ([ADR-0017](docs/adr/0017-files-as-source-of-truth.md), details in [docs/files-first/](docs/files-first/)).

- Where things live: `flows/<flow_id>/flow.yaml`, a node in `nodes/<node_id>.yaml`. A prompt is never a string
  in YAML: it is a `<node_id>.prompt.md` or `prompts/<key>.md` file, and at level 3 a `module:function` in a
  `.py` file ([ADR-0026](docs/adr/0026-yaml-spec-and-code-refs.md) §4). Identity is the file path; there is no
  `id` field inside a file.
- **Edit directly** with Read/Edit/Write: prompt text, a targeted change to one node, bulk replacements.
- **Edit only through the `flow_patch` operation**: structural and cross-file changes and renames (they append
  to the `renames` log in `aqven.yaml`, which the lineage resolvers read).
- Optimistic locking is a CAS on the sha256 of the file bytes (`expects[{path, file_hash}]` plus
  `client_op_id`). On `STALE_FILE`, reread the file and replay the intent; overwriting by force is forbidden.
- A prompt draft lives in `.aqven/drafts/`, which is in `.gitignore`: a prompt is committed explicitly, as a
  separate decision.
- Do not touch the service paths `.aqven/lock` and `.aqven/txn/` by hand: they are the write transaction.
- **`aqven check` is required before a commit.** An invalid tree can be committed but not released; the
  invariant is held by the `flow_check` hook on `PostToolUse` and by CI, not by the database.

## Hard rules

- **Do not reinvent the wheel.** If a live, maintained library exists, use it. Write our own code only where
  the documentation says plainly that nothing ready-made exists: the IR, the compiler, node executors with
  guarantees, registries, the MCP contract, the domain gate policy on top of scipy and statsmodels, the IR
  mutator.
- **Check libraries before using them.** Version, license, release freshness and dependencies
  (`Requires-Dist` and extras, npm peers) come from PyPI JSON, the sources of the installed package,
  `npm view` for Studio, official docs and running the code, not from memory. Record the result in
  [docs/98-version-audit.md](docs/98-version-audit.md).
- **Do not touch the version axis.** Engine: CPython 3.14 (`>=3.14,<3.15`), `pydantic-ai-slim` and
  `pydantic-evals` 2.43.0, `pydantic` 2.13.5, `dbos` 2.31.1, `httpx2` 2.13.0, `fastapi` 0.141.1 without extras,
  `mcp` 2.2.0; tools: uv 0.12.15, ruff 0.16.7, pyright 1.1.414; pins are `==`, one `uv.lock`. `typescript@6.0.3`
  is for `apps/studio` only. The full axis and the reasons are in
  [ADR-0025](docs/adr/0025-python-engine.md) §1–§2.
- **No comments in code.** Names explain themselves; explanations belong in the documentation. `E_DOCSTRING`
  ([ADR-0026](docs/adr/0026-yaml-spec-and-code-refs.md) §8) forbids docstrings on step functions and on the
  builder's `Signature` **in a project built on aqven**; it does not apply to the engine. The only exception in
  the whole repository is the public surface of the `aqven` and `aqven-llm` packages: there a docstring is
  required and is the source of the API reference on the documentation site
  ([ADR-0031](docs/adr/0031-public-api-docstrings.md)). After changing the public surface (a new dataclass
  field, a signature, a docstring), regenerate the reference with `uv run python tools/generate_reference.py`,
  or CI (`reference:check` in `Pages`) fails on a stale `apps/site/src/content/docs/reference/python-api.md`.
  `mise run install` enables the `.githooks/pre-push` git hook, which checks this before every push;
  `mise run check` runs the same check locally.
- **Flat code.** Early returns, guard clauses, handler tables and Strategy instead of nested if/else and
  switch ladders.
- **SOLID and named patterns.** If you apply a pattern, name it in the description of the change.
- **Strict typing.** The engine is pyright strict: no `Any`, no `cast` except at I/O boundaries,
  `typing.NewType` for identifiers, exhaustiveness through `typing.assert_never`. `apps/studio` is strict
  TypeScript: no `any`, no `as` except at I/O boundaries, branded types, exhaustiveness through `assertNever`.
- **Imports of `openai`, `anthropic`, `google.genai`, `pydantic_ai.providers` and
  `pydantic_ai.models.{openai,anthropic,google}` belong only in the `aqven_llm` module** (the `aqven-llm`
  distribution); the rest of the code gets a `Model` from its factory.
- **The HTTP client of our code is `httpx2` only.** We do not import `httpx` or `requests`; they are allowed
  transitively. Ruff TID251 enforces both bans, and a `uv.lock` check in CI covers the transitive consumers of
  `httpx` and `requests` ([ADR-0025](docs/adr/0025-python-engine.md) §5–§6).

## Sources of truth when documents disagree

| Topic | Source |
|---|---|
| Versions, the take/write boundary | docs/DECISIONS.md |
| MCP tool names | docs/14-mcp-contract.md |
| Database tables and columns | docs/16-data-model.md |
| Monorepo layout, workspace roots, CI | docs/adr/0036-single-root-monorepo.md, until docs/20-repo-and-tooling.md is rewritten |
| Packaging Studio into the distribution, one-command install | docs/adr/0037-studio-inside-the-wheel.md |
| Packages in the monorepo | docs/adr/0025-python-engine.md §2, §6, until docs/20-repo-and-tooling.md is rewritten |
| Ports and adapters | docs/adr/0025-python-engine.md and docs/02-architecture.md; when they disagree the ADR wins until 02 is cleaned up |
| Definitions on disk, writes, CAS, history | docs/adr/0026-yaml-spec-and-code-refs.md §2, §4, §9 and docs/files-first/; when they disagree ADR-0026 wins until files-first is cleaned up |
| Definition file format: kinds, keys, prompts, the `code` step | docs/adr/0026-yaml-spec-and-code-refs.md |
| Studio API: routes, events, writes, error codes | docs/23-studio-api.md |
| Compiler rule codes | docs/07-compiler.md |

## Do not

- Do not change [docs/00-source-spec.ru.md](docs/00-source-spec.ru.md): it is the customer's original brief
  and it does not change. Departures from it are recorded in DECISIONS and in ADRs.
- Do not delete [docs/research/](docs/research/): it is the evidence behind the decisions, marked
  `UNVERIFIED:` where no confirmation was found.
- Do not make an architectural decision without an ADR in [docs/adr/](docs/adr/).
