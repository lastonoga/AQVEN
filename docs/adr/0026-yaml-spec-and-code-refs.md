# ADR-0026. Описание воркфлоу: YAML на Pydantic-моделях, код по ссылке, сборка в модуль

> Статус: **частично изменено [ADR-0027](0027-dynamic-io-shapes.md)** (2026-09-16)
> Дата: 2026-09-16
>
> ADR-0027 добавляет вид узла `narrow` и встроенные типы `Dynamic` и `FieldSpec`; остальные решения этого ADR действуют.
> Зависит от: [ADR-0017](0017-files-as-source-of-truth.md), [ADR-0019](0019-escape-hatch-rules.md), [ADR-0022](0022-hash-as-version.md), [ADR-0025](0025-python-engine.md)
> Заменяет: [ADR-0018](0018-typescript-authoring.md), включая положение «синтезированный IR коммитится» (§9); [ADR-0023](0023-lexical-references.md)
> Изменяет в части корневого файла, раскладки и правила «промт всегда отдельным файлом»: [ADR-0017](0017-files-as-source-of-truth.md)
> Изменяет в части зависимости от ADR-0018 и момента вычисления хеша: [ADR-0019](0019-escape-hatch-rules.md), [ADR-0020](0020-llm-function-and-adapters.md), [ADR-0022](0022-hash-as-version.md)
> Меняет: [DECISIONS.md](../DECISIONS.md) — разделы «Язык описания воркфлоу: только TypeScript», «Хранение определений: файлы — истина, база — индекс», «Версии: хеш вместо номера», «Escape hatch»; [CLAUDE.md](../../CLAUDE.md); [CONVENTIONS.md](../CONVENTIONS.md) правило 2; [03. Ядро языка](../03-core-language.md) §2.1, §2.2, §2.4, §2.5; [04. Формат IR](../04-ir-schema.md) §1.1, §1.3–§1.5, §2, §2.1 (грамматика `type_ref` получает суффикс `?`), §2.2, §2.5, §3.2, §4.1, §6.1–§6.5; [05](../05-type-system.md); [06](../06-registries.md); [07](../07-compiler.md); [08](../08-prompts.md); [09](../09-context-model.md); [16](../16-data-model.md); [18](../18-export-and-conformance.md); [22](../22-glossary.md); [32](../32-ui-design-brief.md); [files-first/layout.md](../files-first/layout.md) §1–§5; [files-first/migration.md](../files-first/migration.md); [dsl/](../dsl/); [playground/](../playground/README.md)
> Исследование: [research/py-spec-as-code.md](../research/py-spec-as-code.md) §1–§3, §8–§12; [research/py-stack-runtime.md](../research/py-stack-runtime.md) §3.2, §3.5, §9.2, §9.6; [research/py-quality-layer.md](../research/py-quality-layer.md) §3.1, §5, §6.5. Пробы выполнялись вне репозитория 2026-09-16 (CPython 3.14.7, pydantic 2.13.5, ruamel.yaml 0.19.1, python-liquid 2.3.1, uv_build 0.12.15, fastapi 0.141.1); результаты, которых в research нет, приведены в таблице фактов с пометкой «проба ADR-0026»

## Контекст

[ADR-0018](0018-typescript-authoring.md) выбрал TypeScript языком авторинга, потому что кастомная логика
должна быть настоящим кодом с типами. [ADR-0025](0025-python-engine.md) переносит движок на Python, а код
шагов исполняется в процессе движка: TS-авторинг потребовал бы второго рантайма, и кодмод ts-morph, изолят
синтеза и лексические ссылки ([ADR-0023](0023-lexical-references.md)) теряют почву. ADR-0018 коммитил
синтезированный IR, потому что TS-исходник без исполнения не читается; YAML читается как данные, поэтому IR
YAML-воркфлоу становится производным артефактом (§9).

Решения владельца от 2026-09-16, которые оформляет этот ADR: формат — YAML поверх Pydantic-моделей описания
с закрытым набором ключей и JSON Schema для редактора; промты — отдельными файлами; код — Python-функции по
ссылке `module:function`; опционально Python-билдер, материализующийся в тот же IR (как `cdk synth`); узел
`llm` — в форме сигнатуры DSPy (вход, выход и инструкция одной структурой); мультимодальность и проверка
объекта, который вернула модель, обязательны; шаги из чистого кода обязательны; модуль импортируется в чужой
проект или запускается через HTTP/MCP; Monty не берём.

Пробы research/py-spec-as-code.md и py-quality-layer.md шли на CPython 3.12.4, пробы py-stack-runtime.md и
этого ADR — на 3.14.7; ADR-0025 фиксирует 3.14 (открытый вопрос 21).

| Факт | Источник |
|---|---|
| Сигнатура DSPy 3.3.1 — Pydantic-модель; docstring становится `instructions`; `ChatAdapter` сам дописывает входы и выходы с типами и JSON Schema | research/py-spec-as-code.md §1.1–§1.2 |
| Pydantic AI 2.43.0: у `Agent.run` нет типизированного входа (данные — `deps`, медиа — только `user_prompt`); на невалидный выход — `RetryPromptPart` со всеми ошибками, второй ответ принят; `StructuredDict(schema)` ответ не валидирует | research/py-stack-runtime.md §3.2, §3.5; research/py-spec-as-code.md §2; https://pydantic.dev/docs/ai/core-concepts/input/ |
| `TypeAdapter(fn).json_schema()` строит схему аргументов по аннотациям; `pkgutil.resolve_name("mod:attr")` резолвит ссылку | research/py-spec-as-code.md §11 |
| python-liquid 2.3.1 `analyze()` отдаёт переменные, фильтры и теги без рендера | research/py-spec-as-code.md §10 |
| Dagster Components: `defs.yaml` валидируется Pydantic-моделью, выведенной из класса компонента; визуальный редактор Cube работает только с YAML-моделями | research/py-spec-as-code.md §3; [ADR-0018](0018-typescript-authoring.md) |
| `AgentSpec.to_file()` и `Dataset.to_file()` пишут JSON Schema и modeline `# yaml-language-server`; `Dataset.model_json_schema_with_evaluators()` pydantic-evals 2.43.0 отдаёт схему без записи файла | research/py-spec-as-code.md §2; research/py-quality-layer.md §6.5 |
| ruamel.yaml 0.19.1: по умолчанию YAML 1.2; строгий предпроход по событиям и токенам ловит комментарии, якоря, теги, директивы; писатель со строками в двойных кавычках даёт фикспойнт за три прохода и сохраняет порядок отображений. Проба ADR-0026: ключи в порядке модели, `"yes"` и `"012"` остаются строками | research/py-quality-layer.md §5; проба ADR-0026 |
| Дискриминированный union Pydantic по полю `node` даёт в JSON Schema `oneOf` + `discriminator.mapping`; `extra="forbid"` — `additionalProperties: false`; порядок `properties` — порядок объявления полей; лишний ключ `instructions:` в узле — `extra_forbidden` с `loc` `('llm', 'instructions')` | проба ADR-0026; `oneOf` + `discriminator.mapping` также research/py-spec-as-code.md §12.1 |
| `validate_call(fn, validate_return=True)` **не** перепроверяет экземпляр, собранный `model_construct`: список из 6 элементов при `max_length=5` прошёл; `revalidate_instances="always"` его отклоняет | проба ADR-0026 |
| uv_build 0.12.15 кладёт в wheel всё под корнем модуля, включая `.yaml`, `.md`, `.json` и скрытый каталог `.aqven/`; `[tool.uv.build-backend] wheel-exclude = [".aqven"]` исключает каталог целиком (`unzip -l` wheel с настройкой и без) | research/py-stack-runtime.md §9.2; проба ADR-0026 |
| watchfiles 1.2.0: `awatch` с наследником `DefaultFilter` видит `.yaml`, `.prompt.md` и `.py`; `DefaultFilter` сам `.aqven/` не исключает | research/py-stack-runtime.md §9.6; проба ADR-0026 |
| FastAPI 0.141.1 отвечает 422 на тело запроса, не прошедшее Pydantic-модель с `extra="forbid"` | проба ADR-0026, `TestClient` |
| redhat.vscode-yaml (релиз 1.24.0, MIT) по README сопоставляет схемы файлам настройкой `yaml.schemas` по глобам; кроме неё — modeline-комментарий (относительный путь — от файла YAML) и ключ `$schema`. Оба способа, modeline и `yaml.schemas`, известны только из README: запуском в VS Code не проверен ни один | https://github.com/redhat-developer/vscode-yaml/blob/main/README.md, разделы «Using a modeline» и «Using `yaml.schemas`»; открытый вопрос 20 |

## Решение

| Решение | Что берём | Версия | Лицензия | Почему |
|---|---|---|---|---|
| Модели описания, валидация на границах | pydantic | 2.13.5 | MIT | один объект даёт закрытый набор ключей, все ошибки файла за раз и JSON Schema для редактора |
| Чтение и канонический вывод YAML | ruamel.yaml | 0.19.1 | MIT | фикспойнт проверен пробой; YAML 1.2 без norway-bug |
| Шаблоны промта уровня 2 | python-liquid | 2.3.1 | MIT | статический анализ без рендера ([ADR-0029](0029-trust-and-quality-python.md)) |
| Вызов модели с проверкой выхода и повтором | pydantic-ai-slim | 2.43.0 | MIT | цикл `RetryPromptPart` уже есть |
| Резолв `module:function`, сверка сигнатур | `pkgutil.resolve_name`, `inspect`, `ast` из stdlib CPython; `TypeAdapter` из pydantic | 3.14 / 2.13.5 | stdlib / MIT | схема функции строится из аннотаций, свой разбор не пишем |
| Тайпчек кода проекта | pyright, `typeCheckingMode = "strict"` | 1.1.414 | MIT | код сверяется со сгенерированными моделями |
| Сборка модуля | uv_build | 0.12.15 | MIT OR Apache-2.0 | данные под корнем модуля попадают в wheel без настройки |
| Раздача | `fastapi` без extras, mcp (`MCPServer("aqven")`), uvicorn | 0.141.1 / 2.2.0 / 0.53.0 | MIT / MIT / BSD-3-Clause | HTTP и MCP на одном порту проверены запуском; `fastapi[standard]` тянет encode `httpx` |
| Наблюдение за деревом в `aqven dev` | watchfiles | 1.2.0 | MIT | видит `.yaml`, `.md`, `.py`; свой фильтр исключает `.aqven/` |
| Редактор | redhat.vscode-yaml через `yaml.schemas` | 1.24.0 | MIT | автодополнение из JSON Schema без комментариев в файле; запуском не проверено (открытый вопрос 20) |
| Не берём | dspy 3.3.1 (образец сигнатуры), dagster 1.13.22 (образец Components), pyagentspec 26.3.1, baml-py 0.226.2, pydantic-monty 0.0.23, libcst 1.9.0 | — | — | см. «Альтернативы»; libcst не нужен, когда исходник — данные |

### 1. Формат: YAML поверх моделей описания

**Файл — экземпляр модели описания.** Каждый YAML-файл проекта валидируется Pydantic-моделью своего вида
с `extra="forbid"`: неизвестный ключ — ошибка `E_UNKNOWN_KEY` (из `extra_forbidden`), а не молчание. Модели
описания — единственный источник формата: из них генерируется JSON Schema для редактора (§11), их вызывает
компилятор ([07](../07-compiler.md)). Виды — дискриминированный union по `kind`, внутри `Node` — по `node`:
это Registry обработчиков, новый вид узла — ещё одна модель без `if/else` в загрузчике. Прецедент — Dagster
Components.

**Шапка формата.** Каждый файл начинается с `apiVersion: aqven/v1` и `kind`. `apiVersion` — версия **формата
файла**, а не содержимого: идентичность содержимого — `spec_hash` ([ADR-0022](0022-hash-as-version.md)).
В IR `apiVersion` не попадает, поэтому конвертация файла между версиями формата не меняет `spec_hash`. Движок
объявляет множество читаемых версий и одну версию хранения, как `served`/`storage` у CRD Kubernetes;
`aqven fmt` переписывает файл в версию хранения цепочкой конвертеров v1 → v2 → … (Chain of Responsibility).
Неизвестная версия — `E_API_VERSION`. Удаление читаемой версии — ломающее изменение движка.

| `kind` | Путь | Подвид |
|---|---|---|
| `Project` | `aqven.yaml` | — |
| `Type` | `types/<name>.yaml` | `type: record \| enum \| union \| id \| value` |
| `Flow` | `flows/<flow_id>/flow.yaml` | — |
| `Node` | `flows/<flow_id>/nodes/<node_id>.yaml`, тела подграфов — `nodes/<node_id>/<inner>.yaml` | `node: llm \| code \| tool \| human \| const \| seq \| parallel \| map \| switch \| loop \| race \| gate \| try \| call` |
| `Dataset` | `datasets/<name>.yaml` | модель — слой качества ([ADR-0029](0029-trust-and-quality-python.md)) |

Правило подвида одно: ключ с именем вида в нижнем регистре. Несовпадение `kind` и пути — `E_KIND_PATH_MISMATCH`.

Вид узла `narrow` и встроенные типы `Dynamic` и `FieldSpec` добавляет [ADR-0027](0027-dynamic-io-shapes.md);
ключи узла `human` — §13.

**Корень проекта.** Маркер корня — `aqven.yaml`, ищется вверх по дереву; в нём журнал `renames`.
Lock — `aqven.lock.yaml`. Служебный каталог — `.aqven/`: `lock`, `txn/`, `drafts/` (ADR-0017), `cache/`
(развёрнутый вид по 04 §1.5 и IR, §9) и генерируемые схемы редактора `schema/`. `project.yaml` из прежних документов
переименовывается при чистке.

**Нотация типов.** Типы реестра — PascalCase TypeId из имени файла: `types/order.yaml` → `Order`. Встроенные:
скалярные `Text`, `Int`, `Float`, `Bool`, `Date`, `DateTime`; контекст прогона `TimeZone`, `Locale`, `TenantId`
(04 §3.3 п. 5); медиа `Image`, `Audio`, `Video`, `Document` (§6); динамическая форма `Dynamic`, `FieldSpec`
([ADR-0027](0027-dynamic-io-shapes.md)). `Number` из примера 04 §3.2 заменяется на `Int` или `Float`: у них
разные JSON Schema (`integer` и `number`).

Грамматика ссылки — `type_ref` из 04 §2.1 (`^[A-Z][A-Za-z0-9_]{0,62}(\[\])?$`) с одним изменением: суффикс
`?`. 04 §3.3 п. 2 уже пользуется `T?`, а регулярка §2.1 его не допускает; `.optional()` запрещён (05 §1.2),
поэтому отсутствие значения выражается типом, на проводе — `null`. `Image?` — необязательное значение,
`Text[]?` — необязательный список; `T?[]` и `T[][]` не допускаются.

```abnf
type-ref = type-id ["[]"] ["?"]
type-id  = UALPHA *62( ALPHA / DIGIT / "_" )
```

Ограничения — ключевыми словами JSON Schema в camelCase: `maxItems`, `maxLength`, `minimum`, `maximum`,
`pattern`, `enum`.

**Ключи.** Ключи формата — фиксированный набор полей моделей, ASCII, допускают camelCase (`apiVersion`,
`maxItems`). Имена, которые даёт пользователь (узлы, поля, файлы), остаются `^[a-z][a-z0-9_]{0,62}$`.
ASCII-ограничение 04 §1.4 п. 1 сохраняется: ключи IR по-прежнему сортирует JCS. Меняется только регулярка
ключей формата.

**Порядок значим — значит список (04 §1.4 п. 2).** YAML-отображение по спецификации неупорядочено, а порядок
входов определяет текст промта уровня 1, порядок выходов — порядок полей structured output (обоснование перед
решением). Поэтому `in`, `out` и `fields` — списки полей одной формы `{name, type, description, <ограничения>}`.
Второй, короткой формы нет: два формата — два пути в компиляторе.

**Канонический вывод.** Только блочный стиль, строковые значения в двойных кавычках, числа без кавычек, поля
со значением по умолчанию не пишутся. Ключи, известные модели описания, идут в порядке полей Pydantic-модели,
`apiVersion` и `kind` первыми. Отображения, ключи которых даёт пользователь (`branches` у `parallel` и `race`,
`cases` у `switch`, `uses`), и списки (`in`, `out`, `fields`, `variants`) сохраняют порядок автора: порядок
полей — часть семантики ([03](../03-core-language.md) §5 п. 3, обоснование перед решением). Алфавитной
сортировки в файле нет — это заменяет `sortMapEntries: true` из 04 §6.2. Порядок не зависит от прохода записи (ruamel.yaml сохраняет порядок отображений), поэтому фикспойнт держится.
Нормальная форма со всеми полями и `null` (04 §1.3) — это IR, а не файл. Комментарии, якоря, теги, директивы
и блочные скаляры запрещены (04 §6.3); их ловит строгий предпроход ruamel.yaml по событиям и токенам до
загрузки ([research/py-quality-layer.md](../research/py-quality-layer.md) §5). Примеры ниже — в каноническом
виде `aqven fmt`.

**`description` обязателен** у каждого поля `in`, `out`, `fields`, у `Type` и `Flow` — как `type` и
`description` у переменных и выходов Terraform. Это совпадает с 05 §2 и питает промт уровня 1.

### 2. Раскладка проекта-модуля

Каталог проекта — это каталог Python-пакета (в примерах — `src/support_refunds/` рядом с `pyproject.toml`).
Поэтому ссылка `support_refunds.code.refunds:check_refs` резолвится обычным импортом, а YAML и промты едут в
wheel без настройки. Пути файлов видов — таблица §1; в примере типы `order`, `policy`, `policy_id`,
`resolution`, воркфлоу `resolve_refund` с узлами `load_policies`, `resolve` (+ `resolve.prompt.md`) и
`check_refs`, код `code/refunds.py`, датасет `datasets/tickets.yaml`.

| Путь | Что | Коммит |
|---|---|---|
| `aqven.yaml` | `kind: Project`, политики по умолчанию, журнал `renames` | да |
| `aqven.lock.yaml` | пины внешних зависимостей по хешу (layout.md §1) | да |
| `types/`, `flows/<id>/nodes/`, промты, `datasets/` | файлы видов из §1 | да |
| `flows/<id>/flow.yaml` или `flows/<id>/flow.py` | исходник воркфлоу: YAML либо билдер, ровно один из двух | да |
| `code/*.py` | функции шагов `code` и промтов уровня 3 | да |
| `.aqven/cache/` | IR и `spec_hash` каждого воркфлоу (§9), развёрнутый вид и план компиляции (04 §1.5) | нет, генерируется |
| `.aqven/schema/*.schema.json` | JSON Schema моделей описания | нет, генерируется |
| `.aqven/lock`, `.aqven/txn/`, `.aqven/drafts/` | транзакция записи и черновики (ADR-0017) | нет |

**Состав wheel.** В wheel попадают YAML, промты, `code/` и IR каждого воркфлоу из сборки; черновики,
транзакция, lock, схемы редактора и остальной кеш — нет. Проверено только исключение
`wheel-exclude = [".aqven"]` целиком, а оно убирает и IR; способ положить IR в wheel — открытый вопрос 19.

Что меняется в [ADR-0017](0017-files-as-source-of-truth.md):

| Положение ADR-0017 | Теперь |
|---|---|
| Журнал `renames` в `project.yaml` | в `aqven.yaml`, форма записи `{kind, from, to, at}` та же |
| «Промт всегда отдельным файлом» | промт никогда не строка в YAML; уровни 1–2 — файл `.prompt.md`, уровень 3 — функция в `.py` (§4) |
| Дерево определений: `flow.yaml` + `nodes/*.yaml` + промты | плюс `code/*.py` и `flows/<id>/flow.py` (билдер); IR в дерево не коммитится (§9) |
| CAS `expects[{path, file_hash}]`, транзакция `.aqven/txn/`, блокировка `.aqven/lock`, черновики `.aqven/drafts/`, два уровня редактирования, история | этим ADR не меняются |

`types/order.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "Заказ с обращением клиента"
fields:
- name: "order_id"
  type: "Text"
  description: "Номер заказа"
  pattern: "^ORD-[0-9]{6}$"
- name: "message"
  type: "Text"
  description: "Текст обращения клиента"
  maxLength: 4000
- name: "receipt"
  type: "Image?"
  description: "Фото чека, если клиент его приложил"
```

### 3. Узел `llm` — сигнатура

Вход, выход и промт — одна структура, как сигнатура DSPy и LLM-функция `{in, body, out}`
([ADR-0020](0020-llm-function-and-adapters.md)). Элемент `in` несёт и контракт (`type`, `description`),
и привязку (`from`, `via` — грамматика 04 §3.1–§3.2). Компилятор сверяет тип привязки с объявленным
типом (04 §3.3). `out` — анонимная запись; ссылки на неё — `$resolve.out.<поле>`.

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Решение по заявке на возврат"
model_role: "resolver"
prompt: "./resolve.prompt.md"
in:
- name: "order"
  type: "Order"
  description: "Заказ и текст обращения клиента"
  from: "$input"
- name: "policies"
  type: "Policy[]"
  description: "Политики возврата, применимые к заказу"
  from: "$load_policies.out.policies"
out:
- name: "reasoning"
  type: "Text"
  description: "Обоснование со ссылками на пункты политик"
  maxLength: 600
- name: "resolution"
  type: "Resolution"
  description: "Итоговое решение по возврату"
```

Типы примера: `Order` — §2; `Policy` — запись с полями `id: PolicyId` и `text: Text`; `PolicyId` и
`Resolution` (union `refund`, `replace`, `reject`) — [ADR-0027](0027-dynamic-io-shapes.md), случаи 1 и 2.
ADR-0027 дополняет этот же файл ключами `allowed_sets` и `output_contract`.

Остальные поля узла — как в [03](../03-core-language.md) §2.2 (`on_invalid`, `overrides`, `budget`) и
[04](../04-ir-schema.md) §2.2 (`archetype`, `allowed_sets` по [ADR-0006](0006-dynamic-allowed-sets.md),
`output_contract`, `trust_in`). В файле узла `prompt` — ссылка на файл или функцию (§4), а не пин
`{id, version, hash}` из 04 §2.2. Ключа `instructions:` нет.

### 4. Промт: три уровня, строкой в YAML — никогда

`prompt` обязателен и принимает три лексические формы: относительный путь к `<node_id>.prompt.md`, лежащему
рядом с файлом узла (`./resolve.prompt.md`; в билдере путь считается от `flow.py`: `./nodes/resolve.prompt.md`),
`<key>` (общий из `prompts/`, пин в `aqven.lock.yaml`), `pkg.mod:function` (код). Уровни — стратегии
сборки промта (Strategy), уровень определяется содержимым, а не флагом.

| Уровень | Что в `prompt` | Кто собирает текст | Компилятор видит | GEPA оптимизирует | Студия |
|---|---|---|---|---|---|
| 1 | `.prompt.md` без переменных и тегов (`analyze()` пуст) | адаптер ([ADR-0020](0020-llm-function-and-adapters.md)) дописывает входы с описаниями, выходы и блок формата вывода, как `ChatAdapter` DSPy | всё | инструкцию | обычный узел |
| 2 | `.prompt.md` — Liquid-шаблон со слотами, `{% if %}`, `{% for %}` | автор; `{{ output_format }}` ровно один раз (R-T6) | переменные, ветки, фильтры; каждая переменная — объявленный вход, неиспользуемый вход — ошибка (03 §2.2 п. 1) | текстовые куски | обычный узел |
| 3 | `pkg.mod:function` | функция проекта от типизированных входов | только типы `in`/`out` и сигнатуру функции | нет | метка «промт собран кодом» |

Уровень 2:

```liquid
Прими решение по заявке на возврат заказа {{ order.order_id }}.
{% if order.receipt %}Сверь сумму и дату с фото чека.{% endif %}
Политики:
{% for policy in policies %}- {{ policy.id }}: {{ policy.text }}
{% endfor %}
{{ output_format }}
```

Правило [ADR-0019](0019-escape-hatch-rules.md) «код даёт значение, но не форму» на уровне 3 сохраняется:
функция возвращает нейтральный отрисованный промт (ADR-0020) и не может добавить или убрать вход или выход.
Медиазначение в текст не рендерится ни на одном уровне: адаптер передаёт его частью сообщения
(в Pydantic AI 2.43.0 медиа принимается только в `user_prompt`), в шаблоне уровня 2 оно доступно только
в условии; `{{ order.receipt }}` — ошибка компиляции.

### 5. Шаг `code` — функция по ссылке

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "code"
description: "Проверяет, что возврат назначен по одной из переданных политик"
run: "support_refunds.code.refunds:check_refs"
determinism: "pure"
in:
- name: "resolution"
  type: "Resolution"
  description: "Решение модели"
  from: "$resolve.out.resolution"
- name: "policy_ids"
  type: "PolicyId[]"
  description: "Политики, переданные модели"
  from: "$load_policies.out.policies[*].id"
out:
- name: "policy_known"
  type: "Bool"
  description: "Политика возврата есть среди переданных модели"
```

```python
from support_refunds.models import Refund, Resolution
from support_refunds.models.resolve_refund import CheckRefsOut


def check_refs(resolution: Resolution, policy_ids: list[str]) -> CheckRefsOut:
    if not isinstance(resolution, Refund):
        return CheckRefsOut(policy_known=True)
    return CheckRefsOut(policy_known=resolution.policy in policy_ids)
```

| Проверка `aqven check` | Механизм | Диагностика |
|---|---|---|
| Ссылка резолвится | `pkgutil.resolve_name` | `E_CODE_REF_UNRESOLVED` |
| Имена параметров = имена `in` | `inspect.signature` | `E_CODE_SIGNATURE_MISMATCH` |
| Схема параметров совместима с типами `in` | `TypeAdapter(fn).json_schema()` против схемы, собранной из `in`, без `title` | `E_CODE_SIGNATURE_MISMATCH` с диффом схем |
| Схема возврата совместима с `out` | `TypeAdapter(get_type_hints(fn)["return"]).json_schema()` | `E_CODE_SIGNATURE_MISMATCH` |
| Выход ограничен (R-42) | границы в `out` | правило R-42 |
| Класс детерминированности объявлен | `determinism: pure \| stable \| volatile`, при `stable` — `ttl_ms` | ADR-0019 п. 5 |
| Docstring у функции отсутствует | `ast.get_docstring` | `E_DOCSTRING` |
| Типы кода согласованы со сгенерированными моделями | pyright 1.1.414 strict по `code/` | ошибка pyright |

Расхождение ловится до запуска: у параметра `list[int]` при объявленном массиве строк схемы элементов
`{"type": "integer"}` и `{"type": "string"}` различаются; схема возврата несёт `maxItems` из
`Field(max_length=...)` (проба ADR-0026). Эффекты (сеть, база) — узел `tool`, не `code`
([03](../03-core-language.md) §2.1). Генерация аудио и видео — шаг `tool` или `code`.

### 6. Медиатипы и совместимость с моделью

Компилятор сверяет медиатипы `in`/`out` узла `llm` с объявленными возможностями профиля модели роли
(каталог и пробы, [11](../11-providers.md) §5). Модель вызова — Pydantic AI 2.43.0 (дока Input и Output).

| Случай | Результат |
|---|---|
| `Image` на входе | компилируется, если профиль объявляет вход-изображение (есть у всех основных провайдеров) |
| `Audio` на входе | только при профиле с аудио-входом (OpenAI, Google); у Anthropic, Bedrock, Mistral нет → `E_MODALITY_UNSUPPORTED` |
| `Video` на входе | только Google и Bedrock → иначе `E_MODALITY_UNSUPPORTED` |
| `Document` на входе | компилируется; у Anthropic и Mistral — только PDF, MIME значения проверяется на границе узла в рантайме |
| `Image` на выходе | только при профиле генерации изображений (`output_type=BinaryImage`) |
| `Audio` или `Video` на выходе `llm` | не компилируется никогда: аудио-выход у Pydantic AI только в realtime, видео-выхода нет |

Динамическая форма входа и выхода (`schema_from`, `narrow`) — [ADR-0027](0027-dynamic-io-shapes.md);
здесь описана только статическая форма.

### 7. Валидация на каждой границе

| Граница | Что проверяется | Чем | Реакция |
|---|---|---|---|
| Загрузка файла | ключи, типы значений, `apiVersion`, `kind` | модель описания, `extra="forbid"` | все ошибки файла сразу, путь и `loc` |
| Дерево | ссылки, типы привязок, модальности, сигнатуры `code` | компилятор, `TypeAdapter` | `aqven check` |
| Вход воркфлоу | значение типа `input` | сгенерированная модель | отказ до старта DBOS-workflow |
| Вход узла | значения `in` | модель входа узла | узел не стартует |
| Выход `llm` | объект ответа | `output_type` Pydantic AI; strict — [ADR-0029](0029-trust-and-quality-python.md) | ошибки → `RetryPromptPart` и повтор; `truncated` не чиним ([ADR-0005](0005-three-call-outcomes.md)) |
| Выход `code`, `tool` | возвращённое значение | модель выхода с `revalidate_instances="always"` | ошибка узла |
| Ответ человека | payload `run_resume`, срок ожидания | модель типа `form` узла `human` (§13); `deadline_at` — в API до отправки ответа и в workflow при получении; модель формы — тоже в обоих местах | в API — отказ операции, прогон не тронут; в workflow поздний или не прошедший модель формы ответ отбрасывается с событием `node_answer_ignored`, ожидание продолжается |
| Выход воркфлоу | значение `output` | сгенерированная модель | ошибка прогона |
| HTTP и MCP | тело запроса, аргументы тула | те же модели до вызова исполнителя | 422 / ошибка тула |

`revalidate_instances="always"` обязателен: без него `validate_call(..., validate_return=True)` пропускает
экземпляр, собранный `model_construct`, в обход ограничений. `StructuredDict` не используем — он не
валидирует. Выражения ограничены закрытой грамматикой проекций 04 §3.2 и предикатами `switch`; всё сложнее —
шаг `code`; Monty (pydantic-monty 0.0.23) не берём.

### 8. Python-билдер — опционально, в тот же IR

`flows/<id>/flow.py` вместо `flow.yaml`: функция `build() -> Flow` вызывается при `aqven check` и
`aqven build` ровно один раз, в изолированном чистом шаге, и возвращает модели описания; дальше путь общий —
компилятор, IR, хеш. Модель та же, что у `cdk synth`; что из результата билдера коммитится — открытый
вопрос 18. Типы — аннотации Pydantic, которые компилируются в нотацию типов §1.

| Python | YAML |
|---|---|
| `str`, `int`, `float`, `bool` | `Text`, `Int`, `Float`, `Bool` |
| `datetime.date`, `datetime.datetime` | `Date`, `DateTime` |
| `list[T]`, `T \| None` | `T[]`, `T?` |
| `Field(max_length=n)` на `str` / на `list` | `maxLength` / `maxItems` |
| `Field(ge=a, le=b)`, `Field(pattern=p)`, `Literal[...]` | `minimum`, `maximum`, `pattern`, `enum` |
| `TimeZone`, `Locale`, `TenantId`, `Image`, `Audio`, `Video`, `Document`, `Dynamic`, `FieldSpec` из модуля движка | те же имена |
| класс сгенерированной модели типа реестра | TypeId |

```python
from aqven.spec import In, LlmNode, Out, Signature, llm

from support_refunds.models import Order, Policy, Resolution


class Resolve(Signature):
    order: Order = In(description="Заказ и текст обращения клиента")
    policies: list[Policy] = In(description="Политики возврата, применимые к заказу")
    reasoning: str = Out(description="Обоснование со ссылками на пункты политик", max_length=600)
    resolution: Resolution = Out(description="Итоговое решение по возврату")


def resolve() -> LlmNode:
    return llm(
        "resolve",
        Resolve,
        model_role="resolver",
        prompt="./nodes/resolve.prompt.md",
        bind={"order": "$input", "policies": "$load_policies.out.policies"},
    )
```

Правила билдера:

- **Docstring запрещён** — это комментарий. Движок, в отличие от DSPy, не читает `__doc__` как инструкцию;
  инструкция живёт в `.prompt.md`. Docstring у `Signature` или функции шага — `E_DOCSTRING`: он выглядит как
  инструкция, а молча игнорируется.
- **Идентификатор узла — явная строка**, первый аргумент фабрики: переименование переменной в IDE не должно
  молча менять `node_id` (урок CDK из ADR-0023).
- **Ссылки — строки грамматики 04 §3.1**, как в YAML: pyright не выражает типы проекций, межузловые типы
  проверяет компилятор ([research/py-spec-as-code.md](../research/py-spec-as-code.md) §9).
- **Чистота.** Сеть, файлы вне объявленных промтов, время, случайность и данные пользователя в `build()`
  запрещены (ADR-0019 п. 3). Принуждение без изолята — открытый вопрос 5; обязательная проверка — две сборки
  в разных процессах с разным `PYTHONHASHSEED` дают идентичный IR.
- **Канвас — только чтение** с плашкой «собран кодом, правьте в редакторе» (урок Cube). YAML-воркфлоу канвас
  правит через `flow_patch` ([ADR-0017](0017-files-as-source-of-truth.md)); кодмод не нужен.

### 9. IR — производный артефакт, не коммитится

`aqven check` и `aqven build` вычисляют IR каждого воркфлоу — нормальную форму 04 §1.3 — и считают `spec_hash`
из канонического IR (04 §4.2). IR кешируется в `.aqven/cache/`, входит в wheel (§2), `aqven dev` пересчитывает
его на сохранение (§10). Для `flow.yaml` IR получается без исполнения кода проекта; для `flow.py` — через
`build()` в изолированном чистом шаге (§8), и коммитить ли его материализованный YAML или IR — открытый вопрос 18.

IR YAML-воркфлоу не коммитится. YAML читается без исполнения кода: индексатор, студия и семантический дифф по
истории git строят IR из файлов ревизии сами, а закоммиченная копия удваивает дифф каждой структурной правки и
конфликты слияния. Это отменяет положение ADR-0018 «синтезированный IR коммитится»: там TS-исходник без
исполнения не читался, и без IR теряли вход семантический дифф, канвас, `spec_hash`, кассеты, бандл и
kill-критерий 14. При YAML первые четыре получают IR из файлов, а бандл и kill-критерий 14 отменены вместе с
экспортом ([ADR-0025](0025-python-engine.md)). Следствие: IR прошлой ревизии строит текущий движок, поэтому он
читает все `apiVersion` из истории релизов (§1).

### 10. Сборка, раздача, разработка

| Команда | Что делает | Сеть и модели |
|---|---|---|
| `aqven fmt` | канонический YAML на месте, конвертация в версию хранения | нет |
| `aqven check` | YAML или `build()` билдера → модели описания → компилятор (ссылки, типы, `analyze()` промтов) → резолв `run` и `prompt` → сверка сигнатур → модальности → сгенерированные модели → pyright strict по `code/` → IR и `spec_hash` в `.aqven/cache/` | нет |
| `aqven plan` | семантический дифф IR против последнего релиза (04 §7) и статус гейтов ([13](../13-evals-and-gates.md)) | нет, гейты — по сохранённым экспериментам |
| `aqven build` | check → типизированные точки входа → wheel через uv_build, с IR | нет |
| `aqven serve` | FastAPI 0.141.1 и `MCPServer` из mcp 2.2.0 на одном порту | да |
| `aqven dev <путь>` | студия, API ([ADR-0028](0028-studio-api-contract.md)) и watchfiles, пересборка на сохранение | да |

Использование модуля: `from support_refunds import flows`, затем
`await flows.resolve_refund.run(Order(...))`. Клиент не на Python — `aqven serve` и клиент из OpenAPI.

### 11. Схемы редактора и практики «инфраструктура как код»

Образцы практик — [research/py-spec-as-code.md](../research/py-spec-as-code.md) §8: CRD Kubernetes (§1),
Terraform `fmt` → `validate` → `plan` ([ADR-0016](0016-git-as-release-boundary.md), §10), `description` у
переменных (§1), коммит `.terraform.lock.hcl` (`aqven.lock.yaml`), `cdk synth` (§9; IR, как `cdk.out`, не
коммитится). Журнал `renames` — аналог `moved { from, to }`: append-only, удаление записи — ломающее изменение.

**Схемы редактора.** JSON Schema каждого вида (`Project`, `Type`, `Flow`, `Node`, `Dataset`) генерирует движок
из Pydantic-моделей описания в `.aqven/schema/<kind>.schema.json`. Схема датасета — из
`Dataset.model_json_schema_with_evaluators()` pydantic-evals 2.43.0 с полями заголовка, а не из `to_file()`,
который пишет modeline ([ADR-0029](0029-trust-and-quality-python.md)). С файлами схемы связывает настройка
`yaml.schemas` в `.vscode/settings.json` проекта: ключ — путь схемы от корня workspace
(`src/support_refunds/.aqven/schema/node.schema.json`), значение — глоб пути вида из таблицы §1
(`src/support_refunds/flows/*/nodes/**/*.yaml`); её пишет инструментарий aqven вместе со схемами.
Modeline-комментарий не используем: комментарии запрещены каноническим YAML. Ключ `$schema` не используем:
он расширил бы закрытый набор ключей формата. Механизм `yaml.schemas` запуском не проверен — открытый вопрос 20.

### 12. Что остаётся от ADR-0018 и ADR-0023

| Идея | Судьба | Где теперь |
|---|---|---|
| IR — единственный машинный артефакт, хеш по канонической форме | остаётся | IR в `.aqven/cache/` и в wheel, 04 §4.2 |
| Синтезированный IR коммитится (расхождение с CDK) | отменено | IR YAML-воркфлоу производный и не коммитится; для билдера — открытый вопрос 18 (§9) |
| Синтез — чистая функция, билдер вызывается один раз | остаётся для билдера | §8 |
| Данные пользователя не попадают в фазу построения | остаётся | фаза сборки, ADR-0019 п. 3 |
| Видимая плашка вместо тихой деградации канваса | остаётся | воркфлоу на билдере |
| Идентификатор узла — явная строка, а не имя переменной | остаётся | имя файла в YAML, первый аргумент в билдере |
| TS — единственный язык авторинга, YAML не вводится | отменено | YAML — основной формат |
| Кодмод ts-morph на декларативном подмножестве, три состояния воркфлоу | отменено | два состояния: YAML (канвас правит) и билдер (только чтение) |
| Лексические ссылки, топологический порядок объявлений, ацикличность как свойство языка | отменено | строки 04 §3.1; ацикличность — снова правило компилятора (04 §3.3 п. 8) |
| Типы — zod в `types/*.ts` | отменено | `types/*.yaml` → Pydantic-модели |

### 13. Узел `human` — форма, срок, политика таймаута

Ожидание человека исполняется на примитивах DBOS — решение владельца от 2026-09-16,
[ADR-0025](0025-python-engine.md) §9. Здесь — только ключи файла узла; событие ожидания, топик, резюм и
проверка срока описаны там.

`flows/resolve_refund/nodes/approve_refund.yaml`:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "human"
description: "Оператор подтверждает решение по возврату"
form: "RefundApproval"
assignee: "refund_operator"
timeout_seconds: 86400
on_timeout:
  policy: "escalate"
  assignee: "refund_lead"
  timeout_seconds: 14400
in:
- name: "order"
  type: "Order"
  description: "Заказ и текст обращения клиента"
  from: "$input"
- name: "resolution"
  type: "Resolution"
  description: "Решение модели, которое подтверждает оператор"
  from: "$resolve.out.resolution"
```

`RefundApproval` — `types/refund_approval.yaml`, запись с полями `verdict` (`Text`, `enum: ["approve", "reject"]`)
и `comment` (`Text`, `maxLength: 400`).

| Ключ | Тип | Обязателен | Что задаёт |
|---|---|---|---|
| `form` | TypeId записи реестра | да | тип ответа. JSON Schema его модели Pydantic — `form_schema` события ожидания; payload `run_resume` проверяется той же моделью (§7); выход узла — значение этого типа (`$approve_refund.out.verdict`), ключа `out` у узла нет |
| `assignee` | `Text` | да | адресат ожидания в событии и в индексе ждущих прогонов |
| `timeout_seconds` | `Int`, `minimum: 1` | да | срок: `deadline_at` = начало ожидания + срок; дедлайн — выход шага DBOS и переживает перезапуск процесса |
| `on_timeout` | запись, дискриминатор `policy` | да | политика по истечении срока, таблица ниже |
| `in` | список полей, как у `llm` (§3) | нет | данные для человека — `suspend_data` события ожидания |

| `policy` | Ключи варианта | Исход |
|---|---|---|
| `fail` | — | узел падает, прогон завершается ошибкой |
| `default` | `value` — значение типа `form` | узел завершается значением `value`; `aqven check` проверяет его моделью `form` |
| `escalate` | `assignee`, `timeout_seconds` | вторая попытка ожидания для нового адресата со своим сроком; её истечение — исход `fail` (в пробе ADR-0025 §9 молчание после эскалации завершило прогон ошибкой) |

Политики — Strategy: таблица обработчиков по `policy` исполняется внутри DBOS-workflow, внешнего планировщика нет.
`on_timeout` — дискриминированный union по `policy`, у каждого варианта закрытый набор ключей (§1). Отличия от
прежних документов: один тип `form` вместо пары `form` и `resume` ([03](../03-core-language.md) §2.5), срок —
`timeout_seconds`, а не длительность `timeout`; адресат эскалации — ключ варианта, а не `on_timeout_target`
([04](../04-ir-schema.md) §2.5).

## Альтернативы

| Альтернатива | Почему отвергнута |
|---|---|
| TypeScript-авторинг, как в ADR-0018 | Код шагов исполняется в процессе Python-движка (ADR-0025); TS-исходник потребовал бы второго рантайма ради синтеза и кодмода, которые при YAML не нужны |
| YAML и TS одновременно (модель Cube) | Два формата — постоянный налог: у Cube валидатор, транспайлер и YAML-ветка синхронизируются руками (ADR-0018); TS-код к тому же не исполняется Python-движком |
| Свой DSL по образцу BAML (baml-py 0.226.2, MIT) | Свой парсер, форматтер и языковой сервер; у BAML ядро на Rust и нативные колёса под платформы; динамические типы `@@dynamic` + `TypeBuilder` не работают через OpenAPI. YAML + JSON Schema даёт редактор даром |
| Полностью код (pydantic-graph 2.43.0, LangGraph 1.2.11) | Граф — исполняемый код: канвас не правит (урок Cube), статический анализ рвётся на динамике, pyright не выражает типы проекций; бета-билдер pydantic-graph без сохранения состояния. Остаётся как опциональный билдер, материализующийся в IR |
| Open Agent Spec как нативный формат (pyagentspec 26.3.1, Apache-2.0 OR UPL-1.0, 420★) | Чужой словарь `component_type` без наших гарантий: allowed-set (ADR-0006), три исхода (ADR-0005), классы детерминированности и эффекты (ADR-0019, 03 §2.1), R-42; семантика привязана к внешней спецификации. Экспорт в другие фреймворки отменён решением владельца от 2026-09-16 ([ADR-0025](0025-python-engine.md)), интеграция — HTTP и MCP |
| `AgentSpec` Pydantic AI (`Agent.from_file`) как формат узла | Описывает одного агента, а не граф; схема выхода по доке AgentSpec — подсказка модели, а не проверка; колбэки и toolset-объекты в спеку не пишутся |
| YAML с языком выражений (Microsoft Declarative Workflows, agent-framework-declarative 1.0.4, Power Fx) | Язык выражений внутри YAML — второй язык без типов нашего реестра; решение владельца от 2026-09-16 ([ADR-0025](0025-python-engine.md)): закрытые проекции 04 §3.2 и `switch`, остальное — шаг `code` (§7) |
| `in`/`out` отображением `name: Type`, как в сигнатуре DSPy | Порядок полей семантичен, а отображение YAML по спецификации неупорядочено, JCS в хеше IR и `jsonb` в индексе порядок ключей не сохраняют; нарушает 04 §1.4 п. 2 |
| Коммитить IR каждого воркфлоу (`flows/<id>/flow.ir.json`), как ADR-0018 | YAML читается без исполнения кода, поэтому IR в git не даёт индексатору и диффу нового входа, а каждая структурная правка даёт два диффа и два источника конфликтов слияния; изменения нормальной формы ревьюеру показывает семантический дифф `aqven plan` |
| Алфавитная сортировка ключей файла (`sortMapEntries: true`, 04 §6.2) | Ломает семантический порядок пользовательских отображений (03 §5 п. 3) и уводит `apiVersion` и `kind` из начала файла; фикспойнт держится и без сортировки |

## Последствия

**Положительные.** Claude Code и человек правят определения нативными инструментами без кодмода; канвас
правит YAML через `flow_patch`. Неизвестный ключ, опечатка в типе и расхождение сигнатуры функции ловятся
до запуска и без сети. Редактор подсказывает ключи из той же модели, что валидирует файл. Модуль — обычный
wheel: импорт или HTTP/MCP. Формат эволюционирует конвертацией, не трогая `spec_hash`. Дифф PR по
YAML-воркфлоу — только исходник, без второй копии в IR.

**Отрицательные.** Списки полей многословнее сигнатуры DSPy. Ревьюер не видит в PR нормальную форму со
значениями по умолчанию — её изменения показывает семантический дифф `aqven plan`. Индексатор и дифф по истории пересчитывают IR каждой
ревизии, а движок обязан читать все версии формата из истории. Pyright не проверяет межузловые ссылки: их
держит компилятор. Чистоту билдера в Python нечем принудить так же жёстко, как изолятом. Воркфлоу на билдере
в студии только читаются.

**Обязательства.** Модели описания с `extra="forbid"` для каждого вида; генерация JSON Schema и
`yaml.schemas`; канонический писатель на ruamel.yaml с фикспойнтом в CI; сверка сигнатур `code`; проверка
модальностей по профилю; `revalidate_instances="always"` на моделях выходов; IR в wheel без черновиков,
транзакции и lock; две сборки билдера с разным `PYTHONHASHSEED`; при чистке 04 §6.2 `sortMapEntries: true`
заменяется порядком модели и автора (§1).

### Документы, которые становятся неверными

| Документ | Раздел: что неверно |
|---|---|
| [DECISIONS.md](../DECISIONS.md) | «Хранение определений», стр. 147: журнал `renames` в `project.yaml` → `aqven.yaml`; «Язык описания воркфлоу: только TypeScript» — весь раздел: YAML не вводится, синтез TS, `Ref<T>`, изолят, кодмод, замеры; «Версии: хеш вместо номера», «Escape hatch»: «вычисляется при синтезе», «фаза синтеза» → сборка; «Human-in-the-loop»: «моделью `resume` узла `human`» → модель типа `form` (§13) |
| [CLAUDE.md](../../CLAUDE.md) | стр. 21–22: «промт — отдельным файлом» без уровней 1–3, на уровне 3 промт — функция в `.py`; стр. 25: `project.yaml` → `aqven.yaml`; стр. 42, 46–47: нет правила про docstring, строгий TS → pyright strict для кода проекта (вместе с ADR-0025) |
| [CONVENTIONS.md](../CONVENTIONS.md) | стр. 13, правило 2: запрет комментариев назван только для `//` и `/* */`; нет `#` и docstring |
| [adr/README.md](README.md); ADR-0018, ADR-0023 | строки 0018, 0023: пометка «⚠️ заменено 0026»; статус ADR-0018 и ADR-0023: «заменено ADR-0026» |
| [ADR-0019](0019-escape-hatch-rules.md) | шапка «Зависит от ADR-0018» → 0026; «Правило третье»: синтез → сборка; строка `authoring: "ts"` в таблице уровней → билдер |
| [ADR-0020](0020-llm-function-and-adapters.md) | шапка: зависимость; строка BAML «отдельный язык вне TypeScript»: довод |
| [ADR-0022](0022-hash-as-version.md) | шапка: зависимость; «вычисляется при синтезе», «Два синтеза»: момент вычисления |
| [03. Ядро языка](../03-core-language.md) | §2.1: проверка чистоты `code` через `globalThis`, `Date.now`, `Math.random`; §2.2: поля `template`, `slots`, `out: TypeRef`, компиляция в `andAgent`; §2.4: `fn: CodeRef`, «сигнатура TS выведена из `in`/`out`» → `run` + `TypeAdapter`; §2.5: пара `form`/`resume`, `timeout` длительностью, таймаут на pg-boss → `form`, `timeout_seconds`, `on_timeout` (§13) |
| [04. Формат IR](../04-ir-schema.md) | §1.1: поле `version` (ещё и против ADR-0022); §1.3: нормальная схема описана как форма файла, теперь это IR; §1.4 п. 1: регулярка ключей не допускает `apiVersion`, `maxItems`; §1.5: нет `flow.py`, `code/`, IR в `.aqven/cache/` |
| 04 | §2, §2.1: ajv-код на TS, `type_ref` без суффикса `?`, медиатипов и `Dynamic`, `node_common.in` — слоты, `out` — TypeRef; §2.2: `prompt {id, version, hash}` обязателен; §2.5: строка `code` `fn` и `pure: true` → `run` и `determinism`, строка `human` `on_timeout_target` и планировщик pg-boss → вариант `escalate` (§13); §3.2: `Number[]` в примере подъёма → `Int[]` или `Float[]`; §4.1: журнал `renames` в `project.yaml` → `aqven.yaml` |
| 04 | §6.1, §6.2, §6.4: направление `YAML → JS → ajv + zod`, `YAML_CANON` на npm `yaml` и `sortMapEntries: true` → порядок модели и автора (§1), fast-check; §6.3 п. 1, §6.5: довод про `sortMapEntries` — ключи файла больше не сортируются |
| [05. Система типов](../05-type-system.md) | §1, §1.1, §1.2: `TypeDecl`, `defineRecord` на TS, столбец и запреты Zod; §2, §9: описания через `.describe()` и тайпчекер TS, пакет реестра на tsdown |
| [06. Реестры](../06-registries.md) | §1.1, §3.3, §5.2: `RegistryRef<K>` и код агента и тула на TS; форма файлов `models/`, `tools/`, `agents/` |
| [07. Компилятор](../07-compiler.md) | §1: нет этапов загрузки моделей описания, сверки сигнатур `code`, проверки модальностей, pyright; §3, §3.2, §4: нет новых диагностик, визитор по AST liquidjs, TS-тип ошибки и правило Biome; §7.4: построитель рантайма и кодогенератор на TS |
| [08. Промты](../08-prompts.md) | §2: liquidjs → python-liquid (ADR-0029); §3, §6: нет уровней 1 и 3, на уровне 1 блок формата вывода дописывает адаптер |
| [09. Модель контекста](../09-context-model.md) | «Решения», стр. 20: «Источник истины — БД, YAML только транспорт» (противоречит ещё ADR-0017); §2, §3.1: «схема (zod)», zod и ajv на границах |
| [16. Модель данных](../16-data-model.md); [18. Экспорт и конформанс](../18-export-and-conformance.md) | 16 стр. 1627, 1646: `project.yaml` в дереве и таблице файлов; 18 стр. 621: журнал `renames` в `project.yaml` |
| [22. Глоссарий](../22-glossary.md) | §1, §2.5: пакеты `@aqven/*`; нет терминов «сборка модуля», «сигнатура узла», «уровень промта», `apiVersion`/`kind` |
| [32. Бриф дизайна UI](../32-ui-design-brief.md) | стр. 328: «ошибка синтеза» → ошибка сборки |
| [files-first/layout.md](../files-first/layout.md) | «Решения», §1: `project.yaml`, нет `code/`, `flow.py`, `.aqven/schema/`, IR в `.aqven/cache/`, «промты — всегда отдельный файл» без уровня 3; §2, §3, §4: промты без уровней, таблица форматов без `.py`, журнал в `project.yaml`; §1, §5: подкаталоги `types/enums/`, `types/entities/`, `types/views/` и ссылка на тип snake_case-ключом `type: hotel` против PascalCase TypeId из имени файла |
| [files-first/migration.md](../files-first/migration.md) | стр. 41: направление `YAML → JS → ajv + zod → JSONB` |
| [research/py-spec-as-code.md](../research/py-spec-as-code.md) | §8, строка AWS CDK: «IR `flow.ir.json` коммитится, в отличие от `cdk.out`» → IR производный (§9) |
| [dsl/](../dsl/) | все файлы (`00-linq-note`, `canvas-edit`, `code-node`, `cube-transfer`, `real-di`, `refs-codemod`, `refs-form`, `refs-types`, `shape`, `type-ergonomics`): TS-DSL; остаются историей с пометкой о замене. Полезны: `refs-form.md` (IR на строковых ссылках), `code-node.md` (значение, а не форма), `cube-transfer.md` (урок Cube) |
| [playground/](../playground/README.md) | README стр. 20–21, 58: сервер на Hono, синтез `hotel_pitch`; [scope.md](../playground/scope.md) §4: скан `**/*.flow.ts` и синтез; [build-order.md](../playground/build-order.md) §1, §4, §7: `@aqven/dsl`, zod-схема IR, drizzle, кодмод; [data.md](../playground/data.md) §2, §4: фиктивный провайдер на zod → Pydantic AI `FunctionModel`, liquidjs; [shell.md](../playground/shell.md) §1 стр. 15–17, §2: синтез `src/**/*.flow.ts` в изоляте, `node:http`; [01-graph-rendering-rules.md](../playground/01-graph-rendering-rules.md) стр. 15: «выводится при синтезе» → при сборке |

## Проверка

- **Фикспойнт YAML.** `aqven fmt` трижды по примеру проекта, включая `switch` с `cases` в неалфавитном
  порядке: байты каждого `.yaml` после второго и третьего прохода совпадают, для уже канонического файла — с
  первым; порядок `cases` остаётся авторским.
- **Закрытый набор ключей.** `instructions:` в узле → `E_UNKNOWN_KEY` с путём файла и ключа, `aqven check`
  завершается ненулевым кодом; все ошибки файла в одном отчёте.
- **Сверка сигнатур.** В `check_refs` меняем `list[str]` на `list[int]` → `E_CODE_SIGNATURE_MISMATCH` с диффом
  схем; переименованный параметр и лишний параметр → то же; несуществующая функция → `E_CODE_REF_UNRESOLVED`.
- **Модальности.** `out` с `Video` у `llm` не компилируется; `Audio` во входе при роли с профилем Anthropic →
  `E_MODALITY_UNSUPPORTED`.
- **Возврат в обход валидации.** Функция возвращает экземпляр через `model_construct` с нарушенным `maxItems` →
  узел падает ошибкой валидации, значение не уходит дальше.
- **Состав wheel.** `unzip -l dist/*.whl` содержит `aqven.yaml`, `flows/resolve_refund/flow.yaml`,
  `nodes/resolve.prompt.md`, `code/refunds.py` и IR `resolve_refund` из сборки и не содержит `.aqven/drafts/`,
  `.aqven/txn/`, `.aqven/lock`, `.aqven/schema/`; в чистом venv на 3.14 точка входа запускается с
  `FunctionModel` без сети и читает промт и IR из пакета.
- **IR производный.** После `aqven build` `git status` и `git ls-files` не показывают IR; свежий клон после
  `aqven check` получает тот же `spec_hash`, что у автора.
- **Автодополнение.** В VS Code с redhat.vscode-yaml и схемами, подключёнными через `yaml.schemas` без
  modeline, в `nodes/*.yaml` после `node: "llm"` подсказываются `model_role`, `prompt`, `in`, `out`; неизвестный
  ключ подчёркивается.
- **Билдер и YAML дают один IR.** Один и тот же воркфлоу в `flow.yaml` и в `flow.py` → побайтово одинаковый
  канонический IR и одинаковый `spec_hash`.
- **Детерминизм билдера.** Две сборки в разных процессах с разными `PYTHONHASHSEED` → идентичный IR.
- **Docstring.** Docstring у `Signature` или у `check_refs` → `E_DOCSTRING`.
- **Узел `human`.** `on_timeout` с `policy: "default"` и `value`, не проходящим модель `form`, → `aqven check`
  завершается ненулевым кодом; ключ `value` у варианта `escalate` → `E_UNKNOWN_KEY`; `form_schema` события ожидания
  равна JSON Schema модели `form`.
- **Версия формата.** `apiVersion: "aqven/v9"` → `E_API_VERSION`; конвертация файла в версию хранения
  не меняет `spec_hash`.
- **Одинаковый контракт наружу.** Форма тула запуска в `aqven serve` — [ADR-0028](0028-studio-api-contract.md)
  открытый вопрос 7; если `aqven serve` публикует типизированный тул на воркфлоу, его `inputSchema` совпадает
  со схемой входа этого воркфлоу в OpenAPI.

## Пересмотр

- Доля воркфлоу на билдере устойчиво выше половины — студия превращается в смотрелку: либо расширить
  YAML-ядро недостающим примитивом (как в пересмотре ADR-0019), либо признать билдер основным.
- Появляется требование исполнять в процессе движка код не на Python — граница HTTP/MCP-тула не покрывает
  сценарий, решение «язык кода = язык движка» пересматривается.
- Нейтральный формат (Open Agent Spec или другой) начинает выражать allowed-set, три исхода и классы
  детерминированности — пересмотреть отказ от него как от нативного формата.
- Пересчёт IR прошлых ревизий для `aqven plan` и индексатора становится узким местом или ломается на старых
  `apiVersion` — вернуться к хранению IR, в git или рядом с релизами.
- Конвертация формата нужна чаще одной новой версии хранения в квартал — формат нестабилен, модель
  описания пересматривается.

## Открытые вопросы

1. **Имя Python-пакета движка и модуля моделей описания** (в примерах условно `aqven.spec`). Закрыть в
   [20](../20-repo-and-tooling.md) при чистке вместе с ADR-0025: выбрать имена дистрибутива и модулей,
   проверить `uv build` и импорт.
2. **Место, имена и политика коммита сгенерированных моделей и точек входа** (в примерах условно
   `support_refunds.models`, `support_refunds.flows`; имена анонимных записей `in`/`out` узла и вариантов union,
   в примере `Refund`). Спайк: сгенерировать модуль внутри пакета, прогнать pyright strict по `code/` и
   `uv build`, решить, что видит свежий клон без `aqven build`. Кандидат генератора — datamodel-code-generator
   0.82.0 (MIT), роль не проверена.
3. **Правила совместимости схем при сверке `code`.** Равенство JSON Schema без `title` или совместимость
   с вариантностью (функция принимает шире, возвращает уже); сравнение `$defs` с разными именами. Описать
   в 07 и покрыть тестами дрейфа: `int`/`str`, лишний параметр, другой порядок полей.
4. **Автодополнение по `oneOf` с `discriminator`.** `discriminator` — ключевое слово OpenAPI, а не JSON Schema
   2020-12; сужает ли redhat.vscode-yaml 1.24.0 подсказки после `node: "llm"` — не проверено. Проверить в
   VS Code; если нет — генерировать схему на вид узла через `if`/`then`.
5. **Принуждение чистоты билдера без изолята.** Две сборки с разным `PYTHONHASHSEED` ловят только
   недетерминизм порядка. Спайк: аудит-хуки `sys.addaudithook` (PEP 578) на сокеты, `open` и время в процессе
   сборки; измерить, что ловится и что ломается.
6. **Проверка `determinism: pure` у шага `code`** (03 §2.1 была статическим анализом TS). Варианты:
   белый список импортов по `ast`, аудит-хуки в рантайме. Спайк на примерах из `dsl/code-node.md`.
7. **R-T9 для промта уровня 3** — статическая оценка размера недоступна. Решить в 08: обязательный
   `budget.tokens` узла или оценка на фикстурах датасета.
8. **Инлайн `enum` против обязательных описаний значений** (05 §2). Запретить `enum` в `out` узла `llm`
   (только тип реестра с описаниями) или добавить описания значений в форму поля. Решить при чистке 05.
9. **Виды вне таблицы `kind` из §1**: компоненты (03 §4), `models/`, `tools/`, `agents/`, `context/`,
   `environments/` (layout.md §1). Значения `kind` и закрытые наборы ключей перечислить при чистке 03, 06 и
   layout.md.
10. **Однозначность TypeId из имени файла**: `x_1.yaml` и `x1.yaml` оба дают `X1`; грамматика 04 §2.1
    допускает `_` в TypeId, но TypeId из имени файла его не содержит. Запретить `__` и `_` перед цифрой
    (`E_BAD_NAME`) или хранить TypeId иначе. Решить в 05.
11. **Операция «развернуть билдер в YAML»** (аналог перехода из ADR-0018). Решить по первым воркфлоу на
    билдере; до решения переход ручной.
12. **Форма `tests` у шага `code`** (03 §2.4 требует тесты): ссылка на pytest-модуль или кейсы датасета.
    Решить при чистке 03.
13. **Путь и форма IR в кеше и в wheel.** Канонизатор выбран — `rfc8785` 0.1.4, Apache-2.0
    ([ADR-0029](0029-trust-and-quality-python.md), [research/py-quality-layer.md](../research/py-quality-layer.md) §3.1).
    Открыто: путь IR внутри `.aqven/cache/` и внутри пакета; строка JCS или отформатированный JSON с хешем по
    JCS в памяти. Что сделать: выбрать при чистке 04 §1.5 и пробой проверить, что `spec_hash` из файла
    совпадает с 04 §4.2.
14. **Место новых диагностик в каталоге 07 §3**: `E_UNKNOWN_KEY`, `E_API_VERSION`, `E_KIND_PATH_MISMATCH`,
    `E_CODE_REF_UNRESOLVED`, `E_CODE_SIGNATURE_MISMATCH`, `E_MODALITY_UNSUPPORTED`, `E_DOCSTRING`. При чистке
    07 внести их в каталог с уровнем гарантии (L0–L4), текстом сообщения и починкой, как у остальных правил.
15. **Перезагрузка кода проекта в `aqven dev`.** watchfiles 1.2.0 видит изменения `.py`, но подхват новой
    версии модуля в живом процессе (перезагрузка импорта против перезапуска подпроцесса) не проверен. Спайк на
    `code/refunds.py` с изменённой сигнатурой.
16. **Подкаталоги `types/` и представления.** layout.md §1 раскладывает типы по `enums/`, `entities/`, `views/`,
    05 §3 вводит представления; TypeId из имени файла подкаталог не учитывает. Решить при чистке layout.md и 05:
    плоский `types/` или пространство имён в TypeId, и какой `type:` у представления.
17. **Классы `stable` и `volatile` у шага `code`.** 03 §2.1 и 04 §2.5 считают `code` чистым (`pure: true`),
    а `determinism` допускает `volatile`. Решить при чистке 03: `code` только `pure`/`stable`, а всё
    недетерминированное — узел `tool`, или решётка эффектов 03 §2.1 меняется.
18. **Что коммитится для воркфлоу на билдере.** Для `flow.py` IR материализуется при `aqven check` и
    `aqven build`; коммитить ли материализованный YAML, IR или ничего, не решено. Без закоммиченного артефакта
    индексатор, студия и дифф по истории исполняют `build()` каждой ревизии. Что сделать: решить по первым
    воркфлоу на билдере вместе с вопросом 11; пробой проверить, что сборка старой ревизии даёт тот же
    `spec_hash` после обновления зависимостей.
19. **IR в wheel без служебных файлов.** Проверено только `wheel-exclude = [".aqven"]` целиком, а оно убирает
    и IR. Что сделать: на uv_build 0.12.15 проверить исключение `.aqven/drafts`, `.aqven/txn`, `.aqven/lock`,
    `.aqven/schema` и остального кеша при сохранении IR; если глобы подкаталогов не работают — `aqven build`
    копирует IR в данные пакета вне `.aqven/`, а `.aqven` исключается целиком; в обоих случаях сверить
    `unzip -l`.
20. **`yaml.schemas` не проверен запуском.** Что сделать: в VS Code с redhat.vscode-yaml 1.24.0 проверить, что
    `yaml.schemas` из `.vscode/settings.json` с путями относительно корня workspace и глобами
    `flows/*/nodes/**/*.yaml` подключает схемы из `.aqven/schema/`, в том числе схему датасета, в одно- и
    многопапочном workspace, и что запись `settings.json` инструментарием aqven не затирает чужие ключи;
    результат записать в research/py-spec-as-code.md.
21. **Пробы на 3.14.7.** Пробы research/py-spec-as-code.md (DSPy, `StructuredDict`, `TypeAdapter`,
    python-liquid `analyze()`) и research/py-quality-layer.md §5 (ruamel.yaml) шли на CPython 3.12.4, а
    ADR-0025 фиксирует 3.14. Что сделать: повторить их в спайке на 3.14.7.
