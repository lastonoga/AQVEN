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

- MCP tools for bulk and compact reads of series and runs, per-agent overrides, and cheap drops of large files (`b8fe592`)
- Skills rewritten to be pattern-neutral and to read series through the new tools (`9ec4188`), provider-neutral model choice (`d23bbc5`), generic across domains and modalities (`6d68793`)
- Landing site: comparison page organised by the user's questions (`bc6ed88`), check-and-cross comparison with named products (`1585f2b`), centered hero with the Studio graph in a browser frame (`fb32542`), search and AI-search basics (`be2e6ac`)
- Repository/community packaging: Claude Code marketplace file, FAQ and definitional sentence (`04cadd5`), pull request template (`6aa85a2`), plugin directory validation hook (`f3bfdcc`)

### Changed

- Repository is English-only (`66c86f9`)
- README shows a current Studio screenshot of the `support_case` flow (`e2cedc4`)

### Fixed

- `provider_options` now reach google, mistral, xai and bedrock; `aqven check` warns on the providers that cannot take them (`5404d55`)
- Held-out dataset rows stay hidden from agents, and `aqven run` goes through a running server (`288f418`)

## [0.0.4] - 2026-09-28

Tag `v0.0.4` (2026-09-28) → PyPI `aqven` / `aqven-llm` 0.0.4 (uploaded 2026-09-28).
Range `v0.0.3..v0.0.4`: 11 commits (8 non-merge), 146 files changed (+10,533 / −639).

### Added

- Create experiments and pick their cases from Studio (`bd4d3ec`)
- Time left and speed next to attempt counts in the series view, with timestamps shown in the viewer's own time zone (`7cdc236`)

### Changed

- The chat panel collapses to the left and is brought back from the project bar (`5521868`)
- READMEs rewritten around the landing page (`871c826`)

### Fixed

- The spec watcher subscribes before it takes its baseline, so files changed during startup are not missed; crash test made deterministic (`21dfd1b`)
- The `lumen` example's copies of the bundled skill references re-synced with the engine (`bf75632`)

### Infrastructure

- `pre-push` hook checks bundled skill references and the `lumen` skill copies (`8827e4b`)
- Release commit bumps both packages and the `aqven → aqven-llm` pin to 0.0.4 (`4d2b8a6`)

## [0.0.3] - 2026-09-25

Tag `v0.0.3` (2026-09-25) → PyPI `aqven` / `aqven-llm` 0.0.3 (uploaded 2026-09-25).
Range `v0.0.2..v0.0.3`: 126 commits — 77 non-merge plus 49 squash/branch merges — and 2,043
files changed (+183,755 / −32,858). The largest release so far, and the one that added the
Research layer.

### Added

- **Series engine**: runs a series of experiment attempts on DBOS, statistics on scipy, findings, exposed over REST, MCP and CLI (`8a1bb3c`)
- **Experiments**: one factor per experiment — an agent, a prompt, a use or a flow (`c983470`), listed by last activity with groups, new marks and an archive (`be15df9`)
- **Agent skills shipped in the engine** (`6905a3b`)
- Per-model rate-limit lanes with `auto`, `fixed` and `fail` strategies (`537d3a1`); a probe attempt runs first and a rate-limited attempt is requeued once (`18151c7`)
- Spend cap lives in `aqven.yaml` and is edited from Studio Settings (`18b5acc`); a series paused near its cap can be continued or stopped from Studio (`585bcb9`)
- Outcome policies: an error outcome plus `fail | retry | fallback` per agent (`0271260`); `on_item_error` decisions are shown on the run page (`b9a2b18`), with a `map_item_recovered` event and `NodeExecution.recovered_items` (`5043d3a`) and recovered/skipped item counts in `node_counts` (`0020b86`)
- Dataset case media stored as project files, with the blob store demoted to a cache (`130512d`)
- Live research updates on the project event channel — series started/progress/status, finding written, experiment changed — over one Studio stream with targeted refresh (`8ae8b6f`)
- **Studio rebuilt**: Flow and Research modes with a gear for settings, a series list and a one-page experiment (`09d42d8`); one-row mode bar with a shared flow picker and a full-height step inspector (`fc95928`); structured experiment page and a compact Cases tab (`3674392`); Research lists every flow in sections with tooltips on failed checks (`a6cab57`); every factor value opens its content (`291f348`); settings and editable API keys for a first-time user (`3f48ed0`); launch purpose reads Explore or Confirm (`f91b545`)
- Cost: actual call cost falls back to the provider price table, and unknown is never reported as `0` (`72a8425`); per-provider price sources and series estimates without history (`322773f`)
- Dev console: one pretty console with run/step lines, noise filters, verbosity flags and a JSONL log; sampling settings on reasoning models now warn (`918a0b4`)
- Hang diagnostics: SIGUSR1 stack dumps and an event-loop stall watchdog in `aqven dev` / `aqven serve` (`a592aec`)
- Server status checks and a Studio health indicator (`5fb0583`)
- Docs site: 32 new pages in this range, including dataset media files (`130512d`), rate limits and the probe attempt (`c25ef12`) and the experiments / research-loop section (`388052b`); landing page leads with five use cases plus a `/use-cases/` page (`eff240f`); README rewritten following patterns of top open-source AI projects (`2f5233c`); the landing navbar shows the latest release and its date (`4985242`)

### Changed

- The hard-coded model capability table is gone, and the framework no longer gates on model capabilities; strict and image output are set by the flow (`87d149d`, `d1b65f1`, `56714f2`)
- No cost or time estimate is shown before a series starts (`1fdcc23`); spend pauses near the cap instead of estimate approvals (`c159f85`)
- `aqven new --provider` keeps the template's data policy (`2c9637b`); the pydantic-ai first-run banner is off by default (`3109b5c`)

### Removed

- **Breaking**: the `Eval` kind, the eval runner, the gate, `optimize` and dataset batches (`7fa865c`, 169 files, −13,807 lines). Research with series and experiments replaces them.

### CLI

- **Breaking**: `aqven eval` and `aqven optimize` were removed; `aqven series`, `aqven datasets`, `aqven skills` and `aqven hook` were added (diff of `packages/aqven/src/aqven/cli.py` between `v0.0.2` and `v0.0.3`)

### Dependencies

- `scipy==1.18.1` and `numpy==2.5.3` added to `aqven`; both packages and the `aqven → aqven-llm` pin moved to 0.0.3 (`diff v0.0.2..v0.0.3 -- packages/aqven/pyproject.toml`)

### Fixed

- The current project's folder goes first on `sys.path`, so a reloaded package never resolves to another project's copy; project modules reload when their files change (`02a8ba7`, `f3bd58e`)
- Execution detail never compiles the working copy, and stored plans verify by the hash they were saved under; `start_run` takes the workspace's compiled state instead of recompiling on the event loop (`1d9df75`, `8fc429a`)
- A run launches the workspace state its start guards checked (`062c38c`); the DBOS executor pool is bounded (`dd00d4d`)
- Simulation: children die with their task and only one debounced simulation runs at a time (`f7b56be`); the debounce restarts when a refresh begins (`124f656`); the project watcher survives a failing refresh and files that vanish mid-rebuild (`cbbeccd`)
- A client that leaves an event stream is no longer logged as an application error (`f468957`); Studio keeps one event stream per tab (`1f359ab`)
- Chat: continuation turns, stuck turns settle on stop/close/restart, Reset, server guard, lossless folded transcript history (`fc66cce`)
- Performance: run summaries table, one-query event log, batched waits, and folding only the runs a page needs (`428bdf0`, `ab66cd3`)

## [0.0.2] - 2026-09-23

Tag `v0.0.2` (2026-09-23) → PyPI `aqven` / `aqven-llm` 0.0.2 (uploaded 2026-09-23).
Range `v0.0.1..v0.0.2`: 20 commits (15 non-merge) — a polish-and-hardening release, no new
subsystems.

### Added

- Studio canvas: hover to trace an edge, visible coloured port dots (`a46c13c`); ports spread out, edges coloured by their source, flow direction animated (`7224a1c`)
- `aqven dev` prints a real startup banner (`454e819`)
- Docs site: how to customise a node's display in Studio (`4d79d4d`)

### Changed

- The project page is folded into Settings and dropped from the flow picker (`a579b97`)
- `aqven new` no longer claims to have written an `.env` it did not write, and the wizard survives bad input (`923e3c7`)

### Fixed

- SSE streams no longer block graceful shutdown (`454e819`)
- Canvas layout: a rank's nodes are reordered by predecessor position to cut edge crossings (`b8607ec`), and wrapped canvas rows no longer strand their cross-row edges (`2f86693`)
- Project templates make the dataset and evals step required rather than an afterthought (`6f8aeda`)
- The `lumen` example's missing scenario cassettes were recorded, along with the model-reliability bugs behind them (`6151a22`)

### Dependencies

- **Packaging bug fixed in this release**: the first 0.0.2 build pinned `aqven → aqven-llm==0.0.1`; it was repinned to the current 0.0.2 (`e1cb892`). Version bump itself: `c016e64`.

### Infrastructure

- CI catches a stale generated API reference before it reaches a merge (`9e5418c`); `test_new_project` no longer hard-codes the expected pin (`ad25165`)

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

Tag `v0.0.0` (`0e64e75`) → PyPI 0.0.0 (uploaded 2026-09-21). **First published release.**
Reconstructed from the discarded history reachable only through the tag:
`git log v0.0.0` = 54 commits, 2026-09-14 → 2026-09-21, before the repository restart.

### Added

- `aqven` and `aqven-llm` published to PyPI by tag (`cbfba0e`), plus a TestPyPI target for the release workflow (`0e64e75`)
- Studio is shipped inside the `aqven` wheel, served from `aqven/server/static.py` (`c2d756d`, `git ls-tree -r v0.0.0 -- packages/aqven`)
- Python engine with the `lumen` showcase (`5705e53`); Studio on Vite replaces the old playground, and the earlier TypeScript engine is dropped (`d24799c`)
- Workflow core at the root commit: DSL, synthesis into IR, CLI and interface (`e56bbad`)
- Monorepo flattened to a single root (`a801a40`)
- Docs site scaffolded on Astro + Starlight and published to GitHub Pages: mermaid support (`41f4a79`), full navigation with stub pages (`8e08ef3`), and the priority guide pages — Models & Providers (`7b0bdc7`), Structured Output & Types (`36b4121`), Designing Reliable Workflows (`664a3f9`), For AI Coding Agents (`578d7df`), Building Flows (`e38827c`), Writing Prompts (`3a94a41`), Testing & Evaluation (`fac52d6`)
- Landing site for aqvenstudio.com on GitHub Pages (`f93b1ad`), with the AQVEN manifesto README (`ec3fafd`)

### Included at first publication (no single commit to attribute — the initial commit's contents, `e56bbad`)

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
