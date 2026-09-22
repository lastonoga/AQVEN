# 14. MCP-контракт для агентов

> Статус: draft; §2 и §5 описывают реализованную поверхность, остальные разделы — проект
> Зависит от: [07. Компилятор](07-compiler.md), [12. Наблюдаемость и отладка](12-observability.md), [02. Архитектура системы](02-architecture.md), [23. API локальной студии](23-studio-api.md), [ADR-0008](adr/0008-mcp-tool-naming-and-phasing.md), [ADR-0017](adr/0017-files-as-source-of-truth.md), [ADR-0025](adr/0025-python-engine.md), [ADR-0026](adr/0026-yaml-spec-and-code-refs.md), [ADR-0028](adr/0028-studio-api-contract.md), [ADR-0029](adr/0029-trust-and-quality-python.md), [ADR-0042](adr/0042-mcp-is-the-action-surface.md)
> Источники: research/mcp-server.md, research/api-layer.md, research/00-verified-by-lead.md, [research/py-stack-runtime.md](research/py-stack-runtime.md) §5.5, §7, [research/studio-api-inventory.md](research/studio-api-inventory.md) §2.3–§2.4, §3, спека §13.1–§13.4

## Зачем этот слой

Определения лежат файлами в репозитории проекта ([ADR-0017](adr/0017-files-as-source-of-truth.md),
[ADR-0026](adr/0026-yaml-spec-and-code-refs.md)), и Claude Code правит их нативными инструментами. MCP-слой
стоит не вместо файлов, а поверх них: он закрывает проблему «агент не видит последствий своего действия» из
§8 — доменная операция валидируется до записи на всём дереве проекта, пишется транзакцией по набору файлов и
возвращает локальный контекст, машиночитаемые проблемы и готовые к применению кандидаты исправления. Второй
закрываемый риск — бюджет контекста, и закрыт он размером поверхности, а не механизмом: реестр
проектировался на 78 тулов и стоил бы 20–47k токенов определений до первого действия, а реализованная
поверхность — 18 тулов действий, около 3k ([ADR-0042](adr/0042-mcp-is-the-action-surface.md)). Читающих
тулов нет: файлы агент читает своими средствами.

**Что здесь реализовано, а что спроектировано.** §2 — поверхность как она есть, §5 — отменённое фазовое
раскрытие. Разделы §3, §4, §6–§10 описывают замысел: конверт ответа, права, скилл цикла и протокол §13.3
реализованы частично или не реализованы, и ссылаются на тулы из §2.6, которых на поверхности нет.

## Решения

| Решение | Что берём | Версия | Лицензия | Почему |
|---|---|---|---|---|
| SDK сервера | `mcp`, `mcp.server.MCPServer("aqven")` | 2.2.0 | MIT | тул регистрируется из каталога операций через `ToolCall` и `add_tool(..., structured_output=True)`: `inputSchema` и `outputSchema` из моделей Pydantic ([ADR-0028](adr/0028-studio-api-contract.md) §2) |
| Схемы входа и выхода | `pydantic` | 2.13.5 | MIT | одна модель на тул, маршрут FastAPI и типы студии; модели входа `extra="forbid"` |
| Транспорт | streamable HTTP: `MCPServer.streamable_http_app(streamable_http_path="/")`, маунт `/mcp` в `fastapi` без extras под `uvicorn` | 2.2.0 / 0.141.1 / 0.53.0 | MIT / MIT / BSD-3-Clause | REST, SSE и MCP одним процессом на `127.0.0.1`; lifespan FastAPI входит в `session_manager.run()` (проверено запуском, [research/py-stack-runtime.md](research/py-stack-runtime.md) §7) |
| Локальный stdio-вход | `MCPServer.run(transport="stdio")` | 2.2.0 | MIT | в SDK есть; нужен ли при HTTP-входе `aqven dev` — открытый вопрос 17 |
| Защита от DNS rebinding | `TrustedHostMiddleware` на всём приложении, у `/mcp/` — `TransportSecuritySettings` | starlette 1.6.0 / mcp 2.2.0 | BSD-3-Clause / MIT | чужой `Host` → 400; MCP по умолчанию принимает только localhost, иначе 421 ([23](23-studio-api.md) «Решения») |
| Авторизация | на loopback нет ([23](23-studio-api.md) §1.1); для `aqven serve` вне loopback не выбрана | — | — | у `MCPServer` 2.2.0 есть `token_verifier` и `auth: AuthSettings`, поведение не проверено — открытый вопрос 6 |
| Формат ошибки | `ApiError` — модель Pydantic движка | — | — | один транслятор `DomainError → ApiError` на REST и MCP; в MCP — `CallToolResult(is_error=True)` с `ApiError` в `structuredContent` ([ADR-0028](adr/0028-studio-api-contract.md) §2, правило 5) |
| Конкурентность | CAS `expects[{path, file_hash}]` + `client_op_id`, `.aqven/lock`, история в git через `dulwich` за `GitPort` | dulwich 1.2.15 | Apache-2.0 (из Apache-2.0 OR GPL-2.0-or-later) | глобального счётчика ревизий нет; CRDT не решает задачу инвариантов графа (§9.6) |
| Скилл цикла | Agent Skills, Project-уровень `.claude/skills/` | — | — | версионируется вместе со спекой воркфлоу в том же репозитории |

Не берём: MCP sampling (Claude Code не поддерживает), MCP resources и prompts как обязательный канал
(не заявлены в доках Claude Code), CRDT для структуры графа, legacy HTTP+SSE транспорт (протокол
2024-11-05), `@modelcontextprotocol/sdk` и zod на движке (движок на Python, [ADR-0025](adr/0025-python-engine.md)
§8), тул с одним параметром-моделью и подмену схемы тула через приватный `MCPServer._tool_manager`
([ADR-0028](adr/0028-studio-api-contract.md) «Альтернативы»).

Пробы. Фрагменты §3.1, §3.4, §4.3, §5.4, §6.2 и §9.2 проверены вне репозитория 2026-09-16 на CPython 3.14.7:
pyright 1.1.414 strict и `ruff check` 0.16.7 (`E`, `F`) без замечаний (имена из других пакетов — `ProblemCode`, `Op`, `Operation`, `ApiError`,
`DomainError`, `unauthorized`, `forbidden` — заглушками, `Operation` и `ToolCall` — в форме
[ADR-0028](adr/0028-studio-api-contract.md) §2); pydantic 2.13.5 принял конверты §3.2 и §3.3 (с полными хешами
вместо сокращённых) и `apply.arguments` кандидата как вход `flow_patch`, а вход с `idempotency_key` отклонил
(`extra_forbidden`); `MCPServer` 2.2.0 с записью каталога §3.4 отдал в `tools/list` тул `flow_patch` с
`outputSchema`, обязательными `spec_id`, `expects`, `ops`, `client_op_id` и без `additionalProperties` во
`inputSchema`; вызов тула после `remove_tool` вернул `is_error: true` с текстом `Unknown tool: <имя>` и без
`structuredContent` (`mcp.Client` в процессе).

## 1. Принципы контракта

**П1. Два уровня на одних байтах.** Истина — байты файлов, и агент правит их нативными инструментами.
Доменная единица записи остаётся прежней: операция над графом (`add_node`, `bind`, `set`, `remove`)
в `flow_patch` вместе с `expects[{path, file_hash}]` и `client_op_id`. Сервер сверяет хеши, применяет
операции к дереву в памяти, прогоняет валидатор инвариантов (типы портов, DAG, обязательные биндинги,
межфайловые ссылки) и только потом пишет файлы каноническим писателем YAML
([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1). Через доменный уровень невалидное состояние записать
нельзя; через файловый — можно, и его держат хук `flow_check` и гейт релиза (§2.8).

**П2. Почему ответ тула не содержит всего проекта.** Три причины, каждая измеримая:
- цена контекста: полный IR среднего воркфлоу + каталоги + трейсы не помещаются в бюджет, который
  нужен на рассуждение о конкретной ошибке;
- отсутствие семантики: текст спеки не говорит, какой узел виноват, — это знает компилятор и трейс;
- дрейф: прочитанный один раз проект устаревает после первой же правки (хеши файлов меняются), а
  агент продолжает рассуждать о старой копии.
Вместо чтения проекта сервер отдаёт **`focus`** — окрестность затронутого узла: сам узел, его
`upstream`/`downstream` по именам, отрендеренный фрагмент спеки вокруг него. Всё остальное — по
ссылке в `refs[]`, дочитывается только если понадобится.

**П3. Локальный контекст в ответе.** Ответ любого тула самодостаточен для следующего шага. Это
прямое следствие рекомендации Anthropic консолидировать тулы: `get_customer_context` вместо трёх
вызовов. У нас консолидированы `flow_patch` (все правки графа), `run_get_trace` (трейс + проблемы +
провенанс узла), `registry_propose` (три вида заявок).

**П4. Кандидаты исправления вместо прозы.** `candidates[].apply` — готовый вызов другого тула с
полностью заполненными `arguments`. Агент не конструирует патч из описания ошибки, он выполняет
предложенный вызов или отклоняет его. Тот же массив кандидатов Studio рисует кнопками «Починить»:
один формат — два интерфейса. Формат кандидата совпадает с `ErrorDetail.candidates[]` из
[07. Компилятор](07-compiler.md).

**П5. Отрицательный результат так же информативен, как положительный.** `ok:false` обязан нести
непустой `problems[]`; пустой `candidates[]` при `ok:false` допустим только для кодов
`UNAUTHORIZED`, `FORBIDDEN`, `PROVIDER_ERROR`, `INTERNAL` (регистр — как в [23](23-studio-api.md) §12.5).
Ни один ответ не содержит стектрейса.

**П6. `ui_url` в каждом ответе.** Не декорация: это (а) ссылка, по которой человек видит ровно то же
состояние, что агент, с подсвеченным узлом и выбранной проблемой; (б) адрес URL-elicitation, когда нужен
аппрув человека (URL-elicitation поддерживается Claude Code; метод `mcp` 2.2.0 — открытый вопрос 21).
Формат: `http://127.0.0.1:<port>/w/<spec_id>/run/<run_id>?node=<node_id>&problem=<index>`, порт `aqven dev`
по умолчанию 5180 ([23](23-studio-api.md) §1.1).

**П7. Наружу — читаемые имена, не UUID.** Агент оперирует slug-ами (`extract_line_items`), потому что
разрешение UUID в семантические имена измеримо повышает точность выбора. Внутренние идентификаторы
отдаются только в `refs[]` и в полях с суффиксом `_uuid`, если без них нельзя.

**П8. Доменные ошибки — не ошибки протокола.** JSON-RPC error используется только для нарушений
самого MCP (неизвестный тул, битый JSON). Всё доменное возвращается как обычный результат с
`isError: true` и полным конвертом — иначе агент не сможет это починить. Исключение пока одно: ошибку
проверки аргументов по модели входа `mcp` 2.2.0 отдаёт текстом SDK с `isError`, без конверта
([ADR-0028](adr/0028-studio-api-contract.md) ОВ 2).

## 2. Реестр тулов

Имя сервера — `aqven` ([ADR-0025](adr/0025-python-engine.md) §8). Короткое намеренно: Claude Code префиксует
тулы как `mcp__<server>__<tool>`, а имя в Messages API ограничено по длине и по алфавиту — точка не входит.
Имена только `snake_case`, точки из §13.1 спеки переименованы; проверка длины — `len("mcp__aqven__") + len(name) <= 128`.

**MCP — поверхность действий, а не чтения** ([ADR-0042](adr/0042-mcp-is-the-action-surface.md)). Определения
лежат файлами ([ADR-0017](adr/0017-files-as-source-of-truth.md), [ADR-0026](adr/0026-yaml-spec-and-code-refs.md)),
и агент читает их своими Read, Grep и Glob. Тул попадает на поверхность, только если делает то, чего файлами
не сделать: запускает, проверяет, пишет транзакционно. Поэтому читающих тулов нет и фазового раскрытия нет:
18 определений стоят порядка 3k токенов.

Тул и маршрут студии зовут один use-case из `server/views/` — не «одинаковый», а тот же самый объект
([ADR-0042](adr/0042-mcp-is-the-action-surface.md) §3). REST-двойник каждого тула — [23](23-studio-api.md) §13.2;
разметку держит `operation("<имя>")` на маршруте, у маршрутов без тула — `rest_only("<причина>")`.

### 2.1 Проверки (группа `check`)

| Имя | Что делает | Вход | Выход |
|---|---|---|---|
| `aqven_check` | Полная проверка дерева тем же компилятором, что и сервер | `paths?`, `include_warnings?`, `static?`, `limit?`, `timeout_seconds?` | `AqvenCheckResult`: `ok`, `errors`, `warnings`, `problems[]` |
| `pyright_check` | pyright strict по коду шагов проекта | `paths?`, `limit?`, `timeout_seconds?` | `PyrightResult` |
| `pytest_run` | pytest по тестам проекта | `paths?`, `keyword?`, `max_failures?`, `limit?`, `timeout_seconds?` | `PytestResult` |

Обязательны после правки: `aqven_check` всегда, `pyright_check` и `pytest_run` — после правки кода.

### 2.2 Промт (группа `prompt`)

| Имя | Что делает | Вход | Выход |
|---|---|---|---|
| `prompt_preview` | Что узел `llm` реально отправит модели: инструкции, сообщения с фрагментами и выбранными вариантами, вложения, тулы, разрешённый `output.mode` | `flow_id`, `node_id`, `input?`, `variants?` | `PromptPreview` |

Тул нужен потому, что собранного промта на диске нет: он — результат работы компилятора над файлами.

### 2.3 Правка (группа `flow`)

| Имя | Что делает | Вход | Выход |
|---|---|---|---|
| `flow_patch` | Атомарно применяет 1..50 операций к файлам воркфлоу: `add_node`, `remove_node`, `rename_node`, `move_node`, `set`, `unset`, `bind`, `unbind`, `rename_flow`, `rename_agent`, `delete_agent` | `flow_id`, `expects[{path, file_hash\|null}]`, `ops[1..50]`, `client_op_id`, `intent?`, `expect_lock?`, `exclusive?`, `dry_run?` | `WriteResult` |

`file_hash` агент считает сам: `"sha256-"` плюс sha256 байтов файла. Источника хешей на поверхности нет
намеренно — файл у агента и так открыт. `dry_run: true` заменяет отдельный `flow_validate`; на `STALE_FILE`
файл перечитывается и намерение переигрывается, перезаписывать силой запрещено.

Консолидация: шесть тонких тулов §13.1 (`add_node`, `bind`, `set`, `remove` и два скрытых в «правке»)
схлопнуты в один `flow_patch` с дискриминированным union операций. Это одновременно (а) сокращает
поверхность, (б) делает правку атомарной, (в) даёт единственную точку оптимистичной блокировки. Вход
совпадает с телом `PATCH /api/flows/{flow_id}` ([23](23-studio-api.md) §12.1).

### 2.4 Прогон и отладка (группа `run`)

Адрес исполнения узла — структура `address{node_id, branch_key, iteration, item_index}`, строковая склейка
запрещена ([ADR-0028](adr/0028-studio-api-contract.md) §5, [23](23-studio-api.md) §6.2).

| Имя | Что делает | Вход | Выход |
|---|---|---|---|
| `run_start` | Запускает прогон из рабочей копии и возвращает `run_id` сразу, не дожидаясь конца | `flow_id`, `mode`, ровно одно из `input`/`dataset_item_id`, `at?`, `context?`, `selected_nodes?`, `start_node?`, `end_node?`, `node_outputs?`, `cassette_id?`, `human_answers?` | `RunStarted`: `run_id`, `status`, `content_hash`, `ui_url`, `warnings[]` |
| `run_get` | Статус, стоимость, исполнения узлов, открытые ожидания человека, `last_seq` | `run_id` | `RunSnapshot` |
| `run_list` | Листинг прогонов; «что ждёт меня» — фильтр, а не отдельный инбокс | `flow_id?`, `status?`, `mode?`, `assignee?`, `parent_run_id?`, `deadline_before?`, `overdue?`, `since?`, `until?`, `sort?`, `cursor?`, `limit?` | `Page<RunSummary>` |
| `run_get_node` | Одно исполнение по адресу: промт, провенанс, ответ, проверки, стоимость; у ждущего узла — форма ожидания | `run_id`, `node_id`, `branch_key?`, `iteration?`, `item_index?`, `include_payloads?` | `ExecutionDetail` |
| `run_events` | Страница журнала событий прогона после `after_seq` | `run_id`, `after_seq?`, `limit?` | `Page<RunEvent>` |
| `run_resume` | Возобновляет приостановленный прогон ответом человека | `run_id`, `address`, `attempt`, `payload`, `client_op_id` | `ResumeResult` |
| `run_fork` | Форк прогона с точки шага | `run_id`, `address`, `overrides?`, `at?` | `RunForked` |
| `run_cancel` | Отменяет прогон | `run_id`, `reason` | `CancelResult` |

Подсистемы задач нет: шесть операций `human_task_list/get/answer/reassign/escalate/cancel`
**отменены**. Ожидание человека — узел `human` на примитивах DBOS ([ADR-0025](adr/0025-python-engine.md) §9,
[23](23-studio-api.md) §6.6); агент работает с ним теми же use-case'ами, что студия ([23](23-studio-api.md) §13.4).

| Что | Тул | Правило |
|---|---|---|
| «Что ждёт меня» | `run_list({status: 'suspended', assignee: 'me', sort: 'deadline_at'})` | прогон попадает в страницу, если подходит хотя бы одно открытое ожидание из `waits[]`; просроченные — `overdue: true`; фильтры — [23](23-studio-api.md) §6.7 |
| Форма | `run_get_node` по адресу из `waits[].address` | `human.form_schema` — JSON Schema модели Pydantic типа `form` узла, `human.suspend_data` — значения `in` узла ([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §13); справочника `form_kind` нет, тип формы — `form_type_id` |
| Ответ | `run_resume` | `payload` проверяется моделью формы до `DBOS.send`: ошибка — `ApiError` с `INPUT_INVALID` и `problems[{path, code, message}]`, прогон остаётся `suspended`; `attempt` обязателен, ответ для прежней попытки после эскалации — `WAIT_ATTEMPT_STALE`; нет открытого ожидания — `NOT_WAITING`; ответ другим ключом — `ALREADY_RESUMED`; срок истёк — `RUN_TIMED_OUT`; `client_op_id` уходит в DBOS как `idempotency_key` у `send`, повтор с тем же ключом даёт `outcome: replayed`; цепочка проверок — [23](23-studio-api.md) §6.8 |
| Одобрение тула внутри `llm` | те же `run_list`, `run_get_node`, `run_resume` | ожидание с `wait_kind: tool_approval`, `suspend_data` — вызовы, ждущие решения ([23](23-studio-api.md) §6.10) |
| Тест и повторный вопрос | `run_start` с `human_answers[{address, attempt, payload}]`, `run_fork` с `address` на узле `human` | сценарные ответы кладутся в топики ожидания заранее; форк на узле `human` спрашивает заново ([23](23-studio-api.md) §6.9) |

Таймаут — не операция и не задача планировщика: узел объявляет `timeout_seconds` и `on_timeout`
(`fail | default | escalate`), срок исполняет сам DBOS-workflow — `recv` с таймаутом, дедлайн — выход шага
`DBOS.sleep`, который переживает перезапуск процесса. Следующий узел после резюма приходит событиями
run-канала ([23](23-studio-api.md) §11.2), поля `next_node_id` нет.

### 2.5 Датасеты и эвалы (группа `eval`)

| Имя | Что делает | Вход | Выход |
|---|---|---|---|
| `dataset_batch_start` | Прогоняет названные кейсы датасета воркфлоу и возвращает батч сразу, не дожидаясь конца; `selected_nodes`, `start_node` и `end_node` сужают прогон так же, как у `run_start` | `flow_id`, `dataset_id`, `case_names[1..N]`, `selected_nodes?`, `start_node?`, `end_node?`, `mode?` | `DatasetBatchRecord` |
| `dataset_batch_get` | Прогресс батча: статус, счётчики, прогон каждого кейса | `batch_id` | `DatasetBatchRecord` |
| `eval_run_start` | Прогоняет эвал по его датасету и возвращает запись сразу; `baseline_run_id` сравнивает с прежним прогоном и заполняет гейт, `repeats` повторяет каждый кейс | `eval_id`, `dataset_id?`, `baseline_run_id?`, `repeats?` | `EvalRunRecord` |
| `eval_run_get` | Статус, оценки по каждому скореру, отчёт гейта, если был baseline | `eval_run_id` | `EvalRunRecord` |
| `eval_gate` | Отчёт гейта против baseline: какие метрики сдвинулись, насколько, проходит ли гейт. Без baseline — ошибка | `eval_run_id` | `GateReport` |

Создание датасетов тулом **не делается**: датасет — файл `datasets/<id>.yaml`, агент пишет его сам
([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §2). Импорт CSV и черновики схем остаются маршрутами
студии: это операции её редактора, а не агента.

### 2.6 Что спроектировано и не реализовано

Реестр этого документа проектировался на 78 тулов в 14 группах; поверхность — 18
([ADR-0042](adr/0042-mcp-is-the-action-surface.md)). Ниже — что осталось замыслом, чтобы это не приходилось
выяснять по отсутствию.

| Группа | Тулы | Почему не на поверхности |
|---|---|---|
| Чтение проекта | `flow_list`, `flow_get`, `catalog_list`, `catalog_get` | **убраны**: агент читает файлы своими средствами, тул дал бы второй формат тех же данных |
| Служебные | `mode_set`, `help_contract`, `studio_open` | фазовое раскрытие отменено (§5), `ui_url` приходит в `RunStarted` |
| Бриф, журнал, архитектуры | `brief_*`, `journal_*`, `architecture_*` | не реализовано |
| История и релиз | `flow_create`, `flow_import`, `flow_commit`, `flow_history`, `flow_diff`, `flow_revert`, `flow_lock`, `flow_compile` | не реализовано; `flow_compile` покрывает `aqven_check`, история — git у агента |
| Контекст и провайдеры | `context_*`, `kb_indexes`, `provider_models`, `provider_probe` | не реализовано |
| Отладка прогонов | `run_get_trace`, `run_replay_node`, `run_diff`, `run_stages`, `run_lineage`, `run_blame` | не реализовано; `run_events` и `run_get_node` покрывают трассу |
| Эвалы сверх пяти | `dataset_add_from_run`, `dataset_get`, `dataset_generate`, `dataset_coverage`, `scorer_create`, `experiment_model_matrix`, `feedback_list` | не реализовано; `experiment_run` и `experiment_compare` переименованы в `eval_run_start` и `eval_gate` |
| Компоненты и агенты | `component_*`, `agent_get`, `agent_effective_config` | не реализовано |
| Реестры и версии | `registry_propose`, `version_propose`, `version_status` | не реализовано |
| Экспорт | `project_import`, `project_conformance`, `project_verify_migration`, `project_export` | группа отменена решением владельца 2026-09-16 ([ADR-0025](adr/0025-python-engine.md) §7); `project_export` в `agent_workflow_spec` — открытый вопрос 16 |

### 2.7 Два уровня редактирования

Файловых операций `file_read`/`file_write` в MCP **не заводим**: у Claude Code уже есть Read, Edit,
Write и git, а дублирующий тул записи означал бы вторую схему CAS и второй способ обойти валидатор.

| | Файловый уровень | Доменный уровень |
|---|---|---|
| Кто | нативные тулы агента, редактор, git | `flow_patch` и его родня по MCP/REST |
| Единица и CAS | файл, байты; конфликт ловит git | набор файлов атомарно, `expects[{path, file_hash}]` + `client_op_id` |
| Валидация | **после** записи: хук `flow_check` на `PostToolUse`, файл остаётся на диске | **до** записи: невалидное не пишется, `problems[]` + `candidates[]` |
| Охват | один файл: текст промта, правка поля, грепы | кросс-файловое: переименование типа в 40 файлах одним вызовом |

| Правило | Формулировка |
|---|---|
| Приоритет | структурную правку делаем `flow_patch`; прямая запись законна, но её отчёт приходит постфактум |
| Граница коммита | невалидное дерево коммитить можно, релизить — нет: `version_propose` требует `flow_compile(ok)` |
| Индекс | оба уровня переиндексируются одинаково: наблюдатель на дереве (`watchfiles` 1.2.0, [23](23-studio-api.md) «Решения»), а не хук внутри `flow_patch` |

CLI-поверхность рядом с MCP — тот же компилятор, другой вход (команда `aqven` Python-движка,
[ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §10; имя дистрибутива — ADR-0026 ОВ 1):

| Команда | Что делает |
|---|---|
| `aqven check [пути] --format json` | полная проверка тем же компилятором, что и сервер; `problems[]` в формате конверта §3, ненулевой код возврата. Стоит хуком `PostToolUse`, в pre-commit и в CI |
| `aqven fmt` / `aqven fmt --check` | канонический YAML ([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1): блочный стиль, ключи в порядке полей модели описания, `apiVersion` и `kind` первыми, пользовательские отображения и списки — в порядке автора; конвертация в версию хранения формата; убивает класс конфликтов «стиль и порядок» |
| `aqven lock` | пересобирает `aqven.lock.yaml` — пины версий фрагментов и компонентов; расхождение лока с содержимым даёт `E_LOCK_STALE` и отказ релиза |

## 3. Единый конверт ответа

Каждый тул объявляет `outputSchema`: `ToolCall` публикует модель выхода операции аннотацией
`Annotated[CallToolResult, O]` ([ADR-0028](adr/0028-studio-api-contract.md) §2). `MCPServer` 2.2.0 сверяет
`structuredContent` со схемой выхода, кроме ответов с `is_error` (`FuncMetadata.convert_result`), а аргументы —
моделью входа; лишний аргумент при этом тихо отбрасывается, ошибка проверки приходит текстом SDK
([ADR-0028](adr/0028-studio-api-contract.md) ОВ 2). Ответ дублируется в `content[0].text` — требование обратной
совместимости spec 2025-06-18: клиент, не понимающий `structuredContent`, иначе увидит пустой ответ.

Где конверт: ответ записи в файлы проекта в обоих каналах — `Envelope`
([ADR-0028](adr/0028-studio-api-contract.md) §2, правило 4; [23](23-studio-api.md) §1.2). Чтение по REST отдаёт
модель без конверта; где у тула чтения лежит результат при конверте и нужен ли конверт у записи вне файлов
(запуск, резюм, форк) — открытый вопрос 15.

### 3.1 Схема

```python
from typing import Annotated, Literal, NewType

from pydantic import BaseModel, ConfigDict, Field, JsonValue

NodeId = NewType("NodeId", str)
ClientOpId = NewType("ClientOpId", str)
FileHash = Annotated[str, Field(pattern=r"^sha256-[0-9a-f]{64}$")]


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FileVersion(ContractModel):
    path: str
    file_hash: FileHash


class Actor(ContractModel):
    kind: Literal["human", "agent", "fs", "git", "system"]
    id: str


class Version(ContractModel):
    files: list[FileVersion]
    dirty: bool
    actor: Actor | None
    client_op_id: ClientOpId | None


class ProblemAt(ContractModel):
    node_id: NodeId | None
    path: str | None
    line: Annotated[int, Field(ge=1)] | None


class Problem(ContractModel):
    code: ProblemCode
    severity: Literal["error", "warning", "info"]
    at: ProblemAt
    message: str
    evidence: dict[str, JsonValue] | None


class ToolInvocation(ContractModel):
    tool: str
    arguments: dict[str, JsonValue]


class Candidate(ContractModel):
    id: str
    title: str
    confidence: Annotated[float, Field(ge=0, le=1)]
    rationale: str
    risk: Literal["low", "medium", "high"]
    affects: list[NodeId]
    apply: ToolInvocation


class NextStep(ContractModel):
    tool: str
    arguments: dict[str, JsonValue]
    why: str


class Focus(ContractModel):
    node_id: NodeId
    node_kind: str
    excerpt: str
    upstream: list[NodeId]
    downstream: list[NodeId]


class ResourceLink(ContractModel):
    type: Literal["resource_link"]
    uri: str
    name: str
    mimeType: str
    description: str


class Truncation(ContractModel):
    fields: list[str]
    hint: str


class Envelope(ContractModel):
    ok: bool
    op: str
    version: Version | None
    focus: Focus | None
    problems: list[Problem]
    candidates: list[Candidate]
    next: list[NextStep]
    refs: list[ResourceLink]
    ui_url: str
    truncated: Truncation | None
```

`ProblemCode` — `StrEnum` пакета компилятора, стабильный и единый с `ErrorCode`/`ErrorDetail.rule` из
[07. Компилятор](07-compiler.md): агент маршрутизирует по коду, не парся текст. Полный список
кодов доступен агенту без чтения документации через `help_contract({ topic: 'codes' })` и продублирован
в `reference.md` скилла.

Стиль схем — тот же, что у IR (DECISIONS, «Структурированный вывод — опровержения спеки»): все поля
обязательны, опциональность через `null` (`T | None` без значения по умолчанию), `additionalProperties: false`
(`extra="forbid"` у `ContractModel`), без рекурсии, порядок полей — как в объявлении. Хеш — строка
`sha256-<64 hex>` ([23](23-studio-api.md) §1.2), `actor` — как в spec-канале ([23](23-studio-api.md) §11.1).
`mimeType` у `refs[]` повторяет форму `resource_link` MCP, поэтому не в `snake_case`.

### 3.2 Успешный ответ

```jsonc
{
  "ok": true,
  "op": "flow_patch",
  "version": {
    "files": [{ "path": "flows/wf_invoice/nodes/extract_line_items.yaml", "file_hash": "sha256-9f1c2b…" }],
    "dirty": true,
    "actor": { "kind": "agent", "id": "claude-code" },
    "client_op_id": "01JB8Q3XK2M4N6P8R0S2T4V6W8"
  },
  "focus": {
    "node_id": "extract_line_items",
    "node_kind": "llm",
    "excerpt": "extract_line_items: llm\n  model_role: extractor\n  out.total: Float\n  consumers: validate_totals",
    "upstream": ["parse_pdf"],
    "downstream": ["validate_totals"]
  },
  "problems": [],
  "candidates": [],
  "next": [
    { "tool": "flow_compile", "arguments": { "spec_id": "wf_invoice" }, "why": "Проверить, что тип разошёлся только здесь" },
    { "tool": "run_replay_node", "arguments": { "run_id": "0199a3f2-7c1e-7d4a-9b2e-5f8c1a2d3e4f", "address": { "node_id": "extract_line_items", "branch_key": null, "iteration": null, "item_index": null } }, "why": "Проверить фикс без полного прогона" }
  ],
  "refs": [],
  "ui_url": "http://127.0.0.1:5180/w/wf_invoice?node=extract_line_items&at=working",
  "truncated": null
}
```

### 3.3 Неуспешный ответ

Возвращается как обычный результат тула с `isError: true`, не как JSON-RPC error. Форма отказа расходится с
`ApiError` из [ADR-0028](adr/0028-studio-api-contract.md) §2 и [23](23-studio-api.md) §12.4 — открытый вопрос 14.

```jsonc
{
  "ok": false,
  "op": "flow_patch",
  "version": {
    "files": [{ "path": "flows/wf_invoice/nodes/extract_line_items.yaml", "file_hash": "sha256-7b40de…" }],
    "dirty": true,
    "actor": null,
    "client_op_id": null
  },
  "focus": {
    "node_id": "extract_line_items",
    "node_kind": "llm",
    "excerpt": "out.total: Text\n  consumers: validate_totals (ожидает Float)",
    "upstream": ["parse_pdf"],
    "downstream": ["validate_totals"]
  },
  "problems": [{
    "code": "TYPE_MISMATCH",
    "severity": "error",
    "at": { "node_id": "extract_line_items", "path": "out.total", "line": 21 },
    "message": "Узел отдаёт Text, потребитель validate_totals ждёт Float.",
    "evidence": { "observed": "\"1240.50\"", "expected_type": "Float", "run_id": "0199a3f2-7c1e-7d4a-9b2e-5f8c1a2d3e4f", "sample_span": "span_31" }
  }],
  "candidates": [{
    "id": "cand_1",
    "title": "Объявить total как Float в выходе узла",
    "confidence": 0.82,
    "rationale": "В 47/50 прогонов модель отдаёт число строкой; вход validate_totals уже строгий.",
    "risk": "low",
    "affects": ["validate_totals"],
    "apply": {
      "tool": "flow_patch",
      "arguments": {
        "spec_id": "wf_invoice",
        "expects": [{ "path": "flows/wf_invoice/nodes/extract_line_items.yaml", "file_hash": "sha256-7b40de…" }],
        "ops": [{ "op": "set", "path": "/nodes/extract_line_items/out/total/type", "value": "Float" }],
        "client_op_id": "01JB8Q4A7C9E1G3J5K7M9P1R3T"
      }
    }
  }],
  "next": [],
  "refs": [{
    "type": "resource_link",
    "uri": "aqven://run/0199a3f2-7c1e-7d4a-9b2e-5f8c1a2d3e4f/trace?node=extract_line_items",
    "name": "trace: extract_line_items",
    "mimeType": "application/json",
    "description": "Полный трейс узла, 34 KB"
  }],
  "ui_url": "http://127.0.0.1:5180/w/wf_invoice/run/0199a3f2-7c1e-7d4a-9b2e-5f8c1a2d3e4f?node=extract_line_items&problem=0",
  "truncated": { "fields": ["focus.excerpt"], "hint": "Полный текст: flow_get({spec_id:'wf_invoice',node_id:'extract_line_items',view:'raw'})" }
}
```

Ни один файл при этом не тронут: правило «сначала применить ops к дереву в памяти, потом
провалидировать инварианты, при ошибке не сериализовать» гарантирует, что `problems[]` описывают
состояние, которое **было бы**, а не записанное.

### 3.4 Как это возвращается из тула

```python
from typing import Protocol


class PatchFlow(Protocol):
    async def __call__(self, request: FlowPatchInput) -> Envelope: ...


def flow_patch_operation(patch_flow: PatchFlow) -> Operation[FlowPatchInput, Envelope]:
    return Operation(
        name="flow_patch",
        description=(
            "Атомарно применяет операции к файлам воркфлоу. "
            "Требует expects с хешами затрагиваемых файлов и client_op_id. "
            "При конфликте возвращает текущий хеш и предложение ребейза, "
            "а не голый отказ."
        ),
        input_model=FlowPatchInput,
        output_model=Envelope,
        surface="rest_and_mcp",
        use_case=patch_flow,
    )
```

Своего хендлера у тула нет. `Operation`, `ToolCall` и `tool_result` — [ADR-0028](adr/0028-studio-api-contract.md)
§2, `Envelope` — §3.1, `FlowPatchInput` — §9.2, `PatchFlow` — порт use-case'а, реализацию получает фабрика
(внедрение через параметр). `Operation.register_tool` оборачивает запись в `ToolCall` (Adapter) и регистрирует её
в `MCPServer`, маршрут `PATCH /api/flows/{flow_id}` вызывает тот же `invoke`. Выход use-case'а уходит с
`is_error=False`, `DomainError` — с `is_error=True` и моделью ошибки в `structuredContent`; поэтому отказ
§3.3 получается только через `DomainError`, а какая модель лежит в `structuredContent` — открытый вопрос 14.

Текст в `content[0].text` строит одно место — `tool_result`. Цель — компактный рендер для агента (фокус, до
трёх проблем, до трёх кандидатов); в пробе ADR-0028 это полный `model_dump_json()` — открытый вопрос 3.
Правило: агент читает текст, действует по `structuredContent`.

`title` и `annotations` заполняем у всех тулов, у `flow_patch` —
`ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False)`: Claude
Code показывает их человеку и оценивает риск. В сигнатуре `MCPServer.add_tool` 2.2.0 параметры `title`,
`annotations` и `meta` есть, а в записи `Operation` полей для них нет — открытый вопрос 19. Спецификация MCP
предупреждает, что клиент считает аннотации недоверенными, поэтому реальное принуждение прав — в §6, а не в
аннотациях.

## 4. Бюджет ответа

### 4.1 Жёсткие лимиты клиента

| Лимит | Значение | Источник | Что делаем |
|---|---|---|---|
| `MAX_MCP_OUTPUT_TOKENS` | 25 000 токенов на ответ тула по умолчанию, предупреждение на 10 000 | Claude Code | целимся в 2–4k, «толстым» тулам поднимаем потолок |
| `_meta['anthropic/maxResultSizeChars']` | до 500 000 символов, пер-тул | `tools/list` | ставим `200_000` только на `run_get_trace`, `flow_compile`, `experiment_compare` через `meta` тула (открытый вопрос 19) |
| `MCP_TOOL_TIMEOUT` | дефолт ~28 часов, пер-сервер `timeout` (мс, мин. 1000) | Claude Code | ставим `timeout: 120000` в `.mcp.json`; всё длиннее — асинхронный `run_id` + `run_get`, а не удержание вызова |
| Idle timeout | 5 мин (http/sse/ws), 30 мин (stdio) | Claude Code | долгие прогоны не держат стрим: `run_start` возвращает `run_id` сразу |
| Системный промт тулов | +286 токенов (`tool_choice: auto`) / +406 (`any\|tool`) для Opus 5 | platform.claude.com | учитываем в оценке, повлиять не можем |

### 4.2 `view` — три уровня детализации

Обязателен у всех тулов, чей ответ может превысить ~1k токенов. Это наш аналог `response_format`
Anthropic, где `concise` даёт примерно треть токенов от `detailed` без потери информации, нужной для
следующего вызова.

| `view` | Что входит | Целевой размер | Когда |
|---|---|---|---|
| `summary` (дефолт) | `focus` + до 3 `problems` + до 3 `candidates` + агрегаты; payload'ы обрезаны до 200 символов | ≤ 1 500 токенов | всегда первый вызов |
| `detailed` | все `problems`, все `candidates`, payload'ы обрезаны до 2 000 символов, промт узла целиком | ≤ 6 000 токенов | `summary` не хватило для решения |
| `raw` | без обрезки, только с явным `node_id` или `span_id` | до `maxResultSizeChars` | точечное чтение одного объекта |

`raw` без сужающего аргумента (`node_id`, `span_id`, `item_id`) отклоняется с
`problems[].code = 'VIEW_TOO_BROAD'` и кандидатом, подставляющим сужение. Дополнительно у трейсовых
тулов есть `include_payloads: 'none' | 'truncated' | 'full'` (дефолт `truncated`) — ортогональная ось:
`view` управляет шириной, `include_payloads` — глубиной каждого элемента.

### 4.3 Пагинация

Единая для всех листингов, без исключений:

```python
from pydantic import BaseModel, ConfigDict


class Page[T: BaseModel](BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[T]
    next_cursor: str | None
    total_estimate: int
```

Дефолтный `limit` — 20, максимум — 200. Курсор непрозрачный (base64 от `(sort_key, id)`), не offset:
история и трейсы дописываются во время листинга. `total_estimate` — именно оценка, точный `count` на
партиционированных `run_nodes` не считаем.

`tools/list` тоже пагинируется (`params.cursor` → `result.nextCursor`) — на поверхности из 18 тулов
это не нужно, но остаётся верным, если поверхность вырастет.

### 4.4 Что делаем при усечении

Усечение никогда не молчит. Правила:

1. Поле `truncated.fields[]` перечисляет **пути усечённых полей**, а не флаг «что-то обрезано».
2. `truncated.hint` — не констатация, а стратегия: готовый вызов, который добирает недостающее с
   сужением. Сообщение об усечении обязано подсказывать «делай точечные запросы», иначе агент
   повторит тот же широкий вызов.
3. Усечение никогда не затрагивает `problems[]` и `candidates[]` — сначала режутся `excerpt`,
   payload'ы, `items[]`, и только если этого не хватило, ответ отдаётся с `ok: false` и
   `code = 'RESPONSE_BUDGET_EXCEEDED'` плюс кандидатом на сужающий вызов.
4. Порядок деградации фиксирован таблицей, а не эвристикой:

| Шаг | Что режем | До какого размера |
|---|---|---|
| 1 | `focus.excerpt` | 15 строк вокруг узла |
| 2 | payload'ы элементов | 200 символов + `…(N байт)` |
| 3 | `items[]` | до `limit`, остаток — за `next_cursor` |
| 4 | `candidates[]` | топ-3 по `confidence` |
| 5 | `problems[]` | топ-3 по `severity`, остальные — счётчиком `problems_omitted` |
| 6 | — | `ok:false`, `RESPONSE_BUDGET_EXCEEDED` |

5. Всё, что вырезано, остаётся достижимым по `refs[]` — `resource_link` с `uri` вида
   `aqven://run/<run_id>/trace?node=<node_id>` и честным размером в `description`. Ссылка не
   обязывает клиента поддерживать MCP resources: тот же объект достаётся тулом, указанным в
   `truncated.hint`.

## 5. Фазовое раскрытие тулов — отменено

**Отменено [ADR-0042](adr/0042-mcp-is-the-action-surface.md).** Раскрытие проектировалось под 78–79 тулов:
при 250–600 токенах на определение со сложной схемой это 20–47k токенов **до первого сообщения
пользователя**, и цель была держать одновременно активными ≤ 20–25. Поверхность — 18 тулов действий (§2),
их определения стоят порядка 3k токенов, то есть дешевле, чем `mode_set` и `help_contract`, которыми
раскрытие управлялось бы.

Механизм и не был доступен: у `MCPServer` 2.2.0 нет `RegisteredTool.enable()/disable()`
([ADR-0025](adr/0025-python-engine.md) §8, открытый вопрос 18), а подменять каталог через приватный
`_tool_manager` запрещено ([ADR-0028](adr/0028-studio-api-contract.md) «Альтернативы»).

Что остаётся вместо раскрытия:

| Было в плане | Стало |
|---|---|
| `mode_set` переключает фазу и включает группы | фазы нет, поверхность одна |
| `help_contract` объясняет контракт и текущую фазу | `instructions` сервера MCP: порядок работы в одном абзаце, его видит клиент при `initialize` |
| Ядро из 13 тулов, из которых достижимы остальные | все 18 доступны всегда |
| `studio_open` строит `ui_url` | `ui_url` приходит полем в `RunStarted` |

Возврат к раскрытию — когда поверхность перевалит за 40 тулов; до тех пор цена механизма выше цены
определений.

## 6. Права агента

### 6.1 Матрица (§13.2 в терминах тулов и скоупов)

Матрица — целевая модель для актора с токеном. На loopback `aqven dev` аутентификации нет
([23](23-studio-api.md) §1.1): пользователь процесса один, скоупы не проверяются; механизм токена для
`aqven serve` вне loopback не выбран — открытый вопрос 6. Уровень 4 (§6.2) действует в обоих режимах:
аппрув заявок и перехват лока в MCP-поверхности отсутствуют ([23](23-studio-api.md) §13.3).

| Действие | Может | Тулы | Скоуп |
|---|---|---|---|
| Править черновики спеки и шаблоны промтов | да | `flow_create`, `flow_patch`, `flow_import`, `flow_lock`, `context_bind` | `workflows:write` |
| Определять компоненты внутри воркфлоу | да | `flow_patch` (файл компонента), `component_expand` | `workflows:write` |
| Компилировать | да | `flow_compile` | `workflows:read` |
| Запускать прогоны, реплеи, форки | да | `run_start`, `run_replay_node`, `run_fork` | `runs:execute` |
| Создавать датасеты и скореры | да | `dataset_*`, `scorer_create` | `evals:write` |
| Запускать эксперименты и сравнивать | да | `experiment_*`, `feedback_list` | `evals:write` |
| Предлагать версии | да | `version_propose` | `versions:propose` |
| **Выпускать версии** | нет | — | `versions:release` агенту не выдаётся |
| **Добавлять компоненты в общую библиотеку** | нет | `component_propose_to_library` создаёт заявку, не запись | `library:propose` |
| **Менять реестры и политики** | нет | `registry_propose` создаёт заявку | `registry:propose` |
| **Читать секреты** | нет | тула нет вообще | — |
| **Использовать что-либо вне ядра, библиотеки и своих компонентов** | нет | принуждается компилятором | — |

### 6.2 Как это принуждается технически

Четыре уровня, каждый закрывает свой класс обхода. Аннотации тулов (`readOnlyHint`,
`destructiveHint`) в этот список **не входят**: спецификация MCP прямо говорит, что клиент считает их
недоверенными, это подсказка человеку, а не контроль.

**Уровень 1 — токен.** В `aqven serve` агент получает собственный credential, привязанный к тройке
(user, tenant, scopes), и никогда — сессионную cookie человека (иначе теряется аудит «кто сделал»).
Скоупа `versions:release`, `library:write`, `registry:write`, `secrets:read` в токене агента нет
физически, поэтому эскалация внутри MCP невозможна.

**Уровень 2 — эндпоинт.** Токен проверяется до вызова тула на всём эндпоинте `/mcp/`, поэтому там стоит
минимальный общий набор (`mcp:use`). В `mcp` 2.2.0 для этого есть `MCPServer(token_verifier=...,
auth=AuthSettings(...))`; поведение и доступ обёртки тула к токену не проверены — открытый вопрос 6.

**Уровень 3 — тул.** Гранулярность на группу проверяется в общей обёртке вызова (Decorator над use-case),
никакой логики в самих тулах:

```python
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True, slots=True)
class Actor:
    kind: Literal["human", "agent"]
    id: str
    scopes: frozenset[str]


TOOL_SCOPES: Mapping[ToolName, frozenset[str]] = {
    ToolName("flow_patch"): frozenset({"workflows:write"}),
    ToolName("run_start"): frozenset({"runs:execute"}),
    ToolName("version_propose"): frozenset({"versions:propose"}),
    ToolName("registry_propose"): frozenset({"registry:propose"}),
    ToolName("component_propose_to_library"): frozenset({"library:propose"}),
}


def require_scopes(actor: Actor | None, tool: ToolName) -> Actor:
    if actor is None:
        raise DomainError(unauthorized(tool))
    missing = TOOL_SCOPES.get(tool, frozenset()) - actor.scopes
    if missing:
        raise DomainError(forbidden(tool, missing))
    return actor
```

`ToolName` — из §5.4, `DomainError` — [ADR-0028](adr/0028-studio-api-contract.md) §2, `unauthorized` и
`forbidden` — фабричные функции `ApiError`. `DomainError` транслируется в `ApiError` с
`code: 'FORBIDDEN'` тем же транслятором, что и REST ([ADR-0028](adr/0028-studio-api-contract.md) §2, правило 5;
403 в [23](23-studio-api.md) §12.5). Кандидатов такой ответ не несёт — предлагать агенту обход прав нельзя;
вместо этого `next[]` содержит `studio_open` с `elicit: true`, то есть отправляет решение человеку (поля
`next[]` в `ApiError` нет — открытый вопрос 14). Откуда обёртка берёт `Actor` в `mcp` 2.2.0 — открытый вопрос 6.

**Уровень 4 — домен.** То, что нельзя выразить скоупом:
- **Заявка вместо записи.** `registry_propose`, `version_propose`, `component_propose_to_library`
  пишут в таблицу заявок со статусом `pending_approval` и возвращают `ui_url` на экран аппрува. Тула,
  переводящего заявку в `approved`, в MCP-поверхности не существует — этот переход есть только в
  REST под человеческой сессией ([23](23-studio-api.md) §13.3). Разделение принуждается тем, что MCP и Studio
  ходят в разные use-case'ы, а не разными правами на один.
- **Секреты.** В реестре нет группы `secret_*`. Ключи провайдеров никогда не попадают в IR: узел
  ссылается на профиль модели, профиль — на ссылку `secret_ref`, разрешение ссылки происходит
  в исполнителе узла на сервере. В `run_get_node` и `run_get_trace` поля с `secret_ref`
  редактируются до отдачи, независимо от `view` и `include_payloads`.
- **Границы «ядро + библиотека + свои компоненты».** Это инвариант компилятора, а не прав доступа:
  `flow_patch` с операцией, ссылающейся на неразрешённый компонент, откатывается с
  `code: 'COMPONENT_NOT_ALLOWED'`. Проверка одна и та же для агента и для Studio, потому что обе
  правки идут через один и тот же валидатор.

### 6.3 Аудит

Актор пишется трейлерами коммита (`actor_kind`, `actor_id`, `session_id` MCP), `git author` различает
человека и агента; коммит пишет dulwich 1.2.15 за `GitPort` ([ADR-0025](adr/0025-python-engine.md) §8).
`journal_append` агент вызывает сам, но журнал решений — не источник истины об изменениях: истина —
git-история, в которую агент пишет только через `flow_commit`, и рабочее дерево, за которым следит наблюдатель.

## 7. Транспорт и авторизация

### 7.1 Входы и одна поверхность тулов

| Сценарий | Транспорт | Механизм | Авторизация |
|---|---|---|---|
| Локальный Claude Code рядом с проектом, `aqven dev` | streamable HTTP, `http://127.0.0.1:5180/mcp/` | `MCPServer("aqven").streamable_http_app(streamable_http_path="/")`, маунт `/mcp` в FastAPI | нет: loopback, `TrustedHostMiddleware`, `TransportSecuritySettings` ([23](23-studio-api.md) §1.1) |
| Модуль как сервис: `aqven serve`, удалённый агент, CI | streamable HTTP | тот же маунт, подмножество каталога ([23](23-studio-api.md) ОВ 14) | не выбрана — открытый вопрос 6 |
| Локальный запуск без HTTP | stdio | `MCPServer.run(transport="stdio")` | окружение процесса; нужен ли этот вход — открытый вопрос 17 |

Legacy HTTP+SSE (протокол 2024-11-05) не поддерживаем. `ws` из Claude Code не используем: он доступен
только через `claude mcp add-json` и ничего не добавляет поверх Streamable HTTP.

MCP живёт на порту FastAPI ([ADR-0028](adr/0028-studio-api-contract.md) §3): lifespan приложения входит в
`session_manager.run()`, потому что у смонтированного подприложения свой lifespan не выполняется; путь — `/mcp/`
со слешем (без слеша каждый запрос стоит редиректа 307); в OpenAPI маунт не попадает; статика студии отдаёт
`index.html` только на пути вне `/api` и `/mcp/`. Каркас `create_app` — [23](23-studio-api.md) §2.

Регистрация у клиента ([23](23-studio-api.md) §13.1):

```bash
claude mcp add --transport http aqven http://127.0.0.1:5180/mcp/
```

В репозиторий воркфлоу коммитится `.mcp.json` (project-скоуп) с тем же адресом; порт задаёт
`aqven dev --port` ([23](23-studio-api.md) §1.1). Подстановка `${VAR}` (`${CLAUDE_PROJECT_DIR}`, токен
`aqven serve`) при отсутствующей переменной даёт предупреждение, а не падение, поэтому `help_contract`
обязан уметь отвечать «токен не подставлен» вместо 401 без объяснения.

### 7.2 Сессии Streamable HTTP

`streamable_http_app` по умолчанию stateful (`stateless_http=False`, [research/py-stack-runtime.md](research/py-stack-runtime.md)
§7) — этот режим нужен фазовой поверхности: она привязана к сессии. Состояние сессии SDK держит в памяти
процесса, поэтому при нескольких репликах `aqven serve` нужен sticky-routing по `Mcp-Session-Id` либо общее
хранилище событий; возобновление по `Last-Event-ID`, хранилище событий и ответ на неизвестный
`Mcp-Session-Id` в `mcp` 2.2.0 не проверены — открытый вопрос 18. `aqven dev` — один процесс, его вопрос не
блокирует.

Долгие операции не держат вызов тула: `run_start` сразу возвращает `run_id`, дальше — `run_get` или
run-канал SSE ([23](23-studio-api.md) §11.2); idle-таймаут клиента в 5 минут (§4.1) не срабатывает.

CORS не включается ([23](23-studio-api.md) §1.1): один origin, браузерного MCP-клиента нет, студия ходит в
REST. Защита от DNS rebinding — `TrustedHostMiddleware` на всём приложении (чужой `Host` → 400) и
`TransportSecuritySettings` у `/mcp/` (по умолчанию только localhost, иначе 421).

### 7.3 Мы Resource Server, а не Authorization Server

Принцип остаётся: свою выдачу токенов (OAuth 2.1 Authorization Server) не пишем — токен выдаёт внешний IdP,
сервер его проверяет. Прежний механизм (`mcpAuthMetadataRouter` и `requireBearerAuth` TS SDK поверх
better-auth) ушёл вместе с TS-стеком ([ADR-0028](adr/0028-studio-api-contract.md) «Документы, которые
становятся неверными»). На loopback `aqven dev` авторизации нет. Для `aqven serve` вне loopback у `MCPServer`
2.2.0 есть `token_verifier` и `auth: AuthSettings`; публикация метаданных защищённого ресурса, ответ 401 с
`WWW-Authenticate` для браузерного OAuth-флоу Claude Code и выбор IdP не проверены — открытый вопрос 6
([ADR-0028](adr/0028-studio-api-contract.md) ОВ 7, [23](23-studio-api.md) ОВ 14).

Целевой набор скоупов: `mcp:use`, `workflows:read`, `workflows:write`, `runs:execute`, `evals:write`,
`versions:propose`, `registry:propose`, `library:propose`.

**Скоупы — на группу тулов, не на тул.** Проверка на эндпоинте отвечает на вопрос «этот токен вообще наш» и
требует только `mcp:use`; пер-тульная проверка — `require_scopes(actor, tool)` в общей обёртке вызова (§6.2).
Верификатор токена — Strategy: смена IdP означает замену верификатора, контракт тулов не меняется; тот же
верификатор стоит на REST `aqven serve`, поэтому агент и студия видят одного `Actor`.

### 7.4 Что не строим на клиентских возможностях

| Возможность MCP | Claude Code | Наше решение |
|---|---|---|
| tools | поддерживается полностью | **весь контракт живёт здесь** |
| elicitation (form и URL) | поддерживается | используем URL-форму для аппрувов через `studio_open`; метод `mcp` 2.2.0 — открытый вопрос 21 |
| resources | в доках не заявлена | только `refs[]` как ссылки; ни одна обязательная информация не доступна **только** через resource |
| prompts как slash-команды | в доках не заявлена | не используем; протокол цикла — скилл (§8) |
| sampling | не поддерживается | не используем вообще |

Отсюда же следует, почему протокол цикла — Agent Skill, а не MCP prompt.

## 8. Протокол цикла (§13.3) как скилл

### 8.1 Где лежит и как версионируется

Скилл `aqven-workflow-loop` едет **Project-скоупом** в репозитории воркфлоу:
`<repo>/.claude/skills/aqven-workflow-loop/SKILL.md`, коммитится в git. Это единственный уровень, на
котором скилл версионируется вместе со спекой: Enterprise и Personal живут вне репозитория и имеют
более высокий приоритет при совпадении имён (Enterprise > Personal > Project), поэтому имя намеренно
специфичное — перебить его случайным одноимённым Personal-скиллом нельзя.

Генератор проекта кладёт рядом короткий `AGENTS.md`/`CLAUDE.md`: как подключить MCP-сервер `aqven dev`
(`.mcp.json`), какая фаза цикла текущая, ссылка на скилл. Контракт тулов туда **не** дублируется — он в
`tools/list` и в `help_contract`.

Версия скилла привязана к мажору контракта: `metadata.contract_version: "1"`. Несовпадение с тем, что
вернёт `help_contract`, — предупреждение в первом же ответе тула.

### 8.2 Структура бандла

```
.claude/skills/aqven-workflow-loop/
  SKILL.md            обзор + инвариант цикла + навигация, < 500 строк
  reference.md        коды проблем, семантика фаз, полный реестр тулов с аргументами
  examples.md         разобранные эпизоды: STALE_FILE, TYPE_MISMATCH, срыв гейта
  scripts/
    check_loop_state.sh   печатает фазу, чистоту дерева, статус последнего прогона
  data/
    archetypes.json       локальная копия каталога архетипов для офлайн-навигации
```

Три уровня раскрытия работают так: `name` + `description` грузятся всегда (постоянная цена
контекста), тело SKILL.md — при вызове, `reference.md` / `examples.md` / `data/` — только когда агент
их реально читает. Скрипты исполняются **без загрузки в контекст**, через
`allowed-tools: Bash(bash ${CLAUDE_SKILL_DIR}/scripts/check_loop_state.sh *)` — это главный приём
экономии: состояние цикла добывается командой, а не чтением файла.

### 8.3 Frontmatter

Держим **переносимое подмножество спецификации Agent Skills**: `name`, `description`, `license`,
`compatibility`, `metadata`, `allowed-tools`. Все прочие поля — Claude-Code-only и вызывают ошибку
при загрузке скилла на claude.ai / через Skills API. Claude-Code-специфика (`context: fork`, `agent`,
`model`, `effort`, `disallowed-tools`, `argument-hint`, `hooks`) живёт в отдельном варианте бандла для
внутреннего использования, не в публикуемом.

Ограничение: `description` + `when_to_use` суммарно ≤ 1536 символов.

### 8.4 Что обязано быть в первых 5000 токенов SKILL.md

Критично и не подлежит обсуждению: при авто-компакции контекста после вызова скилла
переприкрепляются **первые 5000 токенов** последнего вызова. Всё, что дальше, агент теряет посреди
длинной сессии отладки — то есть ровно тогда, когда протокол нужен больше всего.

Поэтому в первых 5000 токенах:

1. **Инвариант цикла** — десять шагов §13.3 в терминах тулов, одной таблицей.
2. **Правила остановки** — не больше 5 итераций улучшения; стоп после двух итераций без прогресса.
3. **Правила безопасности** — агент не выпускает версии, не пишет в реестры и библиотеку, не читает
   секреты; `*_propose` создаёт заявку, а не запись.
4. **Правило действия по `candidates[]`** — если ответ содержит кандидата с `confidence ≥ 0.7` и
   `risk: 'low'`, следующий шаг — его `apply`, а не собственная конструкция патча.
5. **Правило конфликта** — `STALE_FILE`: не перечитывать проект целиком, а перечитать пути из
   `conflict` и применить `conflict.rebased_ops`, если сервер их вернул; иначе переиграть намерение на
   свежих хешах — перезапись силой запрещена.
6. **Навигация** — «коды проблем → reference.md», «разобранные случаи → examples.md», «состояние →
   scripts/check_loop_state.sh».

За пределы 5000 токенов уходит всё остальное: подробности аргументов тулов, описания архетипов,
примеры. Аудит стоимости — `/skill-doctor`.

### 8.5 Протокол §13.3 в терминах тулов

| Шаг | Тулы | Фаза | Условие перехода дальше |
|---|---|---|---|
| 1. Ориентация | `journal_read`, `brief_get`, `catalog_list` | discover | бриф прочитан |
| 2. Архитектура | `architecture_search` → `architecture_get` → `architecture_instantiate`; при сыром описании процесса сначала скилл `agentic-process-spec`, затем `flow_import` | discover → author | выбор записан `journal_append` |
| 3. Контекст | `context_plan` → `context_bind` → `context_graph` | author | правила R-C зелёные |
| 4. Воркфлоу и промты | `flow_patch` (циклом) → `flow_compile` | author | `flow_compile` без `severity: 'error'` |
| 5. Судьи и циклы | `flow_patch` (панели, лимиты итераций) → `flow_compile` | author | компиляция чистая |
| 6. Датасеты | `dataset_generate` → `dataset_coverage` | evaluate | покрытие достигло целей |
| 7. Тест узлов | `experiment_run` (scope: node) → `experiment_model_matrix` | evaluate | модель выбрана по границе Парето |
| 8. Тест воркфлоу | `run_start` (на датасете) → `run_stages` → `run_blame` | run → debug | виновный узел локализован или прогон зелёный |
| 9. Улучшение | `flow_patch` → `experiment_run` → `experiment_compare` | evaluate | ≤ 5 итераций; стоп после двух без прогресса |
| 10. Выпуск | `version_propose(evidence)` → аппрув человека → `journal_append` | ship | `version_status.gate.verdict = PASS` и аппрув получен |

Шаг 10 намеренно не может быть завершён агентом: `version_propose` возвращает
`status: 'pending_approval'`, перевод в `approved` доступен только человеку в Studio (§6.2).

### 8.6 Жизненный цикл скилла в сессии

Отрендеренный скилл входит одним сообщением и остаётся в контексте на следующих ходах; повторный
идентичный вызов даёт короткую пометку вместо полного текста. Грант `allowed-tools` снимается после
следующего сообщения — это не постоянные права, поэтому на `allowed-tools` нельзя вешать разрешение
чего-либо важного; реальные права агента — в токене (§6).

## 9. Конкурентное редактирование

### 9.1 Кто с кем конкурирует

Редакторов двое: агент через MCP и человек в Studio. Одновременных редакторов — единицы, не сотни;
конфликтов мало. Агент пишет **операции**, а не символы: у него нет курсора и посимвольного ввода,
ему не нужно видеть чужие буквы в реальном времени.

### 9.2 Единица записи — `flow_patch`

```python
from typing import Annotated, NewType

from pydantic import BaseModel, ConfigDict, Field

FlowId = NewType("FlowId", str)
Ulid = Annotated[ClientOpId, Field(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")]


class ExpectedFile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str
    file_hash: FileHash | None


class FlowPatchInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    spec_id: FlowId
    expects: Annotated[list[ExpectedFile], Field(min_length=1)]
    ops: Annotated[list[Op], Field(min_length=1, max_length=50)]
    client_op_id: Ulid
    intent: str | None = None
    expect_lock: bool = False
    exclusive: bool = False
    dry_run: bool = False
```

`ClientOpId` и `FileHash` — из §3.1; `Op` — дискриминированный union операций `add_node`, `bind`, `set`,
`remove` по полю `op` (состав — [31](31-canvas-editing.md) §Жесты). Модель — вход и тула, и тела
`PATCH /api/flows/{flow_id}` ([23](23-studio-api.md) §12.1).

`expects[]` — compare-and-swap по sha256 байтов каждого затрагиваемого файла; `file_hash: null` означает
«файла быть не должно» (создание). Переименование узла дописывает журнал `renames` в `aqven.yaml`, поэтому
`aqven.yaml` входит в `expects`. `client_op_id` — ULID, обязателен: повтор с тем же значением возвращает
результат первой попытки (`app.write_intents`, [16](16-data-model.md) §2.3), а не применяет операции дважды;
по нему же студия отличает свой патч от чужого в spec-канале. `dry_run` заменяет отдельный тул валидации;
`intent` уходит в ленту и трейлер коммита, `expect_lock` и `exclusive` — как в [23](23-studio-api.md) §12.1.

Алгоритм сервера:

1. Захват межпроцессной блокировки `.aqven/lock` (`O_EXCL`, pid + ttl + heartbeat); занята — `LOCK_BUSY` (423).
2. Пересчёт хешей всех путей из `expects[]`. Расхождение → отказ с кодом `STALE_FILE`, `FILE_VANISHED` или
   `FILE_EXISTS` (412) и блоком
   `conflict { path, your_hash, current_hash, ops_since[], rebase: 'auto' | 'manual', rebased_ops[] }`.
   Ответ не голый отказ: правки в разные файлы и разные узлы ребейзятся автоматически. Ручное
   разрешение нужно при пересечении путей, и тогда `rebase: 'manual'`, а `candidates[]` содержит
   варианты «взять моё» / «взять их». Силовой перезаписи нет: клиент перечитывает файл и переигрывает намерение.
3. Применить `ops` к дереву проекта **в памяти** → валидатор (типы портов, DAG, обязательные
   биндинги, межфайловые ссылки, границы разрешённых компонентов) → `blocking`-диагностика: ничего
   не сериализуется, отказ `BLOCKING_PROBLEMS` с `problems[]` + `candidates[]`.
4. Транзакция записи: staging `.aqven/txn/<ulid>` с полными новыми версиями файлов в каноническом YAML,
   `intent.json` как точка невозврата, серия атомарных `rename(2)`, снятие лока
   ([files-first/write-model.md](files-first/write-model.md)), переиндексация и событие spec-канала.
5. Ответ несёт `version{files[{path, file_hash}], dirty, actor, client_op_id}`, `changed_paths[]` и
   `applied_ops[]`. Коммита здесь нет: дерево остаётся грязным до явного `flow_commit` (§9.3).

### 9.3 История и коммит поверх git

Таблица `app.spec_ops` перестаёт быть источником истины: историю ведёт git — коммит на эпизод правки,
актор в трейлерах, откат только вперёд ([files-first/history.md](files-first/history.md)); коммиты пишет
dulwich 1.2.15 за `GitPort` без бинарника git ([ADR-0025](adr/0025-python-engine.md) §8). В схеме
`idx` op-log остаётся кэшем-проекцией, на котором стоят `version_propose(evidence)` и `run_lineage`.

```
flow_commit({ paths[], message, intent? })
  -> { commit, files: [{path, file_hash, status}], compile: {ok, problems[]} }

flow_history({ path?, spec_id?, since?, until?, actor_kind?, limit=20, cursor?, view='summary' })
  -> { items: [{commit, parent, actor_kind, actor_id, at, message, intent,
                files: [{path, status}], summary: {added, removed, changed}}], next_cursor }

flow_diff({ from: commit|'working', to: commit|'working', path?, scope='semantic'|'text', view })
  -> { deltas: [{path, node_id?, kind, before, after}], layout_changed, problems[] }

flow_revert({ to: commit, paths?, message, base: {commit}, dry_run=false })
  -> { commit, reverted: [{commit, files[]}], compile: {ok, problems[], candidates[]}, conflicts[] }
```

`flow_diff` по умолчанию семантический: сравниваются нормализованные IR, причём IR ревизии строится из
YAML-файлов этой ревизии — в git он не коммитится ([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §9);
`scope: 'text'` даёт обычный git-дифф для YAML, промтов и markdown. `flow_revert` создаёт новый коммит с
обратными изменениями (как `git revert`, не `reset`) и прогоняет валидатор: ломающий компиляцию откат отдаёт
`compile.ok=false`. Агент откатывает свои коммиты (по трейлеру `actor_id`), чужие — `FORBIDDEN` +
`next[] = studio_open(elicit)`. `spec_ops_read` и `version_diff` отменяются: первый — это `flow_history`,
второй — `flow_diff`.

### 9.4 Тот же CAS на HTTP

`PATCH /api/flows/{flow_id}` принимает то же тело, что `flow_patch`, и вызывает тот же use-case
([23](23-studio-api.md) §12.1); расхождение хеша → `412` с `ApiError` и тем же блоком `conflict`
([23](23-studio-api.md) §12.4–§12.5). `If-Match` для многофайловой правки не используется: условие CAS одно на
набор путей и живёт в теле ([ADR-0028](adr/0028-studio-api-contract.md) §6). `ETag` по хешам входящих файлов и
`If-None-Match` → 304 остаются только для кэша чтения ([23](23-studio-api.md) §1.3). Ось версий одна в обоих
каналах: `expects[].file_hash` у MCP и REST — один и тот же хеш байтов, а не две независимые схемы.

Живые обновления UI: наблюдатель `watchfiles` на дереве → spec-канал SSE `GET /api/events/spec` с событием
`files_changed{changes[{path, change, file_hash_before, file_hash_after}], actor, client_op_id}` и
`Last-Event-ID` = `seq` ([23](23-studio-api.md) §11.1) → Studio перечитывает изменившиеся пути, кэш TanStack
Query инвалидируется по паре `path` + `file_hash`. Никакого клиентского слияния — «сервер сказал, что файл
стал таким, вот дельта».

### 9.5 Advisory-lock

`flow_lock({ spec_id, ttl_s: 300 })` — мягкая блокировка на время работы агента: lockfile в дереве
проекта, видимый в `git status` и переживающий рестарт сервера. Studio показывает «Claude
редактирует», человек может перехватить принудительно — только по REST, в MCP перехвата нет
([23](23-studio-api.md) §12.3). Это организационное устранение большинства конфликтов, которое дешевле,
чем их разруливание. Лок не обязателен и не отменяет CAS: истёкший по TTL лок не даёт права записать
поверх изменившегося файла. Межпроцессный `.aqven/lock` (§9.2) — другая сущность: он держится на время
одной транзакции записи, а не сессии редактирования.

### 9.6 Почему не CRDT

`yjs@13.6.32` и `loro-crdt@1.16.1` — живые библиотеки (MIT, npm; рассматривались при TS-стеке), и правило
«не изобретать велосипед» обычно требует взять готовое. Здесь оно работает в обратную сторону: CRDT решает
**не нашу задачу**.

1. **CRDT гарантирует сходимость, но не валидность.** Агент удалил узел, человек в это же время
   привязал к нему порт — слияние даст структурно целое, но семантически битое состояние. Инварианты
   домена (типы портов, DAG без циклов, обязательные биндинги) вне компетенции CRDT.
2. **Нужна линейная история ревизий.** `version_propose(evidence)` и `run_diff` требуют, чтобы каждая
   версия имела предшественника; линейную историю даёт git, и она нужна в любом случае.
3. **Профиль нагрузки не тот.** Единицы редакторов, операции вместо символов, мало конфликтов.
4. Поверх CRDT всё равно пришлось бы строить серверную валидацию и линеаризацию истории — то есть то
   же самое плюс лишний слой и лишний размер бандла.

Где CRDT уместен и может быть добавлен точечно позже: свободный текст шаблона промта **внутри одного
узла** и позиции узлов на канве (last-write-wins по полю). Не для структуры графа.

## 10. Связка со скиллом agentic-process-spec (§13.4)

### 10.1 Точка входа

Если у пользователя есть только сырое описание процесса, шаг 2 протокола (§8.5) уходит в скилл
`agentic-process-spec`: он ведёт человека по девяти вопросам на каждый шаг процесса и порождает
документ `agent_workflow_spec` (раздел 12 спеки). Дальше `flow_import({ source: { kind:
'agent_workflow_spec', payload }, client_op_id })` превращает его в **черновик воркфлоу**: YAML-файлы
`flows/<flow_id>/flow.yaml` и `nodes/*.yaml` в рабочем дереве ([ADR-0026](adr/0026-yaml-spec-and-code-refs.md)
§1–§2), IR из них строит компилятор. Импорт — не «как-нибудь разберём текст»: девять вопросов отображаются в
обязательные ключи узла один к одному.

### 10.2 Таблица «вопрос скилла → ключ узла»

| Вопрос скилла | Ключ файла узла (YAML → IR) | Тип | Что значит «не отвечен» |
|---|---|---|---|
| Цель шага | `description` | `Text` (непустая) | пусто или плейсхолдер |
| Кто исполняет | `node` + `archetype` + `model_role` (у `llm`) или `assignee` (у `human`) | вид узла из закрытого набора ([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1) + id архетипа + `Text` | `archetype` не из каталога архетипов или роль не задана |
| Входные сущности | `in[]` — поля `{name, type, description, from}` | список полей с TypeId | пустой список при виде, требующем вход |
| Выходные сущности | `out[]`; у `human` — `form` | список полей с TypeId; TypeId записи реестра | пусто или тип не зарегистрирован |
| Какое решение принимается | узел `switch` с `cases` по enum | enum + ветки | ветки не покрывают enum |
| Блокирующий ли шаг | узел `gate` или `node: human` | дискриминированный union по `node` | ни `gate`, ни `human`, ни явное `blocking: false` |
| Можно ли параллелить | узел `parallel` или `map` + политика сведения | вид конструкции + политика join | `parallel` без `join` |
| Какие проверки | `validators[]` + `scorers[]` | массивы ссылок | оба пусты при виде, требующем проверки |
| Что при сбое | `on_error` + `timeout_ms` + политика повторов; у `human` — `timeout_seconds` и `on_timeout` ([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §13) | union политик | `on_error` (у `human` — `on_timeout`) отсутствует |

### 10.3 Неотвеченный вопрос — ошибка компиляции

Это главное следствие §13.4 и то, что делает метод машинно проверяемым. Механика:

- каждая строка таблицы 10.2 порождает правило компилятора семейства `R-Q1..R-Q9`;
- `flow_import` не отклоняет неполный документ — он пишет черновик в файлы и возвращает `problems[]` с
  этими кодами, чтобы агент видел, чего не хватает, и мог достроить;
- `flow_compile` и `aqven check` на том же черновике возвращают те же коды с `severity: 'error'`, то есть
  спека с неотвеченным вопросом **не компилируется** и не может дойти до `version_propose`;
- каждая проблема несёт `candidates[]` там, где ответ выводим: недостающий `join` при `parallel`,
  недостающая ветка `switch` для непокрытого значения enum, дефолтный `on_error` из архетипа. Там,
  где ответ не выводим (цель шага, роль исполнителя), кандидатов нет и `next[]` содержит
  `studio_open` с `elicit: true` — вопрос уходит человеку.

Таким образом ни один узел не может доехать до выпуска, пока на все девять вопросов нет ответа в
машиночитаемом виде, и это проверяется тем же компилятором, что и типы портов, — отдельного
«валидатора полноты» нет.

### 10.4 Обратное направление

Восстановление документа скилла из воркфлоу (`project_export` с целью `agent_workflow_spec`) после отмены
экспорта не решено — открытый вопрос 16. Прежняя сверка «импорт → экспорт → импорт» конформанс-набором
`project_conformance` отменена вместе с группой `export` решением владельца от 2026-09-16
([ADR-0025](adr/0025-python-engine.md) §7).

## Открытые вопросы

1. ~~**Поведение Claude Code при `notifications/tools/list_changed` в середине сессии не проверено.**~~
   Закрыт отменой фазового раскрытия ([ADR-0042](adr/0042-mcp-is-the-action-surface.md), §5): поверхность
   не меняется в течение сессии, и перечитывание `tools/list` ни на что не влияет.

2. **Точная регулярка имени тула в Messages API не подтверждена.** Известно, что точка в именах —
   гарантированный источник проблем, и решение переименовать §13.1 в `snake_case` принято, но точный
   паттерн (предположительно `^[a-zA-Z0-9_-]{1,128}$`) первоисточником не подтверждён.
   *Что сделать:* проверить `platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools` и
   зафиксировать в CI линтер имён тулов.

3. **Текст ответа тула и бюджет.** `tool_result` ([ADR-0028](adr/0028-studio-api-contract.md) §2) кладёт в
   `content[0].text` полный `model_dump_json()` рядом со `structuredContent`, а §3.4 требует компактный рендер
   (фокус, до трёх проблем и кандидатов). Если Claude Code кладёт в контекст оба канала, бюджет §4 съедается
   вдвое. *Что сделать:* на живом Claude Code с `mcp` 2.2.0 сравнить расход контекста на ответ с полным JSON в
   тексте и с компактным рендером; итог закрепить в `tool_result` (одно место).

4. **Формальная таблица коммутативности операций для автоматического ребейза (§9.2, шаг 2) не
   составлена.** Сейчас «большинство конфликтов ребейзятся автоматически» — утверждение без
   доказательства. *Что сделать:* спроектировать матрицу пар `op × op` («независимы / конфликтуют /
   требуют ручного разрешения») вместе с компилятором ([07. Компилятор](07-compiler.md)) и покрыть
   property-тестами; инструмент property-based тестирования для Python не выбран — выбрать при чистке
   [20](20-repo-and-tooling.md).

5. **Доступен ли Tool Search Tool внутри Claude Code для MCP-тулов.** Если да, фазовое раскрытие можно
   упростить до организующего приёма. *Что сделать:* проверить на живой сессии; решение §5.6 до тех
   пор не меняется.

6. **Авторизация `aqven serve` вне loopback.** На loopback `aqven dev` аутентификации нет
   ([23](23-studio-api.md) §1.1). Для `aqven serve` у `MCPServer` 2.2.0 есть `token_verifier` и
   `auth: AuthSettings`, но их поведение, публикация метаданных защищённого ресурса, ответ 401 с
   `WWW-Authenticate` для OAuth-флоу Claude Code (Dynamic Client Registration) и то, как общая обёртка §6.2
   получает `Actor`, не проверены; IdP не выбран, прежняя опора на better-auth ушла вместе с TS-стеком. В
   реестре — [ADR-0028](adr/0028-studio-api-contract.md) ОВ 7, [23](23-studio-api.md) ОВ 14. *Что сделать:*
   решить в ADR, который требует ADR-0028 ОВ 7: подмножество каталога, механизм токена для REST и `/mcp/`, IdP;
   пробой проверить `token_verifier` с двумя токенами разных скоупов и отказ `FORBIDDEN` из `require_scopes`.

7. **Расхождение префикса группы между исследованием и решениями.** В `research/mcp-server.md` §3.3
   предложен префикс `workflow_*` (`workflow_patch`, `workflow_get`), в DECISIONS закреплён `flow_*`
   (`flow_create`, `flow_patch`). Документ следует DECISIONS. *Что сделать:* зафиксировать `flow_*`
   как единственный вариант в `reference.md` скилла и в линтере имён, чтобы синонимичных тулов не
   возникло (`flow_get` и `workflow_get` одновременно — прямой антипаттерн выбора тула у агента).

8. **`dry_run` флагом или отдельным тулом `flow_validate`.** Принято решение в пользу флага (§2.3,
   §9.2) ради сокращения поверхности, но замера влияния на точность выбора тула у агента не делалось.
   *Что сделать:* eval на наборе задач «проверь, не ломая» — сравнить долю корректных вызовов при
   флаге и при отдельном туле.

9. **Порог «≤ 20–25 активных тулов» взят из оценки стоимости контекста, а не измерен.** Оценка
   250–600 токенов на определение — расчётная. *Что сделать:* посчитать реальные размеры `tools/list` по
   фазам через `/skill-doctor` и токенизатор оценки ([ADR-0029](adr/0029-trust-and-quality-python.md) ОВ 4:
   кандидат tiktoken 0.14.0, работа без сети не проверена), при превышении пересобрать состав фаз из §5.3.

10. **Имена полей CAS.** Закрыт [ADR-0028](adr/0028-studio-api-contract.md) §6: `expects[{path, file_hash | null}]`
    и обязательный `client_op_id`; `base{commit, files[{path, sha256}]}` и `idempotency_key` сняты в §2.3,
    §2.5 и §9.2.

11. **Состав фаз §5.3 собран под 57 тулов**, реестр стал 63, после отмены группы `export` — 59, цель — 78–79.
    По колонке «Фаза» §2 фаза `author` уже сейчас включает 20 тулов поверх 13 тулов ядра — 33 при пределе 25.
    *Что сделать:* пересобрать `PHASE_GROUPS` после того, как 19 оставшихся операций получат группы;
    контрактный тест при этом строит сервер из полного каталога ([ADR-0028](adr/0028-studio-api-contract.md) §2,
    правило 8).

12. **AGENTS.md как конвенция не проверен.** Известно, что Claude Code читает `CLAUDE.md`; поддержка
    `AGENTS.md` как импорта/алиаса не подтверждена в этот заход. Практический вывод (класть в корень
    генерируемого проекта короткий файл с точкой входа) не зависит от ответа, но имя файла зависит.
    *Что сделать:* проверить и зафиксировать в генераторе проекта.

13. **Фазирование на `mcp` 2.2.0.** Поштучного `enable()/disable()` нет. Кандидаты адаптера `ToolSwitch`
    (§5.4) — `MCPServer.add_tool`/`remove_tool(name)` и `ServerSession.send_tool_list_changed()`. По исходнику
    `remove_tool` удаляет тул из словаря `ToolManager`, одного на сервер, а вызов снятого тула приходит
    текстом `Unknown tool` без конверта (проба, «Решения»): такой адаптер, судя по всему, переключает
    поверхность всем сессиям сразу и не даёт `TOOL_PHASE_DISABLED` (§5.5 п. 2); на двух сессиях не
    запускалось. В реестре — [ADR-0025](adr/0025-python-engine.md) ОВ 18, [23](23-studio-api.md) ОВ 12.
    *Что сделать:* спайк с двумя клиентами `mcp.Client` на streamable HTTP — открыть фазу одному и сравнить
    `list_tools` у обоих; проверить вариант с полным набором зарегистрированных тулов и фильтрацией
    `tools/list` на сессию; выбрать адаптер и записать в §5.4.

14. **Форма отказа тула.** §3.3 отдаёт отказ `Envelope` с `ok: false`, `focus`, `refs[]`, `next[]`, `ui_url`,
    `truncated`; [ADR-0028](adr/0028-studio-api-contract.md) §2 правило 5 и [23](23-studio-api.md) §12.4 — `ApiError`
    (`ok`, `op`, `code`, `message`, `problems[]`, `candidates[]`, `conflict`, `retry_after_ms`), в котором этих
    полей нет. При этом П6 требует `ui_url` в каждом ответе, а `FORBIDDEN` (§6.2, [23](23-studio-api.md) §12.5)
    обещает `next[]` со `studio_open`. *Что сделать:* решить, расширяется ли `ApiError` полями `focus`, `next[]`,
    `refs[]`, `ui_url`, `truncated` или отказ `flow_patch` (`BLOCKING_PROBLEMS`) идёт `Envelope` в
    `structuredContent` при `is_error`; пробой на `mcp` 2.2.0 проверить, что выбранная модель доходит до
    клиента; итог — в §3.1, §3.3 и [23](23-studio-api.md) §12.4.

15. **Конверт у тулов чтения и у записи вне файлов.** §3 требует конверт у каждого тула, но поля результата
    чтения в `Envelope` нет, а [23](23-studio-api.md) §1.2 отдаёт у запуска, отмены, резюма, реплея и форка
    свой ресурс. В реестре — [ADR-0028](adr/0028-studio-api-contract.md) ОВ 1, [23](23-studio-api.md) ОВ 22.
    *Что сделать:* прототип `Envelope[T]` на `mcp` 2.2.0 и FastAPI 0.141.1 (схема в `tools/list` и OpenAPI);
    выбрать между `Envelope[T]` у всех ответов записи и правилом 4 только для записи в файлы; итог — в §3.1.

16. **`project_export` с целью `agent_workflow_spec`.** Остальные тулы группы `export` отменены
    ([ADR-0025](adr/0025-python-engine.md) §7). Этот тул восстанавливает документ скилла `agentic-process-spec`
    из воркфлоу (§10.4) и к воссозданию в чужом фреймворке не относится, но его проверка обратимости
    опиралась на отменённый `project_conformance`. В реестре — ADR-0025 ОВ 19, [23](23-studio-api.md) ОВ 13.
    *Что сделать:* вопрос владельцу; если тул остаётся — вернуть строку в §2.7, выбрать проверку обратимости
    «импорт → экспорт → импорт» без конформанс-набора (например, тестом компилятора на равенство IR) и добавить
    ресурс в [23](23-studio-api.md) §4.1 и §13.2; иначе отметить тул отменённым.

17. **stdio-вход для Claude Code.** `MCPServer.run(transport="stdio")` есть; совместимость с `DBOS.launch` и
    наблюдателем файлов в том же процессе не проверена, а `DBOS.launch` вызывают только `aqven dev` и
    `aqven serve` — один исполнитель на системную БД ([ADR-0025](adr/0025-python-engine.md) §9, H2). В реестре —
    [ADR-0028](adr/0028-studio-api-contract.md) ОВ 8. *Что сделать:* решить, нужен ли stdio при HTTP-входе
    `aqven dev`; если нужен — выбрать между stdio-процессом на `DBOSClient` и прокси к работающему `aqven dev` и
    проверить команду `claude mcp add --transport stdio aqven -- <команда>`.

18. **Сессии streamable HTTP на `mcp` 2.2.0.** Stateful-режим по умолчанию держит состояние сессии в памяти
    процесса. Не проверены: возобновление потока по `Last-Event-ID` и хранилище событий для него (в сигнатуре
    `streamable_http_app` есть `event_store` и `retry_interval`), ответ на неизвестный `Mcp-Session-Id`, работа
    за несколькими репликами `aqven serve`. *Что сделать:* пробой с `mcp.Client` оборвать поток посреди долгого
    вызова и переподключиться, отправить запрос с чужим `Mcp-Session-Id`; решить, нужны ли `aqven serve`
    реплики, и если да — sticky-routing или своё хранилище событий.

19. **`title`, `annotations` и `meta` тула из каталога.** §3.4 и §4.1 требуют у каждого тула `ToolAnnotations`, у
    «толстых» — `_meta['anthropic/maxResultSizeChars']`. В сигнатуре `MCPServer.add_tool` 2.2.0 параметры
    `title`, `annotations`, `meta` есть, но в записи `Operation` ([ADR-0028](adr/0028-studio-api-contract.md) §2)
    полей для них нет, и что они доходят до `tools/list` через `ToolCall`, не проверено. *Что сделать:* добавить
    поля в `Operation` и передать их в `register_tool`; проверить снапшотом `tools/list` через `mcp.Client`;
    итог записать в §3.4 и в каталог операций ADR-0028.

20. **Сигнатуры реестра §2 против моделей [23](23-studio-api.md).** Реестр выровнен по 23 только в записи файлов
    (§2.3, §9.2) и в человеке в цикле (§2.5, 23 §13.4). Остались: аргумент `spec_id` против `flow_id` в раскладке
    и CLAUDE.md (23 ОВ 8); `dataset_id?` у `run_start` против `dataset_item_id` в 23 §6.4; `base{commit}` у
    `flow_revert` — CAS на HEAD, связь с `expects` не описана; путь `/w/...` в `ui_url` (П6) не сверен с
    маршрутами студии в [15](15-studio-frontend.md). *Что сделать:* при пересборке реестра пройти таблицу 23 §13.2
    тул за тулом и свести входы и выходы к моделям Pydantic каталога; расхождения, меняющие поведение, — в ADR.

21. **URL-elicitation на `mcp` 2.2.0.** П6 и `studio_open` отправляют человека в студию через URL-elicitation. В
    исходнике `mcp` 2.2.0 есть `Context.elicit_url(message, url, elicitation_id)` и
    `ServerSession.send_elicit_complete`; с Claude Code не запускалось, и не решено, как `ToolCall` передаёт
    `Context` в use-case, когда сигнатура тула — модель входа операции. *Что сделать:* проба `studio_open` с
    `elicit: true` на живом Claude Code; решить, как адаптер отдаёт `Context` без логики в адаптере.
