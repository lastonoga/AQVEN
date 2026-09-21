# AQVEN Docs IA — Wave 1 (scaffolding + «Начало» + 2 якорных «Концепции») Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить содержимое `apps/site/src/content/docs/` на новую 7-областную структуру
(`docs/superpowers/specs/2026-09-21-aqven-docs-ia-design.md`), начав с каркаса навигации и полного
первого прохода читателя: точка входа → быстрый старт → сквозной пример Understand/Investigate/Test →
куда дальше, плюс 2 якорные страницы Концепций, на которые ссылаются все последующие волны.

**Architecture:** Astro/Starlight, ручная навигация в `starlight().sidebar` внутри `apps/site/astro.config.mjs`
(не auto-generated). Контент — markdown с YAML-фронтматтером в `apps/site/src/content/docs/<area>/`.
Каждая страница пишется по шаблону из `apps/site/CONVENTIONS.md` (H2/H3 по Diátaxis-типу), факты сверяются
по `docs/research/site-ia-feature-inventory.md`, примеры берутся из реального showcase-проекта
`packages/aqven/src/aqven/templates/showcase/__package__/flows/support_case/`, а не изобретаются.

**Tech Stack:** Astro 7 + `@astrojs/starlight` 0.42.1 + `lucode-starlight`; `pnpm --filter @aqven/site check`
(алиас `astro check`) и `pnpm --filter @aqven/site build` — единственная верификация; `node scripts/generate_llms.mjs --check`
проверяет, что `llms.txt` синхронен с деревом страниц.

---

## Область применения этого плана

Полное дерево страниц (§4 дизайн-документа) — 7 областей, около 50 страниц. Этот план покрывает
**только Wave 1**: каркас (Phase 0) + область «Начало» (4 страницы) + 2 якорные страницы «Концепций»
(«На чём это построено», «Инженерный цикл»). Остальные 5 областей — «Движок», «Studio», «MCP и CLI»,
«Интеграции», оставшиеся 9 страниц «Концепций» — получат отдельные планы тем же способом
(`superpowers:writing-plans` от этого же дизайн-документа), когда придёт их очередь; список страниц
для каждой волны уже зафиксирован в §4 дизайн-документа, ничего не изобретается заново. Раздел
«Справочник» вообще не планируется как задачи написания — он генерируется `tools/generate_reference.py`
и уже корректно помечает 4 CLI-заглушки как `Pending` (`tools/generate_reference.py:474-475`), это
проверено чтением кода, отдельная задача на это не нужна.

Почему именно так разбито, а не одним планом на все ~50 страниц: Wave 1 — единственная часть,
которая производит самостоятельно работающий результат (открываемый, самодостаточный раздел сайта)
и одновременно устанавливает каркас навигации, которым будут пользоваться все следующие волны.
Расписывать оставшиеся ~44 страницы в этом же плане до того, как Wave 1 проверит сам шаблон
на практике, — преждевременная детализация (YAGNI): формулировки шаблона могут потребовать правки
после первой реальной страницы.

---

## Phase 0: Каркас — навигация, генератор, безопасное удаление старого

### Task 0.1: ~~Разобраться с незакоммиченной работой~~ — сделано (commit `48ad74f`)

Незакоммиченные правки в `apps/site/src/content/docs/` (консолидация типов и связанные правки,
14 файлов) закоммичены отдельно от этого плана, до начала Wave 1 — `docs: consolidate type reference
pages into engineering/types.md` (`48ad74f`). Task 0.4 удаляет этот же файл вместе со всем деревом,
теперь это чистое, отслеживаемое в истории удаление, а не потеря незакоммиченной работы. Отдельных
шагов здесь больше нет — переходить сразу к Task 0.2.

### Task 0.2: Переместить вывод генератора справочника на новый путь

**Files:**
- Modify: `tools/generate_reference.py:32`

- [ ] **Шаг 1: Сменить путь вывода**

Было:
```python
DOCS = SITE / "src/content/docs/engineering/reference"
```
Стало:
```python
DOCS = SITE / "src/content/docs/reference"
```

- [ ] **Шаг 2: Перегенерировать и проверить**

Run: `uv run --project . python tools/generate_reference.py`
Expected: файлы появляются под `apps/site/src/content/docs/reference/`, старый
`apps/site/src/content/docs/engineering/reference/` больше не создаётся заново (может остаться на диске
как мусор от старого запуска — удалить вручную, если есть).

- [ ] **Шаг 3: Коммит**

```bash
git add tools/generate_reference.py
git commit -m "docs: move generated reference output to top-level reference/"
```

### Task 0.3: Добавить редиректы со старых путей `engineering/reference/*` на `reference/*`

Старые внешние ссылки (если есть) не должны молча превращаться в 404.

**Files:**
- Modify: `apps/site/astro.config.mjs` (объект `redirects`, начинается на `apps/site/astro.config.mjs:15`)

- [ ] **Шаг 1: Добавить редирект-заглушку для корня справочника**

В объект `redirects` (после существующих `/reference/*` записей, `apps/site/astro.config.mjs:33-37`)
добавить:
```js
"/engineering/reference": "/reference",
```

Остальные конкретные `engineering/reference/<x>` редиректы добавлять по мере того, как реальные
страницы справочника перегенерируются под новым путём (это делает Task 0.2 — Astro сам знает
финальный список файлов, дополнительно перечислять их вручную здесь не нужно, Starlight резолвит
`{slug}` по факту наличия файла).

- [ ] **Шаг 2: Коммит**

```bash
git add apps/site/astro.config.mjs
git commit -m "docs: redirect old engineering/reference paths to reference/"
```

### Task 0.4: Удалить старое содержимое `apps/site/src/content/docs/`

Выполнять только после того, как Task 0.1 закрыт (незакоммиченная работа сохранена или закоммичена).
Старый контент **не адаптируется и не переносится** — это явное решение пользователя из дизайн-документа §2.

**Files:**
- Delete: `apps/site/src/content/docs/engineering/` (весь каталог, кроме уже перемещённого `reference/`,
  который Task 0.2 создаёт заново под `docs/reference/` — старый `engineering/reference/` тоже удаляется)
- Delete: `apps/site/src/content/docs/home/`
- Delete: `apps/site/src/content/docs/studio/`
- Delete: `apps/site/src/content/docs/index.mdx` (уже удалён в незакоммиченном diff — подтвердить, что это
  осталось после решения по Task 0.1, не удалять повторно вручную, если уже удалено)

- [ ] **Шаг 1: Удалить**

```bash
git rm -r apps/site/src/content/docs/engineering apps/site/src/content/docs/home apps/site/src/content/docs/studio
```

- [ ] **Шаг 2: Коммит**

```bash
git commit -m "docs: remove old apps/site content ahead of the new information architecture"
```

### Task 0.5: Заменить sidebar на каркас новых 7 областей

**Files:**
- Modify: `apps/site/astro.config.mjs:64-238` (весь блок `sidebar: [...]`, границы проверить перед правкой —
  файл менялся в Task 0.3)
- Modify: `apps/site/astro.config.mjs:56-60` (блок `lucode({ navLinks: [...] })`)

- [ ] **Шаг 1: Заменить `sidebar`**

`label` — то, что видит читатель в навигации сайта, значит на английском (CONVENTIONS.md).
Заменить весь массив `sidebar` на:
```js
sidebar: [
  {
    label: "Start",
    items: [
      { slug: "start" },
      { slug: "start/quickstart" },
      { slug: "start/engineering-loop-walkthrough" },
      { slug: "start/where-next" },
    ],
  },
  {
    label: "Engine",
    items: [],
  },
  {
    label: "Studio",
    items: [],
  },
  {
    label: "MCP & CLI",
    items: [],
  },
  {
    label: "Integrations",
    items: [],
  },
  {
    label: "Reference",
    autogenerate: { directory: "reference" },
  },
  {
    label: "Concepts",
    items: [
      { slug: "concepts/what-this-is-built-on" },
      { slug: "concepts/engineering-loop" },
    ],
  },
],
```

Пустые `items: []` у «Движок», «Studio», «MCP и CLI», «Интеграции» заполняются их отдельными планами —
не оставлять как «TODO» в коде, пустой массив валиден для Starlight и просто не показывает группу
без страниц (Starlight скрывает группы без `items`, проверить это в Шаге 3).

- [ ] **Шаг 2: Заменить `navLinks`**

Было (`apps/site/astro.config.mjs:56-60`):
```js
navLinks: [
  { label: "Home", link: "/home/overview/" },
  { label: "Engineering", link: "/engineering/" },
  { label: "Studio", link: "/studio/" },
],
```
Стало:
```js
navLinks: [
  { label: "Start", link: "/start/" },
  { label: "Engine", link: "/engine/" },
  { label: "Studio", link: "/studio/" },
  { label: "MCP & CLI", link: "/mcp-cli/" },
],
```

- [ ] **Шаг 3: Проверить, что конфиг валиден до появления самих страниц**

Run: `pnpm --filter @aqven/site check`
Expected: ошибки о **недостающих файлах** для `start/*` и `concepts/*` (страницы ещё не написаны —
это ожидаемо на этом шаге, следующие задачи их создают). Ошибок **синтаксиса конфига** быть не должно.

- [ ] **Шаг 4: Коммит**

```bash
git add apps/site/astro.config.mjs
git commit -m "docs: scaffold the new 7-area sidebar for apps/site"
```

---

## Общая процедура для каждой страницы (Wave 1 и все последующие волны)

Каждая задача ниже — одна страница. Механика одинакова, описана один раз здесь, не повторяется
в каждой задаче. **Опубликованная страница — вся, включая заголовки, `title`/`description` и текст —
на простом английском** (`apps/site/CONVENTIONS.md`, «Язык опубликованной страницы» и «Пишем для
персоны, а не для себя»). Ниже в задачах H1/H2/`title`/`description`/цитаты уже даны в готовом виде
по-английски — переводить не нужно, это финальный текст.

1. Создать файл по указанному пути с фронтматтером:
   ```yaml
   ---
   title: <H1, как дано в задаче>
   description: <одно предложение, как дано в задаче>
   ---
   ```
2. Заполнить страницу по H2/H3-структуре и фактам, перечисленным в задаче. Ссылки на
   `docs/research/site-ia-feature-inventory.md` и `file:line` в задачах — это **источник для проверки
   автором перед тем, как писать**, а не текст, который попадает на страницу: на опубликованной
   странице этих ссылок, ADR-номеров и внутренних имён классов быть не должно (CONVENTIONS.md,
   «Пишем для персоны, а не для себя»). Проверил факт по ссылке — написал его простыми словами
   без цитирования источника.
3. Пример — скопировать и по необходимости адаптировать из указанного в задаче файла showcase-проекта
   (`packages/aqven/src/aqven/templates/showcase/__package__/flows/support_case/`), не сочинять новый YAML/код.
4. Run: `pnpm --filter @aqven/site check` — Expected: без ошибок для этого файла.
5. Commit по шаблону `docs: add <area>/<slug> page` (пример — в каждой задаче).

---

## Phase 1: «Начало»

### Task 1.1: `start/index.md` — Точка входа

**Files:**
- Create: `apps/site/src/content/docs/start/index.md`

- [ ] **Написать страницу**

Фронтматтер (готовый текст, не переводить повторно):
```yaml
title: AQVEN
description: Build AI workflows you can trust — understand, reproduce, and fix them before a bad result reaches a customer.
```

H2-структура и готовый текст:

```
## The pain this solves
```
Готовая формулировка (перевод дословной цитаты из дизайн-документа §1 — держать этот же смысл,
не смягчать):
> A 15-step LLM pipeline gave a bad answer. Today, an engineer spends 30 minutes reading logs to
> find out why. This should take 30 seconds: which step is at fault, what input it got, where that
> input came from, what prompt was built from it, what the model answered, which checks ran, and
> what happens if you change the input or prompt and rerun just that step.

```
## Three ways to work with AQVEN
```
Три блока-ссылки, по одному предложению на каждый, без описания механики (механика — на страницах,
на которые ссылаемся):
- **Writing workflows in code** → `/engine/` (ссылка будет рабочей после Wave 2, пока не создана —
  оставить как обычную markdown-ссылку `[Engine](/engine/)`, Starlight не упадёт на несуществующем
  slug при `astro check`, если это просто текстовая ссылка, а не `sidebar`-запись — это не то же самое,
  что Task 0.5, там `check` обязан найти файл; здесь можно ссылаться вперёд)
- **Working in Studio** → `/studio/`
- **Driving it through an MCP agent** → `/mcp-cli/`

```
## One example for everything
```
Готовый смысл абзаца (сформулировать своими словами, простым английским, факт проверить перед
написанием по `docs/research/site-ia-feature-inventory.md` §1 — ссылка на страницу не попадает):
шаблон `aqven new` (showcase) уже содержит триаж → маршрутизацию → human-approval → параллельные
черновики → panel/vote → сужение типа в одном флоу — большинство примеров в этой документации
построены на нём. Ссылка на `/start/quickstart/`.

- [ ] **Проверить**

Run: `pnpm --filter @aqven/site check`

- [ ] **Коммит**

```bash
git add apps/site/src/content/docs/start/index.md
git commit -m "docs: add start/index page"
```

### Task 1.2: `start/quickstart.md` — Quickstart (tutorial)

**Files:**
- Create: `apps/site/src/content/docs/start/quickstart.md`

- [ ] **Написать страницу**

Фронтматтер:
```yaml
title: Quickstart
description: From an empty folder to your first run, in under 30 minutes.
```

Шаблон tutorial из `apps/site/CONVENTIONS.md`, заголовки — готовый текст:

```
# Quickstart
## What you'll have at the end
## Before you start
## 1. Create a project
## 2. Look at what you got
## 3. Check it without network or tokens
## 4. Run it
## What's next
```

Обязательные факты по разделам (источник для проверки автором — в скобках, на страницу не попадает,
писать простыми словами без цитаты):
- **Before you start** — что нужно установлено: Python (движок пинует `CPython 3.14`, `>=3.14,<3.15`
  — проверить по `docs/DECISIONS.md`), `uv`. Команда установки самого AQVEN — проверить актуальный
  способ (`pip install aqven` / `uv add aqven`) по `packages/aqven/pyproject.toml` перед публикацией,
  не угадывать номер версии.
- **1. Create a project** — команда `aqven new` реализована (проверить: `docs/research/site-ia-feature-inventory.md`
  §3, `cli.py:319`, `console/new.py:248`). Показать реальный вызов и что он спрашивает (шаблон `showcase`).
- **2. Look at what you got** — структура `flows/<id>/flow.yaml` + `nodes/<node_id>.node.yaml`,
  промт не строкой в YAML, а отдельным файлом (проверить: `docs/research/site-ia-feature-inventory.md`
  §7.1, `loader/layout.py:9-26`). Показать реальное дерево каталогов showcase-проекта
  (`packages/aqven/src/aqven/templates/showcase/__package__/flows/support_case/`) — прочитать `ls`
  этого каталога перед написанием, не придумывать список файлов.
- **3. Check it** — `aqven check` реализован, работает без сети и токенов (`cli.py:320`, `cli.py:84-115`).
- **4. Run it** — `aqven run` реализован, прогоняет локально без сервера (`cli.py:328`, `cli.py:219-262`).
  Показать реальный вывод команды (запустить её при написании страницы, не сочинять лог).
- **What's next** — ссылка на `/start/engineering-loop-walkthrough/`.

- [ ] **Проверить**

Run: `pnpm --filter @aqven/site check`

- [ ] **Коммит**

```bash
git add apps/site/src/content/docs/start/quickstart.md
git commit -m "docs: add start/quickstart tutorial"
```

### Task 1.3: `start/engineering-loop-walkthrough.md` — Understand → Investigate → Test (tutorial)

**Files:**
- Create: `apps/site/src/content/docs/start/engineering-loop-walkthrough.md`

- [ ] **Написать страницу**

Фронтматтер:
```yaml
title: From a bad answer to a verified fix
description: One example, three moves — see the graph, find the cause, verify the fix.
```

```
# From a bad answer to a verified fix
## What you'll have at the end
## Before you start
## 1. Understand: the graph in the canvas
## 2. Investigate: find the cause
## 3. Test: verify the fix
## What's next
```

Это визуальное, Studio-продолжение `quickstart` (та же команда `aqven check`/`aqven run` уже отработала
в предыдущей странице). Обязательные факты (источник для проверки — не для страницы):
- **Before you start** — `aqven studio` (алиас `aqven dev`, реализован: `cli.py:329-330`) открывает
  Studio в браузере на том же showcase-проекте.
- **1. Understand** — экран canvas (`apps/studio/src/routes/flows/$flowId/canvas.tsx:1-4`), что на нём видно.
- **2. Investigate** — экран runs/трасса (`apps/studio/src/routes/flows/$flowId/runs.tsx:5-7`); намеренно
  дать плохой вход и найти, какой узел виноват — прямой ответ на шесть пунктов из «The pain this solves»
  в `start/index.md` (тот же факт, не переписывать заново, ссылаться смыслом).
- **3. Test** — экран evals (`apps/studio/src/routes/flows/$flowId/evals.tsx:4`), что значит зелёный
  гейт (`eval_gate`, проверить: `docs/research/site-ia-feature-inventory.md` §2).
- Эта же трёхбитная структура и порядок — из `docs/superpowers/specs/2026-09-20-aqven-landing-page-design.md`
  (строка 21, «Studio proof»), не изобретать новую формулировку.
- **What's next** — ссылка на `/start/where-next/`.

- [ ] **Проверить**

Run: `pnpm --filter @aqven/site check`

- [ ] **Коммит**

```bash
git add apps/site/src/content/docs/start/engineering-loop-walkthrough.md
git commit -m "docs: add start/engineering-loop-walkthrough tutorial"
```

### Task 1.4: `start/where-next.md` — Where to go next

**Files:**
- Create: `apps/site/src/content/docs/start/where-next.md`

- [ ] **Написать страницу**

Фронтматтер:
```yaml
title: Where to go next
description: Four paths, depending on how you work with AQVEN.
```

```
# Where to go next
## Writing workflows in code
## Working in Studio
## Driving it through an agent
## Understanding how it works
```

Каждый раздел — 1-2 предложения + ссылка: `/engine/`, `/studio/`, `/mcp-cli/`,
`/concepts/engineering-loop/` соответственно. Последний раздел также явно ссылается на
`/concepts/what-this-is-built-on/` — «if you're deciding whether to trust this with production load».

- [ ] **Проверить**

Run: `pnpm --filter @aqven/site check`

- [ ] **Коммит**

```bash
git add apps/site/src/content/docs/start/where-next.md
git commit -m "docs: add start/where-next page"
```

---

## Phase 2: Якорные «Концепции»

### Task 2.1: `concepts/what-this-is-built-on.md` — What this is built on

**Files:**
- Create: `apps/site/src/content/docs/concepts/what-this-is-built-on.md`

- [ ] **Написать страницу**

Фронтматтер:
```yaml
title: What this is built on
description: Proven components under one workflow language, not a homegrown runtime.
```

Шаблон concept из `apps/site/CONVENTIONS.md`, заголовки — готовый текст:

```
# What this is built on
## In short
## What AQVEN takes as-is
## What AQVEN adds on top
## How this shapes what you do
## See also
```

Обязательное содержание таблицы «What AQVEN takes as-is» (источник для проверки каждой строки —
`docs/research/site-ia-feature-inventory.md` §6, не по памяти; сами `file:line` на страницу не идут):

| Library | What we take |
|---|---|
| DBOS | Step checkpointing, suspend/resume for `human` nodes, SQLite locally |
| Pydantic AI | Calling the model, structured output |
| `mcp` (the official SDK) | The MCP protocol, both as a server and as a client |
| FastAPI | The HTTP/SSE transport — one process for HTTP, MCP, and Studio |
| python-liquid | Level-2 prompt templates |

Раздел «What AQVEN adds on top» — простыми словами, что это даёт читателю, не имена классов из кода
(проверить факт: цепочка гарантий поверх Pydantic AI, `docs/research/site-ia-feature-inventory.md` §6,
строка «Цепочка гарантий»): каждый вызов модели заканчивается одним из трёх явных исходов, а не
«как получится»; PII в вызове редактируется автоматически; вызовы ограничены по скорости и повторяются
при сбое — единая политика на весь проект, а не решение каждого узла отдельно.

`## How this shapes what you do` — ссылки на `/concepts/engineering-loop/` (что происходит, когда
что-то идёт не так) и на страницы провайдеров/`human`-узла Wave 2/3 (пока не существуют — оставить
как текстовую ссылку вперёд, как в Task 1.1).

- [ ] **Проверить**

Run: `pnpm --filter @aqven/site check`

- [ ] **Коммит**

```bash
git add apps/site/src/content/docs/concepts/what-this-is-built-on.md
git commit -m "docs: add concepts/what-this-is-built-on page"
```

### Task 2.2: `concepts/engineering-loop.md` — The engineering loop

**Files:**
- Create: `apps/site/src/content/docs/concepts/engineering-loop.md`

- [ ] **Написать страницу**

Фронтматтер:
```yaml
title: The engineering loop
description: From an unexpected result to a verified fix — understand, investigate, test the change.
```

```
# The engineering loop: from incident to verified fix
## In short
## Understand: what's going on
## Investigate: where it diverged
## Test: make sure you didn't break anything else
## How this shapes what you do
## See also
```

`## In short` — простыми словами то же, что functional job в дизайн-документе §1 (проверить
формулировку там, перевести смысл, не калькировать буквально): when an AI workflow gives a result
that's unexpected, unsafe, expensive, or inconsistent, this is how you go from "something's wrong" to
a reproduced case, a found cause, a change, and a verified improvement — before it reaches the next
customer.

`## Investigate` — обязательно объясняет (простыми словами, не именами полей из кода), как найти
конкретный узел в графе с параллелизмом и циклами: у каждого шага есть свой адрес — какая ветка,
какая итерация, какой элемент коллекции — не только «какой узел», но и «какой именно проход через
него» (факт для проверки: `runtime/address.py`, `docs/research/site-ia-feature-inventory.md` §7.8).

`## Test` — датасет как воспроизведённый кейс вместо анекдота, зелёный гейт как проверка «не сломали
ли что-то ещё» (факт для проверки: `docs/research/site-ia-feature-inventory.md` §2).

`## How this shapes what you do` — прямые ссылки на `/start/engineering-loop-walkthrough/` (тот же
цикл руками) и вперёд на страницы датасетов/эвалов Wave 2/3.

- [ ] **Проверить**

Run: `pnpm --filter @aqven/site check`

- [ ] **Коммит**

```bash
git add apps/site/src/content/docs/concepts/engineering-loop.md
git commit -m "docs: add concepts/engineering-loop page"
```

---

## Phase 3: Финальная проверка волны

### Task 3.1: Полная сборка и `llms.txt`

**Files:**
- Read only

- [ ] **Шаг 1: Полный check**

Run: `pnpm --filter @aqven/site check`
Expected: 0 ошибок (все `start/*` и `concepts/what-this-is-built-on`, `concepts/engineering-loop`
ссылки из `sidebar` теперь резолвятся; пустые группы «Движок»/«Studio»/«MCP и CLI»/«Интеграции»
не вызывают ошибок).

- [ ] **Шаг 2: Продакшен-сборка**

Run: `pnpm --filter @aqven/site build`
Expected: сборка завершается без ошибок.

- [ ] **Шаг 3: `llms.txt`**

Run: `node apps/site/scripts/generate_llms.mjs --check`
Expected: проходит; если не проходит (файл не синхронен) — запустить без `--check`
(`node apps/site/scripts/generate_llms.mjs`) и закоммитить обновлённый `llms.txt`/`llms-full.txt`.

- [ ] **Шаг 4: Коммит (если Шаг 3 что-то изменил)**

```bash
git add apps/site/public/llms.txt apps/site/public/llms-full.txt
git commit -m "docs: regenerate llms.txt for the new start/concepts pages"
```

---

## Self-Review (проведён при написании плана)

**Покрытие спеки:** Phase 0 закрывает §3 (каркас 7 областей) и часть §2 (генератор справочника,
исключение заглушек — уже в коде, проверено чтением `tools/generate_reference.py:474-475`, не нужно
писать). Phase 1 закрывает все 4 страницы «Начала» из §4. Phase 2 закрывает 2 из 11 страниц
«Концепций» — только якорные, остальные 9 — в планах следующих волн, список уже зафиксирован в §4,
не потерян.

**Плейсхолдеры:** проверено — ни одного «TBD»/«implement later». Единственное место, где план сознательно
не даёт готовый текст, — команда установки AQVEN в Task 1.2 (явно помечено «проверить перед публикацией,
не угадывать номер версии») и структура каталогов showcase (помечено «прочитать `ls`, не придумывать») —
это не пропуск, а явный запрет на выдумывание факта без проверки, соответствует закону проекта
«не изобретать факт, если его можно проверить».

**Согласованность:** slugs в `sidebar` (Task 0.5) совпадают с путями файлов во всех задачах Phase 1–2
(`start/index`, `start/quickstart`, `start/engineering-loop-walkthrough`, `start/where-next`,
`concepts/what-this-is-built-on`, `concepts/engineering-loop`) — сверено построчно.

---

## Дальше

Следующие волны (каждая — свой план через `superpowers:writing-plans` от того же дизайн-документа,
список страниц уже в §4 `docs/superpowers/specs/2026-09-21-aqven-docs-ia-design.md`, не по памяти):

1. **Движок** (`/engine/`) — ~18 how-to-страниц по видам узлов, промтам, форме данных, CLI без Studio.
2. **Studio** (`/studio/`) — 9 страниц по реальным экранам `apps/studio/src/routes/`.
3. **MCP и CLI** (`/mcp-cli/`) — 7 страниц по 22 MCP-тулам, сгруппированным по задаче.
4. **Интеграции** (`/integrations/`) — 3 страницы: провайдеры (10 семейств), внешний MCP-клиент, секреты.
5. Оставшиеся 9 страниц «Концепций».

После каждой волны — тот же Task 3.1 (check/build/llms.txt) и добавление её `slug`-ов в соответствующий
(пока пустой) `items: []` блок `sidebar` из Task 0.5.
