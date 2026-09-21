---
title: How to check a project before committing
description: What check actually validates in a project — file shape, type references, bindings, prompts, and a simulated run of every flow — and how to read a real error.
---

# How to check a project before committing

## When you need this

Run `{{CLI_COMMAND}} check` after any edit to a flow, node, prompt, or type, and always before you
commit. [Quickstart](/start/quickstart/) already shows the basic command on a clean project; this page
is the deeper reference: what each pass actually validates, what a real failure looks like, the flags
that change what runs, and a gotcha in how they combine.

## Steps

- `check` runs in two passes. The first is static: it walks every file in the project, regenerates the
  typed Python models the same way `{{CLI_COMMAND}} generate` does, then validates file shape and
  required fields, every type reference and value binding between nodes, that prompts and the
  fragments they include exist, that a `code` node's Python function matches its declared inputs and
  outputs, that secrets are referenced rather than hardcoded, and that the providers, tools, and MCP
  servers an agent points at exist and support what's asked of them.
- The second pass simulates a run of every flow, end to end, with a stand-in model in place of every
  real one — nothing here touches the network or needs an API key. This is what catches problems that
  only show up once data actually flows through the graph, not file by file: a prompt that fails to
  render because a value it needs isn't there yet, a `Dynamic` output whose schema — built from data at
  run time — rejects the value the stand-in model returned, a node that fails outright, or a node that
  never runs in any simulated pass at all.
- Simulation only runs if the static pass comes back clean. A flow whose types don't resolve can't
  tell you anything new by being simulated, so `check` skips straight to reporting the static errors.
- Pass `--static` to skip simulation entirely — useful when you only care about the fast structural
  pass, or you're mid-edit and expect the graph itself to still be wrong.
- Pass `--simulation-only` to print only the diagnostics simulation found, not the static ones. Because
  simulation is skipped whenever static check fails, this flag on a project with a static error prints
  a clean `errors: 0, warnings: 0` — it hides the real error rather than showing it. Use it once you
  already know static passes and you're iterating on flow behavior specifically, not as your everyday
  command.
- Simulation results are cached per flow, keyed to that flow's own definition, the project's Python
  code, and the installed AQVEN version. Run `check` again with nothing changed and it reuses the
  cached result instead of resimulating; change the flow, its code, or upgrade AQVEN, and that flow's
  cache misses. Pass `--no-cache` to force every flow to resimulate regardless.
- Pass `--format json` for a machine-readable report — the same information, structured for CI instead
  of a terminal. The command exits `0` when there are no errors (warnings alone still exit `0`) and `1`
  when there's at least one.

### Example

Create the showcase project if you don't already have one:

```bash
{{CLI_COMMAND}} new my_project --template showcase
cd my_project/my_project
```

A clean project reports no errors and no warnings — this is the real output of running it against an
unmodified showcase project:

```bash
{{CLI_COMMAND}} check .
```

```text
errors: 0, warnings: 0
```

Here's a real failure. In a throwaway copy of the same project, `triage.node.yaml` binds one of its
inputs from `prepare`, the node right before it in the flow:

```yaml
- name: "message"
  from: "$prepare.out.message"
```

Typo the field name — `message` becomes `messages` — and run `check` again:

```text
flows/support_case/nodes/triage/triage.node.yaml:8:3: error E_REF_MISSING in[0].from: reference $prepare.out.messages: the value has no field messages
errors: 1, warnings: 0
```

The line names the exact file, line, and column; the code `E_REF_MISSING` identifies the rule that
failed; the message says exactly what's wrong — `prepare`'s output has no field called `messages`. The
same failure with `--format json` gives you the identical facts as data instead of a line of text,
which is what a CI step or an editor integration would actually parse:

```json
{
  "ok": false,
  "errors": 1,
  "warnings": 0,
  "diagnostics": [
    {
      "code": "E_REF_MISSING",
      "severity": "error",
      "file": "flows/support_case/nodes/triage/triage.node.yaml",
      "path": ["in", 0, "from"],
      "message": "reference $prepare.out.messages: the value has no field messages",
      "rule": null,
      "line": 8,
      "column": 3,
      "hint": null
    }
  ]
}
```

This example lives only in a scratch copy made for this page — the fix is renaming `messages` back to
`message`, and the project you'd actually work in never had the typo.

## See also

- [Quickstart](/start/quickstart/) — creating a project and the first, basic run of `check` against
  it.
- [How to write a step in Python](/engine/code-node/) — why `check` regenerates the project's typed
  models before it validates anything.
- [How to handle a shape you don't know in advance](/engine/dynamic-shape/) — why a `Dynamic` output's
  schema is only built from data at run time, and what simulation exercises it against before a real
  run does.
- [The engineering loop](/concepts/engineering-loop/) — what to do once a run, not just a check, gives
  you an answer you didn't expect.
- [Diagnostics and error codes](/reference/diagnostics/) — every code `check` can report, generated
  from the code.
- [CLI commands](/reference/cli/) — every other command, including the ones `check` runs alongside:
  `generate`, `tree`, `refs`.
