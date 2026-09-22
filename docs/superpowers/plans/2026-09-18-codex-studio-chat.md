# Codex CLI and Project Chat Threads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Codex CLI as a selectable Studio chat agent with Claude-level streaming, approvals, MCP, resume, and multiple agent-labelled threads under one project.

**Architecture:** Keep the current `AgentBackend` port and SQLite journal; add a project-level backend preference and a registry that routes existing sessions by their persisted `backend`. The Codex adapter owns a pinned `openai-codex` app-server client, translates its typed notifications into existing `ChatEvent`s, and bridges approval requests to the Studio approval API. The chat panel displays all project sessions and creates new sessions with the selected backend while leaving previous transcripts intact.

**Tech Stack:** Python 3.14, FastAPI, Pydantic, `openai-codex==0.147.0`, SQLite, React, TypeScript 6, TanStack Router, Vitest/MSW.

---

## Execution constraints

- Work in the current checkout, because relevant uncommitted user changes exist in both `aqven-py` and `apps/studio`; an isolated worktree would omit them. Inspect `git diff` and `git diff --cached` before each overlapping edit. Never reset those changes.
- Follow [the approved design](../specs/2026-09-18-codex-studio-chat-design.md), [DECISIONS.md](../../DECISIONS.md), [CONVENTIONS.md](../../CONVENTIONS.md), and [the Studio API contract](../../23-studio-api.md). Add ADR-0034 before shipping the architecture change; 0032 and 0033 were already allocated.
- Use the pinned SDK's low-level `CodexClient`, never its high-level default approval handler: version 0.147.0 accepts command and file-change approval requests unless an explicit handler is supplied.
- Run `aqven-py/.venv/bin/aqven check aqven-py/examples/lumen` before each targeted commit; stage only paths changed for this feature, because the index contains unrelated user work.
- A thread means an AQVEN `ChatSession`. All sessions use the same project files, selected flow scope and AQVEN MCP server, but conversation history does not cross session or agent boundaries.

## File map

| Responsibility | Files |
|---|---|
| Domain and project preference | `aqven-py/packages/aqven/src/aqven/ports/chat.py`, new `aqven-py/packages/aqven/src/aqven/chat/backend_selection.py` |
| Routing and composition | new `aqven-py/packages/aqven/src/aqven/chat/backend_registry.py`, `aqven-py/packages/aqven/src/aqven/server/chat/router.py`, `aqven-py/packages/aqven/src/aqven/server/chat/extension.py`, `aqven-py/packages/aqven/src/aqven/app/composition.py` |
| Codex process, policy and events | new `aqven-py/packages/aqven/src/aqven/chat/codex_runtime.py`, `codex_policy.py`, `codex_normalizer.py`, `codex_approvals.py`, `codex_runner.py`, `codex_backend.py`, `project_rules.py` |
| Python dependency and tests | `aqven-py/packages/aqven/pyproject.toml`, `aqven-py/uv.lock`, new `aqven-py/packages/aqven/tests/chat/test_backend_selection.py`, `test_codex_policy.py`, `test_codex_normalizer.py`, `test_codex_backend.py`, `test_codex_integration.py`; existing `test_chat_router.py` |
| Studio settings and project threads | `apps/studio/src/features/setup/settings-screen.tsx`, `chat-status.tsx`, `apps/studio/src/features/chat/chat-panel.tsx`, new `chat-thread-list.tsx`, `apps/studio/src/data/live/sources.ts`, `apps/studio/src/domain/live.ts`, mocks, setup/chat tests, English message JSON (the app currently ships only English) |
| Generated contract and docs | `apps/studio/src/api/openapi.json`, `apps/studio/src/api/schema.d.ts`, `docs/adr/0034-codex-and-project-chat-threads.md`, `docs/DECISIONS.md`, `docs/23-studio-api.md`, `docs/98-version-audit.md`, installation/user guidance |

### Task 1: Pin and probe the Codex runtime

**Files:** Modify `aqven-py/packages/aqven/pyproject.toml`, `aqven-py/uv.lock`; create `aqven-py/packages/aqven/tests/chat/test_codex_sdk_contract.py`.

- [x] Add a failing contract test that imports `CodexClient` and `CodexConfig`, checks that `CodexClient` accepts an explicit `approval_handler`, and records that the installed CLI is the bundled 0.147.0 build. The test must invoke no model call or live login.
- [x] Run `aqven-py/.venv/bin/pytest aqven-py/packages/aqven/tests/chat/test_codex_sdk_contract.py -q`; import fails before the dependency is added.
- [ ] Add exactly `"openai-codex==0.147.0"` to the `aqven` distribution dependencies, run `cd aqven-py && uvx --from uv==0.12.15 uv lock && uvx --from uv==0.12.15 uv sync --all-packages`, then inspect `uv.lock` for `openai-codex-cli-bin==0.147.0` and the existing version axis. Version 0.154.0 was rejected because its `packaging>=26.2` requirement conflicts with the workspace's `xai-sdk` constraint `packaging<26`.
- [ ] Re-run the contract test; expect PASS. Confirm the runtime accepts `thread/start`, `thread/resume`, `turn/start`, `turn/interrupt`, `account/read`, per-turn notifications and the explicit approval callback without sending a model request.

### Task 2: Typed backend preference and mixed-session routing

**Files:** Modify `aqven-py/packages/aqven/src/aqven/ports/chat.py`, `aqven-py/packages/aqven/src/aqven/server/chat/router.py`, `aqven-py/packages/aqven/src/aqven/server/chat/extension.py`, `aqven-py/packages/aqven/src/aqven/app/composition.py`; create `aqven-py/packages/aqven/src/aqven/chat/backend_selection.py`, `backend_registry.py`, `aqven-py/packages/aqven/tests/chat/test_backend_selection.py`; update `test_chat_router.py`.

- [ ] Write failing tests for absent `chat.backend` → `claude`, valid persisted `"codex"`, rejected invalid persisted values, and `PUT /api/chat/backend` rejecting values other than `claude` or `codex`. Add mixed-session tests in which Claude and Codex sessions are listed together; changing the preference affects only `POST /sessions`; message, SSE, approval, interrupt and close dispatch by `session.backend`.
- [ ] Run `cd aqven-py && uv run --frozen pytest packages/aqven/tests/chat/test_backend_selection.py packages/aqven/tests/chat/test_chat_router.py -q`; expect failures for missing models/routes/registry.
- [ ] Extend `AgentBackendKind` to `Literal["claude", "codex"]`. Implement `BackendSelection` over `SettingsStore` with key `setting_key("chat.backend")`, scope `"project"`, default `"claude"`, strict Pydantic validation on read and typed `GET/PUT /api/chat/backend`. Store JSON strings, not a second database or environment variable.
- [ ] Implement `BackendRegistry` with an immutable `{kind: AgentBackend}` map, `selected()` for new sessions/status, and `for_session(session)` for every existing-session operation. Invalid or unavailable selections must fail explicitly; never route to Claude by fallback. Keep `GET /sessions` project-wide and the existing optional `flow_id` filter.
- [ ] Wire the registry and settings store from `ApplicationLaunch` through chat extension/composition. Preserve the current Claude journal; create the Codex adapter against that same journal in Task 6. During this task, use a fake Codex backend in tests and keep production Claude-only composition functional until the Codex adapter is wired.
- [ ] Re-run targeted tests and `pyright` for affected Python files; expect PASS. Update exact OpenAPI operation-ID assertions with `chat_backend_get` and `chat_backend_put`.

### Task 3: Codex security and process configuration

**Files:** Create `aqven-py/packages/aqven/src/aqven/chat/codex_policy.py`, `codex_runtime.py`, `aqven-py/packages/aqven/tests/chat/test_codex_policy.py`.

- [ ] Write failing tests inspecting the constructed `CodexConfig`: pinned bundled binary, `cwd=project_root`, blanked inherited secret environment values, MCP bearer token only in a dedicated environment variable, `shell_environment_policy.inherit="none"`, required AQVEN HTTP MCP server, an explicit approval handler, and no token in argv, stored events or thrown diagnostics. Add permission-mode assertions: `plan` read-only; `default` and `accept_edits` workspace-scoped; `.env`, `.env.*`, `*.env`, `.aqven/server.json` and project token-bearing paths denied for read, including shell commands.
- [ ] Run `cd aqven-py && uv run --frozen pytest packages/aqven/tests/chat/test_codex_policy.py -q`; expect missing-module failures.
- [ ] Build config overrides from `json.dumps`-quoted TOML scalars, never string interpolation of a token into argv. Use `mcp_servers.aqven.url`, `mcp_servers.aqven.required=true`, `mcp_servers.aqven.bearer_token_env_var`; set the variable in the app-server process only and exclude it from agent shell inheritance. Use a named permissions profile extending `:workspace` with scoped deny rules; map `plan` to read-only and other modes to a workspace profile plus explicit approval policy.
- [ ] Fail closed if the pinned runtime rejects the security profile, mandatory MCP server, or approval policy. Do not weaken the profile at runtime. Scrub SDK errors and stderr before converting them to `chat_error`.
- [ ] Re-run policy tests; also start and stop the pinned app-server in a temporary project without a model call and assert configuration acceptance. If the pinned runtime cannot enforce all mandatory denials, stop before wiring production Codex turns and report the exact incompatibility; do not silently use unsafe defaults.

### Task 4: Normalize app-server notifications

**Files:** Create `aqven-py/packages/aqven/src/aqven/chat/codex_normalizer.py`, `aqven-py/packages/aqven/tests/chat/test_codex_normalizer.py`.

- [ ] Write failing fixture-driven tests using typed SDK notifications for agent text delta, reasoning delta, command output, file-change output, item start/completion, token usage and turn completion. Assert emitted `ChatEvent` order, stable message/tool IDs, clipped previews, backend `codex`, and no empty delta. Verify unknown notifications do not masquerade as successful completion.
- [ ] Run `cd aqven-py && uv run --frozen pytest packages/aqven/tests/chat/test_codex_normalizer.py -q`; expect import failure.
- [ ] Implement a pure `CodexNormalizer` that accepts one typed notification and returns zero or more existing event builders from `aqven.chat.builders`. Use `ChatEmitter` to persist them; map command and file-change items to tool lifecycle plus `chat_command`/`chat_file_edit`, and map usage into `ChatUsage` with unknown cost as `None`.
- [ ] Re-run the normalizer tests and `ruff check`; expect PASS. Keep process I/O and approval handling out of this module.

### Task 5: Approval bridge and turn lifecycle

**Files:** Create `aqven-py/packages/aqven/src/aqven/chat/codex_runner.py`, `aqven-py/packages/aqven/tests/chat/test_codex_backend.py`; modify `aqven-py/packages/aqven/src/aqven/chat/approvals.py` only if its current interface cannot safely bridge the SDK reader thread.

- [ ] Write failing tests with a fake synchronous `CodexClient`: SDK reader-thread command/file requests produce `chat_approval_requested`; Studio `allow` returns SDK `{"decision":"accept"}`; Studio `deny`, timeout, interrupt and session close return SDK `{"decision":"decline"}` or the runtime's documented deny response. Unknown request methods always deny. Assert approval events resolve exactly once and the reader thread cannot deadlock the event loop.
- [ ] Write failing lifecycle tests for first-turn `thread/start`, persisted `backend_session_id`, later `thread/resume`, `turn/start` notification streaming, `turn/interrupt`, process failure, cancellation, duplicate `client_op_id`, and stop/error events.
- [ ] Run `cd aqven-py && uv run --frozen pytest packages/aqven/tests/chat/test_codex_backend.py -q`; expect missing-module failures.
- [ ] Implement an explicit SDK approval handler that uses `asyncio.run_coroutine_threadsafe` to open/await `ApprovalRegistry` on the server event loop; bound the wait by the existing timeout. Keep an active `thread_id`/`turn_id` per session, offload blocking SDK methods via `asyncio.to_thread`, and always unregister turn notifications and resolve pending approvals in `finally`.
- [ ] Use `ChatEmitter` for started/status/normalized/error/finished events. Persist the operation before starting the model call; duplicate `client_op_id` returns the original turn. Classify auth, rate-limit, billing, unavailable and invalid-request failures without exposing raw credential-bearing stderr.
- [ ] Re-run lifecycle and approval tests; expect PASS and no dangling tasks/threads.

### Task 6: Codex backend and real app-server smoke test

**Files:** Create `aqven-py/packages/aqven/src/aqven/chat/codex_backend.py`, `aqven-py/packages/aqven/tests/chat/test_codex_sdk_contract.py`; modify `aqven-py/packages/aqven/src/aqven/server/chat/extension.py`.

- [ ] Write failing tests for `CodexAgentBackend.login_status()` using `account/read` for both authenticated and logged-out responses; assert no credential is copied into the journal. Test start/reopen/close and session ownership with the shared `SqliteChatJournal`.
- [ ] Run `cd aqven-py && uv run --frozen pytest packages/aqven/tests/chat/test_codex_backend.py packages/aqven/tests/chat/test_codex_integration.py -q`; expect missing backend failures.
- [ ] Implement `CodexAgentBackend` as the `AgentBackend` port, use one managed client factory per session or a safe shared client with independent turn subscriptions, and compose it with Claude in `BackendRegistry`. Both adapters must share the same journal, signals and project root; shutdown closes Codex processes before closing SQLite.
- [ ] Add an opt-in integration test that launches the pinned CLI in a temporary project, verifies `account/read`, a new thread, resume and the mandatory AQVEN MCP configuration without a model request. Only run a live model turn when a dedicated test-login flag is set; never consume the user's account during ordinary tests.
- [ ] Re-run all `tests/chat`, pyright and ruff; expect PASS.

### Task 7: Studio agent selection

**Files:** Modify `apps/studio/src/data/live/sources.ts`, `apps/studio/src/domain/live.ts`, `apps/studio/src/features/setup/settings-screen.tsx`, `chat-status.tsx`, `apps/studio/src/features/setup/setup-screens.test.tsx`, `apps/studio/src/mocks/handlers.ts`, English/Russian setup messages.

- [ ] Write failing settings tests that render Claude as the default selection, switch to Codex via `PUT /api/chat/backend`, show Codex login state and login hint, and survive route reload. Assert an unavailable Codex selection is retained and is not replaced with Claude.
- [ ] Run `cd apps/studio && pnpm vitest run src/features/setup/setup-screens.test.tsx`; expect selector/route failure.
- [ ] Add typed `chat.backend()` and `chat.selectBackend(kind)` data-source methods from generated OpenAPI operations. Render a two-option accessible selector in Settings → Agents and refresh status after save; use the same component in settings page and dialog. Add `Codex` localization and `codex login` guidance.
- [ ] Re-run setup tests and TypeScript check; expect PASS.

### Task 8: Shared project thread list

**Files:** Create `apps/studio/src/features/chat/chat-thread-list.tsx`; modify `apps/studio/src/features/chat/chat-panel.tsx`, `chat-panel.test.tsx`, `apps/studio/src/mocks/data/chat.ts`, English/Russian chat messages.

- [ ] Write failing tests with mixed Claude/Codex sessions in one `GET /api/chat/sessions` response. Assert both appear with backend and flow labels, selecting either opens its own transcript, `New thread` creates a new session for the current flow and selected agent, and switching Settings agent never changes existing thread backend. Assert existing sessions remain browsable while the selected agent is logged out.
- [ ] Run `cd apps/studio && pnpm vitest run src/features/chat/chat-panel.test.tsx`; expect list/button failures.
- [ ] Replace the module-global `opening` promise with component-local loading state. Fetch project sessions before checking selected-backend login; select a persisted valid active session ID or newest session, otherwise create one only when login permits. Put `New thread` and all project sessions in a compact list; save active ID in session storage and validate it against the current project list before reuse.
- [ ] Key `<ChatSession>` by `session.session_id` so subscriptions and composer state reset when switching. Display backend badge, flow scope and creation time; keep the existing project/flow context and never copy transcript events between sessions. Make list and new-thread button keyboard accessible.
- [ ] Re-run chat tests, all Studio tests, typecheck and lint; expect PASS.

### Task 9: Contract, documentation and end-to-end verification

**Files:** Verify `apps/studio/src/api/openapi.json`, `schema.d.ts`; update `docs/adr/0034-codex-and-project-chat-threads.md`, `docs/DECISIONS.md`, `docs/23-studio-api.md`, `docs/98-version-audit.md` and relevant install/user guides.

- [ ] Start the local AQVEN API for the current project, run `cd apps/studio && pnpm gen:api`, inspect the generated diff, then run `pnpm check:api`. Do not hand-edit generated schema files.
- [ ] Write ADR-0034 recording the chosen SDK, default-Claude migration, registry routing, thread semantics and security policy; mark the Claude-only parts of ADR-0030 and DECISIONS as superseded. Document the new REST preference endpoints, mixed-session behavior, Codex login and pinned package evidence.
- [ ] Run `cd aqven-py && uv run --frozen pytest packages/aqven/tests/chat -q`, `cd aqven-py && uv run --frozen pyright`, `cd aqven-py && uv run --frozen ruff check .`, `cd apps/studio && pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm check:api`, and `aqven-py/.venv/bin/aqven check aqven-py/examples/lumen`. Record exact pass/fail output; repair failures before calling the feature complete.
- [ ] Manually exercise Settings → Codex → New thread → streamed turn → approval allow/deny → interrupt → restart → resume → switch back to an old Claude thread, plus a temp-project secret-read denial. If authentication is unavailable, report the live-model portion unverified rather than claiming parity.
- [ ] Review `git diff` and `git diff --cached` for accidental user-change inclusion. Commit only feature-owned paths after the required `aqven check`, or leave changes uncommitted if the overlapping dirty files cannot be isolated safely.

## Plan self-review

- **Spec coverage:** Tasks 2, 7 cover selection/default/status; Tasks 2, 6, 8 cover mixed project threads and persisted backend ownership; Tasks 3–6 cover app-server, MCP, security, events, approvals, resume and failures; Tasks 1 and 9 cover pinning, OpenAPI and documentation.
- **Type consistency:** `AgentBackendKind` is shared across settings, registry, journal and generated TypeScript; `ChatSession.backend` remains the routing key; `backend_session_id` stores the Codex thread ID, not the AQVEN session ID.
- **Stop condition:** Task 3 must prove the bundled runtime can enforce secret denial. No amount of passing UI tests substitutes for that security gate.
