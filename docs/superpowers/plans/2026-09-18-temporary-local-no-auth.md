# Temporary Local No-Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local CLI Studio/API/MCP server credential-free by default without weakening loopback, Host, or Origin restrictions.

**Architecture:** Keep the existing access-policy Chain of Responsibility. A policy flag skips only the credential and page-token checks; the CLI server sets that flag from `ServerOptions.require_auth`, and the MCP composer uses it to disable its inner bearer guard. Programmatic embedding keeps its existing default.

**Tech Stack:** Python 3.14, Starlette/FastAPI, pytest, httpx2.

---

### Task 1: Access policy and CLI options

**Files:** `aqven-py/packages/aqven/src/aqven/app/access.py`, `aqven-py/packages/aqven/src/aqven/app/options.py`, `aqven-py/packages/aqven/tests/app/test_local_access.py`, `aqven-py/packages/aqven/tests/console/test_cli_commands.py`.

- [ ] Add a test constructing `local_access_policy(PORT, token=TOKEN, require_token=False)`, proving anonymous `/api/runs` succeeds while foreign Host and Origin still fail and a page URL with `access_token` is not redirected.
- [ ] Add a parser test proving the default `ServerOptions.require_auth` is `False` and `--require-auth` sets it to `True`.
- [ ] Run the new tests with `aqven-py/.venv/bin/pytest` and confirm the expected missing-flag failures.
- [ ] Add `require_token: bool = True` to `AccessPolicy`, pass it through `local_access_policy`, return `Admitted(issue_cookie=False)` from `check_credentials` when false, and skip `check_page_token` when false.
- [ ] Add `require_auth: bool = False` to CLI `ServerOptions`, `--require-auth` to `add_server_arguments`, and propagate the parsed option through `server_options` and `server_arguments`.
- [ ] Re-run the new tests and existing access/CLI tests.

### Task 2: Local server, MCP, and browser URL

**Files:** `aqven-py/packages/aqven/src/aqven/app/runtime.py`, `aqven-py/packages/aqven/src/aqven/app/composition.py`, `aqven-py/packages/aqven/tests/app/test_local_runtime.py`, `aqven-py/packages/aqven/tests/app/test_local_composition.py`, `aqven-py/packages/aqven/tests/console/test_dev_command.py`.

- [ ] Add tests proving a default CLI server accepts anonymous API and health requests, preserves Host/Origin rejections, and opens a token-free browser URL.
- [ ] Add a real Studio/MCP integration test using a valid MCP initialize request without Authorization; keep an explicit `require_auth=True` test for the previous 401 behavior.
- [ ] Run the new tests and confirm they fail because the current runtime still requires a token.
- [ ] Pass `options.require_auth` to `local_access_policy`; have MCP construct its Bearer policy only when `launch.access.require_token` and `features.bearer` are true; choose token-free browser URL when auth is off.
- [ ] Re-run targeted tests and preserve the programmatic `create_local_app` security tests.

### Task 3: Decision record and live verification

**Files:** `docs/adr/0030-local-browser-backend.md`, `docs/DECISIONS.md`, `docs/superpowers/specs/2026-09-18-temporary-local-no-auth-design.md`.

- [ ] Record the owner-approved temporary exception to token-on-launch in the ADR and DECISIONS, while retaining Host/Origin and loopback requirements.
- [ ] Run focused pytest, Ruff and Pyright checks on changed Python files; run `aqven check` on the Lumen example.
- [ ] Stop only the Python process bound to port 5200, relaunch it with the same project, static directory and data directory, and verify `/en/project`, `/api/ready`, `/api/project`, and a valid anonymous `/mcp/` request.
- [ ] Report the new process and test results, including any remaining Vite or performance issue outside this auth change.

## Execution result

Implemented in the current checkout because the live port-5200 process uses this checkout and the working tree contains unrelated in-progress changes. The local-server suite passed: 74 tests. Ruff and Pyright checks passed on the changed Python files. The restarted server answered anonymous `/api/project` and valid `/mcp/` initialize requests with HTTP 200; foreign `Host` and `Origin` requests returned HTTP 400 and 403. `aqven check examples/lumen` reported 13 errors in inference/eval definitions, outside the files changed for authentication.
