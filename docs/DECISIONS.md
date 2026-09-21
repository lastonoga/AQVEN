# Сквозные решения (зафиксированы, менять только через ADR)

Всё ниже подтверждено установленными пакетами и их исходниками, официальной документацией или запуском кода.
Непроверенное названо открытым вопросом: «ADR-NNNN ОВ n» — открытый вопрос n в указанном ADR.
Каждый документ обязан соответствовать этому файлу. Противоречие — ошибка документа, а не этого файла.

## Ось версий (пин, сентябрь 2026)

Решение — [ADR-0025](adr/0025-python-engine.md) §1–§2; он заменяет [ADR-0001](adr/0001-execution-core-on-voltagent.md),
[ADR-0002](adr/0002-ai-sdk-v6-axis.md) и [ADR-0010](adr/0010-pg-boss-scheduler.md). Строки прежней оси для TS-движка
(`@voltagent/core`, `ai`, `@ai-sdk/*`, `@openrouter/ai-sdk-provider`, drizzle, pg-boss, liquidjs, gpt-tokenizer,
`@modelcontextprotocol/sdk`, `@langfuse/*`, Hono, tsdown, Biome) сняты.

### Движок

Пины точные (`==`), один `uv.lock` на uv workspace.

| Слой | Выбор | Версия | Лицензия |
|---|---|---|---|
| Интерпретатор | CPython, `requires-python = ">=3.14,<3.15"` | 3.14 (проверено на 3.14.7) | PSF-2.0 |
| Вызов моделей | `pydantic-ai-slim`: `[mcp]` в `aqven`, `[openrouter]` в `aqven-llm` ([ADR-0030](adr/0030-local-browser-backend.md) §13) | 2.43.0 | MIT |
| Evals | `pydantic-evals` | 2.43.0 | MIT |
| Модели данных, JSON Schema | `pydantic` | 2.13.5 | MIT |
| Надёжное исполнение | `dbos`; системная БД — SQLite `<проект>/.aqven/dbos.sqlite`, прода на PostgreSQL нет (ADR-0030 §1) | 2.31.1 | MIT |
| Хранилище | SQLite: `.aqven/aqven.sqlite` проекта и `studio.sqlite` в каталоге данных пользователя (ADR-0030 §1); PostgreSQL и pgvector сняты | из сборки CPython (3.53.1 у 3.14.7 от uv) | public domain |
| SDK провайдеров | `openai` в базовой установке, клиент с `max_retries=0`; остальные — восемь необязательных extras `aqven-llm` (ADR-0030 `A4`): `anthropic` 1.6.0, `boto3` 1.43.96, `cohere` 7.1.1, `google-genai` 2.24.0, `groq` 1.7.0, `huggingface-hub` 1.18.0, `mistralai` 2.10.1, `xai-sdk` 1.19.0 | 3.14.1 | Apache-2.0 |
| Провайдеры | `provider:model` уходит в реестр Pydantic AI (каталог 28 провайдеров в `aqven_llm`); свой провайдер — `kind: openai_compatible`, `kind: code` с фабрикой `module:function` или точка входа группы `aqven.providers` (ADR-0030 `A5`) | pydantic-ai-slim 2.43.0 | MIT |
| HTTP-клиент | `httpx2`; encode `httpx` — прямой пин `aqven` только ради `pydantic_ai.mcp` (ADR-0030 §11) | 2.13.0 / 0.28.1 | BSD-3-Clause |
| Чат студии | `claude-agent-sdk` и `openai-codex` за портом `AgentBackend` ([ADR-0034](adr/0034-codex-and-project-chat-threads.md)) | 0.2.154 / 0.147.0 | MIT / Apache-2.0 |
| Ключи провайдеров | `python-dotenv`: `.env` проекта рядом с `aqven.yaml`, `load_dotenv(override=False, interpolate=False)` (ADR-0030 `A3`) | 1.2.3 | BSD-3-Clause |
| Формы и загрузки FastAPI | `python-multipart` | 0.0.32 | Apache-2.0 |
| HTTP API, OpenAPI, SSE | `fastapi` без extras | 0.141.1 | MIT |
| ASGI-сервер | `uvicorn` | 0.53.0 | BSD-3-Clause |
| MCP | `mcp`, `mcp.server.MCPServer` | 2.2.0 | MIT |
| Шаблоны промтов | `python-liquid` | 2.3.1 | MIT |
| Оптимизация промтов | `gepa` | 0.1.4 | MIT |
| Статистика гейтов | `scipy` + `statsmodels` + `numpy` | 1.18.1 / 0.15.0 / 2.5.3 | BSD / BSD-3-Clause / BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 |
| YAML | `ruamel.yaml` | 0.19.1 | MIT |
| Канонизация | `rfc8785` + `hashlib` | 0.1.4 | Apache-2.0 |
| Git | `dulwich` за `GitPort` | 1.2.15 | Apache-2.0 OR GPL-2.0-or-later, берём Apache-2.0 |
| Наблюдение за файлами | `watchfiles` | 1.2.0 | MIT |
| Транспортный ретрай | `tenacity` | 9.1.4 | Apache-2.0 |
| Цены вызовов | `genai-prices`, снимок пинится на версию каталога | 0.1.7 | MIT |
| Трассы | `opentelemetry-sdk` + `opentelemetry-exporter-otlp-proto-http`, OTLP в Langfuse ([ADR-0012](adr/0012-langfuse-as-store.md)) | 1.44.0 | Apache-2.0 |
| Токенизатор оценки | не выбран — [ADR-0029](adr/0029-trust-and-quality-python.md) ОВ 4 | — | — |
| ORM и миграции схемы `app` | не выбраны — ADR-0025 ОВ 11 | — | — |
| Workspace, сборка wheel | `uv` + `uv_build` | 0.12.15 | MIT OR Apache-2.0 |
| Линт, запреты импортов | `ruff` (TID251) | 0.16.7 | MIT |
| Типы | `pyright`, `typeCheckingMode = "strict"` | 1.1.414 | MIT |
| Тесты | `pytest` + `pytest-asyncio` | 9.1.1 / 1.4.0 | MIT / Apache-2.0 |

**CPython 3.14, а не 3.15.** Потолок `<3.15` задают `psycopg-binary` 3.3.5 без колёс cp315 (обязательная
зависимость dbos) и `requires-python` у gepa 0.1.4. Пробы Pydantic AI, цепочки гарантий, pydantic-evals, gepa,
python-liquid и ruamel.yaml шли на CPython 3.12.4; повторить их на 3.14.7 в спайке фазы 0 — ADR-0025 ОВ 20.

**Только httpx2** (решение владельца от 2026-09-16, ADR-0025 §5). Наш код импортирует только `httpx2`: ruff TID251
запрещает `httpx` и `requests` вместе с подмодулями. Транзитивные `requests` (OTLP-экспортёр, tiktoken, google-genai,
google-auth) и encode `httpx` допустимы; список потребителей держит проверка `uv.lock` в CI. Исключение ADR-0030 §11:
`pydantic_ai/mcp.py` импортирует `httpx`, не объявляя его, поэтому `aqven` пинит `httpx==0.28.1` напрямую; наш код
`httpx` не импортирует. С extras провайдеров (ADR-0030 `A4`) списки такие: `ALLOWED_CONSUMERS["httpx"]` =
`{aqven, cohere, google-genai, groq, huggingface-hub, mistralai}`, `ALLOWED_CONSUMERS["requests"]` =
`{cohere, google-auth, google-genai, opentelemetry-exporter-otlp-proto-http, tiktoken, xai-sdk}`. SDK Groq и
HuggingFace создают свои клиенты на encode `httpx`, наш `httpx2`-клиент до них не доходит; ретраев у них нет.
`fastapi[standard]`, `starlette[full]`, extras `retries` и `logfire` у pydantic-ai-slim не ставим, `pydantic_ai.retries`
запрещён: все они тянут encode `httpx`.

**Изоляция провайдеров** (ADR-0025 §6, список расширен ADR-0030 `A4`). Импорт `openai`, `anthropic`, `google.genai`,
`groq`, `mistralai`, `cohere`, `boto3`, `botocore`, `xai_sdk`, `huggingface_hub`, `pydantic_ai.providers` и
`pydantic_ai.models.*` (18 модулей провайдеров) разрешён только модулю `aqven_llm` (дистрибутив `aqven-llm`); остальной
код получает `Model` из его фабрики. Принуждение — ruff TID251; вложенная таблица `banned-api` заменяет корневую, поэтому
каждый вложенный `ruff.toml` повторяет общие запреты (`httpx`, `requests`, `yaml`, `pydantic_graph`, `pydantic_ai.retries`,
`pydantic_ai.StructuredDict`). Строковый идентификатор модели (`Agent("openai:...")`) TID251 не видит — ADR-0025 ОВ 14.

**Лицензия psycopg.** dbos 2.31.1 всегда ставит `psycopg[binary]` 3.3.5 под LGPL-3.0-only, в том числе при SQLite;
наш код его не импортирует. Юридическая оценка — ADR-0025 ОВ 10.

### Студия: `apps/studio`

Остаётся на TypeScript ([ADR-0024](adr/0024-studio-on-vite.md), ADR-0025 §2). Импортов `next`, `ai`, `@ai-sdk/*`,
`@openrouter/*` в студии нет.

| Слой | Выбор | Версия | Лицензия |
|---|---|---|---|
| Фронтенд | vite 8.3.0 SPA, react 19.3.0, @tanstack/react-router 1.170.36, use-intl 4.14.5, Tailwind v4, shadcn/ui, @assistant-ui/react 0.15.20 | | MIT |
| Канвас | @xyflow/react 12.11.6 | | MIT |
| Автораскладка графа | elkjs 0.12.0 | | **EPL-2.0 OR GPL-3.0-or-later** — не MIT, требуется решение (см. ниже) |
| Таблицы | @tanstack/react-table **9.2.4** + @tanstack/react-virtual 3.14.12 | | MIT |
| Клиент API | openapi-typescript 7.13.0 + openapi-fetch 0.17.0 по `openapi.json` от FastAPI ([ADR-0028](adr/0028-studio-api-contract.md)) | | MIT |
| Схемы UI | zod 4.6.2 — search-параметры и статические формы, не контракт API | | MIT |
| Монорепо | pnpm workspaces + turborepo 2.10.12; версия pnpm расходится: здесь была 12, в `package.json` — `pnpm@10.33.0` (ADR-0025 ОВ 17) | | MIT |
| Тесты | vitest 5.0.0, playwright 1.63 | | MIT / Apache-2.0 |
| **Рантайм Node** | **24 LTS** (не 20 и не 22: оба EOL — 24.03.2026 и 28.07.2026); нужен сборке студии и обёртке pyright | | — |
| Линт | ESLint 10 + typescript-eslint 8.70.0 | | MIT |
| TypeScript | 6.0.3 (не 7.0.2) | потолок typescript-eslint@8.70.0: peer `typescript: >=4.8.4 <6.1.0` | Apache-2.0 |

**Лицензия elkjs требует решения.** `elkjs@0.12.0` распространяется под двойной лицензией
`EPL-2.0 OR GPL-3.0-or-later` (проверено `npm view elkjs license`). Выбираем EPL-2.0: это слабый
копилефт файлового уровня, обязательства возникают при модификации самих файлов elkjs, а не при
использовании как зависимости. Что обязаны сделать до фазы 1:
1. Не форкать и не патчить elkjs; любые нужные изменения — через опции раскладки, не через правку кода.
2. Указать elkjs и текст EPL-2.0 в NOTICE репозитория (бандл экспорта отменён, см. «Отклонения от исходной спеки»).
3. Получить подтверждение юриста, если платформа будет продаваться как закрытый продукт.
Если условие 3 не проходит — альтернатива `@dagrejs/dagre` (MIT), но она не умеет вложенные
compound-графы, а на них держится раскрытие компонентов на канвасе. Решение зафиксировать ADR.

**TypeScript 6.0.3, а не 7.0.2.** В npm `latest` — 7.0.2, но `typescript-eslint@8.70.0` объявляет
peer `typescript: >=4.8.4 <6.1.0` (проверено). Пин 6.0.3 — следствие этого потолка, а не консерватизма.
TypeScript 7 (нативный порт) допускается отдельной неблокирующей джобой CI. Триггер пересмотра —
релиз typescript-eslint с поддержкой 7.x.

## Что берём готовым (не пишем сами)

Решение — [ADR-0025](adr/0025-python-engine.md) §3, гарантии вызова и качество — [ADR-0029](adr/0029-trust-and-quality-python.md).
Столбец «Проверено»: «запуск» с версией CPython, на которой шла проба, «дока» или «исходник».

| Возможность | Берём | Механизм | Проверено |
|---|---|---|---|
| Чекпоинт шага, восстановление после падения | dbos 2.31.1 | `@DBOS.workflow()`, `@DBOS.step()`, `DBOS.launch()` | запуск 3.14.7 на SQLite |
| Fork с шага, связь с исходным прогоном | dbos | `DBOS.fork_workflow(workflow_id, start_step, ...)`, `WorkflowStatus.forked_from` | запуск 3.14.7; нового входа и номера шага форка нет — ADR-0025 ОВ 8 |
| История шагов | dbos | `DBOS.list_workflow_steps(workflow_id, ...)` | запуск 3.14.7 |
| Управление прогонами | dbos | `resume_workflow`, `cancel_workflow`, `list_workflows` | дока |
| Очереди с лимитом конкурентности, расписания | dbos | `Queue`, расписания | дока; ветки `parallel`, `map`, `quorum` — только дочерние workflow, `asyncio.gather` над шагами запрещён: после восстановления подменяет выходы веток (проба 3.14.7 на SQLite, ADR-0030 §10) |
| Ожидание человека, дедлайны | dbos | `DBOS.set_event`, `DBOS.recv_async(topic, timeout_seconds)`, `send(..., idempotency_key=...)`, дедлайн — выход шага `DBOS.sleep`; `DBOSClient` вне процесса исполнителя | запуск 3.14.7 на SQLite, с SIGKILL во время ожидания |
| Поток событий прогона | dbos | `DBOS.write_stream_async`, `DBOSClient.read_stream_async(workflow_id, key, offset)`: append-only; запись из кода workflow exactly-once, из шага — at-least-once на исполнение шага (ADR-0030 §9) | запуск 3.14.7 на SQLite, с SIGKILL |
| Одобрение вызова тула | pydantic-ai-slim | `requires_approval=True`, `DeferredToolRequests`, `agent.run(..., deferred_tool_results=DeferredToolResults(...))` | запуск 3.14.7 на SQLite: ожидание между сегментными шагами узла `llm`, без `DBOSDurability`, с SIGKILL во время ожидания (ADR-0030 §9) |
| Вызов модели с типизированным выходом и повтором | pydantic-ai-slim 2.43.0 | `Agent.run(output_type=...)`, `RetryPromptPart`, `ToolOutput(M, strict=True)` | запуск 3.12.4 и 3.14.7 |
| Модель и инструкции на вызове | pydantic-ai-slim | `Agent.run(model=..., instructions=...)`; обход через динамические функции агента не нужен | исходник, дока |
| Бюджеты прогона | pydantic-ai-slim | `UsageLimits` + общий `RunUsage` | запуск 3.12.4 |
| Точка врезки гарантий, лимит конкурентности | pydantic-ai-slim | `WrapperModel` (Decorator), `ConcurrencyLimitedModel` | запуск 3.12.4 |
| Выключатель сети моделей | pydantic-ai-slim | `pydantic_ai.models.ALLOW_MODEL_REQUESTS = False`; `FunctionModel`, `TestModel` | запуск 3.12.4 |
| Спаны вызовов | pydantic-ai-slim + opentelemetry-sdk 1.44.0 | `InstrumentationSettings(version=5)` на своём `TracerProvider`, OTLP/HTTP в Langfuse | запуск 3.12.4 на локальном приёмнике, не на Langfuse |
| Цены вызовов | genai-prices 0.1.7 | стоимость в `RunUsage` по пиненному снимку | запуск 3.12.4 |
| Транспортный ретрай | tenacity 9.1.4 | внутри нашего `BackoffModel` | импорт; обёртка не запускалась — ADR-0029 ОВ 11 |
| Прогонщик экспериментов, формат датасета | pydantic-evals 2.43.0 | `Dataset`, `Case`, `Evaluator`, `evaluate` с `max_concurrency`, span-based оценка | запуск 3.12.4 |
| Тесты, бутстрап, поправки, каппа | scipy 1.18.1 + statsmodels 0.15.0 | `mcnemar`, `wilcoxon`, `bootstrap(method="BCa")`, `multipletests`, `cohens_kappa` | запуск 3.12.4, сверка с эталонами |
| Цикл оптимизации промтов | gepa 0.1.4 | выбор родителя, минибатч, приёмка, Парето-фронт; `GEPAAdapter`, `reflection_strategy` | запуск 3.12.4 на скриптовой reflection-модели |
| Статический анализ шаблонов | python-liquid 2.3.1 | `analyze()`, `global_variable_paths()`, `Environment.add_tag`, `ContentNode` | запуск 3.12.4 |
| HTTP API, OpenAPI 3.1, SSE | fastapi 0.141.1 + uvicorn 0.53.0 | маршруты, `app.openapi()`, `fastapi.sse.EventSourceResponse` | запуск 3.14.7 |
| MCP-сервер | mcp 2.2.0 | `MCPServer.streamable_http_app(streamable_http_path="/")`, `session_manager.run()` в lifespan FastAPI | запуск 3.14.7 |
| Git без бинарника git | dulwich 1.2.15 за `GitPort` | коммит объектами, CAS ссылки `refs.set_if_equals`, трейлеры, обновление индекса после коммита | запуск 3.12.4, SHA коммитов равны git CLI |
| Строгое чтение и канонический вывод YAML | ruamel.yaml 0.19.1 | предпроход по событиям и токенам, писатель с фикспойнтом | запуск 3.12.4; порядок ключей модели — 3.14.7 |
| Канонический JSON | rfc8785 0.1.4 | `rfc8785.dumps` | запуск 3.12.4, 0 расхождений с `canonicalize@5.0.0` |
| Наблюдение за файлами | watchfiles 1.2.0 | `awatch` со своим фильтром `.aqven/` | запуск 3.14.7 |

pydantic-graph не используем: сохранения состояния в builder API нет, граф уже задан IR; импорт запрещён TID251.
`DBOSAgent` в pydantic-ai-slim 2.43.0 помечен устаревшим (удаление в v3); интеграция Pydantic AI с DBOS — capability
`DBOSDurability` с `agent.run()` внутри нашего `@DBOS.workflow`. Её не используем: узел `llm` — сегментные DBOS-шаги с
`agent.run()` внутри (ADR-0030 §9); у `DBOSDurability` функции-тулы и валидаторы повторяются при восстановлении, а шаги
модели не прерываются.

Kitaru 0.26.0 (Apache-2.0) слоем надёжного исполнения не берём (решение владельца от 2026-09-16,
[ADR-0025](adr/0025-python-engine.md)). С 0.22.0 (2026-08-18) это платформа записи и реплея прогонов для evals: по её
документации production-агента она не исполняет, надёжное исполнение отдано ZenML. Нужен сервер FastAPI на PostgreSQL
(только asyncpg, SQLite нет). Чекпоинтов шага и восстановления нет: убитая сессия остаётся `in_progress`, завершённые
шаги теряются, её реплей отклоняется 409. Реплей идёт только с начала с живыми вызовами модели; fork с шага и примитива
ожидания с таймаутом и резюмом нет. kitaru-pydantic-ai 0.2.1 требует `pydantic-ai-slim<2.41`, а страница Kitaru в
документации Pydantic AI описывает удалённый API v1. Преимущество одно — готовые UI и REST API сессий evals.

## Наш слой

Решение — [ADR-0025](adr/0025-python-engine.md) §3, [ADR-0029](adr/0029-trust-and-quality-python.md) §1–§3.

| Пишем сами | Почему не готовое |
|---|---|
| Исполнитель IR: одна функция `@DBOS.workflow` обходит план скомпилированного IR (Interpreter), исполнение узла — `@DBOS.step(retries_allowed=False)`, исполнители узлов — таблица по виду (Strategy) | у DBOS нет модели графа, у pydantic-graph нет сохранения состояния; граф — IR с хешем ([ADR-0022](adr/0022-hash-as-version.md)) |
| `switch` с first-match; `quorum(k)`, `any`, `first_success` при сведении веток; лимиты циклов (`max_iter`, бюджет, стагнация, best-of); `map` с `on_item_error` | семантика языка, готового нет ни в одном варианте стека |
| Связь шага DBOS с адресом исполнения `{node_id, branch_key, iteration, item_index}` | `list_workflow_steps` отдаёт имя функции шага (`execute_node`), а не адрес |
| Ключи идемпотентности узлов с внешними эффектами | прерванный падением шаг DBOS выполняется заново целиком (проверено запуском) |
| Узел `human` поверх примитивов DBOS: индекс `suspended`, защита резюма, проверка дедлайна и payload по модели формы в API и в workflow, таблица политик таймаута (Strategy) | ожидание в `recv` DBOS показывает как `PENDING`, лишние сообщения молча буферизует, ответ, отправленный после дедлайна при лежащем исполнителе, при восстановлении принимает (раздел «Human-in-the-loop») |
| Цепочка гарантий вызова модели: `OutcomeGateModel`, `RedactingModel`, `CassetteModel`, RPM/TPM-бакет, `BackoffModel`, фабрика `aqven_llm` | дефолты Pydantic AI нарушают три исхода; SDK ретраят сами (429 → 3 HTTP-вызова); кассеты и редакции на уровне модели нет |
| Исполнитель исходов: таблица `FAILURE_BY_EXCEPTION` по `type(error).__mro__` (Chain of Responsibility) | маршруты `truncated`, `refusal`, `BudgetExceeded`, `ProviderFailure` — политика узла |
| Компилятор, IR-мутатор, модели описания, канонический писатель YAML, конвертеры `apiVersion` | формат и правила наши |
| Индекс определений (`idx`) и запись файлов с CAS | [ADR-0017](adr/0017-files-as-source-of-truth.md) |
| Динамическая форма: `FieldSpec`, проверка `limits`, шаг `narrow` | `StructuredDict` не валидирует, BAML `@@dynamic` живёт в своём DSL ([ADR-0027](adr/0027-dynamic-io-shapes.md)) |
| Каталог операций `Operation` и адаптеры REST/MCP | [ADR-0028](adr/0028-studio-api-contract.md) |
| Гейт выпуска поверх pydantic-evals, scipy и statsmodels; Krippendorff alpha и ICC | статистики и спаривания в pydantic-evals нет; единственный пакет alpha с порядковой дистанцией — GPL |
| Адаптер GEPA над шаблоном: `TemplateUnitsAdapter`, `AdmissibleReflection`, `PromptOptimizerPort` | GEPA не знает структуры Liquid-шаблона и правил R-T |

**Цепочка гарантий вызова** ([ADR-0029](adr/0029-trust-and-quality-python.md) §1), снаружи внутрь: `OutcomeGateModel` →
`RedactingModel` → `CassetteModel` → лимитер (`ConcurrencyLimitedModel` или RPM/TPM-бакет) → `BackoffModel` → модель
провайдера (SDK с `max_retries=0` и `httpx2.AsyncClient`). Самый внешний спан — capability `Instrumentation`. Звенья —
`WrapperModel` (Decorator), собирает их только фабрика `aqven_llm` (Builder); порядок проверяется тестом, новое звено —
только правкой ADR-0029. Цепочка идёт внутри сегментного шага узла `llm`, каждое звено вызывает модель через
`request_stream` (ADR-0030 §8–§9).

## Структурированный вывод — опровержения спеки

Решения — [ADR-0004](adr/0004-schema-profiles.md), [ADR-0005](adr/0005-three-call-outcomes.md),
[ADR-0006](adr/0006-dynamic-allowed-sets.md) в редакции [ADR-0029](adr/0029-trust-and-quality-python.md) §6–§7,
strict — [ADR-0027](adr/0027-dynamic-io-shapes.md) «Strict включается явно».

1. **Одной strict-схемы на всех провайдеров не существует.** Требования OpenAI и Anthropic взаимно
   противоречивы. Профиль схемы — свойство пары (IR-схема × провайдер): `json_schema_transformer` в `ModelProfile`,
   ставит фабрика из записи каталога; профили `openai-strict`, `anthropic-strict`, `permissive`.
2. **Strict-трансформеры Pydantic AI переносят ограничения в `description`, и наборы у провайдеров разные.**
   OpenAI (`profiles/openai.py` `_STRICT_INCOMPATIBLE_KEYS`) уносит `minLength`, `maxLength` и прочие несовместимые ключи,
   оставляя `minimum`, `maximum`, `minItems`, `maxItems`; Anthropic (`transform_schema` из anthropic 1.6.0) уносит и
   `maxItems`, `minimum`, `maximum`, `pattern`. Поэтому выход модели **всегда** валидируется Pydantic-моделью на приёме,
   golden-снимки wire-схем снимаются перехватом через `httpx2.MockTransport`. Нейтральная схема — `model_json_schema()`
   сгенерированной модели; слой пост-обработки после Zod удалён.
3. **При `strict=None` флаг strict — функция содержимого схемы.** Он равен `is_strict_compatible` трансформера профиля
   (`models/__init__.py` `_customize_tool_def`, `_customize_output_object`). Профили OpenAI отправляют `strict: true`
   только без strict-несовместимых ключей, иначе strict опускается (в пробе схема с `maxLength` ушла в Chat без `strict`,
   в Responses — со `strict: false`); у Anthropic и Bedrock `is_strict_compatible = strict is True`, поэтому `None`
   означает «не strict»; у Google флага `strict` нет, tool output уходит с `functionCallingConfig.mode: "ANY"` (что
   гарантируют `ANY` и `VALIDATED` — ADR-0027 ОВ 3). Решение: strict задаётся явно на каждом профиле модели —
   `mode: "strict"` компилируется в `ToolOutput(M, strict=True)` или `NativeOutput(M, strict=True)`, объекты со
   `strict=None` фабрика не создаёт. `claude-3-7-sonnet-20250219` теряет strict молча, поэтому компилятор сверяет модель
   с профилем, а трасса пишет фактический `strict` из тела запроса.
4. **Исходов вызова три, а не два: `ok` / `refusal` / `truncated`; обрезанный ответ не чиним.** jsonrepair в TS молча
   фальсифицировал обрезанные ответы; дефолты Pydantic AI нарушают три исхода иначе (обрезанный tool call повторяется
   с тем же `max_tokens`, полный JSON с `finish_reason=length` принимается как ok, отказ Anthropic с текстом
   повторяется). Исход определяет `OutcomeGateModel` по `finish_reason` и `provider_details` до разбора и до цикла
   `output`-ретраев; ремонт моделью (`RetryPromptPart`, лимит `retries["output"]`) применим только к `ok`. JSON локально
   не чиним: финальный разбор — `allow_partial="off"`. Исход не пишется в кассету отдельным полем, гейт выводит его из
   записанного ответа на каждом реплее.
5. **Потолок динамического allowed-set — около 416 значений UUID, а не 1000.** Лимиты OpenAI действуют
   одновременно (число значений и суммарная длина строк). Пороги: ≤50 — enum в схеме; выше — индексный
   выбор из пронумерованного списка. Клиент Pydantic AI размер набора не ограничивает (450 UUID доходят до провайдера),
   поэтому лимиты проверяет наш код до вызова. Вхождение и подстановка реального ID — `output_validator` + `ModelRetry`.
6. Стиль схем IR по умолчанию: все поля required, опциональность через `null`,
   `additionalProperties: false`, без рекурсии. Порядок полей сохраняется как в IR, не сортируется. В Pydantic — поля без
   default, `T | None`, `extra="forbid"`.
7. Pydantic — на каждой границе: файлы описания, вход и выход узлов и воркфлоу, тела HTTP и аргументы MCP
   ([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §7). `pydantic_ai.StructuredDict` запрещён TID251: ответ не
   валидирует. zod остаётся только схемами UI в `apps/studio`.

## Отклонения от исходной спеки

Решение владельца от 2026-09-16, записано в [ADR-0025](adr/0025-python-engine.md) §7; формат и сборка модуля —
[ADR-0026](adr/0026-yaml-spec-and-code-refs.md), вызов по HTTP и MCP — [ADR-0028](adr/0028-studio-api-contract.md).
Спека неизменна, расхождения с ней фиксируются здесь.

| Требование спеки | Решение | Чем заменено |
|---|---|---|
| §0 «Бэкенд на VoltAgent (§20)», R23 «Бэкенд на VoltAgent: не писать рантайм с нуля», §20 целиком со спайком §20.6 | **отклонено** | Python-движок ([ADR-0025](adr/0025-python-engine.md)). «Не писать рантайм с нуля» держится: надёжное исполнение — DBOS, вызовы моделей — Pydantic AI, наш — слой семантики и гарантий; бинарные проверки спайка — ADR-0025 «Проверка» |
| R21 в части экспорта (воссоздание 1:1 в любом фреймворке, готовый экспорт в VoltAgent), §0 «Экспорт для воссоздания 1:1», §15.1 (бандл, конформанс против воссозданной реализации, цели) | **отменено** | вызов воркфлоу по HTTP и MCP (`aqven serve`) и импорт модуля-wheel в Python-проект |
| §17 «Экспорт в цели» (codegen в VoltAgent, скилл воссоздания, частичные цели), §17 фаза 1 «Экспорт: бандл … импорт с гарантией round-trip» | **отменено** | — |
| §13 группа тулов «Экспорт» | **отменено**: `project_import`, `project_conformance`, `project_verify_migration`, `project_export` в бандл и целевые рантаймы | нужен ли `project_export` в `agent_workflow_spec` — вопрос владельцу, ADR-0025 ОВ 19 |
| §14 экран 14 «Экспорт» | **отменён** | — |
| §18 kill-критерии 14 «Воссоздание 1:1» и 15 «Экспорт в VoltAgent» | **отменены** | судьба kill-критерия 13 «Round-trip» без бандла — ADR-0025 ОВ 15 |
| R21 «конструктор production-воркфлоу без lock-in» | **остаётся** | IR — единственный машинный артефакт, модуль — обычный wheel, вызов по HTTP и MCP |
| Канонизация и хеш содержимого | **остаются** | раздел «Экспорт: остались канонизация и хеш» |

## Промты

Движок шаблонов — [ADR-0029](adr/0029-trust-and-quality-python.md) §8 (заменяет [ADR-0013](adr/0013-liquidjs-template-engine.md)),
уровни промта — [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §4, оптимизация — ADR-0029 §11.

- **Промт никогда не строка в YAML.** Ключ `prompt` узла: `./<node_id>.prompt.md`, общий `<key>` из `prompts/`
  (пин в `aqven.lock.yaml`) или `pkg.mod:function`. Уровень определяется содержимым (Strategy): 1 — `.prompt.md` без
  переменных, входы с описаниями, выходы и блок формата вывода дописывает адаптер
  ([ADR-0020](adr/0020-llm-function-and-adapters.md)); 2 — Liquid-шаблон, `{{ output_format }}` ровно один раз (R-T6);
  3 — функция проекта: компилятор видит только типы `in`/`out`, GEPA её не оптимизирует, студия ставит метку «промт
  собран кодом». Медиазначение в текст не рендерится ни на одном уровне, в шаблоне оно доступно только в условии.
- Движок — **python-liquid 2.3.1**: R-T1/R-T2 — `analyze()` и `global_variable_paths()` без рендера. Свой парсер не
  пишем; наш код — Visitor и таблица правил по типу узла (`ContentNode`, `OutputNode`, `IfNode`, `CaseNode`,
  `ForNode`, `MessageNode`). Инстанс — `StrictUndefined`, `strict_filters=True`.
- `{% switch %}` из спеки не нужен: в Liquid это встроенный `{% case %}/{% when %}`; `{% else %}` в `case` запрещён R-T4.
- Роли сообщений — свой блочный тег `{% message system|user|assistant %}` через `Environment.add_tag`, только верхний
  уровень. Отображение ролей в сообщения Pydantic AI не проверено — ADR-0029 ОВ 18.
- Белые списки: теги — удалением из `env.tags` (разбор падает); фильтры — статически по `analyze().filters`, потому что
  удаление из `env.filters` разбор не роняет. `ifchanged`, `doc`, `break`, `continue` запрещены до отдельного решения.
- Точка кэширования — поддерево тега `message` без динамических тегов.
- **Промт коммитится явно.** Черновик живёт в `.aqven/drafts/<путь>.draft` с `base_file_hash`,
  он в `.gitignore`, вне дерева определений и мимо компилятора.
- **Значения рендерятся читаемо** (ADR-0030 `A11`): запись — строки `ключ: значение` в порядке объявления, список —
  строки `- элемент`, `DynamicValue` — `- имя (описание): значение`, медиа — метка `[image/jpeg lamp.jpg, 2048 bytes]`,
  даты — ISO 8601. Один рендер на движок и предпросмотр. Статические стражи: `W_PROMPT_VALUE_UNREADABLE` (печатается
  значение без текстовой формы) и `W_TOOL_ARG_UNREACHABLE` (обязательный аргумент тула типа id, record или union не
  доходит до модели); `E_PROMPT_INPUT_UNUSED` больше не срабатывает на медиавход и на вход, использованный в
  `allowed_sets`, `schema_from` или параметрах проверки.
- **`aqven prompt preview <flow>.<node>`** печатает точный запрос узла (инструкции, сообщения, вложения, варианты,
  тулы, контракт выхода) тем же кодом, что и прогон; те же данные — `POST /api/flows/{flow_id}/nodes/{node_id}/prompt/preview`
  и MCP-тул `prompt_preview` (ADR-0030 `A12`).
- Токенизатор оценки размера не выбран — ADR-0029 ОВ 4 (tiktoken 0.14.0 приходит с extra `openai`, но BPE-файл
  скачивается из сети).
- **Оптимизация — gepa 0.1.4 библиотекой в процессе** за `PromptOptimizerPort` (Port/Adapter). Единица мутации —
  литеральный `ContentNode`; недопустимый мутант (синтаксис, R-T1..R-T13, структура тегов и слотов) отбраковывает
  `AdmissibleReflection` без вызова модели задачи; reflection-модель — только агент из фабрики `aqven_llm`, строковый
  `reflection_lm` (litellm) запрещён; test-сплит в GEPA не передаётся; победитель входит черновиком промта.

## Локальный режим

Решение владельца от 2026-09-17, записано в [ADR-0030](adr/0030-local-browser-backend.md). Настольного приложения пока нет.

- **Только локально, только SQLite.** Прода, PostgreSQL и многопользовательской авторизации нет. Проект: `.aqven/dbos.sqlite`
  (DBOS), `.aqven/aqven.sqlite` (настройки проекта, журнал чата, индекс ожиданий), `.aqven/server.json`, `server.lock`,
  `server.log`; пользователь: `studio.sqlite` в `~/Library/Application Support/AQVEN`, `%APPDATA%/AQVEN` или
  `$XDG_DATA_HOME/aqven` (`--data-dir`). Файлы 0600, каталоги 0700.
- **Браузер, как Jupyter и marimo.** `uv add aqven` или `pip install aqven` в окружение проекта, `aqven studio` (`aqven dev`)
  в папке проекта: `127.0.0.1`, статика Studio из `aqven/server/static` (`--studio-dist`, `--dev-origin` при разработке),
  браузер открывается по локальному URL. Один сервер на проект.
- **Защита.** `Host` ∈ {`127.0.0.1`, `localhost`, `::1`} → `Origin` → токен на запуск (`secrets.token_urlsafe(32)`):
  браузер обменивает `?access_token=` на cookie `aqven_access_<port>` (`HttpOnly; SameSite=Strict`), API, CLI и `/mcp/` —
  `Authorization: Bearer`. `.aqven/server.json` = `{host, port, token, pid, url, mcp_url, project_root}`, 0600.
- **Временное исключение от 2026-09-18** ([ADR-0030](adr/0030-local-browser-backend.md) §3): локальные `studio`, `dev`,
  `serve` по умолчанию не требуют токен для API и MCP; `--require-auth` возвращает прежний режим. Loopback, `Host` и
  `Origin` обязательны всегда. Встраиваемый `create_local_app` и прямой `create_app` не меняют значения по умолчанию.
- **Studio необязательна.** Правки в IDE подхватывают watcher и spec-канал; Claude Code — HTTP `/mcp/` с токеном из
  `server.json` или stdio `aqven mcp`, который при необходимости поднимает headless-сервер и проксирует тулы;
  `aqven run`, `aqven check`, `aqven generate`, pytest работают без Studio.
- **Позже — оболочка** над тем же сервером с окружением проекта на uv. PyInstaller отвергнут: замороженный бинарник не
  импортирует зависимости кода проекта. Monty и Pyodide для кода проекта не используются.
- **Чат студии — Claude или Codex** ([ADR-0034](adr/0034-codex-and-project-chat-threads.md)): `claude-agent-sdk`
  0.2.154 и `openai-codex` 0.147.0 за портом `AgentBackend`. Настройка `chat.backend` принадлежит проекту и влияет
  только на новые треды. Все треды проекта видны вместе, а существующий тред продолжает работать со своим агентом.
  Вход — собственный вход пользователя в выбранный CLI; токены входа не читаем и не храним.
- **Ключи провайдеров — `.env` проекта** рядом с `aqven.yaml`, файл в `.gitignore` (ADR-0030 `A3`, заменяет настройки
  SQLite): порядок разрешения «переменная процесса → запись `.env`», источник в API — `environment` или `dotenv`;
  имя переменной задаёт `api_key: "ref:env/NAME"`, иначе имя по умолчанию у провайдера. Запись из Studio правит `.env`
  (0600) и дописывает `.env` в `.gitignore`; прежние секреты из SQLite удаляются при первом открытии. API отдаёт
  только маску; ключ не попадает во вход и выход DBOS-шагов, события, логи и кассеты. Чат-агент к `.env` не допущен:
  правила `disallowed_tools`, хук `PreToolUse` и `can_use_tool`, а в его окружении эти переменные пустые.
- **`aqven new` и `aqven dev`** (ADR-0030 `A8`): `new` пишет проект из шаблона (`minimal`, `showcase`) с `.gitignore`,
  `.mcp.json`, `AGENTS.md`, `CLAUDE.md`, хуками `.claude`, тестами и `.env.example`, затем `uv sync` и
  `aqven generate`; `dev` (синоним `studio`) поднимает сервер, следит за файлами и открывает браузер, `serve` — без
  браузера. Настройки рантайма: явный аргумент → `AQVEN_STUDIO`, `AQVEN_HOST`, `AQVEN_PORT`, `AQVEN_OPEN_BROWSER`
  (из окружения или `.env`) → значение по умолчанию.
- **Каждый вызов модели — поток** (`request` дочитывает `request_stream`): `node_output_delta` (`text`, `reasoning`,
  `tool_call_args`, `output_json`) пачками по 80 мс и `node_attempt_discarded`; кассеты пишут и воспроизводят поток.
- **Узел `llm` — сегментные DBOS-шаги**, одобрение и тулы с побочным эффектом — между сегментами; **ветки** `parallel`,
  `map`, `quorum` — дочерние workflow `run_id::address_key`.
- **Провайдер модели — любой** (ADR-0030 `A4`, `A5`): `provider:model` уходит в реестр Pydantic AI, провайдер ставится
  как extra (`uv add "aqven[groq]"`), недостающий extra — `E_PROVIDER_EXTRA_MISSING`, отсутствие потока —
  `E_PROVIDER_NO_STREAMING` (у Cohere в pydantic-ai-slim 2.43.0 нет `request_stream`). Свой провайдер объявляется в
  `aqven.yaml` как `kind: openai_compatible` (только `base_url`), `kind: code` (фабрика `module:function`) или ставится
  пакетом с точкой входа группы `aqven.providers`; порядок — проект → пакет → встроенный каталог. Фабрика возвращает
  обычную `pydantic_ai.models.Model`, поэтому свой провайдер проходит ту же цепочку гарантий.
- **Режим структурированного вывода** — `output.mode: auto | tool | native | prompted` в YAML агента (ADR-0030 `A6`);
  `auto` разрешается при компиляции таблицей известных моделей и профилем Pydantic AI, флага окружения и переключения
  в рантайме нет. Разрешённый режим виден в `aqven tree`, IR и API; ошибки вывода несут коды
  `MODEL_NO_STRUCTURED_OUTPUT`, `MODEL_INVALID_JSON`, `MODEL_SCHEMA_MISMATCH`, `MODEL_FEATURE_UNSUPPORTED`,
  `MODEL_RETRIES_EXHAUSTED` и точную подсказку.
- **Ретрай провайдера** идёт до выдачи первого события потока, а не только до входа в поток: 429 или 502 первым чанком
  SSE повторяется, 4 попытки, 0,5 с → 8 с, всего 20 с (ADR-0030 `A13`). Цена узла — `provider_details["cost"]`, затем
  genai-prices, при воспроизведении кассеты 0.

## Библиотека и проект

Решение — [ADR-0030](adr/0030-local-browser-backend.md) `A2`, `A9`; раскладка —
[aqven-py/docs/project-structure.md](../aqven-py/docs/project-structure.md), как строить flow —
[aqven-py/docs/building-flows.md](../aqven-py/docs/building-flows.md).

- **AQVEN — библиотека, Studio — один её клиент.** Пять входов и один композиционный корень: прогон в процессе
  (`Project.load`, `flow_typed`, `flow.run`), монтируемое ASGI-приложение (`create_local_app` + `host.mount("/aqven")`)
  с подключаемой авторизацией (любой `AppAccess`, встроенный — `LocalTokenAccess` на Bearer-токене), отдельный
  MCP-сервер (`create_mcp_server`, `aqven mcp` по stdio, `/mcp/`), любой HTTP-клиент (OpenAPI `/api/openapi.json`,
  события прогона SSE) и любой MCP-клиент. Публичное API импортируется из корня пакета `aqven`.
- **Проект — один Python-проект**: один `pyproject.toml`, модуль в `src/<package>`, `tests/`, `samples/` при
  необходимости, не больше одного `main.py`. Папки `app/` нет. `.env` и `.aqven/` лежат рядом с `aqven.yaml`, то есть
  внутри модуля; сборка колеса исключает `.aqven`, `.env` и `.env.example`.
- **Сгенерированные модели — `<module>/types.py`** рядом с папкой `types/` (ADR-0030 `A2`), импорт из
  `<package>.types`. Первая строка — заголовок `# Generated by aqven generate. DO NOT EDIT: ...`, единственное
  исключение из запрета комментариев. Файл в `.gitignore`, в колесо попадает, поэтому `aqven generate` идёт до
  `uv build`. `types/__init__.py` затенил бы файл — `E_TYPES_PACKAGE`; папка модуля на `sys.path` затеняет стандартный
  `types` — `W_TYPES_SHADOWS_STDLIB`.
- **Все сообщения пакета — на английском** (решение владельца от 2026-09-17): диагностики, тексты исключений, ошибки
  API, ошибки и подсказки прогона, вывод CLI, записи лога; кириллицы в `packages/*/src` нет. Документация остаётся на
  русском, пользовательский контент примеров — тоже.

## Данные

Решение — [ADR-0011](adr/0011-two-schemas-and-tenancy.md) в редакции [ADR-0025](adr/0025-python-engine.md) §8,
долговечность — ADR-0025 §4.

> Статус 2026-09-17: [ADR-0030](adr/0030-local-browser-backend.md) §1 снимает PostgreSQL, схемы `app`/`idx`/`dbos`, RLS, партиции и pgvector: только
> локальное приложение на SQLite. Действуют пункты про `use_listen_notify = False`, JSON-совместимые значения на границе
> шага и вход DBOS-workflow; остальные пункты раздела ждут переписывания вместе с [16](16-data-model.md).

- PostgreSQL 18, `uuidv7()` встроен — используем как PK по умолчанию.
- Три схемы в одной БД: `app` (наши таблицы; ORM и миграции не выбраны, drizzle-kit снят — ADR-0025 ОВ 11), `idx`
  (индекс определений, пишет только роль `wf_indexer`) и `dbos` — системные таблицы DBOS: имя из ключа
  `dbos_system_schema`, DDL делает `dbos migrate` отдельным шагом деплоя, рантайм работает с `run_migrations = False`;
  таблицы не трогаем. На PostgreSQL 18 не запускалось — ADR-0025 ОВ 9.
- Локально (`aqven dev`, тесты) системная БД DBOS — SQLite; `use_listen_notify = False` задаётся до первого создания БД.
- Значения на границе DBOS-шага JSON-совместимы (`model_dump(mode="json")`); DBOS по умолчанию пишет вход и выход шага
  pickle, выбор сериализатора — ADR-0025 ОВ 7. Вход DBOS-workflow — хеш IR и вход воркфлоу.
- `run_nodes` партиционируется помесячно `PARTITION BY RANGE (started_at)`, BRIN по времени.
- Блобы по правилу трёх зон: <8 КБ — inline jsonb; 8 КБ–1 МБ — отдельная таблица; >1 МБ — объектное
  хранилище по sha256.
- Мультитенантность с первого дня: `tenant_id` во всех таблицах + RLS.
- Векторный поиск — pgvector 0.8.6 HNSW в нашей схеме.
- Миграции forward-only, expand/contract, без down.

## Хранение определений: файлы — истина, база — индекс

Решение — [ADR-0017](adr/0017-files-as-source-of-truth.md) в редакции [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §2
(корень, раскладка, промт) и [ADR-0025](adr/0025-python-engine.md) §8 (git-библиотека), проектирование — [files-first/](files-first/).
[ADR-0016](adr/0016-git-as-release-boundary.md) заменён частично: строка про раскладку канваса в силе.

| Слой | Где живёт |
|---|---|
| Определения: воркфлоу, узлы, промты, типы, датасеты, код шагов, компоненты, профили моделей, агенты, тулы | Файлы в репозитории проекта |
| История правок | Git через dulwich 1.2.15 за `GitPort` (без бинарника git): коммит на эпизод правки, откат только движением вперёд |
| IR и `spec_hash` | Производные: `.aqven/cache/` и wheel, в git не коммитятся ([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §9) |
| Индекс определений (`type_usages`, `type_impact`, поиск по проекту) | Postgres, схема `idx`, пишет только индексатор |
| Прогоны, трассы, кассеты, зеркало датасетов | Postgres; хранилище трасс, датасетов и оценок — Langfuse ([ADR-0012](adr/0012-langfuse-as-store.md)) |
| Чекпоинты шагов прогона | Системные таблицы DBOS в `<проект>/.aqven/dbos.sqlite` (ADR-0030 §1) |
| Раскладка канваса (позиции, зум, свёрнутость) | Отдельный ui-канал, LWW по полю, вне спеки и вне `spec_hash` |
| Секреты | В файле описания только `ref:`; ключи провайдеров — `.env` проекта рядом с `aqven.yaml`, переменная процесса важнее записи `.env` (ADR-0030 `A3`) |

> Статус 2026-09-17: PostgreSQL снят ADR-0030 §1; строки «Индекс определений» и «Прогоны, трассы, кассеты» ждут
> переписывания на SQLite вместе с [16](16-data-model.md).

Раскладка на диске — каталог на воркфлоу, файл на узел: `flows/<flow_id>/flow.yaml` (или билдер `flow.py`) +
`nodes/<node_id>.yaml`, промт отдельным файлом (`<node_id>.prompt.md` или `prompts/<key>.md`) либо функцией
`pkg.mod:function`, код шагов — `code/*.py`, типы — `types/<name>.yaml`, датасеты — `datasets/<name>.yaml`.
Корень проекта — `aqven.yaml` (маркер корня, ищется вверх по дереву), пины — `aqven.lock.yaml`, служебный каталог —
`.aqven/` (`lock`, `txn/`, `drafts/`, `cache/`, `schema/`). Идентичность — путь в ФС, поля `id` внутри файлов нет;
переименования — в append-only журнал `renames` в `aqven.yaml`, его читают все резолверы lineage.
Имена `^[a-z][a-z0-9_]{0,62}$`, версий в именах нет.

`base_rev` заменён на CAS по sha256 **байтов файла**: `expects[{path, file_hash}]` + `client_op_id`, коды отказа
`STALE_FILE`, `FILE_VANISHED`, `FILE_EXISTS`, `LOCK_BUSY`, `TREE_DIRTY`. Правка нескольких файлов —
транзакция `.aqven/lock` → staging `.aqven/txn/<ulid>` → `intent.json` → атомарные `rename(2)`. Валидатор стоит
**до** сериализации и работает на всём дереве в памяти (`blocking` не пишется, `advisory` пишется
с пометкой): у git нет точки, где слияние можно отклонить, инварианты держит валидатор, а не merge.
Прогон материализует план в снимок в базе и файлы больше не читает; авторитетен хеш содержимого,
а не commit sha. Индекс перестраиваем: `DROP SCHEMA idx CASCADE` с переиндексацией не теряет ничего.
Цена, названная честно: инвариант «невалидное не попадает в историю» перестаёт быть свойством системы
и держится хуком `flow_check` на `PostToolUse` и `aqven check` в CI; закоммитить невалидное дерево можно,
**релизнуть нельзя**. Прежние обязательства в силе: секреты и значения в git не попадают, канонизация —
при записи, а не при чтении, политика расхождения множеств по умолчанию `FAIL`.

## Описание воркфлоу: YAML на Pydantic-моделях, код по ссылке

Решение — [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) (решение владельца от 2026-09-16; заменяет
[ADR-0018](adr/0018-typescript-authoring.md) и [ADR-0023](adr/0023-lexical-references.md)), правила дыр —
[ADR-0019](adr/0019-escape-hatch-rules.md).

- **Файл — экземпляр модели описания.** Каждый YAML-файл валидируется Pydantic-моделью своего вида с
  `extra="forbid"`: неизвестный ключ — `E_UNKNOWN_KEY`, все ошибки файла за раз. Модели — единственный источник
  формата: из них JSON Schema редактора и вход компилятора. Виды — дискриминированный union по `kind`, узлы — по
  `node` (Registry); новый вид — ещё одна модель без `if/else` в загрузчике.
- **Шапка `apiVersion: aqven/v1` + `kind` — версия формата файла, а не содержимого.** В IR не входит, конвертация
  формата `spec_hash` не меняет. `aqven fmt` переписывает файл в версию хранения цепочкой конвертеров v1 → v2
  (Chain of Responsibility); неизвестная версия — `E_API_VERSION`; движок читает все `apiVersion` из истории релизов.

| `kind` | Путь | Подвид |
|---|---|---|
| `Project` | `aqven.yaml` | — |
| `Type` | `types/<name>.yaml` | `type: record \| enum \| union \| id \| value` |
| `Flow` | `flows/<flow_id>/flow.yaml` | — |
| `Node` | `flows/<flow_id>/nodes/<node_id>.yaml` | `node: llm \| code \| tool \| human \| const \| seq \| parallel \| map \| switch \| loop \| race \| gate \| try \| call \| narrow` (`narrow` — [ADR-0027](adr/0027-dynamic-io-shapes.md)) |
| `Dataset` | `datasets/<name>.yaml` | структура `Dataset` pydantic-evals ([ADR-0029](adr/0029-trust-and-quality-python.md) §9) |

Виды вне таблицы (компоненты, `models/`, `tools/`, `agents/`) — ADR-0026 ОВ 9. Несовпадение `kind` и пути —
`E_KIND_PATH_MISMATCH`.

- **Типы.** TypeId — PascalCase из имени файла (`types/order.yaml` → `Order`). Встроенные: `Text`, `Int`, `Float`,
  `Bool`, `Date`, `DateTime`; контекст прогона `TimeZone`, `Locale`, `TenantId`; медиа `Image`, `Audio`, `Video`,
  `Document`; динамическая форма `Dynamic`, `FieldSpec`. `Number` заменён на `Int` или `Float`. Ссылка на тип — `type_ref`
  из [04](04-ir-schema.md) §2.1 с одним изменением грамматики, внесённым ADR-0026: суффикс `?` (`T`, `T[]`, `T?`, `T[]?`;
  `T?[]` и `T[][]` запрещены). Ограничения — ключевые слова JSON Schema в camelCase: `maxItems`, `maxLength`, `minimum`,
  `maximum`, `pattern`, `enum`. Имена, которые даёт пользователь, — `^[a-z][a-z0-9_]{0,62}$`.
- **Порядок значим — значит список.** `in`, `out`, `fields` — списки полей `{name, type, description, <ограничения>, from}`;
  короткой формы-отображения `name: Type` нет. `description` обязателен у каждого поля, у `Type` и `Flow`.
- **Канонический YAML.** Блочный стиль, строки в двойных кавычках, числа без кавычек, поля со значением по умолчанию
  не пишутся. Ключи, известные модели, — в порядке полей Pydantic-модели, `apiVersion` и `kind` первыми; отображения с
  ключами пользователя (`branches`, `cases`, `uses`) и списки — в порядке автора, потому что порядок полей — семантика
  ([03](03-core-language.md) §5). Алфавитной сортировки нет: это заменяет `sortMapEntries: true` из 04 §6.2.
  Комментарии, якоря, теги, директивы и блочные скаляры запрещены, их ловит строгий предпроход ruamel.yaml до загрузки;
  фикспойнт `aqven fmt` — в CI.
- **Узел `llm` — сигнатура:** вход, выход и промт одной структурой (форма сигнатуры DSPy, фреймворк DSPy не берём);
  элемент `in` несёт и контракт, и привязку `from`. Ключа `instructions:` нет, промт — ключ `prompt` (раздел «Промты»).
- **Шаг `code` — функция по ссылке** `run: "pkg.module:function"`, исполняется в процессе модуля; эффекты (сеть, база) —
  узел `tool`. `aqven check` резолвит ссылку (`pkgutil.resolve_name`, `E_CODE_REF_UNRESOLVED`), сверяет имена и схемы
  параметров и возврата с `in`/`out` (`inspect`, `TypeAdapter`, `E_CODE_SIGNATURE_MISMATCH`), требует класс
  детерминированности и гоняет pyright strict по `code/`. Выход `code` и `tool` проверяется моделью с
  `revalidate_instances="always"`: без неё экземпляр из `model_construct` проходит мимо ограничений.
- **Docstring запрещён** (`E_DOCSTRING`) у функций шагов и у `Signature` билдера: это комментарий, который выглядит как
  инструкция и молча игнорируется.
- **Выражения** — только закрытая грамматика проекций 04 §3.2 и предикаты `switch`; остальное — шаг `code`. Monty
  (pydantic-monty 0.0.23) не берём.
- **Медиатипы** сверяются с профилем модели роли: неподдерживаемый вход — `E_MODALITY_UNSUPPORTED`; `Audio` и `Video`
  на выходе `llm` не компилируются никогда.
- **Python-билдер опционален:** `flows/<id>/flow.py` вместо `flow.yaml`, `build() -> Flow` вызывается один раз при
  `aqven check` и `aqven build` в изолированном чистом шаге и даёт те же модели и тот же IR. Идентификатор узла — явная
  строка, ссылки — строки 04 §3.1; сеть, время, случайность и данные пользователя запрещены; две сборки с разным
  `PYTHONHASHSEED` дают один IR. Канвас такой воркфлоу только читает. Принуждение чистоты без изолята — ADR-0026 ОВ 5.
- **IR — производный артефакт, не коммитится.** `aqven check` и `aqven build` строят IR (нормальная форма 04 §1.3) и
  `spec_hash`, кешируют их в `.aqven/cache/` и кладут IR в wheel. YAML читается без исполнения кода, а закоммиченная копия
  удваивает дифф каждой структурной правки и конфликты слияния; это отменяет положение ADR-0018 «синтезированный IR
  коммитится», принятое, когда TS-исходник без исполнения не читался. Индексатор, студия и дифф по истории строят IR из
  файлов ревизии. Что коммитится для воркфлоу на билдере — ADR-0026 ОВ 18; IR в wheel без служебных файлов — ОВ 19.
- **Схемы редактора** генерируются из моделей описания в `.aqven/schema/<kind>.schema.json`, для датасета — из
  `Dataset.model_json_schema_with_evaluators()` pydantic-evals с заголовком `apiVersion`/`kind`. С файлами их связывает
  `yaml.schemas` по глобам путей в `.vscode/settings.json`, который пишет инструментарий aqven. Modeline
  `# yaml-language-server` не используем (комментарии запрещены), ключ `$schema` — тоже (расширил бы закрытый набор
  ключей). Механизм `yaml.schemas` запуском не проверен — ADR-0026 ОВ 20.
- **Модуль.** Каталог проекта — Python-пакет; `aqven build` собирает wheel (uv_build 0.12.15) с YAML, промтами,
  `code/` и IR. Команды: `aqven fmt`, `aqven check`, `aqven plan` (семантический дифф IR и статус гейтов),
  `aqven build`, `aqven serve` (HTTP и MCP), `aqven dev` (студия, API, пересборка на сохранение через watchfiles).
  Модуль импортируется в Python-проект или вызывается по HTTP и MCP.

## Версии: хеш вместо номера

Решение — [ADR-0022](adr/0022-hash-as-version.md), момент вычисления — [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §9.
Поля `version` в исходнике нет.

- **Идентичность** — `spec_hash` по каноническому IR (04 §4.2), вычисляется при сборке (`aqven check`, `aqven build`).
  Ею пинятся компоненты, на неё ссылается прогон: вход DBOS-workflow — хеш IR, а не `application_version` DBOS
  ([ADR-0025](adr/0025-python-engine.md) §4); `application_version` — явная версия протокола исполнителя (раздел
  «Human-in-the-loop»). Ключ кассеты считается от нейтрального запроса модели
  ([ADR-0029](adr/0029-trust-and-quality-python.md) §1).
- `apiVersion` в файле — версия формата, а не содержимого: в IR не входит и `spec_hash` не меняет.
- **Метка релиза** (`production`, `v7`, дата) присваивается человеком при публикации и живёт
  отдельно от исходника.
- Порядок версий даёт история git и запись о релизе, а не сам идентификатор.
- В интерфейсе — короткий префикс хеша (12 символов), руками человек называет только метки.

## Escape hatch: код даёт значение, но не форму

Решение — [ADR-0019](adr/0019-escape-hatch-rules.md) в редакции [ADR-0026](adr/0026-yaml-spec-and-code-refs.md)
(синтез → сборка), динамическая форма — следующий раздел.

- Код порождает **значение объявленного слота**, никогда — имя слота, набор слотов или структуру
  шаблона. Проверяется компилятором. Промт уровня 3 — функция, которая возвращает отрисованный промт и не может
  добавить или убрать вход или выход.
- **R-42:** узел без типа выхода с границами (`maxItems`, `maxLength`) не компилируется.
  Без этого теряются R-T9 и R-C7 — верхняя оценка размера промта.
- **Класс детерминированности** обязателен у узлов с эффектами: `determinism: pure | stable | volatile`, у `stable` —
  `ttl_ms`. Один TTL не отвечает, корректно ли переиспользовать результат при других входах.
- **Данные пользователя не попадают в фазу сборки** (`build()` билдера, компиляция) — иначе кэш модели становится
  каналом утечки между пользователями.
- Политики живут в хуке `context_rewrite(needs, ctx)` после резолва источников и до рендера,
  а не внутри промта.
- Бюджет escape-узлов на промт и воркфлоу; превышение — предупреждение компилятора.

## Динамическая форма входа и выхода

Решение — [ADR-0027](adr/0027-dynamic-io-shapes.md) (расширяет [ADR-0006](adr/0006-dynamic-allowed-sets.md)).

**Берём наименее динамичный случай, который решает задачу.** Переход к следующему — только если предыдущий задачу
не выражает; обоснование — в `description` поля.

| # | От данных зависит | Механизм | Что видит компилятор |
|---|---|---|---|
| 1 | только значения (ID, коды) | allowed-set по ADR-0006 | все типы и поля |
| 2 | какой из известных вариантов структуры | дискриминированный union + `switch` | все варианты, полнота `switch` (R-41) |
| 3 | набор однотипных полей из конфигурации | строки `{key, value}` с allowed-set на `key` | структуру строки, тип значения |
| 4 | расширение статического ядра | статические поля + одно поле `type: "Dynamic"` | ядро целиком, у расширения — лимиты |
| 5 | форма целиком | `Dynamic` + `schema_from` + `limits` + шаг `narrow` | лимиты и точку сужения |

- **Схема из данных — значение типа `FieldSpec[]`**, нашего языка типов, а не произвольная JSON Schema: без `$ref`,
  рекурсии, `oneOf`/`anyOf`, открытых карт и значений по умолчанию; `maxLength` у `Text` и `maxItems` у `T[]` обязательны.
- **`limits` обязателен** (`max_fields`, `max_depth` ≤ 3, `max_text_length`, `max_items`). Компилятор считает худший
  случай против бюджета профиля; фактическая схема проверяется до вызова модели, нарушение — `WorkflowIssue` без
  сетевого запроса.
- **Выход `Dynamic` — непрозрачное значение.** К типизированному слоту, в проекцию, в `switch` и к полю в шаблоне оно
  попадает только через `narrow`: валидация Pydantic до типа реестра, несовпадение — `WorkflowIssue` с
  `severity: "assert"`, без повтора модели. Без `narrow` его принимают шаг `code` со входом `Dynamic`, слот шаблона
  целиком и выход воркфлоу.
- **Модель выхода строится при вызове:** `pydantic.create_model` с `extra="forbid"` + `ToolOutput(M, strict=True)`.
  Между шагами переносятся JSON-значение, `FieldSpec[]` и хеш схемы, а не класс.
- **След:** в трассу и провенанс пишутся `FieldSpec[]`, нейтральная схема и её хеш
  (`sha256("aqven.schema.v1\0" + rfc8785)`, `properties` — списком пар), отправленная wire-схема и фактический `strict`.
  Как снимать wire-схему в рантайме — ADR-0027 ОВ 5.
- **Вход динамичен только по значениям:** набор и имена слотов объявлены статически, иначе R-T1, R-T2 и R-T9 не считаются.
- Коды правил R-D1…R-D7 предложены, но не утверждены — ADR-0027 ОВ 1.

## Редактирование канваса

Канвас редактируемый руками с первого дня, тот же воркфлоу параллельно правит агент через MCP.
Решение — [ADR-0017](adr/0017-files-as-source-of-truth.md), [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §8;
подробности — [31. Редактирование канваса](31-canvas-editing.md).

- Человек правит **теми же операциями**, что агент: жест мышью → тот же `flow_patch`. Канвас правит YAML, кодмода нет;
  воркфлоу на билдере (`flow.py`) канвас только читает с плашкой «собран кодом, правьте в редакторе».
- Два канала записи: определение — файл через `flow_patch` с CAS по хешу файла; раскладка — ui-канал с LWW.
- Два уровня правки на одних байтах: Claude Code пишет файл нативными инструментами (валидация хуком
  после записи), Studio и MCP — через `flow_patch` (валидация до записи); структурные и кросс-файловые
  правки только через `flow_patch`, файловых операций в MCP не заводим.
- Агенты тоже правятся операциями: `rename_agent` переносит файл или папку агента со спутниками, переписывает все
  `agent:` и `reflection_agent:` и ссылки на перенесённые файлы, пишет в журнал `renames` (`kind: agent`);
  `delete_agent` отказывает с 422 `REQUEST_INVALID` и списком ссылающихся файлов, если агент используется
  (ADR-0030 `A13`).
- Undo — обратный патч, а не откат к коммиту; `flow_revert` пишет восстановленное содержимое новым
  коммитом, а не `git revert` дерева. Стек личный, правки агента молча не отменяет.
- Клиент валидирует только то, что может честно: вид порта, совместимость схемы, цикл.
  Доминирование, полнота enum и обязательные привязки — всегда сервер.

## Human-in-the-loop

Решение владельца от 2026-09-16, записано в [ADR-0025](adr/0025-python-engine.md) §9; ключи узла `human` и проверка
ответа — [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §13, §7; резюм, входящие, формы, тестовый режим и одобрение тула
в API — [23](23-studio-api.md) §6.4–§6.10, поток событий прогона — §11.4. Пробы
выполнялись вне репозитория 2026-09-16 на CPython 3.14.7 (dbos 2.31.1 на SQLite, pydantic-ai-slim 2.43.0, без вызовов
провайдеров); владелец принял их без независимой перепроверки.

- Это **узел ввода, а не подсистема задач**: шести операций `human_task_*` не существует.
- «Что ждёт меня» — `run_list({status: 'suspended'})`, ответ — `run_resume` с payload. Форма ввода приходит из
  `run_get_node` как `form_schema` — JSON Schema модели единственного типа `form` узла `human`: пары `form`/`resume` нет
  ([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §13).
- **Узел `human` собран из примитивов DBOS.** Перед ожиданием workflow публикует `DBOS.set_event("human", {address,
  form_schema, suspend_data, assignee, waiting_since, deadline_at, attempt, on_timeout, topic})` и пишет поисковый индекс
  в атрибуты workflow. Ждёт `DBOS.recv_async(topic, timeout_seconds)` на топике `"human:" + address_key + ":" + attempt`,
  уникальном для адреса и попытки. Дедлайн записан выходом шага `DBOS.sleep` и переживает рестарт: после SIGKILL
  таймаут сработал через 0,028 с после исходного дедлайна.
- **Таймаут — не операция и не задача планировщика.** Он объявлен в узле и исполняется самим workflow: политики
  `on_timeout: fail | default | escalate` — таблица обработчиков внутри workflow (Strategy). Внешнего планировщика нет,
  `timeout_job_id` не нужен.
- **Резюм.** API сначала проверяет payload моделью формы: несовпадение — отказ операции с `problems[]` (`path`, `code`,
  `message`), прогон не тронут. Затем `DBOS.send(workflow_id, {payload, idempotency_key, sent_at}, topic)`; ответ хранится
  выходом шага `recv` и виден в `list_workflow_steps`. Ключ идемпотентности в API — обязательный `client_op_id`, в
  `send` он уходит как `idempotency_key` ([23](23-studio-api.md) §6.8, ADR-0028 ОВ 6).
- **Чего DBOS не даёт — пишем сами:**
  1. Статус `suspended` в нашем индексе прогонов: прогон, заблокированный в `recv`, — `PENDING`, как любой работающий
     (восстановленные после рестарта — кратко `ENQUEUED`).
  2. Защита резюма: API отклоняет резюм, если узел не ждёт или попытка и топик не совпадают. Лишние сообщения DBOS
     молча буферизует, и их забрал бы следующий `recv` на том же топике.
  3. Проверка дедлайна и payload дважды — в API до `send` и в workflow при получении: workflow отбрасывает конверт с
     `sent_at` позже дедлайна или с payload, не прошедшим модель формы, и пишет `node_answer_ignored`. Иначе ответ,
     отправленный после дедлайна, пока исполнитель лежал, при восстановлении принимается.
  4. `application_version` закреплён явной версией протокола исполнителя и поднимается только при несовместимом
     изменении исполнителя. IR — данные со снимком на прогон, DBOS версионирует код интерпретатора, а хеш исходников
     workflow по умолчанию после правки кода оставил ждущие прогоны без восстановления (проверено).
  5. Ровно один исполнитель DBOS на системную БД: `DBOS.launch` делают только `aqven dev` и `aqven serve`, прочие
     процессы работают через `DBOSClient`. Второй `DBOS.launch` с тем же executor id перезапустил ждущие workflow
     (проверено).
- **Ранний ответ** буферизуется, и его забирает поздний `recv` (проверено): тесты и тестовый режим студии заранее кладут
  ответы на детерминированные топики.
- **Параллельные ожидания** — дочерний workflow на каждую ветку с `human`, id детерминирован:
  `parent_run_id + "::" + address_key`. У каждого свой event, атрибуты и топик; резюм в любом порядке, SIGKILL
  переживают (проверено). Топик и id дочернего workflow выводит один кодировщик: `address_key` — JSON адреса по
  RFC 8785 (`rfc8785` 0.1.4); строки живут только в адаптере DBOS, обратно не разбираются, а в API, событиях и хранилище
  прогонов адрес остаётся структурой (раздел «API студии»).
- **Одобрение вызова тула внутри узла `llm`** — deferred tools Pydantic AI: `requires_approval=True`, сегментный шаг
  возвращает `DeferredToolRequests`, workflow между сегментами ждёт `recv`, следующий сегмент —
  `agent.run(..., deferred_tool_results=DeferredToolResults(approvals={...}))` без `DBOSDurability` (ADR-0030 §9, проба с
  SIGKILL во время ожидания). Тулы с `effect: write|external` — `CallDeferred` и собственный DBOS-шаг между сегментами.
- **Живые обновления студии.** Workflow дописывает события прогона в поток DBOS `run_events` (из кода workflow —
  exactly-once, дельты вывода из шага — at-least-once, ADR-0030 §9; `seq` = offset + 1); `GET /api/runs/{run_id}/events` читает его через `DBOSClient` (SSE, `Last-Event-ID` = `seq`).
  Своей outbox-таблицы нет.
- **HITL в студии** (требование владельца: ответить и протестировать):
  1. Входящие — ждущие прогоны из нашего индекса `suspended`, форма из `form_schema`, резюм с ошибками проверки у полей.
  2. Тестовый режим — запуск принимает скриптованные ответы по адресу исполнения, движок заранее кладёт их на
     детерминированные топики.
  3. Fork на шаге `human` — `DBOS.fork_workflow` со `start_step` на первом шаге узла `human` — переспрашивает с другим
     ответом, связь — `forked_from`.
  4. CI — pytest с `ScriptedHuman`: одобрение, отказ, неверный payload, таймаут с `default`, таймаут с `fail`, эскалация,
     заранее положенный ответ, неверное сырое сообщение (8 тестов проходят без сети).
- **Открыто** (ADR-0025, «Открытые вопросы»):
  1. Индекс `suspended` — атрибуты workflow DBOS или своя таблица (ОВ 21). У атрибутов один запрос списка, но SQL-фильтр
     есть только на PostgreSQL (GIN, не запускался), каждое обновление заменяет все атрибуты, fork копирует их устаревшими.
  2. Хранение непрочитанных сообщений: API очистки не найден (ОВ 22).
  3. Снято ADR-0030 §1: PostgreSQL нет; на SQLite чтение потока с интервалом 0,05 с — медиана 15 мс (ADR-0030 §9).
  4. Сериализация DBOS: `py_pickle` по умолчанию против `portable_json` для писателей не на Python не запускалась
     (ОВ 24, связано с ОВ 7).
  5. `send_to_forks=True` прочитан в исходнике, не запускался (ОВ 25).
  6. Перевод адреса исполнения в `start_step` форка требует записанного function id первого шага каждого узла (ОВ 8).

## API студии

Решение — [ADR-0028](adr/0028-studio-api-contract.md) (заменяет [ADR-0007](adr/0007-single-operation-contract.md)),
нормативный контракт — [23. API локальной студии](23-studio-api.md).

- **Источник контракта — модели Pydantic.** Операция — одна запись каталога `Operation` (Registry). FastAPI 0.141.1
  публикует её маршруты в OpenAPI 3.1, `MCPServer("aqven")` на том же порту — тул с `inputSchema` и `outputSchema` из тех
  же моделей (Adapter `ToolCall`), openapi-typescript 7.13.0 генерирует типы `apps/studio`. Маршрут и тул вызывают один
  use-case (Port/Adapter), второй реализации нет. Рукописных типов API и контрактных zod-схем в студии нет.
- У каждого маршрута явный `operation_id` и ровно одно из расширений `x-aqven-operation: <имя тула>` или
  `x-aqven-rest-only`; операция без маршрута — `surface="mcp_only"`. Модели входа — `extra="forbid"`. Ответ чтения по
  REST — модель выхода без конверта, ответ записи в обоих каналах — `Envelope` ([ADR-0028](adr/0028-studio-api-contract.md)
  §2, правило 4). Конверт у тулов чтения — ADR-0028 ОВ 1; [23](23-studio-api.md) §1.2 отдаёт у записи вне файлов
  (запуск, резюм, форк прогона и др.) свой ресурс — расхождение с правилом, 23 ОВ 22. Ошибки — один `ApiError`: в REST
  с HTTP-кодом, в MCP — `is_error` с `ApiError` в `structuredContent`; ошибка валидации аргументов тула пока приходит
  текстом SDK — ADR-0028 ОВ 2.
- **Один процесс и один порт на `127.0.0.1`** с защитой ADR-0030 §3 (проверки `Host` и `Origin`, токен на запуск): `/api/*` (неизвестный путь — 404 `ApiError`,
  никогда `index.html`), `/api/openapi.json`, `/api/schemas/events`, `/mcp/`, прочие `GET` — статика студии.
- **SSE** — `fastapi.sse.EventSourceResponse` с кадром `ServerSentEvent(data=model, event=model.type, id=str(model.seq))`;
  все каналы `GET`, возобновление по `Last-Event-ID` = `seq`; run-канал читает поток DBOS `run_events` (раздел
  «Human-in-the-loop»). Типы событий — реестр `GET /api/schemas/events` → компоненты OpenAPI: openapi-typescript 7.13.0
  превращает поток в `unknown`.
- **Адрес исполнения узла — структура** `{node_id, branch_key, iteration, item_index}`; `iteration: null` — уровень узла,
  `0` — нулевая итерация. Строковые ключи (`nodeId#branch`, `nodeId@iteration`) запрещены в API, событиях и хранилище.
- **Запись:** `expects[{path, file_hash | null}]` + `client_op_id` (ULID); конфликт — 412 `STALE_FILE`, `FILE_VANISHED`,
  `FILE_EXISTS`, клиент перечитывает файл и переигрывает намерение. Хеши — строки `sha256-<64 hex>`. Статусы прогона —
  `queued|running|suspended|completed|failed|cancelled`.
- `openapi.json`, `@aqven/api-types/schema.d.ts` и снапшот `tools/list` коммитятся; CI регенерирует их и падает на
  `git diff --exit-code`; контрактный тест сверяет тул, маршрут и модель.
- Открыто: peer `typescript@^5.x` у openapi-typescript 7.13.0 при нашем 6.0.3 — ADR-0025 ОВ 13; состав каталога
  `aqven serve` — ADR-0028 ОВ 7 (авторизация решена ADR-0030 §3).

## MCP-контракт

Решение — [ADR-0008](adr/0008-mcp-tool-naming-and-phasing.md) в редакции [ADR-0025](adr/0025-python-engine.md) §8,
механизм адаптера — [ADR-0028](adr/0028-studio-api-contract.md).

- **Имена тулов только snake_case**: `flow_create`, `run_replay_node`, `experiment_compare`.
  Точки из §13.1 спеки невалидны (ограничение имени тула в Messages API). Имя сервера — `aqven`, схема ресурсов —
  `aqven://`; полное имя `mcp__aqven__<tool>` проверяется на длину ≤ 128 символов.
- SDK — `mcp` 2.2.0, `mcp.server.MCPServer`, streamable HTTP в `/mcp/` на порту FastAPI (раздел «API студии»).
- Один конверт ответа записи (правило — раздел «API студии»): `ok`, `op`, `version{files[{path, file_hash}], dirty, actor,
  client_op_id}`, `focus`, `problems[]`, `candidates[]` с готовым `apply{tool,arguments}`, `next[]`, `refs[]`, `ui_url`,
  `truncated`.
- Фазовое раскрытие: одновременно ≤20–25 тулов, ядро 8–10 всегда включено. `RegisteredTool.enable()/disable()` в Python
  SDK нет; кандидаты — `MCPServer.add_tool`, `remove_tool` и `send_tool_list_changed()`, работа на сессию не проверена —
  ADR-0025 ОВ 18.
- Конкурентность: server-authoritative `flow_patch` с `expects[{path, file_hash}]` + `client_op_id` (CAS по sha256 байтов
  файла). CRDT не берём.
- Группа тулов экспорта отменена — раздел «Отклонения от исходной спеки».
- Claude Code не поддерживает MCP sampling; resources и prompts — не опора, весь контракт в тулах.

## Качество

Решение — [ADR-0014](adr/0014-ir-mutation-testing.md) в редакции [ADR-0025](adr/0025-python-engine.md) §8,
[ADR-0029](adr/0029-trust-and-quality-python.md) §9–§10 (заменяет [ADR-0015](adr/0015-gate-statistics.md)).

- **`aqven check` — две стадии** (ADR-0030 `A10`): статика, затем симулированный прогон каждого flow на движке DBOS во
  временном каталоге состояния с `ALLOW_MODEL_REQUESTS=False`, `httpx2.MockTransport`, который бросает на любой
  сетевой запрос, значениями из JSON Schema и симулированными ответами моделей — без сети и без токенов. Узлы `code`
  исполняются по-настоящему. Коды `E_SIM_NODE_FAILED`, `E_SIM_PROMPT_RENDER`, `E_SIM_OUTPUT_INVALID`,
  `E_SIM_RUN_FAILED`, `W_SIM_NODE_UNREACHED`; кеш на flow — `.aqven/cache/simulation.json`, ключ = хеш замыкания flow +
  sha256 по всем `.py` проекта + версия aqven; флаги `--static`, `--simulation-only`, `--no-cache`. Ветку в сценарном
  тесте задаёт `RunOptions(outputs=(node_output(...), node_failure(...)))`, а не удача модели.
- Kill-критерий «компилятор ловит 100% мутантов» закрывается **своим доменным IR-мутатором**
  (мутируем IR, а не исходники). Мутационное тестирование Python-кода — дополнительно, инструмент не выбран
  (mutmut 3.8.0 или cosmic-ray 8.7.0) — ADR-0025 ОВ 12.
- Гейт выпуска имеет четыре исхода: PASS / WARN / BLOCK / GATE_UNAVAILABLE.
- Статистика: парный бутстрап (BCa, B=10000, фиксированный seed), McNemar для бинарных,
  Wilcoxon signed-rank для порядковых, Holm для primary-семьи и BH для secondary.
  Обязателен A/A-прогон до сравнения A/B. Минимум 200 элементов для блокирующего гейта.
- **Математика — библиотечные вызовы scipy 1.18.1 и statsmodels 0.15.0**, своё — доменная политика гейта (семьи,
  пороги, A/A, выпавшие кейсы, цепочка четырёх исходов). Обязательно: `wilcoxon(method="exact")` запрещён; BCa — по
  массиву разниц `d = b - a`; NaN-интервал → `GATE_UNAVAILABLE`; `multipletests` только с явным `method`. Модуль
  статистики не импортирует `pydantic_ai` и `pydantic_evals`.
- **Krippendorff alpha и ICC — своя реализация на numpy.** Единственный пакет alpha с порядковой дистанцией,
  `krippendorff` 0.8.2, — GPL-3.0-or-later, а модуль собирается в wheel для чужих проектов; ICC нет в statsmodels,
  pingouin 0.6.1 — GPL-3.0.
- LLM-судья блокирует выпуск только при weighted kappa ≥ 0.7 и Krippendorff alpha ≥ 0.8. Weighted kappa — quadratic,
  `statsmodels.stats.inter_rater.cohens_kappa` по полной шкале.
- **pydantic-evals 2.43.0 — прогонщик и формат датасета, не гейт.** Повторы разворачиваем сами (`Case` на
  `(item_key, run_idx)`, seed в metadata), спаривание — по `item_key`; сбой оценщика или задачи — выпавший кейс в обеих
  версиях, больше 5% выпавших → `GATE_UNAVAILABLE`.
- **Каждый вызов модели, включая судей и reflection GEPA, идёт через фабрику `aqven_llm` и цепочку гарантий:**
  `OutcomeGateModel`, редакция PII, кассета, бюджет. `LLMJudge` без явной модели из каталога запрещён. Тесты и CI — без
  сети: `ALLOW_MODEL_REQUESTS = False`, кассеты в режиме `replay_strict`.

## Экспорт: остались канонизация и хеш

Экспорт отменён ([ADR-0025](adr/0025-python-engine.md) §7, раздел «Отклонения от исходной спеки»); хеш —
[ADR-0022](adr/0022-hash-as-version.md), кассеты — [ADR-0029](adr/0029-trust-and-quality-python.md) §1.

- Канонизация — `rfc8785` 0.1.4 (RFC 8785, Apache-2.0), хеш — `hashlib` sha256 с доменной сепарацией, префикс
  `sha256-`. `spec_hash` — от канонического IR (04 §4.2). Где порядок полей — семантика (ключ кассеты
  `aqven.cassette.v1`, хеш схемы `aqven.schema.v1`), каждый объект `properties` перед канонизацией становится списком пар.
- Источник истины — файл YAML в рабочем дереве; JSONB — индекс. Опции сериализации фиксированы (канонический писатель
  [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1), якоря и комментарии запрещены.
- Кассеты — свой content-addressed формат на уровне модели (`CassetteModel` над `WrapperModel`), не HTTP-моки. Ключ —
  от нейтрального запроса, поэтому запись одного провайдера проигрывается на другом. Ключ через `rfc8785` не
  запускался — ADR-0029 ОВ 10. Полезная нагрузка длиннее 1024 символов лежит один раз в общем
  `<cassettes>/blobs/<sha256>.txt`, в событии остаётся `{"$aqven_blob": "sha256-..."}`; ключи и имена файлов не
  меняются, распакованные кассеты читаются по-прежнему (ADR-0030 `A13`).
- Бандл (детерминированный tar, Merkle-корень), codegen в другие фреймворки, скилл воссоздания, конформанс против
  воссозданной реализации и вторая цель миграции отменены. Интеграция — вызов воркфлоу по HTTP и MCP (`aqven serve`) и
  импорт модуля-wheel в Python-проект.
