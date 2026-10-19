# Changelog

All notable changes to **AQVEN** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**AQVEN is alpha software.** Every release so far is `0.0.x`, the API and the project file
formats can still change, and `aqven` / `aqven-llm` are released as a matched pair — the
`aqven` wheel pins its `aqven-llm` to the exact same version, so upgrade them together.

Every entry below cites the commit(s) or tag range it was reconstructed from. Where a change
could not be attributed to a specific commit, that is said out loud.

## [Unreleased]

Work on `main` after the `v0.0.4` tag (`v0.0.4..HEAD`: 23 commits, 16 of them non-merge,
2026-09-28/29). Not on PyPI yet.

### Added

- MCP tools for bulk and compact reads of series and runs, per-agent overrides, and cheap drops of large files (`a8ae481`)
- Skills rewritten to be pattern-neutral and to read series through the new tools (`de574df`), provider-neutral model choice (`6ee117c`), generic across domains and modalities (`65bab6a`)
- Landing site: comparison page organised by the user's questions (`b91a00e`), check-and-cross comparison with named products (`2c14a3c`), centered hero with the Studio graph in a browser frame (`1177b61`), search and AI-search basics (`11f45bb`)
- Repository/community packaging: Claude Code marketplace file, FAQ and definitional sentence (`02e0b88`), pull request template (`fd94f69`), plugin directory validation hook (`dfa1f86`)

### Changed

- Repository is English-only (`6afe902`)
- README shows a current Studio screenshot of the `support_case` flow (`097b31b`)

### Fixed

- `provider_options` now reach google, mistral, xai and bedrock; `aqven check` warns on the providers that cannot take them (`8b15c71`)
- Held-out dataset rows stay hidden from agents, and `aqven run` goes through a running server (`4e356a3`)

## [0.0.4] - 2026-09-28

Tag `v0.0.4` (2026-09-28) → PyPI `aqven` / `aqven-llm` 0.0.4 (uploaded 2026-09-28).
Range `v0.0.3..v0.0.4`: 11 commits (8 non-merge), 146 files changed (+10,533 / −639).

### Added

- Create experiments and pick their cases from Studio (`22496c2`)
- Time left and speed next to attempt counts in the series view, with timestamps shown in the viewer's own time zone (`50dd7cd`)

### Changed

- The chat panel collapses to the left and is brought back from the project bar (`83138ad`)
- READMEs rewritten around the landing page (`e676e08`)

### Fixed

- The spec watcher subscribes before it takes its baseline, so files changed during startup are not missed; crash test made deterministic (`709f30b`)
- The `lumen` example's copies of the bundled skill references re-synced with the engine (`e09710d`)

### Infrastructure

- `pre-push` hook checks bundled skill references and the `lumen` skill copies (`7e0df3e`)
- Release commit bumps both packages and the `aqven → aqven-llm` pin to 0.0.4 (`51c0bfd`)

## [0.0.3] - 2026-09-25

Tag `v0.0.3` (2026-09-25) → PyPI `aqven` / `aqven-llm` 0.0.3 (uploaded 2026-09-25).
Range `v0.0.2..v0.0.3`: 126 commits — 77 non-merge plus 49 squash/branch merges — and 2,043
files changed (+183,755 / −32,858). The largest release so far, and the one that added the
Research layer.

### Added

- **Series engine**: runs a series of experiment attempts on DBOS, statistics on scipy, findings, exposed over REST, MCP and CLI (`8e385ea`)
- **Experiments**: one factor per experiment — an agent, a prompt, a use or a flow (`cd859b2`), listed by last activity with groups, new marks and an archive (`1c83f5c`)
- **Agent skills shipped in the engine** (`06f5811`)
- Per-model rate-limit lanes with `auto`, `fixed` and `fail` strategies (`49e0f8c`); a probe attempt runs first and a rate-limited attempt is requeued once (`ba46199`)
- Spend cap lives in `aqven.yaml` and is edited from Studio Settings (`63c2bf6`); a series paused near its cap can be continued or stopped from Studio (`1e2dcec`)
- Outcome policies: an error outcome plus `fail | retry | fallback` per agent (`1d07971`); `on_item_error` decisions are shown on the run page (`0332c3d`), with a `map_item_recovered` event and `NodeExecution.recovered_items` (`9f77aed`) and recovered/skipped item counts in `node_counts` (`5271e74`)
- Dataset case media stored as project files, with the blob store demoted to a cache (`193481f`)
- Live research updates on the project event channel — series started/progress/status, finding written, experiment changed — over one Studio stream with targeted refresh (`5537e7d`)
- **Studio rebuilt**: Flow and Research modes with a gear for settings, a series list and a one-page experiment (`dd78313`); one-row mode bar with a shared flow picker and a full-height step inspector (`a7f1cf3`); structured experiment page and a compact Cases tab (`9bf6783`); Research lists every flow in sections with tooltips on failed checks (`d512ac0`); every factor value opens its content (`a2ed4a3`); settings and editable API keys for a first-time user (`695c1b7`); launch purpose reads Explore or Confirm (`90bdd75`)
- Cost: actual call cost falls back to the provider price table, and unknown is never reported as `0` (`f2a27bb`); per-provider price sources and series estimates without history (`4a65262`)
- Dev console: one pretty console with run/step lines, noise filters, verbosity flags and a JSONL log; sampling settings on reasoning models now warn (`c5294ed`)
- Hang diagnostics: SIGUSR1 stack dumps and an event-loop stall watchdog in `aqven dev` / `aqven serve` (`dd32a02`)
- Server status checks and a Studio health indicator (`dea942e`)
- Docs site: 32 new pages in this range, including dataset media files (`193481f`), rate limits and the probe attempt (`1089060`) and the experiments / research-loop section (`09659f1`); landing page leads with five use cases plus a `/use-cases/` page (`647eceb`); README rewritten following patterns of top open-source AI projects (`e54528f`); the landing navbar shows the latest release and its date (`2aa6a36`)

### Changed

- The hard-coded model capability table is gone, and the framework no longer gates on model capabilities; strict and image output are set by the flow (`4f8a8a3`, `a7b3702`, `aae8bc5`)
- No cost or time estimate is shown before a series starts (`0b0af5b`); spend pauses near the cap instead of estimate approvals (`3beb3d1`)
- `aqven new --provider` keeps the template's data policy (`a169853`); the pydantic-ai first-run banner is off by default (`c34c3be`)

### Removed

- **Breaking**: the `Eval` kind, the eval runner, the gate, `optimize` and dataset batches (`686d360`, 169 files, −13,807 lines). Research with series and experiments replaces them.

### CLI

- **Breaking**: `aqven eval` and `aqven optimize` were removed; `aqven series`, `aqven datasets`, `aqven skills` and `aqven hook` were added (diff of `packages/aqven/src/aqven/cli.py` between `v0.0.2` and `v0.0.3`)

### Dependencies

- `scipy==1.18.1` and `numpy==2.5.3` added to `aqven`; both packages and the `aqven → aqven-llm` pin moved to 0.0.3 (`diff v0.0.2..v0.0.3 -- packages/aqven/pyproject.toml`)

### Fixed

- The current project's folder goes first on `sys.path`, so a reloaded package never resolves to another project's copy; project modules reload when their files change (`e89c5e7`, `4eccf5e`)
- Execution detail never compiles the working copy, and stored plans verify by the hash they were saved under; `start_run` takes the workspace's compiled state instead of recompiling on the event loop (`81416a7`, `da82b9a`)
- A run launches the workspace state its start guards checked (`55bd194`); the DBOS executor pool is bounded (`dda9d81`)
- Simulation: children die with their task and only one debounced simulation runs at a time (`68c7333`); the debounce restarts when a refresh begins (`151ae8b`); the project watcher survives a failing refresh and files that vanish mid-rebuild (`9d9259a`)
- A client that leaves an event stream is no longer logged as an application error (`845d03e`); Studio keeps one event stream per tab (`4b0be52`)
- Chat: continuation turns, stuck turns settle on stop/close/restart, Reset, server guard, lossless folded transcript history (`b7adf19`)
- Performance: run summaries table, one-query event log, batched waits, and folding only the runs a page needs (`f739637`, `d7d1b24`)

## [0.0.2] - 2026-09-23

Tag `v0.0.2` (2026-09-23) → PyPI `aqven` / `aqven-llm` 0.0.2 (uploaded 2026-09-23).
Range `v0.0.1..v0.0.2`: 20 commits (15 non-merge) — a polish-and-hardening release, no new
subsystems.

### Added

- Studio canvas: hover to trace an edge, visible coloured port dots (`9f05157`); ports spread out, edges coloured by their source, flow direction animated (`a274ee2`)
- `aqven dev` prints a real startup banner (`d9138d1`)
- Docs site: how to customise a node's display in Studio (`174bdec`)

### Changed

- The project page is folded into Settings and dropped from the flow picker (`80a5ea1`)
- `aqven new` no longer claims to have written an `.env` it did not write, and the wizard survives bad input (`abec4be`)

### Fixed

- SSE streams no longer block graceful shutdown (`d9138d1`)
- Canvas layout: a rank's nodes are reordered by predecessor position to cut edge crossings (`ac0b2b3`), and wrapped canvas rows no longer strand their cross-row edges (`f057cfe`)
- Project templates make the dataset and evals step required rather than an afterthought (`117c6b1`)
- The `lumen` example's missing scenario cassettes were recorded, along with the model-reliability bugs behind them (`c80288d`)

### Dependencies

- **Packaging bug fixed in this release**: the first 0.0.2 build pinned `aqven → aqven-llm==0.0.1`; it was repinned to the current 0.0.2 (`cc2dc95`). Version bump itself: `a443895`.

### Infrastructure

- CI catches a stale generated API reference before it reaches a merge (`a9bb08c`); `test_new_project` no longer hard-codes the expected pin (`9e1543a`)

## [0.0.1] - 2026-09-22

Tag `v0.0.1` (`65fe0a4`, "Initial commit: AQVEN 0.0.1") → PyPI 0.0.1 (uploaded 2026-09-22).

### Changed

- **The public repository history was restarted.** `v0.0.1` is a squashed single commit; the
  54 commits that led to `v0.0.0` were left behind on a disjoint root and are only reachable
  through the `v0.0.0` tag. No code change between the two tags is attributable to a public
  commit other than the squash itself — evidence: `git rev-list --max-parents=0` differs
  between the tags, `diff v0.0.0..v0.0.1` = 1,160 files (+173,300 / −318,682).
- Versions bumped to 0.0.1 in `packages/aqven/pyproject.toml`, `packages/aqven-llm/pyproject.toml`
  and the `aqven → aqven-llm` pin (`diff v0.0.0..v0.0.1 -- '*/pyproject.toml'`).
- `LICENSE` added to the repository (was absent at `v0.0.0`) (`diff v0.0.0..v0.0.1 --diff-filter=A`).
- Internal design material was not published in the restart: `docs/adr`, `docs/research`,
  `docs/dsl`, `docs/playground`, `docs/frontend`, `docs/files-first` and the old docs pages are
  absent from `v0.0.1` onward (`diff v0.0.0..v0.0.1 --diff-filter=D`). The ADR numbers quoted in
  commit messages (ADR-0049, ADR-0050, ADR-0058) therefore have no public file to point at.

## [0.0.0] - 2026-09-21

Tag `v0.0.0` (`9a34a2c`) → PyPI 0.0.0 (uploaded 2026-09-21). **First published release.**
Reconstructed from the discarded history reachable only through the tag:
`git log v0.0.0` = 54 commits, 2026-09-14 → 2026-09-21, before the repository restart.

### Added

- `aqven` and `aqven-llm` published to PyPI by tag (`3d90ee8`), plus a TestPyPI target for the release workflow (`9a34a2c`)
- Studio is shipped inside the `aqven` wheel, served from `aqven/server/static.py` (`343e31b`, `git ls-tree -r v0.0.0 -- packages/aqven`)
- Python engine with the `lumen` showcase (`e6a36cb`); Studio on Vite replaces the old playground, and the earlier TypeScript engine is dropped (`ea2069e`)
- Workflow core at the root commit: DSL, synthesis into IR, CLI and interface (`472368a`)
- Monorepo flattened to a single root (`cb235fa`)
- Docs site scaffolded on Astro + Starlight and published to GitHub Pages: mermaid support (`f3a131b`), full navigation with stub pages (`2faeb1d`), and the priority guide pages — Models & Providers (`1355c31`), Structured Output & Types (`64ecf6e`), Designing Reliable Workflows (`0d8b984`), For AI Coding Agents (`dd76af4`), Building Flows (`3e09c46`), Writing Prompts (`7751dc0`), Testing & Evaluation (`459598b`)
- Landing site for aqvenstudio.com on GitHub Pages (`2ea9ccb`), with the AQVEN manifesto README (`08e47da`)

### Included at first publication (no single commit to attribute — the initial commit's contents, `472368a`)

- Engine, compiler, spec/loader/IR, server, Studio API, MCP surface, chat with Claude and Codex backends, check, models, runtime, policies, ports and project templates: 20 subpackages under `packages/aqven/src/aqven`, 206 files in `templates` alone (`git ls-tree -r v0.0.0`)
- `aqven-llm` as the provider-isolation layer: factory, catalog, adapters, routing, keys, media (`git ls-tree v0.0.0 -- packages/aqven-llm/src`)
- CLI at 0.0.0: `new`, `check`, `generate`, `schema`, `tree`, `refs`, `fmt`, `plan`, `build`, `run`, `dev`, `studio`, `serve`, `mcp`, `models`, `secrets`, `prompt`, `eval`, `optimize` (`git show v0.0.0:packages/aqven/src/aqven/cli.py`)

### Known gaps at 0.0.0

- No `LICENSE` file in the repository (`git ls-tree v0.0.0`), and no GitHub Releases entry for any version

## Links

[Unreleased]: https://github.com/lastonoga/AQVEN/compare/v0.0.4...HEAD
[0.0.4]: https://github.com/lastonoga/AQVEN/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/lastonoga/AQVEN/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/lastonoga/AQVEN/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/lastonoga/AQVEN/compare/v0.0.0...v0.0.1
[0.0.0]: https://github.com/lastonoga/AQVEN/releases/tag/v0.0.0
