# Project configuration

Generated field reference from the AQVEN Python package.

## Contents

- [DataPolicy](#datapolicy)
- [OpenRouterRouting](#openrouterrouting)
- [PiiPolicy](#piipolicy)
- [ProjectPolicies](#projectpolicies)
- [ProjectSpec](#projectspec)
- [ProviderCapabilitiesSpec](#providercapabilitiesspec)
- [ProviderLimits](#providerlimits)
- [ProviderSpec](#providerspec)
- [Rename](#rename)
- [ResearchSettings](#researchsettings)
- [TrustPolicy](#trustpolicy)

This reference is generated from the package's Pydantic models. Fields use their YAML aliases. Unknown fields are rejected. Cross-field rules implemented by validators may not appear in JSON Schema; run `aqven check` on a complete project.

## DataPolicy

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `allows_pii` | `boolean` | Yes | `—` | — |
| `allows_sensitive` | `boolean` | Yes | `—` | — |
| `retention` | `'zero' \| 'logged' \| 'unknown'` | Yes | `—` | — |

JSON Schema

## OpenRouterRouting

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `data_collection` | `'allow' \| 'deny'` | Yes | `—` | — |
| `zdr` | `boolean` | Yes | `—` | — |

JSON Schema

## PiiPolicy

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `mask_in_traces` | `boolean` | Yes | `—` | — |
| `redact` | `('email' \| 'phone' \| 'card_number' \| 'iban' \| 'ip_address')[]` | Yes | `—` | — |

JSON Schema

## ProjectPolicies

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `pii` | `PiiPolicy \| null` | No | `None` | — |
| `trust` | `TrustPolicy \| null` | No | `None` | — |

JSON Schema

## ProjectSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `apiVersion` | `'aqven/v1'` | Yes | `—` | — |
| `kind` | `'Project'` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `package` | `string` | Yes | `—` | — |
| `providers` | `ProviderSpec[]` | Yes | `—` | minItems=1 |
| `policies` | `ProjectPolicies \| null` | No | `None` | — |
| `limits` | `Limits \| null` | No | `None` | — |
| `research` | `ResearchSettings \| null` | No | `None` | — |
| `renames` | `Rename[] \| null` | No | `None` | — |

JSON Schema

## ProviderCapabilitiesSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `tools` | `boolean \| null` | No | `None` | — |
| `json_schema_output` | `boolean \| null` | No | `None` | — |

JSON Schema

## ProviderLimits

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `rpm` | `integer \| null` | No | `None` | — |
| `concurrency` | `integer \| null` | No | `None` | — |

JSON Schema

## ProviderSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `ProviderNameField` | Yes | `—` | — |
| `kind` | `'catalog' \| 'code' \| 'openai_compatible'` | No | `'catalog'` | — |
| `api_key` | `string \| null` | No | `None` | — |
| `run` | `string \| null` | No | `None` | — |
| `params` | `map<string, JsonValue> \| null` | No | `None` | — |
| `capabilities` | `ProviderCapabilitiesSpec \| null` | No | `None` | — |
| `base_url` | `string \| null` | No | `None` | — |
| `data_policy` | `DataPolicy` | Yes | `—` | — |
| `routing` | `OpenRouterRouting \| null` | No | `None` | — |
| `limits` | `ProviderLimits \| null` | No | `None` | — |
| `on_rate_limit` | `'auto' \| 'fixed' \| 'fail'` | No | `'auto'` | — |
| `retry_wait_seconds` | `number \| null` | No | `None` | — |
| `retry_attempts` | `integer \| null` | No | `None` | — |

JSON Schema

## Rename

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `kind` | `'flow' \| 'node' \| 'type' \| 'prompt' \| 'dataset' \| 'field' \| 'inference' \| 'agent' \| 'tool' \| 'mcp_server'` | Yes | `—` | — |
| `from` | `string` | Yes | `—` | — |
| `to` | `string` | Yes | `—` | — |
| `at` | `string` | Yes | `—` | — |

JSON Schema

## ResearchSettings

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `spend_cap_usd` | `number \| string` | Yes | `—` | — |

JSON Schema

## TrustPolicy

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `default_in` | `'trusted' \| 'untrusted'` | Yes | `—` | — |

JSON Schema
