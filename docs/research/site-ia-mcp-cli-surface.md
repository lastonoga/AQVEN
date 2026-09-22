# Проверенные факты о реальной MCP/CLI-поверхности для Wave 4

> Параллельный проход по `packages/aqven/src/aqven/server/mcp/` и `cli.py`, 2026-09-22, часть — с живым
> запуском тулов против реального проекта (не только чтение кода). Код меняется быстрее, чем эта
> инвентаризация — как и с Wave 1 и Wave 3, автор каждой страницы обязан перепроверить факт перед тем,
> как его публиковать, а не доверять этому файлу вслепую.

## Опровержение более раннего плана

`catalog_list` и `catalog_get` **не существуют нигде в коде** — 0 совпадений по всему `packages/aqven/src`.
`server/mcp/catalog.py` — это не «каталог флоу», а инфраструктура регистрации MCP-тулов (`Operation`,
`ToolHints`, `ToolRegistration`), используемая всеми файлами `*_tools.py`. Файла `project_tools.py` в
репозитории нет вовсе. `flow_list`/`flow_get` реальны, но REST-only (`x-aqven-rest-only`,
`server/routes/flows.py:123,139`) — намеренно исключены из `build_catalog()`
(`server/mcp/endpoint.py:56-70`). Собственная строка инструкций MCP-сервера прямо говорит: «flow
definitions are files in the project — read them with your own Read/Grep/Glob; structural and
cross-file edits: flow_patch» (`endpoint.py:33-41`). Это осознанный дизайн, не пробел.

Итого **18 реальных тулов**, не 22 (старая инвентаризация Wave 1 устарела).

## 1. Полный список MCP-тулов

Все регистрируются как `Operation` (`server/mcp/catalog.py:96-116`) → `server.add_tool(...)`, собираются
в `build_catalog()` (`endpoint.py:56-70`). 4 тула всегда включены, 14 — условно (зависят от того, что
передано в `McpPorts` при сборке приложения).

| Тул | Файл | Surface | read_only | Назначение |
|---|---|---|---|---|
| `aqven_check` | `check_tools.py:126` | rest_and_mcp | false | Полная проверка проекта (компилятор + статика + симуляция) |
| `pyright_check` | `pyright_tool.py:179` | **mcp_only** | true | Проверка типов pyright |
| `pytest_run` | `pytest_tool.py:182` | **mcp_only** | false | Прогон pytest |
| `prompt_preview` | `preview_tools.py:50` | rest_and_mcp | true | Точный промт/сообщения/тулы, которые получит модель |
| `flow_patch` | `patch_tools.py:38` | rest_and_mcp | false, destructive | Атомарная структурная правка с CAS |
| `run_start` | `run_tools.py:121` | rest_and_mcp | false | Старт прогона |
| `run_get` | `run_tools.py:136` | rest_and_mcp | true | Полный снимок прогона |
| `run_list` | `run_tools.py:145` | rest_and_mcp | true | Постраничный список прогонов с фильтрами |
| `run_get_node` | `run_tools.py:159` | rest_and_mcp | true | Детали исполнения узла по адресу |
| `run_events` | `run_tools.py:171` | rest_and_mcp | true | Журнал событий (по умолчанию — хвост) |
| `run_resume` | `run_tools.py:183` | rest_and_mcp | false | Ответ на human-ожидание |
| `run_fork` | `run_tools.py:196` | rest_and_mcp | false | Форк прогона от адреса исполнения |
| `run_cancel` | `run_tools.py:209` | rest_and_mcp | false, destructive | Отмена прогона |
| `dataset_batch_start` | `eval_tools.py:42` | rest_and_mcp | false | Батч по именованным кейсам датасета |
| `dataset_batch_get` | `eval_tools.py:55` | rest_and_mcp | true | Прогресс батча |
| `eval_run_start` | `eval_tools.py:64` | rest_and_mcp | false | Запуск эвала |
| `eval_run_get` | `eval_tools.py:77` | rest_and_mcp | true | Статус/скоры/гейт прогона эвала |
| `eval_gate` | `eval_tools.py:86` | rest_and_mcp | true | Отчёт гейта против baseline |

`run_events`/`patch_flow`/eval-тулы регистрируются только когда `McpPorts.engine`/`patch_flow`/`services`
не `None` (`endpoint.py:59-61`) — в реальной продакшен-сборке (`app/composition.py`) все они включены,
но технически это конфигурируемо.

**Конверт ответа одинаков для всех 18**: успех → `structured_content` = dump модели вывода; ошибка →
`ApiError {ok:false, op, code, message, problems: Problem[], candidates, conflict, retry_after_ms}`
(`server/errors.py:85-93`). Некорректные аргументы (лишнее поле — вход всегда `extra="forbid"`)
превращаются в `REQUEST_INVALID`, не в протокольную ошибку MCP.

## 2. Транспорт и подключение

**Один HTTP-эндпоинт, не два разных сервера.** `MCPServer.streamable_http_app(streamable_http_path="/")`
смонтирован на `/mcp` того же FastAPI-приложения, что и Studio API (`endpoint.py:111-121`,
`server/app.py:175-176`). Реальный URL — `http://127.0.0.1:<port>/mcp/` (со слэшем), только loopback.
Адрес и токен пишутся в `<project_root>/.aqven/server.json` (`app/runtime_file.py`).

**`{{CLI_COMMAND}} mcp` — это stdio↔HTTP мост, не отдельная реализация.** Если сервер ещё не запущен,
он стартует фоновый безголовый `aqven serve --headless --no-browser` (`app/background.py:65-97`), затем
открывает streamable-HTTP клиент к тому же `/mcp/` с заголовком `Authorization: Bearer <token>` и
проксирует его как локальный stdio MCP-сервер (`mcp.server.stdio.stdio_server`,
`server/mcp/bridge.py:149-152`). Каталог тулов ровно один — тот, что собирает `build_catalog()` на
HTTP-сервере; отдельного набора для stdio нет.

**Аутентификация — bearer-токен, но выключена по умолчанию.** `ServerOptions.require_auth: bool = False`
(`app/options.py:49`), флаг `--require-auth` явный opt-in. Пока он не передан, внешний `AccessGuard`
пропускает всё без проверки, а внутренний `BearerGuard` вокруг `/mcp` вообще не оборачивает транспорт
(`app/access.py:224-226`, `app/composition.py:132`, `endpoint.py:80-93`). Это касается **только
локального** сервера на loopback — но факт нужно называть явно в доке, а не подразумевать, что токен
всегда обязателен.

## 3. `flow_patch` — механика CAS подробно

Вход `FlowPatchRequest` (`write/model.py:115-123`): `flow_id`, `expects: list[{path, file_hash|null}]`
(мин. 1), `ops: list[PatchOp]` (1..50), `client_op_id: Ulid`, `intent`, `expect_lock`, `exclusive`,
`dry_run`.

**11 реальных операций** (дискриминатор `op`, `write/model.py:99-112`): `add_node`, `remove_node`,
`rename_node`, `move_node`, `set`, `unset`, `bind`, `unbind`, `rename_flow`, `rename_agent`,
`delete_agent`. Нет отдельной `replace` (это `set` по пути) и нет `delete` для узла (это `remove_node`).

**Три кода конфликта** (`write/service.py:52-62`), по паре (ожидался хэш ≠ null, реальный хэш ≠ null):
- `FILE_EXISTS` — ждали отсутствия файла, а он есть
- `FILE_VANISHED` — ждали хэш, а файла больше нет
- `STALE_FILE` — ждали один хэш, на диске другой

**`expects[]` должен быть надмножеством всех тронутых файлов**, не только уже известных: если операции
трогают файл, не перечисленный в `expects`, `_require_coverage` (`service.py:326-333`) отклоняет запрос
с кодом `REQUEST_INVALID` и возвращает `candidates` — готовый список `{path, file_hash}` для повторной
попытки. Это правило действует только при `dry_run: false`.

**Повтор `client_op_id` возвращает первый результат дословно**, без повторной валидации — проверяется
дважды (до и после захвата блокировки проекта) и хранится постоянно в
`.aqven/cache/write_intents/<client_op_id>.json` (`write/intents.py:35-53`).

## 4. `run_*` — 8 тулов, расхождения с REST

Все под `RunTools` (`run_tools.py:118-217`), все `surface=rest_and_mcp` — но REST и MCP не всегда
совпадают буква в букву:

- **`run_start`**: MCP-путь может обойти сервис разрешения датасета и предупреждений (`starting is None`
  → прямой вызов движка), REST-путь — никогда, всегда через полный `RunStartService`.
- **`run_events`**: MCP по умолчанию (без `after_seq`) возвращает **хвост** — последние `limit` событий;
  REST-путь с тем же именем операции (`GET /api/runs/{id}/events/log`) по умолчанию возвращает **с
  начала** журнала. Это реальное поведенческое расхождение, не только транспортное. Отдельно есть
  REST-only SSE-поток `GET /api/runs/{id}/events` — у него нет MCP-аналога вовсе.
- **`run_fork`**: MCP-поле называется `address`, REST ждёт тот же смысл под именем `"from"` — разные
  ключи JSON за одной семантикой.
- **`run_resume`/`run_cancel`**: у REST `run_id` — в пути URL, у MCP — в теле запроса.

## 5. `dataset_batch_*`, `eval_run_*`, `eval_gate`

`dataset_batch_start`/`get`, `eval_run_start`/`get`, `eval_gate` — 5 тулов под `EvalTools`
(`eval_tools.py:20-97`).

**Важное расхождение**: `eval_run_start` через MCP возвращает **полную** запись `EvalRunRecord`; REST
для той же операции (`POST /api/eval-runs`) отдаёт только `EvalRunAccepted{eval_run_id, eval_id, status,
poll}` со статусом 202 — по-настоящему разные формы ответа, не просто разное кодирование одного и того
же. `dataset_batch_start` такого расхождения не имеет — REST тоже отдаёт полную запись.

**Гейт**: `eval_gate` кидает 404 «ran without a baseline» только если у прогона вообще не было
`baseline_run_id`. Если baseline был, но статистика недостаточна (мало кейсов, мало discordant-пар и
т.п.) — возвращается 200 с `decision: GATE_UNAVAILABLE` и конкретным `reason_code`, не ошибка. Это
подтверждает независимо то же, что уже задокументировано в `docs/research/site-ia-studio-screens.md` §8.

## 6. `prompt_preview`, `aqven_check`, `pyright_check`, `pytest_run` — реально запущены

Все четыре реально вызваны через настоящий MCP-клиент против копии тестового проекта — ниже примеры
успеха и ошибки, а не придуманные.

**`prompt_preview`** — вход `{flow_id, node_id, input?, variants?}`, выход — точный промт: `instructions`,
`messages[]` (роль + текст), `attachments[]`, `variants[]`, `tools[]`, `output` (какой режим структурного
вывода реально выбран и почему). Реальная ошибка на code-узле: `NOT_FOUND` — «node intake.clean is a code
node: only llm nodes have a prompt». Реальная ошибка на неизвестном слоте варианта: `INPUT_INVALID`.

**`aqven_check`** — вход `{paths?, include_warnings?, static?, limit?, timeout_seconds?}`. Реальный
чистый результат: `{"ok":true,"errors":0,"warnings":0,"diagnostics":[],...}`. Реальная ошибка (неизвестный
тип в `flow.yaml`): `{"ok":false,"errors":1,"diagnostics":[{"code":"E_TYPE_UNKNOWN",...}]}` — при этом
конверт MCP всё равно `is_error:false`: провал сигнализируется внутри ресурса (`ok:false`), а не как
ошибка вызова тула.

**`pyright_check`** (только MCP, REST-маршрута нет) — реальная ошибка типа: `reportAssignmentType`,
позиции 1-based.

**`pytest_run`** (только MCP) — вход поддерживает `keyword` (аналог `-k`) и `max_failures` (аналог
`--maxfail`). Реальный провал: `outcome:"failed"`, `failures:[{test, kind:"failure"|"error", message,
details}]` из JUnit XML.

## 7. CLI-команды (полный реестр, повторная проверка после Wave 2)

19 команд в `COMMANDS` (`cli.py:326-346`), реализовано 15, заглушек 4 (`fmt`, `plan`, `build`,
`optimize` — без изменений с Wave 2).

**Группа «агентская поверхность» (не Engine-волна, эта волна)** — все 4 реализованы:
- `aqven mcp [--root] [--data-dir] [path]` — мост stdio↔HTTP, запускает безголовый сервер при необходимости
- `aqven serve [--headless] [--no-browser] [--require-auth] [--host] [--port] [--data-dir] [--chat-*] [path]`
  — сам процесс с `/mcp`, Studio API и (если не `--headless`) статикой Studio
- `aqven dev` / `aqven studio` — **`studio` буквально алиас `dev`** (тот же класс `ServerCommand`,
  тот же `mode="studio"`, отличается только текст справки), с открытием браузера
- Полный `--help` для `mcp` и `serve` захвачен реальным запуском, не реконструирован по памяти —
  включает `--chat-allow-tool`, `--chat-model`, `--chat-effort`, `--chat-permission-mode` у `serve`,
  которых не было в более ранних заметках.

## Открытые несоответствия во внутренней документации (не эта волна, не трогать сейчас)

- `docs/99-open-questions.md` (строка ~280) и `docs/14-mcp-contract.md` (строки 724, 1177-1182) всё ещё
  называют stdio-вход через MCP открытым вопросом — код его уже полностью реализует (`aqven mcp`).
- `docs/14-mcp-contract.md:161` перечисляет поля `RunStarted` без `spec_version_id` и `last_seq`,
  которые реально есть в коде.

Оба — расхождения во внутренних `docs/`, не в этом сайте; не чинятся этой волной, но стоит поднять
отдельно.
