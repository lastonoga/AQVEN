# Исследование: слой качества на Python

> Дата: 2026-09-16
> Для: [ADR-0029](../adr/0029-trust-and-quality-python.md), [ADR-0025](../adr/0025-python-engine.md)

Заметка собирает проверенные факты о слое качества движка на Python: гарантии на каждом вызове модели, трассы,
канонизация и хеш, git, YAML, evals, статистика гейтов, оптимизация промтов GEPA. Здесь доказательства, а не нормы:
решения, которые на них опираются, записаны в [ADR-0025](../adr/0025-python-engine.md) (стек, httpx2, канонизация, git,
YAML, отмена экспорта) и [ADR-0029](../adr/0029-trust-and-quality-python.md) (цепочка гарантий, исходы, трассы, evals,
статистика, GEPA, тесты без сети). Что не проверено запуском, чтением установленного пакета или официальной
документацией, вынесено в «Открытые вопросы».

## Как проверяли

| Стенд | Что установлено | Чем подменена сеть | Пробы |
|---|---|---|---|
| guarantees | CPython 3.12.4; `pydantic-ai-slim[openai,anthropic,google]` 2.43.0, `opentelemetry-sdk` 1.44.0; отдельный venv-slim: `pydantic-ai-slim[openai]` 2.43.0 + `tenacity` 9.1.4 | `FunctionModel` или настоящие `OpenAIChatModel`, `OpenAIResponsesModel`, `AnthropicModel` поверх `httpx2.MockTransport`, фальшивые ключи | `probe_cassette.py`, `probe_budget.py`, `probe_shared_usage.py`, `probe_outcomes.py`, `probe_profiles.py`, `probe_retries.py`, `probe_pii.py`, `probe_tokens.py`, `probe_span.py`, `probe_extra.py`, `probe_chain.py`; обёртки в `aqven_guard.py` |
| obs-canon-git | CPython 3.12.4, точные пины; оракулы Node 20.19.0 + `canonicalize@5.0.0`, `tar-stream@3.2.1`, git CLI | `FunctionModel`; Langfuse — локальный сервер-приёмник на 127.0.0.1 | `probe_tracing.py`, `probe_langfuse.py`, `probe_langfuse_client.py`, `probe_logfire.py`, `probe_jcs.py`, `probe_hash.py`, `probe_tar.py`, `probe_git.py`, `probe_gitpython_nogit.py`, `probe_yaml.py`, `probe_yaml_writer.py`, `probe_watch.py` |
| evals-stats | CPython 3.12.4, arm64; `pydantic-evals` 2.43.0, `scipy` 1.18.1, `statsmodels` 0.15.0, `scikit-learn` 1.9.1, `krippendorff` 0.8.2, `nltk` 3.10.3, `opentelemetry-sdk` 1.44.0, `tenacity` 9.1.4 | `FunctionModel` | `evals_probe.py`, `yaml_roundtrip.py`, `stats_probe.py`, `wcheck.py`, `zcheck.py`, `gate_core.py` |
| prompt-opt | CPython 3.12.4; `gepa` 0.1.4, `python-liquid` 2.3.1, `pydantic-ai-slim` и `pydantic-evals` 2.43.0; без `litellm` и без ключей | `FunctionModel`, сценарная reflection-модель | `step1_variants.py` … `step5_port_run.py`; исходники DSPy по тегу 3.3.1 с GitHub |

Ссылки вида `pydantic_ai/models/wrapper.py:31-63` — строки в установленном пакете указанной версии на стенде этой заметки.
В другой среде номера строк того же пакета могут сдвигаться, поэтому опора — модуль и имя символа, где они названы. Сниппеты
приведены к правилам кода (без комментариев, плоско, строгие типы): Krippendorff alpha (§7.3) и извлечение TextUnit (§8.5)
в итоговой форме перепроверены запуском, остальные повторяют логику запущенных проб, но в итоговой форме не запускались. Все
стенды на CPython 3.12.4, а ADR-0025 фиксирует CPython 3.14 (открытый вопрос 1). Пробы выполнялись вне репозитория
2026-09-16 и в репозиторий не перенесены (открытый вопрос 2).

## Итог

| Тема | Берём | Версия | Лицензия | Своё поверх |
|---|---|---|---|---|
| Гарантии вызова | `pydantic_ai.models.wrapper.WrapperModel`, `UsageLimits`, `RunUsage` | 2.43.0 | MIT | `OutcomeGateModel`, `RedactingModel`, `CassetteModel`, лимитер, фабрика моделей |
| Цены | `genai-prices` (жёсткая зависимость pydantic-ai-slim) | 0.1.7 | MIT | пин снимка цен на версию каталога |
| Транспортный ретрай | `tenacity` | 9.1.4 | Apache-2.0 | обёртка backoff (в ADR-0029 — `BackoffModel`), не `pydantic_ai.retries` |
| Трассы | `InstrumentationSettings` Pydantic AI, `opentelemetry-sdk`, `opentelemetry-exporter-otlp-proto-http` | 2.43.0; 1.44.0; 1.44.0 | MIT; Apache-2.0; Apache-2.0 | атрибуты Langfuse своей фабрикой |
| Канонический JSON | `rfc8785` | 0.1.4 | Apache-2.0 | запрет `-0.0`, доменная сепарация на `hashlib`; Merkle-корень — справочно (открытый вопрос 23) |
| Git | `dulwich` | 1.2.15 | Apache-2.0 OR GPL-2.0-or-later | `GitPort`, синхронизация индекса после CAS |
| YAML | `ruamel.yaml` | 0.19.1 | MIT | строгий предпроход, канонический representer |
| Наблюдение за файлами | `watchfiles` | 1.2.0 | MIT | фильтр `.aqven/` |
| Evals | `pydantic-evals` | 2.43.0 | MIT | 16 пунктов из §6.6 |
| Статистика | `scipy`, `statsmodels` | 1.18.1; 0.15.0 | BSD; BSD-3-Clause | Krippendorff alpha, ICC, вся логика гейта |
| Оптимизация промтов | `gepa` | 0.1.4 | MIT | TextUnit, `AdmissibleReflection`, `PromptOptimizerPort` |
| Шаблоны | `python-liquid` | 2.3.1 | MIT | правила формы шаблона |

Не берём: Python SDK `langfuse` 4.15.3 (MIT); платформу Logfire (SDK 5.1.0 — MIT, платформа закрыта); `jcs` 0.2.1
(Apache-2.0); `canonicaljson` 2.0.0 (Apache-2.0); GitPython 3.1.62 (BSD-3-Clause); PyYAML 6.0.3 (MIT) для файлов описания;
`krippendorff` 0.8.2 (GPL-3.0-or-later, только оракул в dev); `litellm` (MIT по PyPI, последняя 1.101.0; extra `full` у
gepa требует `<1.92,>=1.83.0`); оптимизаторы DSPy 3.3.1 (MIT); `pydantic_ai.retries` из pydantic-ai-slim 2.43.0 (MIT).
`pygit2` 1.20.1 (GPLv2 with linking exception) — возможная вторая реализация `GitPort`. `scikit-learn` 1.9.1
(BSD-3-Clause) не нужен: взвешенная каппа с интервалом есть в statsmodels.

## 1. Гарантии на каждом вызове модели

### 1.1. Точка врезки — `WrapperModel`

`WrapperModel(Model)` пробрасывает `request`, `request_stream`, `count_tokens`, `compact_messages`, `prepare_request`,
`customize_request_parameters`, `profile`, `settings`, `model_id`, остальное — через `__getattr__`
(`pydantic_ai/models/wrapper.py:31-63, 71-77, 87-98, 138-140, 162-163`). Pydantic AI строит на нём собственные обёртки:
`InstrumentedModel` (`models/instrumented.py:333`), `ConcurrencyLimitedModel` (`models/concurrency.py:27`),
`DBOSModel` (`durable_exec/dbos/_model.py:22`), `TemporalModel`, `PrefectModel`.

| Факт | Источник | Следствие |
|---|---|---|
| Любой вызов модели агентом идёт через `Model.request` или `request_stream` | `models/__init__.py:529-539` | цепочка обёрток покрывает все LLM-узлы без обходных путей |
| Схема переписывается под провайдера внутри конкретной модели: `prepare_request` → `customize_request_parameters` → `profile['json_schema_transformer']` | `models/__init__.py:597-616, 618-711` | обёртка видит нейтральную схему, ключ кассеты не зависит от провайдера |
| `DBOSAgent` оборачивает `agent.model` в `DBOSModel`, чей `request` — DBOS-шаг. `DBOSAgent` устарел в 2.43.0 (`@deprecated`, удаление запланировано на v3), замена — capability `DBOSDurability`: `agent.run()` вызывается внутри своего `@DBOS.workflow`, запросы модели идут DBOS-шагами ([research/py-stack-runtime.md](py-stack-runtime.md) §3.1, §5.2) | `durable_exec/dbos/_agent.py` `DBOSAgent.__init__`, `_model.py` `DBOSModel`, `_durability.py` `DBOSDurability` | при `DBOSAgent` вся наша цепочка — внутри одного шага DBOS (вывод, dbos на стенде не стоял); при `DBOSDurability` положение цепочки относительно шага не проверено (открытый вопрос 3) |
| `InstrumentedModel`, переданный агенту, разворачивается и заменяется capability `InstrumentationCap`, которая открывает спан `chat <model>` вокруг вызова модели | `agent/__init__.py:1645-1660` | телеметрия — самый внешний слой без дополнительной проводки |
| Атрибуты, выставленные из обёртки через `trace.get_current_span().set_attributes(...)`, попали на спан `chat function:fn:`, а не на `invoke_agent` | `probe_span.py`: `aqven.cassette.hit: true`, `aqven.cassette.key` на chat-спане | попадание в кассету и ключ пишутся атрибутами из обёртки |

Паттерны: Decorator (каждая обёртка), Chain of Responsibility (цепочка обёрток), Factory (цепочку собирает только
фабрика моделей из каталога).

### 1.2. Кассета

Ключ — `sha256-` + sha256(`aqven.cassette.v1\0` + канонический JSON). В канонический JSON входят логическая ссылка на
модель (`model_ref` каталога), сообщения через `ModelMessagesTypeAdapter` без `timestamp`, `run_id`, `conversation_id`,
`provider_response_id`, `usage`, `metadata`, настройки, слитые с настройками обёрнутой модели (`merge_model_settings`),
`output_mode`, `allow_text_output`, схемы выходных и функциональных инструментов и `output_object`. Ключи объектов
отсортированы, порядок `properties` сохранён. Слияние настроек внутри ключа закрывает задачу слоя
`request-normalization` из ADR-0003, отдельный слой не нужен (вывод).

| Сценарий | Запись (`replay_lenient`) | Реплей в другом процессе (`replay_strict`) | Ключ |
|---|---|---|---|
| `FunctionModel` | 1 вызов | 0 вызовов, тот же выход | `sha256-c4297bbb…` |
| `OpenAIChatModel` поверх `httpx2.MockTransport` | 1 HTTP | 0 HTTP, тот же выход | `sha256-c4297bbb…` |
| `AnthropicModel` поверх `httpx2.MockTransport` | 1 HTTP | 0 HTTP, тот же выход | `sha256-c4297bbb…` |
| Схема изменена: `max_length` 120 → 60 | — | `CassetteMiss` | `sha256-f9ef9aff…` |
| `run_stream`, реплей через `CompletedStreamedResponse(replay_events=True)` (`models/__init__.py:1255-1275`) | 1 вызов стрим-функции | 0 новых вызовов | — |

Кассета, записанная на одном провайдере, проигрывается на другом — требование 4 контекста ADR-0003 выполняется.
Ограничение пробы: в режиме записи стрим буферизуется целиком, живые частичные ответы теряются; рабочая версия должна
собирать события и передавать `replay_events=[...]` (открытый вопрос 7).

```python
@dataclass(frozen=True, slots=True)
class CassetteMode:
    reads: bool
    writes: bool
    strict: bool


CASSETTE_MODES: Mapping[str, CassetteMode] = {
    "off": CassetteMode(reads=False, writes=False, strict=False),
    "record": CassetteMode(reads=False, writes=True, strict=False),
    "replay_lenient": CassetteMode(reads=True, writes=True, strict=False),
    "replay_strict": CassetteMode(reads=True, writes=False, strict=True),
}


def cassette_key(canonical: bytes) -> str:
    return "sha256-" + hashlib.sha256(b"aqven.cassette.v1\x00" + canonical).hexdigest()


class CassetteModel(WrapperModel):
    async def request(self, messages: list[ModelMessage], model_settings: ModelSettings | None, model_request_parameters: ModelRequestParameters) -> ModelResponse:
        key = cassette_key(self.canonical_request(messages, model_settings, model_request_parameters))
        cached = self.store.load(key) if self.mode.reads else None
        if cached is not None:
            return self.free_replay(cached, key)
        if self.mode.strict:
            raise CassetteMiss(key)
        response = await self.wrapped.request(messages, model_settings, model_request_parameters)
        if self.mode.writes:
            self.store.save(key, response)
        return response

    async def count_tokens(self, messages: list[ModelMessage], model_settings: ModelSettings | None, model_request_parameters: ModelRequestParameters) -> RequestUsage:
        if self.mode.reads:
            return RequestUsage()
        return await self.wrapped.count_tokens(messages, model_settings, model_request_parameters)
```

Режимы заданы таблицей (Strategy через данные) вместо сравнения строк. `free_replay` обнуляет `usage` ответа и кладёт
записанный `usage` в `metadata`.

Что кассета обязана закрывать сверх `request`:

| Обязанность | Факт | Источник | Решение |
|---|---|---|---|
| `count_tokens` | `WrapperModel.count_tokens` пробрасывает вызов провайдеру, это сетевой запрос | `wrapper.py:71-77` | кассета переопределяет метод; на реплее 0 HTTP (`probe_tokens.py`) |
| Стоимость | в записанном ответе `usage.cost: null`; стоимость считает агент после возврата из обёртки по снимку genai-prices | `_agent_graph.py:1918-1935`, `_genai_prices.py:155-175` | снимок цен пинится: `genai_prices.data_snapshot.set_custom_snapshot` (`genai_prices/data_snapshot.py:18-36`) |
| Бесплатный реплей | с обнулённым `usage` реплей дал стоимость 0.00 и прошёл `cost_limit=0.001` при 0 HTTP; с `free_replay=False` тот же реплей упал по лимиту | `probe_budget.py` | «реплей бесплатен» из ADR-0003 — решение кассеты, а не порядка слоёв |
| Счётчик запросов | `requests` прогона растёт и на реплее | `probe_extra.py` | отказ по `request_limit` одинаков в live и replay |
| Выключатель сети | `pydantic_ai.models.ALLOW_MODEL_REQUESTS = False`: живая `OpenAIChatModel` падает `RuntimeError('Model requests are not allowed, since ALLOW_MODEL_REQUESTS is False')`, реплей из кассеты работает при 0 HTTP; `FunctionModel` и `TestModel` выключатель не затрагивает | `models/__init__.py:1424, 1439` | заменяет проверку «песочница с отключённой сетью» из ADR-0003; тесты и CI без сети (ADR-0029) |

### 1.3. Бюджеты и стоимость

`UsageLimits(cost_limit: Decimal | None, request_limit=50, tool_calls_limit, input_tokens_limit, output_tokens_limit,
total_tokens_limit, per_request_input_tokens_limit, count_tokens_before_request=False)`; любое превышение —
`UsageLimitExceeded(AgentRunError)` (`usage.py:446-499`, `exceptions.py:459`).

| Лимит | Когда проверяется | Источник | Замер |
|---|---|---|---|
| `request_limit` | до запроса | `usage.py:520-542` | `request_limit=2` в цикле невалидного выхода: `The next request would exceed the request_limit of 2` |
| токены (`input`, `output`, `total`) | после ответа, в `_append_response`: вызов уже оплачен | `usage.py:566-580`, `_agent_graph.py:1926-1934` | `output_tokens_limit=100` против ответа на 200 токенов: `Exceeded the output_tokens_limit of 100 (output_tokens=200)` после 1 HTTP |
| `cost_limit` | после ответа и повторно до следующего запроса | `usage.py:544-554` | `cost_limit=0.001`: ``Exceeded the `cost_limit` of 0.001 (`usage.cost`=Decimal('0.0045'))`` после 1 HTTP |
| `per_request_input_tokens_limit` с `count_tokens_before_request=True` | до запроса, но через `count_tokens` провайдера, то есть сетевым вызовом | `usage.py:487-499`, `_agent_graph.py:1695-1748` | Anthropic-мок вернул 5000 при лимите 1000: `UsageLimitExceeded`, вызван только `POST /v1/messages/count_tokens` |
| `tool_calls_limit` | — | `usage.py:446-499` | не замерялся |

Общий бюджет прогона: один `RunUsage`, переданный в `agent.run(usage=ledger)` нескольким агентам, обновляется на месте
(`agent/abstract.py:489`). Замер: `node_a` потратил 500 токенов, `node_b` упал с
`Exceeded the total_tokens_limit of 900 (total_tokens=1000)`.

```python
async def run_two_nodes(node_a: Agent[None, str], node_b: Agent[None, str]) -> RunUsage:
    ledger = RunUsage()
    limits = UsageLimits(request_limit=10, total_tokens_limit=900, cost_limit=Decimal("0.05"))
    await node_a.run("a", usage=ledger, usage_limits=limits)
    await node_b.run("b", usage=ledger, usage_limits=limits, retries={"output": 2})
    return ledger
```

| Факт о стоимости | Источник |
|---|---|
| `genai-prices` 0.1.7, MIT, выложен 2026-09-15, требует `httpx2` и `pydantic`; жёсткая зависимость `genai-prices>=0.1.6` | PyPI JSON; `pydantic_ai_slim-2.43.0.dist-info/METADATA:34` |
| Цены из встроенного снимка; скачивание только при явном `pydantic_ai.prices.update_in_background()` или `genai_prices.UpdatePrices` | `prices.py` |
| Стоимость видна как `result.usage.cost` (`Decimal`, `None` для неоценённой модели), `ModelResponse.cost()` → `PriceCalculation`, атрибут спана `operation.cost` | `usage.py:131-137`, `messages.py:2916-2929` |
| gpt-4o, 1000 входных и 200 выходных токенов: 0.0045 (0.0025 + 0.002); claude-sonnet-4-5 с тем же usage: 0.006; `FunctionModel`: `None` | `probe_budget.py` |
| `result.usage` — свойство; `result.usage()` падает `TypeError`, хотя встроенная документация навыка Pydantic AI показывает вызов | `run.py:752-753` |

Подсчёт токенов до вызова:

| Модель | `count_tokens` | Источник |
|---|---|---|
| `OpenAIResponsesModel` | `POST /v1/responses/input_tokens`, проверено моком | `models/openai.py:1960, 2237-2275` |
| `AnthropicModel` | `POST /v1/messages/count_tokens`, проверено моком | `models/anthropic.py:815, 980-995, 1457` |
| `GoogleModel` | переопределение есть, не вызывалось | `models/google.py:500, 632-660` |
| `BedrockConverseModel` | только по исходнику | `models/bedrock.py:818` |
| `OpenAIChatModel`, `FunctionModel` | `NotImplementedError('Token counting ahead of the request is not supported by ...')`, в том числе при `count_tokens_before_request=True` | `models/__init__.py:541-549` |

`tiktoken` 0.14.0 (MIT, 2026-08-17) приходит с extra `openai` (`METADATA:92-93`), Pydantic AI использует его только в
`OpenAIEmbeddingModel` (`embeddings/openai.py:17, 170`). Файл `o200k_base` скачивается с `openaipublic.blob.core.windows.net`
в `TIKTOKEN_CACHE_DIR` (`tiktoken_ext/openai_public.py:95-97`, `tiktoken/load.py:35-45`); на стенде не скачивался
(открытый вопрос 9).

### 1.4. Три исхода ADR-0005

`ModelResponse.finish_reason: Literal['stop', 'length', 'content_filter', 'tool_call', 'error'] | None`, сырые данные
провайдера — в `provider_details` (`messages.py:142-148, 2803-2817`). Отдельного значения «отказ» нет.

| Провайдер | Обрезка → `length` | Отказ или фильтр → `content_filter` | Источник |
|---|---|---|---|
| OpenAI Chat | `length` | `message.refusal` → `parts=[]`, `provider_details['refusal']` | `models/openai.py:305-322, 1248-1263` |
| OpenAI Responses | `max_output_tokens` | текст отказа в `provider_details['refusal']` | `models/openai.py:2533-2537` |
| Anthropic | `max_tokens`, `model_context_window_exceeded` | `refusal` → `provider_details['finish_reason']='refusal'` + `refusal`, `refusal_category` из `stop_details` | `models/anthropic.py:102-111, 1674-1684` |
| Google | `MAX_TOKENS` | `SAFETY`, `RECITATION`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII`, `IMAGE_SAFETY`, `MODEL_ARMOR` | `models/google.py:182-198` |

Моки: OpenAI `finish_reason=length` → `length`, `{'finish_reason': 'length'}`; OpenAI refusal → `content_filter`,
`{'refusal': "I can't assist with that."}`; Anthropic `stop_reason=refusal` → `content_filter`,
`{'finish_reason': 'refusal'}`; Anthropic `max_tokens` → `length`, `{'finish_reason': 'max_tokens'}`. Нормализация в
исход «отказ» — наш адаптер над `finish_reason` и `provider_details`.

JSON Pydantic AI не чинит: финальный разбор идёт с `allow_partial='off'` (`_output.py:925-941`,
`tool_manager.py:332-341`), до разбора снимаются только markdown-ограждения (`_utils.py:1044-1055`), режим
`'trailing-strings'` — только для частичных ответов стрима. `pydantic_core.from_json(TRUNCATED, allow_partial='off')`
падает `EOF while parsing a value at line 1 column 37`. jsonrepair не нужен (ADR-0029).

Поведение по умолчанию (`FunctionModel`, `retries={'output': 1}`, `max_tokens=64`, `probe_outcomes.py`):

| Случай | Что вернула модель | Поведение Pydantic AI | Вызовов | Что нарушает в ADR-0005 | С `OutcomeGateModel` |
|---|---|---|---|---|---|
| A | обрезанный tool call, `finish_reason=length` | `RetryPromptPart` с `json_invalid`, повтор с тем же `max_tokens`, после исчерпания `IncompleteToolCall`: `Model token limit (64) exceeded while generating a tool call...`; настоящий `OpenAIChatModel`-мок — так же, 2 HTTP | 2 | обрезанный ответ уходит на повтор тем же лимитом | `TruncatedOutput`, 1 вызов (G) |
| B | полный валидный JSON tool call, `finish_reason=length` | принят как `ok` | 1 | обрезка не видна исходу | `TruncatedOutput`, 1 вызов (H) |
| C | обрезанный текст `NativeOutput` | `UnexpectedModelBehavior('Exceeded maximum output retries (1)')`; Anthropic `max_tokens` — так же, 2 HTTP | 2 | повтор и неразличимая ошибка вместо исхода «обрезан» | отдельно не замерялся |
| D | `content_filter` без частей (OpenAI `message.refusal`) | `ContentFilterError(UnexpectedModelBehavior)` без повтора | 1 | исход есть, но не наш тип и не отличает отказ от фильтра | отдельно не замерялся |
| E | `content_filter` с текстом (Anthropic `stop_reason=refusal`) | считается отсутствующим tool call и повторяется; второй валидный ответ → `ok`; Anthropic-мок — 2 HTTP и `Exceeded maximum output retries (1)` | 2 | отказ повторяется с тем же входом | `RefusedOutput`, 1 вызов (I) |

Дополнительно: capability `RaiseContentFilterError` на случае E даёт `ContentFilterError` после 1 вызова (F,
`capabilities/content_filter.py:17-55`); обрезанный ответ, за которым пришёл валидный, возвращает `ok`, обрезка остаётся
только в истории сообщений (J); пустой или только thinking-ответ с `length` сразу даёт `UnexpectedModelBehavior` без
повтора (`_agent_graph.py:2071-2075`). `IncompleteToolCall` выбрасывается только из `consume_output_retry` после
исчерпания бюджета (`_agent_graph.py:359-392`).

Исправление: гейт исхода проверяет `finish_reason` сразу после внутреннего запроса, до разбора и повтора.

```python
GateAction = Callable[[ModelResponse, int | None], ModelResponse]


def pass_through(response: ModelResponse, max_tokens: int | None) -> ModelResponse:
    return response


def raise_truncated(response: ModelResponse, max_tokens: int | None) -> ModelResponse:
    raise TruncatedOutput(response, max_tokens)


def raise_refused(response: ModelResponse, max_tokens: int | None) -> ModelResponse:
    raise RefusedOutput(response)


OUTCOME_GATES: Mapping[str | None, GateAction] = {
    "length": raise_truncated,
    "content_filter": raise_refused,
}


class OutcomeGateModel(WrapperModel):
    async def request(self, messages: list[ModelMessage], model_settings: ModelSettings | None, model_request_parameters: ModelRequestParameters) -> ModelResponse:
        response = await self.wrapped.request(messages, model_settings, model_request_parameters)
        merged = merge_model_settings(self.wrapped.settings, model_settings) or {}
        return OUTCOME_GATES.get(response.finish_reason, pass_through)(response, merged.get("max_tokens"))
```

Таблица обработчиков по `finish_reason` — Strategy. Гейт в пробе перехватывает только `request`; гейт для
`request_stream` не писался (открытый вопрос 4).

Маршрутизация исключений в нашем исполнителе (решение — ADR-0029):

| Исключение | Исход узла | Действие |
|---|---|---|
| `TruncatedOutput` | обрезан | повтор с большим `max_tokens` по политике узла; новый ключ кассеты, промах ожидаем |
| `RefusedOutput` | отказ | политика `on_refusal` или запасной профиль; повтор того же промта запрещён |
| `UnexpectedModelBehavior` | ошибка качества узла | `NodeQualityFailure` |
| `UsageLimitExceeded` | бюджет исчерпан | `BudgetExceeded` |
| `CassetteMiss` | — | остановка прогона |

### 1.5. Повторы вывода и скрытые ретраи SDK

`Agent(retries: int | AgentRetries | None)`, `AgentRetries = TypedDict{tools: int, output: int}`, оба по умолчанию 1;
на прогон — `agent.run(retries=...)`; для выходного инструмента `ToolOutput(max_retries=N)` перекрывает значение агента;
`@agent.output_validator` с `ModelRetry` тратит тот же бюджет вывода (`agent/abstract.py:109-129`,
`agent/__init__.py:389-408, 537, 618-626, 721-733`, `output.py:117-148`). Параметра `output_retries=` в 2.43.0 нет:
`TypeError: Agent.__init__() got an unexpected keyword argument 'output_retries'`. Исчерпание —
`UnexpectedModelBehavior('Exceeded maximum output retries (N)')` или подкласс `IncompleteToolCall`.
В 2.43.0 `Agent.run` принимает также `instructions=`, `retries`, `usage`, `usage_limits` (`agent/abstract.py:484-491`).

| Настройка (`probe_retries.py`) | Вызовов модели |
|---|---|
| по умолчанию | 2 |
| `retries={'output': 3}` | 4 |
| `retries=2` | 3 |
| `ToolOutput(max_retries=4)` при `output=1` у агента | 5 |
| `NativeOutput`, `output=2` | 3 |
| `run(retries={'output': 0})` | 1 |
| `output_validator` с `ModelRetry`, `output=2` | 3 |

Скрытые ретраи транспорта:

| Факт | Источник | Замер |
|---|---|---|
| openai 3.14.1 и anthropic 1.6.0: `DEFAULT_MAX_RETRIES = 2` | `openai/_constants.py:8`, `anthropic/_constants.py:8` | 429 через `OpenAIProvider(api_key, http_client)` и `AnthropicProvider` → 3 HTTP, затем `ModelHTTPError(status 429)` |
| Провайдер из `openai_client=AsyncOpenAI(max_retries=0, http_client=httpx2.AsyncClient(...))` или `anthropic_client=AsyncAnthropic(max_retries=0, ...)` | `probe_retries.py` | 1 HTTP |
| `pydantic_ai.retries.AsyncHTTPX2TenacityTransport` — транспорт httpx2, но модуль импортирует encode `httpx` при импорте (`TODO(v3)`) | `pydantic_ai/retries.py:19-37` | в venv-slim без `httpx`: `ImportError: Please install httpx to use the retries utilities` |
| extra `retries` требует `httpx>=0.27` и `tenacity>=8.2.3` | `METADATA:105-106` | — |
| google-genai 2.23.0: `HttpRetryOptions.attempts` «If not specified, default to 5» | `google/genai/types.py:2596-2599` | поведение при `retry_options=None` не проверено |

Отсюда решение ADR-0029 §1: SDK с `max_retries=0` и ровно один слой транспортного ретрая — наша обёртка backoff на
`tenacity` 9.1.4 (Apache-2.0, 2026-02-07). Правило httpx2 уточнено в ADR-0025 §5: наш код импортирует только `httpx2`
(ruff TID251), транзитивные encode `httpx` (google-genai 2.23.0 требует `httpx<1.0.0,>=0.28.1`) и `requests`
(OTLP-экспортёр, §2.2) допустимы, но нашим кодом не импортируются.

### 1.6. Редактирование PII

| Вариант (`probe_pii.py`) | Запрос на проводе | История агента | Вход chat-спана | Выход chat-спана | Файл кассеты |
|---|---|---|---|---|---|
| `RedactingModel(WrapperModel)`, `include_content=True` | `<EMAIL>`, сырых PII нет | сырые PII | сырые PII | сырые PII | — |
| `RedactingModel`, `InstrumentationSettings(include_content=False)` | `<EMAIL>` | сырые PII | PII нет | PII нет | — |
| `Hooks.before_model_request`, `include_content=True` | отредактирован | запросы отредактированы, правка сохраняется в истории; ответы с PII, повторёнными моделью, сырые | PII нет | сырые PII (модель повторила PII в ответе) | — |
| `RedactingModel` снаружи `CassetteModel` | `<EMAIL>` | — | — | — | ключ от отредактированных сообщений, но ответ модели сохранён сырым |

Причина: capability Instrumentation пишет `gen_ai.input.messages` и `gen_ai.output.messages` из контекста запроса до
обёртки (`capabilities/instrumentation.py:311-335`, `models/instrumented.py:77`); результат хука заменяет
`state.message_history` (`_agent_graph.py:1601-1636`, `capabilities/abstract.py:917-959`). Обёртка переписывает копии
через `dataclasses.replace` и историю не мутирует.

Следствия:
- в режиме PII `include_content=False` обязателен (ADR-0029);
- проверка ADR-0003 «в файле кассеты нет PII ни в `request`, ни в `response`» требует сохранять отредактированный ответ,
  и тогда реплей возвращает отредактированный выход (открытый вопрос 5);
- `before_model_request` — только если нужна редакция самой истории сообщений.

С `include_content=False` из спанов уходят `gen_ai.system_instructions`, `final_result`, аргументы и результаты
инструментов, у частей сообщений остаются только `type`, `id`, `name`; `model_request_parameters`,
`gen_ai.tool.definitions` (с JSON Schema выхода) и `metadata` остаются (`probe_tracing.py`, режим nocontent).

### 1.7. Строгие схемы: трансформеры по провайдерам

Разрешение профиля модели: `DEFAULT_PROFILE` → `provider.model_profile(model_name)` → `context_window` из genai-prices →
пользовательский `profile=`, частичный `ModelProfile` поверх или функция `(base) -> profile`
(`models/__init__.py:886-943`). `customize_request_parameters` прогоняет `json_schema_transformer` по функциональным
инструментам, выходным инструментам и `output_object`; при `strict=None` строгость выводится из `is_strict_compatible`
(`models/__init__.py:597-616, 1847-1871`).

| Модель | Трансформер по умолчанию | Источник |
|---|---|---|
| `openai:gpt-4o` | `OpenAIJsonSchemaTransformer` | `profiles/openai.py:447` |
| `anthropic:claude-sonnet-4-5` | `AnthropicJsonSchemaTransformer` | `providers/anthropic.py:103` |
| `google:gemini-2.5-flash` | `GoogleJsonSchemaTransformer` | `profiles/google.py:208` |
| OpenRouter `openai/gpt-5.2` | `OpenAIJsonSchemaTransformer` | `providers/openrouter.py:121` |
| OpenRouter `google/gemini-2.5-flash` | `_OpenRouterGoogleJsonSchemaTransformer` | `providers/openrouter.py:194` |

Свой трансформер подключается на трёх уровнях, все три проверены по перехваченному запросу:
`OpenAIChatModel(..., profile=ModelProfile(json_schema_transformer=AqvenAnthropicStrict))`,
`AnthropicModel(..., profile=lambda base: {**base, 'json_schema_transformer': AqvenAnthropicStrict})` и подкласс
провайдера с переопределённым `model_profile`. Это ложится на ADR-0004: идентификатор профиля схемы из каталога →
класс трансформера (Strategy, выбор через Registry), модель собирает фабрика.

**OpenAI, `strict=True`** (`profiles/openai.py`):

| Действие | Ключи | Строки |
|---|---|---|
| удаляются из схемы и дописываются в `description` как `key=value` | `_STRICT_INCOMPATIBLE_KEYS`: `minLength`, `maxLength`, `patternProperties`, `unevaluatedProperties`, `propertyNames`, `minProperties`, `maxProperties`, `unevaluatedItems`, `contains`, `minContains`, `maxContains`, `uniqueItems` | 495-508, 599-619 |
| то же для `format` вне белого списка | белый список: `date-time`, `time`, `date`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid` | 510-520 |
| то же для `pattern` | только с lookaround | 599-619 |
| удаляются без следа | `title`, `$schema`, `discriminator`, `default` | 578-589 |
| переписываются | `oneOf` → `anyOf`; `additionalProperties: false`; все свойства в `required` | 624-629, 636-641 |
| **остаются на проводе** | `minimum`, `maximum`, `maxItems`, `minItems` | — |

При `strict=None` несовместимые ключи не переносятся, а `is_strict_compatible` становится `False` (строки 599-619).

**Anthropic, strict**: `providers/anthropic.py:179-220` делегирует `transform_schema` из SDK anthropic 1.6.0
(`anthropic/lib/_parse/_transform.py:54`). Любой неизвестный ему ключ уходит в `description` как `{k: v}`:
`maximum`, `minimum`, `maxLength`, `maxItems`, `pattern`, `default`, `minItems` кроме 0 и 1
(`_transform.py:110-111, 139-140, 151-157, 163-172`). Необязательные поля выпадают из `required` и считаются в лимит
Anthropic на 24 необязательных поля.

Перехваченная схема `ToolOutput(Pick, strict=True)` (`probe_profiles.py`):

| Поле модели | OpenAI strict | Anthropic strict |
|---|---|---|
| `reasoning: str`, `maxLength=500` | `{type: string, description: 'maxLength=500'}` | `maxLength` в `description` (по коду `_transform.py`) |
| `choice: int`, `minimum=0`, `maximum=49` | `{maximum: 49, minimum: 0, type: integer}` | `description: '{maximum: 49, minimum: 0}'` |
| `tags: list[str]`, `maxItems=3` | `{maxItems: 3}` | `description: '{maxItems: 3}'` |
| `note: str \| None = None` | добавлено в `required`, `anyOf` с `null` сохранён | `description: '{default: None}'`, в `required` нет |

При `strict=None` флаг на проводе не выключен, а равен `schema_transformer.is_strict_compatible`
(`models/__init__.py`, функции `_customize_tool_def` и `_customize_output_object`). Профили OpenAI (Chat, Responses,
OpenRouter) отправляют `strict: true` сами, если в схеме нет strict-несовместимых ключей, и не отправляют, если такие ключи
есть (несовместимой схему делают также `default`, `oneOf` и необязательные свойства). В схеме пробы был `maxLength`,
поэтому без явного `strict=True` флаг не уходил. У Anthropic и Bedrock трансформер
ставит `is_strict_compatible = self.strict is True` (`providers/anthropic.py` и `providers/bedrock.py`), то есть `None`
означает «не strict». Тела запросов по провайдерам и режимам — [research/py-spec-as-code.md](py-spec-as-code.md) §13.2,
механизм по исходнику — там же, §13.3. Решение от этого не меняется: strict задаётся явно в каждом профиле модели
([ADR-0029](../adr/0029-trust-and-quality-python.md)). Границы надёжно держит только проверка Pydantic на приёме. По
коду, без запуска: в строгом режиме OpenAI ненулевое поле со значением по умолчанию становится обязательным без `null`
(открытый вопрос 10).

### 1.8. Порядок цепочки

Документы, которые переписывает ADR-0029, дают три разных порядка:

| Источник | Снаружи внутрь | Ключевой довод |
|---|---|---|
| [ADR-0003](../adr/0003-model-middleware.md) «Порядок middleware», строки 28-44 | `telemetry-provenance` → `pii-redaction` → `request-normalization` → `cassette` → `budget` → `retry-backoff` | PII выше кассеты; кассета выше бюджета, иначе реплей платный; ретрай ниже кассеты |
| [11. Провайдеры](../11-providers.md) §2.2, строки 180-193; §7.3, строка 656 | `telemetry` → `budget` → `cassette` → `pii` → `defaultSettings` | бюджет выше кассеты, «отказ одинаков в live и replay»; PII ниже кассеты; «`budgetMiddleware` стоит выше кассеты» |
| [10. Рантайм](../10-runtime.md) §5, строки 450-455 | `cassette` → `budget` → `rateLimit` → `piiRedaction` | PII последним перед провайдером; телеметрии в цепочке нет |

Порядок, принятый в [ADR-0029](../adr/0029-trust-and-quality-python.md) §1, и что его подтверждает:

| Слой | Где живёт | Почему здесь | Проверено |
|---|---|---|---|
| Instrumentation | capability агента, внешний спан `chat <model>` | видит вызов целиком; обёртки дописывают атрибуты в текущий спан | `probe_span.py` |
| `OutcomeGateModel` | 1-я обёртка | исход определяется до разбора и повтора; стоит над кассетой, поэтому реплей записанного обрезанного ответа снова даёт `TruncatedOutput` (обязанность 3 ADR-0005) | гейт — да; реплей обрезанного — вывод (открытый вопрос 4) |
| `RedactingModel` | 2-я | ключ кассеты и провод не видят сырых PII | `probe_pii.py` |
| `CassetteModel` | 3-я | нейтральные параметры, `count_tokens`, бесплатный реплей | `probe_cassette.py`, `probe_tokens.py` |
| Лимитер | 4-я: `ConcurrencyLimitedModel` или свой RPM/TPM | реплей не занимает слотов | `ConcurrencyLimitedModel` — да; свой RPM/TPM — нет |
| Обёртка backoff | 5-я, в ADR-0029 — `BackoffModel` между лимитером и моделью провайдера; ровно один слой транспортного ретрая | ниже кассеты: N попыток дают одну запись | нет: в цепочке не запускалась (открытый вопрос 8) |
| Модель провайдера | внутренняя, SDK `max_retries=0` | скрытые ретраи SDK выключены | `max_retries=0` — да (`probe_retries.py`) |
| Шаг DBOS | у `DBOSAgent` — `DBOSModel` снаружи цепочки, один шаг DBOS; у `DBOSDurability` — не проверено | `DBOSAgent` оборачивает `agent.model`; `DBOSAgent` устарел в 2.43.0, замена — capability `DBOSDurability` при `agent.run()` внутри своего `@DBOS.workflow` ([research/py-stack-runtime.md](py-stack-runtime.md) §3.1, §5.2) | для `DBOSAgent` — вывод по коду; `DBOSDurability` запускалась только в пробе согласования тулов с `FunctionModel` ([research/py-stack-runtime.md](py-stack-runtime.md) §5.5), вместе с цепочкой гарантий — нет; взаимодействие ретраев шага DBOS с исключениями гейта не проверено (открытый вопрос 3) |

На уровне агента: `UsageLimits` с общим `RunUsage`; `retries={'output': k}` работает только на исходе `ok`, потому что
гейт отсекает обрезку и отказ раньше; `ToolOutput(strict=True)`; `output_validator` + `ModelRetry` для allowed-set
(ADR-0006); `profile=` из каталога (ADR-0004); `include_content=False` в режиме PII.

Противоречие 0003 и 11 §2.2 про бюджет снимается без места для бюджета в цепочке (вывод из замеров §1.2): счётчик
`requests` растёт на реплее, поэтому отказ по `request_limit` одинаков в live и replay, а стоимость на реплее нулевая,
поэтому реплей бесплатен.

Цепочка целиком (`probe_chain.py`): `OutcomeGateModel(RedactingModel(CassetteModel(ConcurrencyLimitedModel(OpenAIChatModel(openai_client=AsyncOpenAI(max_retries=0, http_client=httpx2-мок), profile=ModelProfile(json_schema_transformer=AqvenAnthropicStrict)), limiter=4))))`
с `ToolOutput(Doc, strict=True)`, общим `RunUsage` и `UsageLimits`.

| Режим | Выход | HTTP | Сырой email на проводе | Стоимость в ledger |
|---|---|---|---|---|
| `replay_lenient` (запись) | `{"id": "d1"}` | 1 | нет | 0.0045 |
| `replay_strict` | `{"id": "d1"}` | 0 | нет | 0.0045, не изменилась |
| живой ответ с `finish_reason=length` | `truncated: finish_reason=length max_tokens=16` | 1 | — | — |

```python
def openai_chat_model(entry: CatalogEntry, http_client: httpx2.AsyncClient) -> OpenAIChatModel:
    client = AsyncOpenAI(api_key=entry.api_key, max_retries=0, http_client=http_client)
    profile = ModelProfile(json_schema_transformer=entry.schema_transformer)
    return OpenAIChatModel(entry.model_name, provider=OpenAIProvider(openai_client=client), profile=profile)


def build_model(entry: CatalogEntry, http_client: httpx2.AsyncClient, store: CassetteStore, mode: CassetteMode) -> Model:
    limited = ConcurrencyLimitedModel(openai_chat_model(entry, http_client), limiter=entry.concurrency)
    cassette = CassetteModel(limited, store=store, mode=mode, model_ref=entry.model_ref)
    return OutcomeGateModel(RedactingModel(cassette))
```

Фабрика (Factory) — единственное место, где собирается цепочка Decorator-обёрток. Сниппет повторяет цепочку пробы, в
которой слоя backoff не было; в цепочке ADR-0029 `BackoffModel` стоит между лимитером и моделью провайдера:
`ConcurrencyLimitedModel(BackoffModel(модель провайдера))` (открытый вопрос 8).

## 2. Трассы

### 2.1. `InstrumentationSettings` формата 5

`InstrumentationSettings(tracer_provider, meter_provider, include_binary_content=True, include_content=True,
include_model_request_parameters=True, version=5, use_aggregated_usage_attribute_names=True)`
(`pydantic_ai/models/instrumented.py:63-165`).

| Факт | Источник |
|---|---|
| `event_mode` и `logger_provider` удалены вместе с форматом v1 в PR #5523 (слит 2026-05-19); поиск по пакету — ноль совпадений | https://github.com/pydantic/pydantic-ai/pull/5523 |
| Формат по умолчанию 5; форматы 2, 3, 4 дают `PydanticAIDeprecationWarning`; 6 — по явному выбору | `_instrumentation.py:33` `DEFAULT_INSTRUMENTATION_VERSION = 5` |
| Включение: `Agent.instrument_all(settings)` или `capabilities=[Instrumentation(settings=...)]`; scope `pydantic-ai` | `agent/__init__.py:1120` |
| OTel без Logfire, свой `TracerProvider`, исключение промтов и ответов | https://pydantic.dev/docs/ai/integrations/logfire/ |

Спаны одного прогона `FunctionModel` с одним вызовом инструмента и структурированным выходом (`probe_tracing.py`, 4 спана,
один `trace_id`):

| Спан | Атрибуты |
|---|---|
| `invoke_agent extract_event` (корень) | `model_name`, `agent_name`, `gen_ai.agent.name`, `gen_ai.agent.call.id`, `gen_ai.conversation.id`, `gen_ai.operation.name=invoke_agent`, `logfire.msg`, `final_result`, `gen_ai.aggregated_usage.input_tokens=111`, `output_tokens=18`, `pydantic_ai.all_messages`, `gen_ai.system_instructions`, `metadata` (JSON метаданных агента, например `{"aqven.run_id":"run_01","aqven.node_id":"extract"}`), `logfire.json_schema` |
| `chat fake-extractor` (×2) | `gen_ai.operation.name=chat`, `gen_ai.provider.name`, `gen_ai.system`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.agent.*`, `gen_ai.conversation.id`, `model_request_parameters`, `gen_ai.tool.definitions`, `gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` |
| `execute_tool lookup_calendar` | `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`, `logfire.msg` |

Отдельного спана для выходного инструмента `final_result` нет.

### 2.2. Экспорт в Langfuse простым OTLP

| Параметр | Значение | Источник |
|---|---|---|
| Endpoint | `<base>/api/public/otel`, трассы — `/api/public/otel/v1/traces` | https://langfuse.com/integrations/native/opentelemetry (2026-09-16) |
| Протокол | OTLP/HTTP, JSON или protobuf; gRPC не поддерживается | там же |
| Аутентификация | `Authorization: Basic base64(pk:sk)` | там же |
| Заголовок | `x-langfuse-ingestion-version: 4`; без него данные «can be delayed by up to 10 minutes» | там же |
| Self-hosted | Langfuse ≥ 3.22.0 | там же |
| Экспортёр | `opentelemetry-exporter-otlp-proto-http` 1.44.0 (Apache-2.0, 2026-07-16), требует `requests~=2.7` | PyPI JSON |

Замер (`probe_langfuse.py`): `OTLPSpanExporter` 1.44.0 отправил `application/x-protobuf` на `/api/public/otel/v1/traces`
с обоими заголовками, `user_agent 'OTel-OTLP-Exporter-Python/1.44.0'`; в protobuf три спана: `chat` и `invoke_agent`
от pydantic-ai и наш спан узла `aqven`. `requests` — транзитивная зависимость, наш код его не импортирует (ADR-0025 §5).

```python
provider = TracerProvider(span_limits=SpanLimits(max_span_attribute_length=8192, max_attributes=128))
auth = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
exporter = OTLPSpanExporter(
    endpoint=f"{langfuse_base_url}/api/public/otel/v1/traces",
    headers={"Authorization": f"Basic {auth}", "x-langfuse-ingestion-version": "4"},
)
provider.add_span_processor(BatchSpanProcessor(exporter))
provider.add_span_processor(checkpoint_span_processor)
Agent.instrument_all(InstrumentationSettings(tracer_provider=provider, include_content=True, include_binary_content=False, version=5))
```

Лимиты спанов OTel Python (замена `attributeValueLengthLimit`): `SpanLimits(max_span_attribute_length=8192,
max_attributes=128)` молча режет атрибут на 200 000 символов до 8192; при числе атрибутов больше 128 SDK молча вытесняет
**самые старые** (`dropped_attributes=74`, `opentelemetry/attributes/__init__.py:316-319`, `popitem(last=False)`).
В пробе так вытеснился `aqven.schema_version`, выставленный при старте спана: фильтр экспорта по этому атрибуту
выбросил бы спан (открытый вопрос 12).

### 2.3. Python SDK langfuse 4.15.3 — почему не берём

| Факт | Источник |
|---|---|
| Публичный путь: `Langfuse(public_key, secret_key, base_url, tracer_provider=..., should_export_span=..., mask_otel_spans=..., additional_headers=..., span_exporter=...)` вешает `LangfuseSpanProcessor` на наш провайдер; сам класс в приватном `langfuse._client.span_processor`, не в `__all__` | `langfuse/__init__.py:100`, `_client/span_processor.py:67-136`, `_client/client.py:255-271, 313-337` |
| Фильтр по умолчанию `is_langfuse_span or is_genai_span or is_known_llm_instrumentor`; префиксы scope включают `pydantic-ai`; наши спаны `aqven` выбрасываются без своего `should_export_span` | `_client/span_filter.py:11-49, 104-108` |
| `should_export_span` получает `ReadableSpan` (в TS — `{otelSpan}`) | там же |
| `x-langfuse-ingestion-version` по умолчанию не добавляется, только через `additional_headers`; клиент отправил ровно один POST (экспорт OTLP) | `span_processor.py:108-124`; `probe_langfuse_client.py` |
| Требует `httpx<1.0,>=0.15.4` (encode httpx), импортирует его в `client.py`, `api/`, media, `_utils/request` | `pip show httpx` → `Required-by: langfuse` |
| `on_start` вызывает `span.set_attributes(propagated_attributes)` и ставит `langfuse.internal.is_app_root`: другие процессоры на том же провайдере видят `langfuse.trace.metadata.*`, `langfuse.trace.name`, `langfuse.trace.tags`, `langfuse.version`, `session.id`, `user.id`; при двух процессорах корнем приложения помечены и спан `aqven`, и `invoke_agent` | `span_processor.py` `on_start` (~145-178); `out_langfuse.json` |

Мутация спанов нарушает обязанность 8 [ADR-0012](../adr/0012-langfuse-as-store.md) («никогда не мутировать
`span.attributes` внутри процессора»). Её можно соблюсти, если атрибуты Langfuse пишет наша фабрика атрибутов, а экспорт
идёт простым OTLP (ADR-0029).

Граница OSS/EE Langfuse перепроверена: «All core Langfuse features and APIs are available in Langfuse OSS (MIT licensed)
without any limits»; в EE те же 9 пунктов: Project-level RBAC Roles, Protected Prompt Labels, Data Retention Policies,
Audit Logs, Server-Side Data Masking, UI Customization, Organization Creators, Org Management API and SCIM, Instance
Management API (https://langfuse.com/self-hosting/license-key). Совпадает с ADR-0012. Страница интеграции Pydantic AI
использует `Agent.instrument_all()` вместе с `get_client()` из SDK (https://langfuse.com/integrations/frameworks/pydantic-ai).

### 2.4. Logfire 5.1.0

| Факт | Источник |
|---|---|
| SDK — MIT (PyPI `license_expression` MIT, 2026-09-11; GitHub pydantic/logfire MIT, 4476 звёзд) | PyPI JSON |
| «the server application for recording and displaying data is closed source»; «The Logfire platform (the UI and backend) is closed source. You can self-host it by purchasing an enterprise license» | https://github.com/pydantic/logfire README, строки 28 и 115-119 |
| SDK работает как помощник настройки OTel: `logfire.configure(send_to_logfire=False, console=False, additional_span_processors=[...])` + `logfire.instrument_pydantic_ai()` дали спаны `pydantic-ai:chat fake`, `pydantic-ai:invoke_agent greeter` локально без сети | `probe_logfire.py` |
| Пинит `opentelemetry-sdk` и `opentelemetry-exporter-otlp-proto-http` `<1.45.0`, тянет `protobuf`, `rich`, `executing` | PyPI `requires_dist` |

Платформу Logfire не берём (ADR-0029); SDK как помощник настройки не нужен: `InstrumentationSettings` на своём провайдере
закрывает то же (вывод из `probe_tracing.py` и `probe_logfire.py`).

## 3. Канонизация и хеш

### 3.1. RFC 8785 в Python

| Пакет | Версия | Лицензия | Релиз | Состояние | Эталонные данные (6) | Вектора float (24) | Против `canonicalize@5.0.0` |
|---|---|---|---|---|---|---|---|
| `rfc8785` (Trail of Bits) | 0.1.4 | Apache-2.0 | 2024-09-27 | чистый Python, 254 строки в `_impl.py`, без зависимостей, Python ≥ 3.8; 12 звёзд, не в архиве, коммиты — dependabot и правка доков 2026-07-29 | 6/6 | 24 | 0 расхождений |
| `jcs` | 0.2.1 | Apache-2.0 | 2022-04-10 | 5 звёзд, последний push 2022 — заброшен | 6/6 | 24 | 0 расхождений |
| `canonicaljson` | 2.0.0 | Apache-2.0 | 2023-03-15 | это канонический JSON Matrix, не RFC 8785 | 4/6 (падают structures, weird) | 14 | 3 373 и 1 363 расхождения |

Сравнение с `canonicalize@5.0.0` под Node 20.19.0: 200 000 случайных битовых шаблонов IEEE-754, 50 000 равномерных
double и 5 000 случайных деревьев с ключами вне BMP и на иврите. Эталонные данные — вектора cyberphone/json-canonicalization
(`test/README.md` в sdist). Полный файл ES6 на 100 млн чисел не прогонялся (открытый вопрос 13).

Граничные случаи `rfc8785` (`_impl.py:23-24, 104-105, 232-235`):

| Вход | Поведение | Что делаем |
|---|---|---|
| `-0.0` | молча становится `0` | отклоняем сами до канонизации (`E_CANON_NEGATIVE_ZERO`) |
| `NaN`, `inf` | `FloatDomainError` | — |
| `2**53` | `IntegerDomainError` (безопасный диапазон ±(2^53−1)) | — |
| не-строковые ключи, `set`, одиночные суррогаты | `CanonicalizationError` | — |
| порядок ключей | по UTF-16BE | совпадает с JCS |
| дубли ключей в `json.loads` | молча остаётся последний | `object_pairs_hook`, отклоняющий дубли |

### 3.2. Хеш с доменной сепарацией и Merkle

`hash_of` = `sha256-` + sha256(domain ‖ 0x00 ‖ `rfc8785.dumps(value)`) на stdlib `hashlib` вместо `@noble/hashes`.
Merkle-корень по формуле [18. Экспорт](../18-export-and-conformance.md) §2 «Merkle-корень»: лист = sha256(0x00 ‖ path ‖
0x00 ‖ bytes), листья по порядку UTF-16 code units, узел = sha256(0x01 ‖ l ‖ r), нечётный остаток поднимается как есть,
пустое множество — sha256(0x02). В 18 корень описан для манифеста бандла; после отмены экспорта его применение не решено
(открытый вопрос 23), факт сохранён справочно.

Замер (`probe_hash.py`): 4 значения в 4 доменах и 4 дерева файлов (0, 1, 3, 7 файлов) дали байт в байт тот же результат,
что версия на Node (`canonicalize@5.0.0` + `node:crypto`). Одно содержимое в доменах `spec/v1` и `node-body/v1` даёт разные
хеши.

```python
def hash_of(domain: HashDomain, value: JsonValue) -> str:
    reject_negative_zero(value)
    return "sha256-" + hashlib.sha256(domain.encode() + b"\x00" + rfc8785.dumps(value)).hexdigest()


def merkle_root(files: Mapping[str, bytes]) -> str:
    ordered = sorted(files, key=lambda path: path.encode("utf-16-be"))
    level = [hashlib.sha256(b"\x00" + path.encode() + b"\x00" + files[path]).digest() for path in ordered]
    if not level:
        return "sha256-" + hashlib.sha256(b"\x02").hexdigest()
    while len(level) > 1:
        paired = [hashlib.sha256(b"\x01" + level[i] + level[i + 1]).digest() for i in range(0, len(level) - 1, 2)]
        level = paired + level[len(paired) * 2:]
    return "sha256-" + level[0].hex()
```

Ключ кассеты в пробе §1.2 считался не через `rfc8785`: проба сохраняла порядок `properties`, а RFC 8785 сортирует все
ключи объектов. Порядок полей типа значим для структурированного вывода ([04. IR](../04-ir-schema.md) §6.5), поэтому
его нельзя отдавать сортировке (открытый вопрос 6).

### 3.3. Детерминированный tar — справочно

Экспорт отменён решением владельца от 2026-09-16 («Экспорт не нужен, у нас будут HTTP-вызовы»), решение записано в
[ADR-0025](../adr/0025-python-engine.md) §7. Интеграция — вызовы воркфлоу по HTTP и MCP, артефакт сборки — wheel + IR,
бандл-tar не нужен. Факты сохранены на случай возврата темы.

| Факт (`probe_tar.py`) | Значение |
|---|---|
| Рецепт | отсортированные записи, `TarInfo(mtime=0, mode=0o644, uid=gid=0, uname=gname='', REGTYPE)`, байты из памяти, а не `tar.add` |
| Стабильность | две сборки в разных процессах при разных mtime, chmod, umask 022/077, TZ UTC/Asia/Tokyo — одинаковый sha256 для USTAR, PAX, GNU и gzip(`mtime=0`, `filename=''`); наивный `tar.add(dir)` различался |
| USTAR и PAX | для ASCII-имён байты совпадают; USTAR падает `ValueError: name is too long` при basename > 100 байт, пути до 255 байт делит на prefix+name |
| Против `tar-stream@3.2.1` | байты не совпадают: числовые поля `'0000644\0'` против `'000644 \0'`, Python добивает до `RECORDSIZE` 10240 (7168 байт у tar-stream) — sha256 tar привязан к инструменту, переносим только Merkle root |
| Распаковка | `extractall(dest, filter='data')` бросил `OutsideDestinationError` на `../escape.txt`, но уже после записи `ok.txt` — распаковывать только во временный каталог |

## 4. Git

| Библиотека | Версия, лицензия, релиз | Без бинарника git | CAS ссылки | Трейлеры с повтором ключа | Итог |
|---|---|---|---|---|---|
| `dulwich` | 1.2.15; `Apache-2.0 OR GPL-2.0-or-later` (COPYING разрешает любую, Apache-2.0 без копилефта); 2026-09-14, 6 релизов с 2026-07-07; jelmer/dulwich 2281 звезда; колёса CPython 3.10–3.15 + `py3-none-any` | да, все шаги при `PATH=''` | `refs.set_if_equals(name, old, new)`: lock-файл через `O_EXCL`, повторное чтение ссылки под блокировкой (`refs.py:1260-1266`, `file.py:351`) | `trailers.parse_trailers` сохраняет оба значения `Aqven-Revert-Of` | берём за `GitPort` вместо isomorphic-git из ADR-0017 (ADR-0025) |
| `pygit2` | 1.20.1; «GPLv2 with linking exception»; 2026-09-12; Python ≥ 3.11; в колесе libgit2 1.9.7, libssh2, libcrypto; 1727 звёзд | да | `repo.transaction()`: `lock_ref` + `set_target` | `Commit.message_trailers` — dict, остаётся последнее | запасная быстрая реализация, если замеры оправдают |
| `GitPython` | 3.1.62; BSD-3-Clause; 2026-09-07; README: «This project is in maintenance mode», «needs the git executable» | нет: `GitCommandNotFound` на `git init`, `index.add`, `index.commit`, `iter_commits(paths)` | нет | `trailers_list` вызывает `git interpret-trailers` | отвергнут |

Сценарий `probe_git.py`: коммит с автором `Кирилл <human@example.com>` и коммиттером `aqven-engine <engine@aqven.local>`
и трейлерами; коммит агента с 5 трейлерами, включая не-ASCII `On-Behalf-Of`; устаревший CAS на `refs/heads/main`; лог по
пути, чтение blob на коммите, откат вперёд с `Aqven-Revert-Of`. SHA коммитов у всех трёх библиотек равны оракулу git CLI
(`637f4018…`); устаревший CAS вернул `None`; `git fsck --strict` чист, кроме висячего коммита от отклонённого CAS;
`%an`/`%cn` и разбор трейлеров в `git log` верны. API dulwich: `repo.py:1230` `get_walker(paths=...)`,
`trailers.py:98, 287`, `porcelain/__init__.py:8032` `revert(author, committer)`, `reftable.py:843`
`ReftableRefsContainer` (относится к вопросу reftable в [истории на git](../files-first/history.md)).

Ловушка индекса: после коммита на уровне объектов и CAS без обновления записей индекса `git status` показывает
`D  flows/f.yaml` и `?? flows/`; обновление через `index_entry_from_stat` + `index.write()` оставляет статус чистым.

```python
def commit_files(repo: Repo, root: Path, files: Mapping[str, bytes], head: bytes, episode: Episode) -> bytes:
    store = repo.object_store
    blobs = {path.encode(): Blob.from_string(content) for path, content in files.items()}
    for blob in blobs.values():
        store.add_object(blob)
    base = {entry.path: (entry.sha, entry.mode) for entry in store.iter_tree_contents(store[head].tree)}
    merged = base | {path: (blob.id, 0o100644) for path, blob in blobs.items()}
    commit = Commit()
    commit.tree = commit_tree(store, [(path, sha, mode) for path, (sha, mode) in sorted(merged.items())])
    commit.parents = [head]
    commit.author = episode.author
    commit.committer = episode.committer
    commit.author_time = commit.commit_time = episode.when
    commit.author_timezone = commit.commit_timezone = 0
    commit.message = episode.message
    store.add_object(commit)
    if not repo.refs.set_if_equals(b"refs/heads/main", head, commit.id, message=b"aqven episode"):
        raise StaleRef(head)
    index = repo.open_index()
    for path, blob in blobs.items():
        index[path] = index_entry_from_stat(os.lstat(root / path.decode()), blob.id)
    index.write()
    return commit.id
```

`GitPort` — Port/Adapter; dulwich — первая реализация.

Наблюдение за файлами для `aqven dev`: `watchfiles` 1.2.0 (MIT, 2026-05-18, бэкенд Rust `notify`, одна зависимость `anyio`,
колёса CPython 3.10–3.15; samuelcolvin/watchfiles 2533 звезды, push 2026-09-03). `awatch` по умолчанию: `debounce=1600` мс,
`step=50` мс, `recursive=True`, `poll_delay_ms=300`. `DefaultFilter` игнорирует `__pycache__`, `.git`, `.venv`,
`node_modules` и др., но не `.aqven/`; подкласс, ограниченный `*.yaml` и `*.md` без `/.aqven/`, из пачки изменений в
`.aqven/txn`, `.git` и `.swp` сообщил только `added flows/answer/flow.yaml` (`probe_watch.py`).

## 5. YAML

Матрица загрузчиков (`probe_yaml.py`; ruamel.yaml 0.19.1, PyYAML 6.0.3):

| Поведение | ruamel `typ='rt'` | ruamel `safe`/`pure` | PyYAML `SafeLoader`/`CSafeLoader` |
|---|---|---|---|
| Порядок ключей | сохраняется | сохраняется | сохраняется |
| Дубли ключей (верхний уровень и вложенные) | `DuplicateKeyError` (`allow_duplicate_keys=False`, `main.py:181`, `constructor.py:58`) | `DuplicateKeyError` | молча последнее значение |
| Якоря, алиасы, `<<` | принимаются и разворачиваются | принимаются и разворачиваются | принимаются и разворачиваются |
| Комментарии | хранятся на узлах (`ca`), `scan()` отдаёт `CommentToken` | молча теряются | теряются, обнаружить нельзя |
| `!!python/object/apply:os.system ['echo hi']` | молча загружается как список, тег отброшен, ничего не выполняется | `ConstructorError` | `ConstructorError` |
| Директива `%YAML 1.1` | `NO` и `on` становятся булевыми | `NO` и `on` становятся булевыми | `NO` и `on` становятся булевыми |
| Два документа в файле | `ComposerError` | `ComposerError` | `ComposerError` |
| Версия по умолчанию | YAML 1.2: `on: yes` — строка, `012` → 12, `1e3` → 1000.0 | то же | YAML 1.1: ключ `on` → `True`, `NO` → `False`, `012` → 10, `1e3` — строка |
| rt load → dump | байт в байт, с комментариями и якорями | — | — |

Конвейер чтения (ADR-0025, [ADR-0026](../adr/0026-yaml-spec-and-code-refs.md)): строгий предпроход по событиям и токенам ruamel (алиасы, якоря, явные теги, директивы, больше
одного документа, комментарии) → `YAML(typ='safe', pure=True).load` → валидация Pydantic. Один `rt` запреты не обеспечит:
он молча принимает и сохраняет всё запрещённое.

```python
ViolationCheck = tuple[bool, str]


def violation(event: Event) -> str | None:
    checks: list[ViolationCheck] = [
        (isinstance(event, AliasEvent), "alias"),
        (getattr(event, "anchor", None) is not None and not isinstance(event, AliasEvent), "anchor"),
        (isinstance(event, (ScalarEvent, CollectionStartEvent)) and event.tag is not None, "explicit tag"),
        (isinstance(event, DocumentStartEvent) and (event.version is not None or bool(event.tags)), "directive"),
    ]
    return next((label for failed, label in checks if failed), None)


def reject_comments(text: str) -> None:
    for token in YAML(typ="rt").scan(io.StringIO(text)):
        if isinstance(token, CommentToken) or getattr(token, "comment", None):
            raise StrictCanonError(f"comment at line {token.start_mark.line + 1}")
```

Проверки заданы таблицей пар «условие, метка», а не лестницей условий.

Канонический писатель (`probe_yaml_writer.py`):

| Вариант | Фикспойнт | PyYAML читает те же данные | Замечание |
|---|---|---|---|
| ruamel `safe`/`pure` со своим representer: строки в двойных кавычках, ключи plain, порядок отображений сохранён, `width=2**31-1`, `indent(mapping=2, sequence=2, offset=0)` | да, за три прохода | да | выбранный вариант |
| ruamel `safe` dump по умолчанию | — | нет | **сортирует ключи**, пишет `note: yes`, `country: NO`, `- on` без кавычек — валидный YAML 1.2, но PyYAML (1.1) читает `True`/`False`/`True` |
| PyYAML `safe_dump` | с `sort_keys=False` — да | — | по умолчанию сортирует ключи; многострочные строки — странный single-quoted folded |

```python
class CanonRepresenter(SafeRepresenter):
    def represent_str(self, data: str) -> ScalarNode:
        return self.represent_scalar("tag:yaml.org,2002:str", data, style='"')

    def represent_dict(self, data: Mapping[str, object]) -> MappingNode:
        pairs = [(ScalarNode("tag:yaml.org,2002:str", key, style=None), self.represent_data(value)) for key, value in data.items()]
        return MappingNode("tag:yaml.org,2002:map", pairs, flow_style=False)


CanonRepresenter.add_representer(str, CanonRepresenter.represent_str)
CanonRepresenter.add_representer(dict, CanonRepresenter.represent_dict)
```

Риск: ruamel.yaml 0.19.1 (MIT, 2026-01-02) ведёт один мейнтейнер на SourceForge. PyYAML для файлов описания не
использовать.

## 6. Evals: pydantic-evals 2.43.0

pydantic-evals — прогонщик экспериментов, а не гейт выпуска. Поиск `bootstrap`, `pvalue`, `confidence`, `percentile`,
`stdev`, `variance` по пакету — ноль совпадений.

### 6.1. API

| Объект | Сигнатура и поля | Источник |
|---|---|---|
| `Case` | `Case(*, name=None, inputs, metadata=None, expected_output=None, evaluators=())` | `pydantic_evals/dataset.py:111-176` |
| `Dataset` | `Dataset[InputsT, OutputT, MetadataT](*, name, cases, evaluators=(), report_evaluators=())`; Pydantic-модель с `extra='forbid'`; дубль имени кейса — `ValueError: Duplicate case name: x` | `dataset.py:177-267` |
| `evaluate` | `evaluate(task, *, name=None, max_concurrency=None, progress=True, retry_task=None, retry_evaluators=None, task_name=None, metadata=None, repeat=1, lifecycle=None) -> EvaluationReport`; `evaluate_sync` — то же синхронно | `dataset.py:281-298, 417` |
| Конкурентность | `anyio.Semaphore(max_concurrency)`; `None` — всё параллельно | `dataset.py:337` |
| Ретраи | `retry_task`, `retry_evaluators` принимают `pydantic_ai.retries.RetryConfig`, нужен `tenacity` | `dataset.py:281-298` |
| Повторы | `repeat > 1` переименовывает кейсы в `'<name> [i/R]'`, ставит `source_case_name`; задача вызывается как `task(case.inputs)`, `lifecycle(case)` без индекса повтора; слова `seed` в `dataset.py` нет | `dataset.py:269-279, 979` |
| Выход оценщика | `EvaluatorOutput = EvaluationScalar \| EvaluationReason \| Mapping[str, scalar \| EvaluationReason]`: `bool` → assertion, `int`/конечный `float` → score, `str` → label; `EvaluationReason(value, reason=None)` | `evaluators/evaluator.py:27-81, 103-118` |
| Результаты | `EvaluationResult(name, value, reason, source, evaluator_version)`; `EvaluatorFailure(name, error_message, error_stacktrace, source, evaluator_version, error_type)`; `get_evaluator_version()` | `evaluator.py:132-252` |
| `EvaluatorContext` | `name, inputs, metadata, expected_output, output, duration, attributes, metrics, span_tree`; в задаче — `set_eval_attribute`, `increment_eval_metric` | `evaluators/context.py:30-103`; `dataset.py:1263, 1275` |
| Встроенные | `Equals`, `EqualsExpected`, `Contains`, `IsInstance`, `MaxDuration`, `LLMJudge`, `GEval`, `HasMatchingSpan`; агентные `ToolCorrectness`, `TrajectoryMatch`, `ArgumentCorrectness`, `MaxToolCalls`, `MaxModelRequests`; уровня отчёта `ConfusionMatrixEvaluator`, `PrecisionRecallEvaluator`, `ROCAUCEvaluator`, `KolmogorovSmirnovEvaluator` | `evaluators/__init__.py:1-68` |
| Отчёт | `ReportCase`: `name, inputs, metadata, expected_output, output, metrics, attributes, scores, labels, assertions, task_duration, total_duration, source_case_name, trace_id, span_id, evaluator_failures`; `ReportCaseFailure` с `error_message`, `error_stacktrace`; `EvaluationReport`: `name, cases, failures, analyses, report_evaluator_failures, experiment_metadata, trace_id, span_id`; `case_groups()` → `ReportCaseAggregate` только со средними; `EvaluationReportAdapter`, `ReportCaseAdapter` — JSON | `reporting/__init__.py:86-394, 726` |
| Сравнение с базой | `render(baseline=...)` парует кейсы по `case.name` (с суффиксом `[i/R]`), показывает дельты и средние, например `judge_score: 0.500 -> 0.800 (+0.3 / +60.0%)`, `assertions 66.7% -> 96.7%`; ни CI, ни p, ни решения | `reporting/__init__.py:1558-1626` |
| Онлайн-оценка | capability `OnlineEvaluation`, `OnlineEvalConfig(default_sink, default_sample_rate, emit_otel_events=True, include_baggage, sampling_mode 'independent'/'correlated', enabled, metadata)`, события `gen_ai.evaluation.result`; не запускалась | `online.py:416-470`, `online_capability.py:52-82`, `_online.py:207-260` |

Без настроенного logfire `trace_id` и `span_id` в отчёте — `None`.

### 6.2. Судьи

`LLMJudge(rubric, model=None, include_input=False, include_expected_output=False, model_settings=None,
score: OutputConfig | False = False, assertion: OutputConfig | False = OutputConfig(include_reason=True))`, выход судьи —
`GradingOutput(reason, pass, score: float)`: `reason` идёт до оценки (согласуется с R-J3), у `score` нет границ.
**Модель судьи по умолчанию — `'openai:gpt-5.2'`** (`llm_as_a_judge.py:26`), меняется `set_default_judge_model`
(`:220-226`): YAML-датасет с `LLMJudge` без `model` пойдёт в OpenAI. `GEval(criteria, evaluation_steps, score_range=(1, 5),
include_input=False, model, model_settings, evaluation_name)` возвращает целое и бросает исключение вне диапазона
(`common.py:287-338`, `llm_as_a_judge.py:355-377`). Панелей, перестановки позиций, слепых меток, test-retest и калибровки
нет ни у одного.

### 6.3. Молчаливый сбой оценщика

`to_file` пишет экземпляр модели судьи строкой (`model: function:fake-judge`, `common.py:283-284`). После `from_file` и
`evaluate` сбой `UserError: Unknown model: function:fake-judge` уходит в `ReportCase.evaluator_failures`; кейс считается
успешным, число `failures` — 0, оценка и assertion судьи просто исчезают (`yaml_roundtrip.py`). Сбой самой задачи
становится `ReportCaseFailure`.

Правило (ADR-0029): и сбой оценщика, и сбой задачи — выпавший кейс; выпавшие кейсы идут в правило 5%, превышение даёт
`GATE_UNAVAILABLE`. Там же: LLM-судья — наш тип оценщика с моделью из каталога, `LLMJudge` без явной модели запрещён
(не запускалось, открытый вопрос 17).

Похожая молчаливая ловушка: `ConfusionMatrixEvaluator(expected_from='metadata', ...)` читает только `dict`-метаданные;
с метаданными-моделью Pydantic пропускает все кейсы и возвращает пустую матрицу (`report_common.py:155`).

### 6.4. Оценка по спанам

Дерево спанов записывается, только если импортируется `opentelemetry-sdk` и задан `TracerProvider`; logfire не нужен.
pydantic-evals зависит только от `logfire-api`, поэтому `opentelemetry-sdk` добавляется явно, иначе `ctx.span_tree`
бросает `SpanTreeRecordingError` (`otel/_context_subtree.py:13-33`, `otel/_context_in_memory_span_exporter.py:11-12`,
`otel/_errors.py:6-13`). С `trace.set_tracer_provider(TracerProvider())` и `Agent.instrument_all(True)`
`HasMatchingSpan(query={'name_contains': 'chat', 'has_attribute_keys': ['gen_ai.request.model']})` прошёл; метрики
извлечены автоматически: `{'requests': 1, 'input_tokens': 55, 'output_tokens': 6}`; стоимость появляется, только если
спаны несут `operation.cost`. `SpanQuery`: имя, атрибуты, статус, длительность, `not`/`and`/`or`, условия на
child/descendant/ancestor (`otel/span_tree.py:29-88`).

### 6.5. Файлы датасетов

`Dataset.to_file(path, fmt=None, schema_path='./{stem}_schema.json', custom_evaluator_types=(), custom_report_evaluator_types=())`
(`dataset.py:79, 81, 747-795`): `{stem}` — основа имени выходного файла, а не имя датасета (`dataset.py:773-776`).
Файл начинается строкой-комментарием `# yaml-language-server: $schema=tickets_schema.json`; схема содержит `name`, `cases`,
`evaluators`, `report_evaluators`, `$schema` и 52 `$defs`. Оценщики сериализуются кратко (`- EqualsExpected`,
`- MaxDuration: 5.0`). `from_file`, `from_text`, `from_dict` валидируют через `_DatasetModel` с `extra='forbid'`: лишний
ключ и неверный тип входа дают `ValidationError`, входы восстанавливаются моделями Pydantic (`dataset.py:557-666`).
`model_json_schema_with_evaluators()` возвращает ту же схему без записи файла. Комментарий в заголовке файла
конфликтует со строгим предпроходом YAML §5, поэтому схему для редактора берём из `model_json_schema_with_evaluators()`,
а с файлами датасетов её связывает не modeline-комментарий, а настройка `yaml.schemas` по глобам, которую пишет
инструментарий aqven ([ADR-0026](../adr/0026-yaml-spec-and-code-refs.md), [ADR-0029](../adr/0029-trust-and-quality-python.md));
этот путь не запускался (открытый вопрос 15).

### 6.6. Чего в pydantic-evals нет из [13. Evals](../13-evals-and-gates.md) — наш код

1. Версии датасета и `content_hash`, неизменяемые версии, стабильный `item_key` как единица спаривания; pydantic-evals
   парует только по имени кейса.
2. Сплиты train/dev/test, контроль доступа оптимизатора, журнал чтения test-сплита.
3. Дедупликация (точная и близкая, SimHash/MinHash), пересечение с few-shot, маскирование PII детерминированными
   псевдонимами; `generate_dataset` — простая генерация LLM без целей покрытия и парного дизайна
   (`generation.py:33-63`).
4. Цели покрытия и пробелы.
5. Оценки по узлам: задача возвращает один выход, оценка узла требует проводки через дерево спанов или метаданные.
6. Явные сиды на каждый повтор, общие для A и B.
7. A/A-прогон, шумовой пол, ICC.
8. Вся статистика значимости, семьи тестов и поправки, минимумы выборки и дискордантных пар.
9. Четыре исхода PASS/WARN/BLOCK/GATE_UNAVAILABLE и аппрув WARN.
10. Калибровка судьи (quadratic weighted kappa ≥ 0.7, Krippendorff alpha ≥ 0.8, ≥ 100 меток, swap-стабильность ≥ 0.9,
    test-retest < 5%), панели судей из разных семейств, перестановка позиций, слепые метки, `judge_version_hash`, `stale_at`.
11. Политика сбоев: сбой оценщика молча выбрасывает оценку, сбой задачи становится `ReportCaseFailure`; оба считаются
    выпавшими кейсами или ведут к `GATE_UNAVAILABLE`.
12. Снимок провайдера и дрейф, ключи сопоставимости.
13. Бюджеты стоимости и латентности как тесты non-inferiority.
14. Неизменяемый `GateReport` с `content_hash`; `EvaluationReportAdapter` даёт только JSON-сериализацию.
15. Матрица моделей, фронт Парето, blame.
16. Зеркалирование датасетов в Postgres и Langfuse.

## 7. Статистика гейтов

Стенд: scipy 1.18.1 (BSD, 2026-08-21, Python ≥ 3.12), statsmodels 0.15.0 (BSD-3-Clause, 2026-08-27), numpy 2.5.3
(`BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0`), pandas 3.0.5 (BSD-3, зависимость statsmodels), scikit-learn 1.9.1
(BSD-3-Clause, 2026-09-10), nltk 3.10.3 (Apache-2.0, 2026-08-12), krippendorff 0.8.2 (GPL-3.0-or-later, 2025-11-03).

### 7.1. Вызовы и сверка с эталонами

| Процедура | Вызов | Эталон | Результат |
|---|---|---|---|
| Парный BCa | `stats.bootstrap((d,), np.mean, vectorized=True, n_resamples=10_000, method="BCa", rng=np.random.default_rng(seed))`, `d = b - a` | своя BCa на той же матрице индексов | разница 0.0 (z0 = −0.005013, a = −0.003425); повтор с тем же сидом идентичен |
| McNemar chi2 | `mcnemar([[794, 150], [86, 570]], exact=False, correction=False)` | таблица Агрести, z² = 17.36 | 17.355932, p 3.0993e-05; с поправкой Йейтса 16.817797 = ручная формула |
| McNemar exact | `mcnemar([[0, 3], [11, 0]], exact=True)` | `stats.binomtest(3, 14, 0.5)` | p 0.057373046875 совпало; без дискордантных пар p = 1.0 |
| mid-p | `stats.binomtest(3, 14, 0.5).pvalue - stats.binom.pmf(3, 14, 0.5)` | — | 0.03515625; в statsmodels нет, одна строка |
| Clopper-Pearson | `stats.binomtest(11, 14).proportion_ci(confidence_level=0.95, method="exact")` | — | (0.49202, 0.95342) |
| Wilcoxon | `stats.wilcoxon(x, y=None, zero_method=..., correction=False, alternative=..., method=...)` | пример «corn» из документации | T = 24, p = 0.041259765625; асимптотическое z Pratt совпало с ручной формулой (−0.78357; −2.30940) |
| Парный t | `stats.ttest_rel(b, a)` и `.confidence_interval()` | — | интервал сразу для mean(b − a): (−0.06505, 0.02338) при дельте −0.0208 (`_stats_py.py:6935`) |
| Holm | `multipletests([0.01, 0.02, 0.03, 0.04], method="holm")` | — | reject [T F F F], скорректированные [0.04 0.06 0.06 0.06]; метод по умолчанию `'hs'`, задавать явно (`multitest.py:99`) |
| BH | `multipletests([0.09, 0.03, 0.07, 0.06], alpha=0.10, method="fdr_bh")` | классическая ошибка пошагового правила | отклонены все четыре, хотя p = 0.03 не проходит свой порог k/m·q = 0.025; наивное правило даёт [F F T T]; `fdr_by` есть; `scipy.stats.false_discovery_control` даёт те же p без вектора reject |
| Quadratic weighted kappa | `cohens_kappa(table_5x5, wt="quadratic")`; `cohen_kappa_score(human, judge, labels=[1, 2, 3, 4, 5], weights="quadratic")` | ручная формула 1 − Σw·O/Σw·E | 0.9089529590288316 у обоих, совпадение до 1e-12; statsmodels даёт и CI (0.8411, 0.9768), и `var_kappa` (`inter_rater.py:275`) |
| Kendall tau-b | `stats.kendalltau(x, y, variant="b")` | — | 0.8481 |
| Fleiss kappa | `fleiss_kappa(aggregate_raters(data)[0], method="fleiss")` | — | 0.5158 (`inter_rater.py:197`) |
| Мощность dz | `TTestPower().solve_power(effect_size=dz, alpha=0.05, power=0.8, alternative="two-sided")` | нормальное приближение 7.85/dz² из 13 | n = 786.8 / 350.8 / 198.2 / 89.1 / 33.4 при dz 0.1 / 0.15 / 0.2 / 0.3 / 0.5 против 785 / 349 / 196 / 87 / 31 (`power.py:829`) |
| Мощность по дискордантным парам | формула документа | таблица 13 §7.5 | воспроизводится после округления вверх: 188.4→189, 79.4→80, 41.2→42, 23.5→24, 14.0→14, 4.4→5 |
| Стратифицированный бутстрап | каждая страта — отдельная выборка, `paired=False`, статистика — взвешенное среднее | — | BCa работает на нескольких выборках, CI [0.0178, 0.0653] |
| Кластерный бутстрап | бутстрап индексов кластеров, векторизованная статистика `sums[ix].sum / counts[ix].sum` | — | ширина 0.156 против 0.108 у наивного по кейсам: подтверждает довод документа, что CI по кейсам слишком узок |

Производительность: 60 тестов × B = 10 000 × n = 500 на arm64-ноутбуке — 1.59–1.69 с для среднего и 5.90–6.89 с для парной
медианы. Порог «> 30 с» из [13](../13-evals-and-gates.md) §12, вопрос 6, не достигается; для Python этот вопрос закрыт.

```python
SEED = 20260916


def paired_bca(a: NDArray[np.float64], b: NDArray[np.float64], seed: int = SEED, alternative: str = "two-sided") -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    result = stats.bootstrap((b - a,), np.mean, vectorized=True, n_resamples=10_000, method="BCa", confidence_level=0.95, alternative=alternative, rng=rng)
    return float(result.confidence_interval.low), float(result.confidence_interval.high)
```

### 7.2. Где расчёты документов ломаются на scipy 1.18.1

| Ловушка | Замер | Что делаем |
|---|---|---|
| BCa на медиане разниц рубрики (порядковые данные, много связок) | CI `(nan, nan)` с `RuntimeWarning` и `DegenerateDataWarning`: все jackknife-значения равны, ускорение 0/0; при всех равных разницах — тоже NaN | NaN CI → `GATE_UNAVAILABLE` или BCa на среднем нормированных разниц (как в прототипе гейта) |
| Wilcoxon `method='exact'` при нулях и связках | 20 пар рубрики, 8 нулей: pratt+exact p = 0.1429, pratt+asymptotic p = 0.0209, pratt+`PermutationMethod(n_resamples=10000, rng)` p = 0.0414; предупреждения нет, docstring: «method=exact no longer calculates the exact p-value» (`_morestats.py:3926-4080`) | `asymptotic` при n ≥ 200, `PermutationMethod` для малых превью; передавать массив разниц (docstring предупреждает о float-округлении при `x` и `y`) |
| Формула z0 | scipy: `ndtri((#<θ + #≤θ)/(2B))` — реплики, равные оценке, считаются наполовину (`_resampling.py:75-83, 97-166`); 13 §7.10: `count(replicates < theta_hat) / B` | golden-фикстуры по формуле документа разойдутся со scipy на дискретных метриках; эталон — scipy |
| `paired=True` с `mean(b) - mean(a)` против бутстрапа разниц | на бинарных данных (n = 240, b = 17, c = 12) float-связки: 478 против 738 реплик, равных оценке; z0 −0.0376 против −0.0050; нижняя граница −0.0667 против −0.0625 | бутстрап `d = b - a` с `np.mean` |
| Одно- или двусторонняя граница | `alternative='greater'` даёт нижнюю границу −0.0583, двусторонний 95% — −0.0625 | выбрать явно в политике (открытый вопрос 20) |
| sklearn без `labels` | оценки на {1, 2, 5}: 0.4615 вместо верных 0.3986 — веса строятся по встреченным меткам | всегда полная шкала или таблица 5×5 для statsmodels |

### 7.3. Krippendorff alpha и ICC

| Кандидат | Лицензия | Итог |
|---|---|---|
| `krippendorff` 0.8.2 (pln-fing-udelar/fast-krippendorff) | GPL-3.0-or-later (`METADATA: License-Expression`) | канонический пример 12 единиц × 4 кодировщика: 0.743421 / 0.815388 / 0.849107 / 0.797403 (опубликовано 0.743 / 0.815 / 0.849 / 0.797, nominal/ordinal/interval/ratio); пример Википедии 0.691358 / 0.810845 (nominal / interval, опубликовано 0.691 / 0.811); только оракул в dev |
| `nltk` 3.10.3 `AnnotationTask(data=[(coder, item, label)], distance=interval_distance).alpha()` | Apache-2.0 | nominal и interval совпали (0.743421, 0.849107), пропуски поддерживает, порядковой дистанции нет (`nltk/metrics/agreement.py:313`) |
| `pingouin` 0.6.1 | GPL-3.0 | не берём |
| `simpledorff` | MIT | последний релиз 2020 |
| `irrCAC` | — | пинит `scipy==1.12.0` |
| `agreement` | GPLv3+ | не берём |
| своя реализация на numpy, ~40 строк | наша | совпала с пакетом на nominal, ordinal, interval, полных и разреженных данных; судья против человека с 1/3 пропусков, ordinal: 0.8940618 |

```python
def nominal_delta(values: NDArray[np.float64], n_c: NDArray[np.float64]) -> NDArray[np.float64]:
    return 1.0 - np.eye(values.size)


def interval_delta(values: NDArray[np.float64], n_c: NDArray[np.float64]) -> NDArray[np.float64]:
    return np.subtract.outer(values, values) ** 2


def ordinal_delta(values: NDArray[np.float64], n_c: NDArray[np.float64]) -> NDArray[np.float64]:
    cumulative = np.cumsum(n_c)
    positions = np.arange(values.size)
    low = np.minimum.outer(positions, positions)
    high = np.maximum.outer(positions, positions)
    between = cumulative[high] - np.where(low > 0, cumulative[low - 1], 0.0)
    return (between - (n_c[low] + n_c[high]) / 2) ** 2


DISTANCES: Mapping[str, Callable[[NDArray[np.float64], NDArray[np.float64]], NDArray[np.float64]]] = {
    "nominal": nominal_delta,
    "interval": interval_delta,
    "ordinal": ordinal_delta,
}


def unit_coincidence(unit: NDArray[np.float64], index: Mapping[float, int], k: int) -> NDArray[np.float64]:
    present = unit[~np.isnan(unit)]
    if present.size < 2:
        return np.zeros((k, k))
    codes = np.array([index[value] for value in present])
    pairs = np.zeros((k, k))
    np.add.at(pairs, (codes[:, None], codes[None, :]), 1)
    pairs[np.arange(k), np.arange(k)] -= np.bincount(codes, minlength=k)
    return pairs / (present.size - 1)


def krippendorff_alpha(data: NDArray[np.float64], metric: str) -> float:
    values = np.unique(data[~np.isnan(data)])
    index = {value: position for position, value in enumerate(values)}
    coincidence = sum((unit_coincidence(unit, index, values.size) for unit in data.T), np.zeros((values.size, values.size)))
    n_c = coincidence.sum(axis=1)
    delta = DISTANCES[metric](values, n_c)
    observed = (coincidence * delta).sum()
    expected = (np.outer(n_c, n_c) * delta).sum() / (n_c.sum() - 1)
    return float(1 - observed / expected)
```

Дистанции — Strategy через словарь. Итоговая форма перепроверена запуском против пакета: канонический пример 0.743421 /
0.815388 / 0.849107 и случайные разреженные данные 3 × 40 с 30% пропусков, расхождение < 1e-9 на nominal, ordinal,
interval. Ratio-дистанция в своей реализации не проверялась (открытый вопрос 19). ICC: в statsmodels нет (поиск `intraclass` пуст), pingouin — GPL-3.0,
поэтому разложение шума ESTIMATE_NOISE остаётся ~8 строками numpy.

### 7.4. ADR-0015: библиотека против своего кода

| Было в [ADR-0015](../adr/0015-gate-statistics.md) (TS) | Теперь (Python) |
|---|---|
| McNemar, ~25 своих строк | `statsmodels.stats.contingency_tables.mcnemar` (`contingency_tables.py:1349-1420`) |
| Percentile и BCa бутстрап, ~100 своих строк | `scipy.stats.bootstrap` |
| Holm, BH, BY, ~40 своих строк | `statsmodels.stats.multitest.multipletests` |
| Свой xorshift | `np.random.default_rng` (PCG64) |
| Wilcoxon, exact binomial, Clopper-Pearson на @stdlib | `scipy.stats.wilcoxon`, `scipy.stats.binomtest` |
| Парный t, chi2 CDF, квантиль нормального | `scipy.stats.ttest_rel`, `scipy.stats.chi2.sf`, `scipy.special.ndtri` |
| Мощность, weighted kappa, tau-b, Fleiss — «нет нигде» | `TTestPower`, `cohens_kappa`, `kendalltau(variant='b')`, `fleiss_kappa` |
| Golden-фикстуры scipy/statsmodels в vitest, «Python не тянем» | статистика в процессе eval-воркера, scipy и statsmodels — зависимости рантайма (ADR-0029) |

Остаётся нашим кодом, тонкие обёртки: ≤ 10 строк на стратегию (выбор exact/chi2, знак эффекта, `d = b - a`), обёртки
страт и кластеров, Krippendorff alpha (~40 строк, лицензия), ICC и шум (~8 строк), mid-p (1 строка), мощность McNemar
(закрытая формула или симуляция Монте-Карло).

Остаётся нашим кодом, доменная логика: объявление семей и поправка по семье (safety без поправки), правила
superiority/non-inferiority, A/A-прогон, шумовой пол и ключ его кеша, проверка вторичных отклонений 2q, минимумы датасета
200/500 и 25 дискордантных пар, выпавшие кейсы и правило 5%, NaN CI → `GATE_UNAVAILABLE`, WARN по расхождению ширины t и
бутстрапа, WARN по мощности, уровни допуска судьи BLOCK/WARN/OFF с устареванием, цепочка четырёх исходов, неизменяемый
отчёт.

Зависимости: statsmodels 0.15.0 тянет `numpy<3`, `scipy`, `pandas`, `patsy`, `packaging`, `formulaic`; scikit-learn
добавил бы `joblib`, `threadpoolctl`, `narwhals` и не нужен. Модуль статистики не импортирует `pydantic_ai` и
`pydantic_evals`, а принимает массивы, извлечённые из отчётов (вывод по аналогии с правилом `@aqven/stats`, линтером не
проверялось).

### 7.5. Прототип гейта

`gate_core.py` — 204 строки вместе с синтетическими данными и печатью, статистика — около 30 строк вызовов библиотек.
Strategy: `TEST_BY_KIND` (тест по виду метрики) и `ADJUST_BY_FAMILY` (поправка по семье); Chain of Responsibility:
`CHAIN` охранников, первый сработавший определяет исход.

```python
TEST_BY_KIND: Mapping[MetricKind, Callable[[Series, Policy], TestResult]] = {
    "binary": binary_test,
    "ordinal": ordinal_test,
    "continuous": continuous_test,
}

ADJUST_BY_FAMILY: Mapping[Family, Callable[[NDArray[np.float64], Policy], NDArray[np.float64]]] = {
    "primary": lambda p, policy: multipletests(p, alpha=policy.alpha_primary, method="holm")[1],
    "secondary": lambda p, policy: multipletests(p, alpha=policy.q_secondary, method="fdr_bh")[1],
    "safety": lambda p, policy: p,
}

CHAIN: tuple[tuple[Guard, Outcome], ...] = (
    (dataset_too_small, "GATE_UNAVAILABLE"),
    (ci_not_computable, "GATE_UNAVAILABLE"),
    (insufficient_discordant, "GATE_UNAVAILABLE"),
    (aa_pipeline_unstable, "GATE_UNAVAILABLE"),
    (safety_regression, "BLOCK"),
    (no_improvement, "BLOCK"),
    (within_noise_floor, "BLOCK"),
    (side_regression, "WARN"),
)


def decide(rows: Sequence[TestRow], aa: Sequence[TestRow], policy: Policy) -> Decision:
    for guard, outcome in CHAIN:
        reason = guard(rows, aa, policy)
        if reason is not None:
            return Decision(outcome, reason)
    return Decision("PASS", "all_checks_passed")
```

| Сценарий | Строки тестов | Решение |
|---|---|---|
| n = 120 | — | `GATE_UNAVAILABLE('dataset_too_small:extract:120<200')` |
| n = 500, есть подъём | primary `exact_match` `mcnemar_chi2_yates` delta = +0.1000, CI95 = [+0.0660, +0.1360], p = 2.404e-07, n_disc = 90; secondary `judge_rubric` `wilcoxon_pratt_asymptotic` delta = −0.0190, p_adj = 0.01018 | `WARN('side_regression:extract:judge_rubric')` |
| n = 500, подъёма нет | primary `exact_match` delta = −0.0160, CI95 = [−0.0380, +0.0060], p = 0.2159, n_disc = 32; safety `schema_valid` `mcnemar_exact` p = 1 | `BLOCK('no_significant_improvement:exact_match')` |

## 8. GEPA

### 8.1. Пакет

| Факт | Источник |
|---|---|
| `gepa` 0.1.4, MIT, `Requires-Python <3.15,>=3.10`, обязательных зависимостей ноль | `pip show gepa`: `Requires:` пусто |
| `litellm` нужен только для extras `full` и `confidence` (`litellm<1.92,>=1.83.0`) или когда `reflection_lm` передан строкой | `METADATA`; `pip freeze` без litellm |
| Кандидат — `Candidate = dict[str, str]` | `gepa/core/adapter.py:12` |
| dspy 3.3.1 требует `gepa[dspy]==0.1.4` — тот же движок | PyPI `requires_dist` |
| В `pydantic-ai-slim` и `pydantic-evals` 2.43.0 кода GEPA нет (`grep -rn '\bgepa\b'` пуст); «интеграция» — статья-рецепт `Agent.override(instructions=...)` + `Dataset.evaluate()`, оптимизирует только instructions | https://pydantic.dev/articles/prompt-optimization-with-gepa |

### 8.2. Протокол `GEPAAdapter`

| Член | Сигнатура | Источник |
|---|---|---|
| `evaluate` | `evaluate(self, batch: list[DataInst], candidate: dict[str, str], capture_traces: bool = False) -> EvaluationBatch` | `adapter.py:130-135` |
| `make_reflective_dataset` | `make_reflective_dataset(self, candidate, eval_batch, components_to_update: list[str]) -> Mapping[str, Sequence[Mapping[str, Any]]]` | `adapter.py:170-175` |
| `propose_new_texts` | `ProposalFn \| None = None` | `adapter.py:204` |
| необязательные | `batch_evaluate(items)`, `get_adapter_state()`, `set_adapter_state()` | `adapter.py:97-109, 206-227` |
| `EvaluationBatch` | `outputs: list`, `scores: list[float]`, `trajectories: list \| None = None`, `objective_scores: list[dict[str, float]] \| None = None`, `num_metric_calls: int \| None = None` | `adapter.py:15-35` |
| контракт | приёмка на минибатче — по `sum(scores)`, на valset — по среднему; адаптер не бросает исключение из-за одного примера | `adapter.py:113-127` |

**Ловушка `propose_new_texts`.** Класс адаптера обязан объявить атрибут, например `propose_new_texts = None`. Без него
предлагатель читает `self.adapter.propose_new_texts` (`reflective_mutation.py:146, 176`), получает `AttributeError`,
а `_propose_texts_batch_safe` ловит и логирует ошибку (`:203-225`). Прогон завершается штатно без единого предложения,
бюджет потрачен, даже при `raise_on_exception=True`. Замер: `Batched reflection failed ('NoProposeAttr' object has no
attribute 'propose_new_texts'); retrying per task.`, итоговые оценки `[0.6666666666666666]`.

### 8.3. `optimize`, `optimize_anything`, reflection LM

`gepa.optimize` (`gepa/api.py:46-103`) → `GEPAResult`. Ключевые параметры: `seed_candidate`, `trainset`, `valset=None`,
`adapter=None`, `task_lm=None`, `evaluator=None`, `reflection_lm: LanguageModel | str | None`, `reflection_minibatch_size=None`,
`candidate_selection_strategy='pareto'`, `frontier_type='instance'`, `skip_perfect_score=True`, `perfect_score=1.0`,
`module_selector='round_robin'`, `use_merge=False`, `max_metric_calls=None`, `max_reflection_cost=None`,
`stop_callbacks=None`, `logger=None`, `run_dir=None`, `callbacks=None`, `cache_evaluation=False`, `seed=0`,
`raise_on_exception=True`, `val_evaluation_policy=None`, `acceptance_criterion='strict_improvement'`,
`reflection_strategy=None`, а также трекеры wandb и mlflow.

| Правило | Источник |
|---|---|
| `seed_candidate` не пустой | `api.py:199-200` |
| `valset` по умолчанию = `trainset` | `api.py:203-217` |
| либо `adapter`, либо `task_lm`, не оба | `api.py:221` |
| нужен источник рефлексии (`reflection_lm` или `reflection_strategy`), если у адаптера нет `propose_new_texts` и нет `custom_candidate_proposer` | `api.py:231-237` |
| обязателен хотя бы один из `max_metric_calls`, `max_reflection_cost`, `stop_callbacks` | `api.py:284-287` |
| минибатч по умолчанию 3 | `api.py:351` |
| `reflection_strategy` несовместим с `adapter.propose_new_texts` и `custom_candidate_proposer` | `reflective_mutation.py:100-111` |

Reflection LM — любой callable: протокол `LanguageModel.__call__(prompt: str | list[dict[str, Any]]) -> str`
(`proposer/reflective_mutation/base.py:27-28`). Строка превращается в `gepa.lm.LM`, который импортирует litellm внутри
`__call__` (`lm.py:96-97`); callable оборачивается в `TrackingLM`: токены оцениваются как символы/4, стоимость 0
(`lm.py:190-236`). `reflection_strategy` принимает любой `ReflectionLM`:
`reflect(candidate, reflective_dataset, components) -> (ReflectionProposal, next_lm)`, по умолчанию
`StatelessReflectionLM(lm)` (`reflection_lm.py:48-62, 82-178`). Шаблон рефлексии по умолчанию оборачивает текущий текст в
тройные обратные кавычки, извлекатель берёт блок и делает `.strip()` (`strategies/instruction_proposal.py:13-29, 124-151`):
пробелы по краям компонента теряются, поэтому TextUnit обрезаются. В production callable оборачивает наш агент Pydantic AI,
без litellm (ADR-0029).

Замер без litellm (`step1_variants.out`): `optimize(reflection_lm=callable)` — оценки `[0.667, 1.0]`.

`optimize_anything(seed_candidate: str | dict[str, str] | None = None, *, evaluator=None, batch_evaluator=None,
dataset=None, valset=None, objective=None, background=None, config: GEPAConfig | None = None) -> GEPAResult`
(`optimize_anything.py:1114-1124`); evaluator — `(candidate, example) -> float | (float, side_info)` (`:393-396`);
`GEPAConfig(engine=EngineConfig(run_dir, max_metric_calls, parallel=True, use_cloudpickle=True, frontier_type='hybrid', ...),
reflection=ReflectionConfig(reflection_lm='openai/gpt-5.1', ...), ...)` (`:452-517, 717-749`). С callable дал
`[0.667, 1.0]`. **Со строковой моделью по умолчанию и без litellm исключения нет**: `Batched reflection failed (No module
named 'litellm'); retrying per task.`, прогон идёт дальше без улучшений.

### 8.4. Сохранение, возобновление, бюджет, события

| Факт | Источник | Замер |
|---|---|---|
| С `run_dir` состояние пишется перед каждой итерацией и в конце: `gepa_state.bin` (pickle, схема v5), `run_log.json`, `candidates.json`, `run_log.txt`, `candidate_tree.html`, `generated_best_outputs_valset/` | `core/engine.py:742, 889`; `core/state.py:153, 306-346` | — |
| Есть `gepa_state.bin` — прогон возобновляется; файл `gepa.stop` в `run_dir` останавливает мягко | `state.py:669`; `api.py:260-261` | `Loading gepa state from run dir`, продолжение с итерации 7, счётчик 42 → 51 |
| Движок переоценивает seed на всём valset **до** загрузки состояния | `engine.py:630, 633` | 15 реальных вызовов модели при +9 учтённых |
| Pickle грузится `pickle.load` — только из доверенного каталога | `state.py:349-353` | — |
| `GEPAResult.to_dict()` сериализуется в JSON | `core/result.py:16-58, 121` | 1939 байт на 3 кандидата; через порт — 1346 байт |
| `MaxMetricCallsStopper` проверяется между итерациями — перерасход | `utils/stop_condition.py:163-173`; `engine.py:731` | `max_metric_calls=40` → 42 |
| Родитель оценивается на минибатче до проверки «уже идеален» — после 1.0 каждая итерация тратит 3 вызова | `reflective_mutation.py:306, 395-413` | — |
| `ScoreThresholdStopper(1.0)` | `stop_condition.py:64-69` | 42 → 18 вызовов метрики |
| `discovery_eval_counts` — сколько вызовов метрики ушло до находки кандидата | — | см. §8.7 |
| События `callbacks=[obj]` (duck typing, TypedDict): `on_optimization_start/end`, `on_iteration_start/end`, `on_candidate_selected`, `on_minibatch_sampled`, `on_evaluation_start/end/skipped`, `on_valset_evaluated`, `on_reflective_dataset_built`, `on_proposal_start/end`, `on_candidate_accepted/rejected`, `on_merge_*`, `on_pareto_front_updated`, `on_state_saved`, `on_budget_updated`, `on_error`; логгер — любой объект с `.log(str)` | `core/callbacks.py:51-391` | — |
| Предложение с пустым текстом не вызывает ни `on_proposal_end`, ни accept/reject | `reflective_mutation.py:472-493` | отклонения декоратор фильтра записывает сам |

Callbacks — Observer.

### 8.5. TextUnit из python-liquid 2.3.1

Литеральный текст — `liquid.builtin.content.ContentNode` (слот `text`), порождается псевдотегом `Literal`
(`liquid/builtin/content.py:13-41`). Обход: от `BoundTemplate.nodes` рекурсивно через
`node.children(RenderContext(template), include_partials=False)` (`liquid/ast.py:79-86`, `static_analysis.py:144`):
`IfNode` отдаёт consequence, alternatives, default; `CaseNode` — `MultiExpressionBlockNode` → `BlockNode`; `ForNode` —
block и default (`if_tag.py:121-131`, `case_tag.py:114-120, 276-285`, `for_tag.py:144-153`). Токен —
`(kind, value, start_index, source)` (`liquid/token.py:119-137`).

| Ловушка | Факт | Решение |
|---|---|---|
| `str(template)` не воспроизводит исходник | замер: `False` (`template.py:94`) | сборка обратно — только вклейкой по смещениям |
| Управление пробелами `{%-`, `-%}` | лексер обрезает значение content (`lex.py:201-205`) | позиция = `source.find(node.text, token.start_index)` |
| Хвостовой перевод строки — отдельный токен | `'abc\n'` → `[('content','abc',0), ('content','\n',3)]` | смежные диапазоны сливаются |
| Пробельные куски | — | исключаются, края обрезаются, раскладка заморожена |

```python
@dataclass(frozen=True, slots=True)
class TextUnit:
    unit_id: str
    start: int
    end: int
    text: str


def iter_nodes(template: BoundTemplate) -> Iterator[Node]:
    context = RenderContext(template)
    stack: list[Node] = list(reversed(template.nodes))
    while stack:
        node = stack.pop()
        yield node
        stack.extend(reversed(list(node.children(context, include_partials=False))))


def content_span(source: str, node: ContentNode) -> tuple[int, int]:
    start = source.find(node.text, node.token.start_index)
    return start, start + len(node.text)


def merge_adjacent(spans: Sequence[tuple[int, int]]) -> list[tuple[int, int]]:
    merged: list[tuple[int, int]] = []
    for start, end in spans:
        if merged and merged[-1][1] == start:
            merged[-1] = (merged[-1][0], end)
            continue
        merged.append((start, end))
    return merged


def trim(source: str, span: tuple[int, int]) -> tuple[int, int]:
    text = source[span[0]:span[1]]
    return span[0] + len(text) - len(text.lstrip()), span[1] - len(text) + len(text.rstrip())


def extract_text_units(template: BoundTemplate, source: str) -> tuple[TextUnit, ...]:
    content = [node for node in iter_nodes(template) if isinstance(node, ContentNode) and node.text]
    spans = sorted(content_span(source, node) for node in content)
    meaningful = [(start, end) for start, end in (trim(source, span) for span in merge_adjacent(spans)) if start < end]
    return tuple(TextUnit(f"text_{i:02d}", start, end, source[start:end]) for i, (start, end) in enumerate(meaningful))


def apply_units(source: str, units: Sequence[TextUnit], texts: Mapping[str, str]) -> str:
    pieces: list[str] = []
    cursor = 0
    for unit in units:
        pieces.append(source[cursor:unit.start])
        pieces.append(texts.get(unit.unit_id, unit.text))
        cursor = unit.end
    pieces.append(source[cursor:])
    return "".join(pieces)
```

Доказательство сборки (`step2.out`): шаблон с простым текстом, `{{ ticket.text | strip }}`, `{% if customer.vip %}`,
`{% for h in history %}…{{ h.summary }}`, `{% case ticket.channel %}{% when 'email' %}…{% when 'chat' %}…{% endcase %}`
дал 7 единиц: `You triage support tickets for an internet provider.`, `The customer is VIP, answer politely.`, `Ticket:`,
`- previous:`, `Reply formally.`, `Reply briefly.`, `Return the label.`. После переписывания всех единиц и сборки все
проверки `True`: число единиц, байты между единицами, последовательность не-content токенов,
`global_variable_paths` (`['customer.vip', 'history', 'ticket.channel', 'ticket.text']`), `analyze().globals`, теги
`['case', 'for', 'if']`, фильтры `['strip']`. Второй шаблон с `{%- if -%}`, `{%- endif %}` и `{% comment %}` тоже
байт в байт; тело комментария единицей не становится.

### 8.6. Фильтр допустимости `AdmissibleReflection`

Правила формы проверяются на собранном мутанте до любого вызова модели. Таблица правил `SHAPE_RULES`, фасад
`PromptTemplateCompiler` (Facade) с методами `seed_candidate`, `materialize`, `diagnose`, `render`.

| Правило (имя в пробе) | Условие |
|---|---|
| `R-SYNTAX` | `LiquidError` при разборе |
| `R-T1` | глобальные пути переменных вне объявленных слотов |
| `R-T2` | объявленный слот не используется |
| `R-FROZEN` | последовательность не-content токенов `(kind, value)` из `env.tokenizer()` отличается от исходной |
| `R-TAGS` | множество тегов или фильтров отличается |

| Мутант | Диагностики |
|---|---|
| `{{ unknown_slot }}` | `R-T1` + `R-FROZEN` |
| добавлен `{% if ticket.text %}` над объявленным слотом | только `R-FROZEN` |
| повтор объявленного слота `{{ ticket.text }}` | только `R-FROZEN` — одни `R-T1`/`R-T2` его бы пропустили |
| `{% if %}` | `R-SYNTAX: missing expression` |
| `{{ history \| size }}` | `R-FROZEN` + `R-TAGS` |
| единица очищена | допустим |

`R-T1` и `R-T2` совпадают по смыслу с правилами [08. Промты](../08-prompts.md) §7; `R-SYNTAX`, `R-FROZEN`, `R-TAGS` в
каталоге кодов нет (открытый вопрос 21).

Место в GEPA: `AdmissibleReflection` оборачивает `StatelessReflectionLM` (Decorator над `ReflectionLM`) и передаётся как
`reflection_strategy`. При диагностиках возвращается `ReflectionProposal(new_texts={})`, движок пишет `Reflection returned
no text updates; skipping proposal` и **не оценивает** потомка (`reflective_mutation.py:472-482`). С `max_repairs ≥ 1`
диагностики дописываются в reflective dataset записью с `Feedback` и рефлексия повторяется.

```python
@dataclass
class AdmissibleReflection:
    inner: ReflectionLM
    compiler: PromptTemplateCompiler
    model_calls: Callable[[], int]
    max_repairs: int = 0
    rejected: list[RejectedMutant] = field(default_factory=list)
    admitted: int = 0

    def reflect(self, candidate: dict[str, str], reflective_dataset: ReflectiveDataset, components_to_update: list[str]) -> tuple[ReflectionProposal, AdmissibleReflection]:
        dataset = reflective_dataset
        proposal = ReflectionProposal(new_texts={})
        for _ in range(self.max_repairs + 1):
            proposal, self.inner = self.inner.reflect(candidate, dataset, components_to_update)
            diagnostics = self.compiler.diagnose({**candidate, **proposal.new_texts})
            if not diagnostics:
                self.admitted += 1
                return proposal, self
            self.rejected.append(RejectedMutant(dict(proposal.new_texts), diagnostics, self.model_calls()))
            dataset = with_compiler_feedback(dataset, proposal.new_texts, diagnostics)
        return ReflectionProposal(new_texts={}, prompts=proposal.prompts, raw_lm_outputs=proposal.raw_lm_outputs), self


def with_compiler_feedback(dataset: ReflectiveDataset, texts: Mapping[str, str], diagnostics: Sequence[Diagnostic]) -> ReflectiveDataset:
    reasons = "; ".join(f"{diagnostic.rule}: {diagnostic.message}" for diagnostic in diagnostics)
    feedback = f"Rejected by the template compiler ({reasons}). Plain text only: no {{{{ }}}} or {{% %}}."
    return {name: [*records, {"Inputs": {}, "Generated Outputs": texts.get(name, ""), "Feedback": feedback}] for name, records in dataset.items()}
```

`ReflectiveDataset` — псевдоним `Mapping[str, Sequence[Mapping[str, object]]]`.

### 8.7. Замеренные прогоны

Задача: триаж тикетов (outage / billing / other), 6 train и 6 val кейсов. Модель задачи — `FunctionModel`, читает
`AgentInfo.instructions` (`pydantic_ai/models/function.py:249-270`) и правильно классифицирует неявные outage, только если
в инструкции есть «no connectivity means outage». Reflection LM сценарная: первый вызов вставляет `{{ unknown_slot }}`,
дальше дописывает нужное предложение. Отрендеренный шаблон передаётся как `agent.run(..., instructions=...)` на кейс,
оценка — `Dataset.evaluate_sync` внутри `GEPAAdapter.evaluate`.

| Прогон | Оценки на val | Вызовов метрики | Вызовов модели задачи | Вызовов рефлексии | Примечание |
|---|---|---|---|---|---|
| без ремонта | [0.667, 0.833, 1.0] | 42 | 42 | 3 | родители `[[None], [0], [1]]`; 3 полные оценки valset; `discovery_eval_counts` [0, 15, 27]; мутант с `unknown_slot` отклонён (`R-T1`, `R-FROZEN`) на отметке 9 вызовов модели (6 — seed на valset, 3 — минибатч родителя); `unknown_slot ever reached model: False` |
| ремонт, `max_repairs=1` | [0.667, 1.0] | — | — | 2 | в той же итерации допущен исправленный мутант (`subsample score 2.0 -> 3.0`); `discovery_eval_counts` [0, 12]: лучший за 12 вызовов вместо 27, 1.0 на итерации 1 вместо 3 |
| через порт + `ScoreThresholdStopper(1.0)` | [0.667, 1.0] | 18 | 18 | — | изменена единица `text_00`; `rejected [['R-T1', 'R-FROZEN']]`; `result_json` 1346 байт |
| возобновление из `run_dir` | — | 42 → 51 | 15 реальных | — | seed переоценён и не учтён |
| `optimize_anything` с callable | [0.667, 1.0] | — | — | — | ключевое слово в лучшем кандидате |

Наблюдения:
- отклонение без ремонта всё равно тратит минибатч родителя, оценённый до рефлексии;
- при выборе единиц по кругу предложение дописалось в единицу-метку `Ticket:` прямо перед `{{ ticket.text }}`
  (лучший кандидат `'text_02': 'Ticket: When the customer reports no connectivity ...'`);
- `FullEvaluationPolicy` переоценивает весь dev-набор на каждого принятого кандидата (`strategies/eval_policy.py:13-55`);
- шаблон рефлексии по умолчанию копирует записи reflective dataset, включая текст тикета, дословно в промт
  (`instruction_proposal.py:54-112`).

`Agent.run(instructions=...)` добавляет инструкции к инструкциям агента и безопасен при параллельной оценке кейсов
(`agent/abstract.py:484`); `Agent.override(instructions=...)` из рецепта Pydantic **заменяет** инструкции агента и
capabilities (`agent/__init__.py:1996, 2014-2016`).

pydantic-evals как оценщик внутри `evaluate`: оценка кейса — `ReportCase.scores['LabelMatch'].value`, объяснение —
`.reason`; исключения задачи — в `report.failures` и отображаются в оценку 0 с текстом ошибки как feedback; кейсы
сопоставляются с порядком батча по имени; `set_eval_attribute('instructions', ...)` и
`set_eval_attribute('messages', ModelMessagesTypeAdapter.dump_python(result.all_messages(), mode='json'))` попадают в
`ReportCase.attributes`; `evaluate_sync` работает внутри синхронного цикла GEPA (`step4.out`: `mean score:
0.6666666666666666 model calls: 6`).

### 8.8. Форма порта меняется

[08. Промты](../08-prompts.md) §10.2 описывает порт `propose(units, feedback): TextUnit[][]` с внешними фильтром и
`scoreOnSample`. GEPA сам ведёт цикл: выбор родителя, оценку минибатча, приёмку, фронт Парето. Поэтому порт —
`PromptOptimizerPort.optimize(OptimizationRequest) -> OptimizationOutcome`, а фильтр живёт внутри рефлексии, чтобы не
тратить вызовы модели. `GepaPromptOptimizer` реализован и прогнан (`step5_port.out`).

```python
class PromptOptimizerPort(Protocol):
    def optimize(self, request: OptimizationRequest) -> OptimizationOutcome: ...


@dataclass(frozen=True, slots=True)
class OptimizationBudget:
    max_metric_calls: int
    score_threshold: float | None = None
    max_repairs: int = 1


class GepaPromptOptimizer:
    def __init__(self, reflection_lm: ReflectionCallable, model_calls: Callable[[], int]) -> None:
        self._reflection_lm = reflection_lm
        self._model_calls = model_calls

    def optimize(self, request: OptimizationRequest) -> OptimizationOutcome:
        budget = request.budget
        reflection = AdmissibleReflection(StatelessReflectionLM(self._reflection_lm), request.compiler, self._model_calls, budget.max_repairs)
        stoppers = [ScoreThresholdStopper(budget.score_threshold)] if budget.score_threshold is not None else []
        result = gepa.optimize(
            seed_candidate=request.compiler.seed_candidate,
            trainset=list(request.train),
            valset=list(request.dev),
            adapter=TemplateUnitsAdapter(TemplateTaskRunner(request.compiler)),
            reflection_strategy=reflection,
            max_metric_calls=budget.max_metric_calls,
            stop_callbacks=stoppers,
            run_dir=request.run_dir,
            logger=QuietLogger(),
        )
        return OptimizationOutcome(
            seed_units=request.compiler.seed_candidate,
            best_units=result.candidates[result.best_idx],
            val_scores=result.val_aggregate_scores,
            parents=result.parents,
            metric_calls=result.total_metric_calls,
            rejected=reflection.rejected,
            result_json=result.to_dict(),
        )
```

`TemplateUnitsAdapter` объявляет `propose_new_texts = None` и реализует `evaluate` и `make_reflective_dataset` (Adapter).

| Понятие 08 §10.2 | В GEPA |
|---|---|
| `TextUnit` | компонент кандидата `unit_id: text`, обрезанный диапазон `ContentNode` |
| `RunFeedback` | запись reflective dataset `{Inputs, Generated Outputs, Feedback}` из `ReportCase` pydantic-evals (reason оценки, attributes, `gen_ai.*` из span_tree) |
| `propose()` | `ReflectionLM` GEPA; callable `(str \| list[dict]) -> str` над нашим агентом Pydantic AI |
| `admissible` | `AdmissibleReflection` + `SHAPE_RULES`, цикл ремонта с диагностиками |
| `scoreOnSample` | `TemplateUnitsAdapter.evaluate` через `Dataset.evaluate_sync` |
| Парето и lineage | JSON `GEPAResult.to_dict()` храним сами; pickle в `run_dir` — локальный черновик |
| Победитель | обычная операция правки промта (новая версия, дифф рендера); гейт — на test-сплите |
| Уровни промта | уровень 2 (Liquid) — единицы `ContentNode` (проверено); уровень 1 (`.prompt.md` без переменных) — весь текст одна единица (ADR-0029, не запускалось); уровень 3 (`prompt: pkg.mod:build`) оптимизации не подлежит (ADR-0029) |

Сплиты (вывод, не запускалось на реальных данных): `trainset` = train-сплит (минибатчи рефлексии), `valset` = dev-сплит
(фронт Парето), test не передаётся никогда; порт проверяет n ≥ 200 и пройденный A/A до вызова `gepa.optimize`; для
стоимости dev-набора нужен свой `EvaluationPolicy` с подвыборкой.

### 8.9. Оптимизаторы DSPy неприменимы к внешней системе

MIPROv2, SIMBA и BootstrapFewShot работают над программой `dspy.Module`: копируют её, обходят `predictors()` /
`named_predictors()` и переписывают `predictor.signature.with_instructions(...)` и `predictor.demos`; предлагатель MIPROv2
читает исходник модуля. Источники по тегу 3.3.1: `teleprompt/teleprompt.py:64` (`compile(self, student: Module, *,
trainset, teacher, valset) -> Module`), `mipro_optimizer_v2.py:109-111, 218, 764-778`, `propose/utils.py:146-158`
(`inspect.getsource(type(module))`), `simba.py:86-92, 156, 198-274`, `simba_utils.py:166-170`, `bootstrap.py:84-117,
263-270`; `docs/docs/learn/optimization/optimizers.md:8`: «A DSPy optimizer is an algorithm that can tune the parameters
of a DSPy program». `dspy.GEPA` — `DspyAdapter(GEPAAdapter)` над `gepa.optimize` по инструкциям `named_predictors`
(`teleprompt/gepa/gepa.py:522-549, 632`, `gepa_utils.py:95, 184-197`). Наш рантайм (Pydantic AI + шаблон Liquid) ими
оптимизировать нельзя без обёртки в `dspy.Module` с вызовами через LM и адаптеры DSPy.

## 9. Несоответствия в документах

| # | Где | Что написано | Что показала проверка | Кто закрывает |
|---|---|---|---|---|
| 1 | [ADR-0003](../adr/0003-model-middleware.md), [11](../11-providers.md) §2.2 и §7.3, [10](../10-runtime.md) §5 | три разных порядка middleware (§1.8) | проверена цепочка с инвариантами ADR-0003 | ADR-0029 §1; 10 и 11 — при чистке |
| 2 | ADR-0003 «Проверка» | в файле кассеты нет PII ни в `request`, ни в `response` | кассета хранит сырой ответ модели | ADR-0029 (запись отредактированного ответа); открытый вопрос 5 |
| 3 | [10. Рантайм](../10-runtime.md) §5, строка 462; ADR-0003, строка 37 | «Уровни ретраев обязаны быть ровно один», ретраи модели только в `retry-backoff` | SDK openai 3.14.1 и anthropic 1.6.0 по умолчанию сами повторяют дважды | ADR-0029 §1 (`max_retries=0`) |
| 4 | [ADR-0012](../adr/0012-langfuse-as-store.md) обязанность 8 | не мутировать `span.attributes` в процессоре | процессор SDK langfuse 4.15.3 мутирует спаны | ADR-0029 (SDK не берём) |
| 5a | [13. Evals](../13-evals-and-gates.md) §7.2 (строка 691), §7.10 | ordinal: бутстрап CI на медиану разницы | BCa даёт NaN на рубриках | 13 — при чистке (открытый вопрос 20) |
| 5b | 13 §7.2 (строка 691), §7.10 (строка 1071); [statistics-gates.md](statistics-gates.md) §1.5 (строки 121-132) и §6.3 (строка 688) | Wilcoxon `exact: n <= 50` | exact в scipy неверен при связках и нулях, без предупреждения | ADR-0029 запрещает `method="exact"`; 13 — при чистке (открытый вопрос 20) |
| 5c | 13 §7.10, строка 973 | `z0 = probit(count(replicates < theta_hat) / B)` | scipy считает равные реплики наполовину; golden-фикстуры разойдутся | 13 — при чистке (открытый вопрос 20) |
| 5d | 13 §7.4 (строка 752) против §7.10 | «нижняя граница одностороннего 95% CI» против двустороннего 95% в псевдокоде (эквивалент одностороннего 97.5%) | −0.0583 против −0.0625 на одних данных | 13 — при чистке (открытый вопрос 20) |
| 5e | statistics-gates.md §6.2, строка 631 | `judge_agreement` — Cohen's kappa | в 13 §5.3 — quadratic weighted kappa ≥ 0.70 и Krippendorff alpha ≥ 0.80; 13 §12 п. 7 это уже отмечает | ADR-0029 (`cohens_kappa(..., wt="quadratic")`); документы — при чистке (открытый вопрос 20) |
| 6 | ADR-0015 «Почему не тянем Python» | статистика на @stdlib, Python только для golden-фикстур | движок на Python, scipy и statsmodels в процессе | ADR-0029 |
| 7 | [08. Промты](../08-prompts.md) §10.1 | `@ax-llm/ax` `AxGEPA` как оффлайн-CLI, `gepa-ts` отвергнут | `gepa` 0.1.4 библиотекой в процессе, pydantic-evals как оценщик | ADR-0029 |
| 8 | 08 §10.2 | порт `propose` → фильтр → `scoreOnSample` | движок GEPA ведёт цикл сам, порт — `optimize` | ADR-0029 |
| 9 | 08 §10.2, строка 667 | «преимущество перед ax и DSPy, где промт целиком отдан оптимизатору» | оптимизаторы DSPy меняют только инструкции и demos предикторов; структура полей и формат вывода остаются у адаптера DSPy; реальная разница — инструкция DSPy один текст без слотов и ветвлений | при чистке 08 |
| 10 | 13 §7.10 (строка 1027) против 08 §10.3 (строка 677) | минимум 200 на test-сплите против «набор ≥ 200 элементов» | при полосах 70/15/15 test из 200 означает ~1334 элемента всего | открытый вопрос 22 |
| 11 | [04. IR](../04-ir-schema.md) §6.2, строка 718 | канонический YAML с `sortMapEntries: true` | канонический писатель на ruamel в пробе сохранял порядок отображений; порядок полей типа значим: обоснование стоит до решения ([03](../03-core-language.md) §2, 04 §6.5) | [ADR-0026](../adr/0026-yaml-spec-and-code-refs.md): ключи, известные модели описания, пишутся в порядке полей модели Pydantic (`apiVersion`, `kind` первыми); то, что названо автором (поля узла и типа, узлы, типы), остаётся в порядке автора; алфавитной сортировки нет; 04 §6.2 — при чистке |

## Открытые вопросы

1. **Стенды на CPython 3.12.4, ADR-0025 фиксирует 3.14.** Метаданные совместимы (scipy ≥ 3.12, gepa < 3.15, колёса dulwich до
   3.15, watchfiles до 3.15), но пробы этой заметки на 3.14 не запускались. Что сделать: в спайке фазы 0 прогнать все
   пробы под uv на CPython 3.14.7.
2. **Пробы не перенесены в репозиторий.** Пробы выполнялись вне репозитория 2026-09-16, в репозитории есть только их
   результаты в этой заметке. Что сделать: перенести пробы в спайк фазы 0 как тесты с `ALLOW_MODEL_REQUESTS = False`.
3. **`DBOSDurability`, цепочка и исключения гейта.** Интеграция с DBOS — capability `DBOSDurability`
   (`durable_exec/dbos/_durability.py`): `DBOSAgent` устарел в 2.43.0, удаление запланировано на v3
   ([research/py-stack-runtime.md](py-stack-runtime.md) §3.1, §5.2). Размещение `DBOSModel` снаружи цепочки выведено из
   кода устаревшего `DBOSAgent` (`_agent.py` `DBOSAgent.__init__`, `_model.py` `DBOSModel`); с `DBOSDurability` не
   проверено ни то, оказывается ли наша цепочка обёрток внутри шага запроса модели, ни то, как ретраи шага DBOS
   обходятся с `TruncatedOutput`, `RefusedOutput`, `CassetteMiss`. Что сделать: спайк на dbos 2.31.1 с SQLite:
   `Agent(..., capabilities=[DBOSDurability(...)])` с моделью из фабрики, `agent.run()` внутри своего `@DBOS.workflow`,
   три исключения и восстановление после падения процесса.
4. **Непокрытые случаи гейта.** Случаи C и D с `OutcomeGateModel` отдельно не замерялись; реплей записанного обрезанного
   ответа через гейт над кассетой не замерялся; гейта для `request_stream` нет. Что сделать: добавить три пробы.
5. **PII в кассете.** ADR-0029 выбрал запись отредактированного ответа и возврат той же копии наверх в PII-режиме, чтобы
   запись и реплей совпадали; проба хранила сырой ответ, выбранный вариант не запускался. Что сделать: проба «запись в
   PII-режиме → реплей»: в файле кассеты нет образцов PII, выход узла в live и replay одинаков.
6. **Каноническая форма ключа кассеты.** Проба использовала JSON с сохранением порядка `properties`; ADR-0029 выбрал
   `properties` списком пар и `rfc8785.dumps`, этот вариант не запускался. Что сделать: тест равенства ключей для
   `FunctionModel`, OpenAI и Anthropic и различия ключей при перестановке полей.
7. **Запись стрима.** Обёртка из пробы буферизует стрим целиком. Что сделать: реализовать сбор событий с
   `replay_events=[...]` и проверить, что живые частичные ответы доходят до UI.
8. **Слой backoff на tenacity** в цепочке не запускался. ADR-0029 ставит `BackoffModel` между лимитером и моделью
   провайдера; свой RPM/TPM-лимитер рядом с `ConcurrencyLimitedModel` тоже не запускался. Что сделать: цепочка с
   `BackoffModel`, мок 429 с `retry-after`: число HTTP-вызовов равно попыткам, одна запись кассеты, один слот лимитера.
9. **Подсчёт токенов без сети.** Файл `o200k_base` для tiktoken не скачивался; эндпоинты подсчёта Anthropic и Google не
   вызывались против реальных сервисов; поведение google-genai 2.23.0 при `retry_options=None` не проверено. Что сделать:
   завендорить файл в `TIKTOKEN_CACHE_DIR` и проверить офлайн-подсчёт; проба google-genai с мок-транспортом на 429.
10. **OpenAI strict и поле со значением по умолчанию** — вывод по коду `profiles/openai.py`, без запуска. Что сделать:
    перехватить запрос с таким полем.
11. **Langfuse на реальном сервере.** Не проверено, нужен ли `x-langfuse-ingestion-version: 4` процессору SDK и как сервер
    отображает `metadata`, `gen_ai.aggregated_usage.*`, `final_result` от pydantic-ai. Что сделать: self-hosted Langfuse
    ≥ 3.22.0, экспорт простым OTLP, проверка через UI и API.
12. **Лимиты атрибутов спанов.** Вытеснение старых атрибутов ломает фильтры по атрибутам, выставленным при старте. Что
    сделать: задать бюджет атрибутов на спан и фильтр, не зависящий от ранних атрибутов (например, по имени scope), и
    покрыть тестом.
13. **RFC 8785.** Полный файл ES6 на 100 млн чисел не прогонялся; решение о вендоринге `rfc8785` не принято. Что сделать:
    прогнать файл в CI-задаче вне основного контура и решить вендоринг по итогу.
14. **dulwich против pygit2 на больших историях и reftable.** Производительность не мерилась. Что сделать: бенчмарк лога
    по пути и чтения blob на репозитории с 10⁴–10⁵ коммитов; проверить `ReftableRefsContainer` против вопроса в
    [истории на git](../files-first/history.md).
15. **YAML датасетов и комментарий-заголовок.** Порядок ключей решён в ADR-0026: ключи модели описания — в порядке полей
    модели Pydantic, названное автором — в порядке автора, вместо `sortMapEntries` из 04 §6.2. `Dataset.to_file`
    pydantic-evals пишет строку-комментарий `# yaml-language-server`, а строгий предпроход комментарии отклоняет. ADR-0029
    выбрал загрузку `datasets/*.yaml` строгим проходом и `Dataset.from_dict` с заголовком `apiVersion`/`kind`; схему для
    редактора даёт `model_json_schema_with_evaluators()`, с файлами её связывает `yaml.schemas` по глобам (ADR-0026). Ничего
    из этого не запускалось; сопоставление через `yaml.schemas` взято из README redhat.vscode-yaml, в редакторе не
    проверено. Что сделать: round-trip файла датасета через строгий проход, `from_dict` с `custom_evaluator_types` и
    канонический писатель; в VS Code с redhat.vscode-yaml проверить, что запись `yaml.schemas` с глобом
    `datasets/*.yaml` даёт проверку и автодополнение по схеме с оценщиками.
16. **`retry_task` и `retry_evaluators` в pydantic-evals** принимают `pydantic_ai.retries.RetryConfig`, а модуль
    `pydantic_ai.retries` при импорте требует encode `httpx` (вывод из двух проверенных фактов). Что сделать: проверить
    импорт в окружении без `httpx`; при подтверждении — повторы в нашей обёртке задачи.
17. **Судья по умолчанию `openai:gpt-5.2`.** ADR-0029 выбрал свой тип оценщика-судьи с моделью из каталога и запрет
    `LLMJudge` без явной модели; ни тип, ни запрет не запускались. Что сделать: реализовать тип судьи и правило
    `aqven check`, проверить сериализацию в YAML и вызов судьи через кассету с `ALLOW_MODEL_REQUESTS = False`.
18. **Онлайн-оценка pydantic-evals** не запускалась. Что сделать: проба `OnlineEvaluation` с sink в Langfuse для цикла
    прода (13 §11).
19. **Krippendorff alpha.** Юридическая оценка GPL-пакета как оракула в dev не делалась; ratio-дистанция в своей реализации
    не проверялась. Что сделать: решение юриста или замена оракула опубликованными значениями; добавить ratio и сверить
    0.797403.
20. **Несоответствия 13 §7 и research/statistics-gates.md** (§9, строки 5a–5e): процедура CI для порядковых метрик (BCa на
    среднем нормированных разниц или NaN → `GATE_UNAVAILABLE`); `method` Wilcoxon вместо `exact: n <= 50`; формула z0 для
    golden-фикстур (scipy); одно- или двусторонняя граница; Cohen против quadratic weighted kappa. ADR-0029 передаёт их
    этапу чистки. Что сделать: при чистке выбрать политику по каждому пункту и переписать 13 §7.2, §7.4, §7.10.
21. **GEPA в production.** Не проверены: соответствие адаптера протоколу `GEPAAdapter` в pyright strict, поведение с
    реальной reflection-моделью, объявление оптимизируемых единиц (метки вроде `Ticket:` мутировать нельзя), стабильные id
    единиц (порядковые `text_00` сдвигаются при правке человеком), маскирование PII в `make_reflective_dataset`, свой
    `EvaluationPolicy` для dev-набора, коды `R-SYNTAX`, `R-FROZEN`, `R-TAGS` в каталоге компилятора. Что сделать: спайк на
    реальном узле с датасетом ≥ 200 и прогон pyright strict; коды согласовать с [07. Компилятор](../07-compiler.md).
22. **Минимум 200 для оптимизации:** на test-сплите (13 §7.10) или на всём наборе (08 §10.3). Что сделать: решить
    политику и выровнять 08 и 13 при чистке.
23. **Merkle-корень без бандла.** Формула из 18 §2 проверена против Node, но в 18 корень служит манифесту бандла, а
    экспорт отменён (ADR-0025); ADR-0025 оставляет канонизацию и хеш содержимого (ADR-0022), про Merkle-корень не говорит.
    Что сделать: при сужении 18 до канонизации, хеша и сборки решить, нужен ли пофайловый корень для релиза или
    идентичности дерева, либо перенести его в справочные факты вместе с tar.

## Источники

Установленные пакеты (строки файлов — в тексте): `pydantic-ai-slim` 2.43.0, `pydantic-evals` 2.43.0, `genai-prices` 0.1.7,
`openai` 3.14.1, `anthropic` 1.6.0, `google-genai` 2.23.0, `tenacity` 9.1.4, `tiktoken` 0.14.0, `opentelemetry-sdk` и
`opentelemetry-exporter-otlp-proto-http` 1.44.0, `langfuse` 4.15.3, `logfire` 5.1.0, `rfc8785` 0.1.4, `jcs` 0.2.1,
`canonicaljson` 2.0.0, `dulwich` 1.2.15, `pygit2` 1.20.1, `GitPython` 3.1.62, `watchfiles` 1.2.0, `ruamel.yaml` 0.19.1,
PyYAML 6.0.3, `scipy` 1.18.1, `statsmodels` 0.15.0, `scikit-learn` 1.9.1, `numpy` 2.5.3, `krippendorff` 0.8.2, `nltk` 3.10.3,
`gepa` 0.1.4, `python-liquid` 2.3.1; исходники `stanfordnlp/dspy` по тегу 3.3.1. Версии, лицензии и даты — PyPI JSON и
`dist-info/METADATA`; лицензии PyYAML 6.0.3 и `litellm` 1.101.0 — PyPI JSON, проверено 2026-09-16.

Документация и репозитории:
- https://github.com/pydantic/pydantic-ai/pull/5523
- https://pydantic.dev/docs/ai/integrations/logfire/
- https://pydantic.dev/docs/ai/evals/how-to/dataset-management/
- https://pydantic.dev/articles/prompt-optimization-with-gepa
- https://langfuse.com/integrations/native/opentelemetry
- https://langfuse.com/self-hosting/license-key
- https://langfuse.com/integrations/frameworks/pydantic-ai
- https://github.com/pydantic/logfire
- https://github.com/trailofbits/rfc8785.py
- https://github.com/pln-fing-udelar/fast-krippendorff
- https://rdrr.io/cran/irr/man/kripp.alpha.html
- https://en.wikipedia.org/wiki/Krippendorff%27s_alpha
- https://stat.ethz.ch/R-manual/R-devel/library/stats/html/mcnemar.test.html
- https://github.com/gepa-ai/gepa
- https://github.com/stanfordnlp/dspy

Документы репозитория: [ADR-0003](../adr/0003-model-middleware.md), [ADR-0004](../adr/0004-schema-profiles.md),
[ADR-0005](../adr/0005-three-call-outcomes.md), [ADR-0006](../adr/0006-dynamic-allowed-sets.md),
[ADR-0012](../adr/0012-langfuse-as-store.md), [ADR-0015](../adr/0015-gate-statistics.md),
[ADR-0017](../adr/0017-files-as-source-of-truth.md), [ADR-0022](../adr/0022-hash-as-version.md),
[ADR-0025](../adr/0025-python-engine.md), [ADR-0026](../adr/0026-yaml-spec-and-code-refs.md),
[ADR-0029](../adr/0029-trust-and-quality-python.md), [04. Формат IR и схема спеки](../04-ir-schema.md) §6,
[18. Экспорт и конформанс](../18-export-and-conformance.md) §2, [research/py-stack-runtime.md](py-stack-runtime.md) §3.1,
§5.2, [research/py-spec-as-code.md](py-spec-as-code.md) §13.2, §13.3, [03. Ядро языка](../03-core-language.md) §2,
[08. Промты](../08-prompts.md) §7, §10, [10. Рантайм](../10-runtime.md) §5, [11. Провайдеры](../11-providers.md) §2.2, §7.3,
[13. Evals, датасеты и гейты выпуска](../13-evals-and-gates.md) §5, §7, §12,
[research/statistics-gates.md](statistics-gates.md) §1.5, §6.2, [research/observability.md](observability.md),
[research/determinism-export.md](determinism-export.md).
