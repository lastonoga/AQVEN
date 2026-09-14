# VoltAgent 2.10 — остальные примитивы workflow + маппинг на наше ядро

Источник фактов: `/private/tmp/claude-501/-Users-kirunya-Projects-my-ai-workflows-automate/f7b68ecb-d2f6-4f40-91f0-83ca8b26df64/scratchpad/probe/node_modules/@voltagent/core` (версия 2.10.0), встроенные docs + `dist/index.d.ts`.
Опирается на уже проверенное ведущим: `research/00-verified-by-lead.md` (не дублирую).

## 1. andRace / andWhen / andTap / andGuardrail / andAgent

Все пять экспортируются и как standalone-функции (`import { andRace, andWhen, andTap, andGuardrail, andAgent } from "@voltagent/core"`), и как методы чейна (`createWorkflowChain(...).andRace({...})`). Standalone-версии нужны, чтобы класть шаги внутрь `steps: [...]` у andAll/andRace/andBranch.

### andRace
`dist/index.d.ts:11535` (standalone) и `:12375` (метод чейна):
```ts
declare function andRace<INPUT, DATA, RESULT, STEPS extends ReadonlyArray<InternalAnyWorkflowStep<INPUT, DATA, RESULT>>>(
  { steps, ...config }: InternalWorkflowStepConfig<{ steps: STEPS }>
): { ...; execute: (ctx: WorkflowExecuteContext<INPUT, DATA, any, any, unknown>)
      => Promise<InternalInferWorkflowStepsResult<STEPS>[number]> };

// метод чейна:
andRace<NEW_DATA, STEPS, INFERRED_RESULT = InternalInferWorkflowStepsResult<STEPS>[number]>(
  { steps, ...config }: WorkflowStepParallelRaceConfig<STEPS, CURRENT_DATA, NEW_DATA>
): WorkflowChain<INPUT_SCHEMA, RESULT_SCHEMA, INFERRED_RESULT, SUSPEND_SCHEMA, RESUME_SCHEMA>;
```
Конфиг: `{ id: string, steps: Step[], retries?: number, name?: string, purpose?: string }`
(`docs/workflows/steps/and-race.md`, раздел «Function Signature»).

Тип результата — **union результатов всех веток** (`[...][number]`), не кортеж. То есть после andRace
TypeScript знает «один из», и дискриминатор (`source: "cache" | "database"`) надо класть в схему руками —
ровно как в примере из docs.

**Семантика ошибок (docs/workflows/steps/and-race.md, «How It Works» + «Error Handling»):**
- «All steps start at the same time. First one to finish "wins". Its result becomes the workflow result.
  Other steps stop running. **If winner fails, next fastest wins**.»
- «If the fastest step fails, the race continues» → это `Promise.any`-семантика, а **не** `Promise.race`.
  Отклонение ветки не валит гонку; гонку валит только случай, когда **все** ветки отклонились.
  UNVERIFIED: точный тип агрегированной ошибки при провале всех веток (AggregateError vs первая ошибка) —
  в docs не сказано, надо смотреть реализацию `dist/index.js` или пробным прогоном.

**Отмена (важный подводный камень):** «Other steps stop running» — это про то, что их результат
игнорируется. `WorkflowExecuteContext` **не содержит `abortSignal`** (см. §2), поэтому проигравшая
ветка физически продолжает выполняться до конца — её `fetch`/LLM-вызов не отменяется, токены тратятся,
побочные эффекты происходят. Для настоящей отмены наш слой обязан прокидывать свой `AbortController`
в узлы и дергать `abort()` из обёртки победителя.
→ ВЫВОД для нашего `race`: таймаут через andRace (пример «Timeout Pattern» из docs) работает как
«вернуть управление раньше», но не как «остановить работу». Наш таймаут-узел должен отменять
подчинённые вызовы сам.

### andWhen
`dist/index.d.ts:11435`:
```ts
declare function andWhen<INPUT, DATA, RESULT>(
  { condition, step, inputSchema, outputSchema, suspendSchema, resumeSchema, ...config }:
    WorkflowStepConditionalWhenConfig<INPUT, DATA, RESULT>
): WorkflowStepConditionalWhen<INPUT, DATA, RESULT>;
```
Конфиг: `{ id, condition: (ctx) => boolean | Promise<boolean>, step: Step, retries?, name?, purpose?,
inputSchema?, outputSchema?, suspendSchema?, resumeSchema? }`.
`condition` получает тот же `WorkflowExecuteContext` (в примерах docs используются и `{ data }`,
и `{ state }`).

Семантика (`docs/workflows/steps/and-when.md`): «If condition is true: run the step and use its output.
**If condition is false: skip the step, keep original data**». То есть это `if` **без** `else`,
и при false данные проходят насквозь неизменными.
→ Наш `switch`/`gate` через andWhen строится как цепочка взаимоисключающих andWhen; ветка `else`
компилируется в отдельный andWhen с отрицанием. Внутри `step` можно делать suspend/resume
(в docs явный пример с `suspendSchema`/`resumeSchema` на вложенном шаге) — это наш `human gate`.

### andTap
`dist/index.d.ts:11572`:
```ts
declare function andTap<INPUT, DATA, RESULT, SUSPEND_DATA = any, RESUME_DATA = any>(
  { execute, inputSchema, suspendSchema, resumeSchema, ...config }:
    WorkflowStepTapConfig<INPUT, DATA, RESULT, SUSPEND_DATA, RESUME_DATA>
): { ...; execute: (ctx: WorkflowExecuteContext<INPUT, DATA, SUSPEND_DATA, RESUME_DATA>) => Promise<DATA> };
```
Обратите внимание на возврат `Promise<DATA>`, а не `Promise<RESULT>` — тип на уровне системы типов
фиксирует «данные не меняются».

Семантика (`docs/workflows/steps/and-tap.md`):
- «**Never changes data** — original data passes through untouched»;
- «**Can't break your workflow** — errors are caught and logged»; таблица: andTap «Errors: Caught
  (workflow continues)», andThen «Errors: Thrown (workflow stops)»;
- «Return value ignored».
→ Для нас andTap — штатное место под **провенанс, метрики, запись кассет, трассировку**: он не может
уронить прогон. Обратная сторона: молчаливое проглатывание ошибок — если наш экспортер провенанса
сломается, прогон этого не заметит. Наш слой должен внутри tap ловить сам и поднимать флаг в
workflowState, иначе потеря телеметрии будет невидимой.

### andGuardrail
`dist/index.d.ts:11588`:
```ts
declare function andGuardrail<INPUT, DATA>(
  { inputGuardrails, outputGuardrails, ...config }: WorkflowStepGuardrailConfig<INPUT, DATA>
): { ...; execute: (ctx: WorkflowExecuteContext<INPUT, DATA, any, any>) => Promise<DATA> };
// метод чейна (:12226) не меняет CURRENT_DATA:
andGuardrail(config: WorkflowStepGuardrailConfig<WorkflowInput<INPUT_SCHEMA>, CURRENT_DATA>):
  WorkflowChain<INPUT_SCHEMA, RESULT_SCHEMA, CURRENT_DATA, SUSPEND_SCHEMA, RESUME_SCHEMA>;
```
Семантика (`docs/workflows/steps/and-guardrail.md`):
- `inputGuardrails` идут первыми и **принимают только string/messages** («only accept string or message
  inputs»); для объектов надо использовать `outputGuardrails`, которые умеют валидировать/менять
  структурные данные;
- «If a guardrail blocks, **the workflow throws an error**» (в отличие от andTap);
- если guardrail'у нужны API агента — передаётся `guardrailAgent` в конфиге воркфлоу или в run-опциях.

Гардрейлы создаются `createInputGuardrail` / `createOutputGuardrail`; handler возвращает
`{ pass: boolean, action: "modify" | ..., modifiedInput?/modifiedOutput? }`. Доступны готовые:
`createDefaultPIIGuardrails`, `createDefaultSafetyGuardrails`, `createPIIInputGuardrail`,
`createEmailRedactorGuardrail`, `createPhoneNumberGuardrail`, `createProfanityGuardrail`,
`createPromptInjectionGuardrail`, `createHTMLSanitizerInputGuardrail`, `createMaxLengthGuardrail`,
`createInputLengthGuardrail`, `createSensitiveNumberGuardrail` (список экспортов из `dist/index.d.ts`).
→ Наш узел `guard`/политики PII берём отсюда, не пишем сами. Тип возврата `Promise<DATA>` означает,
что «modify» подменяет данные in-place, сохраняя тип — удобно для санитайза перед LLM-узлом.

### andAgent
`dist/index.d.ts:11935` (метод чейна, 4-арная форма):
```ts
andAgent<SCHEMA extends AgentOutputSchema, NEW_DATA>(
  task: string | UIMessage[] | ModelMessage[]
      | InternalWorkflowFunc<WorkflowInput<INPUT_SCHEMA>, CURRENT_DATA,
                             string | UIMessage[] | ModelMessage[], any, any>,
  agent: Agent,
  config: AgentConfig<SCHEMA, WorkflowInput<INPUT_SCHEMA>, CURRENT_DATA>,
  map: (output: InferAgentOutput<SCHEMA>,
        context: WorkflowExecuteContext<WorkflowInput<INPUT_SCHEMA>, CURRENT_DATA, any, any>)
       => Promise<NEW_DATA> | NEW_DATA
): WorkflowChain<INPUT_SCHEMA, RESULT_SCHEMA, NEW_DATA, SUSPEND_SCHEMA, RESUME_SCHEMA>;
```
`AgentConfig.schema` (`:11158`) умеет быть **функцией от контекста** — схема может зависеть от данных:
```ts
schema: SCHEMA | ((context: Omit<WorkflowExecuteContext<INPUT, DATA, any, any>, "suspend" | "writer">)
        => SCHEMA | Promise<SCHEMA>);
```

Ключевые факты из `docs/workflows/steps/and-agent.md`:
- «`andAgent` uses **`generateText`**. If you pass a Zod schema, it is wrapped with `Output.object`.
  If you pass an `Output.*` spec, it is used directly.»
- «✅ structured typed responses / ✅ agent **can use tools** / ❌ **Streaming is not supported**».
- «By default, the step result **replaces** the workflow data with the agent output» — без 4-го
  аргумента `map` предыдущие данные ТЕРЯЮТСЯ. Это грабли номер один: наш компилятор обязан
  всегда генерировать mapper `(output, { data }) => ({ ...data, [nodeId]: output })`.
- Схема может быть не-объектной через `Output.array({ element })`, `Output.choice({ options })`,
  `Output.*` из `ai` (нужен `import { Output } from "ai"` — это ai@6, см. заметку ведущего).
- Конфиг прокидывается в `agent.generateText`, поэтому на шаге доступны `inputMiddlewares`,
  `outputMiddlewares`, `maxMiddlewareRetries`, `maxRetries`.
- Retry-семантика LLM-уровня: «`maxRetries` controls LLM retries for the selected model
  (**total attempts = maxRetries + 1**)»; «`maxMiddlewareRetries` controls retries triggered by
  `abort(..., { retry: true })`»; «A middleware retry **restarts the step**: middlewares, guardrails,
  hooks, model selection, and fallback.»
- Если нужен стриминг токенов или инспекция tool-calls — docs прямо велят не использовать andAgent,
  а звать агента вручную внутри `andThen` (`streamText`/`generateText`).
→ ВЫВОД для нашего `llm`-узла: andAgent покрывает «structured output + tools», но не покрывает
стриминг и не покрывает наш провенанс токенов per-call. Узлы, где нужен поток в UI, компилируем
в `andThen` + прямой вызов агента + `writer` (см. §5).

## 2. andThen — полный тип execute-контекста

`dist/index.d.ts:11040` — дословно (тип помечен `@private - INTERNAL USE ONLY`, но именно он
приходит в `execute` любого шага):

```ts
interface WorkflowExecuteContext<INPUT, DATA, SUSPEND_DATA, RESUME_DATA, WORKFLOW_RESULT = unknown> {
  data: DATA;
  state: WorkflowStepState<INPUT>;
  getStepData: (stepId: string) => WorkflowStepData | undefined;
  getStepResult: <T = unknown>(stepId: string) => T | null;
  getInitData: <T = InternalExtractWorkflowInputData<INPUT>>() => T;
  suspend: (reason?: string, suspendData?: SUSPEND_DATA) => Promise<never>;
  bail: (result?: WORKFLOW_RESULT) => never;
  abort: () => never;
  resumeData?: RESUME_DATA;
  retryCount?: number;
  workflowState: WorkflowStateStore;                       // Record<string, unknown>
  setWorkflowState: (update: WorkflowStateUpdater) => void; // store | (prev) => store
  logger: Logger;
  writer: WorkflowStreamWriter;                             // NoOp, когда не стримим
}
```

Конфиг шага `andThen` (`InternalWorkflowStepConfig` + `InternalBaseWorkflowStep`, `:11069`–`:11135`):
```ts
{ id: string; name?: string; purpose?: string; retries?: number;
  inputSchema?: z.ZodTypeAny; outputSchema?: z.ZodTypeAny;
  suspendSchema?: z.ZodTypeAny; resumeSchema?: z.ZodTypeAny;
  execute: (ctx: WorkflowExecuteContext<...>) => Promise<RESULT>; }
```

### Что важно нам, по пунктам

- **`getStepData(stepId)` / `getStepResult<T>(stepId)`** — это готовый «DAG по ID»: любой шаг может
  достать результат ЛЮБОГО предыдущего шага по его `id`, а не только данные от соседа. Это снимает
  необходимость самим тащить всё через `data`. `getStepResult` возвращает `T | null`, `getStepData` —
  `WorkflowStepData | undefined`. **Типизации нет** (дженерик задаём мы) → наш компилятор обязан
  генерировать типобезопасные аксессоры и проверять существование `stepId` на этапе компиляции IR.
- **`getInitData<T>()`** — исходный вход воркфлоу, доступен на любом шаге. Наш `{{input.*}}` в
  шаблонах маппится сюда.
- **`bail(result)`** vs **`abort()`**: `bail` завершает воркфлоу **успешно** с переданным результатом
  (ранний выход), `abort` — прерывает. Оба типизированы как `never`, то есть бросают. Наш `early exit`
  / «достаточно хорошо» реализуем через `bail`, наш `fail fast` — через `abort` или throw.
- **`retryCount?: number`** — текущая попытка доступна внутри `execute`. Наш слой может по ней менять
  температуру / модель / промпт при ретраях (self-repair loop) — без собственного счётчика.
- **`suspend(reason?, suspendData?)`** возвращает `Promise<never>` — после него код шага не
  продолжается. При резюме шаг вызывается **заново**, и данные приходят в `resumeData`.
- **`state: WorkflowStepState<INPUT>`** (`:11024`) = `Omit<WorkflowState<INPUT, any>, "data"|"result">`
  плюс `workflowContext?: WorkflowExecutionContext` и **`signal?: AbortSignal`**.
  То есть **`abortSignal` есть, но не на верхнем уровне контекста, а как `ctx.state.signal`**, и он
  опциональный, а в комментарии описан узко: «AbortSignal for checking suspension during step
  execution». Прокидывать в `fetch`/`generateText` надо именно `ctx.state.signal`.
  Поля `state` (из `WorkflowState`, `:10159`): `executionId`, `conversationId?`, `userId?`,
  `context?: UserContext`, `active: number`, `startAt`, `endAt`, `status`, `input`, `workflowState`,
  `error`, `suspension?`, `cancellation?`, **`usage: UsageInfo`** («accumulated usage from andAgent
  calls»).
- **`state.usage`** — накопленный usage по andAgent-шагам. Это готовая база под наш бюджет по токенам;
  но она накапливается только для andAgent, не для ручных вызовов агента в andThen →
  наш слой обязан дописывать usage сам, если узел компилируется в andThen.
- **`state.context: UserContext`** — это Map-подобный носитель (в docs `andWhen` пример:
  `({ state }) => state.context?.get("role") === "admin"`). Здесь живут tenant/actor/request-id.
- **`logger`** — «execution-scoped logging with full context (userId, conversationId, executionId)».
  Наш слой не заводит свой logger внутри шага, берёт этот.
- **`writer: WorkflowStreamWriter`** — всегда есть; вне стриминга это NoOp. Подробности в §5.

**Чего в контексте НЕТ:** отдельного `abortSignal` (только `state.signal`), доступа к списку шагов,
таймаутов на шаг, дедлайна. Тайм-ауты и бюджеты — целиком наш слой.

## 3. retries на шаге и retryConfig на воркфлоу

```ts
// dist/index.d.ts:10414
interface WorkflowRetryConfig {
  attempts?: number;   // @default 0 — «Number of retry attempts for a step when it throws an error»
  delayMs?: number;    // @default 0 — «Delay in milliseconds between retry attempts»
}
```
`retryConfig?: WorkflowRetryConfig` встречается в `dist/index.d.ts` на строках 10492, 10770, 10842,
10857 — то есть в run-опциях («Override retry settings for this workflow execution»), в конфиге
воркфлоу и во вложенных конфигах. На шаге — плоское поле `retries?: number`
(`InternalWorkflowStepConfig`, `:11080`: «Number of retry attempts when the step throws an error»;
дублируется в `InternalBaseWorkflowStep`, `:11125`).

**Факты и ограничения:**
- Триггер ретрая — **выброшенное исключение** из `execute`. Ничего вроде «ретрай по результату»
  или «ретрай по коду ошибки» нет. `andTap` ошибки глотает → его ретраи бессмысленны.
- **Backoff'а нет**: только фиксированная задержка `delayMs`. Ни экспоненты, ни джиттера, ни потолка.
  → Наш `retry` с экспоненциальным backoff'ом и джиттером **не выражается** через `retryConfig`.
  Реализуем сами: либо `retries: 0` + собственный цикл внутри `execute` с задержкой, либо через
  `andDoUntil` + счётчик в workflowState. Рекомендуемый вариант — внутри `execute`, чтобы retry
  не создавал лишних шагов в таймлайне.
- `attempts` — именно «retry attempts», то есть **сверх** первой попытки (по аналогии с andAgent:
  «total attempts = maxRetries + 1»). UNVERIFIED: точное совпадение семантики `retries` на шаге и
  `maxRetries` у andAgent не заявлено в docs. **ПОДТВЕРЖДЕНО в §5** примером из execute-api.md:
  при `retries: 2` значения `retryCount` = 0, 1, 2 → total attempts = retries + 1.
- `ctx.retryCount` доступен внутри `execute` (см. §2) — это единственный способ различить попытки.
- Уровни ретраев складываются: `retries` на шаге (VoltAgent) + `maxRetries` у andAgent (AI SDK,
  на уровне модели) + `maxMiddlewareRetries` (abort с `{ retry: true }`). Легко получить
  мультипликативный взрыв попыток. → Наша документация должна явно требовать: LLM-ретраи только
  на одном уровне.
- Рядом с `retryConfig` в run-опциях: `suspensionMode?: "immediate" | "graceful"` (@default
  `'graceful'` — «Wait for current step to complete before suspending»), `checkpointInterval?: number`
  (@default 1 — «Persist running checkpoints every N completed steps»), `logger?`.
  `checkpointInterval` — прямой рычаг «надёжность vs накладные расходы» для длинных прогонов.

## 4. schemas.md — input / result / suspendSchema / resumeSchema

Источник: `docs/workflows/schemas.md`. Четыре схемы задаются в конфиге `createWorkflowChain` /
`createWorkflow`:

```ts
createWorkflowChain({
  id: "process-order",
  input:  z.object({ orderId: z.string(), amount: z.number().positive() }), // вход воркфлоу
  result: z.object({ average: z.number(), summary: z.string() }),           // финальный выход
  suspendSchema: z.object({ requestId: z.string(), amount: z.number(), requestedBy: z.string() }),
  resumeSchema:  z.object({ approved: z.boolean(), approvedBy: z.string().email(),
                            comments: z.string().optional() }),
})
```

- **input** — «Validates data when workflow starts». `workflow.run({...})` с неподходящей формой
  падает. В типах чейна `INPUT_SCHEMA` параметризует `WorkflowInput<INPUT_SCHEMA>` и протекает во
  все шаги через `getInitData()`/`state.input`.
- **result** — «Validates final workflow output». Валидируется выход последнего шага.
- **suspendSchema** — «Validates data saved when workflow pauses». Именно этот объект попадает в
  `suspension.suspendData` (см. `WorkflowSuspensionMetadata`, `dist/index.d.ts:10184`) и, значит,
  в чекпоинт — то, что видит человек в UI задачи.
- **resumeSchema** — «Validates data when workflow continues after suspension»; приходит в
  `ctx.resumeData` уже типизированным и провалидированным. Резюм: `await workflow.resume(executionId,
  { approved: true, approvedBy: "manager@company.com" })`.

**Ключевое правило переопределения (schemas.md, «Step-Level Schemas»):**
«Steps can define their own schemas that **override workflow defaults**» — шаговые `suspendSchema` /
`resumeSchema` перекрывают воркфлоу-уровневые, комментарий в примере дословно: «Uses step's
resumeSchema, not workflow's».
→ Для нашего компилятора это означает: воркфлоу-уровневые suspend/resume схемы имеет смысл ставить
только как «последний рубеж»; каждый наш `human`/`gate`-узел должен нести собственную пару схем,
иначе MCP-клиент не поймёт, что именно надо прислать на резюм.

Шаг дополнительно принимает `inputSchema` и `outputSchema` (`InternalBaseWorkflowStep`,
`dist/index.d.ts:11110`–`:11118`) — «Optional input/output schema for **runtime validation**».
`andTap` в docs показан с `inputSchema`. Полный набор схем на шаге: `inputSchema`, `outputSchema`,
`suspendSchema`, `resumeSchema`.

**Что важно нам:**
- В `zod` допустимы `z.union([...])` для resume («Union Types» в docs) — наш `gate` с ветками
  approve/reject с разными полями выражается дискриминированным union'ом.
- Схемы — это `z.ZodTypeAny` (не JSON Schema). Для MCP-контракта их надо конвертировать; в экспортах
  core есть **`zodSchemaToJsonUI`** (`dist/index.d.ts`, список экспортов) — кандидат на переиспользование
  вместо собственного конвертера. UNVERIFIED: точная сигнатура и совместимость выхода с JSON Schema
  Draft-7 / MCP `inputSchema` — надо проверить отдельно.
- peer-диапазон zod у core: `^3.25.0 || ^4.0.0` (из заметки ведущего), в probe стоит zod 4.6.2.
- Осторожно: `input` у воркфлоу может быть не только zod — `InternalBaseWorkflowInputSchema =
  z.ZodTypeAny | BaseMessage | BaseMessage[] | UIMessage | UIMessage[] | string`
  (`dist/index.d.ts:11035`). Для нас — всегда `z.ZodTypeAny`, остальные формы это агентский чат.

## 5. execute-api.md + streaming.md — run / stream / startAsync / timeTravel

### Пять методов запуска (docs/workflows/streaming.md, «Consuming the Stream», дословно)
- `.stream(input)` — «Real-time execution with event streaming»
- `.run(input)` — «Standard execution without streaming»
- `.startAsync(input)` — «Fire-and-forget execution (returns immediately)»
- `.timeTravel({ executionId, stepId })` — «**Deterministic replay from a historical execution step**»
- `.timeTravelStream({ executionId, stepId })` — «Real-time streaming replay from a historical execution step»

```ts
const execution    = await workflow.run(input);        // execution.result, execution.executionId
const started      = await workflow.startAsync(input); // { executionId }
const state        = await workflow.memory.getWorkflowState(started.executionId); // { status, ... }
const replay       = await workflow.timeTravel({ executionId: execution.executionId, stepId: "step-2" });
const replayStream = workflow.timeTravelStream({ executionId: execution.executionId, stepId: "step-2" });
for await (const ev of replayStream) { /* ... */ }
const replayResult = await replayStream.result;
```

**`timeTravel` — крупная находка для нашей истории «Claude отлаживает и чинит воркфлоу».** Готовый
детерминированный реплей с произвольного шага исторического прогона; собственный механизм
«переиграть с узла N» писать не надо. Под это в run-опциях (`dist/index.d.ts:~10400`) есть
`workflowStateOverride?: WorkflowStateStore` («Optional override for shared workflow state during
replay») и `memory?: Memory` («Optional memory adapter to read source execution and persist replay
execution state»); в экспортах — типы `WorkflowRestartAllResult`, `WorkflowRestartCheckpoint`.
→ MCP-инструмент `workflow.replay_from(executionId, stepId, { overrides })` строится поверх почти
без кода. UNVERIFIED: поведение timeTravel с недетерминированными узлами (кэшируются ли ответы
моделей для шагов ДО `stepId`) — из docs не следует; проверить прогоном.

### Поток событий
`WorkflowStreamResult` — `AsyncIterable<WorkflowStreamEvent>` + промис `.result`
(`dist/index.d.ts:10319`). Тип события (`:10950`):
```ts
interface WorkflowStreamEvent {
  type: "workflow-start" | "workflow-suspended" | "workflow-complete" | "workflow-cancelled"
      | "workflow-error" | "step-start" | "step-complete" | (string & {});
  executionId: string;
  from: string;                      // step ID или name
  input?: any; output?: any;
  status: "pending"|"running"|"success"|"skipped"|"error"|"suspended"|"cancelled";
  context?: UserContext;
  timestamp: string;                 // ISO 8601
  stepIndex?: number;
  stepType?: "agent"|"func"|"conditional-when"|"parallel-all"|"parallel-race"|"tap"|"workflow"
           |"guardrail"|"sleep"|"sleep-until"|"foreach"|"loop"|"branch"|"map";
  metadata?: Record<string, any>;
  error?: any;
}
```
Таблица событий в docs дополнительно называет `step-error` и `step-suspend` (в union типа их нет,
но union открыт через `(string & {})`).

**ВАЖНО для нашего UI/MCP:** событие несёт `from` (step id), `stepIndex`, `stepType`, `input`,
`output`, `status` — этого хватает, чтобы восстановить пошаговый прогресс без собственной шины
событий. Статус `"skipped"` есть в типе → пропущенные `andWhen`-ветки видны.
Чего НЕТ: `parentStepId` / `parallelIndex` (они есть в `WorkflowStepContext`, `:10146`, но **не** в
событии стрима) → **вложенность шагов внутри andAll/andForEach/andRace по стриму не
восстанавливается**. Наш слой сам проставляет корреляцию через
`writer.write({ metadata: { nodeId, parentNodeId, branchIndex } })`.

### Observer API (только SDK, не REST)
`watch(cb) => unsubscribe`, `watchAsync(cb) => Promise<unsubscribe>`,
`observeStream() => ReadableStream<WorkflowStreamEvent>`, `streamLegacy() => { stream,
getWorkflowState }` (`dist/index.d.ts:10353`–`:10366`). Они «do not consume the main async iterator»
— несколько подписчиков одновременно возможны. docs дословно: «`watch`, `watchAsync`,
`observeStream`, and `streamLegacy` are **SDK-only APIs**. REST API clients should use SSE endpoints».

### Writer API — наш канал провенанса
`ctx.writer` есть «in the execution context of **all step types**»; вне стриминга — NoOp-реализация.
```ts
writer.write({ type: "processing-started", metadata: { itemCount: n } });
await writer.pipeFrom(response.fullStream, { prefix: "agent-", agentId: agent.id,
                                             filter: (part) => part.type !== "finish" });
```
`write` автоматически заполняет `executionId`, `from`, `timestamp`, `stepIndex` и `status`
(по умолчанию `"running"`); обязательное поле — только `type`.
`pipeFrom` маппит части агентского `fullStream` в события воркфлоу (таблица «Event Mapping»):
`part.args → input` (tool-call), `part.textDelta → output` (text-delta), `part.result → output`
(tool-result), `part.usage → metadata.usage` (finish), `part.error → metadata.error` (error).
→ Это ровно то, что нужно нашему «LLM-узел со стримингом»: `andThen` + `agent.streamText` +
`writer.pipeFrom` даёт и токены в UI, и usage в метаданных. Напомню: `andAgent` стриминг НЕ
поддерживает (§1).

### Suspend/resume и стрим
- Программный API: «the stream remains continuous across suspend and resume» — один итератор
  переживает приостановку, резюм делается прямо на объекте стрима: `await stream.resume({ approved: true })`.
- REST: архитектура **stateless**, поэтому «On Suspension: **SSE stream closes** (server doesn't
  maintain stream state)», а «Resume Execution: Returns complete result via standard HTTP response
  (**not streamed**)».
→ Наш MCP-слой, если ходит по HTTP, обязан после резюма переподключаться к
`GET /workflows/:id/executions/:executionId/stream`, иначе пошагового прогресса после резюма не будет.
Альтернатива — держать исполнение в том же процессе и использовать программный API.

### REST-эндпоинты (из streaming.md; порт по умолчанию в примерах 3141)
- `POST /workflows/:id/stream` — тело `{ input, options: { userId, executionId } }`, ответ SSE
  (построчно `data: {...}`).
- `GET /workflows/:id/executions/:executionId/stream` — подписка на события существующего прогона (SSE).
- `POST /workflows/:id/executions/:executionId/resume` — тело `{ resumeData: {...} }`, ответ — обычный
  JSON `{ status: "completed", result: {...}, usage: { totalTokens, ... } }`.
- (из заметки ведущего) `POST /workflows/:id/execute` — тело `{ input, options: { workflowState } }`.

### Уточнение к §3 по ретраям (execute-api.md, раздел «retryCount»)
Дословный пример: `retries: 2` → `console.log("Attempt:", retryCount); // **0, 1, 2**`.
Значит `retryCount` считается с нуля и **total attempts = retries + 1** — гипотеза из §3
подтверждена. Также: «`retryCount` also increments when retries are enabled at the workflow level»
с примером `createWorkflowChain({ id: "retry-defaults", retryConfig: { attempts: 2, delayMs: 250 } })`
→ `retryConfig` в конфиге воркфлоу задаёт дефолт для всех шагов, `retries` на шаге его переопределяет.

### Прочее из execute-api.md, что меняет наш дизайн
- **`getStepData(stepId)` возвращает `{ input, output }`** — и вход, и выход шага, не только выход
  (дословно: «step1Data.input — What went INTO step-1; step1Data.output — What came OUT of step-1»).
  Это готовая основа провенанса: пары вход/выход по каждому узлу уже хранятся ядром, нам не нужно
  дублировать их в workflowState.
- «**When resumed, the step runs again from the beginning** with `resumeData` available» — шаг обязан
  быть идемпотентным сам. Наши узлы с побочными эффектами (отправка сообщения, запись в БД) обязаны
  нести idempotency key, иначе резюм продублирует эффект.
- Регистрация обязательна для suspend/resume и REST: «Register your workflows with a `VoltAgent`
  instance so suspend/resume and REST routes can locate executions» — `new VoltAgent({ workflows: {...} })`.
- `state.context` — Map: «context is a Map for custom data», `state.context?.get("role")`.
- Публичный (упрощённый) тип контекста, который docs показывают как `ExecuteContext<TData,
  TSuspendData, TResumeData>`, **не совпадает** с реальным `WorkflowExecuteContext` из `.d.ts`:
  в docs отсутствуют `logger`, `writer`, `getStepResult`, `getInitData`, `bail`, `abort`.
  Ориентироваться надо на `.d.ts` (§2), docs здесь отстают.

## 6. ИТОГ: таблица маппинга «наше ядро → VoltAgent → наш слой»

Сводит факты этой заметки и `research/00-verified-by-lead.md`.

| Конструкция нашего IR | Конструкция VoltAgent 2.10 | Что даёт VoltAgent из коробки | Что ОБЯЗАН дописать наш слой |
|---|---|---|---|
| **seq** (последовательность) | `.andThen({ id, execute })` цепочкой | типы протекают по цепи; `getStepData`/`getStepResult` дают доступ к любому прошлому шагу; `retries`; чекпоинты | ничего сверх генерации id и мапперов |
| **wiring / выражения на рёбрах** | **`.andMap({ id, map })`** — декларативный маппер: `{source:"value"\|"data"\|"input"\|"context"\|"step"\|"fn", path/key/stepId}` | путь в dot-нотации, чтение из `data`/`input`/`context`/выхода шага по `stepId` | наш IR-компилятор кладёт рёбра сюда, а не в JS-замыкания → граф остаётся сериализуемым и инспектируемым. `source:"fn"` — аварийный люк, для него провенанс пишем сами |
| **parallel** (все ветки) | `.andAll({ id, steps })` | параллельный запуск на одних входных данных, **merge результатов в один объект** | ветки давать уникальные ключи (иначе затирание); политики `quorum(k)`/`any`/`first_success` — оборачиваем каждую ветку в `Result<T,E>` + шаг сведения; `andAll` падает целиком, если упала любая ветка |
| **map** (по коллекции) | `.andForEach({ id, step, items?, map?, concurrency? })` | порядок результатов сохраняется; ограничение параллелизма | `on_item_error` (skip/collect/fail-fast), лимит на размер коллекции, частичные результаты |
| **switch** (по enum, ровно одна ветка) | `.andBranch({ id, branches })` ИЛИ цепочка `.andWhen(...)` | andBranch: условия независимы, **нет first-match/else**, совпавшие ветки идут параллельно, результат — массив по порядку веток с `undefined` у несработавших | компилятор генерирует взаимоисключающие предикаты + шаг сведения (единственный не-`undefined`); проверка полноты enum; `default`-ветка = отрицание объединения |
| **if / gate (булев)** | `.andWhen({ id, condition, step })` | true → шаг, false → данные проходят насквозь без изменений | «else» — второй `andWhen` с отрицанием; наш gate с ожиданием человека — `andWhen` + `suspend` внутри `step` со своими `suspendSchema`/`resumeSchema` |
| **loop** (while/until, бюджет, best-of) | `.andDoWhile` / `.andDoUntil({ id, step\|steps, condition })` | тело выполняется **минимум один раз**; условие может быть async | **лимита итераций нет** → `max_iter`, бюджет токенов/времени, детект стагнации, хранение лучшего кандидата — счётчики в `workflowState` + генерируемое условие |
| **race** (первый успешный / таймаут) | `.andRace({ id, steps })` | `Promise.any`-семантика: провал быстрого не валит гонку, «if winner fails, next fastest wins»; тип результата — union веток | **реальная отмена проигравших**: свой `AbortController`, прокинутый в узлы (в контексте только `state.signal`, и он про suspension). Дискриминатор источника в схему. Учёт стоимости всех веток, а не только победителя |
| **try / catch / finally** | нет прямого аналога | `retries` на шаге + `retryConfig` на воркфлоу (фиксированный `delayMs`, `attempts`, total = retries+1) | try/catch — `try/catch` внутри `execute` с возвратом `Result`; `finally` — `andTap` (он глотает ошибки) либо hook `onFinish`; **экспоненциальный backoff + джиттер пишем сами** — в `WorkflowRetryConfig` только фиксированная задержка |
| **guard / политики / PII** | `.andGuardrail({ id, inputGuardrails, outputGuardrails })` + готовые `createPIIInputGuardrail`, `createDefaultSafetyGuardrails`, `createPromptInjectionGuardrail`, `createMaxLengthGuardrail`, `createHTMLSanitizerInputGuardrail`, `createProfanityGuardrail`, `createSensitiveNumberGuardrail`, `createEmailRedactorGuardrail`, `createPhoneNumberGuardrail` | `pass/action:"modify"`; блокировка бросает ошибку; `inputGuardrails` — только string/messages, для объектов — `outputGuardrails` | реестр политик, привязка политики к узлу в IR, перевод блокировки в наш типизированный `PolicyViolation` вместо голого throw |
| **component** (переиспользуемый подграф) | **`.andWorkflow(workflow)`** / `andWorkflow(w)` standalone (`dist/index.d.ts:11753`), `stepType: "workflow"` | вложенный воркфлоу как обычный шаг | версионирование компонентов, проверка совместимости схем на границе, наш реестр компонентов |
| **llm-узел (structured)** | `.andAgent(task, agent, { schema, inputMiddlewares, outputMiddlewares, maxRetries, maxMiddlewareRetries }, map?)` | structured output через `Output.object`, tools работают, накопление `state.usage`, `schema` может быть функцией от контекста | **всегда генерировать 4-й аргумент `map`** — иначе выход агента ЗАТИРАЕТ данные; стриминга нет |
| **llm-узел (streaming)** | `.andThen` + `agent.streamText` + `ctx.writer.pipeFrom(fullStream, { prefix, agentId, filter })` | маппинг частей стрима в `WorkflowStreamEvent`, `part.usage → metadata.usage` | ручной учёт usage в `workflowState` (в `state.usage` попадает только andAgent) |
| **human / approval** | `suspend(reason, suspendData)` + `resumeData` + `suspendSchema`/`resumeSchema` **на шаге** (перекрывают воркфлоу-уровневые) | чекпоинт с `workflowState`, REST `POST /workflows/:id/executions/:id/resume`, стрим-событие `workflow-suspended` | **таймауты приостановки — наш планировщик** (VoltAgent сам не возобновляет); идемпотентность (шаг после резюма выполняется с начала); типизация задачи для UI |
| **sleep / расписание** | `.andSleep({ id, duration: number \| (ctx)=>number })`, `.andSleepUntil(...)` | задержка, в т.ч. вычисляемая | долгие ожидания (часы/дни) лучше через suspend + внешний планировщик, а не sleep в процессе |
| **debug / replay** | **`.timeTravel({ executionId, stepId })` и `.timeTravelStream(...)`** + `workflowStateOverride`, `memory` в run-опциях | детерминированный реплей с произвольного шага исторического прогона | MCP-инструмент поверх; кассеты для LLM-узлов (UNVERIFIED, кэширует ли timeTravel ответы моделей) |
| **прогресс / наблюдаемость** | `.stream()` → `AsyncIterable<WorkflowStreamEvent>`, `watch`/`watchAsync`/`observeStream` (SDK-only), SSE `POST /workflows/:id/stream`, `GET /workflows/:id/executions/:id/stream`, хуки `onStart/onStepStart/onStepEnd/onSuspend/onError/onFinish` | `from`, `stepIndex`, `stepType`, `input`, `output`, `status` (в т.ч. `"skipped"`) | **корреляция вложенности**: в событии нет `parentStepId`/`parallelIndex` → сами пишем `writer.write({ metadata: { nodeId, parentNodeId, branchIndex } })` |
| **горячая (пере)регистрация** | `WorkflowRegistry.getInstance().registerWorkflow/unregisterWorkflow`, `voltAgent.registerWorkflows({...})` (проверено ведущим) | рантайм-регистрация без рестарта | реестр глобальный синглтон (`globalThis.___voltagent_workflow_registry`) → изоляция тенантов и тестов на нас |
| **валидация входа/выхода** | `input`/`result` в конфиге воркфлоу; `inputSchema`/`outputSchema` на шаге (zod, peer `^3.25 \|\| ^4`) | рантайм-валидация + вывод типов | конвертация zod → JSON Schema для MCP-контракта (кандидат: экспорт **`zodSchemaToJsonUI`**, UNVERIFIED); версионирование схем |
| **ранний выход / отмена** | `ctx.bail(result)` — успешное завершение с результатом; `ctx.abort()` — прерывание | оба `never`, бросают | политика «достаточно хорошо» и её провенанс |

### Три вывода, которые меняют архитектуру
1. **`andMap` + `getStepData`/`getStepResult` снимают нужду в собственном раннере графа.** IR-рёбра
   компилируются в декларативные мапперы, узлы — в шаги, доступ к чужим выходам — по `stepId`.
   Наш компилятор остаётся компилятором, а не интерпретатором.
2. **`timeTravel` — готовый детерминированный реплей.** Ключевой пункт «Claude отлаживает и чинит»
   закрывается штатным API, а не нашим кодом.
3. **Четыре вещи VoltAgent не делает и делать не будет: backoff-политики, отмена проигравших в race,
   лимиты итераций цикла, таймауты приостановки.** Это и есть минимальный периметр «ядра доверия»
   поверх фреймворка — плюс IR, компилятор, реестры и MCP-контракт.
