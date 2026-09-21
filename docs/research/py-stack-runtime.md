# Исследование: Python-рантайм

> Дата: 2026-09-16
> Для: [ADR-0025](../adr/0025-python-engine.md)

Здесь собраны доказательства, а не нормы. Нормы задают ADR-0025…0029 и [DECISIONS.md](../DECISIONS.md) после того,
как их обновят. Пробы выполнялись вне репозитория 2026-09-16, их результаты приведены в этом документе. У каждого
факта указан способ проверки:

| Метка | Способ проверки |
|---|---|
| `запуск 3.14` | код выполнен в изолированном venv: uv 0.12.15, CPython 3.14.7 |
| `запуск 3.12` | код выполнен в изолированном venv на CPython 3.12.4; ADR-0025 фиксирует 3.14, повтор на 3.14.7 — открытый вопрос 6 |
| `метаданные` | PyPI JSON `https://pypi.org/pypi/<name>/<version>/json`, `npm view`, `gh api` |
| `исходник` | установленный пакет: модуль и символ или `файл:строка` внутри `site-packages` |
| `доки` | официальная документация, URL в разделе «Источники» |

## Границы

| Тема | Где разобрана |
|---|---|
| Трассы (Logfire 5.1.0, Langfuse), канонизация, git и tar, статистика гейтов (scipy, statsmodels), GEPA, pydantic-evals, сопоставление гарантий вызова с тремя исходами ADR-0005 | [research/py-quality-layer.md](py-quality-layer.md) |
| Формат описания, сигнатуры DSPy, AgentSpec как формат, Dagster Components, динамические типы, allowed-set по провайдерам | [research/py-spec-as-code.md](py-spec-as-code.md) |
| Эндпоинты и потребности студии | [research/studio-api-inventory.md](studio-api-inventory.md) |

## Выводы

1. Движок пишется на том же языке, что и кастомный код: шаг `code` выполняется в процессе модуля. Выбран Python.
   Потребители на других языках работают через HTTP и MCP.
2. Pydantic AI 2.43.0 умеет вызывать модель, проверять ответ с повтором и принимать мультимодальный вход.
   Типизированного входа агента у него нет, медиа передаётся только через `user_prompt`, графа с сохранённым
   состоянием нет. Адаптер узла `llm` пишем сами.
3. Флаг strict при `strict=None` (умолчание `ToolOutput` и `NativeOutput`) зависит от схемы: он равен
   `is_strict_compatible` трансформера профиля. Без strict-несовместимых ключей OpenAI (Chat, Responses, OpenRouter)
   получает `strict: true`; со схемой пробы, где есть `maxLength`, у Chat и OpenRouter поля нет, у Responses
   `strict: false`.
   Anthropic и Bedrock без явного `strict=True` strict не получают. Поэтому strict задаётся явно. Когда он включён,
   трансформеры провайдеров переносят часть ограничений из схемы в `description`: OpenAI — `minLength`, `maxLength`,
   `pattern` с lookaround и др., оставляя `minimum`, `maximum`, `maxItems`, `minItems`; Anthropic — `maximum`,
   `minimum`, `maxLength`, `maxItems`, `pattern`, `default`. Границы надёжно держит только проверка Pydantic на приёме.
   `StructuredDict` ответ не проверяет. Подробно — §3.4 и [research/py-spec-as-code.md](py-spec-as-code.md) §13.2–§13.3.
4. DBOS 2.31.1 покрывает восстановление после падения, `fork_workflow` со ссылкой форка на исходный прогон и историю
   шагов. Локально он работает на SQLite. Узел `human` собирается из его примитивов (§5.5): `set_event` публикует
   форму, `recv(topic, timeout_seconds)` ждёт, дедлайн — долговечный шаг `DBOS.sleep` и переживает SIGKILL, таймаут
   не требует внешнего планировщика, ранние ответы буферизуются, параллельные ожидания идут дочерними workflow,
   события прогона для SSE пишутся в стрим DBOS. Сами пишем признак «ждёт человека», защиту от повторного resume,
   проверку дедлайна, закреплённую `application_version` и единственный исполнитель DBOS на системную БД.
   `DBOSAgent` в Pydantic AI 2.43.0 помечен устаревшим, замена — capability `DBOSDurability`: `agent.run()` внутри
   нашего `@DBOS.workflow`; так она запущена в пробе одобрения тула с `FunctionModel` (§5.5), сочетание с цепочкой
   гарантий не проверено (открытый вопрос 4). Параллельные шаги вне ожидания человека, отмена и PostgreSQL 18 —
   открытый вопрос 3.
5. pydantic-graph не берём: в его builder API нет встроенного сохранения состояния, а наш граф и так описан в IR.
6. httpx2 — форк httpx 0.28.1, который ведёт Pydantic. SDK OpenAI и Anthropic, `mcp` и TestClient Starlette работают
   на httpx2. Наш код импортирует только `httpx2` (ruff TID251). Encode `httpx` транзитивно допустим только от SDK
   Google: extra `google` входит в поставку ([ADR-0025](../adr/0025-python-engine.md) §1, §5). SDK Mistral, Groq
   и Cohere тоже тянут `httpx` и в поставку не входят; добавление такого провайдера — правкой `ALLOWED_CONSUMERS`
   и ADR-0025 §5. Extras `fastapi[standard]`, `starlette[full]` и `pydantic-ai-slim[retries]` не ставим (ADR-0025 §5).
   Состав `uv.lock` сверяет со списком `ALLOWED_CONSUMERS` скрипт §6.4.
7. В `mcp` 2.2.0 класс `FastMCP` переименован в `MCPServer`. Сервер монтируется в FastAPI и слушает тот же порт.
   В FastAPI 0.141.1 SSE встроен, нашим маршрутам `sse-starlette` не нужен (он приходит транзитивно через `mcp`).
8. Выбран CPython 3.14 (`requires-python = ">=3.14,<3.15"`, [ADR-0025](../adr/0025-python-engine.md) §1). На 3.15
   стек не собирается.
9. Monty не берём.
10. Kitaru 0.26.0 как слой надёжного исполнения не берём (решение владельца от 2026-09-16, запись —
    [ADR-0025](../adr/0025-python-engine.md)): с 0.22.0 это платформа записи и replay прогонов агента для evals, без
    чекпоинтов шагов, восстановления, fork с шага и ожидания человека, с обязательным сервером на PostgreSQL; её
    адаптер kitaru-pydantic-ai 0.2.1 не ставится рядом с pydantic-ai-slim 2.43.0 (§12).

## 1. Почему язык движка выбирает проект-хозяин

Решения владельца от 2026-09-16 (записаны в [ADR-0025](../adr/0025-python-engine.md), «Контекст»): модуль
импортируется в чужой проект или запускается по HTTP/MCP, шаги из чистого кода обязательны. Из них складывается цепочка:

- шаг `code` — это функция проекта, на которую ссылаются через `module:function`; она выполняется в процессе модуля;
- чтобы вызвать её без границы сериализации, движок должен быть на том же языке;
- код проверяется pyright strict против сгенерированных моделей
  ([ADR-0026](../adr/0026-yaml-spec-and-code-refs.md) §5, §10), а такая проверка работает только внутри одного языка;
- проекты на других языках получают `aqven serve` (HTTP + MCP) и клиент из OpenAPI.

| Вариант | Как устроен | Для нас |
|---|---|---|
| Движок на языке хозяина | ядро и пользовательский код в одном процессе, типы проверяет один тайпчекер | берём: Python |
| Нативная поддержка многих языков (BAML) | ядро на Rust, нативные колёса под каждую платформу, клиенты генерируются из DSL, кода внутри DSL нет | не подходит: шаг `code` обязателен (решение владельца) |
| Один язык движка и HTTP/MCP наружу | чужой проект вызывает модуль по сети | берём как второй путь использования (решение владельца) |

Как устроен BAML:

| Факт | Значение | Проверка |
|---|---|---|
| Версия | `baml-py` и `@boundaryml/baml` 0.226.2, релиз 2026-09-01 | метаданные |
| Лицензия | в npm указано `MIT`, файл LICENSE в BoundaryML/baml — Apache-2.0, поле на PyPI пустое | метаданные, `gh api` |
| Языки репозитория | Rust 33 343 633 байт, TypeScript 7 914 077, BAML 6 319 337, C# 2 053 396, Python 1 662 401 | `gh api repos/BoundaryML/baml/languages` |
| Колёса | 8 нативных `cp38-abi3`: macOS x86_64 и arm64, manylinux x86_64 и aarch64, musllinux x86_64 и aarch64, Windows amd64 и arm64; чистого `py3-none-any` нет | метаданные |
| Динамические типы | `@@dynamic` + `TypeBuilder` (`add_property`, `add_value`); через OpenAPI не работают | доки |

В Python нет mapped и conditional types, поэтому тип проекции вида `$.item.pick([...])` pyright не выведет.
Типы между узлами проверяет компилятор по IR, а код — pyright strict против сгенерированных моделей
([ADR-0026](../adr/0026-yaml-spec-and-code-refs.md) §5).

## 2. Версии рантайма

| Пакет | Версия | Лицензия | Релиз | Роль | Проверка |
|---|---|---|---|---|---|
| CPython | 3.14.7 | — | 2026-08-05 | интерпретатор | python.org API |
| pydantic-ai-slim | 2.43.0 | MIT | 2026-09-12 | вызов модели, проверка выхода, медиа | метаданные, запуск 3.14 |
| pydantic-graph | 2.43.0 | MIT | 2026-09-12 | приходит транзитивно (на нём цикл агента), для потоков не используем | метаданные |
| pydantic | 2.13.5 | MIT | — | модели | запуск 3.14 |
| dbos | 2.31.1 | MIT | 2026-09-08 | надёжное исполнение | запуск 3.14 |
| httpx2 | 2.13.0 | BSD-3-Clause | 2026-09-14 | HTTP-клиент | метаданные, исходник |
| mcp | 2.2.0 | MIT | 2026-09-07 | MCP-сервер | запуск 3.14 |
| fastapi | 0.141.1 | MIT | 2026-07-29 | HTTP API, SSE | запуск 3.14 |
| starlette | 1.6.0 | BSD-3-Clause | — | транзитивно через fastapi | метаданные, исходник |
| uvicorn | 0.53.0 | BSD-3-Clause | 2026-09-14 | ASGI-сервер | запуск 3.14 |
| watchfiles | 1.2.0 | MIT | 2026-05-18 | наблюдение за файлами в `aqven dev` | запуск 3.14 |
| sse-starlette | 3.4.11 | BSD-3-Clause | 2026-09-05 | транзитивно через mcp | метаданные |
| uv, uv_build | 0.12.15 | MIT OR Apache-2.0 | 2026-09-15 | workspace, lock, сборка wheel | запуск 3.14 |
| ruff | 0.16.7 | MIT | 2026-09-10 | линтер, запрет импортов | запуск 3.14 |
| pyright | 1.1.414 | MIT (обёртка на PyPI) | 2026-09-10 | strict-типизация | запуск 3.14 |
| pytest | 9.1.1 | MIT | 2026-06-19 | тесты | запуск 3.14 |
| pytest-asyncio | 1.4.0 | Apache-2.0 | 2026-05-26 | async-тесты | запуск 3.14 |
| anyio | 4.15.1 | MIT | 2026-09-05 | транзитивно, свой pytest-плагин | запуск 3.14 |
| temporalio | 1.33.0 | MIT | 2026-09-15 | альтернатива, не берём | метаданные |
| ty | 0.0.81 | — | 2026-09-15 | предрелиз, не берём | метаданные |
| pydantic-monty | 0.0.23 | MIT | 2026-09-05 | не берём (решение владельца, §11) | запуск 3.12 |

Проверенный стек состоит из 23 пинов: `pydantic-ai-slim[openai,anthropic]==2.43.0`, `pydantic-evals`, `pydantic-graph`,
`logfire` 5.1.0, `gepa` 0.1.4, `python-liquid` 2.3.1, `dbos`, `scipy` 1.18.1, `statsmodels` 0.15.0, `fastapi`, `mcp`,
`uvicorn`, `watchfiles`, `sqlalchemy` 2.0.54, `alembic` 1.20.0, `httpx2`, `ruamel.yaml` 0.19.1, `jsonschema` 4.26.0,
`pytest`, `pytest-asyncio`, `anyio`, `ruff`, `pyright`. На 3.12, 3.13 и 3.14 он разрешается в одни и те же 97 пакетов, и
`httpx` среди них нет. Extras провайдеров в нём только `openai` и `anthropic`; extra `google` в поставку
добавляет [ADR-0025](../adr/0025-python-engine.md) §1 (здесь §6.2).

Этот набор проверял инструменты. Набор оси [ADR-0025](../adr/0025-python-engine.md) §1 (24 пина: без `pydantic-graph`,
`logfire`, `sqlalchemy`, `alembic`, `jsonschema`, `anyio`, но с `pydantic` 2.13.5, `rfc8785` 0.1.4, `dulwich` 1.2.15,
`tenacity` 9.1.4, `genai-prices` 0.1.7, `opentelemetry-sdk` и `opentelemetry-exporter-otlp-proto-http` 1.44.0) с extras
`openai`, `anthropic` на 3.14 разрешается в 95 пакетов: `httpx` нет, `requests` 2.34.2 приходит через
`opentelemetry-exporter-otlp-proto-http` и `tiktoken`. С extra `google` получается 102 пакета, и `httpx` 0.28.1
приходит через `google-genai` (допустимо по ADR-0025 §5).
Проверено `uv pip compile --python-version 3.14 --python-platform aarch64-apple-darwin`, uv 0.12.15.

## 3. Pydantic AI 2.43.0

### 3.1 Что берём готовым

| Возможность | Механизм | Проверка |
|---|---|---|
| Вызов модели с типизированным выходом | `Agent(model, output_type=Model)`, `await agent.run(...)` | запуск 3.14 |
| Проверка выхода с повтором | ошибки валидации возвращаются модели как `RetryPromptPart`; когда повторы кончились — `UnexpectedModelBehavior` | запуск 3.12, запуск 3.14 |
| Модель выхода, собранная в рантайме | `pydantic.create_model(..., __config__=ConfigDict(extra="forbid"))` | запуск 3.12, запуск 3.14 |
| Дискриминированный union | `Field(discriminator="kind")` выбирает вариант | запуск 3.12 |
| Проверка выхода кодом | `@agent.output_validator`, `ModelRetry` | доки |
| Мультимодальный вход | `ImageUrl`, `AudioUrl`, `DocumentUrl`, `VideoUrl`, `BinaryContent`, `UploadedFile` | исходник `pydantic_ai/messages.py:966` |
| Изображение на выходе | `output_type=BinaryImage` или `BinaryImage \| str` | доки |
| Надёжное исполнение | интеграция — capability `DBOSDurability` (`durable_exec/dbos/_durability.py`): `agent.run()` вызывается внутри своего `@DBOS.workflow`, запросы модели и MCP идут DBOS-шагами; запущена в пробе одобрения тула с `FunctionModel` (§5.5), сочетание с цепочкой гарантий не проверено (открытый вопрос 4). Запущен и `pydantic_ai.durable_exec.dbos.DBOSAgent` (`durable_exec/dbos/_agent.py`), он помечен `@deprecated` в пользу `DBOSDurability`, удаление запланировано на v3. Рядом лежат `temporal` и `prefect` | исходник, запуск 3.14 |
| Тестовые модели | `TestModel`, `FunctionModel`, `models.ALLOW_MODEL_REQUESTS = False` | запуск 3.14, доки |
| Провайдеры | модули `pydantic_ai/providers/`: `openai`, `anthropic`, `google`, `openrouter`, `bedrock`, `mistral`, `groq`, `cohere`, `xai` и другие | исходник |

### 3.2 Типизированного входа нет

Сигнатура `Agent.run` (`pydantic_ai/agent/abstract.py:525`):
`user_prompt: str | Sequence[UserContent] | None`, дальше только именованные параметры: `output_type`, `message_history`,
`deferred_tool_results`, `conversation_id`, `run_id`, `model`, `instructions`, `deps`, `model_settings`, `usage_limits`,
`cancellation_token`, `usage`, `metadata`, `retries`, `infer_name`, `toolsets`, `event_stream_handler`, `capabilities`, `spec`.

- `UserContent = str | TextContent | MultiModalContent | CachePoint` (`messages.py:991`): медиа доходит до модели только
  как часть `user_prompt`.
- Структурированные данные передаются через `deps`, а в текст их переносят `@agent.instructions` и `@agent.system_prompt`,
  то есть функции от `RunContext` (доки Agent).
- Проверять вход агента Pydantic AI нечем: у `Agent.run` нет параметра со схемой входа.

Вывод для ADR-0026: узлу `llm` нужен собственный Adapter. Он проверяет вход узла моделью Pydantic, собирает текст по
уровню промта ([ADR-0026](../adr/0026-yaml-spec-and-code-refs.md) §4) и добавляет медиачасти в `user_prompt`.
Фрагмент ниже проверен запуском на 3.14.7: `FunctionModel` получила части `str` и `BinaryContent`.

```python
from collections.abc import Sequence

from pydantic import BaseModel
from pydantic_ai import BinaryContent
from pydantic_ai.messages import UserContent


class ExtractEventInput(BaseModel):
    email: str
    attachment: bytes | None = None


def to_user_prompt(node_input: ExtractEventInput, rendered: str) -> Sequence[UserContent]:
    if node_input.attachment is None:
        return [rendered]
    return [rendered, BinaryContent(data=node_input.attachment, media_type="image/png")]
```

### 3.3 AgentSpec: что умеет и где кончается

Поля `AgentSpec` в 2.43.0 (`pydantic_ai/agent/spec.py:33-49`): `$schema`, `model`, `name`, `description`, `instructions`,
`deps_schema`, `output_schema`, `model_settings`, `retries`, `end_strategy`, `tool_timeout`, `metadata`, `capabilities`.
Загрузка — `from_file` (`spec.py:52`), запись — `to_file` (`spec.py:113`). Рядом со спекой пишется `<stem>_schema.json`,
в файл добавляется строка `# yaml-language-server: $schema=`. Extra `spec` ставит `pydantic-handlebars>=0.1.0` и `pyyaml>=6.0.2`.

| Ограничение | Факт | Проверка |
|---|---|---|
| Описывает одного агента | узлов, рёбер и потока в спеке нет | исходник |
| Вход — только `deps` | `deps_schema` задаёт JSON Schema для deps; в `instructions` шаблоны `{{var}}` берут поля deps; медиавхода нет | доки |
| `output_schema` ответ не проверяет | «The schema serves as an instruction to the model, not a runtime validation constraint» | доки, запуск `StructuredDict` |
| Сериализуется не всё | колбэки и объекты toolset в спеку не попадают | доки |
| Поле `instrument` | в доке упомянуто, в полях 2.43.0 его нет | доки, исходник |

Как формат описания AgentSpec не берём. Сравнение форматов — в [research/py-spec-as-code.md](py-spec-as-code.md).

### 3.4 Режимы вывода и strict

| Режим | Как модель отдаёт ответ | strict |
|---|---|---|
| `ToolOutput` (по умолчанию) | вызовом тула | при `strict=None` зависит от схемы: без strict-несовместимых ключей OpenAI Chat, Responses и OpenRouter получают `strict: true`; со схемой пробы (в ней `maxLength`) у Chat и OpenRouter поля нет, у Responses `strict: false`; Anthropic и Bedrock без `strict=True` strict не получают. `ToolOutput(M, strict=True)` отправляет `strict: true` у OpenAI Chat, Responses, OpenRouter и Anthropic (кроме `claude-3-7-sonnet-20250219`: профиль без `supports_json_schema_output`, поле не уходит) |
| `NativeOutput` | нативный structured output провайдера | при `strict=None` у OpenAI Chat, Responses и OpenRouter — `strict: true` без несовместимых ключей, `false` при `maxLength`; `NativeOutput(M, strict=True)` отправляет `strict: true` у OpenAI Chat и Responses; Anthropic: объекту вывода Pydantic AI сам ставит `strict=True`, у `output_config.format` флага нет, `NativeOutput(M, strict=False)` → `UserError`; `claude-3-7-sonnet-20250219` + `NativeOutput` → `UserError` ещё на клиенте |
| `PromptedOutput(template=...)` | схема передаётся в промте | параметра нет |
| `TextOutput` | функция над текстом | — |
| `StructuredDict(schema)` | JSON Schema без модели Pydantic | ответ не проверяется (§3.5) |
| Google | — | флага strict нет, enum в схеме есть |

Что видно при перехвате запросов (`MockTransport`, без сети, запуск 3.12, частично повторён на 3.14.7 — см. ниже; провайдеры OpenAI Chat, OpenAI Responses,
Anthropic `claude-opus-4-6` и `claude-sonnet-4-5`, Google `gemini-2.5-flash`, OpenRouter `openai/gpt-5.2` и
`anthropic/claude-opus-4-6`):

| Элемент схемы | Что происходит |
|---|---|
| `enum` (5 и 60 кодов, 450 UUID) | уходит без изменений во всех провайдерах и режимах; клиент размер не ограничивает, лимиты провайдера остаются (ADR-0006) |
| OpenAI, strict | `OpenAIJsonSchemaTransformer.transform` (`profiles/openai.py`, список `_STRICT_INCOMPATIBLE_KEYS`) переносит в `description` `minLength`, `maxLength`, `patternProperties`, `unevaluatedProperties`, `propertyNames`, `minProperties`, `maxProperties`, `unevaluatedItems`, `contains`, `minContains`, `maxContains`, `uniqueItems`, `format` вне белого списка, `pattern` с lookaround; удаляет `title`, `$schema`, `discriminator`, `default`; `oneOf` → `anyOf`; все поля `required`. `minimum`, `maximum`, `maxItems`, `minItems` остаются в схеме |
| Anthropic, strict | `AnthropicJsonSchemaTransformer` (`providers/anthropic.py`) при `strict=True` передаёт схему в `transform_schema` из anthropic 1.6.0, тот переносит в `description` `maximum`, `minimum`, `maxLength`, `maxItems`, `pattern`, `default`; необязательные поля выпадают из `required` (лимит Anthropic — 24 необязательных) |
| `title` | удаляется почти везде |
| `additionalProperties: false` | трансформер OpenAI добавляет в любом режиме, трансформер Anthropic — только при strict; Google передаёт схему как есть |

Строки OpenAI и Anthropic — повторный разбор по исходнику и перехвату (запуск 3.12), подробно —
[research/py-quality-layer.md](py-quality-layer.md) §1.7 и [research/py-spec-as-code.md](py-spec-as-code.md)
§13.2–§13.3. Он исправил первичный вывод о том, что OpenAI strict вырезает и `minimum`, и `maxItems`.

На CPython 3.14.7 перехват через `httpx2.MockTransport` повторён для OpenAI Chat, OpenAI Responses и Anthropic
`claude-sonnet-4-5` и `claude-3-7-sonnet-20250219` ([ADR-0027](../adr/0027-dynamic-io-shapes.md), «Контекст» и таблица
фактов). Повторены: флаг strict при `strict=None` и при `strict=True` (`ToolOutput`, `NativeOutput`), набор ключей,
которые оставляет в схеме `anthropic.transform_schema`, и поведение `claude-3-7-sonnet-20250219`: `NativeOutput` →
`UserError` на клиенте, `ToolOutput(M, strict=True)` уходит без `strict` и без предупреждения. Там же на 3.14.7
запущены `StructuredDict`, повтор `create_model` и валидаторы. Google `gemini-2.5-flash`, OpenRouter,
`claude-opus-4-6` и enum на 60 и 450 значений перехвачены только на 3.12.4 ([ADR-0027](../adr/0027-dynamic-io-shapes.md),
открытый вопрос 12). Отдельно на 3.14.7 проверено, что `ToolOutput(Invoice, strict=True)` даёт
`ToolDefinition.strict == True` в `AgentInfo.output_tools`. Первичные результаты перехвата независимо не
перепроверялись: владелец остановил перепроверку как ненужную.

Вывод, записанный в [ADR-0027](../adr/0027-dynamic-io-shapes.md) («Strict включается явно») и
[ADR-0029](../adr/0029-trust-and-quality-python.md) §2: strict задаётся явно на каждом `ToolOutput` и `NativeOutput`,
`strict=None` не допускается, границы типов держит проверка Pydantic на приёме.

### 3.5 Проверка выхода и повтор

| Проба | Вход модели и её ответ | Результат | Проверка |
|---|---|---|---|
| `output_type=Event` | пустое имя, дата «12 октября», `kind: "meeting"` | `RetryPromptPart` с `string_too_short`, `string_pattern_mismatch`, `literal_error`; второй ответ валиден; 2 вызова | запуск 3.12 |
| `create_model("Invoice", ...)` | `total: -5`, `currency: "EUR"` вне enum | повтор, затем валидный ответ | запуск 3.12 |
| `ToolOutput(Invoice, strict=True)` | `invoice_no: ""`, `total: -5`, лишнее поле `extra` | `string_too_short`, `greater_than_equal`, `extra_forbidden`; 2 вызова; выход `invoice_no='INV-1' total=10.0` | запуск 3.14 |
| ответ всегда невалиден, `retries` по умолчанию | `name: ""` | `pydantic_ai.exceptions.UnexpectedModelBehavior: Exceeded maximum output retries (1)`, 2 вызова | запуск 3.14 |
| ответ всегда невалиден, `retries={"output": 3}` | `name: ""` | `UnexpectedModelBehavior`, 4 вызова | запуск 3.14 |
| `StructuredDict(Invoice.model_json_schema())` | `invoice_no: 42`, `total: -5`, лишнее поле | принято как есть за 1 вызов | запуск 3.12, запуск 3.14 |

По умолчанию `retries` равен 1 и для тулов, и для выхода (`pydantic_ai/agent/__init__.py:389`, `:722`).

```python
from pydantic import ConfigDict, Field, create_model
from pydantic_ai import Agent, ToolOutput

Invoice = create_model(
    "Invoice",
    __config__=ConfigDict(extra="forbid"),
    invoice_no=(str, Field(min_length=1, max_length=32)),
    total=(float, Field(ge=0)),
)

agent = Agent("openai:gpt-5.2", output_type=ToolOutput(Invoice, strict=True), retries={"output": 2})
```

`StructuredDict` в движке не используем ([ADR-0026](../adr/0026-yaml-spec-and-code-refs.md) §7,
[ADR-0027](../adr/0027-dynamic-io-shapes.md) «Strict включается явно»): это подсказка модели, а не проверка.

### 3.6 Мультимодальность

Вход (доки Input):

| Модальность | Тип Pydantic AI | Провайдеры | Замечание |
|---|---|---|---|
| Текст | `str`, `TextContent` | все | — |
| Изображение | `ImageUrl`, `BinaryContent` | все основные | — |
| Аудио | `AudioUrl`, `BinaryContent` | OpenAI (Chat — со скачиванием, Responses — по URL), Google | нет у Anthropic, Bedrock, Mistral |
| Видео | `VideoUrl`, `BinaryContent` | Google (Cloud и Gemini API), Bedrock (со скачиванием) | другие провайдеры не поддерживают |
| Документ | `DocumentUrl`, `BinaryContent` | все | Anthropic и Mistral — только PDF |
| Загруженный файл | `UploadedFile` | не проверялось | — |

Для URL `force_download=True` скачивает файл на клиенте с защитой от SSRF (доки). Поле `force_download` объявлено
в базовом классе `FileUrl` (`messages.py:254`) и наследуется `ImageUrl`, `AudioUrl`, `VideoUrl`, `DocumentUrl`.

Выход:

| Модальность | Механизм | Ограничение |
|---|---|---|
| Текст и структура | `output_type=Model` | — |
| Изображение | `output_type=BinaryImage` или `BinaryImage \| str` | только модели, которые генерируют изображения (доки image-generation) |
| Аудио | только realtime, `output_modality='audio'` | Voice capability (TTS/STT) в pydantic-ai-harness на март 2026 в статусе «Not started» |
| Видео | нет | — |

Выводы, записанные в [ADR-0026](../adr/0026-yaml-spec-and-code-refs.md) §6: совместимость медиатипа с моделью
проверяет компилятор по профилю, `llm` с `out: video` не компилируется, аудио и видео генерируются шагом `tool` или
`code`. Видео на входе есть только у Google и Bedrock. SDK Google тянет encode `httpx`; это единственный допустимый
транзитивный потребитель `httpx` ([ADR-0025](../adr/0025-python-engine.md) §5, здесь §6.2).

## 4. pydantic-graph 2.43.0: почему не берём

| Факт | Проверка |
|---|---|
| Ставится всегда: `pydantic-ai-slim` требует `pydantic-graph==2.43.0` | метаданные |
| `GraphBuilder` лежит в `pydantic_graph/graph_builder.py:1139` и экспортируется из корня пакета; в доке раздел по-прежнему называется beta | исходник, доки |
| Есть `@g.step`, `.map()`, broadcast, `g.join()` с `reduce_list_append`, decisions | доки |
| «The graph builder API does not include built-in state persistence» — из-за снапшотов при параллельном исполнении | доки |
| В `pydantic_graph/*.py` версии 2.43.0 нет слов `persist` и `snapshot` | исходник (grep) |
| Проверку типов между шагами дока не описывает | доки |

| Требование | pydantic-graph 2.43.0 | Наш вариант (ADR-0025 §3–§4) |
|---|---|---|
| Восстановление после падения | встроенного сохранения нет | DBOS-workflow |
| Fork с шага | нет | `DBOS.fork_workflow`, ссылка `forked_from` |
| История шагов | нет | `DBOS.list_workflow_steps` |
| Граф как данные с хешем (ADR-0022) | граф задаётся кодом на Python | IR, который выполняет исполнитель |

Решение ([ADR-0025](../adr/0025-python-engine.md) §3–§4): исполнитель IR — функция DBOS-workflow, узел — DBOS-шаг,
pydantic-graph не используем.

## 5. DBOS 2.31.1

### 5.1 Проверено запуском (3.14.7, SQLite)

| Сценарий | Результат |
|---|---|
| Конфиг | `name`, `system_database_url = "sqlite:///<абсолютный путь>.sqlite"`, `log_level`; без URL по умолчанию `sqlite:///{name}` (`dbos/_dbos_config.py:27`) |
| Падение внутри шага 2 (`os._exit(17)`) | новый процесс вызвал `DBOS.launch()` и сам восстановил прогон: шаг 1 не повторялся, шаг 2 повторился; `SUCCESS`, `recovery_attempts: 2` |
| `list_workflow_steps_async` | по каждому шагу `function_id`, `function_name`, `output` |
| `fork_workflow_async(id, 2)` | новый id; шаг 1 скопирован, шаг 2 выполнен заново |
| `fork_workflow(id, 1)` (sync) | оба шага выполнены заново |
| `list_workflows_async` | в списке оба прогона |
| Связь форка с исходным прогоном | в таблице `workflow_status` SQLite-базы пробы у обоих форков `forked_from = wf-crash-1`; поле `WorkflowStatus.forked_from` (`dbos/_sys_db.py:189`), фильтр `list_workflows(forked_from=...)` (`_dbos.py:2554`) |
| `DBOSAgent(Agent(TestModel(), output_type=Event, name="extractor"))` (устаревший API, §5.2) | workflow `extractor.run`, шаг `extractor__model.request`, `SUCCESS` |

Журнал вызовов шагов: `extract, draft` (прогон упал) → `draft` (восстановление) → `draft` (fork с шага 2) → `extract, draft`
(fork с шага 1).

Сигнатуры: `fork_workflow(cls, workflow_id: str, start_step: int, *, application_version=None, queue_name=None,
queue_partition_key=None, replacement_children=None, timeout_seconds=None)` (`dbos/_dbos.py:2458`);
`list_workflow_steps(cls, workflow_id, *, load_output=True, limit=None, offset=None) -> List[StepInfo]` (`_dbos.py:2817`).
В доке `fork_workflow` описан так: «generates a new workflow with a new workflow ID, copies to that workflow the original
workflow's inputs and all its steps up to the selected step».

```python
from pathlib import Path

from dbos import DBOS, DBOSConfig

config: DBOSConfig = {
    "name": "aqven-dev",
    "system_database_url": f"sqlite:///{Path('aqven_dbos.sqlite').resolve()}",
    "log_level": "WARNING",
}
DBOS(config=config)


@DBOS.step()
async def extract(ticket: str) -> dict[str, str]:
    return {"ticket": ticket, "intent": "refund"}


@DBOS.step()
async def draft(parsed: dict[str, str]) -> str:
    return f"Draft for {parsed['ticket']} ({parsed['intent']})"


@DBOS.workflow()
async def answer_flow(ticket: str) -> str:
    parsed = await extract(ticket)
    return await draft(parsed)
```

### 5.2 Ограничения

| Ограничение | Источник |
|---|---|
| Для продакшена DBOS рекомендует Postgres; у нас в проде PostgreSQL 18 ([ADR-0025](../adr/0025-python-engine.md) §1, §4) | доки configuration |
| `DBOSAgent` устарел: «`DBOSAgent` is deprecated in favor of the `DBOSDurability` capability», удаление запланировано на v3 (декоратор `@deprecated` над классом `DBOSAgent` в `pydantic_ai/durable_exec/dbos/_agent.py`); проба `DBOSAgent` на SQLite шла на устаревшем API, интеграция — `DBOSDurability` (запуск — §5.5, открытый вопрос 4) | исходник |
| `use_listen_notify` «must be False in SQLite»; в пробе параметр не задавали, всё работало | доки configuration, запуск 3.14 |
| `dbos` всегда ставит `psycopg[binary]>=3.1`, даже на SQLite, и этим блокирует 3.15 (§9.1) | метаданные, `uv pip compile` |
| Без `PYDANTIC_AI_NO_BANNER=1` Pydantic AI печатает баннер наблюдаемости | запуск 3.14 |
| Атрибуты workflow хранятся в Postgres как JSONB с GIN-индексом; на SQLite атрибуты пишутся и читаются, а фильтр `list_workflows(attributes=...)` бросает `DBOSException` (§5.5) | доки workflow-management, запуск 3.14 |
| Очереди с лимитами конкурентности, расписания | доки workflow-management |

### 5.3 API есть, но для наших сценариев не проверено

| Сценарий | API в 2.31.1 | Где |
|---|---|---|
| Параллельные ветки | `DBOS.start_workflow`, `start_workflow_async`; `Queue(name, concurrency, limiter, *, worker_concurrency, global_concurrency, partition_concurrency, partition_worker_concurrency, partition_limiter, polling_interval_sec, database_backed_queue, ...)`; ожидания человека в параллельных ветках проверены (§5.5, п. 9), параллельные шаги узлов и `Queue` — нет | `_dbos.py:1343`, `:1354`; `dbos/_queue.py:83` |
| Ожидание человека и таймер | `send`, `recv(topic=None, timeout_seconds=60)`, `sleep`, `sleep_async`, `set_event`, `get_event(workflow_id, key, timeout_seconds=60)`; проверено запуском — §5.5 | `_dbos.py:1678`, `:1792`, `:1840`, `:1855`, `:1947`, `:2009` |
| Отмена и продолжение | `cancel_workflow`, `resume_workflow` | `_dbos.py:2124`, `:2298` |

Параллельные шаги узлов, `Queue`, отмена и продолжение — открытый вопрос 3 (он же в
[ADR-0025](../adr/0025-python-engine.md), «Открытые вопросы»): пока спайк не проверит семантику, утверждать её нельзя.

### 5.4 Альтернативы

В доке Pydantic AI для надёжного исполнения перечислены Temporal, DBOS, Prefect, Restate, AWS Lambda durable functions,
а также Kitaru и Airflow. В `pydantic_ai/durable_exec/` из них есть `dbos`, `prefect` и `temporal`. Extra `dbos` ставит
`dbos>=2.10.0`. temporalio 1.33.0 (MIT) в этой сессии не запускался. Kitaru 0.26.0 разобран в §12: слоем надёжного
исполнения он больше не является.

### 5.5 Ожидание человека: проба HITL

Пробы выполнялись вне репозитория 2026-09-16 в чистом uv venv: CPython 3.14.7, dbos 2.31.1, pydantic-ai-slim 2.43.0,
pydantic 2.13.5, fastapi 0.141.1, uvicorn 0.53.0, httpx2 2.13.0, pytest 9.1.1, pytest-asyncio 1.4.0. Системная БД —
SQLite, провайдеры моделей не вызывались (`FunctionModel`). Итоговые логи — один повторный прогон всех проб на
финальной версии вспомогательного модуля. Независимо не перепроверялось: владелец принял пробу без перепроверки. Метка
всех фактов раздела — `запуск 3.14`, кроме помеченных `исходник` и `доки`.

Узел `human` целиком собирается из примитивов DBOS. Форма публикуется `set_event`, индекс для поиска пишется в атрибуты
workflow, ожидание — `recv_async` на topic, уникальном для узла и попытки, политики таймаута — таблица обработчиков
(Strategy). Внешний планировщик не нужен: таймаут `recv` — долговечный `DBOS.sleep`.

| # | Вопрос | Вердикт | Что показал запуск |
|---|---|---|---|
| 1 | Публикация формы и `recv(topic, timeout_seconds)` | работает | событие `human`: `address`, `form_schema` (`Approval.model_json_schema()`), `suspend_data`, `assignee`, `waiting_since`, `deadline_at`, `attempt`, `on_timeout`, `topic` (`human:approve_refund:1`); пока ждёт — `PENDING`; результат через 117 мс после `send`; `recv` пишет два шага: `DBOS.recv` (выход — сообщение) и следующий за ним `DBOS.sleep` (выход — абсолютный дедлайн в epoch-секундах) |
| 2 | Поиск ожидающих прогонов вторым процессом | своя таблица для корректности не нужна, признак «ждёт человека» — наш | прогон в `recv` — `PENDING`, как прогон в долгом шаге или `sleep`; после рестарта восстановленные прогоны кратко `ENQUEUED`. Из 25 `PENDING` процесс с одним `DBOSClient` нашёл 20 ожидающих двумя способами: `get_event(id, "human", timeout_seconds=0)` на каждый прогон (3.32 мс на все) и атрибуты workflow из того же `list_workflows` (фильтр в Python 0.27 мс). `list_workflows(attributes=...)` на SQLite → `DBOSException` «Filtering workflows by attributes is not supported on SQLite»; на Postgres — JSONB `@>` (исходник, не запускалось). Чтения событий по многим workflow в API нет |
| 3 | Resume: проверка, ключ идемпотентности, двойной resume | работает с нашими проверками | невалидный payload → problems `literal_error`, `string_too_long`, `extra_forbidden`, шаги и уведомления до и после одинаковы, прогон ждёт дальше; валидный → `SUCCESS` за 62 мс; тот же ключ ещё раз → `replayed`, другой ключ после разрешения → `already_resumed`; два конкурентных resume с разными ключами → одно `accepted` и одно `already_resumed` в 5 из 5 повторов |
| 4 | Ответ до того, как workflow дошёл до `recv` | работает | ответ отправлен за 3003 мс до `recv`, лежал непотреблённым, `recv` вернул его за 5.4 мс (`recv_setup` сначала ищет непотреблённое сообщение — исходник) |
| 5 | Таймаут и политики без внешнего планировщика | работает; поздний ответ отсекает наша проверка | `default` → `SUCCESS` за 1.06 с; `fail` → `ERROR` с `HumanTimedOut` за 1.06 с; `escalate` → попытка 2 для `lead` на `human:approve_refund:2`, с ответом `SUCCESS`, без ответа `ERROR` за 2.56 с. Дедлайн истёк, пока воркер лежал: таймаут сработал через 1.47 с после рестарта. Ответ, отправленный при лежащем воркере до дедлайна, потреблён после рестарта. Ответ, отправленный при лежащем воркере через 1.51 с после дедлайна, принят при восстановлении |
| 6 | Ожидание переживает SIGKILL и рестарт | работает, дедлайн сохраняется | рестарт с той же версией: «Recovering 2 workflows», кратко `ENQUEUED`, затем `PENDING`, `recovery_attempts: 2`; ожидание на 14 с истекло через 0.028 с после исходного дедлайна, а не через 14 с после рестарта; ожидание на 600 с продолжено ответом, побочный эффект `finalize` выполнен один раз, в новом процессе; рестарт с изменённым исходником workflow → «No workflows to recover», прогоны осиротели |
| 7 | Fork на шаге человека с другим ответом, lineage | работает; точка форка — первый шаг узла | 4 форка с разными ответами дали разные выходы; `list_workflows(forked_from="wf-orig")` вернул все 4, у исходного `was_forked_from=True`; точки форка — таблица ниже |
| 8 | Автотесты со скриптованным человеком | работает офлайн и детерминированно | 8 тестов pytest: 8 passed за 1.19–1.25 с в 10 прогонах подряд; при запрете сети — 8 passed за 1.29 с |
| 9 | Два параллельных ожидания разных людей | работает, переживает SIGKILL | ответы в любом порядке (finance первым, legal вторым); родитель `PENDING`, пока не ответили оба, затем вернул оба ответа; рестарт — «Recovering 4 workflows», `recovery_attempts` 2 у всех |
| 10 | Одобрение тула внутри узла `llm` | работает с `DBOSDurability` | SIGKILL во время ожидания одобрения и рестарт: первый запрос модели воспроизведён из шага, одобренный тул выполнен один раз; форк на первом шаге узла с отказом изменил выход без повторного первого запроса модели |
| 11 | Живые обновления студии | работает без своей outbox-таблицы | стрим DBOS → SSE; переподключение с `Last-Event-ID: 3` отдало только `id: 4` и `id: 5`; латентность задаёт интервал опроса — таблица ниже |

Сигнатуры в dbos 2.31.1 (исходник и печать сигнатур запуском):

- `DBOS.recv(topic: Optional[str] = None, timeout_seconds: float = 60) -> Any`, `DBOS.recv_async` — так же; дока: «returning
  None if the wait times out»;
- `DBOS.send(destination_id, message, topic=None, *, idempotency_key=None, serialization_type=DEFAULT, send_to_forks=False) -> None`;
- `DBOS.set_event(key, value, *, serialization_type=DEFAULT) -> None`, `DBOS.get_event(workflow_id, key, timeout_seconds=60) -> Any`,
  `DBOS.get_all_events(workflow_id) -> Dict[str, Any]`;
- `DBOS.sleep(seconds) -> None`, `DBOS.sleep_async(seconds)`;
- `DBOSClient.send(destination_id, message, topic=None, idempotency_key=None, *, serialization_type, send_to_forks=False)`;
  `get_all_events` у `DBOSClient` нет.

#### Чего DBOS не даёт

| Пробел | Что показал запуск | Что пишем (решение владельца от 2026-09-16, запись — [ADR-0025](../adr/0025-python-engine.md)) |
|---|---|---|
| Статус «ждёт человека» | прогон в `recv` — `PENDING`, как любой выполняющийся; восстановленный кратко `ENQUEUED` | признак `suspended` в нашем индексе прогонов |
| Защита от повторного resume | `idempotency_key` превращается в `message_uuid = "<key>::<destination>"` с `ON CONFLICT DO NOTHING` (`dbos/_sys_db.py`): повтор ключа молча игнорируется даже на другом topic; send с новым ключом после разрешения ошибки не даёт и лежит с `consumed=0` бессрочно; буферизованное сообщение получает следующий `recv` на том же topic, старшее первым (два `recv` подряд — `answer-A`, затем `answer-B`); send в несуществующий workflow → `DBOSNonExistentWorkflowError` | topic уникален на адрес исполнения и попытку (`"human:" + address_key + ":" + attempt`, где `address_key` — RFC 8785 JSON адреса, [ADR-0025](../adr/0025-python-engine.md) §9); API отклоняет resume, если узел не ждёт или попытка и topic не совпадают. В пробе API после `send` ещё ждал события разрешения и сравнивал `resolved_by` с ключом: вариант без этого подтверждения вернул `202 accepted` на второй ключ, отправленный сразу за первым |
| Проверка дедлайна | ответ, отправленный после дедлайна при лежащем воркере, принят при восстановлении: `recv` находит буферизованное сообщение раньше, чем проверяет остаток времени | проверка в API до `send` (`now > deadline_at` → `timed_out`) и в workflow при получении (`sent_at` конверта позже `deadline_at` → сообщение отбрасывается); обе проверены, финал `reject:deadline` вместо `approve:late` |
| Стабильная версия приложения | по умолчанию `application_version` — MD5 исходников функций workflow (`DBOS.compute_app_version`); после добавления одного `@DBOS.workflow` рестарт дал новую версию и «No workflows to recover from application version …» | `application_version` — явная версия протокола исполнителя; IR — данные со снимком на прогон, поэтому DBOS версионирует только код интерпретатора; версия поднимается только при несовместимом изменении исполнителя |
| Единственный исполнитель | второй `DBOS.launch()` на той же системной БД с тем же executor id восстановил ожидание, которое шло в первом процессе (`recovery_attempts` 1 → 2, «Recovering 1 workflows») | ровно один исполнитель DBOS на системную БД: `DBOS.launch` один раз в `aqven dev` и `aqven serve`, остальные процессы — `DBOSClient` |

`record_sleep` хранит `end_time` и возвращает `max(0, end_time - now)` (`dbos/_sys_db.py`), поэтому дедлайн переживает
рестарт. `None` после таймаута записан выходом шага `DBOS.recv` (сериализация `py_pickle`): реплей и форк получают
`None` без нового ожидания. Дока DBOS (workflow-communication) описывает идемпотентный `send` через `SetWorkflowID`, а в
2.31.1 у `send` есть параметр `idempotency_key`.

#### Fork на шаге человека

Ответ человека записан выходом шага `DBOS.recv` (конверт `payload`, `idempotency_key`, `sent_at`), дедлайн — выходом
следующего `DBOS.sleep`; оба видны в `list_workflow_steps`. Форк копирует шаги, события и стримы с
`function_id < start_step`, копирует атрибуты исходного прогона и встаёт во внутреннюю очередь: статус `ENQUEUED`,
подхват до ~1 с (`DEFAULT_QUEUE_POLLING_INTERVAL_SEC = 1.0` в `dbos/_queue.py`).

| `start_step` | Что происходит | Для студии |
|---|---|---|
| после шага человека | записанный ответ воспроизводится без ожидания; у прогона с таймаутом воспроизводится `None`, и политика `default` срабатывает за 1.01 с при таймауте 3 с | повтор без нового вопроса |
| шаг `DBOS.recv` | форк снова ждёт, но скопировано старое событие `waiting` со старым `deadline_at`, атрибуты говорят `human_state: resolved`, а таймаут `recv` начинается заново на полную длину | не использовать |
| первый шаг узла (`wall_clock` перед `set_event`) | новое событие и новый дедлайн | повторный вопрос человеку |
| 1 | всё выполняется заново | — |

Чтобы форкнуть с первого шага узла по адресу исполнения, нужен записанный `function_id` начала каждого узла (открытый
вопрос 21).

#### Параллельные ожидания

| Форма | Как устроена | Итог |
|---|---|---|
| Дочерний workflow на ветку человека | id `<parent>::<node_id>` через `SetWorkflowID`, дети стартуют по очереди, затем `asyncio.gather` по `handle.get_result()`; у каждого своё событие `human`, атрибуты и topic; `list_workflows(parent_workflow_id=...)` их находит; шаги родителя `(1, prepare)`, `(2, human_branch)`, `(3, human_branch)` | берём (решение владельца от 2026-09-16, запись — [ADR-0025](../adr/0025-python-engine.md)): id дочернего workflow `parent_run_id + "::" + address_key` (единый кодировщик, [ADR-0025](../adr/0025-python-engine.md) §9), API resume переводит `run_id` и адрес в этот id; в пробе id строился из `node_id` |
| Один workflow | одна публикация, `asyncio.gather` по `recv_async` на разных topic; номера шагов детерминированы: `DBOS.recv` 3 и `DBOS.sleep` 4, `DBOS.recv` 5 и `DBOS.sleep` 6 | работает, не берём |

Почему дочерние workflow: ветка человека — последовательность (публикация, ожидание, разрешение), а дока DBOS
(workflow-tutorial) велит запускать последовательности дочерними workflow: «If you need to run sequences of operations
concurrently, start child workflows»; конкурентные шаги допустимы, «as long as the steps are started in a deterministic
order». Долговечное ожидание `DBOS.asyncio_wait` тоже есть (исходник, не запускалось).

#### Одобрение тула внутри узла `llm`

Имена в pydantic-ai-slim 2.43.0 (исходник): `requires_approval=True` у `@agent.tool`, `@agent.tool_plain`, `Tool`,
`FunctionToolset`; `DeferredToolRequests(calls, approvals, metadata)` с `build_results()`;
`DeferredToolResults(calls, approvals: dict[str, bool | ToolApproved | ToolDenied], metadata)`; `ToolApproved(override_args)`,
`ToolDenied(message)`; исключения `ApprovalRequired`, `CallDeferred`; capability `HandleDeferredToolCalls(handler)`;
`Agent.run(..., message_history=..., deferred_tool_results=...)`.

| Форма | Как устроена | Итог |
|---|---|---|
| Остановка прогона | `output_type=[str, DeferredToolRequests]` → ожидание человека с формой `ToolApprovalForm` (`suspend_data` — вызовы тула с аргументами) → второй `agent.run(message_history=first.all_messages(), deferred_tool_results=...)` | `SUCCESS`; шаги `refund_stop__model.request`, `wall_clock`, `DBOS.setEvent`, `DBOS.updateWorkflowAttributes`, `DBOS.sleep`, …, `execute_refund`, `refund_stop__model.request`; невалидная форма → `too_short` |
| Внутри прогона | `Agent(..., capabilities=[DBOSDurability(), HandleDeferredToolCalls(handler=...)])`; обработчик ждёт человека на уровне workflow (`step_id=None`), поэтому `recv` разрешён и прогон встаёт посередине | `SUCCESS`; проверено с одним вызовом тула (открытый вопрос 22) |

`DBOSDurability` рассчитана на `agent.run()` внутри своего `@DBOS.workflow`: контекст надёжен, когда задан `workflow_id`,
а `step_id` равен `None` (исходник `durable_exec/dbos/_durability.py`; дока: «a run is only durable when agent.run() is
called inside your own @DBOS.workflow»). Запросы модели становятся шагами `<имя агента>__model.request`. Оговорки:
функции-тулы DBOS не оборачивает (дока: «Function tools ... are not automatically wrapped by DBOS»), побочный эффект
выносится в `@DBOS.step` (`execute_refund`); имена агентов уникальны. Агент, созданный после `DBOS.launch()`, работает в процессе. Устаревший
`DBOSAgent` регистрирует свой workflow `{name}.run` и вложил бы дочерний workflow, сменив адресата `send` (исходник, не
запускалось).

#### Живые обновления студии

Механизм без своей outbox-таблицы: workflow пишет события прогона в стрим DBOS (`write_stream_async("run_events")`,
запись exactly-once, `seq = offset + 1`); `GET /api/runs/{id}/events` читает его
`DBOSClient.read_stream_async(run_id, "run_events", offset=Last-Event-ID)` и отдаёт `ServerSentEvent(id=seq, event=type)`;
`GET /api/runs/events` опрашивает `list_workflows(load_input=False, load_output=False)` и сравнивает статус и атрибут
`human_state`. В пробе `POST` resume отвечал после того, как workflow записал разрешение. На SQLite push нет: слушатель
уведомлений — опрос с `notification_listener_polling_interval_sec` (по умолчанию 1.0 с) или `polling_interval_sec` у
`read_stream`. Замер: процесс-воркер, uvicorn с API только на `DBOSClient`, SSE-клиент на httpx2, по 6 прогонов.

| Переход (мин–макс) | опрос 1.0 с | опрос 0.05 с |
|---|---|---|
| запись `node_suspended` → SSE | 896–948 мс | 9–41 мс |
| запись `node_resumed` → SSE | 372–392 мс | 18–52 мс |
| `POST` resume → workflow продолжен | 208–228 мс | 27–72 мс |
| `POST` resume → SSE `node_resumed` | ~600 мс | 63–119 мс |
| отставание ленты прогонов | 866–929 мс | 9–41 мс |

При 1.0 с значения совпали с циклом опроса, поэтому ~900 мс и ~600 мс не общие: каждый переход ограничен интервалом, а
не DBOS. Postgres с `use_listen_notify=True` не замерялся (открытый вопрос 18).

#### Автотесты со скриптованным человеком

`ScriptedHuman` опрашивает событие `human` и на каждое открытое ожидание применяет одно действие: `Answer`
(подтверждённый resume), `Invalid` (проверяет статус и коды проблем) или `Silence` (ждёт смены попытки или таймаута);
`preseed()` отправляет ответ до того, как узел достигнут. Восемь тестов: approve, reject, невалидный payload отклонён до
workflow, таймаут с `default`, таймаут с `fail`, эскалация на `lead`, засеянный ответ без респондера, невалидное сырое
сообщение отброшено workflow. DBOS запускается один раз на сессию на временном файле SQLite (`loop_scope="session"`,
опрос слушателя 0.01 с). От часов зависят только тесты таймаута: в них таймаут 0.3 с, в остальных 60 с, чтобы респондер
не проиграл гонку. Сеть запрещалась профилем `sandbox-exec` с `(deny network*)`; контрольный
`socket.create_connection(("1.1.1.1", 80))` под тем же профилем дал `PermissionError`.

#### Что решено по итогам пробы

Решение владельца от 2026-09-16 (запись — [ADR-0025](../adr/0025-python-engine.md), свод —
[DECISIONS.md](../DECISIONS.md) «Human-in-the-loop»); что пишем сами поверх DBOS — таблица «Чего DBOS не даёт»:

| Тема | Решение |
|---|---|
| Узел `human` | перед ожиданием `DBOS.set_event("human", {address, form_schema, suspend_data, assignee, waiting_since, deadline_at, attempt, on_timeout, topic})`, где `form_schema` — JSON Schema Pydantic-модели формы, и индекс поиска в атрибутах workflow; ожидание `DBOS.recv_async(topic, timeout_seconds)` на `human:<address>:<attempt>`; дедлайн — выход долговечного шага `DBOS.sleep`; политики `fail`, `default`, `escalate` — таблица Strategy внутри workflow; внешний планировщик, pg-boss и `timeout_job_id` не нужны |
| Resume | сначала проверка payload моделью формы (ошибка → problems с `path`, `code`, `message`, прогон не тронут), затем `DBOS.send(workflow_id, {payload, idempotency_key, sent_at}, topic)`; ответ хранится выходом шага `recv` и виден в `list_workflow_steps` |
| Ранние ответы | буферизуются и потребляются следующим `recv`, поэтому тесты и тестовый режим студии засевают ответы на детерминированные topic |
| Параллельные ожидания | дочерний workflow на ветку человека с id `<parent_run_id>::<адрес исполнения>`; своё событие, атрибуты и topic; продолжение в любом порядке |
| Одобрение тула в `llm` | deferred tools Pydantic AI (`requires_approval=True` → `DeferredToolRequests` → ожидание узла `human` → `agent.run(..., deferred_tool_results=DeferredToolResults(approvals={...}))`) под `DBOSDurability` |
| Живые обновления | стрим DBOS `run_events`, `seq = offset + 1`; API читает его через `DBOSClient` для `GET /api/runs/{id}/events` (SSE, `Last-Event-ID = seq`); своей outbox-таблицы нет |
| HITL в студии | входящие ожидания из индекса `suspended`, форма рисуется по `form_schema`, ошибки проверки показываются у полей; тестовый режим: запуск принимает скриптованные ответы по адресу исполнения, движок засевает их на детерминированные topic; fork на шаге человека (`DBOS.fork_workflow`, `start_step` — первый шаг узла `human`) с lineage через `forked_from`; CI — pytest `ScriptedHuman` на восемь сценариев |

Запись адреса в топике и id дочернего workflow уточнена позже решением владельца от 2026-09-16
([ADR-0025](../adr/0025-python-engine.md) §9): `address_key` — JSON адреса по RFC 8785, строки только внутри адаптера
DBOS. В пробе топик и id строились из одного `node_id`.

## 6. httpx2 и карта зависимостей

### 6.1 Форк

| Факт | Значение | Источник |
|---|---|---|
| Пакет | httpx2 2.13.0, BSD-3-Clause, 2026-09-14, `requires_python >=3.10` | метаданные |
| Происхождение | «First release of `httpx2`, a fork of `httpx` maintained by Pydantic. Forked from `httpx 0.28.1` (commit `b5addb6`)» | CHANGELOG 2.0.0b1 |
| Первый стабильный релиз | 2.0.0, 2026-05-12 | метаданные |
| Что переименовано | `import httpx` → `import httpx2`; CLI `httpx2`; User-Agent `python-httpx2/<version>`; логгер `httpx2`; `httpcore` → `httpcore2` с точным пином; «No other public API changed» | CHANGELOG |
| Зависимости | `anyio>=4.10`, `httpcore2==2.13.0`, `idna>=3.18`, `truststore>=0.10` | метаданные |
| Репозиторий | github.com/pydantic/httpx2, 1448★, на GitHub не помечен как fork, последний push 2026-09-14 | `gh api` |
| Encode httpx | 0.28.1, BSD-3-Clause, последний релиз 2024-12-06; README httpx2: «With HTTPX itself seeing limited activity recently» | метаданные, README |
| В Pydantic AI | `import httpx2` в `pydantic_ai/models/__init__.py:24` и `providers/anthropic.py:33` | исходник |
| Старый клиент | `OpenAIProvider(http_client=httpx.AsyncClient(...))` работает, но выдаёт `PydanticAIDeprecationWarning`: «...will be removed in v3; use httpx2.AsyncClient instead»; `httpx2.MockTransport` есть и принимается | запуск 3.12 |

### 6.2 Карта зависимостей

Версии `mistralai`, `groq`, `cohere`, `xai-sdk`, `fastmcp-slim`, `opentelemetry-instrumentation-httpx` — последние на PyPI
на 2026-09-16. С Pydantic AI 2.43.0 они не разрешались.

| Пакет | Версия | Лицензия | HTTP-зависимость | Как попадает к нам | Итог |
|---|---|---|---|---|---|
| pydantic-ai-slim | 2.43.0 | MIT | `httpx2>=2.7` | ядро | ок |
| openai | 3.14.1 | Apache-2.0 | `httpx2<3,>=2.7.0` | extras `openai`, `openrouter` | ок |
| anthropic | 1.6.0 | MIT | `httpx2<3,>=2.0.0` | extra `anthropic` | ок |
| mcp | 2.2.0 | MIT | `httpx2>=2.5.0` | MCP-сервер | ок |
| fastmcp-slim | 4.0.4 | Apache-2.0 | `httpx2>=2.5.0` в extra `client` | extra `mcp` у pydantic-ai-slim (MCP-клиент агента) | ок |
| starlette | 1.6.0 | BSD-3-Clause | TestClient импортирует `httpx2`, запасной вариант — `httpx` с предупреждением (`starlette/testclient.py:33-49`) | через fastapi | ок |
| uvicorn | 0.53.0 | BSD-3-Clause | нет; базовые зависимости `click`, `h11` | сервер | ок |
| xai-sdk | 1.19.0 | Apache-2.0 | httpx нет | extra `xai` | в поставку не входит (ADR-0025 §1); по HTTP-зависимости ок, не запускался |
| opentelemetry-instrumentation-httpx | 0.65b0 | Apache-2.0 | в базе нет; extra `instruments-any` ставит и `httpx2>=2.0.0`, и `httpx>=0.18.0` | extra `logfire` у pydantic-ai-slim, напрямую и через `logfire[httpx]` | ок без `instruments-any` |
| starlette[full] | 1.6.0 | BSD-3-Clause | `httpx2>=2.0.0` и `httpx<0.29.0,>=0.27.0` | — | не ставим (ADR-0025 §5) |
| fastapi[standard], [standard-no-fastapi-cloud-cli], [all] | 0.141.1 | MIT | `httpx<1.0.0,>=0.23.0` | — | не ставим (ADR-0025 §1, §5) |
| pydantic-ai-slim[retries] | 2.43.0 | MIT | `httpx>=0.27`, `tenacity>=8.2.3` | — | не ставим (ADR-0025 §5; транспортный ретрай — `BackoffModel` на tenacity 9.1.4, [ADR-0029](../adr/0029-trust-and-quality-python.md) §1) |
| logfire[datasets], logfire[gateway] | 5.1.0 | MIT | `httpx>=0.27.2` и `httpx>=0.27.0` | только если extra указан явно; наблюдаемость — py-quality-layer | не нужен |
| google-genai | 2.23.0 | Apache-2.0 | `httpx<1.0.0,>=0.28.1` | extras `google`, `google-realtime` | входит в поставку (extra `google`, ADR-0025 §1); единственный допустимый транзитивный потребитель `httpx` (ADR-0025 §5) |
| mistralai | 2.10.1 | на PyPI не указана | `httpx>=0.28.1` | extra `mistral` | не входит в поставку; добавление — правкой `ALLOWED_CONSUMERS` и ADR-0025 §5 |
| groq | 1.7.0 | Apache-2.0 | `httpx<1,>=0.23.0` | extra `groq` | не входит в поставку; добавление — правкой `ALLOWED_CONSUMERS` и ADR-0025 §5 |
| cohere | 7.1.1 | MIT | `httpx>=0.25.0` | extra `cohere` | не входит в поставку; добавление — правкой `ALLOWED_CONSUMERS` и ADR-0025 §5 |

Правило [ADR-0025](../adr/0025-python-engine.md) §5: наш код импортирует только `httpx2`, это держит ruff TID251
(§9.3). Транзитивные encode `httpx` (только google-genai) и `requests` (OTLP exporter, tiktoken, google-genai,
google-auth; см. py-quality-layer) допустимы, но нашим кодом не импортируются. TID251 видит только импорты в нашем
коде и пакет `httpx` в `uv.lock` не запрещает; состав `uv.lock` сверяет со списком `ALLOWED_CONSUMERS` отдельная
проверка в CI (ADR-0025 §5, скрипт и результаты — §6.4).

### 6.3 Противоречия в инструментах

| Где | Факт | Как решено |
|---|---|---|
| `fastapi[standard]` | extra включает `fastapi-cli[standard]>=0.0.32` и encode `httpx<1.0.0,>=0.23.0` | ADR-0025 §1, §5: ставим `fastapi` без extras; dev-сервер — `aqven dev` поверх uvicorn ([ADR-0026](../adr/0026-yaml-spec-and-code-refs.md) §10) |
| `starlette[full]` | тянет одновременно httpx2 и httpx | ADR-0025 §5: не ставим |
| Имя `FastMCP` | в `mcp` 2.2.0 импорт `mcp.server.fastmcp` падает с `ModuleNotFoundError` и отсылает к `MCPServer` (`mcp/server/fastmcp.py:10`); под именем FastMCP живёт отдельный проект `fastmcp-slim` 4.0.4, его использует extra `mcp` Pydantic AI | ADR-0025 §1: сервер — `mcp.server.MCPServer` |
| httpx2 only (решение владельца от 2026-09-16) против Google | видео на входе есть только у Google и Bedrock, а google-genai 2.23.0 требует `httpx` | ADR-0025 §1, §5: extra `google` входит в поставку, google-genai — единственный допустимый транзитивный потребитель `httpx`, импорт `httpx` в нашем коде запрещён; передача видео и аудио через Google не проверена — открытый вопрос 1 |
| openapi-typescript 7.13.0 | peer `typescript@^5.x` при нашем 6.0.3: npm падает с ERESOLVE, pnpm 10.33.0 только предупреждает, генерация и `tsc` 6.0.3 работают | риск записан в [ADR-0025](../adr/0025-python-engine.md) («Открытые вопросы») и [ADR-0028](../adr/0028-studio-api-contract.md) |
| pytest-asyncio или anyio-плагин | в доке Pydantic AI используется только `pytest.mark.anyio`; плагин anyio приходит транзитивно; вместе оба плагина работают | ADR-0025 §1: pytest 9.1.1 + pytest-asyncio 1.4.0; стиль маркеров — открытый вопрос 9 |

### 6.4 Проверка `uv.lock`

Правило [ADR-0025](../adr/0025-python-engine.md) §5: потребители `httpx` ⊆ {`google-genai`}, потребители `requests` ⊆
{`google-auth`, `google-genai`, `opentelemetry-exporter-otlp-proto-http`, `tiktoken`}. Проверяются `dependencies`,
`optional-dependencies` и `dev-dependencies` каждого пакета в `uv.lock`. Зависимости через extras uv пишет в
`[package.optional-dependencies]`, группы разработки — в `[package.dev-dependencies]`; проверка только по
`dependencies` пропускает `starlette[full]` (запуск). Скрипт прошёл pyright strict и `ruff check`.

| Вариант универсального `uv lock` (uv 0.12.15) | Пакетов | Вывод скрипта | Код выхода |
|---|---|---|---|
| extra `google` | 107 | `uv.lock: ok` | 0 |
| extra `groq` | 108 | `httpx <- groq` | 1 |
| `fastapi[standard]` | 125 | `httpx <- fastapi`, `httpx <- fastapi-cloud-cli` | 1 |
| `starlette[full]` | 109 | `httpx <- starlette` | 1 |

Число пакетов универсального `uv lock` включает корневой проект; `uv pip compile` под `aarch64-apple-darwin` из §2
считает иначе (95 без extra `google`, 102 с ним). У `fastapi[standard]` и `starlette[full]` `httpx` лежит в
`[package.optional-dependencies]`.

```python
import sys
import tomllib
from collections.abc import Mapping
from pathlib import Path
from typing import NotRequired, TypedDict


class LockedDependency(TypedDict):
    name: str


type DependencyGroups = dict[str, list[LockedDependency]]

LockedPackage = TypedDict(
    "LockedPackage",
    {
        "name": str,
        "dependencies": NotRequired[list[LockedDependency]],
        "optional-dependencies": NotRequired[DependencyGroups],
        "dev-dependencies": NotRequired[DependencyGroups],
    },
)

ALLOWED_CONSUMERS: Mapping[str, frozenset[str]] = {
    "httpx": frozenset({"google-genai"}),
    "requests": frozenset(
        {
            "google-auth",
            "google-genai",
            "opentelemetry-exporter-otlp-proto-http",
            "tiktoken",
        }
    ),
}


def declared_names(package: LockedPackage) -> frozenset[str]:
    groups = [
        package.get("dependencies", []),
        *package.get("optional-dependencies", {}).values(),
        *package.get("dev-dependencies", {}).values(),
    ]
    return frozenset(entry["name"] for group in groups for entry in group)


def consumers(packages: list[LockedPackage], dependency: str) -> frozenset[str]:
    return frozenset(
        package["name"] for package in packages if dependency in declared_names(package)
    )


def violations(packages: list[LockedPackage]) -> list[str]:
    return [
        f"{dependency} <- {name}"
        for dependency, allowed in ALLOWED_CONSUMERS.items()
        for name in sorted(consumers(packages, dependency) - allowed)
    ]


def main() -> int:
    lock = tomllib.loads(Path("uv.lock").read_text())
    packages: list[LockedPackage] = lock["package"]
    found = violations(packages)
    print("\n".join(found) or "uv.lock: ok")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
```

Новый провайдер, SDK которого тянет encode `httpx` (по PyPI на 2026-09-16: `mistralai` 2.10.1, `groq` 1.7.0,
`cohere` 7.1.1 — extras `mistral`, `groq`, `cohere` у pydantic-ai-slim), добавляется только правкой `ALLOWED_CONSUMERS`
и ADR-0025 §5.

## 7. MCP SDK 2.2.0

| Факт | Значение | Проверка |
|---|---|---|
| Пакет | `mcp` 2.2.0, MIT, 2026-09-07; modelcontextprotocol/python-sdk, 24.3k★; v2 SDK под спецификацию MCP 2026-07-28 | метаданные, `gh api` |
| Переименование | `FastMCP` → `from mcp.server import MCPServer` | исходник, запуск 3.14 |
| Зависимости | `httpx2>=2.5.0`, `sse-starlette>=3.0.0`, `uvicorn>=0.31.1`, `mcp-types==2.2.0`, `starlette>=0.48.0` на 3.14, `pyjwt[crypto]>=2.10.1`, `jsonschema>=4.20.0` | метаданные |
| Транспорт | `streamable_http_app(streamable_http_path="/mcp", json_response=False, stateless_http=False, transport_security=...)` возвращает Starlette-приложение | исходник `mcp/server/mcpserver/server.py:1279` |
| Монтирование | у смонтированного подприложения lifespan не выполняется, поэтому lifespan хоста обязан войти в `mcp.session_manager.run()` | доки ASGI, исходник `server.py:310` |
| Один порт | FastAPI с REST, SSE и `app.mount("/mcp", ...)` запущен под uvicorn на 127.0.0.1; `mcp.Client("http://127.0.0.1:<port>/mcp/")` получил тулы со схемами входа и выхода (схема выхода выведена из Pydantic-типа возврата); `call_tool` вернул `structured_content`; `Client(mcp)` работает внутри процесса, для тестов | запуск 3.14 |
| `/mcp` без слеша | работает, но каждый запрос проходит через 307 | запуск 3.14 |
| OpenAPI | MCP-маунт в `/openapi.json` не попадает | запуск 3.14 |
| Host | по умолчанию принимаются только запросы к localhost; за реальным именем хоста ответ 421 Misdirected Request, пока не задан `transport_security` | доки ASGI |

Имя сервера — `aqven`, схема ресурсов — `aqven://` ([ADR-0025](../adr/0025-python-engine.md) §8). Фрагмент ниже
проверен на 3.14.7: SSE вернул два события, `list_tools` показал `run_get` с описанием, `call_tool` вернул
`{'run_id': 'r1', 'status': 'running'}`. Описание тула передаётся параметром `description`
(`MCPServer.tool(name, title, description, annotations, icons, meta, structured_output)`), а не docstring.

```python
from collections.abc import AsyncIterable, AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI
from fastapi.sse import EventSourceResponse
from mcp.server import MCPServer
from pydantic import BaseModel

mcp = MCPServer("aqven")


class RunSummary(BaseModel):
    run_id: str
    status: Literal["queued", "running", "suspended", "completed", "failed", "cancelled"]


class NodeFinished(BaseModel):
    type: Literal["node_finished"]
    node_id: str


@mcp.tool(description="Run status and stage summary.")
def run_get(run_id: str) -> RunSummary:
    return RunSummary(run_id=run_id, status="running")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    async with mcp.session_manager.run():
        yield


app = FastAPI(lifespan=lifespan)


@app.get("/api/runs/{run_id}/events", response_class=EventSourceResponse)
async def run_events(run_id: str) -> AsyncIterable[NodeFinished]:
    for node_id in ("draft", "review"):
        yield NodeFinished(type="node_finished", node_id=node_id)


app.mount("/mcp", mcp.streamable_http_app(streamable_http_path="/"))
```

## 8. FastAPI 0.141.1: SSE

| Факт | Проверка |
|---|---|
| `fastapi.sse.EventSourceResponse` (`fastapi/sse.py:20`) и `ServerSentEvent` (`sse.py:52`) появились в 0.135.0 (2026-03-01) | исходник, release notes |
| `response_class=EventSourceResponse` на async-генераторе; работает с GET и POST | запуск 3.14 |
| Pydantic-модель кодируется в JSON внутри `data:`; `ServerSentEvent` поддерживает `event`, `id`, `retry`, а `raw_data` — для текста не в JSON; строка в `data` получает JSON-кавычки | запуск 3.14 |
| Ответ: `text/event-stream; charset=utf-8`, тело `data: {"type":"node_finished","node_id":"draft"}\n\n...` | запуск 3.14 |
| OpenAPI: `openapi: 3.1.0`, `content."text/event-stream".itemSchema.properties.data.contentSchema.$ref = #/components/schemas/NodeEvent`; `itemSchema` — ключ из OpenAPI 3.2 | запуск 3.14 |
| `sse-starlette` нашим маршрутам не нужен, но всё равно приходит транзитивно через `mcp` | метаданные |
| Тесты: TestClient Starlette 1.6.0 использует httpx2; стрим через `httpx2.ASGITransport` отдал те же строки | исходник, запуск 3.14 |
| openapi-typescript 7.13.0 (MIT) превращает SSE-ответ в `"text/event-stream": unknown`, но `components["schemas"]["NodeEvent"]` генерирует; открыты issue #2723 (TypeScript 6), PR #2774 и #2818 (TypeScript 6) и PR #2683 (`itemSchema`) | запуск (pnpm 10.33.0, `tsc` 6.0.3), метаданные |

Как это используется в контракте ([ADR-0028](../adr/0028-studio-api-contract.md) §4, §6): модели событий публикуются
компонентами OpenAPI, клиент на входе проверяет дискриминатор `type`, `Last-Event-ID` равен `seq`. Нормативная часть —
[ADR-0028](../adr/0028-studio-api-contract.md) и [23. API локальной студии](../23-studio-api.md).

## 9. Инструменты

### 9.1 Версия Python

| Версия | Статус на 2026-09-16 | Последний релиз | EOL | Стек разрешается |
|---|---|---|---|---|
| 3.12 | security | 3.12.14 (2026-08-12) | 2028-10 | да, 97 пакетов |
| 3.13 | bugfix | 3.13.15 (2026-08-05) | 2029-10 | да, 97 пакетов |
| 3.14 | bugfix | 3.14.7 (2026-08-05), latest | 2030-10 | да, 97 пакетов |
| 3.15 | prerelease | 3.15.0rc2 (2026-09-01), первый релиз запланирован на 2026-10-01 | 2031-10 | нет |

| Что ограничивает | Факт |
|---|---|
| Нижняя граница 3.12 | `scipy` 1.18.1: `requires_python >=3.12` |
| 3.15 блокирует dbos | `dbos` 2.31.1 всегда требует `psycopg[binary]>=3.1`, а у `psycopg-binary` 3.3.5 нет колёс cp315 |
| 3.15 блокирует gepa | `gepa` 0.1.4: `<3.15,>=3.10` |
| Классификаторы до 3.14 | `pydantic-ai-slim` 2.43.0 (3.10–3.14), `dbos` 2.31.1 (3.10–3.14), `python-liquid` 2.3.1 (3.9–3.14) |
| Колёса cp315 уже есть | `pydantic-core` 2.49.0, `numpy` 2.5.3, `statsmodels` 0.15.0, `watchfiles` 1.2.0, `greenlet` 3.5.6 |
| Колёса только до cp314 | `uvloop` 0.22.1, `httptools` 0.8.0, `sqlalchemy` 2.0.54, `psycopg-binary` 3.3.5 |

Вывод `uv pip compile --python-version 3.15`: «Because psycopg-binary{implementation_name != 'pypy'}==3.3.5 has no wheels
with a matching Python ABI tag (e.g., `cp315`) ... dbos==2.31.1 depends on psycopg[binary]>=3.1 ... your requirements are
unsatisfiable».

Решение ([ADR-0025](../adr/0025-python-engine.md) §1): CPython 3.14, `requires-python = ">=3.14,<3.15"`. Запасной
вариант — 3.13, стек на нём разрешается в тот же набор. Почему 3.14: самая новая ветка в статусе bugfix с самым длинным
сроком поддержки, pyright принимает `pythonVersion = "3.14"`, ruff — `target-version = "py314"`. Оговорка: пробы
с меткой `запуск 3.12`, включая перехват запросов (§3.4), шли на CPython 3.12.4, хотя ось фиксирует 3.14; повтор
на 3.14.7 — открытый вопрос 6. На 3.14.7 выполнены импорты стека, пробы DBOS (§5.1), ожидания человека (§5.5), MCP и
SSE (§7, §8), строки §3.5 с меткой `запуск 3.14` и перехват OpenAI Chat, OpenAI Responses и Anthropic (§3.4).

### 9.2 uv workspace и uv_build

| Факт | Проверка |
|---|---|
| Workspace: `[tool.uv.workspace] members = ["packages/*"]`; члены workspace зависят друг от друга через `[tool.uv.sources] x = { workspace = true }`, и такие зависимости editable | доки workspaces, запуск 3.14 |
| Корень может быть виртуальным (только `[tool.uv.workspace]`, без `[project]`); `uv lock` создаёт один `uv.lock` с `version = 1`, `revision = 3`, `requires-python = "==3.14.*"` | запуск 3.14 |
| `uv build --all-packages` собирает wheel каждого члена | запуск 3.14 |
| uv_build без настройки кладёт в wheel всё содержимое `src/<module>`: `.md`, `.yaml`, `.json`, `py.typed`; исключает только `__pycache__`, `*.pyc`, `*.pyo` | доки build-backend, `unzip -l` |
| Данные должны лежать под корнем модуля; бэкенд поддерживает только чистый Python | доки build-backend |
| После установки wheel `importlib.resources.files("aqven_core").joinpath("prompts/default.prompt.md")` читает промт | запуск 3.14 |
| hatchling 1.32.0 (MIT) с `packages = ["src/<module>"]` тоже кладёт данные в wheel; исключение по `.gitignore` внутри git не проверялось | запуск 3.14 |
| Локально установлен uv 0.11.14 — старее 0.12.15; пробы шли на uv 0.12.15 из отдельного venv | запуск 3.14 |

Это основа сборки wheel с `.yaml` и `.md` в `aqven build` ([ADR-0026](../adr/0026-yaml-spec-and-code-refs.md) §10).

```toml
[tool.uv.workspace]
members = ["packages/*"]

[tool.uv]
required-version = ">=0.12.15"
```

```toml
[project]
name = "aqven-core"
version = "0.1.0"
requires-python = ">=3.14,<3.15"
dependencies = ["pydantic==2.13.5"]

[build-system]
requires = ["uv_build>=0.12.15,<0.13"]
build-backend = "uv_build"
```

### 9.3 ruff TID251

Правило TID251 (flake8-tidy-imports banned-api, ruff 0.16.7) ловит `import httpx` и `from httpx import AsyncClient`,
не трогает `import httpx2` и умеет запрещать подмодуль, например `pydantic_ai.models.openai`. Так запрет импортов
провайдеров за пределами LLM-пакета переносится в Python. Вложенный `ruff.toml` с `extend = "../../pyproject.toml"` и своей
таблицей `banned-api` заменил таблицу для своего каталога. Это видно по запуску, в доке такой цитаты нет (открытый вопрос 8).

```toml
[tool.ruff]
target-version = "py314"
src = ["src"]

[tool.ruff.lint]
select = ["E", "F", "TID"]

[tool.ruff.lint.flake8-tidy-imports]
ban-relative-imports = "all"

[tool.ruff.lint.flake8-tidy-imports.banned-api]
"httpx".msg = "Use httpx2: the project allows only httpx2."
"requests".msg = "Use httpx2."
"pydantic_ai.models.openai".msg = "Provider SDK imports live only in the LLM package."
```

Результат запуска: `TID251 httpx is banned` на `client.py:1:8` и `:2:1`, `TID251 pydantic_ai.models.openai is banned`
на `:4:1`, всего «Found 3 errors»; `import httpx2` без замечаний.

### 9.4 pyright strict

| Факт | Проверка |
|---|---|
| `[tool.pyright] typeCheckingMode = "strict"` читается из `pyproject.toml`; если есть `pyrightconfig.json`, приоритет у него | доки configuration.md |
| Допустимые значения `off`, `basic`, `standard`, `strict`; по умолчанию `standard` | доки |
| На одном и том же файле strict дал 9 ошибок (`reportUnknownParameterType`, `reportMissingParameterType`, `reportMissingTypeArgument`, `reportUnknownVariableType`), basic — 0 | запуск 3.14 |
| `pythonVersion = "3.14"`, `venvPath`/`venv` принимаются | запуск 3.14 |
| Пакет на PyPI — обёртка: зависит от `nodeenv`, extra `nodejs` добавляет `nodejs-wheel-binaries`; в пробе работал на системном Node 20.19.0 | метаданные, запуск 3.14 |
| GitHub microsoft/pyright: SPDX `NOASSERTION`; обёртка на PyPI — MIT | `gh api`, метаданные |

```toml
[tool.pyright]
typeCheckingMode = "strict"
pythonVersion = "3.14"
include = ["src"]
reportMissingTypeStubs = "error"
reportImplicitOverride = "error"
reportUnnecessaryTypeIgnoreComment = "error"
```

### 9.5 pytest

| Факт | Проверка |
|---|---|
| pytest 9.1.1 (MIT), pytest-asyncio 1.4.0 (Apache-2.0, `pytest<10,>=8.4`), anyio 4.15.1 (MIT) со своим плагином `anyio = anyio.pytest_plugin` | метаданные |
| anyio приходит транзитивно через `mcp`, `starlette`, `httpx2` и `watchfiles` | метаданные |
| На 3.14.7 оба плагина загрузились вместе: прошли тест в `asyncio_mode = "auto"` и тест с `@pytest.mark.anyio` | запуск 3.14 |
| Гайд Pydantic AI по тестам: `pytestmark = pytest.mark.anyio`, `models.ALLOW_MODEL_REQUESTS = False`; рекомендует inline-snapshot 0.35.4 (лицензия в метаданных PyPI пустая) и dirty-equals 0.11 (MIT) | доки testing |

```toml
[tool.pytest.ini_options]
minversion = "9.0"
testpaths = ["tests"]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
addopts = ["--strict-markers", "--strict-config"]
```

### 9.6 uvicorn и watchfiles

| Пакет | Факт | Проверка |
|---|---|---|
| uvicorn 0.53.0 | базовые зависимости `click`, `h11`; extra `standard` добавляет `httptools`, `uvloop`, `watchfiles`, `websockets`, `python-dotenv`, `pyyaml`; `uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=...))` + `await server.serve()` обслужил FastAPI вместе с MCP | метаданные, запуск 3.14 |
| uvicorn `--reload` | использует watchfiles, если он установлен (`uvicorn/supervisors/__init__.py:12`) | исходник |
| watchfiles 1.2.0 | `awatch(path, watch_filter=<наследник DefaultFilter>, stop_event=..., debounce=300)` увидел новые `.yaml` и `.prompt.md` и пропустил `.tmp` через фильтр; колёса cp310–cp315 | запуск 3.14 |

## 10. Сравнение с VoltAgent 2.10.0

VoltAgent умеет больше, чем workflow: в нём есть evals, scorers, guardrails и MCP-сервер ([DECISIONS.md](../DECISIONS.md),
раздел «Что берём у VoltAgent готовым»). Слой семантики — first-match у `switch`, `quorum(k)`, лимиты циклов,
`on_item_error` — пишем сами при любом выборе ([ADR-0025](../adr/0025-python-engine.md) §3). От VoltAgent отказались
решением владельца от 2026-09-16; отклонение от требования спеки R23 фиксирует
[ADR-0025](../adr/0025-python-engine.md) §7.

| Возможность | VoltAgent 2.10.0 (DECISIONS) | Python-стек | Статус |
|---|---|---|---|
| Регистрация версий воркфлоу | `WorkflowRegistry.registerWorkflow` | IR с хешем → модуль (ADR-0026 §10) | пишем |
| Чекпоинт после шага | running-чекпоинт после каждого шага | результат DBOS-шага пишется в системную БД | проверено запуском |
| Восстановление после падения | restart по чекпоинту | `DBOS.launch()` восстанавливает незавершённые прогоны | проверено запуском |
| Replay и fork | `timeTravel({executionId, stepId, ...})` | `DBOS.fork_workflow(id, start_step)`; шаги до `start_step` копируются, остальные выполняются заново | проверено запуском |
| Выходы узлов | `getStepData(stepId)` | `list_workflow_steps` (`output` по шагу) | проверено запуском |
| Правка входа при fork | `inputData`, `workflowStateOverride` | в сигнатуре `fork_workflow` такого параметра нет | открытый вопрос 5 |
| Человек в цикле | `suspend()` + `suspendSchema`/`resumeSchema` | `set_event` + `recv(topic, timeout_seconds)`, форма — JSON Schema Pydantic-модели; признак «ждёт», защита от повторного resume и проверка дедлайна — наши (§5.5) | проверено запуском |
| Возобновление по таймауту | своего нет → pg-boss | таймаут `recv` — долговечный `DBOS.sleep`, политики `fail`/`default`/`escalate` в workflow; pg-boss уходит (ADR-0025 §4) | проверено запуском (§5.5) |
| Lineage форков | не сохраняется в типизированные поля | `WorkflowStatus.forked_from` хранит id исходного прогона, `list_workflows(forked_from=...)` фильтрует (§5.1); правка входа и наши поля lineage — открытый вопрос 5 | исходник, запуск 3.14 |
| Пошаговый прогресс | `WorkflowStreamEvent` | стрим DBOS `run_events` + SSE FastAPI 0.141.1 (§5.5) | пишем, SSE и стрим проверены |
| Переопределение модели и инструкций на вызове | нельзя в опциях вызова | в `Agent.run` есть `model` и `instructions` (`abstract.py:525`) | исходник |
| PII и инъекции | `createPIIInputGuardrail`, `createPromptInjectionGuardrail` | в этой сессии не исследовалось | открытый вопрос 7 |
| Публикация как MCP | `@voltagent/mcp-server` | `mcp` 2.2.0 `MCPServer`, тулы по 14-mcp-contract | монтирование проверено |
| HTTP жизненный цикл | `@voltagent/server-hono` | FastAPI 0.141.1, маршруты пишем | проверено запуском |
| Трассы | `VoltAgentObservability` | см. py-quality-layer | вне документа |
| Офлайн-evals | `@voltagent/evals`, `@voltagent/scorers` | pydantic-evals 2.43.0, см. py-quality-layer | вне документа |

Экспорт в VoltAgent и другие фреймворки (требование спеки R21 в части экспорта, kill-критерии 14 и 15) отменён решением
владельца от 2026-09-16: «Экспорт не нужен, у нас будут HTTP-вызовы». Вместе с ним отменены codegen в цели, скилл
воссоздания, конформанс против воссозданной реализации и экран «Экспорт». Интеграция с другими системами — вызовы
воркфлоу по HTTP и MCP (`aqven serve`). Отклонение от спеки фиксирует [ADR-0025](../adr/0025-python-engine.md) §7.
Отменяется ли и `project_export` с целью `agent_workflow_spec` (IR обратно в документ скилла) — открытый вопрос 15.

## 11. Monty 0.0.23 (для справки, не берём)

`pydantic-monty` 0.0.23, MIT, 2026-09-05, github.com/pydantic/monty; на PyPI описан как «The Monty sandboxed Python
interpreter: bindings plus the worker binary». Решение владельца от 2026-09-16: не берём (записано в
[ADR-0025](../adr/0025-python-engine.md), «Альтернативы», и [ADR-0026](../adr/0026-yaml-spec-and-code-refs.md) §7).
Встроенные выражения — это закрытая грамматика проекций ([04. IR](../04-ir-schema.md) §3.2) и `switch`, всё остальное
делает шаг `code`.

| Проба (запуск 3.12) | Результат |
|---|---|
| Что это | песочница на Rust, исполняющая подмножество Python |
| Работают | `json`, `re`, `math`, `datetime`, `collections`, `itertools`, `typing`, `dataclasses` |
| Не работают | `random`, `time`, `pydantic`, `pandas` |
| Без хоста запрещены | `datetime.now()`, доступ к файлам |
| `type_check=True` | ловит ошибки типов |
| Лимит времени | работает |
| Пауза на внешнем вызове | снимок размером 4894 байта продолжен в другом процессе |

## 12. Kitaru 0.26.0 — оценка как слоя надёжного исполнения

Пробы выполнялись вне репозитория 2026-09-16 на CPython 3.14.7: kitaru 0.26.0 установлен без проблем, сервер запущен
без Docker на встроенном PostgreSQL 16.14 (pixeltable-pgserver), без аккаунта и платных API, модель — `FunctionModel`.
Адаптер kitaru-pydantic-ai 0.2.1 запускался только на pydantic-ai-slim 2.40.0: рядом с 2.43.0 он не ставится.
Независимо не перепроверялось: владелец принял пробу без перепроверки.

Что это сейчас. До 0.21.0 Kitaru был надёжным исполнением на ZenML (`@kitaru.flow`, `@kitaru.checkpoint`, `kitaru.wait`,
replay). Релиз 0.22.0 от 2026-08-18 («v2») заменил его платформой записи прогонов агента как сессий и их replay для evals:
agents, sessions, replays, cohorts, experiments, evaluators, analyzers, insights; сервер на FastAPI и PostgreSQL плюс
воркеры. Описание на PyPI сменилось с «Durable execution for AI agents, built on ZenML» (0.1.0–0.10.0) на «Record,
replay, and improve AI agents in production.» (с 0.22.0). Дока репозитория (`docs/book/concepts/under-the-hood.md`):
«Kitaru deliberately does not run your production agent ... Durable execution of agents in production is ZenML's job:
ZenML runs agents durably; Kitaru replays and improves them». В 0.26.0 импорт `kitaru.flow`, `kitaru.checkpoint`,
`kitaru.wait`, `kitaru.adapters.pydantic_ai`, `kitaru.replay`, `kitaru.llm` падает с `ModuleNotFoundError`, `dir(kitaru)`
пуст. Страница Pydantic AI про Kitaru (durable_execution/kitaru) описывает удалённое API v1, так что попадание в список
интеграций о текущей версии ничего не говорит.

| # | Требование | Kitaru 0.26.0 | DBOS 2.31.1 | Лучше |
|---|---|---|---|---|
| Q1 | Зрелость, лицензия, обязательная инфраструктура | Apache-2.0, «Development Status 4 - Beta»; первый релиз 0.1.0 от 2026-03-06, 52 релиза (11 — кандидаты 0.22.0), 0.26.0 от 2026-09-10, ломающая переделка за 4 недели до пробы; zenml-io/kitaru — 289★, 20 форков, 47 открытых issues и PR, 15 контрибьюторов, ведёт ZenML GmbH. Сервер нужен при любом использовании: `kitaru login --local` (Docker Compose, образ сервера `linux/amd64`, `postgres:16-alpine`), облако с 14-дневным триалом или self-host на Docker/Helm. Аналитика сервера включена по умолчанию (`ANALYTICS_OPT_IN = True`, отправка на analytics.zenml.io) | MIT; библиотека в процессе; локально SQLite без сервера, в проде PostgreSQL | DBOS |
| Q2 | Совместимость зависимостей со стеком | `httpx<1,>=0.27`, `pydantic<3,>=2`; extras `cli`, `examples`, `mcp`, `modal`, `otel`, `s3`, `server` (alembic, asyncpg, `fastapi>=0.139`, sqlalchemy[asyncio], uvicorn и др.), `worker`. На 3.14.7 ставится 12 пакетами; `uv pip compile --python-version 3.14` вместе с pydantic-ai-slim 2.43.0, fastapi 0.141.1, scipy 1.18.1, gepa 0.1.4 и dbos разрешается и с extras `cli,worker,mcp,server,otel`, но тянет encode `httpx` 0.28.1 рядом с httpx2 2.13.0 (kitaru нет в `ALLOWED_CONSUMERS`, §6.4). kitaru-pydantic-ai 0.2.1 требует `pydantic-ai-slim>=2.14.1,<2.41` — с 2.43.0 unsatisfiable. Ветка 0.21.0 тоже не разрешается: `kitaru[pydantic-ai]` → `pydantic-ai-slim<1.104`, `kitaru` → `genai-prices<0.1` против `>=0.1.6` у pydantic-ai-slim 2.43.0, `kitaru[local]` → `zenml[server]` 0.96.4 с `fastapi<0.139` | разрешается с тем же стеком | DBOS |
| Q3 | Модель исполнения под интерпретатор IR | модели workflow и шага нет. Сессия — запись одного прогона агента: дерево узлов `llm_call`, `tool_call`, `subagent_call`, `span` от адаптера или импорт трасс Langfuse, LangSmith, Braintrust, Logfire, Phoenix. Воркер исполняет `RunSpec` версии агента — shell-команду подпроцессом (`timeout_seconds` 3600). Интерпретатор IR можно запустить таким процессом и записать узлами, но надёжности шагов, планирования и исполнения графа Kitaru не даёт | workflow — функция Python, шаги вызываются в рантайме, интерпретатор графа ложится при детерминированном порядке шагов (§4, ADR-0025 §3; в этой пробе не повторялось) | DBOS |
| Q4 | Чекпоинт шага и восстановление после падения | нет. SIGKILL внутри ветки (код 137): сессия навсегда `in_progress`, в ней только узел 0 (`span run`); завершённые `llm_call` и `tool_call` первого шага не записаны — адаптер держит узлы в памяти до `batch_size=20` или конца прогона. Перезапуск той же команды создал новую несвязанную сессию и повторил побочный эффект первого шага. Replay упавшей сессии → 409 «does not accept evaluations». Состояние только в PostgreSQL сервера (драйвер `postgresql+asyncpg`, блобы в БД или S3), SQLite и файлового режима нет; сервер недоступен → прогон падает с `ConnectError`. Задача воркера без heartbeat 60 с перезапускается целиком, до 3 раз | чекпоинт на шаг в SQLite или PostgreSQL, восстановление проверено (§5.1, §5.5) | DBOS |
| Q5 | Replay и fork с шага | replay всегда с начала на воркере, точки среза нет; «fork» — replay с override `model`, `system_prompt`, `prompt`, `model_params`. Тулы отвечаются политикой: `history` (по хешу имени и аргументов), `static`, `passthrough`, `llm` (адаптер Pydantic AI её отвергает). Ответы модели хранятся, но не воспроизводятся: replay с `prompt: "changed input"` и политикой `history` вызвал модель 4 раза, побочных эффектов тулов 0. Lineage: `baseline_session_id`, `result_session_id`, `origin=replay`; каждый replay требует хотя бы один evaluator. Дока: «Replays re-run the agent from the top. There is no partial, mid-run cut point», «There is no separate fork operation in the API» | `fork_workflow` копирует вход и выходы шагов до выбранного, ссылка `forked_from`; шаги до точки, включая вызовы модели, не повторяются | DBOS |
| Q6 | Ожидание человека | примитивов wait, signal, timeout, resume нет; `SessionStatus` — только `in_progress`, `completed`, `failed`. Пауза и продолжение между процессами получились только через deferred tools Pydantic AI: процесс A закончился `DeferredToolRequests`, историю сообщений в файл сохранили сами, процесс B продолжил с `DeferredToolResults` (`published`); Kitaru записал две несвязанные сессии. Таймаута, поиска ожидающих и параллельных ожиданий нет. `kitaru.wait(schema, name, question, timeout, metadata)` и `@hitl_tool` из v1 удалены | §5.5 | DBOS |
| Q7 | Параллельность внутри прогона | примитивов branch, map, queue нет; параллельные вызовы тулов конкурентны силами Pydantic AI (ветки перекрылись по времени), Kitaru их только записывает. Параллельность — только между задачами: `kitaru worker start --concurrency N` (по умолчанию 10 с 0.22.0), маршрутизация по меткам, эксперименты по когортам; лимитов конкурентности на свои очереди нет | очереди с лимитами конкурентности (дока), дочерние workflow и конкурентные шаги внутри прогона (§5.5, п. 9) | DBOS |
| Q8 | Интеграция с Pydantic AI и цепочкой гарантий | страница доки Pydantic AI описывает удалённое API: `from kitaru.adapters.pydantic_ai import KitaruAgent`, `@kitaru.flow`, `@hitl_tool`, стратегии чекпоинтов `calls`/`turn`, `uv add "kitaru[pydantic-ai,local]"`, `kitaru init`. Текущий адаптер — пакет kitaru-pydantic-ai 0.2.1: `KitaruAgent(WrapperAgent)` добавляет `_KitaruCapability` с порядком `outermost` и хуками `for_run`, `wrap_run`, `after_run`, `on_run_error`, `before_node_run`, `wrap_model_request`, `wrap_tool_execute`; он записывает прогон и применяет политики replay, надёжности не даёт. Без override передаёт `request_context.model` как есть; с override модели подставляет `infer_model(replacement)` и обходит цепочку `WrapperModel` (OutcomeGate, Redaction, Cassette, Limiter, BackoffModel). Как самая внешняя capability записывает сообщения до Redaction, поэтому нередактированные промты и ответы уходят на сервер Kitaru; `kitaru/redaction.py` маскирует только ключи и значения, похожие на секреты. При недоступном сервере прогон падает при создании сессии | capability `DBOSDurability` в pydantic-ai-slim 2.43.0 (`DBOSAgent` устарел), запуск — §5.5 | DBOS |
| Q9 | UI, API и наблюдаемость | сервер отдаёт React UI (`kitaru-ui-v0.5.0`) на корне, REST `/api/v1` с OpenAPI на `/openapi.json` (97 путей), Swagger на `/docs`, UI-эндпоинты вида `/api/v1/ui/sessions`, CORS `*` по умолчанию; extra `otel` экспортирует трассы, метрики и логи самого сервера по OTLP; есть сервер kitaru-mcp и импортёры трасс. Всё это — данные eval-сессий, а не состояние прогонов workflow | интроспекция через API в процессе (`list_workflows`, `list_workflow_steps`); UI в открытой библиотеке нет, Conductor не оценивался (ADR-0025, открытый вопрос 16) | Kitaru |
| Q10 | Хранилище и эксплуатация | только PostgreSQL (asyncpg) и локально, и в проде; миграции Alembic при старте сервера (20 ревизий → 36 таблиц, head `019_import_max_sessions`), read-реплики поддерживаются. Безопасность нескольких процессов держит сервер: блокировки строк в фиксированном порядке, `SKIP LOCKED` при захвате задач, `Idempotency-Key` на POST хранится 15 мин, heartbeats воркеров. Воркеры и сервер обновляются вместе (HTTP 426 для воркеров ≤ 0.22.2). Накладные расходы: 20 вызовов тулов на `FunctionModel` — медиана 27.9 мс без Kitaru и 107.7 мс с `KitaruAgent` и локальным сервером (5.38 мс на шаг, около +4 мс к прогону без Kitaru); записи идут пачками, поэтому надёжности на шаг эта цена не покупает | библиотека в процессе: SQLite локально, PostgreSQL в проде, без отдельного сервера | DBOS |

Блокеры:

1. Надёжного исполнения нет: API flow, checkpoint, wait, resume удалено в переделке 0.22.0, дока передаёт надёжное
   исполнение ZenML.
2. Сервер обязателен: FastAPI и PostgreSQL (только asyncpg), без SQLite и файлового режима; при недоступном сервере
   прогон агента падает с `ConnectError`. Это противоречит локальному движку без отдельного сервиса.
3. Восстановления после падения нет: убитый прогон навсегда `in_progress`, завершённые шаги теряются (узлы в памяти до
   20 или конца прогона), replay упавшей сессии отклоняется (409), перезапуск повторяет побочные эффекты и вызовы модели.
4. Replay всегда с начала и зовёт модель вживую: fork с выбранного шага нет, ответы модели не воспроизводятся — ни
   `fork_workflow` DBOS, ни нашу Cassette это не заменяет.
5. Ожидания человека нет: ни wait, ни таймаута, ни статуса ожидания, ни поиска ожидающих; пауза и продолжение — только
   deferred tools Pydantic AI и состояние, которое храним сами.
6. kitaru-pydantic-ai 0.2.1 пинит `pydantic-ai-slim<2.41` и не разрешается с 2.43.0; старая ветка 0.21.0 тоже
   (`pydantic-ai-slim<1.104`, `genai-prices<0.1` против `>=0.1.6`, `zenml[server]` с `fastapi<0.139` против 0.141.1).
7. Override модели в адаптере подменяет модель через `infer_model` и обходит цепочку `WrapperModel` (OutcomeGate,
   Redaction, Cassette, Limiter, BackoffModel); как самая внешняя capability адаптер отправляет на сервер Kitaru
   нередактированные промты и ответы.
8. Продукт нестабилен: Beta, 52 релиза за 6 месяцев, ломающая переделка за 4 недели до пробы, аналитика включена по
   умолчанию, а страница Kitaru в доке Pydantic AI описывает несуществующее API.

Решение владельца от 2026-09-16 (запись — [ADR-0025](../adr/0025-python-engine.md)): Kitaru 0.26.0 как слой надёжного
исполнения не берём, остаётся DBOS. Преимущество у Kitaru одно — готовые UI и REST API, но они показывают eval-сессии, а не
состояние прогонов. Даже как необязательный офлайн-инструмент eval и replay он добавил бы сервер на PostgreSQL и воркеры,
обходил бы цепочку `WrapperModel` при override модели и дублировал бы Cassette и работу с gepa. Возвращаемся, только если
выполнены все три условия: kitaru-pydantic-ai поддерживает `pydantic-ai-slim>=2.43`, override модели перестаёт обходить
модели-обёртки и мы решаем завести отдельный eval-сервер. И тогда Kitaru встаёт рядом с DBOS, а не вместо него.

## Открытые вопросы

1. **Видео и аудио на входе через Google.** Путь провайдера закрыт [ADR-0025](../adr/0025-python-engine.md) §1, §5:
   extra `google` входит в поставку, google-genai 2.23.0 — единственный допустимый транзитивный потребитель encode
   `httpx`, импорт `httpx` в нашем коде запрещён. Не проверено, что видео- и аудиочасти (`VideoUrl`, `AudioUrl`,
   `BinaryContent`) доходят до запроса через `GoogleModel`; видео на входе по доке есть только у Google и Bedrock.
   Как закрыть: перехват запросов `GoogleModel` без сети на 3.14.7 (google-genai ходит через encode `httpx`, поэтому
   нужен его `MockTransport`) с каждой медиачастью; сверить, где часть лежит в теле запроса.
2. **Состав провайдеров в поставке — закрыт** [ADR-0025](../adr/0025-python-engine.md) §1, §5. В поставке
   `pydantic-ai-slim[openai,anthropic,google]`. SDK Mistral 2.10.1, Groq 1.7.0 и Cohere 7.1.1 тянут encode `httpx`
   и в поставку не входят; добавление любого из них — правкой `ALLOWED_CONSUMERS` и ADR-0025 §5.
3. **DBOS: параллельные шаги узлов, очереди, отмена, PostgreSQL 18 ([ADR-0025](../adr/0025-python-engine.md) §4).**
   Ожидание человека, таймеры, падение во время ожидания и параллельные ожидания проверены на SQLite (§5.5). Не
   проверены: параллельные шаги узлов (`parallel` с `quorum(k)`, `map` с конкурентностью) через `start_workflow_async`
   и `Queue`, `cancel_workflow`, `resume_workflow`, всё то же на PostgreSQL 18, перенос ожидающих прогонов на новую
   `application_version` через `fork_workflow(application_version=...)`. Как закрыть: спайк на SQLite и PostgreSQL 18
   с падением процесса посередине; что сравнивать — сколько раз повторились шаги и что вернул `list_workflow_steps`.
4. **Агент внутри нашего DBOS-workflow и цепочка гарантий.** `DBOSAgent` создаёт свой workflow `<name>.run` и устарел
   (`@deprecated` в `durable_exec/dbos/_agent.py`); замена — capability `DBOSDurability`, с которой `agent.run()`
   вызывается внутри нашего `@DBOS.workflow`, а запросы модели идут DBOS-шагами `<имя агента>__model.request`. Так она
   запущена в пробе одобрения тула с `FunctionModel`, падением процесса и fork (§5.5). Не проверены сочетание с цепочкой
   гарантий [ADR-0029](../adr/0029-trust-and-quality-python.md) §1 (снаружи внутрь: OutcomeGate → Redaction → Cassette →
   Limiter → BackoffModel → модель провайдера с `max_retries=0`) и вызов внутри шага узла (шаг внутри шага). Как
   закрыть: спайк `Agent(..., capabilities=[DBOSDurability()])` с цепочкой из фабрики `aqven_llm` внутри `run_flow` на
   SQLite с падением процесса; подсчёт вызовов модели, `list_workflow_steps` и `fork_workflow` на уровне родителя.
5. **Fork в DBOS: правка входа и наши поля lineage.** Ссылка форка на исходный прогон хранится (`forked_from`, §5.1),
   но в сигнатуре `fork_workflow` нет параметра нового входа, а среди полей `WorkflowStatus` (`dbos/_sys_db.py:145`)
   нет номера шага, с которого сделан fork. Смысл параметра `replacement_children` не изучался. Как закрыть: спайк
   fork с изменённым входом; решить, хватает ли `forked_from` или нужна своя таблица lineage со шагом и правками
   ([16](../16-data-model.md) §2.9; вопрос отслеживается как открытый вопрос 8 [ADR-0025](../adr/0025-python-engine.md)).
6. **Пробы с меткой `запуск 3.12` на 3.14.7.** Результаты с этой меткой получены на CPython 3.12.4, а ADR-0025
   фиксирует 3.14. Перехват §3.4 на 3.14.7 повторён только для OpenAI Chat, OpenAI Responses и Anthropic
   (`claude-sonnet-4-5`, `claude-3-7-sonnet-20250219`); Google, OpenRouter, `claude-opus-4-6` и enum на 60 и 450 значений
   остаются результатами 3.12.4 ([ADR-0027](../adr/0027-dynamic-io-shapes.md), открытый вопрос 12); перехват независимо
   не перепроверен. Как закрыть: в спайке повторить остальные пробы на 3.14.7, перехват с `MockTransport` — в тестах
   LLM-пакета для каждого провайдера из поставки.
7. **Guardrails для PII и инъекций.** Аналог `createPIIInputGuardrail` в Python-стеке не искали. Как закрыть: изучить
   capabilities Pydantic AI 2.43.0 и живые библиотеки, затем решить, берём готовое или пишем своё, с ADR.
8. **Как вложенный `ruff.toml` работает с `banned-api`.** Замена таблицы видна по запуску, но в доке не найдена.
   Как закрыть: найти семантику `extend` для таблиц в доке ruff или закрепить поведение тестом конфигурации в CI.
9. **Стиль async-тестов.** По [ADR-0025](../adr/0025-python-engine.md) §1 стоят pytest 9.1.1 и pytest-asyncio 1.4.0;
   плагин anyio приходит транзитивно, и гайд Pydantic AI пишет тесты через `pytest.mark.anyio`. Оба стиля на 3.14.7
   работают вместе. Как закрыть: при создании первого Python-пакета выбрать один стиль маркеров
   (`asyncio_mode = "auto"` или `pytest.mark.anyio`) и закрепить его конфигурацией pytest с `--strict-markers`.
10. **`use_listen_notify` на SQLite.** Дока требует `False`, в пробе параметр не задавали. Как закрыть: явно задать его в
    dev-конфиге и прогнать очереди и `recv` из вопроса 3.
11. **Поддержка `UploadedFile` по провайдерам.** Не проверялась. Как закрыть: перехват запросов для каждого провайдера из поставки.
12. **Поле `instrument` в AgentSpec.** В доке оно есть, в `pydantic_ai/agent/spec.py:33-49` версии 2.43.0 — нет. На нас не
    влияет, пока AgentSpec не используется как формат. Как закрыть: сверить с changelog Pydantic AI, если понадобится импорт AgentSpec.
13. **Лицензия BAML.** В npm указан `MIT`, в LICENSE репозитория — Apache-2.0. BAML не зависимость. Как закрыть: выяснить,
    только если BAML станет зависимостью или источником кода.
14. **hatchling в git-репозитории.** Исключение файлов по `.gitignore` не проверено, а uv_build поддерживает только чистый
    Python. Как закрыть: проба hatchling в git, если понадобится нативное расширение или другая раскладка.
15. **`project_export` с целью `agent_workflow_spec`.** Экспорт в другие фреймворки отменён (§10), но
    [14. MCP-контракт](../14-mcp-contract.md) описывает ещё и восстановление документа скилла из IR этим тулом; отменено
    ли и оно, владелец не решал. Как закрыть: решение владельца, итог — в ADR-0025 и в 14-mcp-contract при чистке.
16. **Индекс ожидающих прогонов: атрибуты workflow DBOS или своя таблица.** Атрибуты приходят одним запросом
    `list_workflows`, но фильтр по ним работает только на Postgres (JSONB `@>` с GIN, не запускался), каждое обновление
    заменяет все атрибуты целиком, а форк копирует атрибуты исходного прогона и они устаревают (§5.5). Таблица
    `human_tasks` с `timeout_job_id` pg-boss в [16. Модель данных](../16-data-model.md) §2.11 при таймауте на `recv`
    не нужна. Как закрыть: спайк на PostgreSQL 18 — фильтр `list_workflows(attributes=...)` на тысячах прогонов с замером
    против своей таблицы; выбрать и переписать 16 §2.11.
17. **Хранение непотреблённых уведомлений.** Опоздавшие и лишние сообщения остаются в таблице уведомлений с
    `consumed=0` бессрочно; API очистки или политики хранения для уведомлений не найдено и не проверялось. Как закрыть:
    найти в dbos 2.31.1 механизм хранения и очистки и проверить, трогает ли он уведомления; если нет — своя задача
    очистки уведомлений завершённых прогонов.
18. **Латентность на PostgreSQL и цена опроса.** Путь push `use_listen_notify=True` на PostgreSQL и стоимость опроса
    `list_workflows` для `GET /api/runs/events` на тысячах прогонов не замерены; на SQLite каждое открытое SSE-соединение
    опрашивает со своим интервалом (§5.5). Как закрыть: повторить замер латентности §5.5 на PostgreSQL 18 и нагрузочный
    прогон ленты прогонов.
19. **Сериализация сообщений, событий и выходов шагов.** По умолчанию `py_pickle`; писателю не на Python (например,
    `send` не из Python-процесса) нужен `serialization_type=portable_json`, это не запускалось (связано с открытым
    вопросом 7 [ADR-0025](../adr/0025-python-engine.md)). Как закрыть: `send` и `set_event` с `portable_json`, чтение в
    workflow и через `DBOSClient`, сравнение с pickle на наших значениях.
20. **`send_to_forks=True`.** Доставка одного ответа исходному прогону и всем его форкам (полезно для тестовых прогонов)
    прочитана в исходнике (`dbos/_sys_db.py` `_send_bulk_txn`), но не запускалась. Как закрыть: проба — прогон с тремя
    форками, ожидающими на одном topic, один `send` с `send_to_forks=True`, проверить, что продолжились все.
21. **Адрес исполнения → `start_step` форка и id дочернего workflow.** Форк для повторного вопроса начинается с первого
    шага узла `human` (§5.5), поэтому нужен записанный `function_id` начала каждого исполнения узла
    `{node_id, branch_key, iteration, item_index}`. Запись адреса в id дочернего workflow и топик решена позже
    ([ADR-0025](../adr/0025-python-engine.md) §9: JSON адреса по RFC 8785 только внутри адаптера DBOS). Как закрыть: спроектировать запись адреса и `function_id` в исполнителе IR и проверить fork по адресу
    внутри `map` и параллельной ветки.
22. **Одобрение тула внутри прогона: несколько вызовов и падение.** Форма с `HandleDeferredToolCalls` проверена на одном
    вызове тула; несколько параллельных одобрений (`parallel_ordered_events`) и падение процесса посреди inline-ожидания не
    проверены. Как закрыть: проба с двумя тулами `requires_approval=True` в одном ответе модели, SIGKILL во время ожидания,
    подсчёт вызовов модели и выполнений тулов после рестарта.

## Источники

Pydantic AI:
- https://pydantic.dev/docs/ai/core-concepts/agent/
- https://pydantic.dev/docs/ai/core-concepts/agent-spec/
- https://pydantic.dev/docs/ai/core-concepts/output/
- https://pydantic.dev/docs/ai/core-concepts/input/
- https://pydantic.dev/docs/ai/guides/image-generation/
- https://pydantic.dev/docs/ai/realtime/overview/
- https://pydantic.dev/docs/ai/durable-execution/overview/
- https://pydantic.dev/docs/ai/graph/beta/
- https://pydantic.dev/docs/ai/guides/testing/
- https://pydantic.dev/docs/ai/tools-toolsets/deferred-tools/
- https://pydantic.dev/docs/ai/capabilities/durable_execution/dbos/
- https://pypi.org/pypi/pydantic-ai-slim/2.43.0/json

DBOS:
- https://docs.dbos.dev/python/tutorials/workflow-management
- https://docs.dbos.dev/python/tutorials/workflow-communication
- https://docs.dbos.dev/python/tutorials/workflow-tutorial
- https://docs.dbos.dev/python/examples/agent-inbox
- https://docs.dbos.dev/python/reference/configuration
- https://github.com/dbos-inc/dbos-transact-py

Kitaru:
- https://github.com/zenml-io/kitaru
- https://github.com/zenml-io/kitaru/blob/develop/docs/book/concepts/under-the-hood.md
- https://github.com/zenml-io/kitaru/blob/develop/docs/book/concepts/replay.md
- https://github.com/zenml-io/kitaru/blob/develop/docs/book/adapters/pydantic-ai.md
- https://pypi.org/pypi/kitaru/json , https://pypi.org/pypi/kitaru-pydantic-ai/0.2.1/json
- https://pydantic.dev/docs/ai/capabilities/durable_execution/kitaru/ (описывает удалённое API v1)

httpx2 и зависимости:
- https://github.com/pydantic/httpx2
- https://github.com/pydantic/httpx2/blob/main/src/httpx2/CHANGELOG.md
- https://pypi.org/pypi/httpx2/2.13.0/json
- https://pypi.org/pypi/google-genai/2.23.0/json
- https://pypi.org/pypi/openai/3.14.1/json
- https://pypi.org/pypi/anthropic/1.6.0/json
- https://pypi.org/pypi/mistralai/json , https://pypi.org/pypi/groq/json , https://pypi.org/pypi/cohere/json ,
  https://pypi.org/pypi/xai-sdk/json , https://pypi.org/pypi/fastmcp-slim/json ,
  https://pypi.org/pypi/opentelemetry-instrumentation-httpx/json , https://pypi.org/pypi/logfire/5.1.0/json

MCP и FastAPI:
- https://py.sdk.modelcontextprotocol.io/run/asgi/
- https://py.sdk.modelcontextprotocol.io/v2/migration/#fastmcp-renamed-to-mcpserver
- https://github.com/modelcontextprotocol/python-sdk
- https://fastapi.tiangolo.com/tutorial/server-sent-events/
- https://fastapi.tiangolo.com/release-notes/
- https://pypi.org/pypi/fastapi/0.141.1/json , https://pypi.org/pypi/starlette/1.6.0/json
- https://github.com/openapi-ts/openapi-typescript/issues/2723
- https://github.com/openapi-ts/openapi-typescript/pull/2683
- https://github.com/openapi-ts/openapi-typescript/pull/2774 , https://github.com/openapi-ts/openapi-typescript/pull/2818

Python и инструменты:
- https://devguide.python.org/versions/
- https://www.python.org/api/v2/downloads/release/?is_published=true
- https://docs.astral.sh/uv/concepts/projects/workspaces/
- https://docs.astral.sh/uv/concepts/build-backend/
- https://docs.astral.sh/ruff/rules/banned-api/
- https://raw.githubusercontent.com/microsoft/pyright/main/docs/configuration.md
- https://pytest-asyncio.readthedocs.io/en/stable/reference/configuration.html
- https://anyio.readthedocs.io/en/stable/testing.html
- https://uvicorn.dev/settings/
- https://watchfiles.helpmanual.io/

BAML и Monty:
- https://github.com/BoundaryML/baml
- https://pypi.org/pypi/baml-py/0.226.2/json
- https://docs.boundaryml.com/guide/baml-advanced/dynamic-runtime-types
- https://github.com/pydantic/monty
- https://pypi.org/pypi/pydantic-monty/0.0.23/json

Внутренние:
- [DECISIONS.md](../DECISIONS.md) — разделы «Что берём у VoltAgent готовым» и «Что VoltAgent НЕ даёт» в редакции до
  перехода на Python (сравнение §10); сейчас — «Что берём готовым», «Наш слой», «Human-in-the-loop»
- [ADR-0025](../adr/0025-python-engine.md) §5 — правило `ALLOWED_CONSUMERS` (§6.4)
- [ADR-0027](../adr/0027-dynamic-io-shapes.md) — перехват на CPython 3.14.7 (§3.4)
- [research/volt-durability.md](volt-durability.md)
- [14. MCP-контракт](../14-mcp-contract.md)
