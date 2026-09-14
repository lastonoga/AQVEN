# Срез 3: git как серверное хранилище структурированных данных

> Вопрос среза: если положить спеки воркфлоу в git на сервере — какие библиотеки, какая модель репозиториев, и где git физически ломается?

## 1. Библиотеки для Node (проверено `npm view`, 2026-09-12)

| Пакет | Версия | Лицензия | Последняя публикация | Природа | Годен для сервера? |
|---|---|---|---|---|---|
| `isomorphic-git` | 1.42.2 | MIT | 2026-09-11 | чистый JS, свой парсер packfile | да, живой; см. ограничения |
| `simple-git` | 3.36.0 | MIT | 2026-04-12 | обёртка над `git` CLI (child_process) | да, но требует git в образе |
| `dugite` | 3.2.3 | MIT | 2026-08-11 | обёртка + **свой бандл git** (GitHub Desktop) | да, снимает зависимость от системного git |
| `@napi-rs/simple-git` | 1.1.0 | MIT | 2026-07-07 | Rust `git2` через napi-rs | да, но API узкий (log/blame/status) |
| `nodegit` | 0.27.0 | MIT | 2026-04-23 | нативные биндинги libgit2, C++ | рискованно: 23 МБ, node-gyp, prebuild под каждую ABI |

**isomorphic-git — что умеет / чего нет.** API включает плюмбинг `writeBlob` / `writeTree` /
`writeCommit` / `writeRef` / `updateIndex` — то есть коммит собирается программно без рабочей копии
([API index](https://isomorphic-git.org/docs/en/alphabetic)). Есть `merge`, `fastForward`,
`cherryPick`, `stash`. **Нет** `rebase`, `bisect`, `blame`, сабмодулей. `merge` **не поддерживает
конфликты** и падает, если найдено несколько merge-base, потому что recursive-стратегия не
реализована ([merge docs](https://isomorphic-git.org/docs/en/merge.html),
[#841](https://github.com/isomorphic-git/isomorphic-git/issues/841)).
Производительность: packfile перечитывается и переразбирается на каждой команде, для больших
репозиториев это доминирующая стоимость; лечится общим объектом `cache`, передаваемым между
вызовами ([cache docs](https://isomorphic-git.org/docs/en/cache),
[#291](https://github.com/isomorphic-git/isomorphic-git/issues/291)).

**Вывод по библиотекам.** Если git берём — берём `isomorphic-git` для записи (blob→tree→commit
в bare-репозиторий, merge нам не нужен: мы всегда делаем fast-forward CAS) плюс `dugite`/CLI для
редких тяжёлых операций (`gc`, `repack`, `log -- path`). `nodegit` не брать: нативная сборка
в Docker/CI — постоянный налог при нулевой выгоде для нашего профиля нагрузки.

## 2. Модель репозиториев

| Вариант | Плюс | Где ломается |
|---|---|---|
| Репо на воркфлоу | изоляция записи, дешёвый `git log` (вся история = история одного файла) | тысячи bare-репо на тенанта → тысячи каталогов, inode, отдельный `gc` на каждый; нет атомарности между воркфлоу (см. §3) |
| Репо на проект | естественная единица прав и экспорта; `git log -- flows/x.yaml` работает | все агенты проекта пишут в один `refs/heads/main` → contention (§3) |
| Монорепо на тенанта | один `gc`, один бэкап | линейный рост стоимости обхода истории; один hot ref на весь тенант |

Что известно точно про пределы:

| Факт | Число | Источник |
|---|---|---|
| Лукап одного рефа в `packed-refs` — линейный скан файла | android, 866k рефов: **409 660 мкс** холодный лукап против **33.9 мкс** на reftable | [git reftable](https://git-scm.com/docs/reftable) |
| Атомарный апдейт N рефов на `packed-refs` = переписать весь файл | 62 МБ in / 62 МБ out ради изменения 2 рефов | там же |
| Рефлог на 149 932 записи для 43 061 рефов | `logs/` — **173 МБ** (1209 б/запись), reftable — **5 МБ** (37 б/запись) | там же |
| Лишние packfile блокируют оптимизации | reachability bitmaps совместимы **только с одним packfile**; много tips рефов отключает часть оптимизаций | [GitHub Blog: scaling monorepo maintenance](https://github.blog/open-source/git/scaling-monorepo-maintenance/) |
| Обход истории по пути линеен по длине истории | `commit-graph` ускоряет обход коммитов, `multi-pack-index` — лукап объектов; Scalar включает их плюс partial clone и фоновый maintenance | [microsoft/Scalar](https://github.com/microsoft/Scalar) |

Практический вывод: «репо на воркфлоу» выглядит соблазнительно и разбивает contention, но платим
inode-ами, отдельным обслуживанием каждого репо и потерей кросс-воркфлоу атомарности. При выборе
git единственный вменяемый вариант — **репо на проект с `--ref-format=reftable`** (Git ≥ 2.45)
и одной веткой на воркфлоу вместо одной общей.

## 3. Что git делает плохо (это и есть ответ)

| Ограничение | Как проявляется у нас | Факт/ссылка |
|---|---|---|
| **Lock contention на ref** | два агента патчат разные воркфлоу в одном проекте → `cannot lock ref`, ретрай на уровне приложения | в высоконагруженных репо Gitaly фиксирует регулярные отказы из-за contention на `packed-refs.lock`, каждое удаление рефа переписывает файл; жёсткий лимит конкурентности назвали «большим узким местом» ([gitaly!5916](https://gitlab.com/gitlab-org/gitaly/-/merge_requests/5916), [gitaly#3305](https://gitlab.com/gitlab-org/gitaly/-/issues/3305)) |
| **Нет транзакций между репозиториями** | «репо на воркфлоу» ⇒ релиз, затрагивающий 3 воркфлоу, не атомарен | `git update-ref --stdin` атомарен только внутри одного репо: «If all refs can be locked with matching old-oids simultaneously, all modifications are performed. Otherwise, no modifications are performed» ([git-update-ref](https://git-scm.com/docs/git-update-ref)) |
| **Нет запросов** | «найди все воркфлоу, где используется тип X» — в git это перебор ревизий | GitHub не смог обслуживать поиск по коду средствами git/grep: 115 ТБ, ripgrep дал бы 0.6 ГБ/с/ядро ⇒ 2048 ядер × 96 с на **один** запрос; построили отдельный индекс Blackbird — 640 q/s против 0.01 q/s ([GitHub Blog](https://github.blog/engineering/architecture-optimization/the-technology-behind-githubs-new-code-search/)) |
| **Чтение произвольной версии** | `cat-file` по дереву + разворачивание delta-цепочки; против одного индекс-лукапа по `content_hash` в Postgres | [Git's database internals I](https://github.blog/open-source/git/gits-database-internals-i-packed-object-store/) |
| **Рост от частых мелких коммитов агента** | каждый коммит пишет новое дерево для каждого каталога на пути + loose-объекты до `gc` | Flux image-automation ровно на этом обжёгся: контроллер плодит коммиты «туда-обратно» между тегами, что даёт ненужный рост репо; в 0.32 добавили OCIRepository как альтернативу «пушить обратно в git» ([image-automation#482](https://github.com/fluxcd/image-automation-controller/issues/482), [Flux docs](https://fluxcd.io/flux/components/image/imageupdateautomations/)) |
| **Конкурентная запись в одну ветку** | несколько автоматов на одну ветку = отказ пуша и force-push как «решение» | «If multiple ImageUpdateAutomation resources try to update the same branch simultaneously… the automation may fail to push»; отключённый force push оставляет залипшую ветку ([Flux docs](https://fluxcd.io/flux/components/image/imageupdateautomations/)) |
| **Большие бинарники** | трассы, чекпоинты, кассеты — в git нельзя; нужен LFS/OCI/S3 | подтверждено практикой Flux (уход в OCI) и самой моделью packfile |

## 4. Запись в bare-репозиторий без рабочей копии

Технически это решённая задача, рабочая копия не нужна ни в одном из двух путей:

| Шаг | CLI-плюмбинг (bare, без worktree) | isomorphic-git |
|---|---|---|
| blob | `git hash-object -w --stdin` | `writeBlob` |
| дерево | `GIT_INDEX_FILE=$tmp git read-tree <base>` + `update-index --add --cacheinfo` + `write-tree` | `writeTree` |
| коммит | `git commit-tree <tree> -p <parent> -m …` | `writeCommit` |
| ref | `git update-ref <ref> <new> <old>` | `writeRef` |

**Compare-and-swap на ref есть в самом git и это документированная семантика:**
«stores the `<new-oid>` in the `<ref>` … after verifying that the current value of the `<ref>`
matches `<old-oid>`»; `40 "0"` или пустая строка как `<old-oid>` = «ref не должен существовать».
Транзакция на несколько рефов — `update-ref --stdin` с `start` / `prepare` / `commit` / `abort`:
«If all `<ref>`s can be locked with matching `<old-oid>`s simultaneously, all modifications are
performed. Otherwise, no modifications are performed.» Важная оговорка оттуда же: «a concurrent
reader may still see a subset of the modifications» — то есть изолированности чтения нет
([git-update-ref](https://git-scm.com/docs/git-update-ref)).

Читать это надо так: git даёт ровно тот же примитив, что у нас уже стоит в `op_log` —
`UPDATE app.specs SET rev = rev + 1 WHERE rev = $expected` (16-data-model.md §«CAS по `specs.rev`»).
Только в Postgres CAS живёт внутри транзакции вместе с валидацией инвариантов и записью
`spec_versions`, а в git — сам по себе, и «проверить инварианты и отклонить» вокруг него надо
строить руками.

## 5. Хостинг: свой bare против GitHub/GitLab

| | Свой bare на диске | GitHub/GitLab как хранилище |
|---|---|---|
| Лимиты | свои | 5 000 запросов/час на пользователя; 5 000 (15 000 на GHEC) на installation GitHub App |
| Запись | ограничена диском | «no more than **80 content-generating requests per minute** and no more than **500 … per hour**»; ≤100 конкурентных; 900 points/min |
| Размер | свой | файл >50 MiB — предупреждение, **>100 MiB блокируется**; репо «ideally less than 1 GB, and less than 5 GB is strongly recommended» |
| Обслуживание | `gc`/`repack`/бэкап/реплика на нас | на них |

Источники: [rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api),
[large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).

**Арифметика по «50 коммитов в минуту от агента».** Один коммит через Git Data API — минимум
4 content-generating запроса (blob → tree → commit → update ref). 50 коммитов/мин = 200 запросов/мин
против лимита 80/мин, и упор в 500/час = **не больше ~125 коммитов в час**. GitHub как хранилище
записи агента отпадает арифметически, без обсуждения. Через SSH-пуш лимит другой, но тогда теряется
весь смысл «взять готовое API», и остаётся contention на ref из §3.

Свой bare на диске снимает rate limit, но переносит проблему: git-локи опираются на `O_EXCL`
локального ФС, поэтому шардирование записи между несколькими инстансами приложения требует либо
единственного писателя на репозиторий, либо внешнего распределённого лока — то есть всё равно
Postgres или Redis рядом. UNVERIFIED: конкретных бенчмарков «bare-репо на сетевой ФС под
многоинстансной записью» я не нашёл, но GitLab решает это ровно так — Gitaly Cluster с Postgres
как metadata store «to ensure atomicity of repository creation, deletion, and move operations»
([Gitaly docs](https://docs.gitlab.com/administration/gitaly/)).

## 6. Гибриды «git — истина, БД — индекс»: это индустриальный стандарт

| Продукт | Схема | Ссылка |
|---|---|---|
| Backstage Software Catalog | «the source of truth … are metadata YAML files stored in source control»; processing engine делает ingestion → validation → stitching в Postgres, **все запросы и фильтры идут по БД**, не по git | [catalog docs](https://backstage.io/docs/features/software-catalog/) |
| Gitea | репозитории — git на диске, метаданные — реляционная БД, **отдельный** repo indexer (bleve/elasticsearch) для поиска по коду | [repo-indexer](https://docs.gitea.com/administration/repo-indexer/) |
| GitLab Gitaly Cluster | git — хранилище содержимого, Postgres — metadata store для атомарности операций над репозиториями | [Gitaly](https://docs.gitlab.com/administration/gitaly/) |
| GitHub code search | индекс шардирован по **git blob OID** и живёт вне git; git сам по себе запрос не обслуживает | [Blackbird](https://github.blog/engineering/architecture-optimization/the-technology-behind-githubs-new-code-search/) |
| Flux CD | ушли от «пушить обратно в git» к OCI-артефактам именно из-за шума и роста репо | [Flux docs](https://fluxcd.io/flux/components/image/imageupdateautomations/) |

Обратите внимание на форму: **никто не запрашивает git**. Git держит байты и историю, а всё,
что надо искать, фильтровать и джойнить, дублируется в БД или в отдельный индекс. То есть «git как
хранилище» в реальных продуктах всегда означает «git + БД», а не «git вместо БД».

## Вывод для нас

**Берём (и это дёшево):**

1. **Экспортный бандл, распакованный в git, — уже в плане** (18-export-and-conformance.md §«В git
   бандл кладётся распакованным»). Имена файлов детерминированы (`flows/<flowId>@<specVersion>.yaml`),
   значит диффы в GitHub читаемы без нашего участия. Это даёт заказчику ровно то, ради чего он
   предлагает git: версионность глазами, PR-ревью, откат «как у всех». Направление — БД → git,
   одностороннее зеркало, не источник.
2. **Паттерн CAS на ref подтверждает то, что у нас уже стоит**: `update-ref <new> <old>` — тот же
   compare-and-swap, что `UPDATE specs SET rev = rev + 1 WHERE rev = $expected` (16-data-model.md).
   Мы не изобретали велосипед, мы взяли тот же примитив с транзакцией вокруг него.
3. **Если git когда-нибудь станет хранилищем — только `--ref-format=reftable`** (Git ≥ 2.45) и
   `isomorphic-git` на записи; `nodegit` не брать никогда.

**Не берём, с причинами:**

| Что предлагается | Почему нет |
|---|---|
| git как источник истины спеки | Наш `spec_hash`/`behavior_hash`/`body_hash` (04-ir-schema.md §«Хеши») — это уже content-addressing. Git дал бы вторую, чужую систему хеширования поверх нашей, но не заменил бы её: `behavior_hash` — ключ инвалидации replay-кэша, он считается по телу узла с пинами, а не по файлу. |
| git merge вместо op-log | ADR-0009 отклоняет CRDT потому, что «сходимость ≠ валидность»: агент удалил `parse_pdf`, человек привязался к его выходу — реплики сошлись, граф мёртв. Трёхстороннее слияние YAML даёт **ровно тот же** дефект и той же природы: у git нет точки, где инвариант DAG/типов можно проверить и **отклонить** запись. Op-log не «свой git», он — транзакционная валидация, которой в git нет по устройству. |
| git вместо `spec_versions` + GIN | «Найди все воркфлоу, где используется тип X» в Postgres — `@>` по `spec_versions_ir_gin` (`jsonb_path_ops`). В git это перебор ревизий; GitHub на этой же задаче построил отдельный индекс, потому что grep даёт 0.01 q/s против 640 q/s. |
| git как транспорт записи агента | 50 коммитов/мин против лимита 80 content-generating req/min и 500/час у GitHub API = потолок ~125 коммитов/час. На своём bare — упор в lock contention на ref (Gitaly фиксирует это как хронический класс отказов) плюс рост репо от мелких коммитов (кейс Flux). |
| прогоны, трассы, чекпоинты, кассеты | даже не обсуждается: файл >100 MiB блокируется, репо рекомендовано <1 ГБ. |

**Где проходит граница (ответ на исходный вопрос).** Не «git или БД», а: **Postgres — источник
истины и единственное место записи; git — производный, read-only артефакт экспорта.** Ровно та же
граница, что у Backstage, Gitea, Gitaly и GitHub Search, только у них git снаружи, потому что
редактируют люди в IDE, а у нас редактирует агент через `flow_patch` с валидацией инвариантов —
и поэтому стрелка разворачивается. Заказчик прав в мотиве (диффы и откат должны быть готовыми,
а не самописными), но готовыми их делает не git-хранилище, а git-**экспорт** при уже существующей
детерминированной сериализации. Стоимость этого шага — генератор бандла, который и так в плане,
плюс `git push` зеркала; стоимость обратного варианта — переписать op-log, валидацию, запросы
и lineage на инфраструктуру, которая ни одного из этих четырёх пунктов не умеет.
