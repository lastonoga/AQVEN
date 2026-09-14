# Трассировка и данные отладчика (§8.9, §11)

Статус: ГОТОВО (2026-09-11). Все 7 секций заполнены.

## 1. Langfuse SDK 2026: линейки пакетов и реальный API

### 1.1 Линейки: старое vs новое (ПРОВЕРЕНО, установлено локально)
| Пакет | Версия | Лицензия | Роль |
|---|---|---|---|
| `langfuse` (unscoped) | 3.38.x | MIT | ЛЕГАСИ v3 SDK. Собственный HTTP-ingestion, НЕ OTel. Для нового кода НЕ брать. |
| `langfuse-core` (unscoped) | legacy | MIT | ядро v3. Легаси. |
| `@langfuse/tracing` | 5.11.1 | MIT | инструментация поверх OTel: `startObservation`, `startActiveObservation`, `observe()`, `updateActiveObservation`, `propagateAttributes` |
| `@langfuse/otel` | 5.11.1 | MIT | `LangfuseSpanProcessor` — SpanProcessor, экспортирует спаны в Langfuse (OTLP) |
| `@langfuse/client` | 5.11.1 | MIT | `LangfuseClient`: prompts, datasets, experiments, scores, media + полный REST (`langfuse.api`) |
| `@langfuse/core` | 5.11.1 | MIT | общий слой: `LangfuseAPIClient` (генерён Fern), logger, env, media, `LangfuseOtelSpanAttributes`, `propagateAttributes` |
| `@langfuse/openai`, `@langfuse/langchain`, `@langfuse/vercel-ai-sdk`, `@langfuse/browser` | 5.x | MIT | адаптеры |

`engines.node >= 20`. `type: module` + CJS-совместимый `dist/index.cjs`. peer: `@opentelemetry/api ^1.9.0` (у `@langfuse/otel` дополнительно `@opentelemetry/core ^2.0.1`, `@opentelemetry/sdk-trace-base`).

**Что такое v4/v5.** v4 — перелом: SDK переписан на OTel-native (span processor + OTLP вместо собственного батчера), tracing отделён от client. v5 — текущее поколение, доп. типы observation (`agent`/`tool`/`chain`/`retriever`/`evaluator`/`guardrail`/`embedding`), `propagateAttributes`, experiments-атрибуты. Гайды миграции: `langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4` и `js-v4-to-v5`.

**Вывод: ДА, Langfuse в 2026 OTel-native.** Это критично для нас: мы можем ставить СВОЙ SpanProcessor рядом с `LangfuseSpanProcessor` на том же `NodeTracerProvider` и писать те же спаны в наш Postgres. Дублирование экспорта — штатная возможность OTel, а не хак.

### 1.2 Bootstrap (реальные сигнатуры)
```ts
// instrumentation.ts
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export const langfuseSpanProcessor = new LangfuseSpanProcessor({
  publicKey, secretKey, baseUrl,          // или LANGFUSE_PUBLIC_KEY / _SECRET_KEY / _BASE_URL
  environment: "production",              // LANGFUSE_TRACING_ENVIRONMENT
  release: gitSha,                        // LANGFUSE_RELEASE
  flushAt: 64, flushInterval: 2,          // LANGFUSE_FLUSH_AT / _FLUSH_INTERVAL (сек)
  timeout: 5,                             // сек
  exportMode: "batched",                  // "immediate" для serverless
  mediaUploadEnabled: true,               // base64 -> media store, LANGFUSE_MEDIA_UPLOAD_ENABLED
  mask: ({ data }) => redact(data),       // MaskFunction: ({data}) => any | Promise<any>
  shouldExportSpan: ({ otelSpan }) => true, // ShouldExportSpan; ПОЛНЫЙ override дефолтного фильтра
  exporter: customSpanExporter,           // опционально свой SpanExporter
  additionalHeaders: { "x-tenant": "..." },
});

const provider = new NodeTracerProvider({
  spanProcessors: [langfuseSpanProcessor, ourPostgresSpanProcessor],
});
provider.register();
```
Дефолтный фильтр экспорта = `isDefaultExportSpan(span)`: `isLangfuseSpan || isGenAISpan || isKnownLLMInstrumentor`. Экспортированы также `KNOWN_LLM_INSTRUMENTATION_SCOPE_PREFIXES` (включает `"ai"` — Vercel AI SDK, `openinference`, `litellm`, `langsmith`, `strands-agents`, python-инструментации). ПОДВОДНЫЙ КАМЕНЬ: `shouldExportSpan` вызывается И на старте спана (классификация app-root), И на конце; побочных эффектов быть не должно, на старте атрибуты ещё неполные.

### 1.3 Создание observation / generation
```ts
import { startObservation, startActiveObservation, observe,
         updateActiveObservation, setActiveTraceIO, setActiveTraceAsPublic,
         getActiveTraceId, getActiveSpanId, createTraceId } from "@langfuse/tracing";

// не-активный спан (ручной end)
const span = startObservation("node:render-prompt", { input, metadata }, { asType: "span" });
span.update({ output }).end();

// активный (в контексте)
await startActiveObservation("workflow-run", async (span) => { ... },
  { asType: "span", endOnExit: true, startTime, parentSpanContext });

// generation
const gen = startObservation("llm-call", {
  input: messages,
  model: "claude-opus-5",
  modelParameters: { temperature: 0.2, max_tokens: 4096 },  // {[k]: string|number}
  prompt: { name: "extract", version: 7, isFallback: false },// линковка на prompt mgmt
}, { asType: "generation" });
gen.update({
  output,
  completionStartTime: new Date(),   // TTFT
  usageDetails: { input: 1200, output: 340, cache_read_input_tokens: 900, total: 1540 },
  costDetails: { input: 0.0036, output: 0.0051, total: 0.0087 },  // USD, наши числа
  level: "DEFAULT",                  // "DEBUG"|"DEFAULT"|"WARNING"|"ERROR"
  statusMessage: "ok",
}).end();
```
`observe(fn, { name, asType, captureInput, captureOutput, endOnExit, parentSpanContext })` — обёртка, сохраняет сигнатуру `T`.

**Типы observation (v5):** `span | generation | event | embedding | agent | tool | chain | retriever | evaluator | guardrail`. Для наших узлов: `agent` для agent-узлов, `tool` для tool-calls, `retriever` для RAG, `guardrail` для валидации/гейтов, `evaluator` для инлайн-скореров, `chain` для sub-workflow. Это бесплатная семантика для UI отладчика.

**Атрибуты (точные типы):**
```ts
type LangfuseSpanAttributes = { input?, output?, metadata?: Record<string,unknown>,
  level?: "DEBUG"|"DEFAULT"|"WARNING"|"ERROR", statusMessage?: string, version?: string, environment?: string };
type LangfuseGenerationAttributes = LangfuseSpanAttributes & {
  completionStartTime?: Date, model?: string, modelParameters?: {[k:string]: string|number},
  usageDetails?: {[k:string]: number} | OpenAiUsage, costDetails?: {[k:string]: number},
  prompt?: { name: string; version: number; isFallback: boolean } };
```
ВАЖНО: `costDetails` — мы задаём стоимость САМИ (любые ключи), Langfuse не обязан её считать. Это ровно то, что нужно для бюджетных гейтов: наш прайсинг = источник истины, Langfuse = отображение.

Методы observation: `.update(attrs)` (chainable), `.end(endTime?)`, `.updateOtelSpanAttributes(attrs)`, `.setTraceIO({input,output})`, `.setTraceAsPublic()`, `.startObservation(name, attrs, {asType})` — дочерний спан без переключения контекста (важно для параллельных веток воркфлоу), `.id`, `.traceId`, `.otelSpan`.

### 1.4 sessions / users / tags / trace-level метаданные
Ставятся НЕ на observation, а через контекст:
```ts
import { propagateAttributes } from "@langfuse/tracing";
propagateAttributes({
  traceName: "workflow:invoice-extract",   // <=200 символов
  userId,                                   // <=200
  sessionId: runId,                         // <=200 (группировка: наш run = session)
  tags: ["env:prod", "wf:invoice", "v:12"],
  version: workflowVersion,
  metadata: { tenantId, workflowId },       // ТОЛЬКО string->string, <=200 символов, иначе дропается с warning
  environment: "production",
}, async () => { /* весь run */ });
```
Есть также compat-функция `setActiveTraceIO({input,output})` и `setActiveTraceAsPublic()`.

ПОДВОДНЫЙ КАМЕНЬ: `propagateAttributes.metadata` — плоская мапа строк <=200 симв. Наши большие payload'ы туда не лезут. Это подтверждает необходимость схемы "усечение + blob + ссылка" (см. §2/§7).

### 1.5 Ключи OTel-атрибутов (enum `LangfuseOtelSpanAttributes` из @langfuse/core) — ПРОВЕРЕНО
```
langfuse.trace.name / user.id / session.id / langfuse.trace.tags / langfuse.trace.public
langfuse.trace.metadata / langfuse.trace.input / langfuse.trace.output
langfuse.observation.type / .metadata / .level / .status_message / .input / .output
langfuse.observation.completion_start_time
langfuse.observation.model.name / .model.parameters
langfuse.observation.usage_details / .cost_details
langfuse.observation.prompt.name / .prompt.version
langfuse.environment / langfuse.release / langfuse.version
langfuse.internal.as_root / langfuse.internal.is_app_root
langfuse.experiment.id / .name / .description / .metadata / .dataset.id
langfuse.experiment.item.id / .expected_output / .metadata / .root_observation_id
langfuse.user.id / langfuse.session.id     (compat-алиасы)
```
Обратите внимание: `user.id` и `session.id` — БЕЗ префикса `langfuse.`, это стандартные OTel-ключи. Значит наш собственный SpanProcessor читает те же спаны и понимает те же ключи — схема совместима в обе стороны.

Помощники: `createObservationAttributes(type, attrs): Attributes` и `createTraceAttributes({input,output}): Attributes` — превращают типизированные объекты в плоские OTel-атрибуты. Можно использовать, чтобы писать Langfuse-совместимые атрибуты на ЛЮБОЙ ванильный OTel-спан, без объектов SDK.

### 1.6 Scores (оценки) — @langfuse/client
```ts
import { LangfuseClient } from "@langfuse/client";
const langfuse = new LangfuseClient();       // читает env
langfuse.score.create({ traceId, observationId?, name: "schema_valid", value: 1, dataType?, comment? });
await langfuse.flush();                       // scores флашатся ОТДЕЛЬНО от спанов
```
Типы score: numeric / categorical / boolean / text / correction (есть `ScoreV3` + `ScoreSubjectV3`: trace | observation | session | experiment). Score-конфиги (`scoreConfigs`) позволяют задать шкалу/категории.

### 1.7 Datasets / experiments — @langfuse/client
```ts
const dataset = await langfuse.dataset.get("regression-invoices");
const result = await dataset.runExperiment({
  name: "run-2026-09-11",
  task: async ({ input }) => runWorkflow(input),
  evaluators: [async ({ output, expectedOutput }) => ({ name: "exact_match", value: output === expectedOutput ? 1 : 0 })],
});
console.log(await result.format());
```
Прочее в REST-клиенте (`langfuse.api.*`, типы из @langfuse/core): `annotationQueues`, `datasets`, `datasetItems`, `datasetRunItems`, `experiments`, `evaluators` (LLM-as-judge + code evaluators + `evaluationRules`), `prompts`/`promptVersion`, `scores`/`scoresV3`/`scoreConfigs`, `sessions`, `observations`, `trace`, `metrics` (`GetMetricsV2Request`), `media`, `models`/`ModelPrice`/`PricingTier`, `llmConnections`, `blobStorageIntegrations` (batch-экспорт в S3!), `organizations`/`projects`/`MembershipRole`/`scim` (RBAC/SSO — см. §4 про лицензию), `comments`, `feedback`, `health`, `ingestion`.

`blobStorageIntegrations` (`BlobStorageExportFrequency`, `BlobStorageIntegrationFileType`, `BlobStorageExportFieldGroup`) — штатный периодический экспорт трасс в S3/GCS. Запасной путь получить сырьё трасс к себе, если не хотим второй SpanProcessor. ВНИМАНИЕ: это EE-фича (проверить в §4).

### 1.8 Media
`LangfuseMedia`, `LangfuseMediaReference`, `uploadMedia`, `MediaContentType`. Процессор сам детектит base64 data-URI в input/output и выгружает в media-хранилище, подставляя ссылку. Для наших больших payload это ГОТОВЫЙ механизм "блоб + ссылка" — но только для медиа-типов; для JSON-простыней нужен свой (см. §7).


## 2. OpenTelemetry JS + GenAI semconv (gen_ai.*)

### 2.1 Статус стабильности — ПРОВЕРЕНО по @opentelemetry/semantic-conventions@1.43.0
**Все `gen_ai.*` атрибуты лежат в `build/src/experimental_attributes.js`, т.е. доступны ТОЛЬКО через incubating-вход `@opentelemetry/semantic-conventions/incubating`. В стабильном `stable_attributes.js` ни одного `GEN_AI` нет (grep даёт пусто).**

Из README пакета дословно: основной вход следует semver 2.0 и содержит только стабильные конвенции; incubating-вход "_NOT_ subject to the restrictions of semantic versioning and _MAY_ contain breaking changes in minor releases".

ВЫВОД ДЛЯ АРХИТЕКТУРЫ: на `gen_ai.*` нельзя завязывать наш контракт данных напрямую. Мы пишем их ДОПОЛНИТЕЛЬНО (для совместимости с чужими бэкендами), но собственные гейты/UI читают НАШИ `wf.*` ключи (§7), которые версионируем сами. Константы импортировать через `/incubating` и ПИНОВАТЬ точную версию semconv.

### 2.2 Реальные ключи gen_ai.* (1.43.0, полный список из пакета)
Операция и провайдер:
```
gen_ai.operation.name   // enum: chat | text_completion | generate_content | embeddings |
                        //       create_agent | invoke_agent | invoke_workflow | execute_tool | retrieval
gen_ai.provider.name    // enum: anthropic | openai | aws.bedrock | azure.ai.openai | azure.ai.inference |
                        //       gcp.gemini | gcp.vertex_ai | gcp.gen_ai | cohere | deepseek | groq |
                        //       ibm.watsonx.ai | mistral_ai | perplexity | x_ai
gen_ai.system           // ЛЕГАСИ, вытесняется gen_ai.provider.name
gen_ai.conversation.id
gen_ai.agent.id / .name / .description / .version
gen_ai.workflow.name    // <- прямо про нас
gen_ai.data_source.id
```
Запрос:
```
gen_ai.request.model, .max_tokens, .temperature, .top_p, .top_k, .seed, .stop_sequences,
.frequency_penalty, .presence_penalty, .choice.count, .stream, .encoding_formats
gen_ai.output.type      // enum: text | json | image | speech
gen_ai.openai.request.response_format / .seed / .service_tier
```
Контент (НОВОЕ поколение, вытесняет gen_ai.prompt / gen_ai.completion):
```
gen_ai.system_instructions
gen_ai.input.messages
gen_ai.output.messages
gen_ai.prompt      // ЛЕГАСИ
gen_ai.completion  // ЛЕГАСИ
gen_ai.prompt.name
```
Ответ:
```
gen_ai.response.id, .model, .finish_reasons, .time_to_first_chunk
```
Usage:
```
gen_ai.usage.input_tokens, .output_tokens
gen_ai.usage.cache_read.input_tokens, .cache_creation.input_tokens   // <- Anthropic prompt caching
gen_ai.usage.reasoning.output_tokens                                  // <- reasoning-модели
gen_ai.usage.prompt_tokens, .completion_tokens  // ЛЕГАСИ
gen_ai.token.type
```
Tools / retrieval / evaluation:
```
gen_ai.tool.name, .type, .description, .definitions
gen_ai.tool.call.id, .call.arguments, .call.result
gen_ai.retrieval.query.text, gen_ai.retrieval.documents
gen_ai.embeddings.dimension.count
gen_ai.evaluation.name, .score.value, .score.label, .explanation
```
ВАЖНО: НЕТ стандартного атрибута для СТОИМОСТИ. Стоимость — наша зона (`wf.cost.*` + Langfuse `costDetails`).

### 2.3 Лимиты на размер атрибутов — ПРОВЕРЕНО по исходникам SDK
`@opentelemetry/sdk-trace-base/build/src/utility.js`:
```
DEFAULT_ATTRIBUTE_COUNT_LIMIT = 128
DEFAULT_ATTRIBUTE_VALUE_LENGTH_LIMIT = Infinity   // !!! по умолчанию НЕ усекается
```
Переопределение (в порядке приоритета): `spanLimits.attributeValueLengthLimit` -> `generalLimits.attributeValueLengthLimit` -> env `OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT` -> env `OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT` -> Infinity. Аналогично для count.

Прочие дефолты (`config.js` / `BufferConfig`):
```
spanLimits: attributeCountLimit 128, linkCountLimit 128, eventCountLimit 128,
            attributePerEventCountLimit 128, attributePerLinkCountLimit 128
BatchSpanProcessor: maxExportBatchSize 512, scheduledDelayMillis 5000,
                    exportTimeoutMillis 30000, maxQueueSize 2048  (переполнение -> спаны ДРОПАЮТСЯ молча)
forceFlushTimeoutMillis 30000
OTEL_TRACES_SAMPLER по умолчанию parentbased_always_on
```
ГЛАВНЫЙ РИСК: `Infinity` по умолчанию означает, что отрендеренный промт на 200 КБ уедет в OTLP как есть. Батч из 512 таких спанов = сотни мегабайт в одном HTTP-запросе -> таймауты экспортёра, 413 от коллектора, тихая потеря `maxQueueSize`. Плюс gRPC-коллекторы обычно режут сообщения на 4 МБ.

### 2.4 Рекомендованный паттерн для больших payload: усечение + блоб + ссылка
Это НАШ обязательный слой (ни OTel, ни Langfuse его за нас не сделают для JSON; Langfuse делает только для медиа-data-URI).

Правило на каждый крупный payload (промт, ответ, входы/выходы узла, документы ретривера):
1. Канонизировать (`safe-stable-stringify` / `json-canonicalize`, оба уже в probe-fe), посчитать `sha256` -> `<hash>`.
2. Всегда писать: `*.size_bytes`, `*.sha256`, `*.truncated` (bool), `*.ref` (URI блоба).
3. Инлайном писать превью `*.preview` длиной не более N (рекомендую N=4096 символов, hard cap 8192), с суффиксом `…[+K bytes]`.
4. Полный payload -> content-addressed блоб-хранилище (S3/MinIO, ключ `blobs/sha256/<hash>`), дедупликация бесплатна (одинаковый system prompt пишется один раз на миллион ранов).
5. В Postgres в `node_checkpoint` хранить `sha256` + `size` + `ref`, а не тело.
6. Глобально выставить `spanLimits.attributeValueLengthLimit = 8192` как ПРЕДОХРАНИТЕЛЬ — чтобы забытое место не обрушило экспорт. Он режет строку молча, поэтому наши явные `*.truncated`/`*.sha256` обязаны быть.

Три уровня хранения, явно:
- **span attribute** — только превью и метаданные (дёшево, индексируется, ищется);
- **blob store** — полное тело по хэшу (дёшево, дедуплицировано, неизменяемо);
- **Postgres** — ссылки, провенанс, метрики для гейтов (дорого, транзакционно).

Альтернатива для мелкого: OTel span *events* (`span.addEvent`) вместо атрибутов — но лимит `eventCountLimit 128` и `attributePerEventCountLimit 128`, и большинство бэкендов (Langfuse в том числе) события LLM-контента не рисуют. НЕ рекомендую как основной канал.


## 3. VoltAgent -> Langfuse интеграция

### 3.1 Что написано в встроенной доке (прочитано целиком)
`.../node_modules/@voltagent/core/docs/observability/langfuse.md` — файл короткий, вот вся его суть:
```ts
import { Agent, VoltAgent, VoltAgentObservability } from "@voltagent/core";
import { createLangfuseSpanProcessor } from "@voltagent/langfuse-exporter";

const observability = new VoltAgentObservability({
  spanProcessors: [
    createLangfuseSpanProcessor({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL, // optional
      debug: true,                             // optional
    }),
  ],
});

new VoltAgent({ agents: { agent }, observability });
```
Дока прямо говорит: "VoltAgent initializes a global OpenTelemetry tracer provider. You can attach custom span processors. The Langfuse helper returns a `BatchSpanProcessor` that forwards spans to Langfuse. All agent/workflow spans flow through the observability pipeline. The exporter performs careful field mappings (prompts, responses, tools, usage, user/session)."

### 3.2 Схема — ПРОВЕРЕНО/ВЫВОД
- Транспорт: **OTel SpanProcessor**, не собственный формат. `createLangfuseSpanProcessor` возвращает обычный `BatchSpanProcessor`. Langfuse принимает OTLP/HTTP на `/api/public/otel/v1/traces` (это и есть путь, которым ходит `@langfuse/otel`). UNVERIFIED: точный endpoint не подтверждён из кода в этой сессии — проверить перед реализацией.
- Ключевая точка расширения: `VoltAgentObservability({ spanProcessors: [...] })` принимает **массив**. Значит:

**ДА, дублировать экспорт в наш Postgres можно и это штатно.**
```ts
const observability = new VoltAgentObservability({
  spanProcessors: [
    createLangfuseSpanProcessor({ ... }),          // -> Langfuse (человеческий UI трасс)
    new PostgresCheckpointSpanProcessor({ ... }),  // -> наш Postgres (доверие, гейты, кассеты)
    // опционально: new BatchSpanProcessor(new OTLPTraceExporter({ url: collector }))
  ],
});
```
Наш процессор реализует интерфейс `SpanProcessor` (`onStart`, `onEnd`, `forceFlush`, `shutdown`) из `@opentelemetry/sdk-trace-base` — тот же интерфейс, что и `LangfuseSpanProcessor`.

### 3.3 Развилка: @voltagent/langfuse-exporter vs @langfuse/otel напрямую
Два пути дают один результат, но разной ценой:
- **A. `@voltagent/langfuse-exporter`** — мэппинг VoltAgent-специфичных спанов (agent/workflow/tool) в Langfuse-модель уже написан. Минус: ещё одна зависимость в цепочке версий, и мы не контролируем мэппинг.
- **B. `@langfuse/otel` (`LangfuseSpanProcessor`) напрямую** в `VoltAgentObservability.spanProcessors` — процессор принимает любой OTel-спан, дефолтный фильтр пропускает `gen_ai.*` и известные инструментации (в списке префиксов есть `"ai"` — Vercel AI SDK, на котором стоит VoltAgent). Тогда мы сами ставим `langfuse.observation.*` атрибуты через `createObservationAttributes()` из `@langfuse/tracing` и полностью контролируем, что видно в UI.

РЕКОМЕНДАЦИЯ: **B**. Наш продукт — про доверие и провенанс, мэппинг спанов должен быть нашим кодом, а не чужой чёрной коробкой. `@langfuse/otel` — живая базовая библиотека Langfuse (обновляется вместе с продуктом), `@voltagent/langfuse-exporter` — адаптер третьей стороны, который может отставать. Проверить свежесть релиза перед решением (см. риски ниже).

### 3.4 Подводные камни
- `LangfuseSpanProcessor.shouldExportSpan` — ПОЛНЫЙ override дефолтного фильтра. Задав его, мы теряем `isGenAISpan || isKnownLLMInstrumentor`; надо либо звать `isDefaultExportSpan(span) || ourPredicate(span)` (обе функции экспортированы из `@langfuse/otel`), либо явно перечислять всё.
- `mask` применяется ТОЛЬКО на пути в Langfuse. Наш Postgres-процессор получает НЕмаскированные данные — маскирование для нашего хранилища надо делать отдельно (или наоборот, это плюс: полные данные у нас, редактированные наружу).
- Порядок процессоров в массиве не гарантирует порядок доставки; `onEnd` получает один и тот же `ReadableSpan`. Мутировать `span.attributes` в одном процессоре — значит менять то, что увидит другой. НИКОГДА не мутировать; только читать.
- Serverless: `exportMode: "immediate"` + `await forceFlush()`. В нашем случае (долгоживущий воркер) — `batched`.


## 4. Self-hosting Langfuse: состав, ресурсы, лицензия OSS vs EE

### 4.1 Состав (ПРОВЕРЕНО, langfuse.com/self-hosting)
Пять обязательных компонентов, ужать нельзя:
| Компонент | Роль |
|---|---|
| `langfuse-web` (контейнер) | UI + API + приём ingestion-батчей |
| `langfuse-worker` (контейнер) | асинхронная обработка событий, запись в ClickHouse |
| **Postgres** | транзакционные данные: проекты, пользователи, промты, датасеты, конфиги |
| **ClickHouse** | OLAP: traces, observations, scores. Основное хранилище трасс |
| **Redis/Valkey** | очередь ingestion + кэш |
| **S3/Blob store** | все входящие события, мультимодальные входы, крупные экспорты |

Поток ingestion: web принимает батч -> СРАЗУ пишет тело в S3 -> в Redis кладёт только ссылку -> worker забирает из S3 -> пишет в ClickHouse. То есть S3 не опция, а часть горячего пути.

### 4.2 Ресурсы (ПРОВЕРЕНО)
- Прод: **>= 2 CPU / 4 GB RAM на каждый контейнер**; >= 2 инстанса `langfuse-web` для HA, добавлять при CPU > 50%.
- Docker Compose (всё в одном): **>= 4 ядра / 16 GiB** (пример из доки — `t3.xlarge` на AWS).
- Redis: **~1 GB памяти на каждые ~100 000 событий в минуту**.
- ClickHouse — отдельная эксплуатационная дисциплина (мержи, диски, бэкапы). Это главная скрытая стоимость решения.

ЧЕСТНАЯ ОЦЕНКА: минимальный вменяемый прод-сетап — 4 контейнера + управляемый Postgres + ClickHouse + Redis + S3. Для маленькой команды это заметная операционная нагрузка. Реалистичная альтернатива на старте — Langfuse Cloud, self-host как путь отхода (данные вывозятся: MIT-код + blob-экспорт).

### 4.3 ЛИЦЕНЗИЯ — ключ к build-vs-buy (ПРОВЕРЕНО на langfuse.com/self-hosting/license-key)
Код репозитория: **MIT**. Дословно из доки: *"All core Langfuse features and APIs are available in Langfuse OSS (MIT licensed) without any limits"* — self-hosted даёт ту же инфраструктуру, что и Cloud, без ограничений масштаба.

**Требуют EE-ключа (`LANGFUSE_EE_LICENSE_KEY`), закрытый список из доки:**
1. Project-level RBAC Roles
2. Protected Prompt Labels
3. Data Retention Policies
4. Audit Logs
5. Server-Side Data Masking
6. UI Customization
7. Organization Creators
8. Org Management API + SCIM
9. Instance Management API

**Явный ответ по позициям из задания:**
| Фича | Статус |
|---|---|
| Датасеты (datasets, dataset items) | **OSS, MIT, бесплатно** |
| Эксперименты / dataset runs | **OSS** |
| Annotation queues | **OSS** |
| Scores (числовые/категориальные/boolean/text) + score configs | **OSS** |
| LLM-as-a-judge evaluators + evaluation rules | **OSS** |
| Prompt management (версии, лейблы, компиляция) | **OSS** |
| Playground | **OSS** |
| SSO (Google, GitHub, Azure AD, Okta, Auth0, AWS Cognito, Keycloak, JumpCloud) | **OSS** — базовый SSO бесплатен |
| ПРИНУЖДЕНИЕ SSO для организации, SAML/SCIM | **EE** |
| RBAC на уровне организации | OSS; **на уровне проекта — EE** |
| Audit logs | **EE** |
| Data retention policies | **EE** |
| Server-side data masking | **EE** (клиентское маскирование через `mask` в SpanProcessor — бесплатно и у нас) |
| Blob storage batch export (`blobStorageIntegrations`) | UNVERIFIED — в EE-списке отсутствует, но в доке фич не подтверждено явно. Проверить до релиза. |

### 4.4 ВЫВОД ПО BUILD-VS-BUY
**Всё, что нам нужно из evals-контура (§12 спеки) — датасеты, dataset runs, annotation queues, scores, LLM-as-judge, prompt management — в OSS под MIT, без лимитов.** Это снимает главный аргумент "писать своё". По правилу заказчика "есть живая библиотека — берём её" решение однозначно: **BUY (точнее — взять OSS MIT), не строить свой evals/annotation-контур.**

EE нужен только когда придут корпоративные клиенты: audit logs, retention policies, project-RBAC, SCIM. Это отложенная покупка, а не блокер на старте, и она НЕ требует переписывания — тот же бинарь + env-переменная.

Что мы всё равно пишем сами (ядро доверия, §6/§7): чекпоинты узлов, провенанс слотов, кассеты, эффективная конфигурация, node-level метрики для гейтов. Langfuse их не заменяет и не претендует.

Источники: https://langfuse.com/self-hosting , https://langfuse.com/self-hosting/license-key , https://langfuse.com/self-hosting/configuration/scaling , https://langfuse.com/self-hosting/security/authentication-and-sso


## 5. Альтернативы честно

Версии/лицензии — ПРОВЕРЕНО через `npm view` 2026-09-11:
| Продукт | npm-пакет | Версия | Лицензия SDK | time.modified | Свежесть |
|---|---|---|---|---|---|
| Langfuse | `@langfuse/tracing` | 5.11.1 | MIT | 2026-09 (см. §1) | активная |
| Braintrust | `braintrust` | 3.32.0 | MIT | 2026-09-09 | очень активная |
| Arize Phoenix | `@arizeai/phoenix-client` | 7.11.0 | Apache-2.0 | 2026-09-10 | очень активная |
| Comet Opik | `opik` | 2.2.59 | Apache-2.0 | 2026-09-11 | очень активная |
| Laminar | `@lmnr-ai/lmnr` | 0.8.45 | Apache-2.0 | 2026-08-21 | активная, но **0.x** |
| Helicone | `@helicone/helpers` | 1.8.3 | Apache-2.0 | **2025-11-07** | **~10 мес. без релиза — РИСК** |

### Разбор
**Braintrust (MIT SDK, платформа коммерческая).** Сильнейший eval-контур: «eval-first платформа, к которой прикручен трейсинг». Но ядро продукта проприетарно/SaaS; self-host — энтерпрайз-разговор. Для нас минус: наш продукт про доверие и локальный контроль данных; SaaS-only на критическом пути плохо ложится. `autoevals` (MIT, уже стоит в probe-fe) — их скореры — можно взять ОТДЕЛЬНО, без платформы. Это лучший способ «взять у Braintrust полезное».

**Arize Phoenix (Apache-2.0, полностью OSS).** Самый чистый OTel-native, стоит на OpenInference-семантике (`@arizeai/openinference-*`). Self-host заметно легче Langfuse (одно приложение + Postgres, без ClickHouse/Redis/S3 в базовом варианте). Минусы: prompt management и annotation-контур слабее Langfuse, evals-loop менее продуктовый. **Лучший запасной вариант, если операционная стоимость Langfuse окажется неподъёмной.**

**Comet Opik (Apache-2.0).** Самый широкий по охвату: observability + online evaluation rules (LLM-as-judge по проду) + ML-experiment-менеджмент из Comet. Живой (релиз сегодня). Минус: часть ценности в Comet-экосистеме, self-host тяжелее чем Phoenix.

**Laminar (Apache-2.0).** Технически интересен (компрессия трасс, SQL-доступ, debugger). Но `0.8.x` — ДО-единичная версия SDK, маленькая команда. Ставить на него ядро продукта в 2026 — неоправданный риск. Как источник идей для §7 — да.

**Helicone (Apache-2.0).** Архитектурно gateway/proxy-first — перехват на уровне HTTP к провайдеру. Нам не подходит концептуально: у нас типизированные многошаговые воркфлоу, ценность в структуре графа, а не в логе HTTP-вызовов. Плюс SDK без релизов ~10 месяцев. **Отбрасываем.**

**Чистый OTel + ClickHouse (своя UI).** Даёт максимум контроля и ноль лицензионных вопросов. Но: мы обязаны написать сами весь UI трасс, диффы, сессии, датасеты, annotation queues, scores, LLM-as-judge. Это месяцы работы и прямое нарушение правила «не изобретать велосипеды». **Отбрасываем как основной путь.** При этом ClickHouse всё равно приедет — он внутри Langfuse.

### РЕШЕНИЕ
- **Основной: Langfuse OSS (MIT), self-host, SDK `@langfuse/otel` + `@langfuse/tracing` + `@langfuse/client` 5.11.x.** Причина: весь evals/annotation/prompt-контур в MIT без лимитов (§4.3), OTel-native (можно дублировать экспорт), самый зрелый продуктовый UI для отладчика.
- **Запасной: Arize Phoenix (Apache-2.0)** — если ClickHouse+Redis+S3 окажется слишком дорого эксплуатировать.
- **Скореры берём отдельно:** `autoevals` (MIT) и/или `@voltagent/scorers` — они не привязаны к платформе.

### Цена миграции (это главное — она должна быть низкой by design)
Мы пишем спаны в **ванильный OTel**, а Langfuse подключаем как ОДИН `SpanProcessor` среди нескольких. Тогда:
- смена бэкенда трасс = замена одного процессора (Langfuse -> Phoenix/OTLP-коллектор). Дни, не месяцы;
- **наши `wf.*` атрибуты (§7) и наш Postgres (§6) от бэкенда не зависят вообще** — гейты, кассеты, провенанс и экспорт (§15.1) продолжают работать при полностью отключённом Langfuse;
- что реально теряется при миграции: датасеты/эксперименты/annotation queues/scores, накопленные в Langfuse. Митигация: (а) `langfuse.api.*` — полноценный REST для выгрузки датасетов и скоров; (б) blob-storage export; (в) ПРАВИЛО: **определения датасетов и наборы кассет — источник истины в НАШЕМ репозитории/Postgres, Langfuse — зеркало.** Тогда потеря — только история прогонов.

АРХИТЕКТУРНОЕ ПРАВИЛО (SOLID/DIP): в коде домена не должно быть ни одного `import` из `@langfuse/*`. Только порт `TraceSink` / `EvalStore` и адаптер `LangfuseTraceSink`. Это буквально и есть плоскость замены.

Источники: https://langfuse.com/self-hosting/license-key , https://arize.com/blog/best-ai-observability-tools-for-autonomous-agents-in-2026/ , https://www.marktechpost.com/2026/08/09/top-llm-observability-and-evaluation-platforms-in-2026-langfuse-langsmith-braintrust-arize-and-more-compared/ , https://laminar.sh/article/langfuse-alternatives-2026


## 6. Граница данных: наш Postgres vs бэкенд трасс

Принцип разделения одной фразой: **в Postgres лежит всё, от чего зависит ПОВЕДЕНИЕ системы (решения, гейты, воспроизведение, экспорт); в бэкенде трасс лежит всё, что нужно ЧЕЛОВЕКУ, чтобы посмотреть глазами.** Если отключить Langfuse, продукт обязан продолжать работать полностью — теряется только удобный просмотр.

Следствие: бэкенд трасс НИКОГДА не читается на горячем пути. Ни один гейт, ни один retry, ни один экспорт не делает запрос в Langfuse.

### Таблица границы
| Данные | Где источник истины | Дублируется в трассы? | Почему |
|---|---|---|---|
| Чекпоинт узла (вход/выход/статус/попытка) | **Postgres** `node_checkpoint` | да, превью | resume, replay, гейты. Обязано быть транзакционным |
| Полные payload'ы (промт, ответ, документы) | **Blob store** по `sha256` | нет (только `ref`+`preview`) | размер; дедупликация; §2.4 |
| Провенанс слотов (откуда пришло каждое значение) | **Postgres** `slot_provenance` | да, компактно | ядро доверия, §8.9. Основа UI «почему такое значение» |
| Эффективная конфигурация рана (после мержа дефолтов/оверрайдов) | **Postgres** `run_effective_config` + `config_hash` | да, только `config_hash` | воспроизводимость; сравнение ранов |
| Кассеты (записанные ответы для детерминированного реплея) | **Postgres** + blob | нет | это тест-фикстуры, не телеметрия |
| Node-level метрики для гейтов (latency, tokens, cost, retries, valid) | **Postgres** `node_metric` | да | гейт должен читать их синхронно и транзакционно |
| Бюджет рана (лимит, потрачено, остаток) | **Postgres** `run_budget` | да, снапшот | решение «остановить ран» нельзя ставить в зависимость от внешнего SaaS |
| Сработавшие правила/гварды | **Postgres** `rule_firing` | да | аудит решений; экспорт §15.1 |
| Версия воркфлоу, граф, определения узлов | **Postgres** | ссылкой (`wf.version`) | это наш домен |
| Артефакты экспорта (§15.1) | **Postgres** + blob | нет | детерминированный экспорт не может зависеть от внешнего API |
| Идемпотентность/дедуп ключи, очередь задач | **Postgres** | нет | |
| Дерево спанов, waterfall, тайминги | **Langfuse (ClickHouse)** | — | это его работа, не наша |
| Sessions / users / tags агрегаты | **Langfuse** | — | |
| Датасеты и dataset items | **Наш Postgres — источник, Langfuse — зеркало** | синхронизация | чтобы миграция стоила дёшево (§5) |
| Dataset runs / experiments (история прогонов) | **Langfuse** | — | допустимо потерять при миграции |
| Annotation queues, ручная разметка | **Langfuse** | — | продуктовый UI, который мы НЕ пишем (§4.4) |
| Scores (авто и ручные) | **Langfuse — источник; агрегаты, влияющие на гейты, зеркалим в Postgres** | обе стороны | если score управляет гейтом — он обязан быть у нас |
| LLM-as-judge конфиги | **Langfuse** | — | OSS-фича, берём готовую |
| Прайсинг моделей и расчёт стоимости | **Наш Postgres** | да, `costDetails` | нельзя, чтобы биллинг зависел от чужой таблицы цен |

### Правило связывания
Каждая наша строка несёт `trace_id` (32 hex) и `span_id` (16 hex) — те же, что у OTel-спана (`getActiveTraceId()` / `getActiveSpanId()` из `@langfuse/tracing`). Это делает переход «строка в нашей БД -> спан в Langfuse» дешёвым и однозначным в обе стороны, без своей мапы id.
Обратно: `langfuse.observation.metadata` несёт наши `wf.run_id`/`wf.node_id`, чтобы из UI Langfuse можно было вернуться в нашу Studio.


## 7. Схема наших спан-атрибутов (`wf.*`)

Namespace `wf.` — наш, версионируемый нами (`wf.schema_version`). `gen_ai.*` пишем ДОПОЛНИТЕЛЬНО (§2.1: он incubating, ломается в минорах — на него нельзя опираться). `langfuse.*` (§1.5) пишем для отрисовки в UI.

Тип значений OTel-атрибута: `string | number | boolean | string[] | number[] | boolean[]`. Вложенных объектов НЕТ — всё либо плоские ключи, либо JSON-строка. Все JSON-строки подчиняются правилу §2.4 (preview + sha256 + size + ref + truncated).

### 7.1 Идентификация и версии
```
wf.schema_version        int      // версия ЭТОЙ схемы атрибутов, начинаем с 1
wf.tenant_id             string
wf.workflow_id           string
wf.workflow_version      int
wf.run_id                string   // == session.id в Langfuse
wf.run_mode              string   // "live" | "replay" | "eval" | "dry_run"
wf.node_id               string   // стабильный id узла в графе
wf.node_type             string   // "llm" | "tool" | "router" | "map" | "gate" | "subflow" | ...
wf.node_attempt          int      // номер попытки (retry)
wf.parent_node_id        string
wf.checkpoint_id         string   // ссылка на строку в нашем Postgres
```

### 7.2 Отрисованный промт (самое важное для отладчика §11)
```
wf.prompt.template_id        string
wf.prompt.template_version   int
wf.prompt.template_sha256    string   // хэш ШАБЛОНА — меняется при правке промта
wf.prompt.rendered_sha256    string   // хэш ОТРЕНДЕРЕННОГО текста — меняется при смене данных
wf.prompt.rendered_preview   string   // <= 4096 симв.
wf.prompt.rendered_size      int      // байт
wf.prompt.rendered_truncated boolean
wf.prompt.rendered_ref       string   // blob://sha256/<hash>
wf.prompt.variables_json     string   // плоская мапа имя->превью значения, JSON
wf.prompt.messages_count     int
wf.prompt.system_sha256      string   // отдельно: system-часть меняется редко, дедуплицируется
```
Разделение `template_sha256` / `rendered_sha256` — принципиальное: позволяет в UI ответить на «промт изменился или данные изменились?» без diff'а текстов.

### 7.3 Провенанс слотов
Один слот = одна запись. Массивы параллельны по индексу (OTel не даёт вложенности):
```
wf.slot.names[]        string[]  // ["invoice.total", "customer.name", ...]
wf.slot.sources[]      string[]  // "input" | "node:<id>" | "default" | "const" | "tool:<name>" | "memory" | "human"
wf.slot.origin_span_ids[] string[] // span_id узла-производителя, "" если нет
wf.slot.confidences[]  number[]  // 0..1, -1 если неприменимо
wf.slot.value_sha256[] string[]
wf.slot.required[]     boolean[]
wf.slot.missing[]      string[]  // отдельный список незаполненных обязательных
wf.slot.count          int
```
АЛЬТЕРНАТИВА (если параллельные массивы окажутся неудобны): одна JSON-строка `wf.slot.provenance_json` + полный объект в Postgres. Массивы выбраны потому, что бэкенды трасс умеют по ним фильтровать, а по JSON-строке — нет. РЕШИТЬ на прототипе.

### 7.4 Эффективная конфигурация
```
wf.config.hash           string  // sha256 канонизированного эффективного конфига (canonicalize + sha256)
wf.config.preview        string  // JSON, <= 4096
wf.config.ref            string  // blob://
wf.config.sources[]      string[] // ["node_default","workflow_override","run_override","env"] — порядок мержа
wf.config.model          string
wf.config.model_alias    string   // наш логический алиас до резолва в конкретную модель
wf.config.temperature    number
wf.config.max_tokens     int
wf.config.seed           int
wf.config.timeout_ms     int
wf.config.retry_policy   string
wf.config.cache_policy   string   // "off" | "read" | "read_write"
```
`wf.config.hash` — ключ для «почему два рана разошлись»: если хэши равны, дело в данных или в недетерминизме модели.

### 7.5 Сработавшие правила / гварды
```
wf.rules.evaluated_count   int
wf.rules.fired[]           string[]  // id правил, которые сработали
wf.rules.fired_actions[]   string[]  // "block" | "warn" | "retry" | "fallback" | "route" | "redact"
wf.rules.fired_severities[] string[] // "info" | "warn" | "error" | "fatal"
wf.rules.blocked           boolean   // хотя бы одно правило остановило узел
wf.rules.details_json      string    // подробности, превью
wf.guard.schema_valid      boolean   // прошла ли валидация выходной схемы (zod)
wf.guard.schema_errors     string    // JSON-превью ошибок zod
wf.guard.repair_attempts   int       // сколько раз чинили структурированный выход
```

### 7.6 Бюджет
```
wf.budget.scope            string  // "run" | "node" | "tenant" | "day"
wf.budget.limit_usd        number
wf.budget.spent_usd        number  // на момент ЗАВЕРШЕНИЯ этого узла
wf.budget.remaining_usd    number
wf.budget.limit_tokens     int
wf.budget.spent_tokens     int
wf.budget.exceeded         boolean
wf.budget.action           string  // "none" | "warn" | "downgrade_model" | "abort"
```

### 7.7 Стоимость и usage
```
wf.cost.input_usd          number
wf.cost.output_usd         number
wf.cost.cache_read_usd     number
wf.cost.cache_write_usd    number
wf.cost.total_usd          number
wf.cost.pricing_version    string  // версия НАШЕЙ таблицы цен — стоимость должна быть пересчитываемой
wf.cost.estimated          boolean // true, если провайдер не вернул точный usage
wf.tokens.input            int
wf.tokens.output           int
wf.tokens.cache_read       int
wf.tokens.cache_write      int
wf.tokens.reasoning        int
```
Плюс зеркало в Langfuse: `costDetails: {input, output, cache_read, cache_write, total}` и `usageDetails: {...}` — они рисуются в его UI и агрегируются по sessions/users.

### 7.8 Тайминги и результат
```
wf.timing.queue_ms         int
wf.timing.render_ms        int
wf.timing.provider_ms      int
wf.timing.ttft_ms          int   // дублируется в langfuse completionStartTime и gen_ai.response.time_to_first_chunk
wf.timing.validate_ms      int
wf.result.status           string // "ok" | "retried" | "failed" | "skipped" | "blocked" | "cached"
wf.result.error_kind       string // "provider" | "timeout" | "schema" | "guard" | "budget" | "internal"
wf.cache.hit               boolean
wf.cassette.id             string // при run_mode=replay — какая кассета проигрывается
wf.cassette.match          string // "exact" | "fuzzy" | "miss"
```

### 7.9 Что пишем параллельно в чужих неймспейсах
```
// OTel gen_ai (через @opentelemetry/semantic-conventions/incubating, версия ПИНУЕТСЯ)
gen_ai.operation.name = "invoke_workflow" | "invoke_agent" | "execute_tool" | "chat" | "retrieval"
gen_ai.provider.name, gen_ai.request.model, gen_ai.response.model, gen_ai.response.id,
gen_ai.request.temperature/.max_tokens/.top_p/.seed,
gen_ai.usage.input_tokens/.output_tokens/.cache_read.input_tokens/.reasoning.output_tokens,
gen_ai.response.finish_reasons, gen_ai.tool.name/.call.id, gen_ai.workflow.name, gen_ai.agent.name

// Langfuse (через createObservationAttributes / .update())
langfuse.observation.type = "generation"|"tool"|"agent"|"retriever"|"guardrail"|"chain"|"span"
langfuse.observation.input/.output (превью!), .model.name, .model.parameters,
.usage_details, .cost_details, .level, .status_message, .prompt.name, .prompt.version
user.id, session.id (= wf.run_id), langfuse.trace.tags, langfuse.environment, langfuse.release
```

### 7.10 Дисциплина
1. Лимит `spanLimits.attributeValueLengthLimit = 8192` как предохранитель (§2.3).
2. Держаться в пределах ~128 атрибутов на спан (дефолтный `attributeCountLimit`) — при массивах слотов это реально; если слотов много, уходить в `wf.slot.provenance_json` + blob.
3. Ни одного PII в инлайн-превью: маскирование ДО записи атрибута, не только в `mask` Langfuse (§3.4 — `mask` не защищает наш Postgres-процессор).
4. Ключи только snake_case, только ASCII, стабильные навсегда: удаление ключа = bump `wf.schema_version`.
5. Единственное место формирования атрибутов — фабрика `buildNodeSpanAttributes(ctx): Attributes` (SRP). Никаких `span.setAttribute` россыпью по коду.



### 3.5 КРИТИЧЕСКАЯ НАХОДКА: @voltagent/langfuse-exporter сидит на ЛЕГАСИ SDK
`npm view @voltagent/langfuse-exporter` (ПРОВЕРЕНО 2026-09-11):
```
version = 2.0.3
time.modified = 2026-07-09
license = MIT
peerDependencies = { "@voltagent/core": "^2.0.0", "@opentelemetry/api": "^1.0.0",
                     "@opentelemetry/core": "^2.0.0", "@opentelemetry/sdk-trace-base": "^2.0.0" }
dependencies = { "langfuse": "^3.38.6", "@opentelemetry/core": "^2.0.0",
                 "@opentelemetry/sdk-trace-base": "^2.0.0" }
```
`langfuse@3.38.20`, time.modified = 2026-06-18, MIT — это **v3, unscoped, НЕ OTel-native**. То есть `@voltagent/langfuse-exporter` конвертирует OTel-спаны обратно в v3-ingestion-формат Langfuse и шлёт своим HTTP-клиентом. Он на два поколения SDK отстаёт от `@langfuse/*` 5.11.1.

Последствия:
- всё новое из v4/v5 (observation types `agent`/`tool`/`retriever`/`guardrail`/`evaluator`, `propagateAttributes`, experiment-атрибуты, media-upload из процессора, `costDetails` по произвольным ключам) через него НЕ доедет;
- две разные HTTP-цепочки и два разных набора env в одном процессе, если мы где-то ещё используем `@langfuse/client`;
- риск дрейфа: адаптер третьей стороны + легаси-зависимость.

**РЕШЕНИЕ: НЕ использовать `@voltagent/langfuse-exporter`. Использовать `LangfuseSpanProcessor` из `@langfuse/otel@5.11.1` напрямую внутри `VoltAgentObservability({ spanProcessors: [...] })`.** Это ровно тот же интерфейс `SpanProcessor`, доп. адаптер не нужен. (Вариант B из §3.3 подтверждён фактом, а не вкусом.)
