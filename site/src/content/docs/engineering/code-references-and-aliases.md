---
title: Code References and Aliases
description: Point nodes, tools, prompts, policies, and evaluators at the right Python or text file.
---

A code reference identifies a Python callable. A text reference identifies a Markdown prompt, instruction file, variant, or display template. AQVEN resolves aliases at defined fields when it loads a project; aliases are not substitutions in every YAML string.

## Choose a Python reference

Suppose `flows/intake/nodes/clean/clean.node.yaml` calls `clean()` in `flows/intake/nodes/clean/clean.py`. Each form below can identify the same callable when the project package is `my_workflow`:

| Write in `run` | Resolution |
| --- | --- |
| `clean` | `clean.py:clean` beside the node file |
| `@root/flows/intake/nodes/clean/clean.py:clean` | Exact Python file inside the project root |
| `@here.clean:clean` | Importable module under the current folder |
| `@flow.nodes.clean.clean:clean` | Importable module under the containing flow |
| `@intake.nodes.clean.clean:clean` | Importable module under the named `intake` flow |
| `@root.flows.intake.nodes.clean.clean:clean` | Importable module from the project root |
| `my_workflow.flows.intake.nodes.clean.clean:clean` | Explicit Python module and function |

The first two forms load a Python file by its project-relative path. The dotted forms import a module, so every package-directory segment must be a valid Python identifier and the module must be importable. Use the exact file form when a directory name cannot be imported as a module. A bare function name uses the `.py` file with the same stem as the YAML entity; it is convenient for a colocated code node, but less clear when calling shared code.

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Normalize the incoming text"
run: "@root.logic:normalize"
in:
  - name: "text"
    type: "Text"
    description: "Text to normalize"
    from: "$input.text"
out:
  - name: "cleaned"
    type: "Text"
    description: "Normalized text"
    maxLength: 2000
```

Here `@root.logic:normalize` resolves to `my_workflow.logic:normalize`. The Python function must accept the declared `text` input and return the declared `cleaned` output. [Nodes](/engineering/nodes/#a-complete-code-node) shows a matching implementation.

## Know where code references work

The same code reference forms work in a code node's `run`, a code-backed tool's `run`, a tool's `wait.poll`, custom control policies in `join`, `stop`, `select`, and `on_item_error`, inference checks, evaluation scorers, and Python prompt or display renderers. A project provider with `kind: code` also uses a Python factory in `run`; use an explicit `module:function` there because provider declarations are outside the loader's alias sites. See [Providers](/engineering/providers/) for that signature.

Built-ins use `use:`, never `run:`. For example, `join: {use: "all"}` calls the built-in join policy, while `join: {run: "@root.policies:my_join"}` calls your function. [Built-in policies and evaluators](/engineering/built-in-functions/) explains the available names and `with` options.

## Reference prompt and instruction files

For text files, `/` means a path and `.` means a Python module only when followed by `:function`. Inside a flow, `@flow/` starts at that flow's folder. `@root/` starts at the project package root. Relative paths are resolved from the file that contains the reference.

```yaml
# In a reply inference under flows/intake/nodes/reply/
prompt: "@flow/prompts/reply.md"
```

An agent's `instructions` can use `@root/prompts/agent.md` or a relative Markdown path. Variant paths and display templates use the same root/flow path logic at their supported fields. `@flow/` is invalid outside a flow. A missing target or unknown alias is reported by `{{CLI_COMMAND}} check .` at the reference that failed.

## Keep aliases distinct from YAML anchors

`@root`, `@flow`, `@here`, and `@<flow_id>` are AQVEN path helpers. YAML anchors such as `&defaults` and `*defaults` are a different feature and are rejected by the project loader. Keep shared behavior in a Python function, shared prompt file, type, or called flow instead of a YAML anchor.
