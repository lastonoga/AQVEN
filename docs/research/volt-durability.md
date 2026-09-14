# Долговечность исполнения в VoltAgent (основа replay/fork/чекпоинтов)

Статус: ВСЕ 7 подвопросов закрыты. Пакеты: @voltagent/core@2.10.0, @voltagent/postgres@2.1.3,
@voltagent/libsql@2.1.2 (все MIT). Дата проверки 2026-09-11.
Источники: `node_modules/@voltagent/core/docs/workflows/suspend-resume.md`,
`docs/agents/cancellation.md`, `docs/api/api-reference.md`, `dist/index.d.ts`, `dist/index.js`,
`@voltagent/postgres/dist/index.js`, `@voltagent/libsql/dist/index.js`.

ГЛАВНОЕ В ТРЁХ СТРОКАХ:
1. Replay/fork/checkpoint **уже есть в ядре** — `timeTravel`, `restart`, running-чекпоинты
   после каждого шага. Свой движок долговечности писать не надо.
2. Lineage реплеев живёт **в `metadata`, а не в top-level полях** `WorkflowStateEntry` —
   SQL-адаптеры типизированные поля не пишут. Читать `state.metadata.replayedFromExecutionId` (§5).
3. Сериализация — голый `JSON.stringify`: `Date` → строка, `Map/Set` → `{}`, `BigInt` → порча
   записи. Ограничение надо зашить в IR (§7).


Версия пакетов проверяется ниже. Источник: node_modules в scratchpad/probe.

## 1. suspend/resume: полный API

Источник: `node_modules/@voltagent/core/docs/workflows/suspend-resume.md` (971 строк).

### Обязательное условие
> «Suspend/Resume relies on workflow registration. Make sure your workflow is passed to a
> `VoltAgent` instance so the runtime can track and resume executions.»

И отдельно: `createWorkflowChain` возвращает **builder**; надо один раз сделать `.toWorkflow()`
и дальше работать с этим инстансом — иначе suspend/resume не видит сохранённого состояния.
→ Для нас: компилятор IR обязан отдавать один стабильный `Workflow`-инстанс на версию графа,
регистрируемый в `VoltAgent`/`WorkflowRegistry`.

### Схемы
- `suspendSchema` / `resumeSchema` задаются на уровне воркфлоу **и** на уровне шага;
  шаговая переопределяет воркфлоу-уровневую (см. пример `multi-approval`: `manager-approval`
  и `finance-approval` имеют разные `resumeSchema`).
- Валидация resumeData — на входе; REST отдаёт `400` при провале схемы.

### Контекст шага при suspend
В `execute({ data, suspend, resumeData, suspendData, getInitData, workflowState, setWorkflowState })`:
- `data` — накопленные данные предыдущих шагов;
- `suspend(reason?, data?)` — пауза; второй аргумент типизируется `suspendSchema`;
- `resumeData` — то, что передали в `resume()`; `undefined` на первом прогоне;
- `suspendData` — то, что сохранили в `suspend(reason, data)`; **читается в другом шаге тоже**
  (пример `verify-code` читает `suspendData.expiresAt`, сохранённый шагом `send-verification`);
- `getInitData()` — исходный вход воркфлоу, «stable across resume».

### Ключевая семантика резюма (дословно)
> «**The suspended step runs again from the start**. `resumeData` contains your new data.
> Workflow continues with next steps.»

→ **Шаг после резюма НЕ продолжается с места останова — он переисполняется целиком.**
Отсюда обязательный паттерн `if (resumeData) { ... return }` в начале execute.
Для нас: любой side-effect до `suspend()` выполнится повторно при резюме, если шаг не
идемпотентен. Узлы `human`/`gate` компилируем в «тонкие» шаги без побочных эффектов.

### resume
```ts
await execution.resume();                                  // без данных
await execution.resume({ approved: true });                // типизировано resumeSchema
await execution.resume({ approved: true }, { stepId: "step-2-finance" }); // прыжок на шаг
```
`options.stepId` позволяет резюмить **не с приостановленного шага**, а с любого — вперёд или
назад («Skip ahead or go back to any step when resuming»). Это дешёвый механизм ручного
исправления маршрута без полноценного time travel.

### REST
- `POST /workflows/{id}/executions/{executionId}/suspend`  body `{ "reason"?: string }`
  → `{ success, data: { executionId, status: "suspended", suspension: { suspendedAt, reason } } }`
- `POST /workflows/{id}/executions/{executionId}/resume`   body `{ "resumeData": {...}, "options": { "stepId": "step-2" } }`
  → `{ success, data: { executionId, startAt, endAt, status, result } }`
- `POST /workflows/{id}/executions/{executionId}/cancel`   body `{ "reason"?: string }`
- Коды ошибок: suspend — 404 (нет исполнения), 400 (нельзя приостановить в текущем состоянии),
  500; resume — 404 (не найдено или не в suspended), 400 (resumeData не прошла схему), 500.
- Формат ошибки: `{ "success": false, "error": "Cannot suspend workflow in completed state" }`
- Порт дев-сервера в примерах: `http://localhost:3141`.

### Внешняя приостановка
```ts
import { createSuspendController } from "@voltagent/core";
const controller = createSuspendController();
const execution = await workflow.run({ items: 10 }, { suspendController: controller });
controller.suspend("User clicked pause");
controller.isSuspended();           // boolean
// execution.status === "suspended"; execution.suspension?.reason
const result = await execution.resume();
```

### Чего НЕТ (важно для нас)
- Нет встроенного таймера возобновления: воркфлоу по таймауту сам не проснётся. Паттерн из доков —
  сохранить `expiresAt` в `suspendData` и проверить его **при резюме**. Планировщик/дедлайны —
  наша ответственность (cron/queue, который дёргает REST resume или отменяет).

## 2. История исполнений: где хранится, какие поля, API чтения

Источник: `node_modules/@voltagent/core/dist/index.d.ts`, строки 1678-1762 и 1951-1955.

### Хранилище
Всё лежит в **Memory** (`Memory` / `StorageAdapter`), а не в отдельном «history store».
Публичный контракт (`interface Memory`, dist/index.d.ts:1951-1955 и 15398-15414):

```ts
getWorkflowState(executionId: string): Promise<WorkflowStateEntry | null>;
queryWorkflowRuns(query: WorkflowRunQuery): Promise<WorkflowStateEntry[]>;
setWorkflowState(executionId: string, state: WorkflowStateEntry): Promise<void>;
updateWorkflowState(executionId: string, updates: Partial<WorkflowStateEntry>): Promise<void>;
getSuspendedWorkflowStates(workflowId: string): Promise<WorkflowStateEntry[]>;
```

```ts
interface WorkflowRunQuery {
  workflowId?: string;
  status?: "running" | "suspended" | "completed" | "cancelled" | "error";
  from?: Date; to?: Date;
  limit?: number; offset?: number;
  userId?: string;
  metadata?: Record<string, unknown>;   // фильтр по метаданным
}
```
→ `queryWorkflowRuns` — готовый бэкенд для списка прогонов в нашем UI: фильтр по воркфлоу,
статусу, окну времени, userId и произвольным метаданным. Пагинация limit/offset.

### Полная форма записи исполнения (dist/index.d.ts:1678)
```ts
interface WorkflowStateEntry {
  id: string;                    // executionId
  workflowId: string;
  workflowName: string;
  status: "running" | "suspended" | "completed" | "cancelled" | "error";
  input?: unknown;               // исходный вход воркфлоу
  context?: Array<[string | symbol, unknown]>;   // OperationContext как пары
  workflowState?: Record<string, unknown>;       // shared state на момент персиста
  suspension?: {
    suspendedAt: Date;
    reason?: string;
    stepIndex: number;                 // ИНДЕКС, не stepId
    lastEventSequence?: number;
    checkpoint?: {
      stepExecutionState?: any;
      completedStepsData?: any[];
      workflowState?: Record<string, unknown>;
      stepData?: Record<string, {
        input: unknown;
        output?: unknown;
        status: "running"|"success"|"error"|"suspended"|"cancelled"|"skipped";
        error?: unknown;
      }>;
      usage?: UsageInfo;
    };
    suspendData?: any;
  };
  events?: Array<{                     // таймлайн для UI
    id: string; type: string; name?: string; from?: string;
    startTime: string; endTime?: string; status?: string;
    input?: any; output?: any;
    metadata?: Record<string, unknown>;
    context?: Record<string, unknown>;
  }>;
  output?: unknown;                    // финальный результат
  cancellation?: { cancelledAt: Date; reason?: string };
  userId?: string;
  conversationId?: string;
  replayedFromExecutionId?: string;    // lineage форка
  replayFromStepId?: string;           // lineage форка
  metadata?: Record<string, unknown>;
  createdAt: Date; updatedAt: Date;
}
```

### Что реально видно по шагам
- **`suspension.checkpoint.stepData: Record<stepId, { input, output?, status, error? }>`** — это и есть
  «вход/выход каждого шага». Ключевой факт: поле живёт **внутри `suspension.checkpoint`**, то есть
  наполняется в момент suspend, а не отдельной таблицей шагов.
  ВАЖНО: **running-чекпоинт лежит не здесь**, а в `metadata.__voltagent_restart_checkpoint` —
  см. §9, это проверено в dist/index.js.
- **`events[]`** — плоский таймлайн (`type`, `from`, `startTime/endTime`, `status`, `input`, `output`),
  документирован как «Used for timeline visualization in UI». Это второй, более «сырой» источник для
  нашей панели трассировки.
- Комментарий в исходнике честно предупреждает: «Stores **only the essential state** needed to resume
  a workflow». Полноценного лога всех попыток/ретраев тут нет — глубокая трассировка идёт в
  observability (OTel-спаны), см. `getObservability()`.

### Managed Memory (VoltOps) — тот же контракт через HTTP
`ManagedMemoryWorkflowStatesClient` (dist/index.d.ts:3123-3128):
```ts
get(databaseId, executionId): Promise<WorkflowStateEntry | null>;
set(databaseId, executionId, state): Promise<void>;
list(databaseId, input: ManagedMemoryQueryWorkflowRunsInput): Promise<WorkflowStateEntry[]>;
query(databaseId, input): Promise<WorkflowStateEntry[]>;
listSuspended(databaseId, workflowId): Promise<WorkflowStateEntry[]>;
```
→ Форма записи одна и та же независимо от адаптера (in-memory / libsql / postgres / managed).

## 3. Restart после падения процесса

Источник: `docs/workflows/suspend-resume.md`, раздел «Restart & Crash Recovery».

> «If a process crashes while a workflow is still `running`, you can restart that execution
> from the latest persisted checkpoint.»

API (три уровня):
```ts
const restarted = await workflow.restart("exec_1234567890_abc123");
// restarted.status: "completed" | "suspended" | "cancelled" | "error"; restarted.result

const summary = await workflow.restartAllActive();
// summary.restarted: string[]  (executionIds)
// summary.failed:    { executionId, error }[]

import { WorkflowRegistry } from "@voltagent/core";
const summary2 = await WorkflowRegistry.getInstance().restartAllActiveWorkflowRuns();
// summary2.restarted.length, summary2.failed.length
```

Что восстанавливается (дословно):
> «VoltAgent restores **checkpointed workflow data, shared workflow state, context, and usage**
> before continuing.»

Оговорки из доков:
- «Restart is intended for runs currently in `running` state.» (не для completed/error)
- «**Steps should be idempotent where possible, because external side effects may have already
  occurred before a crash.**»

→ Для нас: `registry.restartAllActiveWorkflowRuns()` вешаем на bootstrap процесса — это и есть
crash-recovery «из коробки». Гранулярность восстановления — последний персистентный чекпоинт,
то есть граница шага, а не середина шага. Значит: узел с внешним эффектом (HTTP POST, запись в
БД, отправка сообщения) обязан нести ключ идемпотентности, который мы генерируем детерминированно
из (executionId, stepId, iteration).

## 4. Time travel (детерминированный replay) — ЕСТЬ, это готовая основа для fork

Источник: `docs/workflows/suspend-resume.md`, раздел «Time Travel & Deterministic Replay».

Дословное различие:
> «`restart(executionId)` continues a `running` execution after crash/interruption.
> `timeTravel({ executionId, stepId })` **creates a new execution from historical state**.»

Применимо к исполнениям в статусе **completed / suspended / cancelled / error**.

```ts
const original = await workflow.run({ value: 1 });

const replay = await workflow.timeTravel({
  executionId: original.executionId,
  stepId: "step-2",
});
replay.executionId;  // НОВЫЙ executionId
replay.result;
```

### Переопределения (ровно то, что нужно для «fork с правкой входа»)
```ts
const replay = await workflow.timeTravel({
  executionId: original.executionId,
  stepId: "approval-step",
  inputData: { amount: 2500 },                      // переопределить вход выбранного шага
  resumeData: { approved: true, approvedBy: "ops-user-1" }, // переопределить resume-payload
  workflowStateOverride: { replayReason: "incident-1234" }, // переопределить shared state
});
```

### Стриминговый replay
```ts
const stream = workflow.timeTravelStream({ executionId: original.executionId, stepId: "step-2" });
for await (const event of stream) { console.log(event.type, event.from); }
const replayResult = await stream.result;
```

### Lineage (провенанс форка — персистится)
> «Replay executions persist lineage fields so you can trace origin: `replayedFromExecutionId`,
> `replayFromStepId`.»

```ts
const replayState = await workflow.memory.getWorkflowState(replay.executionId);
replayState?.replayedFromExecutionId;
replayState?.replayFromStepId;
```

→ **Вывод для архитектуры:** собственный слой fork/checkpoint писать НЕ надо. `timeTravel` +
`replayedFromExecutionId` покрывают «перезапусти с шага N с другим входом» и дают дерево версий.
Наш слой сверху — только: (а) выбор точки в UI, (б) хранение «почему форкнули» в
`workflowStateOverride`, (в) сравнение результатов двух исполнений.
`workflow.memory` — публичное поле воркфлоу с методом `getWorkflowState(executionId)`
(сигнатуру уточняю в .d.ts, см. §2).

## 5. @voltagent/postgres@2.1.3 — реальный DDL

Источник: `node_modules/@voltagent/postgres/dist/index.js` (распакованный bundle), MIT,
зависимости: `pg ^8.16.0`, `@voltagent/internal ^1.0.2`. Схема создаётся кодом на старте
(`CREATE TABLE IF NOT EXISTS` + идемпотентные `ALTER TABLE ... ADD COLUMN`), **отдельных
sql-миграций в пакете нет**. Префикс таблиц: `options.tablePrefix ?? "voltagent_memory"`
(для вектора — `"voltagent_vector"`). Опция `schema` даёт `getTableName()` с указанием схемы.

### Таблица исполнений воркфлоу
```sql
CREATE TABLE IF NOT EXISTS voltagent_memory_workflow_states (
  id              TEXT PRIMARY KEY,      -- executionId
  workflow_id     TEXT NOT NULL,
  workflow_name   TEXT NOT NULL,
  status          TEXT NOT NULL,         -- running|suspended|completed|cancelled|error
  input           JSONB,
  context         JSONB,
  workflow_state  JSONB,
  suspension      JSONB,                 -- включая suspension.checkpoint.stepData
  events          JSONB,                 -- весь таймлайн одним документом
  output          JSONB,
  cancellation    JSONB,
  user_id         TEXT,
  conversation_id TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voltagent_memory_workflow_states_workflow_id
  ON voltagent_memory_workflow_states(workflow_id);
CREATE INDEX IF NOT EXISTS idx_voltagent_memory_workflow_states_status
  ON voltagent_memory_workflow_states(status);
```

### Остальные таблицы того же адаптера
- `voltagent_memory_users`
- `voltagent_memory_conversations` (индексы по `user_id`, `resource_id`)
- `voltagent_memory_messages` (PK `(conversation_id, message_id)`, `format_version INTEGER DEFAULT 2`,
  индексы по `conversation_id` и `created_at`; поздние `ADD COLUMN parts JSONB`, `metadata JSONB`,
  `format_version`)
- `voltagent_memory_conversation_steps` — шаги **агентских** операций, не воркфлоу:
  `id, conversation_id REFERENCES conversations(id) ON DELETE CASCADE, user_id, agent_id, agent_name,
  operation_id, step_index, type, role, content, arguments JSONB, result JSONB, usage JSONB,
  sub_agent_id, sub_agent_name, created_at`; индексы `(conversation_id, step_index)` и
  `(conversation_id, operation_id)`
- `voltagent_vector_*` — вектора.

### queryWorkflowRuns → SQL (дословная логика из dist)
`SELECT * FROM <prefix>_workflow_states WHERE ... ORDER BY created_at DESC LIMIT $n OFFSET $m`,
условия: `workflow_id = $`, `status = $`, `created_at >= $`, `created_at <= $`, `user_id = $`,
`metadata @> $::jsonb` (containment по JSONB).

### ⚠️ КРИТИЧНО: postgres-адаптер ТЕРЯЕТ lineage реплеев
В `@voltagent/postgres@2.1.3/dist/index.js` **ноль вхождений** `replayedFromExecutionId` /
`replayed_from` (проверено `grep -c` → 0), и в DDL нет колонок под них. При этом
`WorkflowStateEntry` в core объявляет `replayedFromExecutionId` и `replayFromStepId`,
а docs обещают «Replay executions persist lineage fields».

**Следствие:** с @voltagent/postgres поля времени-путешествия НЕ сохраняются в БД —
`getWorkflowState(replayId).replayedFromExecutionId` вернёт `undefined` после перезапуска процесса.
Рабочие обходы: (а) дублировать lineage в `metadata` JSONB при форке (наш код, вместе с
`ORDER BY`/индексом по `metadata`), (б) хранить дерево форков в собственной таблице,
(в) ждать патча апстрима.

### ✅ РАЗРЕШЕНО (проверено в core/dist/index.js): lineage ВСЁ-ТАКИ переживает перезапуск — через `metadata`
Core при `timeTravel` кладёт lineage **и в типизированные поля, и в metadata**:
```js
const lineageMetadata = {
  ...(withoutRestartCheckpointMetadata(sourceState.metadata) ?? {}),
  replayedFromExecutionId: timeTravelOptions.executionId,
  replayFromStepId:        timeTravelOptions.stepId,
  replayedAt:              replayStartAt.toISOString(),
};
await executionMemory.setWorkflowState(replayExecutionId, { id: replayExecutionId, workflowId: id, ... });
```
Колонка `metadata JSONB` адаптерами сохраняется → **`metadata.replayedFromExecutionId` доступен
после рестарта процесса, а типизированное top-level поле `WorkflowStateEntry.replayedFromExecutionId`
— нет** (адаптер его не пишет и не читает).

**Практический вывод, точная формулировка для документации:**
- читать lineage надо из `state.metadata.replayedFromExecutionId` / `.replayFromStepId` / `.replayedAt`,
  а НЕ из одноимённых top-level полей, если хранилище — postgres/libsql;
- запрос «все форки данного прогона» делается штатно:
  `GET /workflows/executions?metadata.replayedFromExecutionId=<execId>`
  (в postgres это `metadata @> '{"replayedFromExecutionId":"..."}'::jsonb`);
- **собственная таблица lineage не обязательна**; достаточно индекса. Рекомендуется добавить
  GIN-индекс вручную, его в пакете нет:
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vm_ws_metadata ON voltagent_memory_workflow_states USING GIN (metadata jsonb_path_ops);`
- реплей **наследует metadata источника** (минус `__voltagent_restart_checkpoint`), т.е. наши
  пользовательские ключи копируются в форк автоматически — это и плюс (трассировка), и грабли
  (устаревшие ключи тащатся по цепочке форков).

### Ещё одно ограничение timeTravel (из того же кода)
Вход целевого шага резолвится каскадом:
`inputData ?? sourceTargetStepInput ?? previousStepOutput ?? (targetStepIndex === 0 ? sourceWorkflowInput : checkpointInputFallback)`.
Если ничего не нашлось — бросается:
```
Cannot time travel from step '<stepId>': missing historical input data (provide inputData override).
```
→ Реплей возможен только по шагам, чей вход реально попал в чекпоинт. При
`disableCheckpointing: true` или большом `checkpointInterval` часть шагов станет
**недоступной для time travel**. Это прямой trade-off: `checkpointInterval` управляет не только
стоимостью записи, но и гранулярностью доступных точек форка.
Также: `workflowStateOverride ?? sourceCheckpoint?.workflowState ?? sourceState.workflowState ?? {}`
— shared state форка берётся из чекпоинта источника, а не из его финального состояния.

### Как пишется строка (postgres, dist/index.js `setWorkflowState`)
Один `INSERT ... ON CONFLICT (id) DO UPDATE SET ...` в транзакции (`BEGIN`), все JSON-поля через
`safeStringify(...)`. Список колонок в INSERT: `id, workflow_id, workflow_name, status, input,
context, workflow_state, suspension, events, output, cancellation, user_id, conversation_id,
metadata, created_at, updated_at` — **replay-полей тут нет физически**, подтверждает находку выше.
Важно: состояние исполнения — **одна строка, перезаписываемая целиком** (включая весь `events`
JSONB). Для длинных прогонов это растущий документ и write-amplification; для нашей телеметрии
лучше опираться на OTel-спаны, а не на `events`.

## 5b. libsql / supabase / managed

| Пакет | Версия | Лицензия | Зависимости |
|---|---|---|---|
| @voltagent/postgres | 2.1.3 | MIT | `pg ^8.16.0`, `@voltagent/internal ^1.0.2` |
| @voltagent/libsql | 2.1.2 | MIT | `@libsql/client ^0.15.0`, `@voltagent/internal ^1.0.2` |
| @voltagent/supabase | 2.1.3 | (npm view) | — |

### libsql (SQLite / Turso) — та же схема, типы TEXT
```sql
CREATE TABLE IF NOT EXISTS <prefix>_workflow_states (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, workflow_name TEXT NOT NULL,
  status TEXT NOT NULL, input TEXT, context TEXT, workflow_state TEXT,
  suspension TEXT, events TEXT, output TEXT, cancellation TEXT,
  user_id TEXT, conversation_id TEXT, metadata TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_<t>_workflow_id ON <t>(workflow_id);
CREATE INDEX IF NOT EXISTS idx_<t>_status     ON <t>(status);
```
- Те же **две** индексные колонки, что и в postgres.
- `replay` hits в `@voltagent/libsql/dist/index.js` = **0** — та же потеря lineage.
- Отличие: JSON лежит как TEXT → фильтр `query.metadata` в postgres использует `metadata @> $::jsonb`,
  в libsql так нельзя. UNVERIFIED: как libsql реализует фильтр по metadata (скорее всего фильтрация
  в памяти после выборки) — проверить, если планируем большие объёмы на libsql.

### Выбор для нас
Postgres — единственный из трёх, где по истории можно нормально фильтровать (`metadata @> jsonb`) и
где индексы работают на объёме. Берём @voltagent/postgres как прод-адаптер, libsql — для локальной
разработки и тестов. Дерево форков/версий графа — наша собственная таблица рядом (Drizzle), FK на
`voltagent_memory_workflow_states.id` ставить нельзя без риска (таблица создаётся чужим кодом),
но ссылаться по id можно.


## 6. Отмена

Источник: `docs/workflows/suspend-resume.md` («Cancelling Workflows») + `docs/agents/cancellation.md`.

### Уровень воркфлоу
Два эквивалентных пути — оба идут через один `suspendController`:
```ts
const controller = createSuspendController();
const execution = workflow.stream({ item: "New laptop" }, { suspendController: controller });

execution.cancel("No longer needed");   // 1) с хэндла стрима
controller.cancel("User requested stop"); // 2) через контроллер

const status = await execution.status;  // "cancelled"
```
> «Because `execution.cancel()` forwards to the same `suspendController`, you can keep passing
> that controller into subsequent resumes, server handlers, or observability tooling.»

На том же хэндле есть `execution.suspend("Hold for manager review")` — пауза вместо отмены.

REST: `POST /api/workflows/<workflowId>/executions/<executionId>/cancel`, body `{ "reason": "..." }`.

### Реестр активных исполнений
Из `dist/index.d.ts` (проверено ведущим): `WorkflowRegistry.activeExecutions:
Map<string, WorkflowSuspendController>` — т.е. отменить/приостановить можно любое живое
исполнение по executionId без хранения контроллера у себя.

### Уровень агента (docs/agents/cancellation.md)
Стандартный `AbortController`, **не** VoltAgent-специфика:
```ts
import { Agent, isAbortError } from "@voltagent/core";
const abortController = new AbortController();
setTimeout(() => abortController.abort("Timeout: Operation took too long"), 5000);
try {
  const response = await agent.generateText("...", { abortController });
} catch (error) {
  if (isAbortError(error)) { /* отменено */ } else { throw error; }
}
```
Как распространяется (дословно из доков):
1. сигнал уходит в LLM-провайдер;
2. инструменты получают `OperationContext`, в котором лежит `abortController`
   (`execute: async (args, context) => { const signal = context?.abortController?.signal; ... }`);
3. **сабагенты наследуют `abortController` родителя**;
4. все операции проверяют состояние сигнала перед продолжением.

- Параметр `signal` **deprecated**, использовать `abortController`. Будет удалён.
- Стриминг: отмена бросает ошибку в `for await (... of response.textStream)`; в `fullStream`
  приходит `event.type === "error"` c `isAbortError(event.error)` и полем `event.context`
  («Cancelled during: ...»).
- Экспортируемые помощники: `isAbortError`, `AbortError`, `MiddlewareAbortError`,
  `isMiddlewareAbortError` (см. список экспортов в dist/index.d.ts).

→ Для нас: таймаут узла = `AbortController` + `setTimeout` внутри исполнителя узла; таймаут
всего воркфлоу = `suspendController.cancel(reason)` снаружи. Это два разных механизма, не путать.

## 7. Ограничения сериализации workflow state и step data

Проверено в коде, не по памяти.

### Что реально вызывается
Все persist-пути (postgres/libsql/observability-атрибуты) идут через
`safeStringify` из `@voltagent/internal` (`dist/utils/index.js:105`, `dist/main/index.js`):
```js
function safeStringify(input, { indentation } = {}) {
  try {
    const seen = new WeakSet();
    return JSON.stringify(input, safeStringifyReplacer(seen), indentation);
  } catch (error) {
    return `SAFE_STRINGIFY_ERROR: Error stringifying object: ${...}`;
  }
}
```
Т.е. это **обычный `JSON.stringify` + защита от циклов**. Никакого superjson/devalue.
Обратного ревайвера при чтении нет — postgres-адаптер отдаёт `row.workflow_state ?? undefined`
(JSONB парсится драйвером `pg` как обычный JS-объект).

### Следствия (жёсткие правила для авторов узлов)
| Тип в state / step data | Что попадёт в БД | Что вернётся после resume/restart |
|---|---|---|
| `Date` | ISO-строка (через `Date.prototype.toJSON`) | **строка**, НЕ `Date` |
| `Map` / `Set` | `{}` | пустой объект — данные потеряны молча |
| `undefined` в объекте | ключ выброшен | ключа нет |
| `undefined` в массиве | `null` | `null` |
| `BigInt` | `JSON.stringify` бросает → catch → строка `"SAFE_STRINGIFY_ERROR: ..."` | **порча строки**: в JSONB-колонку пойдёт невалидный JSON → ошибка вставки. Критично. |
| функция / `Symbol` | выброшено | отсутствует |
| циклическая ссылка | заменена репласером | «плоское» значение, не объект |
| `class` instance | plain object без прототипа | plain object, методы потеряны |
| `Error` | `{}` (у Error нет enumerable-полей) | пустой объект — поэтому в типах есть отдельный `WorkflowSerializedStepError { message, ... }` |

Отдельно: `WorkflowStateEntry.context?: Array<[string | symbol, unknown]>` — **symbol-ключи
контекста не переживают JSON** (станут `null` в паре). Не класть ничего важного в контекст
под symbol-ключом, если рассчитываем на resume/restart.

### Правила, которые надо зашить в наш компилятор/рантайм
1. IR и все выходы узлов — строго JSON-сериализуемый подтип (Zod-схемы, никакого `z.date()` без
   `.transform(String)`, никаких `z.map()`/`z.set()`, никакого bigint).
2. Валидировать сериализуемость на этапе компиляции графа, а не в рантайме.
3. Даты — ISO-строки на границе узла; если нужен `Date` внутри — парсить локально.
4. `WorkflowStateEntry.error` в чекпоинте типизирован как `unknown`, а `WorkflowStepData.error`
   как `Error | null` — при персисте Error схлопывается; свои ошибки узлов сериализуем сами в
   `{ code, message, details }`.
5. Размер: вся история исполнения (`events` + `suspension.checkpoint`) — одна строка, переписываемая
   целиком при каждом апдейте. Большие артефакты (файлы, длинные тексты) НЕ кладём в state —
   кладём ссылку на внешнее хранилище.

## 8. Выводы — см. раздел 11 в конце файла.

---

## Точные сигнатуры (dist/index.d.ts, @voltagent/core@2.10.0)

```ts
// Workflow (строки 10888-10907, 12394-12415)
timeTravel(options: WorkflowTimeTravelOptions): Promise<WorkflowExecutionResult<RESULT_SCHEMA, RESUME_SCHEMA>>;
timeTravelStream(options: WorkflowTimeTravelOptions): WorkflowStreamResult<RESULT_SCHEMA, RESUME_SCHEMA>;
restart(executionId: string, options?: WorkflowRunOptions): Promise<WorkflowExecutionResult<...>>;
restartAllActive(): Promise<WorkflowRestartAllResult>;

interface WorkflowTimeTravelOptions {          // :10387
  executionId: string;                          // источник
  stepId: string;                               // с какого шага replay
  inputData?: any;                              // переопределение входа шага
  resumeData?: any;                             // переопределение resume-payload
  workflowStateOverride?: Record<string, unknown>;
  memory?: Memory;                              // «Falls back to workflow default memory when omitted»
}

interface WorkflowRestartAllResult {            // :10597
  restarted: string[];
  failed: Array<{ executionId?: string; workflowId?: string; error: string; isWorkflowFailure?: boolean }>;
}

interface WorkflowRestartCheckpoint {           // :10559 — ФОРМА ЧЕКПОИНТА
  resumeStepIndex: number;            // zero-based, откуда продолжать
  lastCompletedStepIndex: number;
  stepExecutionState?: any;           // снимок текущих данных воркфлоу
  completedStepsData?: any[];
  workflowState?: Record<string, unknown>;
  stepData?: Record<string, WorkflowCheckpointStepData>;  // «required by getStepData() after restart»
  usage?: UsageInfo;
  eventSequence?: number;
  checkpointedAt: Date;
}

type WorkflowStepStatus = "running" | "success" | "error" | "suspended" | "cancelled" | "skipped";
type WorkflowStepData  = { input: any; output?: any; status: WorkflowStepStatus; error?: Error | null };
type WorkflowStateStore = Record<string, unknown>;
type WorkflowStateUpdater = WorkflowStateStore | ((previous: WorkflowStateStore) => WorkflowStateStore);

interface WorkflowRetryConfig { attempts?: number /*default 0*/; delayMs?: number /*default 0*/ }
```

```ts
// WorkflowRegistry (строки ~12490-12515)
resumeSuspendedWorkflow(workflowId, executionId, resumeData?, resumeStepId?): Promise<WorkflowExecutionResult<any,any> | null>;
restartWorkflowExecution(workflowId, executionId, options?: WorkflowRunOptions): Promise<WorkflowExecutionResult<any,any>>;
restartAllActiveWorkflowRuns(options?: { workflowId?: string }): Promise<WorkflowRestartAllResult>;
getSuspendedWorkflows(): Promise<Array<{ workflowId; executionId; suspendedAt: Date; reason?: string; suspendedStepIndex: number }>>;
```

**Важные выводы из типов:**
1. `WorkflowRestartCheckpoint` — отдельная сущность с `checkpointedAt` и `resumeStepIndex`, значит
   чекпоинты пишутся по ходу исполнения, не только при suspend. Гранулярность — граница шага
   (`resumeStepIndex` / `lastCompletedStepIndex` — целые индексы).
2. `stepData` в чекпоинте существует именно «required by `getStepData()` after restart» — то есть
   в шагах доступен `getStepData(stepId)` и он переживает рестарт.
3. `timeTravel.memory?: Memory` — можно читать исходное исполнение из одной памяти, а писать replay
   в другую. Полезно для «песочницы форков» отдельно от продовой истории.
4. `restartAllActiveWorkflowRuns({ workflowId })` — фильтр по воркфлоу, т.е. при деплое новой версии
   графа можно восстановить только нужные.

---

## 9. Механика чекпоинтов (найдено в dist/index.js, в docs НЕ описано)

Это закрывает UNVERIFIED из §2: чекпоинты пишутся **по ходу обычного `running`**, не только при suspend.

### Конфигурация — на воркфлоу и на прогон
```ts
// WorkflowConfig (dist/index.d.ts:10775-10780)
checkpointInterval?: number;      // @default 1 — «Default running checkpoint persistence interval in completed-step count»
disableCheckpointing?: boolean;   // @default false
// WorkflowRunOptions (dist/index.d.ts:10497-10502) — те же поля переопределяют на конкретный run
retryConfig?: WorkflowRetryConfig; // { attempts?: 0, delayMs?: 0 }
```
Резолв в рантайме: `options?.checkpointInterval ?? workflowCheckpointInterval ?? 1`,
нормализация `Math.max(1, Math.floor(...))`.

### Когда пишется (`persistRunningCheckpoint`)
```js
if (disableCheckpointing) return;
if ((lastCompletedStepIndex + 1) % checkpointInterval !== 0) return;
```
→ **по умолчанию после КАЖДОГО завершённого шага**, один `updateWorkflowState`.

### Куда пишется — важная деталь реализации
```js
await executionMemory.updateWorkflowState(executionId, {
  status: "running",
  context: Array.from(contextMap.entries()),
  workflowState: stateManager.state.workflowState,
  events: collectedEvents,
  metadata: await mergeExecutionMetadata({
    ...(usage ? { usage } : {}),
    ["__voltagent_restart_checkpoint"]: restartCheckpoint,   // ← VOLTAGENT_RESTART_CHECKPOINT_KEY
  }),
  updatedAt: new Date(),
});
```
**Running-чекпоинт лежит в `metadata.__voltagent_restart_checkpoint`**, а не в `suspension.checkpoint`.
То есть в postgres это колонка `metadata JSONB`. Практические следствия:
- наши собственные ключи в `metadata` соседствуют с системным — **не перезатирать metadata целиком**,
  только мержить (в core для этого есть `mergeExecutionMetadata`);
- фильтр `metadata @> $::jsonb` по нашим ключам продолжит работать;
- зарезервированный ключ `__voltagent_restart_checkpoint` — наши ключи именуем иначе.

### Состав running-чекпоинта
```js
{
  resumeStepIndex: lastCompletedStepIndex + 1,
  lastCompletedStepIndex,
  stepExecutionState: stateManager.state.data,
  completedStepsData: steps.slice(0, n).map((step, stepIndex) => ({
    stepId, stepName: step.name ?? step.id, stepIndex,
    output: executionContext.stepData.get(step.id)?.output,
    status: executionContext.stepData.get(step.id)?.status,
  })),
  workflowState: stateManager.state.workflowState,
  stepData: serializeStepDataSnapshot(),   // { [stepId]: { input, output, status, error: serializeStepError(...) } }
  usage, eventSequence, checkpointedAt: new Date(),
}
```
`serializeStepError` — отдельная функция, подтверждает, что `Error` не идёт в JSON как есть
(тип `WorkflowSerializedStepError { message, ... }`).

### Обратная сторона — цена
Каждый шаг = один UPSERT всей строки исполнения (`events` целиком + `metadata` с чекпоинтом).
Для длинных/циклических воркфлоу (наши `andDoWhile` с сотнями итераций) это заметная нагрузка на БД
и рост строки. **Рычаг:** `checkpointInterval: N` на воркфлоу — компромисс между объёмом повторной
работы после краха и стоимостью записи. `disableCheckpointing: true` — только для дешёвых
идемпотентных прогонов (теряет crash-recovery целиком).

### Resume читает то же самое
При резюме: `options.resumeFrom.checkpoint.stepData` → `deserializeCheckpointStepData(...)` →
`executionContext.stepData.set(stepId, ...)`, `resumeInputData = options.resumeFrom.resumeData`,
`executionContext.currentStepIndex = startStepIndex`. Т.е. `getStepData(stepId)` после
restart/resume отдаёт восстановленные данные.

---

## 10. REST API истории (docs/api/api-reference.md:85-120, docs/api/overview.md:104-110)

| Метод | Путь | Auth |
|---|---|---|
| GET  | `/workflows` | No |
| GET  | `/workflows/:id` | No |
| GET  | `/workflows/executions` | No |
| POST | `/workflows/:id/execute` | Yes |
| POST | `/workflows/:id/stream` (SSE) | Yes |
| POST | `/workflows/:id/executions/:executionId/suspend` | No* |
| POST | `/workflows/:id/executions/:executionId/resume` | No* |
| POST | `/workflows/:id/executions/:executionId/cancel` | (из suspend-resume.md) |
| GET  | `/workflows/:id/executions/:executionId/state` | No |

**Фильтры `GET /workflows/executions`:** `workflowId`, `status`, `from`, `to`, `limit`, `offset`,
`userId`, `metadata` (URL-encoded JSON), и точечный `metadata.<key>` — например
`metadata.tenantId=acme`. Это прямой проброс `WorkflowRunQuery`.

**Формат запроса на запуск:**
```json
{ "input": {},
  "options": { "userId": "string", "conversationId": "string",
               "executionId": "string", "context": {}, "workflowState": {} } }
```
`options.executionId` задаётся **снаружи** → можем сами генерировать идентификаторы прогонов
(идемпотентность запуска, связка с нашими записями).

**Нет REST-эндпоинтов для `restart` и `timeTravel`** — только программный API
(`workflow.restart`, `workflow.timeTravel`, `WorkflowRegistry.restartAllActiveWorkflowRuns`).
Если MCP-контракту нужен «replay с шага», эндпоинт пишем сами поверх `WorkflowRegistry`.
По аутентификации: `GET /workflows`, `GET /workflows/:id`, `GET /workflows/executions`,
`GET /workflows/:id/executions/:executionId/state` — публичные по умолчанию
(docs/api/authentication.md:144-149). Для мультитенантности это надо закрывать своим middleware.

---

## 11. Итог: что берём готовым, что пишем сами

**Берём у VoltAgent (не изобретаем):**
- чекпоинты на границе шага + `restart(executionId)` / `restartAllActiveWorkflowRuns()` — crash-recovery;
- `timeTravel({ executionId, stepId, inputData, resumeData, workflowStateOverride })` — replay/fork;
- `suspend/resume` с типизированными `suspendSchema`/`resumeSchema` — human-in-the-loop и gate;
- `queryWorkflowRuns` / `GET /workflows/executions` — список прогонов с фильтрами;
- `createSuspendController` + `WorkflowRegistry.activeExecutions` — пауза/отмена живых прогонов;
- `AbortController` на уровне агента/инструмента — таймауты узлов.

**Пишем сами:**
1. **Чтение lineage через `metadata`** + свой GIN-индекс по `metadata` (в пакете его нет).
   Top-level `replayedFromExecutionId` на postgres/libsql всегда `undefined` — не полагаться на него.
2. **Планировщик дедлайнов** для suspended-прогонов — VoltAgent сам по таймауту не просыпается.
3. **Ключи идемпотентности** для узлов с внешними эффектами: шаг после resume/restart
   переисполняется целиком.
4. **Валидатор JSON-сериализуемости** IR/выходов узлов на этапе компиляции (см. §7).
5. **REST/MCP-обёртка над restart и timeTravel** — встроенных эндпоинтов нет.
6. **Политика `checkpointInterval`** по классу воркфлоу (дешёвый/дорогой шаг).
7. **Auth-middleware** на публичные по умолчанию GET-эндпоинты истории.
