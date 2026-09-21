# 22. Глоссарий и соглашения об именовании

> Статус: draft
> Зависит от: [03. Язык ядра](03-core-language.md), [04. Схема IR](04-ir-schema.md), [05. Система типов](05-type-system.md), [06. Реестры](06-registries.md), [07. Компилятор](07-compiler.md), [08. Промты](08-prompts.md), [09. Модель контекста](09-context-model.md), [10. Рантайм](10-runtime.md), [12. Наблюдаемость](12-observability.md), [13. Evals и гейты](13-evals-and-gates.md), [14. MCP-контракт](14-mcp-contract.md), [16. Модель данных](16-data-model.md), [18. Канонизация и хеш](18-export-and-conformance.md), [23. API локальной студии](23-studio-api.md), [ADR-0017](adr/0017-files-as-source-of-truth.md), [ADR-0022](adr/0022-hash-as-version.md), [ADR-0025](adr/0025-python-engine.md), [ADR-0026](adr/0026-yaml-spec-and-code-refs.md), [ADR-0027](adr/0027-dynamic-io-shapes.md), [ADR-0028](adr/0028-studio-api-contract.md), [ADR-0029](adr/0029-trust-and-quality-python.md)
> Источники: [CONVENTIONS.md](CONVENTIONS.md), [DECISIONS.md](DECISIONS.md), [research/py-stack-runtime.md](research/py-stack-runtime.md), [research/py-spec-as-code.md](research/py-spec-as-code.md), [research/py-quality-layer.md](research/py-quality-layer.md), docs/00-source-spec.ru.md, документы комплекта 01–23

## Зачем этот слой

Комплект пишут разные авторы, а реализовывать его будут инженер и Claude, у которых нет общего контекста в
голове. Один и тот же объект здесь называется по-разному в файлах описания, в IR, в БД, в трассе и в MCP-тулах —
глоссарий фиксирует, что это один объект, а соглашения об именовании убирают развилку «как назвать» из каждого
решения. Документ нормативный: расхождение любого другого документа или кода с ним — ошибка того документа или
кода, кроме расхождения с [DECISIONS.md](DECISIONS.md) и ADR, которое исправляется здесь. Термины покрывают всё
ядро: описание и IR, реестры, контекст и провенанс, исполнение, качество и гейты, наблюдаемость, сборку модуля.

## 1. Глоссарий


Колонка «английский идентификатор» — это ровно то написание, которое встречается в файлах описания, в IR, в
схемах, в именах колонок и в атрибутах спанов. Если термин существует в нескольких видах написания, канонично
только приведённое здесь. Термины, снятые вместе с VoltAgent или экспортом, помечены «историческое» и оставлены,
чтобы старые тексты читались однозначно.

| Термин | Идентификатор | Определение | Где подробно |
|---|---|---|---|
| Агент | `agent` | Запись реестра, связывающая роль модели, схему выхода, allowlist тулов, `limits` и флаг `locked`; узел `llm` ссылается на агента, а не на модель. Исполняется `Agent` Pydantic AI 2.43.0: модель и инструкции задаются на вызове `Agent.run(model=..., instructions=...)`, модель приходит только из фабрики `aqven_llm`. Вид файла агента — ADR-0026 ОВ 9. | [06. Реестры](06-registries.md) §2, [ADR-0025](adr/0025-python-engine.md) §3 |
| Адрес исполнения | `ExecutionAddress` | Структура `{node_id, branch_key, iteration, item_index}`, которой API, события и хранилище прогонов адресуют одно исполнение узла; `iteration: null` — уровень узла, `0` — нулевая итерация. Строковые ключи (`nodeId#branch`, `nodeId@iteration`) запрещены; строку для топика и id дочернего workflow DBOS выводит один кодировщик внутри адаптера DBOS (`address_key` — JSON адреса по RFC 8785). | [ADR-0028](adr/0028-studio-api-contract.md) §5, [ADR-0025](adr/0025-python-engine.md) §9, [23](23-studio-api.md) §6.2 |
| Архетип | `archetype` | Частный случай компонента: скелет IR + параметры + потребности в контексте + контракты + политики параметров, задающий вид узла (`extractor`, `classifier`, `judge`, `critic_reviser`, `consensus_extractor` и др.). Архетип декларирует, чего требует от профиля модели (`structured_outputs`, `seed`, окно). | [06. Реестры](06-registries.md) §6 |
| Бандл (историческое) | `bundle` | Отменён решением владельца от 2026-09-16 ([ADR-0025](adr/0025-python-engine.md) §7) вместе с экспортом; артефакт сборки — wheel модуля с IR (термин «Сборка модуля»). | [ADR-0025](adr/0025-python-engine.md) §7 |
| Бюджет | `budget` | Лимит на прогон, узел или цикл в токенах, деньгах и времени; отражается в атрибутах `aqven.budget.*` и служит одним из условий выхода из цикла. Токены и деньги считает `UsageLimits` Pydantic AI над общим на прогон `RunUsage`; оценка до вызова, лимит итераций цикла и остановка `BudgetExceeded` — наш код. | [10. Рантайм](10-runtime.md), [12. Наблюдаемость](12-observability.md) §3, [ADR-0029](adr/0029-trust-and-quality-python.md) §4 |
| Гейт | `gate` | Два разных объекта под одним словом: комбинатор ядра `gate` — узел, который пропускает поток дальше только при выполнении типизированного предиката; гейт выпуска — решение по результатам экспериментов с четырьмя исходами `PASS / WARN / BLOCK / GATE_UNAVAILABLE`. | [03. Язык ядра](03-core-language.md) §3.6, [13. Evals и гейты](13-evals-and-gates.md) |
| Датасет | `dataset` | Версионированный набор элементов (вход + ожидания + метки), по которому гоняются эксперименты и строится матрица стадий. Файл `datasets/<name>.yaml`: шапка `apiVersion`/`kind: Dataset`, ниже структура `Dataset` pydantic-evals 2.43.0; зеркало — Postgres и Langfuse; пополняется из прод-прогонов. | [13. Evals и гейты](13-evals-and-gates.md), [16. Модель данных](16-data-model.md), [ADR-0029](adr/0029-trust-and-quality-python.md) §9 |
| Дивергенция | `diverge` | Порождение нескольких различающихся кандидатов из одного входа. Источник различия обязан быть явным — `vary`, разный `seed`, `temperature` или `model_role`; иначе правило `R-CAP-DIVERGE` даёт error. | [03. Язык ядра](03-core-language.md) §6.2, [06. Реестры](06-registries.md) §2.5 |
| Динамическая форма | `Dynamic` | Вход или выход, форма которого зависит от данных. Берётся наименее динамичный из пяти случаев: allowed-set, union + `switch`, строки `{key, value}`, статическое ядро + поле `Dynamic`, форма целиком (`Dynamic` + `schema_from` + обязательный `limits` + шаг `narrow`). Схема из данных — значение типа `FieldSpec[]`, модель выхода строится при вызове `pydantic.create_model`. | [ADR-0027](adr/0027-dynamic-io-shapes.md) |
| Допустимое множество | `allowed_set` | Замкнутый набор значений, из которого модель обязана выбрать. Порог: до 50 значений — enum прямо в схеме, выше — индексный выбор из пронумерованного списка; потолок динамического набора — около 416 значений UUID, не 1000. Клиент Pydantic AI размер набора не ограничивает, лимиты проверяет наш код до вызова; вхождение — `output_validator` + `ModelRetry`. | [05. Система типов](05-type-system.md), DECISIONS «Структурированный вывод» п. 5 |
| Исполнитель IR | `IR executor` | Наш интерпретатор плана скомпилированного IR: одна функция `@DBOS.workflow` обходит план, исполнение узла — `@DBOS.step(retries_allowed=False)`, исполнители узлов выбираются таблицей по виду (Strategy). Вход DBOS-workflow — хеш IR и вход воркфлоу. | [10. Рантайм](10-runtime.md), [ADR-0025](adr/0025-python-engine.md) §3–§4 |
| Источник контекста | `context source` | То, откуда берётся значение для потребности: один из шести видов `static`, `data`, `knowledge`, `generated`, `human`, `run`. Вид источника определяет локатор, дефолтный уровень доверия и обязательную проверку. | [09. Модель контекста](09-context-model.md) §1 |
| Калибровка | `calibration` | Процедура сверки LLM-судьи с человеческой разметкой. Судья допускается блокировать выпуск только при weighted kappa ≥ 0.7 (quadratic, `statsmodels` `cohens_kappa`) и Krippendorff alpha ≥ 0.8 (своя реализация на numpy); результаты лежат в `app.judge_calibrations`. | [13. Evals и гейты](13-evals-and-gates.md), [ADR-0029](adr/0029-trust-and-quality-python.md) §10 |
| Кассета | `cassette` | Content-addressed запись ответов модели, снятая звеном `CassetteModel` цепочки `WrapperModel`, а не HTTP-моком. Ключ — `sha256("aqven.cassette.v1\0" + канонический JSON)` нейтрального запроса, поэтому запись одного провайдера проигрывается на другом; режимы записи и `replay_strict` (промах — `CassetteMiss`, в живой вызов не деградирует). Используется для детерминированного реплея, fork и тестов без сети. | [ADR-0029](adr/0029-trust-and-quality-python.md) §1, [18. Канонизация и хеш](18-export-and-conformance.md) |
| Класс происхождения | `origin_class` | Метка значения, выводимая из `source.kind` (`static`, `data`, `knowledge`, `generated`, `human`, `run`); определяет окраску в UI, политику доверия и фильтры в трассах. | [09. Модель контекста](09-context-model.md) §1, §5 |
| Комбинатор | `combinator` | Узел ядра, управляющий другими узлами, а не вызывающий модель: `parallel`, `map`, `switch`, `loop`, `race`, `gate`, `try`. Ровно семь; новые сущности вводятся компонентами, а не расширением ядра. | [03. Язык ядра](03-core-language.md) §3 |
| Компонент | `component` | Версионированная единица переиспользования: сигнатура + параметры + дженерики + контракты + тело из примитивов и комбинаторов. Определение — файл проекта (значение `kind` — ADR-0026 ОВ 9), пин по хешу содержимого ([ADR-0022](adr/0022-hash-as-version.md)); раскрывается до примитивов при компиляции. | [03. Язык ядра](03-core-language.md) §4, [06. Реестры](06-registries.md) §7 |
| Конвергенция | `converge` | Сведение нескольких кандидатов или веток в один результат по явной стратегии (агрегация, выбор лучшего по оценке, консенсус). Сведение — слой семантики исполнителя IR: у DBOS модели графа нет. | [03. Язык ядра](03-core-language.md) §6, DECISIONS «Наш слой» |
| Консенсус | `consensus` | Согласование N независимых вызовов одной задачи (архетип `consensus_extractor`): правило согласования по полям, доля эскалаций как метрика, различие вызовов задаётся сидом. | [06. Реестры](06-registries.md) §6 |
| Конформанс (историческое) | `conformance` | Проверка чужой реализации ядра на соответствие нормативной семантике. Отменена решением владельца от 2026-09-16 ([ADR-0025](adr/0025-python-engine.md) §7) вместе с воссозданием в чужих фреймворках. | [ADR-0025](adr/0025-python-engine.md) §7 |
| Критик-цикл | `critic_reviser` | Архетип: цикл «генерация → критика → правка» с лимитом итераций, бюджетом, детектом стагнации и выбором лучшего по оценке. Счётчики ведёт исполнитель IR, итерация входит в адрес исполнения; условие выхода генерирует компилятор. | [06. Реестры](06-registries.md) §6, [03. Язык ядра](03-core-language.md) §7 |
| Матрица стадий | `stage matrix` | Представление «элементы датасета × стадии воркфлоу»: ячейка — агрегат исходов проверок стадии по элементу. Строится по `aqven.stage_id` и оценкам прогонов датасета. | [12. Наблюдаемость](12-observability.md) §7 |
| Непрозрачное значение | `opaque value` | Выход типа `Dynamic`. К типизированному слоту, в проекцию, в `switch` и к полю в шаблоне попадает только через шаг `narrow`; без него его принимают шаг `code` со входом `Dynamic`, слот шаблона целиком и выход воркфлоу. Между шагами переносятся JSON-значение, `FieldSpec[]` и хеш схемы, а не класс. | [ADR-0027](adr/0027-dynamic-io-shapes.md) |
| Панель судей | `judge_panel` | Компонент стандартной библиотеки: несколько судей по одному кандидату, перестановка позиций, сведение вердиктов и метрика разброса. Раскрывается в `map` над судьями + `llm` + `code` сведения. | [03. Язык ядра](03-core-language.md) §6.1 |
| Переопределение | `override` | Точечная замена части эффективной конфигурации на одном из уровней (до L6 — переопределение прогона). Проверяется правилами `R-O1..R-O7`; на L6 допустимы только пути `/model_role`, `/model`, `/params/*`, `/limits/*`, причём лимиты только в сторону ужесточения. | [06. Реестры](06-registries.md) §4–§5 |
| Потребность в контексте | `context need` | Объявление узла или архетипа «мне нужно значение такого типа под таким именем». Непривязанная обязательная потребность — ошибка компиляции; таблица `app.context_needs`. | [09. Модель контекста](09-context-model.md), [16. Модель данных](16-data-model.md) |
| Представление | `view` | Способ отрисовки значения типа в промте (таблица, список, JSON, краткая форма). Принадлежит типу, а не тексту промта: агент не форматирует данные руками. | [05. Система типов](05-type-system.md), [08. Промты](08-prompts.md) |
| Привязка | `binding` | Ребро «источник → слот» как данные, а не код: ключ `from` у элемента `in` со ссылкой вида `$node.out.path` и опциональной проекцией. Переименование узла — операция `flow_patch`, которая обновляет привязки и дописывает журнал `renames` в `aqven.yaml`. | [04. Схема IR](04-ir-schema.md) §3, [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §2–§3 |
| Примитив | `primitive` | Узел ядра, выполняющий работу: `llm`, `tool`, `code`, `human`, `const`. Каждому приписан эффект из решётки эффектов. | [03. Язык ядра](03-core-language.md) §2 |
| Провенанс | `provenance` | Происхождение значения: узел, путь, версия, класс происхождения, уровень доверия, факт верификации и `derived_from` по sha256. Источник истины — наш Postgres (`app.slot_provenance`), не внешний SaaS. | [09. Модель контекста](09-context-model.md) §5 |
| Профиль модели | `model_profile` | Запись реестра о конкретной модели: возможности (`structured_outputs`, `tools`, `seed`, `logprobs`), модальности входа и выхода, окно, поправочный коэффициент токенизации, цены, профиль схемы и режим strict, список реализуемых ролей. Проверяется правилами `R-CAP-*` и `E_MODALITY_UNSUPPORTED`. | [06. Реестры](06-registries.md) §2, [11. Провайдеры](11-providers.md), [ADR-0029](adr/0029-trust-and-quality-python.md) §6 |
| Роль модели | `model_role` | Логическое имя модели в IR (`writer`, `judge`, …). Узел называет роль, а не модель; разрешение `(tenant, role, environment) → model_profile@rev` задаёт запись `role_binding`. | [06. Реестры](06-registries.md) §3 |
| Сборка модуля | `aqven build` | `aqven check` (модели описания → компилятор → сверка сигнатур `code` → модальности → pyright strict по `code/` → IR и `spec_hash`) → типизированные точки входа → wheel через uv_build 0.12.15 с YAML, промтами, `code/` и IR. Модуль импортируется в Python-проект или вызывается по HTTP и MCP (`aqven serve`). | [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §10 |
| Сигнатура узла | `signature` | Форма узла `llm`: вход, выход и промт одной структурой (форма сигнатуры DSPy, фреймворк не берём). Элемент `in` несёт и контракт (`type`, `description`), и привязку (`from`); `out` — анонимная запись со списком полей. Ключа `instructions:` нет. | [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §3 |
| Скорер | `scorer` | Детерминированная или модельная функция «артефакт → оценка», применяемая к выходу узла или прогона; наш тип оценщика поверх `Evaluator` pydantic-evals, модельный — только с моделью из каталога через фабрику. Оценки складываются в `app.scores` и питают гейты и матрицу стадий. | [13. Evals и гейты](13-evals-and-gates.md), [ADR-0029](adr/0029-trust-and-quality-python.md) §9 |
| Слот | `slot` | Именованный типизированный вход узла или шаблона промта; данные попадают в промт только через слот. Незаполненный обязательный слот и лишний слот — ошибки компиляции. | [04. Схема IR](04-ir-schema.md) §3, [08. Промты](08-prompts.md) |
| Спайк | `spike` | Фаза 0 дорожной карты: ядро доверия на одном реальном 15-шаговом воркфлоу. Выход из фазы — kill-критерии 1–4 и бинарные проверки [ADR-0025](adr/0025-python-engine.md) «Проверка» п. 7. | [21. Дорожная карта](21-roadmap.md), спека §18 |
| Спека | `flow spec` | Описание воркфлоу в файлах проекта: `flows/<flow_id>/flow.yaml` (или билдер `flow.py`), `nodes/<node_id>.yaml`, промты отдельными файлами; каждый файл — экземпляр Pydantic-модели своего вида с `extra="forbid"`. Источник истины — файлы, БД — перестраиваемый индекс `idx`. Идентичность — `spec_hash` канонического IR в домене `aqven/flow-spec/v1`. | [ADR-0017](adr/0017-files-as-source-of-truth.md), [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1–§2, [04. Схема IR](04-ir-schema.md) §4 |
| Страж | `guard` | Синхронная проверка выхода узла в исполнителе IR до того, как он попадёт дальше, с решением `pass / retry / fallback / fail`: валидация Pydantic на приёме, исход вызова от `OutcomeGateModel`, маршрут по таблице `FAILURE_BY_EXCEPTION` (Chain of Responsibility). Атрибуты `aqven.guard.*`. Наш слой. | [10. Рантайм](10-runtime.md), [12. Наблюдаемость](12-observability.md) §3, [ADR-0029](adr/0029-trust-and-quality-python.md) §3 |
| Судья | `judge` | Архетип и роль модели: оценка кандидата по рубрике с перестановкой позиций и моделью другого семейства (`policy.family_differs_from`, R-O6). Блокировать выпуск судья вправе только после калибровки. | [06. Реестры](06-registries.md) §6, [13. Evals и гейты](13-evals-and-gates.md) |
| Уровень доверия | `trust` | Двузначная метка значения: `trusted` или `untrusted`. Дефолты: `knowledge` — всегда `untrusted`, внешние API — `untrusted`, своя БД, `human`, `static` и `run` — `trusted`. `untrusted` попадает в ветвление только через экстрактор (гейт CaMeL). | [09. Модель контекста](09-context-model.md) §1, §5 |
| Уровень промта | `prompt level` | Стратегия сборки промта, определяемая содержимым ключа `prompt`: 1 — `.prompt.md` без переменных, входы, выходы и блок формата вывода дописывает адаптер; 2 — Liquid-шаблон со слотами и `{{ output_format }}` ровно один раз; 3 — функция проекта `pkg.mod:function`, компилятор видит только типы, GEPA её не оптимизирует. Строкой в YAML промт не бывает никогда. | [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §4, [08. Промты](08-prompts.md) |
| Уровни гарантии L0–L4 | `guarantee levels` | Шкала того, чем ловится класс ошибок: L0 — невыразимо в конструкции платформы; L1 — компилятор; L2 — рантайм-страж; L3 — гейт выпуска; L4 — мониторинг в проде. Каждая строка L1 — правило компилятора с кодом. | Спека §8, [01. Продукт и требования](01-product-and-requirements.md) |
| Фрагмент | `fragment` | Версионированный кусок текста промта или знания, подключаемый по ссылке. Для промтов — общий промт `prompts/<key>.md` с пином в `aqven.lock.yaml`, подключаемый `{% include %}` через loader python-liquid; для знания — результат `retrieve` с обязательным `source_id`. | [08. Промты](08-prompts.md), [09. Модель контекста](09-context-model.md), [ADR-0029](adr/0029-trust-and-quality-python.md) §8 |
| Форк прогона | `fork` | Новый прогон, начатый с шага существующего: `DBOS.fork_workflow(workflow_id, start_step)`, шаги до `start_step` берутся из чекпоинтов. Связь с исходным прогоном хранит DBOS — `WorkflowStatus.forked_from`. Параметра нового входа и номера шага форка у DBOS нет — ADR-0025 ОВ 8. | [10. Рантайм](10-runtime.md), [ADR-0025](adr/0025-python-engine.md) §3 |
| Цепочка гарантий вызова | `WrapperModel` chain | Обёртки `WrapperModel` (Decorator) вокруг модели провайдера, снаружи внутрь: `OutcomeGateModel` → `RedactingModel` → `CassetteModel` → лимитер → `BackoffModel` → модель провайдера (SDK с `max_retries=0`). Собирает только фабрика `aqven_llm` (Builder), порядок проверяется тестом. | [ADR-0029](adr/0029-trust-and-quality-python.md) §1 |
| Чекпоинт | `checkpoint` | Записанный результат DBOS-шага в системной БД DBOS (SQLite локально, схема `dbos` PostgreSQL 18 в проде). По нему workflow восстанавливается после падения без повтора завершённых шагов; прерванный падением шаг выполняется заново целиком. Значения на границе шага JSON-совместимы. | [10. Рантайм](10-runtime.md), [ADR-0025](adr/0025-python-engine.md) §3–§4 |
| Шапка формата | `apiVersion`, `kind` | Первые ключи каждого файла описания: `apiVersion: "aqven/v1"` — версия формата файла, а не содержимого, в IR не входит и `spec_hash` не меняет; `kind` — вид файла (`Project`, `Type`, `Flow`, `Node`, `Dataset`). `aqven fmt` конвертирует файл в версию хранения цепочкой v1 → v2; неизвестная версия — `E_API_VERSION`. | [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1 |
| Эксперимент | `experiment` | Прогон датасета в одной или нескольких конфигурациях со статистическим сравнением: парный бутстрап BCa (B=10000, фиксированный seed), McNemar для бинарных, Wilcoxon для порядковых, Holm/BH для семейств. A/A-прогон обязателен до A/B. Прогонщик — pydantic-evals 2.43.0, математика — scipy 1.18.1 и statsmodels 0.15.0, политика гейта — наша. | [13. Evals и гейты](13-evals-and-gates.md), [ADR-0029](adr/0029-trust-and-quality-python.md) §9–§10 |
| Эффективная конфигурация | `effective config` | Результат слияния уровней конфигурации (профиль → агент → архетип → узел → окружение → прогон) для конкретного вызова. Применяется на вызове: `Agent.run(model=..., instructions=...)`; обход через динамические функции агента не нужен. | [06. Реестры](06-registries.md) §4, DECISIONS «Что берём готовым» |
| blame | `blame` | Обратный разбор неудачного прогона: от плохого выхода к узлу, привязке и источнику, которые его породили. Тул `run_blame`. | [14. MCP-контракт](14-mcp-contract.md), [12. Наблюдаемость](12-observability.md) |
| IR | `IR` | Промежуточное представление воркфлоу — производный артефакт: нормальную форму строят `aqven check` и `aqven build` из файлов описания, кешируют в `.aqven/cache/` и кладут в wheel; в git IR не коммитится. Развёрнутый вид — то, что компилируется, исполняется и рисуется. | [04. Схема IR](04-ir-schema.md), [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §9 |
| kill-критерий | `kill criterion` | Проверяемое условие, невыполнение которого закрывает фазу или проект. Примеры: 1 — «компилятор ловит 100% мутантов» своим доменным IR-мутатором; 13 — round-trip, формулировка без бандла — ADR-0025 ОВ 15. Критерии 14 и 15 отменены решением владельца от 2026-09-16 ([ADR-0025](adr/0025-python-engine.md) §7). | [21. Дорожная карта](21-roadmap.md), DECISIONS «Качество» |
| lineage | `lineage` | Граф происхождения прогонов и выходов: родитель, узел форка, `release_hash`. Связь форка с родителем — `WorkflowStatus.forked_from` DBOS; нужна ли своя таблица со шагом и правками — ADR-0025 ОВ 8. Тул `run_lineage`. | [16. Модель данных](16-data-model.md), [10. Рантайм](10-runtime.md) |
| narrow | `narrow` | Вид узла, сужающий непрозрачное значение до статического типа реестра: валидация Pydantic, несовпадение — `WorkflowIssue` с `severity: "assert"` без повтора модели. Добавлен [ADR-0027](adr/0027-dynamic-io-shapes.md) сверх таблицы видов ADR-0026. | [ADR-0027](adr/0027-dynamic-io-shapes.md) |
| replay | `replay` | Повторное исполнение прогона или узла с теми же ответами моделей. Детерминизм обеспечивает кассета `CassetteModel` в цепочке гарантий вызова; ключ инвалидации узла — `behavior_hash`. | [10. Рантайм](10-runtime.md), [04. Схема IR](04-ir-schema.md) §4.3, [ADR-0029](adr/0029-trust-and-quality-python.md) §1 |
| strict-вывод | `strict structured output` | Режим, в котором провайдер гарантирует соответствие ответа JSON-схеме. Одной схемы на всех провайдеров не существует: профиль схемы — свойство пары (IR-схема × провайдер), `json_schema_transformer` в `ModelProfile`. Strict задаётся явно на каждом профиле (`ToolOutput(M, strict=True)` или `NativeOutput(M, strict=True)`): при `strict=None` флаг зависит от содержимого схемы. Трансформеры переносят часть ограничений в `description`, поэтому выход всегда валидируется Pydantic на приёме. | [05. Система типов](05-type-system.md), DECISIONS «Структурированный вывод», [ADR-0027](adr/0027-dynamic-io-shapes.md) |
| time travel (историческое) | `time travel` | Механизм VoltAgent `workflow.timeTravel`, снят вместе с VoltAgent ([ADR-0025](adr/0025-python-engine.md)). Его роль выполняет fork с шага DBOS — термин «Форк прогона». | [ADR-0025](adr/0025-python-engine.md) §3 |

## 2. Соглашения об именовании

### 2.1. Сводная таблица регистров

| Что | Регистр | Пример | Где закреплено |
|---|---|---|---|
| Вид файла описания (`kind`) | `PascalCase`, закрытый набор | `Project`, `Flow`, `Node`, `Dataset` | [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1 |
| Вид узла (`node` в файле узла) | `snake_case`, одно слово | `llm`, `map`, `narrow`; `critic_reviser` не бывает видом | [03](03-core-language.md), [04](04-ir-schema.md), [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1 |
| Идентификатор узла | имя файла `nodes/<node_id>.yaml`, `^[a-z][a-z0-9_]{0,62}$`, уникален внутри воркфлоу; поля `id` в файле нет | `load_hotels`, `judge_a` | [ADR-0017](adr/0017-files-as-source-of-truth.md), [04](04-ir-schema.md) §4.1 |
| `TypeId` | `PascalCase` из имени файла типа | `types/order.yaml` → `Order`, `PolicyId` | [05](05-type-system.md), [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1 |
| Имя, которое даёт пользователь: ключ записи реестра, поле, файл | `^[a-z][a-z0-9_]{0,62}$` | `hotel_amenity`, `role_binding`, `order_id` | [06](06-registries.md), [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1 |
| Ключ формата файла | фиксированный набор полей модели, ASCII; ключевые слова JSON Schema и `apiVersion` — camelCase, остальные — `snake_case` | `apiVersion`, `maxItems`, `model_role`, `schema_from` | [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1, [ADR-0027](adr/0027-dynamic-io-shapes.md) |
| Значение enum | `snake_case` | `untrusted`, `structured_outputs` | [05](05-type-system.md) |
| Имя MCP-тула | `snake_case` с префиксом группы, точки запрещены | `flow_patch`, `run_replay_node` | CONVENTIONS, [14](14-mcp-contract.md) |
| Пакет движка | дистрибутив и модуль по образцу `aqven-llm` / `aqven_llm`; состав и имена остальных — ADR-0026 ОВ 1 | `aqven-llm`, модуль `aqven_llm` | [ADR-0025](adr/0025-python-engine.md) §6, [20](20-repo-and-tooling.md) |
| Пакет студии | `@aqven/<kebab-case>` | `@aqven/api-types` | CONVENTIONS, [ADR-0028](adr/0028-studio-api-contract.md) |
| Таблица БД | `snake_case`, множественное число, в схеме `app` | `app.run_nodes`, `app.judge_calibrations` | DECISIONS «Данные» |
| Колонка БД | `snake_case`, единственное число | `tenant_id`, `origin_class`, `started_at` | [16](16-data-model.md) |
| Ключ атрибута спана | `aqven.` + точки, сегменты `snake_case` | `aqven.prompt.template_sha256` | [12](12-observability.md) |
| Код правила компилятора | `R-` + номер или буквенный префикс семьи | `R-09`, `R-C2`, `R-CAP-TEMP` | CONVENTIONS, [07](07-compiler.md) |
| Диагностика загрузки описания | `E_` + `UPPER_SNAKE_CASE` | `E_UNKNOWN_KEY`, `E_CODE_SIGNATURE_MISMATCH` | [ADR-0026](adr/0026-yaml-spec-and-code-refs.md); место в каталоге 07 — ADR-0026 ОВ 14 |
| Домен хеша | `aqven/<предмет>/v<major>` | `aqven/flow-spec/v1`, `aqven/node-behavior/v1` | [04](04-ir-schema.md) §4.2; расхождение с `aqven.cassette.v1` — открытый вопрос 8 |
| Класс и тип в Python-коде движка | `PascalCase`; идентификаторы — `typing.NewType`, исчерпываемость — `typing.assert_never`, pyright strict | `NodeId`, `IrHash`, `UnitId` | [ADR-0025](adr/0025-python-engine.md) §3, [ADR-0029](adr/0029-trust-and-quality-python.md) §11 |
| Тип в TypeScript студии | `PascalCase`, branded для идентификаторов | `RunEventType` | CONVENTIONS, [23](23-studio-api.md) |

Русские имена в идентификаторах не встречаются нигде: русский — язык описаний, `description`,
текстов ошибок и документации.

### 2.2. Узлы IR

Виды узлов — замкнутое множество. Примитивы: `llm`, `tool`, `code`, `human`, `const`. Комбинаторы:
`parallel`, `map`, `switch`, `loop`, `race`, `gate`, `try`. Закрытый набор подвидов `node:` модели описания
([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1, [ADR-0027](adr/0027-dynamic-io-shapes.md)) сверх них содержит
`seq`, `call` (вызов компонента) и `narrow` (сужение непрозрачного значения). В документах комплекта встречаются
ещё `load` и `retrieve` (источники контекста) и `reduce` (сведение в теле архетипов) — их статус открыт
(открытый вопрос 1). Новый вид вводится только через ADR, как `narrow`; остальное расширение идёт компонентами.

Идентификатор узла — стабильный ключ, по которому ссылаются привязки, провенанс, трассы
(`aqven.node_id`), кассеты и адрес исполнения. Правила:

- `node_id` — имя файла узла; поля `id` внутри файла нет, идентичность — путь в ФС;
- `node_id` уникален в пределах развёрнутого вида воркфлоу, а не только модульного;
- `node_id` не переиспользуется после удаления узла — иначе ломается lineage и детект переименования по
  `body_hash`;
- переименование — операция `flow_patch`, которая обновляет все привязки и дописывает журнал `renames` в
  `aqven.yaml`, а не правка текста;
- узлы, порождённые раскрытием компонента, получают префикс вызывающего узла, чтобы `node_id` остался
  уникальным при нескольких вызовах одного компонента.

Ссылка на выход узла в привязке: `$<node_id>.out[.<path>]`; грамматика ссылки и проекции — в
[04. Схема IR](04-ir-schema.md) §3.1–3.2.

### 2.3. Идентификаторы типов и enum

- `TypeId` — `PascalCase` из имени файла, единственное число: `types/verdict.yaml` → `Verdict`. Ссылка на тип —
  `T`, `T[]`, `T?`, `T[]?`; `T?[]` и `T[][]` запрещены. Встроенные: `Text`, `Int`, `Float`, `Bool`, `Date`,
  `DateTime`, `TimeZone`, `Locale`, `TenantId`, `Image`, `Audio`, `Video`, `Document`, `Dynamic`, `FieldSpec`.
- Значения enum — `snake_case`, без префикса типа: у типа `Verdict` значения `pass`, `fail`,
  `needs_revision`, а не `verdict_pass`.
- Описания значений enum живут в записи типа, а не в тексте промта: архетип `classifier` берёт их
  из реестра.
- Представление типа именуется `view:<TypeId>/<view>` — это же имя носит фрагмент рендера python-liquid.
- Профиль схемы — свойство пары (IR-схема × провайдер), поэтому имя профиля отдельное
  (`SchemaProfileName`: `openai-strict`, `anthropic-strict`, `permissive`) и никогда не смешивается с `TypeId`.

### 2.4. Имена MCP-тулов

Формат: `<группа>_<действие>[_<уточнение>]`, только `snake_case`, точки запрещены ограничением имени
тула в Messages API — раздел §13.1 спеки переименовывается целиком. Сервер — `aqven`, полное имя
`mcp__aqven__<tool>` не длиннее 128 символов. Группы и примеры, уже закреплённые в
[14. MCP-контракт](14-mcp-contract.md):

| Группа | Предмет | Примеры |
|---|---|---|
| `flow_` | спека и её жизненный цикл | `flow_create`, `flow_patch`, `flow_validate`, `flow_compile`, `flow_lock`, `flow_import`, `flow_get` |
| `run_` | прогоны, отладка, происхождение | `run_start`, `run_get`, `run_get_node`, `run_get_trace`, `run_replay_node`, `run_fork`, `run_blame`, `run_diff`, `run_lineage`, `run_stages`, `run_debug` |
| `component_` | компоненты и библиотека | `component_define`, `component_get`, `component_list`, `component_expand`, `component_propose_to_library` |
| `context_` | потребности и привязки | `context_plan`, `context_bind`, `context_graph` |
| `dataset_` | датасеты | `dataset_generate`, `dataset_get`, `dataset_add_from_run`, `dataset_coverage` |
| `experiment_` | эксперименты и сравнение | `experiment_run`, `experiment_compare`, `experiment_model_matrix` |
| `registry_` | заявки в реестры | `registry_propose` |

Действие — глагол в инфинитиве без `s`: `get`, `list`, `create`, `patch`, `compile`, `run`, `compare`.
Составное уточнение идёт последним: `run_get_node`, а не `run_node_get`. Тулы записи отвечают одним
конвертом `Envelope`: `ok`, `op`, `version{files[{path, file_hash}], dirty, actor, client_op_id}`, `focus`,
`problems[]`, `candidates[]` с готовым `apply{tool,arguments}`, `next[]`, `refs[]`, `ui_url`, `truncated`;
конверт у тулов чтения — ADR-0028 ОВ 1. Каждый тул — операция каталога `Operation`, та же, что маршрут REST
([ADR-0028](adr/0028-studio-api-contract.md)). Одновременно включено не больше 20–25 тулов при ядре 8–10;
`RegisteredTool.enable()/disable()` в `mcp` 2.2.0 нет, механизм фаз — ADR-0025 ОВ 18.

### 2.5. Пакеты

Движок — дистрибутивы Python в uv workspace `packages/*` с одним `uv.lock`; студия — `apps/studio` и TS-пакеты
`@aqven/<kebab-case>`. Имя называет предмет, а не слой («не `utils`»). Закреплены:

| Сторона | Пакет | Что |
|---|---|---|
| Движок | `aqven-llm`, модуль `aqven_llm` | фабрика моделей и цепочки гарантий, единственный импортёр SDK провайдеров |
| Студия | `@aqven/api-types` | `schema.d.ts`, сгенерированный openapi-typescript 7.13.0 из `openapi.json` FastAPI |

Имена и состав остальных пакетов движка (компилятор, исполнитель IR, модели описания, статистика гейта и др.) не
выбраны — ADR-0026 ОВ 1, нормативная таблица — [20. Репозиторий](20-repo-and-tooling.md). Прежний список
`@aqven/*` для TS-движка снят ([ADR-0025](adr/0025-python-engine.md)).

Импорт `openai`, `anthropic`, `google.genai`, `pydantic_ai.providers` и `pydantic_ai.models.{openai,anthropic,google}`
разрешён только модулю `aqven_llm`; остальным это запрещает ruff TID251 ([ADR-0025](adr/0025-python-engine.md) §6).

### 2.6. Таблицы и колонки БД

Три схемы в одной базе PostgreSQL 18: `app` — наши таблицы (ORM и инструмент миграций не выбраны — ADR-0025
ОВ 11); `idx` — индекс определений, пишет только роль `wf_indexer`; `dbos` — системные таблицы DBOS, их DDL делает
`dbos migrate` отдельным шагом деплоя, рантайм работает с `run_migrations = False`. Таблицы `dbos` мы не трогаем и
не описываем в своих миграциях. Локально системная БД DBOS — SQLite.

| Соглашение | Правило |
|---|---|
| Имя таблицы | `snake_case`, множественное число, без префикса схемы в коде — схема задаётся конфигом |
| Первичный ключ | колонка `id`, тип `uuid`, значение по умолчанию — встроенный `uuidv7()` PostgreSQL 18 |
| Внешний ключ | `<единственное_число_таблицы>_id`: `run_id`, `node_id`, `dataset_id`, `tenant_id` |
| Мультитенантность | `tenant_id` присутствует во всех таблицах `app.*`, поверх — RLS |
| Время | суффикс `_at`, тип `timestamptz`, всегда UTC: `created_at`, `started_at`, `finished_at` |
| Хеши | суффикс `_sha256` для содержимого (`value_sha256`, `template_sha256`), суффикс `_hash` для доменных хешей (`spec_hash`, `behavior_hash`, `body_hash`, `release_hash`) |
| Версии записи реестра | `rev` — целое; ссылка в тексте и в IR пишется `key@rev` |
| JSON | тип `jsonb`, имя без суффикса `_json` |
| Партиционирование | `app.run_nodes` — `PARTITION BY RANGE (started_at)` помесячно, BRIN по времени; имя партиции `run_nodes_YYYY_MM` |
| Блобы | правило трёх зон: <8 КБ — inline `jsonb`; 8 КБ–1 МБ — `app.blobs`; >1 МБ — объектное хранилище по sha256 |
| Миграции | forward-only, expand/contract, `down` не пишем |

### 2.7. Коды правил компилятора

| Семья | Диапазон | Предмет |
|---|---|---|
| `R-<число>` | `R-01`..`R-85` (каталог §8–§9 спеки) | основной каталог правил уровня L1, номер сквозной и неизменный |
| `R-T*` | `R-T1..R-T13` по CONVENTIONS | шаблоны промтов; `R-T13` (системные слоты в блоке `cache`) закреплён решением ведущего, реестры — [08. Промты](08-prompts.md) §7 и [07. Компилятор](07-compiler.md) §3.2 |
| `R-C*` | `R-C1..R-C8` | контекст и привязки |
| `R-L*` | `R-L1..R-L6` | циклы (`R-L1..R-L4` — ядро `loop`, `R-L5..R-L6` — контракты `verify_fix`) |
| `R-O*` | `R-O1..R-O7` | переопределения и уровни конфигурации |
| `R-J*` | `R-J1..R-J6` | судьи |
| `R-G*` | `R-G1..R-G4` | типизация композиции: дженерики, компоненты-параметры, эффекты; префикс закреплён в CONVENTIONS, реестр — [07. Компилятор](07-compiler.md) §3.7 |
| `R-D*` | `R-D1..R-D7`, предложены, не утверждены (ADR-0027 ОВ 1) | динамическая форма входа и выхода |
| `R-CAP-<NAME>` | именованные, не нумерованные | возможности профиля модели: `R-CAP-TEMP`, `R-CAP-WINDOW`, `R-CAP-JSON`, `R-CAP-TOOLS`, `R-CAP-SEED`, `R-CAP-LOGPROBS`, `R-CAP-OUTPUT`, `R-CAP-DIVERGE`, `R-CAP-JUDGE-FAMILY` |

Код правила неизменяем после публикации: он попадает в сообщения об ошибках, в тесты, в датасеты
негативных кейсов и в трассы. Правило можно объявить устаревшим, но не переиспользовать его номер.
Формат сообщения: `<КОД>: <что не так с подстановкой конкретных имён>`, к сообщению прилагается
`candidates[]` с готовым `apply{tool,arguments}`.

### 2.8. Версии

| Объект | Поле | Формат | Семантика |
|---|---|---|---|
| Формат IR | `ir_version` | целое, сейчас `1` | версия формата документа IR, не воркфлоу |
| Формат файла описания | `apiVersion` | `aqven/v1` | версия формата файла, а не содержимого: в IR не входит, `spec_hash` не меняет; движок читает все `apiVersion` из истории релизов, `aqven fmt` конвертирует в версию хранения |
| Версия описания | — | поля `version` в исходнике нет | порядок версий — история git и запись о релизе; метка релиза (`production`, `v7`, дата) присваивается человеком при публикации ([ADR-0022](adr/0022-hash-as-version.md)) |
| Идентичность описания | `spec_hash` | `sha256-<hex>` | домен `aqven/flow-spec/v1` над каноническим IR; вычисляется при сборке (`aqven check`, `aqven build`); одинаковое содержимое — один хеш; в интерфейсе — префикс 12 символов |
| Запись реестра | `rev` | целое | ссылка `key@rev`; форк даёт новый `key` и `forked_from = key@rev` |
| Компонент | хеш содержимого | `sha256-<hex>` | пин по хешу содержимого ([ADR-0022](adr/0022-hash-as-version.md)); пины внешних зависимостей — `aqven.lock.yaml`; что подаётся на хеш компонента — F-10 в [99](99-open-questions.md) |
| Шаблон промта | `template_version` | целое + `template_sha256` | в трассе оба: `aqven.prompt.template_version`, `aqven.prompt.template_sha256` |
| Профиль модели | `rev` | целое | роль разрешается в `model_profile@rev` |
| Выпуск | `release_hash` | `sha256-<hex>` | домен `aqven/release/v1` над `{spec_hash, prompt_pins, model_profile_pins, component_lock, env_overlay_hash}` |
| Протокол исполнителя | `application_version` DBOS | явная строка в `DBOSConfig` | версия кода исполнителя, а не графа; повышается только при несовместимой правке исполнителя ([ADR-0025](adr/0025-python-engine.md) §9, H2) |
| Прайсинг | `pricing_version` | строка | попадает в спан как `aqven.cost.pricing_version`, чтобы стоимость пересчитывалась воспроизводимо; снимок genai-prices 0.1.7 пинится на версию каталога |
| Оптимистичная блокировка записи | `expects[{path, file_hash}]` + `client_op_id` | `file_hash` — `sha256-<64 hex>` байтов файла, `client_op_id` — ULID | CAS по файлу: конфликт — 412 `STALE_FILE`, `FILE_VANISHED`, `FILE_EXISTS`, клиент перечитывает файл и переигрывает намерение; повтор с тем же `client_op_id` возвращает первый результат; CRDT не используется |

Бандл и его `formatVersion` отменены вместе с экспортом ([ADR-0025](adr/0025-python-engine.md) §7).

Префикс всех хешей содержимого — `sha256-`, канонизация перед хешированием — RFC 8785 (`rfc8785` 0.1.4,
Apache-2.0), хеш — `hashlib` sha256, доменная сепарация обязательна. Где порядок полей — семантика (ключ кассеты,
хеш схемы динамической формы), каждый объект `properties` перед канонизацией становится списком пар.

### 2.9. Ключи атрибутов спанов

Пространство имён — `aqven.`, сегменты через точку, внутри сегмента `snake_case`. Группы:

| Префикс | Что описывает | Примеры |
|---|---|---|
| `aqven.node_*`, `aqven.stage_id`, `aqven.parent_node_id` | положение в доменном графе, а не в дереве спанов | `aqven.node_id`, `aqven.node_type`, `aqven.node_attempt`, `aqven.loop_iteration` |
| `aqven.config.*` | эффективная конфигурация вызова | `aqven.config.model`, `aqven.config.model_role`, `aqven.config.model_profile`, `aqven.config.temperature`, `aqven.config.seed`, `aqven.config.hash`, `aqven.config.sources` |
| `aqven.prompt.*` | отрисованный промт и его пины | `aqven.prompt.template_id`, `aqven.prompt.rendered_sha256`, `aqven.prompt.estimated_tokens`, `aqven.prompt.cache_breakpoints` |
| `aqven.guard.*` | исход стража | `aqven.guard.outcome`, `aqven.guard.schema_valid`, `aqven.guard.repair_attempts`, `aqven.guard.degraded` |
| `aqven.cost.*` | деньги | `aqven.cost.input_usd`, `aqven.cost.output_usd`, `aqven.cost.total_usd`, `aqven.cost.estimated`, `aqven.cost.pricing_version` |
| `aqven.budget.*` | лимиты и их расход | `aqven.budget.scope`, `aqven.budget.limit_usd`, `aqven.budget.spent_usd`, `aqven.budget.exceeded`, `aqven.budget.action` |
| `aqven.cache.*`, `aqven.cassette.*` | детерминизм воспроизведения | `aqven.cache.hit`, `aqven.cassette.hit`, `aqven.cassette.key` |
| `aqven.fork.*`, `aqven.checkpoint_id`, `aqven.ir_hash`, `aqven.deployment` | происхождение прогона | `aqven.fork.parent_run_id`, `aqven.fork.from_node_id` |

Правила: булев атрибут именуется утверждением (`aqven.cache.hit`, `aqven.budget.exceeded`), денежная
величина всегда с суффиксом `_usd`, длительность — с `_ms`, размер в токенах — с `_tokens`,
ссылка на вынесенный в блоб контент — с суффиксом `_ref`, усечённая копия для глаза — с `_preview`.
Пара «полное значение в блобе + хеш + превью» пишется как `<x>_ref` + `<x>_sha256` + `<x>_preview`.
Звенья цепочки гарантий вызова пишут свои атрибуты (`aqven.cassette.hit`, `aqven.cassette.key`, исход вызова) в
текущий `chat`-спан capability `Instrumentation` Pydantic AI ([ADR-0029](adr/0029-trust-and-quality-python.md) §1).

## 3. Единицы и форматы

Каноническое представление — одно на всю платформу. Любое другое представление допустимо только на
экране и создаётся форматтером UI, а не хранится и не передаётся.

| Величина | Канон | Тип хранения | В трассе | Запрещено |
|---|---|---|---|---|
| Деньги | доллар США, дробное число | `numeric(18,8)` для агрегатов расхода, `numeric(18,10)` для цен за токен в `app.model_catalog` | `aqven.cost.*_usd`, `aqven.budget.*_usd` — число, не строка | `float`/`double` для денег; центы; строки с символом валюты; хранение в других валютах |
| Цена модели | за токен, не за 1K и не за 1M | `numeric(18,10)` | — | «за миллион» в хранении: пересчёт — забота импорта прайса |
| Стоимость прогона | сумма по спанам с `aqven.cost.pricing_version` | `numeric(18,8)` | `aqven.cost.total_usd` + `aqven.cost.estimated` (булев) | смешивать оценку и факт без флага `estimated` |
| Время-длительность | миллисекунды, целое | `integer`/`bigint` | суффикс `_ms`: `aqven.config.timeout_ms` | секунды; «1h» в числовом поле; `float` |
| Время-TTL и интервалы в описании | человекочитаемая строка длительности (`1h`) в `source.ttl`; исключения, закреплённые ADR: `ttl_ms` у `determinism: stable` (ADR-0019) и `timeout_seconds` узла `human` ([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §13) | текст в JSONB | — | смешивать формат описания и формат рантайма (`_ms`) без явного суффикса: преобразование делает компилятор |
| Момент времени | UTC, ISO 8601 с явным `Z` | `timestamptz`, всегда UTC | ISO-строка | локальное время; `timestamp` без зоны; хранение зоны отдельным полем |
| Дата в типах описания | встроенные `Date` / `DateTime` ([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1); в Pydantic — `datetime.date` / `datetime.datetime` (§8 ADR-0026) → JSON Schema `format: "date"` / `"date-time"` | строка | — | `DateTime` без зоны: как модель принуждает UTC — открытый вопрос 9 |
| Токены | целое, оценка токенизатором профиля модели, затем умножение на поправочный коэффициент профиля; токенизатор оценки не выбран — ADR-0029 ОВ 4 (кандидат tiktoken 0.14.0, BPE-файл скачивается из сети) | `integer` | суффикс `_tokens`: `aqven.prompt.estimated_tokens`, `aqven.budget.spent_tokens` | считать токены «по символам / 4»; переносить счёт одной модели на другую без коэффициента профиля |
| Размер данных | байты, целое | `bigint` | суффикс без единицы, единица в описании поля | КБ/МБ в числовом поле |
| Хеш | `sha256-<hex в нижнем регистре>` над RFC 8785-канонизацией, с доменной сепарацией | `text` | `*_sha256` | base64; верхний регистр; хеш без домена |
| Идентификатор | UUIDv7 | `uuid DEFAULT uuidv7()` | строка | автоинкремент; составные ключи в роли PK |
| Оценка скорера | число в объявленном диапазоне шкалы + отдельное поле обоснования | `app.scores` | — | шкала «на глаз»: диапазон объявляется в архетипе `scorer` и проверяется |

**Локаль и часовой пояс — вход прогона, а не окружение.** Внутри шаблонов промтов `now()`,
`random()`, локаль и часовой пояс воспроизводимы только если взяты из `run.context`; брать их из
системы запрещено правилом каталога §8 №20. Язык вывода модели задаётся параметром архетипа
`generator` и проверяется, а не подразумевается. Часовой пояс и локаль не являются полями типа:
тип хранит ISO-строку, представление даты человеку — забота `view` типа и форматтера UI.

**Округление денег.** Округление применяется только при отображении. Сравнение бюджета с расходом,
сложение спанов и решение `aqven.budget.exceeded` считаются на полной точности `numeric`.

## 4. Сокращения

| Сокращение | Расшифровка | Где встречается |
|---|---|---|
| ADR | Architecture Decision Record — запись архитектурного решения; единственный способ изменить DECISIONS | [DECISIONS.md](DECISIONS.md), [adr/](adr/README.md) |
| AST | Abstract Syntax Tree — дерево узлов шаблона python-liquid 2.3.1 (`ContentNode`, `OutputNode`, `IfNode`, `CaseNode`, `ForNode`, `MessageNode`), по которому ходит наш Visitor | [08. Промты](08-prompts.md), [ADR-0029](adr/0029-trust-and-quality-python.md) §8 |
| BCa | bias-corrected and accelerated — вариант бутстрапа для доверительных интервалов, B=10000, фиксированный seed; `scipy.stats.bootstrap(method="BCa")` по массиву разниц | [13. Evals и гейты](13-evals-and-gates.md) |
| BH | Benjamini–Hochberg — поправка на множественные сравнения для secondary-семьи метрик | [13. Evals и гейты](13-evals-and-gates.md) |
| BRIN | Block Range Index — индекс по времени на партициях `app.run_nodes` | [16. Модель данных](16-data-model.md) |
| CaMeL | схема разделения доверия, при которой `untrusted` значение попадает в ветвление только через экстрактор | [09. Модель контекста](09-context-model.md) §5 |
| CAS | Compare-And-Swap — запись с проверкой ожидаемого `file_hash` каждого файла (`expects[{path, file_hash}]`) | [ADR-0017](adr/0017-files-as-source-of-truth.md), [ADR-0028](adr/0028-studio-api-contract.md) §6 |
| CI | Continuous Integration — автоматические прогоны проверок: мутанты IR, фикспойнт `aqven fmt`, проверка `uv.lock`, фикстуры TID251, тесты без сети | [20. Репозиторий и инструменты](20-repo-and-tooling.md) |
| CRDT | Conflict-free Replicated Data Type — рассматривался и отвергнут в пользу server-authoritative `flow_patch` | DECISIONS «MCP-контракт» |
| DBOS | библиотека надёжного исполнения `dbos` 2.31.1: workflow и шаги с чекпоинтами в системной БД, fork, сообщения, события, очереди | [ADR-0025](adr/0025-python-engine.md) |
| DDL | Data Definition Language — операторы создания схемы БД | [16. Модель данных](16-data-model.md) |
| ELK | Eclipse Layout Kernel (`elkjs`) — раскладка графа на канвасе | [15. Studio](15-studio-frontend.md) |
| ERESOLVE | код отказа npm при неразрешимом конфликте peer-зависимостей; в студии им падает установка openapi-typescript 7.13.0 (peer `typescript@^5.x`) при TypeScript 6.0.3 | ADR-0025 ОВ 13 |
| FK / PK | foreign key / primary key | [16. Модель данных](16-data-model.md) |
| HNSW | Hierarchical Navigable Small World — тип индекса pgvector для векторного поиска | DECISIONS «Данные» |
| IR | Intermediate Representation — промежуточное представление воркфлоу | [04. Схема IR](04-ir-schema.md) |
| JCS | JSON Canonicalization Scheme, RFC 8785 — канонизация перед хешированием, `rfc8785` 0.1.4 | [18. Канонизация и хеш](18-export-and-conformance.md) |
| LLM | Large Language Model | весь комплект |
| MCP | Model Context Protocol — протокол, по которому Claude работает с платформой | [14. MCP-контракт](14-mcp-contract.md) |
| OTel | OpenTelemetry — модель спанов и экспортёров трасс | [12. Наблюдаемость](12-observability.md) |
| OTLP | OpenTelemetry Protocol — экспорт спанов в Langfuse по HTTP (`opentelemetry-exporter-otlp-proto-http` 1.44.0) без SDK langfuse | [ADR-0025](adr/0025-python-engine.md) §8 |
| PII | Personally Identifiable Information — персональные данные; редактируются звеном `RedactingModel` до провода, ключа и файла кассеты, в спанах — `include_content=False` | [19. Безопасность](19-security-and-policies.md), [ADR-0029](adr/0029-trust-and-quality-python.md) §5 |
| RLS | Row-Level Security — построчная изоляция тенантов в PostgreSQL | DECISIONS «Данные» |
| RPN (историческое) | Reverse Polish Notation — форма условий шаблона в liquidjs; снято вместе с liquidjs, структура условий `IfNode` python-liquid — ADR-0029 ОВ 17 | [ADR-0029](adr/0029-trust-and-quality-python.md) §8 |
| SDK | Software Development Kit; в комплекте — SDK провайдеров `openai`, `anthropic`, `google-genai` (создаются только фабрикой `aqven_llm` с `max_retries=0`) и MCP SDK `mcp` 2.2.0 | DECISIONS «Ось версий» |
| TTL | Time To Live — срок годности значения источника `data`; просроченное значение не подставляется | [09. Модель контекста](09-context-model.md) |
| UUIDv7 | версия UUID со встроенной временной компонентой; в PG 18 доступна как `uuidv7()` | [16. Модель данных](16-data-model.md) |
| semver | Semantic Versioning — к описанию воркфлоу не применяется: идентичность — `spec_hash`, формат файла — `apiVersion`; `formatVersion` бандла отменён вместе с экспортом | [ADR-0022](adr/0022-hash-as-version.md), [ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1 |
| A/A, A/B | прогон двух идентичных конфигураций (проверка шума) и прогон двух разных; A/A обязателен до A/B | [13. Evals и гейты](13-evals-and-gates.md) |
| L0–L4 | уровни гарантии из §8 спеки | §1 этого документа |

## 5. Открытые вопросы

1. **Статус `load`, `retrieve`, `reduce` не определён однозначно.** [03. Язык ядра](03-core-language.md)
   объявляет ровно пять примитивов и семь комбинаторов, закрытый набор подвидов `node:`
   ([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1, [ADR-0027](adr/0027-dynamic-io-shapes.md)) добавляет к ним
   `seq`, `call` и `narrow`, а в [09](09-context-model.md), [06](06-registries.md) и [04](04-ir-schema.md) как виды
   узлов используются ещё `load`, `retrieve` и `reduce`. *Закрыть:* решить, это виды узлов ядра, компоненты
   стандартной библиотеки или сахар, и зафиксировать закрытый набор в модели описания `Node` и JSON Schema корня IR
   (B-01 в [99](99-open-questions.md)).
2. **Разделитель префикса при раскрытии компонента не зафиксирован.** Требование уникальности `node_id` в
   развёрнутом виде есть, конкретный символ (`.`, `__`, `/`) — нет. *Закрыть:* выбрать символ,
   недопустимый в авторских именах (`^[a-z][a-z0-9_]{0,62}$` допускает `_`, значит `__` требует отдельного
   запрета), и проверять это правилом компилятора; от выбора зависят парсинг `aqven.node_id` в запросах к трассам и
   группировка на канвасе.
3. **Точность денежных колонок не выверена по всем таблицам.** В [16](16-data-model.md) встречаются и
   `numeric(18,8)`, и `numeric(18,10)`; сводного правила «где какая» в документе нет. *Закрыть:*
   владельцу модели данных объявить правило (цены за токен — 10 знаков, агрегаты расхода — 8) и
   привести колонки к нему в ближайшей expand-миграции.
4. **Порог отказа импорта по `formatVersion`.** Закрыт: `formatVersion` бандла отменён вместе с экспортом
   решением владельца от 2026-09-16 ([ADR-0025](adr/0025-python-engine.md) §7); совместимость формата файла —
   `apiVersion` и цепочка конвертеров ([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §1).
5. **Мультивалютность.** Канон — доллар США; хранение и отображение в других валютах, курс и дата
   курса нигде не описаны. *Закрыть:* если продукт выставляет счета не в USD, завести `currency` и
   `fx_rate_at` в бюджетах отдельным ADR; иначе явно записать «только USD» в DECISIONS.
6. **Машиночитаемая версия глоссария.** Сейчас соответствие «термин ↔ идентификатор» живёт только в
   этой таблице, поэтому расхождение кода с ней ничем не ловится; пакет `@aqven/contracts`, куда её собирались
   вынести, снят ([ADR-0028](adr/0028-studio-api-contract.md) §7). *Закрыть:* вынести §1 и §2.1 в данные пакета
   движка (имя — ADR-0026 ОВ 1) и добавить CI-проверку, что все `kind`, подвиды `node:`, встроенные `TypeId`, имена
   тулов каталога `Operation`, коды `E_*` и префиксы спан-атрибутов из кода присутствуют в глоссарии.
7. **Термины, которых нет ни в заметках, ни в спеке.** Для части словаря определения выведены из
   документов комплекта, а не из первоисточника: «страж», «матрица стадий», «критик-цикл» существуют
   как механизмы, но канонический английский идентификатор (`guard`, `stage matrix`, `critic_reviser`)
   взят из соседних документов. *Закрыть:* при первой реализации зафиксировать идентификаторы в коде
   и вернуть их сюда; до этого считать колонку «идентификатор» для этих трёх строк предварительной.
8. **Два написания домена хеша.** §2.1 и [04](04-ir-schema.md) §4.2 задают домен `aqven/<предмет>/v<major>`
   (`aqven/flow-spec/v1`, `aqven/release/v1`), а ключ кассеты ([ADR-0029](adr/0029-trust-and-quality-python.md) §1) и
   хеш схемы динамической формы ([ADR-0027](adr/0027-dynamic-io-shapes.md)) используют `aqven.cassette.v1` и
   `aqven.schema.v1`. Ни один документ не говорит, различие намеренное или нет. *Закрыть:* решение ведущего — одно
   написание для всех доменов (правка ADR-0027 и ADR-0029 или 04 §4.2) и тест, что каждый домен в коде проходит
   одну регулярку; до решения значения из ADR не переименовывать, иначе меняются ключи записанных кассет.
9. **Как модель описания принуждает UTC у `DateTime`.** Канон §3 — момент времени в UTC с явным `Z`, а
   соответствие `DateTime` ↔ `datetime.datetime` ([ADR-0026](adr/0026-yaml-spec-and-code-refs.md) §8) не говорит,
   принимается ли значение без зоны и какая JSON Schema уходит провайдеру. *Закрыть:* проба на pydantic 2.13.5 —
   значение без зоны и со смещением на входе узла и на выходе `llm`, сравнение `datetime.datetime` и
   `pydantic.AwareDatetime` по валидации и по `model_json_schema()`; выбор записать в [05](05-type-system.md).
