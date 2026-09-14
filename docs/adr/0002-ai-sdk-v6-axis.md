# ADR-0002. Ось AI SDK v6 и изоляция провайдеров в пакете @wf/llm

> Статус: принято
> Дата: 2026-09-11
> Контекст-документы: [11. Провайдеры](../11-providers.md), [20. Репозиторий и инструменты](../20-repo-and-tooling.md), [02. Архитектура](../02-architecture.md), [Сквозные решения](../DECISIONS.md); research/ai-sdk-decision.md, research/00-verified-by-lead.md; [ADR-0001](0001-execution-core-on-voltagent.md)

## Контекст

Фундамент исполнения — `@voltagent/core@2.10.0` ([ADR-0001](0001-execution-core-on-voltagent.md)),
и он жёстко диктует мажор LLM SDK:

- `@voltagent/core@2.10.0` объявляет peer `ai: ^6.0.0`, `@ai-sdk/provider-utils: 4.x`, `zod: ^3.25.0 || ^4.0.0`.
- `npm i @voltagent/core@2.10.0 ai@7` падает с ERESOLVE (`peer ai@"^6.0.0" from @voltagent/core@2.10.0`) — проверено резолвом.
- `ai@7.0.97` — текущий `latest`; наш пин `6.0.280` (опубликован 2026-09-09, патчи v6 выходят).

Главная опасность не в конфликте, а в его **отсутствии на уровне npm**. Проверено чтением
`package.json` в реально установленном дереве: официальные пакеты `@ai-sdk/*` **вообще не имеют
peer-зависимости на `ai`** — их единственный peer это `zod`. Связь с рантаймом идёт обычными
зависимостями `@ai-sdk/provider` и `@ai-sdk/provider-utils`. Значит npm молча поставит провайдер
линии v7, модель отдаст `specificationVersion: 'v4'`, `ai@6` умеет только `v3` — и сломается это
**в рантайме**, без единого предупреждения при установке.

Ось совместимости:

| Линия | `ai` | `@ai-sdk/provider` | `@ai-sdk/provider-utils` | Спека моделей | Мажоры провайдеров |
|---|---|---|---|---|---|
| **v6 (наша)** | 6.0.280 | **3.0.16** | **4.0.51** | `LanguageModelV3` | openai/anthropic/google/xai/azure/groq/mistral/cohere/bedrock/gateway = **3.x**; openai-compatible/togetherai/cerebras/deepinfra/deepseek = **2.x** |
| v7 | 7.0.97 | 4.0.13 | 5.0.39 | `LanguageModelV4` | openai = 4.x, openai-compatible/togetherai = 3.x |

Отдельно про OpenRouter: конфликта нет. Несовместима ветка `@openrouter/ai-sdk-provider@3.x`
(peer `ai: ^7.0.0`); линия **2.10.0** объявляет peer `ai: ^6.0.0` — ровно то, что требует VoltAgent.
Обе зависимости проверены в одном дереве, смоук-прогон дал `specificationVersion = v3` у всех четырёх
провайдеров (`openrouter`, `openai-compatible`, `togetherai`, `openai`) — в узлах они взаимозаменяемы.
Цена: `3.0.0` вышел 2026-08-14, апстрим ушёл на `ai@7`, 2.x — maintenance.

Ещё одна деталь: 20+ провайдеров приходят **прямыми dependencies** `@voltagent/core@2.10.0`,
причём `@ai-sdk/google-vertex@3.0.174` тянет вложенные `@ai-sdk/openai-compatible@1.0.54`
и `@ai-sdk/anthropic@2.0.102`. Полагаться на транзитивный хойстинг нельзя.

## Решение

Стандартизируемся на **`ai@6`, пин `6.0.280`**, потому что рантайм-фундамент определяет мажор.
Ось фиксируется `overrides` в корне монорепо, провайдеры объявляются явно, а весь AI SDK прячется
за одним пакетом.

```json
{
  "overrides": {
    "ai": "6.0.280",
    "@ai-sdk/provider": "3.0.16",
    "@ai-sdk/provider-utils": "4.0.51"
  }
}
```

Явные зависимости `@wf/llm` (не транзитивный хойстинг): `@ai-sdk/openai ^3.0.112`,
`@ai-sdk/anthropic ^3.0.117`, `@ai-sdk/google ^3.0.122`, `@ai-sdk/openai-compatible ^2.0.75`,
`@ai-sdk/togetherai ^2.0.81`, `@openrouter/ai-sdk-provider ^2.10.0`, `zod ^4.6.2`.

**Изоляция.** Единственный пакет, импортирующий `ai`, `@ai-sdk/*`, `@openrouter/*`, — `@wf/llm`.
Наружу торчат только наши типы (Dependency Inversion):

```
packages/llm/src/
  ports.ts              LlmCallSpec, StructuredResult, ModelRef, Usage, Provenance
  provider-registry.ts  createProviderRegistry(): 'openrouter:openai/gpt-5.1' -> LanguageModel
  model-factory.ts      сборка модели + wrapLanguageModel(middleware)
  middleware/           cassette, budget, pii-redaction, telemetry, retry
  structured.ts         единственный Output.object во всём монорепо
  text.ts               единственный generateText/streamText
  telemetry.ts          TelemetrySettings, registerTelemetryIntegration
  index.ts              реэкспорт ТОЛЬКО наших типов
```

Реестр моделей строим на штатном `createProviderRegistry` из `ai@6` — свой не пишем.
Запрет прямых импортов — правило `no-restricted-imports` на `ai`, `@ai-sdk/*`, `@openrouter/*`
везде, кроме `packages/llm/src/**`.

## Альтернативы

| Альтернатива | Почему отвергнута | При каких условиях вернёмся |
|---|---|---|
| `ai@7` + `@openrouter/ai-sdk-provider@3.x` | `@voltagent/core@2.10.0` не устанавливается: ERESOLVE на peer `ai: ^6.0.0` | Как только выйдет `@voltagent/core` с peer `ai: ^7` — это и есть триггер миграции |
| `ai@7` через `--force` / `--legacy-peer-deps` | Установка пройдёт, рантайм — нет: VoltAgent ожидает `LanguageModelV3`, провайдеры v7 отдают `v4` | Никогда |
| Без `overrides`, полагаться на peer-резолв | У `@ai-sdk/*` нет peer на `ai`; npm поставит линию v7 молча, поломка всплывёт в проде | Никогда |
| Транзитивные провайдеры из `@voltagent/core` вместо явных зависимостей | Ломается при переезде на pnpm/yarn PnP; вложенные дубли (`google-vertex` → `openai-compatible@1.0.54`) путают резолв типов | Никогда |
| `@ai-sdk/openai-compatible@2.0.75` с `baseURL` OpenRouter вместо родного провайдера | Теряем OpenRouter-специфику, доступную только через `providerOptions.openrouter`: `provider.order`, `allow_fallbacks`, список `models` для fallback, `transforms`, `reasoning`-блок, usage/cost | План Б: если 2.x перестанет работать с актуальным API OpenRouter. Ось при этом не меняется |
| Импорт `ai`/`@ai-sdk/*` из любого пакета | Миграция v6→v7 превращается в широкий diff по всему монорепо вместо правки одного пакета | Никогда |

## Последствия

**Положительные**
- Одно дерево, одна спека моделей `v3` — четыре проверенных провайдера взаимозаменяемы в узлах без ветвлений в коде.
- Миграция v6→v7 = правка `packages/llm`; вне его — ноль правок.
- Контракт структурированного вывода (`schema`/`schemaName`/`schemaDescription`/`output`) в миграции **не ломается** — основной удар по `system`→`instructions`, телеметрии и семантике `usage`.

**Отрицательные**
- Сидим на maintenance-линии: `ai@7` уже `latest`, `@openrouter/ai-sdk-provider@2.x` заморожен с 2026-08-14. Окно закрывается, миграцию нельзя откладывать бесконечно.
- `overrides` — глобальный молоток: любая зависимость, которой нужен `ai@7`, сломается на установке (и это желаемое поведение).
- `@voltagent/core` тянет 20+ провайдеров прямыми deps — размер образа и `node_modules` мы не контролируем.

**Обязаны делать**
1. `overrides` на три пакета оси в корневом `package.json`; изменение любого — только через ADR.
2. Объявлять провайдеры явно, с мажором из таблицы оси.
3. `no-restricted-imports` на `ai`, `@ai-sdk/*`, `@openrouter/*` вне `packages/llm/src/**`.
4. `structured.ts` — единственная точка структурированного вывода, `text.ts` — единственная точка `generateText`/`streamText` (см. [ADR-0003](0003-model-middleware.md)).
5. Зафиксировать `engines.node` и не прыгать на Node 22-only раньше миграции.
6. Держать список изменений v6→v7 актуальным в [11. Провайдеры](../11-providers.md) — он же план миграции.

## Проверка

| Что проверяем | Как |
|---|---|
| Спека моделей | vitest-гард (`probe/smoke.mjs`, доведённый до теста): для каждой зарегистрированной в реестре модели `model.specificationVersion === 'v3'` |
| Единственность оси | Тот же гард: `@ai-sdk/provider` резолвится в единственный путь; `ai` — ровно версия `6.0.280` |
| Изоляция | ESLint `no-restricted-imports`; сборка падает, если `ai`/`@ai-sdk/*`/`@openrouter/*` импортирован вне `packages/llm/src/**` |
| Отсутствие обходных путей | CI запрещает `--force` и `--legacy-peer-deps` на установке; lock-файл в репозитории обязателен |
| Kill-критерий | Ошибка спеки версии модели в рантайме недопустима: гард выполняется в CI до интеграционных тестов, при провале сборка блокируется |

## Пересмотр

- **Основной триггер:** выход `@voltagent/core` с peer `ai: ^7`. Тогда одним коммитом: `ai@7` + `@ai-sdk/provider@4` + `@ai-sdk/provider-utils@5` + `@ai-sdk/openai@4` + `openai-compatible@3` + `togetherai@3` + `@openrouter/ai-sdk-provider@3` + новый `@ai-sdk/otel`; предварительно проверить Node ≥ 22 и ESM-only (в v7 `require()` убран). Точечный diff внутри `packages/llm`: `system`→`instructions` (плюс `allowSystemInMessages` для системных сообщений внутри `messages`), `experimental_telemetry`→`telemetry` с выносом OTel в `@ai-sdk/otel`, opt-in `include` для сырых тел request/response (иначе теряем их в провенансе), пересчёт `usage` (стало суммой шагов), `cachedInputTokens`→`inputTokenDetails.cacheReadTokens`, `reasoningTokens`→`outputTokenDetails.reasoningTokens`, `needsApproval`→`toolApproval`, `stepCountIs`→`isStepCount`, `ToolCallOptions`→`ToolExecutionOptions`, `onFinish`/`onStepFinish`→`onEnd`/`onStepEnd`, `fullStream`→`stream`. Гард меняет ожидание на `'v4'`.
- **Вторичный триггер:** `@openrouter/ai-sdk-provider@2.10.0` перестаёт работать с актуальным API OpenRouter → переход на план Б (`@ai-sdk/openai-compatible@2.0.75` с `baseURL`), ось не меняется.
