# Срез 1: продукты с визуальным редактором И git

> Вопрос среза: у кого уже есть и UI-редактор, и git-синхронизация — что они выбрали источником истины, и где провели границу «в git / в БД».

## Что нашли (сводная таблица)

| Продукт | Источник истины | Направление | Формат в git | Конфликты | НЕ в git |
|---|---|---|---|---|---|
| **Windmill** | БД (Postgres), git — зеркало | 2-сторонний, но только primary repo читается обратно; secondary — write-only | `f/<path>__flow/flow.yaml` + шаги, `*.script.yaml` + `.py/.ts`, `*.variable.yaml`, `*.resource.yaml`, `*__app/` | Нет merge. Sync = «перезаписать цель источником»: удалить лишнее, создать недостающее. Защита — префикс `[WM]` в коммитах, чтобы не зациклить | Прогоны/jobs, логи, результаты, кэш, секреты (опц. `skipSecrets`), очередь |
| **Kestra** | Конфигурируемо: `sourceOfTruth: GIT \| KESTRA` | `SyncFlows`/`SyncNamespaceFiles` (git→Kestra), `PushFlows`/`PushNamespaceFiles` (Kestra→git), `TenantSync`/`NamespaceSync` (двунаправленно) | `<namespace>/flows/<flowId>.yaml`, `<namespace>/files/<path>` | Sync «overwriting any conflicting UI edits with the Git version»; `whenMissingInSource: DELETE\|KEEP\|FAIL` | Executions, логи, KV-store, internal storage, secrets |
| **n8n** (Enterprise) | БД инстанса; git — канал доставки между инстансами | Push из dev-инстанса, pull на target; branch-per-environment | JSON воркфлоу + теги + **stubs** креденшелов/переменных + схемы data tables | **Конфликтов нет как понятия**: «n8n can't detect conflicts on workflows». Pull перезаписывает («Pull and override»), push перезаписывает | Прогоны, значения креденшелов и переменных, строки data tables |
| **Retool** | БД Retool; main-ветка — «source of truth **для деплоя**» | Только из UI в git; правки файлов руками **запрещены** | Toolscript (`*.tsx`, JSX-подобный DSL) — YAML выпилен в 2024 | PR/protected branches поверх сгенерированных файлов; merge — на стороне SCM | Данные, ран-логи, секреты ресурсов |
| **Appsmith** | БД («filesystem on the Appsmith server **mirrors the entry in the application database**») | 2-сторонний через серверный локальный репозиторий | `.json` на виджет/датасорс, `metadata.json` + текст на query, `.js` на JS-объекты, под директорией страницы | Настоящий git-merge через PR, но конфликты решаются **вручную в JSON** | Секреты (шифрованы в БД), данные, история прогонов |
| **Superblocks** | Git (default branch) — источник истины для релиза | 2-сторонний: UI→git, git→Superblocks через CI (GitHub Actions) | `.superblocks/superblocks.json` в корне + файлы приложений/воркфлоу/джобов | Через PR в SCM; в Superblocks попадает только смёрженное в default branch | UNVERIFIED: секреты интеграций, история прогонов (страница FAQ отдала 404) |
| **Budibase** | БД (CouchDB); git-интеграции **нет** | — | Экспорт приложения одним JSON-блобом | — | Всё: версионирование только через export/import |
| **Directus** | БД; снапшот — производная | `schema snapshot` → YAML → `schema apply` в другом окружении | `snapshot.yaml` (только модель данных) | Нет merge: apply накатывает разницу | Контент, пользователи, файлы, история |
| **Strapi** | **Файлы** (`src/api/<name>/content-types/<name>/schema.json`), UI их генерирует | UI→файлы, файлы→БД при загрузке | `schema.json` на content-type | Обычный git-merge JSON-файлов | Контент, медиа, пользователи |

## Windmill — разбор (ближайший аналог)

Факты, все со ссылками:

| Факт | Цитата / ссылка |
|---|---|
| Push при деплое из UI | «Each time an item is deployed, Windmill will create and push a commit to the specified repository. The reverse direction works too» — [git_sync](https://www.windmill.dev/docs/advanced/git_sync) |
| Асимметрия репозиториев | «only the primary repository supports pulling changes from git back into the workspace (true bidirectional sync). Secondary repositories receive pushes from Windmill but are never read back» — [git_sync](https://www.windmill.dev/docs/advanced/git_sync) |
| Анти-петля вместо merge | «Commits made by Windmill itself are prefixed with `[WM]` and are skipped by the automatic sync» — [git_sync](https://www.windmill.dev/docs/advanced/git_sync) |
| Sync **без состояния** — ключевое | «Syncing is a one-off operation with no state maintained. It will override any item that is within the scope: remove those that are in the target and not in the source, and it will create new items that are in source but not in target» — [cli/sync](https://www.windmill.dev/docs/advanced/cli/sync) |
| Раскладка файлов | «local files for flows, apps, and raw apps are stored under folders named `<path>__flow/`, `<path>__app/`, and `<path>__raw_app/`»; скрипты — `.script.yaml` + файл языка — [cli/sync](https://www.windmill.dev/docs/advanced/cli/sync) |
| Настройки синка живут в репо | `wmill.yaml` с include/exclude — [git_sync](https://www.windmill.dev/docs/advanced/git_sync) |
| Что синкается | scripts, flows, apps, folders, resources, variables, schedules, resource types, users, groups, triggers, workspace settings, encryption keys — [git_sync](https://www.windmill.dev/docs/advanced/git_sync) |
| **Чем это плохо кончается** | Issue #8468 (открыт 21.03.2026, назначен Ruben Fiszel, автор Windmill, без резолюции на 12.09.2026): `wmill sync pull` увидел флоу удалённым в воркспейсе, применил удаление локально, закоммитил `[WM] Flow '…' deleted` и запушил — флоу потерян в обе стороны — [#8468](https://github.com/windmill-labs/windmill/issues/8468) |

**Вывод по Windmill:** это НЕ «git как источник истины». Это БД как источник истины + git как аудит-лог и канал для CI/CD. Merge отсутствует принципиально: `sync` — это `rsync --delete`, а не `git merge`. Цена ошибки — молчаливое удаление (см. #8468). Windmill сам решает конфликт не семантически, а «кто последний, тот и прав».

## Kestra — разбор

| Факт | Ссылка |
|---|---|
| Явное поле `sourceOfTruth: GIT` или `KESTRA` в `TenantSync`/`NamespaceSync` — единственный из всех, кто сделал выбор источника истины **параметром** | [version-control-cicd/git](https://kestra.io/docs/version-control-cicd/git) |
| Sync-паттерн: «The sync flow applies those changes, overwriting any conflicting UI edits with the Git version» | там же |
| Раскладка: `<namespace>/flows/<flowId>.yaml`, `<namespace>/files/<path>` | там же |
| Расхождение множеств решается политикой, а не merge: `whenMissingInSource: DELETE \| KEEP \| FAIL` | там же |
| Сам git-синк — это **воркфлоу внутри Kestra** (`io.kestra.plugin.core.git.*`), т.е. интеграция, а не ядро | там же |

**Вывод:** Kestra честнее всех: они не притворяются, что merge есть. Они дают тумблер «кто главный» и политику для расхождений. Это ровно та развилка, которую нам предлагают, — и Kestra не смогла выбрать за пользователя.

## n8n Source Control — разбор

| Факт | Ссылка |
|---|---|
| Пушится: воркфлоу + теги + email владельца, **stubs** креденшелов (ID, name, type), stubs переменных (ID, name), схемы data tables (без строк), проекты и папки | [push-and-pull-changes](https://docs.n8n.io/administer/use-source-control-and-environments/push-and-pull-changes) |
| **«n8n can't detect conflicts on workflows»** — конфликтов на воркфлоу просто нет как понятия | там же |
| «Credentials and variables can't have merge issues, as n8n chooses the version to keep» | там же |
| Pull перезаписывает: «n8n may display a warning about overriding local changes. Select **Pull and override** to override your local work with the content in Git» | там же |
| Push перезаписывает: «your local workflow will override what's in Git, so make sure that you have the most up to date version or you risk overriding recent changes» | там же |
| Пушится **saved**, а не published версия; публиковать на целевом инстансе надо отдельно | там же |
| Секреты не синкаются: «n8n doesn't sync credentials and variable values with Git. You must set up the credentials and variable values manually» | [work-with-environments](https://docs.n8n.io/administer/use-source-control-and-environments/work-with-environments) |
| Окружение = «an n8n instance and a Git branch»; dev/test/prod — разные инстансы на разных ветках | там же |
| Pull на проде даёт «a few seconds of downtime» для published воркфлоу | [push-and-pull-changes](https://docs.n8n.io/administer/use-source-control-and-environments/push-and-pull-changes) |

**Почему платная фича:** это не git-механика, а модель окружений (отдельные инстансы + branch-per-env + RBAC), продаётся как enterprise-надстройка. Техническая суть проста до примитива: экспорт JSON → commit → на другом инстансе импорт с перезаписью.

## Low-code UI-билдеры: Retool / Appsmith / Superblocks

| Факт | Ссылка |
|---|---|
| **Retool**: «your Retool instance syncs and deploys changes made to the designated main branch… This makes the main branch in the repository the source of truth **for what gets deployed**» — т.е. git — источник истины для деплоя, не для редактирования | [docs.retool.com/source-control](https://docs.retool.com/source-control/) |
| **Retool** прямо запрещает ручные правки файлов: «do **not** manually add any ToolScript (*.tsx), YAML, JSON, or query (*.sql, *.js*) files to the Source Control repository. All changes to apps, workflows, queries, and resources must be done **through the Retool interface**» | [Source Control Best Practices](https://docs.retool.com/education/coe/customer-resources/source-control) |
| **Retool** выпилил YAML (deprecated 15.10.2024, поддержка кончается в self-hosted 3.196) и заменил на **Toolscript** — «a JSX-style markup language for serializing protected apps, queries, and resources»; мотив — читаемость диффов, «Toolscript omits default values». При этом: «the migration **does not change how Retool stores apps**» | [changelog/yaml-serialization-deprecation](https://docs.retool.com/changelog/yaml-serialization-deprecation) |
| **Appsmith**: «The Appsmith server, not a user's web client, stores the local repository» и «we maintain a filesystem on the Appsmith server that **mirrors the entry in the application database**» — БД источник истины, git — зеркало на сервере | [Git in Appsmith: The Details behind Our Implementation](https://www.appsmith.com/blog/appsmith-git-internal-tools-2) |
| **Appsmith** раскладка: datasources → `.json` без секретов, каждый query → своя директория (текст запроса + `metadata.json`), JS-объекты → `.js`, виджеты → набор `.json` под директорией страницы | там же |
| **Appsmith** секреты: «we store as much of the configuration as possible in a .json file… **while excluding any secrets**» — секреты шифрованы в БД | там же |
| **Appsmith** конфликты: реальный merge через PR, но ручной — надо «validate the page JSON with a JSON validator and correct any formatting issues introduced during conflict resolution»; есть открытый issue #14498 «Make it easier to resolve the merge conflicts» | [commit-and-push](https://docs.appsmith.com/advanced-concepts/version-control-with-git/commit-and-push), [#14498](https://github.com/appsmithorg/appsmith/issues/14498) |

**Ключевой сигнал:** Retool прошёл полный круг — YAML → собственный DSL (Toolscript) → и всё равно «migration does not change how Retool stores apps». Формат файла оказался вопросом **читаемости диффа**, а не хранения. Это ровно наш случай: IR в JSONB + генератор читаемого текстового представления.

## Схемы и конфиги: Budibase / Directus / Strapi

| Продукт | Механизм | Ссылка |
|---|---|---|
| **Budibase** | Git-интеграции нет вообще. Только «export any app as a JSON blob text file, which includes all Budibase DB data, data connector configurations, query configs, and builder data for all screens»; импорт — Settings → General → Import. Issue #4360 «Revision History and Version Control» открыт 07.02.2022, закрыт **без публичной реализации** | [export-and-import-apps](https://docs.budibase.com/docs/export-and-import-apps), [#4360](https://github.com/Budibase/budibase/issues/4360) |
| **Directus** | `directus schema snapshot` → YAML → `directus schema apply ./path/to/snapshot.yaml` в целевом окружении; отдельно — knex-миграции с `up`/`down` для данных. Снапшот = только модель данных; предупреждение «Backup Your Database. Proceed at your own risk» | [configuration/migrations](https://directus.com/docs/configuration/migrations), [guides/migration](https://docs.directus.io/guides/migration/) |
| **Strapi** | **Единственный, у кого файлы — первичны**: Content-Type Builder в админке пишет `src/api/<name>/content-types/<name>/schema.json`, файлы коммитятся, на деплое Strapi накатывает миграции на старте. Цена: Content-Type Builder работает только в dev-режиме, на проде схему в UI не поменять | [Strapi CTB / schema files](https://docs.strapi.io/cms/backend-customization/models) UNVERIFIED: точная формулировка ограничения dev-режима не прочитана в доках, взята из вторичного источника |

## У кого получилось плохо и почему

| Симптом | Продукт | Корень проблемы |
|---|---|---|
| Молчаливое удаление флоу и пуш этого удаления в репо | Windmill, [#8468](https://github.com/windmill-labs/windmill/issues/8468), открыт 21.03.2026, без фикса | `sync` без состояния = `rsync --delete`. Нет трёхстороннего слияния → «отсутствует в источнике» неотличимо от «удалено намеренно» |
| «n8n can't detect conflicts on workflows» | n8n | Воркфлоу — один непрозрачный JSON-блоб. Текстовый merge по нему бессмыслен, семантического merge нет → остаётся только «перезаписать» |
| YAML → Toolscript, полная замена формата сериализации | Retool | Пытались сделать файлы читаемыми для ревью. YAML с дефолтами давал нечитаемые диффы. Итог: свой DSL, и «migration does not change how Retool stores apps» |
| Ручная правка JSON при merge-конфликте, открытый issue «сделайте это проще» | Appsmith, [#14498](https://github.com/appsmithorg/appsmith/issues/14498) | Git merge работает на строках, а конфликт живёт на уровне графа. Пользователь чинит граф текстовым редактором |
| Версионирования нет 4 года | Budibase | Отложили — и не сделали. Export/import вместо истории |

## Вывод для нас

**Главный факт среза: ни один продукт с визуальным редактором не сделал git источником истины для спеки.** Из семи разобранных файлы первичны только у Strapi — и ценой того, что редактор схемы в проде выключен. Все остальные держат БД авторитетной, а git используют как (а) аудит-лог, (б) канал доставки между окружениями, (в) поверхность для code review. Заказчик прав в мотиве и не прав в выводе: готовыми из git берут **ревью и доставку**, а не версионность спеки.

**Почему так, механически.** Git умеет трёхсторонний merge по строкам. Спека воркфлоу — типизированный граф с инвариантами (DAG, типы портов, полнота enum). Строковый merge даёт синтаксически валидный файл с мёртвой семантикой — это ровно тот аргумент, которым мы отвергли CRDT в [ADR-0009](../adr/0009-op-log-not-crdt.md) («CRDT гарантирует сходимость, но не гарантирует валидность»). Git тут не лучше CRDT, а хуже: у него вообще нет точки, где можно отклонить слияние. Отсюда и три наблюдаемых исхода в таблице выше — перезапись (n8n, Kestra, Windmill), запрет ручных правок (Retool) или ручная починка JSON (Appsmith). Четвёртого никто не нашёл.

**Что берём:**

1. **Kestra-тумблер `sourceOfTruth`.** Единственное честное решение в отрасли. Нам подходит как режим синка на уровне проекта, а не как архитектура: `GIT` для команд с CI-дисциплиной, `DB` по умолчанию.
2. **Retool-урок про формат.** Наш канонический YAML (§6 [04-ir-schema](../04-ir-schema.md), round-trip как kill-критерий 13) — правильная ставка, но его ценность — **читаемость диффа в PR**, не хранение. Retool прошёл этот круг и вернулся туда же. Проверить в §6.2: не печатаем ли мы дефолты — это ровно то, из-за чего Retool выкинул YAML.
3. **Windmill `[WM]`-префикс.** Дешёвая защита от петли push→pull→push. Нужна нам в любом варианте двустороннего синка.
4. **n8n-разделение stub/secret.** В git — ID, имя, тип ресурса; значение — в БД. Совпадает с нашим «правилом трёх зон для блобов» (§4 [16-data-model](../16-data-model.md)) и с исключением секретов из `spec_hash`.
5. **Kestra `whenMissingInSource: DELETE|KEEP|FAIL`.** Явная политика для расхождения множеств вместо неявного `--delete`. Это прямой ответ на баг Windmill #8468. Дефолт у нас должен быть `FAIL`.

**Что не берём:**

- **Git как хранилище спеки.** Op-лог с `base_rev` из ADR-0009 — это не «свой git», это оптимистическая блокировка с транзакционной валидацией инвариантов, чего git не делает и делать не может. Замена op-лога на git = потеря того самого свойства, ради которого он введён.
- **Файловый лэйаут как контракт.** Windmill `<path>__flow/`, Appsmith «директория на страницу» — это ручная эмуляция content-addressing. У нас `spec_hash` по RFC 8785 + `canonicalize@5.0.0` уже даёт идентичность версии лучше, чем путь в файловой системе.
- **«Git даст откат бесплатно».** `git revert` восстановит текст, но не пересоберёт `release_hash` с `prompt_pins` / `model_profile_pins` / `component_lock` (§4 [04-ir-schema](../04-ir-schema.md)). Наш `flow_revert` откатывает то, что git не видит. Это не дублирование git, это другое множество.

**Граница, которую подтверждает срез:**

| В git | В Postgres |
|---|---|
| Экспортированная спека (канонический YAML), ревью в PR, ссылки на версии, CI-гейты конформанса | Черновики + op-лог, `rev`, семантический дифф, lineage версий, `release_hash` и пины, прогоны, трассы, `run_nodes`, чекпоинты, датасеты, кассеты, `tool_effects`, секреты |

Формулировка, в которой обе стороны правы: **git — граница релиза, БД — граница редактирования.** Спека попадает в git в момент `version_propose`, а не при каждом `flow_patch`. Это то, что фактически делают Windmill (коммит при деплое) и n8n (пушится saved-версия) — и это не противоречит текущему решению «JSONB — истина, YAML — транспорт».
