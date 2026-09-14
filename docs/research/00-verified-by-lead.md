# Проверено ведущим (first-hand, не из памяти)

Источник: реально установленные пакеты в
`/private/tmp/claude-501/.../scratchpad/probe/node_modules`, версия @voltagent/core@2.10.0,
и встроенные в пакет docs (`node_modules/@voltagent/core/docs`, 346 md-файлов).

## Версии (npm view, 2026-09-11)

| Пакет | Версия | Примечание |
|---|---|---|
| @voltagent/core | 2.10.0 | peerDependencies: `ai: ^6.0.0`, `@ai-sdk/provider-utils: 4.x`, `@voltagent/logger: 2.0.2`, `zod: ^3.25.0 \|\| ^4.0.0` |
| @voltagent/server-hono | 2.0.14 | |
| @voltagent/postgres | 2.1.3 | |
| @voltagent/evals | 2.0.5 | |
| @voltagent/mcp-server | 2.2.0 | |
| ai (AI SDK) | 6.0.280 (v6 line) / 7.0.97 (v7 line) | **КОНФЛИКТ**: VoltAgent требует v6 |
| @openrouter/ai-sdk-provider | **2.10.0** (peer `ai: ^6.0.0`) — берём её | ветка 3.x требует `ai: ^7` и с VoltAgent 2.10 несовместима |
| next | 16.3.4 | |
| react | 19.3.0 | |
| zod | 4.6.2 | |
| @xyflow/react | 12.11.6 | |
| elkjs | 0.12.0 | |
| @modelcontextprotocol/sdk | 1.30.0 | |
| @langfuse/tracing | 5.11.1 | новая OTel-линия |
| langfuse | 3.38.20 | старый SDK |
| drizzle-orm / drizzle-kit | 0.45.2 / 0.31.10 | |
| vitest | 5.0.0 | |
| turbo | 2.10.12 | |

**РАЗРЕШЕНО (уточнение к строке выше):** конфликта с OpenRouter нет. Несовместима именно ветка
`@openrouter/ai-sdk-provider@3.x` (peer `ai: ^7`), а линия `2.10.0` объявляет peer `ai: ^6.0.0` — ровно
то, что требует `@voltagent/core@2.10.0`. Обе зависимости уживаются в одном дереве. Документы комплекта
обязаны ссылаться на 2.10.0; любое упоминание «OpenRouter несовместим» относится только к 3.x.

**ФАКТ, подтверждённый npm-резолвом:** `npm i @voltagent/core@2.10.0 ai@7` падает с ERESOLVE
(`peer ai@"^6.0.0" from @voltagent/core@2.10.0`). Ставится только с `ai@6`.
Это первое архитектурное решение, которое надо явно зафиксировать в документации.

## Семантика примитивов VoltAgent (из docs пакета, дословно)

### `andBranch` — docs/workflows/steps/and-branch.md
- «Conditions are evaluated independently; there is **no first-match or else** behavior.»
- «All matching branches run **concurrently**, so multiple branches can execute.»
- «Results are returned as an **array aligned to the `branches` order**. Branches that do not run return `undefined`.»
→ Наш `switch` по enum компилируется во взаимоисключающие условия + шаг сведения (берём
единственный не-`undefined` элемент массива). Полнота enum — забота компилятора.

### `andDoWhile` / `andDoUntil` — docs/workflows/steps/and-loop.md
Сигнатура: `{ id, step?, steps?, condition: (ctx) => boolean | Promise<boolean>, retries?, name?, purpose? }`
- «The configured step(s) run **at least once**.»
- **Лимита итераций нет** — `max_iter`, бюджет, стагнация и best-of реализуем счётчиками в
  workflow state, условие генерирует компилятор.

### `andForEach` — docs/workflows/steps/and-foreach.md
Сигнатура: `{ id, step, concurrency?, items?, map?, retries?, name?, purpose? }`
- «Results **preserve the original order**.» `items` — селектор массива, `map` — решейп элемента
  с сохранением родительского контекста.
- Политики `on_item_error` нет → оборачиваем элемент в Result и фильтруем по политике.

### `andAll` — docs/workflows/steps/and-all.md
- «Each step gets the **same input data**… Waits for ALL steps… **Merges all results into one
  object**… **If any step fails, the whole thing fails**.»
- Нет `quorum(k)`, `any`, `first_success` → оборачиваем ветки в Result + шаг сведения по политике.
  Merge-в-один-объект означает, что ключи веток надо задавать явно, иначе поля затирают друг друга.

### `andRace` — есть, «первый успешный/первый завершившийся» (см. docs/workflows/steps/and-race.md).

### Workflow state — docs/workflows/workflow-state.md
- Инициализация: `workflow.run(input, { workflowState: {...} })`.
- В каждом шаге доступны `workflowState` и `setWorkflowState(prev => next)`.
- «Workflow state is **stored in suspension checkpoints and restored on resume**.»
- Передаётся через REST: `POST /workflows/:id/execute` с `{ input, options: { workflowState } }`.
→ Здесь живут: выходы узлов по ID с метками происхождения, счётчики циклов, лучшие кандидаты,
остаток бюджета.

### Suspend / resume — docs/workflows/suspend-resume.md
- `suspendSchema` и `resumeSchema` задаются **и на воркфлоу, и на отдельном шаге** (шаговая схема
  переопределяет воркфлоу-схему).
- В `execute` доступны `suspend(reason)` и типизированный `resumeData`; шаг сам проверяет
  `if (resumeData) {...}` — то есть после резюма шаг исполняется заново с данными.
→ Наши `human` и `gate` ложатся сюда напрямую; таймауты — наш планировщик (VoltAgent сам по
таймауту не возобновляет).

### Хуки — docs/workflows/hooks.md
`onStart(state)`, `onStepStart(state)`, `onStepEnd(state)`, `onSuspend(info)`, `onError`, `onFinish(info)`.
`state.executionId`, `state.stepId`, `state.data`; `info.status`, `info.suspension?.reason`,
`info.suspension?.suspendData`, `info.error`.
→ Точки для провенанса, бюджетов, политик и записи кассет.

## РЕШЁН БЛОКЕР СПЕКИ §20.4 / §20.6 п.1 — горячая регистрация воркфлоу

В `dist/index.d.ts` подтверждено:

```ts
declare class WorkflowRegistry extends SimpleEventEmitter {
  static getInstance(): WorkflowRegistry;
  registerWorkflow(workflow: Workflow<any, any>): void;
  unregisterWorkflow(id: string): void;
  getWorkflow(id: string): RegisteredWorkflow | undefined;
  getAllWorkflows(): RegisteredWorkflow[];
  reset(): void;                       // для тестов
  activeExecutions: Map<string, WorkflowSuspendController>;
}
```

и на инстансе VoltAgent:

```ts
registerWorkflows(workflows: Record<string, Workflow | WorkflowChain>): void;
registerWorkflow(workflow: Workflow): void;
getWorkflows(): Workflow[];
getWorkflow(id: string): Workflow | undefined;
getWorkflowCount(): number;
getObservability(): VoltAgentObservability | undefined;
```

**Вывод:** воркфлоу регистрируются и снимаются с регистрации в рантайме, перезапуск процесса не
нужен. Строка «Регистрация воркфлоу в рантайме … не подтверждена» из §20.4 закрывается;
запасной вариант с воркером на проект не нужен. Registry — глобальный синглтон
(`globalThis.___voltagent_workflow_registry`), это надо учитывать в тестах и при мультитенантности.
