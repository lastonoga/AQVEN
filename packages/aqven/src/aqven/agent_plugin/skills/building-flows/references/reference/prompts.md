# Rendered prompts

Generated field reference from the AQVEN Python package.

This reference is generated from the package's Pydantic models. Fields use their YAML aliases. Unknown fields are rejected. Cross-field rules implemented by validators may not appear in JSON Schema; run `aqven check` on a complete project.

## PromptMessage

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `role` | `'system' \| 'user' \| 'assistant'` | Yes | `—` | — |
| `text` | `string` | Yes | `—` | minLength=1 |

JSON Schema

## RenderedPrompt

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `messages` | `PromptMessage[]` | Yes | `—` | minItems=1 |

JSON Schema
