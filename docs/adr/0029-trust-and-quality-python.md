# ADR-0029. Ядро доверия и качество на Python

> Статус: **частично изменено [ADR-0030](0030-local-browser-backend.md)** (2026-09-17)
> Дата: 2026-09-16
>
> ADR-0030 §8–§9: каждое звено цепочки §1 вызывает модель через `request_stream` (`request` дочитывает поток), кассета пишет и воспроизводит список событий потока; цепочка исполняется внутри сегментного DBOS-шага узла `llm` без `DBOSDurability`, что закрывает открытый вопрос 2 в части положения DBOS-шагов. Порядок звеньев и три исхода в силе.
> Зависит от: [ADR-0025](0025-python-engine.md), [ADR-0026](0026-yaml-spec-and-code-refs.md), [ADR-0027](0027-dynamic-io-shapes.md), [ADR-0005](0005-three-call-outcomes.md), [ADR-0006](0006-dynamic-allowed-sets.md), [ADR-0012](0012-langfuse-as-store.md)
> Заменяет: [ADR-0003](0003-model-middleware.md), [ADR-0013](0013-liquidjs-template-engine.md), [ADR-0015](0015-gate-statistics.md)
> Изменяет в части профилей схем и стиля wire-схемы: [ADR-0004](0004-schema-profiles.md)
> Изменяет в части конвейера разбора и записи исхода в кассету: [ADR-0005](0005-three-call-outcomes.md)
> Изменяет в части проверки вхождения: [ADR-0006](0006-dynamic-allowed-sets.md)
> Изменяет в части контекста статического анализа шаблонов: [ADR-0019](0019-escape-hatch-rules.md)
> Изменяет в части замеров токенизатора: [ADR-0020](0020-llm-function-and-adapters.md)
> Меняет: [DECISIONS.md](../DECISIONS.md) — раздел «Структурированный вывод — опровержения спеки» п. 2, 3, 6, раздел «Промты», строки «Шаблоны промтов» и «Токенизатор» в «Ось версий», строка «Детерминизм реплея» в «Что VoltAgent НЕ даёт — наш слой», строка «Кассеты» в «Экспорт»; [CLAUDE.md](../../CLAUDE.md) — «Жёсткие правила»; [07. Компилятор](../07-compiler.md) §3.2–§3.3, §5.1–§5.3, §9.1; [08. Промты](../08-prompts.md) §2, §5.1, §7–§10; [10. Рантайм](../10-runtime.md) §4, §5, §9; [11. Провайдеры](../11-providers.md) §2.2, §6, §7.3, §8; [12. Наблюдаемость](../12-observability.md) §1.1, §5, §8; [13. Evals и гейты](../13-evals-and-gates.md) §1, §5.2, §6.2, §7, §12; [research/statistics-gates.md](../research/statistics-gates.md) §1.5, §6.2
> Исследование: [research/py-quality-layer.md](../research/py-quality-layer.md)

## Контекст

Движок переходит на Pydantic AI и DBOS ([ADR-0025](0025-python-engine.md)). Вместе с `ai@6`, liquidjs и `@stdlib`
исчезают точки опоры трёх ADR: `wrapLanguageModel` (0003), AST liquidjs (0013), своя статистика на TS (0015).
Пробы выполнялись вне репозитория 2026-09-16 (изолированные venv, без сети, модели — `FunctionModel` или настоящие
классы провайдеров поверх `httpx2.MockTransport`), результаты приведены в
[research/py-quality-layer.md](../research/py-quality-layer.md). Пробы шли на CPython 3.12.4, а ADR-0025 фиксирует
3.14 (открытый вопрос 24). Версия pydantic-ai-slim и pydantic-evals везде — 2.43.0. Ссылки «research §N» ниже ведут
в этот документ.

| # | Факт | Что он ломает или меняет | research |
|---|---|---|---|
| 1 | `WrapperModel` (Decorator) пробрасывает `request`, `request_stream`, `count_tokens`, `profile`, `settings`; на нём сделаны `InstrumentedModel`, `ConcurrencyLimitedModel`, `DBOSModel` (обёртка устаревшего `DBOSAgent`, `DBOSDurability` её не использует); трансформер схемы работает в `prepare_request` модели провайдера, обёртка видит нейтральную схему | точка врезки 0003 меняется; отдельное звено нормализации запроса не нужно | §1.1 |
| 2 | Дефолты нарушают три исхода ADR-0005: (A) обрезанный tool call с `finish_reason=length` повторяется с тем же `max_tokens`, затем `IncompleteToolCall`; (B) полный валидный JSON с `length` принимается как ok; (C) обрезанный `NativeOutput` → `UnexpectedModelBehavior`; (D) `content_filter` без частей → `ContentFilterError` без повтора; (E) отказ Anthropic с текстом повторяется и может вернуть ok | «три исхода» не держатся без своего звена | §1.4 |
| 3 | openai 3.14.1 и anthropic 1.6.0: `DEFAULT_MAX_RETRIES = 2`, 429 → 3 HTTP-вызова; `pydantic_ai.retries` при импорте требует encode `httpx` | «ровно один слой ретраев» нарушен по умолчанию | §1.5 |
| 4 | capability `Instrumentation` пишет `gen_ai.input.messages` из контекста до обёртки; кассета хранит сырой ответ модели | PII-инвариант 0003 одной редакцией запроса не выполняется | §1.6 |
| 5 | `usage.cost` в записанном ответе `null`: стоимость дописывает граф агента по снимку genai-prices 0.1.7; токен-лимиты и `cost_limit` проверяются после ответа | «реплей бесплатен» и «отказ до траты денег» — решения кассеты и исполнителя | §1.2, §1.3 |
| 6 | ADR-0003 «Порядок middleware», 11 §2.2 и 10 §5 задают три разных порядка звеньев | нужен один порядок | §1.8 |
| 7 | при `strict=None` флаг strict равен `is_strict_compatible` трансформера профиля: OpenAI получает `strict: true` только без strict-несовместимых ключей (в пробе была `maxLength`), Anthropic и Bedrock — только при явном `strict=True`; enum доходит до провайдера без изменений (включая 450 UUID); трансформеры OpenAI и Anthropic переносят в `description` разные наборы ключей | Zod-поломки и пост-обработка 0004 больше не относятся; strict задаётся явно на каждом профиле ([ADR-0027](0027-dynamic-io-shapes.md)) | §1.7; [py-spec-as-code](../research/py-spec-as-code.md) §13 |
| 8 | python-liquid 2.3.1: `analyze()`, `global_variable_paths()`, литеральный текст — `ContentNode`, свой блочный тег через `Environment.add_tag` | 0013 переносится на другой движок | §8.5; §8 здесь |
| 9 | pydantic-evals: статистики нет; сбой оценщика молча выкидывает оценку; `repeat` не передаёт задаче ни индекс, ни seed | отчёт прогонщика нельзя подавать в гейт как есть | §6 |
| 10 | scipy 1.18.1 и statsmodels 0.15.0 закрывают математику 0015; `krippendorff` 0.8.2 — GPL-3.0-or-later; у scipy три ловушки (BCa NaN на рубриках, Wilcoxon exact при связках, иное правило `z0`) | основание 0015 «Python не тянем» исчезает | §7.2, §7.3 |
| 11 | gepa 0.1.4 сам ведёт цикл: выбор родителя, минибатч, приёмка, Парето-фронт | порт `propose → filter → score` из 08 §10.2 на него не ложится | §8.3, §8.8 |

## Решение

| Решение | Что берём | Версия | Лицензия | Почему |
|---|---|---|---|---|
| Точка гарантий на каждом вызове модели | `WrapperModel` из pydantic-ai-slim | 2.43.0 | MIT | единственное место, через которое проходят все вызовы; схема ещё нейтральна |
| Лимитер | `ConcurrencyLimitedModel` из pydantic-ai-slim + наш RPM/TPM-бакет | 2.43.0 | MIT | готовая обёртка того же семейства |
| Транспортный ретрай | tenacity в нашем `BackoffModel` | 9.1.4 | Apache-2.0 | `pydantic_ai.retries` требует encode `httpx` |
| Цены вызова | genai-prices (жёсткая зависимость pydantic-ai-slim) | 0.1.7 | MIT | стоимость в `RunUsage` и `cost_limit` считаются по её снимку |
| Трассы | `InstrumentationSettings` (формат 5), opentelemetry-sdk, opentelemetry-exporter-otlp-proto-http | 2.43.0 / 1.44.0 / 1.44.0 | MIT / Apache-2.0 / Apache-2.0 | OTLP/HTTP в Langfuse без Python SDK langfuse ([ADR-0025](0025-python-engine.md) §8, [ADR-0012](0012-langfuse-as-store.md)); экспортёр тянет `requests` транзитивно, наш код его не импортирует (ADR-0025 §5) |
| Шаблоны промтов | python-liquid | 2.3.1 | MIT | статический анализ без рендера, свой тег, `ContentNode` |
| Прогонщик экспериментов и структура датасета | pydantic-evals | 2.43.0 | MIT | `Dataset`/`Case`/`Evaluator`, span-based оценка |
| Статистика гейта | scipy; statsmodels; numpy | 1.18.1; 0.15.0; 2.5.3 | BSD; BSD-3-Clause; BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | тесты, бутстрап, поправки, каппа — библиотечные вызовы |
| Krippendorff alpha, ICC | свой код на numpy | — | — | единственный пакет с порядковой дистанцией — GPL-3.0-or-later |
| Оптимизация промтов | gepa (библиотека в процессе) | 0.1.4 | MIT | без обязательных зависимостей, адаптер и reflection подменяемы |
| Кассета, гейт исходов, редакция, backoff, исполнитель исходов, гейт выпуска | наш код | — | — | готового нет |

### 1. Цепочка гарантий на каждом вызове модели

Гарантии вызова — обёртки `WrapperModel` (Decorator), собранные в цепочку (Chain of Responsibility) единственной
фабрикой моделей (Builder) из записи каталога. Порядок снаружи внутрь фиксирован; три порядка из 0003, 11 §2.2 и
10 §5 сводятся к нему.

| # | Звено | Ответственность | Почему стоит именно здесь |
|---|---|---|---|
| 0 | `Instrumentation` (capability агента) | `chat`-спан вокруг вызова; звенья пишут в текущий спан `aqven.cassette.hit`, `aqven.cassette.key`, исход | самый внешний без проводки: переданный `InstrumentedModel` агент сам разворачивает в capability; атрибуты из обёртки ложатся на `chat`-спан (проверено) |
| 1 | `OutcomeGateModel` | `finish_reason` и `provider_details` → `TruncatedOutput` / `RefusedOutput` сразу после ответа, до разбора и до цикла `output`-ретраев | выше кассеты: исход детерминированно выводится из записанного ответа на каждом реплее (0005, обязательство 3 в редакции §7); выше всех звеньев: граф агента не получает обрезанный или отказной ответ как материал для повтора |
| 2 | `RedactingModel` | копии исходящих сообщений с плейсхолдерами (`dataclasses.replace`, история не мутируется); в PII-режиме наверх уходит отредактированная копия ответа (открытый вопрос 21) | выше кассеты: ключ и провод не видят сырых PII; live и replay возвращают одинаковый ответ |
| 3 | `CassetteModel` | ключ от нейтрального запроса; hit → записанный ответ с обнулённым usage (записанный usage — в metadata ответа); miss → в режиме записи вызов уходит ниже и пишется отредактированный ответ, в `replay_strict` — `CassetteMiss`; перехват `count_tokens` | ниже редакции: ключ без PII; выше лимитера: попадание не занимает слот; выше ретраев: N попыток дают одну запись; схема ещё нейтральна, ключ одинаков для OpenAI, Anthropic и `FunctionModel` (проверено) |
| 4 | `ConcurrencyLimitedModel` или наш RPM/TPM-бакет профиля | слот и темп на профиль (10 §9.2) | ниже кассеты: реплей не тратит ни слот, ни токены бакета |
| 5 | `BackoffModel` на tenacity | 429, 5xx и `ModelAPIError` без статуса → повтор с экспонентой и джиттером, пауза по `retry-after` из `ModelHTTPError.headers` (их заполняют модели OpenAI, Anthropic и Google) | единственный слой транспортного ретрая; ниже кассеты; ниже лимитера — повтор продолжает тот же логический вызов и держит его слот; работает для всех провайдеров, включая google-genai, у которого клиент не на httpx2 и есть свои ретраи (открытый вопрос 3) |
| 6 | модель провайдера | SDK-клиент с `max_retries=0` и `httpx2.AsyncClient`; `profile=` из каталога; трансформер схемы в `prepare_request` | самая внутренняя: только она знает провайдерскую форму схемы и запроса |

**DBOS.** Фабрика звена DBOS не ставит. Выбор «один `DBOS.step` на узел или `agent.run()` с `DBOSDurability`» —
открытый вопрос 4 [ADR-0025](0025-python-engine.md): в первом варианте цепочка идёт внутри шага узла, во втором
`agent.run()` вызывается внутри нашего `@DBOS.workflow` и запросы модели идут DBOS-шагами `<имя агента>__model.request`.
`DBOSAgent` в 2.43.0 помечен устаревшим (удаление в v3) и не используется. С цепочкой гарантий `DBOSDurability` не
запускалась (только с `FunctionModel` в пробе согласования тулов): положение её шагов относительно `OutcomeGateModel`,
`CassetteModel` и `BackoffModel` не проверено и решается спайком (открытый вопрос 2). Внутри `DBOS.step` capability
шагов не создаёт, а `recv` бросает `DBOSException` (исходник, ADR-0025 открытый вопрос 4): узлу с одобряемыми тулами
вариант «один шаг на узел» не подходит.

**Согласование тулов человеком** внутри узла `llm` — отложенные тулы Pydantic AI под `DBOSDurability` (решение
владельца от 2026-09-16, [ADR-0025](0025-python-engine.md) §9, H6; API — [23](../23-studio-api.md) §6.10): вызов тула с `requires_approval=True` завершает прогон
выходом `DeferredToolRequests`, ждёт узел `human`, продолжение — `agent.run(..., deferred_tool_results=DeferredToolResults(approvals={...}))`.

Фабрика — Registry построителей `PROVIDER_MODELS`, её канонический код — этот раздел; `ProviderKind` и `ModelRef`
определены в ADR-0025 §6. Построитель создаёт SDK-клиент с `max_retries=0` и ставит профиль схемы (`ModelProfileSpec`
из `pydantic_ai.profiles`: частичный `ModelProfile` или функция `base -> profile`). Построители с обеими формами
профиля прошли pyright 1.1.414 strict и `ruff check` и создали модели с `max_retries=0` и трансформером профиля
(CPython 3.14.7, предупреждения как ошибки). Реестр и цепочка собираются в одном месте:

```python
type ProviderModelBuilder = Callable[[ModelRef, httpx2.AsyncClient, ModelProfileSpec], Model]


def openai_chat(ref: ModelRef, http: httpx2.AsyncClient, profile: ModelProfileSpec) -> Model:
    client = AsyncOpenAI(api_key=ref.api_key, max_retries=0, http_client=http)
    return OpenAIChatModel(ref.model_name, provider=OpenAIProvider(openai_client=client), profile=profile)


def anthropic_messages(ref: ModelRef, http: httpx2.AsyncClient, profile: ModelProfileSpec) -> Model:
    client = AsyncAnthropic(api_key=ref.api_key, max_retries=0, http_client=http)
    return AnthropicModel(ref.model_name, provider=AnthropicProvider(anthropic_client=client), profile=profile)


PROVIDER_MODELS: Mapping[ProviderKind, ProviderModelBuilder] = {
    ProviderKind.OPENAI: openai_chat,
    ProviderKind.ANTHROPIC: anthropic_messages,
}


def build_model(entry: CatalogEntry, policy: CallPolicy) -> Model:
    provider_model = PROVIDER_MODELS[entry.ref.provider](entry.ref, policy.http, SCHEMA_PROFILES[entry.schema_profile])
    backoff = BackoffModel(provider_model, retrying=policy.transport_retry)
    limited = ConcurrencyLimitedModel(backoff, limiter=policy.concurrency)
    cassette = CassetteModel(limited, store=policy.cassettes, mode=policy.cassette_mode, model_ref=entry.catalog_ref, redaction=policy.redaction)
    return OutcomeGateModel(RedactingModel(cassette, redaction=policy.redaction))
```

Гейт исходов — таблица `OUTCOME_GATES: finish_reason → действие` (Strategy) без ветвлений: `length` →
`TruncatedOutput(response, max_tokens)`, `content_filter` → `RefusedOutput(response)`, прочее — ответ дальше;
`max_tokens` берётся из `merge_model_settings(wrapped.settings, model_settings)`. Код гейта — research §1.4.

**Ключ кассеты.** `sha256("aqven.cassette.v1\0" + канонический JSON)`, префикс `sha256-`. В JSON входят: логическая
ссылка модели из каталога (не имя модели провайдера); сообщения через `ModelMessagesTypeAdapter` без `timestamp`,
`run_id`, `conversation_id`, `provider_response_id`, `usage`, `metadata`; настройки, слитые с настройками обёрнутой
модели (`merge_model_settings`, это и есть бывшая нормализация запроса); `output_mode`, `allow_text_output`; схемы
output- и function-тулов и `output_object` со `strict`. Канонизация — `rfc8785` 0.1.4 (Apache-2.0,
[ADR-0025](0025-python-engine.md) §1, [ADR-0022](0022-hash-as-version.md)); перед ней каждый объект `properties`
превращается в список пар: порядок полей — семантика (R-35), его сортировать нельзя. Профиль схемы в ключ не входит —
запись одного провайдера проигрывается на другом (0003, контекст п. 4); профиль пишется в провенанс (0004). Смена
`max_tokens` даёт новый ключ.

Сохраняются из ADR-0003: коллизия ключа (один ключ, ожидаются разные ответы) — ошибка `AMBIGUOUS_REPLAY`; перезапись
кассет только явной командой; порядок звеньев проверяется тестом. Обёртки собирает только фабрика: импорт
`pydantic_ai.models.openai`, `pydantic_ai.models.anthropic`, `pydantic_ai.models.google` вне пакета фабрики `aqven_llm`
и `pydantic_ai.retries` где угодно запрещён ruff TID251 (вложенный `ruff.toml` со своей таблицей `banned-api`, ADR-0025 §6).

### 2. Настройки уровня агента

| Настройка | Значение | Зачем |
|---|---|---|
| `output_type` | из `output_contract.mode` узла по [ADR-0027](0027-dynamic-io-shapes.md) («Strict включается явно»): `strict` → `ToolOutput(Model, strict=True)`, `NativeOutput(Model, strict=True)` только там, где профиль модели поддерживает нативный вывод; `json` → `PromptedOutput(Model)` | при `strict=None` флаг равен `is_strict_compatible` трансформера профиля: OpenAI получает `strict: true` только без strict-несовместимых ключей, Anthropic и Bedrock — никогда, поэтому strict задаётся явно на каждом профиле; `claude-3-7-sonnet-20250219` + `NativeOutput` → `UserError` на клиенте; у `PromptedOutput` параметра strict нет |
| `retries` | `{"output": k}`, `k` из IR узла; `ToolOutput(max_retries=...)` не задаём | ремонт применим только к исходу ok: гейт срабатывает раньше цикла; `ToolOutput.max_retries` перекрывает агентное значение, два источника одного числа запрещены; `output_retries=` в 2.43.0 нет (`TypeError`) |
| `@agent.output_validator` + `ModelRetry` | вхождение в allowed-set и подстановка кода в ID (§7) | расходует тот же `output`-бюджет (проверено) |
| `usage`, `usage_limits` в `run` | один `RunUsage` на прогон, `UsageLimits` на вызов узла (§4) | журнал обновляется на месте и общий для нескольких агентов (проверено) |
| `profile=` модели | из записи каталога, ставит фабрика | §6 |
| `InstrumentationSettings` | наш `tracer_provider`, `version=5`, `include_content=False` в PII-режиме; `event_mode` в 2.43.0 удалён | §5; экспорт OTLP/HTTP — ADR-0025 §8 |
| `before_model_request` (hooks) | только если политика требует редактировать историю сообщений агента | hook переписывает историю (проверено); по умолчанию не нужен |

### 3. Исполнитель: исключения → исходы узла

Исполнитель узла не ветвится по типам лестницей. Таблица `FAILURE_BY_EXCEPTION: type[Exception] → обработчик`
(Registry) просматривается по `type(error).__mro__` (Chain of Responsibility): подкласс (`IncompleteToolCall`,
`ContentFilterError`) побеждает общий `UnexpectedModelBehavior`, исключение вне таблицы пробрасывается.

| Исключение | Кто бросает | Исход узла | Маршрут |
|---|---|---|---|
| `TruncatedOutput` (наш) | `OutcomeGateModel`, `finish_reason="length"` | `truncated` | одна ступень увеличения `max_tokens` из IR (новый ключ кассеты) → фолбэк-профиль с большим окном → эскалация; `provider_details.finish_reason="model_context_window_exceeded"` сразу на фолбэк-профиль |
| `RefusedOutput` (наш) | `OutcomeGateModel`, `finish_reason="content_filter"` | `refusal`, причина из `provider_details` (`refusal`, `refusal_category` у Anthropic, сырой `finish_reason` провайдера) | ошибка политики; фолбэк-профиль или эскалация; повтор того же промта запрещён |
| `IncompleteToolCall`, `ContentFilterError` | граф агента, если гейт обойдён | `truncated` / `refusal` | как выше; появление — дефект сборки цепочки, пишется в трассу |
| `UnexpectedModelBehavior` | исчерпан `output`-бюджет, пустой ответ | `NodeQualityFailure` | политика узла (11 §7.3) |
| `UsageLimitExceeded` | `UsageLimits` | `BudgetExceeded` | остановка с сохранением состояния (10 §9.1) |
| `CassetteMiss` (наш) | кассета в `replay_strict` | остановка прогона | никогда не деградирует в живой вызов |
| `ModelHTTPError`, `ModelAPIError` | `BackoffModel` исчерпал попытки | `ProviderFailure` | `fallback_provider` → `fallback_profile` (11 §7.3) |

### 4. Бюджеты и стоимость

`request_limit` проверяется до запроса, счётчик запросов растёт и на реплее. Токен-лимиты и `cost_limit` проверяются после ответа:
вызов уже оплачен, перерасход не больше одного вызова. `per_request_input_tokens_limit` с
`count_tokens_before_request=True` проверяется до запроса сетевым вызовом count-эндпоинта; он есть только у OpenAI
Responses, Anthropic, Google, Bedrock Converse (у `OpenAIChatModel` — `NotImplementedError`) и включается опционально
по профилю. Замеры — research §1.3.

- **Один журнал на прогон.** `RunUsage` создаётся на прогон и передаётся в каждый `agent.run(usage=...)`. Лимиты
  сравниваются с накопленным журналом, поэтому порог вызова узла = потрачено по журналу + меньшее из остатков узла и
  прогона (Strategy расчёта лимитов в исполнителе).
- **Оценка до вызова — наш код.** Исполнитель сравнивает верхнюю оценку одного вызова узла с остатком до `agent.run`;
  при превышении вызова нет, узел падает `BudgetExceeded` (10 §9.1).
- **Оценка на компиляции** остаётся по 07 §5.1–§5.3 с уточнением числа вызовов:
  `calls(llm) = (1 + retries.output + ступени_обрезки) × (1 + |fallback_chain|)`, `outputMax` — по `max_tokens`
  последней ступени. Токенизатор для оценки не выбран (открытый вопрос 4).
- **Реплей бесплатен** по решению кассеты: usage в выданном ответе обнулён, записанный лежит в metadata; реплей с
  `cost_limit=0.001` проходит с 0 HTTP-вызовов, стоимость журнала не меняется (проверено).
- **Снимок цен пинится.** Стоимость в `RunUsage` считается по снимку genai-prices 0.1.7, поэтому снимок фиксируется на
  версию каталога через `genai_prices.data_snapshot.set_custom_snapshot`; `pydantic_ai.prices.update_in_background()`
  не запускается никогда. Источник цен для биллинга — наш каталог (обязательство 6 ADR-0012); сверка трёх чисел
  (оценка, снимок, пересчёт по каталогу) — 11 §8.

### 5. PII и прогон без сети

| Канал | Мера | Статус |
|---|---|---|
| провод к провайдеру | `RedactingModel` переписывает копии исходящих сообщений | проверено: на проводе `<EMAIL>`, сырых PII нет |
| ключ кассеты | редакция выше кассеты | проверено |
| файл кассеты | кассета получает от фабрики тот же `RedactionPolicy` и пишет отредактированный ответ; в PII-режиме наверх возвращается та же копия, иначе запись и реплей дают разные выходы узла | без этого файл хранит сырой ответ (проверено); решение — наш код |
| спаны | `InstrumentationSettings(include_content=False)` | проверено: PII в спанах нет; `gen_ai.tool.definitions` и `model_request_parameters` со схемой выхода остаются, поэтому в enum уходят коды, а не сырые ID (ADR-0006) |
| история сообщений агента | остаётся сырой; `before_model_request` только по требованию политики | проверено |
| reflective dataset GEPA | редакция в `make_reflective_dataset` (§11) | шаблон reflection по умолчанию (`gepa/strategies/instruction_proposal.py`) копирует записи дословно |
| Langfuse | атрибуты формирует наша фабрика, маскирование до записи атрибута (обязательство 7 ADR-0012) | без изменений |

Тесты и CI идут без сети ([ADR-0025](0025-python-engine.md), обязательство 6): conftest ставит
`pydantic_ai.models.ALLOW_MODEL_REQUESTS = False`, кассеты в режиме `replay_strict`. Живая `OpenAIChatModel` падает
`RuntimeError('Model requests are not allowed...')`, реплей из кассеты работает с 0 HTTP-вызовов, `FunctionModel` и
`TestModel` выключатель не затрагивает (проверено). Это заменяет проверку «песочница с отключённой сетью» из 0003.

### 6. Профили схем (изменение ADR-0004)

Остаётся из 0004: профиль — свойство пары (схема × провайдер), не поле IR; профили `openai-strict`,
`anthropic-strict`, `permissive`; id профиля живёт в каталоге и пишется в провенанс; стиль нейтральной схемы (все
поля required — в Pydantic поля без default, опциональность через `null` — `T | None`, `additionalProperties: false`
— `extra="forbid"`, без рекурсии, порядок полей как в IR и не сортируется); бюджет схемы считает компилятор до
сетевого вызова; kill-критерий «ограничения ушли в `description` больше чем у половины полей схемы».

Меняется:

- **Нейтральная схема** — `model_json_schema()` сгенерированной Pydantic-модели ([ADR-0026](0026-yaml-spec-and-code-refs.md)).
  Пять поломок `z.toJSONSchema` из контекста 0004 к ней не относятся; слой пост-обработки после Zod удаляется.
- **Правило стиля 0004 «числовых и строковых ограничений в wire-схеме нет» перестаёт быть общим.** Профиль
  `openai-strict` — встроенный `OpenAIJsonSchemaTransformer`, он оставляет на проводе `minimum`, `maximum`,
  `minItems`, `maxItems`; OpenAI их поддерживает (0004, контекст). Для fine-tuned моделей OpenAI, у которых
  `minimum`/`maximum` не поддержаны (0004, 0006), отдельный профиль не выбран — открытый вопрос 22.
- **Профиль = `json_schema_transformer` в `ModelProfile`.** Разрешение профиля модели: `DEFAULT_PROFILE` →
  `provider.model_profile(name)` → окно контекста из genai-prices → пользовательский `profile=` (частичный
  `ModelProfile` или функция `base -> profile`). Фабрика ставит `profile=SCHEMA_PROFILES[entry.schema_profile]`
  (Strategy, выбор через Registry). Свой трансформер проверен на проводе на трёх уровнях: `ModelProfile` у
  `OpenAIChatModel`, функция у `AnthropicModel`, подкласс провайдера с `model_profile`.
- **Встроенные strict-трансформеры расходятся.** OpenAI (`profiles/openai.py`: `_STRICT_INCOMPATIBLE_KEYS`,
  `OpenAIJsonSchemaTransformer`) переносит в `description` `minLength`, `maxLength` и прочие несовместимые ключи,
  `format` вне белого списка и `pattern` с lookaround, удаляет `title`, `$schema`, `discriminator`, `default`,
  переписывает `oneOf` в `anyOf`, ставит `additionalProperties: false` и все свойства в `required`; `minimum`,
  `maximum`, `minItems`, `maxItems` остаются. Anthropic (`AnthropicJsonSchemaTransformer` → `transform_schema` из
  anthropic 1.6.0) оставляет только `type`, `anyOf`, `allOf`, `enum`, `$defs`, `$ref`, `description`, `properties`,
  `required`, `items`, `format` из списка `date-time, time, date, duration, email, hostname, uri, ipv4, ipv6, uuid` и
  `minItems` 0 или 1, остальное дописывает в `description`; переписывает `oneOf` в `anyOf`, ставит
  `additionalProperties: false` на каждый объект; необязательные поля модели в `required` не входят (лимит Anthropic —
  24 необязательных). Замеры на проводе — research §1.7.
- **Свой профиль** нужен там, где встроенный расходится со стилем IR: для `anthropic-strict` — трансформер, который
  держит все поля в `required` с `null` у опциональных (проверено на проводе: `minimum`, `maximum`, `maxLength`,
  `maxItems` в `description`, полный `required`, `additionalProperties: false`, `strict: true`).
- **Проверка на приёме** — валидация Pydantic нейтральной модели. Всё, что трансформер унёс в `description`, держит
  только она.
- **Golden-снимки wire-схем** снимаются перехватом запроса через `httpx2.MockTransport`, а не вызовом трансформера
  напрямую: так проверяется ровно то, что уходит провайдеру.
- Валидация IR-документов и внешних JSON Schema — вне этого ADR (ADR-0026, [ADR-0028](0028-studio-api-contract.md)).

### 7. Три исхода и allowed-set (изменения ADR-0005 и ADR-0006)

Из ADR-0005 остаются: сумма исходов `ok` / `refusal` / `truncated`, ветвление до разбора, запрет ремонта обрезанного
ответа, маршруты, `on_refusal` и предел `max_tokens` в IR узла, исход в провенансе, частичные объекты только в канале UI.

Меняется обязательство 3 ADR-0005 («исход пишется в запись кассеты; при реплее воспроизводится, а не
пересчитывается»): отдельного поля исхода в записи нет. Кассета хранит ответ с `finish_reason` и
`provider_details`, гейт над ней выводит исход из записи на каждом проигрывании; вывод детерминирован, поэтому реплей
даёт тот же исход. Шаг «взять первый сбалансированный `{...}`» из конвейера 0005 уходит вместе с jsonrepair.
Конвейер разбора:

| Шаг | Кто делает | Исход |
|---|---|---|
| 1 | constrained decoding под профилем (§6) | все |
| 2 | `OutcomeGateModel`: `finish_reason` + `provider_details` | все |
| 3 | снятие markdown-ограждения (`_utils.strip_markdown_fences`) | ok |
| 4 | `pydantic_core.from_json(allow_partial="off")` + валидация модели | ok |
| 5 | `output_validator`: вхождение в allowed-set, межполевые проверки | ok |
| 6 | ремонт моделью: `RetryPromptPart` с ошибками валидации, лимит `retries["output"]` | ok |

**jsonrepair удаляется.** Pydantic AI JSON не чинит: финальный разбор идёт с `allow_partial="off"`, частичный
(`"trailing-strings"`) — только для стриминговых частичных объектов. Синтаксически битый полный ответ уходит на шаг 6
(`json_invalid`) и стоит вызова модели.

Нормализация исхода — наш Adapter над полями ответа. Сырые значения сопоставляют таблицы `_CHAT_FINISH_REASON_MAP` и
`_RESPONSES_FINISH_REASON_MAP` в `models/openai.py`, `_FINISH_REASON_MAP` в `models/anthropic.py` и `models/google.py`:

| `finish_reason` | Сырые значения провайдеров | Исход |
|---|---|---|
| `length` | OpenAI Chat `length`; OpenAI Responses `max_output_tokens`; Anthropic `max_tokens`, `model_context_window_exceeded`; Google `MAX_TOKENS` | `truncated` |
| `content_filter` | OpenAI Chat `content_filter` и `message.refusal` (частей нет, `provider_details["refusal"]`); OpenAI Responses `content_filter` и `provider_details["refusal"]`; Anthropic `refusal` (+ `refusal_category`); Google `SAFETY`, `RECITATION`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII`, `IMAGE_SAFETY`, `IMAGE_PROHIBITED_CONTENT`, `MODEL_ARMOR` | `refusal` |
| `error` | Google `LANGUAGE`, `MALFORMED_FUNCTION_CALL`, `UNEXPECTED_TOOL_CALL`, `NO_IMAGE`; OpenAI Responses `cancelled`, `failed` | не назначен: гейт пропускает ответ на разбор, открытый вопрос 23 |
| `stop`, `tool_call`, `None` | в том числе Anthropic `pause_turn`, Google `OTHER` и `FINISH_REASON_UNSPECIFIED` → `None` | `ok` |

В ADR-0006 меняется механика, пороги и стратегии остаются:

- **Enum в strict доходит без изменений** во всех проверенных провайдерах и режимах, включая 450 UUID; клиент размер
  набора не ограничивает, лимиты провайдера (~416 UUID у OpenAI) остаются, бюджет по-прежнему считает компилятор.
- **Проверка вхождения** — `@agent.output_validator` + `ModelRetry` с подсказкой трёх ближайших кандидатов; таблица
  соответствия «код → ID» приходит через `ctx.deps`, подстановка — там же. Zod `superRefine` уходит.
- **Регистр** нормализуется `BeforeValidator` на поле сгенерированной модели до сравнения с `Literal`.
- **Индексный выбор**: поле `int` с `Field(ge=0, le=n - 1)`. OpenAI strict оставляет `minimum`/`maximum` на проводе,
  Anthropic переносит в `description` — граница всегда проверяется Pydantic на приёме.

### 8. Шаблоны промтов: python-liquid (замена ADR-0013)

| Решение 0013 | На python-liquid 2.3.1 |
|---|---|
| движок — библиотека, наш код — Visitor и таблица правил по виду узла, свой парсер не пишем | то же |
| R-T1/R-T2 из встроенного статического анализа без рендера | `analyze()` / `global_variable_paths()`; переменная цикла в globals не попадает (проверено: `{% for d in docs %}{{ d.id }}` даёт только `docs`) |
| `{% switch %}` не реализуем, вместо него `case/when`; `{% else %}` в `case` запрещён R-T4 | `else` — это `BlockNode` среди `CaseNode.blocks`, ветки `when` — `MultiExpressionBlockNode` (проверено) |
| роли сообщений — свой блочный тег `{% message system\|user\|assistant %}`, только верхний уровень | `Environment.add_tag(MessageTag)`; узел виден в `analyze().tags` и в обходе `children()` (проверено запуском) |
| белые списки тегов и фильтров — данные в одном модуле, двойная защита | теги: удаление из `env.tags` → `LiquidSyntaxError: unexpected tag` при разборе; фильтры: удаление из `env.filters` разбор **не** роняет, `analyze().filters` видит имя статически, рендер падает `UnknownFilterError` — поэтому белый список фильтров проверяется статически по `analyze().filters` |
| разрешённые теги: `if/elsif/else`, `case/when`, `for`, `include`, `comment`, `#`, `message`; запрещённые из 0013 | сверх списка 0013 в 2.3.1 есть `ifchanged`, `doc`, `break`, `continue` — запрещены до отдельного решения; в `env.tags` лежат и служебные `content`, `output`, `illegal`, тест равенства белому списку учитывает их отдельно (проверено по полному списку тегов инстанса) |
| фрагменты `fragment@version` резолвятся нашим loader из реестра | `Environment(loader=...)`; `analyze(include_partials=True)` проходит `{% include 'policy@3' %}` через loader (проверено на `DictLoader`) |
| обязательства 0013 п. 1–5 (`maxLength`/`maxItems` в реестре, `message` только на верхнем уровне, списки как данные, системные слоты вне `cache`, калибровка R-T9 по `usage`) | без изменений |
| движок обслуживает только промты и фрагменты | без изменений |

Что меняется:

- Инстанс: `Environment(undefined=StrictUndefined, loader=RegistryLoader(...))`, `strict_filters=True` по умолчанию;
  обращение к неизвестной переменной на рендере даёт `UndefinedError`.
- Текстовые правила R-T7/R-T8/R-T12 сканируют `ContentNode`, вывод — `OutputNode`, ветвления — `IfNode`, `CaseNode`,
  `ForNode`. Обход — от `BoundTemplate.nodes` через `node.children(RenderContext(template), include_partials=False)`.
- Позиции — смещения `Variable.span.index` и `Token.start_index`; строку и колонку считает наш код, синтаксические
  ошибки уже содержат `строка:колонка`. `str(template)` исходник не воспроизводит: всё, что меняет текст, режет
  исходник по смещениям; поправки на whitespace control и хвостовой перевод строки — research §8.5.
- Встроенных фильтров в 2.3.1 — 62 (в liquidjs было 88).

```python
RULES_BY_NODE: dict[type[Node], tuple[NodeRule, ...]] = {
    ContentNode: (enum_mention_rule, data_literal_rule, knowledge_appeal_rule, manual_format_rule),
    OutputNode: (slot_exists_rule, output_format_count_rule, filter_whitelist_rule, system_slot_in_cache_rule),
    IfNode: (condition_rule,),
    CaseNode: (enum_exhaustive_rule, case_else_forbidden_rule),
    ForNode: (array_only_rule, loop_scope_rule, loop_depth_rule),
    MessageNode: (top_level_only_rule, role_order_rule, cache_static_rule),
}
```

### 9. Evals: pydantic-evals как прогонщик

pydantic-evals — прогонщик экспериментов и структура датасета, не гейт. Берём: `Dataset`, `Case`, `Evaluator` (bool —
assertion, число — score, str — label, `EvaluationReason`), `evaluate`/`evaluate_sync` с `max_concurrency`,
span-based оценку, `ReportCase`/`ReportCaseFailure`, `EvaluationReportAdapter` для JSON.

| Правило | Почему |
|---|---|
| Файл датасета — заголовок `apiVersion: aqven/v1`, `kind: Dataset`, ниже структура `Dataset` (`name`, `cases`, `evaluators`, `report_evaluators`); загрузка — строгий YAML-проход, снятие заголовка, `Dataset.from_dict`; запись — канонический писатель [ADR-0026](0026-yaml-spec-and-code-refs.md) (ключи в порядке полей модели, `apiVersion` и `kind` первыми) | `Dataset` — модель с `extra="forbid"`, заголовок в неё не проходит; `to_file` пишет строку-комментарий `# yaml-language-server`, а комментарии в файлах описания запрещены (04 §6.3, ADR-0026 §1) |
| Схема для редактора `.aqven/schema/dataset.schema.json` — `model_json_schema_with_evaluators()`, обёрнутая заголовком: `apiVersion` и `kind` добавлены в `properties` и `required`, `additionalProperties: false` сохранён, свойство `$schema` удалено; файлам её сопоставляет `yaml.schemas` (ADR-0026 §11) | схема pydantic-evals закрыта и без обёртки подчеркнёт `apiVersion` и `kind` как неизвестные ключи; она же разрешает ключ `$schema`, который формат не допускает (ADR-0026 §11) |
| Повторы разворачиваем сами: один `Case` на `(item_key, run_idx)`, seed в metadata, `repeat=1`; seed-ы у A и B общие | `repeat` в `Dataset.evaluate` не передаёт задаче индекс и seed |
| Единица спаривания — `item_key`, не имя кейса | diff pydantic-evals спаривает по имени, включая суффикс `[i/R]`, и только визуально |
| Сбой оценщика (`ReportCase.evaluator_failures`) и сбой задачи (`ReportCaseFailure`) — выпавший кейс в обеих версиях; > 5% выпавших → `GATE_UNAVAILABLE` | проверено: `LLMJudge` с нерезолвимой моделью оставляет кейс успешным, оценка просто исчезает |
| LLM-судья — наш тип оценщика, модель берётся из каталога через фабрику (§1); `LLMJudge` без явной модели запрещён | модель судьи по умолчанию — `openai:gpt-5.2`; модель в YAML сериализуется строкой; вызов судьи обязан пройти кассету, бюджет и редакцию |
| opentelemetry-sdk 1.44.0 — явная зависимость, span-based оценка идёт на нашем `TracerProvider` | pydantic-evals зависит только от `logfire-api`; без SDK `ctx.span_tree` → `SpanTreeRecordingError` |
| metadata кейса — `dict` | `ConfusionMatrixEvaluator` с Pydantic-метаданными молча возвращает пустую матрицу |

Остаётся нашим кодом всё, чего в pydantic-evals нет из 13: версии датасетов, сплиты и журнал чтения test, дедупликация
и PII, покрытие, оценки по узлам, seed-ы повторов, A/A и ICC, статистика, четыре исхода гейта, калибровка судьи,
политика выпавших кейсов, ключи сравнимости, non-inferiority бюджетов, неизменяемый `GateReport`, матрица моделей,
зеркалирование в Postgres и Langfuse — перечень из 16 пунктов в research §6.6.

### 10. Статистика гейта (замена ADR-0015)

Статистика считается в процессе eval-воркера. Модуль статистики принимает массивы и политику, не импортирует
`pydantic_ai` и `pydantic_evals`. Их запрещает вложенный `ruff.toml` модуля; его таблица `banned-api` заменяет
корневую (ADR-0025 §6), поэтому она повторяет все общие запреты корня: `httpx`, `requests`, `yaml`, `pydantic_graph`,
`pydantic_ai.retries`, `pydantic_ai.StructuredDict` и импорты провайдеров `openai`, `anthropic`, `google.genai`,
`pydantic_ai.providers`, `pydantic_ai.models.openai`, `pydantic_ai.models.anthropic`, `pydantic_ai.models.google`;
синхронность с корнем держит фикстура в CI. Запуск ruff 0.16.7 в раскладке uv workspace отметил TID251 каждый из
этих импортов в каталоге модуля, `numpy` и `scipy.stats` прошли. scikit-learn 1.9.1 (BSD-3-Clause) не берём:
weighted kappa с доверительным интервалом даёт statsmodels. Сверка с эталонами и ловушки — research §7.1–§7.2.

| Нужно гейту | Вызов | Обязательная оговорка |
|---|---|---|
| binary, McNemar exact (`b + c < 25`) | `statsmodels.stats.contingency_tables.mcnemar(table, exact=True)` | mid-p одной строкой: `p - scipy.stats.binom.pmf(min(b, c), b + c, 0.5)` |
| binary, McNemar chi2 с Йейтсом | `mcnemar(table, exact=False, correction=True)` | ориентация таблицы и эффект `(c - b) / n` — наш код |
| ordinal, Wilcoxon signed-rank | `scipy.stats.wilcoxon(d, zero_method="pratt", method="asymptotic")` при n ≥ 200; `method=scipy.stats.PermutationMethod(n_resamples=10_000, rng=...)` для превью | `method="exact"` запрещён: при нулях и связках он не точен и молчит; передаётся массив разниц |
| continuous, парный t и CI | `scipy.stats.ttest_rel(b, a).confidence_interval()` | порядок `(b, a)` даёт B − A |
| CI, BCa-бутстрап | `scipy.stats.bootstrap((d,), np.mean, vectorized=True, n_resamples=10_000, method="BCa", rng=np.random.default_rng(seed))`, `d = b - a` | не `paired=True` с `mean(b) - mean(a)`: на бинарных данных связки с плавающей точкой сдвигают `z0` и нижнюю границу CI; NaN-интервал → `GATE_UNAVAILABLE` |
| страты, кластеры | тонкие обёртки над `bootstrap`: страта — отдельная выборка с `paired=False`; кластеры — бутстрап индексов кластеров | кластерный CI шире наивного — это и есть смысл |
| exact binomial, Clopper-Pearson | `scipy.stats.binomtest(k, n).proportion_ci(confidence_level=0.95, method="exact")` | — |
| Holm | `statsmodels.stats.multitest.multipletests(p, alpha=0.05, method="holm")` | `method` всегда явно: по умолчанию `"hs"` |
| BH, BY | `multipletests(p, alpha=q, method="fdr_bh")`, `"fdr_by"` | — |
| мощность для `dz` | `statsmodels.stats.power.TTestPower().solve_power(...)` | мощность McNemar — закрытая форма или наш Monte-Carlo |
| weighted kappa | `statsmodels.stats.inter_rater.cohens_kappa(table_5x5, wt="quadratic")` | таблица строится по полной шкале 1..5; интервал `kappa_low`/`kappa_upp` идёт в запись калибровки |
| Kendall tau-b | `scipy.stats.kendalltau(x, y, variant="b")` | — |
| Fleiss kappa | `statsmodels.stats.inter_rater.fleiss_kappa(aggregate_raters(data)[0], method="fleiss")` | — |
| Krippendorff alpha | своя реализация ~40 строк numpy по матрице совпадений (nominal, ordinal, interval) | см. ниже |
| ICC, разложение шума | своя формула ~8 строк numpy | в statsmodels ICC нет, pingouin 0.6.1 — GPL-3.0 |
| seeded RNG | `np.random.default_rng(seed)` (PCG64) | свой xorshift из 0015 уходит |

**Krippendorff alpha — свой код по лицензионной причине.** Единственный пакет с порядковой дистанцией, `krippendorff`
0.8.2, распространяется под GPL-3.0-or-later, а модуль воркфлоу собирается в wheel и импортируется в чужие проекты
(решение владельца от 2026-09-16, [ADR-0025](0025-python-engine.md) §7; сборка — ADR-0026 §10). nltk 3.10.3
(Apache-2.0) порядковой дистанции не знает, прочие кандидаты не подходят по свежести, пинам или лицензии. Своя
реализация совпала с пакетом и с опубликованными значениями на nominal, ordinal и interval (research §7.3).
GPL-пакет допускается только как оффлайн-оракул при генерации golden-фикстур в dev; юридически это не оценено
(открытый вопрос 1).

**Остаётся нашим кодом** (research §7.4): семьи гипотез и поправка по семье (safety без поправки); superiority и
non-inferiority (normal и strict); A/A-прогон, пол шума и ключ его кэша; проверка «отвержений в secondary больше 2q»;
минимумы 200/500 и 25 дискордантных пар; выпавшие кейсы и правило 5%; NaN-интервал → `GATE_UNAVAILABLE`; WARN по
расхождению ширины CI t и бутстрапа и по недостигнутой мощности; допуск судьи BLOCK/WARN/OFF со сроком годности;
цепочка четырёх исходов; неизменяемый отчёт. Обёртка на тип метрики — не больше 10 строк (выбор exact или chi2, знак
эффекта, `d = b - a`): Strategy `TEST_BY_KIND`, поправки `ADJUST_BY_FAMILY`, цепочка стражей `CHAIN` (Chain of
Responsibility), прототип — research §7.5.

Семьи, пороги, минимумы, A/A, допуск судьи и обязательства 1–8 ADR-0015 сохраняются как доменная политика; меняется
только источник математики (обязательство 3 «наружу только `delta = B − A`» держит порядок аргументов
`ttest_rel(b, a)`). Замер времени (research §7.1) порога «больше 30 с» из 13 §12 не достигает.

### 11. Оптимизация промтов: GEPA (переписывает 08 §10)

gepa 0.1.4 используется библиотекой в процессе, без litellm. GEPA сам ведёт цикл, поэтому порт — одна операция
(Port/Adapter), а не `propose → filter → score`: `PromptOptimizerPort.optimize(OptimizationRequest) ->
OptimizationOutcome`. Запрос (frozen dataclass): `compiler: PromptTemplateCompiler`, `train` и `dev`
(`Sequence[EvalCase]`), `budget: OptimizationBudget`. Исход: `seed_units` и `best_units` (`Mapping[UnitId, str]`),
`val_scores`, `parents` (lineage), `metric_calls`, `rejected: Sequence[RejectedMutant]`, `result_json`
(`GEPAResult.to_dict()`). `TextUnit(unit_id: UnitId, start: int, end: int, text: str)`, `UnitId = NewType("UnitId",
str)`. Прогнанная реализация порта — research §8.8.

| Элемент | Решение |
|---|---|
| `TextUnit` | литеральный `ContentNode` python-liquid: байтовый отрезок исходника, края обрезаны от пробелов, пустые отрезки исключены, соседние склеены. Кандидат GEPA — `dict[unit_id, text]`; сборка обратно — по смещениям, байты тегов и слотов неизменны (проверено, research §8.5) |
| `TemplateUnitsAdapter` (Adapter над `GEPAAdapter`) | `evaluate` рендерит кандидат, передаёт его агенту как `instructions=` на прогон и оценивает батч через `Dataset.evaluate_sync`; `make_reflective_dataset` строит записи `{Inputs, Generated Outputs, Feedback}` из `ReportCase` и редактирует PII; атрибут `propose_new_texts = None` обязателен — без него GEPA глотает `AttributeError` и тратит бюджет впустую; адаптер не бросает исключений на одном кейсе |
| `instructions=` в `Agent.run`, не `Agent.override` | добавляет инструкции на прогон и безопасен при параллельной оценке; `override` заменяет инструкции агента и capability |
| `AdmissibleReflection` (Decorator над `ReflectionLM`), передаётся как `reflection_strategy` | мутант проверяется `PromptTemplateCompiler.diagnose` (Facade): синтаксис (`LiquidError`), R-T1..R-T13 (в пробе — R-T1 и R-T2), неизменность последовательности структурных токенов `env.tokenizer()`, неизменность набора тегов и фильтров. Недопустимый мутант возвращается пустым `ReflectionProposal`, GEPA его не оценивает. R-T1 без проверки структуры недостаточна: повтор объявленного слота ловит только она (проверено). Отклонения декоратор пишет сам: пустое предложение не вызывает ни `on_proposal_end`, ни accept/reject. Код — research §8.6 |
| цикл починки | диагностики возвращаются reflection-модели записью `Feedback` (`max_repairs`, по умолчанию 1); на игрушечной задаче лучший кандидат найден за меньшее число вызовов метрики (research §8.7) |
| reflection-модель | `AgentReflectionLM(agent, ledger, limits)` — callable `(str \| list[dict]) -> str` над нашим агентом Pydantic AI из фабрики (§1), вызывает `agent.run_sync(..., usage=ledger, usage_limits=limits)`: вызовы reflection проходят кассету, бюджет, редакцию и `ALLOW_MODEL_REQUESTS`. Строковый `reflection_lm` запрещён: он импортирует litellm, а без litellm `optimize_anything` не падает, а молча не улучшает |
| бюджет | `max_metric_calls` проверяется между итерациями и перелетает; `ScoreThresholdStopper` из `stop_callbacks` сокращает прогон (research §8.4); вызовы метрики идут через общий `RunUsage` оптимизации |
| сплиты | `trainset` — train, `valset` — dev, test в GEPA не передаётся никогда; до запуска порт проверяет пройденный A/A и минимум размера (13 §7.5, §7.8) |
| хранение | результат (кандидаты, lineage родителей, оценки, Парето-фронт) храним сами в Postgres (граница данных ADR-0012); носитель — JSON `GEPAResult.to_dict()` и события `on_pareto_front_updated`; `run_dir` с `gepa_state.bin` — локальный черновик для resume; pickle читается только из доверенного каталога |
| победитель | входит обычной правкой промта: черновик в `.aqven/drafts/`, дифф текста и отрисовки, перекомпиляция; гейт выпуска — на test-сплите |
| Observer | события GEPA (`callbacks=[...]`: `on_candidate_accepted`, `on_pareto_front_updated`, `on_budget_updated` и др.) идут в трассу и в прогресс студии |
| уровни промта | уровень 1 (`.prompt.md` без переменных) — весь текст одна единица; уровень 2 (Liquid) — единицы `ContentNode`; уровень 3 (`prompt: pkg.mod:build`) оптимизации не подлежит |

## Альтернативы

| Альтернатива | Почему отвергнута | При каких условиях вернёмся |
|---|---|---|
| Оставить middleware `ai@6` в TS-сайдкаре между движком и провайдерами | сайдкар видит HTTP-тела провайдеров, ключ кассеты становится непереносимым между провайдерами (причина, по которой 0003 отверг HTTP-моки); гейт исхода обязан сработать до разбора Pydantic AI, а прокси может только переписать HTTP-ответ; второй рантайм на пути каждого вызова; ось `ai@6` снята ADR-0025 | никогда |
| Hooks и capabilities Pydantic AI для всех гарантий | `before_model_request` переписывает историю агента, ответная сторона остаётся сырой в истории и в спане (проверено); hook — свойство конкретного агента, а не модели, гарантия зависит от того, что каждый агент (включая судей и reflection) собран с ними; кассета, лимитер и ретраи на хуках не проверялись | если короткое замыкание вызова хуком (`SkipModelRequest`) проверено реплеем и `WrapperModel` перестанет видеть нейтральную схему |
| `RaiseContentFilterError` вместо своего гейта | закрывает только отказ (случай E → `ContentFilterError` за 1 вызов), обрезку A–C не закрывает | если Pydantic AI начнёт сам останавливать цикл повторов на `length` |
| `pydantic_ai.retries.AsyncHTTPX2TenacityTransport` | импортирует encode `httpx` при импорте модуля (TODO v3), без него `ImportError`; к клиенту google-genai не применим | Pydantic AI v3 убирает импорт `httpx`; тогда сравниваем с `BackoffModel` |
| Ретраи SDK по умолчанию | скрытый второй слой: 429 → 3 HTTP-вызова | нет |
| Оптимизаторы DSPy 3.3.1 (MIT): MIPROv2, SIMBA, BootstrapFewShot | работают только над `dspy.Module`: копируют программу и переписывают инструкции и demos предикторов; внешнюю систему (наш рантайм + Liquid-шаблон) не оптимизируют; `dspy.GEPA` — адаптер над тем же gepa 0.1.4 (dspy 3.3.1 пинит `gepa[dspy]==0.1.4`) | никогда: движок не является DSPy-программой |
| Reflection через litellm (строковый `reflection_lm`) | вызовы идут мимо кассеты, бюджета, редакции и выключателя сети; второй слой провайдеров; при отсутствии litellm отказ тихий | нет |
| Пакет `krippendorff` 0.8.2 в рантайме | GPL-3.0-or-later в зависимостях модуля, который встраивается в чужие проекты | пакет сменит лицензию на разрешительную |
| Python SDK langfuse 4.15.3 (MIT) | требует `httpx<1.0` (encode); `LangfuseSpanProcessor.on_start` мутирует атрибуты спанов, общих для всех процессоров (нарушает обязательство 8 ADR-0012); фильтр по умолчанию отбрасывает наши спаны `aqven` | SDK уходит на httpx2 и перестаёт мутировать спаны |
| scikit-learn 1.9.1 (BSD-3-Clause) для weighted kappa | без `labels` полной шкалы считает неверно (0.4615 вместо 0.3986); интервал всё равно даёт только statsmodels | нет |
| `run_dir` GEPA как хранилище результатов | pickle схемы v5 — внутренний формат, небезопасен при загрузке из недоверенного каталога | нет; остаётся локальным черновиком |
| Статистика своей реализацией, как в 0015 | математика есть в scipy/statsmodels, BCa совпал со своей реализацией с разницей 0.0; своё ядро — ответственность без выгоды | нет |

## Последствия

**Положительные**

- Три порядка звеньев сведены к одному, каждый инвариант порядка проверяется тестом.
- Гарантии действуют на любой вызов модели: узлы, судьи pydantic-evals, reflection GEPA — все получают модель из
  одной фабрики.
- Кассета проигрывается на другом провайдере: ключ от нейтральной схемы одинаков.
- Исход `truncated`/`refusal` стоит один вызов вместо цикла повторов и воспроизводится на реплее.
- Статистика гейта — библиотечные вызовы с golden-фикстурами; своего кода остаётся доменная политика.
- Оптимизатор физически не может сломать слоты и ветки шаблона: недопустимый мутант отбраковывается без вызова модели.

**Отрицательные**

- Синтаксически битый полный JSON больше не чинится локально, а стоит вызова модели.
- В PII-режиме выход узла содержит плейсхолдеры вместо значений, которые модель эхом вернула: запись и реплей обязаны
  совпадать (открытый вопрос 21).
- Токен- и `cost_limit` проверяются после ответа: бюджет — мягкая граница с перерасходом не больше одного вызова.
- Ретраи транспорта держат слот лимитера; RPM-бакет считает логические вызовы, а не HTTP-попытки.
- Статистика тянет numpy, pandas 3.0.5 и patsy через statsmodels в рантайм eval-воркера.
- Krippendorff alpha и ICC — наш код и наша ответственность за корректность.
- `openai-strict` и `anthropic-strict` дают разные wire-схемы для одной нейтральной модели: границы
  `minimum`/`maximum`/`maxItems` у OpenAI уходят в грамматику, у Anthropic их держит только проверка на приёме.
- Встроенные `IfNode`/`CaseNode`/`ForNode` python-liquid — внутренняя структура библиотеки: апгрейд может сломать обход.

**Обязаны делать**

1. Цепочку собирает только фабрика; импорт модулей провайдеров вне неё и `pydantic_ai.retries` где угодно запрещён TID251.
2. Каждое новое звено получает явную позицию в таблице §1 и запись в этом ADR.
3. SDK-клиенты создаются с `max_retries=0`; единственный слой транспортного ретрая — `BackoffModel`.
4. PII-режим = `RedactingModel` + редакция записи кассеты + `include_content=False`; одно без другого PII-режимом не
   считается.
5. `update_in_background()` genai-prices не вызывается; снимок цен пинится на версию каталога.
6. `ALLOW_MODEL_REQUESTS = False` в conftest и CI; перезапись кассет только явной командой.
7. Модуль статистики не импортирует `pydantic_ai` и `pydantic_evals`; `wilcoxon(method="exact")` и `multipletests` без
   явного `method` запрещены ревью-правилом и тестом.
8. Сбой оценщика и сбой задачи считаются выпавшим кейсом, никогда не тихой потерей оценки.
9. Адаптер GEPA определяет `propose_new_texts = None`; reflection-модель — только агент из фабрики.

**Документы, которые становятся неверными**

| Документ | Раздел | Что устарело |
|---|---|---|
| [DECISIONS.md](../DECISIONS.md) | «Структурированный вывод — опровержения спеки» п. 2, 3, 6; «Промты»; «Ось версий» строки «Шаблоны промтов», «Токенизатор»; «Что VoltAgent НЕ даёт» строка «Детерминизм реплея»; «Экспорт» строка «Кассеты» | Zod, jsonrepair, liquidjs, gpt-tokenizer, `LanguageModelMiddleware`, кассета «на уровне порта модели» вместо `WrapperModel` |
| [CLAUDE.md](../../CLAUDE.md) | «Жёсткие правила», список «своё пишем» | «статистика гейтов» — теперь доменная политика гейта поверх scipy и statsmodels |
| ADR-0003, ADR-0013, ADR-0015 | статус | «заменено [ADR-0029](0029-trust-and-quality-python.md)» |
| ADR-0019 | «Контекст» | `globalFullVariablesSync` над AST liquidjs → `global_variable_paths()` python-liquid |
| ADR-0020 | замеры токенизатора | gpt-tokenizer 4.0.0; токенизатор оценки — открытый вопрос 4 |
| ADR-0004, ADR-0005, ADR-0006 | статус и шапка | «изменено в части … ADR-0029»; Zod-поломки и правило «числовых ограничений в wire-схеме нет» (0004), jsonrepair, Biome-правило и «исход отдельным полем в записи кассеты» (0005), `superRefine` и ajv (0006) |
| [07. Компилятор](../07-compiler.md) | §3.2 | визитор по AST liquidjs; R-24 «подсказка Zod» |
| | §3.3 | R-37 «проверка Zod на приёме», перенос ключей делает трансформер профиля |
| | §5.1–§5.3, §9.1 | gpt-tokenizer; формула `calls(llm)`; кэш AST liquidjs |
| [08. Промты](../08-prompts.md) | §2, §5.1, §7 | API liquidjs, `NodeKind` и `Diagnostic` на TS, `PromptContent` VoltAgent |
| | §8.1 | бенчмарк токенизаторов npm |
| | §9 | vitest и `PromptContent`; golden-тесты узла идут на кассетах §1 |
| | §10 | целиком: ax/gepa-ts, `@voltagent/evals`, порт `propose` → порт §11 |
| [10. Рантайм](../10-runtime.md) | §4, §5 | конвейер `generateText` + jsonrepair + Zod; порядок `cassette → budget → rateLimit → pii` |
| | §9.1–§9.2 | бюджет как middleware; 429 и `Retry-After` теперь в `BackoffModel` |
| [11. Провайдеры](../11-providers.md) | §2.2 | `wrapLanguageModel`, порядок `telemetry → budget → cassette → pii` |
| | §6 | матрица на `generateObject` и Zod; теперь — трансформеры профилей §6 и явный strict на профиле ([ADR-0027](0027-dynamic-io-shapes.md)): при `strict=None` флаг равен `is_strict_compatible`, у Google флага `strict` нет |
| | §7.3 | «`budgetMiddleware` стоит выше кассеты» противоречит §1 |
| | §8 | usage `ai@6`, `registerTelemetryIntegration`; стоимость по снимку genai-prices |
| [12. Наблюдаемость](../12-observability.md) | §1.1, §5 | `VoltAgentObservability`, `@langfuse/otel`; теперь `InstrumentationSettings` на нашем `TracerProvider` и OTLP/HTTP ([ADR-0025](0025-python-engine.md) §8) |
| | §8 | replay через `timeTravel` и middleware |
| [13. Evals и гейты](../13-evals-and-gates.md) | §1, §6.2 | `@voltagent/evals`, promptfoo как прогонщик |
| | §5.2 | «живых npm-пакетов нет» для kappa и alpha |
| | §7.2, §7.4, §7.10, §7.11 | расхождения с scipy и между разделами (research §9, пункты 5a–5e; открытый вопрос 20); таблица «что есть в TS» |
| | §12 | вопросы про Zod-интроспекцию, ai@6 middleware, TS-реализацию статистики |
| [research/statistics-gates.md](../research/statistics-gates.md) | §1.5, §6.2 | Wilcoxon `exact: n <= 50`; согласие судьи как плоская Cohen kappa (файл не удаляется) |

## Проверка

| Что проверяем | Как |
|---|---|
| Реплей без вызовов | запись в одном процессе, `replay_strict` в другом: 0 вызовов внутренней модели, тот же выход, тот же ключ для `FunctionModel`, `OpenAIChatModel`, `AnthropicModel` поверх `httpx2.MockTransport`; смена схемы (`max_length` 120 → 60) → `CassetteMiss`; `count_tokens` на реплее → 0 HTTP; `ALLOW_MODEL_REQUESTS = False` → живая модель падает `RuntimeError`, реплей проходит |
| Порядок цепочки | каждое звено пишет маркер в общий список на входе и выходе; ожидается точная последовательность §1 |
| Гейт исходов, случаи A–E | A: обрезанный tool call с `length` → `TruncatedOutput`, 1 вызов, `RetryPromptPart` не отправлен; B: полный валидный JSON с `length` → `TruncatedOutput`, 1 вызов; C: обрезанный `NativeOutput` → `TruncatedOutput`, 1 вызов; D: `content_filter` без частей → `RefusedOutput`, не `ContentFilterError`; E: отказ Anthropic с текстом → `RefusedOutput`, 1 вызов, без повтора. Те же фикстуры из кассеты воспроизводят те же исходы |
| Классификация исключений | каждое исключение таблицы §3 → ожидаемый исход; `IncompleteToolCall` не попадает в общий `UnexpectedModelBehavior` |
| PII | в файле кассеты нет совпадений с образцами PII ни в запросе, ни в ответе; в спанах при `include_content=False` нет PII; на проводе плейсхолдер |
| Бесплатный реплей | стоимость журнала до и после прогона на кассетах равна; `cost_limit` не срабатывает; 0 HTTP |
| Один слой ретраев | 429 от мока: число HTTP-вызовов = попыткам `BackoffModel`; SDK-клиент без нашей обёртки даёт ровно 1 вызов; TID251 валит импорт `pydantic_ai.retries` |
| Профили схем | golden-снимки wire-схем по каждому профилю, снятые с `MockTransport`; диф снимка без записи в ADR — красный CI |
| Allowed-set | ответ с кодом в другом регистре нормализуется; код вне множества → `ModelRetry` с тремя кандидатами; индекс вне диапазона отклоняется Pydantic |
| Шаблоны | множества тегов (без служебных `content`, `output`, `illegal`) и фильтров инстанса равны белому списку; `analyze().filters` вне белого списка — ошибка компиляции; `else` в `case` ловится R-T4; `message` внутри `if` ловится; на каждое R-T1..R-T13 шаблон-нарушитель |
| Файл датасета | round-trip `datasets/*.yaml`: строгий проход → `from_dict` → канонический писатель даёт те же байты; `dataset.schema.json` принимает заголовок `apiVersion`/`kind` и отвергает неизвестный ключ и `$schema` (открытый вопрос 14) |
| Golden-статистика с фиксированным seed | эталонные значения research §7.1–§7.3: McNemar (таблица Агрести, exact против `binomtest`), Wilcoxon (пример «corn»), Holm, BH (наивное пошаговое правило обязано валить тест), quadratic weighted kappa (statsmodels = ручная формула), неполная шкала `{1, 2, 5}`, Krippendorff своя реализация = пакет-оракул; BCa с `seed=20260916` дважды даёт идентичные границы; вырожденные разницы → NaN → `GATE_UNAVAILABLE` |
| Цепочка гейта | n = 120 → `GATE_UNAVAILABLE('dataset_too_small')`; n = 500 с приростом и регрессией вторичной метрики → `WARN('side_regression')`; n = 500 без прироста → `BLOCK('no_significant_improvement')` |
| Выпавшие кейсы | `LLMJudge` с нерезолвимой моделью → кейс считается выпавшим в A и B; > 5% → `GATE_UNAVAILABLE` |
| GEPA оффлайн | скриптовая reflection-модель вносит `{{ unknown_slot }}` → мутант отклонён, 0 вызовов модели задачи на него, текст не достигает модели; сборка единиц побайтово сохраняет структуру; адаптер без `propose_new_texts` валит тест; `ALLOW_MODEL_REQUESTS = False` на всём прогоне |
| Изоляция модуля статистики | `ruff check` каталога модуля: TID251 валит импорт `pydantic_ai`, `pydantic_evals` и каждого общего запрета корня; фикстура сверяет вложенную таблицу `banned-api` с корневой |

## Пересмотр

- Pydantic AI меняет контракт `WrapperModel` (`request`, `request_stream`, `count_tokens`) или переносит трансформер
  схемы из `prepare_request` модели провайдера: ключ кассеты перестаёт быть нейтральным, таблица §1 пересобирается.
- Pydantic AI сам останавливает повторы на `length` и различает отказ: гейт сужается до нормализации исхода.
- Pydantic AI v3 убирает импорт encode `httpx` из `pydantic_ai.retries`: сравниваем с `BackoffModel`.
- Спайк `DBOSDurability` (открытый вопрос 2 здесь, вопросы 3–4 [ADR-0025](0025-python-engine.md)) показывает, что
  ретраи или шаги DBOS несовместимы с исключениями цепочки или с реплеем кассеты: положение DBOS-шагов относительно
  цепочки и маршрут исходов решаются заново.
- python-liquid без релизов более 12 месяцев или ломающая смена `analyze()`, `ContentNode`, `Environment.add_tag`.
- gepa 0.x меняет `GEPAAdapter`, `ReflectionLM` или `propose_new_texts`; в DSPy или Pydantic AI появляется упакованный
  адаптер GEPA для внешних шаблонов.
- Появляется разрешительно лицензированная реализация Krippendorff alpha с порядковой дистанцией: своя реализация
  заменяется.
- pydantic-evals получает статистику, seed-ы повторов или спаривание по ключу: пересматривается граница «готовое /
  своё» §9.
- scipy меняет поведение `wilcoxon(method="exact")` или правило `z0` BCa: golden-фикстуры падают, политика 13 §7
  перепроверяется.
- Требуются смешанные модели, GEE или байесовская отчётность (триггеры ADR-0015): statsmodels уже в процессе, решение
  принимается отдельным ADR без сайдкара.

## Открытые вопросы

1. **Юридический статус `krippendorff` 0.8.2 как dev-оракула.** GPL-3.0-or-later, оценка не делалась. *Закрыть:*
   юридическое заключение; либо убрать пакет: nominal и interval сверять с nltk 3.10.3 (Apache-2.0), ordinal — с
   опубликованными значениями (0.815 на каноническом примере).
2. **DBOS и цепочка гарантий.** Интеграция — `DBOSDurability` с `agent.run()` внутри нашего `@DBOS.workflow`; с
   цепочкой гарантий она не запускалась (только с `FunctionModel` в пробе согласования тулов, §1, [ADR-0025](0025-python-engine.md)
   §9, H6); `DBOSModel` — обёртка устаревшего `DBOSAgent`, к этому варианту не относится. Не проверено: где
   DBOS-шаги запроса модели встают относительно `OutcomeGateModel`, `CassetteModel` и `BackoffModel`; как шаг
   записывает `TruncatedOutput`, `RefusedOutput`, `CassetteMiss`, `UsageLimitExceeded` и повторяет ли их
   восстановление (вопрос 3 ADR-0025); выбор «один `DBOS.step` на узел или `agent.run()` с `DBOSDurability`» (вопрос 4
   ADR-0025); восстановление общего `RunUsage` после падения процесса
   (журнал живёт в памяти); то, что `CassetteMiss` при восстановлении не становится живым вызовом. *Закрыть:* спайк на
   dbos 2.31.1 (SQLite) в обоих вариантах с `FunctionModel`, бросающей эти исключения: маркеры звеньев, записи
   `list_workflow_steps`, состояние журнала и счётчик вызовов модели после восстановления.
3. **Ретраи google-genai 2.23.0.** `HttpRetryOptions.attempts` по умолчанию 5; поведение при `retry_options=None` не
   проверено. *Закрыть:* мок транспорта encode httpx, 429, подсчёт HTTP-вызовов при `attempts=1` и при `None`.
4. **Токенизатор оценки и preflight count-эндпоинтов.** tiktoken 0.14.0 (MIT) приезжает с extra `openai`, но BPE-файл
   `o200k_base` скачивается с `openaipublic.blob.core.windows.net`; оффлайн-работа с вендоренным кэшем не проверена;
   count-эндпоинты Anthropic и Google против реальных сервисов не вызывались. *Закрыть:* прогон tiktoken с
   `TIKTOKEN_CACHE_DIR` без сети; сравнение оценки с `usage` на кассетах; решение, для каких профилей включать
   `count_tokens_before_request`.
5. **pyright strict на адаптере GEPA.** Соответствие `TemplateUnitsAdapter` протоколу `GEPAAdapter` и
   `AdmissibleReflection` протоколу `ReflectionLM` не проверено. *Закрыть:* pyright 1.1.414 strict на модуле адаптера.
6. **Поведение реальной reflection-модели.** Проверено только на скриптовой модели: доля допустимых мутантов, эффект
   цикла починки и извлечение текста из ```-блока (края единиц теряют пробелы) неизвестны. *Закрыть:* прогон на
   реальном датасете с записью кассет, метрики «допустимые / отклонённые / вызовы до лучшего кандидата».
7. **Гранулярность и стабильные id `TextUnit`.** GEPA мутировал метку `Ticket:` перед слотом; порядковые id `text_00`
   сдвигаются при ручной правке шаблона. *Закрыть:* id от пути охватывающих узлов (роль сообщения, тег, порядковый
   номер внутри родителя) и порог оптимизируемой единицы, проверка на трёх шаблонах архетипов.
8. **Досрочный обрыв ремонта** при повторе того же набора ошибок (ADR-0005, обязательство 5): механизма в разборе
   Pydantic AI не найдено. *Закрыть:* реализация в `output_validator` или history processor и тест.
9. **Стриминг: кассета и гейт.** Реплей `request_stream` через `CompletedStreamedResponse(replay_events=True)` дал 0
   вызовов, но запись в пробе буферизует весь поток; гейт исходов проверен только на `request`. *Закрыть:* запись
   событий с `replay_events=[...]`, гейт по финальному `finish_reason` потока, тест на `run_stream`.
10. **Канонизация ключа кассеты через `rfc8785`.** Проба использовала свою order-preserving сериализацию; вариант
    «`properties` → список пар → `rfc8785.dumps`» не запускался. *Закрыть:* тест равенства ключей для трёх
    провайдеров и различия ключей при перестановке полей.
11. **`BackoffModel` на tenacity 9.1.4.** API tenacity (`AsyncRetrying`, `retry_if_exception`, `stop_after_attempt`,
    `wait_exponential_jitter`) проверен импортом, заполнение `ModelHTTPError.headers` тремя провайдерами — по коду;
    сама обёртка не запускалась; сдвиг бакета профиля по `Retry-After` (10 §9.2) не спроектирован. *Закрыть:* тест
    429 с `retry-after` → ожидаемое число попыток, одна запись кассеты, один слот лимитера.
12. **Снимок genai-prices из каталога.** API `set_custom_snapshot(DataSnapshot | None)` есть, построение `DataSnapshot`
    из цен нашего каталога не проверено. *Закрыть:* сборка снимка из записи каталога и сверка `ModelResponse.cost()` с
    пересчётом по каталогу.
13. **Общий `RunUsage` при параллельных ветках.** Одновременные `agent.run` на одном журнале и перелёт порогов при
    параллели не проверены. *Закрыть:* тест `asyncio.gather` двух узлов на одном журнале с `total_tokens_limit`.
14. **Файл датасета.** Не запускались: загрузка `Dataset.from_dict` после строгого YAML-прохода и снятия заголовка, с
    `custom_evaluator_types`; наш тип LLM-судьи из каталога; схема `dataset.schema.json` как обёртка
    `model_json_schema_with_evaluators()` (`apiVersion` и `kind` в `required`, `additionalProperties: false`, без
    свойства `$schema`); сопоставление схемы файлам через `yaml.schemas` в redhat.vscode-yaml (известно по README, в
    редакторе не проверялось). *Закрыть:* round-trip `datasets/*.yaml` через строгий проход, `from_dict` и канонический
    писатель; валидация файла сгенерированной схемой — заголовок принят, неизвестный ключ и `$schema` отвергнуты;
    подсветка в VS Code по глобу из `.vscode/settings.json`.
15. **Resume GEPA и неучтённые вызовы.** При resume движок заново оценивает seed на всём valset до загрузки состояния,
    и эти вызовы не учитываются (research §8.4). С кассетами они должны быть попаданиями. *Закрыть:* resume с
    включённой кассетой, подсчёт HTTP-вызовов.
16. **Минимум датасета для запуска оптимизации.** 13 §7.10 требует ≥ 200 на test-сплите, 08 §10.3 — «набор ≥ 200
    элементов»; при полосах 70/15/15 первое означает ~1334 элемента всего. *Закрыть:* решение политики в 13 при чистке.
17. **Условия R-T3 на python-liquid.** Структура выражений `IfNode` (операторы, литералы, пути) для белого списка
    операторов не разбиралась. *Закрыть:* разбор объектов `liquid.builtin.expressions` и тест на шаблонах-нарушителях R-T3.
18. **`{% message %}` → сообщения Pydantic AI.** Тег проверен, отображение ролей в `instructions`, `user_prompt`,
    `message_history` и меток кэша Anthropic — нет. *Закрыть:* запрос с тремя ролями и `cache` через
    `httpx2.MockTransport`, сверка тела запроса.
19. **Онлайн-оценка прода** (`OnlineEvaluation`, `OnlineEvalConfig` в pydantic-evals 2.43.0) описана в коде, не
    запускалась. *Закрыть:* прогон с семплированием и приёмником в наш Postgres до решения по 13 §11.
20. **Расхождения 13 §7 и research/statistics-gates.md** (research §9, пункты 5a–5e). Ограничения этого ADR
    (`method="exact"` у Wilcoxon запрещён, BCa по массиву разниц, NaN-интервал → `GATE_UNAVAILABLE`, quadratic weighted
    kappa) политику не выбирают: расхождения решаются политикой, а не кодом. *Закрыть:* этап чистки фиксирует в 13 §7
    и research/statistics-gates.md статистику ordinal-CI (среднее нормированных разниц вместо медианы), замену
    `exact: n <= 50` на `asymptotic` при n ≥ 200 и перестановочный метод для превью, правило `z0` scipy в
    golden-фикстурах, одно- или двусторонний интервал, вид каппы в research/statistics-gates.md §6.2.
21. **Выход узла в PII-режиме.** По §1 в PII-режиме наверх уходит отредактированная копия ответа, чтобы запись и реплей
    совпадали; значения, которые модель эхом вернула, заменяются плейсхолдерами и в живом прогоне. Это выбор ADR, а не
    решение владельца; обратная подстановка по детерминированным псевдонимам (13 §3.7) не проектировалась. *Закрыть:*
    решение владельца — плейсхолдеры в выходе или таблица псевдонимов на прогон с записью в провенанс; тест равенства
    выходов live и replay на кассете.
22. **`openai-strict` для fine-tuned моделей OpenAI.** Встроенный трансформер оставляет `minimum`/`maximum` на проводе,
    а ADR-0004 и ADR-0006 фиксируют, что fine-tuned модели OpenAI их не поддерживают. *Закрыть:* решить, нужен ли
    отдельный профиль со своим `JsonSchemaTransformer`, который переносит эти ключи в `description`, и отмечается ли
    fine-tuned модель в каталоге; golden-снимок через `httpx2.MockTransport`.
23. **`finish_reason = "error"` и `pause_turn`.** Google `LANGUAGE`, `MALFORMED_FUNCTION_CALL`, `UNEXPECTED_TOOL_CALL`,
    `NO_IMAGE` и OpenAI Responses `cancelled`, `failed` дают `error`; Anthropic `pause_turn` даёт `None`. Гейт §1 их не
    классифицирует, ответ идёт на разбор как `ok` и в лучшем случае кончается `NodeQualityFailure` после
    `output`-ретраев. *Закрыть:* решить исход (ошибка провайдера без повтора того же промта или отдельный вид сбоя),
    добавить строку в `OUTCOME_GATES` и в таблицу §3, фикстуры через `httpx2.MockTransport` для каждого сырого значения.
24. **Пробы на CPython 3.14.** Пробы этого ADR шли на CPython 3.12.4, ADR-0025 фиксирует 3.14; на 3.14.7 повторены
    только импорты стека, `ImportError` модуля `pydantic_ai.retries` (ADR-0025 §5), построители провайдеров фабрики
    и вложенный `ruff.toml` модуля статистики (§1, §10). *Закрыть:* перенести пробы в спайк
    фазы 0 как тесты с `ALLOW_MODEL_REQUESTS = False` и прогнать на CPython 3.14.7 с `uv.lock` проекта: цепочка,
    кассета, исходы A–E, PII, бюджеты, статистика, GEPA.
