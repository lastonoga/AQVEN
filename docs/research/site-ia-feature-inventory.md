# Инвентаризация реальной поверхности продукта для новой IA `apps/site`

> Источники — `docs/superpowers/specs/2026-09-21-aqven-docs-ia-design.md`, разделы 2 и 4.
> Один сквозной проход по `packages/aqven/`, `packages/aqven-llm/`, `apps/studio/` и `docs/adr/`,
> сделан 2026-09-21 для проектирования новой информационной архитектуры документации.
> Каждая строка — то, что реально в коде, с точностью до файла, а не design-intent из `docs/*.md`
> superseded-статуса. Обновлять при следующем большом проходе по IA, не на каждый PR.

## Метод

Большинство `docs/*.md` (03, 04–07, 09–11, 14 в части числа тулов, 15, 20, 31, 32) описывают
превзойдённый TypeScript/VoltAgent-дизайн или design-intent, ещё не реализованный. Живой дизайн —
ADR-0025…ADR-0030 плюс то, что реально реализовано в `packages/aqven/src/aqven/`. Ниже — код первым
источником, doc-статус отмечен отдельно там, где расходится.

## 1. Виды узлов (10, закрытый список)

| Вид | Что делает | Источник |
|---|---|---|
| `llm` | Вызов модели: ссылка на `agent` (модель+тулы) и `inference` (in/out/промт) | `packages/aqven/src/aqven/spec/nodes.py:42-45`, IR: `ir/nodes.py:46-51` |
| `code` | Чистая Python-функция по ссылке `module:function` | `spec/nodes.py:48-52` |
| `tool` | Вызов тула — локальный код или внешний MCP-сервер | `spec/nodes.py:54-57` |
| `human` | Пауза на решение человека (форма, assignee, дедлайн, on_timeout) | `spec/nodes.py:59-65` |
| `parallel` | Именованные ветки над одним входом, свод по политике | `spec/nodes.py:67-71` |
| `map` | Итерация тела-узла по коллекции, конкурентность + `on_item_error` | `spec/nodes.py:73-79` |
| `switch` | Маршрут по одной именованной ветке по дискриминатору | `spec/nodes.py:81-85` |
| `loop` | Ограниченная итерация (`max_iter` ≤ 50), политики `stop`/`select` | `spec/nodes.py:87-94` |
| `call` | Вызов другого флоу как подфлоу | `spec/nodes.py:96-99` |
| `narrow` | Сужение непрозрачного `Dynamic` до статического типа реестра | `spec/nodes.py:101-104`; дизайн `docs/adr/0027-dynamic-io-shapes.md:263-291` |

Отклонённые виды (frozenset, загрузчик отказывает): `seq`, `race`, `gate`, `try`, `const` —
`spec/nodes.py:120`. Это словарь старого дизайна (`docs/03-core-language.md`), в коде их нет.

Компонентный слой (`judge`, `judge_panel`, `verify_fix`, `cascade`, `bounded_agent`,
`docs/03-core-language.md:439-449`) — в `packages/aqven/` не найден нигде, не реализован.

Реальный пример всех 10 видов в одном проекте: `packages/aqven/src/aqven/templates/showcase/__package__/flows/support_case/`
(триаж → маршрутизация → human-approval → параллельные черновики → panel/vote → сужение типа).

Реальная модель файлов расходится с примером ADR-0026 §3: `llm`-узел не хранит `model_role`/`prompt`/`in`/`out`
прямо, а ссылается на `Agent` (`spec/agent.py:87-99`) и `Inference` (`spec/inference.py:73-79`) по id.

## 2. MCP-тулы AQVEN (22, сервер)

Регистрация — `server/mcp/catalog.py:108-109`, сборка каталога — `server/mcp/endpoint.py:56-70`.
Транспорт — streamable-HTTP MCP на `/mcp` того же FastAPI-процесса, bearer-token guard
(`server/mcp/endpoint.py:85-94,113-118`).

| Тул | Файл |
|---|---|
| `aqven_check` | `server/mcp/check_tools.py:126` |
| `pyright_check` | `server/mcp/pyright_tool.py:179` |
| `pytest_run` | `server/mcp/pytest_tool.py:182` |
| `prompt_preview` | `server/mcp/preview_tools.py:50` |
| `flow_patch` | `server/mcp/patch_tools.py:38` |
| `flow_list` | `server/mcp/project_tools.py:330` |
| `flow_get` | `server/mcp/project_tools.py:339` |
| `catalog_list` | `server/mcp/project_tools.py:352` |
| `catalog_get` | `server/mcp/project_tools.py:364` |
| `dataset_batch_start` | `server/mcp/eval_tools.py:52` |
| `dataset_batch_get` | `server/mcp/eval_tools.py:65` |
| `eval_run_start` | `server/mcp/eval_tools.py:74` |
| `eval_run_get` | `server/mcp/eval_tools.py:87` |
| `eval_gate` | `server/mcp/eval_tools.py:96` |
| `run_start` | `server/mcp/run_tools.py:121` |
| `run_get` | `server/mcp/run_tools.py:136` |
| `run_list` | `server/mcp/run_tools.py:145` |
| `run_get_node` | `server/mcp/run_tools.py:159` |
| `run_events` | `server/mcp/run_tools.py:171` |
| `run_resume` | `server/mcp/run_tools.py:183` |
| `run_fork` | `server/mcp/run_tools.py:196` |
| `run_cancel` | `server/mcp/run_tools.py:209` |

`docs/14-mcp-contract.md` (draft) проектирует 59–78/79 тулов в 14 группах — только часть имён и
сигнатур совпадает с реальными. Реальные REST-маршруты без MCP-тула помечены в коде константой
`MCP_PENDING` (`server/routes/evals.py:45`) — это подтверждено самим кодом, не инференс.

## 3. CLI-команды (`aqven ...`)

Реестр — `cli.py:318-338`.

| Команда | Статус | Источник |
|---|---|---|
| `aqven new` | реализовано | `cli.py:319`, `console/new.py:248` |
| `aqven check` | реализовано | `cli.py:320`, `cli.py:84-115` |
| `aqven generate` | реализовано | `cli.py:321`, `cli.py:118-134` |
| `aqven schema` | реализовано | `cli.py:322`, `cli.py:137-150` |
| `aqven tree` | реализовано | `cli.py:323`, `cli.py:153-165` |
| `aqven refs` | реализовано | `cli.py:324`, `cli.py:168-190` |
| `aqven fmt` | **заглушка** | `cli.py:325` → `PendingCommand`, `not_implemented()` |
| `aqven plan` | **заглушка** | `cli.py:326` |
| `aqven build` | **заглушка** | `cli.py:327` |
| `aqven run` | реализовано | `cli.py:328`, `cli.py:219-262` |
| `aqven dev` | реализовано | `cli.py:329` |
| `aqven studio` (алиас `dev`) | реализовано | `cli.py:330` |
| `aqven serve` | реализовано | `cli.py:331` |
| `aqven mcp` | реализовано | `cli.py:332`, `cli.py:265-283` |
| `aqven models check` | реализовано | `cli.py:333`, `console/models.py:220,244` |
| `aqven secrets` | реализовано | `cli.py:334`, `console/secrets.py:103-114` |
| `aqven prompt preview` | реализовано | `cli.py:335`, `console/prompt.py:118-160` |
| `aqven eval` | реализовано | `cli.py:336`, `console/evals.py:172-182` |
| `aqven optimize` | **заглушка** | `cli.py:337` |

Заглушки парсят аргументы, но `execute()` безусловно возвращает `not_implemented(name)` (`cli.py:286-297`).

`docs/20-repo-and-tooling.md` (draft) описывает другой, TS pnpm/turbo-монорепо с другим набором
команд (`init`, `export`, `import`, `verify`, `replay`) — этого нет в реальном CLI, доку как источник
не использовать.

## 4. HTTP / Studio API

FastAPI-приложение — `server/app.py:120-131`, под `/api`, с `operation_id` на каждом маршруте.

| Группа | Файл | Примеры маршрутов |
|---|---|---|
| Meta | `server/routes/meta.py:10` | `GET /api/ready` |
| Project | `server/routes/project.py:57-93` | `GET /api/project`, `/api/files`, `/api/files/{path}` |
| Flows | `server/routes/flows.py:123-334` | `/api/flows`, `/flows/{id}/spec`, `/ir`, `/schemas`, `/nodes`, `/nodes/{id}/prompt`, `/api/prompts`, `/api/types` |
| Runs | `server/routes/runs.py:78-142` | `POST /api/runs`, `/runs/{id}/events` (SSE), `/executions`, `/resume`, `/fork`, `/cancel` |
| Events (spec) | `server/routes/events.py:24-37` | `GET /api/events/spec` (SSE) |
| Schemas | `server/routes/schemas.py:37-64` | JSON Schema для редактора |
| Blobs | `server/routes/blobs.py:29-38` | `POST /api/blobs`, `/blobs/{id}/meta` |
| Settings | `server/routes/settings.py:94-138` | `/api/settings/providers`, `/secrets`, `/{scope}/{key}` |
| Evals/Datasets | `server/routes/evals.py:49-280` | `/api/evals`, `/api/datasets`, `/api/dataset-batches`, `/api/eval-runs` |

MCP-сервер и Studio SPA смонтированы на том же порту, bearer-token `AccessGuard`
(`server/app.py:174-177`), по модели ADR-0030.

Реальная, не описанная в 4 названных доках подсистема — **чат в Studio**: `server/chat/router.py`,
`server/chat/extension.py`, пакет `chat/` (бэкенды Claude Code и Codex, journal на SQLite), подключён
в `apps/studio/src/routes/__root.tsx:3,19`. ADR: `docs/adr/0034-codex-and-project-chat-threads.md`,
`docs/adr/0040-chat-agent-allowed-tools.md`, `docs/adr/0041-chat-model-and-effort.md`.

## 5. Экраны Studio

TanStack Router SPA, реальные файлы маршрутов:

| Маршрут | Экран | Файл |
|---|---|---|
| `/setup` | Онбординг | `apps/studio/src/routes/setup.tsx:5,15` |
| `/settings` | Настройки | `apps/studio/src/routes/settings.tsx:2,15` |
| `/project` | Обзор проекта | `apps/studio/src/routes/project.tsx:2-9` |
| `/flows/$flowId/canvas` | Канвас | `apps/studio/src/routes/flows/$flowId/canvas.tsx:1-4` |
| `/flows/$flowId/nodes` | Узлы/инспектор | `apps/studio/src/routes/flows/$flowId/nodes.tsx:4` |
| `/flows/$flowId/runs` | Отладчик прогона | `apps/studio/src/routes/flows/$flowId/runs.tsx:5-7` |
| `/flows/$flowId/review` | Очередь approval | `apps/studio/src/routes/flows/$flowId/review.tsx:5` |
| `/flows/$flowId/datasets` | Датасеты | `apps/studio/src/routes/flows/$flowId/datasets.tsx:2` |
| `/flows/$flowId/evals` | Эвалы | `apps/studio/src/routes/flows/$flowId/evals.tsx:4` |
| (глобально) | Чат (Claude Code/Codex) | `apps/studio/src/routes/__root.tsx:3,19` |

`docs/32-ui-design-brief.md` — бриф для внешнего дизайнера, не описание того, что построено.
`docs/31-canvas-editing.md`, `docs/15-studio-frontend.md` — предшествуют реальной Vite/TanStack сборке
(`docs/adr/0024-studio-on-vite.md` — актуальный ADR). Источник для IA — `apps/studio/src/routes/` + `features/`.

## 6. Интеграции сторонних библиотек

| Библиотека | Статус | Что оборачивает | Источник |
|---|---|---|---|
| DBOS | реально, один режим | Чекпоинт, suspend/resume `human`; только SQLite локально | `engine/config.py:44-53`; 12 файлов импортируют `dbos` |
| Pydantic AI | реально, ядро | `Agent.run`, structured output, цепочка `WrapperModel` | 37 файлов; сборка цепочки `models/chain.py:64-78,109-128` |
| Цепочка гарантий | реально | `OutcomeGateModel → RedactingModel → CassetteModel → Limiter → BackoffModel → SDK` | `models/{chain,cassette,backoff,limiter,redaction}.py`; дизайн `docs/adr/0029-trust-and-quality-python.md:57-118` |
| Провайдеры (`aqven-llm`) | реально, 10 семейств | Фабрики над `pydantic_ai.models.*` | `packages/aqven-llm/src/aqven_llm/catalog.py:44,63-116`; extras `packages/aqven/pyproject.toml:50-58` |
| MCP-клиент (внешние серверы как тулы) | реально | `agent.mcp_servers`, `ToolSpec.mcp`, `pydantic_ai.mcp.MCPToolset` | `spec/agent.py:99`, `spec/tool.py:13-29,46-60`, `engine/llm/tools.py` |
| Langfuse | **не подключено** | Экспорт трасс задизайнен (`docs/adr/0029...:49`, `docs/adr/0012-langfuse-as-store.md`), но `TracerProvider`/`OTLPSpanExporter` нигде не создаются | grep по `packages/aqven/src/` — пусто |
| scipy/statsmodels | **не используется** | Задизайнено в ADR-0029/`docs/13-evals-and-gates.md:1129-1135`, реально — stdlib (`random`, `math.comb`, `statistics.fmean`) | `evals/statistics.py:1-119` |
| python-liquid | реально | Промт уровня 2, `analyze()` без рендера | `loader/{project,layout}.py`, `check/{templates,prompts}.py`, `engine/llm/prompts.py`, `spec/inference.py`; дизайн `docs/adr/0026-yaml-spec-and-code-refs.md:237-264` |

## 7. Сквозные концепты (кандидаты Концепций)

1. Флоу и узлы — файлы, не база: `flows/<id>/flow.yaml` + `nodes/<node_id>.node.yaml` — `loader/layout.py:9-26`
2. 10 видов узлов, закрытый список, дискриминатор `node:` — §1 выше
3. Agent vs Inference vs узел `llm` — §1, последний абзац
4. Три уровня промта — `docs/adr/0026-yaml-spec-and-code-refs.md:237-264`; реализация `spec/inference.py:11,79`
5. Пять случаев динамической формы — `docs/adr/0027-dynamic-io-shapes.md:53-59,263-372`
6. Файлы как источник правды, два уровня правки (прямая vs `flow_patch`+CAS) — `docs/adr/0017-files-as-source-of-truth.md:33-98`
7. Цепочка гарантий на каждый вызов модели, три исхода (`ok`/`refusal`/`truncated`) — `docs/adr/0029-trust-and-quality-python.md:57-118`
8. Адресация шагов в параллели/цикле (`node_id`, `branch_key`, `iteration`, `item_index`) — `runtime/address.py`

Не документировать как рабочее: библиотека компонентов (`judge`/`judge_panel`/`verify_fix`/`cascade`,
контрактный язык `requires`/`ensures`) — не реализована; `aqven plan`/semantic diff/lock-файл
(`aqven.lock.yaml`) — CLI-заглушки, писателя lock-файла в коде нет.
