---
title: How to set a secret for a provider, tool, or MCP server
description: Copy .env.example to .env, and set the same ref:env/NAME value wherever a provider, a tool, or an MCP server declares it.
---

## When you need this

You've just declared a provider, a tool, or an MCP server, and it names a secret it needs — a model API
key, a bearer token, a header value. This is the first-time setup: where that value actually goes, using
the same `ref:env/NAME` format no matter which of the three declared it. Once it's set, [How to manage
secrets](/engine/secrets/) is where you confirm it, see every secret the project expects, and tell an
`environment` source from a `dotenv` one.

## Steps

- `{{CLI_COMMAND}} new` writes `.env.example` next to the project's `aqven.yaml`, one line per environment
  variable the template ships with, alongside a few non-secret runtime settings like `AQVEN_PORT`. Copy it
  to `.env` in the same folder and fill in real values there — `.env` is already listed in the project's
  `.gitignore`, so it never gets committed.
- Wherever a secret is declared, the value has the same shape: `ref:env/NAME`, naming the environment
  variable that actually holds it. Only the field it sits on changes — a provider's `api_key`, a tool's
  `secrets` entry (its `ref` field), or an MCP server's `headers` entry (its `value` field).
- Set the value in `.env`: one line, `NAME=the-real-value`, no quotes needed. Or export it in the shell
  instead, `export NAME=the-real-value`, if you'd rather not keep it in a file at all — a project reads
  both.
- Or set it from Studio: click the gear in the top bar, then **Add key** on the variable's row under
  **Model keys** or **Other secrets**. Studio writes the line to this `.env` file
  as `NAME='the-real-value'`. The quotes are not part of the value. See [How to use Studio settings](/studio/settings/).
- When both are set, the shell environment wins. `.env` fills in names the shell doesn't have or has set to
  an empty string (an empty value counts as unset), so exporting a non-empty variable before you run anything
  overrides whatever `.env` says for that same name.
- `.env.example` is a snapshot from when the project was created — it doesn't grow automatically as you add
  tools or MCP servers that declare their own secrets later. Add the new variable's name to it yourself, so
  a teammate cloning the project knows it's expected, then set the real value the same way.

### Example

Create the [showcase](/start/quickstart/) project and copy its `.env.example`:

```bash
{{CLI_COMMAND}} new my_project --template showcase
cd my_project/my_project
cp .env.example .env
```

`.env.example` — and now `.env` — carries one secret line, the provider key every one of the showcase's
nine agents needs, next to the runtime settings:

```text
OPENROUTER_API_KEY=
AQVEN_STUDIO=true
AQVEN_HOST=127.0.0.1
AQVEN_PORT=5180
AQVEN_OPEN_BROWSER=false
```

Fill in the key:

```text
OPENROUTER_API_KEY=demo-openrouter-key-value-7890
```

That line is what `aqven.yaml`'s `providers` entry points at — the same `ref:env/NAME` format that a tool
and an MCP server also use, just on a different field. The provider:

```yaml
providers:
- id: "openrouter"
  api_key: "ref:env/OPENROUTER_API_KEY"
```

a tool's own `secrets` entry, from `tools/lookup_order.yaml`:

```yaml
secrets:
- name: "orders_token"
  ref: "ref:env/LUMEN_ORDERS_TOKEN"
```

and an MCP server's header, from `mcp/helpdesk.yaml`:

```yaml
headers:
- name: "Authorization"
  value: "ref:env/LUMEN_HELPDESK_TOKEN"
```

Setting `LUMEN_ORDERS_TOKEN` or `LUMEN_HELPDESK_TOKEN` in `.env` works exactly the way you just set
`OPENROUTER_API_KEY` — one line, `NAME=value`.

To confirm the value you just put in `.env` actually resolves, [`{{CLI_COMMAND}}
secrets`](/engine/secrets/) reports its source as `dotenv`, with the value masked down to its last four
characters:

```text
secret    variable              declared by             source   value
api_key   OPENROUTER_API_KEY   provider openrouter      dotenv   ••••7890
```

Export the same variable in the shell instead, with a different value, and the source flips to
`environment` — the shell wins even though `.env` still holds its own value underneath:

```bash
export OPENROUTER_API_KEY=shell-exported-key-value-4567
```

```text
secret    variable              declared by             source        value
api_key   OPENROUTER_API_KEY   provider openrouter      environment   ••••4567
```

## See also

- [How to manage secrets](/engine/secrets/) — the full report of every secret a project declares, across
  providers, tools, and MCP servers, and how a value gets masked on screen.
- [How to connect a model provider](/integrations/model-providers/) — declaring a provider and pointing an
  agent's `model` at it.
- [How to connect an external MCP server](/integrations/external-mcp-servers/) — declaring a server's
  `headers` and attaching it to an agent.
- [How to give an agent a tool](/engine/tool-node/) — a tool's own `secrets` entry and reading a resolved
  value back with `ctx.secret(...)`.
- [Environment Variables](/reference/environment/) — the default variable name for every built-in model
  provider.
