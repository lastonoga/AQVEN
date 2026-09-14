# 14. MCP-контракт для агентов

> Статус: draft
> Зависит от: [07. Компилятор](07-compiler.md), [07. Компилятор](07-compiler.md), [12. Наблюдаемость и отладка](12-observability.md), [02. Архитектура системы](02-architecture.md)
> Источники: research/mcp-server.md, research/api-layer.md, research/00-verified-by-lead.md, спека §13.1–§13.4

## Зачем этот слой

Определения лежат файлами в репозитории проекта ([ADR-0017](adr/0017-files-as-source-of-truth.md)),
и Claude Code правит их нативными инструментами. MCP-слой стоит не вместо файлов, а поверх них: он
закрывает проблему «агент не видит последствий своего действия» из §8 — доменная операция
валидируется до записи на всём дереве проекта, пишется транзакцией по набору файлов и возвращает
локальный контекст, машиночитаемые проблемы и готовые к применению кандидаты исправления. Второй
закрываемый риск — бюджет контекста: полный реестр (82 тула) стоит 20–49k токенов определений
до первого действия, поэтому поверхность раскрывается по фазам цикла.

## Решения

| Решение | Что берём | Версия | Лицензия | Почему |
|---|---|---|---|---|
| SDK сервера | `@modelcontextprotocol/sdk` | 1.30.0 | MIT | `registerTool` с `inputSchema` + `outputSchema`, `RegisteredTool.enable/disable`, оба транспорта в одном пакете |
| Схемы входа/выхода | zod | 4.6.2 | MIT | SDK принимает zod v4 raw shape (`zod-compat.ts`); один источник правды с `@wf/contracts` |
| Локальный транспорт | `StdioServerTransport` (`sdk/server/stdio.js`) | 1.30.0 | MIT | Claude Code, `claude mcp add --transport stdio` |
| Удалённый транспорт | `WebStandardStreamableHTTPServerTransport` (`sdk/server/webStandardStreamableHttp.js`) | 1.30.0 | MIT | Request/Response — работает и в Hono, и в Next Route Handler; node-обёртка не нужна |
| Авторизация | `requireBearerAuth` + `mcpAuthMetadataRouter` (`sdk/server/auth/*`) | 1.30.0 | MIT | мы Resource Server, AS внешний (better-auth 1.7.4) |
| Токен агента | better-auth `plugins/jwt` + `plugins/bearer` | 1.7.4 | MIT | JWT RS256 + JWKS, тот же `verifyToken`, что у REST |
| Формат ошибки | `ApiError` из `@wf/contracts` | — | — | один транслятор `DomainError → ApiError` на HTTP и MCP |
| Конкурентность | CAS по sha256 байтов файла, `.wf/lock`, история в git | — | — | глобального счётчика ревизий нет; CRDT (yjs 13.6.32 / loro-crdt 1.16.1) не решает задачу инвариантов графа |
| Скилл цикла | Agent Skills, Project-уровень `.claude/skills/` | — | — | версионируется вместе со спекой воркфлоу в том же репозитории |

Не берём: MCP sampling (Claude Code не поддерживает), MCP resources и prompts как обязательный канал
(не заявлены в доках Claude Code), CRDT для структуры графа, legacy HTTP+SSE транспорт (протокол
2024-11-05).

## 1. Принципы контракта

**П1. Два уровня на одних байтах.** Истина — байты файлов, и агент правит их нативными инструментами.
Доменная единица записи остаётся прежней: операция над графом (`add_node`, `bind`, `set`, `remove`)
в `flow_patch` вместе с `base{commit, files[]}`. Сервер сверяет хеши, применяет операции к дереву
в памяти, прогоняет валидатор инвариантов (типы портов, DAG, обязательные биндинги, межфайловые
ссылки) и только потом сериализует. Через доменный уровень невалидное состояние записать нельзя;
через файловый — можно, и его держат хук `flow_check` и гейт релиза (§2.8).

**П2. Почему ответ тула не содержит всего проекта.** Три причины, каждая измеримая:
- цена контекста: полный IR среднего воркфлоу + каталоги + трейсы не помещаются в бюджет, который
  нужен на рассуждение о конкретной ошибке;
- отсутствие семантики: текст спеки не говорит, какой узел виноват, — это знает компилятор и трейс;
- дрейф: прочитанный один раз проект устаревает после первой же правки (хеши файлов меняются), а
  агент продолжает рассуждать о старой копии.
Вместо чтения проекта сервер отдаёт **`focus`** — окрестность затронутого узла: сам узел, его
`upstream`/`downstream` по именам, отрендеренный фрагмент спеки вокруг него. Всё остальное — по
ссылке в `refs[]`, дочитывается только если понадобится.

**П3. Локальный контекст в ответе.** Ответ любого тула самодостаточен для следующего шага. Это
прямое следствие рекомендации Anthropic консолидировать тулы: `get_customer_context` вместо трёх
вызовов. У нас консолидированы `flow_patch` (все правки графа), `run_get_trace` (трейс + проблемы +
провенанс узла), `registry_propose` (три вида заявок).

**П4. Кандидаты исправления вместо прозы.** `candidates[].apply` — готовый вызов другого тула с
полностью заполненными `arguments`. Агент не конструирует патч из описания ошибки, он выполняет
предложенный вызов или отклоняет его. Тот же массив кандидатов Studio рисует кнопками «Починить»:
один формат — два интерфейса. Формат кандидата совпадает с `ErrorDetail.candidates[]` из
[07. Компилятор](07-compiler.md).

**П5. Отрицательный результат так же информативен, как положительный.** `ok:false` обязан нести
непустой `problems[]`; пустой `candidates[]` при `ok:false` допустим только для кодов
`unauthorized`, `forbidden`, `provider_error`, `internal`. Ни один ответ не содержит стектрейса.

**П6. `ui_url` в каждом ответе.** Не декорация: это (а) ссылка, по которой человек видит ровно то же
состояние, что агент, с подсвеченным узлом и выбранной проблемой; (б) аргумент для
`elicitInput({ mode: 'url' })`, когда нужен аппрув человека (URL-elicitation поддерживается Claude
Code). Формат: `https://studio.<host>/w/<spec_id>/run/<run_id>?node=<node_id>&problem=<index>`.

**П7. Наружу — читаемые имена, не UUID.** Агент оперирует slug-ами (`extract_line_items`), потому что
разрешение UUID в семантические имена измеримо повышает точность выбора. Внутренние идентификаторы
отдаются только в `refs[]` и в полях с суффиксом `_uuid`, если без них нельзя.

**П8. Доменные ошибки — не ошибки протокола.** JSON-RPC error используется только для нарушений
самого MCP (неизвестный тул, битый JSON). Всё доменное возвращается как обычный результат с
`isError: true` и полным конвертом — иначе агент не сможет это починить.

## 2. Полный реестр тулов

Имя сервера — `volt` (короткое намеренно: Claude Code префиксует тулы как
`mcp__<server>__<tool>`, а имя в Messages API ограничено по длине и по алфавиту — точка не входит).
Имена только `snake_case`, точки из §13.1 спеки переименованы. Самое длинное имя —
`mcp__volt__component_propose_to_library`, 41 символ.

Колонка «фаза» — когда тул включён: `core` = всегда, остальное включается `mode_set`.
Столбцы «вход»/«выход» дают состав аргументов и полезной нагрузки; общий конверт (§3) не повторяется.

### 2.1 Служебные (группа `core`)

| Имя | Группа | Что делает | Вход | Выход | Фаза |
|---|---|---|---|---|---|
| `mode_set` | core | Переключает фазу цикла, включая/выключая группы тулов | `phase`, `reason` | `enabled_tools[]`, `disabled_tools[]` | core |
| `help_contract` | core | Возвращает реестр кодов проблем, семантику фаз, список тулов текущей фазы | `topic?`, `code?` | `codes[]`, `phases[]`, `tools[]` | core |
| `studio_open` | core | Строит `ui_url` на конкретный объект и, при необходимости, просит человека подтвердить через URL-elicitation | `target{kind,id}`, `elicit?` | `ui_url`, `elicited?` | core |

### 2.2 Каталог, бриф, журнал, архитектуры

| Имя | Группа | Что делает | Вход | Выход | Фаза |
|---|---|---|---|---|---|
| `catalog_list` | catalog | Перечисляет архетипы, типы, профили моделей, тулы, паттерны | `kind`, `filter?`, `limit=20`, `cursor?` | `items[]`, `next_cursor`, `total_estimate` | core |
| `catalog_get` | catalog | Схема одного элемента каталога | `kind`, `id`, `view='summary'` | `schema`, `examples[]` | core |
| `brief_submit` | brief | Записывает бриф, возвращает пробелы, меняющие структуру воркфлоу | `brief`, `base?` | `gaps[]` (как `problems[]`), `version` | discover |
| `brief_get` | brief | Текущий бриф и незакрытые пробелы | `view='summary'` | `brief`, `gaps[]` | discover |
| `journal_read` | journal | История решений с обоснованиями | `since?`, `limit=20`, `cursor?` | `items[]`, `next_cursor` | core |
| `journal_append` | journal | Дописывает решение с обоснованием в `journal/*.md`; коммитится вместе с правкой | `decision`, `rationale`, `evidence[]` | `path`, `version` | core |
| `architecture_search` | architecture | Кандидаты паттернов по требуемым свойствам | `features[]`, `limit=5` | `items[]` с `cost_estimate`, `typical_failures[]` | discover |
| `architecture_get` | architecture | Описание паттерна, его узлы, стоимость, типовые сбои | `id`, `view` | `pattern`, `failures[]` | discover |
| `architecture_instantiate` | architecture | Разворачивает паттерн в подворкфлоу внутри спеки | `id`, `params`, `spec_id`, `base` | `version`, `focus`, `problems[]`, `paths[]` | discover, author |

### 2.3 Спека и компиляция

| Имя | Группа | Что делает | Вход | Выход | Фаза |
|---|---|---|---|---|---|
| `flow_create` | flow | Создаёт каталог воркфлоу по раскладке ([files-first/layout.md](files-first/layout.md)) из архетипа или пустой | `name`, `archetype?` | `spec_id`, `paths[]`, `version` | author |
| `flow_get` | flow | Читает спеку целиком или окрестность узла | `spec_id`, `node_id?`, `at?: commit\|'working'`, `view='summary'`, `depth=1` | `focus`, `refs[]`, `version{commit, files[{path,sha256}]}`, `dirty`, `layout_rev` | core |
| `flow_import` | flow | Импортирует `agent_workflow_spec` (§12) или бандл в файлы рабочего дерева | `source{kind,payload}` | `spec_id`, `paths[]`, `problems[]` (незакрытые вопросы §13.4) | author |
| **`flow_patch`** | flow | **Консолидирует `flow.add_node`, `flow.bind`, `flow.set`, `flow.remove`**: атомарный массив операций над набором файлов с CAS по содержимому | `spec_id`, `base{commit, files[{path, sha256}]}`, `ops[1..50]`, `idempotency_key?`, `dry_run=false` | `version{commit, files[{path,sha256}]}`, `changed_paths[]`, `focus`, `problems[]`, `candidates[]`, `conflict?` | author |
| `flow_commit` | flow | Фиксирует эпизод правки: коммит на набор путей, автор в трейлерах | `paths[]`, `message`, `intent?` | `commit`, `files[{path,sha256,status}]`, `compile{ok, problems[]}` | author, ship |
| `flow_history` | flow | История правок поверх git с актором и намерением | `path?`, `spec_id?`, `since?`, `until?`, `actor_kind?`, `limit=20`, `cursor?`, `view='summary'` | `items[]`, `next_cursor` | core |
| `flow_diff` | flow | Семантический (по умолчанию) или текстовый дифф двух состояний | `from`, `to`, `path?`, `scope='semantic'\|'text'`, `view` | `deltas[]`, `layout_changed`, `problems[]` | author, debug, ship |
| `flow_revert` | flow | Откат движением вперёд: новый коммит, не переписывание истории | `to: commit`, `paths?`, `message`, `base{commit}`, `dry_run=false` | `commit`, `reverted[]`, `compile{ok,...}`, `conflicts[]` | author, ship |
| `flow_lock` | flow | Advisory-lock спеки на время работы агента: lockfile в дереве, перехватываемый человеком | `spec_id`, `ttl_s=300`, `reason?`, `release=false` | `lock{holder, holder_kind, expires_at, takeover_allowed}` | author |
| `flow_compile` | flow | Компилирует спеку: ошибки, предупреждения, статический отчёт | `spec_id`, `at?: commit\|'working'` (по умолчанию рабочая копия), `view='summary'` | `report`, `problems[]`, `candidates[]` | author, run, ship |

Консолидация: шесть тонких тулов §13.1 (`add_node`, `bind`, `set`, `remove` + два скрытых в
«правке») схлопнуты в один `flow_patch` с дискриминированным union операций. Это одновременно
(а) сокращает поверхность, (б) делает правку атомарной, (в) даёт единственную точку оптимистичной
блокировки. `dry_run: true` заменяет отдельный `flow_validate`.

### 2.4 Контекст и провайдеры

| Имя | Группа | Что делает | Вход | Выход | Фаза |
|---|---|---|---|---|---|
| `context_plan` | context | Потребности в контексте для каждого решения в графе | `spec_id`, `node_id?` | `needs[]`, `problems[]` (R-C) | author |
| `context_bind` | context | Привязывает источники к потребностям | `spec_id`, `base`, `bindings[]` | `version`, `problems[]` (R-C) | author |
| `context_graph` | context | Граф «решение → источник → индекс» с нарушениями R-C | `spec_id`, `view='summary'` | `graph`, `problems[]` | author |
| `kb_indexes` | context | Состояние индексов базы знаний | `filter?`, `limit=20` | `items[]`, `next_cursor` | author |
| `provider_models` | provider | Каталог моделей с ценами и проверенными возможностями | `filter{capability,price_max,ctx_min}`, `limit=20` | `items[]`, `next_cursor` | author, evaluate |
| `provider_probe` | provider | Проверяет реальные возможности модели (strict-схемы, тулы, длина ответа) | `model`, `checks[]` | `capabilities`, `problems[]` | author, evaluate |

### 2.5 Прогон и отладка

| Имя | Группа | Что делает | Вход | Выход | Фаза |
|---|---|---|---|---|---|
| `run_start` | run | Материализует план в снимок и запускает прогон в режиме live или replay | `spec_id`, `at?: commit\|'working'`, `mode`, `input?`, `dataset_id?` | `run_id`, `status`, `content_hash`, `ui_url` | run |
| `run_get` | run | Статус прогона и сводка по стадиям | `run_id`, `view='summary'` | `status`, `stages[]`, `cost` | core |
| `run_get_node` | run | По узлу: промт, провенанс, ответ, проверки, стоимость; на приостановленном узле — форма ввода | `run_id`, `node_id`, `include_payloads='truncated'` | `focus`, `prompt`, `provenance`, `checks[]`, `cost`, `form_schema?`, `suspend_data?` | core |
| `run_list` | run | Листинг прогонов; «что ждёт меня» — фильтр, а не отдельный инбокс | `status?`, `assignee?`, `spec_id?`, `overdue?`, `limit=20`, `cursor?` | `items[{run_id, spec_id, node_id, status, assignee, waiting_since, deadline_at, title}]`, `next_cursor` | core |
| `run_resume` | run | Возобновляет приостановленный прогон ответом человека | `run_id`, `node_id`, `payload`, `idempotency_key?` | `status`, `next_node_id?`, `problems[]` | run |
| `run_cancel` | run | Отменяет прогон | `run_id`, `reason` | `status='cancelled'` | run |
| `run_get_trace` | run | Трейс прогона по узлам с проблемами и кандидатами | `run_id`, `node_id?`, `view='summary'`, `limit=20`, `cursor?` | `items[]`, `problems[]`, `candidates[]`, `next_cursor` | core |
| `run_replay_node` | run | Переисполняет один узел на зафиксированном входе (через replay-кэш) | `run_id`, `node_id`, `overrides?` | `run_id` (форк), `diff`, `problems[]` | debug |
| `run_fork` | run | Форк прогона с точки шага | `run_id`, `from_node_id`, `overrides?` | `run_id`, `lineage_parent` | debug |
| `run_diff` | run | Семантический дифф двух прогонов по узлам | `run_id_a`, `run_id_b`, `view='summary'` | `deltas[]` | debug |
| `run_stages` | run | Поэтапные результаты прогона на датасете | `run_id`, `limit=20`, `cursor?` | `stages[]`, `next_cursor` | debug, evaluate |
| `run_lineage` | run | Дерево происхождения прогона (форки, реплеи) | `run_id`, `depth=3` | `tree` | debug |
| `run_blame` | run | Виновный узел: какой узел объясняет падение метрики | `run_id`, `metric`, `baseline_run_id?` | `culprits[]` с `confidence`, `candidates[]` | debug |

Подсистемы задач нет: шесть операций `human_task_list/get/answer/reassign/escalate/cancel`
**отменены**. Приостановленный прогон — это статус, «что ждёт меня» — `run_list({status: 'suspended',
assignee: 'me'})`, просроченные — `overdue: true` с сортировкой по `deadline_at`. Форма ввода приходит
из `run_get_node` как `form_schema` (JSON Schema, развёрнутая из `form: TypeRef` по файлу типа) вместе
с `suspend_data`; отдельного справочника `form_kind` нет — kind это id типа. `payload` проверяется
против `resumeSchema` шага: ошибка — конверт с `problems[]`, прогон остаётся `suspended`. Таймаут —
не операция: объявлен в узле, исполняется планировщиком, по срабатыванию применяется `on_timeout`
(`fail | default(value) | escalate(role)`).

### 2.6 Evals, компоненты, агенты

| Имя | Группа | Что делает | Вход | Выход | Фаза |
|---|---|---|---|---|---|
| `dataset_add_from_run` | eval | Кладёт элементы прогона в датасет | `run_id`, `dataset_id`, `filter?` | `added`, `dataset_id` | evaluate |
| `dataset_get` | eval | Датасет и его метаданные | `dataset_id`, `view='summary'`, `limit=20`, `cursor?` | `items[]`, `next_cursor` | evaluate |
| `dataset_generate` | eval | Генерирует датасет под цели покрытия | `spec_id`, `coverage_goals[]`, `size` | `dataset_id`, `coverage` | evaluate |
| `dataset_coverage` | eval | Покрытие датасета по осям решений | `dataset_id`, `spec_id` | `coverage`, `problems[]` | evaluate |
| `scorer_create` | eval | Создаёт скорер (детерминированный или судья) | `kind`, `config` | `scorer_id`, `problems[]` | evaluate |
| `experiment_run` | eval | Запускает эксперимент на узле или воркфлоу | `spec_id`, `dataset_id`, `scorers[]`, `scope` | `experiment_id`, `status` | evaluate |
| `experiment_compare` | eval | Сравнение экспериментов с дельтами по узлам и статистикой | `experiment_id_a`, `experiment_id_b`, `view='summary'` | `deltas[]`, `stats`, `verdict` | evaluate |
| `experiment_model_matrix` | eval | Матрица моделей, граница Парето «качество × цена × латентность» | `spec_id`, `node_id`, `models[]`, `dataset_id` | `pareto[]`, `items[]` | evaluate |
| `feedback_list` | eval | Разметка и обратная связь по прогонам | `filter?`, `limit=20`, `cursor?` | `items[]`, `next_cursor` | evaluate |
| `component_list` | component | Компоненты ядра, общей библиотеки и локальные | `scope`, `limit=20`, `cursor?` | `items[]`, `next_cursor` | author |
| `component_get` | component | Сигнатура и контракт компонента | `id`, `view` | `signature`, `contract` | author |
| `component_expand` | component | Раскрывает компонент до примитивов | `id`, `depth=1` | `graph` | author, debug |
| `component_propose_to_library` | component | Заявка на добавление компонента в общую библиотеку | `id`, `evidence[]` | `proposal_id`, `status='pending_approval'` | ship |
| `agent_get` | agent | Определение агента | `id` | `agent` | author |
| `agent_effective_config` | agent | Итоговая конфигурация вызова на узле с происхождением каждого поля | `spec_id`, `node_id` | `config`, `provenance[]` | author, debug |

### 2.7 Реестры, версии, экспорт

| Имя | Группа | Что делает | Вход | Выход | Фаза |
|---|---|---|---|---|---|
| **`registry_propose`** | registry | **Консолидирует `registry.propose_type`, `.propose_profile`, `.propose_agent`**: заявка на аппрув | `kind: 'type'\|'profile'\|'agent'`, `payload`, `rationale` | `proposal_id`, `status='pending_approval'`, `ui_url` | author, ship |
| `version_propose` | version | Заявка на выпуск версии с доказательствами; грязное дерево → `DIRTY_WORKTREE` | `spec_id`, `commit`, `evidence[]` | `proposal_id`, `gate{verdict}`, `status='pending_approval'` | ship |
| `version_status` | version | Статус заявки и результат гейта | `proposal_id` | `status`, `gate`, `blockers[]` | ship |
| `project_export` | export | Бандл или экспорт в целевой рантайм; требует чистого дерева | `spec_id`, `commit`, `target` | `bundle_ref`, `losses[]` | ship |
| `project_import` | export | Импорт бандла в файлы рабочего дерева | `bundle_ref` | `spec_id`, `paths[]`, `problems[]` | ship |
| `project_conformance` | export | Прогон конформанс-набора против воссозданной реализации | `spec_id`, `endpoint`, `dataset_id` | `report`, `failures[]` | ship |
| `project_verify_migration` | export | Отчёт потерь при миграции в целевой рантайм | `spec_id`, `target` | `losses[]`, `verdict` | ship |

Итого 63 тула в 15 группах (`core`, `catalog`, `brief`, `journal`, `architecture`, `flow`, `context`,
`provider`, `run`, `eval`, `component`, `agent`, `registry`, `version`, `export`): было 57, отменён
`component_define` (локальный компонент — это файл), добавлены семь операций файловой модели
(`flow_commit`, `flow_history`, `flow_diff`, `flow_revert`, `run_list`, `run_resume`, `run_cancel`).
Ещё 19 недостающих операций (`repo_status`, `index_rebuild`, `external_changes_list`, поиск и влияние,
аппрувы, раскладка) в реестр не внесены: итоговая поверхность — **82 тула**
([files-first/contract.md](files-first/contract.md) §6). Одновременно включено не более 25 (§5).

### 2.8 Два уровня редактирования

Файловых операций `file_read`/`file_write` в MCP **не заводим**: у Claude Code уже есть Read, Edit,
Write и git, а дублирующий тул записи означал бы вторую схему CAS и второй способ обойти валидатор.

| | Файловый уровень | Доменный уровень |
|---|---|---|
| Кто | нативные тулы агента, редактор, git | `flow_patch` и его родня по MCP/REST |
| Единица и CAS | файл, байты; конфликт ловит git | набор файлов атомарно, `base{commit, files[]}` |
| Валидация | **после** записи: хук `flow_check` на `PostToolUse`, файл остаётся на диске | **до** записи: невалидное не пишется, `problems[]` + `candidates[]` |
| Охват | один файл: текст промта, правка поля, грепы | кросс-файловое: переименование типа в 40 файлах одним вызовом |

| Правило | Формулировка |
|---|---|
| Приоритет | структурную правку делаем `flow_patch`; прямая запись законна, но её отчёт приходит постфактум |
| Граница коммита | невалидное дерево коммитить можно, релизить — нет: `version_propose` требует `flow_compile(ok)` |
| Индекс | оба уровня переиндексируются одинаково, watcher на дереве, а не хук внутри `flow_patch` |

CLI-поверхность рядом с MCP — тот же компилятор, другой вход (пакет `@wf/cli`):

| Команда | Что делает |
|---|---|
| `wf check [пути] --format json` | полная проверка тем же компилятором, что и сервер; `problems[]` в формате конверта §3, ненулевой код возврата. Стоит хуком `PostToolUse`, в pre-commit и в CI |
| `wf fmt` / `wf fmt --check` | канонический вид YAML (порядок ключей, отступы, разрешённые конструкции); убивает класс конфликтов «стиль и порядок» |
| `wf lock` | пересобирает `wf.lock.yaml` — пины версий фрагментов и компонентов; расхождение лока с содержимым даёт `E_LOCK_STALE` и отказ релиза |

## 3. Единый конверт ответа

Каждый тул объявляет `outputSchema`, поэтому `McpServer` сам валидирует `structuredContent` на выходе
и `inputSchema` на входе. Ответ дублируется в `content[0].text` — требование обратной совместимости
spec 2025-06-18: клиент, не понимающий `structuredContent`, иначе увидит пустой ответ.

### 3.1 Схема

```ts
import { z } from 'zod';

const Version = z.object({
  spec_id: z.string(),
  commit: z.string(),
  files: z.array(z.object({ path: z.string(), sha256: z.string() })),
  dirty: z.boolean()
});

const Problem = z.object({
  code: ProblemCode,
  severity: z.enum(['error', 'warning', 'info']),
  at: z.object({ node_id: z.string().nullable(), path: z.string().nullable(), line: z.number().int().nullable() }),
  message: z.string(),
  evidence: z.record(z.string(), z.unknown()).nullable()
});

const Candidate = z.object({
  id: z.string(),
  title: z.string(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  risk: z.enum(['low', 'medium', 'high']),
  affects: z.array(z.string()),
  apply: z.object({ tool: z.string(), arguments: z.record(z.string(), z.unknown()) })
});

const Envelope = z.object({
  ok: z.boolean(),
  op: z.string(),
  version: Version.nullable(),
  focus: z.object({
    node_id: z.string(),
    node_kind: z.string(),
    excerpt: z.string(),
    upstream: z.array(z.string()),
    downstream: z.array(z.string())
  }).nullable(),
  problems: z.array(Problem).default([]),
  candidates: z.array(Candidate).default([]),
  next: z.array(z.object({
    tool: z.string(),
    arguments: z.record(z.string(), z.unknown()),
    why: z.string()
  })).default([]),
  refs: z.array(z.object({
    type: z.literal('resource_link'),
    uri: z.string(),
    name: z.string(),
    mimeType: z.string(),
    description: z.string()
  })).default([]),
  ui_url: z.string().url(),
  truncated: z.object({
    fields: z.array(z.string()),
    hint: z.string()
  }).nullable()
});
```

`ProblemCode` — стабильный enum, единый с `ErrorCode`/`ErrorDetail.rule` из
[07. Компилятор](07-compiler.md): агент маршрутизирует по коду, не парся текст. Полный список
кодов доступен агенту без чтения документации через `help_contract({ topic: 'codes' })` и продублирован
в `reference.md` скилла.

Стиль схем — тот же, что у IR (DECISIONS, «Структурированный вывод»): все поля обязательны,
опциональность через `null`, `additionalProperties: false`, без рекурсии, порядок полей — как в
объявлении.

### 3.2 Успешный ответ

```jsonc
{
  "ok": true,
  "op": "flow_patch",
  "version": { "spec_id": "wf_invoice", "commit": "a17c9f1", "files": [{ "path": "flows/wf_invoice/nodes/extract_line_items.yaml", "sha256": "9f1c2b…" }], "dirty": true },
  "focus": {
    "node_id": "extract_line_items",
    "node_kind": "llm.structured",
    "excerpt": "extract_line_items: llm.structured\n  model_profile: extract_cheap\n  output.items[].qty: number\n  consumers: validate_totals",
    "upstream": ["parse_pdf"],
    "downstream": ["validate_totals"]
  },
  "problems": [],
  "candidates": [],
  "next": [
    { "tool": "flow_compile", "arguments": { "spec_id": "wf_invoice" }, "why": "Проверить, что тип разошёлся только здесь" },
    { "tool": "run_replay_node", "arguments": { "run_id": "run_8812", "node_id": "extract_line_items" }, "why": "Проверить фикс без полного прогона" }
  ],
  "refs": [],
  "ui_url": "https://studio.example.com/w/wf_invoice?node=extract_line_items&at=a17c9f1",
  "truncated": null
}
```

### 3.3 Неуспешный ответ

Возвращается как обычный результат тула с `isError: true`, не как JSON-RPC error.

```jsonc
{
  "ok": false,
  "op": "flow_patch",
  "version": { "spec_id": "wf_invoice", "commit": "a17c9f1", "files": [{ "path": "flows/wf_invoice/nodes/extract_line_items.yaml", "sha256": "7b40de…" }], "dirty": true },
  "focus": {
    "node_id": "extract_line_items",
    "node_kind": "llm.structured",
    "excerpt": "output.items[].qty: string\n  consumers: validate_totals (ожидает number)",
    "upstream": ["parse_pdf"],
    "downstream": ["validate_totals"]
  },
  "problems": [{
    "code": "TYPE_MISMATCH",
    "severity": "error",
    "at": { "node_id": "extract_line_items", "path": "output.items[].qty", "line": 118 },
    "message": "Узел отдаёт string, потребитель validate_totals ждёт number.",
    "evidence": { "observed": "\"12\"", "expected_type": "number", "run_id": "run_8812", "sample_span": "span_31" }
  }],
  "candidates": [{
    "id": "cand_1",
    "title": "Привести qty к number в схеме узла",
    "confidence": 0.82,
    "rationale": "В 47/50 прогонов модель отдаёт число строкой; схема ниже по потоку уже строгая.",
    "risk": "low",
    "affects": ["validate_totals"],
    "apply": {
      "tool": "flow_patch",
      "arguments": {
        "spec_id": "wf_invoice",
        "base": { "commit": "a17c9f1", "files": [{ "path": "flows/wf_invoice/nodes/extract_line_items.yaml", "sha256": "7b40de…" }] },
        "ops": [{ "op": "set", "path": "/nodes/extract_line_items/output/items/qty/type", "value": "number" }]
      }
    }
  }],
  "next": [],
  "refs": [{
    "type": "resource_link",
    "uri": "volt://run/run_8812/trace?node=extract_line_items",
    "name": "trace: extract_line_items",
    "mimeType": "application/json",
    "description": "Полный трейс узла, 34 KB"
  }],
  "ui_url": "https://studio.example.com/w/wf_invoice/run/run_8812?node=extract_line_items&problem=0",
  "truncated": { "fields": ["focus.excerpt"], "hint": "Полный текст: flow_get({spec_id:'wf_invoice',node_id:'extract_line_items',view:'raw'})" }
}
```

Ни один файл при этом не тронут: правило «сначала применить ops к дереву в памяти, потом
провалидировать инварианты, при ошибке не сериализовать» гарантирует, что `problems[]` описывают
состояние, которое **было бы**, а не записанное.

### 3.4 Как это возвращается из хендлера

```ts
server.registerTool('flow_patch', {
  title: 'Правка спеки',
  description: 'Атомарно применяет операции к файлам воркфлоу. Требует base с хешами затрагиваемых файлов. ' +
               'При конфликте возвращает текущий хеш и предложение ребейза, а не голый отказ.',
  inputSchema: FlowPatchInput,
  outputSchema: EnvelopeShape,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
}, async (args, extra) => {
  extra.signal.throwIfAborted();
  const envelope = await applyPatch(args, requireScopes(extra.authInfo, ['workflows:write']));
  return {
    structuredContent: envelope,
    content: [{ type: 'text', text: renderEnvelopeForAgent(envelope) }],
    isError: !envelope.ok
  };
});
```

`renderEnvelopeForAgent` — единственное место, где конверт превращается в текст (компактно: фокус,
до трёх проблем, до трёх кандидатов). Правило: агент читает текст, действует по `structuredContent`.
`annotations` заполняем у всех тулов — Claude Code показывает их человеку и оценивает риск; при этом
помним предупреждение спецификации, что клиент считает их недоверенными, поэтому реальное принуждение
прав — в §6, а не в аннотациях.

## 4. Бюджет ответа

### 4.1 Жёсткие лимиты клиента

| Лимит | Значение | Источник | Что делаем |
|---|---|---|---|
| `MAX_MCP_OUTPUT_TOKENS` | 25 000 токенов на ответ тула по умолчанию, предупреждение на 10 000 | Claude Code | целимся в 2–4k, «толстым» тулам поднимаем потолок |
| `_meta['anthropic/maxResultSizeChars']` | до 500 000 символов, пер-тул | `tools/list` | ставим `200_000` только на `run_get_trace`, `flow_compile`, `experiment_compare` |
| `MCP_TOOL_TIMEOUT` | дефолт ~28 часов, пер-сервер `timeout` (мс, мин. 1000) | Claude Code | ставим `timeout: 120000` в `.mcp.json`; всё длиннее — асинхронный `run_id` + `run_get`, а не удержание вызова |
| Idle timeout | 5 мин (http/sse/ws), 30 мин (stdio) | Claude Code | долгие прогоны не держат стрим: `run_start` возвращает `run_id` сразу |
| Системный промт тулов | +286 токенов (`tool_choice: auto`) / +406 (`any\|tool`) для Opus 5 | platform.claude.com | учитываем в оценке, повлиять не можем |

### 4.2 `view` — три уровня детализации

Обязателен у всех тулов, чей ответ может превысить ~1k токенов. Это наш аналог `response_format`
Anthropic, где `concise` даёт примерно треть токенов от `detailed` без потери информации, нужной для
следующего вызова.

| `view` | Что входит | Целевой размер | Когда |
|---|---|---|---|
| `summary` (дефолт) | `focus` + до 3 `problems` + до 3 `candidates` + агрегаты; payload'ы обрезаны до 200 символов | ≤ 1 500 токенов | всегда первый вызов |
| `detailed` | все `problems`, все `candidates`, payload'ы обрезаны до 2 000 символов, промт узла целиком | ≤ 6 000 токенов | `summary` не хватило для решения |
| `raw` | без обрезки, только с явным `node_id` или `span_id` | до `maxResultSizeChars` | точечное чтение одного объекта |

`raw` без сужающего аргумента (`node_id`, `span_id`, `item_id`) отклоняется с
`problems[].code = 'VIEW_TOO_BROAD'` и кандидатом, подставляющим сужение. Дополнительно у трейсовых
тулов есть `include_payloads: 'none' | 'truncated' | 'full'` (дефолт `truncated`) — ортогональная ось:
`view` управляет шириной, `include_payloads` — глубиной каждого элемента.

### 4.3 Пагинация

Единая для всех листингов, без исключений:

```ts
const Page = z.object({
  items: z.array(Item),
  next_cursor: z.string().nullable(),
  total_estimate: z.number().int()
});
```

Дефолтный `limit` — 20, максимум — 200. Курсор непрозрачный (base64 от `(sort_key, id)`), не offset:
история и трейсы дописываются во время листинга. `total_estimate` — именно оценка, точный `count` на
партиционированных `run_nodes` не считаем.

`tools/list` тоже пагинируется (`params.cursor` → `result.nextCursor`) — при 82 тулах это нужно,
если клиент запросит полный список без фазового фильтра.

### 4.4 Что делаем при усечении

Усечение никогда не молчит. Правила:

1. Поле `truncated.fields[]` перечисляет **пути усечённых полей**, а не флаг «что-то обрезано».
2. `truncated.hint` — не констатация, а стратегия: готовый вызов, который добирает недостающее с
   сужением. Сообщение об усечении обязано подсказывать «делай точечные запросы», иначе агент
   повторит тот же широкий вызов.
3. Усечение никогда не затрагивает `problems[]` и `candidates[]` — сначала режутся `excerpt`,
   payload'ы, `items[]`, и только если этого не хватило, ответ отдаётся с `ok: false` и
   `code = 'RESPONSE_BUDGET_EXCEEDED'` плюс кандидатом на сужающий вызов.
4. Порядок деградации фиксирован таблицей, а не эвристикой:

| Шаг | Что режем | До какого размера |
|---|---|---|
| 1 | `focus.excerpt` | 15 строк вокруг узла |
| 2 | payload'ы элементов | 200 символов + `…(N байт)` |
| 3 | `items[]` | до `limit`, остаток — за `next_cursor` |
| 4 | `candidates[]` | топ-3 по `confidence` |
| 5 | `problems[]` | топ-3 по `severity`, остальные — счётчиком `problems_omitted` |
| 6 | — | `ok:false`, `RESPONSE_BUDGET_EXCEEDED` |

5. Всё, что вырезано, остаётся достижимым по `refs[]` — `resource_link` с `uri` вида
   `volt://run/<run_id>/trace?node=<node_id>` и честным размером в `description`. Ссылка не
   обязывает клиента поддерживать MCP resources: тот же объект достаётся тулом, указанным в
   `truncated.hint`.

## 5. Фазовое раскрытие тулов

### 5.1 Почему без этого нельзя

82 тула × 250–600 токенов на определение с нетривиальной схемой = 20–49k токенов **до первого
сообщения пользователя**. Это бюджет, который нужен на трейсы. Anthropic измеряла тот же эффект: у
крупных наборов загрузка всех определений съедала порядка 150k токенов, и ленивое раскрытие снижало
это на ~98,7%. Цель: одновременно активны ≤ 20–25 тулов.

### 5.2 Ядро (всегда включено, 13 тулов)

`mode_set`, `help_contract`, `studio_open`, `catalog_list`, `catalog_get`, `journal_read`,
`journal_append`, `flow_get`, `flow_history`, `run_get`, `run_list`, `run_get_node`, `run_get_trace`.

Критерий попадания в ядро: тул нужен в любой фазе **или** нужен для выхода из тупика (переключить
фазу, узнать контракт, посмотреть, что происходит). Ядро самодостаточно: из него всегда достижим
`mode_set`, а значит любая другая группа.

### 5.3 Фазы и группы

| Фаза | Дополнительно включается | Всего активно |
|---|---|---|
| `discover` | `brief_*`, `architecture_*` | 16 |
| `author` | `flow_*`, `context_*`, `kb_indexes`, `component_*` (кроме `propose_to_library`), `agent_*`, `provider_*`, `registry_propose` | 25 |
| `run` | `run_start`, `flow_compile` | 13 |
| `debug` | `run_replay_node`, `run_fork`, `run_diff`, `run_stages`, `run_lineage`, `run_blame`, `agent_effective_config`, `component_expand` | 19 |
| `evaluate` | `dataset_*`, `scorer_create`, `experiment_*`, `feedback_list`, `provider_*`, `run_stages` | 23 |
| `ship` | `version_*`, `project_*`, `component_propose_to_library`, `registry_propose`, `flow_compile` | 20 |

Колонка «всего активно» считалась для реестра из 57 тулов и требует пересборки целиком под 82:
состав фаз пересматривается вместе с распределением операций файловой модели по группам.

Переход делается либо явно (`mode_set({ phase: 'debug', reason: '...' })`), либо автоматически по
контексту: `run_get` с `status: 'failed'` включает группу `debug` и говорит об этом в `next[]`.
Автопереход всегда отражается в ответе полем `phase_changed`, чтобы агент знал о смене поверхности,
даже не перечитывая `tools/list`.

### 5.4 Механизм

Штатный, без самописных костылей: `RegisteredTool.enable()` / `disable()` из
`@modelcontextprotocol/sdk@1.30.0`. Они сами шлют `notifications/tools/list_changed`, поэтому
сервер объявляет capability `{ tools: { listChanged: true } }`.

```ts
type Phase = 'discover' | 'author' | 'run' | 'debug' | 'evaluate' | 'ship';

const PHASE_GROUPS: Record<Phase, readonly string[]> = {
  discover: ['brief', 'architecture'],
  author: ['flow', 'context', 'component', 'agent', 'provider', 'registry'],
  run: ['run_exec'],
  debug: ['run_debug', 'agent', 'component'],
  evaluate: ['eval', 'provider', 'run_debug'],
  ship: ['version', 'export', 'registry', 'library']
};

class ToolSurface {
  constructor(
    private readonly byGroup: Map<string, RegisteredTool[]>,
    private readonly core: readonly string[]
  ) {}

  setPhase(phase: Phase): SurfaceDelta {
    const active = new Set(PHASE_GROUPS[phase]);
    const delta: SurfaceDelta = { enabled: [], disabled: [] };
    for (const [group, tools] of this.byGroup) {
      const shouldBeOn = active.has(group);
      for (const tool of tools) {
        if (tool.enabled === shouldBeOn) continue;
        shouldBeOn ? tool.enable() : tool.disable();
        (shouldBeOn ? delta.enabled : delta.disabled).push(tool.title ?? group);
      }
    }
    return delta;
  }
}
```

Это Registry поверх группы + плоская таблица `PHASE_GROUPS` вместо лестницы условий. Ядро в
`byGroup` не входит вообще, поэтому выключить его нельзя структурно.

### 5.5 Риск и страховка

**Риск:** не все MCP-клиенты перечитывают `tools/list` после `notifications/tools/list_changed`.
Поведение Claude Code при смене списка в середине сессии не проверено на живом сервере. Если клиент
не перечитал список, агент вызовет тул, который сервер считает выключенным.

Страховка — четыре независимых механизма:

1. **Ядро самодостаточно.** Даже при полностью «залипшем» списке из ядра достижимо всё: посмотреть
   состояние, прочитать контракт, переключить фазу.
2. **Выключенный тул отвечает по-человечески, а не «unknown tool».** Хендлер остаётся
   зарегистрированным; `disable()` убирает тул из листинга, но вызов перехватывается общей обёрткой,
   которая возвращает конверт с `code: 'TOOL_PHASE_DISABLED'` и кандидатом
   `apply: { tool: 'mode_set', arguments: { phase: <нужная фаза> } }`. Агент делает ровно один
   восстановительный шаг.
3. **Автовключение по требованию.** Если вызванный тул принадлежит группе, разрешённой текущей ролью,
   сервер включает фазу сам, выполняет вызов и сообщает `phase_changed` в ответе. Отказ — только
   если группа запрещена правами (§6), и это уже не про фазы.
4. **Аварийный выключатель.** `mode_set({ phase: 'all' })` включает всю поверхность. Нужен для
   клиентов без `listChanged` и для отладки; в ответе помечается `surface: 'full'`, чтобы это было
   видно в журнале.

Следствие для тестов: контрактный тест на каждый тул — «вызов в чужой фазе возвращает
`TOOL_PHASE_DISABLED` с валидным кандидатом», а не исключение.

### 5.6 Чего не делаем

Tool Search Tool (platform.claude.com) — официальный ответ Anthropic на большие наборы, но это фича
**Messages API**, а не MCP-сервера: как сервер мы её не включаем. Она остаётся релевантной, если наш
собственный раннер пойдёт в Messages API напрямую, минуя Claude Code — тогда 82 тула перестают быть
проблемой и фазы можно оставить только как организующий приём.

## 6. Права агента

### 6.1 Матрица (§13.2 в терминах тулов и скоупов)

| Действие | Может | Тулы | Скоуп |
|---|---|---|---|
| Править черновики спеки и шаблоны промтов | да | `flow_create`, `flow_patch`, `flow_import`, `flow_lock`, `context_bind` | `workflows:write` |
| Определять компоненты внутри воркфлоу | да | `flow_patch` (файл компонента), `component_expand` | `workflows:write` |
| Компилировать | да | `flow_compile` | `workflows:read` |
| Запускать прогоны, реплеи, форки | да | `run_start`, `run_replay_node`, `run_fork` | `runs:execute` |
| Создавать датасеты и скореры | да | `dataset_*`, `scorer_create` | `evals:write` |
| Запускать эксперименты и сравнивать | да | `experiment_*`, `feedback_list` | `evals:write` |
| Предлагать версии | да | `version_propose` | `versions:propose` |
| **Выпускать версии** | нет | — | `versions:release` агенту не выдаётся |
| **Добавлять компоненты в общую библиотеку** | нет | `component_propose_to_library` создаёт заявку, не запись | `library:propose` |
| **Менять реестры и политики** | нет | `registry_propose` создаёт заявку | `registry:propose` |
| **Читать секреты** | нет | тула нет вообще | — |
| **Использовать что-либо вне ядра, библиотеки и своих компонентов** | нет | принуждается компилятором | — |

### 6.2 Как это принуждается технически

Четыре уровня, каждый закрывает свой класс обхода. Аннотации тулов (`readOnlyHint`,
`destructiveHint`) в этот список **не входят**: спецификация MCP прямо говорит, что клиент считает их
недоверенными, это подсказка человеку, а не контроль.

**Уровень 1 — токен.** Агент получает собственный credential, привязанный к тройке
(user, tenant, scopes), и никогда — сессионную cookie человека (иначе теряется аудит «кто сделал»).
Скоупа `versions:release`, `library:write`, `registry:write`, `secrets:read` в токене агента нет
физически, поэтому эскалация внутри MCP невозможна.

**Уровень 2 — эндпоинт.** `requireBearerAuth({ verifier, requiredScopes })` из
`@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js` проверяет токен до вызова тула и
кладёт `AuthInfo` в `extra.authInfo`. `requiredScopes` действует на весь эндпоинт, поэтому там стоит
минимальный общий набор (`mcp:use`).

**Уровень 3 — тул.** Гранулярность на группу проверяется внутри хендлера, потому что `requiredScopes`
не умеет пер-тульной проверки. Одна guard-функция, общая обёртка, никакой логики в самих тулах:

```ts
const TOOL_SCOPES: Record<string, readonly string[]> = {
  flow_patch: ['workflows:write'],
  run_start: ['runs:execute'],
  version_propose: ['versions:propose'],
  registry_propose: ['registry:propose'],
  component_propose_to_library: ['library:propose']
};

function requireScopes(auth: AuthInfo | undefined, tool: string): Actor {
  const needed = TOOL_SCOPES[tool] ?? [];
  const granted = new Set(auth?.scopes ?? []);
  const missing = needed.filter((scope) => !granted.has(scope));
  if (!auth) throw new DomainError('unauthorized', { tool });
  if (missing.length > 0) throw new DomainError('forbidden', { tool, missing });
  return toActor(auth);
}
```

`DomainError` транслируется в конверт с `ok: false` и `problems[].code = 'FORBIDDEN'` через тот же
`map-error`, что и HTTP (§9). Кандидатов такой ответ не несёт — предлагать агенту обход прав нельзя;
вместо этого `next[]` содержит `studio_open` с `elicit: true`, то есть отправляет решение человеку.

**Уровень 4 — домен.** То, что нельзя выразить скоупом:
- **Заявка вместо записи.** `registry_propose`, `version_propose`, `component_propose_to_library`
  пишут в таблицу заявок со статусом `pending_approval` и возвращают `ui_url` на экран аппрува. Тула,
  переводящего заявку в `approved`, в MCP-поверхности не существует — этот переход есть только в
  REST под человеческой сессией. Разделение принуждается тем, что MCP и Studio ходят в разные
  use-case'ы, а не разными правами на один.
- **Секреты.** В реестре нет группы `secret_*`. Ключи провайдеров никогда не попадают в IR: узел
  ссылается на профиль модели, профиль — на ссылку `secret_ref`, разрешение ссылки происходит
  в исполнителе узла на сервере. В `run_get_node` и `run_get_trace` поля с `secret_ref`
  редактируются до отдачи, независимо от `view` и `include_payloads`.
- **Границы «ядро + библиотека + свои компоненты».** Это инвариант компилятора, а не прав доступа:
  `flow_patch` с операцией, ссылающейся на неразрешённый компонент, откатывается с
  `code: 'COMPONENT_NOT_ALLOWED'`. Проверка одна и та же для агента и для Studio, потому что обе
  правки идут через один и тот же валидатор.

### 6.3 Аудит

Актор пишется трейлерами коммита (`actor_kind`, `actor_id`, `session_id` MCP), `git author` различает
человека и агента. `journal_append` агент вызывает сам, но журнал решений — не источник истины
об изменениях: истина — git-история, в которую агент пишет только через `flow_commit`, и рабочее
дерево, за которым следит watcher.

## 7. Транспорт и авторизация

### 7.1 Два входа, одна поверхность тулов

| Сценарий | Транспорт | Класс SDK | Авторизация |
|---|---|---|---|
| Локальный Claude Code рядом с репозиторием | stdio | `StdioServerTransport` | credential из окружения процесса, `.mcp.json` с `${VAR}` |
| Удалённый агент, CI, другой клиент | Streamable HTTP | `WebStandardStreamableHTTPServerTransport` | `Authorization: Bearer` на каждом запросе |

Legacy HTTP+SSE (протокол 2024-11-05, `sdk/server/sse.js`) не поддерживаем. `ws` из Claude Code не
используем: он доступен только через `claude mcp add-json` и ничего не добавляет поверх Streamable
HTTP.

Web-вариант транспорта выбран вместо node-обёртки намеренно: он работает на Request/Response, то есть
одинаково монтируется в Hono control plane и в Next Route Handler, без `@hono/node-server`.

Регистрация у клиента:

```bash
claude mcp add --transport stdio volt -- npx -y @wf/mcp-server
claude mcp add --transport http  volt https://api.example.com/mcp --header "Authorization: Bearer ${VOLT_TOKEN}"
```

В репозиторий воркфлоу коммитится `.mcp.json` (project-скоуп) с подстановкой `${VOLT_TOKEN}` и
`${CLAUDE_PROJECT_DIR}`; отсутствующая переменная даёт предупреждение, а не падение, поэтому
`help_contract` обязан уметь отвечать «токен не подставлен» вместо 401 без объяснения.

### 7.2 Сессии Streamable HTTP

```ts
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  onsessioninitialized: (id) => sessions.attach(id),
  onsessionclosed: (id) => sessions.release(id),
  enableJsonResponse: false,
  eventStore: new PgEventStore(pool),
  keepAliveMs: 15_000,
  retryInterval: 3_000
});
```

Stateful-режим выбран ради `flow_lock` и фазовой поверхности: и то и другое привязано к сессии.
Состояние сессии транспорт держит **в памяти**, поэтому при нескольких репликах обязателен либо
sticky-routing по `Mcp-Session-Id`, либо общий `eventStore` (наша реализация на Postgres — она же
даёт resumability по `Last-Event-ID`). Неизвестный session ID → 404, не-initialize запрос без session
ID → 400.

`closeSSEStream(requestId)` используем для длинных прогонов: обрываем стрим принудительно, клиент
переходит в polling через `run_get`, idle-таймаут в 5 минут не срабатывает.

CORS SDK не делает, это наша middleware. Обязательный минимум:
`Access-Control-Expose-Headers: Mcp-Session-Id` (иначе браузерный клиент не увидит сессию), разрешённые
заголовки `Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID`, методы
`GET, POST, DELETE, OPTIONS`. Защита от DNS-rebinding — через
`sdk/server/middleware/hostHeaderValidation.js`, а не через deprecated-опции транспорта
(`allowedHosts`, `allowedOrigins`, `enableDnsRebindingProtection`).

### 7.3 Мы Resource Server, а не Authorization Server

SDK умеет и то и другое; `mcpAuthRouter` (полноценный AS) не берём — своя выдача токенов означала бы
свою реализацию OAuth 2.1 при живом better-auth.

```ts
app.route('/', mcpAuthMetadataRouter({
  oauthMetadata,
  resourceServerUrl: new URL('https://api.example.com/mcp'),
  scopesSupported: [
    'mcp:use',
    'workflows:read', 'workflows:write',
    'runs:execute',
    'evals:write',
    'versions:propose', 'registry:propose', 'library:propose'
  ],
  resourceName: 'volt'
}));

app.use('/mcp', requireBearerAuth({
  verifier: betterAuthVerifier,
  requiredScopes: ['mcp:use'],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL('https://api.example.com/mcp'))
}));
```

`mcpAuthMetadataRouter` монтируется **в корне приложения** (требование SDK), иначе
`/.well-known/oauth-protected-resource/mcp` окажется не по тому пути и клиент не найдёт метаданные.
На 401 `requireBearerAuth` сам добавляет `WWW-Authenticate` со ссылкой на эти метаданные — это то, по
чему Claude Code запускает браузерный OAuth-флоу (`claude mcp login volt`, Dynamic Client Registration
поддерживается).

Authorization Server — better-auth 1.7.4 с плагинами `jwt` (RS256 + JWKS) и `bearer`;
`betterAuthVerifier` — тот же `verifyToken`, что используется на REST-границе, то есть один
`AuthProvider` (Strategy) на оба входа. Смена IdP на Clerk/WorkOS = замена верификатора, контракт
тулов не меняется.

**Скоупы — на группу тулов, не на тул.** `requiredScopes` в `requireBearerAuth` действует на весь
эндпоинт, поэтому там только `mcp:use`; пер-тульная проверка — `requireScopes(extra.authInfo, name)`
внутри общей обёртки хендлера (§6.2). Разделение намеренное: эндпоинт отвечает на вопрос «этот токен
вообще наш», тул — на вопрос «этому актору можно это действие».

### 7.4 Что не строим на клиентских возможностях

| Возможность MCP | Claude Code | Наше решение |
|---|---|---|
| tools | поддерживается полностью | **весь контракт живёт здесь** |
| elicitation (form и URL) | поддерживается | используем URL-форму для аппрувов через `studio_open` |
| resources | в доках не заявлена | только `refs[]` как ссылки; ни одна обязательная информация не доступна **только** через resource |
| prompts как slash-команды | в доках не заявлена | не используем; протокол цикла — скилл (§8) |
| sampling | не поддерживается | не используем вообще |

Отсюда же следует, почему протокол цикла — Agent Skill, а не MCP prompt.

## 8. Протокол цикла (§13.3) как скилл

### 8.1 Где лежит и как версионируется

Скилл `volt-workflow-loop` едет **Project-скоупом** в репозитории воркфлоу:
`<repo>/.claude/skills/volt-workflow-loop/SKILL.md`, коммитится в git. Это единственный уровень, на
котором скилл версионируется вместе со спекой: Enterprise и Personal живут вне репозитория и имеют
более высокий приоритет при совпадении имён (Enterprise > Personal > Project), поэтому имя намеренно
специфичное — перебить его случайным одноимённым Personal-скиллом нельзя.

Генератор проекта кладёт рядом короткий `AGENTS.md`/`CLAUDE.md`: как поднять MCP-сервер (`.mcp.json`),
какая фаза цикла текущая, ссылка на скилл. Контракт тулов туда **не** дублируется — он в
`tools/list` и в `help_contract`.

Версия скилла привязана к мажору контракта: `metadata.contract_version: "1"`. Несовпадение с тем, что
вернёт `help_contract`, — предупреждение в первом же ответе тула.

### 8.2 Структура бандла

```
.claude/skills/volt-workflow-loop/
  SKILL.md            обзор + инвариант цикла + навигация, < 500 строк
  reference.md        коды проблем, семантика фаз, полный реестр тулов с аргументами
  examples.md         разобранные эпизоды: STALE_FILE, TYPE_MISMATCH, срыв гейта
  scripts/
    check_loop_state.sh   печатает фазу, чистоту дерева, статус последнего прогона
  data/
    archetypes.json       локальная копия каталога архетипов для офлайн-навигации
```

Три уровня раскрытия работают так: `name` + `description` грузятся всегда (постоянная цена
контекста), тело SKILL.md — при вызове, `reference.md` / `examples.md` / `data/` — только когда агент
их реально читает. Скрипты исполняются **без загрузки в контекст**, через
`allowed-tools: Bash(bash ${CLAUDE_SKILL_DIR}/scripts/check_loop_state.sh *)` — это главный приём
экономии: состояние цикла добывается командой, а не чтением файла.

### 8.3 Frontmatter

Держим **переносимое подмножество спецификации Agent Skills**: `name`, `description`, `license`,
`compatibility`, `metadata`, `allowed-tools`. Все прочие поля — Claude-Code-only и вызывают ошибку
при загрузке скилла на claude.ai / через Skills API. Claude-Code-специфика (`context: fork`, `agent`,
`model`, `effort`, `disallowed-tools`, `argument-hint`, `hooks`) живёт в отдельном варианте бандла для
внутреннего использования, не в публикуемом.

Ограничение: `description` + `when_to_use` суммарно ≤ 1536 символов.

### 8.4 Что обязано быть в первых 5000 токенов SKILL.md

Критично и не подлежит обсуждению: при авто-компакции контекста после вызова скилла
переприкрепляются **первые 5000 токенов** последнего вызова. Всё, что дальше, агент теряет посреди
длинной сессии отладки — то есть ровно тогда, когда протокол нужен больше всего.

Поэтому в первых 5000 токенах:

1. **Инвариант цикла** — десять шагов §13.3 в терминах тулов, одной таблицей.
2. **Правила остановки** — не больше 5 итераций улучшения; стоп после двух итераций без прогресса.
3. **Правила безопасности** — агент не выпускает версии, не пишет в реестры и библиотеку, не читает
   секреты; `*_propose` создаёт заявку, а не запись.
4. **Правило действия по `candidates[]`** — если ответ содержит кандидата с `confidence ≥ 0.7` и
   `risk: 'low'`, следующий шаг — его `apply`, а не собственная конструкция патча.
5. **Правило конфликта** — `STALE_FILE`: не перечитывать проект целиком, а перечитать пути из
   `conflict` и применить `conflict.rebased_ops`, если сервер их вернул.
6. **Навигация** — «коды проблем → reference.md», «разобранные случаи → examples.md», «состояние →
   scripts/check_loop_state.sh».

За пределы 5000 токенов уходит всё остальное: подробности аргументов тулов, описания архетипов,
примеры. Аудит стоимости — `/skill-doctor`.

### 8.5 Протокол §13.3 в терминах тулов

| Шаг | Тулы | Фаза | Условие перехода дальше |
|---|---|---|---|
| 1. Ориентация | `journal_read`, `brief_get`, `catalog_list` | discover | бриф прочитан |
| 2. Архитектура | `architecture_search` → `architecture_get` → `architecture_instantiate`; при сыром описании процесса сначала скилл `agentic-process-spec`, затем `flow_import` | discover → author | выбор записан `journal_append` |
| 3. Контекст | `context_plan` → `context_bind` → `context_graph` | author | правила R-C зелёные |
| 4. Воркфлоу и промты | `flow_patch` (циклом) → `flow_compile` | author | `flow_compile` без `severity: 'error'` |
| 5. Судьи и циклы | `flow_patch` (панели, лимиты итераций) → `flow_compile` | author | компиляция чистая |
| 6. Датасеты | `dataset_generate` → `dataset_coverage` | evaluate | покрытие достигло целей |
| 7. Тест узлов | `experiment_run` (scope: node) → `experiment_model_matrix` | evaluate | модель выбрана по границе Парето |
| 8. Тест воркфлоу | `run_start` (на датасете) → `run_stages` → `run_blame` | run → debug | виновный узел локализован или прогон зелёный |
| 9. Улучшение | `flow_patch` → `experiment_run` → `experiment_compare` | evaluate | ≤ 5 итераций; стоп после двух без прогресса |
| 10. Выпуск | `version_propose(evidence)` → аппрув человека → `journal_append` | ship | `version_status.gate.verdict = PASS` и аппрув получен |

Шаг 10 намеренно не может быть завершён агентом: `version_propose` возвращает
`status: 'pending_approval'`, перевод в `approved` доступен только человеку в Studio (§6.2).

### 8.6 Жизненный цикл скилла в сессии

Отрендеренный скилл входит одним сообщением и остаётся в контексте на следующих ходах; повторный
идентичный вызов даёт короткую пометку вместо полного текста. Грант `allowed-tools` снимается после
следующего сообщения — это не постоянные права, поэтому на `allowed-tools` нельзя вешать разрешение
чего-либо важного; реальные права агента — в токене (§6).

## 9. Конкурентное редактирование

### 9.1 Кто с кем конкурирует

Редакторов двое: агент через MCP и человек в Studio. Одновременных редакторов — единицы, не сотни;
конфликтов мало. Агент пишет **операции**, а не символы: у него нет курсора и посимвольного ввода,
ему не нужно видеть чужие буквы в реальном времени.

### 9.2 Единица записи — `flow_patch`

```ts
const FlowPatchInput = z.object({
  spec_id: z.string(),
  base: z.object({
    commit: z.string(),
    files: z.array(z.object({ path: z.string(), sha256: z.string().nullable() })).min(1)
  }),
  ops: z.array(Op).min(1).max(50),
  idempotency_key: z.string().nullable(),
  dry_run: z.boolean().default(false)
});
```

`base.files[]` — compare-and-swap по sha256 байтов каждого затрагиваемого файла; `sha256: null`
означает «файла быть не должно» (создание). `idempotency_key` — защита от ретраев MCP-клиента (повтор
с тем же ключом возвращает результат первой попытки, а не применяет операции дважды). `dry_run`
заменяет отдельный тул валидации.

Алгоритм сервера:

1. Захват межпроцессной блокировки `.wf/lock` (`O_EXCL`, pid + ttl + heartbeat); занята — `LOCK_BUSY`.
2. Пересчёт хешей всех путей из `base.files[]`. Расхождение → конверт с `ok: false`, кодом
   `STALE_FILE`, `FILE_VANISHED` или `FILE_EXISTS` и блоком
   `conflict { path, your_hash, current_hash, ops_since[], rebase: 'auto' | 'manual', rebased_ops[] }`.
   Ответ не голый отказ: правки в разные файлы и разные узлы ребейзятся автоматически. Ручное
   разрешение нужно при пересечении путей, и тогда `rebase: 'manual'`, а `candidates[]` содержит
   варианты «взять моё» / «взять их».
3. Применить `ops` к дереву проекта **в памяти** → валидатор (типы портов, DAG, обязательные
   биндинги, межфайловые ссылки, границы разрешённых компонентов) → `blocking`-диагностика: ничего
   не сериализуется, конверт с `problems[]` + `candidates[]`.
4. Транзакция записи: staging `.wf/txn/<ulid>` с полными новыми версиями файлов, `intent.json` как
   точка невозврата, серия атомарных `rename(2)`, снятие лока
   ([files-first/write-model.md](files-first/write-model.md)).
5. Ответ несёт `version { commit, files[{path, sha256}], dirty }` и `changed_paths[]`. Коммита здесь
   нет: дерево остаётся грязным до явного `flow_commit` (§9.3).

### 9.3 История и коммит поверх git

Таблица `app.spec_ops` перестаёт быть источником истины: историю ведёт git — коммит на эпизод правки,
актор в трейлерах, откат только вперёд ([files-first/history.md](files-first/history.md)). В схеме
`idx` op-log остаётся кэшем-проекцией, на котором стоят `version_propose(evidence)` и `run_lineage`.

```
flow_commit({ paths[], message, intent? })
  -> { commit, files: [{path, sha256, status}], compile: {ok, problems[]} }

flow_history({ path?, spec_id?, since?, until?, actor_kind?, limit=20, cursor?, view='summary' })
  -> { items: [{commit, parent, actor_kind, actor_id, at, message, intent,
                files: [{path, status}], summary: {added, removed, changed}}], next_cursor }

flow_diff({ from: commit|'working', to: commit|'working', path?, scope='semantic'|'text', view })
  -> { deltas: [{path, node_id?, kind, before, after}], layout_changed, problems[] }

flow_revert({ to: commit, paths?, message, base: {commit}, dry_run=false })
  -> { commit, reverted: [{commit, files[]}], compile: {ok, problems[], candidates[]}, conflicts[] }
```

`flow_diff` по умолчанию семантический: сравниваются нормализованные IR, `scope: 'text'` даёт обычный
git-дифф для промтов и markdown. `flow_revert` создаёт новый коммит (`git revert`, не `reset`) и
прогоняет валидатор: ломающий компиляцию откат отдаёт `compile.ok=false`. Агент откатывает свои
коммиты (по трейлеру `actor_id`), чужие — `FORBIDDEN` + `next[] = studio_open(elicit)`.
`spec_ops_read` и `version_diff` отменяются: первый — это `flow_history`, второй — `flow_diff`.

### 9.4 ETag/If-Match — тот же механизм на HTTP

`GET /api/specs/:id` → сильный `ETag: "<sha256 файла>"`; `PATCH` с `If-Match`; расхождение → `412
Precondition Failed` с телом `ApiError` и тем же `conflict`-блоком. Ось версий одна в обоих каналах:
`base.files[].sha256` у MCP и `If-Match` у REST — это один и тот же хеш байтов, а не две независимые
схемы.

Живые обновления UI: watcher на дереве → broadcast по SSE → Studio перечитывает изменившиеся пути,
кэш TanStack Query инвалидируется по паре `path` + `sha256`. Никакого клиентского слияния — «сервер
сказал, что файл стал таким, вот дельта».

### 9.5 Advisory-lock

`flow_lock({ spec_id, ttl_s: 300 })` — мягкая блокировка на время работы агента: lockfile в дереве
проекта, видимый в `git status` и переживающий рестарт сервера. Studio показывает «Claude
редактирует», человек может перехватить принудительно. Это организационное устранение большинства
конфликтов, которое дешевле, чем их разруливание. Лок не обязателен и не отменяет CAS: истёкший
по TTL лок не даёт права записать поверх изменившегося файла. Межпроцессный `.wf/lock` (§9.2) —
другая сущность: он держится на время одной транзакции записи, а не сессии редактирования.

### 9.6 Почему не CRDT

`yjs@13.6.32` и `loro-crdt@1.16.1` — живые библиотеки (MIT), и правило «не изобретать велосипед»
обычно требует взять готовое. Здесь оно работает в обратную сторону: CRDT решает **не нашу задачу**.

1. **CRDT гарантирует сходимость, но не валидность.** Агент удалил узел, человек в это же время
   привязал к нему порт — слияние даст структурно целое, но семантически битое состояние. Инварианты
   домена (типы портов, DAG без циклов, обязательные биндинги) вне компетенции CRDT.
2. **Нужна линейная история ревизий.** `version_propose(evidence)` и `run_diff` требуют, чтобы каждая
   версия имела предшественника; линейную историю даёт git, и она нужна в любом случае.
3. **Профиль нагрузки не тот.** Единицы редакторов, операции вместо символов, мало конфликтов.
4. Поверх CRDT всё равно пришлось бы строить серверную валидацию и линеаризацию истории — то есть то
   же самое плюс лишний слой и лишний размер бандла.

Где CRDT уместен и может быть добавлен точечно позже: свободный текст шаблона промта **внутри одного
узла** и позиции узлов на канве (last-write-wins по полю). Не для структуры графа.

## 10. Связка со скиллом agentic-process-spec (§13.4)

### 10.1 Точка входа

Если у пользователя есть только сырое описание процесса, шаг 2 протокола (§8.5) уходит в скилл
`agentic-process-spec`: он ведёт человека по девяти вопросам на каждый шаг процесса и порождает
документ `agent_workflow_spec` (раздел 12 спеки). Дальше `flow_import({ source: { kind:
'agent_workflow_spec', payload } })` превращает его в **черновик IR**. Импорт — не «как-нибудь
разберём текст»: девять вопросов отображаются в обязательные поля IR один к одному.

### 10.2 Таблица «вопрос скилла → поле IR»

| Вопрос скилла | Поле IR | Тип | Что значит «не отвечен» |
|---|---|---|---|
| Цель шага | `node.description` | `string` (непустая) | пусто или плейсхолдер |
| Кто исполняет | `node.kind` + `node.role` | enum архетипа + `string` | `kind` не из каталога архетипов |
| Входные сущности | `node.inputs[]` (слоты) | массив слотов с типами | пустой массив при `kind`, требующем вход |
| Выходные сущности | `node.output.type` | ссылка на тип реестра | `null` или тип не зарегистрирован |
| Какое решение принимается | `node.switch` по enum | enum + ветки | ветки не покрывают enum |
| Блокирующий ли шаг | `node.gate` или `node.kind = 'human'` | дискриминированный union | ни `gate`, ни `human`, ни явное `blocking: false` |
| Можно ли параллелить | конструкция (`parallel`/`foreach`) + `join` | enum конструкции + политика join | `parallel` без `join` |
| Какие проверки | `node.validators[]` + `node.scorers[]` | массивы ссылок | оба пусты при `kind`, требующем проверки |
| Что при сбое | `node.on_error` + `node.timeout_ms` + политика повторов | union политик | `on_error` отсутствует |

### 10.3 Неотвеченный вопрос — ошибка компиляции

Это главное следствие §13.4 и то, что делает метод машинно проверяемым. Механика:

- каждая строка таблицы 10.2 порождает правило компилятора семейства `R-Q1..R-Q9`;
- `flow_import` не отклоняет неполный документ — он создаёт черновик и возвращает `problems[]` с этими
  кодами, чтобы агент видел, чего не хватает, и мог достроить;
- `flow_compile` на том же черновике возвращает те же коды с `severity: 'error'`, то есть спека с
  неотвеченным вопросом **не компилируется** и не может дойти до `version_propose`;
- каждая проблема несёт `candidates[]` там, где ответ выводим: недостающий `join` при `parallel`,
  недостающая ветка `switch` для непокрытого значения enum, дефолтный `on_error` из архетипа. Там,
  где ответ не выводим (цель шага, роль исполнителя), кандидатов нет и `next[]` содержит
  `studio_open` с `elicit: true` — вопрос уходит человеку.

Таким образом ни один узел не может доехать до выпуска, пока на все девять вопросов нет ответа в
машиночитаемом виде, и это проверяется тем же компилятором, что и типы портов, — отдельного
«валидатора полноты» нет.

### 10.4 Обратное направление

`project_export` с целью `agent_workflow_spec` восстанавливает документ скилла из IR. Это не
декоративная функция: несовпадение «импорт → экспорт → импорт» ловится конформанс-набором
(`project_conformance`) и означает потерю данных при отображении таблицы 10.2.

## Открытые вопросы

1. **Поведение Claude Code при `notifications/tools/list_changed` в середине сессии не проверено.**
   Вся стратегия фазового раскрытия (§5) держится на том, что клиент перечитывает `tools/list`.
   *Что сделать:* поднять живой сервер `volt`, подключить Claude Code по stdio, вызвать `mode_set` и
   зафиксировать, видит ли клиент новый список без перезапуска сессии. До подтверждения страховка §5.5
   обязательна, а не желательна.

2. **Точная регулярка имени тула в Messages API не подтверждена.** Известно, что точка в именах —
   гарантированный источник проблем, и решение переименовать §13.1 в `snake_case` принято, но точный
   паттерн (предположительно `^[a-zA-Z0-9_-]{1,128}$`) первоисточником не подтверждён.
   *Что сделать:* проверить `platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools` и
   зафиксировать в CI линтер имён тулов.

3. **Дублирует ли SDK 1.30.0 `structuredContent` в `content[0].text` автоматически.** В ранних версиях
   дублировал сам сервер. Сейчас мы дублируем вручную в каждом хендлере; если SDK делает это сам,
   ответ уходит удвоенным и бюджет §4 съедается вдвое. *Что сделать:* проверить
   `setToolRequestHandlers` в `dist/esm/server/mcp.js`, при подтверждении убрать ручное дублирование
   из общей обёртки (одно место).

4. **Формальная таблица коммутативности операций для автоматического ребейза (§9.2, шаг 2) не
   составлена.** Сейчас «большинство конфликтов ребейзятся автоматически» — утверждение без
   доказательства. *Что сделать:* спроектировать матрицу пар `op × op` («независимы / конфликтуют /
   требуют ручного разрешения») вместе с компилятором ([07. Компилятор](07-compiler.md)) и покрыть
   property-тестами на fast-check.

5. **Доступен ли Tool Search Tool внутри Claude Code для MCP-тулов.** Если да, фазовое раскрытие можно
   упростить до организующего приёма. *Что сделать:* проверить на живой сессии; решение §5.6 до тех
   пор не меняется.

6. **Наличие OAuth-provider-плагина у better-auth 1.7.4 не подтверждено.** В экспортах 1.7.4 нет
   `plugins/api-key`, `plugins/mcp`, `plugins/oidc-provider`. Мы закладываемся на `jwt` + `bearer`
   (§7.3), но если Claude Code потребует полноценный OAuth AS с DCR, понадобится либо внешний IdP,
   либо свой `agent_keys`. *Что сделать:* проверить актуальные экспорты и наличие отдельных пакетов
   перед тем, как фиксировать способ выдачи токена агенту.

7. **Расхождение префикса группы между исследованием и решениями.** В `research/mcp-server.md` §3.3
   предложен префикс `workflow_*` (`workflow_patch`, `workflow_get`), в DECISIONS закреплён `flow_*`
   (`flow_create`, `flow_patch`). Документ следует DECISIONS. *Что сделать:* зафиксировать `flow_*`
   как единственный вариант в `reference.md` скилла и в линтере имён, чтобы синонимичных тулов не
   возникло (`flow_get` и `workflow_get` одновременно — прямой антипаттерн выбора тула у агента).

8. **`dry_run` флагом или отдельным тулом `flow_validate`.** Принято решение в пользу флага (§2.3,
   §9.2) ради сокращения поверхности, но замера влияния на точность выбора тула у агента не делалось.
   *Что сделать:* eval на наборе задач «проверь, не ломая» — сравнить долю корректных вызовов при
   флаге и при отдельном туле.

9. **Порог «≤ 20–25 активных тулов» взят из оценки стоимости контекста, а не измерен.** Оценка
   250–600 токенов на определение — расчётная. *Что сделать:* посчитать реальные размеры
   `tools/list` по фазам через `/skill-doctor` и токенизатор `gpt-tokenizer`, при превышении
   пересобрать состав фаз из §5.3.

10. **Имена полей CAS расходятся.** ADR-0017 пишет `expects[{path, file_hash}]`, контракт операций
    и этот документ — `base{commit, files[{path, sha256}]}`. *Что сделать:* зафиксировать одно имя
    в `@wf/contracts` до первой реализации `flow_patch`.

11. **Состав фаз §5.3 собран под 57 тулов**, реестр стал 63, цель — 82. *Что сделать:* пересобрать
    `PHASE_GROUPS` после того, как 19 оставшихся операций получат группы.

12. **AGENTS.md как конвенция не проверен.** Известно, что Claude Code читает `CLAUDE.md`; поддержка
    `AGENTS.md` как импорта/алиаса не подтверждена в этот заход. Практический вывод (класть в корень
    генерируемого проекта короткий файл с точкой входа) не зависит от ответа, но имя файла зависит.
    *Что сделать:* проверить и зафиксировать в генераторе проекта.
