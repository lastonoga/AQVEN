# Runs Latest Selection Implementation Plan

> Revised 2026-09-18 after owner feedback: keep the existing compact picker. The earlier dataset/node metadata extension was removed.

**Goal:** Opening the Runs tab selects the newest run for the flow without changing the picker's ID/status presentation.

**Architecture:** Resolve a missing `?run=` to the first item of the existing newest-first run list in the route loader. An explicit run ID keeps priority. No additional backend fields or picker requests are needed.

**Worktree safety:** This checkout contains extensive pre-existing staged and unstaged changes. Do not reset, clean, or commit implementation files.

## Tasks

- [x] Replace the old unselected `/runs` test with newest-run, empty-list, explicit-ID, and top-navigation coverage.
- [x] Resolve the effective run ID in the Runs route loader without changing the URL or adding a second load.
- [x] Make mock list entries without recorded snapshots openable for route tests, without inventing run metadata.
- [x] Restore the compact picker and test that dataset/node fields in a response are not duplicated there.
- [x] Confirm focused and full Studio tests, typecheck, build, and API consistency.

Repository-wide lint and Python type-check failures in unrelated files remain outside this plan.
