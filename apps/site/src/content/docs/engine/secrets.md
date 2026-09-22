---
title: How to manage secrets
description: What {{CLI_COMMAND}} secrets reports for every secret a project declares — across providers, tools, and MCP servers — and how it decides whether one is set, without ever printing the value itself.
---

## When you need this

A project accumulates secrets as you add providers, tools, and MCP servers: a model API key, a
bearer token a tool needs to call an external service, a header an MCP server needs to authenticate.
Before you run anything for real, or after cloning a project you didn't set up yourself, you want one
place that lists every secret the project expects, where each one is supposed to come from, and
whether it's actually there — without any of it ending up on your screen. `{{CLI_COMMAND}} secrets`
is that report.

## Steps

- `{{CLI_COMMAND}} secrets <path>` lists every secret the project declares: one row per provider that
  needs an API key, one row per `secrets` entry a tool's YAML declares, one row per `headers` entry an
  MCP server's YAML declares. Two tools that both need the same environment variable — the showcase's
  `lookup_order` and `issue_store_credit` both read `LUMEN_ORDERS_TOKEN` — get their own row each, not
  one merged row, because each is a separate place in the project that has to resolve it.
- Each row names the secret, the environment variable it resolves from, and what declared it — a
  provider by its id, a tool or MCP server by its own id — as `provider openrouter`, `tool search_kb`,
  `mcp_server helpdesk`, and so on.
- The `source` column says where a set secret's value actually came from: `environment` if the process
  environment has it, `dotenv` if it only came from the project's own `.env` file, or `unset` if
  neither has it. When both have a value and they differ, the process environment wins.
- The value column never shows the real secret. A short value collapses to a fixed mask; a value of
  twelve characters or more keeps its last four characters visible after the mask, everything else is
  hidden — enough to tell two configured values apart without ever putting a usable secret on screen.
- `<path>` defaults to `.` and, like [`check`](/engine/check/) and [`tree`](/engine/inspect-project/),
  is searched upward for the project's `aqven.yaml` rather than taken literally — you can run it from
  anywhere inside the project. `--format json` prints the same report as one JSON object instead of a
  table, with an `ok` field and a `missing` list of the environment variables that came back unset, for
  a script to check without parsing the table.
- This command only reports; it never writes a secret anywhere. To set one, either put it in the
  project's `.env` file or export it in the shell before running — the same two places `run` and every
  other command look, and the same wording you'll see in a `provider_key_missing` error.
- It exits `0` whenever the project loads, even if every single secret comes back `unset` — this is a
  report, not a gate, so a missing secret here doesn't fail the command. Check the `missing` list (or
  the `unset` rows) yourself if you need to act on it. It only exits `1` when the project itself
  doesn't load, the same failure every other command reports for a path with no `aqven.yaml` in it or
  any parent folder.

### Example

Create the showcase project if you don't already have one:

```bash
{{CLI_COMMAND}} new my_project --template showcase
cd my_project/my_project
```

With nothing set, this is the real output on a fresh showcase project — one row for the provider key
`support_case` and `judge_panel` need, and one row per secret each of the showcase's tools and its one
MCP server declare:

```bash
{{CLI_COMMAND}} secrets .
```

```text
secret                variable                    declared by               source        value
api_key               OPENROUTER_API_KEY          provider openrouter       unset
orders_token          LUMEN_ORDERS_TOKEN          tool issue_store_credit   unset
orders_token          LUMEN_ORDERS_TOKEN          tool lookup_order         unset
together_api_key      TOGETHER_API_KEY            tool render_clip          unset
kb_token              LUMEN_KB_TOKEN              tool search_kb            unset
openai_api_key        OPENAI_API_KEY              tool synthesize_voice     unset
Authorization         LUMEN_HELPDESK_TOKEN        mcp_server helpdesk       unset
```

That command exits `0` — `echo $?` right after it prints `0`, even though every row reads `unset`.

Exporting `LUMEN_KB_TOKEN` — the secret [how to give an agent a tool](/engine/tool-node/) walks through
`search_kb` declaring — before running the same command changes only that one row, `source` and all:

```bash
export LUMEN_KB_TOKEN=a-demo-lumen-token-value-123456
{{CLI_COMMAND}} secrets .
```

```text
kb_token              LUMEN_KB_TOKEN              tool search_kb            environment   ••••3456
```

`--format json` reports the same fact as one object per row instead of a table. Here are two of the
real seven — the report has one entry per row above, in the same order: the provider's row, still
`unset`, and `search_kb`'s row, now `"source": "environment"` with the same masked tail the table
showed:

```json
{
  "ok": false,
  "missing": [
    "OPENROUTER_API_KEY",
    "LUMEN_ORDERS_TOKEN",
    "LUMEN_ORDERS_TOKEN",
    "TOGETHER_API_KEY",
    "OPENAI_API_KEY",
    "LUMEN_HELPDESK_TOKEN"
  ],
  "secrets": [
    {
      "name": "api_key",
      "env_var": "OPENROUTER_API_KEY",
      "declared_by": "openrouter",
      "scope": "provider",
      "declared_in": "aqven.yaml",
      "setting_key": "providers.openrouter.api_key",
      "source": null,
      "masked": null,
      "set": false
    },
    {
      "name": "kb_token",
      "env_var": "LUMEN_KB_TOKEN",
      "declared_by": "search_kb",
      "scope": "tool",
      "declared_in": "tools/search_kb.yaml",
      "setting_key": "secrets.lumen_kb_token",
      "source": "environment",
      "masked": "••••3456",
      "set": true
    }
  ]
}
```

Putting the same variable in the project's `.env` file instead of the shell reports it as `dotenv`
rather than `environment`, with a different tail of the mask because it's a different demo value —
everything else about the row is identical:

```bash
unset LUMEN_KB_TOKEN
echo 'LUMEN_KB_TOKEN=dotenv-fallback-value' >> .env
{{CLI_COMMAND}} secrets .
```

```text
kb_token              LUMEN_KB_TOKEN              tool search_kb            dotenv        ••••alue
```

Running it from outside any project fails the way every other command does, and this time the exit
code is `1`:

```bash
cd /tmp
{{CLI_COMMAND}} secrets .
```

```text
.: error E_PROJECT_NOT_FOUND: aqven.yaml not found in . or any parent folder
errors: 1, warnings: 0
```

## See also

- [How to give an agent a tool](/engine/tool-node/) — where a tool declares its own `secrets`, `kb_token`
  included, and how its code reads a resolved value back with `ctx.secret(...)`.
- [How to run a flow without a server](/engine/run-locally/) — the `provider_key_missing` error a run
  fails with when a provider's own secret is the one still unset.
- [How to check a project before committing](/engine/check/) — validates the project's shape; it
  doesn't check whether any secret is actually set.
- [Environment Variables](/reference/environment/) — the default variable name for every built-in model
  provider.
- [CLI commands](/reference/cli/) — every other command, including `run` and `check`.
