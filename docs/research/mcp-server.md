# MCP-сервер — контракт для Claude и любого агента (§13)

Статус: DONE (2026-09-11). Все 6 разделов заполнены; помеченное UNVERIFIED требует отдельной проверки.

## 1. @modelcontextprotocol/sdk@1.30.0 — API сервера

ВЕРИФИЦИРОВАНО по .d.ts (`npm i @modelcontextprotocol/sdk@1.30.0`).
- version 1.30.0, license **MIT**, time.modified 2026-07-27 — живая либа, риска "заброшено" нет.
- `"type": "module"`, есть и ESM и CJS сборки. engines: node >= 18.
- Subpath-экспорты: `.`, `./client`, `./server`, `./server/mcp`, `./server/stdio`, `./server/streamableHttp`,
  `./server/auth/*`, `./validation`, `./validation/ajv`, `./validation/cfworker`, `./experimental`, `./experimental/tasks`.

### 1.1 McpServer — точные сигнатуры
Файл: `dist/esm/server/mcp.d.ts`.

```ts
export declare class McpServer {
  readonly server: Server;                       // низкий уровень: sampling/elicitation/notifications
  constructor(serverInfo: Implementation, options?: ServerOptions);
  get experimental(): { tasks: ExperimentalMcpServerTasks };   // @experimental, может ломаться
  connect(transport: Transport): Promise<void>;
  close(): Promise<void>;

  registerTool<OutputArgs extends ZodRawShapeCompat | AnySchema,
               InputArgs  extends undefined | ZodRawShapeCompat | AnySchema = undefined>(
    name: string,
    config: {
      title?: string;
      description?: string;
      inputSchema?: InputArgs;      // zod raw shape ИЛИ готовая JSON Schema (AnySchema)
      outputSchema?: OutputArgs;    // включает валидацию structuredContent
      annotations?: ToolAnnotations;
      _meta?: Record<string, unknown>;
    },
    cb: ToolCallback<InputArgs>
  ): RegisteredTool;

  registerResource(name: string, uriOrTemplate: string,          config: ResourceMetadata, readCallback: ReadResourceCallback): RegisteredResource;
  registerResource(name: string, uriOrTemplate: ResourceTemplate, config: ResourceMetadata, readCallback: ReadResourceTemplateCallback): RegisteredResourceTemplate;

  registerPrompt<Args extends PromptArgsRawShape>(
    name: string,
    config: { title?: string; description?: string; argsSchema?: Args },
    cb: PromptCallback<Args>
  ): RegisteredPrompt;

  isConnected(): boolean;
  sendLoggingMessage(params: LoggingMessageNotification['params'], sessionId?: string): Promise<void>;
  sendResourceListChanged(): void;
  sendToolListChanged(): void;
  sendPromptListChanged(): void;
}
```

Старые `tool()` / `resource()` / `prompt()` перегрузки помечены **@deprecated** — в новом коде использовать
только `registerTool` / `registerResource` / `registerPrompt`.

### 1.2 RegisteredTool — динамическое управление поверхностью (ключ к §13.1)
```ts
export type RegisteredTool = {
  title?; description?; inputSchema?: AnySchema; outputSchema?: AnySchema;
  annotations?: ToolAnnotations; execution?: ToolExecution; _meta?: Record<string, unknown>;
  handler: AnyToolHandler<undefined | ZodRawShapeCompat>;
  enabled: boolean;
  enable(): void;
  disable(): void;
  update<InputArgs, OutputArgs>(updates: {
    name?: string | null; title?; description?;
    paramsSchema?: InputArgs; outputSchema?: OutputArgs;
    annotations?: ToolAnnotations; _meta?; callback?: ToolCallback<InputArgs>;
    enabled?: boolean;
  }): void;
  remove(): void;
};
```
=> `enable()/disable()/update()/remove()` сами шлют `notifications/tools/list_changed`.
Это штатный механизм «показывать тулы по фазе цикла» без своих костылей (см. §3 ниже — вердикт).

### 1.3 ToolCallback и structuredContent
```ts
export type ToolCallback<Args> =
  BaseToolCallback<CallToolResult, RequestHandlerExtra<ServerRequest, ServerNotification>, Args>;
```
Комментарий в d.ts дословно: колбэк должен возвращать
`structuredContent` если объявлен `outputSchema`; `content` если нет; оба поля опциональны, но
обычно нужно отдать одно из них.
McpServer сам делает `validateToolInput` и валидацию выхода по `outputSchema` (приватные методы
`validateToolInput` / валидация output в `setToolRequestHandlers`), т.е. **типизирован и вход и выход**.

ВАЖНО (подводный камень для обратной совместимости клиентов): клиенты, не понимающие
`structuredContent`, увидят пустой ответ, поэтому SDK-конвенция — дублировать структуру в
`content: [{ type:'text', text: JSON.stringify(structured) }]`. UNVERIFIED в d.ts — проверить,
дублирует ли 1.30.0 это автоматически (в ранних версиях дублировал сам сервер).

### 1.4 RequestHandlerExtra — что доступно внутри тула
`dist/esm/shared/protocol.d.ts`:
```ts
export type RequestHandlerExtra<SendRequestT, SendNotificationT> = {
  signal: AbortSignal;                 // отмена со стороны клиента
  authInfo?: AuthInfo;                 // из requireBearerAuth
  sessionId?: string;                  // из транспорта
  _meta?: RequestMeta;                 // в т.ч. progressToken
  requestId: RequestId;
  taskId?: string; taskStore?: RequestTaskStore; taskRequestedTtl?: number;  // experimental tasks
  requestInfo?: RequestInfo;           // оригинальный HTTP-запрос
  sendNotification: (n: SendNotificationT) => Promise<void>;   // progress / logging
  sendRequest: <U extends AnySchema>(r: SendRequestT, resultSchema: U, options?) => Promise<SchemaOutput<U>>;
  // + closeSseStream(): закрыть SSE-стрим этого запроса (нужен eventStore) -> клиент переподключится (polling)
};
```
Прогресс: `extra.sendNotification({ method:'notifications/progress', params:{ progressToken: extra._meta?.progressToken, progress, total, message } })`.

### 1.5 Sampling / Elicitation (низкий уровень, через `mcpServer.server`)
`dist/esm/server/index.d.ts`:
```ts
createMessage(params: CreateMessageRequestParamsBase, options?: RequestOptions): Promise<CreateMessageResult>;
createMessage(params: CreateMessageRequestParamsWithTools, options?): Promise<CreateMessageResultWithTools>; // tools в sampling
elicitInput(params: ElicitRequestFormParams | ElicitRequestURLParams, options?): Promise<ElicitResult>;
sendLoggingMessage(params, sessionId?): Promise<void>;
```
Два вида elicitation: **form** (схема полей) и **URL** (отправить пользователя в браузер) —
второе прямо ложится на наш `ui_url` в Studio (см. §4).
ПОДВОДНЫЙ КАМЕНЬ: Claude Code как MCP-клиент elicitation/sampling поддерживает неполно —
см. §2. Нельзя строить основной поток на sampling.

### 1.6 Completions
`ResourceTemplate` принимает `complete: { [variable]: CompleteResourceTemplateCallback }`,
`completeCallback(variable)` отдаёт колбэк; для prompt-аргументов есть `completable()` из
`dist/esm/server/completable.js` (обёртка над zod-схемой аргумента).

### 1.7 Реальный код сервера с типизированным входом И выходом
```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer(
  { name: 'volt', version: '0.1.0' },
  { capabilities: { tools: { listChanged: true }, logging: {} } }
);

const runGetTraceInput = {
  run_id: z.string().describe('Идентификатор прогона, напр. run_8812'),
  node_id: z.string().optional().describe('Сузить до одного узла'),
  view: z.enum(['summary', 'detailed', 'raw']).default('summary'),
  limit: z.number().int().min(1).max(200).default(20),
  cursor: z.string().optional()
};

const runGetTraceOutput = {
  ok: z.boolean(),
  version: z.object({ spec_id: z.string(), rev: z.number().int(), etag: z.string() }),
  focus: z.object({ node_id: z.string(), node_kind: z.string(), excerpt: z.string() }).optional(),
  problems: z.array(z.object({
    code: z.enum(['TYPE_MISMATCH', 'MISSING_BINDING', 'PROVIDER_ERROR', 'SCHEMA_VIOLATION']),
    severity: z.enum(['error', 'warning']),
    at: z.object({ node_id: z.string(), path: z.string().optional() }),
    message: z.string()
  })).default([]),
  candidates: z.array(z.object({
    id: z.string(), title: z.string(), confidence: z.number().min(0).max(1),
    apply: z.object({ tool: z.string(), arguments: z.record(z.string(), z.unknown()) })
  })).default([]),
  items: z.array(z.object({ span_id: z.string(), node_id: z.string(), status: z.string() })),
  next_cursor: z.string().nullable(),
  ui_url: z.string().url()
};

server.registerTool('run_get_trace', {
  title: 'Трейс прогона',
  description: 'Возвращает трейс прогона по узлам с проблемами и кандидатами на исправление. ' +
               'Используй view=summary (по умолчанию) — detailed только если summary не хватило.',
  inputSchema: runGetTraceInput,
  outputSchema: runGetTraceOutput,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  _meta: { 'anthropic/maxResultSizeChars': 200_000 }   // override лимита Claude Code
}, async (args, extra) => {
  extra.signal.throwIfAborted();
  await extra.sendNotification({
    method: 'notifications/progress',
    params: { progressToken: extra._meta?.progressToken ?? args.run_id, progress: 0, total: 1,
              message: 'Читаю трейс' }
  });

  const structured = await buildTrace(args, extra.authInfo?.scopes ?? []);

  return {
    structuredContent: structured,
    content: [{ type: 'text', text: JSON.stringify(structured) }],   // backward compat (spec 2025-06-18)
    isError: !structured.ok
  };
});

await server.connect(new StdioServerTransport());
```
Ключевое: `outputSchema` объявлен -> McpServer сам валидирует `structuredContent`;
`content[0].text` — дубль для клиентов без поддержки structured (требование спеки).

### 1.8 Валидация схем
Есть `./validation/ajv` и `./validation/cfworker` — провайдеры JSON Schema валидации.
`zod-compat.ts` + `zod-json-schema-compat.ts` => SDK принимает **и zod v3, и zod v4 raw shape, и сырую
JSON Schema**. У нас zod@4.6.2 — совместимо, но: для сложных схем лучше отдавать готовую JSON Schema
(один источник правды с воркфлоу-спекой), а не гонять zod->JSON Schema дважды.


## 2. Транспорты, сессии, авторизация, CORS

### 2.1 Что есть в SDK 1.30.0 (файлы верифицированы)
- `server/stdio.ts` -> `StdioServerTransport` (для локального Claude Code).
- `server/streamableHttp.ts` -> `StreamableHTTPServerTransport` — **тонкая обёртка** над
  `WebStandardStreamableHTTPServerTransport` через `@hono/node-server` (node IncomingMessage/ServerResponse).
- `server/webStandardStreamableHttp.ts` -> `WebStandardStreamableHTTPServerTransport` — Request/Response/
  ReadableStream; работает на Node 18+, Cloudflare Workers, Deno, Bun. **Для Next.js Route Handler брать именно его**,
  а не node-обёртку.
- `server/sse.ts` + `sseKeepAlive.ts` — legacy HTTP+SSE транспорт (протокол 2024-11-05). Только для обратной
  совместимости, новое на нём не строить.
- `server/express.ts` — хелперы для express.
- `server/middleware/hostHeaderValidation.ts` — внешняя middleware для DNS-rebinding защиты.

### 2.2 StreamableHTTPServerTransportOptions (точный интерфейс)
```ts
export interface WebStandardStreamableHTTPServerTransportOptions {
  sessionIdGenerator?: () => string;             // нет => stateless
  onsessioninitialized?: (sessionId: string) => void | Promise<void>;
  onsessionclosed?: (sessionId: string) => void | Promise<void>;   // при DELETE
  enableJsonResponse?: boolean;                  // default false (предпочитается SSE)
  eventStore?: EventStore;                       // включает resumability (Last-Event-ID)
  allowedHosts?: string[];                       // @deprecated -> внешняя middleware
  allowedOrigins?: string[];                     // @deprecated
  enableDnsRebindingProtection?: boolean;        // @deprecated, default false
  retryInterval?: number;                        // SSE retry: управляет переподключением клиента
  keepAliveMs?: number;                          // default 15000; <1 отключает keep-alive
}
```
Семантика сессий (из doc-комментария класса):
- **stateful**: session ID в заголовке ответа, всегда в ответе на initialize; неизвестный session ID -> 404;
  не-initialize запрос без session ID -> 400; состояние в памяти (!) — значит при нескольких нодах нужен
  sticky routing или общий eventStore.
- **stateless** (`sessionIdGenerator: undefined`): session ID не выдаётся и не валидируется.

`handleRequest(req, res, parsedBody?)`; web-версия принимает `HandleRequestOptions { parsedBody?, authInfo? }`.
`closeSSEStream(requestId)` / `closeStandaloneSSEStream()` — принудительно оборвать стрим, чтобы клиент
перешёл в polling (полезно для наших длинных run-ов).

### 2.3 Авторизация (OAuth 2.1 / bearer) — что даёт SDK
`server/auth/`:
- `middleware/bearerAuth.ts`:
  `requireBearerAuth({ verifier: OAuthTokenVerifier, requiredScopes?: string[], resourceMetadataUrl?: string }): RequestHandler`
  — валидирует токен, кладёт `req.auth: AuthInfo`, на 401 добавляет `WWW-Authenticate` с ссылкой на
  OAuth 2.0 Protected Resource Metadata.
- `router.ts`:
  - `mcpAuthRouter(options: AuthRouterOptions)` — полноценный AS (мы AS делать не хотим);
  - `mcpAuthMetadataRouter({ oauthMetadata, resourceServerUrl, serviceDocumentationUrl?, scopesSupported?, resourceName? })`
    — **наш случай: мы Resource Server, AS внешний**;
  - `getOAuthProtectedResourceMetadataUrl(new URL('https://api.example.com/mcp'))`
    -> `'https://api.example.com/.well-known/oauth-protected-resource/mcp'`.
  - Router MUST быть смонтирован в корне приложения (доки SDK).
- `providers/proxyProvider.ts` -> `ProxyOAuthServerProvider` — проксирование на внешний AS (Auth0/Clerk/WorkOS).
- `middleware/clientAuth.ts`, `middleware/allowedMethods.ts`, `clients.ts` (ClientsStore, DCR).

ВЕРДИКТ по авторизации: мы — **Resource Server**, не Authorization Server.
`mcpAuthMetadataRouter` + `requireBearerAuth` + внешний IdP. Скоупы: гранулярность на группу тулов
(`workflows:read`, `workflows:write`, `runs:execute`, `secrets:*`), т.к. `requiredScopes` — это уровень
всего эндпоинта, а не тула; для пер-тульных прав проверять `extra.authInfo.scopes` внутри тула.

### 2.4 CORS
SDK CORS не делает — это на нашей стороне. Обязательно:
`Access-Control-Expose-Headers: Mcp-Session-Id` (иначе браузерный клиент не увидит сессию),
разрешить заголовки `Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID`,
методы `GET, POST, DELETE, OPTIONS`.
Плюс валидация `Origin` (DNS rebinding) — теперь через `server/middleware/hostHeaderValidation.ts`,
а не через deprecated-опции транспорта.

### 2.5 Claude Code как MCP-клиент — ВЕРИФИЦИРОВАНО (code.claude.com/docs/en/mcp, 2026-09-11)
Транспорты: **http** (рекомендованный для удалённых), **sse** (deprecated), **stdio**, **ws**
(только через `claude mcp add-json`, `"type":"ws"`).
```bash
claude mcp add --transport http  volt https://api.example.com/mcp --header "Authorization: Bearer ..."
claude mcp add --transport stdio volt -- npx -y @our/volt-mcp
```
Флаги: `-t/--transport`, `-H/--header`, `-s/--scope (local|project|user)`, `-e/--env`,
`--callback-port`, `--client-id`, `--client-secret`.
OAuth: браузерный флоу через `/mcp` в сессии или `claude mcp login <name>` (v2.1.186+),
**Dynamic Client Registration поддерживается**. Динамические заголовки — `headersHelper`
(путь к скрипту, печатающему заголовки) — годится для внутреннего SSO.

Скоупы конфига: local (`~/.claude.json`, по умолчанию), project (`.mcp.json` в корне, в git),
user (`~/.claude.json`, кросс-проектно). Подстановка в `.mcp.json`: `${VAR}` и `${VAR:-default}`,
плюс `${CLAUDE_PROJECT_DIR}`. Отсутствующая переменная -> warning, текст остаётся неразвёрнутым.

ЧТО ПОДДЕРЖИВАЕТСЯ:
- **tools** — полностью, со схемами и лимитами вывода;
- **elicitation** — ПОДДЕРЖИВАЕТСЯ (Claude Code отвечает на elicitation-запросы);
- **resources** — в доках НЕ заявлены как поддерживаемые;
- **prompts как slash-команды** — НЕ заявлены;
- **sampling** — НЕ поддерживается.
=> ПРОЕКТНОЕ СЛЕДСТВИЕ: **весь контракт должен жить в тулах**. Resources/prompts — только как
приятный бонус для Claude Desktop / других клиентов, но ни одна обязательная информация не должна
быть доступна ТОЛЬКО через resource. Sampling не использовать вообще.

ЛИМИТЫ (критично для §13):
- `MAX_MCP_OUTPUT_TOKENS` — **дефолт 25 000 токенов** на ответ тула; предупреждение при 10 000 (фиксировано);
- пер-тульный override: `_meta["anthropic/maxResultSizeChars"]` в `tools/list` — до 500 000 символов текста.
  В SDK это `config._meta` в `registerTool` — ЭТО НАШ РЫЧАГ для «толстых» тулов вроде `run_get_trace`.
- `MCP_TOOL_TIMEOUT` — таймаут вызова, дефолт ~28 часов; пер-сервер `"timeout"` (мс, минимум 1000).
- Idle timeout: 5 мин для http/sse/ws, 30 мин для stdio; `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`, `0` = выключить.
- Явного лимита на КОЛИЧЕСТВО тулов в доках нет.

## 3. Поверхность тулов (~50 в 15 группах): рекомендации и ВЕРДИКТ

### 3.1 Официальные факты, на которые опираемся
- MCP spec 2025-06-18 `server/tools`: `tools/list` **поддерживает пагинацию** (`params.cursor` ->
  `result.nextCursor`). Поля тула: `name`, `title` (опционально, для показа человеку), `description`,
  `inputSchema`, `outputSchema`, `annotations`, `_meta`.
  Capability: `{"capabilities":{"tools":{"listChanged":true}}}`; уведомление
  `notifications/tools/list_changed`.
- Anthropic engineering, "Writing effective tools for AI agents" (anthropic.com/engineering/writing-tools-for-agents):
  - **namespacing** (общий префикс у связанных тулов) явно рекомендован как способ разграничить
    большое число тулов; клиенты MCP иногда делают это сами;
  - пересекающиеся по смыслу или размытые тулы — главная причина ошибок выбора у агента;
  - для любых потенциально «толстых» ответов рекомендуется **комбинация pagination + range selection +
    filtering + truncation с разумными дефолтами**;
  - прямым текстом: у Claude Code ответы тулов ограничены 25 000 токенов по умолчанию.
- Anthropic: "Code execution with MCP" — загрузка всех определений тулов может съедать ~150k токенов
  до первого сообщения пользователя; подход с кодовым исполнением снижал это до ~2k (-98.7%).

### 3.2 Цена контекста у нас (оценка)
50 тулов * (name+description+JSON Schema). Реалистично 250-600 токенов на тул с нетривиальной
схемой => **12k-30k токенов только на определения**, до первого действия. Это неприемлемо:
съедает бюджет, который нужен на трейсы прогонов.

### 3.3 ВЕРДИКТ — конкретная рекомендация
1) **Namespacing жёсткий, snake_case, префикс = группа**: `workflow_*`, `step_*`, `run_*`, `trace_*`,
   `eval_*`, `dataset_*`, `secret_*`, `provider_*`, `export_*`, `studio_*`.
   Имя = `<группа>_<глагол>_<объект>`: `workflow_create`, `run_start`, `run_get_trace`,
   `eval_run_suite`. Никаких синонимичных тулов (`get_run` и `fetch_run` одновременно) — это прямой
   антипаттерн из гайда Anthropic.
2) **Прогрессивное раскрытие поверхности по фазе цикла — ДА, это наш основной приём.**
   Механизм штатный: `RegisteredTool.disable()/enable()` + автоматический
   `notifications/tools/list_changed`. Фазы: `discover` -> `author` -> `run` -> `debug` -> `evaluate` -> `ship`.
   - Всегда включено **ядро ~8-10 тулов**: `workflow_list`, `workflow_get`, `run_start`, `run_get`,
     `run_get_trace`, `studio_open`, `mode_set` (переключение фазы), `help_contract`.
   - Остальные группы включаются при входе в фазу через `mode_set({phase})`, либо автоматически по
     контексту (открыли run с ошибкой -> включилась группа `debug_*`).
   Цель: держать одномоментно **<= 20-25 тулов**, а не 50.
   РИСК: не все MCP-клиенты корректно обрабатывают `tools/list_changed` (перечитывают список).
   Поэтому: (а) ядро самодостаточно; (б) если клиент не переподписался — вызов выключенного тула
   должен возвращать НЕ "unknown tool", а понятную ошибку «тул доступен в фазе X, вызови mode_set».
   UNVERIFIED: поведение Claude Code при `tools/list_changed` в середине сессии — проверить на живом
   сервере перед тем, как делать это единственной стратегией.
3) **Альтернатива/дополнение: «толстые» тулы вместо россыпи тонких.**
   Вместо 6 тулов на CRUD шага — один `workflow_patch` с oneOf-операциями (op-based, см. §6).
   Это одновременно решает конкурентность. Сокращает 50 -> ~30 без всякой динамики.
4) **Пагинация обязательна во ВСЕХ листингах** — и `tools/list` (если реально >50), и в ответах
   тулов: `{ items, next_cursor, total_estimate }`. Дефолтный `limit` малый (20), `fields`/`view`
   для проекции, `since`/`until` для трейсов.
5) **Бюджет ответа**: держать каждый ответ <= ~2-4k токенов. Для `run_get_trace` — явный
   `_meta: { 'anthropic/maxResultSizeChars': 200000 }` и параметры `level`, `step_ids`, `limit`,
   `include_payloads: 'none'|'truncated'|'full'` (дефолт `truncated`).
6) **annotations** заполнять всегда: `readOnlyHint`, `destructiveHint`, `idempotentHint`,
   `openWorldHint` — Claude Code использует их для показа человеку и для оценки риска.
   Помним предупреждение spec: клиент считает annotations недоверенными.
7) **КРИТИЧНО: имена тулов в §13.1 спеки некорректны для MCP/Anthropic.**
   В спеке `flow.create`, `run.start`, `catalog.list` — **через точку**. Имя тула в Anthropic
   Messages API ограничено паттерном вида `^[a-zA-Z0-9_-]{1,128}$` (точка НЕ входит), а Claude Code
   дополнительно префиксует MCP-тулы как `mcp__<server>__<tool>`.
   UNVERIFIED (точная регулярка не подтверждена в этот заход — проверить на
   platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools), но точка в именах —
   гарантированный источник проблем.
   => **Переименовать всё в snake_case с префиксом группы**: `flow.create` -> `flow_create`,
   `run.replay_node` -> `run_replay_node`, `experiment.compare` -> `experiment_compare`.
   Плюс учесть длину: `mcp__volt__project_verify_migration` = 34 симв., в лимит укладывается,
   но имя сервера держать коротким (`volt`), а не `ai-workflows-automate`.

### 3.4 Официальная альтернатива 2026: Tool Search Tool
В каталоге тулов Anthropic есть серверный **Tool Search tool** —
«Work with thousands of tools by discovering and loading them on demand»
(platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool).
Это официальный ответ Anthropic на проблему большой поверхности: определения тулов не грузятся
все сразу, модель ищет их по запросу.
ЗАМЕЧАНИЕ: это фича **Messages API**, а не MCP-сервера — мы как сервер её не включаем.
Но она важна двояко:
- если наш агент-раннер строится на Messages API напрямую (не через Claude Code), 50 тулов
  становятся неопасны — включаем tool search + `strict: true` (Strict tool use, гарантирует
  соответствие схеме);
- она подтверждает: правильное направление — **ленивое раскрытие**, а не урезание функциональности.
ВЕРДИКТ ОСТАЁТСЯ: для Claude Code (наш основной клиент) — фазовое `enable()/disable()` + консолидация.
UNVERIFIED: доступен ли Tool Search tool внутри Claude Code для MCP-тулов — проверить отдельно.

### 3.5 Цена системного промта тулов (verified, platform.claude.com .../tool-use/overview)
Сам факт наличия хотя бы одного тула добавляет системный промт:
Claude Opus 5 — **286 токенов** (`tool_choice: auto|none`) / **406** (`any|tool`);
Sonnet 5 — 354 / 474. Это поверх токенов самих определений тулов.

## 4. Формат ответа тула: локальный контекст + кандидаты на исправление + ui_url

### 4.1 Что говорит Anthropic (verified, anthropic.com/engineering/writing-tools-for-agents)
- **Консолидировать тулы**, а не отражать каждый REST-эндпоинт: `schedule_event` вместо
  `list_users`+`list_events`+`create_event`; `get_customer_context` собирает всё релевантное за один вызов.
  Дословно: «tools can consolidate functionality, handling potentially multiple discrete operations
  (or API calls) under the hood».
- **Возвращать осмысленный контекст, а не технические идентификаторы.** Разрешение «произвольных
  буквенно-цифровых UUID в семантически осмысленный язык значительно улучшает точность Claude».
  Не отдавать `uuid`, `mime_type`; отдавать `name`, `file_type`, читаемые индексы.
- **`response_format` enum** (`"concise" | "detailed"`): в их примере со Slack concise ≈ **1/3 токенов**
  от detailed, не теряя информации, нужной для следующего вызова.
- Единого правильного формата (JSON vs XML vs Markdown) нет — мерить на своих задачах.
- **Ошибки должны вести агента**: не коды и трейсбеки, а конкретное «что именно поправить».
  Сообщение об усечении тоже должно подсказывать стратегию («делай много мелких точечных поисков»).
- Имена параметров однозначные: `user_id`, а не `user`. Описание тула писать как инструкцию новичку.
- Namespacing префиксами по сервису и типу ресурса (`asana_search`, `asana_projects_search`);
  выбор префикс/суффикс даёт нетривиальную разницу в eval — надо тестировать.

### 4.2 Канонический конверт ответа (наш контракт)
Каждый тул: `outputSchema` объявлен, ответ = `structuredContent` + дубль в `content[0].text`
(требование обратной совместимости из spec 2025-06-18).

```jsonc
{
  "ok": false,
  "op": "workflow_patch",
  "version": { "spec_id": "wf_invoice", "rev": 42, "etag": "W/\"42-9f1c\"" },

  // 1) ЛОКАЛЬНЫЙ контекст: только то, что затронуто. Никогда не весь проект.
  "focus": {
    "node_id": "extract_line_items",
    "node_kind": "llm.structured",
    "excerpt": "…±15 строк спеки вокруг узла, уже отрендеренные…",
    "upstream": ["parse_pdf"],          // имена, не uuid
    "downstream": ["validate_totals"]
  },

  // 2) ДИАГНОСТИКА в машиночитаемом виде
  "problems": [{
    "code": "TYPE_MISMATCH",            // стабильный enum, документирован в reference.md
    "severity": "error",
    "at": { "node_id": "extract_line_items", "path": "output.items[].qty", "line": 118 },
    "message": "Узел отдаёт string, потребитель validate_totals ждёт number.",
    "evidence": { "observed": "\"12\"", "expected_type": "number", "run_id": "run_8812", "sample_span": "span_31" }
  }],

  // 3) КАНДИДАТЫ НА ИСПРАВЛЕНИЕ — готовые к применению патчи, не проза
  "candidates": [{
    "id": "cand_1",
    "title": "Привести qty к number в схеме узла",
    "confidence": 0.82,
    "rationale": "В 47/50 прогонов модель отдаёт число строкой; схема уже строгая ниже по потоку.",
    "apply": { "tool": "workflow_patch", "arguments": { "spec_id": "wf_invoice", "base_rev": 42,
               "ops": [{ "op": "set", "path": "/nodes/extract_line_items/output/items/qty/type", "value": "number" }] } },
    "risk": "low",
    "affects": ["validate_totals"]
  }],

  // 4) ЧТО ДЕЛАТЬ ДАЛЬШЕ — сужает пространство выбора
  "next": [
    { "tool": "run_replay_node", "arguments": { "run_id": "run_8812", "node_id": "extract_line_items" },
      "why": "Проверить фикс без полного прогона" }
  ],

  // 5) ССЫЛКИ ВМЕСТО ДАННЫХ — агент дочитывает только если нужно
  "refs": [
    { "type": "resource_link", "uri": "volt://run/run_8812/trace?node=extract_line_items",
      "name": "trace: extract_line_items", "mimeType": "application/json",
      "description": "Полный трейс узла, 34 KB" }
  ],

  // 6) ЧЕЛОВЕК
  "ui_url": "https://studio.example.com/w/wf_invoice/run/run_8812?node=extract_line_items&problem=0",

  // 7) БЮДЖЕТ
  "truncated": { "fields": ["focus.excerpt"], "hint": "Полный текст: workflow_get({spec_id,node_id,view:'full'})" }
}
```

### 4.3 Правила, которые из этого следуют
- **Отрицательный результат так же информативен**, как положительный: `ok:false` всегда несёт
  `problems[]` + `candidates[]`. Агент не должен «идти читать проект» — за него уже прочитали.
- `candidates[].apply` — это **готовый вызов другого тула**, а не текст. Агент делает ровно один
  следующий шаг. Это главный приём экономии контекста.
- `ui_url` — не декорация: это a) ссылка для человека, b) аргумент для
  `elicitInput({ mode: 'url' })`, если нужен аппрув (elicitation в Claude Code поддерживается).
- Все листинги: `{ items, next_cursor, total_estimate }`, `limit` по умолчанию 20.
- Все «толстые» тулы имеют `view: 'summary'|'detailed'|'raw'` (аналог `response_format` Anthropic)
  с дефолтом `summary`, и `_meta: { 'anthropic/maxResultSizeChars': N }` в регистрации.
- ID: наружу отдаём читаемые slug-и (`extract_line_items`), а не UUID. Внутренние UUID —
  в отдельном поле, если реально нужны.
- Ошибки тула: `isError: true` + тот же конверт с `problems`/`candidates`. Никаких стектрейсов.
- Коды ошибок — стабильный enum, задокументированный в `reference.md` скилла, чтобы агент
  мог маршрутизировать без парсинга текста.

## 5. Agent Skills (SKILL.md) — ВЕРИФИЦИРОВАНО (code.claude.com/docs/en/skills, 2026-09-11)

### 5.1 Frontmatter: два уровня полей
**Поля спецификации Agent Skills (переносимые: claude.ai, Skills API, другие агенты):**
`name`, `description`, `license`, `compatibility` (max 500 симв.), `metadata` (free-form YAML map),
`allowed-tools`.
ВАЖНО: все остальные поля — **только Claude Code**, и при упаковке скилла для внешней дистрибуции
(загрузка на claude.ai / Skills API) **вызывают ошибку загрузки**. Значит наш публичный скилл
`volt-workflow-loop` держим на переносимом подмножестве, а Claude-Code-специфику — в отдельном варианте.

**Claude Code-only поля:**
- контроль вызова: `disable-model-invocation` (bool, default false), `user-invocable` (bool, default true);
- исполнение: `context: fork` (изолированный субагент), `agent` (`Explore` | `Plan` | `general-purpose` | кастом),
  `background` (bool, default true; false = ждать результат в этом же ходе, v2.1.218+),
  `model`, `effort` (`low|medium|high|xhigh|max`), `shell` (`bash|powershell`);
- права: `allowed-tools`, `disallowed-tools` (строка через пробел/запятую или YAML-список);
- аргументы: `argument-hint`, `arguments` (именованные, подстановка `$name`), `when_to_use`, `paths` (глобы), `hooks`.

Ограничения: `description` + `when_to_use` суммарно **max 1536 символов**; `name` необязателен
(по умолчанию = имя директории).

### 5.2 Где лежат скиллы (порядок приоритета)
| Уровень | Путь |
|---|---|
| Enterprise | `<managed settings dir>/.claude/skills/<skill>/SKILL.md` |
| Personal | `~/.claude/skills/<skill>/SKILL.md` |
| Project | `<repo>/.claude/skills/<skill>/SKILL.md` (коммитить в git) |
| Nested | `<subdir>/.claude/skills/<skill>/SKILL.md` (монорепо; грузится при первом редактировании в subdir, либо `/add-dir`) |
| Additional | `.claude/skills/` внутри `--add-dir` директории |
| Plugin | `<plugin>/skills/<skill>/SKILL.md`, неймспейс `/plugin-name:skill-name` |
Приоритет при совпадении имён: **Enterprise > Personal > Project**.
=> НАШ ВЫБОР: скилл цикла едет в репозитории пользователя как **Project skill** (`.claude/skills/`),
чтобы версионировался вместе со спекой воркфлоу; плюс опционально как plugin в marketplace.

### 5.3 Прогрессивное раскрытие (три уровня)
1. **Метаданные** (`name` + `description`) — грузятся ВСЕГДА, на каждом ходу. Это постоянная цена контекста.
2. **Тело SKILL.md** — грузится при вызове; рекомендация Anthropic — **держать < 500 строк**,
   говорить «что делать», а не «почему», ссылаться на файлы, а не встраивать.
3. **Бандл**: `reference.md`, `examples.md`, `scripts/*.py|sh`, `data/*.json` — грузятся ТОЛЬКО когда
   агент их реально читает. Ссылки обычным markdown: `[reference.md](reference.md)`.
   Скрипты **исполняются без загрузки в контекст**:
   `allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/helper.py *)` — это и есть главный
   приём экономии контекста для нашей платформы.

Структура бандла:
```
volt-workflow-loop/
  SKILL.md            # обязателен: обзор + навигация
  reference.md        # контракт MCP-тулов, коды ошибок
  examples.md
  scripts/
    validate_spec.py
  data/
    archetypes.json
```

### 5.4 Подстановки и динамический контекст
`$ARGUMENTS`, `$ARGUMENTS[N]`, `$0/$1/$2`, `$name`;
`${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}` (v2.1.196+), `${CLAUDE_SESSION_ID}`,
`${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`, `${CLAUDE_EFFORT}`.
Инъекция вывода команды до того, как Claude увидит скилл:
inline `` !`git status --short` `` или блок ```` ```! ... ``` ````.
Правила: команда падает -> вызов скилла отменяется; таймаут 2 минуты на команду;
stderr сливается в stdout; можно выключить настройкой `"disableSkillShellExecution": true`;
синхронизированные с claude.ai скиллы команды локально НЕ исполняют (v2.1.228+).

### 5.5 Жизненный цикл в контексте (важно для нашего цикла)
- отрендеренный скилл входит одним сообщением и **остаётся в контексте** на следующих ходах;
- грант `allowed-tools` снимается после следующего сообщения (то есть это не постоянные права);
- повторный идентичный вызов -> короткая пометка вместо полного текста (дедупликация);
- при авто-компакции скиллы переносятся в пределах бюджета, самые старые могут выпасть;
  после компакции переприкрепляются **первые 5000 токенов** последнего вызова каждого скилла.
  => КРИТИЧНО для нас: **первые ~5000 токенов SKILL.md должны содержать весь инвариант цикла**
  (порядок фаз, обязательные тулы, правила безопасности). Всё остальное — в reference.md.
- аудит стоимости: `/skill-doctor` (v2.1.252+).

### 5.6 Управление видимостью
`.claude/settings.local.json` -> `"skillOverrides": { "<skill>": "on"|"name-only"|"user-invocable-only"|"off" }`.
Permission-правила: `Skill`, `Skill(commit)`, `Skill(review-pr *)`.

### 5.7 AGENTS.md
UNVERIFIED (не проверял в этот заход): конвенция AGENTS.md (agents.md) — корневой markdown-файл
репозитория с инструкциями для кодовых агентов; Claude Code читает `CLAUDE.md`, поддержка
`AGENTS.md` есть как импорт/алиас. ПРОВЕРИТЬ отдельно.
ПРАКТИЧЕСКИЙ ВЫВОД независимо от этого: генерируемый нами проект воркфлоу должен класть в корень
короткий `AGENTS.md`/`CLAUDE.md` с: как поднять MCP-сервер (`.mcp.json`), какая фаза цикла,
ссылка на `.claude/skills/volt-workflow-loop/`. Дублировать туда контракт тулов НЕ надо —
он и так в `tools/list`.

Ссылки:
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/mcp
- https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- https://www.anthropic.com/engineering/writing-tools-for-agents

## 6. Конкурентное редактирование спеки агентом и UI: ВЕРДИКТ

### 6.1 Проверенные версии кандидатов (npm, 2026-09-11)
| Пакет | Версия | Лицензия | time.modified |
|---|---|---|---|
| `yjs` | 13.6.32 | MIT | 2026-08-04 |
| `y-websocket` | 3.1.0 | MIT | 2026-08-06 |
| `loro-crdt` | 1.16.1 | MIT | 2026-09-10 |
Все живые, рисков «заброшено» нет.

### 6.2 Природа задачи — не такая, как у Google Docs
Кто редактирует: **агент (Claude через MCP)** и **человек в Studio**.
Ключевые отличия от текстового коллаборативного редактора:
1. Агент пишет **не символы, а операции** (`add_node`, `bind`, `set`). У него нет курсора,
   нет посимвольного ввода, ему не нужно «видеть чужие буквы в реальном времени».
2. Спека воркфлоу — **типизированный граф с инвариантами** (типы портов, DAG без циклов,
   обязательные биндинги). CRDT гарантирует *сходимость*, но **НЕ гарантирует валидность**:
   два корректных параллельных изменения (агент удалил узел, человек привязал к нему порт)
   сольются в структурно целое, но семантически битое состояние. Это фундаментально —
   CRDT не про инварианты домена.
3. Спека **компилируется** и порождает версии/прогоны. Нужна **линейная история ревизий**
   для `version_propose(evidence)` и для `run_diff` — то есть серверный op-log нужен в любом случае.
4. Одновременных редакторов — единицы, не сотни. Конфликтов мало.

### 6.3 ВЕРДИКТ: **server-authoritative + оптимистичная блокировка по rev/ETag + op-log. CRDT НЕ НУЖЕН.**
Это не компромисс «пока хватит», а правильная архитектура для типизированного графа.
CRDT (yjs/loro) добавить позже точечно и **только** там, где он реально уместен:
свободный текст промта внутри одного узла и позиции узлов на канве (last-write-wins по полю).
Не для структуры графа.

### 6.4 Конкретная механика
**Единица записи — один тул `flow_patch` с массивом операций** (он же решает задачу
консолидации тулов из §3):
```ts
const PatchInput = z.object({
  spec_id: z.string(),
  base_rev: z.number().int(),                    // оптимистичная блокировка
  ops: z.array(Op).min(1).max(50),               // атомарно: всё или ничего
  idempotency_key: z.string().optional(),        // защита от ретраев MCP-клиента
  dry_run: z.boolean().default(false)            // "покажи, что будет" без записи
});
```
Сервер:
1. `BEGIN; SELECT rev FROM specs WHERE id=$1 FOR UPDATE;`
2. `rev !== base_rev` -> **409**, но не голый: вернуть конверт из §4 с
   `conflict: { your_base_rev, current_rev, ops_since: [...], rebase: 'auto'|'manual', rebased_ops? }`.
   Большинство конфликтов **автоматически ребейзятся**: операции затрагивают разные узлы/пути.
   Ручное разрешение нужно только при пересечении путей.
3. Применить ops -> **прогнать валидатор инвариантов** (типы, DAG, биндинги) ->
   при ошибке откатить и вернуть `problems` + `candidates` (§4).
4. `INSERT INTO spec_ops (spec_id, rev, actor, ops, ts)`; `rev := rev + 1`; `COMMIT`.
5. Ответ несёт новый `version: { rev, etag }`.

**ETag/HTTP-слой для Studio**: `GET /api/specs/:id` -> `ETag: W/"<rev>-<hash>"`;
`PATCH` с `If-Match`; 412 Precondition Failed при расхождении. Один и тот же механизм версии
у MCP (`base_rev`) и у REST (`If-Match`) — не два разных.

**Живые обновления UI**: op-log -> broadcast (SSE/WebSocket) -> Studio применяет операции
инкрементально. TanStack Query 5.102.8 держит кэш, инвалидация по `rev`.
Никакого CRDT-синка — только «сервер сказал, что rev стал 43, вот дельта».

**Мягкая блокировка на время работы агента** (дешевле, чем разруливать конфликты):
advisory-lock `flow_lock({spec_id, ttl_s: 300})`, UI показывает «Claude редактирует»,
человек может перехватить принудительно. Это устраняет большую часть конфликтов организационно.

### 6.5 Почему не CRDT — короткий аргумент для заказчика
Правило «не изобретать велосипеды» здесь работает в обратную сторону: yjs — готовая живая
библиотека, но решает **не нашу задачу**. Наша задача — транзакционная валидация типизированного
графа с линейной историей версий; готовое решение для неё — Postgres с `SELECT ... FOR UPDATE`
и таблицей op-log, а не CRDT. С CRDT пришлось бы поверх него всё равно строить серверную
валидацию и линеаризацию истории — то есть то же самое плюс лишний слой и лишний размер бандла.

### 6.6 Открытые вопросы (TODO)
- UNVERIFIED: автоматический rebase операций — нужна формальная таблица коммутативности
  (какие пары ops независимы). Проектировать вместе с §9 (компилятор).
- UNVERIFIED: делать ли `dry_run` флагом `flow_patch` или отдельным тулом `flow_validate`.
