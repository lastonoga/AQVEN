# Evals tooling (§12) — что берём готовым

Статус: DONE (все 7 секций закрыты)
Дата проверки: 2026-09-11

## 1. @voltagent/evals + viteval

### Версии/лицензии (проверено `npm view` + package.json в probe)
- `@voltagent/evals@2.0.5` — MIT. peer: `@voltagent/scorers ^2.0.0`, `@voltagent/sdk ^2.0.0`.
- `@voltagent/scorers@2.1.0` — MIT. peer: `@voltagent/core ^2.0.0`, `ai ^6.0.0`, `zod ^3.25 || ^4`.
  **deps: `autoevals ^0.0.131`** — то есть autoevals уже внутри, отдельно ставить не надо (см. §3).
- `viteval@0.5.9` — MIT, last modified 2026-03-29 (≈5.5 мес — живой, но не горячий).

### Реальный API `@voltagent/evals` (из dist/index.d.ts, 334 строки)

```ts
createExperiment(config: ExperimentConfig): ExperimentDefinition
runExperiment(experiment, options?: RunExperimentOptions): Promise<ExperimentResult>
registerExperimentDataset(options): void
getExperimentDatasetRegistry(): ExperimentDatasetRegistry
resolveExperimentDataset(ref, options?): Promise<ExperimentDatasetResolvedStream>
resolveExperimentScorers(configs): ExperimentRuntimeScorerBundle[]
resolveVoltOpsDatasetStream(options): Promise<VoltOpsDatasetStream>
createVoltOpsRunManager(options): VoltOpsRunManager | undefined
```

`ExperimentConfig`:
```ts
interface ExperimentConfig<Item, Output, TVoltOpsClient> {
  id: string; label?: string; description?: string;
  dataset?: ExperimentDatasetDescriptor<Item>;   // {items} | {name} | {resolver} | {id,versionId}
  runner: (ctx: { item; index; total?; signal?; voltOpsClient?; runtime? })
          => MaybePromise<{ output; metadata?; traceIds? } | Output>;
  scorers?: ReadonlyArray<ExperimentScorerConfig<Item>>;
  passCriteria?: ExperimentPassCriteria | ExperimentPassCriteria[];
  tags?: readonly string[];
  experiment?: ExperimentBindingDescriptor;
  metadata?: Record<string, unknown> | null;
  voltOps?: ExperimentVoltOpsOptions<TVoltOpsClient>;
}
```

`passCriteria` — ровно ДВА типа, оба на уровне ВСЕГО прогона:
```ts
type MeanScoreCriteria = { type: "meanScore"; min: number; scorerId?: string;
                           label?; description?; severity?: "error" | "warn" }
type PassRateCriteria  = { type: "passRate";  min: number; scorerId?: string; ... }
```

Скорер в эксперименте:
```ts
interface ExperimentScorerConfigEntry {
  id?: string;
  scorer: LocalScorerDefinition<Payload, Params>;
  name?: string;
  threshold?: number;                 // порог на ОДИН item -> thresholdPassed
  metadata?: Record<string, unknown>;
  params?: Params | ((ctx: ExperimentRuntimePayload) => Params | undefined);
  buildPayload?: (ctx: ExperimentRuntimePayload) => Payload;   // маппинг item -> payload скорера
  buildParams?:  (ctx: ExperimentRuntimePayload) => Params | undefined;
}
// ExperimentRuntimePayload = { input, expected, output, item, datasetId?, datasetVersionId?, datasetName? }
```

Результат:
```ts
ExperimentResult = { runId?; summary: ExperimentSummary; items: ExperimentItemResult[]; metadata? }
ExperimentSummary = { totalCount, completedCount, successCount, failureCount, errorCount,
                      skippedCount, meanScore?, passRate?, startedAt, completedAt?, durationMs?,
                      scorers: Record<string, ExperimentScorerAggregate>,
                      criteria: ExperimentPassCriteriaEvaluation[] }
ExperimentScorerAggregate = { id, name, successCount, errorCount, skippedCount, totalCount,
                              meanScore?, minScore?, maxScore?, passRate?, threshold? }
ExperimentItemResult = { item, itemId, index, status, runner: {output,metadata,traceIds,error,
                         startedAt,completedAt,durationMs}, scores: Record<string, ExperimentScore>,
                         thresholdPassed?, error?, durationMs?, datasetId?, datasetVersionId?, datasetName? }
```

`RunExperimentOptions`: `voltOpsClient`, `concurrency`, `onProgress({completed,total})`, `onItem(...)`, `signal` (см. RunExperimentProgressEvent/RunExperimentItemEvent).

### Датасеты
- Формат файла: `.voltagent/datasets/<name>.json` → `{ name, description?, tags?, metadata?, data: [{name?, input, expected?, extra?}] }`.
- Источники: inline `{items}`, именованный из реестра/VoltOps `{name}`, async `resolver({limit, signal}) => {items|AsyncIterable, total?, dataset?}`, дескриптор VoltOps `{id, versionId}`.
- Версионирование датасетов — только на стороне VoltOps (каждое изменение = новая иммутабельная версия v1/v2/v3; эксперимент ссылается на конкретную версию). Локально версий нет.
- CLI: `volt eval run --experiment <path> --concurrency N`, `voltagent eval dataset push/pull --name --file --version --output --overwrite --page-size`.
- Env: `VOLTAGENT_DATASET_NAME`, `VOLTAGENT_API_URL`, `VOLTAGENT_PUBLIC_KEY`, `VOLTAGENT_SECRET_KEY`.

### Скореры `@voltagent/scorers@2.1.0` (реальный экспорт)
Re-export из autoevals напрямую: `ExactMatch, JSONDiff, Levenshtein, ListContains, NumericDiff`.
Фабрики (все требуют `model: AgentModelReference`):
`createModerationScorer({model, threshold=0.5, categories?, buildPrompt?, maxOutputTokens?})`,
`createFactualityScorer`, `createSummaryScorer`, `createHumorScorer`, `createPossibleScorer`,
`createTranslationScorer` (params `{language?}`),
RAG-набор: `createAnswerCorrectnessScorer({model, options:{factualityWeight?}, buildPayload?})`,
`createAnswerRelevancyScorer({model, options:{strictness?, uncertaintyWeight?, noncommittalThreshold?}})`,
`createContextPrecisionScorer`, `createContextRecallScorer`, `createContextRelevancyScorer`,
`createToolCallAccuracyScorerCode(...)` — детерминированная проверка tool calls,
`adaptScorerForAgentEval(definition, {buildPayload, buildParams})` — адаптер local-скорера под live-контекст агента,
`scorers` (map) и `rawAutoEvalScorers`.

Кастомные скореры — `buildScorer` из `@voltagent/core`, fluent-пайплайн из 4 шагов:
`.prepare(({payload}) => prepared)` → `.analyze(({results}) => analysis)` → `.score(({payload,prepared,analysis}) => {score, metadata})` → `.reason(({payload,score,metadata}) => string)`.
Score всегда 0..1.

### Live-скореры (прод)
Задаются на агенте: `new Agent({ ..., eval: { triggerSource: "production", environment, sampling: {type:"ratio", rate}, scorers: { name: { scorer } } } })`.
ВАЖНО (прямая цитата из доков): live-результаты пишутся в OTLP-спаны как атрибуты `eval.scorer.*` и видны в VoltOps Live Scores, **но НЕ персистятся в Eval Runs** и не связаны с датасетами/экспериментами. Для нашего §12 это значит: связку live-score → датасет → регрессия придётся строить самим (свой sink поверх OTel-атрибутов).

### Чего НЕ хватает для наших гейтов НА УРОВНЕ УЗЛА (главный вывод)
1. **passCriteria только глобальные.** `meanScore`/`passRate` считаются по всему прогону; `scorerId` сужает до скорера, но НЕ до узла воркфлоу. Гейт «узел `extract` должен держать F1≥0.9» не выражается. → пишем свой aggregator поверх `ExperimentResult.items[].scores`, группируя по `item.extra.nodeId` / `metadata.nodeId`.
2. **Нет понятия шага/узла вообще.** `runner` возвращает один `output` на item. Пер-узловые выходы можно протащить только через `metadata` и разбирать вручную; `scores` — плоский `Record<string, ExperimentScore>` на item.
3. **Нет baseline/сравнения прогонов в SDK.** Нет diff «run A vs run B», нет «регрессия относительно last-green». Сравнение — только в VoltOps UI. → своя таблица runs + свой компаратор (ключ: datasetVersionId + workflowVersion + modelId).
4. **Нет матрицы моделей.** `runExperiment` — один runner, одна конфигурация. Прогон N моделей × M промптов = наш цикл снаружи (см. §2 promptfoo-вердикт).
5. **Нет статистики значимости.** Только mean/min/max/passRate. Нет CI, bootstrap, paired-тестов → «модель B лучше A» без доверительного интервала. Пишем сами (bootstrap на 1000 ресэмплов по item-скорам, paired при общем датасете).
6. **Нет cost/latency в pass-критериях.** `durationMs` есть в item, но в `passCriteria` его не включить; токены/цену runner кладёт в `metadata` вручную.
7. **Нет retry/flake-детекции.** Один прогон item = один результат; нестабильность судьи не измеряется. Нужен свой `repeat: k` + дисперсия.
8. **Нет кассет/детерминизма.** `runExperiment` всегда бьёт в живую модель (см. §6).

### viteval — вердикт
Не берём как основной раннер. Аргументы:
- Официальный док VoltAgent прямо помечает его как «third-party, recommended approach = native» и перечисляет ограничения: нет VoltOps-интеграции, не все скореры доступны, **только offline**, другой формат датасетов.
- API: `evaluate(name, {description, data: dataset, task: async ({input}) => output, scorers: [...], threshold})`, `defineDataset({name, data: async () => [...]})`, конфиг `viteval.config.ts` через `defineConfig({reporter, eval:{include, setupFiles}})`, CLI `viteval` / `viteval init`. Node 22+.
- Единственный реальный плюс — vitest-подобный DX и `threshold` на eval. Это мы и так получаем через `runExperiment` + свой репортер.
UNVERIFIED: живость репозитория viteval (версия 0.5.9, последняя публикация 2026-03-29 — риск «один мейнтейнер»).


## 2. promptfoo как раннер матрицы моделей (§12.2)

### Факты (установлен promptfoo@0.123.0 в probe-fe, читан dist/src/index.d.ts, 1.37 MB)
- Лицензия **MIT** (LICENSE: "Copyright (c) Promptfoo 2025", стандартный MIT).
- `time.modified = 2026-09-10` — релизится буквально вчера. Свежесть отличная.
- **`engines: { node: ">=22.22.0" }`** — жёсткий. Наш probe на Node 20 выдал EBADENGINE. Для монорепы это значит Node 22+ везде, где крутится раннер.
- **80 прямых зависимостей**, среди них `express`, `socket.io`, `socket.io-client`, `winston`, `drizzle-orm`, `@libsql/client`, `nunjucks`, `python-shell`, `posthog-node`, `proxy-agent`, `tsx`, `openai`, `@anthropic-ai/sdk`, `ai`. Установка тянет ~490 пакетов. Это не библиотека — это приложение с БД (libsql/drizzle), веб-сервером и телеметрией.

### Программный API — ДА, он есть и первоклассный
```ts
import promptfoo, { evaluate, assertions, cache, redteam, guardrails,
                    loadApiProvider, loadApiProviders, generateTable } from "promptfoo";

declare function evaluate(testSuite: EvaluateTestSuite, options?: EvaluateOptions): Promise<Eval>;

type EvaluateTestSuite = {
  prompts: (string | object | PromptFunction)[];
  providers: ProvidersConfig;        // string id | ApiProvider | ProviderOptions | функция callApi | массив/мапа
  writeLatestResults?: boolean;
  author?: string;
} & Omit<TestSuiteConfig, "prompts" | "providers">;
// TestSuiteConfig даёт: tests, scenarios, defaultTest, derivedMetrics, outputPath, sharing,
// nunjucksFilters, env, extensions (before/after hooks), metadata, tracing, redteam, evaluateOptions

type EvaluateOptions = {
  cache?: boolean; delay?: number; maxConcurrency?: number; repeat?: number;
  timeoutMs?: number; maxEvalTimeMs?: number; filterRange?: string;
  generateSuggestions?: boolean; suggestionsCount?: number;
  showProgressBar?: boolean; silent?: boolean; isRedteam?: boolean;
  progressCallback?: (completed, total, index, evalStep: RunEvalOptions, metrics: PromptMetrics) => void;
  abortSignal?: AbortSignal;
};

EvaluateSummaryV3 = { version: 3; timestamp; results: EvaluateResult[]; prompts: CompletedPrompt[]; stats: EvaluateStats }
EvaluateStats    = { successes; failures; errors; tokenUsage: NormalizedTokenUsage;
                     durationMs?; generationDurationMs?; evaluationDurationMs? }
GradingResult    = { pass: boolean; score: number; reason: string; namedScores?: Record<string, number>; ... }
```
Кастомный провайдер = объект `ApiProvider { id(), callApi(prompt, ctx, opts): Promise<ProviderResponse> }` или просто функция — **значит наш VoltAgent-воркфлоу подключается как провайдер напрямую**, без YAML.

### Ассершены — 100+ типов (из `BaseAssertionTypesSchema`, реальный enum)
Детерминированные: `equals, contains, contains-all, contains-any, icontains*, starts-with, regex,
is-json, contains-json, is-xml, is-html, is-sql, contains-sql, is-valid-function-call,
is-valid-openai-tools-call, javascript, python, ruby, webhook, word-count, levenshtein,
finish-reason, cost, latency, perplexity, perplexity-score, guardrails, is-refusal`.
NLP-метрики: `bleu, gleu, meteor, rouge-n`.
Векторные: `similar, similar:cosine, similar:dot, similar:euclidean`, `classifier`, `moderation`.
LLM-судьи: **`llm-rubric`, `g-eval`, `factuality`, `model-graded-closedqa`, `model-graded-factuality`,
`answer-relevance`, `context-faithfulness`, `context-recall`, `context-relevance`,
`conversation-relevance`, `agent-rubric`, `search-rubric`, `pi`**.
Агентные/трассировочные (прямо про наши воркфлоу!): **`tool-call-f1`, `skill-used`,
`trajectory:goal-success`, `trajectory:tool-sequence`, `trajectory:tool-used`,
`trajectory:tool-args-match`, `trajectory:step-count`,
`trace-span-count`, `trace-span-duration`, `trace-error-spans`**.

Есть `derivedMetrics` (формулы поверх namedScores через mathjs) и `assert-set` с весами — то есть
взвешенная композиция скореров из коробки, чего у @voltagent/evals нет.

### Отчёты
`outputPath` (json/yaml/csv/html), `sharing` (облако promptfoo или self-hosted через `PROMPTFOO_SELF_HOSTED` + `PROMPTFOO_REMOTE_API_BASE_URL`), локальный web-UI (`promptfoo view`, express+socket.io), `generateTable()` экспортируется программно.
Гейтинг в CI: `PROMPTFOO_PASS_RATE_THRESHOLD`, `PROMPTFOO_FAILED_TEST_EXIT_CODE`, `PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES`.

### ЧЕСТНЫЙ ВЕРДИКТ
**Берём promptfoo как ДВИЖОК МАТРИЦЫ (`providers × prompts × tests`) в отдельном пакете-адаптере, но НЕ как ядро наших evals и НЕ как хранилище результатов.**

Почему берём:
- Матрица моделей — ровно его модель данных; у @voltagent/evals её нет вообще (один runner = одна конфигурация).
- 100+ ассершенов, включая `tool-call-f1` и всю группу `trajectory:*` — это месяцы работы, если писать самим.
- Кэш ответов провайдера из коробки (`EvaluateOptions.cache`, `cache` namespace экспортирован) — частично закрывает §6.
- `repeat` + `progressCallback` + `abortSignal` — можно мерить дисперсию судьи и вешать на наш UI прогресс.
- MIT, релизы еженедельные.

Почему НЕ ядро (подводные камни, все проверены по пакету):
1. **Node >= 22.22.0.** Заражает весь runtime-пакет.
2. **Тащит свою SQLite (drizzle + @libsql/client) и пишет в `~/.promptfoo`.** Два источника истины по результатам. Нам нужен свой store (Postgres) — значит результат надо вынимать из `Eval` и перекладывать самим.
3. **Тащит express + socket.io + posthog-node.** В прод-образ это не кладут; изолировать в отдельный worker-процесс/пакет обязательно. Телеметрию в PostHog глушить явно.
4. **`python`/`ruby` ассершены и `python-shell`** — потенциальная поверхность исполнения кода; в managed-режиме запрещать.
5. **`Eval` (возврат `evaluate`) — внутренний класс, не публичный контракт.** Мы завязываемся на `EvaluateSummaryV3`/`EvaluateResult`, а `Eval` меняется между минорами. Изолировать за своим фасадом `ModelMatrixRunner`.
6. **Нет понятия «узел воркфлоу»** — та же дыра, что у @voltagent/evals. Наш провайдер отдаёт один output; пер-узловые скоры и гейты — наши (см. §7).
7. **Remote generation для redteam** ходит на их API (`PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION` отключает). Для §12.1 (состязательные датасеты) это важно: без отключения данные уходят наружу.

Граница ответственности:
- promptfoo: перебор `providers × prompts`, вызов ассершенов, NLP-метрики, trajectory-проверки.
- наше: датасеты (source of truth), пер-узловые гейты, сравнение с baseline, статистика значимости, persist в Postgres, Studio-UI.


## 3. autoevals / evalite / Langfuse experiments

### autoevals — ДА, но косвенно
- `autoevals@0.3.0`, **MIT**, Braintrust. time.modified 2026-06-09 (3 мес — ок).
- deps: `ajv`, `compute-cosine-similarity`, `js-levenshtein`, `js-yaml`, `linear-sum-assignment`, `mustache`, `openai ^6.7.0`, `zod-to-json-schema`. Лёгкий, без БД и сервера.
- **Важно: `@voltagent/scorers@2.1.0` уже зависит от `autoevals ^0.0.131`.** То есть в дереве окажутся ДВЕ версии (0.0.131 транзитивно + 0.3.0, если поставим явно). Ставить 0.3.0 отдельно только если нужны скореры, которых нет в реэкспорте VoltAgent. Иначе — дубликат и путаница.
- Полный экспорт 0.3.0:
  `ExactMatch, Levenshtein, LevenshteinScorer, NumericDiff, JSONDiff, ListContains, ValidJSON, Sql,
   EmbeddingSimilarity, AnswerSimilarity, AnswerCorrectness, AnswerRelevancy, Faithfulness,
   ContextPrecision, ContextRecall, ContextRelevancy, ContextEntityRecall,
   Factuality, ClosedQA, Battle, Humor, Possible, Security, Summary, Translation, Moderation,
   Evaluators, DEFAULT_MODEL, getDefaultModel, init(InitOptions),
   LLMClassifierFromTemplate, LLMClassifierFromSpec, LLMClassifierFromSpecFile, OpenAIClassifier,
   buildClassificationTools, modelGradedSpecSchema, templates, makePartial,
   THREAD_VARIABLE_NAMES / computeThreadTemplateVars / templateUsesThreadVariables (мультиходовые диалоги),
   типы Score, Scorer, ScorerArgs, ScorerWithPartial, ModelGradedSpec, TraceForScorer`
- Самое ценное для нас: **`LLMClassifierFromTemplate` / `LLMClassifierFromSpec(File)` + `modelGradedSpecSchema` + `templates`** — декларативный YAML-спек судьи (prompt + choice_scores + use_cot). Это готовый каркас «судья как данные», который ложится в Studio-редактор судьи один в один. `Battle` — попарное сравнение (нужно для §12.3 и для калибровки).
- Подводный камень: autoevals исторически прибит к OpenAI-клиенту (`openai` в deps, `init({client})` для подмены). Прогон через Anthropic/другие — через OpenAI-совместимый base URL или обёртку. UNVERIFIED: степень поддержки не-OpenAI провайдеров в 0.3.0.

**Вердикт:** берём как библиотеку определений судей (spec/template), а исполнение вешаем на наш провайдерный слой. Не берём как раннер.

### evalite — НЕТ
- `evalite@0.19.0`, **`npm view evalite license` не вернул поля license** (в npm-метаданных пусто — надо смотреть репозиторий). time.modified 2026-02-20 — **почти 7 месяцев без публикации**. По нашему правилу «нет релизов 12+ мес = риск» ещё не красный, но жёлтый.
- Это vitest-обёртка с локальным UI, по позиционированию — прямой конкурент viteval. Даёт то же, что мы уже получаем из @voltagent/evals + promptfoo.
- **Вердикт: не берём.** Дублирует viteval, без VoltOps, темп разработки падает, лицензия не заявлена в npm-метаданных (риск для коммерческого продукта до проверки).

### Langfuse experiments SDK — ДА, как бэкенд датасетов/прогонов
- `@langfuse/client@5.11.1`, MIT, time.modified 2026-09-09 (вчера). В probe-fe уже стоят `@langfuse/client/core/otel/tracing` 5.11.1.
- Берём за: датасеты с версионированием, dataset runs, привязка item→trace (то, чего в @voltagent/evals нет в self-hosted виде), self-hostable (нам критично — VoltOps это SaaS).
- TODO/UNVERIFIED: точные сигнатуры `langfuse.experiment.*` / `dataset.runExperiment` в v5 не проверены по .d.ts в этом заходе (см. заметку по observability у соседнего исследователя).

**Итог по §3:** скореры берём из `@voltagent/scorers` (там autoevals внутри) + promptfoo-ассершены; спеки LLM-судей — формат `autoevals` ModelGradedSpec; хранилище прогонов — Langfuse (self-host) + своя таблица; evalite/viteval не берём.


## 4. Калибровка судей: метрики согласия и порог допуска к гейтингу

### Что реально есть в TS (проверено `npm view`, 2026-09-11)
| Нужно | Пакет | Вердикт |
|---|---|---|
| Spearman rho | `simple-statistics@7.12.0` (ISC, modified 2026-09-08) — `sampleRankCorrelation(x, y)` | ЕСТЬ, берём |
| Pearson r | `simple-statistics` — `sampleCorrelation` | ЕСТЬ |
| t-тесты | `simple-statistics` — `tTest`, `tTestTwoSample`; плюс `@stdlib/stats-ttest`, `@stdlib/stats-wilcoxon`, `@stdlib/stats-binomial-test` (уже в probe-fe) | ЕСТЬ |
| **Cohen's kappa** | `@stdlib/stats-kappa-cohen` — **E404**, `cohens-kappa` — **E404**, `ckappa` — **E404** | **НЕТ. Пишем сами (~30 строк)** |
| **Krippendorff alpha** | `krippendorff-alpha` — **E404**, `inter-rater-agreement` — **E404** | **НЕТ. Пишем сами (~80 строк)** |
| **Kendall tau / tau-b** | `kendall-correlation` — **E404**; в `simple-statistics` нет (в экспортах только `sampleRankCorrelation`) | **НЕТ. Пишем сами (O(n log n) через merge-sort inversions)** |
| Fleiss kappa (>2 судей, номинальные) | нет живого пакета | Пишем сами |

Формулы тривиальны, риск нулевой, зависимости не нужны:
- Cohen's kappa: `k = (po - pe) / (1 - pe)`; для порядковых шкал — **weighted kappa** с квадратичными весами `w_ij = 1 - (i-j)^2/(k-1)^2` (для 1–5 рубрик это правильный выбор, не unweighted).
- Krippendorff alpha: `alpha = 1 - Do/De`, с метрикой расхождения по типу шкалы (nominal / ordinal / interval). Обязателен, когда судьи покрывают датасет **не полностью** (разреженная матрица) — kappa этого не умеет, alpha умеет, и это главный аргумент за него в нашем сценарии (человек размечает подвыборку).
- Kendall tau-b — устойчивее Spearman на связках (ties), а LLM-судьи выдают много одинаковых баллов (3/5, 4/5) → **ties массовые, tau-b предпочтительнее rho**.

### Исследования с цифрами (реальные ссылки)

**1. PoLL — Panel of LLM evaluators (Verga et al., Cohere, arXiv:2404.18796, «Replacing Judges with Juries»).**
Панель из нескольких мелких разнородных моделей даёт **более высокую корреляцию с человеком, чем один GPT-4**, при стоимости **в 7–8 раз ниже** ($1.25/in + $4.25/out против $10/in + $30/out у GPT-4 Turbo). Проверено на 3 judge-настройках и 6 датасетах. Пулинг по разным семействам (Claude / Gemini / Mistral) снижает внутримодельный и позиционный bias; GPT-4 в одиночку оказался одним из СЛАБЫХ оценщиков на single-hop QA.
→ Вывод для нас: **дефолт гейтинг-судьи = панель из 3 моделей разных вендоров с медианой/majority, а не один «самый большой»**. Это и дешевле, и точнее.

**2. G-Eval (Liu et al., EMNLP 2023, arXiv:2303.16634).**
GPT-4 + CoT + form-filling на SummEval: **Spearman 0.514 суммарно**, по измерениям: coherence 0.582, consistency 0.507, fluency 0.455, relevance 0.547.
→ Это был SOTA — и это всего лишь «умеренное» согласие. **Прямой вывод: LLM-судья на свободном тексте физически не даёт качества, достаточного для жёсткого блокирующего гейта.** rho ~0.5 означает, что судья и человек упорядочивают выходы по-разному в огромной доле случаев.

**3. Bias судей.**
- Position bias: «Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge» (ACL/IJCNLP 2025, aclanthology.org/2025.ijcnlp-long.18) — в pairwise-оценке кода **простая перестановка порядка ответов сдвигает accuracy более чем на 10 п.п.**; величина зависит от семейства модели, размера контекста и разрыва в качестве кандидатов.
- Self-preference: arXiv:2410.21819 «Self-Preference Bias in LLM-as-a-Judge» — судья завышает оценку выходам с **низкой собственной перплексией**, т.е. «своим». Плюс arXiv:2506.02592 «Beyond the Surface: Measuring Self-Preference in LLM Judgments».
- Общий каталог: arXiv:2410.02736 «Justice or Prejudice? Quantifying Biases in LLM-as-a-Judge».
- Verbosity bias: по оценкам 2025 заметно снизился относительно 2023 (в части бенчмарков <0.011), но НЕ исчез.
→ Обязательные механики: **swap-прогон (A/B и B/A) с усреднением**, **запрет судить модели того же семейства, что и генератор** (или явная пометка риска), логирование длины ответа как ковариаты.

### Порог допуска судьи к гейтингу (наша политика)
Интерпретация kappa по Landis & Koch (1977) — отраслевой стандарт: `<0` poor, `0.01–0.20` slight, `0.21–0.40` fair, `0.41–0.60` moderate, `0.61–0.80` substantial, `0.81–1.00` almost perfect.
Krippendorff (2004) рекомендует: **alpha >= 0.800 — можно опираться на выводы; 0.667 — минимум для «предварительных» выводов; ниже 0.667 — данные непригодны.**

Предлагаемая трёхуровневая политика (учитывает, что G-Eval-класс судьи даёт ~0.5):
- **BLOCK (жёсткий гейт, останавливает деплой)** — разрешён ТОЛЬКО при `weighted kappa >= 0.7` И `Krippendorff alpha >= 0.8` на калибровочной выборке >= 100 размеченных человеком примеров, с балансом классов и **swap-стабильностью >= 0.9** (доля примеров, где вердикт не меняется при перестановке). Плюс требование: судья — панель (PoLL), не одна модель.
- **WARN (показываем в Studio, не блокируем)** — `kappa 0.4–0.7` или `alpha 0.667–0.8`. Это реалистичная зона для большинства rubric-судей.
- **OFF (только наблюдение/метрика)** — `kappa < 0.4` / `alpha < 0.667`. Судья не имеет права влиять на pass/fail.
Детерминированные скореры (exact match, JSON-schema, tool-call F1, latency, cost) гейтят без ограничений — у них нет проблемы согласия.

Дополнительно к порогу калибровки, до допуска к BLOCK:
- **Test-retest**: тот же судья, тот же вход, `repeat: 5` → доля изменивших вердикт < 5% (у promptfoo `EvaluateOptions.repeat` это даёт бесплатно).
- **Доверительный интервал**: bootstrap 1000 ресэмплов по item-скорам; гейт валит сборку, только если верхняя граница CI ниже порога (иначе флаки).
- **Перекалибровка** при смене модели судьи, версии промпта судьи или рубрики — калибровка привязывается к `judgeVersionHash = hash(model + prompt + rubric + params)`.

Источники:
- https://arxiv.org/abs/2404.18796 (PoLL)
- https://aclanthology.org/2023.emnlp-main.153/ и https://arxiv.org/abs/2303.16634 (G-Eval)
- https://aclanthology.org/2025.ijcnlp-long.18/ (position bias)
- https://arxiv.org/pdf/2410.21819 (self-preference bias)
- https://arxiv.org/pdf/2410.02736 (Justice or Prejudice)


## 5. Генерация датасетов и покрытие (§12.1)

### Цели покрытия — как считать (все механически проверяемы по IR воркфлоу, готовой библиотеки НЕТ)
Спека требует: все значения enum на входах; все ветки `switch`; все причины выхода из циклов (`success` / `max_iter` / stagnation); все политики ошибок; варианты контекста (hit/miss/stale).
Это **не текстовые метрики, а структурное покрытие графа** — прямой аналог branch coverage. Реализация:
1. Из Zod-схемы узла достаём домены: `z.enum` → конечный список, `z.union` → дискриминанты, `z.literal`, `z.optional/nullable` → {present, absent}, числовые `.min/.max` → граничные значения. (У Zod 4 есть интроспекция через `._zod.def`/`.def`; UNVERIFIED: стабильность API интроспекции в 4.6.2 — проверять отдельно.)
2. Комбинаторика — **не декартово произведение, а pairwise (all-pairs / IPOG)**. Для 8 параметров по 4 значения: декарт = 65 536, pairwise ≈ 20–30 кейсов при 100% покрытии всех пар. Готовых живых TS-библиотек pairwise мало и они мёртвые → алгоритм IPOG пишем сами (~150 строк), он простой и хорошо описан.
3. Покрытие рёбер: `coveredEdges / totalEdges` по графу; каждая ветка `switch` = ребро; каждый выход из цикла = помеченное ребро `loop.exit.reason ∈ {success, max_iter, stagnation}`. Считаем по OTel-спанам прогона (атрибуты `workflow.node.id`, `workflow.edge.id`) — трассировка у нас и так есть.
4. Отчёт покрытия в Studio = таблица «цель → покрыта/нет → сколько items» + кнопка «добрать» (передаём Claude список непокрытых целей как задание для `dataset.generate`).

### Состязательные стратегии (что генерировать)
- пропуски обязательных полей и `null` в optional;
- противоречия между полями (дата окончания < даты начала);
- длина: вход у верхней границы контекста и за ней (проверка обрезки/ошибки);
- смешение языков и скриптов, эмодзи, RTL, zero-width;
- prompt injection в данных: инструкции в пользовательском поле, фейковые системные маркеры, попытки вызова tool;
- числовые крайности: 0, отрицательные, очень большие, NaN-строки;
- «отравленный контекст»: релевантный-но-устаревший документ, документ-дубликат, полностью нерелевантный (для веток hit/miss/stale).
Готовое: **promptfoo redteam-плагины** генерируют часть этого (jailbreak, PII-leak, harmful). Но по умолчанию генерация идёт через их **remote API** — отключать `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=1`, иначе наши данные уходят наружу. Наш профиль инъекций генерируем локально через Claude + шаблоны.

### Дедупликация (minhash/simhash в TS)
Состояние экосистемы (проверено 2026-09-11):
- `minhash@0.0.9` MIT — **последняя публикация 2022-05**, 4 года. Мёртв.
- `simhash@0.1.0` MIT (2022-06), `node-simhash@0.1.0` (2022-06, license не заявлена) — мертвы.
- `talisman@1.1.4` MIT — 2022-06, мёртв (но содержит и minhash, и simhash, и фонетику; как «замороженный код» приемлем).
- `string-comparison@1.3.0` MIT — 2023-11.
- `datasketch`, `minhash-js` — **E404**, в npm нет.
**Вердикт: готовой живой библиотеки нет. Пишем сами** — это ~120 строк и абсолютно детерминированно:
1. Точные дубли: канонизация (`json-canonicalize`/`fast-json-stable-stringify` — оба уже в probe-fe) + SHA-256 через `@noble/hashes@2.4.0` (тоже уже стоит, MIT, живой). Это же даёт content-addressed ключ для кассет (§6) — одна утилита на две задачи.
2. Near-dup: **SimHash 64-бит** на 3-граммах слов + Hamming distance <= 3, бакетирование по 4 полосам по 16 бит. Для коротких текстов (типичный dataset item) SimHash проще и быстрее MinHash.
3. Для длинных документов — **MinHash + LSH**, 128 перестановок, Jaccard >= 0.85, banding b=32/r=4.
4. Отдельная проверка спеки: **пересечение с few-shot примерами узла** — тот же SimHash-индекс, но по корпусу few-shot; любой item с Hamming <= 6 к few-shot помечается и не попадает в `test`.
5. Разделение `train/dev/test` — детерминированный хэш-сплит по `itemId` (`sha256(itemId) mod 100`), чтобы сплит был воспроизводим и `test` никогда не «перетёк» в `train` при добавлении items. `test` физически недоступен оптимизатору — отдельный scope в API.

### Метрики разнообразия
- **Self-BLEU / pairwise ROUGE** — есть в promptfoo (`bleu`, `gleu`, `rouge-n`, `meteor` через `js-rouge`); можно считать попарно внутри датасета: чем ниже средний self-BLEU, тем разнообразнее.
- **Distinct-1/2/3** (доля уникальных n-грамм) — 10 строк, самый дешёвый и интерпретируемый индикатор; классика из Li et al. 2016.
- **Embedding-дисперсия / средний cosine к центроиду** — `compute-cosine-similarity` уже идёт внутри autoevals; либо своя функция. Дополнительно: **Vendi Score**-подобная метрика (экспонента энтропии Шеннона собственных значений матрицы сходства) — считается через собственные значения, требует eigen-разложения; для N<=1000 приемлемо, UNVERIFIED: нужна TS-реализация eigen (в `ml-matrix`, но его свежесть не проверял).
- **Покрытие кластеров**: k-means (`ckmeans` есть в simple-statistics для 1D; для многомерных эмбеддингов — свой k-means) по эмбеддингам + требование «в каждом кластере >= k items».

### Маскирование PII в проде (TS вместо Python presidio)
Прямого аналога presidio в TS **нет** (`@microsoft/presidio-node` — E404, такого пакета не существует). Варианты:
- `redact-pii@3.4.0` MIT, modified **2024-11** (~22 мес — по нашему правилу **РИСК, помечаем**). Regex+синтаксические правила: email, phone, SSN, credit card, IP, URL, street address, имена (через опциональный Google DLP-коннектор). Для базового слоя годится, но список типов ограничен и en-центричен.
- `compromise@14.17.0` MIT, modified **2026-09-10** (живой!) — NLP-библиотека с NER-подобными тегами `#Person`, `#Place`, `#Organization`, `#Money`, `#Date`. Даёт то, чего не даёт regex: **имена и организации в свободном тексте**. Английский; для русского не работает.
- Presidio-как-сервис: официальный Presidio — Python, но у него есть **HTTP API и Docker-образ** (`presidio-analyzer` / `presidio-anonymizer`). UNVERIFIED: актуальные теги образов на 2026-09. Для прод-пайплайна маскирования это честнее, чем regex в TS.
**Предлагаемая архитектура маскирования (двухслойная, детерминированная):**
1. Слой 1 (обязательный, TS, синхронный): regex-детекторы структурных PII — email, телефон (E.164 + локальные форматы), карты (+ Luhn), IBAN, ИНН/СНИЛС/паспорт РФ, IP, JWT/API-ключи (`sk-`, `ghp_`, `AKIA`), URL с токенами.
2. Слой 2 (опциональный, вне TS): presidio через HTTP для имён/адресов/организаций, либо `compromise` для англ. текстов как дешёвая замена.
3. **Замена — детерминированный псевдоним, а не `***`**: `<EMAIL_a3f9>` где суффикс = `hmac(secret, value).slice(0,4)`. Это сохраняет реляционную структуру (один и тот же человек = один и тот же псевдоним между шагами воркфлоу), что критично для lineage (§12.3) и для того, чтобы датасет остался осмысленным.
4. Маскирование — **до** записи в датасет, на границе «семпл трассы → dataset item», и это же место, где ставится флаг `synthetic: false, piiMasked: true`.


## 6. Кассеты record/replay для детерминированных перепрогонов

### Кандидаты (версии/лицензии на 2026-09-11)
| Пакет | Версия | Лицензия | modified | Уровень перехвата |
|---|---|---|---|---|
| `nock` | 14.0.17 | MIT | 2026-07-30 | `http`/`https` модуль Node (и частично fetch через undici в v14) |
| `msw` | 2.15.0 | MIT | 2026-07-08 | interceptors: http, https, XHR, **fetch/undici** |
| `undici` `MockAgent` | 8.10.2 | MIT | 2026-09-04 | только undici/global fetch |
| `@pollyjs/core` | 6.0.6 | Apache-2.0 | **2023-07** (3 года) | свой persister+adapter, есть HAR-формат |
| `polly-js` | 1.8.3 | MIT | 2022-06 | это НЕ Polly.JS record/replay, это retry-библиотека (омоним!) — не путать |

### Почему ни один не закрывает задачу целиком
1. **Стриминг.** Наш рантайм — AI SDK v6 `streamText`/`streamObject` поверх SSE. `nock` умеет отдавать поток (`reply(200, stream)`), но записывать реальный SSE с сохранением **тайминга чанков** он не умеет. MSW умеет отдавать `ReadableStream`. Ни один не записывает поток автоматически. Тайминг чанков нам нужен для воспроизведения UX-отладки (§11), а не только контента.
2. **Tool calls.** Один логический шаг = N HTTP-запросов (модель → tool_use → наш tool → модель → ...). HTTP-кассета — это список запросов, **без понятия «итерация агента»**. Сопоставление при replay идёт по URL+body; при малейшем изменении промпта (а мы именно промпты и меняем) body отличается → кассета промахивается. Для blame (§7) это фатально: мы НАМЕРЕННО подменяем вход узла, значит body заведомо другой.
3. **Уровень абстракции не тот.** Нам нужен реплей на уровне **(nodeId, modelId, canonical(request)) → response**, а не на уровне HTTP. Первое переживает смену провайдера, ретраи, смену base URL; второе — нет.
4. Polly.JS — **три года без релиза** при Apache-2.0. Не берём.

### ВЕРДИКТ: своё content-addressed хранилище, HTTP-моки — только в юнит-тестах
**Кассета = key-value store, ключ = `sha256(canonical({provider, modelId, params, messages, tools, responseFormat, seed}))`.**
- Канонизация — `json-canonicalize@3.0.1` или `fast-json-stable-stringify@2.1.0` (оба уже в probe-fe, MIT). Хэш — `@noble/hashes@2.4.0` (уже стоит). Та же утилита, что и для дедупа (§5) — одна реализация на два use-case.
- Значение = **полная запись, включая поток**: `{ chunks: Array<{deltaMs, part}>, finishReason, usage, toolCalls, warnings, providerMetadata, recordedAt, modelId }`. Реплей отдаёт `ReadableStream`, проигрывая `deltaMs` (или мгновенно, в режиме `fast`).
- Точка внедрения — **не HTTP, а AI SDK middleware**: `wrapLanguageModel({ model, middleware })` с `wrapGenerate` / `wrapStream`. Это официальный слой ai@6 (`LanguageModelV3Middleware`), он видит запрос УЖЕ нормализованным и ответ УЖЕ разобранным на части (включая tool calls), то есть ровно то, что нам нужно. UNVERIFIED: точное имя типа middleware в ai@6 — проверить у исследователя по ai-sdk.
- Режимы: `record` (пишем + пропускаем), `replay` (только кассета, промах = ошибка), `auto` (промах → живой вызов + дозапись), `off`.
- Промах при изменённом промпте — **это фича**: гейт «конформанс» должен падать, если воркфлоу стал слать другой запрос. Плюс мягкий режим: при промахе ищем ближайшую кассету по SimHash от сообщений и показываем дифф в Studio — «кассета устарела, вот что изменилось».
- Хранилище: Postgres (`cassette(key PK, workflowVersion, nodeId, modelId, payload jsonb, createdAt)`) + опционально blob для больших. Content-addressed → дедуп кассет между прогонами бесплатный.
- Что действительно берём готовым: **`EvaluateOptions.cache` + namespace `cache` у promptfoo** для матрицы моделей (там нам не нужен тайминг чанков, нужна экономия) и `msw@2.15.0` — для юнит-тестов HTTP-интеграций, не для evals.

Дополнительно: **seed и temperature=0 не дают детерминизма** у большинства провайдеров (best-effort). Поэтому кассеты — единственный реальный способ получить воспроизводимый перепрогон, и это надо прямо написать в доке.


## 7. Blame через подстановку эталона (§12.3)

### Prior art — есть, и называется иначе
1. **Fault localization / delta debugging (Zeller).** Классика: минимизируем множество изменений, при которых тест падает. Наша подстановка эталона — это **ddmin по узлам графа**: множество «подменённых на эталон узлов» минимизируется до минимального набора, при котором прогон становится успешным.
2. **Causal tracing / activation patching** (Meng et al., ROME, arXiv:2202.05262) — подменяем промежуточное состояние на «чистое» и смотрим, восстанавливается ли правильный выход. Это ровно наша механика, только на уровне узлов воркфлоу, а не слоёв сети. Термин из литературы: **interchange intervention** (Geiger et al., causal abstraction). Мы можем прямо называть метрику **interchange intervention accuracy** — это даёт нам защищаемую формулировку.
3. **Counterfactual / ablation-эвалы агентов.** Практика уже есть в проде-инструментах (LangSmith/Braintrust умеют «rerun from step»), но **как автоматический blame-алгоритм с минимизацией — не встречал готовой реализации**. UNVERIFIED: нет ли этого в свежих версиях LangSmith/Braintrust.
4. Промышленный аналог концепции — **Shapley value attribution** по узлам. Даёт честную атрибуцию при взаимодействии узлов, но стоит O(2^n) прогонов; для n>6 нужен Monte-Carlo-сэмплинг (~100-200 перестановок).

### Точный алгоритм (наш)
Вход: failing run `R` на dataset item `x` с эталонами `gold[nodeId]` для интересующих узлов, топологический порядок `v1..vn`, оценка итога `pass(output) -> bool`.

```
blame(R, x):
  # 0. Предусловия
  assert R.status == FAIL и есть gold-эталоны хотя бы для части узлов
  cassettes = R.cassettes            # content-addressed, см. §6

  # 1. Быстрый скрин: single-node patch, по одному узлу
  suspects = []
  for v in nodes(R) where gold[v] exists:
      R_v = replay(R, patch={v: gold[v]}, from=v)   # переигрываем ТОЛЬКО downstream(v)
      if pass(R_v.output): suspects.append(v)
  # Если ровно один -> это виновник, выходим.

  # 2. Если ни один одиночный патч не чинит -> взаимодействие узлов.
  #    Запускаем ddmin по множеству узлов:
  S = all nodes with gold
  assert pass(replay(R, patch=gold_for(S)))          # санити: полный патч чинит
  S_min = ddmin(S, predicate = lambda T: pass(replay(R, patch=gold_for(T))))
  # S_min -- минимальное множество узлов, чья одновременная подмена чинит прогон.

  # 3. Если несколько одиночных чинят -> ранжируем вкладом
  #    (доля прогонов, где патч узла v чинит, по всем failing items)
  score[v] = |{x : pass(replay(R_x, patch={v: gold[v]}))}| / |failing items|
  # опционально: Monte-Carlo Shapley по перестановкам узлов

  return { primary: argmax(score) or S_min, suspects, evidence: [runIds] }
```

**Как именно подставляем.** Подмена — на границе узла, не внутри промпта:
- у каждого узла типизированный выход (Zod-схема). `gold[v]` валидируется этой схемой перед подстановкой — иначе blame недостоверен.
- в графе исполнения узел `v` помечается `mode: "pinned"`; рантайм не вызывает модель, а возвращает `gold[v]` как результат и пишет спан `workflow.node.pinned = true`.
- **upstream узлы не переигрываются вообще** — берём их выходы из исходного прогона (это уже детерминировано и бесплатно). Переигрывается строго `downstream(v)` = все узлы, достижимые из `v` в DAG. Для этого нужен reachability по графу — `graphology-dag` + `graphology-traversal` уже в probe-fe.
- если граф с циклами/ретраями, downstream берём по развёрнутому графу исполнения (execution trace), а не по статическому определению.

**Как атрибутируем провал.**
- `single-node fix` → узел = `primary`, уверенность высокая, в Studio: «подмена выхода узла X эталоном делает прогон успешным на N/M items».
- `ddmin S_min` c |S_min| > 1 → «провал распределён»: ни один узел сам по себе не виноват, нужны оба. Показываем как группу.
- `никакой патч не чинит` → виноват не узел, а **итоговый скорер/эталон или узел без gold** (в т.ч. финальный). Явно отдаём это как отдельный вердикт, а не молча возвращаем пустоту.
- Все выводы сопровождаются CI: `score[v]` c бутстрэп-интервалом по items; при |failing| < 10 показываем «недостаточно данных».

### Как сочетается с replay-кэшем (§6) — критично
- **Upstream: чистый replay.** Узлы до `v` берут ответы из кассет по неизменённому ключу → 0 токенов, 0 недетерминизма.
- **Downstream: кассеты промахнутся ГАРАНТИРОВАННО** — мы подменили вход, значит canonical(request) другой. Это ожидаемо: blame-прогон работает в режиме `auto` (промах → живой вызов + дозапись). Именно downstream и стоит денег; `|downstream(v)|` определяет цену blame.
- Отсюда порядок перебора в шаге 1: **идём с конца графа к началу** (узлы с наименьшим downstream первыми) — самые дешёвые гипотезы проверяются раньше, и при раннем попадании мы вообще не платим за длинный хвост.
- Кассеты blame-прогонов складываем с тегом `{ blameOf: runId, pinnedNode: v }` — повторный blame того же item бесплатен, и это даёт детерминированный «вечный» отчёт, который можно показать в Studio спустя месяц.
- Бюджет: на шаге 1 максимум `|nodes with gold|` прогонов downstream; ddmin — `O(n log n)` прогонов в худшем случае. Обязателен явный лимит (`maxBlameRuns`, `maxBlameCostUsd`) и отдача частичного результата.

MCP-поверхность (§12.3 требует `run.blame`): `run.blame({ runId, itemId?, nodes?, budget? }) -> { primary, suspects[], minimalSet[], evidence[], cost }`.


## Итоговая сборка (что берём / что пишем сами)

**Берём готовым:**
- `@voltagent/evals@2.0.5` (MIT) — определение экспериментов, датасет-реестр, runner-контракт, VoltOps-связка.
- `@voltagent/scorers@2.1.0` (MIT) — каталог скореров; внутри уже `autoevals`.
- `promptfoo@0.123.0` (MIT) — **только как движок матрицы моделей** в изолированном пакете/воркере; наш воркфлоу подключается кастомным `ApiProvider`. Требует Node >= 22.22.0.
- `autoevals@0.3.0` (MIT) — формат спеки LLM-судьи (`ModelGradedSpec`, `LLMClassifierFromSpec`) и `Battle`.
- `simple-statistics@7.12.0` (ISC) + `@stdlib/stats-*` — корреляции и тесты значимости.
- `json-canonicalize` / `fast-json-stable-stringify` + `@noble/hashes` — канонизация и хэши (дедуп + кассеты).
- `graphology-dag` / `graphology-traversal` — downstream/reachability для blame.
- `msw@2.15.0` — HTTP-моки в юнит-тестах (НЕ для evals).
- Langfuse (self-host) — датасеты, прогоны, разметка.

**НЕ берём:** viteval (third-party по признанию самих доков, offline-only, свой формат), evalite (лицензия не в npm-метаданных, ~7 мес без релиза), Polly.JS (3 года без релиза), `minhash`/`simhash`/`talisman` (все мертвы с 2022), promptfoo как ядро/хранилище.

**Пишем сами (ядро доверия — по правилу заказчика это как раз оно):**
1. **Node-level гейты** — агрегация `ExperimentResult.items[].scores` по `nodeId` + пороги на узел (у @voltagent/evals passCriteria только глобальные).
2. **Baseline-компаратор** — diff прогонов (datasetVersionId × workflowVersion × modelId), дельты по узлам с bootstrap-CI.
3. **Метрики согласия** — Cohen's weighted kappa, Krippendorff alpha, Kendall tau-b (в npm ЖИВЫХ пакетов нет ни для одной).
4. **Политика допуска судьи** — BLOCK / WARN / OFF по kappa+alpha+swap-стабильности, привязка к `judgeVersionHash`.
5. **Структурное покрытие датасета** — enum/branch/loop-exit/error-policy coverage + pairwise (IPOG) генерация.
6. **Дедуп и разнообразие** — SHA-256 канон + SimHash-64/Hamming + MinHash-LSH для длинных; distinct-n, self-BLEU, embedding-дисперсия.
7. **PII-маскирование** — слой regex-детекторов + детерминированные псевдонимы `<EMAIL_a3f9>` (presidio-аналога в TS нет).
8. **Кассеты record/replay** — content-addressed store на уровне AI SDK middleware, со стримом и тайминг-чанками (HTTP-моки принципиально не подходят).
9. **Blame** — single-node patch скрин + ddmin + Shapley-ранжирование, переигрывается только downstream, upstream из кассет.

**Главные риски:**
- promptfoo тянет 490 пакетов, express, socket.io, drizzle/libsql, posthog-node и Node 22+ — обязательна изоляция в отдельный процесс и отключение телеметрии/remote-generation.
- LLM-судья класса G-Eval даёт Spearman ~0.51 с человеком — жёсткий блокирующий гейт на нём **необоснован**; нужна панель (PoLL) + калибровка.
- Live-скореры VoltAgent пишутся в OTel-спаны и НЕ персистятся в Eval Runs — цикл «прод → датасет» строим сами.
