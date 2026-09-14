# AI SDK: какую мажорную версию берём и как живём с конфликтом

Дата: 2026-09-11. Автор: research-subagent.
Исходный факт (проверен ведущим): `@voltagent/core@2.10.0` peer `ai: ^6.0.0`
(ставится только с `ai@6.0.280`); `@openrouter/ai-sdk-provider@3.0.0` peer `ai: ^7.0.0`.

## 1. Таблица peerDependencies провайдеров

**ГЛАВНЫЙ ФАКТ (проверено чтением package.json в реально установленном дереве
`/private/tmp/.../scratchpad/probe/node_modules`):**
официальные пакеты `@ai-sdk/*` **вообще не имеют peer-зависимости на `ai`**.
Их единственный peer — `zod: ^3.25.76 || ^4.1.8`. Связь с рантаймом идёт через
обычные (не peer) зависимости `@ai-sdk/provider` и `@ai-sdk/provider-utils`.
То есть «конфликт мажоров AI SDK» касается ТОЛЬКО сторонних провайдеров
(`@openrouter/ai-sdk-provider`), а не линейки Vercel.

| Пакет | Установленная версия | peerDependencies | dependencies (ядро) | Лицензия |
|---|---|---|---|---|
| `ai` | 6.0.280 | `zod: ^3.25.76 \|\| ^4.1.8` | `@ai-sdk/provider@3.0.16`, `@ai-sdk/provider-utils@4.0.51`, `@ai-sdk/gateway@3.0.191`, `@opentelemetry/api@^1.9.0` | Apache-2.0 |
| `@ai-sdk/provider` | 3.0.16 | — (нет) | — | Apache-2.0 |
| `@ai-sdk/provider-utils` | 4.0.51 | `zod` | — | Apache-2.0 |
| `@ai-sdk/openai` | 3.0.112 | `zod` только | `provider@3.0.16`, `provider-utils@4.0.51` | Apache-2.0 |
| `@ai-sdk/anthropic` | 3.0.117 | `zod` только | те же | Apache-2.0 |
| `@ai-sdk/google` | 3.0.122 | `zod` только | те же | Apache-2.0 |
| `@ai-sdk/google-vertex` | 3.0.174 | `zod` только | те же | Apache-2.0 |
| `@ai-sdk/openai-compatible` | 2.0.75 | `zod` только | `provider@3.0.16`, `provider-utils@4.0.51` | Apache-2.0 |
| `@ai-sdk/togetherai` | 2.0.81 | `zod` только | `@ai-sdk/openai-compatible@2.0.75` + provider/provider-utils | Apache-2.0 |
| `@ai-sdk/groq` | 3.0.65 | `zod` только | те же | Apache-2.0 |
| `@ai-sdk/mistral` | 3.0.64 | `zod` только | те же | Apache-2.0 |
| `@ai-sdk/deepseek` | 2.0.63 | `zod` только | те же | Apache-2.0 |
| `@ai-sdk/cerebras` | 2.0.81 | `zod` только | те же | Apache-2.0 |
| `@ai-sdk/deepinfra` | 2.0.79 | `zod` только | те же | Apache-2.0 |
| `@ai-sdk/xai` | 3.0.131 | `zod` только | те же | Apache-2.0 |
| `@ai-sdk/amazon-bedrock` | 3.0.130 | `zod` только | те же | Apache-2.0 |
| `@ai-sdk/azure` | 3.0.119 | `zod` только | те же | Apache-2.0 |
| `@ai-sdk/cohere` | 3.0.61 | `zod` только | те же | Apache-2.0 |
| `@ai-sdk/perplexity` | 3.0.60 | `zod` только | те же | Apache-2.0 |
| `@ai-sdk/gateway` | 3.0.191 | `zod` только | те же | Apache-2.0 |
| **`@openrouter/ai-sdk-provider` 2.x** | **2.10.0** | **`ai: ^6.0.0`**, `zod: ^3.25.0 \|\| ^4.0.0` | — | Apache-2.0 |
| `@openrouter/ai-sdk-provider` 3.x | 3.0.0 | `ai: ^7.0.0` (проверено ведущим) | — | Apache-2.0 |

### Следствие: конфликта у нас НЕТ
`@openrouter/ai-sdk-provider@2.10.0` объявляет peer `ai: ^6.0.0` — ровно то, что требует
`@voltagent/core@2.10.0`. Обе зависимости уже стоят в одном дереве `probe/node_modules`
рядом с `ai@6.0.280` и `@voltagent/core@2.10.0`. Брать 3.x (peer `ai@^7`) не нужно
и нельзя, пока VoltAgent на v6.


## 2. Рабочий набор @ai-sdk/* под ai@6 (проверено установкой и запуском)

### Правило совместимости (вывели из pin-ов, а не из peer)
`ai` пинит **точные** версии ядра, провайдеры — тоже точные. Мажор ядра и есть реальный контракт:

| Линия | `ai` | `@ai-sdk/provider` | `@ai-sdk/provider-utils` | spec моделей | мажоры провайдеров |
|---|---|---|---|---|---|
| **v6 (наша)** | 6.0.280 | **3.0.16** | **4.0.51** | `LanguageModelV3` | openai/anthropic/google/xai/azure/groq/mistral/perplexity/cohere/bedrock/gateway = **3.x**; openai-compatible/togetherai/cerebras/deepinfra/deepseek/vercel = **2.x** |
| v7 | 7.0.97 | 4.0.13 | 5.0.39 | `LanguageModelV4` | openai = **4.x**, openai-compatible/togetherai = **3.x** |

`@voltagent/core@2.10.0` peer прямо это фиксирует: `"@ai-sdk/provider-utils": "4.x"` + `"ai": "^6.0.0"`.
Смешать `@ai-sdk/openai@4` с `ai@6` нельзя: npm поставит вторую копию `@ai-sdk/provider@4.0.13`,
модель отдаст `specificationVersion: 'v4'`, а `ai@6` умеет только `v3` → рантайм-ошибка спеки,
причём **npm не предупредит**, потому что peer на `ai` нет.

### ВАЖНО: провайдеры уже приходят из @voltagent/core
`npm ls @ai-sdk/openai --all` показывает, что **все провайдеры — прямые dependencies
`@voltagent/core@2.10.0`** (не peer, не optional):

```
@voltagent/core@2.10.0
 +-- @ai-sdk/amazon-bedrock@3.0.130   +-- @ai-sdk/anthropic@3.0.117
 +-- @ai-sdk/azure@3.0.119            +-- @ai-sdk/cerebras@2.0.81
 +-- @ai-sdk/cohere@3.0.61            +-- @ai-sdk/deepinfra@2.0.79
 +-- @ai-sdk/gateway@3.0.191          +-- @ai-sdk/google@3.0.122
 +-- @ai-sdk/google-vertex@3.0.174    +-- @ai-sdk/groq@3.0.65
 +-- @ai-sdk/mistral@3.0.64           +-- @ai-sdk/openai@3.0.112
 +-- @ai-sdk/openai-compatible@2.0.75 +-- @ai-sdk/perplexity@3.0.60
 +-- @ai-sdk/togetherai@2.0.81        +-- @ai-sdk/vercel@2.0.77
 +-- @ai-sdk/xai@3.0.131              +-- @aihubmix/ai-sdk-provider@1.0.3
 +-- ollama-ai-provider-v2 +-- workers-ai-provider@3.3.1
 +-- @gitlab/gitlab-ai-provider +-- @mymediset/sap-ai-provider
```

Подводный камень: `@ai-sdk/google-vertex@3.0.174` тянет **вложенный** `@ai-sdk/openai-compatible@1.0.54`
и `@ai-sdk/anthropic@2.0.102` (не дедуплицируются). Это ок для рантайма (изолированные копии),
но раздувает node_modules и может путать резолв типов в монорепе с `pnpm`.
Рекомендация: **всё равно объявлять нужные провайдеры явно в своём package.json** с точным
мажором из таблицы выше — иначе мы зависим от транзитивного хойстинга, который сломается
при переезде на pnpm/yarn PnP.

### Проверенный рабочий набор (реально установлен, `ai@6.0.280`)
```json
{
  "dependencies": {
    "ai": "6.0.280",
    "@voltagent/core": "2.10.0",
    "@ai-sdk/openai": "^3.0.112",
    "@ai-sdk/anthropic": "^3.0.117",
    "@ai-sdk/google": "^3.0.122",
    "@ai-sdk/openai-compatible": "^2.0.75",
    "@ai-sdk/togetherai": "^2.0.81",
    "@openrouter/ai-sdk-provider": "^2.10.0",
    "zod": "^4.6.2"
  }
}
```

### Рантайм-проверка (`probe/smoke.mjs`, реально выполнена)
```
openrouter        | specificationVersion = v3 | provider = openrouter        | modelId = openai/gpt-5.1
openaiCompatible  | specificationVersion = v3 | provider = openrouter.chat   | modelId = moonshotai/kimi-k2
togetherai        | specificationVersion = v3 | provider = togetherai.chat   | modelId = meta-llama/Llama-3.3-70B-Instruct-Turbo
openai            | specificationVersion = v3 | provider = openai.responses  | modelId = gpt-5.1
ai exports ok: true   // generateObject, generateText, streamText, tool, wrapLanguageModel,
                      // extractReasoningMiddleware, defaultSettingsMiddleware, simulateStreamingMiddleware
```
Все четыре провайдера отдают **одну и ту же** спеку `v3` → взаимозаменяемы в наших узлах.
Файл: `/private/tmp/.../scratchpad/probe/smoke.mjs`.

### Свежесть (npm view, 2026-09-11)
| Пакет | latest (v7-линия) | наш пин (v6-линия) | time.modified | риск |
|---|---|---|---|---|
| `ai` | 7.0.97 | 6.0.280 | 2026-09-09 | нет, релизы ежедневные |
| `@ai-sdk/openai` | 4.0.65 | 3.0.112 | 2026-09-09 | нет |
| `@ai-sdk/openai-compatible` | 3.0.47 | 2.0.75 | 2026-09-09 | нет |
| `@ai-sdk/togetherai` | 3.0.48 | 2.0.81 | 2026-09-09 | нет |
| `@openrouter/ai-sdk-provider` | 3.0.0 | **2.10.0** | 2026-08-14 | умеренный: 2.x в maintenance после выхода 3.0.0 (14.08.2026), апстрим перешёл на ai@7 |


## 3. Что изменилось между AI SDK v6 и v7

Источник: официальный migration guide https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0
(WebFetch, 2026-09-11). Локально в пакете есть только гайды до 6.0:
`node_modules/ai/docs/08-migration-guides/24-migration-guide-6-0.mdx`.

### Ломает окружение
- **Минимум Node.js 22** (18/20 больше не поддерживаются).
- **ESM-only**: `require()` убран. → для нас: наш пакет-адаптер должен быть ESM; проверить,
  что Next 16 / tsx / vitest 5 в проекте не тянут CJS-сборку.

### Ломает наш прикладной код (по убыванию влияния)
| v6 | v7 | наше влияние |
|---|---|---|
| `system: '...'` | **`instructions: '...'`** | ВЫСОКОЕ: в каждом LLM-узле. Плюс системные сообщения внутри `messages` теперь отвергаются, если не передать `allowSystemInMessages: true` |
| `experimental_telemetry` | `telemetry`; **OTel вынесен в отдельный пакет `@ai-sdk/otel`**; телеметрия теперь opt-out; `tracer` убран из опций | ВЫСОКОЕ: у нас телеметрия — ядро провенанса |
| `needsApproval` на tool | deprecated → настройка `toolApproval` | ВЫСОКОЕ, если строим human-gate на approvals |
| `CallSettings` | распался на `LanguageModelCallOptions` + `RequestOptions` | типы в нашем IR→AI-SDK маппере |
| `ToolCallOptions` | `ToolExecutionOptions` | типы исполнителей узлов |
| `stepCountIs(n)` | `isStepCount(n)` | условия остановки агентного цикла |
| `onFinish` / `onStepFinish` | `onEnd` / `onStepEnd` (старые — deprecated-алиасы) | хуки |
| `experimental_onToolCallStart/Finish` | `onToolExecutionStart/End` | хуки |
| `experimental_context` | `context` (теперь tool-scoped через `contextSchema`); общее состояние → `runtimeContext` | проброс контекста в узлы |
| `experimental_activeTools` | `activeTools` | |
| `experimental_prepareStep` | `prepareStep` | |
| `StreamTextResult.fullStream` | `.stream` | стриминг в UI |
| `includeRawChunks` / `experimental_include` | `include.rawChunks` / `include`; **тела request/response по умолчанию исключены**, нужен opt-in `include` | ВЫСОКОЕ: без opt-in потеряем сырые тела в провенансе |
| `usage` = последний шаг, `totalUsage` = сумма | **`usage` = сумма всех шагов**, `totalUsage` deprecated | учёт бюджета: молчаливое изменение семантики |
| `usage.cachedInputTokens` | `inputTokenDetails.cacheReadTokens` | учёт кеша |
| `usage.reasoningTokens` | `outputTokenDetails.reasoningTokens` | учёт reasoning |
| верхнеуровневые `content/toolCalls/toolResults/files/sources/warnings` = последний шаг | теперь **по всем шагам**; данные последнего шага → `result.finalStep` | парсинг результатов |
| tool result `type: 'media'` | `type: 'file-data'`; `image-*`/`file-*` → единый `file` + `mediaType` | мультимодальные узлы |
| `{ type: 'image', image }` в сообщении | `{ type: 'file', data, mediaType: 'image' }` | |
| `experimental_customProvider`, `experimental_generateImage`, `experimental_transcribe`, `experimental_generateSpeech` | без префикса | косметика (в v6 уже есть оба имени) |
| `experimental_output` / `result.experimental_output` | `output` / `result.output` | |

### Чего в списке НЕТ (важно)
`generateObject`/`streamObject` в части `schema`/`schemaName`/`schemaDescription`/`output`
**не ломаются**. Наш контракт структурированного вывода переживает миграцию почти без правок.
Основной удар — по `system`→`instructions`, телеметрии и учёту usage.

### Вывод по миграции
Переход v6→v7 — это **широкий, но механический diff по местам вызова**, а не смена парадигмы.
Если все вызовы `generateObject`/`generateText`/`streamText` спрятаны за одним фасадом,
миграция = правка одного пакета.


## 4. API структурированного вывода в ai@6

Источник: `probe/node_modules/ai/dist/index.d.ts` (v6.0.280), строки указаны.

### `generateObject` — строка 5304
**`mode` УДАЛЁН.** В v6 нет `mode: 'json' | 'tool' | 'auto'` (был в v3/v4). Режим выбирает
провайдер сам; влиять можно только через `providerOptions`. Переносить старые сниппеты с `mode` нельзя.

Ось режимов теперь — дискриминант `output`:

```ts
generateObject<SCHEMA, OUTPUT extends 'object' | 'array' | 'enum' | 'no-schema'>(options)
  : Promise<GenerateObjectResult<RESULT>>
```

| `output` | обязательные поля | тип результата |
|---|---|---|
| `'object'` (дефолт) | `schema` | `InferSchema<SCHEMA>` |
| `'array'` | `schema` (схема ЭЛЕМЕНТА) | `Array<InferSchema<SCHEMA>>` |
| `'enum'` | `enum: Array<RESULT>` (и НЕ `schema`) | член перечисления |
| `'no-schema'` | ничего | `JSONValue` |

Общие опции (`Omit<CallSettings,'stopSequences'> & Prompt & {...}`):
```ts
{
  model: LanguageModel,                  // объект модели или строка id
  schema: SCHEMA,                        // FlexibleSchema: zod v3/v4, Standard Schema или jsonSchema()
  schemaName?: string,                   // «Used by some providers ... via tool or schema name»
  schemaDescription?: string,
  output?: 'object'|'array'|'enum'|'no-schema',
  experimental_repairText?: RepairTextFunction,   // чинит невалидный JSON до парсинга
  experimental_telemetry?: TelemetrySettings,
  experimental_download?: DownloadFunction,
  providerOptions?: ProviderOptions,
  // из CallSettings: temperature, topP, topK, presencePenalty, frequencyPenalty, seed,
  //   maxOutputTokens, maxRetries, abortSignal, headers  (stopSequences тут исключён)
}
```

`GenerateObjectResult<OBJECT>` — строка 5179:
```ts
{
  readonly object: OBJECT;
  readonly reasoning: string | undefined;      // конкатенация reasoning-частей
  readonly finishReason: FinishReason;
  readonly usage: LanguageModelUsage;
  readonly warnings: CallWarning[] | undefined; // «unsupported settings» — ЛОГИРОВАТЬ в провенанс
  readonly request: LanguageModelRequestMetadata;
  readonly response: LanguageModelResponseMetadata & { body?: unknown };
  readonly providerMetadata: ProviderMetadata | undefined;  // сюда провайдеры кладут cost/cache
  toJsonResponse(init?: ResponseInit): Response;
}
```
Ошибка при невалидной структуре — `NoObjectGeneratedError` (есть в экспортах). Для узла
`structured` это точка ретрая/репэйра.

`streamObject` — строка ~5629, тот же набор опций (`schemaName`/`schemaDescription` на 5670/5676),
результат `StreamObjectResult` с `partialObjectStream` и `DeepPartial<T>`.

### `tool()` — `@ai-sdk/provider-utils@4.0.51:1276`, реэкспорт из `ai`
```ts
declare function tool<INPUT, OUTPUT>(tool: Tool<INPUT, OUTPUT>): Tool<INPUT, OUTPUT>;
declare function dynamicTool(tool: { description?, title?, providerOptions?, metadata?, ... });
```
Ключевое для нас поле (`provider-utils:1176`):
```ts
needsApproval?: boolean | ToolNeedsApprovalFunction<INPUT>
```
→ **встроенный human-in-the-loop на уровне AI SDK v6**: `ToolApprovalRequestOutput`,
`ToolCallNotFoundForApprovalError`, `InvalidToolApprovalError`,
`lastAssistantMessageIsCompleteWithApprovalResponses`,
`ChatAddToolApproveResponseFunction` — всё в экспортах `ai@6`.
Это альтернатива/дополнение к `suspend/resume` VoltAgent для узлов `human` и `gate`:
одобрение конкретного tool-call'а не требует приостановки всего воркфлоу.

### `providerOptions`
Тип `ProviderOptions` — карта `{ [providerName]: { [key]: JSONValue } }`. Ключ = имя провайдера
(`openai`, `anthropic`, `google`, `openrouter`, или `name` из `createOpenAICompatible`).
Есть на `generateObject`, `generateText`, `streamText`, а также на самом `tool()` (`provider-utils:1286`).

### Middleware
```ts
type LanguageModelMiddleware = LanguageModelV3Middleware;   // ai:130

wrapLanguageModel({ model, middleware })                    // + wrapEmbeddingModel, wrapImageModel, wrapProvider
defaultSettingsMiddleware({ settings })                     // ai:5993
extractReasoningMiddleware({ tagName, separator, startWithReasoning })  // ai:6039
simulateStreamingMiddleware()                               // ai:6048
extractJsonMiddleware                                       // новое в v6
addToolInputExamplesMiddleware                              // новое в v6
defaultEmbeddingSettingsMiddleware
```
Наша точка врезки для кассет (record/replay), бюджетов, редакции PII и детерминизма — один
`LanguageModelMiddleware`, навешиваемый в фабрике моделей. Не трогая узлы.

### Telemetry — `ai:528`
```ts
type TelemetrySettings = {
  isEnabled?: boolean;        // ВЫКЛЮЧЕНА по умолчанию («Disabled by default while experimental»)
  recordInputs?: boolean;     // true по умолчанию
  recordOutputs?: boolean;    // true по умолчанию
  functionId?: string;        // группировка по функции
  metadata?: Record<string, AttributeValue>;
  tracer?: Tracer;            // @opentelemetry/api
  // + per-call integrations
}
```
Плюс **новое в v6**: `registerTelemetryIntegration(integration: TelemetryIntegration)` (`ai:6530`)
и `bindTelemetryIntegration` — глобальные подписчики на lifecycle-события генерации.
Это второй (после middleware) канал провенанса; `recordInputs/recordOutputs: false` —
рычаг для PII-режима.

### Прочее новое в v6, что нам пригодится (из списка экспортов `ai:6532`)
- `ToolLoopAgent` (алиас `Experimental_Agent`, `ai:3518`), `ToolLoopAgentSettings`,
  `agent.generate()/stream()`, `isLoopFinished`, `PrepareStepFunction`, `stopWhen` через
  `stepCountIs(n)` / `hasToolCall(name)` — готовый агентный цикл, если не хотим свой.
- `pruneMessages` — обрезка истории под контекст.
- `rerank` / `RerankingModel` — реранк для RAG-узлов.
- `createProviderRegistry` / `customProvider` / `wrapProvider` — реестр моделей строками
  `'provider:model'`. **Прямо ложится на наш model registry.**
- `generateImage`, `experimental_generateVideo`, `transcribe`, `generateSpeech`.


## 5. OpenRouter и Together БЕЗ провайдер-пакета (запасной путь)

**Сначала главное: запасной путь нам не нужен.** `@openrouter/ai-sdk-provider@2.10.0`
(peer `ai: ^6.0.0`) работает на нашем стеке — см. §1 и смоук-тест §2. Ставим его, а не
обходной манёвр. Ниже — план Б на случай, если 2.x протухнет.

`@ai-sdk/openai-compatible@2.0.75` — на ai@6-линии (provider/provider-utils 3.0.16/4.0.51),
peer только `zod`. Проверен: отдаёт `specificationVersion: 'v3'`.

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export const openrouter = createOpenAICompatible({
  name: 'openrouter',
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
  headers: {
    'HTTP-Referer': process.env.APP_URL!,   // требования OpenRouter к атрибуции
    'X-Title': 'ai-workflows-automate',
  },
});

export const together = createOpenAICompatible({
  name: 'togetherai',
  baseURL: 'https://api.together.xyz/v1',
  apiKey: process.env.TOGETHER_API_KEY!,
});

const model = openrouter('openai/gpt-5.1');   // .chatModel() / .completionModel() тоже есть
```

Для Together есть и официальный `@ai-sdk/togetherai@2.0.81` — он сам тонкая обёртка
над `@ai-sdk/openai-compatible@2.0.75` (видно в его `dependencies`). Берём его, а не ручной baseURL.

```ts
import { createTogetherAI } from '@ai-sdk/togetherai';
export const together = createTogetherAI({ apiKey: process.env.TOGETHER_API_KEY! });
```

### Чем платим за openai-compatible вместо родного провайдера
UNVERIFIED (логика, не прогон): `openai-compatible` — это общий OpenAI-Chat-Completions-транспорт,
у него нет OpenRouter-специфичных вещей: маршрутизации `provider.order`/`provider.allow_fallbacks`,
`models: [...]` fallback-списка, `transforms`, `reasoning`-блока и usage/cost из OpenRouter.
Всё это в `@openrouter/ai-sdk-provider` прокидывается через `providerOptions.openrouter`.
Через `openai-compatible` частично достижимо: `createOpenAICompatible` принимает extra body
через `providerOptions.<name>` (имя из поля `name`) — надо проверять на конкретном поле.
→ Ещё один аргумент держать 2.x родного провайдера.


## 6. Вердикт и стратегия изоляции

### Решение
**Стандартизируемся на `ai@6` (пин `6.0.280`)**, потому что `@voltagent/core@2.10.0` даёт жёсткий
peer `ai: ^6.0.0` + `@ai-sdk/provider-utils: 4.x`. VoltAgent — наш рантайм-фундамент, он и
определяет мажор. Всё остальное подстраиваем под него.

Конфликта, из-за которого затевалось исследование, **не существует**: берём
`@openrouter/ai-sdk-provider@2.10.0` (peer `ai: ^6.0.0`), а не `3.0.0` (peer `ai: ^7.0.0`).
Проверено установкой и запуском в одном дереве с VoltAgent — см. §1 и §2.

### Что делаем прямо сейчас
1. В корневом `package.json` монорепы — `overrides` на точные версии оси:
   ```json
   "overrides": {
     "ai": "6.0.280",
     "@ai-sdk/provider": "3.0.16",
     "@ai-sdk/provider-utils": "4.0.51"
   }
   ```
   Это единственная защита от того, что npm притащит `@ai-sdk/*@4.x` (линия v7):
   peer-а на `ai` у провайдеров **нет**, npm не предупредит, сломается только в рантайме
   ошибкой про `specificationVersion: 'v4'`.
2. Явно объявить провайдеры нужных мажоров (§2), не полагаясь на транзитивный хойстинг
   из `@voltagent/core`.
3. CI-гард: тест, который для каждой зарегистрированной модели проверяет
   `model.specificationVersion === 'v3'` и что `@ai-sdk/provider` резолвится в единственный путь.
   Это ровно `probe/smoke.mjs`, доведённый до vitest-теста.
4. Зафиксировать `engines.node` и не прыгать раньше времени на Node 22-only.

### Изоляция: пакет `@app/llm` — единственное место, знающее про AI SDK
Ни один узел, компилятор или MCP-хендлер не импортирует `ai` / `@ai-sdk/*` напрямую.
ESLint `no-restricted-imports` на `ai`, `@ai-sdk/*`, `@openrouter/*` везде, кроме
`packages/llm/src/**`.

Границы пакета (Dependency Inversion — наружу торчат только наши типы):
```
packages/llm/
  src/
    ports.ts              // НАШИ типы: LlmCallSpec, StructuredResult, ModelRef, Usage, Provenance
    provider-registry.ts  // createProviderRegistry(): 'openrouter:openai/gpt-5.1' -> LanguageModel
    model-factory.ts      // сборка модели + wrapLanguageModel(middleware)
    middleware/           // cassette record/replay, budget, PII-redaction, retry
    structured.ts         // ЕДИНСТВЕННЫЙ вызов generateObject во всём монорепе
    text.ts               // единственный generateText/streamText
    telemetry.ts          // TelemetrySettings / registerTelemetryIntegration
    index.ts              // реэкспорт ТОЛЬКО наших типов
```
- `provider-registry.ts` строим на штатном `createProviderRegistry` из `ai@6` (см. §4) —
  свой реестр моделей не пишем, это как раз «не изобретать велосипед».
- `structured.ts` — Adapter над `generateObject`. Наружу отдаёт
  `{ value, usage, warnings, providerMetadata, raw }`, внутрь принимает наш `LlmCallSpec`.
  Здесь живут `schemaName`/`schemaDescription`/`output`/`experimental_repairText`.
- Кассеты и бюджеты — через `LanguageModelMiddleware`, а не обёртки над `generateObject`:
  так они работают и для VoltAgent-агентов, которые вызывают модель мимо нашего фасада.

### Когда VoltAgent перейдёт на ai@7
Триггер: выход `@voltagent/core` с peer `ai: ^7`. Тогда:
1. Проверить заранее: Node ≥ 22, ESM-only.
2. Поднять ось целиком одним коммитом: `ai@7` + `@ai-sdk/provider@4` + `provider-utils@5`
   + провайдеры (`@ai-sdk/openai@4`, `openai-compatible@3`, `togetherai@3`)
   + `@openrouter/ai-sdk-provider@3` + новый `@ai-sdk/otel`.
3. Точечный diff внутри `packages/llm` по таблице §3. Ожидаемый объём:
   `system`→`instructions`; `experimental_telemetry`→`telemetry` + вынос OTel в `@ai-sdk/otel`;
   `include` для сырых тел request/response; пересчёт семантики `usage` (теперь сумма шагов);
   `needsApproval`→`toolApproval`; `stepCountIs`→`isStepCount`; `ToolCallOptions`→`ToolExecutionOptions`.
   Вне `packages/llm` — ноль правок.
4. CI-гард из п.3 выше меняет ожидание на `'v4'`.

### Риски
| Риск | Оценка | Митигация |
|---|---|---|
| `@openrouter/ai-sdk-provider@2.x` заморожен (3.0.0 вышел 2026-08-14, апстрим ушёл на ai@7) | средний | План Б готов: `@ai-sdk/openai-compatible@2.0.75` с `baseURL` OpenRouter (§5). Теряем OpenRouter-специфику в `providerOptions` |
| npm молча ставит провайдер линии v7 (peer на `ai` отсутствует) | вероятность высокая, урон высокий | `overrides` + CI-гард на `specificationVersion` |
| `@voltagent/core` тянет 20+ провайдеров прямыми deps (включая дубль `@ai-sdk/openai-compatible@1.0.54` внутри `google-vertex`) | низкий | Учесть при переезде на pnpm; размер образа |
| `ai@6` уйдёт в maintenance (v7 уже `latest` = 7.0.97) | средний | Патчи v6 пока выходят (6.0.280 от 2026-09-09), но окно закрывается — миграцию планировать, не откладывать бесконечно |
