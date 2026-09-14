# Пер-модельный рендеринг: что можно взять готовым

> Вопрос среза: какие оси адаптации промта под модель уже закрыты чужим слоем (HF chat templates, LiteLLM, AI SDK, шлюзы), а какие мы обязаны делать сами на этапе компиляции.

## Что нашли

| # | Факт | Источник |
|---|---|---|
| F1 | Chat template — Jinja-строка; современный формат `chat_template.jinja` в корне репо, легаси — поле `chat_template` в `tokenizer_config.json` / `chat_template.json`. Порядок загрузки: config → `chat_template.jinja` (перекрывает) → `additional_chat_templates/*.jinja` (мержится по имени файла) | [HF writing](https://huggingface.co/docs/transformers/main/en/chat_templating_writing) |
| F2 | Если шаблонов несколько — `apply_chat_template` берёт `tool_use` когда переданы tools, иначе `default` | там же |
| F3 | Констант в шаблоне только две: `messages` и `add_generation_prompt`. Всё остальное — произвольные kwargs (`tools`, `documents`, `enable_thinking`, …) плюс `special_tokens_map`; вызываемых функций две: `raise_exception`, `strftime_now` | там же |
| F4 | `continue_final_message=True` — это prefill: снимает EOS и продолжает последнее assistant-сообщение. С 4.x можно префиллить именованное поле (`reasoning_content` у Qwen, `thinking` у Gemma), чтобы не закрыть reasoning-блок | [HF chat_templating](https://huggingface.co/docs/transformers/main/en/chat_templating) |
| F5 | Tools всегда приходят в шаблон как список JSON Schema, но шаблон волен рендерить их как угодно — Command-R рендерит Python-хедеры функций | HF writing, §Tool definitions |
| F6 | HF сами предупреждают о non-Python Jinja: `.lower()`→`\|lower`, `.items()`→`\|dictitems`, `.strip()`→`\|trim`, `True/False/None`→`true/false/none`, dict/list печатать через `\|tojson` | там же, §Compatibility with non-Python Jinja |
| F7 | `@huggingface/jinja` 0.5.10, MIT, опубликован 2026-09-04 — «minimalistic JS implementation of Jinja, specifically designed for parsing and rendering ML chat templates». Экспорт: `Template`, `Environment`, `Interpreter`, `parse`, `tokenize` | `npm view` |
| F8 | LiteLLM (py) 1.100.1. `drop_params=True` — молча выкидывает неподдерживаемые параметры вместо исключения; `additional_drop_params` — явный список (с JSONPath для вложенных). Поддержка определяется картой «провайдер + модель»: `litellm.get_supported_openai_params("command-r")` | [drop_params](https://docs.litellm.ai/docs/completion/drop_params) |
| F9 | `supports_response_schema(model, custom_llm_provider)` — отдельная проверка от `response_format`; при отсутствии нативной поддержки есть клиентская валидация `litellm.enable_json_schema_validation=True` | [json_mode](https://docs.litellm.ai/docs/completion/json_mode) |
| F10 | OpenRouter: старые `transforms: ["middle-out"]` переехали в плагин `plugins:[{id:"context-compression"}]`; режет середину промта, «keep half of the messages from the start and half from the end»; включён по умолчанию на эндпоинтах ≤8k | [OpenRouter](https://openrouter.ai/docs/features/message-transforms) |
| F11 | `ai` (Vercel AI SDK): latest = 7.0.99 (2026-09-12), Apache-2.0; тег `ai-v6` = 6.0.282. То есть мы на предыдущем мажоре — это отдельное решение | `npm view ai dist-tags` |

## Разбор 1: HF chat templates — граница применимости

**Проба (verified).** `/private/tmp/claude-501/.../scratchpad/probe-prompt`: `@huggingface/jinja@0.5.10` рендерит боевой шаблон Qwen3-8B из TS/Node без правок.

- `chat_template.jinja` у `Qwen/Qwen3-8B` **отсутствует** (404 «Entry not found») — шаблон лежит в `tokenizer_config.json`, 4168 символов. Вывод: обе схемы хранения живы одновременно, единого пути нет.
- Отрендерили `{messages, tools, add_generation_prompt:true, enable_thinking:false}` и получили:
  - блок `# Tools` c `<tools>…</tools>` **вклеен внутрь system-сообщения**, тулы сериализованы как JSON Schema;
  - хвост `<|im_start|>assistant\n<think>\n\n</think>\n\n` — пустой закрытый reasoning-блок, то есть «выключение мышления» у Qwen это **приём в шаблоне**, а не параметр API.

| Ось | Покрывает ли chat template |
|---|---|
| Роли, разделители, BOS/EOS | да, полностью |
| Generation prompt / prefill | да (`add_generation_prompt`, `continue_final_message`) |
| Тулы (определения, вызовы, ответы) | да, но формат произвольный на усмотрение шаблона |
| Reasoning on/off | да, через ad-hoc kwarg (`enable_thinking`) — имя не стандартизировано |
| Язык ответа, тон, структура задачи | **нет**, это контент сообщений |
| JSON-схема ответа, `json_object`-костыли | **нет** |

**Ключевой вопрос — применимо ли к API-моделям.** Нет. Chat template — это функция «массив сообщений → строка токенов», она живёт там, где мы сами формируем текст: локальные веса, vLLM/TGI/llama.cpp, `/completions`. У OpenAI и Anthropic мы отдаём **массив сообщений**, шаблонизацию делает провайдер на своей стороне и Jinja нам недоступна. Qwen через DashScope/OpenAI-совместимый эндпоинт — та же история: шаблон применяет сервер.

Практический вывод: **HF-шаблоны нам как рантайм не нужны, нужны как источник знаний.** Из них читается, чего конкретная модель ждёт — что Qwen хочет `<tools>` в system, что reasoning отключается вставкой пустого `<think></think>`, какие роли модель вообще видела. Это ровно та «фраза, которую требуют модели Alibaba» из запроса заказчика — она вычитывается из шаблона, а не угадывается.

## Разбор 2: LiteLLM — прямой аналог нашего слоя адаптации

Их модель мира — три раздельных механизма, и это важная декомпозиция:

| Механизм | Что это | Форма |
|---|---|---|
| Карта возможностей | `model_prices_and_context_window.json` — **3923 записи** (проверено: скачан из `BerriAI/litellm@main`), плоские булевы флаги на модель | `supports_function_calling` (2447 записей), `supports_tool_choice` (2258), `supports_response_schema` (1444), `supports_reasoning` (1401), `supports_prompt_caching` (1089), `supports_system_messages` (706), `supports_assistant_prefill` (327), `supports_native_structured_output` (145), `supports_adaptive_thinking` (122), `supports_{minimal,max,xhigh,none}_reasoning_effort`, `supported_endpoints`, `supported_modalities` |
| Трансформация запроса | пер-провайдерный код, приводящий OpenAI-форму к нативной | `get_supported_openai_params()` + `drop_params` / `additional_drop_params` |
| Формат промта | `register_prompt_template()` с `roles: {system: {pre_message, post_message}, …}`, `initial_prompt_value`, `final_prompt_value`; для HF-моделей LiteLLM «automatically check if your huggingface model has a registered chat template» | только Huggingface, TogetherAI, Ollama, Petals |

Читается так: **для API-провайдеров LiteLLM промт не шаблонизирует вообще.** Там работают только карта флагов + трансформация параметров. Шаблон включается ровно там, где мы сами строим строку. Это ровно та граница, которую мы нашли в разборе 1, независимо подтверждённая.

Что берём: **форму карты**. Флаг на модель, а не на провайдера (`supports_assistant_prefill` есть у 327 записей — это не «Anthropic умеет prefill», это «вот эта модель умеет»). У нас в `docs/11-providers.md` это capability probes — совпадает по духу, надо только зафиксировать набор осей.

Что не берём: `drop_params` как дефолт. Молча выкинуть параметр — это молча изменить поведение; у нас есть `behavior_hash`, и тихая деградация ломает его смысл. Наш эквивалент — ошибка компиляции промта с явным опт-ином на деградацию.

## Разбор 3: Vercel AI SDK — что он уже нормализует

| Нормализует сам SDK | Оставляет пользователю |
|---|---|
| Роли и типы частей: `user / assistant / tool`, части `text / image / file / reasoning / tool-call / tool-result`; «не все модели поддерживают все типы сообщений и частей» | Содержание этих частей целиком |
| Системный промт как отдельное поле — в актуальных доках это `instructions` (не `system`); доки прямо мотивируют это защитой от prompt injection | Текст инструкции |
| Описание тулов и `tool_choice` поверх провайдеров | Формулировки в `description` тулов и полей схемы |
| Диагностику несовместимости: «Providers either throw exceptions or return warnings when they do not support a feature» — плюс `include.requestMessages: true` для инспекции реального запроса | Решение, что делать по warning'у |
| `providerOptions` — namespace по имени провайдера (`openai`, `anthropic`, …), задаётся на трёх уровнях: вызов, сообщение, часть сообщения; «only the options matching the active provider are used» | **Какие именно опции выставить под модель** |

Существенное: `providerOptions` — это **транспорт**, а не политика. SDK гарантирует, что чужие ключи отфильтруются, и всё. Решение «этой модели включить `structuredOutputs`, той дать prefill, третьей вклеить слово JSON» SDK не принимает и принимать не будет — это и есть наша дыра.

Замечание по версии: `ai@latest` = **7.0.99** (2026-09-12), тег `ai-v6` = **6.0.282**. Срез писался под v6 по постановке; если мы остаёмся на v6 — это надо зафиксировать решением, а не инерцией.

## Разбор 4: шлюзы

| Шлюз | Что делает с промтом | Оценка |
|---|---|---|
| OpenRouter | `plugins:[{id:"context-compression"}]` (бывшие `transforms:["middle-out"]`): выбрасывает середину промта, оставляя половину сообщений с начала и половину с конца. **Включён по умолчанию** на эндпоинтах ≤8k | Опасно молча: ломает кэш-точки и `behavior_hash`. Для нас — выключать явно |
| Portkey | Трансляция на уровне **параметров и формата API** (Chat Completions / Responses / Messages) по строке `@provider/model`. Контент сообщений не трогает | Тот же вывод, что у LiteLLM: контент — не его зона |
| Together / vLLM | `chat_template_kwargs` в теле запроса пробрасывается в HF-шаблон (`extra_body={"chat_template_kwargs":{"enable_thinking":false}}`); vLLM умеет серверный дефолт `--default-chat-template-kwargs`, request-level приоритетнее | **Единственный найденный мост** между API-вызовом и Jinja-шаблоном модели. Работает только для открытых весов за vLLM-подобным сервером |

## Вывод для нас

**Берём:**
1. **Форму карты возможностей** из LiteLLM: плоские флаги **на модель**, не на провайдера. Минимальный набор осей для `docs/11-providers.md`, названный их же словами: `supports_response_schema`, `supports_native_structured_output`, `supports_tool_choice`, `supports_assistant_prefill`, `supports_system_messages`, `supports_prompt_caching`, `supports_reasoning` + градации `reasoning_effort`. Это ровно те оси, на которых промт меняет форму.
2. **HF chat templates как источник знаний, не как рантайм.** Шаблон модели — это машинно читаемая спецификация того, чего модель ждёт: где она хочет тулы, какими маркерами открывается reasoning, какие роли видела. Забор фактов из шаблона в нашу карту — разовая процедура на модель, результат — данные в каталоге, не код.
3. **`chat_template_kwargs`** как отдельное поле профиля модели — там, где мы ходим в vLLM/Together.
4. **Warnings из AI SDK** как обязательный сигнал: warning на компиляции промта = ошибка сборки, а не лог.

**Не берём:**
- `@huggingface/jinja` в рантайм. Он проверен и работает (MIT, 0.5.10, свежий), но у нас движок `liquidjs` и правила R-T1..R-T13 построены на его AST. Второй шаблонизатор без статического анализа — это дыра в R-T6/R-T7/R-T8. Держим его как оффлайн-инструмент в `tools/`, если понадобится вычитывать шаблоны.
- `drop_params` как поведение по умолчанию. Тихое выбрасывание параметра меняет поведение, не меняя `behavior_hash`. Наш эквивалент — диагностика компилятора с явным опт-ином на деградацию.
- `middle-out` / context-compression. Выключаем явно: наши кэш-точки и оценка размера через `gpt-tokenizer` теряют смысл, если шлюз режет середину.

**Таблица «ось → кто закрывает → что делаем мы»**

| Ось адаптации | AI SDK | Шлюз | HF template | Делаем сами |
|---|---|---|---|---|
| Роли, части сообщений, транспорт | **да** | — | (да, для весов) | ничего |
| Системный промт как поле (`instructions`) | **да** | — | да | ничего |
| Сериализация тулов, `tool_choice` | **да** | — | да | ничего |
| Спецтокены, разделители, BOS/EOS | — | — | **да** (сервер) | ничего |
| Prefill / continue_final_message | транспорт есть | — | да (для весов) | **решение: когда префиллить и чем** |
| Форсирование тула вместо `response_format` | транспорт есть | — | — | **выбор режима по флагу модели** |
| Слово «JSON» в сообщениях под `json_object` | нет | нет | нет | **вставка в текст на компиляции** |
| Фраза, которую требует конкретная модель (Qwen и пр.) | нет | нет | видна в шаблоне | **слот-надстройка профиля модели** |
| `enable_thinking` / reasoning on-off | `providerOptions` | `chat_template_kwargs` | да | **выбор значения по флагу модели** |
| Блок формата вывода из типа | нет | нет | нет | **генерируем (08-prompts)** |
| Профиль JSON Schema под провайдера | частично | — | — | **ADR-0004** |
| Язык промта (R-T11) | нет | нет | нет | **целиком наше** |
| Кэш-точки | `providerOptions.cacheControl` | авто у некоторых | — | **расстановка границ** |
| Размер контекста / усечение | нет | режет молча | — | **считаем сами, компрессию шлюза выключаем** |

**Что проектируем.** Пер-модельная адаптация у нас — это **не второй шаблонизатор**, а *решатель над картой флагов*, который на входе имеет скомпилированный промт (liquidjs → IR) и профиль модели, а на выходе даёт: (а) добор текстовых фрагментов в сообщения, (б) выбор режима structured output, (в) заполнение `providerOptions` / `chat_template_kwargs`. Это чистая функция `(prompt_ir, model_profile) → request_plan`, и её вход обязан попадать в `spec_hash`/`behavior_hash` (`docs/04-ir-schema.md` §4.3): смена профиля модели — это смена промта, ровно как заказчик и просил про «зависимости».

Реактивная аналогия заказчика ложится сюда буквально: профиль модели — это контекст (в смысле React context), а фрагменты вроде «фраза для Qwen» или «слово JSON» — узлы, которые рендерятся условно от этого контекста. Дерево одно, рендер разный. Пересчёт хешей при смене профиля — это и есть «при изменении зависимостей промт меняется».
