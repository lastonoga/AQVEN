# TypeScript-фреймворки описания воркфлоу: извлекается ли граф до запуска

> Вопрос среза: даёт ли хоть один живой TS-фреймворк статический граф ДО прогона — и какой ценой.

## Что нашли

Версии и даты — `npm view <pkg> version time.modified`, прогон 2026-09-14.

| Фреймворк | Версия / свежесть | Форма определения | **Граф ДО запуска** | Типы между шагами | Изменение кода под живым прогоном |
|---|---|---|---|---|---|
| **VoltAgent** `@voltagent/core` | 2.10.0, 2026-08-27 | чейн: `createWorkflowChain().andThen().andAll().andBranch()` | **ДА, даром**: `workflow.steps` + `workflow.getFullState()` сериализуют дерево шагов без прогона | generics по цепочке: `CURRENT_DATA` перетекает в следующий шаг | versioning API нет; есть suspend/resume по чекпойнту |
| **Mastra** `@mastra/core` | 1.66.0, 2026-09-12 | чейн: `createStep()` + `createWorkflow().then().parallel().branch().dowhile().foreach().map().commit()` | **ДА**: `serializedStepGraph`, Studio рисует граф и подсвечивает статусы на нём | zod/valibot/arktype: `outputSchema` шага обязан сойтись с `inputSchema` следующего | pinning прогонов не описан (UNVERIFIED) |
| **LangGraph JS** `@langchain/langgraph` | 1.4.15, 2026-09-12 | **явная декларация**: `new StateGraph(Annotation).addNode().addEdge().addConditionalEdges().compile()` | **ДА, по построению**: `await app.getGraphAsync()` → `.drawMermaid()` / `.drawMermaidPng()`, «rendering occurs after compilation without requiring execution» | слабо: узлы адресуются **строками**, возвращают частичный `state`; типы не текут по цепочке, а сходятся в общей аннотации | versioning API нет |
| **Inngest** | 4.20.0, 2026-09-04 | императив: обычная `async`-функция + `await step.run("id", fn)` | **НЕТ**, только трасса прогона | обычный вывод TS из тела `fn` | memoization по step ID; «Inngest uses the ID to memoize step state across function versions» — переименование/перестановка шага ломает in-flight |
| **Trigger.dev v4** `@trigger.dev/sdk` | 4.5.16, 2026-09-11 | императив: `task({ id, run })` (UNVERIFIED: точная сигнатура v4 не проверялась кодом) | **НЕТ** | payload-схема на входе задачи | **run пришпилен к версии деплоя** `YYYYMMDD.#`: «Once locked it won't change versions, even if you deploy new versions» |
| **Restate** `@restatedev/restate-sdk` | 1.17.0, 2026-09-03 | императив: обычный handler, `ctx.run(...)` | **НЕТ** | обычный TS + сериализация | immutable deployments: новый код = новый endpoint; небезопасны «reordering SDK operations, adding or removing SDK operations, changing operation inputs» |
| **DBOS** `@dbos-inc/dbos-sdk` | 4.27.6, 2026-09-11 | декораторы `@DBOS.workflow()` / `@DBOS.step()` либо `DBOS.registerWorkflow` + `DBOS.runStep` | **НЕТ** | обычные функции, требование JSON-сериализуемости | `applicationVersion` **по умолчанию = хеш исходника воркфлоу**; recovery только своей версией; починка через `DBOS.forkWorkflow(..., { applicationVersion })` — форк с нужного шага на новую версию |
| **Temporal TS** `@temporalio/workflow` | 1.23.0, 2026-08-26 | императив: обычная функция в детерминированном сэндбоксе | **НЕТ** | обычный TS | `patched('id')` / `deprecatePatch`, Worker Versioning (Deployment Versions); иначе nondeterminism при «adding, removing, or reordering `await` calls on Command-producing APIs» |
| **Genkit** | 1.42.0, 2026-09-01 | конфиг + функция: `ai.defineFlow({ name, inputSchema, outputSchema }, fn)`, шаги через `ai.run("step", fn)` | **НЕТ**, только trace viewer в Dev UI | zod только на границе флоу, внутри — обычный код | versioning API нет |
| **Effect Workflow** `@effect/workflow` | 0.19.1, 2026-07-31 | гибрид: `Workflow.make({ name, payload, idempotencyKey })` + `.toLayer((payload, executionId) => Effect.gen(...))`, шаги — `Activity.make({ name, execute })` | **НЕТ**: тело — императивный генератор, шаги известны только по факту исполнения | Schema + сигнатура Effect `<A, E, R>`; requirements шагов складываются в тип воркфлоу | журнал по **имени** активити; `idempotencyKey` определяет executionId |

Источники: [Temporal TS versioning](https://docs.temporal.io/develop/typescript/versioning) · [DBOS workflows](https://docs.dbos.dev/typescript/tutorials/workflow-tutorial) + [upgrading-workflows](https://docs.dbos.dev/typescript/tutorials/upgrading-workflows) · [Restate versioning](https://docs.restate.dev/services/versioning) · [Trigger.dev versioning](https://trigger.dev/docs/versioning) · [Inngest steps](https://www.inngest.com/docs/learn/inngest-steps) · [LangGraph use-graph-api](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api) · [Mastra control-flow](https://mastra.ai/docs/workflows/control-flow) + [overview](https://mastra.ai/docs/workflows/overview) · [Genkit flows](https://genkit.dev/docs/flows/) · VoltAgent и Effect — по установленным пакетам: `scratchpad/probe/node_modules/@voltagent/core/dist/{index.d.ts,index.js}` (2.10.0) и `scratchpad/probe-ts/node_modules/@effect/workflow/dist/dts/*.d.ts` (0.19.1).

## VoltAgent: дерево шагов отдаётся бесплатно — и где дыры

`dist/index.d.ts:10802` — у объекта `Workflow` есть публичное поле `steps: WorkflowStep<...>[]`, а
`getFullState()` (`dist/index.js:11696`) возвращает `{ id, name, purpose, stepsCount, steps: steps.map(serializeWorkflowStep), inputSchema, resultSchema, ... }`.
`serializeWorkflowStep` (`dist/index.js:12236`) рекурсивно разворачивает структуру:

| Тип шага | Что попадает в сериализацию |
|---|---|
| любой | `id`, `name`, `purpose`, `type`, `stepIndex`, `inputSchema`/`outputSchema`/`suspendSchema`/`resumeSchema`, `retries` |
| `agent` | `agentId` |
| `func` | `executeFunction: originalExecute.toString()` — **исходник тела шага строкой** |
| `conditional-when` | `conditionFunction: toString()` + `nestedStep` (рекурсия) |
| `parallel-all` / `parallel-race` | `subSteps[]` + `subStepsCount` |
| `branch` | `subSteps[]` + `conditionFunctions: branches.map(b => b.condition.toString())` |
| `loop` | `conditionFunction`, `loopType`, `nestedStep` либо `subSteps[]` |
| `foreach` | `nestedStep`, `concurrency` |
| `sleep` / `sleep-until` | `sleepDurationMs` либо `sleepDurationFn: toString()`; `sleepUntil` ISO либо `sleepUntilFn` |
| `map` | `mapConfig` через `safeStringify`, `source: "fn"` деградирует в `fn.toString()` |

Полный список типов шагов (`dist/index.d.ts:15649`): `agent | func | tap | workflow | conditional-when | parallel-all | parallel-race | sleep | sleep-until | foreach | loop | branch | map`.
Плюс есть готовые хелперы адресации узлов для UI: `createWorkflowStepNodeId(stepType, stepIndex, workflowId, { agentId, parallelIndex, stepName, stepId })`,
`getWorkflowStepNodeType`, `extractWorkflowStepInfo(nodeId)` (`dist/index.d.ts:15653-15683`) — то есть сам VoltAgent уже мыслит шаги как узлы графа.

**Три дыры, каждая ломает «граф до запуска»:**
1. `andAll`/`andRace` принимают `steps` не только массивом, но и функцией
   `WorkflowStepParallelDynamicStepsFunc` (`dist/index.d.ts:11254`) — тогда ветвей до прогона **нет вообще**.
2. Условия (`andWhen`, `andBranch`, `loop`) сериализуются как **текст функции**. Это годится показать в
   инспекторе, но не годится ни для статического анализа, ни для семантического диффа: переформатирование
   кода = «изменение» воркфлоу.
3. `func`-шаг непрозрачен: `executeFunction.toString()` — чёрный ящик. Всё, что внутри (вызовы API,
   ветвления, второй LLM-вызов), на канвас не попадает.

## LangGraph JS: граф есть, но ценой второго языка

Граф там не выводится из кода — он **декларируется отдельно от кода узлов**: `addNode("name", fn)` кладёт
функцию под строковый ключ, `addEdge("a", "b")` соединяет строки. Отсюда честный `drawMermaid()` без прогона.
Цена: имена узлов — строки (typo ловится в рантайме, если не городить литеральные типы), а состояние
одно на весь граф (`Annotation`), поэтому **типизированный контракт «выход A ⊂ вход B» отсутствует** — есть
общий мешок состояния. Ровно тот компромисс, который наш §03 (компоненты с контрактами) не принимает.

## Императивные: чем платят за естественность записи

| Фреймворк | Что именно является «определением» для рантайма | Цена изменения |
|---|---|---|
| Temporal | последовательность команд в Event History | замена под живым прогоном → nondeterminism; лечится `patched()` (ветвление в коде навсегда) или Worker Versioning |
| Restate | журнал SDK-операций | deployment иммутабелен; старые in-flight обязаны добежать на старом endpoint, потом drain |
| DBOS | **хеш исходника** воркфлоу = `applicationVersion` | воркфлоу не мигрируется; `forkWorkflow(from step, applicationVersion)` создаёт новый прогон |
| Inngest | набор step ID | смена `id` или порядка шага ломает memoization in-flight |
| Trigger.dev | версия деплоя | run пришпилен к своей версии — единственный из пятёрки, кто решил проблему **без** требований к коду |

Общее: **у всех пятерых «версия определения» — это версия сборки/исходника, а не версия структуры.**
Семантического диффа («добавлена ветка», «узел X теперь читает Y») не даёт никто: нечего диффать, кроме текста.

## Две философии: что на самом деле различается

Заказчик ставит оппозицию «цепочка комбинаторов (VoltAgent, Effect) vs императив с await (Temporal, Restate, DBOS)».
Факты её уточняют: **Effect Workflow относится ко второй группе, а не к первой.**
`Workflow.make({ name, payload, idempotencyKey })` описывает только *границу*, а тело задаётся через
`.toLayer((payload, executionId) => Effect.gen(function* () { ... }))`, где шаги — `Activity.make({ name, execute })`,
вызываемые внутри генератора (`dist/dts/Workflow.d.ts:96,167`, `dist/dts/Activity.d.ts:53`).
Структура известна только по факту исполнения; журнал ведётся по имени активити, ровно как step ID в Inngest.
Effect даёт типизированные эффекты и requirements, но **не граф**.

Настоящий водораздел проходит не по «комбинаторы vs await», а по вопросу:
**вычисляется ли структура на отдельной фазе построения, до и независимо от данных прогона.**

| | Фаза построения есть | Фазы построения нет |
|---|---|---|
| **Кто** | VoltAgent (чейн), Mastra (`.commit()`), LangGraph (`.compile()`) — и вне TS-мира это модель CDK/Pulumi/Cube.js | Temporal, Restate, DBOS, Inngest, Trigger.dev, Genkit, Effect Workflow |
| **Что можно до запуска** | перечислить узлы, нарисовать канвас, посчитать стоимость, проверить контракты, сравнить две версии структурно | ничего; любая «визуализация» — постфактум по трассе |
| **Чем платят** | ветвления по данным обязаны быть **узлом**, а не `if` в JS; тело шага остаётся чёрным ящиком | nondeterminism / pinning / `patched()` / форки |

Важная деталь, которую легко проглядеть: в модели «фаза построения» граф получают **исполнением
builder-кода один раз**, а не анализом AST. Ни VoltAgent, ни Mastra, ни LangGraph AST не разбирают —
они выполняют пользовательский модуль и читают получившийся объект. Отсюда два следствия:
- `for`/`if` в builder-коде **разворачиваются** в статический граф (это плюс: генерация 10 однотипных веток циклом);
- builder обязан быть **чистым и быстрым**: любой `await fetch()` на фазе построения превращает
  «граф до запуска» в «граф после похода в сеть», а `Math.random()`/`Date.now()` — в невоспроизводимый граф.
  Это та же проблема, что у CDK-синтеза, и решается она тем же — изоляцией и кэшированием синтеза.

## Вывод для нас

**Гипотеза «код строит граф, а не исполняет его» подтверждается фактами — но не как выбор языка, а как выбор фазы.**
Три из десяти фреймворков её реализуют, и ровно эти три умеют рисовать граф до запуска. Корреляция полная,
исключений нет. Значит принцип «топология — данные, узлы — контракты» с TypeScript-авторингом совместим.

Что берём:
1. **Двухфазность как жёсткий контракт.** TS-файл экспортирует определение; наш синтезатор импортирует модуль,
   получает объект, сериализует в IR (docs/04-ir-schema.md), дальше компилятор (docs/07-compiler.md) работает как сейчас.
   Прогон **никогда** не исполняет авторский модуль — он исполняет IR. Это снимает весь класс проблем
   Temporal/Restate/DBOS разом: определение не является кодом, который переигрывается.
2. **Форма — чейн с generics, как VoltAgent/Mastra**, не `StateGraph` с узлами-строками: у нас контракты
   на узлах, а не общий мешок состояния, и цепочка даёт вывод типов между шагами бесплатно.
   `.andMap({ source: "value"|"data"|"step"|... })` (см. volt-primitives.md §wiring) — образец того, как ребро
   остаётся данными, а не замыканием; наши рёбра должны выглядеть так же.
3. **Синтез = исполнение builder-модуля в изоляции.** Не AST-анализ (хрупко, не покрывает `for`/`if`),
   а прогон в песочнице с запретом сети/времени/случайности и кэшем по хешу файла — см. ts-code-isolation.md.
4. **Версионирование — от структуры, а не от текста.** DBOS (`applicationVersion` = хеш исходника) и Inngest
   (step ID) показывают антипаттерн: форматирование кода меняет версию. Наша версия считается по
   нормализованному IR, поэтому семантический дифф и 1:1-экспорт (docs/18-export-and-conformance.md) остаются в силе.
5. **Trigger.dev-овский pinning прогона к версии** — берём как модель для наших прогонов: запущенный
   прогон исполняет ту версию IR, на которой стартовал, независимо от новых сохранений.

Что не берём:
1. **Сериализацию условий и тел шагов через `Function.prototype.toString()`** (как делает VoltAgent
   в `serializeWorkflowStep`). Это визуальная заглушка, а не IR: не анализируется, не диффится, ломается от
   переформатирования. У нас условие — выражение в IR; произвольный код допускается только внутри узла
   с объявленным контрактом, и тогда он честно рисуется как непрозрачный узел, а не как «часть графа».
2. **Динамические `steps: (ctx) => Step[]`** (`WorkflowStepParallelDynamicStepsFunc`). На уровне нашего
   авторского API их быть не должно: это ровно тот люк, через который граф исчезает. Ветвление по данным
   выражается `branch`/`foreach` с контрактом, где число ветвей известно, а количество итераций — свойство узла.
3. **Императивную запись с `await` как способ задать топологию.** Естественность записи — единственный её
   плюс, и он покупается ценой, которую платят все пятеро: nondeterminism, pinning, `patched()`, форки.
   Нам, с каналом «канвас ↔ код», эта цена смертельна: из `await`-кода канвас не построить до прогона,
   а обратная генерация кода из канваса тем более невозможна.

Открытое, что надо проверить дальше (не в этом срезе):
- UNVERIFIED: пришпиливает ли Mastra прогон к версии определения (в `control-flow`/`overview` этого нет).
- UNVERIFIED: сохраняет ли `serializedStepGraph` условия ветвления как данные или как текст функции —
  если как данные, там есть чему поучиться для нашего IR ветвлений.
- Обратное направление (IR → TypeScript-текст, чтобы правка на канвасе возвращалась в файл) в живых
  фреймворках не встречается вообще: ни один из десяти не генерирует свой авторский код обратно.
  Это наша оригинальная часть, и её риск ни на кого не переложить — см. ts-roundtrip-canvas.md.
