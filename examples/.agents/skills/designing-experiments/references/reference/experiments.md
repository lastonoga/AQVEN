# Experiments

Generated field reference from the AQVEN Python package.

## Contents

- [CaseSelection](#caseselection)
- [CheckMetric](#checkmetric)
- [CompareQuestion](#comparequestion)
- [ExperimentCheck](#experimentcheck)
- [ExperimentFactor](#experimentfactor)
- [ExperimentPlan](#experimentplan)
- [ExperimentSpec](#experimentspec)
- [ExperimentSubject](#experimentsubject)
- [Guardrail](#guardrail)
- [LookQuestion](#lookquestion)
- [NoninferiorQuestion](#noninferiorquestion)
- [ThresholdQuestion](#thresholdquestion)
- [VariantSpec](#variantspec)

This reference is generated from the package's Pydantic models. Fields use their YAML aliases. Unknown fields are rejected. Cross-field rules implemented by validators may not appear in JSON Schema; run `aqven check` on a complete project.

## CaseSelection

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `dataset` | `string` | Yes | `—` | — |
| `tags` | `map<string, string> \| null` | No | `None` | — |

JSON Schema

## CheckMetric

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `string` | Yes | `—` | — |
| `kind` | `'binary' \| 'ordinal' \| 'continuous'` | Yes | `—` | — |

JSON Schema

## CompareQuestion

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `kind` | `'compare'` | Yes | `—` | — |
| `baseline` | `string` | Yes | `—` | — |
| `candidate` | `string` | Yes | `—` | — |
| `primary` | `MetricName` | Yes | `—` | — |
| `direction` | `'higher_is_better' \| 'lower_is_better' \| null` | No | `None` | — |
| `margin` | `number` | No | `0.0` | minimum=0 |
| `guardrails` | `Guardrail[] \| null` | No | `None` | — |

JSON Schema

## ExperimentCheck

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `string` | Yes | `—` | — |
| `kind` | `'binary' \| 'ordinal' \| 'continuous'` | Yes | `—` | — |
| `use` | `string \| null` | No | `None` | — |
| `run` | `string \| null` | No | `None` | — |
| `inference` | `string \| null` | No | `None` | — |
| `agent` | `string \| null` | No | `None` | — |
| `with` | `map<string, JsonValue> \| null` | No | `None` | — |
| `validated_by` | `string \| null` | No | `None` | — |

JSON Schema

## ExperimentFactor

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `what` | `'agent' \| 'prompt' \| 'use' \| 'flow'` | Yes | `—` | — |
| `nodes` | `FactorNode[]` | Yes | `—` | minItems=1 |

JSON Schema

## ExperimentPlan

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `cases` | `integer \| null` | No | `None` | — |
| `repeats` | `integer` | No | `1` | minimum=1, maximum=20 |

JSON Schema

## ExperimentSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `apiVersion` | `'aqven/v1'` | Yes | `—` | — |
| `kind` | `'Experiment'` | Yes | `—` | — |
| `description` | `string` | Yes | `—` | minLength=1 |
| `failure_mode` | `string \| null` | No | `None` | — |
| `archived` | `boolean` | No | `False` | — |
| `subject` | `ExperimentSubject` | Yes | `—` | — |
| `varies` | `ExperimentFactor \| null` | No | `None` | — |
| `cases` | `CaseSelection` | Yes | `—` | — |
| `variants` | `VariantSpec[]` | Yes | `—` | minItems=1 |
| `checks` | `ExperimentCheck[] \| null` | No | `None` | — |
| `question` | `Question` | Yes | `—` | — |
| `plan` | `ExperimentPlan` | No | `not set` | — |

JSON Schema

## ExperimentSubject

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `flow` | `string` | Yes | `—` | — |
| `from` | `string \| null` | No | `None` | — |
| `to` | `string \| null` | No | `None` | — |

JSON Schema

## Guardrail

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `metric` | `MetricName` | Yes | `—` | — |
| `direction` | `'higher_is_better' \| 'lower_is_better' \| null` | No | `None` | — |
| `margin` | `number` | Yes | `—` | minimum=0 |
| `relative` | `boolean` | No | `False` | — |

JSON Schema

## LookQuestion

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `kind` | `'look'` | Yes | `—` | — |

JSON Schema

## NoninferiorQuestion

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `kind` | `'noninferior'` | Yes | `—` | — |
| `baseline` | `string` | Yes | `—` | — |
| `candidate` | `string` | Yes | `—` | — |
| `primary` | `MetricName` | Yes | `—` | — |
| `direction` | `'higher_is_better' \| 'lower_is_better' \| null` | No | `None` | — |
| `margin` | `number` | Yes | `—` | exclusiveMinimum=0 |
| `guardrails` | `Guardrail[] \| null` | No | `None` | — |

JSON Schema

## ThresholdQuestion

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `kind` | `'threshold'` | Yes | `—` | — |
| `metric` | `MetricName` | Yes | `—` | — |
| `variant` | `string \| null` | No | `None` | — |
| `below` | `number \| null` | No | `None` | — |
| `above` | `number \| null` | No | `None` | — |
| `margin` | `number` | No | `0.0` | minimum=0 |

JSON Schema

## VariantSpec

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `id` | `string` | Yes | `—` | pattern=^[a-z][a-z0-9_]{0,62}$ |
| `nodes` | `map<string, FactorValue> \| null` | No | `None` | — |

JSON Schema
