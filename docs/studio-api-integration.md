# Studio ↔ API: что мешало интеграции

## Статус: закрыто движком 2026-09-18

Всё, что перечислено ниже как проблема, движок уже исправил. Проверено на живом сервере (53 пути вместо 41):

| Пункт | Что стало |
|---|---|
| 2.1 контекст прогона | `RunStartRequest.context` принимается, `RunSpec` его получает |
| 2.2 ключи контекста | компилятор выводит их из привязок (включая вызываемые воркфлоу) и отдаёт в `FlowDetail.context`; запуск без ключа — `422 CONTEXT_MISSING` со списком недостающих полей, движок ничего не подставляет сам |
| 2.3 ложный зелёный `aqven check` | симуляция подставляет только выведенные ключи |
| 2.4 фильтры инбокса | `sort=deadline_at`, `overdue`, `deadline_before`, `since`, `until` на стороне хранилища; `assignee=me` разворачивает сервер |
| 2.5 схемы событий | `/api/schemas/events` отдаёт JSON-схемы: 3 типа spec, 17 run, 14 chat |
| 2.6 секреты | `GET /api/settings/secrets` — все объявленные секреты с признаком `set`, без значений (в lumen сразу видно `LUMEN_ORDERS_TOKEN: set=false`), плюс `aqven secrets` |
| 3.1 эвалы | целиком: `/api/evals`, `/api/datasets`, `/api/eval-runs` (+`/cases`, `/gate`), история в SQLite, `aqven eval` |
| 3.2 схемы описания | `/api/spec-schemas` и `/{kind}` |
| вопрос про чат | сессия на проект плюс метка воркфлоу (`ChatSession.flow_id`) |

### Главное: `ExecutionDetail` — заглушка ровно в тех полях, ради которых прогон и разбирают

`engine/facade.py:348-357` возвращает детали исполнения с захардкоженными пустыми значениями:

```python
return ExecutionDetail(
    **execution.model_dump(exclude={"output_ref"}),
    output_ref=None if include_payloads == "none" else execution.output_ref,
    provenance={},      # всегда пусто
    prompt=None,        # всегда пусто
    response=None,      # всегда пусто
    attempts=tuple(fold.attempts),
    checks=(),          # всегда пусто
    rule_firings=(),    # всегда пусто
    ...
)
```

Плюс `input_ref` равен `null` на всех 42 исполнениях каждого прогона, который я проверил (live, replay, dryrun),
а `attempts_count` равен `1` даже там, где по событиям видно три неудачные попытки.

**Почему это важно.** Владелец просит экран, на котором прогон читается по шагам: что за агент, какая модель,
что пришло на вход, какой промт ушёл в модель, что она ответила, какие проверки сработали. Из этого списка движок
сейчас отдаёт только агента, модель и выход. Studio выкручивается и честно подписывает подмены:

| нужно | что отдаёт движок | чем Studio подменяет |
|---|---|---|
| промт, который реально ушёл в модель | `prompt: null` | шаблон с диска (`/nodes/{id}/prompt`), подпись «template on disk» |
| ответ модели | `response: null` | склейка событий `node_output_delta`, подпись «raw model response» |
| вход узла | `input_ref: null` | записанные выходы узлов выше по потоку, подпись «the engine records no per-node input» |
| проверки | `checks: []`, `rule_firings: []` | причины неудачных попыток из событий (`check_failed`, `MODEL_SCHEMA_MISMATCH`, …) |
| число попыток | `attempts_count: 1` | счёт неудачных попыток по событиям |

Подмены работают, но сравнивать два прогона по ним нельзя: шаблон с диска не показывает, какие значения
подставились, а дельты событий пропадают, если прогон длиннее страницы журнала. Просьба заполнить эти поля
по-настоящему — это самый ценный шаг для отладки из всего, что осталось.

### Новое, найденное при переводе Studio на эти эндпоинты

**`GET /api/evals/{eval_id}` отдаёт меньше, чем сам файл.** В сводке эвала есть только *имена* скореров —
без `kind` (`continuous`/`binary`), без того, что каждый скорер запускает (`inference`+`agent` / `use` / `run`),
и без блока `gate` (baseline, repeats, min_dataset, min_discordant, families, alpha_primary, q_secondary).
Из-за этого экран, который раньше читал `evals/support_case/reply_quality.yaml` напрямую и показывал полную
таблицу скореров и политику гейта, после перехода на API показывает меньше и вынужден отсылать человека в файл.
Просьба: отдавать в `eval_get` разобранное определение целиком — оно у движка уже есть, он его компилирует.

**`GET /api/eval-runs/{id}/gate` отвечает `404 NOT_FOUND`, когда прогон шёл без baseline.** Studio это ловит и
пишет «у прогона нет вердикта гейта: не с чем было сравнивать», но по смыслу это не «не найдено», а «неприменимо».
Либо `200` с пустым вердиктом и причиной, либо отдельный код — иначе клиент не отличает отсутствие гейта от
опечатки в `eval_run_id`.

Осталась одна мелочь, найденная уже после записки: **офлайн-экспорт контракта неполон**. `export_openapi()`
собирает приложение через `contract_app()`, а тот включает только `core_routers` — роутер чата подключается
в рантайме, поэтому в офлайн-спеке нет всех семи путей `/api/chat/*`. Studio из-за этого берёт спеку с
запущенного сервера, а не из `export_openapi()`. Если чат-роутер добавить в `contract_app()` (с заглушкой
бэкенда, живой не нужен), генерация типов перестанет требовать сервер вообще.

---

Ниже — исходная записка от 2026-09-18, как она была написана до исправлений. Всё проверено на живом сервере `aqven studio --headless --port 5183`
поверх `examples/lumen` (индекс `ready`, 0 проблем, ключ провайдера в `lumen/.env`).
Каждое утверждение здесь — результат запроса к серверу или чтения исходников, не рассуждение.

Аудитория — агент, который правит движок и серверный API. Studio переводится с выдуманных
сущностей прототипа (workspace, stage, signature/profile, revision) на реальные: проект → флоу →
узлы, прогоны с исполнениями и событиями, человеческие ожидания, чат-сессии.

## 1. Что уже работает и на что Studio опирается

41 путь, все потребляются или будут потребляться:

| Экран Studio | Эндпоинты |
|---|---|
| Оболочка, переключатель флоу | `GET /api/project`, `GET /api/flows`, `GET /api/flows/{flow_id}` |
| Канвас (граф) | `GET /api/flows/{flow_id}/nodes`, `/nodes/{node_id}`, `/schemas`, `/ir`, `/spec` |
| Узлы (определение) | `/nodes/{node_id}`, `/nodes/{node_id}/prompt`, `POST /nodes/{node_id}/prompt/preview`, `GET /api/types`, `/api/prompts` |
| Прогоны | `GET /api/runs`, `/runs/{run_id}`, `/runs/{run_id}/executions`, `/executions/detail`, `POST /api/runs` |
| Ревью (человеческие ожидания) | `GET /api/runs?status=suspended` → `waits[]`, `/executions/detail?include_payloads=full` → `human`, `POST /runs/{run_id}/resume` |
| Эвалы и датасеты | `GET /api/files?kind=Eval\|Dataset`, `GET /api/raw/{path}` — других нет |
| Чат | `GET /api/chat/status`, `POST /api/chat/sessions`, `POST /sessions/{id}/messages`, `GET /sessions/{id}/events` (SSE), `/approvals/{id}`, `/interrupt` |
| Настройки | `GET /api/settings/providers`, `GET|PUT|DELETE /api/settings/{scope}/{key}` |

Хорошо сделано и менять не надо:

- **Конверт ошибки плоский и информативный**: `{ok:false, op, code, message, problems:[{path,code,message}], candidates, conflict, retry_after_ms}`.
  Проверено вживую: `404 NOT_FOUND`, `409 ALREADY_RESUMED`, `412 WAIT_ATTEMPT_STALE` (с `conflict{attempt, assignee}`),
  `422 REQUEST_INVALID` с тремя `problems`. Studio раскладывает `problems[].path` на поля формы.
- **`/api/files?kind=` — индекс сущностей**, а не просто список файлов: `Flow`, `Node`, `Type`, `Agent`,
  `Tool`, `Fragment`, `Eval`, `Dataset`, `code`, с `parse_status` и `problems_count`. Это единственный
  способ увидеть сущности без собственного эндпоинта.
- **`GET /api/settings/providers`** отдаёт `declared`, `source`, `masked` (`••••0860`) — ровно то, что нужно экрану настроек.
- **Чат по подписке машины**: `GET /api/chat/status` → `{"backend":"claude","state":"logged_in","method":"subscription"}`.
  Ключ API не нужен, и это именно то поведение, которое Studio требует.

## 2. Расхождения реализации со спецификацией

### 2.1 `run_start` не принимал контекст прогона — исправлено, нужно закрепить

**Симптом.** Прогон, запущенный через API, падал на третьем узле:

```
IO_INVALID  ValidationError: 1 validation error for date
  Input should be a valid date [type=date_type, input_value=None]
  address: {"node_id": "record__validate"}
```

**Причина.** `RunContext.date` по умолчанию `None` (`runtime/options.py:76-82`), а `RunStartRequest`
не имел поля `context` вовсе, так что `engine/facade.py:187` собирал `RunSpec` без него — при том что
`RunSpec.context: RunContext | None` существует (`engine/request.py:23`). Любой узел с привязкой
`$run.context.*` обречён: у `support_case` это `record__validate` (`$run.context.date`) и
`search_kb` (`$run.context.tenant_id`).

**Что уже сделано** (в рабочем дереве, не закоммичено):

```python
# runtime/runs.py
class RunStartRequest(RequestModel):
    flow_id: FlowId
    at: str = WORKING_COPY
    mode: RunMode
    context: RunContext | None = None      # добавлено
    ...

# engine/facade.py:187
spec = RunSpec(
    flow_id=request.flow_id,
    mode=request.mode,
    context=request.context,               # добавлено
    human_answers=request.human_answers or (),
)
```

Проверено: с контекстом прогон проходит 13 узлов вместо 3.

**Что осталось вам.** Спецификация тоже не знает про контекст: [23-studio-api.md](23-studio-api.md) §448
перечисляет параметры запуска как `flow_id`, `at`, `mode`, `input|dataset_item_id`, `cassette_id?`,
`human_answers?`. Допишите `context?`, иначе следующая правка снова его потеряет. И решите, должен ли
`date` по умолчанию становиться сегодняшним днём на стороне движка — Studio сейчас подставит его в форме,
но CLI и MCP пойдут мимо формы.

### 2.2 Флоу не публикует, какие ключи контекста ему нужны

`FlowSpec.context: RunContextKey[] | null` и `CompiledFlow.context: RunContextKey[] = []` в схеме есть,
`RunContextKey` = `date | time_zone | locale | tenant_id`. Но `flows/support_case/flow.yaml` ничего не
объявляет, компилятор ничего не выводит, и `GET /api/flows/support_case` возвращает `context: null` —
хотя узлы флоу связываются с `$run.context.date` и `$run.context.tenant_id`.

**Последствие для Studio.** Форма запуска не может спросить ровно нужные поля. Сейчас она вынуждена
показывать все четыре и гадать, какие обязательны; пользователь узнаёт правду из упавшего прогона.

**Предложение.** Выводить ключи компилятором из фактических ссылок `$run.context.*` и отдавать их в
`FlowDetail.context` (и в `FlowSummary`, если дёшево). Тогда форма строится точно и сама поддерживается.
Альтернатива — требовать объявления в `flow.yaml` правилом `aqven check`; хуже, потому что дублирует
то, что и так видно в привязках.

### 2.3 `aqven check` проходит на флоу, который не может выполниться через API

`aqven check` симулирует прогон, подставляя `SIMULATION_CONTEXT` (`check/simulation/runner.py:39`).
Путь API не подставляет ничего. Поэтому проект с 0 ошибок гарантированно падает на первом же
`$run.context.*`. Главный гейт проекта даёт ложную уверенность.

**Предложение.** Симуляция должна подставлять контекст только для объявленных/выведенных ключей (см. 2.2),
а на ссылку `$run.context.X`, которой нет в объявленных ключах, выдавать диагностику.

### 2.4 Фильтры и сортировка `run_list` не реализованы

Спецификация ([23-studio-api.md](23-studio-api.md):375, :524, :538-540) описывает
`deadline_before`, `overdue`, `since`, `until`, `sort=deadline_at`. Реально параметров семь:
`flow_id`, `status`, `mode`, `assignee`, `parent_run_id`, `cursor`, `limit`.

**Последствие.** Экран «Входящие» не может отсортировать ожидания по сроку на сервере. Клиентская
сортировка внутри одной страницы неверна, как только ожиданий станет больше страницы.

**Предложение.** Реализовать `sort=deadline_at` и `overdue` в первую очередь — это то, на чём строится инбокс.

### 2.5 Контракт событий нельзя получить в рантайме

- `GET /api/schemas/events` → `{"spec":[],"run":[],"chat":[]}` на здоровом сервере. Эндпоинт есть, содержимого нет.
- `GET /api/events/spec` — это SSE-поток (`text/event-stream`, параметры `after_seq`, `last-event-id`), а не документ схем; обычный `curl` на нём висит.

**Последствие.** Единственный рабочий контракт событий — сгенерированный `schema.d.ts`. Для Studio это
приемлемо, но эндпоинт в текущем виде вводит в заблуждение: он обещает схемы и отдаёт пустоту.

**Предложение.** Либо наполнить `/api/schemas/events` (JSON Schema каждого типа события), либо убрать его
и переименовать `/api/events/spec` так, чтобы из имени было ясно, что это поток.

### 2.6 Секреты инструментов не видны до падения прогона

`GET /api/settings/providers` покрывает только ключи провайдеров моделей. Секреты инструментов
(`tools/search_kb.yaml`: `secrets: [{name: kb_token, ref: "ref:env/LUMEN_KB_TOKEN"}]`) не отдаются нигде.
Узнать о ненастроенном секрете можно только так:

```
SECRET_MISSING  SecretUnavailable: secret kb_token is not declared by the tool
                or not set in the project .env or the environment
                address: {"node_id": "search_kb"}
```

— то есть потратив прогон и токены.

**Предложение.** Расширить `GET /api/settings/providers` (или добавить соседний `GET /api/settings/secrets`)
до всех объявленных секретов проекта: `{name, env_var, declared_by: tool_id|agent_id, source, set: bool}`.
Тогда Studio покажет «чего не хватает» до запуска, а не после.

## 3. Чего нет вообще, но Studio это нужно

Всё перечисленное уже описано в спецификации с пометкой «позже» — не изобретайте заново, сверяйтесь
с [23-studio-api.md](23-studio-api.md).

### 3.1 Эвалы и датасеты

`Eval` и `Dataset` — полноценные сущности на диске (в lumen: `evals/support_case/reply_quality.yaml`
с четырьмя скорерами и гейтом, `evals/support_case/reply_cases.yaml` с кейсами). CLI умеет их гонять:
`aqven eval --eval <id> <path>`. HTTP — нет: ни списка, ни запуска, ни результатов, ни отчёта гейта.

Studio сейчас читает их как файлы (`/api/files?kind=Eval|Dataset` + `/api/raw/{path}`) и честно пишет,
что результатов пока нет. Чтобы экран стал полезным, нужен минимум: запуск эвала, статус, результаты
по кейсам, вердикт гейта. Спека уже описывает датасетную часть (:867-872) и `GateReport` (:885).

### 3.2 Схемы моделей описания для редактора

`GET /api/spec-schemas` и `/api/spec-schemas/{kind}` ([23-studio-api.md](23-studio-api.md):264) — не реализованы.
Нужны, когда Studio начнёт редактировать YAML с валидацией, а не только читать.

## 4. Как Studio берёт типы (чтобы вы знали, что ломается)

Studio не пишет типы руками: `openapi.json` приходит из FastAPI, `schema.d.ts` генерируется из него
`openapi-typescript`. Любое изменение схемы подхватывается регенерацией; несовместимое изменение
ломает сборку Studio, и это ожидаемо и правильно.

Две практические детали:

- Спецификацию можно получить **без запущенного сервера**: `export_openapi(path)` — публичный API пакета (`from aqven import export_openapi`).
  Studio будет вызывать именно его, поэтому не убирайте эту функцию из публичного контракта.
- `openapi-typescript` 7.13.0 **падает на TypeScript 7** (`ts.factory` отсутствует): `TypeError: Cannot read properties of undefined (reading 'createKeywordTypeNode')`.
  Генератор закреплён на TypeScript 6.0.3.

## 5. Порядок, в котором это полезнее всего чинить

1. **2.2** (флоу публикует ключи контекста) — без этого форма запуска в Studio неточная, а это первый экран, которым человек запускает работу.
2. **2.3** (`aqven check` учитывает контекст) — гейт, который пропускает неработающий флоу, опаснее отсутствующего гейта.
3. **2.6** (видимость секретов) — убирает класс отказов «узнал, когда прогон уже потратил токены».
4. **2.4** (`sort=deadline_at`, `overdue`) — нужен экрану «Входящие» на реальных объёмах.
5. **3.1** (эвалы по HTTP) — самый большой кусок, но Studio уже показывает определения и ждёт результатов.
6. **2.5** (схемы событий) — косметика контракта, но сейчас эндпоинт врёт.

## 6. Открытые вопросы к вам

- `ChatSession` не имеет привязки к флоу (`session_id`, `backend`, `project_root`, `model`, `permission_mode`, `created_at`, `last_seq`).
  Одна сессия на проект — это осознанное решение, или Studio должна уметь вести сессию на флоу?
- `assignee` в ожиданиях — свободная строка (`support_lead`, `brand_editor`). Кто такой `me` для фильтра инбокса в локальной однопользовательской сборке?
- Должен ли движок сам подставлять `date = сегодня`, если контекст не передан, или отсутствие обязательного ключа должно быть явной ошибкой старта (`422` с указанием недостающих ключей)? Второе честнее и лучше ложится на форму.
