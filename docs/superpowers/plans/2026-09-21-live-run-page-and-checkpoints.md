# Live Run Page and Checkpoint Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Страница прогона в Studio показывает выполнение живьём — статусы узлов и токены ответа по мере
поступления — и даёт полное управление чекпойнтами: остановить прогон, форкнуть с любого выполнившегося
узла в новый прогон, перезапустить с нуля.

**Architecture:** Движок уже пишет все события в durable DBOS-стрим и отдаёт их по SSE
(`GET /api/runs/{run_id}/events`) с переподключением по `Last-Event-ID`; форк с точки узла уже реализован
в `engine/forking.py` через `DBOS.fork_workflow(start_step=...)`. Ничего из этого не переписывается.
Добавляется: обработка отмены в читателе стрима, подписка на SSE во фронте с инкрементальной сборкой
трассы, и органы управления в интерфейсе поверх существующих маршрутов `cancel`, `fork`, `run_start`.

**Состояния «пауза» не вводится.** Остановка — это `cancel`, продолжение — это `fork` с нужного узла либо
новый прогон с нуля. `cancelled` остаётся терминальным статусом, `RunStatus` и `TerminalRunStatus` не
меняются, поверхность MCP остаётся 18 тулов, ADR-0042 и `docs/14-mcp-contract.md` не правятся.

**Tech Stack:** Python 3.14, DBOS 2.31.1, FastAPI, SSE через `EventSourceResponse`; React 19, TypeScript 6,
TanStack Router, Vitest/MSW.

---

## Почему без паузы

Проверено чтением исходников DBOS 2.31.1 и движка:

- В DBOS нет статуса `PAUSED`. «Пауза» технически была бы тем же `cancel_workflow`, отличаясь только
  меткой намерения.
- `cancelled` уже трактуется как терминальное в трёх местах, и это правильно: `reader.py` синтезирует
  `RunFinished`, `dataset_batches.py:305` считает отменённый кейс завершённым, `TerminalRunStatus` включает
  `cancelled`. Если сделать `cancelled` возобновляемым, батч с отменённым кейсом никогда не завершится.
- `run_fork` покрывает продолжение: `node_boundary` записывается для каждого выполнившегося узла
  (`interpreter.py:361`), `locate_fork` находит его по адресу, `fork_workflow(start_step)` переигрывает
  предыдущие шаги из журнала без повторной оплаты.

Цена решения, принятая сознательно: `node_boundary` вызывается **до** выполнения узла, поэтому форк с узла N
переисполняет сам узел N. Отмена приземляется на незаписанную границу следующего узла, значит «продолжить
с места остановки» на практике переигрывает последний завершённый узел — одна лишняя оплата вызова модели.
Форкнуть на узел, который ещё не стартовал, нельзя: `locate_fork` вернёт `None` и маршрут ответит `NOT_FOUND`.

## Execution constraints

- В рабочем дереве есть чужие незакоммиченные правки в `apps/site` и `apps/studio/src/features/chat/chat-session.tsx`,
  плюс параллельная работа в `.worktrees/aqven-docs-ia-wave1`. Смотреть `git status` перед каждым коммитом и
  **стейджить только свои пути**. `git stash` без аргументов запрещён.
- Studio требует Node 24 из `.nvmrc`: перед pnpm-командами `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.
  На Node 20 vitest падает в undici с `webidl.util.markAsUncloneable is not a function` — это не регрессия.
- Не удалять каталоги `.aqven/` целиком: там лежат `aqven.sqlite` с тредами чата и `blobs/`, нужные датасетным
  тестам. Удалять допустимо только `.aqven/server.json`.
- Перед коммитом: `uv run --frozen ruff check .` и `uv run --frozen aqven check examples/lumen`.
- Архитектурное решение «управление чекпойнтами без паузы» оформляется ADR (Task 8) до финального коммита.
- 95 существующих ошибок pyright в `packages/` — предсуществующий фон, задача их не чинит; проверяется, что
  в тронутых файлах ошибок нет.

## File map

| Ответственность | Файлы |
|---|---|
| Отмена в читателе стрима | `packages/aqven/src/aqven/engine/reader.py`, `packages/aqven/tests/engine/core/test_engine_core_runs.py` |
| Транспорт событий прогона | новый `apps/studio/src/features/runs/run-stream.ts` |
| Живое состояние трассы | новый `apps/studio/src/features/runs/use-run-stream.ts`, `apps/studio/src/routes/flows/$flowId/runs.tsx`, `apps/studio/src/features/runs/runs-screen.tsx` |
| Органы управления | `apps/studio/src/features/runs/run-detail.tsx`, новый `apps/studio/src/features/runs/run-controls.tsx` |
| Форк с узла | `apps/studio/src/features/runs/run-node-navigator.tsx` либо `apps/studio/src/features/trace/` (по месту строк узлов) |
| Живой вывод | новый `apps/studio/src/features/runs/live-output.tsx` |
| Тексты и моки | `apps/studio/src/i18n/messages/en/runs.json`, `apps/studio/src/mocks/handlers.ts` |
| Решение и документация | новый `docs/adr/0043-run-checkpoints-without-pause.md`, `docs/adr/README.md`, `docs/23-studio-api.md` §11.2 |

---

### Task 1: Отмена не роняет подписчиков стрима

**Files:** Modify `packages/aqven/src/aqven/engine/reader.py`, `packages/aqven/tests/engine/core/test_engine_core_runs.py`.

Внутри `DBOS.read_stream_async` работает `_StreamReadCheckpoint.check_cancelled`, который раз в секунду
проверяет статус и поднимает `DBOSWorkflowCancelledError` (`dbos/_core.py:3113-3131`). `RunEventLog._read`
ловит только `DBOSStreamTimeoutError` (`reader.py:93`), поэтому отмена прогона с открытой подпиской
пробрасывает исключение наружу — в SSE-генератор и всем подписчикам. Сейчас это не стреляет только потому,
что кнопки отмены в интерфейсе нет, а мы её добавляем в Task 5.

- [ ] Добавить падающий тест в `test_engine_core_runs.py`: запустить `gated` прогон, начать потреблять
      `facade.run_events(run_id)` в отдельной задаче, отменить прогон, снять гейт. Ожидание: итератор
      **завершается** и последним событием отдаёт синтезированный `RunFinished` со `status == "cancelled"`,
      а не поднимает `DBOSWorkflowCancelledError`. Взять за образец существующий
      `test_cancel_marks_run_and_closes_event_stream` и его `launched_facade` / `GATE_ENV` / `trace_lines`.
- [ ] Запустить `uv run --frozen pytest packages/aqven/tests/engine/core/test_engine_core_runs.py -q`;
      ожидать падение с `DBOSWorkflowCancelledError`.
- [ ] Расширить `except` в `RunEventLog._read` до `(dbos_errors.DBOSStreamTimeoutError, dbos_errors.DBOSWorkflowCancelledError)`
      с `return`. Проверить имя класса в установленном пакете, а не по памяти. После выхода из `_read`
      управление уходит в `follow`, которое зовёт `_closing`, и тот уже синтезирует `RunFinished` из
      `TERMINAL_DBOS_STATUSES["CANCELLED"] == "cancelled"`. Отдельного кода для терминального события не писать.
- [ ] Проверить, что `snapshot()` (через `stored()` → `_read(timeout=0)`) на отменённом прогоне тоже не падает,
      и что маршрут `GET /api/runs/{run_id}/events/log` отвечает на отменённом прогоне. Добавить утверждение
      в тот же тест либо в `packages/aqven/tests/server/test_server_runs.py`.
- [ ] Перезапустить тест; ожидать PASS. Прогнать `uv run --frozen pytest packages/aqven/tests/engine -q` и
      `uv run --frozen pyright packages/aqven/src/aqven/engine` — в `reader.py` ошибок быть не должно.

### Task 2: Транспорт событий прогона во фронте

**Files:** Create `apps/studio/src/features/runs/run-stream.ts`.

Сервер отдаёт каждое событие кадром с `event: <type>` и `id: <seq>` (`routes/runs.py:52`), поэтому
`EventSource` обязан слушать именно имена типов, а не `message`. Готовый образец — `chat-transport.ts:46-58`.
Доступ по cookie: middleware `app/access.py` принимает `aqven_access_<port>` для `/api`, заголовки
`EventSource` слать не умеет — именно так уже работает чат.

- [ ] Объявить `RUN_EVENT_TYPES` как `readonly string[]` из 20 имён `RunEventType`
      (`packages/aqven/src/aqven/runtime/events.py:226-248`). Типы брать из `ApiRunEvent`, список имён держать
      в одном месте фичи, а не дублировать по компонентам.
- [ ] Реализовать тип `RunTransport = { subscribe(runId, afterSeq, onEvent): () => void }` и его боевую
      реализацию поверх `runEventsUrl` (`data/live/sources.ts:280`, сейчас без единого вызова). Сохранить
      защиту `typeof EventSource === "undefined"` → подписка-заглушка: в jsdom `EventSource` отсутствует,
      полифилла в `src/test/setup.ts` нет.
- [ ] Транспорт делать **внедряемым** (параметр/проп, как `ChatTransport`), чтобы тесты подавали фейк и
      проверяли дозапись без сети.
- [ ] Валидировать каждый кадр перед применением: `JSON.parse`, проверка `typeof seq === "number"` и
      известного `type`. Неизвестное — игнорировать молча, не ронять страницу.

### Task 3: Живое состояние трассы на маршруте прогона

**Files:** Create `apps/studio/src/features/runs/use-run-stream.ts`; modify `apps/studio/src/routes/flows/$flowId/runs.tsx`, `apps/studio/src/features/runs/runs-screen.tsx`.

Сейчас лоадер маршрута грузит события один раз (`runs.tsx:61-63` → `api.run.events(runId)` →
`/api/runs/{run_id}/events/log`), а `buildTrace` собирает трассу из массива. Лоадер остаётся источником
первого кадра, подписка добавляется поверх.

- [ ] Написать падающий тест в `runs-screen.test.tsx`: отрисовать прогон с фейковым транспортом, вытолкнуть
      `node_started`, `node_output_delta`, `node_finished` и убедиться, что строка узла меняет статус, а текст
      ответа дописывается — без перезахода на экран.
- [ ] `pnpm --filter @aqven/studio test`; ожидать падение.
- [ ] Реализовать `useRunStream(runId, initialEvents, transport)`: состояние — массив событий, начальный —
      из лоадера; подписка с `afterSeq = последний seq` (не с нуля, иначе дубли); дозапись только событий с
      `seq` больше уже виденного; отписка на смене `runId` и на размонтировании.
- [ ] Трассу пересобирать `buildTrace` от накопленного массива. Инкрементальную свёртку **не делать**:
      преждевременная оптимизация, `buildTrace` чистая и дешёвая. Зафиксировать это решение в комментарии
      плана, а не в коде.
- [ ] Снапшот (стоимость, счётчики, статус) при `run_finished` перезапрашивать один раз через
      `api.run.snapshot(runId)`; в остальное время не опрашивать. Метрики шапки во время прогона считать из
      событий, а не поллингом.
- [ ] Перезапустить тест; ожидать PASS.

### Task 4: Моки маршрутов жизненного цикла

**Files:** Modify `apps/studio/src/mocks/handlers.ts`.

В моках нет обработчиков `cancel` и `fork` — есть только `sources.ts`, который их зовёт.

- [ ] Добавить `POST /api/runs/:runId/cancel` → `{ status: "cancelled" }` и `POST /api/runs/:runId/fork` →
      `{ run_id: <новый>, lineage_parent: <runId> }`. Сверить формы ответа с `CancelResult` и `RunForked`
      в `apps/studio/src/api/schema.d.ts`, не выдумывать поля.
- [ ] Прогнать существующий набор тестов студии — он не должен измениться.

### Task 5: Органы управления в шапке прогона

**Files:** Create `apps/studio/src/features/runs/run-controls.tsx`; modify `apps/studio/src/features/runs/run-detail.tsx`, `apps/studio/src/i18n/messages/en/runs.json`.

- [ ] Падающие тесты: у идущего прогона есть «Cancel» и он зовёт маршрут; у завершённого его нет; «Restart»
      доступен всегда и открывает форму запуска, предзаполненную прошлым входом (`StartRun` уже принимает
      `previousRun`, `start-run.tsx:1-40`).
- [ ] Реализовать `RunControls` от `snapshot.status`. Разрешённость считать исчерпывающей таблицей по
      `RunStatus` с `assertNever`, а не цепочкой `if` — строгий TS тогда сам поймает добавление статуса.
- [ ] Встроить в `RunHeader` рядом с тегами статуса и режима. Все подписи — через `useTranslations("runs")`,
      новые ключи в `en/runs.json`; хардкода строк в JSX не допускать.
- [ ] После успешной отмены не перезагружать маршрут: `run_finished` придёт по подписке из Task 3 и сам
      обновит шапку. Это и есть проверка, что живой поток работает.
- [ ] Тесты зелёные; `pnpm --filter @aqven/studio lint typecheck` чисто.

### Task 6: Форк с узла

**Files:** Modify `apps/studio/src/features/runs/run-node-navigator.tsx` (или строки узлов в `apps/studio/src/features/trace/`), `apps/studio/src/i18n/messages/en/runs.json`.

- [ ] Падающие тесты: у строки выполнившегося узла есть действие «форкнуть отсюда»; нажатие зовёт
      `api.run.fork(runId, { from: address })` и переходит на `?run=<новый run_id>`; у узла без исполнения
      действия нет.
- [ ] Реализовать действие на строках узлов. Кандидаты — только узлы, присутствующие в трассе: у остальных
      нет записанного `node_boundary`, и сервер ответит `NOT_FOUND` (`facade.py:461-463`).
- [ ] Ошибку маршрута показывать человеку, а не глотать: `NOT_FOUND` означает «этот узел не выполнялся»,
      `NOT_RUNNABLE` — «форк с правками или на рабочую копию не поддерживается» (`facade.py:457-460`).
- [ ] Шапка уже рисует ссылку на родителя по `snapshot.lineage` (`run-detail.tsx:58-62`) — проверить тестом,
      что после форка она ведёт на исходный прогон, и ничего нового не писать.
- [ ] **Решение по стоимости:** шапка показывает стоимость только текущего прогона. Сумма по цепочке форков
      не складывается: это поведение, а не оформление, и молчаливое суммирование исказит отчётность. Цепочка
      проходится по ссылке родителя вручную. Зафиксировать в ADR (Task 8).

### Task 7: Панель живого вывода

**Files:** Create `apps/studio/src/features/runs/live-output.tsx`; modify `apps/studio/src/features/runs/run-detail.tsx`.

`NodeOutputDelta` несёт `delta`, `part_kind`, `part_index`, `attempt`, `cumulative_length`; движок склеивает
дельты окном 80 мс (`OUTPUT_DELTA_BATCH_MS`). `NodeAttemptDiscarded` сообщает, что попытка отброшена на
ретрае — это то, что пользователь иначе никогда не увидит. Сборка текста по попыткам уже написана в
`features/trace/build.ts:115-130`.

- [ ] Падающие тесты: дельты текущего узла появляются по мере прихода; при `node_attempt_discarded`
      отброшенная попытка помечается и не смешивается с новой; после `node_finished` панель показывает
      финальный вывод.
- [ ] Реализовать панель для активного узла. Скроллинг — нативный, без кастомных полос и библиотек.
- [ ] Не автоскроллить, если пользователь прокрутил вверх: прилипание к низу только когда он уже внизу.
- [ ] Тесты зелёные.

### Task 8: ADR и документация

**Files:** Create `docs/adr/0043-run-checkpoints-without-pause.md`; modify `docs/adr/README.md`, `docs/23-studio-api.md`.

- [ ] Написать ADR-0043 по структуре Контекст → Решение → Альтернативы → Последствия → Проверка → Пересмотр.
      Контекст: в DBOS нет `PAUSED`, «пауза» была бы тем же `cancel_workflow`. Решение: чекпойнты — это
      `cancel` + `fork` + перезапуск; `cancelled` остаётся терминальным. Альтернатива «статус `paused` через
      `update_workflow_attributes`» отвергнута с ценой: правка `TerminalRunStatus`, синтеза `RunFinished` и
      счётчика батчей, плюс обязательное возобновление дочерних workflow веток (родитель, ждущий отменённого
      ребёнка, получает `DBOSAwaitedWorkflowCancelledError`, `dbos/_sys_db.py:1857`). Последствия: форк
      переисполняет узел, с которого форкает; стоимость по цепочке не суммируется.
- [ ] Добавить строку в таблицу `docs/adr/README.md`.
- [ ] В `docs/23-studio-api.md` §11.2 (run-канал) описать, что подписка на отменённом прогоне корректно
      закрывается синтезированным `run_finished`, а не обрывом.
- [ ] Поверхность MCP не трогать: `run_cancel`, `run_fork`, `run_start` уже на ней, тулов остаётся 18,
      ADR-0042 и `docs/14-mcp-contract.md` без изменений.

---

## Финальная проверка

```
uv run --frozen ruff check .
uv run --frozen pytest packages/aqven -q
uv run --frozen aqven check examples/lumen
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
pnpm --filter @aqven/studio lint
pnpm --filter @aqven/studio typecheck
pnpm --filter @aqven/studio test
pnpm --filter @aqven/studio check:api
```

`check:api` должен остаться зелёным без перегенерации: задача не меняет ни одного маршрута и ни одной модели.
Если он упал — значит тронут контракт, и это ошибка, а не повод перегенерировать.

## Что эта задача сознательно не делает

- Не вводит паузу и не меняет `RunStatus`.
- Не поддерживает форк на рабочую копию (`at: "working"`) и форк с правками (`overrides`): движок их
  отклоняет осознанно, потому что изменённый флоу меняет саму последовательность шагов, которую форк
  переигрывает. Нужный эффект уже даёт `run_start` с `start_node`/`end_node` и `node_outputs` (ADR-0035).
- Не эмитит `RunSuspended` и `RunResumed`: они объявлены в контракте, но движком не эмитятся ни разу
  (конструируются только в тестовых фейках). Решать, эмитить их или удалить из контракта, — отдельная задача.
- Не чинит 95 предсуществующих ошибок pyright и не переформатирует файлы, которых не касается.
