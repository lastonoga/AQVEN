# Engineering Judgment для проектирования production LLM-воркфлоу: Decision Framework

## TL;DR
- **Декомпозируйте по границам неопределённости, а не «на всякий случай».** Разбивайте задачу на отдельный LLM-узел тогда и только тогда, когда: (а) на этапах нужен разный тип неопределённости (grounded extraction vs open-ended generation vs closed-set classification vs deterministic aggregation); (б) разная стоимость ошибки/нужна human-checkpoint; (в) нужен внешний verifiable gate между шагами; (г) разные требования latency/cost. Держите цепочку в пределах ~5–7 LLM-шагов: при 95% per-step 5 шагов дают 0.95⁵≈77%, 10 шагов — 0.95¹⁰≈59% (Lusser's Law; Zartis/TianPan, 2026). Дальше добавляйте не шаги, а error-recovery.
- **Дивергенцию и critic-loop применяйте только при наличии сигнала окупаемости.** Self-consistency помогает на reasoning-задачах с closed-form ответом, но выходит на плато рано: Wang et al. 2022 («Self-Consistency Improves Chain of Thought Reasoning», arXiv:2203.11171) повысили GSM8K с 56.5% (single CoT greedy) до 74.4% при 40 сэмплах (+17.9 п.п.), прирост растёт до ~40 путей и затем сатурируется; на frontier-моделях 2025 выигрыш мал/иногда отрицателен (arXiv 2511.00751). Critic/verification loop окупается ТОЛЬКО при наличии внешнего verifier (код/тесты/схема/retrieval-grounding); чистый intrinsic self-correction без внешнего сигнала ухудшает reasoning — Huang et al., ICLR 2024 (Google DeepMind/UIUC): GPT-4 на GSM8K 95.5%→91.5% после 1 раунда self-review, →89.0% после 2-го. Ограничивайте цикл 2–3 итерациями (Madaan et al., Self-Refine, NeurIPS 2023: «Most gains are in the initial iterations»).
- **Проектируйте контекст и тесты до запуска.** Минимизируйте контекст до «наименьшего множества high-signal токенов» (Anthropic, Sep 2025) из-за context rot (Chroma, Kelly Hong/Anton Troynikov/Jeff Huber, Jul 2025: деградация на всех 18 frontier-моделях, включая GPT-4.1, Claude 4, Gemini 2.5, Qwen3, даже на trivial-задачах). Оценивайте достаточность формально через «Sufficient Context» (Joren et al., ICLR 2025). Для каждого узла стройте golden set из 4 корзин (production/adversarial/edge/failure-replay), калибруйте judge против человеческих меток (Cohen's κ / Krippendorff's α), гоняйте regression-evals в CI на каждый PR.

---

## Key Findings
1. **Единица декомпозиции — граница неопределённости/verifiability**, а не «логический подшаг». Разбивай, когда меняется тип узла или появляется точка для детерминированного gate.
2. **Компаундинг ошибок — жёсткое ограничение на длину.** p^n даёт бюджет: end-to-end 90% требует ~98% per-step при 5 шагах, ~98.9% при 10. → after 5–7 steps обязателен error-recovery.
3. **Divergence — инструмент против variance, а не bias.** Помогает при независимых ошибках + агрегируемом сигнале; вреден при систематической ошибке (скоррелированные сэмплы).
4. **Diversity source rank: разные промпты/модели > температура** (DIPPER, NeurIPS 2024; arXiv 2604.02450).
5. **Critic должен иметь другой контекст/сигнал, чем generator** — error correlation делает self-evaluation неинформативным.
6. **Router = classifier, привязанный к control-flow.** LLM vs cheap classifier — по reasoning/классам/latency/data.
7. **Тесты — по архетипу:** extractor → span-match; generator → property/metamorphic+judge; judge → калибровка против человека.
8. **Есть набор «code smells»:** over/under-decomposition, divergence без агрегируемого сигнала, critic-loop без verifier и без stop-condition, отсутствие gate, раздутый контекст.

---

## Details

### Раздел 1. Декомпозиция задачи на шаги воркфлоу

**Консенсус (Anthropic «Building Effective Agents», Dec 19 2024):** «find the simplest solution possible, and only increasing complexity when needed… For many applications, optimizing single LLM calls with retrieval and in-context examples is usually enough.» Prompt chaining уместен «where the task can be easily and cleanly decomposed into fixed subtasks. The main goal is to trade off latency for higher accuracy, by making each LLM call an easier task.»

#### 1.1 Decision table: разбивать или нет

| Признак задачи (измеримый) | Решение | Почему |
|---|---|---|
| Этапы требуют разного **типа неопределённости** (grounded extraction / closed-set classification / open-ended generation / deterministic aggregation) | **Разбить** по типу | Каждый тип оптимизирует разное; смешение снижает качество всех (Anthropic: «LLMs generally perform better when each consideration is handled by a separate LLM call») |
| Разная **стоимость ошибки** на этапах | **Разбить**, вокруг high-stakes — gate/human-checkpoint | Точечный verifier и разный порог качества |
| Есть **детерминированно проверяемый промежуточный артефакт** (JSON-схема, компилируемый код, число в диапазоне) | **Разбить** + programmatic gate | Ловит ошибку до compounding; дешевле LLM-judge |
| Разные **latency/cost** (Haiku vs Opus) | **Разбить** + routing по модели | Cost-оптимизация |
| Подзадачи **однородны, малы, одинаковой сложности**, общий контекст помогает | **НЕ разбивать** (или batched-узел) | Композиция в один промпт может *повышать* качество и снижать context usage (arXiv 2412.04093) |
| Число подшагов **непредсказуемо**, зависит от input | **Orchestrator/planner** | Subtasks «determined by the orchestrator based on the specific input» (Anthropic) |

#### 1.2 Compounding error — числовой бюджет на длину (Lusser's Law)
- 0.95⁵≈77%, 0.95¹⁰≈59%, 0.90¹⁰≈35%, 0.85¹⁰≈20% (Zartis, 2026; TianPan, Apr 2026).
- Обратный бюджет: end-to-end 90% → ~98% per-step при 5 шагах, ~98.9% при 10 (TianPan). Chip Huyen: 95% на 100 шагов → 0.6%.
- **Эвристика:** *N(LLM-шагов)>5–7 и нет gate между ними — STOP, добавляй error-recovery (retry на уровне подзадачи, fallback, human-escalation).* RSTD (arXiv 2605.15425): retry на уровне подзадачи −51.7% retry-cost vs monolithic.
- **Второй механизм (развивающийся):** self-conditioning — LLM видит свои прошлые ошибки в контексте и вероятнее ошибается дальше («The Illusion of Diminishing Returns», MPI-INF/TU Kaiserslautern, 2025). Аргумент за очистку контекста между шагами.

#### 1.3 «Single responsibility per LLM call» — происхождение и контрпримеры
- **Происхождение:** следствие Anthropic parallelization/routing rationale + separation-of-concerns из SWE. Формализовано в post-mortem (Google Developers Blog «Production-Ready AI Agents: 5 Lessons from Refactoring a Monolith», 2025: «Specialized agents with narrow tasks run more reliably than a single LLM trying to execute a massive, multi-step prompt»).
- **Контрпримеры (декомпозиция вредит):** (1) потеря holistic-контекста — batched-composition повышает качество (2412.04093); (2) planning-latency +1–5c и +$0.01–0.05/task за лишний decompose-вызов (123ofai, 2026); (3) compounding без gate; (4) over-decomposition (Раздел 8).

**Развивающаяся область:** нет консенсусной метрики «оптимальной гранулярности». RSTD/runtime-structured decomposition (2605.15425) — эмпирика ограничена 2 use-case.

---

### Раздел 2. Когда применять divergent patterns (fan-out, self-consistency, best-of-n)

**Консенсус:** self-consistency (Wang et al. 2022, arXiv:2203.11171) повышает reasoning-accuracy majority-vote'ом; на GSM8K дало 56.5%→74.4% при 40 сэмплах, прирост растёт до ~40 путей и сатурируется, но большинство выигрыша — рано.

#### 2.1 Decision table: когда divergence окупается

| Признак задачи | Divergence? | Почему |
|---|---|---|
| Closed-form/scalar-ответ (арифметика, MCQ, factual retrieval), variance от температуры | **Да, self-consistency** | Агрегируемый сигнал; независимые ошибки усредняются. Cohere Command +16.3 п.п. на арифметике (51.7%→68%) |
| Есть внешний verifier (unit-тесты, компилятор, схема) | **Да, best-of-N + verifier-selection** | Verifier отбирает правильный сэмпл |
| Open-ended генерация (креатив, суммаризация) | **Осторожно**, только с semantic/LLM-агрегатором | Нет scalar; нужен LLM-судья консистентности (Universal Self-Consistency) |
| Единственный детерминированный ответ, variance от **промпта/контекста, не температуры** | **Нет** | Ошибки скоррелированы; сэмплы почти идентичны → «expensive habit» (2511.00751) |
| Frontier-модель уже решает в один проход | **Нет / N мал** | Плато рано; на высоких N — деградация (шум) |

#### 2.2 Оптимальное N и cost-quality
- **Диапазон (оценки авторов работ, не универсальны):** большинство выигрыша к **N=5–10**; исходный потолок Wang et al. 2022 — ~40 сэмплов (GPT-3/PaLM-эпоха, не переносится на современные модели). Тест 3/5/10/15/20 на frontier-моделях — плато рано, иногда снижение (arXiv 2511.00751, Nov 2025: «accuracy gains plateau early and, in some configurations, decline at high sample counts»).
- **Adaptive N (развивающаяся):** ASC — sequential с Dirichlet/beta-binomial posterior + early-stop; RASC (2408.17017) — стоп по качеству reasoning-путей.
- **Формула-эвристика:** стоп, когда лидер достигает majority-margin с заданной вероятностью, либо marginal gain < cost сэмпла.

#### 2.3 Источники разнообразия — сравнение (2024–2026)

| Источник | Эффективность | Данные |
|---|---|---|
| **Разные промпты** (template/persona/CoT-depth) | Высокая — менее скоррелированные голоса | DIPPER (NeurIPS 2024): n=9 ~+10 п.п. vs single; diverse ensemble > single merged > 12× тот же промпт (2604.02450) |
| **Разные модели** (гетерогенный ансамбль) | Высокая при сопоставимом качестве | Гетерогенные диверснее гомогенных (2302.00704); нет единой доминирующей модели (2604.02319) |
| **Температура/seed** (тот же промпт) | Низшая — сильно скоррелированные | «12× same prompt» проигрывает diverse ensemble |
| **Single merged prompt** | ≈ base prompt | Не воспроизводит эффект независимых запросов |

**Эвристика:** *closed-form — хватает температуры; сложные verification/reasoning — diverse prompts или разные модели.*

---

### Раздел 3. Когда применять critic/judge/verification loops

**Консенсус (сильный):** intrinsic self-correction без внешнего сигнала НЕ работает для reasoning. Huang et al. «Large Language Models Cannot Self-Correct Reasoning Yet» (ICLR 2024, Google DeepMind/UIUC): GPT-4 на GSM8K 95.5%→91.5% после 1 раунда, →89.0% после 2-го; GPT-3.5 75.9%→74.7%; вывод: «LLMs struggle to self-correct their responses without external feedback, and at times, their performance even degrades after self-correction». Valmeekam et al. (2023): self-critique ухудшает планирование vs sound external verifier. Механизм (Preprints 2025): error correlation generator↔self-evaluator делает self-evaluation non-identifying.

#### 3.1 Decision tree: нужен ли critic loop
```
Есть ли ВНЕШНИЙ verifiable-сигнал для узла?
├─ ДА (unit-тесты / компилятор / JSON-схема / retrieval-grounding / калькулятор / формальный верификатор)
│    → CRITIC LOOP ОКУПАЕТСЯ. Feedback = execution-результат/ошибка (CRITIC, Gou et al.; self-debug, Chen et al.)
├─ ЧАСТИЧНО (rubric + человек может внятно сформулировать фидбек, и LLM может его дать)
│    → EVALUATOR-OPTIMIZER уместен (Anthropic: два признака fit)
└─ НЕТ (только LLM-судья без внешнего сигнала, тот же контекст/модель)
     → НЕ СТРОИТЬ loop. Риск деградации/reward-hacking. Лучше: улучшить промпт/контекст, diverge+select, добавить verifier.
```
Anthropic (evaluator-optimizer): «two signs of good fit: first, that LLM responses can be demonstrably improved when a human articulates their feedback; and second, that the LLM can provide such feedback.»

#### 3.2 Effective critic prompts (консенсус)
- **Specific > generic.** Madaan et al. (Self-Refine, NeurIPS 2023, arXiv:2303.17651): ~20% absolute средний прирост по 7 задачам, «specific, actionable feedback… matters more than the number of refinement rounds».
- **Error localization** — где ошибка, не только что плохо. DCR (Detect-Critique-Refine): span-level; 8B+DCR ≈ GPT-4 на factuality. SQLCritic — clause-level.
- **Разделять detection и generation** (DCR).
- **Grounding критики:** execution-guided критика фильтрует галлюцинации критика (2502.03492).

#### 3.3 Кто критик

| Ситуация | Критик | Почему |
|---|---|---|
| Есть детерминированный verifier | **Код/инструмент**, не LLM | Надёжность, нет error-correlation |
| Семантическая оценка, риск shared-blindspot | **Другая модель / свежий контекст** | Разрывает error-correlation |
| Робастность к bias | **Ансамбль (panel)** | Снижает systematic bias |
| Та же модель | Только с asymmetric-context + большая модель | Смягчает reward-hacking (Pan et al. 2024) |

#### 3.4 Stop-condition (помимо max_iter)
- **Эмпирика:** 80%+ выигрыша в 1-й итерации; near-plateau к итерации 3 (Madaan 2023; FARSIQA — 3 оптимум, 4-я вносит шум; SAGE — N=3; vision-agent — marginal <2%/attempt после 3-й, 2601.11637).
- **Stop-условия:** (1) verifier passed (жёсткий стоп); (2) marginal improvement < порога (Δκ<0.02 или Δscore<2%); (3) semantic diversity сэмплов схлопнулась; (4) max_iter=3 дефолт.
- **Развивающаяся область:** optimal-stopping как формальная задача — стоп по expected-improvement-vs-cost со stage-independent threshold (2608.10729, 2026); conformal-prediction-based stopping (SAGE).

---

### Раздел 4. Группировка и структурирование шагов

#### 4.1 Параллельно vs последовательно

| Признак | Решение | Почему |
|---|---|---|
| B нужен output A | **Последовательно** | Data-зависимость |
| Подзадачи независимы по данным | **Параллельно (sectioning)** | Latency; изолированное внимание (Anthropic: guardrail-скрин параллельно > совмещения) |
| Один вход, несколько независимых суждений | **Параллельно (voting/sectioning)** | Фокус на аспекте |
| Число веток зависит от входа | **Orchestrator-workers** | Не предопределено |

#### 4.2 «Естественные границы» стадий (аналог bounded context в DDD)
1. **Смена типа неопределённости** (extraction→generation→judgment) — сильнейший сигнал.
2. **Точка детерминированной проверки** → граница + gate.
3. **Смена требуемого контекста** → отдельный узел с bounded context (снижает context rot).
4. **Смена stakes/владельца** → human-checkpoint/другой порог.
5. **State-key граница (RSTD):** downstream по ключу к валидированному состоянию, контекст bounded (2605.15425).

#### 4.3 Batching: когда группировать
**Консенсус:** batch prompting экономит токены, но точность падает с ростом batch-size — тем сильнее, чем длиннее вход и слабее модель.

| Признак | Решение | Данные |
|---|---|---|
| Много однотипных мелких извлечений/классификаций, короткий вход | **Batch (b≈4–16)** | Chen et al. (2301.08721): b=4 баланс; малые батчи иногда > single |
| Длинный вход на элемент (таблицы, документы) | **Раздельно** | Деградация растёт с длиной входа (WikiTQ) |
| Нужна изоляция ошибок / разная сложность | **Раздельно** | Error-isolation |
| Batch, но качество критично | **Batch + permutation-voting (BPE) + early-stop (SEAS)** | Восстанавливает до single-prompt (BatchPrompt) |
| Слабая/малая модель | **Меньший batch** | Qwen3-4B деградирует резче крупных |

**Порог:** *точность держится при b<16 (простые) и b<8 (reasoning); дальше резкий обвал* (2605.28268).

#### 4.4 Routing/switch-узлы
- **Сигналы:** тип запроса, сложность (easy→Haiku, hard→Opus/Sonnet), домен, confidence.
- **Router = classifier + dispatch + fallback.** Обязательны: confidence-threshold с default-веткой, обработка OOD, end-to-end-оценка.
- Граница «классификатор vs отдельная LLM-задача» — Раздел 7.4.

---

### Раздел 5. Оценка достаточности контекста (design-time)

**Консенсус — context rot:** качество падает с ростом длины даже до заполнения окна. Chroma tech report (Kelly Hong, Anton Troynikov, Jeff Huber, Jul 2025, «Context Rot: How Increasing Input Tokens Impacts LLM Performance»): «we evaluate 18 LLMs, including the state-of-the-art GPT-4.1, Claude 4, Gemini 2.5, and Qwen3… their performance grows increasingly unreliable as input length grows» — деградация даже на trivial retrieval/replication задачах. Lost-in-the-middle (Liu et al., TACL 2024, vol.12 pp.157–173, arXiv:2307.03172): U-shaped кривая; при релевантной инфо в середине GPT-3.5-Turbo падает НИЖЕ closed-book baseline (56.1%) на multi-document QA — «performance significantly degrades when models must access and use information in the middle». Du et al. (2510.05381): деградация — функция длины, не только retrieval. Anthropic (Sep 2025): «smallest possible set of high-signal tokens that maximize the likelihood of some desired outcome.»

#### 5.1 Чеклист достаточности (design-time)
Контекст ДОЛЖЕН содержать (и не больше):
- [ ] Все **переменные решения** (decision-need analysis).
- [ ] **Ограничения/правила**.
- [ ] **Few-shot примеры**, покрывающие decision boundary.
- [ ] Формат/схему выхода.
- [ ] НЕ содержит: неиспользуемые downstream поля; «на всякий случай» контекст; логически связный, но избыточный текст (Chroma: на shuffled haystack модели работали *лучше*, чем на связном — coherence создаёт distractor'ы).

#### 5.2 «Sufficient Context» как формальный тест (Joren et al., ICLR 2025, Google)
- **Критерий:** «Could a diligent reader answer using only the provided context?» (1/0). Не требует ground-truth — только query+context.
- **Вывод:** даже при sufficient context модели чаще галлюцинируют, чем воздерживаются; добавление контекста снижает abstention. Selective-generation по сигналу +2–10 п.п. правильных.
- **Design-time:** прогони autorater по golden-входам *до* запуска. Часто insufficient → добавь retrieval/поля. Sufficient, но ошибки → проблема в промпте/модели.

#### 5.3 Root-causing

| Симптом | Диагноз | Действие |
|---|---|---|
| Sufficient-autorater=0 на провалах | Missing context | Добавить данные/retrieval |
| Sufficient=1, ответ неверный | Модель не использует контекст | Промпт/decompose/модель |
| Ошибки в середине длинного контекста | Context rot / lost-in-middle | Сократить, ключевое в начало/конец |
| Ошибки при добавлении похожих-нерелевантных данных | Distractor interference | Фильтровать retrieval, precision |

**Практика:** incremental context testing — от минимума, добавлять поля инкрементально, замеряя качество.

---

### Раздел 6. Проектирование тест-кейсов для LLM-узлов

**Консенсус:** deterministic checks (regex/JSON-schema/exact-match/code-exec — быстрые, первыми) + probabilistic (LLM-judge для семантики). CI на каждый PR (Langfuse 2025, promptfoo, Braintrust 2026, OpenAI Evals). «Two-word change in a prompt can move accuracy 10–15 points» (Future AGI, 2026) — промпт = код.

#### 6.1 Golden set: 4 корзины + размеры
Four-bucket (Future AGI, 2026): production-sample / adversarial / edge-cases / failure-replays. Пустая корзина = CI-gate ничего не доказывает.
- **Размеры (оценки практики, не универсальны):** minimum 50–100; production-ready 200–500; mature 1000+; per-route floor 300–500; за 1000 — sampling важнее размера.
- **Рост:** каждый production-failure → запись в golden set.
- **Coverage > count:** «60 distinct meaningful cases beat 500 random». Намеренно сложный (borderline), покрывает decision boundary.
- **Decontamination:** не пересекать с обучающими данными.

#### 6.2 Property-based / metamorphic testing (развивающаяся, крепнущая 2025–2026)
Когда нет единственного ответа — тестируй **инварианты**:
- **Metamorphic (idempotency под перефразированием):** семантически эквивалентные входы → эквивалентные выходы. MetaQA (ACM 2025), Drowzee (OOPSLA 2024), LGMT (2605.23965) — ловят fact-conflicting галлюцинации, которые self-consistency усиливает.
- **Semantic monotonicity:** больше релевантного контекста → не хуже. score(more)≥score(less).
- **Round-trip / invariant / postcondition** (Hughes et al. taxonomy).
- **Для кода:** PBT-инварианты вместо input-output (2506.18315) — разрывает «cycle of self-deception». Предупреждение: LLM-сгенерированные property часто тривиальны/неверны (Vikram et al.).

#### 6.3 Покрытие по архетипу

| Архетип | Основной тест | Фокус покрытия |
|---|---|---|
| **Extractor** | Детерминированный span/exact-match + schema | Boundary: пустые/множественные поля, вложенность; adversarial — противоречивый источник. schema-valid ≠ correct (enum-collapse ~11%) |
| **Classifier** | Confusion-matrix, per-class F1 | Decision boundary смежных классов; rare-class; OOD |
| **Generator** | Property/metamorphic + LLM-judge | Инварианты, faithfulness, format; edge — длинный/пустой/adversarial вход |
| **Judge/Scorer** | Калибровка vs человек (6.5) | Согласие на borderline; bias (position/verbosity) |
| **Router** | End-to-end success + label-accuracy | OOD, ambiguous, fallback |

#### 6.4 Regression/snapshot testing промтов (консенсус 2025–2026)
- CI-gate: smoke 20–50 на PR; regression 200–500 на merge; benchmark 1000+ на release (Future AGI).
- Rotate ≥20% промптов на major model-release; sealed holdout 5–10% до release-day.
- Production monitoring: sample 5–10%, скорить автоэвалуатором, ловить drift (провайдеры молча меняют веса под тем же id — Galtea).
- RETAIN (2409.03928) — regression-testing при миграции через «слайсы» выходов.

#### 6.5 Judge отдельно от generator (консенсус)
Judge — сам объект оценки:
- **Метрики:** Cohen's κ (2 rater), Fleiss'/Krippendorff's α (≥3), ICC (Likert), Kendall's τ (ранжирование). Landis-Koch bands.
- **Ориентиры (примеры из работ, не пороги):** judge-human κ 0.74–0.93 (2408.09235); κ=0.994 на бинарном (2503.08679); agreement 88.3%, FN 10.8% — judge строже человека (2604.06173); Krippendorff α=0.759 «reasonably strong» (2605.11128).
- **Human IRR как потолок:** judge не надёжнее согласия людей; низкий IRR = двусмысленная спека → сначала чинить rubric.
- **Bias-контроль:** rationale ПЕРЕД score; pairwise стабильнее pointwise; counter-prompts против position/verbosity bias (Kinde, Galileo 2026).
- **ECIR 2026:** stratified sampling снижает объём человеческой валидации до 85% для 95% доверия.

---

### Раздел 7. Эвристики выбора архетипа узла

#### 7.1 Extractor vs Generator
**Test:** *каждый токен выхода трассируется к спану источника → EXTRACTOR; выход вводит новые токены/факты → GENERATOR.* Extractor оптимизирует constraint-satisfaction, валидируется span-match'ем (Google LangExtract: «maps every extraction to its exact location»). Generator — fluency/novelty, валидируется judge/property. Boundary: abstractive summary = generator; extractive quote-pulling = extractor.

#### 7.2 Classifier vs Router
**Test:** *label потребляется как данные → CLASSIFIER; label выбирает следующий узел → ROUTER.* Router = classifier + branch-binding + confidence/fallback + end-to-end-оценка (Anthropic; LangGraph conditional edge).

#### 7.3 Scorer vs Judge
**Test:** *калиброванный непрерывный сигнал для мониторинга/порога/reward → SCORER (pointwise scalar); защищаемое accept/reject с обоснованием или сравнение двух → JUDGE (verdict+rationale, часто pairwise).* Scorer: тренды/reward-modeling; слабость — scale-drift, central-tendency; лечится anchored rubric+few-shot. Judge pass/fail: gate ship/block; pairwise: A/B модели/промпта (стабильнее pointwise — Eugene Yan). Faithfulness → pass/fail, не pairwise. Cross-cut: deterministic code перед LLM-judge (Braintrust).

#### 7.4 Traditional/embedding classifier vs full LLM call

| Сигнал | Traditional/embedding | Full LLM |
|---|---|---|
| Latency | Tight (sub-10ms энкодер; ~430ms domain-classifier) | Loose (+200–500ms hot, +1–5c с reasoning) |
| Labeled data | Есть | Нет → LLM zero/few-shot или LLM как labeling-engine + дистилляция |
| Число классов | Малое, фикс. | Много/fine-grained/эволюционирующее |
| Reasoning/нюанс | Нет | Да |
| Распределение | Предсказуемое | Дрейфует/OOD |

Практика: прототип на LLM-классификации → при стабилизации классов **дистиллировать в дешёвый энкодер** (WideMLP — 95.71% от лучшей LLM при latency на 2 порядка ниже, 2505.14524). Anti-pattern: не роутить при вырожденном сплите (всё «hard»).

#### 7.5 Planner (dynamic) vs фиксированный pipeline
**Test (Anthropic):** *перечислимы подзадачи+порядок на design-time → FIXED; число/форма зависят от input в runtime → PLANNER.* Сигналы непредсказуемости (→ planner): (1) input-dependent fan-out (число файлов/запросов зависит от задачи); (2) промежуточные результаты меняют дальнейшие шаги; (3) высокая дисперсия длины между прогонами; (4) план надо *открыть*, а не только исполнить; (5) неизвестен нужный specialist/tool до развёртывания диалога. Middle-tier: static-граф + conditional edges (LangGraph `Send`) — динамика внутри известной топологии, когда пути перечислимы. Cost-caution: single-agent матчил/превосходил multi-agent на 64% задач (Princeton NLP via Beam AI); multi-agent +2.1 п.п. при ~2× стоимости.

---

### Раздел 8. Антипаттерны и «code smells»

Из post-mortem 2025–2026 (Google Developers, Allen Chan «AI Agent Anti-Patterns», ZenML «1200 deployments», Towards Data Science «Ten Lessons»):

| Code smell | Признак | Фикс |
|---|---|---|
| **Monolith prompt** | Один вызов делает всё, silent-fail на подзадаче | Decompose по типам + gate |
| **Over-decomposition** | >7 LLM-шагов без gate; compounding; лишняя latency/cost | Слить смежные однотипные; error-recovery вместо шагов |
| **Divergence «на всякий случай»** | best-of-N/self-consistency при систематической ошибке | Убрать; чинить промпт/контекст |
| **Critic-loop без verifier** | Self-judge той же моделью, тот же контекст | External verifier или убрать |
| **Loop без stop-condition** | Только max_iter, reward-hacking | Стоп по verifier/marginal<порог; max_iter=3 |
| **Отсутствие gate** | Нет валидации артефактов; ошибка течёт вниз | Programmatic gate (schema/assert) после узла |
| **Context bloat** | «Load everything upfront» (800K токенов, путается) | Just-in-time; smallest high-signal set |
| **Раздутый tool-set** | Пересекающиеся инструменты, неоднозначный выбор | Anthropic: «если инженер не может однозначно выбрать инструмент — агент тоже» |
| **Premature agent** | Autonomous agent, где хватает workflow | Начать с workflow; agent только при непредсказуемом числе шагов |
| **Eval в изоляции** | Меряют per-step, игнорируют compounding | End-to-end evals + SLO на tail |
| **Schema=quality заблуждение** | Верят, structured output = правильный | Отдельный accuracy-eval (enum-collapse ~11% при 99.4% schema-valid) |

Отраслевой факт: последние 5% («demo→production») съедают бóльшую часть разработки (ZenML, 1200 deployments); MIT Project NANDA «The GenAI Divide: State of AI in Business 2025» (Jul 2025): при $30–40 млрд корпоративных вложений «95% of organizations are seeing no business return», лишь «5% of integrated AI pilots are extracting millions in value» (300 публичных deployment-ов, 150 интервью, 350 опросов сотрудников) — корень в отсутствии архитектурного фундамента, а не в моделях.

---

## Recommendations: единый Decision Framework (шаг за шагом)

**Шаг 0. Baseline.** Начни с «один LLM-вызов + retrieval + few-shot». Усложняй только если не проходит golden-set (Anthropic).

**Шаг 1. Decision-need analysis по контексту.** Для каждого решения: какие переменные влияют, ограничения, примеры boundary. Прогони «Sufficient Context» autorater. Порог: <~80% входов sufficient → добавь данные/retrieval прежде логики.

**Шаг 2. Декомпозиция по границам неопределённости.** Режь, где меняется тип (extraction/classification/generation/judgment/aggregation), есть verifiable-артефакт, меняется stakes/контекст/latency-класс. Однотипные мелкие — рассмотри batching. **Gate compounding:** если >5–7 шагов без gate — сократи или добавь recovery (per-step ≥98% для end-to-end 90% на 5 шагах).

**Шаг 3. Присвой архетип** (тесты Раздела 7): extractor/classifier/scorer/generator/judge/aggregator/critic_reviser/planner/router. Для router/classifier — LLM или дешёвый классификатор (7.4).

**Шаг 4. Топология.** Data-зависимость → sequential; независимость → parallel; непредсказуемое число шагов → planner, иначе static DAG (+ conditional edges для динамики внутри топологии).

**Шаг 5. Дивергенция (Раздел 2).** Только если closed-form+variance-от-температуры (self-consistency) ИЛИ есть verifier (best-of-N+select). N: старт 5, adaptive-stop. Diversity: разные промпты/модели.

**Шаг 6. Critic-loop (Раздел 3).** Только если внешний verifiable-сигнал ИЛИ (rubric + human-articulable feedback). Критик: код > другая модель/свежий контекст > та же модель (asymmetric). Feedback: specific + error-localization + detection≠generation. Stop: verifier / marginal<порог / max_iter=3.

**Шаг 7. Gates и error-handling.** Schema/assert/exec после каждого узла; retry на уровне подзадачи (RSTD); fallback/human-escalation для high-stakes.

**Шаг 8. Тесты по архетипу (Раздел 6).** Golden set 4 корзины (start 50–100/узел, prod 200–500). Extractor → span-match; classifier → confusion-matrix; generator → property/metamorphic+judge; judge → калибровка κ/α. CI: smoke на PR, regression на merge, holdout на release.

**Шаг 9. Минимизируй контекст узла.** Only-fields-used-downstream; ключевое в начало/конец; incremental context testing.

**Шаг 10. Инструментируй end-to-end.** Compound-success, не только per-step; SLO с tail; production sampling 5–10% + drift.

**Пороги, меняющие решения:** per-step <98% и >5 шагов → recovery, не шаги; self-consistency marginal-gain < cost → стоп N; critic marginal <2% (Δκ<0.02) → стоп loop; judge-human κ < ~0.6 → чинить rubric, не деплоить; batch <8 (reasoning) / <16 (простые); sufficient-context <80% на golden-входах → мало данных.

---

## Caveats
- **Устоявшийся консенсус (высокая уверенность):** compounding error math (Lusser's Law); intrinsic self-correction без внешнего сигнала не работает для reasoning (Huang et al., ICLR 2024, многократно воспроизведено); context rot (Chroma, 18 моделей, Jul 2025); specific > generic feedback (Madaan 2023); external verifier критичен для critic-loop; deterministic checks перед LLM-judge; калибровка judge через κ/α.
- **Развивающиеся/оспариваемые:** оптимальное N для self-consistency (потолок ~40 из Wang et al. 2022 устарел; на frontier выигрыш мал/отрицателен — 2511.00751, Nov 2025); optimal-stopping для refinement (2608.10729 — свежая теория); adaptive-N (ASC/RASC) — research; runtime-structured decomposition (RSTD) — 2 use-case; property-based testing для LLM — крепнет, но LLM-property часто тривиальны; метрика «оптимальной гранулярности» не формализована.
- **Числа не универсальны:** размеры golden-set, N=5–10, max_iter=3, batch<8/16, sufficient-context 80%, κ 0.6 — оценки авторов/отраслевая практика, НЕ законы. Валидируйте на своей задаче.
- **Источники:** часть cost-цифр (40–85% на routing) из vendor-блогов (Morph/NeuralTrust) — self-reported, directional. Ряд arXiv-препринтов не прошли peer-review. Anthropic-пост (Dec 2024) помечен как частично устаревший по tooling (актуальная версия — Managed Agents).
- Фреймворк рассчитан на **workflow** (предопределённые пути), не полностью автономных агентов; для последних нужны adversarial-verification, ground-truth-from-environment, tool-design (вне охвата).