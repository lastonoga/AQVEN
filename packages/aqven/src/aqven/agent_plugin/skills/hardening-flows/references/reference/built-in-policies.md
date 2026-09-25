# Built-in policies and evaluators

Generated policy names and Python signatures.

## Contents

- [join](#join)
- [stop](#stop)
- [select](#select)
- [on_item_error](#on_item_error)
- [evaluator](#evaluator)
- [`with` parameter models](#with-parameter-models)
- [BestParams](#bestparams)
- [CitationsInSourcesParams](#citationsinsourcesparams)
- [DefaultParams](#defaultparams)
- [ExpectedParams](#expectedparams)
- [FieldParams](#fieldparams)
- [IdsInAllowedSetParams](#idsinallowedsetparams)
- [LanguageParams](#languageparams)
- [MaxWordsParams](#maxwordsparams)
- [NoParams](#noparams)
- [NoPiiParams](#nopiiparams)
- [QuorumParams](#quorumparams)
- [RegexParams](#regexparams)
- [StagnationParams](#stagnationparams)
- [ThresholdParams](#thresholdparams)
- [UniqueItemsParams](#uniqueitemsparams)

Use these names with `use:` in a policy or evaluator slot. The accepted `with:` keys follow each Python signature; run `aqven check` to validate the slot and parameters.

None of these fit your check? How to write a custom evaluator covers writing your own with `run:` instead of `use:` — same signature shape as every `evaluator` row below.

## join

| `use` name | Python signature |
| --- | --- |
| `all` | `join_all(state: 'JoinState[T]', params: 'NoParams') -> 'JoinDecision[T]'` |
| `any` | `join_any(state: 'JoinState[T]', params: 'NoParams') -> 'JoinDecision[T]'` |
| `first_success` | `first_success(state: 'JoinState[T]', params: 'NoParams') -> 'JoinDecision[T]'` |
| `quorum` | `quorum(state: 'JoinState[T]', params: 'QuorumParams') -> 'JoinDecision[T]'` |

## stop

| `use` name | Python signature |
| --- | --- |
| `threshold` | `threshold(state: 'LoopState', params: 'ThresholdParams') -> 'StopDecision'` |
| `stagnation` | `stagnation(state: 'LoopState', params: 'StagnationParams') -> 'StopDecision'` |

## select

| `use` name | Python signature |
| --- | --- |
| `last` | `last(state: 'LoopState', params: 'NoParams') -> 'int'` |
| `best` | `best(state: 'LoopState', params: 'BestParams') -> 'int'` |

## on_item_error

| `use` name | Python signature |
| --- | --- |
| `skip` | `skip(item: 'object', error: 'MapItemError', params: 'NoParams') -> 'ItemDecision[JsonValue]'` |
| `fail` | `fail(item: 'object', error: 'MapItemError', params: 'NoParams') -> 'ItemDecision[JsonValue]'` |
| `default` | `default(item: 'object', error: 'MapItemError', params: 'DefaultParams') -> 'ItemDecision[JsonValue]'` |

## evaluator

| `use` name | Python signature |
| --- | --- |
| `not_empty` | `not_empty(value: 'BaseModel', context: 'Context', params: 'FieldParams') -> 'Verdict'` |
| `max_words` | `max_words(value: 'BaseModel', context: 'Context', params: 'MaxWordsParams') -> 'Verdict'` |
| `language` | `language(value: 'BaseModel', context: 'Context', params: 'LanguageParams') -> 'Verdict'` |
| `no_pii` | `no_pii(value: 'BaseModel', context: 'Context', params: 'NoPiiParams') -> 'Verdict'` |
| `regex` | `regex(value: 'BaseModel', context: 'Context', params: 'RegexParams') -> 'Verdict'` |
| `unique_items` | `unique_items(value: 'BaseModel', context: 'Context', params: 'UniqueItemsParams') -> 'Verdict'` |
| `ids_in_allowed_set` | `ids_in_allowed_set(value: 'BaseModel', context: 'Context', params: 'IdsInAllowedSetParams') -> 'Verdict'` |
| `citations_in_sources` | `citations_in_sources(value: 'BaseModel', context: 'Context', params: 'CitationsInSourcesParams') -> 'Verdict'` |
| `expected` | `expected(value: 'BaseModel', context: 'ExpectationContext', params: 'ExpectedParams') -> 'Verdict'` |
| `cost_usd` | `cost_usd(value: 'BaseModel', context: 'Context', params: 'NoParams') -> 'Verdict'` |
| `latency_ms` | `latency_ms(value: 'BaseModel', context: 'Context', params: 'NoParams') -> 'Verdict'` |

## `with` parameter models

## BestParams

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `path` | `RefPath` | Yes | `—` | — |

JSON Schema

## CitationsInSourcesParams

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `citations` | `RefPath` | Yes | `—` | — |
| `sources` | `RefPath` | Yes | `—` | — |
| `id` | `string` | Yes | `—` | — |
| `quote` | `string` | Yes | `—` | — |
| `text` | `string` | Yes | `—` | — |

JSON Schema

## DefaultParams

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `value` | `JsonValue` | Yes | `—` | — |

JSON Schema

## ExpectedParams

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `fields` | `FieldName[] \| null` | No | `None` | — |

JSON Schema

## FieldParams

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `field` | `RefPath` | Yes | `—` | — |

JSON Schema

## IdsInAllowedSetParams

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `field` | `RefPath` | Yes | `—` | — |
| `allowed` | `RefPath` | Yes | `—` | — |

JSON Schema

## LanguageParams

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `field` | `RefPath` | Yes | `—` | — |
| `locale` | `RefPath` | Yes | `—` | — |

JSON Schema

## MaxWordsParams

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `field` | `RefPath` | Yes | `—` | — |
| `max` | `integer` | Yes | `—` | minimum=1 |

JSON Schema

## NoParams

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |

JSON Schema

## NoPiiParams

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `fields` | `RefPath[]` | Yes | `—` | minItems=1 |
| `detectors` | `('email' \| 'phone' \| 'card_number' \| 'iban' \| 'ip_address')[] \| null` | No | `None` | — |

JSON Schema

## QuorumParams

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `min_ok` | `integer` | Yes | `—` | minimum=1 |
| `on_error` | `'skip' \| 'fail'` | No | `'fail'` | — |

JSON Schema

## RegexParams

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `field` | `RefPath` | Yes | `—` | — |
| `pattern` | `string` | Yes | `—` | minLength=1 |

JSON Schema

## StagnationParams

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `path` | `RefPath` | Yes | `—` | — |
| `window` | `integer` | Yes | `—` | minimum=1, maximum=5 |
| `min_delta` | `number` | Yes | `—` | minimum=0 |

JSON Schema

## ThresholdParams

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `path` | `RefPath` | Yes | `—` | — |
| `gte` | `number \| null` | No | `None` | — |
| `lte` | `number \| null` | No | `None` | — |

JSON Schema

## UniqueItemsParams

| YAML field | Type | Required | Default | Constraints |
| --- | --- | --- | --- | --- |
| `field` | `RefPath` | Yes | `—` | — |
| `key` | `string` | Yes | `—` | — |

JSON Schema
