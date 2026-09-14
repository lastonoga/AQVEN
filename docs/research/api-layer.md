# API-слой Studio <-> control plane (он же основа MCP-контракта)

Статус: DONE (2026-09-11). Все 6 пунктов закрыты. Порядок разделов в файле: 3, 1, 2, 4, 5, 6.

## 3. Стриминг прогона (SSE vs WS) — ВЕРДИКТ: SSE для прогона, WS только для логов/observability

### Что реально отдаёт @voltagent/server-hono@2.0.14
package.json deps (проверено в node_modules): hono ^4.7.7, @hono/node-server ^1.14.0,
@hono/swagger-ui ^0.5.1, openapi3-ts ^4.5.0, @voltagent/resumable-streams ^2.0.1,
@voltagent/server-core ^2.1.18, @voltagent/mcp-server ^2.0.2, @voltagent/a2a-server ^2.0.3,
fetch-to-node ^2.1.0. peer: @voltagent/core ^2.0.0, zod ^3.25 || ^4. License MIT.
=> сервер VoltAgent уже построен на Hono + генерит OpenAPI (openapi3-ts) + Swagger UI.
Это сильнейший аргумент за "REST+OpenAPI на Hono", а не tRPC (см. §1).

SSE-эндпоинты (docs/api/streaming.md):
- POST /agents/:id/chat          — AI SDK UI message stream (совместим с useChat)
- POST /agents/:id/stream        — сырой fullStream (все типы событий)
- POST /agents/:id/stream-object — частичные объекты (schema как JSON Schema в body!)
- POST /workflows/:id/stream     — ПРОГОН ВОРКФЛОУ, наш основной канал

Типы событий воркфлоу (docs/workflows/streaming.md, WorkflowStreamEvent):
```typescript
interface WorkflowStreamEvent {
  type: string;              // workflow-start | step-start | step-complete | step-error |
                             // step-suspend | workflow-suspended | workflow-complete |
                             // workflow-cancelled | workflow-error | custom (writer.write)
  executionId: string;
  from: string;              // id/имя шага
  input?: Record<string, any>;
  output?: Record<string, any>;
  status: "pending" | "running" | "success" | "error" | "suspended";
  context?: Record<string, any>;
  timestamp: string;         // ISO 8601
  stepIndex?: number;
  stepType?: string;         // agent | func | ...
  metadata?: Record<string, any>;
  error?: any;
}
```
HTTP-стрим дополнительно шлёт финальный `workflow-result`.
Методы исполнения: .stream() (AsyncIterable + .result Promise), .run(), .startAsync()
(fire-and-forget -> executionId, статус потом через workflow.memory.getWorkflowState),
.timeTravel(), .timeTravelStream() (детерминированный реплей с исторического шага —
прямо ложится на §11 отладки/step-through).

Типы событий агента в fullStream: start, start-step, finish-step, finish, abort, error;
text-start/text-delta/text-end; reasoning-*; tool-input-start/-delta/-end, tool-call,
tool-result, tool-error; source, file, raw.

### WebSocket в VoltAgent
Base `/ws`: `/ws` (echo), `/ws/logs?level=&agentId=&workflowId=&executionId=&since=&until=&limit=`,
`/ws/observability?entityType=agent|workflow&entityId=<id>`.
Конверты: `{type:"OBSERVABILITY_EVENT"|"OBSERVABILITY_LOG", success:true, data:{...}}`.
!!! ПОДВОДНЫЙ КАМЕНЬ (прямая цитата доки): "WebSockets are currently unauthenticated.
If you need auth on /ws/*, enforce it via a proxy or a custom provider."
=> в прод НЕ выставлять /ws наружу; либо наш прокси с проверкой сессии, либо не использовать.

### Рекомендация
1) Прогон воркфлоу в Studio = SSE (POST /workflows/:id/stream через наш BFF-прокси).
   Причины: POST с телом (EventSource не умеет POST), однонаправленность, переживает
   HTTP/2, дешевле в инфре, авторизуется обычным заголовком.
2) Живые логи/спаны для дебаг-панели (§11) — тянуть НЕ по /ws напрямую, а:
   v1 — по тому же SSE (события шагов достаточно) + REST-поллинг observability;
   v1.5 — свой WS-прокси, если нужны логи realtime, с проверкой сессии на нашей стороне.
3) Resumable: @voltagent/resumable-streams уже зависимость server-hono — SSE можно
   возобновлять по Last-Event-ID после reload вкладки. UNVERIFIED: точный API пакета
   (README пустой в node_modules), надо смотреть dist/*.d.ts.

### Клиент
НЕ нативный EventSource: он GET-only и не умеет заголовки (Authorization). Варианты:
- @microsoft/fetch-event-source@2.0.1, MIT, time.modified 2026-07-16. РИСК: репозиторий
  архивный/малоактивный, но код крошечный и стабильный; даёт POST+headers+retry+
  onopen/onmessage/onerror и Last-Event-ID из коробки.
- eventsource-parser@4.1.0 (MIT, 2026-08-20, живой) + свой fetch+ReadableStream — минимум
  зависимостей, парсер только SSE-фрейминга. ПРЕДПОЧТИТЕЛЬНО для ядра.
- partysocket@1.3.0 (MIT, 2026-06-23) — WebSocket/EventSource с авто-reconnect; брать,
  только если реально пойдём в WS.
Вердикт: `eventsource-parser` + тонкая обёртка `streamWorkflowRun()` на fetch.
Фолбэк — @microsoft/fetch-event-source, если не хочется писать reconnect самим.

### Интеграция с TanStack Query (@tanstack/react-query@5.102.8)
Стрим — НЕ useQuery. Схема:
- `useMutation` запускает прогон (POST /runs) -> получаем runId.
- Событийный поток держит zustand-стор прогона (@voltagent/-события -> нормализованный
  RunTimeline), потому что события приходят сотнями и не должны ре-рендерить весь кеш.
- По `workflow-complete` дергаем `queryClient.invalidateQueries({queryKey:['run',runId]})`,
  чтобы подтянуть канонический результат из БД (single source of truth = сервер, а не стрим).
- Реконнект: при обрыве повторяем с `Last-Event-ID`; если сервер не поддержал — читаем
  срез состояния GET /runs/:id (события идемпотентны по (executionId, seq)).
Сниппет:
```ts
export function useRunStream(runId: string) {
  const push = useRunStore((s) => s.push);
  useEffect(() => {
    const ctrl = new AbortController();
    const parser = createParser({
      onEvent: (e) => push(RunEvent.parse(JSON.parse(e.data))), // zod на границе!
    });
    fetch(`/api/runs/${runId}/stream`, { signal: ctrl.signal, headers: { Accept: "text/event-stream" } })
      .then(async (res) => {
        const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.feed(value);
        }
      });
    return () => ctrl.abort();
  }, [runId, push]);
}
```

---

## 1. Транспорт/контракт: ВЕРДИКТ — REST + OpenAPI на Hono (`@hono/zod-openapi`), НЕ tRPC, НЕ Server Actions

### Решающий факт (проверено в node_modules, не по памяти)
`@voltagent/server-hono@2.0.14` (core 2.10.0, server-core 2.1.20) ВНУТРИ уже построен на
`@hono/zod-openapi`: в `dist/index.d.ts` есть вендорнутые символы
`__vendor_zod_openapi_v3_OpenAPIHono | createRoute | z | extendZodWithOpenApi`,
а сигнатура конфигурации — `configureApp?: (app: OpenAPIHonoType) => void | Promise<void>`.
Экспортируется также `getEnhancedOpenApiDoc`, `extractCustomEndpoints`, `createVoltAgentApp`.
deps: `openapi3-ts ^4.5.0`, `@hono/swagger-ui ^0.5.1`. Сервер уже отдаёт OpenAPI-док + Swagger UI
(`enableSwaggerUI`, default: true в dev, false в prod).
=> Выбирая REST+OpenAPI, мы не строим велосипед, а ЛОЖИМСЯ на уже существующий контракт
control plane. tRPC пришлось бы ставить рядом вторым транспортом.

### Почему не tRPC v11 (@trpc/server 11.18.0, MIT, свежий — 2026-09-03)
- tRPC — это TypeScript-типы по проводу, а не машиночитаемая схема. Наше жёсткое требование:
  "источник правды — схема, а не TS-тип", потому что второй потребитель — MCP-агент, которому
  нужен JSON Schema для `inputSchema` каждого tool. Из tRPC JSON Schema достаётся только
  сторонним `trpc-to-openapi`/`trpc-openapi` (третья сторона, исторически отстаёт от мажоров) —
  это ровно тот велосипед, который запрещено изобретать.
- MCP-агент сидит не в нашем TS-монорепо; ему нужен HTTP-контракт, самоописывающийся по URL.
- Плюс tRPC (end-to-end типы без кодогена) мы получаем и так — через openapi-typescript.
ИСКЛЮЧЕНИЕ: если бы UI был единственным потребителем — tRPC был бы лучшим выбором.

### Почему не Next Server Actions (единственный способ)
- Server Actions = непубличный RPC с внутренним протоколом (action id), нет схемы, нет
  версионирования, недоступны MCP-агенту, плохо стримят прогрессом, тяжело тестировать вне Next.
- Роль Server Actions в итоговой архитектуре: тонкие мутации чисто UI-состояния (например,
  "переименовать вкладку", "сохранить layout канвы"), которые НЕ входят в MCP-контракт.
  Всё, что агент должен уметь сделать — только через типизированный HTTP.

### Итоговая схема генерации клиента
```
packages/contracts (единственный источник правды)
  zod-схемы домена  ->  (a) createRoute(...) в Hono  ->  GET /openapi.json (OpenAPI 3.1)
                        (b) z.toJSONSchema(...)      ->  MCP tool inputSchema/outputSchema
GET /openapi.json --(openapi-typescript@7.13.0, CI)--> packages/api-types/schema.d.ts
Studio: openapi-fetch@0.17.0 createClient<paths>() -> типизированный fetch, 2 кБ, без кодогена рантайма
```
Одна операция = один `createRoute` = одна строка в OpenAPI = один MCP tool. Дрейф контракта
ловится в CI: сгенерённый `schema.d.ts` коммитится, расхождение -> красный билд.

### Типовой слой (кто где живёт)
- control plane (Node, Hono, VoltAgent) — вся бизнес-логика и единственная реализация операций.
- MCP-сервер (`@voltagent/mcp-server` уже зависимость server-hono) — ТОНКИЙ адаптер: tool ->
  тот же use-case, что и HTTP-роут. Никакой второй реализации.
- Next.js 16.3 — Route Handler-прокси (`/api/[...path]`) только для проброса сессии в заголовок
  Authorization; UI ходит через openapi-fetch.

## 2. `@hono/zod-openapi` vs `hono-openapi` — берём `@hono/zod-openapi`

| | @hono/zod-openapi | hono-openapi |
|---|---|---|
| версия | 1.6.3 | 1.3.2 |
| license | MIT | MIT |
| time.modified | 2026-09-04 | 2026-09-06 |
| peer | zod ^4.0.0, hono >=4.10.0 | hono ^4.11.2 |
| схемы | только Zod | любой Standard Schema (zod/valibot/arktype/effect) |
| стиль | `createRoute()` декларативно, роут = объект | middleware `describeRoute()` поверх обычных роутов |
| типизация ответа | да (RouteConfigToTypedResponse) | слабее, спека отдельно от хендлера |
| VoltAgent использует | ДА (вендорит внутри server-hono) | нет |

Вердикт: `@hono/zod-openapi@1.6.3` — совпадает с тем, что уже внутри VoltAgent, даёт
типизированный ответ и валидацию из одной декларации. `hono-openapi` брать только если
понадобится не-Zod валидатор (нам не нужен).

API `hono-openapi@1.3.2` (проверено по dist/index.d.ts, на случай если понадобится):
`describeRoute(spec)`, `validator(schema, target)`, `resolver(schema)`, `describeResponse()`,
`openAPIRouteHandler(hono, options)`, `generateSpecs(hono, options, c)`, `clearSpecsContext()`.

### Реальный сниппет: одна операция -> HTTP + OpenAPI + MCP
```ts
// packages/contracts/src/workflow.ts
import { z } from "zod";

export const StartRunInput = z.object({
  workflowId: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  mode: z.enum(["run", "debug"]).default("run"),
}).meta({ id: "StartRunInput" });

export const StartRunOutput = z.object({
  runId: z.string(),
  status: z.enum(["queued", "running"]),
}).meta({ id: "StartRunOutput" });

export type StartRunInput = z.infer<typeof StartRunInput>;
```
```ts
// apps/control-plane/src/http/routes/start-run.ts
import { createRoute, z, OpenAPIHono } from "@hono/zod-openapi";
import { StartRunInput, StartRunOutput } from "@acme/contracts";
import { ApiError } from "@acme/contracts/errors";

export const startRunRoute = createRoute({
  method: "post",
  path: "/v1/runs",
  operationId: "startRun",                 // = имя MCP-tool, стабильный ключ операции
  tags: ["runs"],
  summary: "Start a workflow run",
  request: { body: { content: { "application/json": { schema: StartRunInput } } } },
  responses: {
    202: { description: "Accepted", content: { "application/json": { schema: StartRunOutput } } },
    422: { description: "Contract violation", content: { "application/json": { schema: ApiError } } },
  },
});

export const registerStartRun = (app: OpenAPIHono, useCase: StartRunUseCase) =>
  app.openapi(startRunRoute, async (c) => {
    const body = c.req.valid("json");        // уже провалидировано и типизировано
    const res = await useCase.execute(body, c.get("user"));
    return c.json(res, 202);
  });
```
```ts
// apps/control-plane/src/index.ts — монтируем в сервер VoltAgent
import { VoltAgent } from "@voltagent/core";
import { honoServer } from "@voltagent/server-hono";

new VoltAgent({
  workflows,
  server: honoServer({
    enableSwaggerUI: true,
    configureApp: (app) => { registerStartRun(app, container.startRun); },
    authNext: { provider, publicRoutes: ["GET /health"] },
  }),
});
```
Один и тот же use-case в MCP:
```ts
// tool.inputSchema — JSON Schema прямо из того же zod
const inputSchema = z.toJSONSchema(StartRunInput, { target: "draft-2020-12", io: "input" });
```

### Клиент Studio
```bash
npx openapi-typescript http://localhost:3141/doc -o packages/api-types/schema.d.ts
```
```ts
import createClient from "openapi-fetch";
import type { paths } from "@acme/api-types";

export const api = createClient<paths>({ baseUrl: "/api" });
const { data, error } = await api.POST("/v1/runs", { body: { workflowId, input, mode: "run" } });
// data: StartRunOutput | undefined, error: ApiError | undefined — оба типизированы из схемы
```

### ПОДВОДНЫЕ КАМНИ
- В `dist/index.d.ts` у server-hono вендорный слой помечен `__vendor_zod_openapi_v3_*` и
  импортирует типы `ZodObject/ZodTypeAny/ZodEffects` из `zod` (это API zod v3!). Peer сам
  пакет объявляет `zod ^3.25.0 || ^4.0.0`. РИСК: при zod@4.6.2 в монорепо типы вендорного
  OpenAPIHono могут не сойтись с нашими zod-v4-схемами.
  Митигация: ставить `@hono/zod-openapi@1.6.3` явно как свою зависимость и импортировать
  `createRoute/OpenAPIHono` из НЕГО, а в `configureApp` кастовать app; в прод-варианте —
  держать наши роуты в отдельном `new OpenAPIHono()` и монтировать через `app.route("/v1", api)`.
  TODO(проверить компиляцией): собрать мини-проект с volt server-hono + zod4 и прогнать tsc.
- Swagger UI в проде по умолчанию выключен (`enableSwaggerUI` default false in prod) — для
  публикации `/openapi.json` наружу в CI нужен отдельный вызов `getEnhancedOpenApiDoc`/`app.doc31`.
- `app.doc()` даёт OpenAPI 3.0, `app.doc31()` — 3.1. openapi-typescript@7 понимает оба;
  для JSON-Schema-совместимости с MCP берём 3.1.

---

## 4. Аутентификация: ВЕРДИКТ — better-auth@1.7.4 (MIT), плагины `jwt` + `bearer` + `organization`

### Версии/лицензии (npm, 2026-09-11)
| пакет | version | license | time.modified | комментарий |
|---|---|---|---|---|
| better-auth | 1.7.4 | MIT | 2026-09-10 | живой, релиз вчера |
| @better-auth/sso | 1.7.4 | MIT | 2026-09-10 | SAML/OIDC SSO для энтерпрайза, тот же мажор |
| @better-auth/cli | 1.4.21 | MIT | 2026-08-19 | генерация/миграция схемы БД |
| next-auth (Auth.js v5) | 5.0.0-beta.32 (tag `beta`) | ISC | latest=4.24.15 (2026-07-20) | v5 ВСЁ ЕЩЁ BETA |
| @auth/core | 0.41.3 | ISC | 2026-07-20 | ядро Auth.js, до сих пор 0.x |
| @clerk/nextjs | 7.9.2 | MIT | 2026-09-11 | SDK MIT, но сервис — платный SaaS |
| @clerk/backend | 3.17.2 | MIT | — | для верификации токена на control plane |

Плагины better-auth 1.7.4 (проверено по `package.json#exports`, не по памяти):
`access, admin, anonymous, bearer, custom-session, device-authorization, email-otp,
generic-oauth, haveibeenpwned, jwt, magic-link, multi-session, oauth-proxy, one-time-token,
organization, phone-number, siwe, two-factor, username` (+ на диске: captcha, last-login-method,
one-tap, oauth-popup, open-api, additional-fields).
ВАЖНО: в 1.7.4 НЕТ экспортов `plugins/api-key`, `plugins/mcp`, `plugins/oidc-provider`.
UNVERIFIED: возможно они переехали в отдельные пакеты или появились позже — если нужен
OAuth-provider для MCP, это надо проверить отдельно, НЕ закладываться.

### Почему better-auth
1. Self-hosted, MIT, данные пользователей в нашей БД — для внутреннего инструмента с секретами
   провайдеров (§ключи моделей) отдавать identity в чужой SaaS не хочется.
2. `organization` плагин из коробки = мультитенантность v2 (organization, member, invitation,
   роли через `plugins/access` — ac/roles/permissions). Не надо доклеивать своё.
3. `jwt` плагин выдаёт JWT + публикует JWKS (`/api/auth/jwks`) — а `@voltagent/server-core`
   имеет `jwtAuth({ secret, mapUser, verifyOptions })`, то есть стыкуется напрямую.
4. У VoltAgent есть ОФИЦИАЛЬНЫЙ рецепт better-auth в доках
   (`@voltagent/core/docs/api/authentication.md`, раздел "Better Auth") — сигнал, что связка живая.

### Почему не Auth.js v5 и не Clerk
- Auth.js v5: `5.0.0-beta.32`, ядро `@auth/core@0.41.3` — бета/0.x годами, ломающие изменения
  между бетами, нет мультитенантности/организаций/API-ключей вообще. Для системы, которая
  должна выдавать токены агентам — не подходит.
- Clerk: отличный DX и организации есть, но (а) SaaS-зависимость и цена на seat, (б) наружная
  identity для внутреннего инструмента, (в) вендор-лок на UI-компоненты. Оставляем как
  запасной вариант, если понадобится SOC2-готовый SSO без своей работы: VoltAgent имеет
  рецепт Clerk (JWKS) в тех же доках, и переключение = замена `AuthProvider`.
Архитектурно это Strategy: `AuthProvider` — шов, поставщик заменяем без изменения операций.

### Как токен получают UI и MCP-агент (одна модель, два входа)
```
Человек:  браузер -> better-auth session cookie (HttpOnly) на домене Studio
          -> Next Route Handler /api/[...path] читает сессию, кладёт Bearer в прокси-запрос
          -> control plane: authNext.provider.verifyToken(token) -> user {id, tenantId, role}

MCP-агент (Claude): долгоживущий credential, привязанный к (user, tenant, scopes)
          -> заголовок Authorization: Bearer <token> у каждого MCP-tool-вызова
          -> тот же verifyToken -> тот же user-объект -> те же проверки прав в use-case
```
Реализация токена для агента, v1 (по убыванию предпочтительности):
1. `better-auth/plugins/jwt` — короткоживущий JWT (RS256) + JWKS; агент обновляет его через
   `one-time-token` или `device-authorization` (OAuth device flow — ровно сценарий CLI/агента).
2. Свой `agent_keys` (prefix + hash) — только если 1 не хватит; тогда это НАШ код, а значит
   минимальный: таблица + `AuthProvider.verifyToken`.
ЗАПРЕЩЕНО: отдавать агенту сессионную cookie человека — теряется аудит "кто сделал".

### Сниппет стыковки (VoltAgent AuthProvider из официальной доки, verbatim-совместимо)
```ts
import { betterAuth } from "better-auth";
import type { AuthProvider } from "@voltagent/server-core";

const auth = betterAuth({ /* ... */ });

const provider: AuthProvider = {
  type: "better-auth",
  async verifyToken(token, request) {
    const headers = new Headers();
    headers.set("Authorization", request?.headers?.get("authorization") ?? `Bearer ${token}`);
    const cookie = request?.headers?.get("cookie");
    if (cookie) headers.set("Cookie", cookie);
    const result = await auth.api.getSession({ headers });
    return result?.user ?? null;
  },
};

new VoltAgent({
  workflows,
  server: honoServer({ authNext: { provider, publicRoutes: ["GET /health"] } }),
});
```
Порядок разрешения доступа (authNext): public routes -> console routes (Console Access Key)
-> user routes (provider). `jwtAuth` умеет `mapUser: (payload) => ({id, email, tenantId, role})`
— tenantId прокидывается сразу, роль/тенант проверяем в своих хендлерах (дока прямо говорит:
"role and tenant checks live in your handlers or middleware").

### ПОДВОДНЫЕ КАМНИ auth
- Доки VoltAgent противоречат сами себе про WS: `api/streaming.md` — "WebSockets are currently
  unauthenticated"; `api/authentication.md` — "используйте `?key=` (console) / `?token=` (user)".
  Считаем WS небезопасным по умолчанию и не выставляем наружу (см. §3).
- Console Access Key — отдельный контур от пользовательской аутентификации; в проде
  VoltOps-консоль либо выключить, либо закрыть сетью.
- Dev bypass (`?dev=true`) ДОЛЖЕН быть недоступен в production-сборке — проверить явным тестом.

---

## 5. Валидация и типобезопасность на границе

### Единый пакет схем `packages/contracts` (единственный источник правды)
Содержит ТОЛЬКО zod-схемы + выведенные типы, без рантайм-зависимостей на Hono/Next/VoltAgent.
Потребители: control plane (createRoute), MCP-сервер (toJSONSchema), Studio (типы + клиентская
валидация форм), тесты, экспорт спеки (§15.1).
Это Dependency Inversion: и HTTP, и MCP зависят от абстракции-схемы, а не друг от друга.

### zod@4.6.2 -> JSON Schema (ПРОВЕРЕНО запуском, не по памяти)
`z.toJSONSchema(schema, { target, io })` встроен в zod v4 — сторонний `zod-to-json-schema@3.25.2`
(ISC, last modified 2026-03-27, признаки стагнации) НЕ НУЖЕН.
```ts
const S = z.object({
  id: z.string().uuid(),
  n: z.number().int().min(1).default(3),
}).meta({ id: "RunInput", description: "run input" });

z.toJSONSchema(S, { target: "draft-2020-12" });   // для MCP tool inputSchema
z.toJSONSchema(S, { target: "openapi-3.0", io: "input" }); // для OpenAPI 3.0-компонент
```
Фактический вывод (сокращённо), draft-2020-12:
`{"$schema":"https://json-schema.org/draft/2020-12/schema","$ref":"#/$defs/RunInput",
"$defs":{"RunInput":{"type":"object","properties":{"id":{"type":"string","format":"uuid",
"pattern":"^([0-9a-fA-F]{8}-...)$"},"n":{"default":3,"type":"integer","minimum":1,
"maximum":9007199254740991}},"required":["id","n"],"additionalProperties":false,...}}}`

ГРАБЛИ (реально воспроизведены):
- `.meta({ id })` -> схема выносится в `$defs/<id>` и ссылается через `$ref`. Часть MCP-клиентов
  плохо переваривает `$ref` в `inputSchema`. Для MCP-tool лучше `z.toJSONSchema(S, { io:"input" })`
  БЕЗ `.meta({id})` на корне, либо инлайнить `$defs` самим.
- `io` по умолчанию = `"output"`, поэтому поле с `.default(3)` попадает в `required`. Для
  ВХОДНЫХ схем всегда передавать `io: "input"`, иначе агент будет обязан слать необязательное поле.
- `z.number().int()` дорисовывает `maximum: 9007199254740991` — шумит в промпте тула; при
  необходимости чистить постпроцессором.
- `target: "openapi-3.0"` кладёт в `definitions`, а не `$defs` — для 3.1 (`app.doc31`) берём
  draft-2020-12.

### Версионирование API и обратная совместимость
- Префикс пути `/v1/...`. `operationId` == имя MCP-tool == стабильный идентификатор операции
  спеки (§15.1). Переименование operationId = ломающее изменение, запрещено внутри мажора.
- Правила аддитивности внутри `/v1`: можно добавлять опциональные поля запроса и новые поля
  ответа; нельзя — делать поле обязательным, сужать enum, менять тип, удалять поле.
- Механика контроля: `openapi.json` коммитится в репо; CI сравнивает старую и новую спеку
  (diff-гейт) и падает на breaking change. Отдельный снапшот-тест: для каждого operationId
  фиксируем `z.toJSONSchema(input, {io:"input"})` — любой дрейф MCP-контракта виден в diff.
- Схема артефакта воркфлоу версионируется отдельным полем `schemaVersion` внутри документа
  (миграции граф-документа != версия HTTP API), иначе экспорт/импорт §15.1 развалится.
- Deprecation: `deprecated: true` в createRoute -> попадает в OpenAPI -> MCP-описание тула
  получает префикс "DEPRECATED:", агент перестаёт выбирать операцию.

### Где валидируем
Вход: `c.req.valid("json"|"query"|"param")` — валидация в самом роуте (одна декларация).
Выход: ответы тоже описаны схемой в `responses` -> в dev включить strict-проверку ответа
(парсить перед отдачей), в prod — только типы, чтобы не платить за parse на горячем пути.
Стрим: КАЖДОЕ SSE-событие парсится `RunEvent.parse()` на клиенте (см. §3) — стрим приходит
из чужого рантайма (VoltAgent) и это реальная граница доверия.

---

## 6. Единый формат ошибки (§9) в HTTP и в MCP

### Схема (packages/contracts/errors.ts)
```ts
import { z } from "zod";

export const ErrorCode = z.enum([
  "contract_violation",   // не сходятся слоты/типы между узлами (§9)
  "validation_failed",    // вход не прошёл схему
  "not_found",
  "conflict",             // оптимистическая блокировка документа воркфлоу
  "unauthorized",
  "forbidden",
  "provider_error",       // ошибка LLM-провайдера
  "run_failed",
  "internal",
]);

export const ErrorDetail = z.object({
  rule: z.string(),                              // идентификатор нарушенного правила, напр. "slot.type.mismatch"
  node: z.string().nullable(),                   // id узла графа
  slot: z.string().nullable(),                   // id слота (входа/выхода)
  message: z.string(),                           // человекочитаемо
  expected: z.unknown().optional(),              // ожидаемый тип/схема
  actual: z.unknown().optional(),
  candidates: z.array(z.object({                 // ЧТО ПРЕДЛОЖИТЬ АГЕНТУ/ЧЕЛОВЕКУ
    action: z.string(),                          // "connect" | "insert-transform" | "change-type" | ...
    label: z.string(),
    patch: z.unknown().optional(),               // готовый JSON-patch к документу воркфлоу
    confidence: z.number().min(0).max(1).optional(),
  })).default([]),
  path: z.array(z.union([z.string(), z.number()])).default([]), // путь внутри входного JSON
}).meta({ id: "ErrorDetail" });

export const ApiError = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),                         // одна строка-резюме
    requestId: z.string(),                       // == traceId в Langfuse/OTel
    runId: z.string().nullable().optional(),
    details: z.array(ErrorDetail).default([]),
    retryable: z.boolean().default(false),
    docs: z.string().url().optional(),           // ссылка на объяснение правила
  }),
}).meta({ id: "ApiError" });
export type ApiError = z.infer<typeof ApiError>;
```
Ключевая идея: `candidates[].patch` — это исполняемое предложение исправления. Агент по MCP
получает ошибку и может СРАЗУ применить патч, не выдумывая структуру документа. Человек в
Studio видит тот же список как кнопки "Починить". Один формат — два UI.

### HTTP
- Коды: 400 `validation_failed`, 401/403, 404, 409 `conflict`, 422 `contract_violation`
  (граф синтаксически валиден, но нарушает правило типизации), 424/502 `provider_error`,
  500 `internal`. Тело — всегда `ApiError`.
- Регистрируется в каждом `createRoute` -> попадает в OpenAPI -> `openapi-fetch` отдаёт
  типизированный `error` без ручных кастов.
- `requestId` кладём и в заголовок `x-request-id`, чтобы его было видно при обрыве стрима.

### MCP
MCP-tool при ошибке возвращает результат с `isError: true` и content-блоком; структурированную
часть кладём и туда, и в `structuredContent`:
```ts
return {
  isError: true,
  content: [{ type: "text", text: renderErrorForAgent(apiError) }], // компактный текст: правило + топ-3 кандидата
  structuredContent: apiError,                                       // тот же ApiError целиком
};
```
`renderErrorForAgent` — единственное место, где формат превращается в текст; правило "агент
читает текст, но действует по structuredContent". Ошибки протокола MCP (JSON-RPC error) НЕ
использовать для доменных ошибок — агент должен получать их как обычный результат и уметь
чинить.
ПРОВЕРЕНО: `structuredContent` присутствует в `@modelcontextprotocol/sdk@1.30.0`
(`dist/esm/types.d.ts`: `structuredContent: z.ZodOptional<z.ZodObject<{}, z.core.$loose>>` в
CallToolResult), т.е. поле есть и типизировано как свободный объект. Внутри VoltAgent MCP-сервер
— `@voltagent/mcp-server@2.2.0` (зависимость server-hono).

### Один транслятор
`DomainError -> ApiError` живёт в одном модуле (`packages/contracts/map-error.ts`) и
используется и HTTP-миддлварой Hono (`app.onError`), и MCP-адаптером. Дублирования нет,
это Adapter поверх одного доменного типа ошибки.
