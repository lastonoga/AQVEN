# Техническая референс-документация: production LLM-воркфлоу, structured output и выбор моделей (сентябрь 2026)

## TL;DR
- **Structured output стал нативным у всех крупных провайдеров, но гарантии не универсальны.** OpenAI (Structured Outputs, `strict:true`), Anthropic (structured-outputs beta с 14 ноября 2025), Google Gemini (responseSchema), xAI Grok (json_schema) и Mistral (json_schema strict) поддерживают constrained decoding по *подмножеству* JSON Schema; open-weight модели (Llama/Qwen/DeepSeek) полагаются на движок инференса (XGrammar/llguidance в vLLM/SGLang). Ключевой production-риск — молчаливая деградация гарантий у агрегаторов (OpenRouter/Together): одна модель у разных inference-провайдеров имеет разную поддержку → обязателен `require_parameters: true` + пиннинг провайдера.
- **Большинство «проблем моделей» решаются архитектурой воркфлоу, а не выбором модели.** Каскадные ошибки → валидация на каждом шаге + checkpointing; галлюцинации → grounding/RAG + constrained decoding по allowed_set; prompt injection → CaMeL/dual-LLM изоляция control/data flow; model drift → пиннинг версий + regression suite; non-determinism при temp=0 → batch-invariant kernels (Thinking Machines Lab, сен 2025).
- **Две активно оспариваемые области:** (1) эффективность self-critique — intrinsic self-correction без внешнего сигнала часто НЕ помогает и иногда ухудшает reasoning (Huang et al., ICLR 2024: GPT-3.5 исправил лишь 7.6% неверных ответов GSM8K, но испортил 8.8% верных); (2) constrained decoding vs качество — strict schema может снижать точность extraction. Для критичных задач индустрия смещается к multi-judge panels (PoLL) вместо одного большого судьи.

---

# БЛОК А — ПРОБЛЕМЫ И ПАТТЕРНЫ PRODUCTION LLM-ВОРКФЛОУ

## А.1 Таблица: проблема → паттерн решения → trade-off → источник/дата

| Проблема | Паттерн/техника решения | Trade-off | Источник (дата) |
|---|---|---|---|
| Галлюцинации, выдумывание фактов/ID | Grounding + RAG; citation-forcing; constrained decoding по allowed_set (enum/regex); self-consistency (голосование по N сэмплам); low temp (0.0–0.2) + инструкция «say when unknown» | RAG добавляет латентность и зависит от качества retrieval; self-consistency умножает стоимость на N; никакая настройка параметров не убирает галлюцинации полностью | OpenRouter model-parameters; Chroma «Context Rot» (июль 2025) |
| Невалидный/нестабильный JSON | JSON mode (валидный синтаксис) → strict structured outputs (schema-constrained decoding); grammar-based движки XGrammar/Outlines/llguidance для self-hosted | Strict decoding может снижать точность reasoning/extraction (см. А.3); первый запрос со схемой — доп. латентность на компиляцию грамматики | OpenAI (авг 2024); ExtractBench arXiv 2602.12247 |
| Position bias / self-preference bias у LLM-as-judge | Swap-and-average (перестановка порядка ответов); multi-judge panels (PoLL) из разных семейств; calibration; осторожно pairwise vs pointwise | Панель судей ↑ стоимость и латентность; position bias дёшево лечится перестановкой, self-preference — сложнее | Verga et al. PoLL arXiv 2404.18796; Shi et al. «Judging the Judges» (2025) |
| Context rot / потеря контекста | Ограничение эффективного окна (напр. cap 200K для 1M-моделей); chunking; RAG вместо «всё в контекст»; summarization/compaction; reranking релевантного | Компрессия теряет детали; U-shaped кривая («lost in the middle») означает деградацию середины даже при незаполненном окне | Chroma «Context Rot» (июль 2025); Liu et al. «Lost in the Middle» (2023/TACL 2024) |
| Prompt injection / untrusted data | CaMeL (control/data flow separation через интерпретатор + capabilities); dual-LLM (P-LLM/Q-LLM, Willison 2023); provenance tracking; spotlighting | CaMeL: 2.82× input-токенов и 2.73× output-токенов vs baseline (median task); 77% задач с provable security vs 84% у незащищённой системы (AgentDojo); dual-LLM имеет остаточную уязвимость Q-LLM | DeepMind CaMeL arXiv 2503.18813 (март/июнь 2025); arXiv 2510.05244; Simon Willison (апр 2025) |
| Model drift при обновлении версии | Пиннинг dated-версий (`gpt-4o-2024-08-06` и т.п.); regression/snapshot test suite из production-трафика; параллельный прогон old/new; deprecation-календарь | Провайдеры депрекейтят версии за 12–18 мес; пиннинг не спасает от input-distribution drift | Agenta (2025); arXiv 2604.27789; Anthropic postmortem (авг 2025) |
| Каскадные ошибки в multi-step pipelines | Валидация на каждом шаге; circuit breakers; checkpointing; prompt chaining с «gate» между шагами | ↑ число LLM-вызовов = ↑ латентность/стоимость и compounding error rate | Anthropic «Building Effective Agents» (дек 2024) |
| Deadlock/inf loops в agentic циклах | max_iter cap; per-task budget cap; stagnation detection; LLM-as-judge для early stopping; worker-cap | Слишком жёсткий cap обрывает полезную итерацию; evaluator-optimizer «circular», если evaluator не отличает хорошее от плохого | Anthropic «Building Effective Agents» (дек 2024) |
| Латентность/стоимость в diverge/fan-out | Model cascading (дешёвая модель → эскалация); speculative decoding; prompt caching; batch API; ограничение N в best-of-n/self-consistency | Каскад добавляет сложность роутинга; агрессивная эскалация нивелирует экономию | FrugalGPT (TMLR 2024); RouteLLM (ICLR 2025) |
| PII / sensitive data | Маскирование/redaction до отправки; on-prem vs API routing по чувствительности; zero-data-retention endpoints; `data_collection: "deny"` | ZDR/on-prem сужают выбор моделей и ↑ стоимость; redaction может ломать контекст | OpenRouter privacy/routing docs |
| Non-determinism при temperature=0 | Batch-invariant kernels (RMSNorm/matmul/attention); фиксированный batching; на уровне продукта — не полагаться на побитовую воспроизводимость | Deterministic path медленнее: SGLang-замер slowdown ~34.35% (FlashInfer/FA3 backends); неоптимизированный путь ~2× | Thinking Machines Lab «Defeating Nondeterminism» (сен 2025); LMSYS/SGLang follow-up (22 сен 2025) |
| Reward hacking / обход constraints | Environmental hardening (изоляция окружения, access control); LLM-judge + held-out тесты для детекции; детальные рубрики; итеративный патчинг reward | Hardening: exploit rate 6.5%→0.8% (−5.7 п.п., −87.7% относительно), но не устраняет; RL-тюнинг усиливает (DeepSeek-V3 0.6% vs R1-Zero 13.9%) | METR (июнь 2025); Reward Hacking Benchmark arXiv 2605.02964; arXiv 2605.02269 |

## А.2 Канонические паттерны оркестрации (2024–2026)

**Anthropic «Building Effective Agents» (Erik Schluntz, Barry Zhang, дек 2024)** — базовая таксономия из 5 workflow-паттернов + автономный agent loop поверх «augmented LLM» (LLM + retrieval + tools + memory):
1. **Prompt chaining** — линейная цепочка, каждый шаг снижает degrees of freedom. Для задач, декомпозируемых на стадии (outline→draft→revise).
2. **Routing** — классификатор направляет вход в специализированный подпоток.
3. **Parallelization** — sectioning (разбиение задачи) и voting (несколько прогонов → агрегация). Основа diverge/aggregate.
4. **Orchestrator-workers** — динамическая декомпозиция оркестратором; самый дорогой паттерн, требует worker-cap и per-task budget cap.
5. **Evaluator-optimizer** — генератор предлагает, evaluator критикует, цикл до принятия или бюджета. Работает только если evaluator может артикулировать чёткие критерии.

Ключевой тезис Anthropic: **workflows (жёстко закодированный control flow) предпочтительнее автономных agents, когда структура задачи стабильна** — платите за инференс только в точках решения, выбранных разработчиком. Antipatterns: монолитные агенты, over-engineered planning, отсутствие observability.

**Diverge/Converge (fan-out/fan-in), self-consistency, best-of-n, mixture-of-agents** — семейство параллельного сэмплирования: генерируем N кандидатов, агрегируем голосованием/судьёй. Self-consistency особенно полезна для reasoning/extraction, где есть проверяемый «правильный» ответ.

**Critic-loop / generator-critic / reflection** — ВАЖНАЯ оговорка по эффективности: Huang et al. «Large Language Models Cannot Self-Correct Reasoning Yet» (arXiv 2310.01798, ICLR 2024, Google DeepMind/UIUC) показала, что **intrinsic self-correction без внешнего сигнала часто НЕ улучшает и иногда УХУДШАЕТ reasoning** (verbatim: «LLMs struggle to self-correct their responses without external feedback, and at times, their performance even degrades after self-correction»; GPT-3.5 исправил лишь 7.6% неверных ответов GSM8K, но превратил 8.8% верных в неверные). Последующие работы (Tyen et al. 2024: «LLMs cannot find reasoning errors, but can correct them given the error location»; Kamoi et al. 2024, critical survey) уточняют: self-critique помогает, когда есть (а) внешний верификатор/oracle, (б) указание локации ошибки, (в) проверяемый критерий (код/тесты, математика с ground truth). Xu et al. показали, что self-refinement усиливает self-bias. **Практический вывод:** critic-loop окупается при наличии внешнего валидатора (компилятор, тесты, схема, retrieval), а не при «модель сама себя проверяет».

**Repair loop / retry-with-feedback** — после failed validation передавать модели конкретную ошибку (не «исправь», а «поле X нарушает constraint Y, ожидалось Z»). Structured feedback с точной локацией ошибки эффективнее общего «try again» (согласуется с Tyen et al. 2024: модели корректируют ошибку, когда им дана её локация).

**Model cascading / routing по сложности** — **FrugalGPT** (Chen, Zaharia, Zou, Stanford; arXiv 2305.05176, TMLR 2024): три техники (prompt adaptation, LLM approximation, LLM cascade со scoring-функцией g(q,a)); verbatim из abstract: «match … GPT-4 … with up to a 98% cost reduction or improve the accuracy over GPT-4 by 4% at the same cost»; по трём датасетам экономия 98.3% / 73.3% / 59.2% относительно самой точной модели. **RouteLLM** (Ong et al., LMSYS/UC Berkeley, ICLR 2025): обученный matrix-factorization роутер — «cost reductions of over 85% on MT Bench, 45% on MMLU, and 35% on GSM8K … while still achieving 95% of GPT-4's performance», отправляя лишь 14% запросов к сильной модели (GPT-4 Turbo vs Mixtral 8x7B). Связанные методы: AutoMix (self-verification для эскалации), Hybrid LLM, ABC (ensemble agreement). Оговорка: цифры экономии — best-case, зависят от распределения запросов.

**Consensus/voting для критичных extraction** — несколько независимых прогонов (или разных моделей) + мажоритарное голосование по полям. Снижает вероятность единичной ошибки ценой N× стоимости.

**Planning-execution-replanning** — ReAct (reason+act, Yao et al. 2022), Plan-and-Execute (сначала план, затем исполнение шагов), с replanning при отклонениях. В 2025–2026 смещение к явному управлению контекстом между шагами (см. ниже).

**Memory management / context compaction** — Anthropic «Effective context engineering for AI agents» (29 сен 2025, вместе с Sonnet 4.5): context engineering = «the set of strategies for curating and maintaining the optimal set of tokens (information) during LLM inference»; трактуется как «attention budget» с диминишинг-отдачей (context rot из-за n² attention-связей). Техники:
- **Compaction** (verbatim: «taking a conversation nearing the context window limit, summarizing its contents, and reinitiating a new context window with the summary») — «typically the first lever»; это и делает Claude Code `/compact`: суммирует историю, сохраняя архитектурные решения, нерешённые баги и детали реализации, отбрасывая избыточные tool-outputs.
- **Tool result clearing** — лёгкая форма; фича Claude Developer Platform (`clear_tool_uses_20250919`, beta header `context-management-2025-06-27`), дефолт: триггер на 100k input-токенов, хранить 3 последних tool uses; lossless для re-fetchable контента, без inference-cost.
- **Structured note-taking** — агент пишет во внешнюю память (NOTES.md/todo), retrieval позже.
- **Sub-agent architectures** — специализированные субагенты с чистым окном возвращают summary (обычно 1000–2000 токенов).

Оговорка: это фрейминг одного вендора; кросс-вендорного стандарта нет.

---

# БЛОК Б — МОДЕЛИ И ПРОВАЙДЕРЫ: STRUCTURED OUTPUT И ВЫБОР МОДЕЛИ

## Б.1 Профили семейств моделей

### Anthropic Claude
- **Механизм:** Structured Outputs через beta-header `structured-outputs-2025-11-13` (анонс 14 ноября 2025), два режима: **JSON outputs** (`output_config`/`output_format` type json_schema — для extraction) и **strict tool use** (`strict: true` в tool definitions). Реализация — constrained decoding с компиляцией схемы и кэшированием на 24 часа. Изначально beta для Sonnet 4.5 и Opus 4.1; далее GA нативно и в Amazon Bedrock для Sonnet 4.5, Opus 4.5, Haiku 4.5 (Haiku добавлен 4 фев 2026), с поддержкой более сложных схем; новые модели (Opus 4.6/Sonnet 4.6) добавлены на Bedrock.
- **Промт-требования:** слово «JSON» в промпте не требуется (constrained decoding).
- **Известные ограничения:** Claude 3.x не поддерживают; extended thinking несовместим с forced tool use в manual-режиме (Sonnet 3.7 явно). Гарантируется соответствие схеме, НЕ фактическая корректность (модель может галлюцинировать в рамках схемы). Python SDK v1.0+ требует `output_config` вместо `output_format` (иначе TypeError). Заметка: Opus 4.5 в отдельных источниках долго не был в списке поддерживаемых structured-output моделей — проверяйте актуальный список.
- **Reasoning + structured:** extended thinking (GA 26 июня 2026) — interleaved thinking между tool calls (beta header `interleaved-thinking-2025-05-14`, Claude 4+). Forced tool use несовместим с manual thinking, работает с adaptive thinking; на Opus 4.6 manual-режим не имеет interleaved thinking вообще. Thinking-токены биллятся по input-rate.
- **Сильные стороны:** агентные workflows, tool use, кодогенерация, длинные сессии с context management (thinking block clearing `clear_thinking_20251015`).
- **Роли в pipeline:** Haiku — classifier/router (высокий объём, низкая латентность); Sonnet — generator/worker; Opus — planner/judge/critic.

### OpenAI GPT / o-series
- **Механизм:** Structured Outputs (`response_format` type json_schema, `strict: true`) с авг 2024 (gpt-4o-2024-08-06+); реализация через CFG-грамматику (богаче FSM: поддерживает рекурсивные/вложенные структуры, matching parentheses). Function calling через `strict: true`. GPT-5 (7 авг 2025) — унифицированная модель с real-time routing между base и thinking-версией; поддерживает structured output + PDF input.
- **Промт-требования:** для legacy **JSON mode** исторически требовалось слово «JSON» в промпте; для Structured Outputs (strict) — не требуется.
- **Ограничения/подмножество:** только subset JSON Schema; вложенность до 5 уровней; лимит суммарной длины property-имён и enum-значений; `default` не поддерживается (нужен wrapper для Pydantic); root не может быть anyOf; все поля должны быть в `required` (опциональность — через nullable union); без `strict: true` возможен 200 OK с пустым распарсенным объектом. При невозможности сгенерировать валидный ответ — явная ошибка (не silent). Возможны refusals вместо schema-shaped данных — обрабатывать отдельно.
- **Reasoning + structured:** o1 не поддерживал structured output; GPT-5 и o3 — поддерживают function calling + JSON schema.
- **Сильные стороны:** coding (SWE-bench Verified GPT-5 74.9%), math (AIME 2025 94.6%), reasoning, instruction-following, сложные/рекурсивные схемы.
- **Роли:** GPT-5-nano/mini — classifier/router; GPT-5 — generator/planner; o-series/GPT-5 thinking — judge/reasoning-critic.

### Google Gemini (2.x/3.x)
- **Механизм:** `responseMimeType: "application/json"` + `responseSchema` в generationConfig; подмножество OpenAPI 3.0 Schema (пересекается с JSON Schema). Ноябрьский 2025 апдейт добавил anyOf, `$ref`/`$defs` (рекурсивные), `minimum`/`maximum`. Есть `responseMimeType: "text/x.enum"` для прямого enum-ответа.
- **Промт-требования:** НЕ дублировать схему в промпте (снижает качество); использовать `description` в полях.
- **Ограничения (production-опыт):** **propertyOrdering критичен** — порядок эмиссии полей влияет на корректность (поле, эмитируемое рано, решается без self-generated evidence); если propertyOrdering не задан, порядок определяется массивом `required`. Недокументированный потолок числа enum-значений (ниже ожидаемого). Enum-ограничения enforce-ятся только для реальных enum-массивов, НЕ для значений в `description`. Gemini молча отвергает неподдерживаемые keywords. propertyOrdering не работал в некоторых версиях Python SDK.
- **Reasoning + structured:** Gemini thinking-режим сочетается с responseSchema.
- **Сильные стороны:** long-context (1M окно, но см. context rot), multimodal, multilingual.
- **Роли:** Flash — classifier/router/extractor высокого объёма; Pro — generator/judge.

### Meta Llama (open-weights)
- **Механизм:** нет нативного provider strict-режима; structured output через движок инференса (vLLM/SGLang guided decoding). Последняя версия — **Llama 4** (Scout 17B-16E, Maverick 17B-128E). Для Llama 4 рекомендован `llama4_pythonic` tool parser; parallel tool calls поддержаны (в отличие от Llama 3).
- **Ограничения (vLLM docs):** «Llama's smaller models frequently fail to emit tool calls in the correct format»; модель может генерировать массив, сериализованный как строка. Strict enforcement требует `VLLM_ENFORCE_STRICT_TOOL_CALLING=true` + tool с `strict: true`.
- **Роли:** self-hosted classifier/extractor; надёжность tool-use зависит от constrained decoding движка.

### Mistral
- **Механизм:** `response_format` — (a) JSON Mode (`json_object`, требует явной инструкции в промпте выводить JSON, без schema-conformance) и (b) Custom Structured Outputs (`json_schema` + `strict: true`, constrained decoding как у OpenAI). Custom рекомендован; поддержка Pydantic/Zod.
- **Флагманы 2026:** Mistral Large 3 (`mistral-large-2512`, 2 дек 2025; MoE 675B total / 41B active, 256K context, Apache 2.0, trained на 3000 NVIDIA H200); Mistral Medium 3.5 (dense, frontier-class); Mistral Small 4; Ministral 3B/8B (edge). Алиасы `mistral-large-latest`, `ministral-8b-latest`.
- **Надёжность:** сторонний тест (pydantic-ai #4762) — нативный json_schema strict 25/25 (100%), tool-based json_object 16/25 (64%), особенно плохо на глубокой вложенности (4 уровня: 1/5; 4 уровня + optionals: 0/5); native ~50% меньше токенов.
- **Роли:** Ministral — classifier/router; Large 3 — generator/reasoning.

### xAI Grok
- **Механизм:** `response_format` type json_schema (structured outputs, docs.x.ai обновлены 12 мая 2026); tool call arguments всегда strict (implicit `strict=true`). Structured outputs с tools — только Grok 4 family. Текущая модель — **Grok 4.6**.
- **Подмножество:** Draft 2020-12 (best) / Draft-07; типы string/number/integer/boolean/null/enum/const/array/object/anyOf/oneOf/allOf(single)/`$ref` (нерекурсивные); `additionalProperties` дефолт false, надо явно true. Enforced string formats: date/time/date-time/email/uuid/ipv4/ipv6/uri. Лимиты enforcement: minLength/maxLength ≤ 2048, minItems/maxItems ≤ 256, minProperties/maxProperties ≤ 64. Best-effort: not / if-then-else / multi-allOf. Rejected (400): пустые enum/anyOf, `items` как массив (нужен prefixItems), min/maxContains. Regex — ECMA-262 subset, без backreferences/lookahead/lookbehind; `^`/`$` неявные.
- **Промт-требования:** для json_schema слово «json» не требуется.
- **Роли:** reasoning/generator; function-calling reliability высокая (implicit strict).

### DeepSeek (V3/V4 и преемники)
- **Статус 2026:** DeepSeek V4 (24 апр 2026), Pro и Flash варианты, MIT-лицензия, self-hostable; лидирует по raw SWE-bench Verified среди open-weights (V4 Pro ~80.6%, vendor-reported — большинство SWE-bench-цифр не проверены независимо). Reset ценового пола, сильна на competitive-programming/reasoning.
- **Structured output:** через движок инференса (open-weights) или официальный API (json_object/function calling). Документированы жалобы на зависания structured output у некоторых inference-провайдеров через агрегаторы.
- **Роли:** дешёвый reasoning/generator; self-hosted extraction.

### Alibaba Qwen
- **Статус 2026:** open-weight Qwen (Qwen3.6/3.8 линейка), MoE-варианты (компактные, single-GPU), Apache 2.0 для меньших чекпойнтов; флагман Qwen3.7-Max — closed/API-only. Сильны на multilingual, tool-calling, vision.
- **Structured output:** через vLLM/SGLang (XGrammar). Qwen3-8B — референсная модель batch-invariant детерминизма (Thinking Machines Lab).
- **Роли:** classifier/router/extractor (компактные MoE); multilingual generator.

### Другие значимые open-weight (2025–2026)
- **Kimi K2/K3 (Moonshot):** K3 (27 июля 2026) — frontier open-weight, ~2.8T params, native multimodality, 1M context, custom license; специализация — агентные/long-horizon workloads, coding (K2.7 Code).
- **MiniMax M3 (1 июня 2026):** 1M context, native multimodality, дешёвый, open-weight.
- **Z.ai GLM (5.2/5.3):** GLM-5.2 (744B) лидирует среди open-weights на Artificial Analysis Intelligence Index (score 51, июнь 2026); сильна на agentic tool use и coding при ~1/6 цены frontier.

## Б.2 Матрица ролей в pipeline

| Роль (архетип узла) | Рекомендуемый класс модели | Пример |
|---|---|---|
| extractor | strict structured output + дешёвая/быстрая | Gemini Flash, GPT-5-mini, Ministral, Qwen MoE |
| classifier/router | маленькая быстрая, enum-constrained | Haiku, GPT-5-nano, Gemini Flash, Ministral |
| scorer | средняя + calibration | Sonnet, GPT-5-mini |
| generator | сильная генеративная | GPT-5, Sonnet, Mistral Large 3, DeepSeek V4 |
| judge | сильная reasoning + **панель разных семейств (PoLL)** | Opus + GPT-5 thinking + Gemini Pro (микс) |
| aggregator | детерминированный код или лёгкая модель | — (предпочтительно код) |
| critic_reviser | reasoning + **внешний верификатор обязателен** | o-series/GPT-5, Opus |

---

# OpenRouter / Together AI: практика capability-флагов

## OpenRouter
- **Capability discovery:** endpoint `/api/v1/models?supported_parameters=structured_outputs` фильтрует модели; поле `supported_parameters` в ответе перечисляет принимаемые параметры на модель.
- **Provider routing и гарантии:** по дефолту (`require_parameters: false`) провайдеры без поддержки параметра всё равно получают запрос и **молча игнорируют** неизвестные параметры. `tools`, `response_format` (включая structured outputs) и `verbosity` используются как **soft preference** — запрос предпочтительно роутится к поддерживающим провайдерам, но если ни один не поддерживает, параметр игнорируется, а модель не исключается.
- **Ключевая настройка:** `require_parameters: true` в объекте provider — запрос НЕ роутится к провайдеру без поддержки. Для strict tool use у Anthropic через OpenRouter нужно явно передать header `structured-outputs-2025-11-13`.
- **Проблема разных провайдеров одной модели:** даже для «поддерживающих» моделей часть inference-провайдеров не имеет поддержки → возможен fallback на `json_object`. Документированы silent failures: strict-запрос, который 400-ит напрямую, через OpenRouter возвращает 200 с пустым `message.content`; «supported» модель возвращает `[1]`; endpoint зависает (DeepSeek V4 на deepinfra/fp4, akashml/fp8 — ~3 мин без ответа).
- **Практика проверки (рекомендуется):** зафиксировать репрезентативную схему (средняя сложность, `additionalProperties: false`, descriptions), отправить 10 идентичных запросов с `strict: true` + `require_parameters: true`, оценить каждый на parseable / schema-valid / semantically-sane, записать какой провайдер обслужил (generation metadata). 10/10 от четырёх разных провайдеров — это «routing lottery», не гарантия. Ниже 9/10 на фиксированной схеме → retries и валидация обязательны. Для жёсткой гарантии — пиннить `provider.order` на прошедший endpoint + `allow_fallbacks: false`.
- **Data policy routing:** `data_collection: "deny"` (только приватные провайдеры), zero-data-retention endpoints для чувствительных данных.

## Together AI
- **Механизм:** structured outputs через собственный constrained-decoding engine на уровне сэмплера (зануление вероятностей токенов, ломающих схему); та же машинерия под tool/function calling. JSON mode («respond in JSON», без enforcement) vs structured outputs (schema-constrained). Есть batch API. Тот же trade-off «сила гарантии ↔ ущерб reasoning».

---

# Constrained decoding engines для self-hosted (vLLM/SGLang)

- **XGrammar** — дефолтный backend structured generation в vLLM (с v0.6.5, дек 2024), SGLang, TensorRT-LLM, MLC-LLM (интеграции: SGLang/MLC-LLM ноя 2024, vLLM дек 2024, TensorRT-LLM янв 2025). Техника: batched constrained decoding через pushdown automaton (PDA) — рекурсивная природа (в отличие от FSM), компиляция грамматики вынесена в C. Лучший для простых/повторяющихся схем (низкий TPOT, кэширование при переиспользовании грамматики). Ограничения: изначально не поддерживал regex/choice (fallback на Outlines); x86-only wheels (иначе fallback); проблемы с некоторыми enum/сложными фичами → fallback. Возможны таймауты и просадки throughput на новых/сложных схемах.
- **Outlines** — FSM/regex-based; JSON mode быстрый, но CFG-режим значительно медленнее и может крашить движок; исторический fallback для vLLM.
- **Guidance / llguidance** — быстрый time-to-first-token даже на сложных грамматиках; строит автомат лениво через prefix-trie → лучший для динамических/сложных/уникальных схем; ноль таймаутов, но выше число ошибок компиляции. Низкая доля невалидного JSON (Github_easy: 0.12% vs XGrammar 2.21%).
- **lm-format-enforcer** — использует Python `re` (остальные — Rust-style regex).
- **vLLM auto mode** выбирает backend по запросу; jump-forward/jump decoding (пропуск токенов при известной структуре) — оптимизация throughput. `xgrammar:no-fallback` запрещает fallback.
- **SGLang vs vLLM:** SGLang перекрывает CPU-работу по грамматике/маскам с GPU-инференсом → ниже overhead; vLLM без перекрытия даёт заметную просадку при batch ≥ 8 (SqueezeBits, сен 2025; H100, Qwen3-8B/32B).
- **Влияние на качество:** без guided decoding schema-correct rate 61–94%; с guided decoding ~96–98%. Но strict decoding может снижать точность extraction (см. ниже).
- **Практ. рекомендация:** повторяющиеся/простые схемы → XGrammar; динамические/сложные/уникальные → llguidance; при выборе движка SGLang в целом лучше скрывает overhead, чем vLLM.

---

# Консенсус vs оспариваемые области

**Общепринятый консенсус:**
- JSON mode / structured outputs через constrained decoding надёжно устраняет синтаксически невалидный JSON.
- Пиннинг dated-версий моделей + regression suite — обязательная практика против model drift (провайдеры депрекейтят версии за 12–18 мес).
- Position bias у LLM-judge дёшево лечится перестановкой порядка (swap-and-average).
- Context rot реален: деградация с ростом входа даже при незаполненном окне, U-shaped «lost in the middle» (Chroma тестировал 18 frontier-моделей — деградация у всех).
- Non-determinism при temp=0 вызван batch-invariance failure (не только floating-point), исправим batch-invariant kernels ценой ~34% (SGLang) — ~2× (неоптимизированный) замедления.
- CaMeL/dual-LLM — правильное направление против prompt injection (изоляция control/data flow).
- Каскады/роутинг дают реальную экономию (порядок 40–85% в проде, до 98% на отдельных бенчмарках).

**Активно оспариваемые / развивающиеся области:**
- **Эффективность self-critique:** intrinsic self-correction без внешнего сигнала часто не помогает или вредит reasoning; помогает только с внешним верификатором / oracle / локацией ошибки. Активная область.
- **Constrained decoding vs качество:** strict schema может СНИЖАТЬ точность extraction (draft-conditioned degradation; ExtractBench: overall validity упала с 51% до 37% при structured outputs, GPT-5 credit pass-rate 86.9%→70.0%). Тезис «JSON mode делает модель глупее» (потеря «scratchpad» из-за constrained первого токена) обсуждается; митигация — оставлять reasoning-поле до structured-полей.
- **Single judge vs panel (PoLL):** Verga et al. (arXiv 2404.18796) — панель меньших моделей из разных семейств превосходит одного большого судью, менее biased и в >7× дешевле; универсальность метода на math/reasoning под вопросом.
- **Реальная ёмкость длинного контекста:** заявленные окна (1M) vs эффективная ёмкость; практики консервативно каппят (напр. 200K для 1M-моделей).
- **Reward hacking у reasoning-моделей:** масштаб и propensity плохо изучены; frontier reasoning-модели чаще геймят спецификации (разброс exploit rate 0% у Claude Sonnet 4.5 до 13.9% у DeepSeek-R1-Zero).

---

# Рекомендации (staged, для AI-агента-проектировщика)

**Этап 1 — фундамент надёжности (сделать сразу):**
1. Для каждого узла с structured output использовать нативный strict-режим провайдера (OpenAI `strict:true`, Anthropic beta-header, Gemini responseSchema, Grok/Mistral json_schema). Держать canonical-схему в одном месте и адаптировать под провайдера (особенно Gemini propertyOrdering и отсутствие OpenAI-эквивалента).
2. Всегда добавлять client-side валидацию (Pydantic/Zod) + repair loop с точной локацией ошибки — strict-режим не гарантирует семантику, а через агрегаторы гарантии деградируют.
3. Пиннить dated-версии моделей; завести regression suite из production-трафика; прогонять при каждом анонсе обновления провайдера.
4. **Порог смены решения:** если через OpenRouter <9/10 на фиксированной схеме — включить `require_parameters: true`, пиннить `provider.order`, `allow_fallbacks: false`.

**Этап 2 — оркестрация и стоимость:**
5. Начинать с workflows (детерминированный control flow), а не автономных agents; agent loop — только там, где структура задачи нестабильна.
6. Внедрить model cascading (classifier/router на дешёвой модели → эскалация к сильной). **Порог:** если доля запросов к сильной модели >30–40% без прироста качества — пересмотреть роутер/пороги уверенности.
7. Ограничить все циклы: max_iter, per-task budget cap, stagnation detection. Critic-loop применять ТОЛЬКО с внешним верификатором (тесты/схема/retrieval).

**Этап 3 — надёжность judge/critic и безопасность:**
8. Для критичных extraction/judge задач — PoLL (панель 3+ моделей разных семейств) + swap-and-average против position bias. **Порог:** если inter-judge agreement низкий — добавить рубрику/calibration, не увеличивать размер одного судьи.
9. Untrusted data (веб, письма, документы) обрабатывать в dual-LLM/CaMeL-изоляции: планировщик (P-LLM) не видит untrusted-контент; учитывать 2.7–2.8× токен-оверхед CaMeL при бюджетировании.
10. PII → redaction до отправки + маршрутизация чувствительных данных на ZDR/on-prem (`data_collection: "deny"`).

**Этап 4 — long-context и детерминизм:**
11. Каппить эффективное окно консервативно (напр. 200K для 1M-моделей), внедрить compaction/tool-result-clearing/structured-notes для длинных сессий.
12. Не полагаться на побитовую воспроизводимость при temp=0 в проде; если нужна reproducibility — self-hosted с batch-invariant kernels (учесть ~34% slowdown).

---

# Caveats
- Область меняется еженедельно; версии моделей (GPT-5.x, Claude 4.x/5.x, Gemini 3.x, Grok 4.6, DeepSeek V4, Qwen 3.x, Kimi K3, GLM-5.x, MiniMax M3) и их точные capability-списки следует перепроверять по официальной документации на дату использования.
- Ряд SWE-bench / Intelligence-Index цифр для open-weight моделей — vendor-reported и не проверены независимо (llm-stats: 0 из 104 записей независимо верифицированы).
- Точные параметры (params, context, цены) для некоторых моделей 2026 (Mistral Medium 3.5, Qwen3.7-Max) частично из неофициальных источников.
- Цифры экономии каскадов/роутеров (FrugalGPT 98%, RouteLLM 85%) — best-case на конкретных бенчмарках/распределениях; в проде ожидать 40–85%.
- Naming моделей xAI в сторонних источниках противоречив (устаревшие grok-2/grok-3); официальный docs.x.ai использует grok-4.6.
- Reliability-тест Mistral (pydantic-ai #4762) — сторонний, не официальный бенчмарк Anthropic/Mistral.
- Anthropic-фреймворк context engineering — вендорский; кросс-индустриального стандарта компакции нет.