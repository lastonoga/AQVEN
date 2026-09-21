---
title: How to check and test a project as an agent
description: Call aqven_check, pyright_check, and pytest_run over MCP to validate a project and its code, and read a failure correctly.
---

# How to check and test a project as an agent

## When you need this

Call these after every edit — the same three checks a human would run by hand
(`{{CLI_COMMAND}} check`, pyright, pytest), but as tool calls your agent can read the result of directly.
[How to connect AQVEN as an MCP server](/mcp-cli/connect-an-agent/) gets you connected; these are the
first two tools worth calling once you are.

## Steps

- `aqven_check` runs the same compiler as `{{CLI_COMMAND}} check`: it regenerates the project's typed
  models, validates file shape, type references, and value bindings between nodes, then simulates every
  flow end to end with a stand-in model — no network, no tokens spent. Input: `paths` (optional path
  prefixes), `include_warnings`, `static` (skip the simulated run), `limit`, `timeout_seconds`. Output:
  `ok`, `errors`, `warnings`, a `diagnostics` list (`code`, `severity`, `file`, `path`, `line`, `column`,
  `message`, `hint`), `omitted`, `duration_ms`.
- `paths` filters which diagnostics come back, not what gets checked. The static pass and the flow
  simulation still run over the whole project either way — scoping `paths` to one folder just hides
  diagnostics outside it from the result.
- **A failing check is not a tool error.** The MCP call itself succeeds — the response's `is_error` stays
  `false` — whether the project comes back clean or not. You find out by reading `ok` in the result, the
  same way `{{CLI_COMMAND}} check --format json` exits `0` for a clean or warnings-only project and `1`
  only when there's an error. Code that only reacts to a thrown tool error will silently miss every real
  failure `aqven_check` reports.
- `pyright_check` runs pyright with the project's own interpreter. **It has no REST route — call it only
  over MCP.** Input: `paths`, `limit`, `timeout_seconds`. Output: `ok`, pyright's own `version`,
  `files_analyzed`, `errors`/`warnings`/`informations` counts, and a `diagnostics` list with 1-based
  `line`, `column`, `end_line`, `end_column`.
- `pytest_run` runs pytest in the project folder. **It also has no REST route.** `keyword` is pytest's
  `-k`, `max_failures` is `--maxfail`. Output: `outcome` (`passed`, `failed`, `no_tests`, and so on),
  `total`/`passed`/`failed`/`errors`/`skipped` counts, a `failures` list (`test`, `kind`, `message`,
  `details`, read from the JUnit report pytest writes), and `output_tail` — the tail of the raw pytest
  output. Like `aqven_check`, a failed test run is a normal result, not a tool error.

### Example

Create the showcase project if you don't already have one, and connect an agent to it as in
[How to connect AQVEN as an MCP server](/mcp-cli/connect-an-agent/):

```bash
{{CLI_COMMAND}} new my_project --template showcase
cd my_project/my_project
```

Calling `aqven_check` against the unmodified project — this is real output, captured with `static: true`
to keep it short:

```json
{
  "ok": true,
  "timed_out": false,
  "project_root": "/Users/you/my_project/my_project",
  "errors": 0,
  "warnings": 0,
  "diagnostics": [],
  "omitted": 0,
  "duration_ms": 2435,
  "failure": null
}
```

Now typo one field's type — in `types/records/issue.yaml`, `Issue.severity` goes from `IssueSeverity` to
`IssueSeverityLevel`, a type that doesn't exist in the project. Calling `aqven_check` again, scoped with
`paths: ["types/records"]`:

```json
{
  "ok": false,
  "timed_out": false,
  "project_root": "/Users/you/my_project/my_project",
  "errors": 1,
  "warnings": 0,
  "diagnostics": [
    {
      "code": "E_TYPE_UNKNOWN",
      "severity": "error",
      "file": "types/records/issue.yaml",
      "path": ["fields", 3, "type"],
      "message": "type IssueSeverityLevel is neither built in nor declared in the project",
      "rule": null,
      "line": 20,
      "column": 3,
      "hint": null
    }
  ],
  "omitted": 0,
  "duration_ms": 2527,
  "failure": null
}
```

Both calls came back with `is_error: false` at the MCP envelope level. The only thing that changed
between a clean project and a broken one is `ok` and `diagnostics` inside the result — nothing at the
protocol level marks this call as having failed.

`pyright_check` on the same project's own code, scoped to one file that's actually there:

```json
{
  "ok": true,
  "exit_code": 0,
  "timed_out": false,
  "version": "1.1.414",
  "files_analyzed": 1,
  "errors": 0,
  "warnings": 0,
  "informations": 0,
  "diagnostics": [],
  "omitted": 0,
  "duration_ms": 738,
  "failure": null
}
```

Add a throwaway `code/_demo.py` with one bad assignment — `value: int = "not an int"` — and call it
again:

```json
{
  "ok": false,
  "exit_code": 1,
  "timed_out": false,
  "version": "1.1.414",
  "files_analyzed": 1,
  "errors": 1,
  "warnings": 0,
  "informations": 0,
  "diagnostics": [
    {
      "file": "my_project/code/_demo.py",
      "severity": "error",
      "rule": "reportAssignmentType",
      "message": "Type \"Literal['not an int']\" is not assignable to declared type \"int\"\n  \"Literal['not an int']\" is not assignable to \"int\"",
      "line": 1,
      "column": 14,
      "end_line": 1,
      "end_column": 26
    }
  ],
  "omitted": 0,
  "duration_ms": 297,
  "failure": null
}
```

`pytest_run` needs something to run, so add `tests/test_demo.py`:

```python
def test_addition():
    assert 2 + 2 == 4
```

```json
{
  "outcome": "passed",
  "exit_code": 0,
  "total": 1,
  "passed": 1,
  "failed": 0,
  "errors": 0,
  "skipped": 0,
  "failures": [],
  "omitted": 0,
  "duration_ms": 2230,
  "output_tail": ".                                                                        [100%]\n1 passed, 36 deselected in 0.09s\n"
}
```

That's `pytest_run` called with `keyword: "test_addition"` — pytest collected the rest of the project's
own tests too and deselected them, the same as `-k test_addition` would on the command line. Break the
assertion — `4` becomes `5` — and run it again:

```json
{
  "outcome": "failed",
  "exit_code": 1,
  "total": 1,
  "passed": 0,
  "failed": 1,
  "errors": 0,
  "skipped": 0,
  "failures": [
    {
      "test": "tests.test_demo::test_addition",
      "kind": "failure",
      "message": "assert (2 + 2) == 5",
      "details": "def test_addition():\n>       assert 2 + 2 == 5\nE       assert (2 + 2) == 5\n\ntests/test_demo.py:2: AssertionError"
    }
  ],
  "omitted": 0,
  "duration_ms": 2298,
  "output_tail": "F                                                                        [100%]\n=================================== FAILURES ===================================\n________________________________ test_addition _________________________________\n\n    def test_addition():\n>       assert 2 + 2 == 5\nE       assert (2 + 2) == 5\n\ntests/test_demo.py:2: AssertionError\n=========================== short test summary info ============================\nFAILED tests/test_demo.py::test_addition - assert (2 + 2) == 5\n1 failed, 36 deselected in 0.16s\n"
}
```

Remove the throwaway file and the type typo when you're done — none of this belongs in a project you'd
actually commit.

## See also

- [How to check a project before committing](/engine/check/) — the same check, run as
  `{{CLI_COMMAND}} check` from a terminal instead of called as a tool.
- [How to see what's in a project and how it connects](/engine/inspect-project/) — `tree` and `refs`, for
  when you need to know what's in a project rather than whether it's correct.
- [Diagnostics and error codes](/reference/diagnostics/) — every code `aqven_check` can report, including
  `E_TYPE_UNKNOWN` above.
- [How to connect AQVEN as an MCP server](/mcp-cli/connect-an-agent/) — getting an agent connected in the
  first place.
