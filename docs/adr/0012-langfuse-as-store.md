# ADR-0012. Langfuse — хранилище трасс и evals, отладчик — свой

> Статус: **частично изменено [ADR-0025](0025-python-engine.md)** (2026-09-16)
> Дата: 2026-09-11
>
> Изменено инструментирование трасс (ADR-0025 §8): спаны вызовов пишет `InstrumentationSettings` Pydantic AI
> (формат 5) на нашем `TracerProvider`, экспорт — OTLP/HTTP protobuf на `<base>/api/public/otel/v1/traces` с Basic
> auth и заголовком `x-langfuse-ingestion-version: 4`; `VoltAgentObservability` и SDK `@langfuse/*` уходят. Python
> SDK langfuse 4.15.3 не берём: он требует `httpx<1.0` и пишет атрибуты в спан, общий для всех процессоров, что
> нарушает обязанность 8; Logfire как платформу не берём. Остаются верными и действуют: Langfuse OSS — хранилище
> трасс, датасетов и оценок, отладчик — свой; граница данных (горячий путь — только Postgres и blob store, score,
> влияющий на гейт, зеркалится в Postgres); порты `TraceSink` и `EvalStore`; своя таблица цен; маскирование PII до
> записи атрибута.
> Контекст-документы: [12. Наблюдаемость](../12-observability.md), [13. Evals и гейты](../13-evals-and-gates.md), [15. Studio: фронтенд](../15-studio-frontend.md), [16. Модель данных](../16-data-model.md), [18. Экспорт и конформанс](../18-export-and-conformance.md), [ADR-0011](0011-two-schemas-and-tenancy.md)

## Контекст

Продукту нужны: дерево спанов с таймингами, датасеты и их элементы, прогоны по датасетам (эксперименты), очереди ручной разметки, scores (числовые, категориальные, boolean, текстовые), LLM-as-judge и управление промтами. Написать это заново — месяцы работы на один только UI и прямое нарушение правила «есть живая библиотека — берём её».

Что проверено по Langfuse:

- Код репозитория — **MIT**. Дословно из документации self-hosting: «All core Langfuse features and APIs are available in Langfuse OSS (MIT licensed) without any limits».
- EE-ключ (`LANGFUSE_EE_LICENSE_KEY`) требуется для **закрытого списка из 9 позиций**: project-level RBAC roles, protected prompt labels, data retention policies, audit logs, server-side data masking, UI customization, organization creators, Org Management API + SCIM, Instance Management API.
- Всё, что нам нужно из evals-контура, в этом списке отсутствует: датасеты и dataset items, dataset runs/эксперименты, annotation queues, scores и score configs, LLM-as-a-judge evaluators и evaluation rules, prompt management, playground, базовый SSO — **OSS**.
- SDK: `@langfuse/tracing` + `@langfuse/otel` + `@langfuse/client` + `@langfuse/core` **5.11.1, MIT**, `engines.node >= 20`. С v4 SDK **OTel-native**: `LangfuseSpanProcessor` — обычный OTel `SpanProcessor`.
- `VoltAgentObservability({ spanProcessors: [...] })` принимает **массив** — дублирующий экспорт штатен, а не хак.
- `@voltagent/langfuse-exporter@2.0.3` (проверено 2026-09-11) зависит от `langfuse@^3.38.6` — легаси unscoped v3 SDK с собственным HTTP-ingestion, **не** OTel. Отстаёт на два поколения; типы observation `agent`/`tool`/`retriever`/`guardrail`/`evaluator`, `propagateAttributes`, experiment-атрибуты и `costDetails` через него не доедут.
- Цена эксплуатации self-host: пять обязательных компонентов — `langfuse-web`, `langfuse-worker`, Postgres, ClickHouse, Redis/Valkey, S3 (S3 не опция: web пишет тело батча в S3, в Redis кладётся только ссылка). Прод — от 2 CPU / 4 GB на контейнер, docker-compose вариант — от 4 ядер / 16 GiB, Redis ~1 ГБ на каждые ~100 000 событий в минуту. ClickHouse — отдельная эксплуатационная дисциплина.

Отладчик из спеки §11 показывает **наш IR**: граф узлов, отрисованный промт, провенанс каждого слота, эффективную конфигурацию вызова, сработавшие правила и гварды. В дереве спанов этих сущностей нет и быть не может — Langfuse рисует спаны.

## Решение

**Langfuse OSS (MIT), self-host** — бэкенд трасс, датасетов, экспериментов, annotation queues, scores и LLM-as-judge. Подключается **одним `LangfuseSpanProcessor` из `@langfuse/otel@5.11.1`** прямо в `VoltAgentObservability({ spanProcessors: [...] })`. `@voltagent/langfuse-exporter` **не используем** — он на легаси v3 SDK; это решение подтверждено фактом версий, а не вкусом. Мэппинг спанов пишем сами через `createObservationAttributes()` из `@langfuse/tracing`: наш продукт про доверие и провенанс, мэппинг обязан быть нашим кодом, а не чужой чёрной коробкой.

Рядом на том же `NodeTracerProvider` стоит **наш SpanProcessor**, пишущий те же спаны в наш Postgres. Это и есть дублирующий экспорт: то, от чего зависит поведение системы, попадает к нам транзакционно, а не только в трассы.

**UI отладчика — свой.** Обоснование ровно одно и оно не про вкус: отладчик показывает граф IR, провенанс слотов, эффективную конфигурацию узла и diff версий воркфлоу — сущности нашего домена, которых в спан-модели нет. Waterfall, сессии и агрегаты Langfuse даёт сам, и мы их не переписываем.

### Граница данных

Принцип одной фразой: **в Postgres лежит всё, от чего зависит ПОВЕДЕНИЕ системы (решения, гейты, воспроизведение, экспорт); в бэкенде трасс — всё, что нужно ЧЕЛОВЕКУ посмотреть глазами.** Следствие, которое проверяется тестом: бэкенд трасс **никогда не читается на горячем пути** — ни один гейт, ни один retry, ни один экспорт не делает запрос в Langfuse. При полностью отключённом Langfuse продукт работает целиком, теряется только удобный просмотр.

| Данные | Источник истины | Дублируется в трассы |
|---|---|---|
| Чекпоинт узла (вход/выход/статус/попытка) | Postgres `node_checkpoint` | да, превью |
| Полные payload'ы (промт, ответ, документы ретривера) | Blob store по sha256 | нет, только `ref` + `preview` |
| Провенанс слотов | Postgres `slot_provenance` | да, компактно |
| Эффективная конфигурация рана | Postgres `run_effective_config` | только `config_hash` |
| Кассеты для детерминированного реплея | Postgres + blob | нет (это фикстуры, не телеметрия) |
| Node-level метрики для гейтов | Postgres `node_metric` | да |
| Бюджет рана (лимит, потрачено, остаток) | Postgres `run_budget` | да, снапшот |
| Сработавшие правила и гварды | Postgres `rule_firing` | да |
| Версия воркфлоу, граф, определения узлов | Postgres | ссылкой (`aqven.version`) |
| Артефакты экспорта | Postgres + blob | нет |
| Ключи идемпотентности, очередь задач | Postgres | нет |
| Прайсинг моделей и расчёт стоимости | Postgres | да, `costDetails` |
| Дерево спанов, waterfall, тайминги | Langfuse (ClickHouse) | — |
| Sessions / users / tags, агрегаты | Langfuse | — |
| Датасеты и dataset items | **Postgres — источник, Langfuse — зеркало** | синхронизация |
| Dataset runs / эксперименты (история) | Langfuse | — |
| Annotation queues, ручная разметка | Langfuse | — |
| Scores | Langfuse — источник; **агрегаты, влияющие на гейты, зеркалим в Postgres** | обе стороны |
| Конфиги LLM-as-judge | Langfuse | — |

### Порт и изоляция

Архитектурное правило (DIP, Port/Adapter): **в домене нет ни одного `import` из `@langfuse/*`**. Есть порт `TraceSink` и порт `EvalStore`, есть адаптер `LangfuseTraceSink`. Импорт `@langfuse/*` и `@opentelemetry/*` разрешён единственному пакету `@aqven/observability`. Это буквально плоскость замены бэкенда.

Связывание в обе стороны без своей мапы id: каждая наша строка несёт `trace_id` (32 hex) и `span_id` (16 hex) того же OTel-спана (`getActiveTraceId()`/`getActiveSpanId()` из `@langfuse/tracing`); обратно — `langfuse.observation.metadata` несёт `aqven.run_id`/`aqven.node_id`, чтобы из UI Langfuse вернуться в нашу Studio.

### Большие payload

Ни OTel, ни Langfuse не решают это за нас для JSON. Дефолт OTel — `DEFAULT_ATTRIBUTE_VALUE_LENGTH_LIMIT = Infinity`, то есть отрендеренный промт на 200 КБ уедет в OTLP как есть, а батч из `maxExportBatchSize = 512` таких спанов — сотни мегабайт в одном запросе, таймауты экспортёра, 413 от коллектора и тихая потеря при переполнении `maxQueueSize = 2048`. Наш обязательный слой на каждый крупный payload: канонизация → sha256 → атрибуты `*.size_bytes`, `*.sha256`, `*.truncated`, `*.ref`, инлайн-превью `*.preview` до 4096 символов (hard cap 8192), тело — в content-addressed blob store. Плюс глобальный предохранитель `spanLimits.attributeValueLengthLimit = 8192`: он режет строку молча, поэтому явные `*.truncated`/`*.sha256` обязательны.

### Запасной бэкенд

**Arize Phoenix (Apache-2.0)** — OTel-native, self-host заметно легче (одно приложение + Postgres, без ClickHouse/Redis/S3 в базовом варианте). Слабее по prompt management и annotation-контуру, evals-loop менее продуктовый — поэтому запасной, а не основной. Скореры берём отдельно от платформы: `autoevals` (MIT) и/или `@voltagent/scorers` — они ни к чему не привязаны.

**Цена миграции by design.** Мы пишем спаны в ванильный OTel, Langfuse — один процессор среди нескольких. Смена бэкенда = замена одного процессора, дни. Наши `aqven.*`-атрибуты и наш Postgres от бэкенда не зависят вообще: гейты, кассеты, провенанс и экспорт продолжают работать при полностью отключённом Langfuse. Реально теряется только история dataset runs / экспериментов / annotation, накопленная в Langfuse; митигация — REST `langfuse.api.*` для выгрузки датасетов и скоров плюс правило «определения датасетов и наборы кассет — источник истины в нашем Postgres, Langfuse — зеркало».

## Альтернативы

| Альтернатива | Почему отвергнута | При каких условиях вернёмся к ней |
|---|---|---|
| Свой контур на чистом OTel + ClickHouse, свой UI трасс | Пришлось бы написать самим UI трасс, диффы, сессии, датасеты, annotation queues, scores, LLM-as-judge — месяцы и прямое нарушение правила «не изобретаем велосипед». ClickHouse всё равно приезжает — он внутри Langfuse | Никогда для контура трасс и evals. Свой UI мы и так пишем — но только для отладчика по IR |
| `@voltagent/langfuse-exporter@2.0.3` | Зависит от легаси `langfuse@3.x` (не OTel, собственный HTTP-ingestion): две HTTP-цепочки и два набора env в одном процессе, новые типы observation и `costDetails` не доедут, риск дрейфа адаптера третьей стороны | Если переедет на `@langfuse/*` 5.x — и то лишь как способ сократить наш мэппинг, а не как замена контроля над ним |
| Arize Phoenix (Apache-2.0) | prompt management и annotation-контур слабее, evals-loop менее продуктовый | **Запасной бэкенд.** Если эксплуатация ClickHouse + Redis + S3 окажется неподъёмной для команды |
| Braintrust (SDK `braintrust@3.32.0`, MIT) | Сильнейший eval-контур, но ядро платформы SaaS/проприетарно, self-host — энтерпрайз-разговор. Наш продукт про локальный контроль данных, SaaS на критическом пути не ложится | Скореры `autoevals` (MIT) берём **отдельно**, без платформы — это лучший способ взять у Braintrust полезное |
| Comet Opik (`opik@2.2.59`, Apache-2.0) | Шире по охвату (online evaluation rules), но часть ценности в экосистеме Comet, self-host тяжелее Phoenix | Если понадобится online-оценка прода как продуктовая фича и Langfuse не закроет её |
| Laminar (`@lmnr-ai/lmnr@0.8.45`, Apache-2.0) | До-единичная версия SDK, малая команда. Ставить на неё ядро продукта — неоправданный риск | Как источник идей по схеме атрибутов — уже используем |
| Helicone (`@helicone/helpers@1.8.3`) | Gateway/proxy-first: перехват HTTP к провайдеру. Нам нужна структура графа, а не лог вызовов. Плюс ~10 месяцев без релиза SDK | Никогда |
| Langfuse Cloud вместо self-host | Трассы уходят наружу; для продукта про доверие и локальный контроль данных это дефолтом быть не должно | Допустимо **на старте**, если операционная нагрузка пяти компонентов не по силам: код MIT, данные вывозятся, self-host остаётся путём отхода |
| Отказаться от своего UI и жить в UI Langfuse | Langfuse рисует спаны. Графа узлов IR, провенанса слотов, эффективной конфигурации и diff версий воркфлоу там нет | Никогда |
| Писать свой evals/annotation-контур | Датасеты, dataset runs, annotation queues, scores, LLM-as-judge, prompt management — всё OSS под MIT без лимитов | Если любая из этих функций уедет в EE (см. Пересмотр) |

## Последствия

**Положительные.**
- Весь evals/annotation/prompt-контур получен готовым под MIT, без лимитов на масштаб.
- Бэкенд трасс заменяется за дни: он — один `SpanProcessor`, а не архитектура.
- `mask` в `LangfuseSpanProcessor` работает **только** на пути в Langfuse, значит наш Postgres-процессор получает полные данные — наружу уходит редактированное, у нас остаётся целое.
- EE-покупка (audit logs, retention policies, project-RBAC, SCIM) отложена и не требует переписывания: тот же бинарь плюс переменная окружения.

**Отрицательные.**
- Эксплуатация пяти компонентов (или Langfuse Cloud с уходом трасс наружу). ClickHouse — главная скрытая стоимость решения.
- Scores живут в двух местах: те, что управляют гейтами, обязаны зеркалиться к нам, и это синхронизация, которую надо поддерживать.
- Мэппинг спанов в Langfuse-модель — наш код, значит наша ответственность за его соответствие версиям SDK.

**Обязаны делать.**
1. Ни одного `import` из `@langfuse/*` и `@opentelemetry/*` вне `@aqven/observability`. Домен знает только `TraceSink` и `EvalStore`.
2. Ни один гейт, retry, реплей или экспорт не читает Langfuse. Горячий путь — только Postgres и blob store.
3. Каждая наша строка несёт `trace_id`/`span_id`; `langfuse.observation.metadata` несёт `aqven.run_id`/`aqven.node_id`.
4. Определения датасетов и наборы кассет — источник истины у нас, в Langfuse синхронизируются.
5. Любой score, влияющий на гейт, зеркалится в Postgres до того, как гейт его читает.
6. Прайсинг моделей и расчёт стоимости — наша таблица. Биллинг не зависит от чужой таблицы цен.
7. Маскирование PII делается **до** `setAttribute`, а не только через `mask`: `mask` не защищает наш процессор.
8. Никогда не мутировать `span.attributes` внутри процессора — оба процессора получают один и тот же `ReadableSpan`, и порядок доставки не гарантирован.
9. `shouldExportSpan` задавать только как `isDefaultExportSpan(span) || ourPredicate(span)`: свой предикат полностью перекрывает дефолтный фильтр и молча выключает `gen_ai.*`-спаны.
10. Атрибуты формирует единственная фабрика `buildNodeSpanAttributes(ctx): Attributes` (SRP), никаких `setAttribute` россыпью. Ключи — snake_case, ASCII, стабильные навсегда; удаление ключа = bump `aqven.schema_version`. Держаться в пределах 128 атрибутов на спан.
11. `spanLimits.attributeValueLengthLimit = 8192` выставлен глобально как предохранитель.

## Проверка

| Что проверяем | Как |
|---|---|
| Продукт не зависит от Langfuse | Интеграционный прогон с отключённым `LangfuseSpanProcessor` и недоступным хостом: воркфлоу, гейты, реплей по кассете и экспорт проходят полностью. Падает только просмотр |
| Изоляция зависимости | Правило линтера `no-restricted-imports` на `@langfuse/*` и `@opentelemetry/*` везде, кроме `@aqven/observability` |
| Связывание работает | Тест: у каждой строки `run_nodes`/`node_checkpoint` непустые `trace_id` (32 hex) и `span_id` (16 hex), и спан с этим id доехал до тестового экспортёра |
| Большие payload не ломают экспорт | Тест: узел с промтом на 200 КБ → в атрибутах `preview` ≤ 8192, `truncated = true`, `sha256` совпадает с содержимым блоба, полное тело лежит в blob store |
| Схема атрибутов не дрейфует | CI сверяет список ключей `aqven.*` со снапшотом: изменение без bump `aqven.schema_version` — красная сборка |
| Гейты не ходят наружу | Тест с сетевым мок-барьером: во время исполнения гейта нет ни одного исходящего запроса к хосту Langfuse |
| Лицензионная граница | До релиза подтвердить статус `blobStorageIntegrations` (batch export в blob storage): в закрытом EE-списке его нет, но явного подтверждения «OSS» в документации фич тоже нет. До подтверждения на эту функцию не опираемся |
| **Kill-критерий** | Если хоть одна функция evals-контура, на которую мы опираемся (датасеты, dataset runs, annotation queues, scores, LLM-as-judge, prompt management), потребует EE-ключа — решение «берём OSS готовым» пересматривается целиком, а не латается |

## Пересмотр

- Операционная стоимость ClickHouse + Redis + S3 превышает выгоду от Langfuse → переключение на Arize Phoenix: порт `TraceSink` уже есть, меняется адаптер.
- Langfuse переводит любую из используемых нами OSS-функций в EE → пересмотр build-vs-buy по evals-контуру.
- `@voltagent/langfuse-exporter` переезжает на `@langfuse/*` 5.x → можно пересмотреть решение «мэппинг пишем сами», но только если мэппинг перестанет быть частью нашего ядра доверия.
- Наш отладчик начинает дублировать waterfall и сессии Langfuse → это сигнал, что граница данных нарушена: возвращаемся к таблице границы, а не расширяем UI.
