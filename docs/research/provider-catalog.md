# Каталог моделей, цены, возможности, маршрутизация (§7.7)

Дата: 2026-09-11. Источники: локальные дампы API в scratchpad + офф. доки.
Дампы: `scratchpad/or-models.json`, `scratchpad/or-endpoints.json`, `scratchpad/modelsdev.json`, `scratchpad/tg.json`.

## 1. OpenRouter /api/v1/models — схема, объём, словарь возможностей

Источник: локальный дамп `scratchpad/or-models.json` (снят 2026-09-11), эндпоинт
`GET https://openrouter.ai/api/v1/models`. Конверт: `{ data: Model[], total_count: number, links: { next: null } }`.
**443 модели**, пагинации фактически нет (`links.next === null`), ключ API для этого эндпоинта не нужен.

### 1.1 Реальный объект (дословно из дампа, модель-алиас)

```json
{
  "id": "~openai/gpt-astra-latest",
  "canonical_slug": "~openai/gpt-astra-latest",
  "alias_target": { "name": "OpenAI: GPT-6 Astra", "slug": "openai/gpt-6-astra" },
  "hugging_face_id": null,
  "name": "OpenAI GPT Astra Latest",
  "created": 1789130932,
  "description": "This model always redirects to the latest model in the OpenAI GPT Astra family.",
  "context_length": 1050000,
  "architecture": {
    "modality": "text+image+file->text",
    "input_modalities": ["file", "image", "text"],
    "output_modalities": ["text"],
    "tokenizer": "Router",
    "instruct_type": null
  },
  "pricing": {
    "prompt": "0.00001",
    "completion": "0.00005",
    "web_search": "0.01",
    "input_cache_read": "0.000001",
    "input_cache_write": "0.0000125",
    "overrides": [
      { "min_prompt_tokens": 272000, "prompt": "0.00002", "completion": "0.000075",
        "input_cache_read": "0.000002", "input_cache_write": "0.000025" }
    ]
  },
  "top_provider": { "context_length": 1050000, "max_completion_tokens": 128000, "is_moderated": false },
  "per_request_limits": null,
  "supported_parameters": ["include_reasoning","max_completion_tokens","max_tokens","reasoning",
    "reasoning_effort","response_format","seed","structured_outputs","tool_choice","tools"],
  "default_parameters": {},
  "supported_voices": null,
  "knowledge_cutoff": null,
  "expiration_date": null,
  "links": { "details": "/api/v1/models/~openai/gpt-astra-latest/endpoints" },
  "reasoning": {
    "mandatory": true, "default_enabled": true,
    "supported_efforts": ["max","xhigh","high","medium","low"], "default_effort": "medium"
  }
}
```

### 1.2 Заполненность полей верхнего уровня (из 443)

| Поле | Присутствует | Замечания |
|---|---|---|
| `id`, `canonical_slug`, `name`, `created`, `description` | 443 | `created` — unix seconds; диапазон 2023-05-28 … 2026-09-11 |
| `context_length` | 443 | int; может отличаться от `top_provider.context_length` |
| `architecture` | 443 | всегда 5 ключей (см. ниже) |
| `pricing` | 443 | **все цены — СТРОКИ** (`"0.00001"`), USD **за 1 токен**, не за 1M |
| `top_provider` | 443 | `{context_length, max_completion_tokens, is_moderated}`; `max_completion_tokens: null` у 6 моделей; `is_moderated: true` у 122 |
| `per_request_limits` | 443, но **null у всех 443** | поле мёртвое, не закладываться |
| `supported_parameters` | 443 | наш главный словарь возможностей |
| `default_parameters` | 443 (непустой объект у 273) | почти всегда все значения `null` — реальных дефолтов там нет, поле бесполезно |
| `supported_voices` | 443, **null у всех** | мёртвое (TTS-модели в дампе не попались) |
| `knowledge_cutoff` | не-null у 187 | строка `"YYYY-MM-DD"` |
| `expiration_date` | не-null у **5** | строка `"YYYY-MM-DD"`; встречаются заглушки `"2098-12-31"` (= «не истекает») и реальные `"2026-09-30"`, `"2026-12-31"` |
| `hugging_face_id` | не-null у 316 | ключ для склейки с open-weights метаданными |
| `links.details` | 443 | относительный путь `/api/v1/models/{id}/endpoints` |
| `reasoning` | 313 | см. 1.4 |
| `benchmarks` | 250 | см. 1.5 |
| `alias_target` | 16 | `{name, slug}` — модель-алиас на конкретный слаг |

### 1.3 pricing.* — реальный словарь ключей (частота из 443)

| Ключ | N | Смысл |
|---|---|---|
| `prompt` | 443 | USD/входной токен |
| `completion` | 443 | USD/выходной токен |
| `input_cache_read` | 273 | чтение кэша промпта |
| `web_search` | 165 | USD **за запрос** веб-поиска, не за токен (`"0.01"`) |
| `input_cache_write` | 83 | запись кэша (у Anthropic — 5m TTL) |
| `overrides` | 69 | см. 1.3.1 |
| `audio` | 34 | входной аудио-токен |
| `internal_reasoning` | 32 | reasoning-токены тарифицируются отдельно (Gemini) |
| `image` | 31 | входной image-токен/изображение |
| `input_cache_write_1h` | 31 | Anthropic 1h-TTL кэш |
| `input_audio_cache` | 29 | |
| `image_output` | 9 | |
| `audio_output` | 2 | |
| `discount` | 0 в /models | **встречается только в endpoints API** (`"discount": 0`) |

Пример мультимодального прайса (`google/gemini-3.8-flash`):
```json
{"prompt":"0.00000075","completion":"0.00000375","image":"0.00000075","audio":"0.00000075",
 "input_audio_cache":"0.000000075","web_search":"0.014","internal_reasoning":"0.00000375",
 "input_cache_read":"0.000000075","input_cache_write":"0.0000000416666666666667"}
```
Обрати внимание на `"0.0000000416666666666667"` — точность строки хуже double; **хранить как DECIMAL/строку, считать в целых микроцентах или decimal.js**, иначе поплывут суммы.

#### 1.3.1 pricing.overrides — цена не константа

69 моделей имеют условный прайс. Ключи внутри override (частоты): `prompt` 80, `completion` 80,
`min_prompt_tokens` 72, `input_cache_read` 62, `input_cache_write` 33, `audio` 8, `input_audio_cache` 7,
`utc_start` 7, `utc_end` 7, `utc_days` 6, `input_cache_write_1h` 3.

Два типа условий:
1. **Long-context tier** — `min_prompt_tokens`. Пример `~openai/gpt-astra-latest`: свыше 272k входных токенов
   prompt 1e-5 → 2e-5, completion 5e-5 → 7.5e-5. Т.е. цена зависит от размера запроса.
2. **Off-peak окно** — `utc_days` + `utc_start`/`utc_end`. Пример `deepseek/deepseek-v4.1-flash`:
   ```json
   {"utc_days":["monday","tuesday","wednesday","thursday","friday"],"utc_start":0,"utc_end":100,
    "prompt":"0.00000015","completion":"0.0000006","input_cache_read":"0.000000003"}
   ```
   `utc_start`/`utc_end` — **не часы**; 0..100 похоже на сотые доли суток / минуты*?; формат
   в офф. доках не описан. UNVERIFIED: точная единица `utc_start`/`utc_end`.

**Вывод для §7.7:** оценка стоимости — это функция `estimate(model, promptTokens, completionTokens, at: Date)`,
а не умножение на две константы. Правило выбора override: применяем override, если выполнены все его условия;
базовый прайс — fallback.

### 1.4 reasoning — отдельный объект (313 моделей)

Ключи: `mandatory` 313, `supported_efforts` 169, `default_effort` 169, `default_enabled` 150, `supports_max_tokens` 10.

Комбинации `(mandatory, default_enabled)`: `(True,True)` 34, `(False,True)` 93, `(False,None)` 93,
`(True,None)` 70, `(False,False)` 23.

`supported_efforts` (частоты): `high` 164, `low` 140, `medium` 129, `xhigh` 77, `max` 67, `none` 51, `minimal` 34.

**Это критично для IR:** `mandatory: true` (104 модели) означает, что reasoning нельзя выключить —
узел, который рассчитывает на «дешёвый быстрый ответ без think», на такой модели даст другую
латентность и цену. Валидатор должен ругаться на `reasoning_effort: "none"` для `mandatory: true`.
Уровни усилий **не унифицированы**: `minimal`/`none`/`xhigh`/`max` есть не у всех — сопоставление
нашего enum (`off|low|med|high`) с провайдерным нужно делать через таблицу, а не проброс строки.

### 1.5 benchmarks (250 моделей) — не полагаться

Два ключа: `design_arena` 250, `artificial_analysis` 187. Форма:
```json
{"design_arena": [], "artificial_analysis": {"intelligence_index": 24.8, "coding_index": 57, "agentic_index": 30}}
```
`design_arena` сплошь пустые массивы в дампе. `artificial_analysis` — три индекса. Годится как
слабый сигнал для авто-подбора модели («не хуже N по coding_index»), но не как SLA.

### 1.6 architecture

Всегда `{modality, input_modalities, output_modalities, tokenizer, instruct_type}`.
`input_modalities`: text 443, image 274, file 170, video 80, audio 46. `output_modalities`: text 443, image 11, audio 4.
Топ `modality`: `text->text` 156, `text+image+file->text` 120, `text+image->text` 56, `text+image+video->text` 43,
`text+image+file+audio+video->text` 32.
`tokenizer` (для оценки токенов до вызова): Other 128, GPT 93, Qwen3 37, Gemini 36, Claude 27, Mistral 27,
Router 22, Qwen 19, DeepSeek 17, Llama3 11, Grok 7, Gemma 5, Nova 5, Cohere 4.
`modality` — производная строка от двух массивов; парсить массивы, а не строку.

### 1.7 supported_parameters — НАШ СЛОВАРЬ ВОЗМОЖНОСТЕЙ (частоты из 443)

| Параметр | N | % | Комментарий для IR |
|---|---:|---:|---|
| `max_tokens` | 430 | 97% | базовый |
| `response_format` | 381 | 86% | `{type:"json_object"}` — слабый JSON-режим |
| `tools` | 377 | 85% | **гейт для tool-узлов** |
| `tool_choice` | 369 | 83% | без него нельзя форсировать вызов |
| `structured_outputs` | 361 | 81% | **гейт для строгого JSON-Schema выхода** |
| `temperature` | 353 | 80% | |
| `seed` | 335 | 76% | **гейт для воспроизводимости/кассет** |
| `top_p` | 335 | 76% | |
| `reasoning` / `include_reasoning` | 312 | 70% | пара всегда вместе |
| `stop` | 310 | 70% | |
| `frequency_penalty` | 242 | 55% | |
| `presence_penalty` | 235 | 53% | |
| `top_k` | 218 | 49% | |
| `reasoning_effort` | 172 | 39% | ≠ 312 у `reasoning`: часть моделей умеет reasoning без градаций |
| `repetition_penalty` | 157 | 35% | |
| `logprobs` / `top_logprobs` | 155 | 35% | **гейт для confidence-метрик и self-consistency** |
| `logit_bias` | 147 | 33% | |
| `min_p` | 117 | 26% | |
| `max_completion_tokens` | 63 | 14% | OpenAI-стиль; **не путать с `max_tokens`** |
| `verbosity` | 21 | 5% | |
| `web_search_options` | 19 | 4% | |
| `top_a` | 12 | 3% | |
| `prediction` | 12 | 3% | speculative decoding |
| `parallel_tool_calls` | 9 | 2% | **всего 9 моделей** — параллельные тулколы объявляют единицы |

**Ровно 26 значений — это закрытый enum `CapabilityFlag` для нашего каталога.**
Четыре флага, на которых строится валидация IR: `structured_outputs`, `tools`, `seed`, `logprobs`.

Ловушки:
- `structured_outputs` в `supported_parameters` — это объявление OpenRouter, а не гарантия; реальное
  соблюдение схемы проверяем capability probe (§7).
- `parallel_tool_calls` заявлен у 9/443 — если наш узел полагается на параллельные тулколы, планировщик
  должен деградировать до последовательных вызовов почти везде.
- список **per-model**; у конкретного провайдера модели набор другой (см. §2) — фильтровать надо
  по endpoint-уровню, если включён `require_parameters`.
- 22 модели с `pricing.prompt === "0"` (суффикс `:free`) — отдельная политика (жёсткие рейт-лимиты,
  часто `data_collection` не гарантирован).

## 2. OpenRouter endpoints API + provider routing

### 2.1 `GET /api/v1/models/{author}/{slug}/endpoints`

Источник: дамп `scratchpad/or-endpoints.json` (реальный ответ для `anthropic/claude-fable-5.1`).
Конверт: `{ "data": { id, name, created, description, architecture, endpoints: Endpoint[] } }` —
т.е. шапка модели + **массив провайдеров, каждый со своей ценой и своими возможностями**.

Реальный элемент `endpoints[]` (дословно):
```json
{
  "name": "Azure | anthropic/claude-fable-5.1-20260831",
  "model_id": "anthropic/claude-fable-5.1",
  "model_name": "Anthropic: Claude Fable 5.1",
  "context_length": 1000000,
  "pricing": {
    "prompt": "0.00001", "completion": "0.00005", "web_search": "0.01",
    "input_cache_read": "0.00000025", "input_cache_write": "0.0000125",
    "input_cache_write_1h": "0.00002", "discount": 0
  },
  "provider_name": "Azure",
  "tag": "azure",
  "quantization": "unknown",
  "max_completion_tokens": 128000,
  "max_prompt_tokens": null,
  "supported_parameters": ["reasoning","include_reasoning","structured_outputs","max_tokens",
    "max_completion_tokens","tools","response_format","verbosity","stop","reasoning_effort"],
  "supports_tool_choice": { "none": true, "auto": true, "required": true, "function": true },
  "status": 0,
  "uptime_last_30m": null, "uptime_last_5m": null, "uptime_last_1d": 99.45459503681484,
  "supports_implicit_caching": false,
  "supports_voice_cloning": false,
  "latency_last_30m": null, "throughput_last_30m": null
}
```

Что тут есть, чего НЕТ в `/models`:
- **`tag`** — машинный слаг провайдера (`azure`, `anthropic`, `amazon-bedrock`, `google-vertex/global`).
  Именно `tag` идёт в `provider.order` / `only` / `ignore`. Обрати внимание на составной
  `google-vertex/global` — регион зашит в слаг.
- **`pricing.discount`** (число, 0 в примере) — скидка провайдера; в `/models` этого поля нет.
- **`quantization`** — `"unknown"` у закрытых моделей; у open-weights это `fp8`/`int4`/`bf16`/…
  Для воспроизводимости прогонов квантование обязано быть в провенансе: одна и та же модель на
  fp8 и bf16 даёт разные выходы.
- **`max_prompt_tokens`** (null у Anthropic) — отдельный лимит входа, ≠ `context_length`.
- **`supports_tool_choice`** — детализация до 4 булевых режимов (`none/auto/required/function`).
  В `/models` это один флаг `tool_choice`. Для узла «обязан вызвать тул» нужен `required: true`.
- **`supports_implicit_caching`** — провайдер кэширует сам (Gemini-стиль), без явных `cache_control`.
- **Телеметрия:** `status` (0 = ok), `uptime_last_5m/30m/1d`, `latency_last_30m`, `throughput_last_30m`.
  Много null — метрики есть не у всех провайдеров.

**Ключевой факт для §7.7:** `supported_parameters` **различаются между провайдерами одной модели**.
В примере у Azure есть `structured_outputs`, у Google Vertex — **нет** (список:
`max_tokens, stop, reasoning, include_reasoning, tools, response_format, verbosity, reasoning_effort`).
То есть узел со строгим JSON-Schema выходом на `anthropic/claude-fable-5.1` **упадёт или деградирует,
если роутер уведёт его на Vertex**. Отсюда обязательное правило компилятора:
> любой узел с `structured_outputs`/`tools`/`seed` компилируется с `provider.require_parameters: true`,
> иначе гарантия типизации не держится.

Цены в примере у всех четырёх провайдеров одинаковые (Anthropic держит прайс-паритет), но у
open-weights моделей разброс по провайдерам кратный — оценку стоимости считать по выбранному
endpoint, а не по `/models`.

### 2.2 provider routing — объект `provider` в теле запроса

Источник: https://openrouter.ai/docs/features/provider-routing (проверено 2026-09-11).

| Поле | Тип | Дефолт | Семантика |
|---|---|---|---|
| `order` | `string[]` | — | слаги провайдеров в порядке попытки |
| `allow_fallbacks` | `boolean` | `true` | разрешить запасных провайдеров |
| `require_parameters` | `boolean` | **`false`** | только провайдеры, поддерживающие ВСЕ параметры запроса |
| `data_collection` | `"allow" \| "deny"` | `"allow"` | фильтр по политике хранения данных |
| `zdr` | `boolean` | — | только Zero-Data-Retention эндпоинты |
| `enforce_distillable_text` | `boolean` | — | только модели, разрешающие дистилляцию текста |
| `only` | `string[]` | — | allowlist слагов |
| `ignore` | `string[]` | — | blocklist слагов |
| `quantizations` | `string[]` | — | фильтр по квантованию (`int4`, `fp8`, `bf16`, …) |
| `sort` | `string \| object` | — | `"price"` \| `"throughput"` \| `"latency"`; объектная форма `{by, partition}` |
| `preferred_min_throughput` | `number \| object` | — | токенов/сек, перцентильная форма `{p90: 50}` (p50…p99) |
| `preferred_max_latency` | `number \| object` | — | секунды, перцентильная форма |
| `max_price` | `object` | — | потолок `{"prompt": x, "completion": y}` (USD за 1M токенов) |

Пример:
```json
{
  "model": "meta-llama/llama-3.3-70b-instruct",
  "messages": [{"role": "user", "content": "Hello"}],
  "provider": {
    "sort": { "by": "throughput", "partition": "none" },
    "preferred_min_throughput": { "p90": 50 },
    "allow_fallbacks": true,
    "data_collection": "deny"
  }
}
```

**Поведение по умолчанию** (дословно из доков): price-based load balancing — (1) отсеиваются
провайдеры с недавними сбоями (окно 30 секунд), (2) среди оставшихся вероятность выбора
обратно пропорциональна **квадрату** цены, (3) остальные идут в фолбэк.
**Load balancing выключается, как только задан `sort` или `order`.**

`zdr` работает как OR с аккаунт-уровневой настройкой: «if any of them is enabled, ZDR enforcement
is applied» — пер-реквестный флаг может только включить ZDR, но не отключить аккаунтный.

### 2.3 Что из этого попадает в наш IR

Предлагаемый блок `routing` на узле (компилируется 1:1 в `provider`):
```ts
type Routing = {
  order?: string[];            // provider tags
  only?: string[]; ignore?: string[];
  allow_fallbacks?: boolean;   // default true
  require_parameters?: boolean;// МЫ ставим true автоматически, если узел требует capability
  data_collection?: 'allow' | 'deny';
  zdr?: boolean;
  quantizations?: string[];    // для воспроизводимости
  sort?: 'price' | 'throughput' | 'latency';
  max_price?: { prompt?: number; completion?: number };
};
```
Подводные камни, которые надо явно описать в доке:
1. `require_parameters: false` по умолчанию — **тихая деградация** типизации. Наш компилятор
   обязан выставлять `true`.
2. `sort`/`order` отключают балансировку → фиксированный провайдер, но выше риск получить 429/5xx;
   держать `allow_fallbacks: true`, кроме режима строгой воспроизводимости.
3. Детерминизм невозможен без фиксации провайдера И квантования: `only: ['<tag>']` +
   `quantizations: ['bf16']` + `seed`. Даже так — это best effort, не гарантия.
4. `max_price` — единственный встроенный предохранитель от «модель подорожала» между синками каталога.

## 3. Together AI — модели, цены, batch inference

### 3.1 Дамп tg.json НЕ СОСТОЯЛСЯ

`scratchpad/tg.json` содержит ровно `Missing API key` (15 байт). Т.е. `GET /v1/models` у Together
**требует `Authorization: Bearer $TOGETHER_API_KEY`** — в отличие от OpenRouter `/api/v1/models`
и models.dev `/api.json`, которые открыты. Это само по себе архитектурный факт: Together нельзя
синкать в каталог без ключа, значит синк каталога — это задача с секретами, а не анонимный крон.

### 3.2 Схема `GET https://api.together.ai/v1/models`

Источник: https://docs.together.ai/reference/models-1 (OpenAPI, проверено 2026-09-11).
Ответ — **плоский массив** (без конверта `{data}`, в отличие от OpenAI-совместимых):

```json
[
  {
    "id": "Austism/chronos-hermes-13b",
    "object": "model",
    "created": 1692896905,
    "type": "chat",
    "display_name": "Chronos Hermes (13B)",
    "organization": "Austism",
    "license": "other",
    "context_length": 2048,
    "pricing": { "base": 0, "finetune": 0, "hourly": 0, "input": 0.3, "output": 0.3, "cached_input": 0.2 }
  }
]
```

Поля: `id`, `object`, `created` (unix), `type` (enum `chat|language|code|image|embedding|moderation|rerank`),
`display_name?`, `organization?`, `link?`, **`license?`**, `context_length?`,
`pricing { base, finetune, hourly, input, output, cached_input? }`.

Отличия от OpenRouter, важные для нормализации:
- **цены — числа, не строки**; OpenAPI подписывает `input`/`output` как «price per token», но в примере
  `0.3` для 13B-модели — это очевидно **$/1M токенов**. UNVERIFIED: точная единица `pricing.input`;
  проверять эмпирически по счёту, до этого не смешивать с OpenRouter в одной колонке.
- есть `hourly` и `base`/`finetune` — Together продаёт **выделенные инстансы по часам** и файнтюн;
  наш каталог должен уметь модель ценообразования «за час», а не только «за токен».
- **`license`** на модель (open-weights). Ни OpenRouter, ни models.dev (кроме `open_weights: bool`)
  этого не дают. Для корпоративных воркфлоу это фильтр («только Apache-2.0/MIT»).
- **нет `supported_parameters`** — словаря возможностей у Together нет вообще. Возможности
  добираем из models.dev (`togetherai`: 38 моделей) или собственным capability probe (§7).
- `type` даёт роль модели (`embedding`/`rerank`/`moderation`), чего нет у OpenRouter.

### 3.3 Batch Inference

Источник: https://docs.together.ai/docs/batch-inference (проверено 2026-09-11). Точные цифры:

| Параметр | Значение (дословно) |
|---|---|
| Скидка | «Up to 50% off serverless rates» |
| Модели со скидкой | только отдельные, названы `meta-llama/Llama-3.3-70B-Instruct-Turbo` и `openai/whisper-large-v3` |
| Запросов в батче | «Up to 50,000 requests per batch» |
| Размер входного файла | «Up to 100 MB per input file» |
| Размер строки | «Up to 10 MB per line in the input file» |
| Очередь | «Up to 30B tokens enqueued per model at any time» |
| Окно выполнения | «Completion window defaults to `24h` and cannot be changed; it is a best-effort target» |
| Эскалация | если статус `IN_PROGRESS` — ждать минимум 72 часа до обращения в саппорт |

API: батч подаётся JSONL, каждая строка — обычный запрос к `/v1/chat/completions`
(аудио: `/v1/audio/transcriptions`, `/v1/audio/translations`). CLI:
```bash
tg batches submit batch_input.jsonl --api chat.completions
tg batches get <BATCH_ID>
tg batches download <BATCH_ID> --output batch_output.jsonl
```
**Критично:** «batch job results are returned in arbitrary order» — сверка только по `custom_id`.

### 3.4 Что это значит для наших воркфлоу

Батч — это **не оптимизация вызова, а другой режим исполнения узла**: 24h best-effort окно
несовместимо с синхронным шагом. Ложится ровно на `suspend/resume` VoltAgent (см. заметку ведущего):
узел `llm.batch` сабмитит батч → `suspend` → внешний планировщик поллит `tg batches get` → `resume`
с результатами, склеенными по `custom_id`. Скидка 50% применима только к белому списку моделей,
поэтому в IR это опция узла (`execution: "batch"`), валидируемая по каталогу, а не глобальный флаг.

## 4. models.dev — второй источник каталога

### 4.1 Что это

Открытая база моделей `sst/models.dev` (те же авторы, что OpenCode/SST).
- Репозиторий: https://github.com/sst/models.dev — **лицензия MIT**, описание «An open-source
  database of AI models», ★6821, последний push **2026-09-11** (в день проверки) → источник живой,
  риска заброшенности нет (проверено через api.github.com/repos/sst/models.dev, 2026-09-11).
- API: `GET https://models.dev/api.json` — один статический JSON, без ключа. Дамп:
  `scratchpad/modelsdev.json`, **4.6 MB**.
- Наполнение — PR'ами в репозиторий (TOML-файлы на модель), т.е. данные **курируемые вручную**,
  не выгрузка из провайдерских API. Это одновременно плюс (есть поля, которых нет ни у кого)
  и минус (лаг и пропуски по свежим моделям).

### 4.2 Покрытие (посчитано по дампу)

- **213 провайдеров**, **7717 моделей** суммарно.
- Форма: `{ [providerId]: { id, env: string[], npm: string, api?: string, name, doc, models: { [modelId]: Model } } }`.
  `api` заполнен у 187/213; у `anthropic`/`openai` его нет (дефолтный базовый URL знает SDK).
- Провайдер несёт то, чего нет нигде: **`env`** (имена переменных окружения, напр. `["ANTHROPIC_API_KEY"]`)
  и **`npm`** (какой AI SDK-провайдер ставить, напр. `@ai-sdk/anthropic`, `@ai-sdk/togetherai`).
  Для нашего реестра провайдеров это готовый маппинг «provider → пакет → env».
- `openrouter` присутствует как провайдер (365 моделей), `togetherai` — 38 моделей.

### 4.3 Схема модели (реальный объект, `anthropic/claude-opus-5`)

```json
{
  "id": "claude-opus-5", "name": "Claude Opus 5",
  "description": "Strongest Claude Opus model for coding, agents, and professional work",
  "family": "claude-opus",
  "attachment": true, "reasoning": true,
  "reasoning_options": [{ "type": "effort", "values": ["low","medium","high","xhigh","max"] }],
  "tool_call": true, "structured_output": true, "temperature": false,
  "knowledge": "2026-05", "release_date": "2026-07-24", "last_updated": "2026-07-24",
  "modalities": { "input": ["text","image","pdf"], "output": ["text"] },
  "open_weights": false,
  "limit": { "context": 1000000, "output": 128000 },
  "experimental": { "modes": { "fast": {
      "cost": { "input": 10, "output": 50, "cache_read": 1, "cache_write": 12.5 },
      "provider": { "body": { "speed": "fast" }, "headers": { "anthropic-beta": "fast-mode-2026-02-01" } } } } },
  "cost": { "input": 5, "output": 25, "cache_read": 0.5, "cache_write": 6.25 }
}
```

Заполненность полей (из 7717):

| Поле | N | Комментарий |
|---|---:|---|
| `id`,`name`,`description`,`attachment`,`reasoning`,`tool_call`,`release_date`,`last_updated`,`modalities`,`open_weights`,`limit` | 7717 | обязательные |
| `cost` | 7281 | **USD за 1M токенов, числом** (≠ OpenRouter, где строка за 1 токен) |
| `temperature` | 7229 | булево «можно ли менять temperature» — у Opus 5 `false` |
| `family` | 7077 | группировка версий |
| `reasoning_options` | 5549 | типы: `effort` 3301, `toggle` 1224, `budget_tokens` 672 |
| `structured_output` | 5306 | |
| `knowledge` | 4074 | `"YYYY-MM"` |
| `interleaved` | 1003 | interleaved thinking |
| `provider` | 305 | пер-модельный override `{npm, api}`, напр. `{"npm":"@ai-sdk/anthropic","api":"https://agentrouter.org/v1"}` |
| **`status`** | 264 | значения: **`"deprecated"` 195**, `"beta"` 69 |
| `experimental` | 38 | альтернативные режимы со своей ценой и своими headers/body |

`cost.*` ключи: `input` 7281, `output` 7281, `cache_read` 4753, `cache_write` 1538, `tiers` 452,
`context_over_200k` 396, `reasoning` 151, `input_audio` 127, `output_audio` 18.

### 4.4 Вердикт: годится, но как ВТОРОЙ источник и только для части полей

Берём из models.dev то, чего нет у OpenRouter:
1. **`status: "deprecated"`** — единственный явный сигнал депрекейта на 195 моделей.
   У OpenRouter `expiration_date` заполнен всего у 5/443 и содержит мусорные заглушки `2098-12-31`.
2. **`env` + `npm`** — генерация реестра провайдеров и проверка «есть ли ключ» без хардкода.
3. **`temperature: false`** — OpenRouter просто не кладёт `temperature` в `supported_parameters`;
   models.dev говорит это явно, плюс покрывает провайдеров, которых в OpenRouter нет.
4. **`reasoning_options[].type`** — различает `effort` / `toggle` / `budget_tokens`. У OpenRouter
   есть только `supported_efforts` + `supports_max_tokens` (у 10 моделей). Для узла с бюджетом
   размышления это принципиально.
5. **`experimental.modes`** — готовые пресеты «другой режим = другая цена + свои заголовки».

НЕ берём: `cost` как истину для биллинга (курируется руками, лаг), и не берём как источник
`context`/`output` при расхождении с провайдерским API.

Риски:
- единицы измерения цены **разные** (models.dev — $/1M числом; OpenRouter — $/токен строкой);
  нормализовать на входе в наш каталог, иначе ошибка в 10^6.
- id моделей у одного и того же провайдера пишутся по-разному (`claude-opus-5` vs
  OpenRouter `anthropic/claude-opus-5`); нужна таблица соответствий, а не строковая склейка.
- 4.6 MB одним файлом — тянуть по расписанию и диффать, не на каждый запрос.

## 5. Учёт фактической стоимости (usage у OpenAI/Anthropic/OpenRouter)
TODO

## 6. Наша модель данных каталога
TODO

## 7. Capability probe
TODO
