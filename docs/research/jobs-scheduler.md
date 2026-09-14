# Фоновые задачи, таймеры, идемпотентность

Черновик для техписателя. Версии/лицензии — по `npm view` на 2026-09-11, сигнатуры — из
реально установленных `.d.ts`. Непроверенное помечено `UNVERIFIED:`.

Зачем нам планировщик вообще (из спеки и из 00-verified-by-lead.md):
- **таймауты human-задач** — VoltAgent `suspend/resume` сам по таймауту НЕ возобновляет
  (`node_modules/@voltagent/core/docs/workflows/suspend-resume.md`);
- **синхронизация каталога моделей** по расписанию (OpenRouter/models.dev);
- **batch-прогоны eval** (@voltagent/evals 2.0.5);
- **shadow/canary** прогоны новой версии воркфлоу на трафике.


## 1. Сравнение: pg-boss / graphile-worker / BullMQ / Inngest / Trigger.dev v4 / Temporal

Все версии/лицензии — `npm view <pkg> version license time.modified engines`, выполнено 2026-09-11.
Ни один кандидат не заброшен: у всех релизы за последние 2 недели.

| Критерий | pg-boss | graphile-worker | BullMQ | Inngest | Trigger.dev v4 | Temporal (TS SDK) |
|---|---|---|---|---|---|---|
| Версия | **12.31.0** | **0.18.0** | **6.3.4** | **4.20.0** (`inngest`) | **4.5.16** (`trigger.dev`, `@trigger.dev/sdk`) | **1.23.0** (`@temporalio/*`) |
| Лицензия | MIT | MIT | MIT | Apache-2.0 | MIT (SDK; платформа — отдельно) | MIT |
| `time.modified` | 2026-09-10 | 2026-09-08 | 2026-09-10 | 2026-09-04 | 2026-09-11 | 2026-08-26 |
| `engines.node` | >=22.12.0 | >=22.18.0 | >=14.17.0 | >=20 | >=18.20.0 | >=20.3.0 |
| Хранилище | **Postgres** (`pg ^8.23`) | **Postgres** (`pg ^8.11`) | Redis (peer `ioredis`/`redis`; в 6.x появился ещё и peer `pg >=8.0.0`) | SaaS/self-host сервер Inngest | SaaS/self-host (Docker-стек: Postgres+Redis+ClickHouse) | Temporal Server (отдельный кластер + БД) |
| Доп. инфраструктура сверх нашей | **нет** | **нет** | Redis | внешний сервис + публичный webhook-эндпоинт | внешний сервис/стек | кластер |
| Отложенный запуск | `sendAfter(name,data,opts,Date\|string\|seconds)`, `options.startAfter` | `addJob(..., { runAt })` | `delay` в опциях job | `step.sleep`/`sleepUntil` внутри функции | `wait.for()`, `delay` | `sleep()` в workflow (durable timer) |
| Cron / RRULE | `schedule(name, cron\|RRULE, data, opts)`, `tz`, `key`, `missed:'skip'\|'once'` | `crontab`-файл или `parsedCronItems` | `upsertJobScheduler` (repeatable) | `{ cron: '...' }` trigger | `schedules.create` | Schedules API |
| Приоритеты | `priority: number`, плюс `minPriority`/`maxPriority` у воркера | `priority` | `priority` | нет явного | `queue.concurrencyLimit`, приоритеты ограниченно | нет (через task queues) |
| Уникальность/дедуп | `singletonKey` + `singletonSeconds`/`singletonNextSlot`, `sendThrottled`, `sendDebounced`, политики очереди `singleton\|short\|stately\|exclusive\|key_strict_fifo` | `jobKey` + `jobKeyMode: 'replace'\|'preserve_run_at'\|'unsafe_dedupe'` | `jobId` (дедуп по id), deduplication API | `idempotency` ключ на событии/функции | `idempotencyKey` на task run | `WorkflowId` + reuse policy — сильнейший вариант |
| Транзакционный enqueue | **да**, `options.db` + готовые адаптеры `fromDrizzle/fromKysely/fromKnex/fromPrisma/fromPglite/fromBunSql` | **да**, `addJob` через существующий `pgClient` | нет (Redis вне транзакции PG) | нет (HTTP) | нет (HTTP) | нет (через сигналы) |
| Наблюдаемость | `getQueues/getQueueStats/findJobs/getWipData`, события `error`/`warning`, warning-типы `queue_backlog`, `clock_skew`, `index_bloat`, `slow_query`; UI — сторонний | таблицы в схеме + `graphile-worker` CLI; UI в Worker Pro | Bull Board / Taskforce (зрелые UI) | богатый веб-UI, трассировка шагов | богатый веб-UI, логи/трассировка прогонов | Web UI, полная история событий |
| Что даёт сверх очереди | flow/зависимости задач (`flow(jobs[])`, `dependsOn`), dead-letter + `redrive()`, pub/sub, group concurrency, heartbeat для зависших, детект дрейфа схемы | «просто и надёжно», минимум магии | rate limit, flow (BullMQ Pro — платно) | durable execution поверх своего движка | durable execution + контейнерные прогоны | полноценный durable execution |
| Риск для нас | schema-миграции pg-boss живут в нашей БД; нагрузка на PG | скромнее по фичам (нет дедлеттера из коробки в 0.18) | **лишний Redis** | vendor lock + сеть в критическом пути | vendor lock + тяжёлый стек | **дублирует VoltAgent**: два движка durable execution в одном продукте |

Ключевой факт: `bullmq@6.3.4` имеет `peerDependencies: { pg: '>=8.0.0', redis: '>=5.0.0', ioredis: '>=5.0.0', 'bullmq-otel': '>=2.0.0' }` — то есть появился Postgres-бэкенд, но это опциональные peer'ы. UNVERIFIED: зрелость PG-бэкенда BullMQ 6 не проверялась; для v1 не рассматриваем.

Почему Temporal/Inngest/Trigger.dev не подходят концептуально: у нас **уже есть** движок durable execution — VoltAgent workflow с `suspend/resume` и чекпойнтами. Второй такой движок означает две модели исполнения, два формата трейсов и двойную семантику ретраев. Нам нужен не движок, а **таймер + планировщик + надёжный enqueue**.

## 2. Вердикт для v1 и топология процессов

**Берём `pg-boss@12` (MIT).** Обоснование:
1. Нулевая новая инфраструктура — у нас уже Postgres (там же `@voltagent/postgres@2.1.3` для памяти/трейсов).
2. Единственный кандидат, у которого **все пять наших сценариев** закрываются штатным API: отложенные задачи (дедлайны human-задач), cron+RRULE (синк каталога моделей), приоритеты и батчи (eval-прогоны), `singletonKey`/политики очередей (дедуп shadow/canary), dead-letter + `redrive` (разбор падений).
3. **Транзакционный enqueue через `options.db`** с адаптером `fromDrizzle` — это и есть готовый transactional outbox, без своей таблицы outbox (см. §4).
4. Postgres даёт нам SQL-наблюдаемость поверх задач без отдельной системы: задачи, трейсы и бизнес-данные в одной БД и в одном бэкапе.

Запасной вариант, если pg-boss окажется тяжёл для нашей БД: `graphile-worker@0.18` — легче, но придётся руками делать dead-letter и throttle/debounce.

### Топология процессов

**Рекомендация для v1: один процесс, две роли, но с флагом разделения.**

Один Node-процесс поднимает и `VoltAgent`, и `PgBoss`:
- воркфлоу зарегистрированы в `WorkflowRegistry` (см. `00-verified-by-lead.md` — регистрация горячая, рестарт не нужен);
- pg-boss-обработчики вызывают `workflow.run()` / `resumeSuspendedWorkflow()` напрямую в этом же процессе.

Почему так, а не два процесса сразу:
- воркер обязан уметь **возобновлять** приостановленный воркфлоу, а `resume` требует, чтобы воркфлоу был **зарегистрирован в том процессе, который его исполняет**. Регистрация идёт из скомпилированного IR, значит компилятор и реестр нужны и воркеру тоже. В одном процессе это один код-путь;
- `WorkflowRegistry.getInstance()` — глобальный синглтон на `globalThis`, то есть «один процесс = один реестр», разнести реестр между процессами нельзя, его надо продублировать.

Когда разносить на два процесса (готовим к этому архитектурно с первого дня):
- eval-батчи и shadow-прогоны едят CPU и забивают event loop, из-за чего HTTP-API VoltAgent начинает тормозить;
- нужно масштабировать воркеры независимо от API.

Как разносить правильно — **один образ, разные роли по env**:
```
ROLE=api    → VoltAgent + server-hono + PgBoss ТОЛЬКО как producer (send/schedule), без work()
ROLE=worker → VoltAgent (реестр + компилятор, без HTTP) + PgBoss с work() на всех очередях
```
Оба процесса строят реестр воркфлоу из одного источника (БД с определениями + компилятор IR→VoltAgent), поэтому «регистрация в обоих» получается автоматически, а не двумя списками. Это фактически Composition Root, вынесенный в общий пакет; `ROLE` только выбирает, какие адаптеры поднять.

Подводные камни топологии:
- **горячая регистрация должна доезжать до воркера.** При публикации новой версии воркфлоу API-процесс регистрирует её у себя; воркер про неё не знает. Решение: pub/sub-очередь pg-boss (`publish('workflow.published', {id, version})` + `subscribe`), воркер по событию перекомпилирует и вызывает `registerWorkflow`. Fallback — ленивая компиляция: воркер при получении задачи проверяет `registry.getWorkflow(id)` и компилирует по требованию из БД. Ленивый вариант надёжнее, pub/sub — оптимизация;
- pg-boss multi-master совместим (несколько реплик воркера безопасны, `SKIP LOCKED`), но `schedule()` должен объявляться идемпотентно при старте каждой реплики — `schedule()` апсертит по `(name, key)`;
- миграции схемы pg-boss: в проде запускать через CLI/`getMigrationPlans()`, а не давать рантайму DDL-права. `detectSchemaDrift()` — для health-чека.
## 3. Реальный API pg-boss@12.31.0 (сигнатуры из `node_modules/pg-boss/dist/*.d.ts`)

Файлы: `dist/index.d.ts` (класс `PgBoss`), `dist/types.d.ts` (опции), `dist/adapters/drizzle.d.ts`.
Импорт именованный: `import { PgBoss, fromDrizzle } from 'pg-boss'` (в README — `const { PgBoss } = require('pg-boss')`, то есть **не** default-экспорт, как было в v9).

### Конструктор и старт
```ts
constructor(connectionString: string)
constructor(options: types.ConstructorOptions)  // DatabaseOptions & SchedulingOptions & MaintenanceOptions & BackendOptions
start(): Promise<this>
stop(options?: StopOptions): Promise<void>
```
Важные ключи `ConstructorOptions`:
- `schedule?: boolean` — включать ли cron-воркер в этом процессе (в роли `api` ставим `false`, чтобы планировщик крутился только у воркеров);
- `supervise?: boolean`, `migrate?: boolean`, `createSchema?: boolean` — обслуживание и DDL. В проде `migrate:false`/`createSchema:false`, миграции — через CLI или `getMigrationPlans(schema, version)`;
- `useListenNotify?: boolean` — LISTEN/NOTIFY вместо ожидания поллинга. Держит **отдельное соединение**, **не работает через PgBouncer в transaction pooling**; при сбое — `warning` и деградация на поллинг. Включается ещё и **на очереди**: `createQueue(name, { notify: true })`;
- `backend?: BackendProfile` = `'postgres' | 'cockroachdb' | 'yugabytedb' | 'citus' | 'pglite'`. `pglite` — встроенный WASM-Postgres, удобен для тестов планировщика без docker.

### Очередь (объявляется явно, иначе `send` упадёт)
```ts
createQueue(name: string, options?: Omit<Queue,'name'>): Promise<void>
updateQueue(name: string, options?: UpdateQueueOptions): Promise<void>
```
`Queue extends QueueOptions`: `policy`, `partition`, `deadLetter`, `warningQueueSize`, `heartbeatSeconds`, `notify`.
`QueueOptions` (наследуются каждым job'ом, если не переопределены): `expireInSeconds` (default 900), `retentionSeconds` (14 дней), `deleteAfterSeconds` (7 дней), `retryLimit` (**default 2**), `retryDelay` (0), `retryBackoff`, `retryDelayMax`, `heartbeatSeconds`.

`QueuePolicy = 'standard' | 'short' | 'singleton' | 'stately' | 'exclusive' | 'key_strict_fifo'` — дословно из `types.d.ts`:
- `short` — 1 job в очереди, active неограниченно;
- `singleton` — 1 active, queued неограниченно;
- `stately` — 1 job **на состояние** (queued и/или active);
- `exclusive` — 1 job queued **или** active;
- `key_strict_fifo` — строгий FIFO **внутри `singletonKey`**; требует `singletonKey` на каждом job'е; приоритет не переупорядочивает внутри ключа; deferred-джоб включается в порядок, когда наступает его `startAfter`.
Все, кроме `standard`, «расширяются через `singletonKey`» — то есть политика применяется **в разрезе ключа**, а не всей очереди. Это наш механизм «одна активная human-задача/один синк каталога на ключ».

### Постановка задачи, отложенный запуск
```ts
send(name: string, data?: object|null, options?: SendOptions): Promise<string | null>
sendAfter(name, data, options|null, date: Date): Promise<string | null>
sendAfter(name, data, options|null, dateString: string): Promise<string | null>
sendAfter(name, data, options|null, seconds: number): Promise<string | null>
insert(name: string, jobs: JobInsert[], options?: InsertOptions): Promise<string[] | null>   // батч
flow(jobs: FlowJob[], options?): Promise<Record<string,string>>                              // граф зависимостей
```
`SendOptions = JobOptions & QueueOptions & ConnectionOptions`, где
```ts
interface JobOptions {
  id?: string; priority?: number;
  startAfter?: number | string | Date;
  singletonKey?: string; singletonSeconds?: number; singletonNextSlot?: boolean;
  group?: { id: string; tier?: string }; deadLetter?: string;
}
```
**`send()` возвращает `null`, когда задача отброшена политикой/дедупом** — это и есть сигнал «дубликат», проверять его обязательно, иначе дедуп молча работает, а код думает, что поставил задачу.

`FlowJob { ref, name, data?, options?, dependsOn?: string[] }` + `getDependencies/getDependents(name,id)` — встроенный DAG задач. Нам пригодится для eval-батча: `N` прогонов + финальный «свести отчёт», зависящий от них.

### Дедупликация / throttle / debounce
```ts
sendThrottled(name, data, options|null, seconds: number, key?: string): Promise<string|null>
sendDebounced(name, data, options|null, seconds: number, key?: string): Promise<string|null>
upsert(name, data, options?: UpdateOptions): Promise<UpsertResponse>
update(name, data, options?: UpdateOptions): Promise<UpdateResponse>
getBlockedKeys(name: string): Promise<string[]>
```
- `singletonKey` — ключ уникальности; `singletonSeconds` — окно throttle; `singletonNextSlot` — вместо отбрасывания перенести в следующий слот.
- `upsert` даёт «поставить или обновить существующую pre-active задачу с тем же ключом» — то, что нужно для «передвинуть дедлайн human-задачи», без гонки delete+insert. `JobMatchStrategy = 'newest' | 'oldest' | 'all'` выбирает, какой из совпавших по ключу job перезаписывать.

### Cron / RRULE
```ts
schedule(name: string, cron: string, data?: object|null, options?: ScheduleOptions): Promise<void>
unschedule(name: string, key?: string): Promise<void>
getSchedules(name?: string, key?: string): Promise<Schedule[]>
previewSchedule(cron: string, options?: PreviewScheduleOptions): Date[]   // синхронно, для UI
type ScheduleOptions = SendOptions & { tz?: string; key?: string; missed?: 'skip' | 'once' }
```
Второй аргумент — **cron-выражение ИЛИ RFC 5545 RRULE** (дословно из doc-комментария: «a cron expression, or an RFC 5545 recurrence rule such as `FREQ=MONTHLY;BYDAY=-1FR;BYHOUR=17`»). Реализация: зависимости `cron-parser@^5.10` и `rrule-temporal@^2.2`.
`missed` — что делать с пропущенными срабатываниями, пока деплой лежал: `'skip'` (default) ничего не шлёт, `'once'` шлёт одну задачу за самое свежее пропущенное. Для синка каталога моделей нужен `'once'`.
`key` позволяет держать **несколько расписаний на одной очереди** (например, синк OpenRouter и синк models.dev — одна очередь `catalog.sync`, два ключа).

### Обработка
```ts
work<Req,Res>(name: string, handler: WorkHandler<Req,Res>): Promise<string>
work<Req,Res,O extends WorkOptions>(name: string, options: O, handler: WorkHandlerFor<O,Req,Res>): Promise<string>
offWork(name: string, options?: OffWorkOptions): Promise<void>
fetch<T>(name, options?: FetchOptions): Promise<Job<T>[]>   // ручной режим, без воркера
```
Хендлер получает **массив** job'ов (батч). `Job<T>` содержит `id, name, data, expireInSeconds, heartbeatSeconds, signal: AbortSignal, groupId?, groupTier?` — **`signal` пробрасываем в fetch/LLM-вызовы**, тогда остановка воркера и истечение `expireInSeconds` реально отменяют работу.
`WorkOptions = JobFetchOptions & JobPollingOptions & WorkConcurrencyOptions & { heartbeatRefreshSeconds?, perJobResults? }`:
- `batchSize`, `includeMetadata`, `ignoreStartAfter`, `minPriority`/`maxPriority` — выделенный воркер под высокоприоритетные задачи;
- `localConcurrency`, `localGroupConcurrency`, `groupConcurrency` (последний — координация между нодами через БД). `group: {id, tier}` на job'е — наш ключ мультитенантности: `groupConcurrency` ограничивает параллелизм на тенанта;
- `perJobResults: true` — хендлер возвращает `JobResult[]` со статусом `'completed' | 'failed' | 'deadletter'` на каждый элемент батча; **job, не упомянутый в результате, считается failed**. Именно это нужно eval-батчу, где часть прогонов падает.
- `priority`/`orderByCreatedOn` в `JobFetchOptions` помечены `@deprecated` начиная с 12.30.0 — игнорируются, не использовать.

### Ручное управление и чтение состояния
```ts
cancel/resume/retry/deleteJob(name, id|id[], options?): Promise<CommandResponse>
complete(name, id|id[], data?, options?) / fail(name, id|id[], data?, options?) / touch(name, id|id[])
redrive(name: string, options?: RedriveOptions): Promise<number>   // вернуть из dead-letter, { destination?, sourceName?, limit? = 1000 }
findJobs<T>(name, options?: FindJobsOptions): Promise<JobWithMetadata<T>[]>   // { id?, key?, data?, queued? }
getQueue(name) / getQueues(names?) / getQueueStats(name, options?)
getWipData(): WipData[]           // живое состояние воркеров в этом процессе
detectSchemaDrift(): Promise<SchemaDriftReport>
schemaVersion(): Promise<number | null>
```
`JobWithMetadata` для отладки даёт: `state ('created'|'retry'|'active'|'completed'|'cancelled'|'failed')`, `retryCount`, `startAfter`, `startedOn`, `singletonKey`, `output`, `blocked/blocking/pendingDependencies`, и для дедлеттера — `sourceName`, `sourceId`, `sourceCreatedOn`, `sourceRetryCount`.
`getQueueStats` и `QueueResult` дают `readyCount` (`queuedCount - deferredCount`) — **именно это настоящий бэклог**, `queuedCount` включает отложенные задачи и всегда выглядит страшно. Это метрика для алерта.
`getJobById` помечен `@deprecated` → `findJobs`.

### Ретраи и зависшие задачи
- `retryLimit` (default **2**), `retryDelay`, `retryBackoff: true` — экспонента с джиттером, формула прямо в d.ts:
  `Math.min(retryDelayMax, retryDelay * (2 ** min(16, retryCount) / 2 + 2 * min(16, retryCount) / 2 * random()))`, при `retryBackoff` без `retryDelay` начальная задержка = 1 с;
- `expireInSeconds` — сколько job может быть `active` до принудительного retry/fail (default 900);
- `heartbeatSeconds` (>=10) на очереди + `heartbeatRefreshSeconds` у воркера: воркер шлёт heartbeat, монитор добивает job, от которого heartbeat перестал приходить. Для наших долгих LLM-прогонов это лучше, чем большой `expireInSeconds`;
- `deadLetter: 'queue-name'` + `redrive()` — разбор падений без потери payload.

### Наблюдаемость и деградации
События инстанса: `error`, `warning`. `WarningType = 'slow_query' | 'queue_backlog' | 'clock_skew' | 'listen_notify_unavailable' | 'invalid_schedule' | 'index_bloat' | 'xmin_horizon' | 'autovacuum_disabled' | 'monitor_backoff'`.
`clock_skew` и `invalid_schedule` — прямые сигналы «таймеры human-задач поехали», обязательно в алерты. `boss.on('error', ...)` нужен всегда, иначе EventEmitter уронит процесс.

### Тестирование
`new PgBoss({ __test__enableSpies: true })` + `getSpy<T>(name)` / `clearSpies()` — детерминированные проверки переходов задач (в проде выключено, добавляет оверхед). Плюс `backend: 'pglite'` — весь планировщик в процессе теста, без внешней БД.
## 4. Идемпотентность тулов с эффектами

Проблема: pg-boss даёт **at-least-once** (как и любая очередь). Job может быть выполнен повторно после падения воркера, истечения `expireInSeconds`, пропущенного heartbeat, ретрая. Тул «отправить сообщение в Telegram», «создать задачу в трекере», «списать деньги» не должен от этого удвоиться.

### Ключ идемпотентности: как его строить
Ключ должен быть **детерминированным по (что делаем, для чего делаем)** и не зависеть от попытки:
```
idempotency_key = hash( tenant_id, workflow_id, execution_id, node_id, attempt_scope, canonical(tool_input) )
```
- `execution_id + node_id` уже уникальны в рамках прогона — этого достаточно для retry одного и того же шага; `canonical(tool_input)` добавляет защиту от «шаг тот же, вход поменялся» (петля `andDoWhile`, где узел вызывается N раз — тогда в ключ идёт ещё и номер итерации из `workflowState`);
- канонизация входа обязательна: `{a:1,b:2}` и `{b:2,a:1}` должны дать один ключ. Готовое: **`json-canonicalize@3.0.1` (MIT, свежий)** или **`canonicalize@5.0.0` (Apache-2.0, свежий)** — обе реализуют RFC 8785 JCS. `object-hash@3.0.0` (MIT) **не трогать: последний релиз 2023-01, риск заброшенности**; хэш поверх JCS-строки `crypto.createHash('sha256')` и так покрывает задачу без зависимости.

### Паттерн исполнения тула с эффектом (flat, без вложенных if)
Таблица-журнал эффектов в нашей БД:
```sql
create table tool_effects (
  idempotency_key text primary key,
  tenant_id       text not null,
  execution_id    text not null,
  node_id         text not null,
  tool_name       text not null,
  status          text not null,          -- 'in_flight' | 'succeeded' | 'failed'
  request_hash    text not null,
  response        jsonb,
  provider_ref    text,                   -- id сообщения/платежа на стороне провайдера
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```
Алгоритм (claim-check):
1. `insert ... on conflict (idempotency_key) do nothing returning *` — атомарный claim.
2. Вставка не прошла → читаем строку. `succeeded` → возвращаем сохранённый `response` (**повторного вызова провайдера нет**). `failed` → возвращаем ошибку или разрешаем ретрай по политике. `in_flight` → это конкурент/оборванная попытка: ждём/падаем в retry job'а — сознательно выбираем «лучше задержка, чем дубль».
3. Вставка прошла → вызываем провайдера, **прокидывая ключ в его собственный idempotency-механизм** (`Idempotency-Key` заголовок у Stripe-подобных API, `Telegram Bot API` — своего нет, дедуп строим на своей стороне).
4. Пишем `succeeded`/`failed` + `response` + `provider_ref`.

Это классический Idempotent Receiver; интерфейсно оформляется как декоратор над `Tool` (паттерн Decorator): `IdempotentTool implements Tool`, ядро тула ничего про журнал не знает — это ложится в наше правило «ядро доверия пишем сами».

### Transactional outbox: нужен ли и на чём
**Отдельная таблица outbox нам не нужна.** pg-boss умеет ставить задачу **внутри нашей транзакции** через `SendOptions.db`:
```ts
import { sql } from 'drizzle-orm'
import { fromDrizzle } from 'pg-boss'

await db.transaction(async (tx) => {
  await tx.insert(runs).values(run)                       // бизнес-запись
  await boss.send('workflow.run', { runId }, { db: fromDrizzle(tx, sql) })  // enqueue в той же транзакции
})
```
Сигнатура из `dist/adapters/drizzle.d.ts`: `fromDrizzle(tx: DrizzleTransactionLike, sql: DrizzleSqlTagLike): IDatabase`. Есть также `fromKysely`, `fromKnex`, `fromPrisma`, `fromPglite`, `fromBunSql`. Очередь живёт в том же Postgres, значит «записать бизнес-факт и поставить задачу» — одна атомарная транзакция. Это и есть outbox, только без своего релея. **Именно эта возможность — главный аргумент против BullMQ/Redis:** там бизнес-запись в PG и enqueue в Redis атомарными не сделать, и таблицу outbox + релей пришлось бы писать.

Готовая библиотека, если понадобится outbox с CDC/логической репликацией: `pg-transactional-outbox@0.6.5` (MIT, `time.modified` 2026-01-24 — почти 8 месяцев без релизов, **pre-1.0, помечаем риском**). Для v1 не берём: `fromDrizzle` покрывает сценарий.

### Exactly-once на практике
Честная формулировка для документации: **exactly-once доставки не существует, есть at-least-once доставка + idempotent receiver = effectively-once эффект.** README pg-boss заявляет «exactly-once job delivery» (через `SKIP LOCKED` и атомарные коммиты) — это про то, что два воркера не возьмут один job одновременно, но **не** отменяет повторную выдачу job после истечения `expireInSeconds`/потери heartbeat. Поэтому журнал `tool_effects` обязателен для любого тула с внешним эффектом, независимо от гарантий очереди.

Практические следствия:
- **чистые тулы** (LLM-вызов, парсинг, расчёт) идемпотентности не требуют — им нужен только кэш/кассета для воспроизводимости;
- **тулы с эффектом** обязаны декларировать в IR флаг `effects: true` и `idempotency: 'key' | 'natural' | 'none'`. Компилятор оборачивает только их — это дешевле, чем журналировать всё;
- `retryLimit`/`retryBackoff` ставим на очередь, а не на тул, чтобы не было двух конкурирующих механизмов ретрая;
- «natural idempotency» (PUT по стабильному id на стороне провайдера) — предпочтительнее журнала, если провайдер это позволяет.

## 5. Возобновление подвисшей human-задачи по дедлайну

Опорный факт: VoltAgent приостанавливает воркфлоу через `suspend(reason)` и возобновляет **только явным вызовом**; таймера у него нет (`node_modules/@voltagent/core/docs/workflows/suspend-resume.md`, подтверждено в `00-verified-by-lead.md`). Значит дедлайн — наш.

### Что уже даёт VoltAgent (сигнатуры из `node_modules/@voltagent/core/dist/index.d.ts`)
```ts
// WorkflowRegistry (строки ~12495)
resumeSuspendedWorkflow(workflowId: string, executionId: string, resumeData?: any, resumeStepId?: string)
  : Promise<WorkflowExecutionResult<any, any> | null>;
getSuspendedWorkflows(): Promise<Array<{
  workflowId: string; executionId: string; suspendedAt: Date; reason?: string; suspendedStepIndex: number;
}>>;
restartWorkflowExecution(workflowId, executionId, options?): Promise<WorkflowExecutionResult<any,any>>;
suspendAllActiveWorkflows(reason?: string): Promise<void>;   // graceful shutdown

// Memory-адаптер (строки ~1951)
getWorkflowState(executionId: string): Promise<WorkflowStateEntry | null>;
queryWorkflowRuns(query: WorkflowRunQuery): Promise<WorkflowStateEntry[]>;
updateWorkflowState(executionId: string, updates: Partial<WorkflowStateEntry>): Promise<void>;
getSuspendedWorkflowStates(workflowId: string): Promise<WorkflowStateEntry[]>;
```
`WorkflowStateEntry` хранит `status: "running"|"suspended"|"completed"|"cancelled"|"error"`, `workflowState`, и
```ts
suspension?: { suspendedAt: Date; reason?: string; stepIndex: number; lastEventSequence?: number;
               checkpoint?: {...}; suspendData?: any }
```
`suspendData` — **типизированный payload, который шаг передал в `suspend()`**; сюда и кладём дедлайн.

Чего НЕТ: поля `deadline`/`expiresAt` и запроса «покажи просроченные». `getSuspendedWorkflows()` даёт `suspendedAt`, но фильтровать по дедлайну самому — значит тащить все приостановленные и сканировать. Не годится как основной механизм.

### Механизм: таймер-джоб на каждый suspend (основной путь)
Дедлайн хранится **в двух местах намеренно**:
1. **источник истины для UI и аудита** — наша таблица `human_tasks` (`execution_id`, `workflow_id`, `step_id`, `assignee`, `deadline_at`, `timeout_policy`, `status`);
2. **исполнительный механизм** — отложенный job pg-boss.

Шаг `human` в скомпилированном воркфлоу:
```ts
execute: async ({ data, suspend, resumeData, workflowState }) => {
  if (resumeData) return applyHumanDecision(data, resumeData)   // единственный if, ранний возврат

  const deadlineAt = addSeconds(new Date(), node.timeoutSeconds)
  await db.transaction(async (tx) => {
    await tx.insert(humanTasks).values({ executionId, stepId, deadlineAt, status: 'pending' })
    await boss.sendAfter(
      'human.deadline',
      { executionId, workflowId, stepId, deadlineAt: deadlineAt.toISOString() },
      { singletonKey: `${executionId}:${stepId}`, db: fromDrizzle(tx, sql) },
      deadlineAt,                                        // sendAfter(name, data, options, date: Date)
    )
  })
  await suspend('human_input_required', { deadlineAt, assignee: node.assignee })  // → suspendData
}
```
Почему так:
- `sendAfter(..., date: Date)` — штатный отложенный запуск, никакого собственного поллинга;
- `singletonKey: '<executionId>:<stepId>'` + политика очереди `stately`/`exclusive` → **ровно один живой таймер на задачу**; повторное исполнение шага после restart'а не наплодит дублей (`send` вернёт `null`);
- enqueue в той же транзакции, что и запись `human_tasks` → нет состояния «задача есть, таймера нет» и наоборот;
- продление дедлайна («человек попросил ещё день») — `boss.upsert('human.deadline', data, { singletonKey, startAfter: newDeadline })`, без гонки delete+insert.

Обработчик таймера:
```ts
await boss.createQueue('human.deadline', {
  policy: 'stately',
  retryLimit: 5, retryBackoff: true, retryDelayMax: 300,
  deadLetter: 'human.deadline.dlq',
  expireInSeconds: 120,
})

await boss.work<DeadlinePayload>('human.deadline', { batchSize: 20 }, async (jobs) => {
  const results = await Promise.allSettled(jobs.map(job => expireHumanTask(job.data, job.signal)))
  return toJobResults(results)     // с perJobResults: true
})

async function expireHumanTask(p: DeadlinePayload, signal: AbortSignal) {
  const claimed = await claimTimeout(p)                   // update ... where status='pending' returning *
  if (!claimed) return                                    // человек успел ответить — гонка закрыта в БД
  const registry = WorkflowRegistry.getInstance()
  await registry.resumeSuspendedWorkflow(p.workflowId, p.executionId, {
    __timeout: true, decision: p.timeoutPolicy, deadlineAt: p.deadlineAt,
  }, p.stepId)                                            // 4-й аргумент = resumeStepId
}
```
Ключевые моменты:
- **гонка «человек ответил ровно на дедлайне»** решается не в коде воркера, а условным `UPDATE ... WHERE status='pending'` — выигрывает один. Тот же приём в обратную сторону: API ответа человека тоже делает `UPDATE ... WHERE status='pending'` и только при успехе зовёт `resumeSuspendedWorkflow`;
- `resumeData` должен проходить `resumeSchema` шага, поэтому **схема резюма обязана допускать вариант таймаута** (дискриминированный union: `{kind:'human', ...} | {kind:'timeout', policy, deadlineAt}`). Иначе резюм по таймауту упадёт на валидации. Это требование к компилятору IR;
- `timeout_policy` из IR: `fail` / `default_value` / `escalate` / `continue_without`. Политика **не** зашивается в воркер — воркер просто передаёт её в `resumeData`, решение принимает шаг. Воркер остаётся тупым (Single Responsibility);
- `resumeSuspendedWorkflow` возвращает `null`, если воркфлоу/исполнение не найдено (например, воркер не знает такой `workflowId`). Обрабатывать как ошибку job'а → ретрай с backoff → dead-letter, **не** как успех.

### Reconciler (страховочный путь, обязателен)
Отложенный job может быть потерян: чистка `retentionSeconds`, ручное вмешательство в БД, миграция схемы, баг. Поэтому вторым контуром — cron-сверка:
```ts
await boss.schedule('human.reconcile', '*/5 * * * *', {}, { tz: 'UTC', missed: 'once' })
```
Обработчик: `select * from human_tasks where status='pending' and deadline_at < now() - interval '1 minute'` → для каждого пере-ставить `human.deadline` с тем же `singletonKey` (дубликат отсечётся) → метрика `human_deadline_missed_total`. Сверку в обратную сторону тоже делаем: `registry.getSuspendedWorkflows()` даёт список приостановленных; исполнения, у которых нет строки в `human_tasks`, — это «повисшие навсегда», их в алерт.

### После рестарта процесса
`suspendAllActiveWorkflows(reason)` вызывать на `SIGTERM` (graceful shutdown), затем `boss.stop()`. При старте воркера:
1. поднять реестр (скомпилировать актуальные версии воркфлоу);
2. `boss.start()`;
3. объявить расписания (`schedule()` идемпотентен по `(name, key)`);
4. запустить `human.reconcile` один раз немедленно, не дожидаясь cron.
Отложенные job'ы переживают рестарт сами — они лежат в Postgres, не в памяти. Это ровно то свойство, ради которого мы и отказались от `setTimeout`.

### Применение того же механизма к остальным сценариям
| Сценарий | Очередь / расписание | Дедуп |
|---|---|---|
| Дедлайн human-задачи | `human.deadline`, `sendAfter(date)` | `singletonKey = execId:stepId`, policy `stately` |
| Синк каталога моделей | `catalog.sync`, `schedule('catalog.sync','0 */6 * * *', {source}, { key: 'openrouter', missed: 'once' })` | `key` расписания + policy `singleton` |
| Batch eval | `eval.run` через `insert(name, jobs[])` или `flow([...jobs, {ref:'report', dependsOn:[...]}])` | `singletonKey = suiteId:caseId:variantId` |
| Shadow/canary | `workflow.shadow`, `priority: -10` (ниже продового трафика) + `groupConcurrency` на тенанта | `singletonKey = sourceExecId:candidateVersion` |

## Открытые вопросы / TODO для следующего захода
- UNVERIFIED: поведение pg-boss на PgBouncer в transaction pooling при `useListenNotify:false` (поллинг) — заявлено, что сломан только LISTEN/NOTIFY, но проверить на нашем пуле.
- UNVERIFIED: реальная нагрузка pg-boss 12 на нашу БД при `partition:true` и объёме eval-батчей; нужен нагрузочный прогон перед фиксацией в доке.
- UNVERIFIED: зрелость Postgres-бэкенда BullMQ 6 (`peerDependencies.pg >= 8.0.0`) — если он окажется production-ready, сравнение §1 придётся пересмотреть.
- UNVERIFIED: `resumeSuspendedWorkflow` при незарегистрированном `workflowId` — предполагается `null`, поведение по коду не проверялось.
- Не проверено: готовый UI для pg-boss 12 (аналог Bull Board). Если его нет — страница задач в нашем Next.js поверх `getQueues/getQueueStats/findJobs`.
