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

This technique doesn't need the showcase project — a minimal one with an offline test is enough. Create
one and connect an agent to it as in [How to connect AQVEN as an MCP server](/mcp-cli/connect-an-agent/):

```bash
{{CLI_COMMAND}} new my_project --with-tests
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
  "duration_ms": 1934,
  "failure": null
}
```

Now typo one field's type — in `types/records/answer.yaml`, `Answer.tone` goes from `Tone` to `Tones`, a
type that doesn't exist in the project. Calling `aqven_check` again, scoped with
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
      "file": "types/records/answer.yaml",
      "path": ["fields", 1, "type"],
      "message": "type Tones is neither built in nor declared in the project",
      "rule": null,
      "line": 11,
      "column": 3,
      "hint": null
    }
  ],
  "omitted": 0,
  "duration_ms": 1827,
  "failure": null
}
```

Both calls came back with `is_error: false` at the MCP envelope level. The only thing that changed
between a clean project and a broken one is `ok` and `diagnostics` inside the result — nothing at the
protocol level marks this call as having failed.

Calling `pyright_check` with `paths: ["my_project/flows/answer_question/nodes/prepare/prepare.py"]` — a
real file already in the project, paths here relative to the folder one level above the project root:

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
  "duration_ms": 545,
  "failure": null
}
```

Add a throwaway `my_project/_demo.py` with one bad assignment — `value: int = "not an int"` — and call
`pyright_check` again with `paths: ["my_project/_demo.py"]`:

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
      "file": "my_project/_demo.py",
      "severity": "error",
      "rule": "reportAssignmentType",
      "message": "Type \"Literal['not an int']\" is not assignable to declared type \"int\"\n  \"Literal['not an int']\" is not assignable to \"int\"",
      "line": 1,
      "column": 14,
      "end_line": 1,
      "end_column": 26
    }
  ],
  "omitted": 0,
  "duration_ms": 283,
  "failure": null
}
```

`--with-tests` already generated one offline test, so `pytest_run` has something to call right away —
`keyword: "test_answer_question_runs_offline"`:

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
  "duration_ms": 2954,
  "output_tail": ".                                                                        [100%]\n1 passed in 0.49s\n"
}
```

Break the test — change the expected `tone` in its final assertion from `"friendly"` to `"formal"` — and
run it again:

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
      "test": "tests.test_answer_question::test_answer_question_runs_offline",
      "kind": "failure",
      "message": "AssertionError: assert Answer(reply=...ne='friendly') == Answer(reply=...tone='formal')\n  \n  Use -v to get more diff",
      "details": "    def test_answer_question_runs_offline(aqven_project: Project, aqven_engine: EngineSession) -> None:\n        ...\n        assert result.status == \"completed\", result.error\n>       assert result.output == Answer(reply=REPLY, tone=\"formal\")\nE       AssertionError: assert Answer(reply=...ne='friendly') == Answer(reply=...tone='formal')\n\ntests/test_answer_question.py:37: AssertionError"
    }
  ],
  "omitted": 0,
  "duration_ms": 2080,
  "output_tail": "F                                                                        [100%]\n=================================== FAILURES ===================================\n______________________ test_answer_question_runs_offline _______________________\n\n>       assert result.output == Answer(reply=REPLY, tone=\"formal\")\nE       AssertionError: assert Answer(reply=...ne='friendly') == Answer(reply=...tone='formal')\n\ntests/test_answer_question.py:37: AssertionError\n=========================== short test summary info ============================\nFAILED tests/test_answer_question.py::test_answer_question_runs_offline - Ass...\n1 failed in 0.25s\n"
}
```

Remove the throwaway file and the type typo when you're done — none of this belongs in a project you'd
actually commit.

## Under the hood

`pyright_check` and `pytest_run` call the exact same pyright and pytest installed in the project's own
environment — the ones a terminal command would call. AQVEN just reshapes their output into one
consistent result: pyright's `--outputjson` becomes 1-based `line`/`column` diagnostics, and pytest's
JUnit XML report becomes the `failures` list above, so an agent reads one predictable shape instead of
two different tool output formats.

## See also

- [How to check a project before committing](/engine/check/) — the same check, run as
  `{{CLI_COMMAND}} check` from a terminal instead of called as a tool.
- [How to see what's in a project and how it connects](/engine/inspect-project/) — `tree` and `refs`, for
  when you need to know what's in a project rather than whether it's correct.
- [Diagnostics and error codes](/reference/diagnostics/) — every code `aqven_check` can report, including
  `E_TYPE_UNKNOWN` above.
- [How to connect AQVEN as an MCP server](/mcp-cli/connect-an-agent/) — getting an agent connected in the
  first place.
