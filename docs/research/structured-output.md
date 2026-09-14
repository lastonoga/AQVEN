# Гарантии структурированного вывода (L0/L2, §8.4, §10)

Дата: 2026-09-11. Автор: research-subagent. Черновик для тех. писателя.
Установленные версии (probe/node_modules): zod@4.6.2 (MIT), ajv@8.20.0, ajv-formats (есть).

## 1. OpenAI strict structured outputs — ограничения JSON Schema

ИСТОЧНИК (first-hand, скачано curl'ом 2026-09-11):
`https://developers.openai.com/api/docs/guides/structured-outputs.md` (135 953 байт; markdown-версия
любой страницы доков доступна добавлением `.md` к URL — полезно, HTML рендерится JS и WebFetch его
не берёт). Локальная копия: `/tmp/so.md`.

### 1.1 Поддерживаемые типы
`String`, `Number`, `Boolean`, `Integer`, `Object`, `Array`, `Enum`, `anyOf`. **И всё.**

### 1.2 Поддерживаемые keyword'ы по типам (дословный список)
- **string**: `pattern` (regex), `format` — только из списка: `date-time`, `time`, `date`,
  `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid`.
  ⚠️ `minLength`/`maxLength` в списке поддерживаемых для строк **не названы** (упомянуты только в
  секции «не поддерживаются для fine-tuned моделей») — трактуем как поддерживаемые для базовых
  моделей, но UNVERIFIED на 100%.
- **number**: `multipleOf`, `maximum`, `exclusiveMaximum`, `minimum`, `exclusiveMinimum`.
- **array**: `minItems`, `maxItems`.

### 1.3 НЕ поддерживаются (дословно, «Some type-specific keywords are not yet supported»)
- **Composition:** `allOf`, `not`, `dependentRequired`, `dependentSchemas`, `if`, `then`, `else`.
- Для **fine-tuned** моделей дополнительно НЕ поддерживаются:
  - строки: `minLength`, `maxLength`, `pattern`, `format`
  - числа: `minimum`, `maximum`, `multipleOf`
  - объекты: `patternProperties`
  - массивы: `minItems`, `maxItems`
- «If you turn on Structured Outputs by supplying `strict: true` and call the API with an
  unsupported JSON Schema, you will receive an error.» → падение на этапе запроса, не молча.

**`oneOf` в списке поддерживаемых ОТСУТСТВУЕТ.** Поддерживается только `anyOf`. Это прямой
конфликт с выводом Zod 4 (`z.discriminatedUnion` → `oneOf`, см. §5.5).

### 1.4 Точные лимиты (дословные цитаты)
| Лимит | Значение | Цитата |
|---|---|---|
| Свойства объекта | **5000** всего | «A schema may have up to 5000 object properties total, with up to 10 levels of nesting.» |
| Глубина вложенности | **10 уровней** | там же |
| Суммарная длина строк | **120 000 символов** | «total string length of all property names, definition names, enum values, and const values cannot exceed 120,000 characters» |
| Число enum-значений | **1000** на всю схему | «A schema may have up to 1000 enum values across all enum properties.» |
| Строковые enum >250 значений | **15 000 символов** суммарно | «For a single enum property with string values, the total string length of all enum values cannot exceed 15,000 characters when there are more than 250 enum values.» |

(Это лимиты после июльского-2025 повышения: было 100 properties / 15 000 символов / 500 enum /
7 500 символов. Старые цифры в блогах и в части сторонних SDK всё ещё встречаются —
источник: community.openai.com/t/structured-outputs-limits-are-raised-to-support-larger-schemas/1313593.)

### 1.5 Жёсткие структурные правила
1. **Корень обязан быть `object` и НЕ `anyOf`.** Дословно: «the root level object of a schema must
   be an object, and not use `anyOf`». Доки прямо называют Zod: «A pattern that appears in Zod …
   is using a discriminated union, which produces an `anyOf` at the top level … Invalid JSON Schema
   for Structured Outputs».
   → **Правило нашего компилятора:** если корень IR-схемы — union, оборачиваем в
   `{ type:"object", properties:{ result: <union> }, required:["result"], additionalProperties:false }`.
2. **Все поля обязаны быть в `required`.** «all fields or function parameters must be specified as
   `required`». Опциональность эмулируется union'ом с null:
   `{"type": ["string","null"], "enum": ["F","C"]}` — обратите внимание, enum при этом остаётся
   без `null` в списке, а `null` приходит из `type`.
   → **Правило компилятора:** `optional -> required + type:[T,"null"]`. Zod даёт ровно обратное
   (§5.3 п.2), значит переписываем сами.
3. **`additionalProperties: false` обязателен на каждом объекте.** Zod ставит его сам в
   `io:"output"` — совпадает.
4. **`anyOf`: каждая вложенная схема сама обязана быть валидной по этому же подмножеству.**
5. **`$defs` / `definitions` поддерживаются**, `$ref` на `#/$defs/step` — пример прямо в доках.
6. **Рекурсивные схемы поддерживаются**, `"$ref": "#"` для рекурсии на корень.

### 1.6 Порядок ключей — недооценённый рычаг
«outputs will be produced in the same order as the ordering of keys in the schema.»
→ Порядок полей в IR = порядок генерации = порядок «рассуждения» модели. Это значит, что
компилятор **обязан сохранять порядок полей** (не сортировать по алфавиту при сериализации), и что
поле `reasoning`/`rationale` надо ставить ПЕРЕД полем-решением, а не после. Для L2 это
документируемая фича IR, а не деталь реализации.

### 1.7 Латентность первого запроса
«the first request you make with any schema will have additional latency as our API processes the
schema, but subsequent requests with the same schema will not have additional latency.»
→ Схема компилируется в грамматику на стороне OpenAI и кешируется. **Динамически меняющийся enum
(наши ID) убивает этот кеш на каждом запуске.** Прямой аргумент за индексный выбор из §4.

### 1.8 Refusal — отдельный канал, не нарушение схемы
«a refusal does not necessarily follow the schema you have supplied in `response_format`, the API
response will include a new field called `refusal`». Также схема может не выполниться при
`finish_reason: "length"` (обрыв по max_tokens) — ответ будет невалидным JSON.
→ **Исполнитель узла обязан различать три исхода**: `ok` (распарсилось), `refusal` (модель
отказала — не ремонтируем, поднимаем наверх как типизированную ошибку политики),
`truncated` (finish_reason=length — ремонт бессмысленен, нужен ретрай с бОльшим лимитом).
Это три разных ветки в цикле ремонта §6/§7, их нельзя схлопывать в «невалидный JSON».


## 2. Anthropic / Google — гарантии схемы

### 2.1 Anthropic: structured outputs ВЫШЛИ ИЗ БЕТЫ
ИСТОЧНИК: `https://docs.claude.com/en/docs/build-with-claude/structured-outputs.md`
(110 492 байта, локально `/tmp/anth.md`, скачано curl 2026-09-11).

Два независимых механизма, **работают вместе в одном запросе**:
- **JSON outputs** — `output_config.format` (тип `json_schema`): формат самого ответа.
- **Strict tool use** — `strict: true` на инструменте: гарантия имени инструмента и его аргументов.

Миграция: `output_format` → **`output_config.format`**, beta-заголовок
`structured-outputs-2025-11-13` больше не нужен (старый принимается «a transition period»).
Python SDK v1.0+ бросает `TypeError` на `output_format={...}`.

Реализация: «Structured outputs work by compiling your JSON schemas into a grammar that constrains
Claude's output» — то есть constrained decoding, как у OpenAI.

#### Поддерживается (дословно)
- Все базовые типы: object, array, string, integer, number, boolean, **null**
- `enum` (только строки/числа/bool/null — «no complex types»), `const`
- **`anyOf` И `allOf`** (`allOf` с `$ref` не поддерживается)
- `$ref`, `$def`, `definitions` (внешние `$ref` — нет)
- **`default`** для всех поддерживаемых типов
- `required` и `additionalProperties` (**обязан быть `false`**)
- String formats: `date-time`, `time`, `date`, `duration`, `email`, `hostname`, **`uri`**, `ipv4`, `ipv6`, `uuid`
  (у Anthropic есть `uri`, которого нет у OpenAI — см. §1.2)
- Array `minItems` — **только значения 0 и 1**

#### НЕ поддерживается (дословно)
- **Рекурсивные схемы** ⚠️ (у OpenAI и Gemini — поддерживаются!)
- Сложные типы внутри enum
- Внешний `$ref`
- Числовые ограничения: `minimum`, `maximum`, `multipleOf`
- Строковые: `minLength`, `maxLength`
- Ограничения массивов сверх `minItems` 0/1
- `additionalProperties` в любом значении кроме `false`
→ «If you use an unsupported feature, you'll receive a 400 error with details.»

#### Regex (`pattern`) — поддерживается частично
ЕСТЬ: `^...$` и частичное совпадение, квантификаторы `* + ?` и простые `{n,m}`, классы
`[] . \d \w \s`, группы `(...)`.
НЕТ: backreferences (`\1`), lookahead/lookbehind (`(?=...)`, `(?!...)`), границы слова `\b`/`\B`,
сложные `{n,m}` с большими диапазонами. «Complex patterns may result in 400 errors.»

#### Лимиты сложности (таблица дословно)
| Лимит | Значение | Описание |
|---|---|---|
| Strict tools per request | **20** | инструментов с `strict: true` (нестрогие не считаются) |
| Optional parameters | **24** | суммарно по всем strict-схемам запроса; каждый ключ НЕ в `required` |
| Parameters with union types | **16** | суммарно `anyOf` + type-массивы (`["string","null"]`) — «especially expensive because they create exponential compilation cost» |

Плюс «additional internal limits on the compiled grammar size» → ошибка 400
**«Schema is too complex for compilation.»** даже если явные лимиты не превышены.

⚠️ **ЭТО ПРЯМО ПРОТИВОПОЛОЖНО OpenAI.** У OpenAI `optional` вообще нет (всё required, опциональность
через `["T","null"]`). У Anthropic **`["T","null"]` считается union-типом и жрёт лимит в 16**, а
опциональные поля — лимит в 24. То есть **нельзя взять одну «универсальную strict-схему» для обоих
провайдеров**: тот же приём, который делает схему валидной для OpenAI, взрывает лимит Anthropic.
→ **Архитектурный вывод: профиль схемы — свойство пары (IR-схема × провайдер), а не свойство IR.**
Компилятор обязан иметь минимум три профиля: `openai-strict`, `anthropic-strict`, `permissive`.

#### Порядок свойств — отличается от OpenAI!
«required properties appear first, followed by optional properties» (внутри каждой группы — порядок
схемы). У OpenAI — строго порядок схемы. → Если порядок полей несёт смысл (reasoning-перед-решением,
§1.6), **все поля должны быть `required`** — тогда поведение совпадает у обоих провайдеров.
Это независимый аргумент за «всё required + nullable» как общий стиль IR.

#### Невалидный вывод — три случая (дословно)
- `stop_reason: "refusal"` — 200 OK, токены тарифицируются, схема может не соблюдаться.
- `stop_reason: "max_tokens"` — обрыв, вывод неполный. «Retry with a higher max_tokens value.»
- **Регистр enum не гарантируется(!)**: «Structured outputs don't guarantee the capitalization of
  string `enum` and `const` values… may return a value that differs from your schema only in
  capitalization, typically in the first letter of a word following a space». Пример из доков:
  enum `["Conversation Topic 1","Conversation Topic 2","Conversation topic 3"]` → может прийти
  `"Conversation Topic 3"`. **Без ошибки и без специального stop_reason.**
  → **ПРЯМОЕ ТРЕБОВАНИЕ К НАШЕМУ allowed-set (§4):** ID в enum должны быть
  case-insensitive-уникальны, а валидатор — сравнивать без учёта регистра и нормализовать обратно
  к каноническому значению. Наивный `ajv` на enum здесь даст ложный fail.

#### Прочее
- Схема **кешируется до 24 часов** с последнего использования (грамматика компилируется один раз).
  «PHI must not be included in JSON schema definitions» — кеш схем не под ZDR/HIPAA.
  → Динамические enum из пользовательских данных = утечка в кеш схем. Ещё один довод за §4.
- Совместимо: batch (−50%), token counting (без компиляции), streaming.
- **Несовместимо: Citations** (400) и **Message Prefilling**.
- «Grammar scope: Grammars apply only to Claude's direct output, not to tool use calls, tool
  results, or thinking tags… Grammar state resets between sections» → с extended thinking JSON
  outputs работают, грамматика не ломает блок размышления.

### 2.2 Google Gemini
ИСТОЧНИК: `https://ai.google.dev/gemini-api/docs/structured-output` (обновлено 2026-09-02,
локально `/tmp/gem.txt`).
- Актуальная форма вызова — `client.interactions.create(model=..., response_format={"type":"text",
  "mime_type":"application/json", "schema": <JSON Schema>})` (новый Interactions API; старое
  `generationConfig.responseSchema`/`responseMimeType` — прежняя линия).
- **`anyOf` поддерживается** (пример в доках: content moderation с `anyOf` из двух объектов + enum).
- **Рекурсия поддерживается через `{"$ref": "#"}`** — дословный пример оргчарта:
  ```js
  const employeeJsonSchema = { type:"object", properties:{
    name:{type:"string"}, employee_id:{type:"integer"},
    reports:{ type:"array", description:"...", items:{ "$ref": "#" } } },
    required:["name","employee_id","reports"] };
  ```
  Там же в доках используется **`z.fromJSONSchema(...)`** (Zod 4 умеет и обратное направление —
  пригодится для импорта чужих схем в IR).
- Заявленные ограничения в доках расплывчаты: «Schema subset: Not all JSON Schema features are
  supported», «Very large or deeply nested schemas may be rejected». Точных цифр Google не даёт.
  UNVERIFIED: конкретные лимиты глубины/числа свойств у Gemini; в отличие от OpenAI/Anthropic
  их придётся выяснять эмпирически и держать в профиле как консервативные.
- Историческая особенность линии `responseSchema`: подмножество **OpenAPI 3.0 Schema**, поле
  `propertyOrdering` для фиксации порядка. UNVERIFIED, относится ли это к новому `response_format`.
  → Если целимся в Gemini, `z.toJSONSchema(..., { target: "openapi-3.0" })` (§5.4) — готовый
  стартовый профиль.

### 2.3 Сводная таблица различий (то, ради чего нужен профильный компилятор)
| Возможность | OpenAI strict | Anthropic strict | Gemini |
|---|---|---|---|
| `oneOf` | ❌ | ❌ (не назван) | UNVERIFIED |
| `anyOf` | ✅ (кроме корня) | ✅ | ✅ |
| `allOf` | ❌ | ✅ (без `$ref`) | UNVERIFIED |
| Опциональные поля | ❌ все required | ✅ но лимит 24 | UNVERIFIED |
| `["T","null"]` | ✅ штатный приём | ✅ но лимит 16 (дорого) | UNVERIFIED |
| Рекурсия | ✅ (`"$ref":"#"`) | ❌ | ✅ (`"$ref":"#"`) |
| `minimum`/`maximum` | ✅ (не fine-tuned) | ❌ | UNVERIFIED |
| `minLength`/`maxLength` | ~ (не fine-tuned) | ❌ | UNVERIFIED |
| `minItems`/`maxItems` | ✅ | только `minItems` 0/1 | UNVERIFIED |
| `pattern` | ✅ | ✅ частично (без lookahead/backref) | UNVERIFIED |
| `format: uri` | ❌ | ✅ | UNVERIFIED |
| Корень — union | ❌ запрещён | не запрещён явно | UNVERIFIED |
| Порядок ключей | порядок схемы | required, потом optional | `propertyOrdering` (старый API) |
| Лимит enum | 1000 / 15k симв. при >250 | не документирован явно | не документирован |

**Ключевое следствие для IR:** общее безопасное подмножество («greatest common denominator»),
которое проходит везде = объекты, строки/числа/bool, enum строк, массивы, `anyOf` не в корне,
**все поля required**, `additionalProperties:false`, **без рекурсии**, **без числовых и строковых
ограничений в схеме**. Всё, что за пределами — уезжает в §7 (post-hoc проверки Zod) и в текст
`description`, а не в грамматику. Это ровно то, что делают SDK Anthropic: «Remove unsupported
constraints … adding constraints to field descriptions» — и SDK-валидированные ограничения
(`minimum`, `maximum`, `multipleOf`, `minLength`, `maxLength`) проверяются локально после ответа.
**Мы копируем этот приём: ограничение вырезается из wire-схемы, дописывается в description,
проверяется Zod'ом на приёме.**


## 3. vLLM / SGLang — guided_json / grammar через OpenAI-совместимый API

### 3.1 vLLM — ВНИМАНИЕ: API переименован
ИСТОЧНИК: `https://docs.vllm.ai/en/latest/features/structured_outputs.html` (страница обновлена
2026-05-19, локально `/tmp/vllm.txt`).

**Старые `guided_json` / `guided_regex` / `guided_choice` / `guided_grammar` заменены на один
объект `structured_outputs` в `extra_body`.** Ключи внутри: `choice`, `regex`, `json`, `grammar`,
`structural_tag`. Если в документации встречается `guided_json` — это старая линия vLLM;
UNVERIFIED, сохранён ли алиас для обратной совместимости.

Четыре формы запроса (дословно из доков):

```python
client = OpenAI(base_url="http://localhost:8000/v1", api_key="-")
model = client.models.list().data[0].id

# 1) выбор из списка — ТОЧНО ТО, ЧТО НУЖНО ДЛЯ allowed-set (§4)
completion = client.chat.completions.create(
    model=model,
    messages=[{"role": "user", "content": "Classify this sentiment: vLLM is wonderful!"}],
    extra_body={"structured_outputs": {"choice": ["positive", "negative"]}},
)

# 2) regex
extra_body={"structured_outputs": {"regex": r"\w+@\w+\.com\n"}, "stop": ["\n"]}

# 3) JSON Schema — ДВА способа
#    3a) через штатный OpenAI-совместимый response_format:
response_format={"type": "json_schema",
                 "json_schema": {"name": "car-description",
                                 "schema": CarDescription.model_json_schema()}}
#    3b) через extra_body: {"structured_outputs": {"json": <schema>}}

# 4) EBNF-грамматика (GBNF-подобная)
simplified_sql_grammar = """
root ::= select_statement
select_statement ::= "SELECT " column " from " table " where " condition
column ::= "col_1 " | "col_2 "
table ::= "table_1 " | "table_2 "
condition ::= column "= " number
number ::= "1 " | "2 "
"""
extra_body={"structured_outputs": {"grammar": simplified_sql_grammar}}
```

Важное из доков:
- **`client.beta.chat.completions.parse(..., response_format=PydanticModel)` работает против vLLM
  как против OpenAI** — то есть наш клиент может быть один и тот же, меняется только base_url.
  Это главный практический вывод: **self-hosted узлы не требуют отдельного транспорта**, только
  отдельный профиль схемы.
- **Синтаксис regex зависит от бэкенда**: «xgrammar, guidance, and outlines use Rust-style regex,
  while lm-format-enforcer uses Python's re module» → regex в IR непереносим между бэкендами.
  Держим regex вне грамматики (§2.3, post-hoc Zod).
- Работает вместе с reasoning-моделями: `vllm serve ... --reasoning-parser deepseek_r1`,
  «you can use reasoning with any provided structured outputs feature».
- Оффлайн: `from vllm.sampling_params import StructuredOutputsParams` →
  `SamplingParams(structured_outputs=StructuredOutputsParams(choice=[...]))`.
- `structural_tag` — отдельная фича (частичное ограничение вывода, например только внутри тегов);
  примеры в репо `examples/features/structured_outputs`.
- Совет из доков, который стоит перенести в наш промпт-компилятор дословно: «While not strictly
  necessary, normally it's better to **indicate in the prompt the JSON schema** and how the fields
  should be populated. This can improve the results notably in most cases.»
  → **Схема идёт И в грамматику, И в текст промпта.** Грамматика гарантирует форму, промпт —
  смысл. Для L2 это обязательный элемент компиляции узла, а не опция.

### 3.2 SGLang
ИСТОЧНИК: `https://docs.sglang.io/advanced_features/structured_outputs.html` (через WebSearch;
UNVERIFIED дословность цитат — страницу целиком не забирал).
- **Бэкенд по умолчанию — XGrammar.** Переключение флагом сервера `--grammar-backend outlines` /
  `--grammar-backend llguidance`. Без флага — XGrammar.
- Матрица возможностей бэкендов:
  | Бэкенд | JSON Schema | regex | EBNF | structural tag |
  |---|---|---|---|---|
  | **XGrammar** (default) | ✅ | ✅ | ✅ (GGML BNF) | ✅ |
  | Outlines | ✅ | ✅ | ❌ | ❌ |
  | Llguidance | ✅ | ✅ | ✅ | ❌ |
- OpenAI-совместимый API: JSON Schema через `response_format={"type":"json_schema", ...}`;
  regex через `extra_body={"regex": "..."}`; EBNF через `extra_body={"ebnf": "..."}`.
  ⚠️ Отличие от vLLM: у SGLang `regex`/`ebnf` лежат **прямо в `extra_body`**, а не внутри
  вложенного объекта `structured_outputs`.

### 3.3 Что это значит для архитектуры
1. **XGrammar — де-факто общий знаменатель** (default у SGLang, один из бэкендов vLLM). Если
   строить собственный слой грамматик — целиться в его возможности.
2. **`choice` / enum-грамматика у self-hosted бесплатна** в том смысле, что список значений
   компилируется в конечный автомат, а не в 1000 альтернатив в схеме. Для больших allowed-set
   (§4) self-hosted путь масштабируется лучше managed-провайдеров.
3. **Транспорт один (OpenAI-совместимый), различаются только «где лежит ограничение»**:
   `response_format` (общее) vs `extra_body.structured_outputs.*` (vLLM) vs `extra_body.*` (SGLang).
   → В IR это поле `provider_profile`, в исполнителе узла — стратегия сериализации ограничения.
   Классический Strategy: `ConstraintEncoder` с реализациями `OpenAIStrict`, `AnthropicStrict`,
   `VllmStructuredOutputs`, `SglangExtraBody`, `PromptOnly`.


## 4. Динамические allowed-set enum (наши ID) — практический потолок

Сценарий: узел обязан выбрать из набора, известного только в рантайме (ID узлов, ID документов,
ID инструментов). Наивное решение — засунуть весь набор в `enum` схемы. Ниже — почему оно ломается.

### 4.1 Жёсткий потолок = арифметика лимитов OpenAI (§1.4)
Два лимита работают одновременно: **1000 значений enum на всю схему** И **15 000 символов
суммарно для одного строкового enum, если значений больше 250**. Посчитано:

| Формат ID | Длина | Влезает по 15k-символам | **Эффективный потолок** |
|---|---|---|---|
| UUID v4 | 36 | 416 | **416** |
| cuid2 | 24 | 625 | **625** |
| nanoid | 21 | 714 | **714** |
| короткий код base32 | 6 | 2500 | **1000** (упирается в лимит значений) |
| числовой индекс `1..999` | 3 | 5000 | **1000** (упирается в лимит значений) |

**ВЫВОД №1, жёсткий: UUID в enum даёт потолок ~400 значений, а не 1000.** Формат ID напрямую
определяет ёмкость allowed-set. Если в IR ID — UUID, то любой набор больше ~400 элементов
принципиально не помещается в схему, независимо от прочих ухищрений.
Ещё жёстче: лимит 15 000 символов — **на один enum**, а 120 000 (§1.4) — на ВСЕ имена свойств,
имена определений, enum- и const-значения схемы вместе. Несколько больших allowed-set в одной
схеме съедают общий бюджет.

### 4.2 Что делают провайдеры при 1000+ — разное, и ни один не деградирует «мягко»
- **OpenAI:** превышение → **ошибка 400 на запросе** (§1.3: «you will receive an error»). Не
  молчаливая деградация — и это хорошо, ловится на компиляции.
- **Anthropic:** явного лимита на enum в доках НЕТ, но есть «additional internal limits on the
  compiled grammar size» и ошибка **«Schema is too complex for compilation.»** (§2.1). Плюс
  лимит 16 на параметры с union-типами. Порог непредсказуем → полагаться нельзя.
- **Self-hosted (vLLM/SGLang/XGrammar):** enum компилируется в конечный автомат; большой набор
  масштабируется существенно лучше (§3.3), но растёт время компиляции грамматики на первый запрос.
  UNVERIFIED: конкретные цифры времени компиляции XGrammar на 10k альтернатив.

### 4.3 Три независимых налога (почему «влезло» ≠ «работает»)
1. **Токены.** 1000 UUID ≈ 36 000 символов ≈ **10-15k токенов** только на определение схемы, в
   каждом запросе. При Anthropic-кеше схемы на 24 ч (§2.1) это не тарифицируется повторно, но
   у OpenAI даёт «additional latency as our API processes the schema» на первый запрос (§1.7) —
   а **динамический набор меняется каждый запуск, значит кеш грамматики промахивается ВСЕГДА.**
   Это, возможно, самый дорогой пункт и он невидим в бенчмарках на статичных схемах.
2. **Точность.** Измеренная цена жёсткого формата вообще: **3-9 п.п. падения точности** на
   open-weight моделях, **>15 п.п. на задачах с рассуждением**; «the stricter the formatting rules,
   the worse the reasoning got». Источник: cleanlab.ai/blog/structured-output-benchmark/ и обзор
   towardsdatascience.com/your-json-is-valid-but-your-data-is-wrong-...
3. **Enum hallucination — отдельный класс отказа, который грамматика НЕ ловит.** «The model picks
   a valid enum value that is semantically wrong for the input» (тот же источник). Грамматика
   гарантирует, что значение ИЗ набора, и ничего не говорит о том, что оно ПРАВИЛЬНОЕ. Чем больше
   набор, тем выше шанс попадания в «похожий, но не тот» ID.
   + Регистр enum у Anthropic не гарантирован (§2.1) → сравнение ID должно быть
   case-insensitive с нормализацией к каноническому значению.

### 4.4 Стратегии обхода — по возрастанию радикальности
**S1. Короткие коды вместо ID (дешёвая, всегда включённая).**
В схему уходит не `550e8400-e29b-41d4-a716-446655440000`, а `d_07`. Компилятор держит таблицу
`код ↔ реальный ID` на время одного вызова и разворачивает обратно при разборе.
Ёмкость сразу растёт в 5-6 раз (36 → 6 символов), токены падают на порядок. Побочный плюс:
короткий код — **один-два токена**, UUID — 10-15, то есть автомат грамматики проще.
⚠️ Коды должны быть осмысленными (`doc_invoice_07`, а не `x7`), иначе п.4.3.3 (галлюцинация)
только усилится: модель теряет семантическую опору.

**S2. Индексный выбор (когда набор упорядочен и подан в промпте).**
Набор кандидатов идёт в ТЕКСТ промпта как нумерованный список, в схеме остаётся
`{"type":"integer","minimum":1,"maximum":N}` — нулевой вклад в лимиты enum и в 120k-бюджет.
⚠️ Но: `minimum`/`maximum` **не поддерживаются Anthropic** (§2.2) и не поддерживаются для
fine-tuned OpenAI-моделей (§1.3) → для Anthropic-профиля оставляем `{"type":"integer"}` в схеме,
а границу проверяем Zod'ом (§7.5). Индекс вне диапазона — это `Issue`, а не отказ грамматики.
⚠️ Второй риск: индексы не несут семантики, модель чаще ошибается на длинных списках
(позиционное смещение, «lost in the middle»). Для N > ~50 индексный выбор без структуры вреден.

**S3. Двухэтапный выбор (иерархия) — основной путь для больших наборов.**
Шаг 1: узел выбирает **категорию/фасет** из маленького статичного enum (10-30 значений).
Шаг 2: второй узел получает уже суженный набор (обычно < 50) и выбирает конкретный ID —
теперь допустим честный enum с реальными ID.
Это ложится на VoltAgent как два узла + `andBranch`/обычная последовательность, специальных
примитивов не требует. Дополнительный бонус: промежуточный выбор виден в провенансе и
отлаживается отдельно — ровно то, ради чего строится L2.

**S4. Retrieval-сужение (когда иерархии нет).**
Внешний поиск (BM25/эмбеддинги) сокращает кандидатов до top-k (k ≈ 20-50) ДО вызова модели,
и уже они идут в enum. Набор становится маленьким и, главное, релевантным — п.4.3.3 почти исчезает.
Цена: качество узла теперь зависит от recall ретривера; это надо явно отражать в IR (узел
`retrieve` + узел `select`), а не прятать внутри одного узла.

**S5. Без грамматики + post-hoc валидация (аварийный путь).**
`{"type":"string"}` в схеме, набор в промпте, проверка вхождения в allowed-set через Zod
`superRefine` (§7.2) с `params: { rule: "allowed_set", expected: "<подсказка>" }` и
LLM-ремонт по `Issue[]`. Единственный вариант для наборов в тысячи элементов и для моделей
без constrained decoding. Обязателен fuzzy-match при ремонте (модель почти попала — подсказываем
ближайшие 3 кандидата), иначе цикл не сходится.

### 4.5 Итоговое правило для компилятора (порог по размеру набора)
| Размер allowed-set | Стратегия |
|---|---|
| ≤ 50 | enum с короткими осмысленными кодами (S1) |
| 50-400 | S1 обязательно; для Anthropic следить за union-лимитами |
| 400-1000 | S1 + S3/S4 (сужать до вызова); честный enum из UUID уже невозможен |
| > 1000 | **enum запрещён**: только S3/S4, аварийно S5 |
Компилятор обязан **считать бюджет схемы на этапе компиляции** (число enum-значений, суммарные
символы enum, суммарные 120k) и падать с внятной ошибкой ДО запроса к провайдеру, а не ловить 400.
Это прямая обязанность «ядра доверия», которое мы пишем сами.


## 5. Zod 4: z.toJSONSchema, registry, discriminated unions

ПРОВЕРЕНО ЗАПУСКОМ: `zod@4.6.2` (MIT), скрипт
`/private/tmp/claude-501/-Users-kirunya-Projects-my-ai-workflows-automate/f7b68ecb-d2f6-4f40-91f0-83ca8b26df64/scratchpad/probe/zodtest.mjs`,
`node zodtest.mjs`. Ниже — реальный вывод, не пересказ.

### 5.1 Сигнатура и опции
`z.toJSONSchema(schemaOrRegistry, params?)`. Опции (из `node_modules/zod/v4/core/to-json-schema.d.cts`):
- `target`: `"draft-4" | "draft-7" | "draft-2020-12" | "openapi-3.0"`. **Дефолт — `draft-2020-12`.**
- `io`: `"input" | "output"`. **Дефолт — `"output"`.**
- `unrepresentable`: `"throw" | "any"`. **Дефолт — `"throw"`.**
- `cycles`: `"ref" | "throw"` (дефолт `"ref"`), `reused`: `"inline" | "ref"` (дефолт `"inline"`).
- `override: (ctx) => void` — постобработка каждого узла (ctx.jsonSchema мутируется). Наш крючок для strict-профиля.
- `metadata` — внешний registry метаданных; `uri: (id) => string` — для формы с registry.

### 5.2 Ключевой факт: `.meta()` vs `.describe()`
- `.describe("x")` кладёт `description` в JSON Schema — подтверждено: поле `id` вышло как
  `{"type":"string","description":"Stable node id","examples":["n1"]}`.
- `.meta({...})` — произвольные метаданные, **они выливаются в JSON Schema как есть**:
  `.meta({ id, title, description })` дало `"title": "Node"`, `"description": "A workflow node"`,
  а `.meta({examples:["n1"]})` дало `"examples": ["n1"]`.
- `.meta({ id: "Node" })` **меняет форму вывода**: схема выносится в `$defs` и корень становится
  `{"$schema":..., "$ref":"#/$defs/Node", "$defs":{...}}`. Без `id` — инлайн.
  → Для OpenAI strict это важно: корневой `$ref` допустим, но проще генерировать без `meta.id`,
  либо разворачивать корень в компиляторе.

### 5.3 Реальный вывод (draft-2020-12, io=output)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$ref": "#/$defs/Node",
  "$defs": { "Node": {
    "type": "object",
    "properties": {
      "id":   { "type": "string", "description": "Stable node id", "examples": ["n1"] },
      "kind": { "type": "string", "enum": ["llm","tool","gate"] },
      "temp": { "default": 0.7, "type": "number", "minimum": 0, "maximum": 2 },
      "tags": { "type": "array", "items": { "type": "string" } },
      "note": { "type": ["string","null"] }
    },
    "required": ["id","kind","temp","note"],
    "additionalProperties": false,
    "title": "Node", "description": "A workflow node"
  }}
}
```
ВАЖНЫЕ НАБЛЮДЕНИЯ (все подтверждены выводом):
1. **`additionalProperties: false` ставится автоматически** для `z.object()` в режиме
   `io: "output"` — это ровно то, что требует OpenAI strict. В `io: "input"` его **НЕТ**.
2. **`.optional()` поле просто исчезает из `required`** и `"tags"` НЕ получает `null` в типе.
   Для OpenAI strict (где required обязан включать все ключи) это надо чинить постобработкой:
   `optional -> required + type:[T,"null"]`. См. §1.
3. **`.default()` ведёт себя по-разному между io**: в `io:"output"` поле `temp` попало в `required`
   (значение уже подставлено), в `io:"input"` — НЕ попало. Это ровно правильная семантика:
   схему для *модели* (вход в наш пайплайн = выход модели) надо брать с `io: "output"`,
   иначе модель сможет опустить поле.
4. `.nullable()` даёт `"type": ["string","null"]` (union-типы). В `openapi-3.0` вместо этого
   `{"nullable": true, "type": "string"}` — OpenAI strict union-тип понимает, `nullable` — нет.
   → **target для LLM-схем: `draft-2020-12`, не `openapi-3.0`.**

### 5.4 draft-7 / openapi-3.0
- `draft-7`: `$schema: http://json-schema.org/draft-07/schema#`, `$defs` → **`definitions`**.
- `openapi-3.0`: **`$schema` вообще нет**, `definitions`, `nullable: true`.
  Нужен, если целевой провайдер (Google Gemini `responseSchema`) хочет OpenAPI 3.0 subset — см. §2.

### 5.5 discriminatedUnion
`z.discriminatedUnion("kind", [...])` → **`oneOf`** (не `anyOf`!), литерал дискриминатора →
`{"type":"string","const":"llm"}`:
```json
{ "oneOf": [
  { "type":"object","properties":{"kind":{"type":"string","const":"llm"},"model":{"type":"string"}},
    "required":["kind","model"],"additionalProperties":false },
  { "type":"object","properties":{"kind":{"type":"string","const":"tool"},"toolName":{"type":"string"}},
    "required":["kind","toolName"],"additionalProperties":false } ] }
```
ПОДВОДНЫЙ КАМЕНЬ: **OpenAI strict поддерживает `anyOf`, а `oneOf` — нет** (см. §1). Значит
компилятор ОБЯЗАН переписывать `oneOf -> anyOf` в strict-профиле. Делается одной строкой в
`override`. Это первый и главный аргумент за собственный слой «Zod → strict JSON Schema»,
а не за сырой `z.toJSONSchema`.

### 5.6 unrepresentable
`z.date()`, `z.bigint()`, `z.custom()` по умолчанию **бросают**:
```
Date cannot be represented in JSON Schema
```
С `{ unrepresentable: "any" }` превращаются в `{}` (пустая схема = «что угодно»), и при этом
попадают в `required`. Для strict это ловушка: `{}` без `type` OpenAI отклонит.
→ **Правило IR: даты только `z.iso.datetime()` / `z.string()`, bigint запрещён.** Компилятор
должен явно валидировать IR на unrepresentable-типы и выдавать понятную ошибку, а не `{}`.

### 5.7 Переиспользование и рекурсия
- Одна и та же схема в двух полях: **дефолт `reused: "inline"`, НО** при наличии `.meta({id})`
  она выносится в `$defs` и оба поля становятся `{"$ref":"#/$defs/Node"}` — подтверждено выводом.
- Рекурсия через геттер работает:
  ```ts
  const Tree = z.object({ v: z.string(), get kids() { return z.array(Tree).optional(); } });
  ```
  → `cycles: "ref"` по умолчанию, выдаёт `$ref` на себя. `cycles: "throw"` если рекурсия
  нежелательна (наш случай для узких LLM-схем — рекурсия плохо совместима с strict у части
  провайдеров, см. §1/§3).

### 5.8 z.registry()
```ts
const reg = z.registry(); reg.add(Node, { id: "Node" });
z.toJSONSchema(reg, { uri: (id) => `https://x/${id}.json` })
```
→ `{ "schemas": { "Node": { "$schema": ..., "$id": "https://x/Node.json", ... } } }`.
Это наш формат для **экспорта каталога схем** (тип-реестр IR → один bundle для MCP-клиента и для
фронта). `uri` управляет `$id`; кросс-ссылки между схемами реестра становятся абсолютными URI.


## 6. Валидация и ремонт: ajv, jsonrepair, partial/streaming JSON

ПРОВЕРЕНО ЗАПУСКОМ: `/private/tmp/claude-501/.../scratchpad/probe/repairtest.mjs`, `node repairtest.mjs`.

### 6.1 Версии и лицензии (npm view, 2026-09-11)
| Пакет | Версия | Лицензия | time.modified | Риск |
|---|---|---|---|---|
| `ajv` | 8.20.0 (установлен) | MIT | — | ок |
| `ajv-formats` | установлен | MIT | — | ок |
| `jsonrepair` | **3.15.0** | **ISC** | 2026-07-03 | ок, живой |
| `partial-json` | 0.1.7 | MIT | **2024-05-14** | ⚠️ **>12 мес без релизов — риск** |
| `best-effort-json-parser` | 1.5.1 | BSD-2-Clause | 2026-06-26 | ок, живой |
| `zod` | 4.6.2 (установлен) | MIT | — | ок |

### 6.2 ajv — draft 2020-12 подключается отдельным импортом
```js
import Ajv2020 from "ajv/dist/2020.js";   // НЕ "ajv" — иначе draft-07
import addFormats from "ajv-formats";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
```
`strict: false` обязателен, иначе ajv ругается на неизвестные keyword'ы из провайдерских схем.
`allErrors: true` — иначе вернётся только первая ошибка, а для цикла ремонта нужны все.

Реальный вывод `v.errors` (машиночитаемый, годится для отдачи модели):
```json
[ { "instancePath": "", "schemaPath": "#/additionalProperties", "keyword": "additionalProperties",
    "params": { "additionalProperty": "extra" }, "message": "must NOT have additional properties" },
  { "instancePath": "/id", "schemaPath": "#/properties/id/format", "keyword": "format",
    "params": { "format": "uuid" }, "message": "must match format \"uuid\"" },
  { "instancePath": "/n", "keyword": "minimum",
    "params": { "comparison": ">=", "limit": 1 }, "message": "must be >= 1" },
  { "instancePath": "/kind", "keyword": "enum",
    "params": { "allowedValues": ["a","b"] }, "message": "must be equal to one of the allowed values" } ]
```
ЦЕННО: `params.allowedValues` для enum и `params.additionalProperty` — это готовый материал для
сообщения ремонта («ты вернул `kind: "c"`, допустимы только a, b»). `instancePath` — JSON Pointer,
напрямую ложится в наш `Issue.path`.

### 6.3 jsonrepair — что он реально чинит
Вход: `{"id": "x", "n": 1, kind: 'a', "trail": [1,2,],}`
Выход: `{"id": "x", "n": 1, "kind": "a", "trail": [1,2]}`
→ Чинит: неквотированные ключи, одинарные кавычки, висячие запятые в массиве и в объекте.
(Также по докам: markdown-ограждения ```json, комментарии, спецсимволы, конкатенация строк.)

⚠️ **ГЛАВНАЯ ЛОВУШКА, обнаружена экспериментом.** На ОБРЕЗАННОМ JSON он **не бросает исключение**:
```
вход:  {"id":"x","items":[{"a":1},{"a":
выход: {"id":"x","items":[{"a":1},{"a":null}]}
```
Он молча достраивает `null` и закрывает скобки. То есть **jsonrepair НЕ отличает «модель
налажала с синтаксисом» от «ответ обрезан по max_tokens»** — во втором случае он вернёт
правдоподобный, но ЛОЖНЫЙ объект с дырами из `null`.
→ **Правило исполнителя узла:** проверять `finish_reason`/`stop_reason` ДО вызова jsonrepair.
При `length`/`max_tokens` — ретрай с бОльшим лимитом, ремонт запрещён. Иначе обрезанный ответ
пролезет как валидный и отравит провенанс. Это ровно та развилка из §1.8 / §2.1.

### 6.4 Стадии конвейера (кто на каком шаге)
```
1. constrained decoding (провайдер)  — §1/§2/§3. Дешевле всего; ловит 95% формы.
2. finish_reason gate                — refusal | length | ok. Ветвление ДО любого парсинга.
3. извлечение блока                  — снять ```json-ограждение, взять первый сбалансированный {...}
4. JSON.parse                        — быстрый путь; при успехе шаги 5-6 пропускаются
5. jsonrepair (только если п.2 = ok) — синтаксический ремонт, ОДНА попытка, без LLM
6. Zod .safeParse                    — типы + коэрсия + межполевые проверки (§7). ЕДИНСТВЕННЫЙ
                                       источник истины по типам, т.к. IR и типы TS идут из Zod.
7. LLM-ремонт                        — только если п.6 дал Issue[]; в промпт уходят Issue[], а
                                       не сырое сообщение об ошибке. Лимит попыток из IR.
```
**Где тут ajv, если есть Zod?** Не на пути данных. ajv нужен на ДРУГОМ уровне:
- валидация самого **IR-документа** и конфигов (у них схема живёт как JSON, а не как Zod);
- **валидация схем, пришедших извне** (MCP-клиент прислал JSON Schema инструмента);
- **self-check компилятора**: скомпилировали Zod → JSON Schema → проверяем ajv'ом, что примеры из
  `.meta({examples})` проходят собственную схему. Это дешёвый тест на регрессии профилей.
→ **Вердикт: Zod на горячем пути, ajv на границах и в тестах.** Дублировать валидацию данных
и Zod'ом, и ajv'ом — не надо.

### 6.5 Partial / streaming JSON
Нужен только для UI-стриминга (показывать заполняющийся объект), не для корректности.
- `best-effort-json-parser` (BSD-2, релиз 2026-06) — предпочтителен: живой.
- `partial-json` (MIT) — не обновлялся с мая 2024 → помечаем как риск, не берём в прод.
- **Альтернатива без новой зависимости:** AI SDK (`ai@6`, уже в дереве) экспортирует стриминг
  частичных объектов (`streamObject` → `partialObjectStream`). Раз VoltAgent и так тянет `ai@6`,
  правило «не изобретать велосипед» говорит взять его, а не отдельный парсер.
  UNVERIFIED: точное имя экспорта в `ai@6.0.280` — проверить в `node_modules/ai/dist/index.d.ts`.
- ⚠️ Частичный объект **никогда не должен попадать в workflow state** как результат узла — только
  в канал UI. Иначе получим ту же проблему, что в §6.3.


## 7. Межполевые проверки (BAML assert/check) в Zod 4 → типизированный Issue[]

ПРОВЕРЕНО ЗАПУСКОМ (`repairtest.mjs`), zod@4.6.2.

### 7.1 Аналогия
BAML различает **`@assert`** (нарушение = ошибка парсинга, значение не возвращается) и
**`@check`** (нарушение = метка на значении, значение возвращается вместе со списком
невыполненных проверок). В Zod 4 это моделируется одной механикой — `superRefine` + `ctx.addIssue`
— а различие `assert`/`check` переносим в **наш** слой: поле `severity` в `params`.

### 7.2 superRefine с произвольным путём и метаданными — реальный код и вывод
```ts
const S = z.object({ start: z.number(), end: z.number(), items: z.array(z.object({ ref: z.string() })) })
 .superRefine((val, ctx) => {
   if (val.end <= val.start)
     ctx.addIssue({ code: "custom", message: "end must be > start",
                    path: ["end"], params: { rule: "range", expected: `> ${val.start}` } });
   val.items.forEach((it, i) => {
     if (!it.ref.startsWith("n_"))
       ctx.addIssue({ code: "custom", message: "ref must start with n_",
                      path: ["items", i, "ref"], params: { rule: "prefix" } });
   });
 });
S.safeParse({ start: 5, end: 3, items: [{ref:"x"},{ref:"n_1"}] })
```
Реальный `error.issues`:
```json
[ { "code": "custom", "message": "end must be > start", "path": ["end"],
    "params": { "rule": "range", "expected": "> 5" } },
  { "code": "custom", "message": "ref must start with n_", "path": ["items", 0, "ref"],
    "params": { "rule": "prefix" } } ]
```
КЛЮЧЕВЫЕ ФАКТЫ (подтверждены):
1. `path` — **массив сегментов, включая числовые индексы массивов**. Он сохраняется как есть.
2. **`params` доезжает до `issues` без изменений.** Это наш канал для машиночитаемых метаданных:
   `{ rule, severity: "assert"|"check", expected, nodeId, repairHint }`. Zod ничего с ним не делает.
3. `code: "custom"` — в Zod 4 строка, не enum-импорт.
4. `superRefine` выполняется ТОЛЬКО если базовый разбор объекта прошёл. Ошибки типов и межполевые
   проверки не смешиваются в одном проходе → две попытки ремонта минимум. Если нужны все сразу —
   собирать «мягкую» схему (все поля `.unknown()`/nullable) и валидировать вторым проходом.

### 7.3 Готовые форматтеры ошибок Zod 4
`z.treeifyError(err)` — дерево, зеркалящее форму данных (для подсветки полей во фронте):
```json
{ "errors": [], "properties": {
    "end": { "errors": ["end must be > start"] },
    "items": { "errors": [], "items": [ { "errors": [],
        "properties": { "ref": { "errors": ["ref must start with n_"] } } } ] } } }
```
`z.prettifyError(err)` — готовый ТЕКСТ ДЛЯ МОДЕЛИ, ровно то, что надо класть в промпт ремонта:
```
✖ end must be > start
  → at end
✖ ref must start with n_
  → at items[0].ref
```
→ **Не пишем свой форматтер.** `prettifyError` → в промпт ремонта, `treeifyError` → во фронт,
сырой `issues` → в лог/провенанс. Три потребителя, одна ошибка, ноль своего кода.

### 7.4 Контракт Issue для цикла ремонта (предложение)
```ts
type Severity = "assert" | "check";      // assert: узел падает; check: значение проходит с меткой
interface WorkflowIssue {
  path: (string|number)[];   // прямо из ZodIssue.path
  code: string;              // ZodIssue.code либо наш rule
  message: string;           // человеко/модель-читаемо
  severity: Severity;        // из params.severity, дефолт "assert"
  expected?: string;         // из params.expected — что модель должна была вернуть
  observed?: unknown;        // выдёргиваем по path из сырого ответа
  repairHint?: string;       // из params.repairHint — подсказка именно для LLM-ремонта
}
```
Правила цикла:
- В промпт ремонта уходит **только `severity: "assert"`** + `prettifyError`-текст по ним.
  `check` копятся в провенанс и не тратят попытку.
- **`observed` обязателен** — без «что ты вернул» модель часто повторяет ту же ошибку.
- Число попыток и то, что делать при исчерпании (fail / best-effort / escalate to human) — поле IR
  узла, а не константа в коде.
- Идемпотентность: одинаковый набор `Issue[]` два раза подряд = ремонт не сходится → прерываем
  цикл досрочно, не дожигая бюджет.

### 7.5 Что НЕ выражать в Zod, а гнать в грамматику, и наоборот
- В грамматику (§2.3 «общий знаменатель»): форма, обязательность, enum, типы.
- В Zod: всё межполевое, все числовые/строковые границы, все проверки по внешним данным
  (существование ID в БД — это тоже `superRefine`, но **асинхронный**: `z.ZodType.superRefine`
  принимает async-функцию, тогда нужен `safeParseAsync`). UNVERIFIED: точное поведение
  async-superRefine в 4.6.2 — проверить перед тем, как класть в спеку.


## 8. BAML: состояние, лицензия, вердикт

### 8.1 Факты
- Пакет: **`@boundaryml/baml`**, npm-версия **0.226.2**, лицензия **MIT** (`npm view` — проверено),
  `time.modified = 2026-09-01` → **очень живой проект**, релизы регулярные.
  Go-модуль `github.com/boundaryml/baml` числится под **Apache-2.0** (расхождение лицензий между
  дистрибутивами — UNVERIFIED, при принятии зависимости проверить LICENSE в самом тарболе).
- Зависимости npm-пакета: только `@scarf/scarf` (телеметрия установки) → ядро в нативном бинаре.
- Технология: **SAP — Schema-Aligned Parsing**. Парсер написан на Rust, отдаёт нативные биндинги
  для Python / TypeScript / Ruby / Go.
  Источник: `https://boundaryml.com/blog/schema-aligned-parsing`.
- Что делает SAP: читает то, что реально вернула модель, и **коэрсит в объявленную схему** —
  вытаскивает JSON из markdown-ограждений, чинит висячие запятые и неквотированные значения,
  терпит chain-of-thought ПЕРЕД ответом и markdown ВНУТРИ JSON-строк. То есть не требует
  синтаксически валидного JSON на входе вообще.

### 8.2 Почему это нам интересно
Ровно один сценарий: модели **без** constrained decoding (дешёвые open-weight через OpenRouter,
старые модели, провайдеры без `response_format`). Для них SAP — это разница между «работает» и
«не работает». Для OpenAI/Anthropic/vLLM с грамматикой SAP почти не нужен: форма уже гарантирована.

### 8.3 Почему НЕ брать как зависимость
1. **BAML — это язык и кодогенератор, а не библиотека-парсер.** Рабочий цикл: пишешь `.baml`-файлы,
   запускаешь компилятор, он ГЕНЕРИРУЕТ клиентский пакет с типами и функциями. Это второй источник
   истины по схемам рядом с нашим IR — прямое нарушение «ядро доверия пишем сами».
   Наш IR → Zod → JSON Schema. Добавить BAML = IR → BAML DSL → сгенерённый TS → и ещё Zod сверху.
2. **Парсер не отделён от рантайма.** UNVERIFIED, но по структуре пакета (нативный бинарь +
   генератор) отдельно импортируемого `parse(schema, rawString)` в публичном TS API не видно.
   Использовать «только SAP» без остального BAML — не поддерживаемый режим.
3. **Нативный бинарь** тянет платформенные артефакты в сборку (Next.js/serverless — боль).
4. Дублирование: §6.3 (`jsonrepair`, ISC, чистый JS, 40 КБ) + §7 (Zod-коэрсия) покрывают 90%
   того, ради чего берут SAP, без нативных зависимостей и без второго DSL.

### 8.4 ВЕРДИКТ
**РЕФЕРЕНС, НЕ ЗАВИСИМОСТЬ.** Забираем идеи, не код:
- **разделение `@assert` / `@check`** → наш `Severity` в §7.4 (это лучшая идея BAML, и она
  бесплатная);
- **«схема в промпте важнее схемы в грамматике»** — совпадает с советом vLLM (§3.1);
- **терпимость к chain-of-thought перед JSON** → наш шаг 3 конвейера (§6.4): брать первый
  сбалансированный JSON-блок, а не требовать, чтобы весь ответ был JSON;
- **коэрсия вместо отказа** (строка `"5"` в числовое поле) → в Zod это `z.coerce.number()`,
  включаем точечно на числовых/булевых полях, не глобально.

Пересмотреть решение, если: (а) BoundaryML выпустит отдельный WASM/JS-пакет только с SAP-парсером,
без DSL и без нативных биндингов; (б) доля узлов на моделях без constrained decoding окажется
выше ~30%.


## Итоговые решения (то, что идёт в спеку)

1. **Профиль схемы — свойство пары (IR-схема × провайдер), а не свойство IR.** Минимум три
   профиля: `openai-strict`, `anthropic-strict`, `permissive`/self-hosted. Единой «универсальной
   strict-схемы» не существует: приём, делающий схему валидной для OpenAI (всё required +
   `["T","null"]`), взрывает лимиты Anthropic (24 optional / 16 union). См. таблицу §2.3.
2. **Стиль IR по умолчанию: все поля `required`, опциональность через `null`,
   `additionalProperties:false`, без рекурсии, без числовых и строковых ограничений в схеме.**
   Это пересечение трёх провайдеров, и оно же чинит различие в порядке ключей (§1.6 vs §2.1).
3. **`z.toJSONSchema` — вход, но не выход.** Обязателен собственный слой пост-обработки
   (через опцию `override`): `oneOf → anyOf`, `optional → required + nullable`, разворачивание
   union-корня в объект, вырезание неподдерживаемых ограничений в `description`.
4. **Порядок полей в IR значим** (порядок генерации = порядок «рассуждения»). Компилятор не
   сортирует ключи. Поле обоснования — ПЕРЕД полем решения.
5. **Три исхода вместо одного**: `ok` / `refusal` / `truncated`. Ремонт применим только к `ok`.
   `jsonrepair` на обрезанном ответе молча дописывает `null` (§6.3) — это самая опасная
   найденная ловушка.
6. **Zod на горячем пути, ajv на границах** (валидация IR, внешних JSON Schema, self-check
   компилятора в тестах). Не дублировать.
7. **Цикл ремонта питается типизированным `Issue[]`**, не текстом исключения. `params` в
   `ctx.addIssue` — штатный канал метаданных (проверено). `z.prettifyError` → промпт,
   `z.treeifyError` → фронт. Различие `assert`/`check` (идея BAML) — через `params.severity`.
8. **BAML — референс, не зависимость** (§8.4). Второй DSL рядом с IR несовместим с «ядро доверия
   пишем сами»; `jsonrepair` + Zod-коэрсия покрывают практическую часть.
9. **Allowed-set: enum — не решение при масштабе.** Потолок для UUID — ~400 значений, не 1000.
   Компилятор считает бюджет схемы и падает до запроса. Свыше 1000 — только сужение до вызова.
10. **Схема идёт И в грамматику, И в текст промпта** (совет из доков vLLM, совпадает с идеологией
    BAML). Грамматика гарантирует форму, промпт — смысл.

### Что осталось непроверенным (TODO для следующего захода)
- Точные лимиты Gemini (глубина, число свойств, enum) — Google цифр не публикует, нужен эмпирический замер.
- Поддерживает ли OpenAI strict `minLength`/`maxLength` для базовых (не fine-tuned) моделей — в списке поддерживаемых они не названы явно.
- Сохранён ли в vLLM алиас `guided_json` после переезда на `structured_outputs`.
- Точное имя экспорта частичного стриминга объектов в `ai@6.0.280` (`node_modules/ai/dist/index.d.ts`).
- Поведение async `superRefine` + `safeParseAsync` в zod@4.6.2.
- Расхождение лицензий BAML: npm говорит MIT, Go-модуль — Apache-2.0.
- Время компиляции грамматики XGrammar на больших enum (10k альтернатив).
