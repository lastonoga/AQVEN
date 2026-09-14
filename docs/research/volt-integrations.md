# Периферия VoltAgent, которую берём готовой (research draft)

Версии установленных пакетов (probe/node_modules, проверено `cat package.json`):
- @voltagent/core 2.10.0
- @voltagent/server-hono 2.0.14, @voltagent/server-core 2.1.20
- @voltagent/mcp-server 2.2.0
- @voltagent/a2a-server 2.0.3
- @voltagent/evals 2.0.5, @voltagent/scorers 2.1.0
- @voltagent/libsql 2.1.2, @voltagent/postgres 2.1.3, @voltagent/logger 2.0.2
- @voltagent/resumable-streams 2.0.2, @voltagent/sdk 2.0.3, @voltagent/internal 1.0.3

## 1. Тулы: createTool, Zod, ошибки, MCPConfiguration

### createTool — реальная сигнатура
`node_modules/@voltagent/core/dist/index.d.ts:645`
```ts
declare function createTool<T extends ToolSchema>(options: ToolOptions<T, undefined>): Tool<T, undefined>;
declare function createTool<T extends ToolSchema, O extends ToolSchema>(options: ToolOptions<T, O>): Tool<T, O>;
declare const tool: typeof createTool;   // алиас
```
`ToolSchema` = Zod-схема (в 2.10 — zod v4 совместимо, в docs примеры `import { z } from "zod"`).

`ToolOptions` (там же, ~строки 480-570) — полный список полей, всё что нам нужно уже есть:
- `id?`, `name`, `description`, `parameters: T` (Zod)
- `outputSchema?: O` — **валидация выхода тула** (есть из коробки, свой валидатор не пишем)
- `tags?: string[]` — используется хуками для политик (см. ниже)
- `needsApproval?: boolean | ToolNeedsApprovalFunction<z.infer<T>>` — **human-in-the-loop из коробки**, можно динамически по аргументам
- `providerOptions?` — напр. `{ anthropic: { cacheControl: { type: 'ephemeral' } } }`
- `mcp?: MCPToolProperties` — аннотации при экспозиции через `@voltagent/mcp-server`
- `toModelOutput?: ({output}) => ToolResultOutput` — мультимодальный возврат (text/json/error-text/content с media)
- `execute?: (args, options?: ToolExecuteOptions) => ToolExecutionResult<...>`
- `hooks?: ToolHooks`

`ToolExecutionResult<T> = PromiseLike<T> | AsyncIterable<T> | T` (d.ts:393) — **тул может стримить**: возвращаем AsyncIterable, последнее значение = финальное. Это закрывает наш кейс «долгий узел с прогрессом».

`ToolExecuteOptions = Partial<OperationContext> & { toolContext?, abortController?, [key:string]: any }` (d.ts:848). Внутри доступны `options.context` (Map), `options.userId`, `options.conversationId`, `options.operationId`, `options.logger` (operation-scoped), `options.abortSignal`. Источник: `docs/tools/overview.md`, `docs/agents/tools.md:284`.

### Ошибки тула
1. Базовый контракт — просто `throw new Error(...)`; текст уходит модели (`docs/agents/tools.md:1011`).
2. `ToolErrorInfo` (d.ts:8703): `{ toolCallId, toolName, toolExecutionError?, toolArguments? }` — приезжает в `VoltAgentError.toolError`, т.е. мы можем различить «упал тул» vs «упала модель» без своих обёрток.
3. `ToolDeniedError` — **останавливает всю операцию агента**, бросается из хука `onToolStart`. Коды: `TOOL_ERROR | TOOL_FORBIDDEN | TOOL_PLAN_REQUIRED | TOOL_QUOTA_EXCEEDED` + кастомные; есть `httpStatus`. Ловится `isToolDeniedError(err)`. (`docs/agents/tools.md:814`). Это готовый механизм для наших политик «узел X запрещён в этом окружении» — свой не пишем.
4. `ToolHooks` (d.ts:414): `{ onStart({tool,args,options}), onEnd({tool,args,output,error,options}) => { output? } }` — **onEnd может подменить output**. Плюс агентские хуки `onToolStart/onToolEnd/onToolError` (`AgentHookOnToolError`, `OnToolEndHookResult`). Здесь же — точка для маскирования PII на уровне тула.
5. Таймауты — своим `AbortController`, слушая `options.abortController.signal` (`docs/agents/tools.md:1026`). Готового `timeoutMs` в ToolOptions НЕТ — это наш код (мелочь).

### MCPConfiguration (клиент к чужим MCP-серверам)
d.ts:13935 — `type MCPServerConfig = HTTPServerConfig | SSEServerConfig | StreamableHTTPServerConfig | StdioServerConfig`:
- `{ type: "http", url, requestInit?, eventSourceInit?, timeout? }` — пробует streamable HTTP, **автофоллбэк на SSE**
- `{ type: "sse", url, requestInit?, eventSourceInit?, timeout? }`
- `{ type: "streamable-http", url, requestInit?, sessionId?, timeout? }` — без фоллбэка
- `{ type: "stdio", command, args?, env?, cwd?, timeout? }`

`class MCPConfiguration<TServerKeys extends string>` (d.ts:14306), методы:
```ts
constructor(options: MCPConfigurationOptions<TServerKeys>)   // { servers: Record<key, MCPServerConfig>, authorization?: MCPAuthorizationConfig }
getTools(authContext?: MCPAuthorizationContext): Promise<Tool<any>[]>   // плоский список, готов для agent.tools
getToolsets(): Promise<Record<TServerKeys, ToolsetWithTools>>           // сгруппировано по серверу
getRawTools(): Promise<Record<string, AnyToolConfig>>
getRawToolsets(): Promise<Record<TServerKeys, Record<string, AnyToolConfig>>>
getClient(serverName): Promise<MCPClient | undefined>
getClients(): Promise<Record<TServerKeys, MCPClient>>
disconnect(): Promise<void>
```
Авторизация тулов чужого MCP — встроена: `MCPAuthorizationConfig` с функцией `can(params: MCPCanParams): MCPCanResult`, ошибка `MCPAuthorizationError`, экшены `MCPAuthorizationAction`. Док: `docs/agents/mcp/authorization.md`. Фильтрация происходит внутри `getTools(authContext)`.
Адаптеры для расширенных фич MCP-клиента (d.ts ~14390+): `MCPLoggingAdapter`, `MCPPromptsAdapter`, `MCPResourcesAdapter` (listResources/readResource/listResourceTemplates/subscribe), `MCPElicitationAdapter` (`sendRequest`) — т.е. elicitation и resources поддержаны.

**Вывод по 1:** свой слой тулов не нужен вообще. Берём `createTool` + `outputSchema` + `needsApproval` + `ToolHooks`/`ToolDeniedError` для политик, `MCPConfiguration` для внешних MCP. Наш код — только адаптер «узел IR -> Tool».

## 2. @voltagent/mcp-server 2.2.0 — воркфлоу как MCP-тулы

**Ключевой факт: воркфлоу автоматически становятся MCP-тулами. Своего MCP-моста писать не надо.**

`MCPServerConfig` (`node_modules/@voltagent/mcp-server/dist/index.d.ts:159`):
```ts
interface MCPServerConfig {
  id?: string; name: string; version: string; description?: string;
  protocols?: ProtocolConfig;                       // { stdio, http, sse } — по умолчанию ВСЕ включены
  httpTransportOptions?: MCPStreamableHTTPTransportOptions;
  filterTools?:     FilterFunction<Tool<any,any>>;
  filterAgents?:    FilterFunction<Agent>;
  filterWorkflows?: FilterFunction<WorkflowSummary>;
  capabilities?: MCPServerCapabilitiesConfig;
  agents?:    Record<string, Agent>;                // MCP-only дополнения (не регистрируются в VoltAgent)
  workflows?: Record<string, MCPWorkflowConfigEntry>;
  tools?:     Record<string, Tool<any,any>>;
  releaseDate?: string; packages?: MCPServerPackageInfo[]; remotes?: MCPServerRemoteInfo[];
  adapters?: MCPServerDynamicAdapters;              // { logging, prompts, resources, elicitation }
}
type MCPWorkflowConfigEntry = RegisteredWorkflow | Workflow<any,any,any,any> | { toWorkflow(): Workflow<...> };
```

Подключение (`docs/agents/mcp/mcp-server.md:33-95`):
```ts
import { MCPServer } from "@voltagent/mcp-server";
export const mcpServer = new MCPServer({ name: "voltagent-example", version: "0.1.0" });

new VoltAgent({
  agents: { assistant },
  workflows: { expenseApprovalWorkflow },
  mcpServers: { mcpServer },          // <- отдельное поле
  server: honoServer({ port: 3141 }),
});
```

### Что именно экспонируется (dist/index.js:1971-2026 — читал реализацию)
Для каждого зарегистрированного объекта генерируется MCP-тул с именем:
- tool -> `sanitize(tool.name || tool.id)`, фоллбэк `voltagent_tool`
- agent -> `agent_${agent.id}`, фоллбэк `voltagent_agent`
- workflow -> **`workflow_${workflow.id}`** (run), фоллбэк `voltagent_workflow`
- **плюс второй тул `workflow_${id}_resume`** (фоллбэк `voltagent_workflow_resume`)

Resume-тул строится из `workflow.resumeSchema` (`toResumeTool`, dist/index.js:641):
```jsonc
// inputSchema
{ "type":"object",
  "required":["executionId"],
  "additionalProperties": false,
  "properties": {
    "executionId": {"type":"string"},
    "resumeData": { /* JSON Schema из workflow.resumeSchema, иначе свободный object */ },
    "stepId": {"type":"string"}   // опционально — возобновить с конкретного шага
  }}
// _meta: { workflowId, toolKind: "workflow_resume", toolType: "workflow_resume" }
```
Исполнение resume идёт через `deps.workflowRegistry.resumeSuspendedWorkflow(workflowId, executionId, resumeData, stepId)`.
=> **Suspend/resume воркфлоу доступен через MCP из коробки** — это ровно наш сценарий «Claude запускает, воркфлоу приостанавливается, Claude отдаёт данные и продолжает».

### Транспорты и URL
- Streamable HTTP: `POST /mcp/{serverId}/mcp`
- SSE: `GET /mcp/{serverId}/sse` + `POST /mcp/{serverId}/messages`
- stdio: процесс спавнится клиентом
- Реестр серверов: `GET /mcp/servers` -> `{ servers: [{id,name,version}] }`
`serverId` = нормализованный `name` (lowercase, пробелы заменены, при коллизии числовой суффикс).
Источник: `docs/agents/mcp/mcp-server.md:96-160`.

Для Claude Desktop/Code практичнее `protocols: { stdio: true, http: false, sse: false }`; для нашего продукта — streamable-http (ремоут).

### Прочее из экспорта пакета
`AgentAdapter`, `ToolAdapter`, `WorkflowAdapter` (с `toMcpTool`/`executeWorkflow`/`toResumeTool`/`resumeWorkflow`), `StdioTransport`, `ExternalSseTransport`, `TransportRegistry`/`transportRegistry`, `PromptBridge`, `ResourceBridge`, `composeFilters`, `passthroughFilter`, `createStubOperationContext`.
`composeFilters` — пригодится, чтобы склеить наш RBAC-фильтр с фильтром по тегам.

**Подводные камни:**
- UNVERIFIED: как именно пробрасывается auth-контекст (заголовки) внутрь `filterWorkflows` — в типах есть `FilterContext`/`FilterParams`, надо проверить перед реализацией мультитенантности.
- MCP-only записи (`agents`/`workflows`/`tools` в конфиге сервера) НЕ регистрируются в основном VoltAgent -> не видны в REST API. Для нас плохо: единый реестр лучше держать в VoltAgent, а не в MCP-конфиге.

## 3. @voltagent/server-hono 2.0.14 (+ server-core 2.1.20): endpoints, auth, свои роуты

Пакеты уже стоят в probe/node_modules. Все пути извлечены grep'ом по `dist/index.js` server-core (реальные OpenAPI-роуты, не из доков).

### Воркфлоу — полный жизненный цикл ЕСТЬ из коробки
```
GET    /workflows
GET    /workflows/:id
POST   /workflows/:id/execute
POST   /workflows/:id/stream                                  (SSE)
GET    /workflows/executions
POST   /workflows/:id/executions/:executionId/suspend
POST   /workflows/:id/executions/:executionId/resume
POST   /workflows/:id/executions/:executionId/cancel
POST   /workflows/:id/executions/:executionId/replay          <-- реплей исполнения, важно для отладки
GET    /workflows/:id/executions/:executionId/state
GET    /workflows/:id/executions/:executionId/stream
```
**Свой execution-API писать не нужно.** `replay` — прямая поддержка нашего «отладить и починить».

### Агенты
```
GET  /agents ; GET /agents/:id ; GET /agents/:id/history
POST /agents/:id/text | /stream | /object | /stream-object | /chat
GET  /agents/:id/chat/:conversationId/stream                 (resumable stream)
GET  /agents/:id/workspace | /workspace/ls | /workspace/read | /workspace/skills | /workspace/skills/:skillId
```

### Тулы, MCP, A2A, память, обзёрвабилити, апдейты
```
GET  /tools ; POST /tools/:name/execute
GET  /mcp/servers ; /mcp/servers/:serverId ; .../tools ; .../tools/:toolName ; .../prompts[/:promptName]
     .../resources ; .../resources/contents ; .../resource-templates ; POST .../logging/level
GET  /.well-known/:serverId/agent-card.json ; POST /a2a/:serverId
     /api/memory/conversations[/:id][/messages|/working-memory|/clone] ; /api/memory/search ; /save-messages ; /messages/delete
     /observability/traces[/:traceId][/logs] ; /observability/spans/:spanId[/logs] ; /observability/status ; /observability/logs
     /observability/memory/{conversations,users,working-memory} ; POST /setup-observability
GET  /api/logs ; /updates ; /updates/:packageName
```
ВАЖНО: **отдельного `/health` НЕТ** — его добавляем сами через `configureApp` (в доке именно такой пример).
Есть WebSocket-слой (`createWebSocketServer`, `setupWebSocketUpgrade`, `WebSocketRouter`, `handleObservabilityConnection`) и лендинг-страница + Swagger UI (`enableSwaggerUI`).

### HonoServerConfig (`server-hono/dist/index.d.ts:398`)
```ts
interface HonoServerConfig {
  port?: number;
  hostname?: string;                                  // default "0.0.0.0"
  enableSwaggerUI?: boolean;
  cors?: CORSOptions | false;
  resumableStream?: { adapter: ResumableStreamAdapter; defaultEnabled?: boolean };
  configureApp?: (app: OpenAPIHonoType) => void | Promise<void>;
  configureFullApp?: (p: { app; routes; middlewares }) => void | Promise<void>;
  authNext?: AuthNextConfig;
  auth?: AuthProvider;                                 // @deprecated -> authNext
}
```
`configureApp` — Hono-нативный API, **кастомные роуты регистрируются ПОСЛЕ auth-middleware, т.е. автоматически защищены**:
```ts
configureApp: (app) => {
  app.get("/health", (c) => c.json({ status: "ok" }));
  const api = app.basePath("/api/v2");
  api.get("/users", getUsersHandler);
}
```
`configureFullApp` даёт полный контроль порядка (когда задан — `configureApp` НЕ выполняется):
```ts
configureFullApp: ({ app, routes, middlewares }) => {
  middlewares.cors(); middlewares.auth(); middlewares.landingPage();
  routes.agents(); routes.workflows(); routes.logs(); routes.updates();
  routes.observability(); routes.memory(); routes.tools(); routes.triggers();
  routes.mcp(); routes.a2a(); routes.doc(); routes.ui();
}
```
=> Наши MCP-роуты/веб-хуки/ре-райты — сюда. Отдельный Express/Fastify не нужен.

### Auth
```ts
interface AuthProvider<TRequest = any> {
  type: string;
  verifyToken(token: string, request?: TRequest): Promise<any>;
  extractToken?(request: TRequest): string | undefined;
  publicRoutes?: string[];        // "GET /health", "POST /webhooks"
  defaultPrivate?: boolean;       // true = всё закрыто, публичное — по списку
}
type AuthNextAccess = "public" | "console" | "user";
interface AuthNextConfig<TRequest> { provider: AuthProvider<TRequest>; publicRoutes?: string[]; consoleRoutes?: string[]; }
declare function jwtAuth(options: { secret; mapUser?; publicRoutes?; verifyOptions?: {algorithms,audience,issuer}; defaultPrivate? }): AuthProvider<Request>;
```
`authNext` — новая модель: **всё закрыто по умолчанию**, console-роуты требуют console-доступа, публичное — явным списком. Константы: `DEFAULT_PUBLIC_ROUTES`, `DEFAULT_CONSOLE_ROUTES`, `DEFAULT_LEGACY_PUBLIC_ROUTES`, `PROTECTED_ROUTES`; хелперы `requiresAuth()`, `resolveAuthNextAccess()`, `hasConsoleAccess()`, `isDevRequest()`.
Подводный камень безопасности (из JSDoc `isDevRequest`): байпас auth срабатывает только при заголовке `x-voltagent-dev: true` И `NODE_ENV !== "production"`. В проде консоль-доступ — по `x-console-access-key` / `?key=` против env `VOLTAGENT_CONSOLE_ACCESS_KEY`. **В проде обязательно выставить NODE_ENV=production, иначе dev-заголовок открывает API.**
`jwtAuth` встроен (зависимость `jsonwebtoken`). Clerk/Auth0/Supabase — свой `AuthProvider` в 10 строк (`verifyToken`).

Прочее полезное из server-hono: `createVoltAgentApp` (createApp), `extractCustomEndpoints(app)`, `getEnhancedOpenApiDoc()` — OpenAPI включает наши кастомные роуты. Схемы через `@hono/zod-openapi` (zod + openapi3-ts oas30/oas31).

## 4. Observability: Langfuse / OTLP / VoltOps

**Главный вывод: слой — чистый OpenTelemetry. `spanProcessors` — МАССИВ, значит дублирующий экспорт (VoltOps + Langfuse + свой OTLP-коллектор) поддерживается конструктивно.**

### Langfuse (`docs/observability/langfuse.md`, целиком прочитан)
```bash
npm install @voltagent/langfuse-exporter
```
`@voltagent/langfuse-exporter` — версия **2.0.3**, license MIT, `time.modified = 2026-07-09` (свежий, риска «заброшено» нет; проверено `npm view`).
```ts
import { Agent, VoltAgent, VoltAgentObservability } from "@voltagent/core";
import { createLangfuseSpanProcessor } from "@voltagent/langfuse-exporter";

const observability = new VoltAgentObservability({
  spanProcessors: [
    createLangfuseSpanProcessor({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl:   process.env.LANGFUSE_BASE_URL,  // optional, self-hosted
      debug: true,                                // optional
    }),
  ],
});

new VoltAgent({ agents: { agent }, observability });
```
Как работает (из доки): VoltAgent поднимает глобальный OTel tracer provider; хелпер возвращает `BatchSpanProcessor`; экспортер сам маппит поля (prompts, responses, tools, usage, user/session) в Langfuse traces/generations/spans. Т.е. **семантика LLM-спанов уже сделана за нас**.

### Произвольный OTLP (пример на MLflow, `docs/observability/mlflow.md`) — годится для любого коллектора
```bash
npm install @opentelemetry/sdk-trace-base @opentelemetry/exporter-trace-otlp-proto
```
```ts
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";

const exporter = new OTLPTraceExporter({
  url: `${process.env.MLFLOW_TRACKING_URI}/v1/traces`,
  headers: { "x-mlflow-experiment-id": process.env.MLFLOW_EXPERIMENT_ID ?? "0" },
});
const observability = new VoltAgentObservability({ spanProcessors: [new BatchSpanProcessor(exporter)] });
```
=> Точно так же подключается Jaeger/Tempo/Grafana/Honeycomb/Logfire — «без обёртки, стандартные OTel-пакеты» (прямая цитата доки).

### VoltOps (родная платформа)
Самый простой путь — **две env-переменные, кода ноль** (`docs/observability-platform/setup.md:25-40`):
```bash
VOLTAGENT_PUBLIC_KEY=pk_xxxx
VOLTAGENT_SECRET_KEY=sk_live_xxxx
```
Явный вариант:
```ts
new VoltAgent({ agents: { supportAgent },
  voltOpsClient: new VoltOpsClient({ publicKey: ..., secretKey: ... }) });
```
Контекст трейсов: `agent.run("...", { userId, conversationId })` — `userId` привязывает трейс к юзеру, `conversationId` группирует. Для нас: **прокидывать `workflowRunId` в userId/conversationId или в resourceAttributes**.

### ObservabilityConfig (`core/dist/index.d.ts:3724`) — что можно крутить
```ts
interface ObservabilityConfig {
  serviceName?; serviceVersion?; instrumentationScopeName?;
  storage?: ObservabilityStorageAdapter;       // локальное хранилище спанов (для /observability/* REST)
  logger?; resourceAttributes?: Record<string, any>;
  spanFilters?: { enabled?; instrumentationScopeNames?: string[]; serviceNames?: string[] };
  flushOnFinishStrategy?: "auto" | "always" | "never";   // "auto" = флашить только в serverless
  voltOpsSync?: { sampling?: {strategy: "always"|"never"|"ratio"|"parent", ratio?}, maxQueueSize?, maxExportBatchSize?, scheduledDelayMillis?, exportTimeoutMillis? };
  serverlessRemote?: { traces?: {url,headers,method}, logs?: {...}, sampling?, ... };
  spanProcessors?: SpanProcessor[];            // <-- МАССИВ: дублирующий экспорт ОК
  logProcessors?: LogRecordProcessor[];        // <-- логи тоже экспортируются через OTel logs
}
```
Плюс экспортируемые классы из core: `VoltAgentObservability`, `createVoltAgentObservability`, `ServerlessVoltAgentObservability`, `SpanFilterProcessor`, `LocalStorageSpanProcessor`, `RemoteLogProcessor`, `LazyRemoteExportProcessor`, `StorageLogProcessor`, `WebSocketSpanProcessor`, `WebSocketLogProcessor`, утилиты `readableSpanToObservabilitySpan`, `buildSpanTree`, `shouldSample`.

**Практическая схема для нас:** `spanProcessors: [langfuseProcessor, new BatchSpanProcessor(ourOtlpExporter)]` + `voltOpsSync.sampling` для VoltOps + `spanFilters.instrumentationScopeNames` чтобы не тащить чужие спаны. `storage` оставить, иначе REST `/observability/traces` будет пустой.
UNVERIFIED: нет ли двойного счёта usage/costs при одновременном экспорте в VoltOps и Langfuse (это разные бэкенды, конфликт маловероятен, но проверить на первом прогоне).

## 5. Guardrails (docs/guardrails/{overview,built-in}.md + core d.ts:8174-8305, 12758-12871)

### Модель
```ts
type GuardrailSeverity = "info" | "warning" | "critical";
type GuardrailAction   = "allow" | "modify" | "block";
interface GuardrailBaseResult { pass: boolean; action?: GuardrailAction; message?: string; metadata?: Record<string,unknown>; }

interface InputGuardrailArgs extends GuardrailContext {   // GuardrailContext = { agent, context: OperationContext, operation }
  input: string | UIMessage[] | BaseMessage[]; inputText: string;
  originalInput: ...; originalInputText: string;          // ДО модификаций других гардрейлов
}
interface InputGuardrailResult  extends GuardrailBaseResult { modifiedInput?: string | UIMessage[] | BaseMessage[]; }
interface OutputGuardrailArgs<TOutput> extends GuardrailContext {
  output: TOutput; outputText?: string; originalOutput: TOutput; originalOutputText?: string;
  usage?: UsageInfo; finishReason?: string | null; warnings?: unknown[] | null;
}
interface OutputGuardrailResult<TOutput> extends GuardrailBaseResult { modifiedOutput?: TOutput; }
```
=> **Маскирование PII поддержано архитектурно**: гардрейл возвращает `{ pass: true, action: "modify", modifiedInput/modifiedOutput }`. Гардрейлы цепляются (каждый видит и текущее, и исходное значение).

Режимы input-гардрейла:
```ts
execution?: "blocking" | "parallel";   // blocking = до старта агента, сохраняет modifiedInput;
                                       // parallel = параллельно со стримом, может ТОЛЬКО allow/block
streamPolicy?: "holdUntilPass";        // буферизует чанки модели, пока параллельные гардрейлы не прошли
```
Output-гардрейл умеет работать **по стриму**: `streamHandler(args: { part, streamParts, state, abort })` -> изменённый `VoltAgentTextStreamPart | null`. Т.е. редакция PII в реальном времени, без ожидания полного ответа.

### Фабрики
```ts
createInputGuardrail(options: { id?, name?, description?, tags?, severity?, metadata?, handler, execution?, streamPolicy? }): InputGuardrail
createOutputGuardrail<TOutput>(options: { ..., handler, streamHandler? }): OutputGuardrail<TOutput>
```

### Готовые (импорт из `@voltagent/core`, свой regex-зоопарк НЕ пишем)
Output: `createSensitiveNumberGuardrail({minimumDigits=4, replacement="[redacted]"})`, `createEmailRedactorGuardrail({replacement})`, `createPhoneNumberGuardrail({replacement})`, `createProfanityGuardrail({bannedWords, replacement, mode:"redact"|"block"})`, `createMaxLengthGuardrail({maxCharacters, mode:"truncate"|"block"})`.
Input: `createProfanityInputGuardrail({bannedWords, replacement, mode:"mask"|"block"})`, **`createPIIInputGuardrail({replacement, maskEmails, maskPhones})`**, **`createPromptInjectionGuardrail({phrases})`**, `createInputLengthGuardrail({maxCharacters, mode})`, `createHTMLSanitizerInputGuardrail({allowBasicFormatting})`.
Бандлы: `createDefaultPIIGuardrails({sensitiveNumber, email, phone}): OutputGuardrail<string>[]`, `createDefaultInputSafetyGuardrails(): InputGuardrail[]`, `createDefaultSafetyGuardrails({profanity, maxLength}): OutputGuardrail<string>[]`.

### В воркфлоу — `andGuardrail` (d.ts:11588)
```ts
declare function andGuardrail<INPUT, DATA>({ inputGuardrails, outputGuardrails, ...config }: WorkflowStepGuardrailConfig<INPUT, DATA>): {
  type: "guardrail"; inputGuardrails?: InputGuardrail[]; outputGuardrails?: OutputGuardrail<DATA>[];
  execute(context): Promise<DATA>; id; name; purpose; retries?;
};
```
Доступен и как метод чейна: `chain.andGuardrail({...})` (d.ts:12226). Из JSDoc: «input guardrails для string/message данных, output guardrails для структурированных данных». **Это готовый узел «гейт» в нашем IR — отдельный тип узла GUARD можно смапить 1:1 на `andGuardrail`.**

### Наблюдаемость гардрейлов
Есть `AgentGuardrailState`/`AgentGuardrailStateGroup` с `node_id`, `direction`, `severity`, `tags` — состояние гардрейлов видно снаружи (для UI). Отдельная секция `docs/guardrails/overview.md:409 Observability`. Есть событие блокировки для стрима: `InputGuardrailBlockedEventData`, `InputGuardrailBlockedStreamPart`.

### Годятся ли для нас
- PII-маскирование: **да** (input + output, стриминг, готовые фабрики, `action:"modify"`).
- Фильтр инъекций: **частично**. `createPromptInjectionGuardrail({phrases})` — это список фраз, т.е. эвристика/blocklist, не классификатор. Для продовых гейтов дописываем свой `createInputGuardrail` с LLM-judge или внешним классификатором — но контракт и точка подключения берутся готовые.
- Рядом есть параллельный механизм **middleware**: `createInputMiddleware` / `createOutputMiddleware` (`MiddlewareDirection`, `MiddlewareAbortError`, `MiddlewareContext`) — для трансформаций, которые не являются «проверками». Не путать с гардрейлами.

## 6. @voltagent/evals 2.0.5 + @voltagent/scorers 2.1.0

Доки: `core/docs/evaluation-docs/{overview,offline-evaluations,live-evaluations,datasets,experiments,prebuilt-scorers,building-custom-scorers,cli-reference,using-with-viteval}.md`.

### Эксперимент — единица офлайн-оценки (`evals/dist/index.d.ts:115`)
```ts
interface ExperimentConfig<Item, Output, TVoltOpsClient> {
  id: string; label?; description?;
  dataset?: ExperimentDatasetDescriptor<Item>;         // { name } или резолвер (sync/async iterable)
  runner: ExperimentRunner<Item, Output, TVoltOpsClient>;   // (ctx) => { output, metadata?, traceIds? } | Output
  scorers?: ReadonlyArray<ExperimentScorerConfig<Item>>;
  passCriteria?: ExperimentPassCriteriaInput;
  tags?; experiment?: ExperimentBindingDescriptor; metadata?; voltOps?: ExperimentVoltOpsOptions;
}
declare function createExperiment(config): ExperimentDefinition;
declare function runExperiment(experiment, options?: RunExperimentOptions): Promise<ExperimentResult>;
```
Критерии прохода:
```ts
type ExperimentPassCriteria =
  | { type: "meanScore"; min: number; scorerId?: string; severity?: "error"|"warn"; label?; description? }
  | { type: "passRate";  min: number; scorerId?: string; severity?: "error"|"warn"; ... };
```
Результат:
```ts
interface ExperimentSummary { totalCount, completedCount, successCount, failureCount, errorCount, skippedCount,
  meanScore?, passRate?, startedAt, completedAt?, durationMs?,
  scorers: Record<string, ExperimentScorerAggregate /* successCount,errorCount,meanScore,min,max,passRate,threshold */>,
  criteria: ExperimentPassCriteriaEvaluation[] }
interface ExperimentItemResult { item, itemId, index, status, runner: ExperimentRunnerSnapshot /* output, traceIds[], error, durationMs */,
  scores: Record<string, ExperimentScore /* + threshold, thresholdPassed, reason */>, thresholdPassed?, datasetId?, datasetVersionId? }
```
**`runner.traceIds[]` связывает результат эксперимента с OTel-трейсами — прямая дорожка «оценка -> конкретный прогон воркфлоу».**

Датасеты: `registerExperimentDataset()`, `getExperimentDatasetRegistry()`, `resolveExperimentDataset()`, `resolveVoltOpsDatasetStream()` — локальные JSON и VoltOps-датасеты с версионированием (`datasetVersionId`). Ранраннер VoltOps: `createVoltOpsRunManager` / `VoltOpsRunManager` (`createRun` / `appendResults` / `completeRun`).

### CI-раннер (`docs/evaluation-docs/cli-reference.md:158`)
```bash
npx @voltagent/cli init           # ставит @voltagent/cli в devDeps, добавляет script "volt"
npm run volt eval dataset push -- --name qa-tests --file ./data/custom-qa.json
npm run volt eval dataset pull -- --name qa-tests --output ./test-data/qa.json
npm run volt eval run -- --experiment ./experiments/regression.ts \
       --dataset production-qa-v2 --experiment-name "PR #123" --tag github-actions --concurrency 10 [--dry-run]
```
Exit codes: **0 — все pass-критерии выполнены; 1 — критерии не выполнены; 2 — ошибка исполнения; 130 — Ctrl+C.** Т.е. гейт в CI ставится одной строкой в GitHub Actions.
Env: `VOLTAGENT_PUBLIC_KEY`, `VOLTAGENT_SECRET_KEY`, `VOLTAGENT_API_URL`, `VOLTAGENT_DATASET_NAME`. `--dry-run` = локально без VoltOps. При недоступности VoltOps — авто-фоллбэк в локальный режим с ворнингом; ошибки скореров логируются, но не валят прогон.
Файл эксперимента должен иметь `export default createExperiment({...})`.

### Live-скореры (`docs/evaluation-docs/live-evaluations.md`)
Вешаются на **агента**, не на воркфлоу:
```ts
const agent = new Agent({ name: "support-agent", model: openai("gpt-4o"),
  eval: {
    triggerSource: "production",           // default "live"
    environment: "prod-us-east",
    sampling: { type: "ratio", rate: 0.1 },
    scorers: { moderation: { scorer: createModerationScorer({ model: openai("gpt-4o-mini"), threshold: 0.5 }) } },
  }});
```
Ключевое из доки: **скореры исполняются асинхронно ПОСЛЕ ответа и не блокируют ответ пользователю**. Результаты пишутся как OTLP-спаны с атрибутами `eval.scorer.*`, видны в VoltOps Live Scores, но **не создают Eval Run, не привязаны к датасету и не триггерят аннотации**.

### Готовые скореры `@voltagent/scorers` 2.1.0
LLM-judge: `createModerationScorer`, `createFactualityScorer`, `createSummaryScorer`, `createHumorScorer`, `createPossibleScorer`, `createTranslationScorer`, `createAnswerCorrectnessScorer`, `createAnswerRelevancyScorer`, `createContextPrecisionScorer`, `createContextRecallScorer`, `createContextRelevancyScorer`.
Code-based (без LLM): `createToolCallAccuracyScorerCode({ expectedTool, expectedToolOrder, strictMode })` — **прямо пригодится для проверки, что воркфлоу дёрнул нужные узлы в нужном порядке**.
Реестры: `rawAutoEvalScorers`, `scorers: AutoEvalScorerMap`; адаптер `adaptScorerForAgentEval(definition, options)` — переиспользовать офлайн-скорер как live.
Свои скореры: `createScorer` / `buildScorer` / `runLocalScorers` из `@voltagent/core` (`LocalScorerDefinition`, `ScorerBuilder` с фазами `prepare/analyze/score/reason`, `weightedBlend`, `cosineSimilarity`).

### Чего НЕ хватает для гейтов НА УРОВНЕ УЗЛА (наш дефицит)
1. **`eval` конфиг есть только у `Agent`**. У `Workflow`/шага воркфлоу аналога `eval: { scorers }` в типах НЕТ -> live-скоринг отдельного узла воркфлоу из коробки не включается. UNVERIFIED: возможно через `WorkflowHooks.onStepEnd` + `runLocalScorers()` вручную — это и будет наш адаптер.
2. **Скорер не может остановить исполнение.** Live-скореры принципиально async-after-the-fact; pass-критерии применяются только в `runExperiment`. Для «узел не прошёл порог -> прервать/ретрай/фоллбэк» нужен наш код: обёртка шага, которая синхронно зовёт `runLocalScorers` и по результату кидает ошибку/переходит по ветке. Гардрейлы (`andGuardrail`) блокируют, но это не скореры — у них нет числового score/threshold-агрегации.
3. `passCriteria` — только на уровне всего эксперимента (meanScore/passRate), нет «per-item обязателен порог X по скореру Y, иначе фейл айтема». Частично закрывается `ExperimentScorerConfigEntry.threshold` + `ExperimentScore.thresholdPassed`, но агрегирующего критерия по нему нет -> считаем сами.
4. Нет встроенного сравнения прогонов (A/B двух версий IR). `ExperimentResult` даёт агрегаты, diff-логику пишем сами.
5. CLI — отдельный пакет `@voltagent/cli` (не установлен в probe). UNVERIFIED: его версия/лицензия не проверены.

## 7. Workspaces (EXPERIMENTAL) — песочницы, skills, политики тулов

**Статус: в КАЖДОМ файле доки (`overview/sandbox/skills/security/filesystem/search.md`) стоит `:::warning Experimental — Expect iteration and possible breaking changes`. Для v1 это риск.**

### Состав
```ts
import { Agent, VoltAgent, Workspace, LocalSandbox, InMemoryVectorAdapter } from "@voltagent/core";

const workspace = new Workspace({
  id: "demo-workspace",
  operationTimeoutMs: 30000,
  filesystem: {},                                   // default in-memory; NodeFilesystemBackend / CompositeFilesystemBackend / свой
  sandbox: new LocalSandbox(),
  search: { autoIndexPaths: ["/"], embedding: "openai:text-embedding-3-small", vector: new InMemoryVectorAdapter() },
  skills: { rootPaths: ["/skills"] },               // или async resolver ({workspace}) => string[]
});

const agent = new Agent({ name: "workspace-agent", model, workspace,
  workspaceToolkits: { filesystem: false, sandbox: {}, search: {}, skills: {} } });  // опционально; по умолчанию все 4
```
Глобальный воркспейс: `new VoltAgent({ workspace, agents })` — агенты наследуют, отключение через `workspace: false` на агенте.

### Песочницы (`docs/workspaces/sandbox.md`)
Агент видит один тул `execute_command` (command + env + cwd + timeout); большой stdout/stderr обрезается.
| Провайдер | Пакет | Версия | Лицензия | Обновлён |
|---|---|---|---|---|
| Blaxel | `@voltagent/sandbox-blaxel` | 2.1.1 | MIT | 2026-07-09 |
| Daytona | `@voltagent/sandbox-daytona` | 2.0.3 | MIT | 2026-07-09 |
| E2B | `@voltagent/sandbox-e2b` | 2.0.3 | MIT | 2026-07-09 |
| Local | `LocalSandbox` в core | — | MIT | — |
(проверено `npm view <pkg> version license time.modified`; все свежие, риска «заброшено» нет)
Daytona тянет `@daytonaio/sdk` сам, E2B построен на `e2b`.

`LocalSandbox` — OS-изоляция реально есть:
```ts
new LocalSandbox({
  rootDir: "/tmp/voltagent",             // default .sandbox/ в cwd
  cleanupOnDestroy: true,
  isolation: { provider: "sandbox-exec", allowNetwork: false, readWritePaths: ["/tmp/voltagent"] },
});
const provider = await LocalSandbox.detectIsolation();   // + экспорт detectLocalSandboxIsolation()
```
`sandbox-exec` на macOS, `bwrap` (bubblewrap) на Linux. **Если провайдер недоступен/не поддержан ОС — execute бросает исключение** (не тихий фоллбэк — это хорошо).
Мультитенантность — своим классом, реализующим `WorkspaceSandbox` (`name`, `status`, `getInfo()`, `execute(options)`, `destroy()`), маршрутизация по `options.operationContext.context.get("tenantId")` — в доке есть полный пример роутера на Daytona.

### Политики тулов (`docs/workspaces/security.md`) — это нам нужно
```ts
const workspace = new Workspace({
  toolConfig: {
    filesystem: {
      defaults: { needsApproval: true },
      tools: { write_file: { enabled: false } },
    },
  },
});
```
Типы: `WorkspaceToolConfig`, `WorkspaceToolPolicies`, `WorkspaceToolPolicy`, `WorkspaceToolPolicyGroup`, `WorkspaceFilesystemToolPolicy`. Агентские `workspaceToolkits` мержатся поверх воркспейсных дефолтов.
Прочие меры из доки: `filesystem.readOnly`; `requireReadBeforeWrite` (агент обязан `read_file` до модификации; если файл изменился после чтения — тул требует перечитать — **защита от гонок**); `operationTimeoutMs` (переопределяется по тулкитам); `search.allowDirectAccess` держать выключенным; env не наследовать целиком; skills — allowlist на references/scripts/assets.

### Skills
`SKILL.md` в папке скилла под rootPath (default `/skills`), рядом `references/`, `scripts/`, `assets/`. Дискавери + поиск + активация + инъекция в промпт. API: `WorkspaceSkills`, `createWorkspaceSkillsToolkit`, `createWorkspaceSkillsPromptHook`, `WorkspaceSkillSearchOptions` (hybrid: `WorkspaceSkillSearchHybridWeights`, режимы `WorkspaceSkillSearchMode`).
REST-поверхность уже есть: `GET /agents/:id/workspace`, `/workspace/ls`, `/workspace/read`, `/workspace/skills`, `/workspace/skills/:skillId` (см. секцию 3).

### Годится ли для v1
- **Для встроенных агентов внутри узлов воркфлоу — ДА, но с оговоркой**: берём `LocalSandbox` с `isolation` + `toolConfig` с `needsApproval`/`enabled:false`, и **изолируем свой код от API воркспейса тонким фасадом**, потому что API объявлен экспериментальным и сломается.
- Search с эмбеддингами (`WorkspaceSearch`, `autoIndexPaths`, `InMemoryVectorAdapter`) в v1 скорее лишний — включать по флагу.
- Skills — сильная фича для «Claude пишет инструкции для наших агентов», но `Experimental and may change as the ecosystem evolves` -> не делать её несущей конструкцией v1.
- UNVERIFIED: Workspace привязан к `Agent`; сработает ли он для шага воркфлоу без агента — по типам не видно, надо проверить на прототипе.

## 8. A2A сервер (@voltagent/a2a-server 2.0.3)

Док: `core/docs/agents/a2a/a2a-server.md`; типы: `a2a-server/dist/index.d.ts`.

```ts
import { A2AServer } from "@voltagent/a2a-server";
export const a2aServer = new A2AServer({
  name: "support-agent", version: "0.1.0", description: "...",
  provider: { organization: "Acme", url: "https://acme.example" },
  // agents?: Record<string, Agent>        — публикация агентов вне основного реестра
  // filterAgents?: A2AFilterFunction<Agent>
});
new VoltAgent({ agents: { assistant }, a2aServers: { a2aServer }, server: honoServer({ port: 3141 }) });
```

Даёт два эндпоинта (поднимаются автоматически):
- `GET /.well-known/{serverId}/agent-card.json` — карточка дискавери; поле `url` указывает на `/a2a/{serverId}` (при HTTP-запросе возвращается абсолютным).
- `POST /a2a/{serverId}` — JSON-RPC 2.0. Методы: **`message/send`, `message/stream`, `tasks/get`, `tasks/cancel`**.

`AgentCard`: `{ name, description, url, provider, version, capabilities: { streaming, pushNotifications, stateTransitionHistory }, defaultInputModes, defaultOutputModes, skills: AgentCardSkill[] }`. Строится `buildAgentCard(agent, options)`.

Модель задач: `TaskState = "submitted" | "working" | "input-required" | "completed" | "failed" | "canceled"`; `TaskRecord`, `TaskArtifact`, `TaskStore` (готовый `InMemoryTaskStore`, подменяемый через `A2AServerDeps.taskStore`). Хелперы: `createTaskRecord`, `appendMessage`, `updateLastMessage`, `transitionStatus`, `ensureCancelable`, `upsertArtifact`.
Ошибки: `VoltA2AError` с кодами `-32700 PARSE_ERROR … -32001 TASK_NOT_FOUND, -32002 TASK_NOT_CANCELABLE, -32003 PUSH_NOTIFICATION_UNSUPPORTED, -32004 UNSUPPORTED_OPERATION`; статические конструкторы (`VoltA2AError.taskNotFound(id)` и т.д.).
Проброс контекста: рядом с JSON-RPC телом можно слать `context: { userId, sessionId, metadata }` — `userId` уходит в VoltAgent `userId`, `sessionId` и `metadata` мержатся в `options.context`. Если тело менять нельзя — тот же объект как query-параметр `?context=<url-encoded json>` (легаси-имя `runtimeContext`); тело перекрывает дубли, metadata объединяется.

### Что это даёт при публикации ВОРКФЛОУ
Прямо — почти ничего: **`A2AServerConfig` принимает только `agents`, поля `workflows` НЕТ** (в отличие от `MCPServerConfig`). `A2AMessagePart` сейчас только `A2AMessagePartText` — структурированный вход/выход не передашь без сериализации в текст.
Чтобы отдать воркфлоу по A2A, надо завернуть его в `Agent` (агент с одним тулом-воркфлоу) — это наш код.

**Вывод:** A2A — «второй фасад» для интеропа с чужими агентными платформами (Google A2A-экосистема). Для сценария «Claude через MCP строит и гоняет воркфлоу» он НЕ нужен. Ценность: `tasks/get` + `tasks/cancel` + состояние `input-required` — семантика long-running задач с человеком в цикле, совпадает с нашим suspend/resume. В v1 — **не брать**, отметить как точку расширения v2; пакет ставится и включается одним полем `a2aServers`, стоимость отложенного внедрения близка к нулю.

## Итоговые рекомендации (что берём готовым, что пишем сами)

БЕРЁМ ГОТОВЫМ (пишем максимум тонкие адаптеры):
1. Тулы — `createTool` + `outputSchema` + `needsApproval` + `ToolHooks`/`ToolDeniedError`; внешние MCP — `MCPConfiguration`.
2. Публикация воркфлоу как MCP-тулов — `@voltagent/mcp-server`, включая авто-`workflow_{id}` и `workflow_{id}_resume`.
3. HTTP-слой — `@voltagent/server-hono`: полный CRUD/execute/stream/suspend/resume/cancel/replay/state по воркфлоу + `configureApp`/`configureFullApp` под свои роуты; auth — `authNext` + свой `AuthProvider`.
4. Observability — OTel: `spanProcessors: [langfuse, ourOtlp]` + VoltOps по env.
5. PII/безопасность — встроенные guardrails + `andGuardrail` как узел IR.
6. Офлайн-оценка и CI-гейт — `@voltagent/evals` + `@voltagent/scorers` + `volt eval run` (exit code 1 при провале критериев).

ПИШЕМ САМИ (ядро доверия + дыры фреймворка):
- IR, компилятор IR -> VoltAgent workflow chain, реестры, исполнители узлов, MCP-контракт (как и планировали).
- Скоринг/гейт НА УРОВНЕ УЗЛА: обёртка шага, синхронно зовущая `runLocalScorers` и решающая fail/retry/fallback (у Volt live-скореры только на агенте и только async).
- Per-item пороги и diff между прогонами экспериментов.
- Таймаут тула как декларативное поле (в `ToolOptions` его нет).
- Тонкий фасад над `Workspace` (API экспериментальный).
- Обёртка `Agent` вокруг воркфлоу, если понадобится A2A.

ОТКРЫТЫЕ ВОПРОСЫ (TODO для следующего захода):
- Как auth-контекст доезжает до `filterWorkflows`/`filterTools` MCP-сервера (мультитенантность).
- Работает ли `Workspace` для шага воркфлоу без агента.
- Версия/лицензия `@voltagent/cli`.
- Нет ли двойного учёта usage при одновременном экспорте в VoltOps и Langfuse.
