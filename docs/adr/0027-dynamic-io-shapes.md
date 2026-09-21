# ADR-0027. Динамическая форма входа и выхода

> Статус: принято
> Дата: 2026-09-16
> Зависит от: [ADR-0004](0004-schema-profiles.md), [ADR-0006](0006-dynamic-allowed-sets.md), [ADR-0019](0019-escape-hatch-rules.md), [ADR-0022](0022-hash-as-version.md), [ADR-0025](0025-python-engine.md), [ADR-0026](0026-yaml-spec-and-code-refs.md), [ADR-0029](0029-trust-and-quality-python.md)
> Изменяет в части динамической формы (расширяет, не заменяет): [ADR-0006](0006-dynamic-allowed-sets.md)
> Изменяет в части видов узлов и встроенных типов (вид узла `narrow`, типы `Dynamic` и `FieldSpec`): [ADR-0026](0026-yaml-spec-and-code-refs.md)
> Меняет: [DECISIONS.md](../DECISIONS.md) — раздел «Escape hatch: код даёт значение, но не форму»; [03. Ядро языка](../03-core-language.md) §2, §3.3; [04. Формат IR](../04-ir-schema.md) §2.2, §2.5, §3.3; [05. Система типов](../05-type-system.md) §1.1, §1.2, §5.3–5.4; [07. Компилятор](../07-compiler.md) §3; [08. Промты](../08-prompts.md) §4, §6; [11. Провайдеры](../11-providers.md) §6; [12. Наблюдаемость](../12-observability.md) §2; [22. Глоссарий](../22-glossary.md); [99. Открытые вопросы](../99-open-questions.md) B-10, F-13; [CONVENTIONS.md](../CONVENTIONS.md) «Ссылки» (если коды R-D приняты); [research/py-spec-as-code.md](../research/py-spec-as-code.md) §12.2–12.3, §13.2; [research/py-stack-runtime.md](../research/py-stack-runtime.md) §3.4
> Исследование: [research/py-spec-as-code.md](../research/py-spec-as-code.md) §12–13, [research/py-stack-runtime.md](../research/py-stack-runtime.md) §3.4–3.5

## Контекст

Два требования владельца (решение владельца от 2026-09-16; первое оформляет этот ADR):

1. Вход и выход узла могут зависеть от предыдущего шага или контекста прогона.
2. Enum из данных прогона (ID из предыдущего шага) уходит в strict structured output, чтобы модель
   не могла выдумать ID. Это уже закон: [ADR-0006](0006-dynamic-allowed-sets.md).

«Динамическая форма» покрывает пять разных ситуаций, и у каждой своя цена. Если свести всё к одному
механизму «схема из данных», пропадают статическая проверка типов между узлами, R-T1 по полям
шаблона, стабильный хеш схемы и кеш грамматики провайдера. Если запретить динамику, первое требование
не выполнено.

Пакеты: pydantic-ai-slim 2.43.0 (MIT), pydantic 2.13.5 (MIT), anthropic 1.6.0 (MIT), openai 3.14.1 (Apache-2.0).
Тело запроса перехватывалось через `httpx2.MockTransport`, ключи фальшивые, сети нет. Пробы выполнялись вне
репозитория 2026-09-16. Перехват по всем провайдерам шёл на CPython 3.12.4, результаты — в
[research/py-spec-as-code.md](../research/py-spec-as-code.md) §13. [ADR-0025](0025-python-engine.md) фиксирует
3.14, поэтому часть проб повторена на CPython 3.14.7: перехват OpenAI Chat, OpenAI Responses, Anthropic
`claude-sonnet-4-5` и `claude-3-7-sonnet-20250219`; `StructuredDict`, повтор `create_model`, валидаторы и пример
`FieldSpec`. Остальное повторить на 3.14.7 — открытый вопрос 12.

| Факт | Источник |
|---|---|
| Enum из `Literal` доходит без изменений до OpenAI Chat, OpenAI Responses, Anthropic, Google и OpenRouter, включая набор из 450 UUID; клиент размер набора не ограничивает, лимиты провайдера из ADR-0006 остаются | research/py-spec-as-code.md §13.1 |
| При `strict=None` (умолчание `ToolOutput` и `NativeOutput`) флаг равен `is_strict_compatible` трансформера профиля. OpenAI Chat и Responses получают `strict: true` только без strict-несовместимых ключей; с `maxLength` Chat уходит без `strict`, Responses — со `strict: false`. У Anthropic и Bedrock `is_strict_compatible = strict is True`: без явного `True` флага нет. `ToolOutput(M, strict=True)` и `NativeOutput(M, strict=True)` дают `strict: true` при любой схеме | research/py-spec-as-code.md §13.2–13.3; `models/__init__.py` `_customize_tool_def`, `_customize_output_object`; `providers/bedrock.py`; перехват на 3.14.7 |
| Strict-трансформер OpenAI переносит в `description` ключи `_STRICT_INCOMPATIBLE_KEYS` (`minLength`, `maxLength` и др.); `maxItems`, `minimum`, `maximum` остаются. `discriminator` удаляется всегда, `oneOf` в strict переписывается в `anyOf`, при `strict=None` делает схему strict-несовместимой | research/py-spec-as-code.md §13.3; `profiles/openai.py` `OpenAIJsonSchemaTransformer` |
| `anthropic.transform_schema` оставляет в схеме только `$defs`, `$ref`, `type`, `anyOf` (в том числе из `oneOf`), `allOf`, `enum`, `description`, `title`, `properties`, `additionalProperties: false` на каждом объекте, `required`, `format` из `SupportedStringFormats` (`date-time`, `time`, `date`, `duration`, `email`, `hostname`, `uri`, `ipv4`, `ipv6`, `uuid`), `items`, `minItems` 0 или 1. Остальное, включая `maxItems`, `minimum`, `maximum`, `maxLength`, `pattern`, дописывается в `description` текстом `{maxItems: 20}`. Для поля-словаря (`dict`) Pydantic AI предупреждает, что модель вынуждена вернуть `{}` | `anthropic/lib/_parse/_transform.py` `transform_schema`, `SupportedStringFormats`; `providers/anthropic.py` `AnthropicJsonSchemaTransformer`; [research/py-quality-layer.md](../research/py-quality-layer.md) §1.7; перехват на 3.14.7 |
| `StructuredDict(schema)` не валидирует ответ: объект вне enum, с числом вместо строки и лишним полем принят за 1 вызов. `create_model(..., __config__={"extra": "forbid"})` + `ToolOutput(M, strict=True)` отклоняет невалидный первый ответ, повторяет и принимает валидный второй (2 вызова) | research/py-spec-as-code.md §12.1; research/py-stack-runtime.md §3.5; запуск на 3.14.7 |
| `model_validator(mode="after")` с проверкой уникальности ключей даёт повтор (2 вызова); `BeforeValidator` перед `Literal` оставляет `enum` в JSON Schema и принимает `COLOR` как `color` | запуск на 3.14.7 |
| `claude-3-7-sonnet-20250219`: `NativeOutput` даёт `UserError: Native structured output is not supported by this model.` на клиенте; `ToolOutput(M, strict=True)` схему трансформирует, но `strict` в запрос не кладёт. Предупреждения о потере strict нет: при записи всех предупреждений пришёл только `DeprecationWarning` SDK об окончании жизни модели | research/py-spec-as-code.md §13.2; `Model.prepare_request`; `AnthropicModel._map_tool_definition`; список моделей со strict — `profiles/anthropic.py` `anthropic_model_profile`; перехват на 3.14.7 |
| Google: флага `strict` нет, ограничения остаются в схеме. Tool output уходит с `functionCallingConfig.mode: "ANY"` при любом `strict`. `VALIDATED` появляется только в запросе с разрешённым текстовым выходом (`ToolOutput \| str`, режим `AUTO`) у Gemini 2.5+ без image-моделей; `strict=False` у любого инструмента оставляет такой запрос в `AUTO`. Документация Google про `VALIDATED`: «Model ensures function schema adherence», без подробностей | перехват `gemini-2.5-flash` на 3.12.4; `models/google.py` `GoogleModel._get_tool_config`; `profiles/google.py` `google_model_profile`; https://ai.google.dev/gemini-api/docs/function-calling (прочитано 2026-09-16) |
| python-liquid 2.3.1 (MIT): `analyze()` без рендера отдаёт переменные, фильтры и теги шаблона | [research/py-quality-layer.md](../research/py-quality-layer.md) §8.5; [ADR-0029](0029-trust-and-quality-python.md) §8 |

## Решение

### Правило выбора

**Берём наименее динамичный случай, который решает задачу.** Случаи упорядочены по тому, сколько
статических гарантий теряется. Переход к следующему случаю допустим, только если предыдущий не
выражает задачу; обоснование — в `description` поля, компилятор предупреждает о лишней динамике
(правило R-D6, предложено).

| # | Что зависит от данных | Механизм | Форма схемы между прогонами | Что видит компилятор | Переход к следующему, если |
|---|---|---|---|---|---|
| 1 | только значения (ID, коды, варианты выбора) | allowed-set по ADR-0006 | структура стабильна, меняется набор значений | все типы и поля | от данных зависит сам набор вариантов структуры |
| 2 | какой из заранее известных вариантов структуры | дискриминированный union + `switch` | стабильна | все варианты, полнота `switch` (R-41) | варианты не перечислимы на момент сборки |
| 3 | набор полей, заданный конфигурацией (однотипные значения) | разворот в строки `{key, value}` с allowed-set на `key` | структура стабильна, набор ключей меняется вместе с конфигом | структуру строки, тип значения | значения полей разнотипны и тип важен потребителю |
| 4 | статическое ядро плюс расширение из данных | статические поля + одно поле `type: "Dynamic"` | ядро стабильно, расширение меняется | ядро целиком, расширение — только лимиты | ядра нет |
| 5 | форма целиком | `Dynamic`, `schema_from`, `limits`, шаг `narrow` | меняется на каждом прогоне | лимиты и точку сужения | — |

`Dynamic` — встроенный тип в нотации типов [ADR-0026](0026-yaml-spec-and-code-refs.md) §1: PascalCase, как
`Text` и `Int`, подходит под `type-id`. `Dynamic` и `FieldSpec` дополняют список встроенных типов ADR-0026 §1,
`narrow` — таблицу видов узлов. Во всех пяти случаях действуют два правила ADR-0019: код и данные дают
**значение**, а не форму графа (имена слотов, набор узлов, структура шаблона); у выхода есть явные границы
(R-42). Динамическая схема из случаев 4 и 5 — тоже значение: это данные типа `FieldSpec[]`, объявленного
статически.

| Решение | Что берём | Версия | Лицензия | Почему |
|---|---|---|---|---|
| Модель выхода, построенная при вызове | `pydantic.create_model` с `extra="forbid"` | pydantic 2.13.5 | MIT | один объект даёт JSON Schema для провайдера и валидатор на приёме; отклонение ведёт к повтору (проверено запуском) |
| Структурированный вывод | `ToolOutput(M, strict=True)`, `NativeOutput(M, strict=True)` | pydantic-ai-slim 2.43.0 | MIT | единственный способ отправить `strict: true` независимо от ключей схемы; при `strict=None` флаг молча зависит от содержимого схемы |
| Варианты структуры | `Annotated[A \| B, Field(discriminator="kind")]` | pydantic 2.13.5 | MIT | выбор варианта по тегу, схема `anyOf` после трансформера |
| Регистр кодов allowed-set | `BeforeValidator` перед `Literal` | pydantic 2.13.5 | MIT | `enum` остаётся в схеме, сравнение без учёта регистра (ADR-0006, обязанность 3; проверено запуском) |
| Статический разбор шаблона для динамического входа | `analyze()` | python-liquid 2.3.1 | MIT | R-T1/R-T2 считаются без рендера |
| Хеш схемы | `rfc8785` + `hashlib.sha256` | 0.1.4 / CPython 3.14 | Apache-2.0 / stdlib | идентичность по содержимому ([ADR-0022](0022-hash-as-version.md)); канонизация и списки пар вместо `properties` — как у ключа кассеты ([ADR-0029](0029-trust-and-quality-python.md) §1), домен свой («След» в случае 5) |
| Запрет `StructuredDict` | ruff TID251 `banned-api` на `pydantic_ai.StructuredDict` | ruff 0.16.7 | MIT | ловит и импорт, и `pydantic_ai.StructuredDict(...)` (проверено запуском) |
| `FieldSpec`, проверка лимитов, шаг `narrow`, непрозрачное значение | свой код | — | — | готового нет: BAML `@@dynamic` живёт в своём DSL, `StructuredDict` не валидирует |

Примеры ниже — в каноническом виде ADR-0026: блочный стиль, строки в двойных кавычках, `in`/`out`/`fields` —
списки. У файлов узлов `llm` показаны только ключи от `out` и ниже; шапка, `description`, `model_role`,
`prompt` и `in` — как в примере ADR-0026 §3. Ключи, которых ADR-0026 не фиксирует, перечислены в открытом
вопросе 2.

### Случай 1. Только значения: allowed-set

Действует ADR-0006: пороги 50 / 400 / 1000, коды вместо UUID, индексный выбор, сужение до вызова двумя
узлами `retrieve` + `select`, подстановка реального ID кодом на приёме. Механика на Python —
[ADR-0029](0029-trust-and-quality-python.md) §7: набор при вызове — `Literal[...]` поля модели выхода
(≤ 50 кодов) или `int` с `Field(ge=0, le=n - 1)`; регистр нормализует `BeforeValidator` до сравнения с
`Literal`; вхождение и подстановка реального ID — `output_validator` + `ModelRetry`, таблица «код или индекс →
реальный ID» приходит через `deps`, живёт один вызов и пишется в провенанс, реальный ID получает
`typing.NewType`-идентификатор. Лимиты ADR-0006 (416 UUID, 1000 значений, 15 000 и 120 000 символов) проверяет
наш код до вызова: клиент Pydantic AI 450 UUID пропускает.

`PolicyId` — тип `types/policy_id.yaml` с `type: "id"`, `source: "db.refund_policies"`, `allowed_set: "dynamic"`
и `code_format: "prefixed_ordinal"`; `$load_policies.out.policy_ids` имеет тип `PolicyId[]`. Список «код →
описание» в промт добавляет платформа (ADR-0006), отдельный вход для кандидатов не нужен.

`flows/resolve_refund/nodes/pick_policy.yaml`, узел `llm` «Политика возврата, по которой решается заявка»:

```yaml
out:
- name: "reasoning"
  type: "Text"
  description: "Почему к заявке применима именно эта политика"
  maxLength: 600
- name: "policy"
  type: "PolicyId"
  description: "Применимая политика возврата"
allowed_sets:
- type: "PolicyId"
  from: "$load_policies.out.policy_ids"
output_contract:
  mode: "strict"
```

### Случай 2. Известные варианты: union и `switch`

Если от данных зависит, **какая** из заранее известных структур нужна, тип — дискриминированный
union из реестра, а маршрут — узел `switch` по тегу. Полнота `switch` проверяется по enum тега (R-41),
каждая ветка получает уже суженный вариант. Ограничения ADR-0004 сохраняются: union в корне
заворачивается в поле, у Anthropic не больше 16 параметров с union-типом. Порядок вариантов задаёт
порядок `anyOf`, поэтому `variants` — список. Маршрут — узел `switch` с `on: "$decide.out.decision.kind"` и
`cases` по тегам `refund`, `replace`, `reject` (форма 04 §2.5, без `on_type`).

`types/refund_decision.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "union"
description: "Итог разбора заявки на возврат"
discriminator: "kind"
variants:
- name: "refund"
  description: "Вернуть деньги по политике"
  fields:
  - name: "amount"
    type: "Money"
    description: "Сумма возврата"
  - name: "policy"
    type: "PolicyId"
    description: "Политика, по которой возвращаем"
- name: "replace"
  description: "Заменить товар"
  fields:
  - name: "sku"
    type: "SkuId"
    description: "Товар на замену"
- name: "reject"
  description: "Отказать с объяснением"
  fields:
  - name: "reason"
    type: "Text"
    description: "Причина отказа для клиента"
    maxLength: 400
```

### Случай 3. Набор полей из конфигурации: разворот в строки

Если конфигурация (категория товара, форма тенанта) задаёт список полей, а значения однотипны,
выход — массив строк `{key, value}`, а `key` — ID с allowed-set по ADR-0006. Открытая карта
(`dict`, `additionalProperties`) запрещена уже в [05](../05-type-system.md) §1.2, а у Anthropic
в strict модель вынуждена вернуть `{}`. `AttributeKey` — тип `id`, как `PolicyId` в случае 1, с
`source: "config.category_attributes"` и `code_format: "identity"`; `AttributeValue` — `type: "record"` с полями
`key: AttributeKey` и `value: Text` (`maxLength: 200`).

`flows/enrich_listing/nodes/extract_attributes.yaml`, узел `llm` «Атрибуты товара из карточки продавца» со
входом `listing: Document`:

```yaml
out:
- name: "attributes"
  type: "AttributeValue[]"
  description: "Значения атрибутов категории"
  maxItems: 30
allowed_sets:
- type: "AttributeKey"
  from: "$load_category.out.attribute_keys"
output_contract:
  mode: "strict"
```

Правила:

- Структура схемы не зависит от конфига; меняется только enum ключей и только при смене конфига,
  поэтому хеш схемы стабилен между прогонами одной версии конфига.
- Описание каждого ключа обязательно (05 §2) и попадает в промт таблицей «ключ — описание».
- Уникальность `key` и обязательные ключи проверяются на приёме `model_validator(mode="after")`;
  нарушение ведёт к повтору в пределах `retries["output"]` (ADR-0029 §2).
- Ключей больше 50: по умолчанию индексный выбор (ADR-0006). Допустимая альтернатива — `key: Text`
  в схеме и проверка вхождения на приёме с подсказкой трёх ближайших ключей (аварийный путь
  ADR-0006). Выбор альтернативы — явный override на узле с записью в провенанс (ADR-0006,
  обязанность 5).
- Если значения разнотипны и тип важен потребителю, разворот теряет типизацию: переход к случаю 4 или 5.

### Случай 4. Статическое ядро и динамическое расширение

Аналог BAML `@@dynamic` (baml-py 0.226.2 MIT, `TypeBuilder.add_property`), но без второго DSL.
Статические поля типизированы и адресуются как обычно (`$extract.out.total`). Расширение — одно
поле `type: "Dynamic"` с `schema_from` и `limits`. К нему применяются все правила случая 5, к ядру — нет.
Если расширение — плоский набор однотипных скаляров, оно оформляется как случай 3 (`AttributeValue[]`).

`flows/book_invoice/nodes/extract.yaml`, узел `llm` «Реквизиты счёта и поля шаблона учёта тенанта» со входом
`invoice: Document`:

```yaml
out:
- name: "total"
  type: "Money"
  description: "Итоговая сумма счёта"
- name: "extra"
  type: "Dynamic"
  description: "Поля, которые требует шаблон учёта тенанта"
  schema_from: "$load_tenant_schema.out.fields"
  limits:
    max_fields: 20
    max_depth: 1
    max_text_length: 300
    max_items: 10
output_contract:
  mode: "strict"
```

Ключи `limits` — ключи формата, а не ключевые слова JSON Schema, поэтому они в snake_case, как `schema_from` и
`model_role`; camelCase остаётся только у ключевых слов JSON Schema (`maxItems`, `maxLength`, ADR-0026 §1).

### Случай 5. Форма целиком из данных

**Схема на нашем языке типов, а не произвольная JSON Schema.** Источник `schema_from` обязан иметь
тип `FieldSpec[]` с `maxItems` (R-D3, предложено). `FieldSpec` — встроенный тип реестра:

| Поле `FieldSpec` | Тип | Правило |
|---|---|---|
| `name` | `Text`, `pattern: ^[a-z][a-z0-9_]{0,62}$` | уникально внутри уровня |
| `type` | `Text`, `Int`, `Float`, `Bool`, `Date`, `DateTime`, TypeId реестра, суффиксы `[]` и `?` в нотации типов ADR-0026 §1; `Record` — вложенная запись | медиатипы и `Dynamic` запрещены; опциональность только через `?`, на проводе — `null` (ADR-0004); `Record` — метка только внутри `FieldSpec`, не тип реестра и не значение `type` у `in`/`out` |
| `description` | `Text`, `maxLength: 300` | обязательно (ADR-0026, 05 §2) |
| `maxLength`, `maxItems`, `minimum`, `maximum`, `pattern` | по типу поля | `maxLength` у `Text` и `maxItems` у `T[]` обязательны (R-42) и не больше `limits` |
| `enum` | `Text[]`, `maxItems: 50` | больше 50 значений — не здесь, а allowed-set (случай 1) |
| `fields` | `FieldSpec[]` | только у `Record`; глубина ≤ `limits.max_depth` |

Запрещено в `FieldSpec`: `$ref`, рекурсия, `oneOf`/`anyOf`, `patternProperties`, открытые карты,
значения по умолчанию.

**Лимиты.** `limits` обязателен и содержит четыре ключа: `max_fields` (всего полей на всех уровнях),
`max_depth` (≤ 3 по R-36), `max_text_length`, `max_items`. Компилятор проверяет худший случай по
`limits` против бюджета профиля (ADR-0004: свойства, глубина, символы; у Anthropic 24 optional и 16 union)
и считает по нему R-12 и R-34 (R-D4, предложено). Фактическая схема проверяется против `limits`
**до вызова модели**: нарушение — `WorkflowIssue`, сетевого запроса нет.

**Непрозрачное значение.** Выход типа `Dynamic` имеет тип «непрозрачное значение» (аналог
`unknown`): его нельзя привязать к типизированному слоту, спроецировать `pick`/`omit`, передать в
`switch` или прочитать по полю в шаблоне. Всё это — ошибка компиляции (R-D1, предложено). Допустимые
потребители:

| Потребитель | Что получает |
|---|---|
| шаг `narrow` | значение и `FieldSpec[]`, отдаёт статический тип |
| шаг `code` со входом типа `Dynamic` | JSON-значение и `FieldSpec[]`; выход функции статический и проверяется `aqven check` |
| слот шаблона целиком, без обращения к полям | адаптер отрисовывает значение вместе с его схемой |
| выход воркфлоу типа `Dynamic` | значение со схемой и её хешем (форма конверта в API — открытый вопрос 6) |

**Шаг `narrow`.** Новый вид узла сверх таблицы видов ADR-0026 §1. Сужает непрозрачное значение до
статического типа реестра валидацией Pydantic. `to` — тип, который нужен потребителю; форма вызова модели
может быть шире. Если `to` — union с дискриминатором, за `narrow` идёт `switch` (случай 2). Несовпадение —
`WorkflowIssue` с `severity: "assert"` и списком ошибок валидации; узел падает, повтора модели нет:
вызов уже прошёл валидацию по своей схеме.

Пример: шаг `plan` (узел `code`, `run: "support_refunds.code.forms:fields_for_category"`, `determinism: "pure"`)
отдаёт `fields` типа `FieldSpec[]` с `maxItems: 40`. Узел `extract` объявляет `out` из одного поля `record` типа
`Dynamic` со `schema_from: "$plan.out.fields"` и `limits` (`max_fields: 40`, `max_depth: 2`,
`max_text_length: 500`, `max_items: 20`), форма поля — как у `extra` в случае 4. Сужение:

`flows/file_claim/nodes/to_claim.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "narrow"
description: "Анкета как статический тип ClaimForm"
from: "$extract.out.record"
to: "ClaimForm"
```

Исполнитель строит модель выхода из `FieldSpec[]` при вызове. Проверки лимитов — Chain of
Responsibility (таблица независимых проверок, все нарушения копятся), построение полей — Registry
строителей по типу поля, сама модель — Builder поверх `create_model`. Пример сокращён до трёх типов поля
и трёх проверок; ключ `maxLength` из данных попадает в атрибут `max_length` через `alias`. Проверено на
CPython 3.14.7 с pydantic-ai-slim 2.43.0: pyright 1.1.414 strict — 0 ошибок; ruff 0.16.7 `check` и `format`
при `line-length = 120` — чисто; `FieldSpec.model_validate` читает `maxLength`, невалидный ответ (длина, тип,
лишнее поле) даёт повтор и валидный второй ответ (2 вызова), лимит отклоняет схему до вызова.

```python
from collections.abc import Callable
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, JsonValue, TypeAdapter, create_model
from pydantic.fields import FieldInfo
from pydantic_ai import Agent, ToolOutput


class FieldSpec(BaseModel):
    name: Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]{0,62}$")]
    type: Literal["Text", "Int", "Bool"]
    description: Annotated[str, Field(min_length=1, max_length=300)]
    max_length: Annotated[int, Field(ge=1, alias="maxLength")] = 200


class Limits(BaseModel):
    max_fields: Annotated[int, Field(ge=1)]
    max_text_length: Annotated[int, Field(ge=1)]


class DynamicShapeRejected(Exception):
    pass


LimitCheck = Callable[[list[FieldSpec], Limits], list[str]]


def field_count(fields: list[FieldSpec], limits: Limits) -> list[str]:
    return [] if len(fields) <= limits.max_fields else [f"fields={len(fields)} > max_fields={limits.max_fields}"]


def unique_names(fields: list[FieldSpec], limits: Limits) -> list[str]:
    return [] if len({s.name for s in fields}) == len(fields) else ["duplicate field names"]


def text_lengths(fields: list[FieldSpec], limits: Limits) -> list[str]:
    return [
        f"{s.name}.maxLength > {limits.max_text_length}"
        for s in fields
        if s.type == "Text" and s.max_length > limits.max_text_length
    ]


LIMIT_CHECKS: tuple[LimitCheck, ...] = (field_count, unique_names, text_lengths)

FIELD_BUILDERS: dict[str, Callable[[FieldSpec], tuple[type, FieldInfo]]] = {
    "Text": lambda s: (str, Field(description=s.description, max_length=s.max_length)),
    "Int": lambda s: (int, Field(description=s.description)),
    "Bool": lambda s: (bool, Field(description=s.description)),
}

JSON_OBJECT = TypeAdapter(dict[str, JsonValue])


def build_output_model(fields: list[FieldSpec], limits: Limits) -> type[BaseModel]:
    violations = [found for check in LIMIT_CHECKS for found in check(fields, limits)]
    if violations:
        raise DynamicShapeRejected("; ".join(violations))
    definitions: dict[str, Any] = {s.name: FIELD_BUILDERS[s.type](s) for s in fields}
    return create_model("DynamicRecord", __config__={"extra": "forbid"}, **definitions)


async def run_dynamic(
    agent: Agent[None, object], prompt: str, fields: list[FieldSpec], limits: Limits
) -> dict[str, JsonValue]:
    output_type = ToolOutput(build_output_model(fields, limits), strict=True)
    result = await agent.run(prompt, output_type=output_type)
    return JSON_OBJECT.validate_json(result.output.model_dump_json())
```

`Any` в примере один — `dict[str, Any]` у `definitions`, граница с `create_model(**field_definitions: Any)`:
pyright strict сопоставляет распакованные значения ещё и с именованными параметрами `__doc__`, `__base__`,
`__module__`, `__validators__`, поэтому `dict[str, tuple[type, FieldInfo]]` даёт «No overloads for
"create_model"» (проверено запуском). Остальные типы точные. `Agent[None, object]` принимает агента с любым
типом выхода: параметр `OutputDataT` в `pydantic_ai/output.py` ковариантен, а `output_type` прогона заменяет
тип выхода агента. Выход — `dict[str, JsonValue]`: `model_dump(mode="json")` объявлен как `dict[str, Any]`,
поэтому значение проходит через `model_dump_json()` и `TypeAdapter(dict[str, JsonValue])`, и `Any` за пределы
`run_dynamic` не выходит. Класс, построенный `create_model`, не пересекает границу шага: между шагами
переносятся JSON-значение, `FieldSpec[]` и хеш схемы, модель строится заново там, где нужна.

**След.** В трассу и провенанс узла пишутся `FieldSpec[]`, нейтральная схема выхода и её хеш, id профиля,
фактически отправленная wire-схема и фактическое значение `strict` из тела запроса. Хеш схемы —
`sha256("aqven.schema.v1\0" + канонический JSON)` с префиксом `sha256-`: канонизация `rfc8785`, перед ней каждый
объект `properties` превращается в список пар, порядок полей сохраняется (как у ключа кассеты,
[ADR-0029](0029-trust-and-quality-python.md) §1). Домен свой, чтобы хеш схемы не совпадал с хешами других
доменов: доменная сепарация 04 §4.2, функция `hash_of` в [research/py-quality-layer.md](../research/py-quality-layer.md)
§3.2. Ключ кассеты считается от нейтрального запроса, в который входят схемы output-тулов и `output_object` со
`strict` (ADR-0029 §1): новая `FieldSpec[]` даёт новый ключ, профиль в ключ не входит. Механизм снятия
wire-схемы в рантайме — открытый вопрос 5: обёртка `WrapperModel` видит схему до трансформера провайдера.

### Динамический вход

Вход узла динамичен только по значениям. Набор и имена слотов объявлены статически, иначе
R-T1, R-T2 и R-T9 перестают считаться. Проверка «слоты шаблона ⊆ объявленные» через `analyze()`
python-liquid 2.3.1 остаётся статической при любом содержимом значений.

| Потребность | Как выражается | Что запрещено |
|---|---|---|
| вход может отсутствовать или быть пустым | слот `T?`, блок `{% if slot %}` в шаблоне (R-T3 допускает optional-операнд) | вычислять имя слота, склеивать текст промта в коде |
| политика меняет содержимое (PII, видимость, доверие) | хук `context_rewrite(needs, ctx)` (ADR-0019): меняет значения, может заблокировать узел; результат валидируется по объявленным слотам, лишний или пропавший ключ — `WorkflowIssue` | добавлять, удалять, переименовывать слоты |
| набор атрибутов заранее неизвестен | один вход `AttributeValue[]` с `maxItems`, запись `{key, value}`; вывод через `{% for %}` (R-T5) или фильтр из белого списка | открытая карта, по слоту на атрибут |
| вход — выход динамического шага | слот типа `Dynamic` целиком или статический тип после `narrow` | обращение к полям непрозрачного значения |

### Strict включается явно

При `strict=None` флаг strict у Pydantic AI 2.43.0 — функция содержимого схемы: добавили `maxLength` или
union, и OpenAI молча перестаёт получать strict; Anthropic и Bedrock без явного `True` не получают его вовсе.
Поэтому `output_contract.mode` из IR (04 §2.2) компилируется в явный вызов, а `ToolOutput` и `NativeOutput`
со `strict=None` не создаются. Настройки агента и цепочка гарантий вызова —
[ADR-0029](0029-trust-and-quality-python.md) §1–§2.

| `mode` | Pydantic AI 2.43.0 | Условие |
|---|---|---|
| `strict` | `ToolOutput(M, strict=True)`; `NativeOutput(M, strict=True)`, если каталог отмечает поддержку нативного structured output | профиль модели поддерживает strict, иначе ошибка компиляции (R-D5, предложено) |
| `json` | `PromptedOutput(M)` | параметра `strict` нет, держит только валидация на приёме |
| `text` | `TextOutput` | — |
| `grammar` | не сопоставлен | открытый вопрос 4 (self-hosted `choice`, ADR-0006) |

Обязательно при любом `mode`:

1. **Валидация Pydantic на приёме — всегда.** Strict-трансформеры переносят ограничения в
   `description` (OpenAI — `maxLength`, `minLength` и др.; Anthropic — также `maxItems`, `minimum`,
   `maximum`, `pattern`). Грамматика держит форму, границы держит только модель Pydantic.
2. **`StructuredDict` запрещён** правилом ruff TID251: он не валидирует ответ.
3. **Флаг strict в запросе не доверяется конфигурации.** Для `claude-3-7-sonnet-20250219`
   `ToolOutput(strict=True)` молча, без предупреждения, уходит без `strict`, поэтому компилятор сверяет
   модель с профилем, а рантайм пишет в трассу фактическое значение `strict` из тела запроса.

Оговорки по провайдерам и режимам — таблица перехвата в
[research/py-spec-as-code.md](../research/py-spec-as-code.md) §13.2 и профили схем в
[ADR-0029](0029-trust-and-quality-python.md) §6 (свой профиль `anthropic-strict`). Для этого ADR существенны
три: `claude-3-7-sonnet-20250219` теряет strict молча (таблица фактов); Anthropic `NativeOutput` всегда идёт
через strict-трансформер, а `strict=False` у него — `UserError` (`AnthropicModel.prepare_request`, research
§13.3); у Google флага нет, tool output уходит в режиме `ANY` (таблица фактов), а что из ограничений применяют
`ANY` и `VALIDATED` — открытый вопрос 3.

### Цена динамической формы

| Цена | Механика | Случаи | Что делаем |
|---|---|---|---|
| хеш схемы меняется | новый набор значений или новая `FieldSpec[]` — новая схема | 1 и 4–5 на каждом прогоне; 3 при смене конфига | хеш в трассе и провенансе; прогоны сравниваются по хешу, а не по имени узла |
| промах кеша грамматики провайдера | OpenAI компилирует схему при первом запросе, Anthropic кеширует грамматику до 24 часов (ADR-0006, 05 §4) | 1, 4, 5 | предпочитать случаи 2–3; латентность первого запроса считать в бюджете узла |
| пользовательские данные в кеше схем провайдера | enum, имена полей и описания из данных попадают в определение схемы; Anthropic просит не класть PHI в схему (ADR-0006, [05](../05-type-system.md) §4) | 1, 3, 4, 5 | коды вместо ID; источник с меткой `pii` в `allowed_sets.from` или `schema_from` при провайдере вне allowlist — ошибка (R-D7, предложено; расширение R-S12 из [19](../19-security-and-policies.md) и 04 §3.3 п. 7 на схему вызова) |
| токены схемы в каждом запросе | схема уходит и в грамматику, и в текст промта (ADR-0004, обязанность 6) | все | `limits`, короткие коды |
| потеря статического анализа | R-T1, R-09, `switch` не видят полей непрозрачного значения | 4, 5 | `narrow` до первого обращения к полю |
| реплей и форки | новая схема — новый ключ кассеты; форк с другим выходом `plan` кассету не находит | 4, 5 | ожидаемое поведение; кейс датасета фиксирует вход `schema_from` целиком |

## Альтернативы

| Альтернатива | Почему отвергнута | При каких условиях вернёмся |
|---|---|---|
| `StructuredDict(json_schema)` для формы из данных | Не валидирует: принят объект с нарушением enum, типа, границы и лишним полем за 1 вызов | Если Pydantic AI начнёт валидировать `StructuredDict` по переданной схеме и это пройдёт тест из раздела «Проверка» |
| Произвольная JSON Schema в `schema_from` | Нет гарантированных границ (R-42), ключи вне strict-подмножества (`patternProperties`, `$ref`, рекурсия), компилятор не оценит худший случай | Нет: язык типов расширяется новым полем `FieldSpec` через ADR |
| Один механизм «схема из данных» для всех пяти случаев | Теряются типизация между узлами, R-T1, полнота `switch`, стабильный хеш и кеш грамматики там, где они даром | Нет |
| Открытая карта `dict[str, T]` вместо разворота в строки | Противоречит `additionalProperties: false`; у Anthropic в strict модель вынуждена вернуть `{}` | Если strict-режимы провайдеров начнут поддерживать `additionalProperties` со схемой |
| Неявное сужение: непрозрачное значение проверяется при привязке к типизированному слоту | Ошибка всплывает в потребителе, а не в точке, где форма фиксируется; провенанс не показывает, против какого типа сверяли | Нет |
| BAML `@@dynamic` + `TypeBuilder` (baml-py 0.226.2 MIT) | Второй источник истины по типам рядом с IR, ядро на Rust; динамические типы не работают через OpenAPI (docs.boundaryml.com, dynamic-runtime-types) | Если BAML станет форматом обмена, а не рантаймом |
| `strict=None` (умолчание Pydantic AI) | Флаг зависит от содержимого схемы: OpenAI теряет strict при `maxLength`, `oneOf` или необязательном поле, Anthropic без явного `True` не получает его никогда (проверено перехватом) | Если Pydantic AI сменит умолчание на явное и перехват это покажет |
| Полагаться на грамматику в части границ | Трансформеры strict переносят `maxLength` (OpenAI) и `maxItems`/`minimum`/`maximum` (Anthropic) в `description` | Если провайдеры начнут исполнять эти ключевые слова в strict |

## Последствия

Положительные:
- Требование динамической формы выполняется без потери гарантий там, где динамика не нужна: случаи 1–3
  оставляют схему статически типизированной.
- Непрозрачное значение делает точку, где форма из данных становится типом, явной и видимой в
  провенансе (`narrow`).
- Лимиты и бюджет профиля проверяются до сетевого вызова, а не ловятся как 400.

Отрицательные:
- Новый вид узла `narrow`, новые встроенные типы `Dynamic` и `FieldSpec` и до семи новых правил
  компилятора.
- Для случаев 4–5 кассеты и кеш грамматики привязаны к конкретной схеме: воспроизводимость
  требует хранить `FieldSpec[]` в провенансе и датасетах.
- Проверка «strict действительно ушёл» становится рантайм-наблюдением, а не свойством конфигурации.

Обязаны делать:
1. `output_contract.mode: "strict"` компилируется в `ToolOutput(M, strict=True)` или
   `NativeOutput(M, strict=True)`; `ToolOutput` и `NativeOutput` со `strict=None` фабрика вывода не создаёт.
2. Выход каждого LLM-узла валидируется моделью Pydantic на приёме, включая динамическую модель.
3. `pydantic_ai.StructuredDict` запрещён в `ruff` `banned-api`.
4. Лимиты `Dynamic` проверяются до вызова; нарушение — `WorkflowIssue` без сетевого запроса.
5. В трассу пишутся `FieldSpec[]`, нейтральная схема и её хеш, отправленная wire-схема и фактическое
   значение `strict`.
6. Непрозрачное значение не доходит до типизированного потребителя без `narrow`.

Становятся неверными и правятся на этапе чистки:
- [DECISIONS.md](../DECISIONS.md), раздел «Escape hatch: код даёт значение, но не форму»: нет правила
  пяти случаев и непрозрачного значения.
- [03. Ядро языка](../03-core-language.md) §2: перечень видов узлов без `narrow`; §3.3: `switch` описан
  через `andBranch` VoltAgent.
- [04. Формат IR](../04-ir-schema.md) §2.2: `output_contract.mode` без отображения на
  `ToolOutput`/`NativeOutput`, нет `Dynamic`, `schema_from`, `limits`; §2.5: нет вида `narrow`;
  §3.3: нет правила непрозрачного значения.
- [05. Система типов](../05-type-system.md) §1.1: нет строк `Dynamic` и `FieldSpec`, union описан
  через `z.discriminatedUnion`; §1.2: запреты сформулированы через Zod; §5.3–5.4: конвейер на
  `z.toJSONSchema`, strict не включается явно.
- [07. Компилятор](../07-compiler.md) §3: R-37 предписывает «проверку Zod на приёме»; нет кодов R-D.
- [08. Промты](../08-prompts.md) §4: нет строки для слота `Dynamic`; §6: блок формата для динамической
  схемы строится при вызове, а не на компиляции.
- [11. Провайдеры](../11-providers.md) §6: strict «через `generateObject`», нет зависимости флага от
  содержимого схемы, режимов function calling Google (`ANY` для tool output, `VALIDATED` при разрешённом
  тексте) и оговорки про `claude-3-7-sonnet`.
- [12. Наблюдаемость](../12-observability.md) §2: атрибуты спана без фактической схемы и `strict`.
- [22. Глоссарий](../22-glossary.md): нет терминов «динамическая форма», «непрозрачное значение», `narrow`.
- [99. Открытые вопросы](../99-open-questions.md): B-10 (strict у `Output.object` ai@6) и F-13
  (`minLength`/`maxLength` в OpenAI strict) отвечены перехватом и разделом «Strict включается явно».
- [CONVENTIONS.md](../CONVENTIONS.md), раздел «Ссылки»: нет семейства `R-D1..R-D7` — если открытый вопрос 1
  закрыт их принятием.
- [research/py-spec-as-code.md](../research/py-spec-as-code.md) §12.2–12.3: `type: dynamic` строчными (итог —
  `Dynamic`), пример без проверки `limits`; §13.2: нет режима function calling Google.
  [research/py-stack-runtime.md](../research/py-stack-runtime.md) §3.4: «на 3.14.7 перехват не повторяли» —
  повторён для OpenAI Chat, OpenAI Responses и Anthropic.

## Проверка

- **Перехват запроса** (`httpx2.MockTransport`, профили `openai-strict`, `anthropic-strict`, Google):
  при `mode: "strict"` в теле есть `strict: true` у OpenAI и у моделей Anthropic из списка профиля, на
  схеме с `maxLength` и без ограничений; у Google tool output уходит с `functionCallingConfig.mode: "ANY"`;
  для модели без поддержки strict компиляция падает. Снапшоты wire-схемы по профилю — golden-тесты ADR-0004.
- **Тест `strict=None`:** для `mode: "strict"` фабрика вывода возвращает `ToolOutput`/`NativeOutput` со
  `strict is True`; объект со `strict=None` валит тест.
- **Тест `StructuredDict`:** `ruff check` на файле с `from pydantic_ai import StructuredDict` даёт TID251.
- **Тест валидации на приёме:** `FunctionModel` возвращает значение с превышением `maxLength`, вне enum и
  с лишним полем; ожидается повтор и валидный второй ответ (2 вызова), а не принятый объект.
- **Тест лимитов:** `FieldSpec[]` сверх `max_fields` или `max_depth` даёт `WorkflowIssue`, счётчик
  перехваченных запросов равен 0.
- **Тест непрозрачного значения:** привязка `$extract.out.record.amount` к слоту `Money` без `narrow` —
  ошибка компиляции с кандидатом «вставить `narrow` к типу …».
- **Тест `narrow`:** значение, не проходящее `to`, даёт `WorkflowIssue` с `severity: "assert"`; ветка
  union после `narrow` попадает в нужную ветку `switch`.
- **Тест разворота:** дубликат `key` в `AttributeValue[]` отклоняется на приёме; `Color` вместо `color`
  принимается и нормализуется; enum ключей не меняется между двумя прогонами одного конфига (равные
  хеши схемы).
- **Тест следа:** хеш нейтральной схемы в спане равен хешу, посчитанному в домене `aqven.schema.v1` по схеме
  из ключевого JSON кассеты; wire-схема в спане совпадает со схемой в теле, перехваченном `httpx2.MockTransport`.
- **Тест входа:** `context_rewrite`, вернувший ключ вне объявленных слотов, даёт `WorkflowIssue`.
- **Критерий «форма вызова шире нужной»:** если доля ошибок `narrow` на узле выше доли невалидных ответов
  модели, узел переводится на меньший номер случая.
- **Критерий «в языке не хватает примитива»:** если доля узлов со случаями 4–5 превышает бюджет escape-узлов
  (ADR-0019), расширяем реестр типов, а не бюджет.

## Пересмотр

Пересматриваем, если: Pydantic AI меняет правило вывода strict при `strict=None`, выбор режима function
calling Google или начинает валидировать `StructuredDict`; OpenAI или Anthropic начинают исполнять
`maxLength`, `maxItems`, `minimum` в strict-режиме; Google документирует, что именно гарантируют `ANY` и
`VALIDATED`; провайдеры начинают кешировать грамматики динамических схем или снимают риск данных в кеше схем;
ADR-0026 меняет модель описания узла или типа; замеры показывают, что разворот в строки хуже случая 5 по
качеству.

## Открытые вопросы

1. **Коды правил компилятора (предложено, не утверждено).** Закрыть: внести в
   [07. Компилятор](../07-compiler.md) §3 с уровнем гарантии и кандидатами правки или слить с существующими.
   - R-D1 (предложено): непрозрачное значение привязано к типизированному слоту, проекции, `switch`
     или прочитано по полю в шаблоне без `narrow`.
   - R-D2 (предложено): `Dynamic` без `schema_from` или без любого из четырёх ключей `limits`;
     `max_depth` > 3.
   - R-D3 (предложено): тип источника `schema_from` не `FieldSpec[]` с `maxItems` ≤ `limits.max_fields`.
   - R-D4 (предложено): худший случай по `limits` не укладывается в бюджет профиля, R-12 или R-34.
   - R-D5 (предложено): `mode: "strict"` на модели, профиль которой strict не поддерживает.
   - R-D6 (предложено, предупреждение): лишняя динамика — `schema_from` из константы или конфига
     проекта без данных прогона (достаточно статического типа); `Dynamic` с плоскими однотипными
     скалярами (достаточно случая 3).
   - R-D7 (предложено): источник `allowed_sets.from` или `schema_from` с меткой `pii` при провайдере
     вне allowlist.
2. **Ключи, которых ADR-0026 не фиксирует.** В примерах: `from`/`to` у `narrow`; `schema_from` и `limits`
   у элемента `out`; `source`, `allowed_set`, `code_format` у `type: "id"`; `discriminator`, `variants` у
   `type: "union"`; `on`, `cases` у `switch` (по 04 §2.5, без `on_type`); `allowed_sets`, `output_contract`
   у узла `llm` (по 04 §2.2). Закрыть: внести в модели описания ADR-0026 и в 04 §2.2, §2.5 при чистке,
   сгенерировать JSON Schema и прогнать через `aqven check` примеры этого ADR, дополненные до полных файлов.
3. **Что гарантируют Google `ANY` и `VALIDATED`.** Tool output уходит в режиме `ANY`, `VALIDATED` — только в
   запросах с разрешённым текстом (`ToolOutput | str`). Документация о `VALIDATED` говорит только «ensures
   function schema adherence»; применяют ли `ANY` и `VALIDATED` `enum`, `maxItems`, `maxLength`, не проверено.
   Закрыть: живые вызовы `gemini-2.5-flash` в обоих режимах с провокацией выхода за enum и границы; результат —
   в [research/py-spec-as-code.md](../research/py-spec-as-code.md) §13.
4. **Режим `grammar` и self-hosted `choice`.** Как Pydantic AI 2.43.0 передаёт vLLM
   `extra_body.structured_outputs.choice` и есть ли strict для OpenAI-совместимых self-hosted профилей,
   не проверено. Закрыть: перехват запроса к `OpenAIChatModel` с кастомным `base_url` и `extra_body`.
5. **Как снимать фактическую wire-схему и `strict` в рантайме.** `WrapperModel` видит нейтральную схему
   (ADR-0029 §1). Кандидаты: `event_hooks` у `httpx2.AsyncClient` провайдера (не покрывает google-genai,
   клиент которого не на httpx2) или повторный вызов трансформера профиля. Не проверено. Закрыть: спайк на
   OpenAI, Anthropic и Google, сравнение записанной схемы с golden-снимком `MockTransport`.
6. **Форма конверта динамического выхода воркфлоу** в OpenAPI `aqven serve` и сгенерированных точках входа
   модуля (`aqven build`). Для узла и исполнения в [23. API студии](../23-studio-api.md) §4.2–4.3 и §6.3 уже
   есть `dynamic_slots[{path, schema_from, limits}]` и `output_schema_sent`. Закрыть: в
   [ADR-0028](0028-studio-api-contract.md) и 23 — компонент со значением, `FieldSpec[]` и хешем схемы.
7. **Сериализация шага DBOS для непрозрачного значения.** Решение — хранить JSON, `FieldSpec[]` и хеш,
   а не экземпляр динамического класса; что делает сериализатор DBOS 2.31.1 с экземпляром класса из
   `create_model`, не проверено. Закрыть: спайк DBOS на SQLite с падением между шагами.
8. **Фильтр вывода `AttributeValue[]` в шаблоне.** Имя и поведение фильтра в белом списке python-liquid
   2.3.1 ([08](../08-prompts.md) §2.5, ADR-0029 §8) не определены. Закрыть: описать в 08 или ограничиться
   `{% for %}`.
9. **Порог разворота больше 50 ключей.** Какой путь лучше по качеству — индексный выбор или проверка
   вхождения на приёме, не измерено. Закрыть: eval на двух стратегиях, метрика «валидный, но
   неправильный ключ» из ADR-0006.
10. **Латентность компиляции динамических грамматик.** Цена первого запроса с новой схемой у OpenAI и
    Anthropic для размеров `limits` не измерена. Закрыть: замер на 5 последовательных вызовах с разными
    `FieldSpec[]` и с одинаковой.
11. **Сборка модели случая 4.** Статическое ядро из сгенерированной модели плюс поле `extra` с моделью из
    `create_model`: форма вызова (`__base__` или вложенное поле) и что видит pyright в коде проекта у
    `extra`, не проверено. Закрыть: проба на CPython 3.14 с pyright strict и перехватом схемы.
12. **Перехват на CPython 3.14.7 по всем провайдерам поставки.** На 3.14.7 повторены только OpenAI Chat,
    OpenAI Responses и Anthropic (`claude-sonnet-4-5`, `claude-3-7-sonnet-20250219`); Google, OpenRouter,
    `claude-opus-4-6` и enum на 60 и 450 значений проверены на 3.12.4. Закрыть: в спайке повторить перехват
    через `httpx2.MockTransport` на 3.14.7 с `uv.lock` проекта для каждого провайдера поставки и записать
    результат в [research/py-spec-as-code.md](../research/py-spec-as-code.md) §13.
