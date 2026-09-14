# VoltAgent 2.10 — агенты (под §7.3: агент = набор настроек + переопределение на вызове)

Источник фактов: `@voltagent/core@2.10.0` в
`/private/tmp/claude-501/-Users-kirunya-Projects-my-ai-workflows-automate/f7b68ecb-d2f6-4f40-91f0-83ca8b26df64/scratchpad/probe/node_modules/@voltagent/core`
(встроенные docs `<core>/docs/agents/*.md` + типы `<core>/dist/index.d.ts`).
Далее `<core>` = этот путь.

## 1. Dynamic Agents (instructions/model/tools как функции)

Источник: `<core>/docs/agents/dynamic-agents.md`, типы `<core>/dist/index.d.ts:2051-2062, 8051-8086, 8385-8391`.

Динамическими могут быть РОВНО ТРИ поля конструктора: `instructions`, `model`, `tools`.
Всё остальное (memory, hooks, maxSteps, guardrails) — статично на уровне агента и
переопределяется только per-call опциями (см. §2).

```ts
// dist/index.d.ts:2051
interface DynamicValueOptions {
  context: Map<string | symbol, unknown>;   // тот самый context, что передан в вызов
  headers?: Record<string, string>;         // HTTP-заголовки, ключи в lowercase; только через server adapter или requestHeaders
  prompts: PromptHelper;                    // VoltOps prompt management
}
type DynamicValue<T> = (options: DynamicValueOptions) => Promise<T> | T;

type InstructionsDynamicValue = string | DynamicValue<string | PromptContent>;
type ModelDynamicValue<T> = T | DynamicValue<T>;
type AgentModelValue = ModelDynamicValue<AgentModelReference> | AgentModelConfig[];
// tools?: (Tool | Toolkit | Tool$1)[] | DynamicValue<(Tool | Toolkit)[]>
```

Порядок: `agent.generateText(input, { context })` → агент вызывает функции с
`{ context, headers, prompts }` → резолвит значение на КАЖДУЮ операцию.
Дока прямо предупреждает: «Dynamic functions are called on every operation, so keep them
synchronous or fast» (никаких БД/HTTP внутри), и рекомендует allowlist для security-чувствительных
значений (роль из context — это ввод извне, не доверять).

`requestHeaders` для in-process вызова:
```ts
await agent.generateText("Hello", { requestHeaders: { authorization: "Bearer t", "x-tenant-id": "tenant-1" } });
```

REST: context идёт внутри `options`:
`POST /agents/:name/text` `{"input":"...","options":{"context":{"role":"admin"},"temperature":0.7}}`
— на транспорте это обычный JSON-объект, в рантайме становится Map.

**Как это ложится на наш §7.3.** Схема «агент = набор настроек + переопределение на вызове»
поддерживается двумя разными механизмами, и их надо не путать:
- `context`-based dynamic resolution — для полей instructions/model/tools (единственный способ
  подменить tools и instructions на вызове: в опциях generateText НЕТ полей instructions/tools,
  проверено по `GenerateTextOptions`, см. §2);
- прямые per-call опции — для sampling-параметров (temperature, maxOutputTokens, providerOptions…)
  и для `model` тоже (в опциях есть `model?`).

Рекомендация: наш IR-овский `agent_ref + overrides` компилировать так — overrides для
model/temperature/maxOutputTokens кладём в опции вызова, а overrides для instructions/tools —
в `context` по фиксированным ключам (`wf.instructions`, `wf.toolset`), а агент строится один раз
с dynamic-функциями, читающими эти ключи. Иначе придётся пересоздавать Agent на каждый узел.

## 2. Параметры вызова generateText / streamText / generateObject / streamObject

Источник: `<core>/dist/index.d.ts:9411-9580`, `ai@6.0.280` `dist/index.d.ts:384` (CallSettings).

Сигнатуры методов `Agent` (index.d.ts ~9564-9580):
```ts
generateText<OUTPUT extends OutputSpec = OutputSpec, TProviderOptions extends ProviderOptions = ProviderOptions>(
  input: string | UIMessage[] | BaseMessage[],
  options?: GenerateTextOptions<OUTPUT, TProviderOptions>
): Promise<GenerateTextResultWithContext<ToolSet, OUTPUT>>;

streamText<TProviderOptions>(input, options?: StreamTextOptions<TProviderOptions>): Promise<StreamTextResultWithContext>;

/** @deprecated — Use generateText with an output setting instead. */
generateObject<T extends z.ZodType>(input, schema: T, options?: GenerateObjectOptions): Promise<GenerateObjectResultWithContext<z.infer<T>>>;

/** @deprecated — Use streamText with an output setting instead. */
streamObject<T extends z.ZodType>(input, schema: T, options?: StreamObjectOptions): Promise<StreamObjectResultWithContext<z.infer<T>>>;
```

Все четыре опционных типа = `BaseGenerationOptions` (+ `onFinish` у стримовых, `resumableStream?: boolean` у streamText, `output?: OUTPUT` у generateText).

`interface BaseGenerationOptions extends Partial<CallSettings>` — ПОЛНЫЙ список полей:

Из ai@6 `CallSettings` (наследуется целиком):
`maxOutputTokens?`, `temperature?`, `topP?`, `topK?`, `presencePenalty?`, `frequencyPenalty?`,
`stopSequences?: string[]`, `seed?: number`, `maxRetries?: number`, `abortSignal?: AbortSignal`,
`timeout?: TimeoutConfiguration`, `headers?: Record<string,string|undefined>`.
(Внимание: `maxTokens` из v4/v5 больше нет — только `maxOutputTokens`. `headers` тут — провайдерские
HTTP-заголовки, НЕ то же самое, что `requestHeaders`.)

Собственные поля VoltAgent:
- `memory?: RuntimeMemoryEnvelope` — per-call идентичность памяти и override поведения (см. §5);
- `userId?`, `conversationId?` — **@deprecated**, использовать `memory.userId` / `memory.conversationId`;
- `context?: ContextInput` — вход для dynamic-резолва (§1) и для tool-контекста;
- `requestHeaders?: Record<string,string>` — то, что видят dynamic-функции как `headers`;
- `elicitation?: (request: unknown) => Promise<unknown>` — MCP elicitation;
- `parentAgentId?`, `parentOperationContext?: OperationContext`, `parentSpan?: Span`, `inheritParentSpan?: boolean` — сшивка трейсов;
- `contextLimit?`, `semanticMemory?`, `conversationPersistence?`, `messageMetadataPersistence?` — **@deprecated**, переехали в `memory.options.*`;
- `maxSteps?: number` — лимит шагов агентного цикла;
- `stopWhen?: StopWhen` — переопределяет дефолтный `stepCountIs(maxSteps)`; в доке предупреждение: «incorrect predicates can cause early termination or unbounded loops»;
- `prepareStep?: PrepareStep` — колбэк перед каждым шагом (менять toolChoice/доступные tools);
- `tools?: (Tool | Toolkit)[]` — **per-call подмена набора инструментов** (есть! в отличие от instructions);
- `toolRouting?: ToolRoutingConfig | false`;
- `toolChoice?: ToolChoice<Record<string, unknown>>`;
- `hooks?: AgentHooks`;
- `inputGuardrails?`, `outputGuardrails?`, `inputMiddlewares?`, `outputMiddlewares?`, `maxMiddlewareRetries?`;
- `providerOptions?: TProviderOptions` — провайдер-специфика; тип `ProviderOptions = LegacyProviderCallOptions & { anthropic?: AnthropicProviderOptions; google?: GoogleGenerativeAIProviderOptions; openai?: OpenAIResponsesProviderOptions; xai?: ...; [key: string]: unknown }` (index.d.ts ~8100);
- `output?: OutputSpec` (= `Output.Output<unknown, unknown>` из ai) — см. §3;
- `stop?: string | string[]`;
- `feedback?: boolean | AgentFeedbackOptions`.

### КРИТИЧНО для §7.3: `model` НЕЛЬЗЯ переопределить в опциях вызова
В `BaseGenerationOptions` поля `model` НЕТ (проверено чтением всего интерфейса, index.d.ts:9411-9492),
и в `CallSettings` его тоже нет. Точно так же нет `instructions`.
Значит per-call override модели/промпта делается ТОЛЬКО одним из двух способов:
1. `model: ({ context }) => ...` + `context` в вызове — рекомендуемый (см. §1);
2. создавать новый `Agent` под каждый набор настроек.
Наш компилятор должен выбрать (1) и зафиксировать соглашение о ключах context.
UNVERIFIED: в устном обсуждении встречается `options.model` — в 2.10 этого нет.

Что переопределяется напрямую: temperature, maxOutputTokens, topP, topK, seed, stopSequences,
maxRetries, abortSignal, timeout, maxSteps, stopWhen, tools, toolChoice, providerOptions, output,
hooks, guardrails, memory-envelope.

`abortSignal` есть → отмена узла/рана из планировщика реализуема штатно (см. также
`<core>/docs/agents/cancellation.md`).

## 3. Структурированный вывод в 2.10 — API

Источник: `<core>/docs/agents/overview.md:183-220`, `<core>/docs/getting-started/migration-guide.md:88-133`.

Дословно из overview.md: «Use `output` with `generateText`/`streamText` to get structured data while
still using tools and all agent capabilities. **`generateObject` and `streamObject` are deprecated in
VoltAgent 2.x**.»

```ts
import { Output } from "ai";          // ВАЖНО: Output импортируется из "ai", не из @voltagent/core
import { z } from "zod";

const recipeSchema = z.object({
  name: z.string(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  prepTime: z.number(),
});

// generateText — структурированный вывод + tool calling одновременно
const result = await agent.generateText("Create a pasta recipe", {
  output: Output.object({ schema: recipeSchema }),
});
result.output; // типизировано схемой

// streamText — стриминг частичных объектов
const stream = await agent.streamText("Create a detailed recipe", {
  output: Output.object({ schema: recipeSchema }),
});
for await (const partial of stream.partialOutputStream ?? []) { /* DeepPartial<T> */ }

// Ограниченная текстовая генерация
const haiku = await agent.generateText("Write a haiku about coding", { output: Output.text() });
```

Тип в VoltAgent: `type OutputSpec = Output.Output<unknown, unknown>` (index.d.ts:9345, 11154) —
то есть VoltAgent просто прокидывает ai-sdk-шный `Output` внутрь, своей обёртки над схемой нет.
Схема — Zod (peer `zod: ^3.25.0 || ^4.0.0`), в проекте стоит zod 4.6.2.

Главное преимущество `output` над старым `generateObject`: **инструменты продолжают работать**
(старый generateObject — одиночный вызов без agentic-цикла). Для наших узлов `llm.structured`
с tool-use это решающий аргумент.

UNVERIFIED (нужна проверка в runtime): использует ли `Output.object` строгий режим провайдера
(`strict: true` / json_schema response_format у OpenAI) или tool-based выдачу. В доках VoltAgent
про это ни слова; это поведение ai@6, а не VoltAgent. Подкрутить можно через
`providerOptions.openai` (`structuredOutputs`/`strictJsonSchema`) — точные ключи проверить в
`@ai-sdk/openai` перед тем как писать в документацию.
Практический вывод для нас: валидацию выхода узла всё равно делаем сами (Zod parse + repair-петля),
не полагаясь на провайдерский strict.

## 4. Model router: "provider/model", models.dev, произвольный LanguageModel

Источники: `<core>/docs/getting-started/model-router.md`, `<core>/docs/getting-started/providers-models.md`,
реализация `<core>/dist/index.js:4599-4623` (splitModelId), `:4648-4720` (loader/registry),
`:4812-4835` (resolve), реестр провайдеров `:~3400-4100` (STATIC_PROVIDER_REGISTRY).

### Формат строки и разбор
`splitModelId` (index.js:4599) режет по **первому** `/`; если слэша нет — по первому `:`.
```js
const slashIndex = trimmed.indexOf("/");
providerId = trimmed.slice(0, slashIndex);  // normalizeProviderId()
modelId    = trimmed.slice(slashIndex + 1); // ВЕСЬ остаток, слэши сохраняются
```
**Следствие, важное для нас:** `"openrouter/anthropic/claude-sonnet-4.5"` корректно разбирается в
providerId=`openrouter`, modelId=`anthropic/claude-sonnet-4.5`. Многосегментные id OpenRouter
работают из коробки, отдельный провайдер-пакет не нужен.

Тип `ModelRouterModelId` экспортируется для автокомплита:
```ts
import type { ModelRouterModelId } from "@voltagent/core";
const modelId: ModelRouterModelId = "openai/gpt-4o-mini";
```

### Реестр
Снимок сгенерирован из models.dev и **вшит в бандл** (`STATIC_PROVIDER_REGISTRY` прямо в
`dist/index.js`, отдельного файла `dist/registries/*.json` в пакете нет). Запись выглядит так
(index.js:3844, дословно):
```js
openrouter: {
  id: "openrouter",
  name: "OpenRouter",
  npm: "@ai-sdk/openai-compatible",
  api: "https://openrouter.ai/api/v1",
  env: ["OPENROUTER_API_KEY"],
  doc: "https://openrouter.ai/models"
},
```
То есть **OpenRouter — встроенный провайдер роутера**, и грузится он через
`@ai-sdk/openai-compatible` (а он peer-совместим с `ai@6`). Это снимает конфликт из заметки
ведущего: `@openrouter/ai-sdk-provider@3` (требует ai@7) нам НЕ нужен, чтобы ходить в OpenRouter.
Base URL переопределяется env-переменной: `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
(model-router.md, раздел Environment Variables). Тот же паттерн — для любого
openai-compatible провайдера, значит vLLM/локальный сервер закрывается либо своим entry в реестре,
либо прямым LanguageModel (ниже).

Провайдеры грузятся лениво: `createProviderLoader` делает `await import(config.npm)` и при
отсутствии пакета кидает
`Failed to load provider "<id>" from "<npm>". Install the package and try again.`
→ в наших Docker-образах пакеты провайдеров надо ставить явно, строка в реестре сама по себе
ничего не устанавливает. Отсутствие env-ключа тоже даёт явную ошибку со списком нужных переменных.

Auto-refresh: при `NODE_ENV !== "production"` реестр обновляется с models.dev **каждые 30 минут**
и пишет кэш на диск, в т.ч. в `node_modules/@voltagent/core/dist/registries`, если каталог
записываемый. **Риск для воспроизводимости и для read-only контейнеров** — в проде это выключено
(`ensureCacheLoaded` сразу резолвится при NODE_ENV=production, index.js:4690), но в dev два
одинаковых запуска могут резолвить модель по-разному. Для детерминизма кассет фиксируем
`NODE_ENV=production` либо не полагаемся на роутер в тестах.

### Произвольный LanguageModel (Together, vLLM, любой свой)
Два пути.

1) Прямо в агента (docs/getting-started/model-router.md, «When to Use ai-sdk Providers Directly»):
```ts
import { openai } from "@ai-sdk/openai";
const agent = new Agent({ name: "custom-provider", instructions: "...", model: openai("gpt-4o-mini") });
```
`AgentModelReference = LanguageModel | ModelRouterModelId` (index.d.ts:8059) — LanguageModel
из ai-sdk принимается везде, где принимается строка, включая dynamic-функцию.

2) Зарегистрировать свой провайдер в глобальном реестре (index.d.ts, `declare class ModelProviderRegistry`):
```ts
ModelProviderRegistry.getInstance().registerProvider(providerId: string, provider: ModelProviderEntry): void;
ModelProviderRegistry.getInstance().registerProviderLoader(providerId: string, loader: ModelProviderLoader): void;
ModelProviderRegistry.getInstance().unregisterProvider(providerId: string): void;
ModelProviderRegistry.getInstance().listProviders(): string[];
ModelProviderRegistry.getInstance().resolveLanguageModel(modelId: string): Promise<LanguageModel>;
ModelProviderRegistry.getInstance().resolveEmbeddingModel(modelId: string): Promise<EmbeddingModelInstance>;
ModelProviderRegistry.getInstance().refreshRegistry(force?: boolean): Promise<void>;
ModelProviderRegistry.getInstance().startAutoRefresh(intervalMs?: number) / stopAutoRefresh(): void;

type ModelProvider = { languageModel: LanguageModelFactory; embeddingModel?: EmbeddingModelFactory; /* + embedding/textEmbeddingModel/textEmbedding алиасы */ };
type LanguageModelFactory = (modelId: string) => LanguageModel;
type ModelProviderEntry = ModelProvider | LanguageModelFactory;
type ModelProviderLoader = () => Promise<ModelProviderEntry>;
```
Registry — **глобальный синглтон** (`globalThis.___voltagent_model_provider_registry`), как и
WorkflowRegistry. Значит наш «реестр моделей» из спеки — это тонкая обёртка: мы держим свой
каталог с ценами/лимитами/политиками, а физический резолв делегируем сюда через
`registerProvider("vllm-internal", (id) => createOpenAICompatible({...})(id))`.
Мультитенантность: один процесс = один набор провайдеров, per-tenant base URL/ключи нельзя
положить в реестр — их надо разруливать фабрикой LanguageModel внутри dynamic `model` по context.

**Вывод под §7.3:** реестр моделей сами не пишем, но пишем тонкий адаптер поверх
`ModelProviderRegistry` + собственный каталог метаданных (цена/контекст/поддержка tools),
потому что VoltAgent из моделей отдаёт только фабрику, а не характеристики.

## 6. Retries и fallback-модели

Источник: `<core>/docs/agents/retries-fallback.md` (203 строки), тип `AgentModelConfig` — index.d.ts:8063.

### Retry одной модели
- `maxRetries` — число ПОВТОРОВ одного вызова модели: «total attempts = maxRetries + 1».
- Приоритет (дословно): per-call `maxRetries` > per-model `maxRetries` > agent `maxRetries` > **дефолт 3**.
- `0` выключает ретраи для вызова.
- Бэкофф экспоненциальный, зафиксирован в доке: **1s, 2s, 4s, 8s, max 10s**. Настроек джиттера/базы нет.
- Ошибки с `isRetryable: false` ретраи пропускают, но fallback всё ещё может сработать.

### Список фолбэк-моделей
`model` принимает массив `AgentModelConfig[]`:
```ts
type AgentModelConfig = {
  id?: string;                                   // стабильный идентификатор для логов
  model: ModelDynamicValue<AgentModelReference>; // строка, LanguageModel ИЛИ функция от context
  maxRetries?: number;                           // по умолчанию — agent.maxRetries
  enabled?: boolean;                             // default true
};

const agent = new Agent({
  name: "FallbackAgent",
  instructions: "Be concise.",
  model: [
    { id: "primary",   model: "openai/gpt-4o-mini",               maxRetries: 2 },
    { id: "secondary", model: anthropic("claude-3-5-sonnet"),     maxRetries: 1 },
    { id: "tertiary",  model: "google/gemini-2.0-flash",          enabled: true },
  ],
});
```
Порядок: первый `enabled` — primary. Алгоритм: резолв модели (в т.ч. динамический) → вызов с
ретраями → исчерпали ретраи → следующая модель. Элемент списка тоже может быть функцией от
`context` (сценарий data residency в доке) — то есть fallback-список и dynamic-model совместимы.

### Где fallback НЕ срабатывает (дословный список из доки)
- abort / bail errors;
- блокировки guardrail;
- ошибки исполнения инструментов (tool execution errors).

### Стриминг
«Retries and fallback happen only if the stream fails **before the first output chunk**.»
После первого чанка ошибка пробрасывается наружу, стрим не перезапускается.
→ Для наших узлов это значит: автоматический fallback надёжен только для non-stream вызовов;
для стриминга нужен наш собственный retry на уровне узла (перезапуск шага целиком).

### Middleware retries — отдельный механизм
`abort("reason", { retry: true })` из middleware перезапускает ВЕСЬ attempt: middleware, guardrails,
hooks, выбор модели, ретраи модели, fallback. Лимит — `maxMiddlewareRetries` (агент или per-call).
В стриминге ретрай могут вызвать только input-middlewares и только до старта стрима.
→ Это готовая точка для нашей «repair-петли» по невалидному структурированному выводу:
output-middleware/guardrail видит провал Zod-парсинга и просит перезапуск. Но ТОЛЬКО для non-stream.

### Ошибки и хуки
- Все модели disabled → бросается `MODEL_LIST_EMPTY`.
- Есть хуки `onRetry` (`OnRetryHookArgs` = `OnRetryLLMHookArgs | OnRetryMiddlewareHookArgs`, есть
  `RetrySource`) и `onFallback` (`AgentHookOnFallback`, `OnFallbackHookArgs`, тип `FallbackStage`)
  — экспортируются из @voltagent/core. Это наши точки для провенанса «какая модель реально
  ответила» и для счётчика бюджета. UNVERIFIED: точные поля аргументов этих хуков не вычитывал.

**Вывод под §7.3:** политику фолбэков не пишем сами — описываем в IR список моделей и мапим 1:1 в
`AgentModelConfig[]`. Своё нужно добавить только там, где VoltAgent молчит: бюджет/стоимость,
fallback на стриминге, и ретрай по «валидный ответ, но не прошёл схему».

## 5. Память: адаптеры, scope, working memory, semantic search, суммаризация, риски утечки

Источники: `<core>/docs/agents/memory.md`, `<core>/docs/agents/memory/{overview,working-memory,semantic-search}.md`,
`<core>/docs/agents/summarization.md`, типы index.d.ts:1780-1812, 8582-8600.

### Адаптеры (таблица из memory/overview.md, дословно)
| Provider | Пакет | Персистентность | Назначение |
|---|---|---|---|
| InMemory | `@voltagent/core` | нет (RAM) | dev/тесты |
| Managed Memory | `@voltagent/voltagent-memory` | хостится VoltOps | «zero-setup», внешняя зависимость |
| LibSQL | `@voltagent/libsql` | локальный SQLite или remote | self-hosted, edge |
| Cloudflare D1 | `@voltagent/cloudflare-d1` | D1 (SQLite) | Workers |
| Postgres | `@voltagent/postgres` (2.1.3) | свой Postgres | наш выбор |
| Supabase | `@voltagent/supabase` | Supabase | |

```ts
const memory = new Memory({
  storage: new LibSQLMemoryAdapter({ url: "file:./.voltagent/memory.db" }),
  embedding?: EmbeddingAdapterInput,   // адаптер ИЛИ строка "openai/text-embedding-3-small"
  vector?: VectorAdapter,
  enableCache?: boolean,               // кэш эмбеддингов, default false
  generateTitle?: boolean | ConversationTitleConfig,
});
```
`memory: false` на агенте — полностью stateless. Если `memory` не указана — **по умолчанию
подключается встроенная in-memory storage** (то есть агент НЕ stateless by default; для наших
чистых узлов надо явно писать `memory: false`).
Приоритет: agent `memory` > `agentMemory` > глобальная `memory` > встроенная in-memory
(отдельно для workflows: workflow `memory` > `workflowMemory` > `memory` > built-in).

### Scope: userId / conversationId
Per-call, через envelope (index.d.ts:8582):
```ts
interface CommonRuntimeMemoryEnvelope {
  conversationId?: string;
  userId?: string;
  options?: {
    contextLimit?: number;
    semanticMemory?: { enabled?: boolean; semanticLimit?: number; semanticThreshold?: number; mergeStrategy?: "prepend"|"append"|"interleave" };
    conversationPersistence?: AgentConversationPersistenceOptions;  // { mode: "step"|"finish", debounceMs, flushOnToolResult }
    messageMetadataPersistence?: boolean | AgentMessageMetadataPersistenceOptions;
    readOnly?: boolean;   // читать можно, писать нельзя
  };
}
await agent.generateText("...", { memory: { userId: "user-123", conversationId: "thread-abc" } });
```
Поведение (overview.md:189-193, дословно):
- оба переданы → история конкретного треда;
- только `userId` → **новый conversationId генерируется на каждый вызов** (каждый раз чистый контекст);
- ничего не передано → **default user ID + новый conversationId**.

**Риск №1 (утечка между пользователями).** «Default user ID» — общий на процесс. Если наш
исполнитель узла забудет прокинуть `memory.userId`, записи разных тенантов попадут под один
дефолтный userId. Плюс агент по умолчанию НЕ stateless. Митигация в компиляторе: для каждого
LLM-узла либо `memory: false`, либо обязательный явный envelope; отсутствие userId при
включённой памяти — ошибка компиляции, не рантайм-дефолт.

**Риск №2 (тенанты).** Отдельного `tenantId` в API памяти НЕТ. Официальный рецепт (overview.md:320-365)
— свой адаптер, читающий `tenantId` из `OperationContext` и склеивающий ключ:
```ts
class TenantMemoryAdapter extends InMemoryStorageAdapter {
  async getMessages(userId: string, conversationId: string, options?: GetMessagesOptions, context?: OperationContext) {
    const tenantId = context?.context.get("tenantId") as string;
    if (!tenantId) throw new Error("Tenant ID required");
    return super.getMessages(`${tenantId}:${userId}`, conversationId, options, context);
  }
}
await agent.generateText("Query", { memory: { userId: "user-123" }, context: { tenantId: "company-abc" } });
```
То есть изоляция тенантов — **наша ответственность**, фреймворк её не гарантирует. Обязательно
перекрывать ВСЕ методы адаптера (getMessages/addMessage/working memory/…), иначе дыра в одном методе.
Аргумент `context?: OperationContext` прокидывается в методы адаптера — на этом и строим.

Наш mapping scope из спеки:
- `run` → `memory: false` либо `conversationId = runId` + `readOnly` там, где узел не должен писать;
- `user` → `userId` = внешний ID пользователя, `conversationId` = тред;
- `tenant` → префикс в userId через собственный адаптер (см. выше) + RLS/схема в Postgres как второй рубеж.

### Working Memory (memory/working-memory.md, index.d.ts:1780)
```ts
type WorkingMemoryScope = "conversation" | "user";      // default "conversation"
type WorkingMemoryConfig = { enabled: boolean; scope?: WorkingMemoryScope }
  & ({ template: string; schema?: never } | { schema: z.ZodObject<any>; template?: never } | { template?: never; schema?: never });
```
Три формата: Markdown-шаблон, JSON-схема на Zod, свободная форма. Агент автоматически получает
инструменты `get_working_memory`, `update_working_memory`, `clear_working_memory`.
При `memory.options.readOnly: true` на вызове остаётся **только** `get_working_memory`, записи
пропускаются — удобный «сухой прогон» узла.
**Риск:** `scope: "user"` означает общий блок памяти на пользователя между всеми разговорами и
всеми агентами, использующими эту Memory. Для многошаговых воркфлоу это скрытый канал передачи
данных между ранами. Дефолт `conversation` безопаснее; `user` — только явным решением автора.

### Semantic search (memory/semantic-search.md)
Требует `embedding` + `vector` адаптеры. Сообщения эмбеддятся при сохранении автоматически.
Параметры и дефолты (дословно из доки):
```ts
memory: { userId, conversationId, options: { semanticMemory: {
  enabled: true,
  semanticLimit: 5,        // default 5
  semanticThreshold: 0.7,  // default 0.7
  mergeStrategy: "append", // default "append" — сначала recent, потом similar
}}}
```
`mergeStrategy: "prepend" | "append" | "interleave"`.
**Риск:** поиск идёт по векторному индексу; если наш кастомный tenant-адаптер не покрывает
vector-часть, семантика может вытащить чужие сообщения мимо изоляции по userId.
UNVERIFIED: фильтрует ли встроенный vector search по userId/conversationId автоматически — надо
проверить в коде адаптера `@voltagent/postgres` перед тем как включать семантику в мультитенанте.

### Суммаризация
Конфигурируется опцией `summarization?: AgentSummarizationOptions | false` на агенте
(index.d.ts:8406). Дословно из overview.md: «Summarization inserts a system summary and keeps the
last N non-system messages before each model call.» Детали — `<core>/docs/agents/summarization.md`.
TODO: точные поля `AgentSummarizationOptions` не вычитаны.

### Персистентность шагов (важно для нашего провенанса)
`conversationPersistence.mode: "step"` — ДЕФОЛТ: чекпоинт на каждом шаге, `flushOnToolResult: true`
(события `tool-result`/`tool-error` флашат немедленно), `debounceMs` ~200. Альтернатива — `"finish"`.
Шаги пишутся с метаданными (operationId, agent/sub-agent IDs, usage, аргументы и результаты
инструментов) — это готовый источник для нашей «ленты исполнения», но только если адаптер
поддерживает step API (иначе предупреждение «Conversation steps are not supported by this memory adapter»).

## 7. Sub-agents и delegation — брать или собирать самим

Источник: `<core>/docs/agents/subagents.md` (977 строк).

### Что даёт фреймворк
```ts
const supervisor = new Agent({
  name: "Supervisor",
  instructions: "Coordinates ...",
  model: "openai/gpt-4o-mini",
  subAgents: [contentCreatorAgent, formatterAgent],
  supervisorConfig: {
    customGuidelines: ["..."],      // добавка к автогенерируемым правилам
    includeAgentsMemory: true,      // default true — подмешивает прошлые диалоги сабагентов в промпт супервизора
    // + fullStreamEventForwarding
  },
  maxSteps: 20,                     // наследуется всеми сабагентами
});
supervisor.addSubAgent(agent);      // динамически
supervisor.removeSubAgent(agentId);
```
Супервизору автоматически добавляется инструмент **`delegate_task`**:
- параметры: `task: string` (обяз.), `targetAgents: string[]` (обяз., можно несколько сразу),
  `context?: object`;
- внутри вызывает `handoffTask` / `handoffToMultiple`, прокидывает `parentAgentId` и
  `parentHistoryEntryId` для observability, помечает сообщения сабагента метаданными, чтобы чтение
  памяти супервизора их исключало;
- **всегда** возвращает массив:
```ts
[{ agentName: string; response: string; usage?: UsageInfo; bailed?: boolean }, ...]
```
`bailed: true` (из хука `onHandoffComplete` вызвали `bail()`) немедленно завершает супервизора и
отдаёт ответ сабагента пользователю.

`purpose` vs `instructions`: супервизор перечисляет сабагентов в блоке `<specialized_agents>`,
беря `purpose`; если его нет — подставляет ВЕСЬ `instructions`, если нет и его — строку
`"Dynamic instructions"`. Практическое: без `purpose` промпт супервизора раздувается.

Способ исполнения сабагента настраивается `createSubagent`:
```ts
import { createSubagent } from "@voltagent/core";
createSubagent({ agent: analyzer, method: "generateObject", schema: AnalysisSchema, options: { temperature: 0.1 } });
```
Методы: `streamText` (default), `generateText`, `generateObject`, `streamObject`.
(Заметить противоречие: generateObject/streamObject на самом Agent помечены @deprecated, но
в API сабагентов всё ещё фигурируют как поддерживаемые методы — UNVERIFIED, надо проверить
`SubAgentMethod`/`GenerateObjectSubAgentConfig` в d.ts, там эти типы есть и не помечены deprecated.)

Forwarding событий сабагента в родительский стрим по умолчанию: только `tool-call` и `tool-result`.
`text-delta`, `reasoning-*`, `source`, `error`, `finish` — **НЕ** пробрасываются (настраивается
`supervisorConfig.fullStreamEventForwarding`). Для нашего UI «живая лента» это существенно: без
настройки мы не увидим текст, который генерирует сабагент.

Хуки для отладки/провенанса: `onHandoff`, `onHandoffComplete` (типы `AgentHookOnHandoff`,
`AgentHookOnHandoffComplete`, `OnHandoffHookArgs`, `OnHandoffCompleteHookArgs`).

### Вердикт: нам это НЕ нужно как механизм оркестрации
1. Маршрутизация у subagents **недетерминированная** — решает LLM супервизора. Наш продукт —
   типизированные многошаговые воркфлоу с детерминированным графом; ветвление у нас задаёт
   компилятор (`andBranch`, `andWhen`), а не модель.
2. Топология фиксирована конструктором супервизора; наш IR должен уметь менять граф на лету —
   это workflow-уровень (`WorkflowRegistry`, см. заметку ведущего), а не agent-уровень.
3. Провенанс: у `delegate_task` результат — плоский `{ agentName, response: string }`. Нам нужны
   типизированные выходы узлов со схемами, а не строка.
4. `includeAgentsMemory: true` по умолчанию подмешивает историю сабагентов в промпт супервизора —
   неявный канал переноса данных, плохо сочетается с нашим требованием контролируемых входов узла.

**Берём из subagents только точечно:** `createSubagent` + `delegate_task` как *реализацию узла
типа «агент с правом выбирать исполнителя»* (роутинг силами LLM, когда автор воркфлоу этого
осознанно хочет), и хуки `onHandoff*` для трассировки. Оркестрацию строим на workflow-примитивах.

## Выводы под §7.3 (агент = набор настроек + переопределение на вызове)

1. **Переопределяемое на вызове напрямую** (`BaseGenerationOptions`): temperature, maxOutputTokens,
   topP, topK, presencePenalty, frequencyPenalty, stopSequences, seed, maxRetries, abortSignal,
   timeout, headers, maxSteps, stopWhen, prepareStep, tools, toolChoice, toolRouting,
   providerOptions, output, hooks, guardrails, middlewares, maxMiddlewareRetries,
   memory-envelope (userId/conversationId/readOnly/contextLimit/semanticMemory), context,
   requestHeaders, feedback, parentSpan.
2. **НЕ переопределяемое напрямую**: `model` и `instructions`. Только через dynamic-функции от
   `context` (§1) либо созданием нового Agent. Это главный архитектурный вывод раздела.
3. Поэтому наш «реестр агентов» держит: базовые настройки агента (id, purpose, memory, guardrails,
   hooks, fallback-список) + контракт ключей `context`, через которые компилятор подсовывает
   overrides для model/instructions/tools.
4. `generateObject`/`streamObject` — deprecated; единый путь `generateText/streamText` + `Output.object`.
5. Fallback-модели описываем в IR как `AgentModelConfig[]` и отдаём VoltAgent; своё добавляем
   только для стриминга (fallback там не работает после первого чанка) и для «схема не сошлась».
6. Память по умолчанию ВКЛЮЧЕНА (in-memory). Для чистых узлов ставим `memory: false` явно.
   Изоляция тенантов — на нас (кастомный адаптер + OperationContext), фреймворк её не даёт.

### Открытые TODO для следующего захода
- `AgentSummarizationOptions` — точные поля (docs/agents/summarization.md).
- Поля `OnRetryHookArgs` / `OnFallbackHookArgs` / `FallbackStage`.
- Фильтрует ли встроенный semantic search по userId (код `@voltagent/postgres`).
- `Output.object` → strict-режим провайдера (json_schema) или tool-mode: проверить в ai@6/@ai-sdk/openai.
- `SubAgentMethod` vs deprecated generateObject — противоречие в доках.

## Дополнение: закрытые TODO (типы из dist/index.d.ts)

### AgentSummarizationOptions — точные поля
```ts
type AgentSummarizationOptions = {
  enabled?: boolean;
  triggerTokens?: number;   // порог в токенах, после которого включается суммаризация
  keepMessages?: number;    // сколько последних non-system сообщений сохранить как есть
  maxOutputTokens?: number; // бюджет самого саммари
  systemPrompt?: string | null;
  model?: AgentModelValue;  // можно дешёвую отдельную модель, в т.ч. fallback-список
};
```
На агенте: `summarization?: AgentSummarizationOptions | false`.
Механика (overview.md): вставляет system-саммари и оставляет последние N non-system сообщений
**перед каждым вызовом модели**. Триггер — по токенам, не по числу сообщений.
Замечание для нас: суммаризация — ещё один недетерминированный LLM-вызов внутри узла (лишние
токены и лишняя точка отказа, не видимая в графе). Для воспроизводимых прогонов держать `false`
и управлять контекстом явно через `contextLimit`.

### Хуки fallback/retry — полные сигнатуры аргументов
```ts
type FallbackStage = "resolve" | "execute";
interface OnFallbackHookArgs {
  agent: Agent;
  context: OperationContext;
  operation: AgentEvalOperationType;  // "generateText"|"generateTitle"|"streamText"|"generateObject"|"streamObject"|"workflow"
  stage: FallbackStage;               // упал резолв модели или сам вызов
  fromModel: string;
  fromModelIndex: number;
  maxRetries: number;
  attempt?: number;
  error: unknown;
  nextModel?: string | null;
  nextModelIndex?: number;
}
type RetrySource = "llm" | "middleware";
interface OnRetryHookArgsBase { agent: Agent; context: OperationContext; operation: AgentEvalOperationType; source: RetrySource; }
// OnRetryHookArgs = OnRetryLLMHookArgs | OnRetryMiddlewareHookArgs
```
Это ровно тот набор, который нужен нашему провенансу: по `onFallback` пишем в ленту узла
«модель A → модель B, причина», по `onRetry` — счётчик попыток с различением llm/middleware.
`context: OperationContext` даёт доступ к `context.context` (наш Map), `context.logger` и трейсу —
можно связать событие с конкретным узлом воркфлоу.

### Semantic search и изоляция — ПРОВЕРЕНО ПО КОДУ
`<core>/dist/index.js:5491-5518`, `Memory.getMessagesWithSemanticSearch`:
```js
const semanticResults = await this.vector.search(queryVector, {
  limit: options?.semanticLimit ?? 5,
  filter: { userId, conversationId },      // <-- фильтр по обоим ключам передаётся в векторный адаптер
  threshold: options?.semanticThreshold
});
const messageIds = semanticResults.map(r => r.metadata?.messageId).filter(Boolean);
const semanticMessages = await this.getMessagesByIds(userId, conversationId, messageIds);
return this.mergeMessages(recentMessages, semanticMessages, options?.mergeStrategy ?? "append");
```
Выводы:
1. Фильтр `{ userId, conversationId }` **передаётся** в `vector.search`, и вдобавок идёт второй
   рубеж — `getMessagesByIds(userId, conversationId, ...)`. То есть при корректном адаптере утечки
   между пользователями нет. TODO-пункт из §5 закрыт частично.
2. НО фильтрация фактически исполняется **внутри VectorAdapter** — это контракт, а не гарантия.
   Свой/сторонний vector-адаптер, игнорирующий `filter`, всё равно отсекается вторым запросом
   `getMessagesByIds`, но векторный поиск при этом «увидит» чужие эмбеддинги (утечка через
   тайминги/сам факт попаданий — маловероятна, но для аудита отметить).
3. Семантика ограничена ОДНИМ `conversationId` — кросс-тредового поиска по пользователю здесь нет.
   Если в §7.3 нужен «поиск по всей истории пользователя», это не покрывается штатной памятью,
   нужен наш retriever (`retriever?: BaseRetriever` на агенте) поверх своего индекса.
4. При падении семантики код молча логирует warn и возвращает только recent-сообщения
   (`console.warn("Semantic search failed, returning recent messages only:")`) — тихая деградация
   качества без ошибки. Для нашего исполнителя это надо превращать в событие в ленте узла.
