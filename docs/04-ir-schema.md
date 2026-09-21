# 04. Формат IR и схема спеки

> Статус: draft
> Зависит от: [07. Компилятор](07-compiler.md)
> Источники: research/determinism-export.md (§2 дифф, §3 YAML round-trip, сводка), research/structured-output.md (§5-6), research/volt-primitives.md (§6), research/00-verified-by-lead.md, DECISIONS.md, спека §6.0-6.9, §7.1, §7.5, §15, §15.1

## Зачем этот слой

IR — единственная форма, в которой воркфлоу существует между Claude, компилятором, рантаймом, Studio и экспортом. Он закрывает §8.1 (авторство: правки идут по графу, а не по тексту), §8.11 (версии неизменяемы и адресуются содержимым) и kill-критерий 13 (экспорт → импорт → экспорт даёт те же байты). Всё, что нельзя выразить в IR, не существует для платформы: нет узла — нет исполнения, нет провенанса, нет диффа.

Готовой библиотеки под этот формат нет — IR, компилятор и исполнители узлов мы пишем сами (DECISIONS, «Что VoltAgent НЕ даёт»). Берём готовое только на четырёх технических функциях: канонизация, хеш, YAML-транспорт, дифф.

## Решения

| Решение | Что берём | Версия | Лицензия | Почему |
|---|---|---|---|---|
| Канонический JSON | `canonicalize` (RFC 8785 / JCS) | 5.0.0 | Apache-2.0 | автор — соавтор RFC; детерминированная сериализация под хеш |
| Хеш | `@noble/hashes` (sha256) | 2.4.0 | MIT | нет нативных зависимостей, доменная сепарация делается вручную |
| YAML-транспорт | `yaml` | 2.9.0 | ISC | единственный живой парсер с AST и полным контролем `ToStringOptions`; round-trip проверен |
| Дифф-движок | `jsondiffpatch` | 0.7.6 | MIT | `objectHash` даёт идентичность узлов по `id`, `detectMove`, обратимый `unpatch` |
| Wire-формат патчей | `rfc6902` | 5.3.0 | MIT | стандарт RFC 6902 для MCP `flow_patch` |
| Валидация IR-документа | `ajv` (`ajv/dist/2020.js`) + `ajv-formats` | 8.20.0 | MIT | draft 2020-12 на границе импорта; `allErrors: true`, `strict: false` |
| Типы на горячем пути | `zod` | 4.6.2 | MIT | Zod — рантайм данных, ajv — границы (DECISIONS) |
| Дешёвое сравнение конфигов | `microdiff` | 1.6.0 | MIT | плоский CREATE/REMOVE/CHANGE там, где идентичность элементов не нужна |

Не берём: `fast-json-patch` (мёртв с 2022), `deep-object-diff` (мёртв с 2022), `safe-stable-stringify` и `fast-json-stable-stringify` под хеши (молча коэрсят `NaN`/`BigInt`).

## 1. Модель документа

Документ IR лежит на диске каталогом: `flows/<flow_id>/flow.yaml` плюс файл на узел (§1.5); запись `flow_specs` (JSONB) — перестраиваемая проекция этих файлов. Он самодостаточен: всё, от чего зависит поведение, либо лежит внутри, либо запинено по версии и хешу в `uses`.

### 1.1. Поля корня

| Поле | Тип | Смысл | В `spec_hash` |
|---|---|---|---|
| `ir_version` | `1` | версия формата IR, не версия воркфлоу | да |
| `flow` | identifier | стабильный идентификатор воркфлоу в проекте | да |
| `version` | integer ≥ 1 | монотонная версия спеки внутри `flow` | да |
| `input` | TypeRef | тип входа прогона, источник `$input` | да |
| `output` | TypeRef | тип результата прогона | да |
| `returns` | Binding | что именно возвращается наружу | да |
| `context` | `("date"\|"time_zone"\|"locale"\|"tenant_id")[]` | какие поля `run.context` объявлены доступными | да |
| `budget` | Budget | потолок прогона: деньги, время, токены | да |
| `nodes` | `Record<NodeId, Node>` | тела узлов, ключ — идентичность узла | да |
| `order` | `NodeId[]` | канонический порядок показа и разрыв ничьих в топосортировке | да |
| `components` | `Record<ComponentId, Component>` | компоненты, определённые в этом воркфлоу | да |
| `uses` | `Record<Alias, Pin>` | лок библиотечных компонентов, тулов, чистых функций, реестра типов и профилей моделей | да |
| `policies` | Policies | видимость, доверие, PII, значения по умолчанию | да |
| `defaults` | NodeDefaults | ретраи и таймауты, наследуемые узлами | да |
| `meta` | Meta | автор, время, комментарий к правке | **нет** |

`nodes` — запись, а не список: идентичность узла задаётся ключом, поэтому перестановка узлов физически не может выглядеть как их подмена (проверено на пробе диффа, §7). Порядок для человека живёт в `order`, и его правка классифицируется как `COSMETIC`.

### 1.2. Что неизменяемо

| Сущность | Изменяемость | Механизм |
|---|---|---|
| Опубликованная версия | неизменяема физически | снимок в бандле и тег в git; рабочее дерево опубликованных версий не хранит |
| Рабочее дерево | изменяемо | запись через CAS по `expects[{path, file_hash}]`; отказы `STALE_FILE`, `FILE_VANISHED`, `FILE_EXISTS`, `LOCK_BUSY`, `TREE_DIRTY` |
| `spec_hash` | функция содержимого | пересчитывается при каждой записи; равенство хешей = равенство версий |
| `uses` | пины неизменяемы внутри версии | обновление библиотечного компонента = новая версия воркфлоу с новым пином |
| `meta` | изменяем всегда | вне хеша, не вызывает новую версию и не инвалидирует кэш реплея |
| Развёрнутый вид | производный | вычисляется из модульного, хранится как кэш, руками не правится (§5) |

Релиз фиксирует не только спеку: `release_hash = hash('aqven/release/v1', { spec_hash, prompt_pins, model_profile_pins, component_lock })` — это исполнение спеки §15 «спека, скомпилированные промты и профили моделей фиксируются вместе».

### 1.3. Две схемы, а не одна

| Схема | Где применяется | Правила |
|---|---|---|
| `flow-spec.authoring.json` | вход импорта и MCP-тулов: то, что пишет человек или Claude | необязательные поля можно опускать, сахар (`load`, `retrieve`, короткая форма `vary`) разрешён |
| `flow-spec.normal.json` | то, что канонизатор кладёт в файл, а индексатор — в JSONB; по нему считаются хеши и собирается бандл | все поля присутствуют, опциональность выражена `null`, `additionalProperties: false`, сахар уже развёрнут |

Нормализация — первый и единственный проход, который меняет документ: `authoring → normal`. Именно поэтому round-trip стабилизируется со второго прохода, а не с первого (research/determinism-export.md §3): первый экспорт легально нормализует авторский ввод, дальше обязан быть фикспойнт.

### 1.4. Жёсткие правила документа

1. Все ключи объектов IR — `^[a-z][a-z0-9_]{0,62}$`. Не-ASCII ключи запрещены валидацией, потому что порядок сортировки JCS (UTF-16 code units) и `Array.prototype.sort` в `yaml` совпадают только на ASCII.
2. Порядок полей типа значим для структурированного вывода (structured-output §1.6), а канонизация и `jsonb` порядок ключей не сохраняют. Поэтому **всё, где порядок значим, объявляется массивом**: `fields: [{ name, type, description }]`, а не `fields: { name: ... }`.
3. Чисел с плавающей точкой нет там, где они означают деньги: бюджет — целые `usd_micros`. YAML нормализует `0.40 → 0.4`, а деньги во float дают расхождение округления между экспортом и БД.
4. `NaN`, `Infinity`, `-0` запрещены на уровне валидации: их не выражает ни JCS, ни YAML 1.2 core (`.inf` парсится в `null`).
5. Комментариев в IR нет. Пояснение — поле `description`, оно и попадает в промт (спека §7.1).

### 1.5. Раскладка документа на диске

Документ существует как дерево файлов; раскладка проекта целиком — [files-first/layout.md](files-first/layout.md).

| Часть документа | Файл |
|---|---|
| корень без `nodes`: `input`, `output`, `returns`, `context`, `budget`, `order`, `components`, `uses`, `policies`, `defaults` | `flows/<flow_id>/flow.yaml` |
| одна запись `nodes` | `flows/<flow_id>/nodes/<node_id>.yaml` |
| тело вложенного подграфа (`map.do`, `loop.body`, ветка) | `flows/<flow_id>/nodes/<node_id>/<inner>.yaml` |
| `prompt` узла | `<node_id>.prompt.md` рядом с узлом, общий — `prompts/<key>.md` |
| развёрнутый вид и план компиляции | `.aqven/cache/`, в `.gitignore` |

| Правило | Формулировка |
|---|---|
| Ключ записи `nodes` | имя файла без расширения; поля `id` в теле узла нет (§4.1) |
| Порядок узлов | только `order` в `flow.yaml`; числовые префиксы в именах (`01_fetch.yaml`) запрещены — перестановка стала бы переименованием и порвала lineage |
| Имена файлов | `^[a-z][a-z0-9_]{0,62}$`, та же форма, что у ключей IR (§1.4.1): на APFS и NTFS `Score.yaml` и `score.yaml` — один файл, и без правила это тихая потеря узла |
| Переводы строк | `.gitattributes` с `* text eol=lf`: CRLF меняет байты молча и ломает CAS |
| Вложенность | подкаталог = пространство имён §4.1; глубже пространства имён, символические ссылки и пробелы запрещены валидатором записи |

## 2. JSON Schema корня (draft 2020-12)

Ниже — нормализованная схема (`flow-spec.normal.json`). Проверяется `ajv` в режиме draft 2020-12; подключение строго через `ajv/dist/2020.js`, иначе ajv молча включает draft-07.

```ts
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import flowSpecSchema from "./schemas/flow-spec.normal.json" with { type: "json" };

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
export const validateFlowSpec = ajv.compile<FlowSpec>(flowSpecSchema);
```

`allErrors: true` обязателен: цикл починки спеки в MCP получает все `problems[]` за один заход, а не первую ошибку. `instancePath` ajv — это JSON Pointer, он ложится прямо в `problems[].path` конверта ответа.

### 2.1. Корень и общие определения

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://aqven.local/schemas/ir/1/flow-spec.normal.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["ir_version", "flow", "version", "input", "output", "returns", "context",
               "budget", "nodes", "order", "components", "uses", "policies", "defaults", "meta"],
  "properties": {
    "ir_version": { "const": 1 },
    "flow": { "$ref": "#/$defs/identifier" },
    "version": { "type": "integer", "minimum": 1 },
    "input": { "$ref": "#/$defs/type_ref" },
    "output": { "$ref": "#/$defs/type_ref" },
    "returns": { "$ref": "#/$defs/binding" },
    "context": {
      "type": "array",
      "uniqueItems": true,
      "items": { "enum": ["date", "time_zone", "locale", "tenant_id"] }
    },
    "budget": { "$ref": "#/$defs/budget" },
    "nodes": {
      "type": "object",
      "minProperties": 1,
      "propertyNames": { "$ref": "#/$defs/identifier" },
      "additionalProperties": { "$ref": "#/$defs/node" }
    },
    "order": { "type": "array", "uniqueItems": true, "items": { "$ref": "#/$defs/identifier" } },
    "components": {
      "type": "object",
      "propertyNames": { "$ref": "#/$defs/identifier" },
      "additionalProperties": { "$ref": "#/$defs/component" }
    },
    "uses": {
      "type": "object",
      "propertyNames": { "$ref": "#/$defs/identifier" },
      "additionalProperties": { "$ref": "#/$defs/pin" }
    },
    "policies": { "$ref": "#/$defs/policies" },
    "defaults": { "$ref": "#/$defs/node_defaults" },
    "meta": { "$ref": "#/$defs/meta" }
  },
  "$defs": {
    "identifier": { "type": "string", "pattern": "^[a-z][a-z0-9_]{0,62}$" },
    "type_ref": { "type": "string", "pattern": "^[A-Z][A-Za-z0-9_]{0,62}(\\[\\])?$" },
    "hash": { "type": "string", "pattern": "^sha256-[0-9a-f]{64}$" },

    "pin": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind", "library", "name", "version", "hash"],
      "properties": {
        "kind": { "enum": ["component", "prompt", "tool", "code", "type_registry", "model_profile"] },
        "library": { "$ref": "#/$defs/identifier" },
        "name": { "$ref": "#/$defs/identifier" },
        "version": { "type": "integer", "minimum": 1 },
        "hash": { "$ref": "#/$defs/hash" }
      }
    },

    "budget": {
      "type": "object",
      "additionalProperties": false,
      "required": ["usd_micros", "seconds", "tokens"],
      "properties": {
        "usd_micros": { "type": ["integer", "null"], "minimum": 0 },
        "seconds": { "type": ["integer", "null"], "minimum": 1 },
        "tokens": { "type": ["integer", "null"], "minimum": 1 }
      }
    },

    "ref": {
      "type": "string",
      "pattern": "^\\$(input|item|index|acc|iter|run\\.context\\.(date|time_zone|locale|tenant_id)|[a-z][a-z0-9_]{0,62}\\.(out|in))(\\.[a-z][a-z0-9_]{0,62}|\\[\\*\\]|\\[[0-9]{1,4}\\])*$"
    },

    "projection": {
      "oneOf": [
        { "type": "object", "additionalProperties": false, "required": ["op", "fields"],
          "properties": { "op": { "const": "pick" },
                          "fields": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/identifier" } } } },
        { "type": "object", "additionalProperties": false, "required": ["op", "fields"],
          "properties": { "op": { "const": "omit" },
                          "fields": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/identifier" } } } },
        { "type": "object", "additionalProperties": false, "required": ["op", "select"],
          "properties": { "op": { "const": "map" },
                          "select": { "type": "string", "pattern": "^(\\.[a-z][a-z0-9_]{0,62}|\\[[0-9]{1,4}\\])+$" } } },
        { "type": "object", "additionalProperties": false, "required": ["op", "depth"],
          "properties": { "op": { "const": "flatten" },
                          "depth": { "type": "integer", "minimum": 1, "maximum": 2 } } }
      ]
    },

    "binding": {
      "oneOf": [
        { "type": "object", "additionalProperties": false, "required": ["from", "via"],
          "properties": { "from": { "$ref": "#/$defs/ref" },
                          "via": { "type": "array", "items": { "$ref": "#/$defs/projection" } } } },
        { "type": "object", "additionalProperties": false, "required": ["const", "type"],
          "properties": { "const": true, "type": { "$ref": "#/$defs/type_ref" } } }
      ]
    },

    "slots": {
      "type": "object",
      "propertyNames": { "$ref": "#/$defs/identifier" },
      "additionalProperties": { "$ref": "#/$defs/binding" }
    },

    "predicate": {
      "oneOf": [
        { "type": "object", "additionalProperties": false, "required": ["op", "left", "right"],
          "properties": { "op": { "enum": ["eq", "ne", "lt", "lte", "gt", "gte"] },
                          "left": { "$ref": "#/$defs/binding" },
                          "right": { "$ref": "#/$defs/binding" } } },
        { "type": "object", "additionalProperties": false, "required": ["op", "of"],
          "properties": { "op": { "enum": ["is_empty", "is_null", "not"] },
                          "of": { "$ref": "#/$defs/predicate" } } },
        { "type": "object", "additionalProperties": false, "required": ["op", "items"],
          "properties": { "op": { "enum": ["and", "or"] },
                          "items": { "type": "array", "minItems": 2, "items": { "$ref": "#/$defs/predicate" } } } }
      ]
    },

    "node_common": {
      "type": "object",
      "required": ["kind", "description", "in", "out", "policy", "budget", "retry", "timeout_ms"],
      "properties": {
        "description": { "type": ["string", "null"], "maxLength": 2000 },
        "in": { "$ref": "#/$defs/slots" },
        "out": { "$ref": "#/$defs/type_ref" },
        "policy": { "type": ["string", "null"] },
        "budget": { "oneOf": [{ "$ref": "#/$defs/budget" }, { "type": "null" }] },
        "retry": { "oneOf": [{ "$ref": "#/$defs/retry" }, { "type": "null" }] },
        "timeout_ms": { "type": ["integer", "null"], "minimum": 1 }
      }
    },

    "retry": {
      "type": "object",
      "additionalProperties": false,
      "required": ["attempts", "backoff", "base_delay_ms", "jitter", "retry_on"],
      "properties": {
        "attempts": { "type": "integer", "minimum": 1, "maximum": 8 },
        "backoff": { "enum": ["fixed", "exponential"] },
        "base_delay_ms": { "type": "integer", "minimum": 10 },
        "jitter": { "enum": ["none", "full"] },
        "retry_on": { "type": "array", "items": { "enum": ["timeout", "rate_limit", "server_error", "schema_invalid"] } }
      }
    },

    "node": {
      "oneOf": [
        { "$ref": "node-llm.json" },
        { "$ref": "node-map.json" },
        { "$ref": "node-loop.json" },
        { "$ref": "node-tool.json" },
        { "$ref": "node-code.json" },
        { "$ref": "node-human.json" },
        { "$ref": "node-const.json" },
        { "$ref": "node-seq.json" },
        { "$ref": "node-parallel.json" },
        { "$ref": "node-switch.json" },
        { "$ref": "node-race.json" },
        { "$ref": "node-gate.json" },
        { "$ref": "node-try.json" },
        { "$ref": "node-call.json" }
      ]
    }
  }
}
```

`node` — `oneOf` по ветвям с `"kind": { "const": ... }`. Это схемная форма таблицы обработчиков: добавление вида узла = ещё одна запись в `$defs` и ещё один эмиттер в `Record<NodeKind, Emitter>` компилятора, без `if/else` ни в схеме, ни в коде.

### 2.2. Узел `llm`

```json
{
  "$id": "https://aqven.local/schemas/ir/1/node-llm.json",
  "allOf": [{ "$ref": "flow-spec.normal.json#/$defs/node_common" }],
  "unevaluatedProperties": false,
  "required": ["kind", "archetype", "prompt", "model_role", "overrides", "allowed_sets", "output_contract", "trust_in"],
  "properties": {
    "kind": { "const": "llm" },
    "archetype": {
      "enum": ["extractor", "classifier", "scorer", "generator", "judge", "aggregator",
               "critic_reviser", "summarizer", "planner", "router", "consensus_extractor"]
    },
    "prompt": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "version", "hash"],
      "properties": {
        "id": { "$ref": "flow-spec.normal.json#/$defs/identifier" },
        "version": { "type": "integer", "minimum": 1 },
        "hash": { "$ref": "flow-spec.normal.json#/$defs/hash" }
      }
    },
    "model_role": { "$ref": "flow-spec.normal.json#/$defs/identifier" },
    "overrides": {
      "type": ["object", "null"],
      "additionalProperties": false,
      "required": ["temperature", "top_p", "seed", "max_output_tokens"],
      "properties": {
        "temperature": { "type": ["number", "null"], "minimum": 0, "maximum": 2 },
        "top_p": { "type": ["number", "null"], "exclusiveMinimum": 0, "maximum": 1 },
        "seed": { "type": ["integer", "null"], "minimum": 0 },
        "max_output_tokens": { "type": ["integer", "null"], "minimum": 1 }
      }
    },
    "allowed_sets": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["type", "from"],
        "properties": {
          "type": { "$ref": "flow-spec.normal.json#/$defs/type_ref" },
          "from": { "$ref": "flow-spec.normal.json#/$defs/ref" }
        }
      }
    },
    "output_contract": {
      "type": "object",
      "additionalProperties": false,
      "required": ["mode", "max_repairs", "on_truncated", "on_refusal"],
      "properties": {
        "mode": { "enum": ["strict", "json", "grammar", "text"] },
        "max_repairs": { "type": "integer", "minimum": 0, "maximum": 3 },
        "on_truncated": { "const": "fail" },
        "on_refusal": { "enum": ["fail", "route"] }
      }
    },
    "trust_in": { "enum": ["trusted", "untrusted"] }
  }
}
```

Что здесь зафиксировано решениями, а не вкусом:
- `prompt` — пин по версии и хешу, а не текст. Текст живёт в реестре промтов; неизменяемость релиза требует хеша (спека §15).
- `mode` — намерение IR, а не профиль провайдера. Профиль схемы — свойство пары (IR-тип × провайдер) и вычисляется компилятором (DECISIONS, опровержение 1). В IR провайдера нет.
- `on_truncated` — `const: "fail"`. Обрезанный ответ чинить запрещено: `jsonrepair` молча фальсифицирует такие ответы (проверено запуском). Схема делает нарушение этого правила невыразимым.
- `allowed_sets` — привязка динамического множества ID к данным прогона (спека §7.1 `allowed_set: dynamic`). Форма выбирается компилятором по мощности множества: ≤ 50 значений — `enum` в схеме, больше — индексный выбор из пронумерованного списка; потолок enum по лимитам OpenAI — порядка 416 значений UUID, а не 1000.
- `overrides` — только параметры сэмплирования. Модель и инструкции переопределить в опциях вызова VoltAgent нельзя (проверено: их нет в `BaseGenerationOptions`), это делает динамическая конфигурация агента, читающая эффективный конфиг из контекста вызова.

### 2.3. Узел `map`

```json
{
  "$id": "https://aqven.local/schemas/ir/1/node-map.json",
  "allOf": [{ "$ref": "flow-spec.normal.json#/$defs/node_common" }],
  "unevaluatedProperties": false,
  "required": ["kind", "over", "item_type", "concurrency", "on_item_error", "max_items", "do"],
  "properties": {
    "kind": { "const": "map" },
    "over": { "$ref": "flow-spec.normal.json#/$defs/binding" },
    "item_type": { "$ref": "flow-spec.normal.json#/$defs/type_ref" },
    "concurrency": {
      "oneOf": [{ "type": "integer", "minimum": 1, "maximum": 256 }, { "const": "all" }]
    },
    "on_item_error": { "enum": ["fail", "skip", "collect"] },
    "max_items": { "type": "integer", "minimum": 1, "maximum": 100000 },
    "do": { "$ref": "flow-spec.normal.json#/$defs/node" }
  }
}
```

`do` — вложенный узел, а не ссылка: тело `map` не адресуется извне и не может быть источником биндинга. Внутри тела доступны `$item` и `$index`.

`on_item_error` и `max_items` обязательны, потому что у `andForEach` в VoltAgent нет ни того, ни другого: компилятор оборачивает элемент в `Result<T, E>` и фильтрует по политике. `concurrency` транслируется один в один. Порядок результатов `andForEach` сохраняет — дополнительной сортировки не генерируем.

### 2.4. Узел `loop`

```json
{
  "$id": "https://aqven.local/schemas/ir/1/node-loop.json",
  "allOf": [{ "$ref": "flow-spec.normal.json#/$defs/node_common" }],
  "unevaluatedProperties": false,
  "required": ["kind", "loop_type", "body", "feedback", "carry", "stop_when",
               "max_iter", "stagnation", "dedup", "select", "score"],
  "properties": {
    "kind": { "const": "loop" },
    "loop_type": { "enum": ["verify_fix", "critique_revise", "retry_with_feedback", "task_completion", "search"] },
    "body": { "$ref": "flow-spec.normal.json#/$defs/node" },
    "feedback": {
      "type": ["object", "null"],
      "additionalProperties": false,
      "required": ["type", "into_slot"],
      "properties": {
        "type": { "$ref": "flow-spec.normal.json#/$defs/type_ref" },
        "into_slot": { "$ref": "flow-spec.normal.json#/$defs/identifier" }
      }
    },
    "carry": {
      "type": "object",
      "additionalProperties": false,
      "required": ["history", "keep"],
      "properties": {
        "history": { "type": "integer", "minimum": 0, "maximum": 5 },
        "keep": { "type": "array", "items": { "$ref": "flow-spec.normal.json#/$defs/identifier" } }
      }
    },
    "stop_when": { "$ref": "flow-spec.normal.json#/$defs/predicate" },
    "max_iter": { "type": "integer", "minimum": 1, "maximum": 50 },
    "stagnation": {
      "type": "object",
      "additionalProperties": false,
      "required": ["window", "min_delta"],
      "properties": {
        "window": { "type": "integer", "minimum": 1, "maximum": 5 },
        "min_delta": { "type": "number", "minimum": 0 }
      }
    },
    "dedup": {
      "type": "object",
      "additionalProperties": false,
      "required": ["enabled", "key"],
      "properties": {
        "enabled": { "type": "boolean" },
        "key": { "oneOf": [{ "$ref": "flow-spec.normal.json#/$defs/ref" }, { "type": "null" }] }
      }
    },
    "select": { "enum": ["last", "best"] },
    "score": { "oneOf": [{ "$ref": "flow-spec.normal.json#/$defs/ref" }, { "type": "null" }] }
  }
}
```

Схема здесь делает обязательным то, что в спеке было правилами R-L1–R-L6 и чего нет в VoltAgent (`andDoWhile`/`andDoUntil` не имеют лимита итераций): `max_iter`, `budget` в `node_common`, `stagnation`, `dedup`, типизированный `feedback` в конкретный слот тела, ограниченный `carry.history`. `select: "best"` без `score` — ошибка компиляции (R-L6), схемой не выражается, проверяется правилом.

`stop_when` — структурный предикат, а не строка `$.score >= 0.8` из спеки. Причина: условие цикла в VoltAgent — это JS-функция, и если бы IR хранил её как код, граф перестал бы быть сериализуемым и инспектируемым. Структурный предикат компилируется в функцию так же, как рёбра компилируются в `andMap`.

### 2.5. Остальные виды узлов (поля сверх `node_common`)

| `kind` | Обязательные поля | Примечание |
|---|---|---|
| `tool` | `tool` (пин), `effect: read\|write\|external`, `idempotency_key: Binding\|null`, `ttl_seconds: integer\|null` | `idempotency_key` обязателен и непустой при `effect ∈ {write, external}`; `load`/`retrieve` из спеки нормализуются сюда с `effect: "read"` |
| `code` | `fn` (пин на чистую функцию), `pure: true` | `pure` — `const: true`; эффекты в `code` запрещены ядром |
| `human` | `form` (TypeRef), `timeout_seconds`, `on_timeout` (`fail\|default\|escalate`), `on_timeout_target: NodeId\|null` | компилируется в `suspend()` + `suspendSchema`/`resumeSchema` на шаге; сам таймаут ведёт наш планировщик на pg-boss |
| `const` | `value` (Binding вида `{const, type}`), `fragment: Pin\|null` | фрагмент по версии — это `Pin`, а не инлайн-текст |
| `seq` | `steps: NodeId[]` | список ссылок на узлы того же уровня |
| `parallel` | `branches: Record<Alias, NodeId>`, `join: all\|any\|quorum\|first_success`, `quorum_k: integer\|null`, `on_branch_error: fail\|skip\|default` | ключи веток обязательны и уникальны: `andAll` сливает результаты в один объект и без явных ключей поля затирают друг друга |
| `switch` | `on: Ref`, `on_type: TypeRef` (enum), `cases: Record<EnumValue, {node: NodeId} \| {value: Binding}>`, `default: NodeId\|null`, `default_reason: string\|null` | полнота enum проверяется компилятором; `default` без `default_reason` — ошибка; все ветки возвращают `out` |
| `race` | `branches: Record<Alias, NodeId>`, `timeout_ms`, `cancel: true` | отмена проигравших — наш `AbortController`, VoltAgent её не делает; учитывается стоимость всех веток, а не победителя |
| `gate` | `waits_for: event\|human`, `timeout_seconds`, `on_timeout` | |
| `try` | `body: NodeId`, `catch: Record<ErrorType, NodeId>`, `finally: NodeId\|null` | ветка `catch` возвращает тот же `out`, что и `body` |
| `call` | `component: Alias` (ключ в `uses` или `components`), `type_args: TypeRef[]`, `params: Record<Alias, NodeId\|Alias>` | компоненты высшего порядка: параметр-компонент передаётся ссылкой на узел или на другой компонент |

`reduce` из спеки §6.2 — сахар: нормализуется в `call` к библиотечному `aggregate` либо в `code` со слотом-списком. Отдельного вида узла в IR нет.

### 2.6. Остальные `$defs` корня

Эти определения ссылаются из корня и живут в том же файле; ниже их поля, чтобы не раздувать листинг §2.1.

| `$def` | Поля | Замечание |
|---|---|---|
| `component` | `in: Record<Slot, TypeRef>`, `out: TypeRef`, `type_params: TypeParam[]`, `params: Record<Alias, ComponentSignature>`, `requires: ContractPredicate[]`, `ensures: ContractPredicate[]`, `nodes: Record<NodeId, Node>`, `order: NodeId[]`, `returns: Binding` | локальный компонент имеет ту же форму, что библиотечный; рекурсия запрещена (§6.0 спеки) |
| `policies` | `visibility`, `trust`, `pii`, `escalation` | значения по умолчанию для узлов; узел переопределяет их полем `policy` (ссылка на именованную политику реестра) |
| `node_defaults` | `retry: Retry \| null`, `timeout_ms: integer \| null` | наследуются узлом, если его собственные поля `null` |
| `meta` | `author`, `created_at`, `note` | вне `spec_hash`; автор правки авторитетен в git-коммите, `meta` — его копия для читателя файла |

Схемы видов узлов лежат отдельными файлами `node-<kind>.json` и подключаются в `$defs/node` по `$ref`: один файл на вид, добавление вида не трогает корень.


## 3. Слоты и привязки

Слот — именованный вход узла с типом. Привязка (`binding`) указывает ровно один источник; двух источников на слот не бывает, «или-или» выражается узлом `switch`, а не слотом.

### 3.1. Грамматика ссылки

```abnf
binding-ref = "$" source *step
source      = "input"
            / "item" / "index" / "acc" / "iter"
            / "run.context." ctx-key
            / node-id ".out"
            / node-id ".in"
ctx-key     = "date" / "time_zone" / "locale" / "tenant_id"
node-id     = LALPHA *62( LALPHA / DIGIT / "_" )
step        = "." field / "[*]" / "[" 1*4DIGIT "]"
field       = LALPHA *62( LALPHA / DIGIT / "_" )
```

Регулярное выражение этой грамматики — `$defs/ref` в §2.1; оно же используется парсером биндингов и семантическим диффом (§7).

| Источник | Что даёт | Где доступен |
|---|---|---|
| `$input` | вход прогона типа `input` | везде |
| `$<node>.out` | выход узла | везде, где `<node>` достижим до текущего по топологии |
| `$<node>.in.<slot>` | уже разрешённое значение слота другого узла | только для провенанса и гейтов, не для данных |
| `$item`, `$index` | элемент и позиция | только внутри `map.do` |
| `$iter`, `$acc` | результат текущей итерации и накопитель | только внутри `loop.body` и `loop.stop_when` |
| `$run.context.*` | дата, часовой пояс, локаль, tenant | только если ключ объявлен в `context` корня |
| `{const, type}` | литерал с явным типом | везде |

Спека §6.4 пишет контекст как `run.context.*` без `$`. Канонизируем на `$run.context.*`: одна лексическая форма для всех источников означает один парсер, один регексп и одно правило подсветки в Studio.

### 3.2. Проекции

Преобразования — только чистые `code`-узлы или четыре встроенные типизированные проекции. Проекции — это список `via`, применяемый слева направо, каждая — тотальная функция типов.

| Проекция | Вход | Выход | Правило |
|---|---|---|---|
| `pick{fields}` | запись `R` | структурная запись из перечисленных полей | все поля обязаны существовать в `R`; результат совместим со слотом, если тот объявлен как view этого типа (спека §7.1 `views`) или структурно совпадает |
| `omit{fields}` | запись `R` | `R` без полей | удаление поля, входящего в ключ идентичности типа (`id`), запрещено |
| `map{select}` | `T[]` | `U[]`, где `U` — тип пути `select` в `T` | `select` — только путь по полям и индексам, без `[*]` |
| `flatten{depth}` | `T[][]` (или `T[][][]` при depth 2) | `T[]` | `depth` ≤ 2; больше — признак ошибки моделирования, пишется `code` |

`[*]` в самой ссылке — это подъём (lifting), а не проекция: `$score_hotels.out[*].score` над `HotelScore[]` даёт `Number[]`. Два `[*]` подряд запрещены — вложенность снимается явным `flatten`, чтобы «случайное» схлопывание не проходило типизацию молча.

### 3.3. Правила типизации

1. Тип слота объявлен в реестре типов; тип привязки выводится из источника и цепочки `via`. Совместимость — номинальная по имени типа, кроме проекций `pick`/`omit`, которые дают структурный тип и проверяются структурно.
2. `T?` совместим с `T` только через явный узел (`code` или `switch` по `is_null`). Автоматического разыменования null нет.
3. `T[]` не совместим с `T`: коллекцию сужает `map`-узел, `[0]` или библиотечный компонент.
4. Литерал `{const, type}` проверяется против объявленного `type` схемой типа при компиляции, а не в рантайме.
5. `$run.context.*` имеет фиксированные типы: `date → Date`, `time_zone → TimeZone`, `locale → Locale`, `tenant_id → TenantId`.
6. Метка доверия наследуется по цепочке: если источник `untrusted`, результат любой проекции `untrusted`. Слот с `trust_in: "trusted"` не принимает `untrusted`-значение — только через узел-экстрактор с типизированным enum-выходом (принцип CaMeL, спека §6.5).
7. Метка `pii` наследуется так же и дополнительно ограничивает `model_role` узла-получателя allowlist-провайдерами.
8. Ссылка на узел, недостижимый по топологии (цикл или обратное ребро вне `loop`), — ошибка компиляции: IR описывает DAG, единственный источник повторов — `loop`.
9. Ссылка `$<node>.out` на узел внутри чужого `map.do`, `loop.body` или `try.catch` запрещена: тела не адресуются извне, наружу выходит только результат самого комбинатора.

### 3.4. Почему рёбра — данные, а не код

Биндинги компилируются в декларативные мапперы VoltAgent `andMap({ id, map })` с источниками `value | data | input | context | step | fn`, а доступ к чужим выходам — в `getStepData(stepId)` / `getStepResult<T>(stepId)`. Аварийный люк `source: "fn"` компилятор не использует: любое ребро, выразимое в грамматике §3.1, обязано остаться сериализуемым, иначе теряются дифф, провенанс и экспорт.

## 4. Идентичность и версионирование

### 4.1. Идентичность узла

| Правило | Формулировка |
|---|---|
| Форма | `^[a-z][a-z0-9_]{0,62}$`, ключ в `nodes` |
| Уникальность | в пределах одного уровня документа; тела `map.do`, `loop.body` и ветки компонентов живут в своём пространстве имён |
| Стабильность | `id` не меняется при правке тела; переименование — отдельная операция `flow_rename`, переписывающая все биндинги и двигающая оба файла (узел и его промт) атомарно |
| Переиспользование | удалённый `id` не переиспользуется внутри одной линии версий: иначе lineage прогонов и кассеты ссылаются на чужой узел |
| Развёрнутый вид | `id` узла, полученного раскрытием компонента, — `<call_id>__<inner_id>`; разделитель `__` допустим правилом ключей и однозначно обратим |

Тело узла (`Node`) не содержит собственного `id`: идентичность — ключ записи, а ключ записи — имя файла (§1.5). Это делает сравнение тел при детекте переименования тривиальным (сравниваем значения, не вычищая поле) и исключает рассинхрон «ключ ≠ поле id».

Цена — переименование меняет идентификатор, а прогоны и кассеты ссылаются на старый. Закрывается append-only журналом `renames: [{kind, from, to, at}]` в `project.yaml`: резолверы lineage (`run_lineage`, ключи кассет, `ir_diff`) обязаны идти по журналу от старого пути к текущему, и тот же журнал запрещает переиспользовать освободившееся имя.

### 4.2. Хеш: канонизация плюс доменная сепарация

```ts
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils";
import canonicalize from "canonicalize";

export type Domain =
  | "aqven/flow-spec/v1"
  | "aqven/node-body/v1"
  | "aqven/node-behavior/v1"
  | "aqven/component/v1"
  | "aqven/prompt/v1"
  | "aqven/expansion/v1"
  | "aqven/release/v1";

const SEPARATOR = new Uint8Array([0x00]);

export const hashOf = (domain: Domain, value: unknown): Hash => {
  const canonical = canonicalize(value);
  if (canonical === undefined) throw new IrHashError(domain, "value is not canonicalizable");
  const digest = sha256(concatBytes(utf8ToBytes(domain), SEPARATOR, utf8ToBytes(canonical)));
  return `sha256-${bytesToHex(digest)}` as Hash;
};
```

Доменная сепарация обязательна: без префикса хеш тела узла и хеш одноимённого фрагмента промта совпали бы при равном содержимом, и подмена одного другим не была бы видна. `canonicalize` возвращает `undefined` для неканонизируемых значений (`undefined`, циклы) — это не «пустая строка», а отказ, поэтому проверка явная, а не `?? ""`.

### 4.3. Пять хешей и их назначение

| Хеш | Домен | Что подаётся на вход | Для чего |
|---|---|---|---|
| `spec_hash` | `aqven/flow-spec/v1` | весь документ без `meta` | идентичность версии спеки, `manifest.specVersions[]`, сравнение «та же ли это версия» |
| `behavior_hash` узла | `aqven/node-behavior/v1` | тело узла без `description`, плюс пины промта, профиля модели и компонента | ключ инвалидации replay-кэша и кассет |
| `body_hash` узла | `aqven/node-body/v1` | тело узла целиком | детект переименования (§7): удалён `a`, добавлен `b`, `body_hash` равны и окрестности совпадают |
| `release_hash` | `aqven/release/v1` | `{spec_hash, prompt_pins, model_profile_pins, component_lock, env_overlay_hash}` | неизменяемость выпуска (спека §15), lineage на выходах прогона |
| `blob_sha256` | домена нет | байты файла как есть | CAS записи (`expects[{path, file_hash}]`), сильный ETag, сверка индекса с деревом |

`blob_sha256` не заменяет `spec_hash` и не сравнивается с ним: он считается по байтам без доменной сепарации и меняется от любого форматирования, поэтому отвечает только на «тот ли это файл, что я читал». Идентичность версии — по-прежнему `spec_hash`.

### 4.4. Что входит в `spec_hash`, а что нет

| Входит | Не входит |
|---|---|
| `ir_version`, `flow`, `version`, `input`, `output`, `returns` | `meta` (автор, время, комментарий к правке) |
| `context`, `budget`, `policies`, `defaults` | раскладка канваса: в документе её нет вовсе, она живёт в базе отдельным каналом |
| `nodes` целиком, включая `description` | развёрнутый вид (производный, §5) |
| `order` | кэш компиляции, план исполнения, сгенерированный TS |
| `components`, `uses` с версиями и хешами | статистика прогонов, результаты evals |

`description` входит в `spec_hash`, потому что описания попадают в промт автоматически (спека §7.1) — это поведение, а не оформление. При этом `description` не входит в `behavior_hash` узла, если промт узла его не использует: тогда правка описания меняет версию спеки, но не сбрасывает replay-кэш. Класс правки определяет §7: `COSMETIC` не инвалидирует кэш, `BEHAVIORAL` инвалидирует узел и всё ниже по течению, `STRUCTURAL` — весь план.

### 4.5. Нумерация версий

- `version` — целое, монотонно растёт внутри `flow`; транзакционного счётчика `max(version) + 1` в базе нет: номер лежит полем в `flow.yaml`, база держит только проекцию, а коллизию ловит валидатор записи.
- Версий в именах файлов рабочего дерева нет (`flow.yaml`, не `flow@7.yaml`): суффикс `@version` появляется только в экспортном бандле, где снимок неизменяем ([18. Экспорт](18-export-and-conformance.md) §2).
- `version` не несёт семантики semver: совместимость входа-выхода выражается типами `input`/`output` и проверяется компилятором при публикации.
- Две версии с одинаковым `spec_hash` невозможны по построению: `version` входит в хеш. Проверка «изменилось ли что-то по существу» — это сравнение `spec_hash` документов с обнулённым `version`, отдельная функция `contentHashOf(spec)`.

## 5. Модульный и развёрнутый вид

Один воркфлоу существует в двух формах. Модульная — то, что пишут и версионируют. Развёрнутая — то, что компилируется, исполняется, рисуется на канвасе и сравнивается в конформанс-тестах.

### 5.1. Механика раскрытия

```mermaid
flowchart LR
  subgraph MOD["Модульный вид"]
    call["pick<br/>kind: call<br/>component: judge_panel<br/>type_args: [Pitch]<br/>params: judges=[j_a, j_b], aggregate=agg<br/>in: candidate=$pitches.out, rubric=const"]
  end

  subgraph BODY["Тело компонента judge_panel@3"]
    b1["verdicts: map over $judges"]
    b2["spread: code verdict_spread"]
    b3["result: switch on $spread.level"]
    b1 --> b2 --> b3
  end

  subgraph EXP["Развёрнутый вид"]
    e1["pick__verdicts<br/>kind: map<br/>over: {const judges}<br/>do: call -> j_a | j_b"]
    e2["pick__spread<br/>kind: code<br/>in: verdicts=$pick__verdicts.out"]
    e3["pick__result<br/>kind: switch<br/>on: $pick__spread.out.level"]
    e1 --> e2 --> e3
  end

  call -- "1: резолв пина uses.judge_panel по version+hash" --> BODY
  BODY -- "2: подстановка type_args вместо C" --> EXP
  call -- "3: подстановка in-слотов вместо $in.*" --> EXP
  call -- "4: подстановка params вместо $judges, $aggregate" --> EXP
  BODY -- "5: префикс id: <call_id>__<inner_id>" --> EXP
  call -- "6: requires -> проверки компилятора на месте вызова" --> EXP
```

Шаги раскрытия выполняются строго в этом порядке и все — чистые функции документа:

| Шаг | Что делает | Отказ |
|---|---|---|
| 1. Резолв | находит тело компонента по `uses[alias]` (`version` + `hash`) или в локальном `components` | пин не найден или хеш не совпал — импорт отклонён |
| 2. Типы | подставляет `type_args` вместо параметров типа (`C` → `Pitch`) | арность `type_args` не совпала — ошибка компиляции |
| 3. Слоты | заменяет `$in.<slot>` внутри тела на биндинг с места вызова | несовместимость типов слота |
| 4. Параметры | заменяет `$<param>` на узел-аргумент (компоненты высшего порядка) | параметр не передан или не того вида |
| 5. Идентичность | префиксует все внутренние `id` на `<call_id>__` и переписывает внутренние биндинги | коллизия id — невозможна по построению префикса |
| 6. Контракты | превращает `requires` в проверки компилятора на месте вызова, `ensures` — в проверки после узла | предикат ложен — ошибка компиляции или рантайм-`ContractViolation` |

Рекурсии компонентов нет (рамки ядра §6.0), поэтому раскрытие завершается за конечное число шагов, и глубина вложенности — статическое свойство документа.

### 5.2. Зачем хранить оба

| Вид | Источник истины для | Кто читает |
|---|---|---|
| Модульный | редактирования, диффа, версионирования, библиотеки компонентов | Claude через MCP, Studio, ревью, git-дифф бандла |
| Развёрнутый | компиляции в VoltAgent, плана исполнения, канваса «до примитивов», конформанс-кейсов, codegen | компилятор, рантайм, экспорт, эталонный интерпретатор |

Причины хранить оба, а не пересчитывать один из другого на лету:
1. **Дифф на модульном виде честнее.** Смена версии одного библиотечного компонента раскрывается в десятки изменённых узлов; в модульном виде это одна строка `uses.judge_panel.version: 3 → 4`, а развёрнутый вид показывает последствия.
2. **Развёрнутый вид — то, что реально исполнялось.** Прогон ссылается на `expansion_hash`, поэтому воспроизведение через год не зависит от того, что сегодня лежит в библиотеке.
3. **Канвас обязан показывать примитивы** (спека §6.0: «любой компонент раскрывается на канвасе до примитивов»), а раскрытие на каждый рендер — лишняя работа и лишний источник расхождений.

Развёрнутый вид — кэш, а не документ: ключ `expansion_hash = hashOf('aqven/expansion/v1', { spec_hash, component_lock })`, запись в БД перестраиваемая, руками не редактируется, в рабочем дереве не лежит (`.aqven/cache/`, в `.gitignore`: иначе на одну сущность в диффе приходится два файла), в бандл кладётся рядом с модульным (`flows/<flowId>@<version>.yaml` и `expanded/<flowId>@<version>.json`), потому что чужой фреймворк при миграции читает именно развёрнутый вид.

## 6. Сериализация: YAML-файл — истина, JSONB — индекс

### 6.1. Разделение ролей

| Носитель | Роль | Ограничения |
|---|---|---|
| `flows/**/*.yaml` в рабочем дереве | **источник истины**: авторский текст и есть документ | только канонический вывод §6.2; идентичность — путь, а не поле внутри файла |
| `app.flow_specs.doc` (JSONB) | проекция, перестраиваемая индексатором из файлов | `jsonb` не хранит порядок ключей (сортирует по длине, затем побайтово) и схлопывает дубликаты — «исходный YAML как есть» туда класть нельзя |
| `flows/<flowId>@<version>.yaml` в бандле | снимок опубликованной версии | копия файла рабочего дерева байт-в-байт, версия в имени ([18. Экспорт](18-export-and-conformance.md) §2) |
| `manifest.json`, `conformance/*.json` | хеши и кейсы | строго JSON: хеши считаются по JSON, не по YAML |

Направление `YAML → JS → ajv + zod → JSONB` — это валидация и индексация на входе, оно остаётся единственным путём в базу. Обратное `JSONB → YAML` осталось только генерацией: импорт бандла, codegen, миграция. Авторский файл из базы не восстанавливают, потому что он в базу не терялся: отдельной колонки под исходный текст больше нет.

### 6.2. Опции канонического YAML (проверено: второй и третий проход дают идентичные байты)

```ts
import * as YAML from "yaml";

export const YAML_CANON: YAML.ToStringOptions & YAML.DocumentOptions & YAML.SchemaOptions = {
  version: "1.2",
  indent: 2,
  indentSeq: false,
  lineWidth: 0,
  minContentWidth: 0,
  defaultStringType: "QUOTE_DOUBLE",
  defaultKeyType: "PLAIN",
  doubleQuotedAsJSON: true,
  singleQuote: false,
  blockQuote: false,
  collectionStyle: "block",
  flowCollectionPadding: false,
  nullStr: "null",
  simpleKeys: true,
  sortMapEntries: true,
  directives: false,
};

export const toTransportYaml = (spec: NormalizedFlowSpec): string => YAML.stringify(spec, YAML_CANON);
```

Каждая опция закрывает конкретный способ сломать байтовое равенство: `lineWidth: 0` убирает зависимость от ширины терминала, `blockQuote: false` запрещает `|` и `>` (многострочные строки едут как `"a\nb"`), `collectionStyle: "block"` запрещает flow-коллекции, `doubleQuotedAsJSON: true` выравнивает экранирование с JCS, `version: "1.2"` закрывает norway-bug (в 1.1 `yes`/`on` становятся `true`).

Канонизация применяется **при записи** — агентом, Studio и `aqven fmt`, — а не при чтении. Канонизация при открытии означала бы, что `git status` пачкается после каждого просмотра файла, а рабочее дерево перестаёт совпадать с тем, что человек закоммитил.

### 6.3. Запреты, каждый из которых проверен пробой

| Запрет | Что ломается без него | Как ловим |
|---|---|---|
| Ключи вне `[a-z][a-z0-9_]*` | `sortMapEntries` сортирует через `Array.prototype.sort`, что совпадает с порядком JCS только на ASCII | `propertyNames` в JSON Schema |
| Якоря и merge-ключи (`&base`, `<<: *base`) | `parse → stringify` разворачивает merge и теряет якорь: экспорт вернёт развёрнутую версию, байты не совпадут | линтер импорта по AST `YAML.parseDocument` |
| Комментарии | не переживают `parse → stringify` | линтер импорта; замена — поле `description` |
| Блочные скаляры и flow-коллекции | нормализуются в другую форму | `YAML_CANON` + линтер |
| Числа с ведущими и хвостовыми нулями (`0.40`, `012`) | `0.40 → 0.4`, `012 → 12` (число!) | деньги — целые `usd_micros`; остальные числа проходят JCS-нормализацию на импорте |
| `NaN`, `Infinity`, `.inf` | JCS их не выражает, `yaml@2.9` в core-схеме парсит `.inf` в `null` | ajv (`type: number` + границы) |
| Сырой YAML в `jsonb` в надежде на те же байты | порядок ключей в `jsonb` не сохраняется | правило хранения §6.1 |

### 6.4. Процедура round-trip (kill-критерий 13, гоняется в CI)

```
export(projectId)   -> bundleA
import(bundleA)     -> projectId2      (ajv draft 2020-12 + zod, полная валидация)
export(projectId2)  -> bundleB
assert sha256(bundleA) === sha256(bundleB)
assert merkleRoot(bundleA) === merkleRoot(bundleB)
```

Сильнее этого — фикспойнт рабочего дерева: он проверяет носитель истины, а не производный снимок.

```
write(spec)  -> treeA        (канонизация на записи)
read(treeA)  -> spec2        (парсинг всего дерева проекта)
write(spec2) -> treeB
assert bytes(treeA[path]) === bytes(treeB[path]) для каждого пути
```

Kill 13 на бандле остаётся, но после перехода на файлы он слабее: каталоги определений в бандл копируются, поэтому их байтовое равенство тривиально, и вес теста смещается на импорт ([18. Экспорт](18-export-and-conformance.md) §8).

Merkle-корень сравнивается не вместо байтов, а вместе с ними: байтовое равенство отвечает «совпало ли», пофайловые листы отвечают «где именно разошлось». Плюс property-тест на `fast-check`: генерим случайный валидный IR, гоняем `export → import → export` три раза и требуем фикспойнта со второго прохода — первый проход имеет право нормализовать авторский ввод (§1.3).

### 6.5. Порядок ключей: где сортируем, а где нет

Канонизация JCS и `sortMapEntries` сортируют ключи объектов — это относится к документу IR. Порядок полей **типа**, который важен для структурированного вывода (сначала обоснование, потом оценка), сортировкой не затрагивается, потому что поля типа объявлены массивом `fields: [...]`, а массивы JCS не переупорядочивает. Это и есть техническая причина правила §1.4.2.

## 7. Семантический дифф IR

Текстовый дифф YAML и позиционный дифф массивов на IR дают мусор: на живой пробе (перестановка двух узлов + две правки полей + вставка узла) `microdiff` выдал 11 операций, `rfc6902` — 12, `jsondiffpatch` без `objectHash` — 60+ строк, в которых узлы «превращаются» друг в друга (`kind: ["map","code"]`). Человек видит «изменились 4 узла», хотя изменились два поля и один узел переехал.

### 7.1. Конфигурация движка

```ts
import * as jsondiffpatch from "jsondiffpatch";

export const irDiffer = jsondiffpatch.create({
  objectHash: (value: unknown) =>
    typeof value === "object" && value !== null && "id" in value ? String((value as { id: unknown }).id) : undefined,
  arrays: { detectMove: true, includeValueOnMove: false },
  textDiff: { minLength: Number.MAX_SAFE_INTEGER },
});
```

`textDiff` выключен порогом: по умолчанию `jsondiffpatch` включает diff-match-patch для строк длиннее 60 символов и выдаёт **не JSON-совместимую** дельту — для промтов и `description` это яд в персистентном слое. Отдельный инстанс с `textDiff` допустим только для UI и никогда не смешивается с тем, что пишется в БД.

`objectHash` нужен для массивов внутри узлов (`cases`, `steps`, `allowed_sets`). Сами `nodes` диффятся как `Record<NodeId, Node>`, где ложные `move` не возникают в принципе.

### 7.2. Алгоритм

```
diffSpecs(a, b):
  ga, gb   = toGraphForm(a), toGraphForm(b)
  renames  = detectRenames(ga, gb)
  gb       = applyRenames(gb, renames)
  nodes    = irDiffer.diff(ga.nodes, gb.nodes)
  edges    = setDiff(ga.edges, gb.edges)
  bindings = classifyBindings(ga, gb)
  order    = irDiffer.diff(ga.order, gb.order)
  impact   = propagateDownstream(nodes, edges, bindings)
  wire     = rfc6902.createPatch(a, b)
  return { renames, nodes, edges, bindings, order, impact, wire }
```

`toGraphForm` раскладывает документ на три независимые вещи: `Record<NodeId, Node>`, множество рёбер `{from_node, from_path, to_node, to_slot}` и массив `order`. Рёбра диффятся как множество (add/remove), а не как список, иначе перестановка слотов читается как замена рёбер. `order` диффится отдельно, чтобы «переехал в графе» не путалось с «переставили в YAML».

### 7.3. Детект переименования

Библиотека этого не умеет: смена `id` для неё — удаление плюс добавление. Эвристика:

```
detectRenames(ga, gb):
  removed = ga.ids - gb.ids
  added   = gb.ids - ga.ids
  for a_id in removed:
    candidates = [b_id for b_id in added
                  if hashOf('aqven/node-body/v1', ga.nodes[a_id]) === hashOf('aqven/node-body/v1', gb.nodes[b_id])
                  and sameNeighbourhood(ga, a_id, gb, b_id)]
    if candidates.length !== 1: continue
    yield { from: a_id, to: candidates[0] }
```

`sameNeighbourhood` сравнивает множества входящих и исходящих рёбер по позиции (слот и путь), а не по именам узлов на другом конце. Однозначного кандидата нет — переименование не заявляется, показываем честные delete + add. Дифф предлагает автопочинку биндингов одной операцией.

### 7.4. Классификация правок биндингов

Биндинг — это `{from, via}`, поэтому изменения классифицируются структурно, а не как «строка изменилась»:

| Класс | Что произошло | Риск |
|---|---|---|
| `REBIND` | сменился `from.source` при том же пути (`$score.out.price → $rescore.out.price`) | смена источника: типы могут не сойтись, провенанс и уровень доверия меняются |
| `RESLICE` | сменился путь или `via` при том же источнике (`$score.out.price → $score.out.cost`) | требует перепроверки схемы слота |
| `RETARGET` | сменился слот-получатель | переезд значения в другой вход того же узла |
| `UNCHANGED` | нормализованные формы совпали | — |

### 7.5. Классы влияния и что они инвалидируют

| Класс | Примеры | Последствие |
|---|---|---|
| `COSMETIC` | `description`, `order` | новая версия спеки, кэш реплея и кассеты живы |
| `BEHAVIORAL` | промт, `model_role`, `overrides`, `output_contract`, `max_iter` | инвалидирует `behavior_hash` узла и всех узлов ниже по течению |
| `STRUCTURAL` | добавление или удаление узла, изменение рёбер, `REBIND` | инвалидирует план исполнения целиком, прогоны несравнимы напрямую |

`propagateDownstream` идёт по рёбрам развёрнутого вида, а не модульного: правка внутри компонента обязана гасить кэш у всех мест его вызова.

### 7.6. Форматы на выходе

| Потребитель | Формат | Почему |
|---|---|---|
| MCP `flow_patch` | `rfc6902` JSON Patch + `expects[{path, file_hash}]` | стандарт, применяется любым клиентом; разрешение конфликтов server-authoritative, отказ — `STALE_FILE` |
| Хранение версии как дельты и откат | дельта `jsondiffpatch` | `patch(a, d) === b` и `unpatch(b, d) === a` — обратимость проверена на пробе |
| Studio и ревью | наш конверт `{renames, nodes, edges, bindings, order, impact}` | показывает механику правки, а не список изменённых строк |
| Гейты выпуска | `impact` | по нему решается, какие evals обязаны перезапуститься |

## 8. Пример: `hotel_pitch` в нашем формате

Ниже — нормализованный модульный вид спеки §6.6. Ключи показаны в логическом порядке для чтения; канонический транспортный YAML отличается от этого текста только сортировкой ключей и двойными кавычками (§6.2), содержание идентично. Хеши сокращены многоточием, в документе они полные (64 hex-символа).

```yaml
ir_version: 1
flow: hotel_pitch
version: 7
input: TourRequest
output: PitchText
returns: { from: $render.out, via: [] }
context: [date, locale]
budget: { usd_micros: 400000, seconds: 120, tokens: null }

uses:
  hotels_by_filters: { kind: tool, library: db, name: hotels_by_filters, version: 3, hash: "sha256-9f2c…" }
  pick_top_k: { kind: code, library: std, name: pick_top_k, version: 2, hash: "sha256-41ab…" }
  render_pitch: { kind: code, library: proj, name: render_pitch, version: 5, hash: "sha256-77de…" }
  diverge: { kind: component, library: std, name: diverge, version: 4, hash: "sha256-0c13…" }
  judge: { kind: component, library: std, name: judge, version: 6, hash: "sha256-b8a0…" }
  critic_loop: { kind: component, library: std, name: critic_loop, version: 3, hash: "sha256-5e61…" }
  small_fast: { kind: model_profile, library: proj, name: small_fast, version: 11, hash: "sha256-1d94…" }
  writer: { kind: model_profile, library: proj, name: writer, version: 9, hash: "sha256-ac35…" }
  judge_strong: { kind: model_profile, library: proj, name: judge_strong, version: 7, hash: "sha256-6b02…" }

policies:
  visibility: { diverge_branches: isolated, judge_sees_provenance: false }
  trust: { default_in: trusted }
  pii: { mask_in_traces: true, allowlist_profile: pii_safe }
  escalation: { role: manager }

defaults:
  retry: { attempts: 2, backoff: exponential, base_delay_ms: 500, jitter: full,
           retry_on: [timeout, rate_limit, server_error] }
  timeout_ms: 60000

components:
  pitch_gen:
    in: { hotels: "Hotel[]", request: TourRequest }
    out: Pitch
    type_params: []
    params: {}
    requires: []
    ensures: []
    returns: { from: $gen.out, via: [] }
    nodes:
      gen:
        kind: llm
        description: Генерация питча по трём отелям
        archetype: generator
        prompt: { id: pitch_gen, version: 2, hash: "sha256-3f7c…" }
        model_role: writer
        overrides: { temperature: null, top_p: null, seed: null, max_output_tokens: 1200 }
        allowed_sets:
          - { type: FeatureId, from: $in.hotels[*].features[*].id }
        output_contract: { mode: strict, max_repairs: 1, on_truncated: fail, on_refusal: fail }
        trust_in: trusted
        in:
          hotels: { from: $in.hotels, via: [] }
          request: { from: $in.request, via: [] }
        out: Pitch
        policy: null
        budget: null
        retry: null
        timeout_ms: null
    order: [gen]

nodes:
  load_hotels:
    kind: tool
    description: Отели по фильтрам заявки
    tool: hotels_by_filters
    effect: read
    idempotency_key: null
    ttl_seconds: 3600
    in:
      filters: { from: $input.filters, via: [] }
    out: "Hotel[]"
    policy: null
    budget: null
    retry: null
    timeout_ms: 10000

  score_hotels:
    kind: map
    description: Оценка каждого отеля под заявку
    over: { from: $load_hotels.out, via: [] }
    item_type: Hotel
    concurrency: 8
    on_item_error: skip
    max_items: 200
    do:
      kind: llm
      description: null
      archetype: scorer
      prompt: { id: score_hotel, version: 4, hash: "sha256-d21e…" }
      model_role: small_fast
      overrides: { temperature: null, top_p: null, seed: 7, max_output_tokens: 400 }
      allowed_sets: []
      output_contract: { mode: strict, max_repairs: 1, on_truncated: fail, on_refusal: fail }
      trust_in: trusted
      in:
        hotel: { from: $item, via: [] }
        request: { from: $input, via: [] }
      out: HotelScore
      policy: null
      budget: null
      retry: null
      timeout_ms: null
    in: {}
    out: "HotelScore[]"
    policy: null
    budget: { usd_micros: 80000, seconds: null, tokens: null }
    retry: null
    timeout_ms: null

  top3:
    kind: code
    description: Топ-3 отеля по оценкам
    fn: pick_top_k
    pure: true
    in:
      scores: { from: $score_hotels.out, via: [] }
      hotels: { from: $load_hotels.out, via: [] }
      k: { const: 3, type: Int }
    out: "Hotel[]"
    policy: null
    budget: null
    retry: null
    timeout_ms: 5000

  pitches:
    kind: call
    description: Три независимых питча с разной температурой
    component: diverge
    type_args: [Pitch]
    params: { body: pitch_gen }
    in:
      hotels: { from: $top3.out, via: [] }
      request: { from: $input, via: [] }
      n: { const: 3, type: Int }
      vary: { const: { temperature: [0.4, 0.8, 1.1] }, type: VaryPlan }
    out: "Pitch[]"
    policy: null
    budget: null
    retry: null
    timeout_ms: null

  pick:
    kind: call
    description: Попарное сравнение питчей с перестановкой позиций
    component: judge
    type_args: [Pitch]
    params: {}
    in:
      candidates: { from: $pitches.out, via: [] }
      request: { from: $input, via: [] }
      mode: { const: pairwise, type: JudgeMode }
      swap_positions: { const: true, type: Bool }
      model_role: { const: judge_strong, type: ModelRole }
    out: PitchVerdict
    policy: null
    budget: null
    retry: null
    timeout_ms: null

  final_pitch:
    kind: switch
    description: Решение судьи
    on: $pick.out.decision
    on_type: PitchDecision
    cases:
      accept: { value: { from: $pick.out.best, via: [] } }
      revise: { node: fix }
      escalate: { node: review }
    default: null
    default_reason: null
    in: {}
    out: Pitch
    policy: null
    budget: null
    retry: null
    timeout_ms: null

  fix:
    kind: call
    description: Критика и правка до порога оценки
    component: critic_loop
    type_args: [Pitch]
    params: {}
    in:
      pitch: { from: $pick.out.best, via: [] }
      request: { from: $input, via: [] }
      max_iter: { const: 2, type: Int }
      threshold: { const: 0.8, type: Score }
      select: { const: best, type: LoopSelect }
      model_role: { const: writer, type: ModelRole }
    out: Pitch
    policy: null
    budget: { usd_micros: 100000, seconds: null, tokens: null }
    retry: null
    timeout_ms: null

  review:
    kind: human
    description: Ручной разбор конфликта фактов
    form: PitchReviewForm
    timeout_seconds: 86400
    on_timeout: escalate
    on_timeout_target: null
    in:
      pitch: { from: $pick.out.best, via: [] }
      verdict: { from: $pick.out, via: [] }
    out: Pitch
    policy: null
    budget: null
    retry: null
    timeout_ms: null

  render:
    kind: code
    description: Подстановка фактов отелей по FeatureId
    fn: render_pitch
    pure: true
    in:
      pitch: { from: $final_pitch.out, via: [] }
      hotels: { from: $load_hotels.out, via: [] }
    out: PitchText
    policy: null
    budget: null
    retry: null
    timeout_ms: 5000

order: [load_hotels, score_hotels, top3, pitches, pick, final_pitch, fix, review, render]
meta: { author: null, created_at: null, note: null }
```

Узел `fix` в развёрнутом виде — это узел `loop` из §2.4, где конфигурация с места вызова уже подставлена, а `stop_when` собран из `threshold`:

```yaml
fix__iterate:
  kind: loop
  description: Критика и правка до порога оценки
  loop_type: critique_revise
  body:
    kind: call
    description: null
    component: fix__revise_once
    type_args: []
    params: {}
    in:
      pitch: { from: $acc.pitch, via: [] }
      request: { from: $in.request, via: [] }
    out: Revision
    policy: null
    budget: null
    retry: null
    timeout_ms: null
  feedback: { type: "Issue[]", into_slot: issues }
  carry: { history: 2, keep: [best] }
  stop_when:
    op: gte
    left: { from: $iter.out.score, via: [] }
    right: { const: 0.8, type: Score }
  max_iter: 2
  stagnation: { window: 2, min_delta: 0 }
  dedup: { enabled: true, key: $iter.out.pitch }
  select: best
  score: $iter.out.score
  in:
    pitch: { from: $pick.out.best, via: [] }
    request: { from: $input, via: [] }
  out: Pitch
  policy: null
  budget: { usd_micros: 100000, seconds: null, tokens: null }
  retry: null
  timeout_ms: null
```

### 8.1. Что изменилось против спеки §6.6 и почему

| Было в спеке | Стало в IR | Почему |
|---|---|---|
| `budget: { usd: 0.40, seconds: 120 }` | `usd_micros: 400000` | YAML нормализует `0.40 → 0.4`; деньги во float дают расхождение округления между экспортом и БД (§1.4.3) |
| `context: [run.date, run.locale]`, ссылки `run.context.*` | `context: [date, locale]`, ссылки `$run.context.date` | закрытый словарь контекстных ключей проверяем компилятором; одна лексическая форма ссылки — один парсер (§3.1) |
| `kind: load`, `ttl: 1h` | `kind: tool`, `effect: read`, `ttl_seconds: 3600` | `load` — сахар над `tool` (спека §6.1); `1h` в YAML 1.2 — строка, длительности храним целыми секундами |
| `in: { filters: $input.filters }` | `in: { filters: { from: $input.filters, via: [] } }` | проекции стали данными, а не суффиксом строки: дифф классифицирует `REBIND` и `RESLICE` структурно (§7.4) |
| `kind: diverge / judge / critic_loop` | `kind: call` на запиненные компоненты `std/*` | это компоненты библиотеки, а не встроенные конструкции (спека §6.0); пин по версии и хешу делает выпуск воспроизводимым |
| Конфигурация компонента полями узла (`n`, `vary`, `mode`, `swap_positions`, `max_iter`, `select`) | слоты входного типа компонента с константными биндингами | у компонента одна форма вызова: данные и настройки — типизированные слоты, в `params` идут только параметры-компоненты |
| `do:` внутри `diverge` | локальный компонент `pitch_gen` в `components` | тело параметра-компонента адресуется через `$in.*`; висящий узел в `nodes` с несвязанными слотами невыразим |
| `stop_when: $.score >= 0.8` | структурный предикат `{op: gte, left, right}` | условие цикла компилируется в функцию, но в IR остаётся данными, иначе граф перестаёт быть сериализуемым и инспектируемым (§2.4) |
| `switch` без объявления enum | `on_type: PitchDecision`, `default: null`, `default_reason: null` | полнота enum проверяется статически, `default` без обоснования запрещён (спека §6.2) |
| `map` без ограничений | `item_type`, `max_items`, `on_item_error` | у `andForEach` в VoltAgent нет ни лимита коллекции, ни политики ошибки элемента |
| Результат прогона подразумевался последним узлом | `output` + `returns` | неявный результат нельзя типизировать и нельзя сравнить в конформанс-кейсе |
| `archetype: generator` без промта | `prompt: { id, version, hash }` | спека §15: спека и скомпилированные промты фиксируются вместе |
| Комментарий `# ссылается на FeatureId из allowed_set этих отелей` | поле `allowed_sets: [{type: FeatureId, from: …}]` | комментарии не переживают round-trip; ограничение стало данными и попадает в схему вызова |
| Комментарий `# все ветки обязаны вернуть Pitch` | правило компилятора над `switch.out` | инвариант ядра не хранится в тексте |
| `on_timeout: escalate_to_manager` | `on_timeout: escalate` + `policies.escalation.role: manager` | адресат эскалации — не узел графа; иначе в графе появляется ребро в никуда |
| — | `order`, `uses`, `policies`, `defaults`, `meta` | версия неизменяема только если всё, от чего зависит поведение, запинено внутри документа; `meta` вынесен из `spec_hash` (§4.4) |

## 9. Открытые вопросы

1. **Верхняя граница `max_iter` = 50 в схеме — инженерный предохранитель, а не продуктовое решение.** Что сделать: замерить реальные циклы на первых трёх воркфлоу и закрепить порог в правилах компилятора (R-L1) вместе с обязательным бюджетом.
2. **Схема `policies` и `defaults` задана здесь по месту.** Спека §6.5 перечисляет виды политик (видимость, доверие, PII, бюджеты), но не их форму. Что сделать: свести форму с документом о реестрах и перенести `$defs/policies` туда, оставив в IR ссылку.
3. **Авторская строковая форма предиката (`$.score >= 0.8`) против структурной.** Нужен ли парсер строк в authoring-схеме, или Claude сразу пишет структурный предикат. Что сделать: прототип MCP-тула `flow_patch` на узле `fix` и замер, сколько попыток уходит на обе формы.
4. **`views` типов (спека §7.1) и проекции `pick`/`omit`.** Считается ли `pick{[name, beach_entry]}` тем же, что объявленный view `brief`, и требуем ли мы именованный view на границе узла. Что сделать: решить в реестре типов, зафиксировать правило совместимости в §3.3.1.
5. **Где принимается решение о форме динамического allowed-set.** Порог (≤ 50 значений — `enum`, выше — индексный выбор, потолок порядка 416 UUID) зависит от мощности множества в рантайме, которая неизвестна при компиляции. Что сделать: описать в документе о компиляции схем, кто и когда выбирает форму, и нужен ли IR-флаг, фиксирующий выбор принудительно.
6. **Хеши библиотечных сущностей в `uses`.** Домены `aqven/component/v1` и `aqven/prompt/v1` объявлены здесь, но вычисляются в реестрах. Что сделать: согласовать с реестрами, что именно подаётся на вход хешу компонента (тело плюс сигнатура плюс контракты, без `meta`).
7. **Кто присваивает `version` при публикации.** Транзакционный счётчик базы удалён, в именах файлов версии нет, а поле `version` в `flow.yaml` кто-то обязан двигать. Что сделать: зафиксировать вместе с формой релиза (тег, ветка или файл релиза) в ADR о git как истории и сослаться отсюда.
8. **Реестр типов ошибок для `try.catch`.** Ключи `catch` — типы ошибок, их список ядром не задан. Что сделать: перечислить типизированные ошибки рантайма (`timeout`, `rate_limit`, `schema_invalid`, `contract_violation`, `budget_exceeded`, `policy_violation`) и закрепить их как enum.
9. **Покрывают ли источники `andMap` (`value | data | input | context | step | fn`) все проекции `via`.** `flatten` и `map{select}` могут не выражаться декларативно и потребовать эмиссии в `andThen`, что портит инспектируемость графа. Что сделать: спайк компилятора на узле `score_hotels` и `render`.
10. **Дельты `jsondiffpatch` как единица хранения версии.** Обратимость (`patch`/`unpatch`) проверена, но формат дельты не стандартизован: мажорное обновление библиотеки может сделать старые дельты неприменимыми. Что сделать: решить, хранить ли дельты как пересчитываемый кэш поверх полных версий (предпочтительно) или как источник истины.
11. **Язык контрактов шире `$defs/predicate`.** `requires` в спеке §6.0 использует `distinct(families(judges))`, `disjoint(...)`, то есть предикаты над статическими свойствами графа, а не над значениями. Что сделать: завести отдельный `$defs/contract_predicate` и описать его вычисление в [07. Компилятор](07-compiler.md).
12. **Противоречие источников по порядку ключей.** DECISIONS («Порядок полей сохраняется как в IR, не сортируется») и факты канонизации (JCS сортирует ключи, `jsonb` порядок не хранит) совместимы только при правиле «порядок значим — значит массив» (§1.4.2). Что сделать: подтвердить в документе о компиляции схем, что генератор JSON Schema для провайдера читает порядок из массива `fields`, а не из порядка ключей объекта.
