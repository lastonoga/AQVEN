# Матрица требований моделей к промту

> Вопрос среза: какие свойства модели/провайдера заставляют менять сам промт, а не только данные в нём?

## Что нашли

| # | Провайдер / семейство | Факт, влияющий на текст промта | Источник |
|---|---|---|---|
| F1 | OpenAI, `response_format={"type":"json_object"}` | Требование: «Include the word "JSON" somewhere in the messages conversation (typically the system message)». Иначе 400: `'messages' must contain the word 'json' in some form, to use 'response_format' of type 'json_object'.` (`type: invalid_request_error`, `param: messages`) | [MS Learn / Azure OpenAI JSON mode](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/json-mode) |
| F2 | OpenAI, json_object | Без явной инструкции «выдай JSON» модель может «generate an unending stream of whitespace» до `max_tokens`. Валидность JSON гарантирована, соответствие схеме — нет. | там же |
| F3 | OpenAI, `json_schema` + `strict:true` | Гарантирует схему; ключевое слово «JSON» в сообщениях не требуется; вместо этого ограничения на саму схему (см. ниже) | [Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) |
| F4 | Anthropic Messages API | `system` — top-level параметр, роли `system` в `messages` нет. Подряд идущие одинаковые роли склеиваются в один turn. Максимум 100 000 сообщений. `TextBlockParam.text` имеет `minLength: 1` — пустой текстовый блок запрещён. | [Messages API](https://platform.claude.com/docs/en/api/messages) |
| F5 | Anthropic prefill | Если последнее сообщение — `assistant`, ответ продолжается прямо с него (`"assistant": "The best answer is ("` → `"B)"`). Это штатный документированный механизм форсирования формата. | там же |
| F6 | Anthropic `cache_control` | До **4 breakpoints** на запрос. Порядок префикса: `tools → system → messages`; изменение уровня инвалидирует его и все последующие. Минимум для кэша зависит от модели: 512 / 1024 / 2048 / 4096 токенов. Короткий префикс не кэшируется **молча**, без ошибки — проверять `cache_creation_input_tokens`/`cache_read_input_tokens`. TTL 5m (по умолчанию) и `ttl:"1h"`. Пустые text-блоки не кэшируются. Lookback: до 20 позиций на breakpoint. | [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) |
| F7 | Anthropic, инвалидация | Смена `tool_choice` инвалидирует кэш сообщений; смена параметров thinking/effort — всегда инвалидирует message-блоки. То есть «форсировать тул» и «кэшировать» конфликтуют. | там же |
| F8 | Alibaba Qwen / Model Studio | JSON Object Mode: «the prompt must contain the word "JSON" (case-insensitive)», ошибка идентична OpenAI-формулировке. JSON Schema Mode ключевого слова не требует. Schema-режим доступен только части моделей (Qwen3.7/3.8 Plus/Flash/Max-серии), json_object — почти всем. Совет: не задавать `max_tokens` вместе со structured output — обрежет JSON. | [Qwen structured output](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output) |
| F9 | Qwen, эндпоинты | OpenAI-совместимый `/chat/completions` и нативный DashScope `/services/aigc/.../generation` оба поддерживают structured output, но различаются формой запроса/ответа | там же |
| F10 | DeepSeek | JSON Output: `response_format={'type':'json_object'}` + «include the word 'json' in the system or user prompt, **and provide an example of the desired JSON format**». Документированный дефект: API «may occasionally return empty content». Нужен запас `max_tokens`. | [DeepSeek JSON mode](https://api-docs.deepseek.com/guides/json_mode) |
| F11 | Cohere | `json_object`, опционально `schema`. Без схемы user-сообщение обязано явно требовать JSON, иначе «the model may end up getting stuck generating an infinite stream of characters». Схема — подмножество: нет `allOf/oneOf/not`, `min/maximum`, `min/maxItems`, `min/maxLength`, почти нет regex, из `format` только `date-time`, `uuid`, `date`, `time`. | [Cohere Structured Outputs](https://docs.cohere.com/docs/structured-outputs) |
| F12 | vLLM (Llama и любые open-weights) | Structured outputs через `response_format` / `structured_outputs` (backends xgrammar по умолчанию, guidance/outlines). Требования ключевого слова нет — ограничение на уровне декодера. **Какие роли вообще допустимы, определяет chat template конкретной модели**, а не сервер. Для reasoning-моделей нужен `--structured-outputs-config.enable_in_reasoning=True`. | [vLLM structured outputs](https://docs.vllm.ai/en/latest/features/structured_outputs.html) |
| F13 | Google Gemini | `responseMimeType: "application/json"` + `responseSchema` (схема работает только вместе с этим mime-типом). Системные инструкции — отдельное поле `systemInstruction` на запросе, «Currently, text only». Поддерживается подмножество JSON Schema; очень большие/глубокие схемы отклоняются. | [GenerateContent API](https://ai.google.dev/api/generate-content), [Structured output](https://ai.google.dev/gemini-api/docs/structured-output) |
| F14 | OpenAI reasoning-модели | Промт-стиль другой: «give the model the task, constraints, and desired output format», не расписывать промежуточные шаги; few-shot с разбором решения скорее вредит. Reasoning effort — параметр тюнинга, не главный рычаг качества. | [Reasoning guide](https://developers.openai.com/api/docs/guides/reasoning) |
| F15 | OpenAI, роли | Reference дословно: роль `developer` — «Developer-provided instructions that the model should follow... With o1 models and newer, `developer` messages replace the previous `system` messages»; у роли `system` — «With o1 models and newer, use `developer` messages for this purpose instead». Это переименование роли, а не удаление. | [Chat Completions reference](https://developers.openai.com/api/docs/api-reference/chat/create) |
| F16 | OpenAI reasoning, параметры | `temperature`, `top_p`, `presence_penalty`, `frequency_penalty`, `logprobs`, `top_logprobs`, `logit_bias` не поддерживаются (temperature/top_p зафиксированы в 1). UNVERIFIED: точный список собран из вторичных источников (issue openai-python #2072, LibreChat #10737), первичную страницу не удалось открыть. | [openai-python#2072](https://github.com/openai/openai-python/issues/2072) |
| F17 | Mistral | `response_format={"type":"json_object"}` — constrained decoding, JSON валиден «regardless of the content of the prompt», но дока всё равно: «we still recommend to explicitly ask the model to return a JSON object and the format». Отдельно Custom Structured Outputs со схемой. | [Mistral JSON mode](https://docs.mistral.ai/studio/conversations/structured-output/json_mode) |
| F18 | Anthropic, structured outputs | Есть нативный режим: `output_config.format` (JSON по схеме) и `strict: true` на инструментах, через constrained sampling. Список моделей ограничен (Sonnet 4.5 / Opus 4.5 / Haiku 4.5 и новее). То есть «форсирование тула» — фолбэк для моделей вне списка, а не единственный путь. | [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) |
| F20 | Alibaba Qwen, Partial Mode | Префикс задаётся последним сообщением с `role: assistant` и `"partial": true` в нём — «the last message should be an assistant message containing the prefix information», что прямо нарушает обычное правило «последнее сообщение — user». | [Qwen prefix continuation](https://www.alibabacloud.com/help/en/model-studio/partial-mode) |
| F19 | Anthropic, thinking × prefill | В manual-режиме «the final assistant turn of a thinking-enabled request must begin with a thinking block» — значит текстовый prefill несовместим с включённым thinking. Смена `budget_tokens` / effort между запросами инвалидирует брейкпоинты кэша (значение рендерится в промт). | [Extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking) |

## Разбор 1: ключевое слово «JSON» — это не один флаг, а три разных поведения

| Поведение | Кто | Что делает промт-компоновщик |
|---|---|---|
| **Hard 400** — сервер валидирует наличие подстроки `json` | OpenAI `json_object`, Qwen `json_object` | обязан гарантировать подстроку; проверка — на компиляции, а не на рантайме |
| **Soft** — рекомендация доки, риск бесконечного вывода | DeepSeek, Cohere (без схемы), Mistral, OpenAI (предупреждение о whitespace) | вставляет требование JSON + пример, иначе предупреждение компилятора |
| **Не требуется** — форму держит грамматика/схема | OpenAI `json_schema`, Anthropic `output_config.format`, Gemini `responseSchema`, Qwen JSON Schema Mode, vLLM xgrammar | блок формата вывода всё равно генерируется (§6 в 08-prompts), но как семантика полей, не как синтаксическая страховка |

Важно: у OpenAI проверяется **весь массив messages**, включая system; у DeepSeek дока прямо
говорит «system or user prompt». То есть носителем ключевого слова может быть кэшируемый
системный префикс — это не мешает кэшу, если слово статично.

## Разбор 2: роли и форма диалога

| Ось | OpenAI | Anthropic | Gemini | Qwen/DeepSeek/Mistral (OAI-совм.) | vLLM |
|---|---|---|---|---|---|
| системная инструкция | `system`, у reasoning — `developer` (F15) | top-level `system`, роли нет (F4) | `systemInstruction`, только текст (F13) | `system` как у OpenAI | зависит от chat template модели (F12) |
| несколько system | допустимо (несколько сообщений) | одно поле, массив блоков | одно поле | обычно да | template-специфично |
| склейка одинаковых ролей | нет | да, автоматическая (F4) | `contents` с ролями user/model | нет | template-специфично |
| пустое сообщение | допустимо | текстовый блок `minLength:1` (F4) | — | — | — |
| prefill (продолжение с assistant) | нет | да (F5), но не вместе с thinking (F19) | нет | да, Partial Mode (F20) | зависит от template |
| потолок сообщений | — | 100 000 (F4) | — | — | — |

## Оси адаптации промта

Таблица не о моделях, а о свойствах. Имя модели в компоновщик не попадает: каждая ось получает
значение из `declared_caps` каталога (§4 в 11-providers) либо из пробы (§5 там же).
`probe:` — существующая проба; `probe+` — пробу надо расширить; `catalog` — поле каталога.

| Ось | Значения | Откуда значение | Что меняется в промте |
|---|---|---|---|
| `system_placement` | `top_level` / `system_role` / `developer_role` / `none` | catalog (`provider_kind` + `family`); `developer_role` — флаг `reasoning` | куда уезжает слот системной инструкции; при `none` он склеивается в первое user-сообщение |
| `json_keyword` | `required` / `advised` / `unneeded` | probe+ `json_keyword`: тот же `strict_json` без слова «json» — 400 ⇒ `required` | вставка литерального фрагмента «…as a JSON object» в кэшируемый префикс |
| `schema_enforcement` | `grammar` / `schema_best_effort` / `json_only` / `text_only` | probe `strict_json` + `declared_caps` | объём генерируемого блока формата вывода (§6): при `grammar` — только семантика полей; при `text_only` — полный JSON-пример |
| `schema_dialect` | профиль схемы `strict` / `permissive` / `minimal` (ADR-0004) | catalog | то, что схема не выражает (диапазоны, `minItems`, `pattern`, `oneOf`), переносится **текстом** в промт — у Cohere это половина ограничений (F11) |
| `enum_case_fidelity` | `exact` / `loose` | probe `strict_json` (уже проверяет регистр) | при `loose` — расшифровка enum с явным «verbatim, including case» |
| `key_order_fidelity` | `ordered` / `unordered` | probe `strict_json` (уже проверяет порядок) | при `unordered` — явная нумерация шагов «сначала обоснование, затем решение» в тексте |
| `prefill` | `implicit` / `flagged` / `no` | probe+ `prefill`; гасится при `thinking=on` (F19) | доступен ли слот `prefill`. `implicit` — Anthropic (просто assistant в хвосте, F5); `flagged` — Qwen (`"partial": true`, F20); при `no` компилятор слот отвергает |
| `last_message_role` | `user` / `any` | catalog | можно ли закрыть массив assistant-блоком; один и тот же шаблон с prefill даёт разный хвост |
| `role_merge` | `merges` / `strict_alternation` / `template_defined` | catalog | можно ли отдать два подряд user-блока или надо склеить самим |
| `empty_block_policy` | `allowed` / `forbidden` | catalog (Anthropic — `forbidden`, F4) | после рендера liquid пустые `{% message %}` выбрасываются, а не отправляются |
| `cache_breakpoints` | целое 0..4 | catalog | сколько точек кэширования вообще может расставить §5.2 из 08-prompts |
| `cache_min_prefix` | 512 / 1024 / 2048 / 4096 / `n/a` | catalog (таблица F6) | если оценка размера префикса (R-T9, gpt-tokenizer) ниже порога — точку кэша не ставим и пишем WARN: молчаливый промах |
| `cache_invalidated_by` | множество: `tool_choice`, `thinking`, `effort`, `tools` | catalog (F7, F19) | запрет комбинации «форсированный тул + кэш сообщений» и «плавающий effort + кэш» в одном узле |
| `reasoning_prompt_style` | `prescriptive` / `contract_only` | catalog (флаг `reasoning`) | при `contract_only` (F14) компилятор отклоняет слоты вида «think step by step» и few-shot с разбором решения |
| `sampling_params` | `free` / `fixed` | catalog (F16) | при `fixed` бессмысленны и промт-инструкции «будь детерминирован», и попытка задать `temperature` в узле |
| `tool_forcing` | `required` / `auto` / `none` | probe `tool_call` | fallback-путь структурированного вывода, когда `schema_enforcement < grammar` |
| `output_budget_coupling` | `safe` / `truncates` | probe `strict_json`, исход `truncated` | при `truncates` (Qwen F8, DeepSeek F10) `max_tokens` узла задирается компилятором, ремонт JSON запрещён |
| `lang_adherence` | `strong` / `drifts` | probe+ `lang_echo`: тот же `strict_json` на не-английском | при `drifts` в промт добавляется явная директива языка вывода поверх слота `lang` (R-T11) |

## Вывод для нас

**Берём.** Оси выше — это поле `prompt_profile` в компиляции, вычисляемое из `(model_key, provider,
quantization, catalog_version, probe_suite_rev)`. Ни одна ось не читает имя модели: F8 и F1 дают
дословно одну и ту же ошибку у двух разных вендоров — значит это свойство, а не вендор.

**Проектируем.** Три вещи, которых сейчас в 08-prompts нет:

1. **Слой `adapters`** между отрисовкой liquid и массивом сообщений. Вход — нейтральный
   `RenderedPrompt` (список блоков с ролями и метками кэша), выход — тело запроса провайдера.
   Один адаптер на `provider_kind`, стратегия выбирается по осям, не по имени. Слово «JSON» из
   `json_keyword` вставляет адаптер, а не автор шаблона: иначе R-T6 (запрет ручного описания
   формата) и требование OpenAI противоречат друг другу.
2. **Оси входят в `behavior_hash`.** Смена `schema_enforcement` или `cache_breakpoints` меняет
   отправляемый текст ⇒ обязана менять хеш (04-ir-schema §4.3). `spec_hash` при этом не меняется:
   авторский TS тот же. Это и есть «зависимость промта» из запроса заказчика — реактивность в
   смысле React: промт пересчитывается при изменении внешнего значения, а не переписывается руками.
3. **Три новые пробы**: `json_keyword` (ожидаемый 400 — это *успех* пробы, а не провал),
   `prefill` (продолжается ли текст с assistant-хвоста), `lang_echo`. Все три ложатся в
   существующую таблицу `app.model_capability_probes` добавлением колонок и сдвигом
   `probe_suite_rev` — схема §5.2 менять не требует.

**Не берём.** Хардкод по имени/семейству модели в шаблоне или в компиляторе — даже как временное
решение: Qwen JSON Schema Mode доступен только части линейки (F8), а Anthropic structured outputs
только части моделей (F18), то есть даже внутри одного вендора ось имеет разные значения.
Также не берём «перевод промта под модель» силами LLM: язык — ось данных (`lang`, R-T11),
модельная часть тут только `lang_adherence`.

**Риски.** (а) Ось `cache_min_prefix` зависит от точности нашей оценки токенов, а gpt-tokenizer
считает по BPE OpenAI — для Anthropic и Qwen это приближение, порог 512/1024 можно промахнуть
в обе стороны. (б) Список неподдерживаемых параметров reasoning-моделей (F16) взят из вторичных
источников. (в) Матрица инвалидации кэша (F7) — от Anthropic; аналогов у других вендоров в доках
нет, для них `cache_invalidated_by` придётся выводить пробой, а не читать.
