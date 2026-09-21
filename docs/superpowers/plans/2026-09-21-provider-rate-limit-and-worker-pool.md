# Provider Rate Limit and Project Worker Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Две ручки и больше ничего. `rpm` у записи провайдера в `aqven.yaml` не даёт превысить лимит
провайдера; `max_parallel` в настройках проекта не даёт перегрузить машину. Узловой `concurrency` у `map`
остаётся как есть, ограничений на агента и на модель не вводится.

**Architecture:** Лимит провайдера живёт на границе запроса к модели, где уже стоит `LimiterModel` с вызовом
`get_concurrency_context`; нужен реестр «провайдер → лимитер», общий на процесс, и token bucket поверх
`AbstractConcurrencyLimiter`. Пул воркеров живёт на **листовых** исполнителях узлов декоратором рядом с
существующим `StepIsolated`; управляющие узлы и `human` слот не берут.

**Tech Stack:** Python 3.14, pydantic 2.13.5, pydantic-ai-slim 2.43.0 (`pydantic_ai.concurrency`), DBOS 2.31.1,
anyio.

---

## Почему именно так

Проверено чтением исходников:

- **Очередь DBOS не подходит для лимита провайдера.** Она ограничивает воркфлоу, а один `llm`-узел делает
  много запросов: каждый сегмент тул-лупа — отдельный `llm_segment_step`. Лимит обязан стоять на границе
  запроса, где уже стоит `LimiterModel` (`models/limiter.py:90`).
- **Конкурентность ≠ частота.** `ConcurrencyLimit` из pydantic-ai — семафор (`max_running`, `max_queued`).
  Провайдеры лимитируют частоту. `AbstractConcurrencyLimiter` — абстрактный класс, рассчитанный на свои
  реализации (в докстринге пример с Redis), поэтому token bucket реализуется через тот же интерфейс и
  `LimiterModel` менять не надо.
- **Цепочка обёрток уже правильная** (`models/chain.py:64-75`): кассета **выше** лимитера — реплей слот не
  занимает; бэкофф **ниже** — ретрай после 429 держит свой слот. Порядок не трогаем.
- **Пул нельзя вешать на дочерние воркфлоу.** `map`, телом которого является `map`: внешний элемент держит
  слот и ждёт внутренние, которым слотов не досталось — взаимная блокировка. Листовой узел детей не
  порождает, поэтому слот на листе безопасен по построению. Листья и управляющие узлы уже разведены в
  `ports/execution.py:185-200`.
- **`human` слот брать не должен.** Он ждёт человека часами; шестнадцать ожидающих узлов при
  `max_parallel: 16` заблокировали бы пул навсегда. `narrow` тоже не берёт: чистое преобразование данных
  без ввода-вывода.
- **`max_parallel` не место в `aqven.yaml`.** Это свойство машины, а не воркфлоу, и у ноутбука с CI-раннером
  числа разные. Плюс `aqven.yaml` компилируется в `CompiledProject`, а `project_hash` считается по всей
  модели (`ir/identity.py:134-135`) — крутилка ресурсов не должна менять идентичность определения.
  Дом — `SettingsStore` со scope `"project"`, который уже держит ключи провайдеров и выбор бэкенда чата.

Реактивная защита от 429 уже есть и не отменяется: 429, 408 и 5xx ретраятся с уважением к `Retry-After`
(`models/backoff.py:37-41`, `94-100`). Лимитер нужен, чтобы не доводить до 429.

## Execution constraints

- В рабочем дереве чужие незакоммиченные правки в `apps/site` и `apps/studio`. Стейджить только свои пути.
  `git stash` без аргументов запрещён.
- Не удалять каталоги `.aqven/`: там `aqven.sqlite` с тредами чата и `blobs/`, нужные датасетным тестам.
- Ось версий не трогать: `pydantic-ai-slim` 2.43.0, `dbos` 2.31.1. Новых зависимостей не добавлять —
  token bucket пишем сами, готового в оси нет.
- Перед коммитом: `uv run --frozen ruff check .` и `uv run --frozen aqven check examples/lumen`.
- Никаких комментариев в коде (CLAUDE.md). Объяснения — сюда и в ADR.
- Решение архитектурное, поэтому ADR-0044 обязателен до финального коммита (0043 занят планом живой
  страницы прогона).

## File map

| Ответственность | Файлы |
|---|---|
| Лимиты в описании провайдера | `packages/aqven/src/aqven/spec/project.py`, `packages/aqven/src/aqven/ir/project.py`, `packages/aqven/src/aqven/compiler/` |
| Token bucket и реестр лимитеров | новый `packages/aqven/src/aqven/models/rate.py`, `packages/aqven/src/aqven/models/__init__.py` |
| Подключение к модели | `packages/aqven/src/aqven/engine/assembly/models.py`, `packages/aqven/src/aqven/engine/assembly/__init__.py` |
| Пул воркеров | новый `packages/aqven/src/aqven/engine/throttle.py`, `packages/aqven/src/aqven/engine/registry.py`, `packages/aqven/src/aqven/engine/lifecycle.py` |
| Настройка пула | `packages/aqven/src/aqven/engine/assembly/__init__.py` (`standard_engine_setup`), `packages/aqven/src/aqven/app/composition.py`, `packages/aqven/src/aqven/console/run.py` |
| Тесты | новые `packages/aqven/tests/models/test_rate_limits.py`, `packages/aqven/tests/engine/test_worker_pool.py`; существующие тесты спеки и компилятора |
| Решение | новый `docs/adr/0044-provider-rate-limit-and-worker-pool.md`, `docs/adr/README.md`, `docs/10-runtime.md` |

---

### Task 1: Token bucket поверх `AbstractConcurrencyLimiter`

**Files:** Create `packages/aqven/src/aqven/models/rate.py`, `packages/aqven/tests/models/test_rate_limits.py`.

- [ ] Падающие тесты на детерминированных часах и управляемом сне (никакого `asyncio.sleep` реального
      времени в тестах): бакет `rpm=60` пропускает первый запрос немедленно; шестьдесят первый в ту же
      минуту ждёт; освобождение идёт равномерно, а не пачкой в начале минуты; `acquire` конкурентных
      вызывающих отдаёт слоты в порядке ожидания, без голодания.
- [ ] `uv run --frozen pytest packages/aqven/tests/models/test_rate_limits.py -q`; ожидать падение импорта.
- [ ] Реализовать `RateLimiter(AbstractConcurrencyLimiter)`: `acquire(source)` ждёт токен, `release()` —
      no-op (частота не возвращает токен по завершении, в отличие от семафора). Часы и сон — внедряемые
      зависимости, чтобы тест не зависел от реального времени.
- [ ] Сверить контракт с установленным пакетом: прочитать `AbstractConcurrencyLimiter` в
      `.venv/.../pydantic_ai/concurrency.py` и реализовать ровно его абстрактные методы. Не писать по памяти.
- [ ] Перезапустить тесты; ожидать PASS. `uv run --frozen pyright packages/aqven/src/aqven/models`.

### Task 2: `limits.rpm` в описании провайдера

**Files:** Modify `packages/aqven/src/aqven/spec/project.py`, IR и компилятор провайдеров, тесты спеки.

- [ ] Падающие тесты: `aqven.yaml` с `providers[].limits.rpm: 200` парсится; `rpm: 0` отклоняется; поле
      необязательное и его отсутствие означает «без лимита»; значение доезжает до `CompiledProject`.
- [ ] Найти точное место компиляции провайдеров (`grep -rn "providers" packages/aqven/src/aqven/compiler/`)
      и провести поле спека → IR. Не изобретать новую модель, если у провайдера в IR уже есть своя.
- [ ] Добавить `ProviderLimits` с полем `rpm: int | None = Field(default=None, ge=1)`. Только частота.
      Семафор `concurrency` **не добавлять**: `rpm` ограничивает одновременность и через закон Литтла
      (одновременных ≈ частота × длительность), вторая ручка понадобится только при длинных стримах —
      тогда и добавим.
- [ ] Прогнать `uv run --frozen pytest packages/aqven/tests/spec packages/aqven/tests/compiler -q`.
      Проверить, что `uv run --frozen aqven check examples/lumen` остаётся зелёным без правки `aqven.yaml`.

### Task 3: Реестр лимитеров, общий на процесс

**Files:** Modify `packages/aqven/src/aqven/models/rate.py`, `packages/aqven/src/aqven/engine/assembly/models.py`, `packages/aqven/src/aqven/engine/assembly/__init__.py`.

Два одновременных прогона обязаны делить один пул на провайдера, иначе нагрузка удваивается. Реестр создаётся
один раз при сборке движка и живёт столько же, сколько процесс.

- [ ] Падающие тесты: два вызова реестра за одним провайдером отдают **тот же** объект лимитера; за разными
      провайдерами — разные; провайдер без `limits` отдаёт `None`, и `CallPolicy.concurrency` остаётся `None`.
- [ ] Реализовать `ProviderLimiters` с отображением «имя провайдера → лимитер», созданием по первому
      обращению и потокобезопасностью относительно конкурентных корутин.
- [ ] Подключить в `EngineModelSource._choice` (`assembly/models.py:195`): провайдер достаётся
      `model_provider(actual)` — тем же вызовом, что уже используется рядом в `key_requirement`; лимиты
      берутся из `scope.project.providers` той же выборкой, что и `key_requirement` (`assembly/models.py:93-97`).
      Передать лимитер в `CallPolicy(cassettes=cassettes, concurrency=...)`; сейчас там `concurrency`
      навсегда `None`.
- [ ] Реестр создаётся в `StandardExtensions.llm_dependencies` рядом с `EngineModelSource(...)`
      (`assembly/__init__.py:83`) и передаётся в него полем.
- [ ] Интеграционный тест: фейковая модель, `rpm: 2`, четыре параллельных вызова — третий и четвёртый
      стартуют позже первых двух. Проверять порядок по записанным меткам внедрённых часов, а не по
      реальному времени.
- [ ] Проверить, что реплей кассет слот **не** занимает: кассета выше лимитера в цепочке, тест на это
      обязателен, потому что порядок обёрток легко сломать будущей правкой.

### Task 4: Пул воркеров на листовых исполнителях

**Files:** Create `packages/aqven/src/aqven/engine/throttle.py`, `packages/aqven/tests/engine/test_worker_pool.py`; modify `packages/aqven/src/aqven/engine/registry.py`.

- [ ] Падающие тесты: при `max_parallel=2` третий листовой узел стартует только после завершения одного из
      первых двух; `human` **не** занимает слот (тест с тремя ожидающими человека узлами при
      `max_parallel=1` — четвёртый листовой узел всё равно исполняется); вложенный `map` внутри `map`
      завершается и не встаёт в дедлок при `max_parallel=1`; без настройки поведение не меняется.
- [ ] `uv run --frozen pytest packages/aqven/tests/engine/test_worker_pool.py -q`; ожидать падение.
- [ ] Реализовать `ThrottledExecutor[N]` — Decorator над `NodeExecutor[N]`, по образцу `StepIsolated`
      (`engine/steps.py:27`): взять слот, выполнить внутреннего, отпустить в `finally`. Семафор — `anyio`
      или `asyncio`, один на процесс, приходит снаружи.
- [ ] Применить в `build_executors` (`engine/registry.py:32-43`) **только** к `llm`, `code`, `tool`.
      `human` — нет (ждёт человека), `narrow` — нет (мгновенное преобразование без ввода-вывода),
      управляющие `map`/`parallel`/`switch`/`loop`/`call` — нет (иначе дедлок на вложенности).
- [ ] Перезапустить тесты; ожидать PASS.

### Task 5: Настройка `max_parallel`

**Files:** Modify `packages/aqven/src/aqven/engine/lifecycle.py`, `packages/aqven/src/aqven/engine/assembly/__init__.py`, `packages/aqven/src/aqven/app/composition.py`, `packages/aqven/src/aqven/console/run.py`, `packages/aqven/src/aqven/cli.py`.

`build_runtime` синхронный, а чтение настройки асинхронное, поэтому значение резолвится вызывающим и
приезжает уже числом — так же, как `log_level` и `state_dir` в `EngineSetup`.

- [ ] Падающие тесты: `EngineSetup(max_parallel=4)` доезжает до исполнителей; отсутствие настройки означает
      «без ограничения»; настройка из `SettingsStore` scope `"project"` читается композицией.
- [ ] Добавить `max_parallel: int | None = None` в `EngineSetup` (`engine/lifecycle.py:36-42`) и параметр в
      `standard_engine_setup` (`assembly/__init__.py:102-115`).
- [ ] Прочитать настройку в композиции приложения и передать в `standard_engine_setup`. Ключ настройки —
      `setting_key("runtime.max_parallel")`, scope `"project"`, строгая валидация при чтении: мусор в
      настройке должен давать явную ошибку, а не тихий дефолт.
- [ ] Добавить флаг `--max-parallel` команде `aqven run`, чтобы CLI не зависел от студийных настроек.
- [ ] Перезапустить тесты; ожидать PASS.

### Task 6: ADR и документация

**Files:** Create `docs/adr/0044-provider-rate-limit-and-worker-pool.md`; modify `docs/adr/README.md`, `docs/10-runtime.md`.

- [ ] Написать ADR-0044 по структуре Контекст → Решение → Альтернативы → Последствия → Проверка → Пересмотр.
      Зафиксировать: две ручки и почему не три; почему пул считает листья, а не воркфлоу (дедлок на
      вложенном `map`); почему `human` вне пула; почему `rpm` в файле, а `max_parallel` в настройках;
      почему очередь DBOS не используется.
- [ ] Отдельным абзацем записать найденный предел, чтобы его не искали заново: DBOS на SQLite открывает
      каждое соединение с `isolation_level = "IMMEDIATE"` и сериализует писателей
      (`dbos/_sys_db_sqlite.py:43-50`), а каждый стримящий узел пишет дельту раз в 80 мс
      (`OUTPUT_DELTA_BATCH_MS`). Потолок системы — записи журнала в секунду, а не провайдер и не число
      воркфлоу. Лечится WAL на системной базе, а не сужением `map`.
- [ ] Отвергнутые альтернативы: лимит на агента (провайдер не знает про агентов, внутри прогона конкурируют
      исполнения узлов; ограничение на агента — это приоритет, а не лимит), лимит на модель (нужен только
      если провайдер лимитирует по модели; добавляется ключом `provider:model` в том же реестре),
      дефолтный потолок у `map` (`rpm` ограничивает одновременность через закон Литтла, отдельный дефолт
      избыточен).
- [ ] Строка в таблицу `docs/adr/README.md`.
- [ ] Вычистить `docs/10-runtime.md`: §ок про `limits: { rpm, tpm, concurrency }` на профиле модели
      (строка 1196) и «эффективную конкурентность как минимум из трёх» (строка 1237) — спроектировано, но
      не реализовано и теперь отменено. Привести к тому, что есть.

---

## Финальная проверка

```
uv run --frozen ruff check .
uv run --frozen pytest packages/aqven -q
uv run --frozen aqven check examples/lumen
uv run --frozen pyright packages/aqven/src/aqven/models packages/aqven/src/aqven/engine
```

Студию задача не трогает: ни маршрутов, ни моделей контракта не меняется, `check:api` должен остаться
зелёным без перегенерации.

## Что эта задача сознательно не делает

- Не вводит лимит на агента и на модель.
- Не добавляет `concurrency` (семафор) провайдеру: пока только `rpm`.
- Не меняет дефолт `concurrency` у `map` — остаётся «без ограничения».
- Не использует очередь DBOS.
- Не включает WAL на системной базе: это отдельное решение с отдельными последствиями для восстановления.
