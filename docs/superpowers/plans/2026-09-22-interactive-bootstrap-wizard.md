# Interactive Bootstrap Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `aqven new` asks three questions on a real terminal (provider, PII/sensitive data, budget per run), computes a worker-pool default nobody has to answer, and scaffolds a new placeholder template (`hello`) that runs with zero configured keys instead of today's `minimal`/`showcase`, both of which need a real key to pass `aqven check`.

**Architecture:** A new module, `aqven.console.new_wizard`, owns all interactive I/O (three `input()`-based questions, TTY-gated) and returns a plain `WizardAnswers` dataclass — `console/new.py` stays a thin caller that either uses the wizard's answers or the existing flag-driven defaults, so every existing non-interactive code path (tests, scripts, CI) is untouched. A new template directory, `templates/hello/`, mirrors `minimal/`'s file layout minus everything LLM-shaped (no `agents/`, no `tools/`) with one `code` node. After the file tree is written, `new.py` patches the chosen provider's `data_policy` and the project's `limits.usd_micros` into `aqven.yaml`, and separately persists the computed `runtime.max_parallel` through the engine's own `LocalSettingsStore.set_value`, the same store `configured_workers()` already reads.

**Tech Stack:** Python 3.14, `pydantic` for the request/answers dataclasses (matching the rest of `console/`), stdlib `input()`/`sys.stdin.isatty()` for the wizard (no new dependency — the codebase has zero interactive-prompt libraries today, and three plain questions don't justify adding one), `uv_build` templates (Jinja-free `.tmpl` files with `__package__`/`__project__`/`__aqven_requirement__`/`__uv_sources__` string substitution, the same mechanism every existing template file already uses).

---

## Before you start

Read [docs/adr/0046-interactive-bootstrap-wizard.md](../../adr/0046-interactive-bootstrap-wizard.md) in full — it has the reasoning this plan only summarizes. Two facts from it that shape several tasks below and are easy to get wrong if you don't know them going in:

- `ProjectSpec.providers` requires at least one entry (`Field(min_length=1)` in `packages/aqven/src/aqven/spec/project.py:76`) — even the placeholder `hello` template, which never calls a model, still needs a `providers:` block in its `aqven.yaml`. The wizard's provider question isn't optional polish; the schema requires it.
- There is **no** command or Studio control that persists `runtime.max_parallel` after bootstrap today (verified against the real `COMMANDS` registry in `cli.py` and against Studio's own settings docs). This plan gives the wizard a one-time write via `LocalSettingsStore.set_value` directly — it does not add a general "change a setting later" command. That remains open.

## File Structure

| File | Responsibility |
|---|---|
| `packages/aqven/src/aqven/console/new_wizard.py` (new) | All interactive I/O: TTY gate, the three questions, the `os.cpu_count()` worker default. Returns `WizardAnswers`. No file writes. |
| `packages/aqven/src/aqven/console/new.py` (modify) | Decide whether to run the wizard, then apply its answers: patch `aqven.yaml`, `.env`/`.env.example`, persist `max_parallel`. |
| `packages/aqven/src/aqven/templates/hello/**` (new, 17 files) | The placeholder template: one `code` node, no agents, no tools. |
| `packages/aqven/tests/console/test_new_wizard.py` (new) | Unit tests for `new_wizard.py` — TTY gating, each question's parsing, the computed default — with stdin faked, no real terminal needed. |
| `packages/aqven/tests/console/test_new_project.py` (modify) | Add cases: wizard is skipped when stdin isn't a TTY (already true today, this pins it) and when `--provider` is passed explicitly. |
| `packages/aqven/tests/console/test_hello_template.py` (new) | Mirrors `test_showcase_template.py`'s shape: scaffold the `hello` template, assert `aqven check` and `aqven run` succeed with **no** `.env` values set at all. |

## Task 1: `WizardAnswers` and the TTY gate

**Files:**
- Create: `packages/aqven/src/aqven/console/new_wizard.py`
- Test: `packages/aqven/tests/console/test_new_wizard.py`

- [ ] **Step 1: Write the failing test**

```python
import io
from pathlib import Path

import pytest

from aqven.console.new_wizard import WizardAnswers, should_run_wizard


def test_should_run_wizard_requires_a_real_tty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    assert should_run_wizard(explicit_provider=None) is False


def test_should_run_wizard_skips_when_provider_flag_given(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    assert should_run_wizard(explicit_provider="openrouter") is False


def test_should_run_wizard_fires_on_a_real_tty_with_no_provider_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    assert should_run_wizard(explicit_provider=None) is True
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/aqven && uv run pytest tests/console/test_new_wizard.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'aqven.console.new_wizard'`

- [ ] **Step 3: Write the minimal implementation**

```python
import sys
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class WizardAnswers:
    provider_id: str
    provider_env_var: str
    api_key: str | None
    allows_pii: bool
    budget_usd_micros: int | None
    max_parallel: int


def should_run_wizard(explicit_provider: str | None) -> bool:
    if explicit_provider is not None:
        return False
    return sys.stdin.isatty()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/aqven && uv run pytest tests/console/test_new_wizard.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add packages/aqven/src/aqven/console/new_wizard.py packages/aqven/tests/console/test_new_wizard.py
git commit -m "feat: WizardAnswers shape and the TTY gate for the bootstrap wizard"
```

## Task 2: The provider question

**Files:**
- Modify: `packages/aqven/src/aqven/console/new_wizard.py`
- Test: `packages/aqven/tests/console/test_new_wizard.py`

`aqven_llm.catalog.PROVIDERS` is `Mapping[str, ProviderEntry]` (`packages/aqven-llm/src/aqven_llm/catalog.py:119`); each `ProviderEntry` carries `.key`, the real environment variable name — confirmed against the same source `tools/generate_reference.py` uses for the published provider-catalog page, so the wizard's list and that page can never disagree.

- [ ] **Step 1: Write the failing test**

```python
from aqven.console.new_wizard import PROVIDER_SHORTLIST, ask_provider


def test_provider_shortlist_are_all_real_catalog_entries() -> None:
    from aqven_llm.catalog import PROVIDERS

    for provider_id in PROVIDER_SHORTLIST:
        assert provider_id in PROVIDERS


def test_ask_provider_picks_shortlist_entry_by_number(monkeypatch: pytest.MonkeyPatch) -> None:
    answers = iter(["1", ""])
    monkeypatch.setattr("builtins.input", lambda _prompt="": next(answers))
    provider_id, env_var, api_key = ask_provider()
    assert provider_id == PROVIDER_SHORTLIST[0]
    assert api_key is None


def test_ask_provider_accepts_a_pasted_key(monkeypatch: pytest.MonkeyPatch) -> None:
    answers = iter(["1", "sk-test-123"])
    monkeypatch.setattr("builtins.input", lambda _prompt="": next(answers))
    _, _, api_key = ask_provider()
    assert api_key == "sk-test-123"


def test_ask_provider_other_takes_a_typed_catalog_id(monkeypatch: pytest.MonkeyPatch) -> None:
    answers = iter([str(len(PROVIDER_SHORTLIST) + 1), "cerebras", ""])
    monkeypatch.setattr("builtins.input", lambda _prompt="": next(answers))
    provider_id, env_var, _ = ask_provider()
    assert provider_id == "cerebras"
    assert env_var == "CEREBRAS_API_KEY"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/aqven && uv run pytest tests/console/test_new_wizard.py -v`
Expected: FAIL — `PROVIDER_SHORTLIST`/`ask_provider` don't exist yet

- [ ] **Step 3: Write the minimal implementation**

Add to `new_wizard.py`:

```python
from typing import Final

from aqven_llm.catalog import PROVIDERS

PROVIDER_SHORTLIST: Final[tuple[str, ...]] = (
    "openrouter",
    "anthropic",
    "openai",
    "google",
    "mistral",
    "deepseek",
)


def ask_provider() -> tuple[str, str, str | None]:
    print("Which model provider do you have a key for?")
    for index, provider_id in enumerate(PROVIDER_SHORTLIST, start=1):
        print(f"  {index}. {provider_id}")
    print(f"  {len(PROVIDER_SHORTLIST) + 1}. something else")
    choice = input("> ").strip()
    if choice == str(len(PROVIDER_SHORTLIST) + 1):
        provider_id = input("Provider id from the catalog (e.g. cerebras): ").strip()
    else:
        index = int(choice) - 1
        provider_id = PROVIDER_SHORTLIST[index]
    entry = PROVIDERS[provider_id]
    key = input(f"Paste the {entry.key} value now, or press Enter to add it later: ").strip()
    return provider_id, entry.key, key or None
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/aqven && uv run pytest tests/console/test_new_wizard.py -v`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add packages/aqven/src/aqven/console/new_wizard.py packages/aqven/tests/console/test_new_wizard.py
git commit -m "feat: provider question, sourced from aqven_llm.catalog.PROVIDERS"
```

## Task 3: The PII question and the budget question

**Files:**
- Modify: `packages/aqven/src/aqven/console/new_wizard.py`
- Test: `packages/aqven/tests/console/test_new_wizard.py`

- [ ] **Step 1: Write the failing test**

```python
from aqven.console.new_wizard import ask_budget_usd_micros, ask_pii


def test_ask_pii_yes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("builtins.input", lambda _prompt="": "y")
    assert ask_pii() is True


def test_ask_pii_default_is_no(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("builtins.input", lambda _prompt="": "")
    assert ask_pii() is False


def test_ask_budget_skip_means_no_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("builtins.input", lambda _prompt="": "")
    assert ask_budget_usd_micros() is None


def test_ask_budget_converts_dollars_to_micros(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("builtins.input", lambda _prompt="": "2.50")
    assert ask_budget_usd_micros() == 2_500_000
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/aqven && uv run pytest tests/console/test_new_wizard.py -v`
Expected: FAIL — functions don't exist

- [ ] **Step 3: Write the minimal implementation**

Add to `new_wizard.py`:

```python
def ask_pii() -> bool:
    answer = input(
        "Will this project ever handle personal or sensitive data "
        "(names, emails, health or financial info)? [y/N] "
    ).strip().lower()
    return answer in ("y", "yes")


def ask_budget_usd_micros() -> int | None:
    answer = input("Budget per run, in USD (press Enter for no limit): ").strip()
    if not answer:
        return None
    return round(float(answer) * 1_000_000)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/aqven && uv run pytest tests/console/test_new_wizard.py -v`
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add packages/aqven/src/aqven/console/new_wizard.py packages/aqven/tests/console/test_new_wizard.py
git commit -m "feat: PII and per-run budget questions"
```

## Task 4: The computed worker-pool default and `run_wizard()`

**Files:**
- Modify: `packages/aqven/src/aqven/console/new_wizard.py`
- Test: `packages/aqven/tests/console/test_new_wizard.py`

`MINIMUM_WORKERS` already exists at `packages/aqven/src/aqven/engine/throttle.py:7` — import it rather than redefining `1`.

- [ ] **Step 1: Write the failing test**

```python
from aqven.console.new_wizard import computed_max_parallel, run_wizard


def test_computed_max_parallel_uses_cpu_count(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("os.cpu_count", lambda: 8)
    assert computed_max_parallel() == 8


def test_computed_max_parallel_falls_back_when_cpu_count_is_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("os.cpu_count", lambda: None)
    assert computed_max_parallel() == 4


def test_run_wizard_bundles_every_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    answers = iter(["1", "", "n", ""])
    monkeypatch.setattr("builtins.input", lambda _prompt="": next(answers))
    monkeypatch.setattr("os.cpu_count", lambda: 4)
    result = run_wizard()
    assert result.provider_id == "openrouter"
    assert result.api_key is None
    assert result.allows_pii is False
    assert result.budget_usd_micros is None
    assert result.max_parallel == 4
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/aqven && uv run pytest tests/console/test_new_wizard.py -v`
Expected: FAIL — `computed_max_parallel`/`run_wizard` don't exist

- [ ] **Step 3: Write the minimal implementation**

Add to `new_wizard.py`:

```python
import os

from aqven.engine.throttle import MINIMUM_WORKERS

FALLBACK_WORKERS: Final = 4


def computed_max_parallel() -> int:
    return max(MINIMUM_WORKERS, os.cpu_count() or FALLBACK_WORKERS)


def run_wizard() -> WizardAnswers:
    provider_id, env_var, api_key = ask_provider()
    allows_pii = ask_pii()
    budget = ask_budget_usd_micros()
    return WizardAnswers(
        provider_id=provider_id,
        provider_env_var=env_var,
        api_key=api_key,
        allows_pii=allows_pii,
        budget_usd_micros=budget,
        max_parallel=computed_max_parallel(),
    )
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/aqven && uv run pytest tests/console/test_new_wizard.py -v`
Expected: all passed (10 tests total across Tasks 1-4)

- [ ] **Step 5: Commit**

```bash
git add packages/aqven/src/aqven/console/new_wizard.py packages/aqven/tests/console/test_new_wizard.py
git commit -m "feat: computed max_parallel default and run_wizard() bundling all answers"
```

## Task 5: The `hello` placeholder template's static files

**Files:**
- Create: 13 files under `packages/aqven/src/aqven/templates/hello/` (listed below)

Every file here is a direct adaptation of the equivalent file in `templates/minimal/` — copy that file and edit only where noted, so formatting and the `__package__`/`__project__`/`__aqven_requirement__`/`__uv_sources__` substitution markers stay identical to what `new.py`'s existing rendering already handles.

- [ ] **Step 1: Copy the provider-agnostic files unchanged**

```bash
cd packages/aqven/src/aqven/templates
mkdir -p hello/__package__/flows/hello/nodes/greet hello/__package__/types/records hello/dot-claude/hooks
cp minimal/AGENTS.md.tmpl hello/AGENTS.md.tmpl
cp minimal/CLAUDE.md.tmpl hello/CLAUDE.md.tmpl
cp minimal/dot-claude/hooks/aqven_check.py.tmpl hello/dot-claude/hooks/aqven_check.py.tmpl
cp minimal/dot-claude/settings.json.tmpl hello/dot-claude/settings.json.tmpl
cp minimal/dot-gitignore.tmpl hello/dot-gitignore.tmpl
cp minimal/dot-mcp.json.tmpl hello/dot-mcp.json.tmpl
cp minimal/pyproject.toml.tmpl hello/pyproject.toml.tmpl
cp minimal/__package__/__init__.py.tmpl hello/__package__/__init__.py.tmpl
cp minimal/__package__/__main__.py.tmpl hello/__package__/__main__.py.tmpl
cp minimal/__package__/app.py.tmpl hello/__package__/app.py.tmpl
```

- [ ] **Step 2: Write `hello/__package__/aqven.yaml.tmpl`** — same shape as minimal's, description names the placeholder explicitly

```yaml
apiVersion: "aqven/v1"
kind: "Project"
description: "__package__: a placeholder project generated by aqven new, ready to run with no real workflow yet"
package: "__package__"
providers:
- id: "openrouter"
  api_key: "ref:env/OPENROUTER_API_KEY"
  data_policy:
    allows_pii: false
    allows_sensitive: false
    retention: "unknown"
```

(The wizard, wired in Task 6, overwrites the `providers:` entry and `data_policy` after the file tree is written — this static version is what a non-interactive `--template hello` bootstrap gets, so it must be valid on its own.)

- [ ] **Step 3: Write `hello/__package__/dot-env.example.tmpl`**

```
OPENROUTER_API_KEY=
AQVEN_STUDIO=true
AQVEN_HOST=127.0.0.1
AQVEN_PORT=5180
AQVEN_OPEN_BROWSER=false
```

- [ ] **Step 4: Write the one type the flow needs, `hello/__package__/types/records/greeting.yaml.tmpl`**

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "A name to greet"
fields:
- name: "name"
  type: "Text"
  description: "Name of the person to greet"
  maxLength: 200
```

- [ ] **Step 5: Write `hello/__package__/types/records/greeted.yaml.tmpl`**

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "A greeting for the given name"
fields:
- name: "message"
  type: "Text"
  description: "The greeting text"
  maxLength: 250
```

- [ ] **Step 6: Write `hello/__package__/flows/hello/flow.yaml.tmpl`** — the flow's own `description` is the placeholder label from ADR-0046 §6

```yaml
apiVersion: "aqven/v1"
kind: "Flow"
description: "A placeholder flow, generated so the project runs immediately. Not your real workflow: describe what you actually want in Studio or your coding agent, and it will replace this."
input: "Greeting"
output: "Greeted"
returns:
- name: "message"
  from: "$greet.out.message"
order:
- "greet"
```

- [ ] **Step 7: Write `hello/__package__/flows/hello/nodes/greet/greet.node.yaml.tmpl`**

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Builds a static greeting; this whole flow is a placeholder, not real logic"
run: "greet"
in:
- name: "name"
  type: "Text"
  description: "Name of the person to greet"
  maxLength: 200
  from: "$input.name"
out:
- name: "message"
  type: "Text"
  description: "The greeting text"
  maxLength: 250
```

- [ ] **Step 8: Write `hello/__package__/flows/hello/nodes/greet/greet.py.tmpl`**

```python
from typing import Annotated

from pydantic import StringConstraints

from __package__.types import HelloGreetOut


def greet(name: Annotated[str, StringConstraints(max_length=200)]) -> HelloGreetOut:
    return HelloGreetOut(message=f"Hello, {name}! This is a placeholder flow, not your real workflow.")
```

- [ ] **Step 9: Confirm the file count matches**

Run: `find packages/aqven/src/aqven/templates/hello -type f | wc -l`
Expected: `17` (AGENTS.md, CLAUDE.md, pyproject.toml, dot-gitignore, dot-mcp.json, __init__.py, __main__.py,
app.py, aqven.yaml, .env.example, flow.yaml, greet.node.yaml, greet.py, greeting.yaml, greeted.yaml,
aqven_check.py, settings.json — this plan's earlier "13" was a pre-build estimate, corrected here after
actually creating the files)

- [ ] **Step 10: Commit**

```bash
git add packages/aqven/src/aqven/templates/hello/
git commit -m "feat: hello placeholder template, one code node, no llm node"
```

## Task 6: Register `hello` in the template registry

**Files:**
- Modify: `packages/aqven/src/aqven/console/project_template.py`
- Test: `packages/aqven/tests/console/test_hello_template.py`

`MINIMAL_TEMPLATE`/`SHOWCASE_TEMPLATE` are plain string constants in `project_template.py`, and `TEMPLATES`
is a literal `Mapping[str, ProjectTemplate]` built from them — `ProjectTemplate` is a `Protocol`, and the
concrete implementation, `PackageDataTemplate(name, description)`, just reads the packaged folder matching
`name` under `templates/`. Adding a template is exactly these two edits, nothing else:

```python
MINIMAL_TEMPLATE: Final = "minimal"
SHOWCASE_TEMPLATE: Final = "showcase"
HELLO_TEMPLATE: Final = "hello"
```

```python
TEMPLATES: Final[Mapping[str, ProjectTemplate]] = {
    MINIMAL_TEMPLATE: PackageDataTemplate(
        name=MINIMAL_TEMPLATE,
        description="one flow with a code step, an llm step on OpenRouter, a tool, types and an offline test",
    ),
    SHOWCASE_TEMPLATE: PackageDataTemplate(
        name=SHOWCASE_TEMPLATE,
        description="the lumen example: two flows with every node kind, human waits, tools, evals and main.py",
    ),
    HELLO_TEMPLATE: PackageDataTemplate(
        name=HELLO_TEMPLATE,
        description="one code step, no model calls — runs immediately, a placeholder for your real workflow",
    ),
}
```

- [ ] **Step 1: Write the failing test**

```python
import subprocess
import sys
from pathlib import Path

AQVEN_PACKAGE: Final = Path(__file__).resolve().parents[2]


def test_hello_template_checks_and_runs_with_no_keys_set(tmp_path: Path) -> None:
    target = tmp_path / "hello-project"
    subprocess.run(
        [sys.executable, "-m", "aqven", "new", str(target), "--template", "hello",
         "--aqven-path", str(AQVEN_PACKAGE), "--no-sync"],
        check=True, cwd=tmp_path,
    )
    # --no-sync means no venv; run the check against the source tree directly via the dev environment
    result = subprocess.run(
        ["uv", "run", "--project", str(AQVEN_PACKAGE), "aqven", "check", str(target / "hello_project")],
        check=False, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "errors: 0, warnings: 0" in result.stdout
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/aqven && uv run pytest tests/console/test_hello_template.py -v`
Expected: FAIL — `--template hello` rejected with "unknown template 'hello'"

- [ ] **Step 3: Implement** — add the `HELLO_TEMPLATE` constant and the `TEMPLATES` entry shown above to `project_template.py`

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/aqven && uv run pytest tests/console/test_hello_template.py -v`
Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
git add packages/aqven/src/aqven/console/new.py packages/aqven/tests/console/test_hello_template.py
git commit -m "feat: register the hello template, reachable via --template hello"
```

## Task 7: Wire the wizard into `new.py`

**Files:**
- Modify: `packages/aqven/src/aqven/console/new.py`
- Test: `packages/aqven/tests/console/test_new_project.py`

`new.py`'s real pipeline (verified by reading it in full, not assumed): `ProjectCreator.create()` runs a
tuple of `ProjectStep`s — each a frozen dataclass with `apply(self, draft: ProjectDraft) -> None` — built by
`ProjectCreator.steps()`: `(WriteFiles(), *sync, GenerateModels())`. `ProjectDraft.module_root` is already a
`Path` property (`self.target / self.rendered.module_root`) pointing at the inner project folder. Adding the
wizard's post-write patching is one more step in that same tuple, following `SyncEnvironment`'s existing
pattern of capturing its own data as dataclass fields rather than reading from `draft`.

- [ ] **Step 1: Write the failing test**

Add to `packages/aqven/tests/console/test_new_project.py`, reusing the file's own `run_python` helper and
`AQVEN_PACKAGE` constant — do not invent a different subprocess call:

```python
def test_provider_flag_writes_the_real_key_variable_and_skips_the_wizard(tmp_path_factory: pytest.TempPathFactory) -> None:
    workspace = tmp_path_factory.mktemp("flagged")
    completed = run_python(
        workspace, "-m", "aqven", "new", "flagged-project", "--provider", "anthropic",
        "--aqven-path", str(AQVEN_PACKAGE), "--no-sync",
    )
    assert completed.returncode == 0, completed.stderr
    manifest = (workspace / "flagged-project" / "flagged_project" / "aqven.yaml").read_text()
    assert 'id: anthropic' in manifest
    env_example = (workspace / "flagged-project" / "flagged_project" / ".env.example").read_text()
    assert "ANTHROPIC_API_KEY=" in env_example
    assert "OPENROUTER_API_KEY=" not in env_example
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/aqven && uv run pytest tests/console/test_new_project.py -k provider_flag -v`
Expected: FAIL — `--provider` not a recognized argument (`error: unrecognized arguments: --provider anthropic`)

- [ ] **Step 3: Implement**

In `new.py`, import what's needed and add the CLI flag, the request field, the new step, and the
patch/persist functions:

```python
import asyncio

from ruamel.yaml import YAML

from aqven.app.locations import ProjectState, StudioState, studio_data_dir
from aqven.app.settings_store import open_settings_store
from aqven.app.workers import MAX_PARALLEL_KEY
from aqven.console.new_wizard import WizardAnswers, run_wizard, should_run_wizard
from aqven.console.project_template import HELLO_TEMPLATE
```

Extend `NewProjectRequest` with one new field:

```python
@dataclass(frozen=True, slots=True)
class NewProjectRequest:
    target: Path
    template: str = MINIMAL_TEMPLATE
    package: str | None = None
    aqven_path: Path | None = None
    sync: bool = True
    force: bool = False
    with_tests: bool = False
    wizard: WizardAnswers | None = None
```

Add the patch/persist functions near `check_target`/`project_draft`:

```python
def patch_provider(aqven_yaml: Path, wizard: WizardAnswers) -> None:
    yaml = YAML()
    yaml.preserve_quotes = True
    with aqven_yaml.open(encoding=FILE_ENCODING) as handle:
        data = yaml.load(handle)
    provider = data["providers"][0]
    provider["id"] = wizard.provider_id
    provider["api_key"] = f"ref:env/{wizard.provider_env_var}"
    provider["data_policy"]["allows_pii"] = wizard.allows_pii
    provider["data_policy"]["allows_sensitive"] = wizard.allows_pii
    if wizard.budget_usd_micros is not None:
        data["limits"] = {"usd_micros": wizard.budget_usd_micros}
    with aqven_yaml.open("w", encoding=FILE_ENCODING) as handle:
        yaml.dump(data, handle)


def patch_env(module_root: Path, wizard: WizardAnswers) -> None:
    example = module_root / ENV_EXAMPLE
    text = example.read_text(encoding=FILE_ENCODING).replace(
        "OPENROUTER_API_KEY=", f"{wizard.provider_env_var}="
    )
    example.write_text(text, encoding=FILE_ENCODING)
    if wizard.api_key is not None:
        (module_root / ".env").write_text(
            text.replace(f"{wizard.provider_env_var}=", f"{wizard.provider_env_var}={wizard.api_key}"),
            encoding=FILE_ENCODING,
        )


async def persist_max_parallel(module_root: Path, value: int) -> None:
    store = open_settings_store(ProjectState(module_root), StudioState(studio_data_dir(None)))
    await store.set_value("project", MAX_PARALLEL_KEY, value)


@dataclass(frozen=True, slots=True)
class ApplyWizardAnswers:
    wizard: WizardAnswers

    def apply(self, draft: ProjectDraft) -> None:
        patch_provider(draft.module_root / "aqven.yaml", self.wizard)
        patch_env(draft.module_root, self.wizard)
        asyncio.run(persist_max_parallel(draft.module_root, self.wizard.max_parallel))
```

Wire the new step into `ProjectCreator.steps()`:

```python
    def steps(self, request: NewProjectRequest) -> tuple[ProjectStep, ...]:
        wizard: tuple[ProjectStep, ...] = (ApplyWizardAnswers(request.wizard),) if request.wizard is not None else ()
        sync: tuple[ProjectStep, ...] = (
            (SyncEnvironment(self.runner, self.locate(UV_EXECUTABLE)),) if request.sync else ()
        )
        return (WriteFiles(), *wizard, *sync, GenerateModels())
```

In `NewCommand.configure()`, change `--template`'s default and add `--provider`:

```python
        parser.add_argument(
            "--template",
            default=None,
            choices=sorted(TEMPLATES),
            help="; ".join(f"{name}: {template.description}" for name, template in TEMPLATES.items())
            + "; defaults to hello when the bootstrap wizard runs, minimal otherwise",
        )
```

(this replaces the existing `default=MINIMAL_TEMPLATE` line; every other line in `configure()` stays as-is)
and after `--force`'s `add_argument` call:

```python
        parser.add_argument(
            "--provider", default=None, metavar="NAME",
            help="skip the interactive provider question and use this catalog id",
        )
```

Finally, in `NewCommand.execute()`:

```python
    def execute(self, arguments: argparse.Namespace) -> int:
        explicit_provider = _optional_text(arguments.provider)
        wizard = run_wizard() if should_run_wizard(explicit_provider) else None
        given_template = _optional_text(arguments.template)
        template = given_template or (HELLO_TEMPLATE if wizard is not None else MINIMAL_TEMPLATE)
        request = NewProjectRequest(
            target=Path(str(arguments.target)),
            template=template,
            package=_optional_text(arguments.package),
            aqven_path=_optional_path(arguments.aqven_path),
            sync=not bool(arguments.no_sync),
            force=bool(arguments.force),
            with_tests=bool(arguments.with_tests),
            wizard=wizard,
        )
        return create_project(request)
```

Note what `--provider` alone (no real terminal) does in this design: it only skips the *wizard*, per
`should_run_wizard`. It does not itself ask the PII or budget questions, because those live inside
`run_wizard()`, which isn't called at all when `should_run_wizard` returns `False`. A user who wants a
specific provider *and* to answer the PII/budget questions needs a real TTY without `--provider` and to
type the provider's number when asked. This is a real, deliberate scope boundary — write it down here so
Task 9's review has something concrete to check against, not something to silently decide either way while
coding.

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/aqven && uv run pytest tests/console/test_new_project.py -v`
Expected: all passed, including every pre-existing case in this file (confirms non-interactive behavior is
unchanged — `run_python`'s subprocess never attaches a real TTY to stdin, so `should_run_wizard` is `False`
for every existing case without needing `--provider` at all)

- [ ] **Step 5: Commit**

```bash
git add packages/aqven/src/aqven/console/new.py packages/aqven/tests/console/test_new_project.py
git commit -m "feat: wire the wizard into aqven new, patch aqven.yaml/.env and persist max_parallel"
```

## Task 8: Live verification

Not a code task — run these by hand and confirm the real output before moving on. This is the same discipline used throughout this session: prove it live, don't trust that the tests passing means the end-to-end experience is right.

- [ ] **Step 1: Bootstrap non-interactively with the new flag**

```bash
cd /Users/kirunya/Projects/my/ai-workflows-automate
rm -rf /tmp/wizard-check && uv run --project packages/aqven aqven new /tmp/wizard-check \
  --provider anthropic --aqven-path "$(pwd)/packages/aqven"
cat /tmp/wizard-check/wizard_check/aqven.yaml
```

Expected: `providers[0].id: "anthropic"`, `data_policy.allows_pii: false` (default, since `--provider` bypasses the PII question too — confirm this is the actually-intended behavior when reviewing Task 7's implementation; if it should still ask PII/budget even with `--provider` set, that's a real design gap to fix before this step, not something to paper over here).

- [ ] **Step 2: Confirm the hello template runs with zero keys**

```bash
uv run --project packages/aqven aqven check /tmp/wizard-check/wizard_check
echo '{"name": "Kir"}' > /tmp/greeting.json
uv run --project packages/aqven aqven run hello --root /tmp/wizard-check/wizard_check --input /tmp/greeting.json
```

Expected: `errors: 0, warnings: 0`, then `{"message": "Hello, Kir! This is a placeholder flow, not your real workflow."}` — a real run, no API key needed anywhere.

- [ ] **Step 3: Confirm the computed max_parallel actually persisted**

The database file is `.aqven/aqven.sqlite` (`PROJECT_DATABASE_FILE` in `app/locations.py:12`), table
`setting_values` with columns `key`, `value_json`, `updated_at` (`CREATE_TABLE` in `app/settings_values.py:17-22`):

```bash
python3 -c "
import sqlite3
con = sqlite3.connect('/tmp/wizard-check/wizard_check/.aqven/aqven.sqlite')
print(con.execute(\"select key, value_json from setting_values where key = 'runtime.max_parallel'\").fetchall())
"
```

Expected: one row, `value_json` equal to whatever `os.cpu_count()` returns on this machine (a JSON integer,
e.g. `8`).

- [ ] **Step 4: Run the full test suite once more**

```bash
cd /Users/kirunya/Projects/my/ai-workflows-automate
uv run --project packages/aqven pytest packages/aqven/tests/console/ -q
```

Expected: all green, no regressions in the pre-existing template/new-project tests.

## Task 9: Final review pass

- [ ] Re-read `docs/adr/0046-interactive-bootstrap-wizard.md` against what actually got built. Every one of its six numbered decisions should map to a task above; if one doesn't, that's a gap in this plan, not something to silently skip.
- [ ] Confirm `--provider` bypassing the PII/budget questions (flagged as an open call in Task 8 Step 1) was actually decided one way or the other, not left ambiguous in the shipped code.
- [ ] `ruff check` and `pyright` clean on every new/modified file — the project's pyright-strict rule applies to `console/` same as everywhere else in the engine.
