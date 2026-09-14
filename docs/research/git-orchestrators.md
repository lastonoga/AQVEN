# Срез 2: оркестраторы, где определение воркфлоу — код/файл в репозитории

> Вопрос среза: если определение живёт файлом под git, чем прогон привязан к версии определения — и что ломается, когда файл поменяли под работающим прогоном.

## Что нашли

| Продукт | Где физически лежит определение | Единица версии | Чем прогон привязан к версии |
|---|---|---|---|
| **Airflow 3** | Python-файлы в **DAG bundle** (`GitDagBundle` = git-репо) | «Dag version» в метабазе + версия бандла (git commit) | `DagRun.created_dag_version_id` — FK на версию, действовавшую в момент создания рана; воркер чекаутит ту версию бандла |
| **Dagster** | Python в **code location** (репо/образ) | образ/деплой code location + `code_version` на ассет | ран привязан к деплою code location; `code_version` + data version дают staleness/мемоизацию |
| **Prefect 3** | код в репо, `prefect.yaml` = рецепт деплоя (`pull.git_clone`) | **deployment version** (иммутабельна, создаётся на каждый `prefect deploy`) | flow run исполняет live-версию деплоя; Prefect сам собирает repo/branch/commit SHA в `version_info` |
| **Argo Workflows** | CRD в кластере (`WorkflowTemplate`), git — через Argo CD | объект `Workflow` с **вкопированным** спеком | контроллер копирует резолвнутый спек в `status.storedWorkflowSpec` / `status.storedTemplates` при создании рана |
| **Temporal** | код воркера (любой репозиторий) | **Worker Deployment Version** = `deployment name + Build ID` | Event History + versioning behavior: `Pinned` ран доигрывает на той же версии воркера |
| **Flyte** | Python, но исполняется **зарегистрированный** артефакт | `{project, domain, name, version}`, обычно git SHA; иммутабелен | execution ссылается на конкретную зарегистрированную версию; старые доигрывают |
| **GitHub Actions** | YAML в `.github/workflows` | commit SHA репозитория | ран использует версию файла из commit SHA / ref события |

| Факт | Цитата / источник |
|---|---|
| Airflow: DAG-версия создаётся только при **структурном** изменении | «A new Dag version is created every time a Dag run is created for a Dag that has undergone a structural change since the last run» — [Astronomer](https://www.astronomer.io/docs/learn/airflow-dag-versioning) |
| Airflow: версионированный бандл фиксирует код на весь ран | «allowing for a Dag run to use the same code for the whole run, even if the Dag is updated mid-way through the run»; «Each DAG run records the bundle version it was created with» — [Dag Bundles](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/dag-bundles.html) |
| Airflow: неверсионированный бандл = поведение Airflow 2 (код берётся на старте задачи) | [Astronomer](https://www.astronomer.io/docs/learn/airflow-dag-versioning) |
| Airflow: clear из UI по умолчанию берёт **последнюю** версию, из API/CLI — **исходную** (`run_on_latest_version`) | [Astronomer](https://www.astronomer.io/docs/learn/airflow-dag-versioning), [discussion #59595](https://github.com/apache/airflow/discussions/59595) |
| Airflow: `DagRun.created_dag_version_id` — FK на версию в момент создания рана | [airflow.models.dagrun 3.0.0](https://airflow.apache.org/docs/apache-airflow/3.0.0/_modules/airflow/models/dagrun.html) |
| Argo: спек вкапывается в объект рана, чтобы правки шаблона не влияли на идущий ран | «if a workflow is running, any changes to existing template won't affect the running workflow» — [workflow-templates.md](https://github.com/argoproj/argo-workflows/blob/main/docs/workflow-templates.md), [Workflow Templates](https://argo-workflows.readthedocs.io/en/latest/workflow-templates/) |
| Argo CD: откат несовместим с автосинком | «Rollback cannot be performed against an application with automated sync enabled» — [auto_sync](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/) |
| Argo CD: дедуп по `(commit SHA, parameters)` | «Automated sync will only attempt one synchronization per unique combination of commit SHA1 and application parameters» — там же |
| Temporal: детерминизм — требование, не пожелание | «Workflow code must be deterministic to support replay»; «Commands that are emitted are compared with the existing Event History» — [workflow-definition](https://docs.temporal.io/workflow-definition) |
| Temporal: изменение кода под живым раном = nondeterminism error | «the server side Event History would be out of sync… causing the Workflow to fail with a nondeterminism error» — [Go versioning](https://docs.temporal.io/develop/go/versioning) |
| Temporal: `Pinned` vs `Auto-Upgrade` | «A **Pinned** Workflow is guaranteed to complete on a single Worker Deployment Version»; «An **Auto-Upgrade** Workflow will automatically move to a new code version… must be kept replay-safe manually, that is with patching» — [Worker Versioning](https://docs.temporal.io/production-deployment/worker-deployments/worker-versioning) |
| Temporal: `GetVersion` пишет маркер в историю | «records a marker in the Event History so that all future calls to `GetVersion` for this change Id… will always return the given version number» — [Go versioning](https://docs.temporal.io/develop/go/versioning) |
| Temporal: старое экспериментальное Worker Versioning удалено из сервера в марте 2026 | [Go versioning](https://docs.temporal.io/develop/go/versioning) |
| Flyte: регистрация иммутабельна | «registered workflows are immutable — an instance of a workflow defined by a specific {Project, Domain, Name, Version} combination can't be updated» — [Versions](https://docs-legacy.flyte.org/en/latest/user_guide/concepts/main_concepts/versioning.html) |
| Flyte: идущее исполнение не трогается новой версией | «If a workflow execution is in progress and another new workflow version has been activated, Flyte guarantees that the execution of the old version continues unhindered» — там же |
| Flyte: версия = git SHA, контейнер фиксирует зависимости | «Git SHA is used to version tasks and workflows»; «ensures that the system- and Python-level dependencies along with workflow source code are immutable» — [Registering workflows](https://docs-legacy.flyte.org/en/latest/user_guide/flyte_fundamentals/registering_workflows.html) |
| Prefect: версии деплоя иммутабельны, откат — кнопка | «A new deployment version is created every time a deployment is updated»; «A previous deployment version can be made live by rolling back to it» — [versioning](https://docs.prefect.io/v3/how-to-guides/deployments/versioning) |
| Prefect: git-метаданные собираются автоматически и **не влияют на исполнение** | «Prefect automatically collects the repository name, repository URL, the currently checked out branch, the commit SHA… This information is used to help create a record of which code versions produced which deployment versions, and does not affect deployment execution» — там же |
| Dagster: два понятия версии — code version и data version | «Code version is a string that represents the version of the code that computes an asset»; «Dagster automatically computes a data version… by hashing a code version together with the data versions of any input assets» — [Asset versioning](https://docs.dagster.io/guides/build/assets/asset-versioning-and-caching) |
| Dagster+: откат = редеплой предыдущего образа code location | «Rollback to this version» в history; «changes to code version, tags, metadata, dependencies and partitions definition are tracked» — [code location history](https://docs.dagster.io/dagster-plus/deployment/code-locations/code-location-history) |
| GH Actions: ран берёт файл из SHA события | «Each workflow run will use the version of the workflow that is present in the associated commit SHA or Git ref of the event» — [Workflows](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows) |

## Разбор по пяти вопросам

### Q1-Q2. Единица версии и привязка прогона

Главное наблюдение: **ни один из семи не исполняет «файл из git» напрямую**. Между репозиторием и
прогоном у всех стоит слой материализации, и именно он — единица версии:

| Продукт | Слой материализации | Что попадает в БД оркестратора |
|---|---|---|
| Airflow 3 | сериализованный DAG + версия бандла | `serialized_dag`, `dag_version`, `dag_run.created_dag_version_id` |
| Dagster | образ code location; снапшоты job/asset graph | job/asset snapshots, `code_version`, data versions, run records |
| Prefect | deployment version (иммутабельная запись в API) | deployments, версии, `version_info` (repo/branch/sha), flow runs |
| Argo WF | `status.storedWorkflowSpec` внутри объекта Workflow | сам объект в etcd — спек и состояние вместе |
| Temporal | Event History + Build ID | история событий, маркеры `GetVersion`, versioning behavior |
| Flyte | зарегистрированный иммутабельный артефакт + образ | closure воркфлоу/тасков, executions |
| GH Actions | commit SHA репо | run records с SHA |

Git у них — **транспорт и аудит-трейл для людей**, а не исполняемое хранилище. Prefect говорит это
прямым текстом: git-метаданные «does not affect deployment execution».

### Q3. Что происходит с идущим прогоном при изменении определения

| Продукт | Поведение | Механизм |
|---|---|---|
| Airflow 3, versioned bundle | ран доигрывает на версии старта | commit пинится в `dag_run`, воркер чекаутит его |
| Airflow 3, unversioned bundle | задача берёт код на момент своего старта (риск «полу-старого/полу-нового» рана) | наследие Airflow 2 |
| Argo Workflows | правки шаблона игнорируются идущим раном | вкопированный спек в `status` |
| Flyte | «continues unhindered» | иммутабельная регистрация |
| Prefect | ран идёт на своей версии деплоя | иммутабельные версии |
| Dagster | ран идёт на своём деплое code location | процесс code-server держит версию |
| Temporal | **падает nondeterminism error**, если не применили patching или Pinned | replay истории против нового кода |

Temporal — единственный, кто не может вкопировать определение (определение = произвольный код),
и он платит за это самой болезненной моделью: ручной `GetVersion`/patch на каждое изменение, либо
`Pinned` воркер-деплой. Airflow до 3.0 был в той же яме и вылез именно тем, что **начал пинить
версию в записи прогона**.

### Q4. Откат

| Продукт | Откат |
|---|---|
| Prefect | «Roll back» в UI — сделать live прежнюю иммутабельную версию деплоя; без git revert и CI |
| Dagster+ | «Rollback to this version» — редеплой прежнего образа code location |
| Flyte | запустить/активировать прежнюю `{project,domain,name,version}` — она никуда не делась |
| Argo CD | `argocd app rollback` к прежней синхронизированной ревизии, **но не при включённом автосинке** |
| Airflow 3 | отката из UI нет: откат = git revert + новая версия бандла |
| Temporal | «instant rollback» сменой Current Version воркер-деплоя (только для Pinned-моделей) |
| GH Actions | только git revert |

Закономерность: **быстрый откат есть там, где версии лежат в БД оркестратора как иммутабельные
записи** (Prefect, Dagster+, Flyte, Temporal). Там, где истина только в git (Airflow, GH Actions),
откат — это полный цикл CI, минуты вместо секунд.

### Q5. Что лежит в их БД, раз определение в файлах

Ровно то, что мы и так кладём: прогоны, состояния задач, расписания, xcom/артефакты, логи-указатели,
пулы/квоты, RBAC — **плюс копия или снапшот определения**. Airflow хранит сериализованные DAG'и,
Dagster — снапшоты графа, Argo держит спек внутри объекта рана. То есть даже «file-first» системы
дублируют определение в свою БД, потому что иначе UI, диффы и воспроизводимость не работают.

## Вывод для нас

**Заказчик прав в мотиве и неправ в выводе.** Версионность/диффы/откат действительно не надо
изобретать — но их не изобретают и живые продукты: они берут не git, а **иммутабельную запись
версии в своей БД + FK из прогона**. Git у них сверху, для людей и CI.

У нас это уже построено и совпадает с каноном один-в-один:

| Их механизм | Наш аналог (docs/16-data-model.md, docs/04-ir-schema.md) |
|---|---|
| Flyte: иммутабельная `{project,domain,name,version}` | `app.spec_versions` + `UNIQUE (spec_id, content_hash)`, `UNIQUE (spec_id, version)` |
| Airflow: `dag_run.created_dag_version_id` | `app.runs.spec_version_id uuid NOT NULL REFERENCES app.spec_versions(id)` — **это и есть ответ на главный вопрос среза** |
| Argo: `status.storedWorkflowSpec` | `spec_versions.ir` + `compiled` — вкопированный спек, файл потом можно менять |
| Git SHA как версия | `content_hash` = sha256 RFC 8785 с доменной сепарацией (§4.2) |
| Dagster `code_version` → data version → мемоизация | `behavior_hash` узла = ключ инвалидации replay-кэша и кассет (§4.3) |
| Temporal pinning от недетерминизма | `release_hash` = `{spec_hash, prompt_pins, model_profile_pins, component_lock, env_overlay_hash}` |
| Prefect `version_info` (repo/branch/sha, не влияет на исполнение) | то же место занимает `meta`/`author`/`message` вне `spec_hash` |

**Что берём себе (конкретные правки, не философия)**

1. **Airflow-урок про clear/rerun.** У них два дефолта: UI-clear → последняя версия, API/CLI-clear →
   исходная. Нам нужен явный флаг `run_on_latest_version` (или `pin_spec_version`) в контракте
   ретрая/резюма, а не негласный дефолт. Сейчас в 16-data-model этого различения нет.
2. **Airflow-урок про «структурное изменение».** Новая версия только при изменении структуры —
   иначе история тонет в шуме. У нас это уже есть бесплатно: `UNIQUE (spec_id, content_hash)` +
   `ON CONFLICT DO NOTHING` не плодит версию на идентичный контент. Стоит только дописать, что
   правки `ui`/`meta` (вне `spec_hash`) версию не создают — это ровно их правило.
3. **Prefect-урок про откат.** Их «Roll back» — не revert, а «сделать live прежнюю иммутабельную
   версию». `flow_revert` стоит определить именно так: не патч назад по op-логу, а новая версия
   с содержимым старой (`parent_id` на текущую голову, `content_hash` старый). Тогда откат —
   одна транзакция и идемпотентен, а lineage не ветвится.
4. **Prefect-урок про git-метаданные.** repo/branch/commit — справочное поле, не ключ. Если мы
   добавим git-sync, коммит идёт в `meta`, а идентичность остаётся за `content_hash`.
5. **Argo CD-урок про автосинк vs откат.** «Rollback cannot be performed against an application
   with automated sync enabled». Если когда-нибудь сделаем git-sync спек, автосинк и `flow_revert`
   взаимоисключающи — либо git — истина, либо откат в UI. Это надо записать как ограничение сразу.
6. **Temporal-урок (главный, из-за кассет).** Наш реплей — это их replay: воспроизводимость прогона
   у нас требование (kill-критерий round-trip, §6.4). Значит модель у нас обязана быть **Pinned
   by default**: прогон исполняется тем `spec_version_id`, с которым создан, и никогда не
   «доедет» на новой версии. Auto-upgrade идущих прогонов не вводить вовсе — мы не сможем дать
   patching-механику `GetVersion` на декларативном IR.

**Что не берём**

- **Файлы как источник истины.** Против: (а) прогоны/трассы/кассеты/чекпоинты остаются в БД, и
  FK `runs → spec_versions` через файл не выразить — останется «строка с sha», которую ничто не
  сторожит; (б) op-лог с `base_rev` и транзакционной валидацией инвариантов (ADR-0009) требует
  `SELECT … FOR UPDATE` в той же транзакции, что и запись — git этого не даёт; (в) мультитенантный
  RLS (§7) поверх файловой системы не строится.
- **Git как движок диффа.** У нас семантический дифф по IR (§7: `objectHash` по `id`, `detectMove`,
  детект переименования по `body_hash`). Текстовый дифф YAML это не заменяет — он покажет сдвиг
  строк там, где семантически ничего не изменилось.
- **«Свой git в Postgres» — это не то, что мы пишем.** Из git-набора у нас только линейная история
  версий и `parent_id`. Нет мерджей, нет веток, нет rebase, нет упаковки объектов. Это не git,
  это append-only таблица версий — ровно как у Prefect/Flyte/Dagster.

**Гибрид, который реально применим (и который делают все)**

Git не как хранилище, а как **экспорт-контур**: бандл из 18-export-and-conformance коммитится
в репо (CI-артефакт), и обратно импортируется через round-trip с проверкой `content_hash`. Это даёт
заказчику ровно то, чего он хочет — код-ревью спек в PR, история в git, CI-гейт — не трогая
источник истины. Библиотеки на случай реализации: `isomorphic-git@1.42.2` (MIT, обновлён
2026-09-11), `simple-git@3.36.0` (MIT, 2026-04-12) — обе живы.

UNVERIFIED: точное имя колонки `created_dag_version_id` подтверждено обсуждением и исходником
3.0.0, но на stable-странице core-concepts/dag-versioning.html (404 на момент проверки) не сверено.
UNVERIFIED: формулировка про `status.storedWorkflowSpec` взята из docs/workflow-templates.md и
issue-обсуждения argo-workflows, прямую цитату с readthedocs получить не удалось (ECONNRESET).
