# ADR-0025. Движок на Python: Pydantic AI и DBOS

> Статус: **частично изменено [ADR-0030](0030-local-browser-backend.md)** (2026-09-17)
> Дата: 2026-09-16
>
> ADR-0030: прода на PostgreSQL 18 нет, системная БД DBOS только SQLite (§4); `aqven` пинит encode `httpx` 0.28.1 ради `pydantic_ai.mcp` (§5); узел `llm` исполняется сегментными шагами без `DBOSDurability`, одобрение тула — между сегментами (§9, H6); закрыты открытые вопросы 1 и 4, сняты 9 и 16, в 8, 11, 21, 23 изменена часть. Остальное в силе.
> Зависит от: [ADR-0017](0017-files-as-source-of-truth.md), [ADR-0024](0024-studio-on-vite.md)
> Заменяет: [ADR-0001](0001-execution-core-on-voltagent.md), [ADR-0002](0002-ai-sdk-v6-axis.md), [ADR-0010](0010-pg-boss-scheduler.md)
> Изменяет в части служебной схемы БД: [ADR-0011](0011-two-schemas-and-tenancy.md)
> Изменяет в части имени сервера и MCP SDK: [ADR-0008](0008-mcp-tool-naming-and-phasing.md)
> Изменяет в части инструментирования трасс: [ADR-0012](0012-langfuse-as-store.md)
> Изменяет в части инструмента мутационного тестирования кода: [ADR-0014](0014-ir-mutation-testing.md)
> Изменяет в части git-библиотеки: [ADR-0017](0017-files-as-source-of-truth.md)
> Изменяет в части обоснования моков: [ADR-0024](0024-studio-on-vite.md)
> Меняет: [DECISIONS.md](../DECISIONS.md) — разделы «Ось версий (пин, сентябрь 2026)», «Что берём готовым (не пишем сами)», «Наш слой», «Отклонения от исходной спеки», «Данные», «Human-in-the-loop», «MCP-контракт», «Качество», «Экспорт: остались канонизация и хеш»; [CLAUDE.md](../../CLAUDE.md) — правила «Ось версий не трогать», «Строгий TypeScript», «Импорты `ai`, `@ai-sdk/*`, `@openrouter/*`»; [adr/README.md](README.md) — строки 0001, 0002, 0008, 0010, 0011, 0012, 0014, 0017, 0024; [01. Продукт и требования](../01-product-and-requirements.md), [02. Архитектура](../02-architecture.md), [10. Рантайм](../10-runtime.md), [11. Провайдеры](../11-providers.md), [12. Наблюдаемость](../12-observability.md), [14. MCP-контракт](../14-mcp-contract.md) §2, §2.5, §2.7 (группа `export`), §5.4, §10.4, [files-first/contract.md](../files-first/contract.md) «Решения», §3, [15. Studio: фронтенд](../15-studio-frontend.md) §10.3, [frontend/run.md](../frontend/run.md), [16. Модель данных](../16-data-model.md), [17. Фоновые задачи](../17-jobs-and-scheduling.md), [18. Экспорт и конформанс](../18-export-and-conformance.md), [20. Репозиторий](../20-repo-and-tooling.md), [21. Дорожная карта](../21-roadmap.md), [22. Глоссарий](../22-glossary.md), [23. API локальной студии](../23-studio-api.md) §6.4, §6.6–§6.10, §11.4, §13.2, открытые вопросы 1–2, [playground/](../playground/README.md), [97. Матрица покрытия](../97-coverage-matrix.md), [98. Аудит версий](../98-version-audit.md), [99. Открытые вопросы](../99-open-questions.md)
> Исследование: [research/py-stack-runtime.md](../research/py-stack-runtime.md), [research/py-quality-layer.md](../research/py-quality-layer.md). Пробы выполнялись вне репозитория 2026-09-16 (CPython 3.14.7, uv 0.12.15, ruff 0.16.7, pyright 1.1.414, dbos 2.31.1), результаты приведены в research/py-stack-runtime.md §2, §5, §9; результаты проверки `uv.lock` (§5), раскладки ruff в uv workspace (§6) и обхода изоляции строковым идентификатором модели (открытый вопрос 14) приведены только в этом ADR. Пробы ожидания человека (dbos 2.31.1, pydantic-ai-slim 2.43.0, SQLite; §9) и Kitaru 0.26.0 («Альтернативы») выполнялись вне репозитория 2026-09-16 на CPython 3.14.7, результаты — [research/py-stack-runtime.md](../research/py-stack-runtime.md) §5.5, §12

## Контекст

**Решение владельца от 2026-09-16.** Движок переписывается на Python, основа — Pydantic AI. TS-стек движка
(VoltAgent, `ai@6`, пакеты dsl/synth/std/cli) снимается, студия остаётся фронтендом на React
([ADR-0024](0024-studio-on-vite.md)). Модуль воркфлоу импортируется в чужой Python-проект или запускается
по HTTP/MCP. Про экспорт: «Экспорт не нужен, у нас будут HTTP-вызовы».

**Язык движка выбирает проект-хозяин.** Шаг `code` — функция проекта по ссылке `module:function`, исполняется в процессе
модуля ([ADR-0026](0026-yaml-spec-and-code-refs.md)); вызвать её без границы сериализации и проверить pyright strict можно
только на том же языке. BAML (baml-py 0.226.2; MIT по npm, Apache-2.0 по LICENSE) не подходит: кода внутри DSL нет, а шаг
`code` обязателен ([research/py-stack-runtime.md](../research/py-stack-runtime.md) §1). Отсюда один язык движка и `aqven serve` (HTTP + MCP).

**На чём держались заменяемые ADR.**

| ADR | Опора | Что с ней в Python |
|---|---|---|
| [0001](0001-execution-core-on-voltagent.md) | VoltAgent 2.10.0: чекпоинты, restart, `timeTravel`, `suspend/resume`, `WorkflowRegistry` | другой язык; надёжное исполнение даёт отдельная библиотека |
| [0002](0002-ai-sdk-v6-axis.md) | peer `ai: ^6.0.0` у `@voltagent/core@2.10.0`, изоляция в `@aqven/llm` | peer-оси нет; изоляция провайдеров нужна в Python-форме |
| [0010](0010-pg-boss-scheduler.md) | у VoltAgent нет таймера → pg-boss как таймер, планировщик и очередь | очереди и расписания есть в DBOS (дока); таймер человека — `recv` с таймаутом внутри workflow (§9) |

**Факты о кандидатах** проверены запуском, по исходникам и докам: `Agent.run` и повтор выхода —
[research/py-stack-runtime.md](../research/py-stack-runtime.md) §3.2, §3.5; `WrapperModel` и скрытые ретраи SDK —
[research/py-quality-layer.md](../research/py-quality-layer.md) §1.1, §1.5; DBOS на SQLite — py-stack-runtime §5.1; pydantic-graph — §4;
httpx2 — §6.1; `mcp` 2.2.0 — §7; SSE — §8; CPython 3.15 — §9.1. Пробы Pydantic AI, гарантий вызова и pydantic-evals шли
на CPython 3.12.4, а этот ADR фиксирует 3.14: повтор на 3.14.7 — открытый вопрос 20.

**Спека требует VoltAgent**: §0, R21 («готовый экспорт в VoltAgent»), R23, §14 экран 14, §17 «Экспорт в цели», kill-критерии
14 и 15, §20 целиком (разбор — §7). Спека неизменна, расхождение фиксируется здесь и в DECISIONS. Опыт «с VoltAgent и
Pydantic AI» спека называет исходным активом (§2).

## Решение

**Движок — CPython 3.14 и Pydantic AI 2.43.0. Надёжное исполнение — DBOS 2.31.1: SQLite локально,
PostgreSQL 18 в проде. Исполнитель IR — наша функция DBOS-workflow, узел — DBOS-шаг.** VoltAgent, `ai@6`,
pg-boss и TS-пакеты движка уходят. `apps/studio` остаётся на TypeScript.

> Статус 2026-09-17: «PostgreSQL 18 в проде» снято [ADR-0030](0030-local-browser-backend.md) §1 — только локальное приложение на SQLite. Узел `llm` — не один шаг, а сегментные шаги (ADR-0030 §9); ветки `parallel`, `map`, `quorum` — дочерние workflow (ADR-0030 §10).

### 1. Ось версий движка

Пины точные (`==`), один `uv.lock` на workspace. Лицензии Python-пакетов — метаданные PyPI и `dist-info` на
2026-09-16; CPython — `LICENSE.txt` сборки 3.14.7; PostgreSQL — https://www.postgresql.org/about/licence/.

| Решение | Что берём | Версия | Лицензия | Почему |
|---|---|---|---|---|
| Интерпретатор | CPython, `requires-python = ">=3.14,<3.15"` | 3.14 (проверено на 3.14.7) | PSF-2.0 | новейшая bugfix-линия, EOL 2030-10; 3.15 не собирается |
| Вызов моделей | `pydantic-ai-slim[openai,anthropic,google]` | 2.43.0 | MIT | типизированный выход с повтором, `WrapperModel`, модель и инструкции на вызове |
| Evals | `pydantic-evals` | 2.43.0 | MIT | прогонщик экспериментов и формат датасетов; гейт наш ([ADR-0029](0029-trust-and-quality-python.md)) |
| Модели данных | `pydantic` | 2.13.5 | MIT | проверка на каждой границе, JSON Schema |
| Надёжное исполнение | `dbos` | 2.31.1 | MIT | чекпоинт шага, восстановление, `fork_workflow`, очереди; библиотека в процессе |
| Хранилище, прод | PostgreSQL | 18 | PostgreSQL License | уже в стеке; DBOS рекомендует Postgres для прода |
| Системная БД DBOS, локально | SQLite через SQLAlchemy (`sa.create_engine` в `dbos/_sys_db_sqlite.py`) | `sqlite3.sqlite_version` 3.53.1 в сборке CPython 3.14.7 от uv | public domain | `aqven dev` без отдельного сервиса |
| HTTP-клиент | `httpx2` | 2.13.0 | BSD-3-Clause | решение владельца от 2026-09-16; на нём Pydantic AI, openai, anthropic, mcp |
| SDK провайдеров | `openai` / `anthropic` / `google-genai` | 3.14.1 / 1.6.0 / 2.23.0 | Apache-2.0 / MIT / Apache-2.0 | клиенты с `max_retries=0` (§5) |
| HTTP API и SSE | `fastapi` без extras | 0.141.1 | MIT | `fastapi.sse.EventSourceResponse`; extras тянут encode `httpx` |
| ASGI-сервер | `uvicorn` | 0.53.0 | BSD-3-Clause | `uvicorn.Server` в процессе обслужил FastAPI + MCP на 3.14.7 |
| MCP-сервер | `mcp`, `mcp.server.MCPServer` | 2.2.0 | MIT | streamable HTTP на порту FastAPI; зависит от `httpx2` |
| Шаблоны промтов | `python-liquid` | 2.3.1 | MIT | `analyze()` без рендера |
| Оптимизация промтов | `gepa` | 0.1.4 | MIT | библиотека в процессе ([ADR-0029](0029-trust-and-quality-python.md)) |
| Статистика гейтов | `scipy` + `statsmodels` | 1.18.1 / 0.15.0 | BSD / BSD-3-Clause | [ADR-0029](0029-trust-and-quality-python.md) |
| Массивы для статистики | `numpy` | 2.5.3 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | прямой импорт в модуле статистики ([ADR-0029](0029-trust-and-quality-python.md) §10); транзитивно приходит и через scipy |
| YAML | `ruamel.yaml` | 0.19.1 | MIT | строгий проход по событиям, канонический писатель |
| Канонизация | `rfc8785` | 0.1.4 | Apache-2.0 | RFC 8785 без зависимостей, 254 строки — можно вендорить |
| Git | `dulwich` за `GitPort` | 1.2.15 | Apache-2.0 OR GPL-2.0-or-later, берём Apache-2.0 | чистый Python, без бинарника git |
| Наблюдение за файлами | `watchfiles` | 1.2.0 | MIT | `awatch` с фильтром |
| Транспортный ретрай | `tenacity` | 9.1.4 | Apache-2.0 | единственный слой ретрая; `pydantic_ai.retries` не берём |
| Цены | `genai-prices`, снимок пинится | 0.1.7 | MIT | стоимость в `RunUsage` |
| Трассы | `opentelemetry-sdk` + `opentelemetry-exporter-otlp-proto-http` | 1.44.0 | Apache-2.0 | OTLP в Langfuse без SDK langfuse (§8) |
| Workspace и wheel | `uv` + `uv_build` | 0.12.15 | MIT OR Apache-2.0 | один lock, данные модуля попадают в wheel |
| Линт, запреты импортов | `ruff` | 0.16.7 | MIT | TID251 (§5–§6) |
| Типы | `pyright`, `typeCheckingMode = "strict"` | 1.1.414 | MIT (обёртка на PyPI) | пакет на PyPI — обёртка над Node-версией: зависит от `nodeenv`, extra `nodejs` ставит `nodejs-wheel-binaries` |
| Тесты | `pytest` + `pytest-asyncio` | 9.1.1 / 1.4.0 | MIT / Apache-2.0 | плагин `anyio` 4.15.1 приходит транзитивно, оба грузятся вместе |

Число пакетов зависит от способа: `uv pip compile --python-version 3.14 --python-platform aarch64-apple-darwin` — 95 без
extra `google` и 102 с ним (py-stack-runtime §2); универсальный `uv lock` с extra `google` — 107 вместе с корневым проектом.
OpenRouter и Together идут через SDK openai: `OpenRouterProvider` и `TogetherProvider` принимают `openai_client: AsyncOpenAI`,
к ним применимо то же `max_retries=0`.

Транзитивные зависимости, которые важны для правил:

| Пакет | Версия | Лицензия | Кто тянет | Правило |
|---|---|---|---|---|
| `pydantic-graph` | 2.43.0 | MIT | pydantic-ai-slim, `Requires-Dist: pydantic-graph==2.43.0` | не импортируем (§3, §6) |
| `psycopg`, `psycopg-binary` | 3.3.5 | LGPL-3.0-only | dbos, `psycopg[binary]>=3.1`, ставится и при SQLite | не импортируем; лицензия — открытый вопрос 10 |
| `sqlalchemy` | 2.0.54 | MIT | dbos, `sqlalchemy[asyncio]>=2.0.43` | — |
| `PyYAML` | 6.0.3 | MIT | dbos, pydantic-evals | не импортируем: файлы описания читает ruamel.yaml |
| `requests` | 2.34.2 | Apache-2.0 | opentelemetry-exporter-otlp-proto-http, tiktoken, google-genai, google-auth (extra `requests`, его включает google-genai) | допустим транзитивно, не импортируем |
| `tiktoken` | 0.14.0 | MIT | extra `openai` | — |
| `starlette` / `sse-starlette` | 1.6.0 / 3.4.11 | BSD-3-Clause | fastapi / mcp | — |
| encode `httpx` | 0.28.1 | BSD-3-Clause | только google-genai 2.23.0 (extra `google`) | допустим транзитивно, не импортируем |

### 2. Что остаётся в `apps/studio`

TypeScript 6.0.3, Vite 8.3.0, React 19.3.0 ([ADR-0024](0024-studio-on-vite.md), `apps/studio/package.json`); довод «TS 6.0.3,
а не 7.0.2» (потолок typescript-eslint) действует только для студии. Типы клиента — openapi-typescript 7.13.0 (MIT) из
OpenAPI FastAPI, контракт — [ADR-0028](0028-studio-api-contract.md). Правило ADR-0024 «в `apps/studio` нет импортов `next`, `ai`,
`@ai-sdk/*`, `@openrouter/*`» остаётся. Node нужен студии и обёртке pyright (в пробе — системный Node 20.19.0).

### 3. Что берём готовым, что пишем сами

| Возможность | Берём | Механизм | Проверено |
|---|---|---|---|
| Чекпоинт результата шага, восстановление после падения | DBOS | `@DBOS.workflow()`, `@DBOS.step()`, `DBOS.launch()` | запуск 3.14.7 |
| Fork с шага | DBOS | `DBOS.fork_workflow(workflow_id, start_step, *, application_version, queue_name, ...)`; связь с исходным прогоном — `WorkflowStatus.forked_from` | запуск 3.14.7 |
| История шагов | DBOS | `DBOS.list_workflow_steps(workflow_id, *, load_output, limit, offset)` | запуск 3.14.7 |
| Управление прогонами | DBOS | `resume_workflow`, `cancel_workflow`, `list_workflows` | дока |
| Ожидание сообщения с таймаутом, события, поток событий прогона | DBOS | `recv_async`, `send`, `set_event`, `sleep`, `write_stream_async` / `DBOSClient.read_stream_async` (§9) | запуск 3.14.7 |
| Очереди с лимитом конкурентности, расписания | DBOS | `dbos/_queue.py` `Queue`, расписания | дока |
| Вызов модели с типизированным выходом и повтором | Pydantic AI | `Agent.run(output_type=...)`, `RetryPromptPart`, `ToolOutput(strict=True)` | запуск 3.12.4 и 3.14.7 |
| Модель и инструкции на вызове | Pydantic AI | `Agent.run(model=..., instructions=...)`, `Agent.override(instructions=...)` | исходник, дока |
| Бюджеты прогона | Pydantic AI | `UsageLimits` + общий `RunUsage` | запуск 3.12.4 |
| Гарантии на каждом вызове | Pydantic AI | `WrapperModel`, цепочка — [ADR-0029](0029-trust-and-quality-python.md) §1 | запуск 3.12.4 |
| Выключатель сети моделей | Pydantic AI | `pydantic_ai.models.ALLOW_MODEL_REQUESTS = False` | запуск 3.12.4 |
| Спаны вызовов | Pydantic AI | `InstrumentationSettings(version=5)` на своём `TracerProvider` | запуск 3.12.4 |
| Прогонщик экспериментов | pydantic-evals | `Dataset`, `Case`, `Evaluator`, `LLMJudge` | запуск 3.12.4 |
| HTTP API, SSE | FastAPI | маршруты, `EventSourceResponse` | запуск 3.14.7 |
| MCP-сервер | mcp | `MCPServer.streamable_http_app(streamable_http_path="/")`, `session_manager.run()` в lifespan FastAPI | запуск 3.14.7 |

| Пишем сами | Почему не готовое |
|---|---|
| Исполнитель IR: одна функция DBOS-workflow обходит план скомпилированного IR, каждое исполнение узла — DBOS-шаг | граф — это IR с хешем ([ADR-0022](0022-hash-as-version.md)); у DBOS нет модели графа, у pydantic-graph нет сохранения состояния |
| `switch` с first-match | во всех вариантах стека это наш слой семантики |
| `quorum(k)`, `any`, `first_success` при сведении веток | то же |
| Лимиты циклов: `max_iter`, бюджет, стагнация, best-of | то же |
| `map` с `on_item_error` | то же |
| Связь шага DBOS с адресом исполнения узла `{node_id, branch_key, iteration, item_index}` | `list_workflow_steps` отдаёт имя функции шага (`execute_node`), а не адрес (проба) |
| Три исхода вызова, кассеты, редактирование PII | [ADR-0029](0029-trust-and-quality-python.md) |
| Ключи идемпотентности узлов с внешними эффектами | прерванный падением шаг выполняется заново целиком (запуск) |
| Узел `human`: индекс `suspended`, защита резюма, проверка дедлайна и payload в API и в workflow, таблица политик таймаута (§9) | прогон в `recv` DBOS показывает как `PENDING`, лишние сообщения молча буферизует (запуск) |

pydantic-graph не используем: сохранения состояния в builder API нет, граф уже задан IR; импорт запрещён (§6). `DBOSAgent`
в pydantic-ai-slim 2.43.0 помечен `@deprecated` (удаление в v3) и не используется; интеграция Pydantic AI с DBOS —
capability `DBOSDurability` (`durable_exec/dbos/_durability.py`) с `agent.run()` внутри нашего `@DBOS.workflow`. Она
запускалась только в пробе одобрения тула с `FunctionModel` (§9); её место относительно исполнителя узла и цепочки
гарантий — открытый вопрос 4.

Исполнитель — Interpreter над планом IR, исполнители узлов выбираются таблицей (Strategy). Пример прошёл pyright strict и
`ruff check` (`E`, `F`), вариант с двумя шагами на SQLite дал шаги `(1, execute_node)`, `(2, execute_node)`. `IrHash`,
`NodeId`, `JsonObject`, `NodeKind`, `CompiledNode`, `plan_for`, `execute_*` — из пакета исполнителя.

```python
from collections.abc import Awaitable, Callable, Mapping

from dbos import DBOS

type NodeExecutor = Callable[[CompiledNode, JsonObject], Awaitable[JsonObject]]

NODE_EXECUTORS: Mapping[NodeKind, NodeExecutor] = {
    NodeKind.LLM: execute_llm,
    NodeKind.CODE: execute_code,
    NodeKind.TOOL: execute_tool,
}


@DBOS.step(retries_allowed=False)
async def execute_node(
    ir_hash: IrHash, node_id: NodeId, values: JsonObject
) -> JsonObject:
    node = plan_for(ir_hash).node(node_id)
    return await NODE_EXECUTORS[node.kind](node, values)


@DBOS.workflow()
async def run_flow(ir_hash: IrHash, flow_input: JsonObject) -> JsonObject:
    plan = plan_for(ir_hash)
    values: JsonObject = {"input": flow_input}
    node_id = plan.first_node(values)
    while node_id is not None:
        values = {**values, node_id: await execute_node(ir_hash, node_id, values)}
        node_id = plan.next_node(node_id, values)
    return values
```

Пример показывает последовательный обход с `switch` внутри `plan.next_node`; выходы итераций по адресу исполнения и
`parallel`, `map` не показаны: параллельные шаги внутри workflow не проверены (открытый вопрос 1).

### 4. Долговечность

| Режим | Системная БД DBOS | Конфигурация | Статус |
|---|---|---|---|
| `aqven dev`, тесты | SQLite | `system_database_url = "sqlite:///<абсолютный путь>"`; `use_listen_notify = False` явно: дока — «must be False in SQLite», после создания БД ключ не меняется (описание `DBOSConfig`) | восстановление, fork, история шагов проверены |
| Прод | PostgreSQL 18 | системные таблицы в схеме из ключа `dbos_system_schema`, по умолчанию `"dbos"`; рантайм-процесс с `run_migrations = False`, миграции — `dbos migrate` отдельным шагом деплоя (ключи `DBOSConfig`) | не запускалось (открытый вопрос 9) |

> Статус 2026-09-17: строка «Прод» снята [ADR-0030](0030-local-browser-backend.md) §1. Системная БД — `<проект>/.aqven/dbos.sqlite`.

Правила:

1. Вход workflow — хеш IR и вход воркфлоу. Версию графа несёт хеш IR, а не `application_version` DBOS: её DBOS по умолчанию
   считает по исходнику функций workflow (`DBOS.compute_app_version`), а исполнитель от правки IR не меняется.
   `application_version` задаётся явно — версия протокола исполнителя (§9); остаток — открытый вопрос 6.
2. Шаги с вызовом модели — `DBOS.step(retries_allowed=False)` (значение по умолчанию). Транспортный ретрай один —
   `BackoffModel` в цепочке [ADR-0029](0029-trust-and-quality-python.md) §1, снаружи внутрь: OutcomeGate → Redaction → Cassette →
   Limiter → BackoffModel → модель провайдера (SDK с `max_retries=0`); Instrumentation — самый внешний спан.
3. На границе шага — JSON-совместимые значения (`model_dump(mode="json")`), модель восстанавливает проверка Pydantic
   (прежняя обязанность ADR-0001). По умолчанию DBOS пишет вход и выход шага через pickle (`dbos/_serialization.py`
   `DefaultSerializer`, `py_pickle`); выбор сериализатора — открытый вопрос 7.
4. pg-boss уходит. Таймаут узла `human` исполняет сам workflow: `recv` с таймаутом, дедлайн — выход шага `DBOS.sleep`
   (§9). Остальные сценарии ADR-0010 (синхронизация каталога по расписанию, batch-прогоны eval, shadow/canary с лимитом
   параллелизма) переходят на очереди и расписания DBOS; они запуском не проверены (открытый вопрос 1).

### 5. HTTP-клиент: только httpx2

> Статус 2026-09-17: исключение [ADR-0030](0030-local-browser-backend.md) §11 — `pydantic_ai/mcp.py` (pydantic-ai-slim 2.43.0) импортирует `httpx`, не объявляя его, поэтому `aqven` пинит `httpx==0.28.1` напрямую, а `ALLOWED_CONSUMERS["httpx"]` = `{"aqven", "google-genai"}`. Наш код `httpx` по-прежнему не импортирует.

Правило — решение владельца от 2026-09-16 (так сделан Pydantic AI), уточнённое здесь: наш код импортирует только
`httpx2`, транзитивные encode `httpx` и `requests` допустимы.

| Правило | Как принуждается | Основание |
|---|---|---|
| Наш код импортирует только `httpx2` | ruff TID251: `httpx`, `requests`; запрет модуля покрывает подмодули (`import httpx.transports` → TID251) | запуск ruff 0.16.7 |
| Транзитивные `requests` (OTLP exporter, tiktoken, google-genai, google-auth) и encode `httpx` (google-genai) допустимы, наш код их не импортирует | проверка `uv.lock` в CI по `dependencies`, `optional-dependencies` и `dev-dependencies` каждого пакета: потребители `httpx` ⊆ {`google-genai`}, `requests` ⊆ {`google-auth`, `google-genai`, `opentelemetry-exporter-otlp-proto-http`, `tiktoken`} | запуск на `uv.lock` с extra `google` — ok; с extra `groq` — падение |
| `fastapi[standard]`, `starlette[full]` не ставим | та же проверка `uv.lock`: `httpx` у них в `[package.optional-dependencies]` | extras тянут `httpx<1.0.0` / `httpx<0.29.0`; запуск: `fastapi[standard]` → `httpx <- fastapi`, `httpx <- fastapi-cloud-cli`; `starlette[full]` → `httpx <- starlette`, код 1 |
| `pydantic_ai.retries` не используем | TID251 | модуль импортирует encode `httpx` при импорте (блок `TODO(v3)` в `pydantic_ai/retries.py`); extra `retries` требует `httpx>=0.27`; без httpx — `ImportError` (запуск 3.14.7) |
| `pydantic-ai-slim[logfire]` не ставим | состав extras в `pyproject.toml` | extra требует `logfire[httpx]` (`Requires-Dist` в METADATA pydantic-ai-slim 2.43.0) |
| SDK провайдера создаётся с `max_retries=0` и `http_client=httpx2.AsyncClient(...)` | фабрика в `aqven_llm` (§6), тест 429 → 1 HTTP-вызов | скрытые 2 ретрая SDK |
| Тесты HTTP — `httpx2.MockTransport`, `httpx2.ASGITransport` | TID251 | TestClient Starlette 1.6.0 импортирует `httpx2` (`starlette/testclient.py`) |

Проверка `uv.lock`. Зависимости через extras uv пишет в `[package.optional-dependencies]`, группы разработки — в
`[package.dev-dependencies]`; проверка только по `dependencies` пропускает `starlette[full]` (запуск). Скрипт прошёл pyright
strict и `ruff check`. На универсальном `uv lock` (uv 0.12.15): extra `google` (107 пакетов) — `uv.lock: ok`; extra `groq`
(108) — `httpx <- groq`; `fastapi[standard]` (125) и `starlette[full]` (109) — нарушения из таблицы; в трёх последних код 1:

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
`cohere` 7.1.1 — extras `mistral`, `groq`, `cohere` у pydantic-ai-slim), добавляется только правкой
`ALLOWED_CONSUMERS` и этого ADR.

### 6. Изоляция провайдеров: пакет `aqven-llm`

Правило заменяет «`ai`, `@ai-sdk/*`, `@openrouter/*` — только в `@aqven/llm`». Импорт `openai`, `anthropic`, `google.genai`,
`pydantic_ai.providers` и `pydantic_ai.models.{openai,anthropic,google}` разрешён только дистрибутиву `aqven-llm` (модуль
`aqven_llm`). Остальной код получает `Model` из фабрики `aqven_llm` (Factory + таблица провайдеров, Strategy) и берёт из
Pydantic AI только нейтральное: `Agent`, `WrapperModel`, типы сообщений. Имена Python-пакетов — в [20](../20-repo-and-tooling.md) при чистке.

Принуждение — ruff TID251 в корне workspace и вложенный `ruff.toml` в `aqven_llm` со своей таблицей `banned-api` без
провайдерских строк. Проверено запуском в раскладке uv workspace `packages/*` — строки 2–3 раздела «Проверка». Вложенная
таблица заменяет корневую, а не дополняется (видно по запуску, в доке ruff не найдено). Поэтому каждый вложенный
`ruff.toml` — в `aqven_llm` и в модуле статистики ([ADR-0029](0029-trust-and-quality-python.md) §10) — повторяет все общие запреты
(`httpx`, `requests`, `yaml`, `pydantic_graph`, `pydantic_ai.retries`, `pydantic_ai.StructuredDict`), синхронность держит фикстура в CI.

`pyproject.toml` в корне workspace:

```toml
[tool.uv.workspace]
members = ["packages/*"]

[tool.ruff]
target-version = "py314"

[tool.ruff.lint]
select = ["E", "F", "TID"]

[tool.ruff.lint.flake8-tidy-imports.banned-api]
"httpx".msg = "Only httpx2 (ADR-0025)."
"requests".msg = "Only httpx2 (ADR-0025)."
"yaml".msg = "Spec files are read by ruamel.yaml (ADR-0025)."
"pydantic_graph".msg = "The IR executor is ours (ADR-0025)."
"pydantic_ai.retries".msg = "Imports encode httpx (ADR-0025)."
"pydantic_ai.StructuredDict".msg = "Does not validate output (ADR-0027)."
"openai".msg = "Provider imports live only in aqven_llm (ADR-0025)."
"anthropic".msg = "Provider imports live only in aqven_llm (ADR-0025)."
"google.genai".msg = "Provider imports live only in aqven_llm (ADR-0025)."
"pydantic_ai.providers".msg = "Provider imports live only in aqven_llm (ADR-0025)."
"pydantic_ai.models.openai".msg = "Provider imports live only in aqven_llm (ADR-0025)."
"pydantic_ai.models.anthropic".msg = "Provider imports live only in aqven_llm (ADR-0025)."
"pydantic_ai.models.google".msg = "Provider imports live only in aqven_llm (ADR-0025)."
```

`packages/aqven-llm/src/aqven_llm/ruff.toml`:

```toml
extend = "../../../../pyproject.toml"

[lint.flake8-tidy-imports.banned-api]
"httpx".msg = "Only httpx2 (ADR-0025)."
"requests".msg = "Only httpx2 (ADR-0025)."
"yaml".msg = "Spec files are read by ruamel.yaml (ADR-0025)."
"pydantic_graph".msg = "The IR executor is ours (ADR-0025)."
"pydantic_ai.retries".msg = "Imports encode httpx (ADR-0025)."
"pydantic_ai.StructuredDict".msg = "Does not validate output (ADR-0027)."
```

Нижний слой фабрики — модель провайдера с одним вызовом на запрос, цепочку `WrapperModel` над ней собирает та же фабрика.
Канонический код — Registry `PROVIDER_MODELS` с сигнатурой `(ModelRef, httpx2.AsyncClient, ModelProfileSpec) -> Model` и
`build_model` в [ADR-0029](0029-trust-and-quality-python.md) §1; здесь фиксируются ключи реестра. Построители `openai_chat` и
`anthropic_messages` без `profile` прошли pyright strict и `ruff check` и создали `OpenAIChatModel` и `AnthropicModel` поверх
SDK с `max_retries=0` и `httpx2.AsyncClient` без предупреждений (3.14.7, `warnings.simplefilter("error")`).

```python
from enum import StrEnum
from typing import NamedTuple


class ProviderKind(StrEnum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"


class ModelRef(NamedTuple):
    provider: ProviderKind
    model_name: str
    api_key: str
```

### 7. Отклонения от спеки

| Требование спеки | Решение | Чем заменено |
|---|---|---|
| §0 «Бэкенд на VoltAgent (§20)», R23 «Бэкенд на VoltAgent: не писать рантайм с нуля» | **отклонено** | Python-движок. «Не писать рантайм с нуля» держится: надёжное исполнение — DBOS, вызовы моделей — Pydantic AI; наш — слой семантики и гарантий |
| R21 в части экспорта: воссоздание 1:1 в любом фреймворке силами LLM, готовый экспорт в VoltAgent; §0 «Экспорт для воссоздания 1:1 (§15.1)»; §15.1 (бандл, конформанс-набор против воссозданной реализации, цели) | **отменено** решением владельца от 2026-09-16 | интеграция — вызов воркфлоу по HTTP и MCP (`aqven serve`, [ADR-0026](0026-yaml-spec-and-code-refs.md), [ADR-0028](0028-studio-api-contract.md)) и импорт модуля-wheel в Python-проект |
| R21 «конструктор production-воркфлоу без lock-in», §8 проблема 87 | в отменённую часть не входит | опоры — IR как единственный машинный артефакт, модуль, собранный в обычный wheel, и вызов по HTTP/MCP |
| §13 группа тулов «Экспорт» (`project.export`, `project.import`, `project.conformance`, `project.verify_migration`); §17 фаза 1 «Экспорт: бандл … импорт с гарантией round-trip» | **отменено** вместе с экспортом: `project_import`, `project_conformance`, `project_verify_migration` и `project_export` в бандл и целевые рантаймы; `project_export` с целью `agent_workflow_spec` — открытый вопрос 19 | — ; судьба kill-критерия 13 «Round-trip» — открытый вопрос 15 |
| §14 экран 14 «Экспорт» | **отменён** | — |
| §17 «Экспорт в цели»: codegen в VoltAgent, скилл воссоздания, частичные цели | **отменено** | — |
| §18 kill-критерий 14 «Воссоздание 1:1» | **отменён** | — |
| §18 kill-критерий 15 «Экспорт в VoltAgent» | **отменён** | — |
| §20 «Бэкенд на VoltAgent» с маппингом ядра, функций, архитектурой рантайма и спайком §20.6 | **заменён** этим ADR | бинарные проверки спайка — раздел «Проверка» |
| Канонизация и хеш содержимого | **остаются** | [ADR-0022](0022-hash-as-version.md): идентичность, кассеты, релиз; `rfc8785` + `hashlib` |

### 8. Изменения в других ADR

| ADR | Что меняется | Что остаётся |
|---|---|---|
| [0008](0008-mcp-tool-naming-and-phasing.md) | имя сервера `volt` → `aqven`, схема `volt://` → `aqven://`; префикс `mcp__aqven__` — 12 символов вместо 11, проверка длины `len("mcp__aqven__") + name <= 128`; SDK `@modelcontextprotocol/sdk@1.30.0` → `mcp` 2.2.0 `MCPServer`; `RegisteredTool.enable()/disable()` в Python SDK нет (открытый вопрос 18) | имена тулов `snake_case` с префиксом группы, регулярка, фазирование как принцип |
| [0011](0011-two-schemas-and-tenancy.md) | схема `voltagent` (DDL `@voltagent/postgres` в рантайме) → системная схема DBOS `dbos`; владелец её DDL — `dbos migrate`, рантайм с `run_migrations = False`; drizzle-kit для `app` уходит (открытый вопрос 11) | два владельца схем разведены явно, нет FK через границу схем, `tenant_id` + RLS |
| [0012](0012-langfuse-as-store.md) | инструментирование — `InstrumentationSettings` Pydantic AI (формат 5) на нашем `TracerProvider`; экспорт — OTLP/HTTP protobuf на `<base>/api/public/otel/v1/traces`, Basic auth, заголовок `x-langfuse-ingestion-version: 4`. Python SDK langfuse 4.15.3 (MIT) не берём: требует `httpx<1.0` и пишет атрибуты в спан, общий для всех процессоров, — нарушение обязанности 8 ADR-0012 ([research/py-quality-layer.md](../research/py-quality-layer.md) §2.3). Logfire не берём как платформу | Langfuse OSS как хранилище трасс, датасетов и оценок; порты `TraceSink`, `EvalStore` |
| [0014](0014-ir-mutation-testing.md) | Stryker 10.0.0 (Apache-2.0) для нашего TS-кода → инструмент для Python-кода не выбран (открытый вопрос 12) | доменный IR-мутатор и гейт по мутантам IR |
| [0017](0017-files-as-source-of-truth.md) | `isomorphic-git@1.42.2` (MIT) → dulwich 1.2.15 за `GitPort` (Port/Adapter): коммит без бинарника git, CAS ссылки `refs.set_if_equals`, трейлеры, обновление индекса после коммита ([research/py-quality-layer.md](../research/py-quality-layer.md) §4). pygit2 1.20.1 (GPLv2 с linking exception) — возможная вторая реализация; GitPython 3.1.62 (BSD-3-Clause) отвергнут: нужен бинарник git, проект в режиме поддержки | файлы — истина, база — индекс, CAS по sha256, история в git |
| [0024](0024-studio-on-vite.md) | довод за `@aqven/mock-server` на `OpenAPIHono` (общие `createRoute` с бэкендом) пропадает: бэкенд на FastAPI. Источник моков — OpenAPI от FastAPI ([ADR-0028](0028-studio-api-contract.md)), инструмент — при чистке [frontend/mocks.md](../frontend/mocks.md) | SPA на Vite, адаптеры за портами, `aqven dev` раздаёт `apps/studio/dist` |

Переписываются отдельными ADR: [ADR-0003](0003-model-middleware.md), 0013, 0015 и часть 0004, 0005, 0006 —
[ADR-0029](0029-trust-and-quality-python.md); [ADR-0007](0007-single-operation-contract.md) —
[ADR-0028](0028-studio-api-contract.md); [ADR-0018](0018-typescript-authoring.md), 0023 —
[ADR-0026](0026-yaml-spec-and-code-refs.md); [ADR-0027](0027-dynamic-io-shapes.md) расширяет
[ADR-0006](0006-dynamic-allowed-sets.md).

### 9. Человек в цикле на примитивах DBOS

> Статус 2026-09-17: H6 изменён [ADR-0030](0030-local-browser-backend.md) §9 — одобрение тула внутри узла `llm` идёт без `DBOSDurability`: сегмент возвращает `DeferredToolRequests`, workflow ждёт `recv` между сегментами, следующий сегмент получает `DeferredToolResults`.

**Решение владельца от 2026-09-16** по пробе, которую владелец принял без независимой перепроверки: CPython 3.14.7,
dbos 2.31.1, pydantic-ai-slim 2.43.0, системная БД SQLite, провайдеры не вызывались; результаты —
[research/py-stack-runtime.md](../research/py-stack-runtime.md) §5.5. Узел `human` — наш исполнитель узла поверх `set_event`,
`recv` и `sleep` DBOS. Внешнего планировщика нет, pg-boss и `timeout_job_id` не нужны.

| | Решение | Механизм | Проверено запуском |
|---|---|---|---|
| H1 | Ожидание и дедлайн | перед ожиданием `DBOS.set_event("human", {address, form_schema, suspend_data, assignee, waiting_since, deadline_at, attempt, on_timeout, topic})`, `form_schema` — JSON Schema модели формы Pydantic; поисковый индекс — атрибуты workflow (`DBOS.update_workflow_attributes_async`). Ожидание — `DBOS.recv_async(topic, timeout_seconds)` на топике `"human:" + address_key + ":" + attempt`, уникальном для адреса исполнения и попытки (`address_key` — ниже); дедлайн — выход шага `DBOS.sleep`. Политики таймаута `fail`, `default`, `escalate` — таблица обработчиков (Strategy) внутри workflow | после SIGKILL таймаут сработал через 0,028 с после исходного дедлайна |
| H2 | Чего DBOS не даёт — пишем сами | (а) статус `suspended` в нашем индексе прогонов: прогон в `recv` — `PENDING`, как любой работающий, восстановленный — кратко `ENQUEUED`; (б) защита резюма: API отклоняет резюм, если узел не ждёт или не совпали попытка и топик: лишние сообщения DBOS молча буферизует, и следующий `recv` на том же топике их заберёт; (в) проверка дедлайна и payload по модели формы в API до `send` и в workflow при получении (неверный или поздний конверт workflow отбрасывает с `node_answer_ignored`): ответ, отправленный после дедлайна при остановленном воркере, при восстановлении принимается; (г) `application_version` — явная версия протокола исполнителя, растёт только при несовместимой правке исполнителя: IR — данные со снимком на прогон, DBOS версионирует код интерпретатора, а хеш исходников по умолчанию после правки кода оставил ждущие прогоны без восстановления; (д) один исполнитель DBOS на системную БД: `DBOS.launch` вызывают только `aqven dev` и `aqven serve`, остальные процессы — `DBOSClient`, потому что второй `DBOS.launch` с тем же executor id перезапустил ждущие workflow | все пять свойств наблюдались в пробе |
| H3 | Резюм | API сначала проверяет payload моделью формы Pydantic: ошибка → `problems` с `path`, `code`, `message`, прогон не тронут. Затем `DBOS.send(workflow_id, {payload, idempotency_key, sent_at}, topic)`; ответ хранится как выход шага `recv` и виден в `list_workflow_steps` | да |
| H4 | Ранний ответ | сообщение, отправленное до `recv`, буферизуется и забирается позже; тесты и тестовый режим студии заранее кладут ответы на детерминированные топики | да |
| H5 | Параллельные ожидания | дочерний workflow на каждую ветку с человеком, id `parent_run_id + "::" + address_key`; у каждого свои событие, атрибуты и топик; резюм в любом порядке | да, с SIGKILL |
| H6 | Одобрение тула внутри узла `llm` | отложенные тулы Pydantic AI под capability `DBOSDurability`: `requires_approval=True` → прогон возвращает `DeferredToolRequests` → ожидание узла `human` → `agent.run(..., deferred_tool_results=DeferredToolResults(approvals={...}))` | да, с `FunctionModel` |
| H7 | Живые обновления студии | workflow дописывает события прогона в поток DBOS `run_events` (запись exactly-once, `seq` = offset + 1); API читает поток через `DBOSClient` для `GET /api/runs/{run_id}/events` (SSE, `Last-Event-ID` = `seq`); своей outbox-таблицы нет | да, задержка замерена на SQLite |
| H8 | HITL в студии (требование владельца: разрешать и тестировать) | (1) входящие ждущих прогонов из индекса `suspended`, форма из `form_schema`, ошибки проверки резюма — у полей формы; (2) тестовый режим: запуск прогона принимает сценарные ответы человека по адресу исполнения, движок заранее кладёт их на детерминированные топики (H4); (3) fork на шаге человека: `DBOS.fork_workflow` со `start_step` = первый шаг узла `human`, повторный вопрос с другим ответом, связь — `forked_from`; (4) харнесс CI `ScriptedHuman` на pytest: одобрение, отказ, неверный payload, таймаут с `default`, таймаут с `fail`, эскалация, заранее положенный ответ, неверное сырое сообщение | механизмы (1)–(3) — да; (4) — 8 тестов прошли без сети |

**Адрес исполнения в строках DBOS** (решение владельца от 2026-09-16). API, события и наше хранилище несут адрес
структурой `{node_id, branch_key, iteration, item_index}`. DBOS нужны строки для топика и id дочернего workflow, их
выводит ровно один кодировщик: `address_key` — каноническая JSON-запись адреса по RFC 8785 (`rfc8785` 0.1.4, §1),
топик — `"human:" + address_key + ":" + attempt`, id дочернего workflow — `parent_run_id + "::" + address_key`.
`iteration: null` и `iteration: 0` дают разные ключи. Строки живут только внутри адаптера DBOS: обратно не разбираются
и наружу не отдаются. Проба строила топик и id из одного `node_id`; с ключом RFC 8785 они не запускались.

Последовательность ожидания:

1. Исполнитель узла `human` первым шагом фиксирует время, публикует событие `human` и индекс в атрибутах, пишет
   `node_suspended` в `run_events`.
2. `recv_async(topic, timeout_seconds)` записывает два шага: `DBOS.recv` (выход — конверт ответа или `None`) и
   `DBOS.sleep` (выход — абсолютный дедлайн).
3. Студия находит прогон в индексе `suspended` и рисует форму из `form_schema`; человек отправляет
   `POST /api/runs/{run_id}/resume` ([23](../23-studio-api.md) §6.4).
4. API на `DBOSClient` проверяет: событие `human` ждёт с тем же адресом и попыткой, дедлайн не прошёл, payload проходит
   модель формы. Любой отказ — без `send`. Иначе `send` с `idempotency_key` = `client_op_id` резюма, затем ожидание
   состояния `resolved` и сверка `resolved_by` с ключом: из двух одновременных резюмов с разными ключами принимается один,
   второй получает `ALREADY_RESUMED`.
5. Workflow проверяет конверт сам: конверт с `sent_at` позже `deadline_at` или с payload, не прошедшим модель формы,
   отбрасывается с событием `node_answer_ignored`, и ожидание продолжается; принятый ответ публикует `resolved` и
   `node_resumed`. Если `recv` вернул `None`, выполняется политика `on_timeout` из таблицы: `fail` завершает прогон
   ошибкой, `default` возвращает ответ по умолчанию, `escalate` публикует попытку 2 для нового назначенного на новом топике.

## Альтернативы

| Вариант | Почему отвергнут | Когда вернёмся |
|---|---|---|
| Остаться на TypeScript и VoltAgent (`@voltagent/core` 2.10.0, MIT) | Решение владельца от 2026-09-16. Код шагов проекта-хозяина исполняется в процессе модуля, модуль импортируется в Python-проекты. Мажор `ai` прибит peer-зависимостью VoltAgent к 6.x ([ADR-0002](0002-ai-sdk-v6-axis.md)); Workflows VoltAgent в статусе Preview (спека §20) | владелец меняет язык проекта-хозяина |
| Python на LangGraph (langgraph 1.2.11, MIT) | Основа — Pydantic AI: решение владельца от 2026-09-16 (раздел «Контекст»). У LangGraph своя модель графа и своё сохранение состояния («persistence layer gives agents short-term memory through checkpointers», https://docs.langchain.com/oss/python/langgraph/persistence), а граф у нас — IR с хешем. Компиляция IR в чужой граф повторяет схему ADR-0001 с тем же набором своих пробелов: слой семантики пишем сами в любом варианте | IR перестаёт быть единственным графом |
| Temporal вместо DBOS (temporalio 1.33.0, MIT) | Temporal Service — «the group of services, known as the Temporal Server, combined with Persistence and Visibility stores» (https://docs.temporal.io/temporal-service): отдельный сервис рядом с `aqven dev`. DBOS — библиотека в процессе: «There's no separate orchestration server and no infrastructure required besides Postgres» (https://docs.dbos.dev/architecture), локально на SQLite (проверено), что соответствует локальному режиму [ADR-0017](0017-files-as-source-of-truth.md) | DBOS не проходит спайк параллельных веток (открытый вопрос 1); интеграция есть в `pydantic_ai/durable_exec/temporal` |
| Kitaru вместо DBOS (kitaru 0.26.0, Apache-2.0) | Решение владельца от 2026-09-16 по пробе, результаты — [research/py-stack-runtime.md](../research/py-stack-runtime.md) §12. С 0.22.0 (2026-08-18) это платформа записи, реплея и eval, а не надёжное исполнение: «Kitaru deliberately does not run your production agent ... Durable execution of agents in production is ZenML's job» (`docs/book/concepts/under-the-hood.md` в zenml-io/kitaru). Нужен сервер FastAPI на PostgreSQL (только asyncpg, SQLite нет). Чекпоинтов шагов и восстановления нет: убитая сессия навсегда остаётся `in_progress`, завершённые шаги теряются, реплей отклоняется с 409. Реплей всегда с начала с живыми вызовами модели, fork с шага нет. Примитива ожидания, таймаута и резюма нет. `kitaru-pydantic-ai` 0.2.1 требует `pydantic-ai-slim<2.41`; подмена модели в адаптере обходит цепочку `WrapperModel`. Страница Kitaru в доке Pydantic AI описывает удалённый API v1. Единственный плюс — встроенные UI и REST API сессий eval, но не состояния прогонов | одновременно: `kitaru-pydantic-ai` поддерживает `pydantic-ai-slim>=2.43`, подмена модели перестаёт обходить обёртки и нужен отдельный сервер eval — тогда рядом с DBOS, не вместо |
| pydantic-graph как исполнитель | В builder API нет встроенного сохранения состояния, проверку типов между шагами дока не описывает; граф задаётся кодом на Python, а наш граф — IR | в builder API появятся сохранение состояния и проверка типов на границах шагов |
| DSPy как ядро (dspy 3.3.1, MIT) | Берём форму сигнатуры (решение владельца от 2026-09-16, [ADR-0026](0026-yaml-spec-and-code-refs.md)), а не фреймворк. Оптимизаторы DSPy (MIPROv2, SIMBA, BootstrapFewShot) требуют DSPy Module и к внешней системе не применимы; `dspy.GEPA` — адаптер над тем же gepa 0.1.4, его берём напрямую. `Predict.save()` сохраняет только `instructions`, `demos` и описания полей, структуры нет. Docstring как инструкция запрещён правилом «никаких комментариев» | понадобится оптимизатор, работающий только с DSPy Module |
| Monty для встроенных выражений (pydantic-monty 0.0.23, MIT) | Решение владельца от 2026-09-16: пока не нужен. Встроенные выражения — закрытая грамматика проекций ([04. IR](../04-ir-schema.md) §3.2) и `switch`, всё остальное — шаг `code` в процессе модуля | нужны пользовательские выражения вне грамматики, которым нельзя доверить исполнение в процессе |

## Последствия

**Положительные.**
- Движок и код проекта в одном процессе, один тайпчекер (pyright strict) на оба.
- Надёжное исполнение без отдельного сервиса: локально SQLite, в проде тот же API на PostgreSQL 18; fork с шага —
  вызов библиотеки, связь форка с исходным прогоном DBOS хранит сам.
- Модель и инструкции задаются на вызове (`Agent.run(model=..., instructions=...)`): обход через динамические функции
  агента из DECISIONS не нужен.
- Пакеты Pydantic AI (`pydantic-ai-slim`, `pydantic-evals`, `pydantic-graph`) выходят одной версией 2.43.0 — peer-оси
  вида `ai@6` нет.
- REST, SSE и MCP на одном порту (проверено запуском).
- Человек в цикле без планировщика и своей outbox-таблицы: ожидание, дедлайн, параллельные ожидания, fork на шаге
  человека и SSE прогона — на примитивах DBOS (§9).

**Отрицательные.**
- Доказательства на VoltAgent (`research/volt-*.md`, раздел VoltAgent в `research/00-verified-by-lead.md`) больше ничего
  не закрывают; бинарные проверки спайка повторяются на новом стеке.
- Параллельные ветки, горячая загрузка версий в DBOS и `DBOSDurability` внутри исполнителя узла с цепочкой гарантий не
  проверены — это блокеры фазы 0.
- DBOS не знает статуса «ждёт человека», молча буферизует лишние ответы и при восстановлении принимает ответ, отправленный после дедлайна: индекс
  `suspended`, защиту резюма и проверку дедлайна и payload в API и в workflow пишем сами (§9).
- dbos всегда ставит `psycopg[binary]` под LGPL-3.0-only и по умолчанию сериализует шаги pickle.
- В репозитории два набора инструментов: uv, ruff, pyright, pytest для движка; pnpm, TypeScript, Vite, ESLint для
  студии. pyright с PyPI — обёртка над Node-версией.
- Потолок `<3.15` задают `psycopg-binary` 3.3.5 без колёс cp315 (обязательная зависимость dbos) и `requires-python`
  gepa 0.1.4: CPython 3.15 (первый релиз по графику 2026-10-01) сразу взять нельзя.
- TID251 не видит транзитивные пакеты и строковые идентификаторы моделей: нужны проверка `uv.lock` и отдельный тест
  (открытый вопрос 14).
- Каждый вложенный `ruff.toml` повторяет общие запреты: поведение замены таблицы наблюдено, но не документировано.

**Обязаны делать.**
1. `requires-python = ">=3.14,<3.15"`, один `uv.lock`, пины `==`.
2. `fastapi` без extras; extras `pydantic-ai-slim` — только `openai`, `anthropic`, `google`; `retries` и `logfire` не ставим.
3. SDK провайдеров создаются только в фабрике `aqven_llm`, с `max_retries=0` и `httpx2.AsyncClient`.
4. Шаги с вызовом модели — `retries_allowed=False`.
5. Dev-конфиг DBOS на SQLite задаёт `use_listen_notify = False` до первого создания системной БД.
6. `pydantic_ai.models.ALLOW_MODEL_REQUESTS = False` в тестах и CI; реплей из кассет.
7. Значения на границе DBOS-шага JSON-совместимы; валидатор JSON-сериализуемости выходов узлов работает при компиляции.
8. Узлы с внешними эффектами получают ключи идемпотентности.
9. В CI: проверка `uv.lock` (§5), фикстуры TID251 (§6) и синхронность общих запретов во всех вложенных `ruff.toml`.
10. `application_version` в `DBOSConfig` — явная версия протокола исполнителя, повышается только при его несовместимой правке.
11. `DBOS.launch` — только в `aqven dev` и `aqven serve`, один исполнитель на системную БД; остальные процессы — `DBOSClient`.
12. Резюм проверяет ожидание, попытку и топик, дедлайн и payload до `send`; workflow отбрасывает ответ с `sent_at` позже
    `deadline_at` или с payload, не прошедшим модель формы, и пишет `node_answer_ignored`.
13. Топик и id дочернего workflow выводит один кодировщик адреса (§9, RFC 8785); наружу эти строки не выходят.
14. В CI — харнесс `ScriptedHuman` на восьми сценариях §9, H8.

### Документы, которые становятся неверными

| Документ | Раздел | Что неверно |
|---|---|---|
| [DECISIONS.md](../DECISIONS.md) | «Ось версий (пин, сентябрь 2026)», «Что берём готовым (не пишем сами)», «Наш слой», «Отклонения от исходной спеки», «Данные», «MCP-контракт», «Качество», «Экспорт: остались канонизация и хеш» | выровнено по §1–§8 2026-09-16; расхождение версии pnpm — открытый вопрос 17 |
| DECISIONS.md | «Human-in-the-loop» | выровнено по §9 2026-09-16 |
| [CLAUDE.md](../../CLAUDE.md) | вступление; «Проверять библиотеки перед использованием» | `.d.ts` и `npm view` → плюс исходники Python и PyPI JSON |
| CLAUDE.md | «Ось версий не трогать» | `ai@6.0.280`, `@voltagent/core@2.10.0`, `@openrouter/ai-sdk-provider@2.10.0` → ось §1; `typescript@6.0.3` — только студия |
| CLAUDE.md | «Строгий TypeScript» | для движка — pyright strict, `typing.NewType`, `typing.assert_never`; TS-правила — для `apps/studio` |
| CLAUDE.md | «Импорты `ai`, `@ai-sdk/*`, `@openrouter/*` — только в `@aqven/llm`» | → правило `aqven-llm` и TID251 (§6) |
| [adr/README.md](README.md) | строки 0001, 0002, 0010 | пометка «⚠️ заменено 0025»; у 0008, 0011, 0012, 0014, 0017, 0024 — «⚠️ частично изменено 0025» |
| [02. Архитектура](../02-architecture.md) | «Решения»; §1 карта (control plane на Hono, `@aqven/runtime-volt`, `@aqven/llm` на `ai@6.0.280`, isomorphic-git, drizzle, pg-boss); §2 процессы (`ROLE=worker`, pg-boss, `WorkflowRegistry`); §3 правило зависимостей и порты; §4 поток прогона; §6 «Строим или берём»; §7.1–§7.4, §7.7; открытые вопросы 1–4, 7–9 | всё на VoltAgent, `ai@6`, Hono, pg-boss |
| [10. Рантайм](../10-runtime.md) | весь документ | сборщик цепочек VoltAgent, `WorkflowRegistry`, `timeTravel`, `wrapLanguageModel`, pg-boss → исполнитель §3, DBOS §4 |
| [11. Провайдеры](../11-providers.md) | «Решения»; §1 целиком; §2.1–§2.2; §8; §9 | ось `ai@6`, реестр AI SDK, `wrapLanguageModel`, учёт стоимости через `providerMetadata`, батчи на pg-boss и `@voltagent/evals` |
| [12. Наблюдаемость](../12-observability.md) | «Решения»; §1.1–§1.3; §5; §7; §8.1, §8.4; §9 | `VoltAgentObservability`, `@langfuse/*` 5.11.1, `timeTravel`, метрики pg-boss → §8 (ADR-0012) и `fork_workflow` |
| [14. MCP-контракт](../14-mcp-contract.md) | «Решения» (`@modelcontextprotocol/sdk` 1.30.0); §2 имя сервера `volt`, URI `volt://`; §2.7 тулы группы `export`; §5.4 механизм `RegisteredTool.enable()/disable()`; §10.4 сверка через `project_conformance`; §2.5 входы и выходы `run_list`, `run_get_node`, `run_resume` (`node_id`, `idempotency_key?`, `resumeSchema`) и «таймаут исполняется планировщиком» | → `aqven`, `mcp` 2.2.0 (§8, открытый вопрос 18); `project_import`, `project_conformance`, `project_verify_migration` отменены (§7); `project_export` с целью `agent_workflow_spec` — открытый вопрос 19; §2.5 → §9 и сопоставление [23](../23-studio-api.md) §13.4 |
| [files-first/contract.md](../files-first/contract.md) | «Решения» (строка `app.human_tasks`: «дедлайн исполняет pg-boss»); §3 «Таймаут — не операция» (`sendAfter` и сверяющий cron), «Идемпотентность» (`idempotency_key`) | → срок исполняет сам workflow (§9), резюм — [23](../23-studio-api.md) §6.8 с `client_op_id` |
| [15. Studio: фронтенд](../15-studio-frontend.md), [frontend/run.md](../frontend/run.md) | 15 §10.3 (`suspendSchema`/`resumeSchema`, таймаут — pg-boss `sendAfter` и сверяющий cron); run.md «Очередь человеческих задач» (политики `default_value`, `continue_without`, «ни одной подходящей операции») | → поведение §9, H8: входящие из индекса `suspended`, форма из `form_schema`, ошибки резюма у полей, тестовый режим со сценарными ответами, fork на шаге человека; политики `fail`, `default`, `escalate` |
| [16. Модель данных](../16-data-model.md) | «Решения»; §1 (три схемы, `voltagent`); §2.9 lineage; §2.11 `human_tasks` (pg-boss, `timeout_job_id`); §6 «Сосуществование с таблицами @voltagent/postgres»; §7 (роли `GRANT USAGE ON SCHEMA app, voltagent`, фоновый воркер pg-boss); §8 (пакет `@aqven/db`, drizzle); §9 (миграции drizzle-kit, сиды на TypeScript, testcontainers) | → схема `dbos`, ORM — открытый вопрос 11; lineage — `forked_from` DBOS и открытый вопрос 8; `timeout_job_id` не нужен — таймаут исполняет workflow (§9), нужна ли таблица `human_tasks` вместо атрибутов DBOS — открытый вопрос 21 |
| [17. Фоновые задачи](../17-jobs-and-scheduling.md) | весь документ | pg-boss, `sendAfter`, `WorkflowRegistry`; довод «durable execution уже даёт VoltAgent» переворачивается; §1 `human.deadline`, `human.reconcile` и §6 таймауты человеческих задач → дедлайн — шаг `DBOS.sleep` внутри `recv`, отложенный job и сверяющий cron не нужны (§9) |
| [20. Репозиторий](../20-repo-and-tooling.md) | «Решения»; §1 дерево (кроме студии); §2 конфиги; §3 правило зависимостей (Biome `noRestrictedImports`); §4 строгость TypeScript; §6 тесты; §7 Stryker; §8 Biome; §9 CI; §10 релизы | → uv workspace, ruff TID251, pyright strict, pytest; TS-часть — только `apps/studio` |
| [21. Дорожная карта](../21-roadmap.md) | «Решения»; F0-1, F0-9…F0-13, F0-16, F0-19, F0-20; §3 бинарные проверки спайка; F1-1, F1-2, F1-5, F2-1, F2-7, F3-3; §5.3 K14, K15; §6.3 граф зависимостей; §7.2 риски | работы на VoltAgent, `ai@6`, pg-boss; K14, K15 отменены |
| [22. Глоссарий](../22-glossary.md) | «Чекпоинт», «Форк прогона», «time travel», «replay»; §2.5 «Пакеты монорепо»; §2.6 две схемы; §4 «ERESOLVE», «SDK» | термины VoltAgent и `ai@6` |
| [23. API локальной студии](../23-studio-api.md) | §6.4, §6.6–§6.10, §11.4; открытые вопросы 1–2 | выровнено по §9 2026-09-16; §13.2 и ОВ 13 выровнены по §7 и открытому вопросу 19 |
| [playground/](../playground/README.md) | README (сервер Hono 4.13.7); shell.md (`node:http`, порт 3141 VoltAgent, better-sqlite3, drizzle); build-order.md §4 (пакеты, drizzle, chokidar); data.md §2 (фиктивный провайдер на zod) | → `aqven dev` на FastAPI + uvicorn + watchfiles, фиктивная модель `FunctionModel`/`TestModel`; части про синтез `*.flow.ts` отменяет ADR-0026 |
| [98. Аудит версий](../98-version-audit.md) | «Согласованность», «Проверка ключевых инвариантов» (`ai@7`, OpenRouter 2.10.0); «Требует решения» п. 1–3, 5 для движка | ось `ai@6` как выбор. «Источники», пометки строк движка в «Таблице», раздел «Движок на Python: PyPI» и лицензии psycopg и dulwich выровнены по §1 2026-09-16 |
| [01](../01-product-and-requirements.md), [18](../18-export-and-conformance.md), [97](../97-coverage-matrix.md), [99](../99-open-questions.md), корневой README.md | 01: «Решения», §1 разделение труда с VoltAgent, R21–R23; 18: сужается до канонизации, хеша и сборки; 97: R23, K14, K15; 99: строки «Закрыто законом» про VoltAgent, B-09…B-14 | по §3, §7 |

## Проверка

| # | Что проверяем | Как | Статус на 2026-09-16 |
|---|---|---|---|
| 1 | Ось разрешается и импортируется на 3.14 | `uv pip compile --python-version 3.14 --python-platform aarch64-apple-darwin` → 95 пакетов; установка в venv CPython 3.14.7; импорт `pydantic_ai`, `pydantic_evals`, `dbos`, `httpx2`, `fastapi.sse`, `uvicorn`, `mcp.server`, `liquid`, `gepa`, `scipy.stats`, `statsmodels.api`, `ruamel.yaml`, `rfc8785`, `dulwich.repo`, `watchfiles`, `tenacity`, `genai_prices`, `opentelemetry.sdk.trace`, `opentelemetry.exporter.otlp.proto.http.trace_exporter`, `pydantic_ai.models.openai`, `pydantic_ai.models.anthropic`, `pydantic_ai.durable_exec.dbos` (22 модуля), `import httpx` → `ImportError`; на 3.15 — unsatisfiable | выполнено (проба); в CI — установка из `uv.lock` и smoke-импорт |
| 2 | ruff запрещает `httpx` и лишние импорты | фикстуры: `import httpx`, `import httpx.transports`, `import requests`, `import yaml`, `from pydantic_graph import ...`, `from pydantic_ai.retries import ...`, `from pydantic_ai import StructuredDict`, `pydantic_ai.StructuredDict(...)` → TID251 в любом пакете; `import httpx2`, `from pydantic_ai import Agent`, `from pydantic_ai.models.wrapper import WrapperModel` → без замечаний | выполнено на ruff 0.16.7; в CI — завести |
| 3 | Изоляция провайдеров | импорт `pydantic_ai.models.anthropic`, `google.genai` в `aqven_engine` → TID251; `anthropic`, `pydantic_ai.providers.anthropic`, `pydantic_ai.models.anthropic`, `pydantic_ai.models.google` в `aqven_llm` → без замечаний | выполнено в раскладке `packages/*` |
| 4 | Транзитивный `httpx` только от google-genai | скрипт §5 на универсальном `uv lock`: с extra `google` → `ok`; с extra `groq` → `httpx <- groq`; с `fastapi[standard]` → `httpx <- fastapi`, `httpx <- fastapi-cloud-cli`; с `starlette[full]` → `httpx <- starlette`; в трёх последних код 1 | выполнено на uv 0.12.15 (все четыре варианта); в CI — завести |
| 5 | DBOS: восстановление и fork на SQLite | сценарий [research/py-stack-runtime.md](../research/py-stack-runtime.md) §5.1: процесс убит внутри шага 2, `DBOS.launch()` восстановил прогон без повтора шага 1; `fork_workflow(id, 2)` повторяет только шаг 2, у форка `forked_from` = исходный прогон; исполнитель в форме §3 даёт шаги `(1, execute_node)`, `(2, execute_node)` | выполнено на 3.14.7; повторить на исполнителе IR и на PostgreSQL 18 в спайке |
| 6 | Ноль вызовов провайдеров в CI | `ALLOW_MODEL_REQUESTS = False` в `conftest.py`: живая `OpenAIChatModel` → `RuntimeError`, реплей из кассеты — 0 HTTP-вызовов; SDK с `max_retries=0`: ответ 429 через `httpx2.MockTransport` → 1 HTTP-вызов | выполнено на 3.12.4; повторить в тестах `aqven_llm` на 3.14.7 (открытый вопрос 20) |
| 7 | Бинарные проверки спайка вместо спеки §20.6 | (1) правка файлов → новый хеш IR исполняется без перезапуска процесса, прогон под старым хешем восстанавливается; (2) восстановление после убийства процесса на исполнителе IR; (3) fork с шага k на кассетах даёт побайтово равные выходы узлов; (4) `Agent.run(model=..., instructions=...)` применяет эффективную конфигурацию; (5) спаны с атрибутами `aqven.*` доходят до Langfuse по OTLP; (6) параллельные ветки и ожидание человека переживают падение процесса | спайк фазы 0; п. 5 проверен только на локальном сервере-приёмнике, не на Langfuse; п. 6 в части ожидания человека, в том числе параллельных ожиданий дочерними workflow, выполнен в пробе §9 |
| 8 | Человек в цикле | харнесс `ScriptedHuman` (§9, H8): одобрение, отказ, неверный payload, таймаут с `default`, таймаут с `fail`, эскалация, заранее положенный ответ, неверное сырое сообщение; SIGKILL во время ожидания — дедлайн сохраняется | 8 тестов прошли вне репозитория на 3.14.7 и SQLite без сети, SIGKILL — отдельная проба; в CI — завести на исполнителе IR |

## Пересмотр

- Pydantic AI 3.x: снятие `httpx.AsyncClient` (уже deprecated), блок `TODO(v3)` в `pydantic_ai/retries.py`, удаление `DBOSAgent`,
  изменения `WrapperModel`, `InstrumentationSettings`, `DBOSDurability` → пересмотреть §3, §5, §6 и цепочку ADR-0029.
- CPython 3.15: у `psycopg-binary` появились колёса cp315, а `gepa` снял `<3.15` → поднять `requires-python` отдельным изменением
  с проверкой 1.
- DBOS: лицензия перестаёт быть MIT, нет релизов 6 месяцев, несовместимо меняются восстановление, `fork_workflow` или
  сериализация; спайк параллельных веток проваливается → Temporal через `pydantic_ai/durable_exec/temporal`.
- DBOS даёт API статуса ожидания, защиты повторного резюма или уборки неразобранных сообщений → сократить свой слой §9.
- google-genai переходит на `httpx2` → из `ALLOWED_CONSUMERS` убирается исключение; нужен провайдер, SDK которого тянет encode
  `httpx` → правка §5 и этого ADR.
- openapi-typescript поддерживает TypeScript 6 (issue #2723) или `itemSchema` (#2683) → снять обходы в ADR-0028.
- Владелец возвращает экспорт → новый ADR; IR остаётся единственным машинным артефактом.
- ruff документирует или меняет слияние вложенных таблиц `banned-api` → пересобрать конфиги §6.

## Открытые вопросы

1. **Параллельные ветки внутри DBOS-workflow** (`parallel` с `quorum(k)`, `map` с конкурентностью). Есть
   `DBOS.start_workflow_async` и `Queue` ([research/py-stack-runtime.md](../research/py-stack-runtime.md) §5.3); номера шагов и
   детерминизм восстановления при конкурентных шагах не проверены. Что сделать: спайк на SQLite и PostgreSQL 18 — N параллельных
   шагов, убийство процесса посередине, восстановление, порядок в `list_workflow_steps`, `fork_workflow` с шага внутри
   параллельной секции; форму записать в [10](../10-runtime.md).
   *Статус 2026-09-17:* закрыт [ADR-0030](0030-local-browser-backend.md) §10 — ветки только дочерними workflow, `asyncio.gather` над шагами запрещён; PostgreSQL не запускался (прода нет).
2. **Ожидание человека и дедлайны.** Закрыт решением владельца от 2026-09-16 (§9): ожидание в `recv` с таймаутом переживает
   SIGKILL, дедлайн сохраняется, ответ, отправленный до дедлайна при остановленном воркере, после рестарта принимается, payload проверяется моделью формы до `send` и повторно в workflow при получении. Дедлайн в
   днях не проверялся: механизм тот же — абсолютное время в выходе шага `DBOS.sleep`. Остаток — вопросы 21–25 (вопрос 26 закрыт §9).
3. **Ретраи шагов DBOS и исключения цепочки гарантий.** У `DBOS.step` `retries_allowed=False` по умолчанию и предикат
   `should_retry`; у `DBOSDurability` — `model_step_config` типа `StepConfig` (`durable_exec/dbos/_utils.py`) с `retries_allowed`,
   `max_attempts`. Как записываются `TruncatedOutput`, `RefusedOutput`, `UsageLimitExceeded`, брошенные внутри шага, и повторяет
   ли восстановление шаг, завершившийся исключением, — не проверено. Что сделать: тест со шагом, бросающим каждое исключение, при
   выключенных ретраях, при исключающем их `should_retry` и с `DBOSDurability`; сверить `list_workflow_steps` и счётчик вызовов модели.
4. **Узел `llm`: один `DBOS.step` или `agent.run()` с `DBOSDurability`.** Вариант А — узел один `DBOS.step`, цепочка
   [ADR-0029](0029-trust-and-quality-python.md) §1 внутри шага; при падении посреди повторов выхода шаг повторяет все вызовы модели.
   Вариант Б — `Agent(..., capabilities=[DBOSDurability(...)])` и `agent.run()` внутри `run_flow`, запросы модели — DBOS-шаги.
   `DBOSDurability` запускалась только в пробе одобрения тула (§9, H6): `agent.run()` на уровне нашего workflow с
   `FunctionModel` и без цепочки гарантий; запросы модели стали шагами `<имя агента>__model.request`, после SIGKILL первый
   запрос взят из шага, а не вызван снова. `DBOSModel` — обёртка устаревшего `DBOSAgent`, `DBOSDurability` её не
   использует (`durable_exec/dbos/_durability.py` её не импортирует). По исходнику внутри шага узла capability шагов не
   создаёт (`in_durable_context` требует `DBOS.step_id is None`), а `DBOS.recv` внутри шага бросает `DBOSException`
   («recv() must be called from within a workflow», `dbos/_dbos.py`): ожидание одобрения тула (§9, H6) в варианте А
   невозможно. Не проверены запуском вызов `DBOSDurability` внутри шага узла (шаг внутри шага), нумерация шагов родителя и место DBOS-шагов запроса модели (`<имя агента>__model.request`)
   относительно цепочки OutcomeGate → Redaction → Cassette → Limiter → BackoffModel → модель провайдера. Что сделать:
   спайк обоих вариантов в `run_flow` на SQLite с падением процесса, подсчёт вызовов модели, `list_workflow_steps` и
   `fork_workflow` родителя; итог — в [10](../10-runtime.md) и ADR-0029 §1.
   *Статус 2026-09-17:* закрыт [ADR-0030](0030-local-browser-backend.md) §9 — вариант А в форме сегментных шагов; одобрение в варианте А работает; шаги `DBOSDurability` в потоке называются `<имя агента>__model.request_stream`.
5. **Ретраи google-genai 2.23.0 по умолчанию.** `HttpRetryOptions.attempts` — «If not specified, default to 5»
   (`google/genai/types.py` `HttpRetryOptions`); поведение при `retry_options=None` не проверено, это может быть второй скрытый
   слой ретраев. Что сделать: проба вне репозитория с encode `httpx.MockTransport` — 429 на `GoogleModel` с клиентом по умолчанию
   и с `HttpRetryOptions(attempts=1)`, подсчёт HTTP-вызовов; конфиг клиента — в фабрику `aqven_llm`.
6. **Горячая загрузка версий и прогоны под старым хешем IR.** `application_version` DBOS по умолчанию — хеш исходников функций
   workflow (`DBOS.compute_app_version`), задаётся ключом `application_version` в `DBOSConfig` или `DBOS__APPVERSION`. Политика
   решена (§9, H2): явная версия протокола исполнителя; с хешем по умолчанию правка кода оставила ждущие прогоны без
   восстановления (проверено). Открыто: откуда брать IR старого хеша и как переносить ждущие прогоны при повышении версии
   (`fork_workflow(application_version=...)` есть, не запускался). Что сделать: спайк в `aqven dev` — прогон под хешем A,
   правка файлов (хеш B), убийство процесса, восстановление; затем перенос ждущего прогона на новую версию.
7. **Сериализатор DBOS.** По умолчанию pickle (`DefaultSerializer`, `py_pickle`), есть `DBOSPortableJSONSerializer`
   (`portable_json`, `dbos/_serialization.py`) и ключ `serializer` в `DBOSConfig`; pickle привязывает чекпоинты к классам Python
   и нечитаем вне Python. Что сделать: прогнать исполнитель §3 с `portable_json` на наших значениях (даты, `Decimal` стоимости,
   медиа-ссылки), сравнить с pickle, закрепить выбор в [10](../10-runtime.md).
8. **Fork: правка входа и шаг форка.** Связь форка с исходным прогоном DBOS 2.31.1 хранит сам: `WorkflowStatus.forked_from`,
   фильтр `list_workflows(forked_from=...)` (проверено, py-stack-runtime §5.1). Открыто: у `fork_workflow` нет параметра нового
   входа, в `WorkflowStatus` нет номера шага, с которого сделан fork, смысл параметра `replacement_children` не изучался.
   Fork на шаге человека начинается с первого шага узла `human`, а `list_workflow_steps` отдаёт имя функции, а не адрес
   (§3): нужна записанная в исполнителе таблица «адрес → `function_id` первого шага узла». Что сделать: спайк fork с
   изменённым входом и с шага узла внутри `parallel` и `map`; решить, хватает ли `forked_from` или нужна своя таблица
   lineage со шагом и правками в [16](../16-data-model.md) §2.9.
   *Статус 2026-09-17:* смысл `replacement_children` изучен [ADR-0030](0030-local-browser-backend.md) §10, п. 6 (fork одной ветки); fork с шага внутри `parallel` и `map` проверен пробой; правка входа и таблица lineage — открыты.
9. **PostgreSQL 18 в проде.** Одна БД со схемами `app` и `dbos`, рантайм с `run_migrations = False`, `dbos migrate` при деплое,
   `use_listen_notify` по умолчанию `True` — не запускалось; состав и DDL системных таблиц не читали. Что сделать: спайк на
   PostgreSQL 18 — роль без DDL, `dbos migrate`, запуск с проверкой схемы, список таблиц `dbos`; переписать [16](../16-data-model.md) §6.
   *Статус 2026-09-17:* снят [ADR-0030](0030-local-browser-backend.md) §1 — прода на PostgreSQL нет.
10. **Лицензия psycopg 3.3.5 (LGPL-3.0-only).** Обязательная зависимость dbos 2.31.1, ставится и при SQLite. Юридическая оценка
    распространения модуля-wheel с такой зависимостью (psycopg не вендорится) не проводилась. Что сделать: оценка владельцем или
    юристом, итог — в [98](../98-version-audit.md).
11. **ORM и миграции схемы `app`** вместо drizzle-kit. Кандидаты sqlalchemy 2.0.54 (MIT, уже приходит от dbos) и alembic 1.20.0
    (MIT) против RLS-политик, партиций и ролей из [16](../16-data-model.md) не проверены. Что сделать: спайк миграции одной таблицы
    с политикой RLS и партициями, затем ADR о доступе к данным.
    *Статус 2026-09-17:* RLS, партиции и роли сняты [ADR-0030](0030-local-browser-backend.md) §1; остаётся выбор миграций таблиц `aqven.sqlite` и `studio.sqlite`.
12. **Мутационное тестирование Python-кода** (часть ADR-0014). Кандидаты mutmut 3.8.0 (BSD-3-Clause, 2026-09-12) и cosmic-ray
    8.7.0 (MIT, 2026-08-09) на 3.14 не запускались. Что сделать: прогнать оба на пакете компилятора на CPython 3.14.7, сравнить
    время и совместимость с pytest 9.1.1, записать выбор в [20](../20-repo-and-tooling.md).
13. **openapi-typescript 7.13.0 и TypeScript 6.0.3.** Peer `typescript@^5.x`: npm падает с ERESOLVE, pnpm 10.33.0 предупреждает,
    генерация и `tsc --noEmit --strict` на 6.0.3 проходят; SSE `itemSchema` превращается в `unknown` (py-stack-runtime §6.3, §8;
    upstream #2723, #2774, #2818, #2683). Что сделать: закрепить в CI генерацию `schema.d.ts` и `tsc --noEmit` на ней, чтобы
    поломка была видна; пересмотреть при релизе с поддержкой TS 6.
14. **Обход изоляции строковым идентификатором модели.** `Agent("openai:gpt-4o")` при заданном `OPENAI_API_KEY` создаёт
    `pydantic_ai.models.openai.OpenAIResponsesModel` без импорта провайдера в нашем коде (запуск 3.14.7): TID251 этого не видит,
    а клиент SDK получает ретраи по умолчанию вместо `max_retries=0`. Что сделать: выбрать между архитектурным тестом «каждый
    `Agent` движка получает `Model` из фабрики `aqven_llm`» и своим lint-правилом; проверить, что строковый идентификатор ловится.
15. **Kill-критерий 13 «Round-trip» после отмены бандла.** Формулировка «экспорт → импорт → экспорт даёт идентичный бандл»
    опирается на бандл, а бандл-tar после отмены экспорта не нужен. Что сделать: решение владельца — переформулировать как
    детерминизм сборки (две `aqven build` одного дерева → один хеш IR и одинаковый wheel, побайтовая одинаковость wheel не
    проверялась) или отменить.
16. **DBOS Conductor.** Дока DBOS: «When operating DBOS durable workflows in production, we strongly recommend connecting your
    application to Conductor», «Conductor is the control plane for your durable workflows» (https://docs.dbos.dev/architecture).
    В `DBOSConfig` 2.31.1 есть ключи `conductor_key` и `conductor_url` («Only set if you're self-hosting Conductor»). Лицензия,
    условия self-hosting и необходимость для прода не проверялись. Что сделать: прочитать условия Conductor, решить, нужен ли он
    режиму `hosted`, и чем заменяются его функции (наблюдаемость очередей, политики хранения), если не берём.
    *Статус 2026-09-17:* снят [ADR-0030](0030-local-browser-backend.md) §1 — прода нет.
17. **Версия pnpm.** DECISIONS: «pnpm 12 workspaces»; корневой `package.json`: `"packageManager": "pnpm@10.33.0"`, на нём
    проверена генерация openapi-typescript. Что сделать: сверить с `npm view pnpm`, выбрать версию и выровнять DECISIONS и
    [20](../20-repo-and-tooling.md).
18. **Фазирование MCP-тулов в `mcp` 2.2.0.** Вместо `RegisteredTool.enable()/disable()` есть `MCPServer.add_tool`,
    `MCPServer.remove_tool(name)` и `ServerSession.send_tool_list_changed()`; работает ли это на сессию, а не на весь сервер, — не
    проверено. Что сделать: спайк с двумя клиентами `mcp.Client` на streamable HTTP — открыть фазу одному и проверить
    `list_tools` у обоих; переписать механизм в [14](../14-mcp-contract.md) §5.4.
19. **`project_export` с целью `agent_workflow_spec` после отмены экспорта.** Остальные тулы группы `export` отменены (§7).
    Этот тул восстанавливает документ скилла из IR ([14](../14-mcp-contract.md) §10.4) и к воссозданию в чужом фреймворке не
    относится, но его сверка «импорт → экспорт → импорт» опиралась на отменённый `project_conformance`. Что сделать: вопрос
    владельцу — нужен ли `project_export` в `agent_workflow_spec` и чем тогда проверять обратимость; итог — в
    [14](../14-mcp-contract.md) §2.7, §10.4 и [23](../23-studio-api.md) §13.2.
20. **Пробы на CPython 3.12.4.** Повтор выхода, бюджеты, `WrapperModel` и цепочка гарантий, `ALLOW_MODEL_REQUESTS`,
    `InstrumentationSettings`, pydantic-evals и перехват запросов провайдеров проверены на 3.12.4, а движок фиксирует CPython 3.14
    (§1). Что сделать: повторить эти пробы на CPython 3.14.7 в спайке фазы 0 (тесты `aqven_llm` и исполнителя), расхождения
    записать в research/py-stack-runtime.md и research/py-quality-layer.md.
21. **Индекс `suspended`: атрибуты workflow DBOS или своя таблица.** Атрибуты дают ждущие прогоны одним запросом
    `list_workflows`, но фильтр `list_workflows(attributes=...)` на SQLite бросает исключение, а на Postgres (JSONB `@>` с
    GIN) не запускался; каждое обновление заменяет все атрибуты; fork копирует атрибуты исходного прогона устаревшими;
    сортировки по `deadline_at` в SQL нет. Что сделать: на PostgreSQL 18 прогнать фильтр и сортировку на тысячах ждущих
    прогонов, сравнить со своей таблицей в `app`, итог — в [16](../16-data-model.md) §2.11.
    *Статус 2026-09-17:* часть про PostgreSQL снята [ADR-0030](0030-local-browser-backend.md) §1; реализация взяла свою таблицу `aqven_human_waits` в `.aqven/aqven.sqlite`.
22. **Неразобранные сообщения.** Поздние и лишние ответы остаются в таблице уведомлений DBOS с `consumed = 0` навсегда; API
    очистки или политики хранения не найдено. Что сделать: прочитать DDL системных таблиц DBOS (вместе с вопросом 9), решить
    уборку и записать ретеншн в [16](../16-data-model.md) §3.
23. **Задержка и стоимость опроса на PostgreSQL.** На SQLite всё опрашивается с интервалом
    `notification_listener_polling_interval_sec` (по умолчанию 1,0 с) или `polling_interval_sec` у `read_stream`, каждое
    SSE-соединение опрашивает само. Задержка с `use_listen_notify = True` и стоимость опроса `list_workflows` для
    `GET /api/runs/events` на тысячах прогонов не замерялись. Что сделать: замер на PostgreSQL 18 в спайке вопроса 9.
    *Статус 2026-09-17:* снят [ADR-0030](0030-local-browser-backend.md) §1; на SQLite чтение `run_events` через `DBOSClient` с интервалом 0,05 с — медиана 15 мс, максимум 51 мс (ADR-0030 §9).
24. **Сериализация сообщений и событий для писателя не на Python.** сообщения `send`, события `set_event` и выходы шагов
    DBOS по умолчанию пишет в `py_pickle`; писателю вне Python нужен `serialization_type=portable_json`, это не запускалось. Что сделать: решить вместе
    с вопросом 7; если выбран `portable_json` — проба `send` и чтения события из клиента не на Python.
25. **`send_to_forks=True`.** Доставка одного ответа исходному прогону и всем его форкам (для тестовых прогонов студии)
    прочитана в исходнике DBOS (`_sys_db.py`, `_send_bulk_txn`), не запускалась. Что сделать: проба на SQLite — прогон,
    два форка на шаге человека, один `send` с `send_to_forks=True`, проверить, что ответ забрали все три.
26. **Адрес исполнения → id дочернего workflow и топик.** Закрыт решением владельца от 2026-09-16 (§9, «Адрес исполнения
    в строках DBOS»): один кодировщик, `address_key` — JSON адреса по RFC 8785, строки только внутри адаптера DBOS, в API,
    событиях и хранилище адрес остаётся структурой (DECISIONS «API студии»). Перевод адреса в `start_step` форка перенесён
    в вопрос 8; запуск топика и id с `address_key` — в спайке вопроса 1 на `parallel` и `map`.
