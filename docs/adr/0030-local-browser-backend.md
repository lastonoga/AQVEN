# ADR-0030. Локальный бэкенд в браузере: пакет `aqven`, SQLite, токен запуска, чат на Claude, потоковые вызовы

> Часть §6 и `A14` о единственном агенте чата изменена [ADR-0034](0034-codex-and-project-chat-threads.md).
> Правила защиты `.env` для Claude и остальные решения этого ADR остаются в силе.

> Статус: принято; раздел «Поправки 2026-09-17 по итогам реализации» (`A1`–`A17`) добавлен после сборки движка,
> сервера, MCP, чата, локального рантайма и CLI; поправка `A18` от 2026-09-18 записывает три решения владельца
> по итогам интеграции со Studio (ярлык флоу у чат-сессии, `me` из настроек, 422 на недостающий контекст прогона). Поправки заменяют §7 (ключи провайдеров — `.env`, а не SQLite),
> дополняют §2 (`aqven new`, переменные `AQVEN_*`) и §13 (extras провайдеров, `python-dotenv`); закрывают открытые
> вопросы 1, 6, 8 и уточняют 10
> Дата: 2026-09-17
> Зависит от: [ADR-0017](0017-files-as-source-of-truth.md), [ADR-0024](0024-studio-on-vite.md), [ADR-0025](0025-python-engine.md), [ADR-0026](0026-yaml-spec-and-code-refs.md), [ADR-0027](0027-dynamic-io-shapes.md), [ADR-0028](0028-studio-api-contract.md), [ADR-0029](0029-trust-and-quality-python.md)
> Изменяет в части прода на PostgreSQL 18 (§4, решение), HTTP-клиента (§5), изоляции провайдеров и списка `ALLOWED_CONSUMERS` (§5–§6, поправка `A4`), одобрения тула (§9, H6) и открытых вопросов 1, 4, 8, 9, 11, 16, 21, 23: [ADR-0025](0025-python-engine.md)
> Изменяет в части места сгенерированных моделей (§4, поправка `A2`) и операций `flow_patch` над агентами (§9, поправка `A13`): [ADR-0026](0026-yaml-spec-and-code-refs.md)
> Изменяет в части защиты сервера (§3) и открытых вопросов 7, 8: [ADR-0028](0028-studio-api-contract.md)
> Изменяет в части формы вызова модели, записи кассеты и хранения полезной нагрузки кассет (§1, поправка `A13`): [ADR-0029](0029-trust-and-quality-python.md)
> Меняет: [DECISIONS.md](../DECISIONS.md) — строки «Вызов моделей», «Надёжное исполнение», «Хранилище», «SDK провайдеров», «HTTP-клиент», новые «Чат студии» и «Формы и загрузки FastAPI», абзац «Только httpx2» в «Ось версий»; строки «Очереди», «Поток событий прогона», «Одобрение вызова тула» и абзац о `DBOSDurability` в «Что берём готовым»; абзац о цепочке в «Наш слой»; строки «Чекпоинты» и «Секреты» в «Хранение определений»; разделы «Данные», «Human-in-the-loop», «API студии»; новый раздел «Локальный режим»; по поправкам `A1`–`A17` — новый раздел «Библиотека и проект» и правки в «Локальный режим», «Промты», «Качество»; [adr/README.md](README.md) — строки 0025, 0028, 0029, 0030; шапки [ADR-0025](0025-python-engine.md), [ADR-0028](0028-studio-api-contract.md), [ADR-0029](0029-trust-and-quality-python.md); [98. Аудит версий](../98-version-audit.md). Становятся неверными до чистки: [10. Рантайм](../10-runtime.md) §3, §4, §7; [14. MCP-контракт](../14-mcp-contract.md) §7; [16. Модель данных](../16-data-model.md) целиком (PostgreSQL, RLS, партиции, pgvector); [17. Фоновые задачи](../17-jobs-and-scheduling.md); [20. Репозиторий](../20-repo-and-tooling.md) §1, §10; [23. API локальной студии](../23-studio-api.md) «Решения», §1.1, §11.2, §11.4, §12.5, §13; [research/desktop-app-and-agent-cli.md](../research/desktop-app-and-agent-cli.md) §1–§3
> Исследование: [research/desktop-app-and-agent-cli.md](../research/desktop-app-and-agent-cli.md) (чат-агент, вход по подписке; настольная часть отклонена этим ADR). Пробы потоковой передачи и параллельных веток выполнялись вне репозитория 2026-09-17 в отдельных venv (CPython 3.14.7, dbos 2.31.1, pydantic-ai-slim 2.43.0, httpx2 2.13.0, pydantic 2.13.5, SQLite), результаты приведены только в этом ADR. Прецеденты, Monty и Pyodide проверены 2026-09-17 по исходникам тегов релизов, `pyodide-lock.json` и README

## Контекст

**Решения владельца от 2026-09-17.** Сначала: только локальное приложение, DBOS на SQLite, без PostgreSQL и без
многопользовательской авторизации; чат студии — только Claude; ключи провайдеров — настройки в SQLite; каждый вызов
модели — поток; наш код на `httpx2`, encode `httpx` — только где иначе нельзя; Monty и Pyodide для кода проекта не
используются. Затем уточнение, которое отменяет всё про Tauri, sidecar и PyInstaller: настольного приложения пока нет,
AQVEN запускается локально в браузере, как Jupyter и marimo.

Что это ломает в действующих решениях:

| Где | Было | Что меняется |
|---|---|---|
| [ADR-0025](0025-python-engine.md) §4 | PostgreSQL 18 в проде, не запускался (ОВ 9) | прода нет, SQLite везде |
| [ADR-0028](0028-studio-api-contract.md) §3, [23](../23-studio-api.md) §1.1 | «Аутентификация: нет», только `TrustedHostMiddleware` | токен на запуск, проверки Host и Origin |
| [research/desktop-app-and-agent-cli.md](../research/desktop-app-and-agent-cli.md) | Tauri 2.11.4 + PyInstaller 6.22.3 как sidecar | отклонено: пакет с PyPI в окружении проекта |
| ADR-0025 ОВ 4 | узел `llm`: один шаг или `DBOSDurability` — не решено; «вариант А не умеет одобрение тула» | проба: сегментные шаги, одобрение работает |
| ADR-0025 ОВ 1 | параллельные ветки внутри workflow не проверены | проба: только дочерние workflow |
| [DECISIONS](../DECISIONS.md) «Поток событий прогона» | «запись exactly-once» | верно только для записи из кода workflow |

**Прецеденты** (проверено 2026-09-17):

| Продукт | Факт | Источник |
|---|---|---|
| marimo 0.24.2 (Apache-2.0) | `--token/--no-token` с `default=True`; «A random token will be generated if --token-password is not set»; браузер открывается по URL с токеном | `marimo/_cli/cli.py` тега 0.24.2 |
| Jupyter Server 2.21.1 (BSD-3-Clause) | токен по умолчанию `binascii.hexlify(os.urandom(24))`; `allow_remote_access` выключен: запрос с нелокальным `Host` получает 403, «This protects against 'DNS rebinding' attacks» | `jupyter_server/auth/identity.py`, `jupyter_server/serverapp.py` тега v2.21.1 |
| ComfyUI Desktop | «On startup, it will install all the necessary python dependencies with uv and start the ComfyUI server» | README `Comfy-Org/desktop` |

## Решение

### 1. Только локально, только SQLite

Прода, PostgreSQL и многопользовательской авторизации нет. Один сервер работает с одним проектом.

| Файл | Где | Что хранит |
|---|---|---|
| `dbos.sqlite` | `<проект>/.aqven/` | системные таблицы DBOS: чекпоинты, поток `run_events`, сообщения и события ожиданий; `use_listen_notify = False`, `application_version` — явная версия протокола исполнителя |
| `aqven.sqlite` | `<проект>/.aqven/` | настройки уровня `project`, журнал чата `chat_sessions`/`chat_events`, индекс ожиданий `aqven_human_waits` |
| `studio.sqlite` | каталог данных пользователя | настройки уровня `studio`, в том числе ключи провайдеров |
| `server.json`, `server.lock`, `server.log` | `<проект>/.aqven/` | запись запущенного сервера, блокировка единственного экземпляра, лог фонового запуска |

- Файлы SQLite и `server.json` создаются с правами 0600, каталоги — 0700, WAL. Служебные файлы `.aqven/` рантайм дописывает
  в `.gitignore` проекта, если `.aqven/` не игнорируется целиком.
- Каталог данных пользователя: macOS `~/Library/Application Support/AQVEN`, Windows `%APPDATA%/AQVEN`, Linux
  `$XDG_DATA_HOME/aqven` (иначе `~/.local/share/aqven`); `--data-dir` переопределяет. `platformdirs` 4.11.9 (MIT) не берём:
  его путь на macOS учитывает `XDG_DATA_HOME`, а имя приложения одно на все ОС.
- Один экземпляр на проект держит неблокирующий `.aqven/server.lock`; `DBOS.launch` делает только этот сервер (DECISIONS
  «Human-in-the-loop», п. 5). `aiosqlite` не нужен: системная БД DBOS на SQLite работает через синхронный движок.

### 2. Браузерный режим: пакет `aqven` в окружении проекта

- Пользователь ставит пакет с PyPI в окружение проекта (`uv add aqven` или `pip install aqven`) и запускает в папке проекта
  `aqven studio` (синоним `aqven dev`). Окружение проекта обязательно: шаг `code` импортирует код проекта и его
  зависимости в процессе движка ([ADR-0025](0025-python-engine.md) «Контекст»).
- Флаги: `--root` (по умолчанию — поиск вверх от cwd), `--port` (по умолчанию 5180, при занятом — следующий свободный),
  `--data-dir`, `--no-browser`, `--headless`, `--studio-dist`, `--dev-origin`.
- Сервер слушает только `127.0.0.1`, отдаёт `/api`, SSE, `/mcp/` и статику Studio с одного порта
  ([ADR-0028](0028-studio-api-contract.md) §3). Сборка `apps/studio` при релизе копируется в `aqven/server/static`;
  при разработке — `--studio-dist <каталог>` или Vite dev server по `--dev-origin`.
- После готовности сервер открывает браузер по URL с токеном (кроме `--no-browser` и `--headless`). SIGINT и SIGTERM
  завершают в обратном порядке: готовность → `stopping`, удаление `server.json`, остановка движка, закрытие сокета,
  снятие блокировки.

### 3. Защита локального сервера

Проверки идут цепочкой (Chain of Responsibility) в ASGI-обёртке `AccessGuard`, SSE не буферизуется. Заменяет строку
«Аутентификация: нет» ([23](../23-studio-api.md) §1.1) и `TrustedHostMiddleware` как единственную защиту (ADR-0028 §3).

| # | Проверка | Правило | Отказ |
|---|---|---|---|
| 1 | `Host` | имя хоста `127.0.0.1`, `localhost` или `::1` — защита от DNS rebinding | 400 `HOST_NOT_ALLOWED` |
| 2 | `Origin` | тот же origin, loopback-синоним на том же порту или `--dev-origin` | 403 `FORBIDDEN` |
| 3 | Токен | случайный на каждый запуск, `secrets.token_urlsafe(32)` | 401 `UNAUTHORIZED` с `WWW-Authenticate: Bearer` |

Каналы токена:

| Клиент | Как предъявляет |
|---|---|
| Браузер | один раз `?access_token=` → 303 на тот же URL без токена и cookie `aqven_access_<port>` (`HttpOnly; SameSite=Strict; Path=/`) |
| API-клиенты, CLI | `Authorization: Bearer <token>` |
| `/mcp/` | только `Authorization: Bearer`; cookie и параметр запроса не принимаются |

- Все отказы — в конверте `ApiError`. `/api/ready` открыт (фаза `starting|ready|stopping`), `/api/health` требует токен и
  отдаёт `pid`, корень проекта, версию, `headless`, `started_at`.
- `.aqven/server.json` = `{host, port, token, pid, url, mcp_url, project_root}`, права 0600; его читают CLI и `aqven mcp`.
  Сервер считается живым, только если процесс `pid` жив и `/api/health` с Bearer вернул тот же `pid` и корень: свободный
  TCP-порт не доказывает, что это наш сервер.

### Временное исключение от 2026-09-18: локальный CLI без токена

По решению владельца `aqven studio`, `aqven dev` и `aqven serve` временно не требуют токен для `/api/*`, `/mcp/` и
WebSocket по умолчанию. Флаг `--require-auth` возвращает правило §3 целиком, включая Bearer-проверку MCP и URL браузера
с `access_token`. В режиме без токена URL браузера чистый, обмен на cookie не выполняется. `server.json` и случайный токен
сохраняются для совместимости с CLI, пробой живости и чатом. Проверки `Host` и `Origin`, а также привязка к loopback,
обязательны в обоих режимах. Встраиваемый `create_local_app` и прямой `create_app` сохраняют свои прежние значения по
умолчанию. Для применения смены режима требуется перезапустить уже работающий сервер проекта.

### 4. Studio необязательна

Тот же проект правит человек в любой IDE или внешний агент (Claude Code, Cursor) по MCP; без браузера всё работает так же.

| Путь | Как |
|---|---|
| Внешняя правка файлов | file watcher и spec-канал видят изменение, пересчитывают `tree_hash`, `file_hash` и диагностики |
| Claude Code по HTTP | `/mcp/` с Bearer-токеном из `.aqven/server.json` |
| Claude Code по stdio | `aqven mcp`: при отсутствии живого сервера запускает в фоне `aqven studio --headless --no-browser --root <root>` (отдельная сессия процесса, вывод в `.aqven/server.log`), ждёт `/api/health`, затем пересылает `tools/list` и `tools/call` на HTTP-сервер (Proxy) — SQLite трогает один процесс |
| Терминал | `aqven run`, `aqven check`, `aqven generate`, pytest работают без Studio |

### 5. Настольное приложение — позже

- Сейчас не делаем: Tauri, PyInstaller, встроенный uv, sidecar.
- Будущая оболочка переиспользует тот же сервер, окружение проекта в ней управляет uv (выбор владельца; так делает
  ComfyUI Desktop).
- **PyInstaller 6.22.3** (GPLv2-or-later с исключением) **отвергнут**: замороженный бинарник содержит только импорты,
  собранные при сборке, а код проекта по ссылке `module:function` импортирует зависимости проекта, неизвестные при сборке.

### 6. Чат студии — только Claude

- Порт `AgentBackend` (Port/Adapter) остаётся; адаптер один — `ClaudeAgentBackend` на `claude-agent-sdk` 0.2.154 (MIT;
  колесо везёт Claude Code CLI 2.1.274 под коммерческими условиями Anthropic). Codex (`codex app-server`) и ACP не берём.
- Вход — только собственный вход пользователя в Claude Code: статус читает `claude auth status --json`, токены приложение
  не читает и не хранит; без входа Studio просит выполнить `/login` в Claude Code. Предпочитается установленный `claude`,
  запасной — CLI из колеса.
- Опции сессии: `cwd` = корень проекта; MCP-сервер `aqven` типа `http` с Bearer-токеном; `strict_mcp_config=True`,
  `setting_sources=[]`, `include_partial_messages=True`; `can_use_tool` → одобрение в Studio. Раз `setting_sources=[]`
  не грузит `CLAUDE.md`, `AGENTS.md` и `CLAUDE.md` проекта дописываются к пресету системного промта `claude_code`.
- События хода нормализуются в `ChatEvent` (Strategy по типу сообщения SDK), журнал — `aqven.sqlite`, SSE
  `/api/chat/sessions/{session_id}/events` с `id` = `seq` сессии.

### 7. Ключи провайдеров — настройки в SQLite

| Правило | Механизм |
|---|---|
| Ключ | настройка `providers.<provider>.api_key`, области `studio` и `project` |
| Порядок разрешения | `project` → `studio` → переменная окружения провайдера (`PROVIDER_KEY_ENV`) — Chain of Responsibility, `resolve_secret` |
| API | значение секрета никогда не возвращается: только `masked`; `read_secret` — вызов внутри процесса |
| DBOS, события, логи | ключ разрешается внутри шага модели и передаётся только в `ModelFactory.build`; во входе и выходе шага, событиях и логах его нет; кассета вычищает `Authorization` |
| Хранение | открытым текстом в SQLite под правами 0600; связка ключей ОС не используется (открытый вопрос 1) |

Проба потоковой передачи: после 5 живых вызовов OpenRouter префикс ключа встречается 0 раз в `operation_outputs`,
`streams`, `workflow_status.inputs` и трассах.

### 8. Каждый вызов модели — поток

- Каждое звено цепочки [ADR-0029](0029-trust-and-quality-python.md) §1 наследует `StreamFirstModel` (Template Method):
  `request` дочитывает собственный `request_stream`. Непотоковых вызовов провайдера нет.
- Studio видит текст, рассуждения, аргументы тулов и частичный JSON структурированного выхода по мере генерации:
  `node_output_delta{address, attempt, part_kind: text|reasoning|tool_call_args|output_json, part_index, tool_call_id,
  tool_name, delta, cumulative_length}` пачками по 80 мс (`OUTPUT_DELTA_BATCH_MS`); отброшенная попытка —
  `node_attempt_discarded{address, attempt, cause, discarded_parts}`. Частичный объект — `pydantic_core.from_json(buf,
  allow_partial="trailing-strings")`.
- Кассета пишет список событий потока и итоговый ответ (формат `aqven.cassette.v1`) и воспроизводит поток теми же событиями.
- В режиме редакции PII ответа дельты удерживаются до конца части и выходят отредактированными: поток по частям, а не по
  токенам.
- Размер дельт задаёт провайдер (live, 2026-09-17): `mistralai/mistral-nemo` отдал 55 дельт аргументов тула, 50 мс пачки
  свели их к 19 записям потока; `openai/gpt-oss-20b` — 1–2 крупных куска, рассуждение одним `PartStartEvent`.

### 9. Узел `llm` на DBOS — сегментные шаги (закрывает ADR-0025 ОВ 4)

Проба, dbos 2.31.1 на SQLite, `FunctionModel` и 5 живых вызовов OpenRouter. Вариант А — `agent.run` внутри `@DBOS.step`,
вариант Б — `agent.run` в workflow с `DBOSDurability`.

| Факт | А | Б |
|---|---|---|
| Живые дельты | `write_stream_async` через 1–3 мс после генерации, читатель в процессе — через 13–30 мс, `DBOSClient` из другого процесса — медиана 15 мс, максимум 51 мс | те же задержки у обработчика capability; обработчик `agent.run(event_stream_handler=...)` получает события пачкой после шага |
| Шаги на 3 запроса, 1 тул, 1 `ModelRetry` | 1 шаг, выход 172 байта | 9 шагов: 3 `<agent>__model.request_stream` + 6 шагов событий |
| SIGKILL в 3-м запросе | шаг целиком заново: 3 вызова модели, тул и валидатор повторены | модель вызвана 1 раз, но функция-тул и валидатор повторены: функциональные тулсеты не оборачиваются (`wrapped_toolset_kinds={'mcp','dynamic'}`) |
| Размер выхода шага, mistral-nemo, 67 токенов | 668 байт | 6508 байт: pickle `StreamedActivityResult` со всеми 57 событиями |
| Одобрение тула | работает в два сегмента, в том числе при SIGKILL во время ожидания | работает в одном `agent.run` |
| Отмена проигравших веток | свой шаг `preemptible=True` | `StepConfig` pydantic-ai без `preemptible` — шаг модели не прерывается |

**Опровержения.** (1) `write_stream` exactly-once только из кода workflow: запись из шага не проверяется по чекпоинту и после
SIGKILL дублируется (23 частичных записи убитой попытки + 43 полных против 43 в чистом прогоне); `node_started` и
`node_finished` из workflow — ровно по одному. (2) «Вариант А не умеет одобрение тула» (ADR-0025 ОВ 4) неверно. (3) Шаги
`DBOSDurability` в потоковом режиме называются `<agent>__model.request_stream`, а не `__model.request`.

**Решение — вариант А в форме сегментов** (Template Method цикла узла, Observer потока, Strategy по виду отложенного вызова):

1. Сегмент — один DBOS-шаг `aqven.llm_segment`: `agent.run(..., message_history, deferred_tool_results,
   event_stream_handler=observer)` без `DBOSDurability`; вся цепочка ADR-0029 §1 внутри шага, ключи разрешаются внутри шага.
2. Выход шага — простой DTO: JSON выхода или ожидающие одобрения и внешние вызовы, `messages_json`
   (`ModelMessagesTypeAdapter`), usage. Объекты pydantic-ai в pickle не попадают.
3. Одобрение — между сегментами в коде workflow: `node_suspended`, `DBOS.recv_async`, `node_resumed`, следующий сегмент с
   `DeferredToolResults(approvals=...)`.
4. Тулы с `effect: write|external` бросают `CallDeferred` и исполняются один раз собственным DBOS-шагом между сегментами.
   `ExternalToolset` не подходит: в 2.43.0 тулы `kind="external"` откладываются раньше, чем срабатывает обёртка одобрения.
5. Дельты пишутся изнутри шага (at-least-once на исполнение); `node_started`, `node_suspended`, `node_resumed`,
   `node_finished` — из кода workflow (exactly-once). После падения заново идёт только текущий сегмент.

### 10. Параллельные ветки — дочерние workflow (закрывает ADR-0025 ОВ 1)

Проба, dbos 2.31.1 на SQLite, ветки только спят; 32 сценария.

| Вариант | Результат |
|---|---|
| A: `asyncio.gather` над шагами в одном workflow | один шаг на ветку — восстановление корректно; два шага на ветку — номера шагов зависят от времени, после SIGKILL workflow `SUCCESS` с подменёнными выходами веток в 2 из 3 прогонов без ошибки: повтор сверяет только `(workflow_id, function_id, function_name)`. Fork оставляет пропуски offset в `run_events`, `read_stream_async` останавливается на первом пропуске |
| B: дочерний workflow на ветку | N=5 со SIGKILL посередине — завершённые шаги не повторены; история шагов одинакова; fork с шага внутри секции переиспользует завершённых детей; fork одной ветки через `replacement_children`; map K=4 на 20 элементах держит конкурентность 4; quorum k=2 с отменой проигравших |
| C: дочерние workflow в `Queue` | то же, что B; `partition_concurrency` задаётся при объявлении очереди, не на узел |

Правила:

1. Каждая ветка `parallel`, элемент `map` и голос `quorum` — дочерний workflow `aqven.run_branch` с id
   `run_id + "::" + address_key` (рекурсивно: `run::b1::m3`), старт в порядке индекса.
2. `asyncio.gather` и `TaskGroup` над DBOS-шагами, их последовательностями и записью потока из кода workflow запрещены.
   Исполнитель в памяти (`InProcessSupervisor`) внутри DBOS-workflow не используется.
3. Сведение — цикл `DBOS.wait_first_async(handles, polling_interval_sec=0.05)` и `get_result(polling_interval_sec=0.05)`;
   политики join получают ветки в порядке завершения. Интервалы опроса всегда короткие: по умолчанию 1,0 с, на map из
   20 элементов это +3 с.
4. `map` с конкурентностью K — скользящее окно в родителе; `Queue` — только для лимитов между прогонами.
5. `quorum`, `any`, `first_success`: проигравшие отменяются `DBOS.cancel_workflows_async` (шаг с чекпоинтом); наши шаги с
   `preemptible=True` останавливаются за 1–1,4 с (интервал проверки 1,0 с зашит в dbos 2.31.1); непрерываемый шаг
   доживает, его выход отбрасывается.
6. Fork по адресу: движок пишет шаг `aqven.node_boundary` с адресом; из `list_workflow_steps` берутся `child_workflow_id` и
   `function_id`. Fork одной ветки — `fork_workflow_async(child_id, step)`, затем fork родителя с первого `getResult`/`waitFirst`
   и `replacement_children={child_id: new_id}`.
7. Каждый workflow пишет в свой `run_events` только сам, тогда поток без пропусков и при fork. Детей не ищем через
   `list_workflows(parent_workflow_id=...)`: переиспользованных fork'ом детей он не видит.

### 11. HTTP: `httpx2` и одно исключение для `pydantic_ai.mcp`

- Правило [ADR-0025](0025-python-engine.md) §5 остаётся: наш код импортирует только `httpx2`, ruff TID251 запрещает `httpx`.
- Исключение: `pydantic_ai/mcp.py` в pydantic-ai-slim 2.43.0 делает `import httpx` (строка 51), а ни extra `mcp`
  (`fastmcp-slim[client]` 4.0.4), ни `mcp` 2.2.0 (`httpx2>=2.5.0`) его не объявляют. Поэтому `aqven` пинит `httpx==0.28.1`
  напрямую; без этого `MCPToolset` не импортируется. Наш код `httpx` по-прежнему не импортирует.
- В проверке `uv.lock` (ADR-0025 §5) `ALLOWED_CONSUMERS["httpx"]` становится `{"aqven", "google-genai"}`. На 2026-09-17
  единственный потребитель `httpx` в `uv.lock` (113 пакетов) — `aqven`.
- Своё MCP-тулсет поверх клиента `mcp` 2.2.0 на `httpx2` не пишем: он повторил бы `MCPToolset`.

### 12. Monty и Pyodide для кода проекта не используем

Код проекта исполняется в CPython окружения проекта в процессе движка (ADR-0025).

| Кандидат | Факт | Почему нет |
|---|---|---|
| Monty, `pydantic-monty` 0.0.23 (MIT) | интерпретатор на Rust; импортирует только свои встроенные модули стандартной библиотеки — 18 в 0.0.23 (`crates/monty/src/modules`) | код проекта импортирует pydantic, `httpx2` и собственные пакеты |
| Pyodide 314.0.7 (`pyodide-py`, MPL-2.0) | CPython 3.14.2 на WebAssembly (`wasm32`, emscripten), нужен JS-рантайм; в `pyodide-lock.json` 357 пакетов: pydantic 2.12.5, нет `httpx2` и `pydantic-ai-slim` | ось требует pydantic 2.13.5, `httpx2` и pydantic-ai-slim |
| `mcp-run-python` 0.0.22 (MIT, репозиторий архивирован) | Pydantic: «there's just no safe way to run Python within pyodide safely with reasonable latency»; код в Pyodide «can run arbitrary javascript» | сама Pydantic отказалась от песочницы на Pyodide |

### 13. Зависимости

Срез PyPI JSON 2026-09-17; строки — в [98](../98-version-audit.md).

| Пакет | Версия | Лицензия | Где | Зачем |
|---|---|---|---|---|
| `claude-agent-sdk` | 0.2.154 | MIT | `aqven` | чат студии (§6) |
| encode `httpx` | 0.28.1 | BSD-3-Clause | `aqven`, прямой пин | импорт `pydantic_ai.mcp` (§11) |
| `python-multipart` | 0.0.32 | Apache-2.0 | `aqven` (и `mcp` 2.2.0: `>=0.0.9`) | загрузка файлов в FastAPI |
| `pydantic-ai-slim[mcp]` | 2.43.0 | MIT | `aqven` | `MCPToolset` для MCP-серверов агентов |
| `pydantic-ai-slim[openrouter]` | 2.43.0 | MIT | `aqven-llm` | OpenRouter; extra требует `openai>=3.8.0`, пин 3.14.1 |

Extras `[openai,anthropic,google]` в `uv.lock` не попали: `anthropic` и `google-genai` не установлены, прямые построители
`anthropic:` и `google:` в `aqven_llm` отвечают `ProviderUnavailable` (открытый вопрос 6).

## Поправки 2026-09-17 по итогам реализации

Движок, сервер, MCP, чат, локальный рантайм и CLI написаны и собраны в `aqven-py`. Владелец принял ещё десять решений
того же дня; они меняют §7, §13 и часть §2 выше и действуют вместо них. Ниже — только то, что отличается от исходного
текста ADR; остальное в силе. Поправки нумеруются `A1`–`A17`, на них ссылаются DECISIONS и [98](../98-version-audit.md).

### A1. Решения владельца от 2026-09-17 (вторая серия)

| # | Решение | Где раскрыто |
|---|---|---|
| 1 | Сгенерированные модели — файл `<module>/types.py` в корне модуля, а не `types/models.py` и не `__init__.py`; первая строка — заголовок DO NOT EDIT, единственное исключение из запрета комментариев; файл в `.gitignore`, импорт из `<package>.types` | A2 |
| 2 | Ключи провайдеров — в `.env` проекта (в `.gitignore`); переменные процесса важнее `.env`; хранения ключей в SQLite нет | A3 |
| 3 | Поддерживаются все провайдеры: `provider:model` уходит в реестр Pydantic AI с маленькой таблицей настроек на провайдера, провайдер ставится как extra; `aqven check` сообщает о недостающем extra и о провайдерах без потока | A4 |
| 4 | Каждый запрос к модели — поток (подтверждает §8) | §8 |
| 5 | `output.mode: auto \| tool \| native \| prompted` (по умолчанию `auto`); `auto` детерминирован — профиль Pydantic AI плюс таблица известных моделей внутри aqven; флага окружения и автоматического переключения в рантайме нет; разрешённый режим виден разработчику; ошибки структурированного вывода — с кодом и точной подсказкой | A6 |
| 6 | `aqven new` создаёт проект из шаблона; `aqven dev` поднимает сервер, следит за файлами и открывает Studio в браузере | A8 |
| 7 | Пример lumen сам работает на самых дешёвых моделях OpenRouter, а не только в тестах | A15 |
| 8 | `aqven_llm/media.py` остаётся: Pydantic AI 2.43.0 теряет `delta.images`, `delta.audio` и рассуждения без `reasoning_details`; цена не теряется, переопределение цены снято | A7 |
| 9 | Чат студии — только Claude; чат-агент никогда не читает и не правит `.env` | A14 |
| 10 | Каждое сообщение пакета — на английском: диагностики, тексты исключений, ошибки API, ошибки и подсказки прогона, вывод CLI, записи лога; кириллицы в `packages/*/src` нет. Документация (ADR, DECISIONS) остаётся на русском, пользовательский контент примера lumen (описания, промты в YAML и `.md`) — тоже | — |

### A2. Сгенерированные модели — `<module>/types.py`

- `aqven generate` пишет один файл `<module>/types.py` рядом с папкой `types/`, где лежат YAML-описания типов. Первая
  строка — `# Generated by aqven generate. DO NOT EDIT: changes are overwritten; edit the YAML and run aqven generate.`
  Это единственный разрешённый комментарий в коде проекта.
- Импорт — `from <package>.types import <Model>`. Папка `types/` не содержит `__init__.py`, поэтому модуль-файл
  `types.py` выигрывает у пространства имён и в CPython 3.14.7, и в pyright 1.1.414 strict (проверено).
- `types/__init__.py` затенил бы сгенерированный файл — `aqven check` даёт ошибку `E_TYPES_PACKAGE`. Папка модуля на
  `sys.path` или в `PYTHONPATH` затеняет стандартный модуль `types` — предупреждение `W_TYPES_SHADOWS_STDLIB`; ставить
  на путь надо родительскую папку (`src`) или запускать `python -P`.
- Файл в `.gitignore`; сборка колеса его включает, потому что `uv_build` не читает `.gitignore`, поэтому в чистом
  клоне `aqven generate` идёт до `uv build`. Устаревший или правленый руками файл — `W_GENERATED_STALE` с подсказкой.

### A3. Ключи провайдеров — `.env` проекта, а не настройки SQLite (заменяет §7)

| Правило | Механизм |
|---|---|
| Где лежит | `<module>/.env` рядом с `aqven.yaml`, в `.gitignore`; `.env.example` с именами переменных коммитится |
| Порядок разрешения | переменная процесса → запись `.env`; источник в API — `environment` или `dotenv` (было `project` → `studio` → окружение) |
| Имя переменной | `api_key: "ref:env/NAME"` в `aqven.yaml`, иначе имя по умолчанию у провайдера (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) |
| Чтение | `python-dotenv` 1.2.3 (BSD-3-Clause), `load_dotenv(override=False, interpolate=False)`: переменные процесса не затираются, `${VAR}` не раскрывается |
| Запись из Studio | `set_key`/`unset_key` в `.env` с правами 0600, `.env` дописывается в `.gitignore` проекта; отказ — `SECRET_SCOPE_UNSUPPORTED`, `NOT_A_SECRET_KEY`, `SECRET_KEY_NEEDS_SECRET`, `SECRET_VALUE_INVALID` с подсказкой |
| Старые ключи в SQLite | таблица `settings` заменена на `setting_values` только для несекретных значений; прежние секреты удаляются при первом открытии (`secure_delete`, `VACUUM`, чекпоинт WAL), а не переносятся в `.env` |
| API, события, логи | значение секрета не возвращается никогда, только маска; в входе и выходе DBOS-шага, событиях, логах и кассетах его нет |

Закрывает открытый вопрос 1 (секреты открытым текстом в SQLite): ключей в SQLite больше нет. Открытый вопрос 10
уточняется: `ref:env/NAME` — это переменная процесса `NAME`, затем запись `NAME` в `.env`.

### A4. Все провайдеры через реестр Pydantic AI, провайдер — extra (закрывает открытый вопрос 6)

- Один обобщённый построитель: `provider:model` уходит в реестр Pydantic AI, а таблица в `aqven_llm/catalog.py`
  (28 провайдеров) хранит на провайдера класс модели, переменную ключа, обязательность ключа, имя extra и модуль SDK.
  Построители на провайдера — таблица Strategy `MODEL_BUILDERS` в `aqven_llm/connectors.py`, 27 записей: у Cohere
  построителя нет, потому что он не потоковый.
- Extras — восемь: `anthropic`, `bedrock`, `cohere`, `google`, `groq`, `huggingface`, `mistral`, `xai`; каждый
  разворачивается в `pydantic-ai-slim[<extra>]==2.43.0`, `aqven[<extra>]` повторяет `aqven-llm[<extra>]`. OpenRouter и
  OpenAI — в базовой установке. Недостающий extra — `E_PROVIDER_EXTRA_MISSING` с подсказкой `uv add "aqven[<extra>]"`.
- Потока нет у Cohere: `CohereModel` в pydantic-ai-slim 2.43.0 наследуется прямо от `Model` и не определяет
  `request_stream` (проверено разбором исходника через `ast`, SDK ставить не нужно). Это `E_PROVIDER_NO_STREAMING`, и
  он проверяется раньше отсутствующего extra, чтобы не советовать ставить пакет, который всё равно не подойдёт.
- Смена поведения: `openai:` теперь идёт в OpenAI Responses API, как выбирает реестр; чат-комплишены — `openai-chat:`.
- Ретраи SDK везде выключены нашим слоем: клиент OpenAI-совместимых — `with_options(max_retries=0)`, Anthropic —
  `max_retries=0`, Google — `HttpRetryOptions(attempts=1)`, Bedrock — `total_max_attempts=1`, xAI —
  `grpc.enable_retries=0`. Наш `httpx2`-клиент не доходит до SDK Groq и HuggingFace: они создают свои клиенты на
  encode `httpx`, ретраев там нет (проверено).
- `ProviderName` перестал быть `StrEnum`: это `NewType(str)` с `PROVIDER_NAME_PATTERN`, а `MODEL_PATTERN` принимает
  любой идентификатор провайдера в нижнем регистре.

### A5. Свои провайдеры: тот же интерфейс `Model`

Порядок поиска — проект → установленный пакет → встроенный каталог.

| Способ | Запись | Когда |
|---|---|---|
| Только YAML | `kind: openai_compatible` + `base_url` + необязательный `api_key`: строится `OpenAIChatModel` поверх нашего `httpx2`-клиента без ретраев | vLLM, Ollama, LM Studio, прокси LiteLLM |
| Код проекта | `kind: code` + `run: "module:function"` по правилам ссылок на код узла | свой транспорт или своя модель |
| Установленный пакет | точка входа в группе `aqven.providers`, имя = id провайдера | провайдер, поставляемый отдельным пакетом |

- Контракт фабрики: `def build(model_name: str, context: ProviderContext) -> Model`, где `Model` — обычный
  `pydantic_ai.models.Model`. `ProviderContext` несёт разрешённый ключ, `base_url`, готовый `httpx2.AsyncClient`,
  `params` из `aqven.yaml` и `ModelSettings`; `ProviderCapabilities` заполняет профиль, если у модели его нет.
- Возвращается обычная `Model`, поэтому свой провайдер проходит ту же цепочку гарантий [ADR-0029](0029-trust-and-quality-python.md) §1
  (гейт исходов, редакция PII, кассета, бюджет, backoff) — отдельного пути для него нет.
- `aqven check` резолвит фабрику и сверяет сигнатуру: `E_PROVIDER_FACTORY_INVALID` (нет `run`, `run` не при
  `kind: code`, ссылка не резолвится, неверная сигнатура, нет `base_url`), `E_PROVIDER_ID_RESERVED` (id затеняет
  встроенный), `E_PROVIDER_NO_STREAMING` (у аннотированного класса возврата нет своего `request_stream`).
- Набор соответствия для авторов адаптеров — `aqven.testing`: `check_adapter(AdapterCase(...))` проверяет поток текста,
  структурированный выход в каждом объявленном режиме, отчёт об использовании, чистую отмену и ровно один запрос к
  транспорту на один неуспешный вызов.

### A6. `output.mode` — режим структурированного вывода в YAML агента

- Ключ `output.mode: auto | tool | native | prompted`, по умолчанию `auto`; `tool` → `ToolOutput`, `native` →
  `NativeOutput`, `prompted` → `PromptedOutput` (таблица Strategy). `output.strict` остаётся и действует только на
  `tool` и `native`. Значения `output_mode` в IR меняются с `strict|json` на `tool|native|prompted`.
- `auto` разрешается один раз при компиляции, в таком порядке: таблица известных моделей внутри aqven → профиль
  Pydantic AI для строки модели (`supports_tools`, `supports_json_schema_output`, `default_structured_output_mode`) →
  при разных режимах у модели и фолбэков `prompted`, потому что его поддерживают все. Флага окружения нет,
  в рантайме режим не переключается.
- Разрешённый режим, его источник и причина видны разработчику: в IR агента, в `aqven tree`, в ответе
  `/flows/{flow_id}/ir`. `aqven check` даёт `W_OUTPUT_MODE_RESOLVED`, когда `auto` расходится с профилем или взят из
  таблицы, и `E_OUTPUT_MODE_UNSUPPORTED`, когда явный режим для модели невозможен.
- Ко всем режимам добавляется одинаковый блок «Output limits», собранный из схемы выхода (`maxLength`, `minLength`,
  `minimum`, `maximum`, `minItems`, `maxItems`, `enum`, включая вложенные поля).
- Ошибки вывода классифицируются и несут код, подсказку и подробности (агент, модель, режим, попытка, отредактированная
  выдержка ответа, нарушения):

| Код | Когда |
|---|---|
| `MODEL_NO_STRUCTURED_OUTPUT` | текст вместо вызова тула вывода |
| `MODEL_INVALID_JSON` | ответ не разбирается как JSON |
| `MODEL_SCHEMA_MISMATCH` | нарушение схемы, допустимого множества или проверки |
| `MODEL_FEATURE_UNSUPPORTED` | провайдер отказал в режиме (в том числе отказ Pydantic AI до запроса) |
| `MODEL_RETRIES_EXHAUSTED` | попытки кончились |

Коды приходят в `node_attempt_failed` и `node_finished`, в ошибку прогона, в вывод `aqven run`, в лог
(`aqven.engine.llm`), в атрибуты и события спана OpenTelemetry, в Studio API и MCP. `aqven models check [TARGET]
[--project PATH] [--live]` показывает поддержку по режимам и результат `auto`, а с `--live` шлёт по одному
крошечному запросу на режим.

### A7. `aqven_llm/media.py` остаётся, переопределение цены снято

Проверено на pydantic-ai-slim 2.43.0 по исходнику `pydantic_ai/models/openrouter.py` и на 5 записанных потоках:

| Факт | Где |
|---|---|
| `_OpenRouterChoiceDelta` объявляет только `reasoning`, `reasoning_details`, `annotations` — полей `images` и `audio` нет, поэтому картинки и звук из потока теряются | строки 1172–1183 |
| `_map_thinking_delta` — генератор (ветка `if` использует `yield from`), а ветка `else` делает `return super()._map_thinking_delta(choice)`; возврат значения из генератора только завершает итерацию, поэтому рассуждение без `reasoning_details` пропадает | строка 1274 |
| Цена не теряется: `provider_details["cost"]` заполняется всегда, когда в chunk с usage есть choice, — так приходят реальные потоки OpenRouter (проверено на 4 живых потоках) | `_map_provider_details` |

Поэтому разбор картинок и звука и страж рассуждения без деталей в `media.py` остаются, а переопределение цены удалено.
Тесты на записанных потоках сравнивают наш `OpenRouterModel` с ванильным и упадут, когда апстрим это починит.

### A8. `aqven new` и `aqven dev`

- `aqven new <path> [--template minimal|showcase] [--package NAME] [--aqven-path PATH] [--no-sync] [--force]` пишет
  проект из шаблона (шаблон — Strategy в реестре `TEMPLATES`, файлы — данные пакета `aqven/templates/<name>` с
  суффиксом `.tmpl` и префиксом `dot-` вместо ведущей точки), затем `uv sync` и `aqven generate`.
- Шаблон кладёт `pyproject.toml`, `.gitignore` (`.env`, `.aqven/`, `.venv/`, `__pycache__/`, `src/<pkg>/types.py`),
  `.mcp.json` (stdio-сервер `uv run aqven mcp src/<pkg>`), `AGENTS.md` и `CLAUDE.md` (`@AGENTS.md` плюс имена
  MCP-тулов), `.claude/settings.json` с хуками (`PostToolUse` → `aqven check --static`, `Stop` → полный
  `aqven check`), `tests/` с офлайн-тестом на `FunctionModel`, `samples/` при необходимости и модуль под `src/<pkg>`
  с `.env.example`.
- `aqven dev` (синоним `aqven studio`) поднимает сервер, следит за файлами и открывает браузер; `aqven serve` — тот же
  сервер без браузера. Отдельного режима `dev` с origin Vite больше нет: адрес Vite задаёт `--dev-origin`.
- Настройки рантайма читаются в порядке «явный аргумент → переменная процесса или `.env` → значение по умолчанию»:

| Переменная | Что задаёт | По умолчанию |
|---|---|---|
| `AQVEN_STUDIO` | отдавать SPA Studio | включено у `dev`, выключено у `serve` |
| `AQVEN_HOST` | адрес прослушивания | `127.0.0.1` |
| `AQVEN_PORT` | порт | `5180`, при занятом — следующий свободный |
| `AQVEN_OPEN_BROWSER` | открывать браузер после готовности | включено у `dev` |

### A9. Форма проекта и библиотека прежде всего

- Проект — **один** Python-проект: один `pyproject.toml`, модуль в `src/<package>`, `tests/`, `samples/` при
  необходимости и не больше одного `main.py`. Папки `app/` нет; пример `examples` перестроен в эту форму.
- `.env` и `.aqven/` лежат рядом с `aqven.yaml`, то есть внутри папки модуля; сборка колеса исключает `.aqven`,
  `.env` и `.env.example`.
- AQVEN — библиотека, Studio — один из её клиентов. Ровно пять входов, все опираются на один композиционный корень:

| Вход | API |
|---|---|
| Прогон в процессе | `Project.load(<module>)`, `project.flow_typed(flow_id, In, Out)`, `await flow.run(...)` |
| Монтируемое ASGI-приложение | `create_local_app(<module>, LocalAppOptions(access=...))` и `host.mount("/aqven", app)` под `local_app_lifespan(app)`; авторизация подключаемая — любой `AppAccess`, `LocalTokenAccess` — встроенная реализация на Bearer-токене |
| Отдельный MCP-сервер | `create_mcp_server(<module>)`, `aqven mcp` по stdio или `/mcp/` работающего сервера |
| Любой HTTP-клиент | OpenAPI `/api/openapi.json`, события прогона SSE `/api/runs/{run_id}/events`, реестр событий `/api/schemas/events` |
| Любой MCP-клиент | те же операции тулами по streamable HTTP или stdio |

Публичное API импортируется из корня пакета `aqven`. `examples/main.py` показывает три формы в одном файле:
`handle_case` в процессе, `host_application()` с монтированием под `/aqven` и `serve()` под uvicorn.

### A10. `aqven check` = статика + симулированный прогон

- Вторая стадия проверки запускает каждый flow целиком на одном движке DBOS во временном каталоге состояния, внутри
  `override_allow_model_requests(False)`, с `httpx2.MockTransport`, который бросает на любой запрос тула, с
  блоб-хранилищем в памяти, фиктивными ключами и ответами MCP-тулов из их схем выхода. Ни сети, ни токенов.
- Значения генерируются из JSON Schema (включая `$ref`, `allOf`, `anyOf`, форматы, границы и `pattern`), медиаполя
  получают настоящие байты. Проходы: базовый, плюс по одному на ветку `switch`, на ошибку элемента `map` и на ошибку
  ветки `parallel` (Strategy `PassPlanner`). Узлы `code` исполняются по-настоящему.
- Коды: `E_SIM_NODE_FAILED` (с адресом исполнения и сгенерированным входом в подсказке), `E_SIM_PROMPT_RENDER`,
  `E_SIM_OUTPUT_INVALID`, `E_SIM_RUN_FAILED`, `W_SIM_NODE_UNREACHED`.
- Кеш — `.aqven/cache/simulation.json` на flow, ключ: хеш замыкания flow + sha256 по всем `.py` проекта + версия
  установленного aqven. Флаги `--static`, `--simulation-only`, `--no-cache`. Studio считает статику синхронно, а
  симуляцию — в фоне подпроцессом `python -P -m aqven check --simulation-only --format json` и отбрасывает результат
  с устаревшим `tree_hash`. MCP-тул `aqven_check` делает обе стадии, отказ от симуляции — вход `static: true`.
- Тот же механизм доступен сценарным тестам: `RunOptions(outputs=(node_output(...), node_failure(...)))` подставляет
  выход или отказ узла по адресу (`branch_key`, `iteration`, `item_index`) до исполнения узла — ветку в тесте выбирают
  так, а не удачей модели.

### A11. Новые статические стражи и читаемый рендер значений

- Один рендер значений на движок и на предпросмотр (`aqven/engine/llm/readable.py`, Chain of Responsibility по таблице
  форм): запись — строки `ключ: значение` в порядке объявления, список — строки `- элемент`, `DynamicValue` — строки
  `- имя (описание): значение`, медиа — короткая метка `[image/jpeg lamp.jpg, 2048 bytes]`, даты — ISO 8601,
  `true`/`false`/`null` вместо repr Python. Обёртки сохраняют семантику шаблона: доступ к полям, итерация, `.size`,
  `.first`, истинность.
- `W_PROMPT_VALUE_UNREADABLE` — шаблон печатает значение, у которого нет текстовой формы (все поля — медиа).
- `W_TOOL_ARG_UNREACHABLE` — обязательный аргумент тула типа id, record или union недостижим: либо его нет во входе
  инференса, либо вход есть, но промт ни разу не печатает этот путь. Достижимость считает напечатанного предка,
  алиасы цикла, промты уровня 1 и типы, которые возвращает другой тул того же агента. Именно этот страж ловит ошибку
  lumen, из-за которой модель выдумывала `customer_id`.
- `E_PROMPT_INPUT_UNUSED` перестал давать ложные срабатывания: медиавход и вход, на который ссылаются `allowed_sets`,
  `labels_from`, `schema_from` или путь `$in.` в параметрах проверки, больше не считаются неиспользованными; у кода
  появилась подсказка.

### A12. `aqven prompt preview`

`aqven prompt preview <flow>.<node> [--input FILE_JSON] [--variant SLOT=CASE] [--project PATH] [--json]` печатает
ровно то, что узел `llm` отправит: инструкции агента и шаблона вместе с блоком «Output limits» и добавкой режима,
сообщения примеров и диалога, вложения (медиавходы уходят частями сообщения, а не текстом), разрешённые варианты,
тулы и субагентов, контракт выхода (режим, откуда взят, `strict`, retries, имя тула вывода, JSON Schema, для
`prompted` — блок схемы). Без `--input` вход генерируется из схемы. Собирается тем же кодом, что и реальный прогон
(`PromptRenderer`, `output_format`, `build_conversation`, `resolve_allowed_sets`), поэтому расхождения текста нет.
Тот же предпросмотр доступен по `POST /api/flows/{flow_id}/nodes/{node_id}/prompt/preview` и MCP-тулом
`prompt_preview`; проект с ошибками предпросмотреть нельзя (409 `NOT_RUNNABLE`).

### A13. Правки движка

| Что | Было | Стало |
|---|---|---|
| Ретраи провайдера | слой backoff оборачивал только `request_stream.__aenter__`, поэтому 429 или 502 в первом чанке SSE уходил без повтора | первое событие потока читается внутри окна повтора; повтор до выдачи первого события, после выдачи — попытка отбрасывается. Классификация: `ModelHTTPError` 408/429/5xx, `ModelAPIError`, `httpx2.TransportError` и тело ошибки провайдера с кодом. Бюджет: 4 попытки, 0,5 с → 8 с, джиттер 0,5 с, всего 20 с; `Retry-After` важнее, но не больше максимума |
| Цена узла | genai-prices, поэтому картинка OpenRouter стоила 0 | одно правило `response_cost_usd`: воспроизведение кассеты бесплатно, иначе `provider_details["cost"]`, иначе genai-prices, иначе 0 |
| Раунды одобрения тула | `ToolApprovalGate` открывал ожидание всегда с первой попыткой, второй раунд в одном исполнении узла попадал на тот же топик | `WaitRequest.attempt` доходит до ожидания, раунды открывают `human:<address>:1` и `human:<address>:2`; скриптованные ответы совпадают по раунду. Остаётся стык: раунд после эскалации может совпасть номером — открытый вопрос 14 |
| `flow_patch` | операций для файлов агента не было, переименование делалось руками | операции `rename_agent` и `delete_agent`: перенос файла или папки агента со спутниками, переписывание всех `agent:`/`reflection_agent:` и ссылок на перенесённые файлы, запись в журнал `renames` (`kind: agent`); удаление отказывает с 422 `REQUEST_INVALID` и списком ссылающихся файлов |
| Кассеты | каждая запись хранила свои base64-полотна | полезная нагрузка длиннее 1024 символов уходит в общий `<cassettes>/blobs/<sha256>.txt`, в событии остаётся `{"$aqven_blob": "sha256-..."}`; ключи кассет и имена файлов не меняются, распакованные кассеты читаются по-прежнему. На кассетах примера: 142 файла, 19,8 МБ → 13,0 МБ, 30 блобов |

Закрывает открытый вопрос 8 (токен MCP в командной строке): `mcp_servers` передаётся путём временного файла 0600,
файл удаляется при отключении клиента.

### A14. Чат студии: запреты и цена хода

- Запрет `.env` для чат-агента держится тремя механизмами сразу: правила `disallowed_tools` на `Read`/`Edit` всех форм
  `.env`, хук `PreToolUse` на `Read`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `Grep`, `Glob` и `Bash` (хук нужен,
  потому что до `can_use_tool` читающие тулы и режим accept-edits не доходят) и сам `can_use_tool`. Подпроцессу Claude
  все имена из `.env` выставляются пустыми, поэтому `printenv` ключей не покажет.
- Цена хода: `total_cost_usd` у CLI накопительная в пределах процесса, обнуляется на `/clear` и при возобновлении,
  поэтому `TurnCostMeter` берёт разницу с предыдущим итогом и начинает заново на новом клиенте.

### A15. lumen на самых дешёвых моделях OpenRouter

Пример работает на этих моделях сам, не только в тестах; `app/cheap_models.py` удалён. Провайдер один — OpenRouter,
`data_collection: deny`, `zdr: false`, `retention: unknown`, `allows_pii: true`: самые дешёвые эндпоинты этих моделей
не дают нулевого хранения (проверено по спискам эндпоинтов OpenRouter 2026-09-17).

| Агент | Модель | Отличие от значений по умолчанию | Почему |
|---|---|---|---|
| `gpt` | `openai/gpt-oss-20b` | `retries: 4` | иногда возвращает `reply` строкой |
| `resolver` | `openai/gpt-oss-20b` | `mode: native`, `retries: 3`, лимит запросов 8 → 12 | в режиме `tool` не отдавал финальный ответ: текст вместо вызова тула, невалидный JSON |
| `gemini` | `google/gemini-2.5-flash-lite` | `retries: 2`, `capabilities` | модели нет во встроенной таблице профилей |
| `mistral`, `researcher` | `mistralai/mistral-nemo` | `retries: 2` у `mistral` | — |
| `deepseek` | `deepseek/deepseek-v4-flash-0731` | — | — |
| `qwen` | `qwen/qwen3-30b-a3b-instruct-2507` | `mode: tool` | 4 живых запроса из 4 вызвали тул вывода; закрепление снимает `W_OUTPUT_MODE_RESOLVED` |
| `llama` | `meta-llama/llama-3.1-8b-instruct` | — | — |
| `painter` | `google/gemini-3.1-flash-lite-image`, фолбэк `openai/gpt-5-image-mini` | `mode: prompted`, `capabilities` | фолбэк не дороже за картинку: $0,0216 против $0,0337 у основной |

Ни один агент не поднят на модель крупнее: вместо этого закреплён режим вывода, подняты retries и поправлены промты.
Агент `claude` стал `mistral`, `grok` удалён, узел эскалации перешёл на `deepseek`, tie-break — на `gpt`,
`record__extract` — на `gemini` (mistral-nemo принимает только текст, а узлу нужны `Image?` и `Document?`).
Места, где ветку пришлось задать кодом или входом, а не моделью, перечислены в
[examples/DESIGN.md](../../aqven-py/examples/DESIGN.md) §6.2.

### A16. Живые расходы этой работы

Только OpenRouter, ключ подгружался в окружение подпроцессов и никуда не записывался. По `GET /api/v1/key` расход вырос
с 147,976797133 до 148,114834167 USD, то есть на **0,138 USD** (ключ может быть общим, это верхняя оценка). Около 178
запросов: 11 живых проб `aqven models check --live`, 8 проб режимов вывода и около 160 запросов сценариев, включая
отброшенные заходы. Генераций картинок ровно 3. Ни видео, ни других провайдеров, ни подписки Claude.

### A17. Руководство по сборке потоков

[aqven-py/docs/building-flows.md](../../aqven-py/docs/building-flows.md) — как строить flow внутри этой раскладки: цикл
«правка → `aqven check` → `aqven prompt preview` → pytest», связывание данных, правила промтов, выбор модели и режима
вывода, сценарные тесты с подстановкой выходов узлов и разбор диагностик. Раскладка файлов —
[aqven-py/docs/project-structure.md](../../aqven-py/docs/project-structure.md).

## Поправка 2026-09-18 по итогам интеграции со Studio

Команда Studio собрала расхождения реализации со спекой на живом сервере — [docs/studio-api-integration.md](../studio-api-integration.md),
ответ движка — [docs/studio-api-integration-response.md](../studio-api-integration-response.md). Три вопроса записки
закрыты решением владельца; поправка нумеруется `A18` и действует вместе с `A1`–`A17`.

### A18. Решения владельца от 2026-09-18: чат, `me`, контекст прогона

| # | Решение | Механизм | Где раскрыто |
|---|---|---|---|
| 1 | Чат-сессия остаётся привязанной к проекту, но несёт необязательный ярлык `flow_id`, чтобы студия группировала и фильтровала сессии | `ChatSession.flow_id` и `ChatSessionOptions.flow_id`, колонка `flow_id` в `chat_sessions`, фильтр `GET /api/chat/sessions?flow_id=`; ярлык не проверяется по индексу и не ограничивает доступ, перевесить его нельзя | [23](../23-studio-api.md) §15 |
| 2 | `assignee: me` сервер разворачивает в имя локального пользователя | настройка `user.assignee` области `project` (`.env` проекта или хранилище настроек), иначе имя пользователя ОС; разрешённое значение видно в `GET /api/settings/user`; индекс ожиданий сравнивает `assignee` точно, прежнее «`me` совпадает с любым» снято | [23](../23-studio-api.md) §6.5, §6.7, §8.1 |
| 3 | Движок не выдумывает контекст прогона: не переданный ключ — явная ошибка старта, а не `None` и не «сегодня» | `EngineFacade.launch` — единственная точка проверки для HTTP, MCP, CLI, библиотеки и симуляции: 422 `CONTEXT_MISSING` с записью `{path: ["context", <ключ>], code: "CONTEXT_KEY_MISSING"}` на каждый недостающий ключ; сегодняшнюю дату подставляет форма Studio, а не сервер | [23](../23-studio-api.md) §4.2, §6.4, §12.5 |

Что из этого следует для проверок (уточняет `A10`):

- Список ключей контекста флоу выводит компилятор из привязок `$run.context.*` на всех местах связывания
  и замыкает по графу вызовов: флоу с узлом `call` публикует и ключи вызываемых флоу. Объявление `context:`
  в `flow.yaml` стало необязательным, прежнее статическое правило «ключ не объявлен в контексте флоу»
  (`E_REF_SCOPE`) снято, а объявленный и ни разу не связанный ключ даёт предупреждение
  `W_CONTEXT_KEY_UNUSED`. Список публикуется в `FlowSummary.context` и в `GET /api/flows/{id}/schemas`.
- Симулированный прогон `aqven check` подставляет ровно эти ключи (и `None`, если флоу не читает контекст),
  а не фиксированный набор из четырёх значений. Гейт перестал пропускать флоу, который гарантированно
  падает на первом `$run.context.*` при запуске по HTTP: раньше симуляция давала ложную зелень.
- К списку кодов для [07. Компилятор](../07-compiler.md) из раздела «Последствия» добавляется
  `W_CONTEXT_KEY_UNUSED`, а из него уходит правило `E_REF_SCOPE` про необъявленный ключ контекста.

## Альтернативы

| Вариант | Почему отвергнут | Когда вернёмся |
|---|---|---|
| Прод на PostgreSQL 18 ([ADR-0025](0025-python-engine.md) §4) | решение владельца: только локальное приложение; прод на PostgreSQL ни разу не запускался (ADR-0025 ОВ 9) | владелец просит командный или облачный режим — отдельный ADR |
| Настольное приложение сейчас: Tauri 2.11.4 + PyInstaller-sidecar | решение владельца: сначала браузер; PyInstaller не импортирует зависимости кода проекта (§5) | оболочка над тем же сервером с окружением на uv |
| Только loopback и `TrustedHostMiddleware` без токена | любая страница в браузере и любой локальный процесс достают `127.0.0.1`; marimo и Jupyter Server включают токен по умолчанию | — |
| Codex `app-server` или ACP | решение владельца: только Claude; адаптеры ACP на JS требуют Node | владелец просит второго агента — второй адаптер `AgentBackend` |
| Ключи только из переменных окружения | решение владельца: настройки в SQLite с областями; окружение остаётся последним звеном | — |
| `request` без потока | Studio должна видеть вывод по мере генерации | — |
| Узел `llm` через `DBOSDurability` (§9, Б) | функция-тулы и валидаторы повторяются при восстановлении, 2 лишних шага на событие, pickle всех дельт, шаги модели не прерываются | pydantic-ai оборачивает функциональные тулсеты и даёт `preemptible` |
| Конкурентные шаги в одном workflow (§10, A) | подмена выходов веток после восстановления без ошибки; пропуски offset при fork | DBOS сверяет при повторе больше, чем номер и имя шага |
| Monty, Pyodide (§12) | не импортируют зависимости проекта | Pyodide везёт ось (pydantic 2.13.5, `httpx2`, pydantic-ai-slim) или Monty импортирует сторонние пакеты |

## Последствия

- `aqven serve` ([ADR-0026](0026-yaml-spec-and-code-refs.md), [ADR-0028](0028-studio-api-contract.md) §3) — тот же локальный
  сервер с защитой §3; ОВ 7 ADR-0028 сужается до состава каталога и версии в пути. ОВ 8 ADR-0028 (stdio-вход) закрыт §4.
- В ADR-0025 закрыты ОВ 1 (§10) и 4 (§9); сняты ОВ 9 и 16 (прода нет); ОВ 8 — смысл `replacement_children` изучен (§10);
  в ОВ 11, 21 и 23 снята часть про PostgreSQL. [ADR-0011](0011-two-schemas-and-tenancy.md) (схемы и мультитенантность) и
  [ADR-0010](0010-pg-boss-scheduler.md) теряют предмет.
- DBOS 2.31.1 всё равно ставит `psycopg[binary]` 3.3.5 (LGPL-3.0-only): ADR-0025 ОВ 10 остаётся.
- Живой вывод веток: сейчас события веток сливаются в корневой поток при сведении, а дельты шагов внутри ветки уходят в
  поток дочернего workflow и в корневой SSE не попадают (открытый вопрос 3). Fork адреса внутри ветки движок пока
  отвечает `NOT_FOUND` (открытый вопрос 4).
- Поправки `A1`–`A17` добавляют к списку документов на переписывание: [07. Компилятор](../07-compiler.md) — коды
  `E_PROVIDER_EXTRA_MISSING`, `E_PROVIDER_NO_STREAMING`, `E_PROVIDER_FACTORY_INVALID`, `E_PROVIDER_ID_RESERVED`,
  `E_OUTPUT_MODE_UNSUPPORTED`, `E_TYPES_PACKAGE`, `E_SIM_*`, `W_OUTPUT_MODE_RESOLVED`, `W_TYPES_SHADOWS_STDLIB`,
  `W_SIM_NODE_UNREACHED`, `W_PROMPT_VALUE_UNREADABLE`, `W_TOOL_ARG_UNREACHABLE`, `W_CONTEXT_KEY_UNUSED` (`A18`);
  [23. API локальной студии](../23-studio-api.md) — `prompt_preview`, поля ошибки прогона (`hint`, `details`),
  `node_finished.error`, `AttemptCause.code`, `SettingView.env_var`, источники секрета `environment|dotenv`,
  `ProviderSpec` с `kind`, `run`, `params`, `capabilities` и необязательным `api_key`, `AgentModel.provider` как
  произвольный идентификатор, режимы `tool|native|prompted` в IR;
  [14. MCP-контракт](../14-mcp-contract.md) — тул `prompt_preview`, вход `static` у `aqven_check`, операции
  `rename_agent` и `delete_agent` у `flow_patch`; [08. Промты](../08-prompts.md) — правила читаемого рендера значений;
  [04. Схема IR](../04-ir-schema.md) — `CompiledAgentOutput` и поля `file` у агента и инференса.
- Документы из шапки «Становятся неверными» переписываются отдельными изменениями: 16 — на SQLite-файлы §1; 23 — токен, коды
  `UNAUTHORIZED` 401 и `HOST_NOT_ALLOWED` 400, чат, курсор событий; 10 — сегменты и дочерние workflow; 14 §7 — Bearer и
  `aqven mcp`; 20 — `aqven/server/static` и релиз пакета на PyPI.

## Проверка

Статус — на 2026-09-17, тесты без сети, если не сказано иное.

| # | Что проверяем | Как |
|---|---|---|
| 1 | Защита и жизненный цикл сервера | `tests/app` (69): порядок Host → Origin → токен, обмен query на cookie с 303, 401 с `WWW-Authenticate`, `server.json` 0600, один сервер на три одновременных старта, SIGTERM и SIGINT удаляют запись, фоновый запуск |
| 2 | API и MCP | `tests/server` (75) и `tests/server/mcp` (44): `/mcp/` без Bearer и с cookie → 401, stdio-мост в подпроцессе пересылает на HTTP-сервер |
| 3 | Чат | `tests/chat` (37): нормализатор, журнал SQLite, одобрения, SSE с `Last-Event-ID`, реальный `ClaudeSDKClient` на записанных кадрах CLI |
| 4 | Поток и кассеты | `tests/models` (26 + 5 живых под `AQVEN_LIVE=1`): `request` идёт через `request_stream`, дельты доходят до потребителя раньше конца ответа, запись и `replay_strict` потока при `ALLOW_MODEL_REQUESTS=False`, ключа нет в файле кассеты |
| 5 | Сегменты `llm` | `tests/engine/llm` (29): тул `write` с одобрением — 3 сегмента, исполнен ровно один раз; отказ возвращает сообщение модели |
| 6 | Дочерние workflow | `tests/engine/control` (35): история шагов `waitFirst`/`getResult`/`cancelWorkflow` на DBOS в подпроцессе, fork изнутри секции сведения даёт те же выходы; `tests/engine/core` (22): SIGKILL в ветке повторяет только прерванную ветку |
| 7 | `httpx` и ключи | ruff TID251 на `httpx`; проверка `uv.lock` с `ALLOWED_CONSUMERS["httpx"] ⊇ {"aqven"}`; скан БД DBOS и трасс живых проб на префикс ключа — 0 |
| 8 | Поправка `A2` | `tests/test_generated_file.py`: заголовок и место файла, подпроцессный импорт `<pkg>.types` рядом с папкой `types/` при нетронутом стандартном `types`, `E_TYPES_PACKAGE`, `W_TYPES_SHADOWS_STDLIB` через `sys.path`, `PYTHONPATH` и пустую запись; колесо, собранное `uv build`, содержит `types.py` |
| 9 | Поправки `A3`, `A14` | `tests/app/test_local_settings.py` и `tests/chat`: запись `.env` с правами 0600, приоритет переменной процесса, удаление старых секретов из SQLite, отсутствие секретов в ответах API, представлениях, сообщениях об ошибках и логах; таблицы запрета `.env` по всем защищённым тулам, отказ `can_use_tool` без запроса одобрения, argv реального `ClaudeSDKClient` без токена |
| 10 | Поправки `A4`, `A5`, `A6` | `packages/aqven-llm`: потоковый структурированный выход и «ровно один HTTP-вызов на 429» через `httpx2.MockTransport` и петлевой сервер для openrouter, openai (Responses), openai-chat, deepseek, anthropic, google, mistral, groq, bedrock, huggingface; совпадение строки каталога с выбором `infer_model`; `aqven`: `E_PROVIDER_*`, `E_OUTPUT_MODE_UNSUPPORTED`, `W_OUTPUT_MODE_RESOLVED`, классификация `MODEL_*` на `FunctionModel`, набор соответствия на примере адаптера |
| 11 | Поправка `A10` | `tests/simulation`: генерация значений по схеме, проходы `switch`, `map` и `parallel`, отчёт по сломанному узлу `code`, попадание и инвалидация кеша, заблокированный транспорт, канал spec, MCP и CLI; на копиях фикстур симуляция нашла реальную ошибку — `switch` без `bind` в `fixture_shop` |
| 12 | Поправки `A11`, `A12`, `A13` | `tests/test_check_prompt_guards.py` (регрессия lumen с `customer_id`), `tests/engine/llm/test_llm_readable.py`, `tests/test_prompt_preview.py` и тесты API и MCP предпросмотра, `tests/models/test_models_backoff.py` (429 и 502 первым чанком SSE), `test_models_cost.py`, `test_models_cassette_blobs.py` (миграция 142 кассет примера), `tests/engine/human/test_human_approval_rounds.py`, `tests/write/test_write_agents.py` |

## Пересмотр

- Владелец просит командный режим или удалённый доступ: новый ADR о хранилище и авторизации, ADR-0025 ОВ 9 открывается снова.
- Владелец возвращает настольное приложение: ADR об оболочке над этим сервером с окружениями на uv.
- pydantic-ai перестаёт импортировать `httpx` в `pydantic_ai.mcp`: прямой пин `httpx` и исключение §11 снимаются.
- pydantic-ai оборачивает функциональные тулсеты в `DBOSDurability` и даёт `preemptible` в `StepConfig`, или DBOS сверяет
  шаги при повторе строже: §9 и §10 пересматриваются.
- Anthropic не подтверждает вход по подписке для продукта на Agent SDK: чат переходит на ключ из настроек §7.
- dbos делает запись потока из шага идемпотентной: снимается правило различения дубликатов дельт.

## Открытые вопросы

1. ~~**Секреты открытым текстом в SQLite.**~~ Закрыт поправкой `A3`: ключей в SQLite нет, они лежат в `.env` проекта
   с правами 0600. Защита файла на Windows по-прежнему только права ФС; шифрование — решение владельца, если понадобится.
2. **Дубликаты дельт после восстановления сегмента.** Проба предлагала `exec_id` на исполнение шага и событие
   `segment_started`; в `node_output_delta` такого поля нет. *Закрыть:* добавить идентификатор исполнения шага в событие
   или правило Studio по `node_attempt_discarded`; тест SIGKILL посреди сегмента.
3. **Курсор событий при ветках-детях.** Единый `seq` прогона ([23](../23-studio-api.md) §11.2, §11.4, ОВ 28–29) не держится,
   если каждая ветка пишет свой поток. *Закрыть:* выбрать составной курсор `{workflow_id: offset}` или пересылку событий
   веток в корневой поток с живыми дельтами; проба fork.
4. **Fork адреса внутри ветки.** Механизм проверен пробой (§10, п. 6), движок его не реализует. *Закрыть:* записывать
   `child_workflow_id` и `function_id` старта по адресу, тест fork одной ветки.
5. **Порядок `$ok` при fork внутри сведения.** В dbos 2.31.1 `check_first_workflow_id` выбирает уже завершённого ребёнка
   `LIMIT 1` без `ORDER BY`. *Закрыть:* тест fork с несколькими завершёнными детьми; при расхождении порядок задаёт политика.
6. ~~**Прямые провайдеры Anthropic и Google.**~~ Закрыт поправкой `A4`: восемь необязательных extras `aqven-llm`
   (`anthropic`, `bedrock`, `cohere`, `google`, `groq`, `huggingface`, `mistral`, `xai`), `aqven[<extra>]` их повторяет,
   список `ALLOWED_CONSUMERS` в проверке `uv.lock` расширен.
7. **Тест-страж против `asyncio.gather` над шагами.** Проба воспроизвела подмену выходов, в наборе тестов такого стража нет.
   *Закрыть:* тест в `tests/engine`, повторяющий сценарий двух шагов на ветку со SIGKILL.
8. ~~**Токен MCP в командной строке CLI Claude.**~~ Закрыт поправкой `A13`: `mcp_servers` передаётся путём временного
   файла 0600 (`aqven-mcp-*.json`), файл удаляется при отключении клиента; тест на реальном `ClaudeSDKClient`
   подтверждает, что токена нет ни в одном аргументе.
9. **Ключ кассеты включает место вызова** (адрес исполнения + попытка), а ADR-0029 §1 выводит ключ только из нейтрального
   запроса. *Закрыть:* решить формат ключа и записать в ADR-0029 §1.
10. **Секреты тулов и заголовков MCP.** Поправка `A3` задала порядок: `ref:env/NAME` — переменная процесса `NAME`,
    затем запись `NAME` в `.env` проекта. Соглашение всё ещё не записано в спеке файлов и в контракте API.
    *Закрыть:* закрепить в [ADR-0026](0026-yaml-spec-and-code-refs.md) и [23](../23-studio-api.md).
11. **Windows.** Блокировка `msvcrt`, отсоединённый запуск и проверка живости процесса написаны, но не запускались.
    *Закрыть:* прогон `tests/app` на Windows.
12. **`--dev-origin`.** Передача токена из страницы Vite в проксируемый `/api` для установки cookie не проверена.
    *Закрыть:* e2e-тест Studio в dev-режиме.
13. **Вход по подписке для продукта на Agent SDK** ([research/desktop-app-and-agent-cli.md](../research/desktop-app-and-agent-cli.md)
    ОВ 3). *Закрыть:* подтверждение Anthropic до публичного распространения.
14. **Второй раунд одобрения после эскалации** (поправка `A13`). Раунд 1 с эскалацией поднимает номер попытки до 2, и
    раунд 2 открывает тот же топик; человек ответит (новый `client_op_id`), скриптованный ответ DBOS дедуплицирует.
    *Закрыть:* выдавать номер ожидания журналом, а не смещением от попытки узла; тест на два раунда с эскалацией.
15. **Таблица известных моделей для `auto`** (поправка `A6`) подтверждена частично: `qwen3-30b-a3b-instruct-2507`
    вызвал тул вывода в 4 живых запросах из 4 и получил свою строку, а правило семьи `openrouter:qwen/` (→ `prompted`)
    живыми вызовами не подтверждено. *Закрыть:* по живой пробе на каждую строку семьи или сузить правило до моделей,
    где текст вместо тула воспроизведён.
16. **Кеш симуляции не учитывает разрешимость импортов** (поправка `A10`). Один прогон из интерпретатора, где пакет
    проекта не импортируется, записывает ложные `E_SIM_NODE_FAILED` и `E_CODE_REF_UNRESOLVED`, и они переживают
    `uv sync`; `--no-cache` читает мимо кеша, но не обновляет файл. *Закрыть:* включить разрешимость импорта в ключ
    кеша (или не кешировать отказ загрузки ссылки на код) и дать `--no-cache` перезаписывать запись.
17. **`aqven` не опубликован на PyPI**, поэтому `aqven new` без `--aqven-path` падает на `uv sync` (поправка `A8`).
    *Закрыть:* релиз пакета.
18. **Один `uv.lock` на workspace опускает базовую установку** (поправка `A4`): `xai-sdk` 1.19.0 требует
    `packaging<26` и `protobuf<7`, `google-genai` 2.24.0 — `websockets<17`, поэтому в lock оказались packaging 25.0,
    protobuf 6.33.6 и websockets 16.1.1. `conflicts` в uv не разделяют базу и extra. *Закрыть:* решение владельца —
    принять просадку или отказаться от extra `xai`.
19. **`W_OUTPUT_MODE_RESOLVED` — предупреждение, а не информация** (поправка `A6`): уровня `info` в модели диагностики
    нет, поэтому каждый агент с `mode: auto` добавляет предупреждение в счётчик `aqven check`. *Закрыть:* добавить
    третий уровень в `Diagnostic` и его потребителей или оставить как есть решением владельца.
20. **`capabilities` у агентов `gemini` и `painter` примера** (поправки `A13`, `A15`) могли стать лишними после того,
    как в `aqven.spec.profiles` появились строки для трёх моделей OpenRouter. *Закрыть:* убрать блоки и проверить, что
    `aqven check` остаётся чистым.
