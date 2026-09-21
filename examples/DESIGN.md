# Showcase: пример Lumen

> Статус: проект, 2026-09-17
> Закон: решения владельца от 2026-09-17 (O1–O22, §1), [DECISIONS.md](../../../docs/DECISIONS.md),
> [ADR-0006](../../../docs/adr/0006-dynamic-allowed-sets.md), [ADR-0025](../../../docs/adr/0025-python-engine.md)–[ADR-0029](../../../docs/adr/0029-trust-and-quality-python.md),
> [23. API студии](../../../docs/23-studio-api.md). Семантика комбинаторов, циклов и судей — [03](../../../docs/03-core-language.md), [04](../../../docs/04-ir-schema.md).
> Решения владельца и ADR сильнее этого документа и [06](../../../docs/06-registries.md).

Пометка **«предложение — нет в ADR»** стоит у конструкции, которую не фиксируют ни ADR, ни решения O1–O22. Её принимает
владелец (и тогда пишется ADR) или она меняется.

## 1. Решения владельца от 2026-09-17

| # | Решение | Как отражено здесь |
|---|---|---|
| O1 | Один пример на все паттерны и режимы исполнения; переиспользуемые части — часть примера | воркфлоу `support_case` и вызываемый им воркфлоу `judge_panel` (§4–§5) |
| O2 | Узел `llm` ссылается на агента; модель и её настройки есть только у агента (`provider:model`) | `agents/<id>.yaml`, `agents/resolver/resolver.yaml`, §6.2 |
| O3 | Агенты, тулы и MCP-серверы — файлы реестров модуля; узлы тулы не настраивают; `aqven.yaml` — проект и провайдеры; возможности моделей — встроенная таблица профилей | §6.1–§6.4 |
| O4 | Лимиты и бюджеты необязательны везде; нет ключа — нет лимита | ключ `limits` у проекта, воркфлоу, узла, агента; в примере — только у агента `resolver` |
| O5 | Пост-проверки инференса: встроенные и свои, `on_fail: retry \| fail \| flag`; движок — `output_validator` + `ModelRetry` | §6.5 |
| O6 | Выход всегда структурированный JSON; текстового режима нет | `E_TEXT_OUTPUT`, §9.4 |
| O7 | Промт живёт в инференсе, узел говорит только `agent` + привязки входов (и `inference`, если инференс общий) | §6.5, §7 |
| O8 | Промт уровня 1 или 2 — `<инференс>.prompt.md` рядом с `<инференс>.inference.yaml`, подхватывается по соглашению (уточнено O18, имена файлов — O22) | §3, §6.5 |
| O9 | Место выбора алгоритма — политика: ровно одно из `use: <встроенная>` и `run: модуль:функция`, параметры в `with`; встроенные и свои взаимозаменяемы | §6.6: `join`, `stop`, `select`, `on_item_error`, оценщики; свои — `flows/judge_panel/nodes/judges/judges.py`, `flows/support_case/nodes/record/record.py` |
| O10 | Варианты промта объявляются в `<инференс>.inference.yaml` (`variants`: `on`, `cases`, `default`), файлы — `<инференс>.variants/<слот>/<вариант>.md`, промт выводит `{{ variants.<слот> }}` | слот `lamp_guide` у `revise` по `product.lamp_kind`, §6.5 |
| O11 | Виды узлов раздельны; проверка инференса и скорер eval — один оценщик; у `loop` нет блока итерации; поля управляющих узлов единые: `body`, `in`, `out` и политики | §4, §6.6, §10 |
| O12 | Слоя кэша нет: нет `determinism`, `ttl_ms`, `ttl_seconds`; нет хука `prepare` у узлов; `effect` остаётся | узлы `code`, `tool` и тулы без этих ключей, §4, §6.3 |
| O13 | Сущности Connection нет: коннекторы к данным — шаги `code` и тулы | `tools/functions.py` |
| O14 | Загрузчик ищет `*.yaml` с `apiVersion: aqven/v1` рекурсивно и разбирает по `kind`; id — имя файла до первой точки, у `flow.yaml` — имя папки (уточнено O22) | §3 |
| O15 | Узел `llm` с `<узел>.inference.yaml` рядом берёт его без ключа `inference`; `inference: <id>` — только для общего инференса | `triage`, `vote__ballot`, `record__extract`, `route__resolve`, `polish__revise`, `polish__critique`, `illustrate`, `decide__tie_break`, §3 |
| O16 | Единица раскладки — шаг; место сущности — наименьший общий предок её пользователей | уточнено O22: у вида одно место, папка узла — у узла верхнего уровня, §3 |
| O17 | Несколько воркфлоу; проектные папки `agents/`, `tools/`, `mcp/`; отдельного вида «компонент» нет — переиспользуемый подграф — воркфлоу, его вызывает узел `call` | `flows/judge_panel/` — второй воркфлоу, узел `panel` — `call` с `flow: judge_panel` (§5) |
| O18 | Любое место — выбор пользователя, стандарт раскладки — O22; соглашение с явным переопределением: `prompt` — путь к `.md` где угодно или `модуль:функция`, вариант — id или путь к `.md` | явного пути к промту в примере нет, единственный ключ `prompt` — функция `illustrate_prompt`; `W_PROMPT_SHADOWED` проверяет `tests/test_check.py`, §3 |
| O19 | Раскладка по ролям. Типы — только YAML, модели Pydantic генерирует `aqven generate` в `types.py` корня модуля; место каждого вида — O22 | §3, §9 |
| O20 | Короткие ссылки на код: `<функция>` из `<id>.py` рядом с объявляющим файлом, `@here.`, `@flow.`, `@<flow_id>.`, `@root.`, полный путь; в IR — только абсолютный путь | §3 |
| O21 | Подпапки по виду при большом числе файлов | `types/enums/`, `ids/`, `records/`, `unions/`, `values/` (O22), §3, §8 |
| O22 | Стандартная раскладка, окончательная на сейчас: у вида одно место. Корень — `aqven.yaml`, `agents/<агент>.yaml` (агент с сопутствующими файлами — папка `agents/<агент>/`: `<агент>.yaml`, `<агент>.instructions.md`, инференсы его субагентов), `tools/<тул>.yaml` и `tools/functions.py` (ссылка `@root.tools.functions:<функция>`), `mcp/<сервер>.yaml`, `types/{ids,enums,records,unions,values}/<тип>.yaml`, `fragments/<фрагмент>.md`, `code/<модуль>.py` (Python нескольких мест), `evals/<воркфлоу>/`, `flows/<воркфлоу>/flow.yaml`. У каждого узла верхнего уровня — папка `nodes/<узел>/` с `<узел>.node.yaml` и его `.inference.yaml`, `.prompt.md`, `.variants/`, `.py`; все потомки узла на любой глубине — плоско в той же папке по тому же правилу префикса, вложенных папок нет. `types.py` корня модуля (рядом с папкой `types/` без `__init__.py`, импорт — `lumen.types`) — модели всех типов и входов-выходов каждого инференса (`<Инференс>In`, `<Инференс>Out`), тула с `run` (`<Тул>In`, `<Тул>Out`) и шага `code` (`<Воркфлоу><Узел>In`, `<Воркфлоу><Узел>Out`), рукописных копий нет. Id — имя файла до первой точки; голое имя в `run` — `<id>.py` рядом с объявляющим файлом, загрузка по пути файла | §3, §8, §9 |

## 2. Сценарий

**Lumen** — бренд умного освещения. Покупатель пишет в поддержку с витрины или маркетплейса и прикладывает фото, голосовое,
видео дефекта и счёт. У товара есть вид лампы (`LampKind`: сетевая, аккумуляторная, умная Wi-Fi, умная Zigbee) — от него
зависят советы в ответе. Воркфлоу `support_case` разбирает обращение и вложения, голосованием с каскадом определяет намерение,
заполняет анкету обращения из формы категории с проверкой и ремонтом, маршрутизирует (агент с тулами решает гарантийный
случай), пишет ответ по базе знаний тремя семействами моделей с советами по виду лампы, отдаёт кандидатов воркфлоу панели судей `judge_panel`, полирует победителя циклом
критики, генерирует картинку-инструкцию, голосовое и короткий ролик и ждёт параллельного согласования руководителя поддержки и
бренд-редактора.

```
prepare → triage → vote(map) → tally → intent(switch: cascade) → case_form → record(loop) → to_record(narrow)
→ search_kb → route(switch: router, agent) → drafts(parallel) → panel(call judge_panel) → polish(loop)
→ illustrate → voice → clip(wait) → approvals(parallel humans) → finalize
```

## 3. Раскладка

Корень проекта aqven — `lumen/` (пакет `lumen`) в корне проекта. Пути ниже — от него, кроме хоста.

Загрузчик рекурсивно находит все `*.yaml` с `apiVersion: aqven/v1` и разбирает их по `kind`; фиксирован только `aqven.yaml`
в корне (O14). **Id сущности — имя файла до первой точки:** `intent.node.yaml` — узел `intent`, `revise.inference.yaml` —
инференс `revise`, `reply_quality.yaml` — eval `reply_quality`, `resolver.yaml` — агент `resolver`. Исключение одно —
`flow.yaml` (и билдер `flow.py`): id воркфлоу — имя его папки. Суффиксы `.node.yaml` и `.inference.yaml` — соглашение O22: вид
всё равно берётся из `kind`, а суффикс, противоречащий `kind`, — `E_KIND_PATH_MISMATCH`. Id уникален среди сущностей одного
вида (дубликат — `E_ID_DUPLICATE` с обоими путями). Узел принадлежит воркфлоу, чей `flow.yaml` лежит в ближайшей папке выше;
папки узлов на id не влияют — развёрнутый id (`route__resolve`) строится по `body` и `cases` родителя.

**Стандартная раскладка: у вида одно место (O22).** Папка вида есть ровно на одном уровне: `types/`, `fragments/`, `code/` и
`evals/` — только в корне модуля, у воркфлоу и узлов их нет. Сопутствующие файлы сущности лежат рядом с её файлом под тем же
префиксом: `<id>.instructions.md`, `<id>.inference.yaml`, `<id>.prompt.md`, `<id>.variants/`, `<id>.py`. Агент без
сопутствующих файлов — один файл `agents/<агент>.yaml`; агент с ними — папка `agents/<агент>/`. У каждого узла верхнего уровня
воркфлоу своя папка `nodes/<узел>/`; все его потомки (`body` у `parallel`, `map`, `loop`, `cases` у `switch`) на любой глубине
лежат в этой же папке плоско по тому же правилу префикса, вложенных папок узлов нет.

| Вид | Место | В примере |
|---|---|---|
| проект | `aqven.yaml` | провайдеры и политики данных |
| агент | `agents/<агент>.yaml` | девять агентов одним файлом |
| агент с сопутствующими файлами | `agents/<агент>/<агент>.yaml`, `<агент>.instructions.md`, инференсы его субагентов: `<инференс>.inference.yaml`, `<инференс>.prompt.md`, `<инференс>.variants/` | `agents/resolver/`: инструкции и инференс субагента `research_policy` |
| тулы | `tools/<тул>.yaml`, функции тулов — `tools/functions.py`, ссылка `@root.tools.functions:<функция>` | шесть тулов |
| MCP-серверы | `mcp/<сервер>.yaml` | `helpdesk` |
| типы | `types/`, подпапки по виду типа: `enums/`, `ids/`, `records/`, `unions/`, `values/` (ограниченные скаляры) | все 49 типов обоих воркфлоу и тулов |
| общие фрагменты промтов | `fragments/<фрагмент>.md` | `untrusted_input`, `safety_escalation`, `citation_rules`, `brand_voice`, `judge_protocol` |
| Python нескольких мест | `code/<модуль>.py` — несколько узлов, узел и eval, несколько воркфлоу | `code/support_case.py`: оценщик `promises_match_resolution` — проверка инференса `revise` и скорер eval `reply_quality` |
| датасеты и evals воркфлоу | `evals/<воркфлоу>/` | `evals/support_case/reply_cases.yaml`, `reply_quality.yaml` |
| воркфлоу | `flows/<воркфлоу>/flow.yaml` | `support_case`, `judge_panel` |
| узел верхнего уровня | `flows/<воркфлоу>/nodes/<узел>/<узел>.node.yaml` | `nodes/route/route.node.yaml` |
| потомок узла на любой глубине | плоско в папке узла верхнего уровня: `nodes/<узел>/<потомок>.node.yaml` | `nodes/route/resolve.node.yaml`, `nodes/polish/revise.node.yaml` |
| инференс узла `llm` | рядом с узлом, тот же префикс: `<узел>.inference.yaml`, `<узел>.prompt.md`, `<узел>.variants/<слот>/<вариант>.md` | `nodes/triage/triage.*`, `nodes/polish/revise.*` |
| код узла | `<узел>.py` рядом с узлом — его шаг, свои проверки его инференса, свои политики, промт уровня 3 | `nodes/prepare/prepare.py`, `nodes/judges/judges.py`, `nodes/polish/critique.py`, `nodes/illustrate/illustrate.py` |
| сгенерированное | `types.py` корня модуля — модели всех типов и входов-выходов каждого инференса, тула и шага `code` | `aqven generate`, в `.gitignore` |

**Общий инференс.** Инференс лежит рядом с узлом-владельцем под его именем, и его id — id этого узла. Другие узлы и evals
ссылаются на него `inference: <id>`. Владелец — первый по порядку воркфлоу узел-пользователь, чей id не совпадает с id агента:

| Инференс | Файл | Кто ссылается `inference: <id>` |
|---|---|---|
| `ballot` | `flows/support_case/nodes/vote/ballot.inference.yaml` | `intent__escalate` |
| `revise` | `flows/support_case/nodes/polish/revise.inference.yaml` | `drafts__gpt`, `drafts__mistral`, `drafts__gemini`, eval `reply_quality` |
| `critique` | `flows/support_case/nodes/polish/critique.inference.yaml` | скорер `critique` eval `reply_quality` |
| `tie_break` | `flows/judge_panel/nodes/decide/tie_break.inference.yaml` | `judges__deepseek`, `judges__qwen`, `judges__llama`, `decide__tie_break` |

**Инференс субагента.** Инференс `research_policy` не принадлежит ни одному узлу: его вызывает субагент агента `resolver`. Поэтому
он лежит в папке этого агента под своим именем: `agents/resolver/research_policy.inference.yaml` и
`agents/resolver/research_policy.prompt.md`. Узла `research_policy` нет, и инференс ни к какому узлу не прикрепляется.

```
aqven.yaml                                         kind Project
types.py                                           модели Pydantic всех типов и входов-выходов инференсов, тулов и шагов code: aqven generate, в .gitignore
agents/
  <agent>.yaml                                     kind Agent, восемь файлов: deepseek, gemini, gpt, llama, mistral, painter, qwen, researcher
  resolver/
    resolver.yaml                                  kind Agent: тулы, MCP-тул, субагент, одобрение, limits
    resolver.instructions.md                       инструкции агента (уровень 1)
    research_policy.inference.yaml, .prompt.md     инференс субагента research_policy
tools/<tool>.yaml, functions.py                    kind Tool и функции тулов
mcp/helpdesk.yaml                                  kind McpServer
types/
  enums/                                           17 перечислений
  ids/                                             6 идентификаторов
  records/                                         23 записи
  unions/                                          CaseOrigin, CaseRecord
  values/                                          Score
fragments/                                         untrusted_input, safety_escalation, citation_rules, brand_voice, judge_protocol
code/support_case.py                               promises_match_resolution: проверка revise и скорер eval reply_quality
evals/support_case/                                reply_cases.yaml — kind Dataset, reply_quality.yaml — kind Eval инференса revise
flows/
  support_case/                                    воркфлоу обращения
    flow.yaml                                      kind Flow: вход, выход, порядок узлов
    nodes/
      prepare/prepare.node.yaml, prepare.py        шаг code, run: "prepare"
      triage/triage.node.yaml, .inference.yaml, .prompt.md  шаг llm со своим инференсом: ключа inference нет (O15)
      vote/vote.node.yaml                          map
      vote/ballot.node.yaml, .inference.yaml, .prompt.md  инференс ballot
      tally/tally.node.yaml, tally.py
      intent/intent.node.yaml                      switch
      intent/escalate.node.yaml                    inference: "ballot"
      case_form/case_form.node.yaml, case_form.py
      record/record.node.yaml, record.py           цикл, своя политика остановки
      record/extract.node.yaml, .inference.yaml, .prompt.md
      record/validate.node.yaml, validate.py
      to_record/to_record.node.yaml                narrow
      search_kb/search_kb.node.yaml                tool
      route/route.node.yaml                        switch
      route/resolve.node.yaml, .inference.yaml, .prompt.md
      drafts/drafts.node.yaml                      parallel
      drafts/gpt.node.yaml, mistral.node.yaml, gemini.node.yaml  inference: "revise"
      panel/panel.node.yaml                        call judge_panel
      polish/polish.node.yaml                      loop
      polish/revise.node.yaml, .inference.yaml, .prompt.md, .variants/lamp_guide/
      polish/critique.node.yaml, .inference.yaml, .prompt.md, .py
      illustrate/illustrate.node.yaml, .inference.yaml, .py  промт уровня 3 — функция в illustrate.py
      voice/voice.node.yaml, clip/clip.node.yaml   tool
      approvals/approvals.node.yaml                parallel
      approvals/lead.node.yaml, brand.node.yaml    human
      finalize/finalize.node.yaml, finalize.py
  judge_panel/                                     воркфлоу панели судей, его вызывает узел support_case/panel
    flow.yaml                                      вход PanelRequest, выход PanelOutcome, контракт requires
    nodes/
      judges/judges.node.yaml, judges.py           parallel, своя политика join
      judges/deepseek.node.yaml, qwen.node.yaml, llama.node.yaml  inference: "tie_break"
      aggregate/aggregate.node.yaml, aggregate.py
      decide/decide.node.yaml                      switch
      decide/tie_break.node.yaml, .inference.yaml, .prompt.md  инференс tie_break
      pick/pick.node.yaml, pick.py
```

Короткая запись `triage/triage.node.yaml, .inference.yaml` в дереве означает файлы `triage/triage.node.yaml` и
`triage/triage.inference.yaml`. Сущности по видам с путями файлов выводит `aqven tree` (вывод — в [README.md](README.md)).

Соглашения (O15, O20):

- **Инференс узла.** `<узел>.inference.yaml` рядом с `<узел>.node.yaml` — инференс этого узла, ключа `inference` нет. Ключ
  `inference: <id>` ссылается на инференс с другим именем и нужен, только когда инференс переиспользуется. Оба сразу —
  `E_SOURCE_CONFLICT`.
- **Промт.** Нет ключа `prompt` — берётся `<инференс>.prompt.md` рядом с `<инференс>.inference.yaml`. Явный `prompt` — путь к
  `.md` (от папки инференса, `@flow/` — от папки воркфлоу, `@root/` — от корня модуля) или ссылка на функцию (уровень 3). Ни
  то, ни другое не разрешилось — `E_PROMPT_MISSING`; явный путь при своём `<инференс>.prompt.md` рядом — `W_PROMPT_SHADOWED`.
  Явного пути к промту в примере нет: у каждого инференса с шаблоном свой `.prompt.md` рядом, единственный ключ `prompt` —
  функция `illustrate_prompt`.
- **Варианты.** Значение `cases`/`default` — id варианта из `<инференс>.variants/<слот>/<вариант>.md` рядом с инференсом или
  явный путь к `.md`. Файл с префиксом инференса, который не достижим из промта, — `E_ORPHAN_FILE`.
- **Include.** Путь считается от включающего файла, от папки инференса или от корня модуля, `@root/` — от корня:
  `{% include "fragments/brand_voice" %}` и `{% include "fragments/untrusted_input" %}` с любой глубины узла и из папки агента
  находят корневой `fragments/`. Префикс `@flow/` в `include` каркас пока не принимает (§14). Фрагмент — статичный текст без
  переменных. Частей промта в стандарте нет: статичные части `brand_voice` и `judge_protocol` — общие фрагменты, а часть с
  переменными (прошлая версия ответа и критика) встроена в `nodes/polish/revise.prompt.md` под `{% if previous %}`.
- **Ссылки на код (O20).** Каждая ссылка `run`, `wait.poll`, `prompt` уровня 3, `checks[].run`, `scorers[].run` пишется самой
  короткой формой, которая работает. Загрузчик разрешает запись в абсолютную ссылку от места файла; IR, хэши и записи прогона
  хранят только абсолютную ссылку, поэтому перенос файла меняет лишь разрешение.

  | Форма | Разрешается в | В примере |
  |---|---|---|
  | `<функция>` | `@root/<папка>/<id>.py:<функция>` — файл с id объявляющего файла рядом с ним, загружается по пути файла | шаги `code` (`run: "prepare"` → `nodes/prepare/prepare.py`, `run: "validate_record"` → `nodes/record/validate.py`), свои политики (`run: "no_issues"` → `nodes/record/record.py`, `run: "agreeing_verdicts"` → `nodes/judges/judges.py`), проверка (`run: "critique_consistent"` в `critique.inference.yaml` → `nodes/polish/critique.py`), промт уровня 3 (`prompt: "illustrate_prompt"` → `nodes/illustrate/illustrate.py`) |
  | `@root/<путь>.py:<функция>` | как написано: файл от корня модуля, загружается по пути файла | — |
  | `@here.<модуль>:<функция>` | модуль в папке YAML, путь импорта | — |
  | `@flow.<путь>:<функция>` | путь импорта от папки воркфлоу, где лежит YAML | — |
  | `@<flow_id>.<путь>:<функция>` | путь импорта от папки воркфлоу по его id | — |
  | `@root.<путь>:<функция>` | путь импорта от корня пакета — общий код `code/` и `tools/` | тулы: `run: "@root.tools.functions:search_kb"`; оценщик: `run: "@root.code.support_case:promises_match_resolution"` в `revise.inference.yaml` и в скорере `promises` eval `reply_quality` |
  | `<пакет>.<модуль>:<функция>` | как написано | в YAML примера нет; так абсолютную ссылку показывает `aqven refs`: `lumen.code.support_case:promises_match_resolution` |

  Диагностики: `E_ALIAS_UNKNOWN` (неизвестный `@имя`), `E_ALIAS_RESERVED` (id воркфлоу `here`, `flow` или `root`),
  `E_ALIAS_OUTSIDE_PACKAGE` (папка точечной формы не импортируется), `E_CODE_NOT_FOUND` (нет `<id>.py` рядом или функции в
  нём), `E_CODE_REF_UNRESOLVED` (не разрешилась иная форма).
- **Python.** Код узла загружается по пути файла (`importlib.util.spec_from_file_location`), а не по пути импорта, поэтому
  одноимённые модули разных папок не конфликтуют, а папкам узлов не нужны имена-идентификаторы Python. Точечные пути импорта и
  псевдонимы `@root.`/`@flow.` — для общего кода в `code/` и `tools/`: `lumen.code.support_case`, `lumen.tools.functions`.
  Типы и модели входов-выходов инференсов, тулов и шагов `code` в код приходят только из `lumen.types` (§9). Суффиксы `.node.yaml`,
  `.inference.yaml`, `.instructions.md`, `.prompt.md`, `.variants/`, файл `<id>.py`, имена `functions.py`, `code/`,
  `fragments/` и подпапок видов типов фиксирует O22.

Хост — в самом модуле: `lumen/app.py` (приложение ASGI, монтирование в чужое приложение и вызов воркфлоу в процессе) и
`lumen/__main__.py` (запуск сервера). В корне проекта — `tests/`, `.mcp.json`, `AGENTS.md`, `CLAUDE.md`, `.claude/`,
`.gitignore` (`lumen/types.py`, `.env`), `pyproject.toml` с единственным пакетом `lumen` и модулем в корне —
раскладка проекта, созданного `aqven new`. Соглашения YAML — ADR-0026 §1 (блочный стиль, строки в
кавычках, `apiVersion` и `kind` первыми, camelCase только у ключевых слов JSON Schema, `description` у полей, промт — никогда
строкой). Код — Python 3.14, pyright strict, без комментариев и docstring, плоский, сеть только `httpx2` через `ctx.http`.

## 4. Воркфлоу `support_case`

`flows/support_case/flow.yaml`: `input: "CaseRequest"`, `output: "CaseOutcome"`, `context: [date, tenant_id]`, `order` — 18 узлов
ниже, `returns` — поля `CaseOutcome` из `$finalize.out.<поле>`. Узел верхнего уровня — `nodes/<узел>/<узел>.node.yaml`, его
потомки — плоско рядом: `nodes/<узел>/<потомок>.node.yaml`; в столбце «Узел» потомок записан как `<узел>/<потомок>`. Адрес
исполнения — развёрнутый id через `__` (`route__resolve`, `approvals__lead`) с `branch_key`, `iteration`, `item_index`.
Функция шага `code` — в `<узел>.py` рядом с файлом узла, ссылка — голое имя функции: `run: "prepare"` →
`nodes/prepare/prepare.py` (O20).

| # | Узел | Вид | Что делает | Паттерны и конструкции |
|---|---|---|---|---|
| 1 | `prepare` | code `run: prepare` | нормализует текст, выводит `channel`, сигналы категории, поля приёма площадки, три перспективы голосования | предобработка; вход-union `CaseOrigin` |
| 2 | `triage` | llm, свой инференс `triage` @ `gemini` | разбор текста и всех вложений | медиавход Image/Audio/Video/Document; уровень 2; случаи 3 и 4; allowed-set кодами (`SignalKey`); `triage.inference.yaml` рядом с узлом |
| 3 | `vote` | map по `$prepare.out.perspectives`, `body: ballot`, `concurrency: 3`, `on_item_error {use: skip}` | три голоса дешёвой открытой модели | map; self-consistency; встроенная политика ошибки элемента |
| 3a | `vote/ballot` | llm, свой инференс `ballot` @ `llama`, `perspective: $item` | голос за намерение | дешёвая модель через OpenRouter; few-shot |
| 4 | `tally` | code `run: tally` | согласие при большинстве голосов (не меньше двух) с уверенностью ≥ 0.6, иначе `split` и намерение самого уверенного голоса | слияние |
| 5 | `intent` | switch по `$tally.out.agreement`: `agreed` — bind из `tally`, `tier: "cheap"`; `split` — узел `escalate`, `tier: "strong"` | каскад дешёвая → сильная | cascade; `switch` по enum |
| 5a | `intent/escalate` | llm `inference: ballot` @ `deepseek` (без `perspective`) | решение сильной модели | один инференс — разные агенты |
| 6 | `case_form` | code `run: case_form`, `intent: $intent.out.intent` | `FieldSpec[]` анкеты по намерению: поля совпадают с вариантом `CaseRecord`, `order_id`, `symptom` и `damage` ссылаются на типы реестра `OrderId`, `DefectSymptom`, `DeliveryDamage` | динамическая форма |
| 7 | `record` | loop `body [extract, validate]`, `max_iter: 3`, `stop [{run: no_issues, with {path: $iter.validate.out.issues}}]`, `select {use: last}`, `record ← $iter.extract.out.record` | анкета с проверкой и ремонтом по `Issue[]` | extract-validate-repair; случай 5; своя политика остановки |
| 7a | `record/extract` | llm, свой инференс `extract` @ `gemini`, `feedback: $acc.validate.out.issues` | анкета `Dynamic` по форме | Image?/Document? на Google через OpenRouter |
| 7b | `record/validate` | code `run: validate_record` (`validate.py`), `today: $run.context.date` | бизнес-правила анкеты | проверка; code со входом `Dynamic`; контекст прогона |
| 8 | `to_record` | narrow `$record.out.record` → `CaseRecord` | сужение формы из данных в union | narrow |
| 9 | `search_kb` | tool `search_kb` | фрагменты базы знаний (≤ 80) и политики (≤ 20) | HTTP через `httpx2`; retrieve |
| 10 | `route` | switch по `$to_record.out`: `defect` — узел `resolve`; `delivery`, `question` — bind литералом | маршрутизация по варианту | router; union + switch (случай 2), `$case` |
| 10a | `route/resolve` | llm, свой инференс `resolve` @ `resolver` | решение гарантийного случая агентом | функции-тулы, MCP-тул, субагент, одобрение тула, `limits`; allowed-set кодами (`PolicyId`); слот `Dynamic` целиком |
| 11 | `drafts` | parallel `body {gpt, mistral, gemini}`, `join {use: quorum, with {min_ok: 2, on_error: skip}}`; `candidates` из `$ok[*].reply` | три черновика ответа | diverge-merge; OpenAI, Mistral, Google |
| 11a–c | `drafts/{gpt,mistral,gemini}` | llm `inference: revise` @ одноимённый агент, `product: $input.product` | ответ с цитатами и советами по виду лампы | индексный выбор (`KbChunkId`, > 50); пост-проверки; ground; вариант промта `lamp_guide` |
| 12 | `panel` | call `judge_panel` | выбор лучшего кандидата | вызов другого воркфлоу с контрактом; панель судей |
| 13 | `polish` | loop `body [revise, critique]`, `init {revise: [previous ← $panel.out.winner]}`, `max_iter: 3`, `stop [{use: threshold, with {path: $iter.critique.out.score, gte: 0.85}}, {use: stagnation, with {path, window: 1, min_delta: 0.02}}]`, `select {use: best, with {path: $iter.critique.out.score}}` | правка по критике | critic-revise; одиночный судья; встроенные политики остановки и выбора |
| 13a | `polish/revise` | llm, свой инференс `revise` @ `gpt`, `previous: $acc.revise.out.reply`, `critique: $acc.critique.out` | правка | тот же инференс, что у черновиков |
| 13b | `polish/critique` | llm, свой инференс `critique` @ `mistral`, `reply: $revise.out.reply` | оценка опоры, согласия с решением и полноты | одиночный судья другого семейства; тот же инференс — судья eval (§10) |
| 14 | `illustrate` | llm, свой инференс `illustrate` @ `painter` | картинка-инструкция | медиавыход Image; уровень 3 (`prompt: illustrate_prompt` → `illustrate.py`); фолбэк-модель |
| 15 | `voice` | tool `synthesize_voice` | голосовая версия ответа | медиавыход Audio тулом; `external` + идемпотентность |
| 16 | `clip` | tool `render_clip` | короткий ролик по картинке | медиавыход Video; долгая задача с `wait` |
| 17 | `approvals` | parallel `body {lead, brand}`, `join {use: all}` | согласование | параллельные ожидания людей |
| 17a | `approvals/lead` | human `ReplyApproval`, `support_lead`, 14400 с, `escalate` → `support_manager`, 7200 с | ответ и решение | форма; `escalate` |
| 17b | `approvals/brand` | human `MediaApproval`, `brand_editor`, 86400 с, `default {use_image: false, use_voice: true, use_clip: false}` | медиа ответа | `default` |
| 18 | `finalize` | code `run: finalize` | номер обращения, время закрытия, итог | слияние; время и случайность в шаге |

Третья политика таймаута, `fail`, — у одобрения тула агента `resolver` (§6.2). Литералы веток `route`: `delivery` →
`{action: "reship", summary: "Повторная отправка заказа за счёт магазина", credit: null, policy: null}`, `question` →
`{action: "advice", summary: "Ответ по базе знаний без компенсации", credit: null, policy: null}`.

**Цикл без блока итерации (O11).** Состояние итерации — выходы узлов тела: в `stop`, `select` и `out` цикла это
`$iter.<узел>.out`, в теле — `$acc.<узел>.out`, выходы прошлой итерации (на первой — `null`). `init.<узел>` привязывает входы
узла тела на первой итерации поверх его `in`: `polish__revise` первым проходом правит победителя панели, дальше — свой прошлый
ответ по критике. `$loop.iterations` и `$loop.stop_reason` доступны в `out`. Порядок наложения `init` на `in` —
**предложение — нет в ADR**.

Узлы `llm` и `tool` не объявляют типов: входы и выходы берутся из инференса или тула, в файле узла — только привязки
`{name, from | value}`. Необязательный вход `T?` можно не привязывать — придёт `null`. **Предложение — нет в ADR**
(форма привязки; O7 фиксирует, что узел только связывает входы).

## 5. Воркфлоу `judge_panel`

Второй воркфлоу проекта (O17): переиспользуемый подграф с контрактом, его вызывает узел `support_case/panel`
(`node: call`, `flow: "judge_panel"`). Отдельного вида «компонент» нет: контракт — вход и выход воркфлоу и `requires`.

`flows/judge_panel/flow.yaml`: `input: "PanelRequest"` (`summary: Text` 600, `candidates: ReplyDraft[]` 3, `chunks: KbChunk[]`
80), `output: "PanelOutcome"` (`winner: ReplyDraft`, `verdict: PanelVerdict`), `returns` — `winner` ← `$pick.out.winner`,
`verdict` ← `$pick.out.verdict`, `order: [judges, aggregate, decide, pick]`. Узлы читают вход воркфлоу как `$input.<поле>`;
привязки `in` узла `call` сверяются с полями `PanelRequest`, а `$panel.out` — запись `PanelOutcome`.

| Узел | Вид | Что |
|---|---|---|
| `judges` | parallel `body {deepseek, qwen, llama}`, `join {run: agreeing_verdicts, with {min_agree: 2}}`, `verdicts` из `$ok` | три судьи `inference: tie_break` @ `deepseek`, `qwen`, `llama`; своя политика слияния `judges.py`: готово, как только двое выбрали одного кандидата (третий отменяется), иначе ждёт всех; ответивших меньше двух — ошибка |
| `aggregate` | code `run: aggregate` | большинство по `best_index`, медиана баллов, разброс, `level: Agreement` |
| `decide` | switch по `$aggregate.out.level`: `agreed` — bind `verdict`, `tie_broken: false`; `split` — узел `tie_break`, `tie_broken: true` | решение панели |
| `decide/tie_break` | llm, свой инференс `tie_break` @ `gpt`, `panel: $judges.out.verdicts` | тай-брейк моделью OpenAI |
| `pick` | code `run: pick` | кандидат по `best_index`, итоговый `PanelVerdict` |

Контракт `requires`: `families_distinct {nodes: [judges__deepseek, judges__qwen, judges__llama], min: 3}`;
`family_disjoint_from_input {nodes: [judges__deepseek, judges__qwen, judges__llama], input: candidates}`;
`field_before {nodes: [judges__deepseek, judges__qwen, judges__llama, decide__tie_break], first: rationale, second: scores}`.
Тай-брейк ведёт `gpt` — семейство одного из авторов (`drafts__gpt`), поэтому `decide__tie_break` исключён из
`family_disjoint_from_input`: решение владельца от 2026-09-17 о самых дешёвых моделях убрало агента `grok` пятого семейства.
Семейство узла — семейство модели его агента и
фолбэков по таблице профилей (§6.4). Ключ `nodes` у `field_before` — **предложение — нет в ADR** (03 §4.3).

## 6. Реестры модуля

### 6.1. `aqven.yaml` — `kind: Project`

Ключи: `description`, `package: "lumen"`, `providers[]`, `policies`, `limits?`, `renames?`. Провайдер:
`{id, api_key: ref:env/…, base_url?, data_policy {allows_pii, allows_sensitive, retention}, routing?}`; `id` — имя
провайдера Pydantic AI и префикс строки модели. Ключи провайдера — **предложение — нет в ADR** (O3 называет только ссылки на
секреты и base URL).

Решение владельца от 2026-09-17: пример работает на самых дешёвых моделях OpenRouter, поэтому в `aqven.yaml` остался один
провайдер.

| Провайдер | Секрет | `allows_pii` | `retention` | Прочее |
|---|---|---|---|---|
| `openrouter` | `ref:env/OPENROUTER_API_KEY` | true | unknown | `routing {data_collection: deny, zdr: false}` |

**Почему `zdr: false`.** По `GET /api/v1/models/{id}/endpoints` и `GET /api/v1/endpoints/zdr` на 2026-09-17 самые дешёвые
эндпоинты части моделей примера не ZDR: `google/gemini-2.5-flash-lite` — Google AI Studio flex (0.05/0.20 $ за 1M токенов против
0.10/0.40 у ZDR-эндпоинта Vertex), `qwen/qwen3-30b-a3b-instruct-2507` — StreamLake (0.048/0.193 против 0.09/0.30),
`openai/gpt-oss-20b` — Darkbloom; фолбэк `painter` `openai/gpt-5-image-mini` отдаёт только OpenAI без ZDR. С `zdr: true`
фолбэк недоступен, а остальные запросы уходят на эндпоинты дороже. `data_collection: deny` оставлен: провайдеры, обучающиеся
на запросах, не выбираются. Хранение запросов провайдерами не гарантировано, поэтому `retention: unknown`. Флаг `zdr` в запросе
работает как OR с настройкой аккаунта OpenRouter: включённый на аккаунте ZDR запрос не отключит. В записанных кассетах
запросы обслужили DeepInfra, Darkbloom, Amazon Bedrock, Groq, CoreWeave, Io Net, Google, StreamLake, Relace, SiliconFlow, Alibaba
и OpenAI.

`policies`: `pii {mask_in_traces: true, redact: [email, phone, card_number, iban]}`, `trust {default_in: untrusted}`.

### 6.2. Агенты — `agents/<id>.yaml` или `agents/<id>/<id>.yaml`, `kind: Agent`

Ниже — `agents/resolver/resolver.yaml`: агент с сопутствующими файлами лежит папкой.

```yaml
apiVersion: "aqven/v1"
kind: "Agent"
description: "Решает гарантийный случай: заказ, история обращений, политика через субагента, кредит с одобрением"
model: "openrouter:openai/gpt-oss-20b"
settings:
  temperature: 0.2
  max_tokens: 4000
output:
  mode: "native"
  strict: false
  retries: 3
instructions: "./resolver.instructions.md"
tools:
- "lookup_order"
- "issue_store_credit"
- "find_tickets"
subagents:
- name: "research_policy"
  description: "Исследует политику магазина и прецеденты по вопросу"
  agent: "researcher"
  inference: "research_policy"
approval:
  tools:
  - "issue_store_credit"
  assignee: "support_lead"
  timeout_seconds: 3600
  on_timeout:
    policy: "fail"
limits:
  requests: 12
  tool_calls: 10
  tokens: 60000
  usd_micros: 80000
```

Ключи: `model`, `fallback_models?`, `settings? {temperature, top_p, max_tokens, seed, provider_options}` (имена —
`ModelSettings` Pydantic AI), `output? {mode = auto|tool|native|prompted, strict = true, retries = 1, on_refusal = fail|fallback, on_truncated = fail|fallback}`,
`instructions?` (путь `./<агент>.instructions.md` от файла агента, уровень 1), `tools?`, `mcp_servers?`, `subagents?[] {name,
description, agent, inference}` (инференс субагента лежит в папке агента, который его вызывает:
`agents/resolver/research_policy.inference.yaml`), `approval? {tools, assignee, timeout_seconds, on_timeout}` (`default` запрещён), `limits?`, `capabilities?
{family, input, output, strict}` — переопределение таблицы профилей. Состав — O2; имена ключей — **предложение — нет в ADR**.

| Агент | Модель | Семейство | `output` | Особое | Где |
|---|---|---|---|---|---|
| `gemini` | `openrouter:google/gemini-2.5-flash-lite` | google | `auto → tool`, strict false, retries 2 | `capabilities.input: [text, image, audio, video, document]`; temperature 0.2 | `triage`, `record__extract`, `drafts__gemini` |
| `llama` | `openrouter:meta-llama/llama-3.1-8b-instruct` | meta | `auto → tool`, strict false | temperature 0.2 | `vote__ballot`, `panel`: `judges__llama` |
| `mistral` | `openrouter:mistralai/mistral-nemo` | mistral | `auto → tool`, strict false, retries 2 | temperature 0.2; бывший агент `claude` | `drafts__mistral`, `polish__critique`; `reflection_agent` eval |
| `gpt` | `openrouter:openai/gpt-oss-20b` | openai | `auto → tool`, strict false, retries 4 | temperature 0.3, max_tokens 4000 | `drafts__gpt`, `polish__revise`, `panel`: `decide__tie_break` |
| `resolver` | `openrouter:openai/gpt-oss-20b` | openai | `native`, strict false, retries 3 | тулы, MCP-тул, субагент, одобрение (`fail`), `limits` (requests 12) | `route__resolve` |
| `researcher` | `openrouter:mistralai/mistral-nemo` | mistral | `auto → tool`, strict false | `mcp_servers: [helpdesk]` | субагент `resolver` |
| `deepseek` | `openrouter:deepseek/deepseek-v4-flash-0731` | deepseek | `auto → tool`, strict false | temperature 0 | `intent__escalate`, `judges__deepseek`; судья evals |
| `qwen` | `openrouter:qwen/qwen3-30b-a3b-instruct-2507` | qwen | `tool` явно, strict false | temperature 0 | `judges__qwen` |
| `painter` | `openrouter:google/gemini-3.1-flash-lite-image` | google | `prompted` явно, strict false | `fallback_models: [openrouter:openai/gpt-5-image-mini]`; `capabilities {input: [text, image], output: [text, image]}` | `illustrate` |

Таблица модели агентов утверждена владельцем 2026-09-17: самая дешёвая модель OpenRouter с возможностями узлов агента.
Отклонения от неё и причины:

- `record__extract` перешёл с бывшего `claude` на `gemini`: у `mistralai/mistral-nemo` только текстовый вход, а узлу нужны
  `Image?` и `Document?` (`E_MODALITY_UNSUPPORTED`).
- `decide__tie_break` перешёл с удалённого `grok` на `gpt`, `intent__escalate` — с `claude` на `deepseek`; узел
  `drafts__claude` переименован операцией `flow_patch` (`rename_node`) в `drafts__mistral`, запись — в `renames` `aqven.yaml`.
- Фолбэк `painter` — `openai/gpt-5-image-mini`: единственная другая модель с выходом-картинкой не дороже основной на картинку
  (в кассетах 0.0216 $ против 0.0337 $ у `gemini-3.1-flash-lite-image`).
- Режим вывода. `aqven models check` без `--live` — по всем агентам; `--live` 2026-09-17 — `gemini-2.5-flash-lite`: tool, native,
  prompted работают; `mistral-nemo`, `deepseek-v4-flash-0731`, `llama-3.1-8b-instruct`: tool и prompted работают, native
  отклоняет Pydantic AI; `gpt-oss-20b` (все три) и `qwen3-30b-a3b-instruct-2507` (tool) проверены тем же днём при реализации
  `output.mode`. `qwen` закреплён на `tool` явно: таблица известных моделей aqven даёт ему `tool`, а закрепление убирает
  `W_OUTPUT_MODE_RESOLVED`. `resolver` на `tool` финальный ответ не держал (текст вместо тула, чужие ключи, оборванный JSON) —
  закреплён `native`, модель не повышалась. `gpt` в `tool` в части попыток сплющивает `reply` в строку — повторов стало 4,
  модель не повышалась. `painter` закреплён `prompted`: для выхода-картинки режим не влияет, закрепление убирает предупреждение.

Идентификаторы, модальности и `structured_outputs` сверены со списком `https://openrouter.ai/api/v1/models` и эндпоинтами
моделей 2026-09-17 (444 модели).

### 6.3. Тулы и MCP — `tools/<id>.yaml` `kind: Tool`, `mcp/<id>.yaml` `kind: McpServer`

Тул — типизированная функция: `run` (код) **или** `mcp {server, tool}`; `effect`, `idempotency_key?` (имена полей `in`,
обязателен при `write`/`external`), `secrets?[] {name, ref}`, `wait? {poll, interval_seconds, timeout_seconds}`, `in[]`, `out[]`
(у MCP-тула `in`/`out` не пишутся: схему отдаёт сервер). Классов детерминизма и TTL нет (O12): кэша нет, replay и fork берут
записанные выходы шагов; `effect` управляет повторами, безопасностью форка, тестовым режимом и одобрением. Один и тот же тул
служит шагом `node: tool` (только `run`) и тулом агента. Шаг и тул агента одной записью — **предложение — нет в ADR**. Функции
всех тулов — `tools/functions.py`: тулы — проектная папка, общие помощники HTTP живут рядом. Ссылка у всех тулов —
`@root.tools.functions:<функция>` (O20, O22).

| Тул | Источник | `effect` | `in` | `out` |
|---|---|---|---|---|
| `search_kb` | `@root.tools.functions:search_kb` | read, секрет `kb_token` ← `ref:env/LUMEN_KB_TOKEN` | `query: Text` (600), `category: ProductCategory`, `locale: Locale`, `tenant: TenantId` | `chunks: KbChunk[]` (80), `policies: Policy[]` (20) |
| `synthesize_voice` | `@root.tools.functions:synthesize_voice` | external, `idempotency_key: [text, locale]`, `openai_api_key` ← `ref:env/OPENAI_API_KEY` | `text: Text` (1500), `locale: Locale` | `voice: Audio` |
| `render_clip` | `@root.tools.functions:start_clip`, `wait {poll: @root.tools.functions:poll_clip, interval_seconds: 20, timeout_seconds: 1800}` | external, `idempotency_key: [image, text, seconds]`, `together_api_key` ← `ref:env/TOGETHER_API_KEY` | `image: Image`, `text: Text` (1500), `seconds: Int` 4..8 | `clip: Video` |
| `lookup_order` | `@root.tools.functions:lookup_order` | read, `orders_token` ← `ref:env/LUMEN_ORDERS_TOKEN` | `order_id: OrderId` | `order_id: OrderId`, `placed_on: Date`, `delivered_on: Date?`, `total: Money`, `items: ProductRef[]` (20) |
| `issue_store_credit` | `@root.tools.functions:issue_store_credit` | write, `idempotency_key: [customer_id, order_id]`, `orders_token` | `customer_id: CustomerId`, `order_id: OrderId`, `amount: Money` | `credit_id: Text` `^cr_[a-z0-9]{12}$`, `amount: Money` |
| `find_tickets` | `mcp {server: helpdesk, tool: search_tickets}` | read | — | — |

`mcp/helpdesk.yaml`: `transport: "streamable_http"`, `url: "https://helpdesk.lumen.example/mcp"`,
`headers: [{name: Authorization, value: ref:env/LUMEN_HELPDESK_TOKEN}]`. Генерация: голос — OpenAI `POST /v1/audio/speech`,
ролик — Together `POST /v2/videos` с опросом; модель озвучки и путь опроса не сверены.

### 6.4. Таблица профилей моделей

Возможности модели (`family`, `input`, `output`, `strict`) — встроенная таблица `aqven.spec.profiles`, ключ — строка модели;
неизвестная модель получает профиль «только текст, без strict», семейство — по провайдеру или вендорному префиксу
(`meta-llama/` → meta, `x-ai/` → xai, `moonshotai/` → moonshot, `deepseek/`, `deepseek-ai/` → deepseek, `qwen/`, `Qwen/` → qwen,
`z-ai/` → zhipu, `mistralai/` → mistral). Агент переопределяет ключом `capabilities`. Форма таблицы — **предложение — нет в ADR** (O3).

Моделей примера в таблице нет: текстовые модели получают профиль по умолчанию с семейством по вендорному префиксу, а
`gemini` и `painter` объявляют `capabilities` сами.

| Модель | `input` | `output` | `strict` | Откуда |
|---|---|---|---|---|
| `openrouter:google/gemini-2.5-flash-lite` | text, image, audio, video, document | text | false | `capabilities` агента `gemini` |
| `openrouter:google/gemini-3.1-flash-lite-image`, `openrouter:openai/gpt-5-image-mini` | text, image | text, image | false | `capabilities` агента `painter` |
| `openrouter:openai/gpt-oss-20b`, `openrouter:mistralai/mistral-nemo`, `openrouter:deepseek/deepseek-v4-flash-0731`, `openrouter:qwen/qwen3-30b-a3b-instruct-2507`, `openrouter:meta-llama/llama-3.1-8b-instruct` | text | text | false | профиль по умолчанию |

### 6.5. Инференсы — `<id>.inference.yaml`, `kind: Inference`

Id инференса — имя файла до первой точки. Инференс лежит рядом с узлом-владельцем под его именем и получает его id (`triage`,
`ballot`, `extract`, `resolve`, `revise`, `critique`, `illustrate`, `tie_break`); общий инференс другие узлы и evals называют
`inference: <id>` (§3). Инференс субагента лежит в папке агента, который его вызывает (`research_policy` в `agents/resolver/`).
Ниже — фрагмент `flows/support_case/nodes/polish/revise.inference.yaml`: входы `product` и `chunks`, выход и все ключи, кроме
части проверок.

```yaml
apiVersion: "aqven/v1"
kind: "Inference"
description: "Ответ покупателю по принятому решению и фрагментам базы знаний с цитатами; при наличии прошлой версии — правка по критике"
in:
- name: "product"
  type: "ProductRef?"
  description: "Товар обращения; вид лампы выбирает вариант советов, null — товар не указан"
- name: "chunks"
  type: "KbChunk[]"
  description: "Фрагменты базы знаний — единственный источник фактов и цитат"
  maxItems: 80
out:
- name: "reply"
  type: "ReplyDraft"
  description: "Текст ответа и цитаты фрагментов, на которые он опирается"
variants:
  lamp_guide:
    on: "product.lamp_kind"
    cases:
      mains: "mains"
      rechargeable: "rechargeable"
      smart_wifi: "smart_wifi"
      smart_zigbee: "smart_zigbee"
    default: "unknown"
allowed_sets:
- type: "KbChunkId"
  from: "$in.chunks[*].chunk_id"
  labels_from: "$in.chunks[*].title"
checks:
- use: "citations_in_sources"
  with:
    citations: "$out.reply.citations"
    sources: "$in.chunks"
    id: "chunk_id"
    quote: "quote"
    text: "text"
  on_fail: "retry"
- run: "@root.code.support_case:promises_match_resolution"
  on_fail: "retry"
```

Ключи: `description`, `in[]`, `out[]` (≥ 1 поля, выход ограничен), `prompt?`, `variants?`, `allowed_sets?[] {type, from,
labels_from?}` с корнем `$in`, `examples?[] {name, in, out}` (значения проверяются моделями `in`/`out`; адаптер вставляет пары
user/assistant после системных сообщений), `checks?[]`. `schema_from` у выхода `Dynamic` — тоже путь от `$in`. Include — путь
от включающего файла, папки инференса или корня модуля (§3): `{% include "fragments/<имя>" %}` — общий фрагмент корня
(статичный текст). Состав — O7; имена ключей, корни `$in`/`$out` и вставка примеров — **предложение — нет в ADR**.

**Промт: соглашение и переопределение (O8, O18).** Без ключа `prompt` промт уровня 1 или 2 — `<инференс>.prompt.md` рядом с
`<инференс>.inference.yaml`, уровень — по содержимому. Явный `prompt` — путь к `.md` где угодно (от файла инференса, `@flow/`
или `@root/`, `prompt: "@root/<путь>.md"`) или ссылка на функцию уровня 3 в любой форме O20 (`prompt: "illustrate_prompt"`).
Не разрешилось ни то, ни другое — `E_PROMPT_MISSING`; явный путь при своём `<инференс>.prompt.md` рядом — предупреждение
`W_PROMPT_SHADOWED`.

**Варианты промта (O10, O18).** `variants.<слот> {on, cases, default?}`: `on` — путь от входа инференса (`product.lamp_kind`),
`cases` — значение → вариант, `default` — вариант для остальных значений и `null`. Вариант — id файла
`<инференс>.variants/<слот>/<вариант>.md` рядом с инференсом или явный путь к `.md`; он рендерится с теми же входами и
подчиняется тем же правилам уровня 2; `<инференс>.prompt.md` выводит выбранный вариант переменной `{{ variants.<слот> }}` и
логики выбора не содержит (мелкие различия формулировок — `{% if %}` и `{% case %}` внутри промта). check: каждый вариант из
`cases` и `default` есть файлом, каждый файл назван (`E_VARIANT_MISSING`, `E_ORPHAN_FILE`); `on` — вход enum или Text; enum
покрыт `cases` или есть `default`, у `T?` `default` обязателен (`E_VARIANT_NOT_EXHAUSTIVE`); варианты и промт читают только
входы, промт выводит каждый слот; селектор `on` считается использованием входа. Прогон пишет выбранный вариант по слоту; GEPA
оптимизирует файлы вариантов как отдельные текстовые единицы. Выбор сложнее равенства одного входа — промт уровня 3.

**Пост-проверки — оценщики (O5, O9, O11).** Проверка — ссылка на оценщика: встроенный `use: <id>` с `with`, свой
`run: модуль:функция` с `with?` или судья `inference` + `agent` (входы судьи привязываются по имени к `in` и `out`
проверяемого инференса, оценка — поле `score` его выхода); рядом `on_fail` и `threshold?`. Та же ссылка без `on_fail` — скорер
eval (§10). Контракт оценщика (`aqven.policies.Evaluator`): `(value: <модель out>, context: EvalContext[<модель in>, <модель
out>], params: <модель with>) -> Verdict {passed, score?, reason?}`; модели `in` и `out` — сгенерированные `<Инференс>In` и
`<Инференс>Out` из `lumen.types` (`ReviseIn`, `ReviseOut`); модель параметров — последний параметр функции, у своих
проверок без параметров — `NoParams`. Порядок исполнения: валидация Pydantic → allowed-set → проверки в порядке объявления.
`retry` — `ModelRetry(reason)` в счёт `output.retries` агента; `fail` — узел падает; `flag` — значение проходит, `CheckOutcome`
пишется в исполнение.

| Встроенная | `with` |
|---|---|
| `not_empty` | `field` |
| `max_words` | `field`, `max` |
| `language` | `field`, `locale` (путь к `Locale`) |
| `no_pii` | `fields[]`, `detectors?[]` (по умолчанию все детекторы) |
| `regex` | `field`, `pattern` |
| `unique_items` | `field` (список записей), `key` |
| `ids_in_allowed_set` | `field`, `allowed` |
| `citations_in_sources` | `citations`, `sources`, `id`, `quote`, `text` |
| `cost_usd`, `latency_ms` | — (метрики прогона для скореров) |

### 6.6. Политики (O9)

Каждое место, где язык выбирает алгоритм, — одна форма ссылки (Strategy + Registry): ровно одно из `use: <встроенная>` и
`run: модуль:функция`, параметры — `with`. Встроенные — обычные функции `aqven.policies` под своими id с тем же контрактом
слота, поэтому встроенная и своя взаимозаменяемы. Политики чистые (без ввода-вывода, времени и случайности): исполнитель пишет
их входы и решения, replay и fork их воспроизводят.

| Слот | Узел | Контракт | Встроенные и `with` | В примере |
|---|---|---|---|---|
| `join` | parallel | `(state: JoinState[T], params) -> Wait \| Done[T] \| Fail`; вызывается после каждой завершённой ветки, `state` — завершённые ветки в порядке завершения (ключ, значение или ошибка) и ключи ожидающих; `Done` и `Fail` отменяют ожидающие ветки | `all`, `any`, `first_success`, `quorum {min_ok, on_error: skip \| fail}` | `drafts` — `quorum`, `approvals` — `all`, `judges` — своя `agreeing_verdicts {min_agree}` |
| `stop[]` | loop | `(state: LoopState, params) -> Continue \| Stop(reason)`; цикл останавливается, когда любая политика вернула `Stop`; `max_iter` — структурный предел | `threshold {path, gte \| lte}`, `stagnation {path, window, min_delta}` | `polish` — `threshold` и `stagnation`, `record` — своя `no_issues {path}` |
| `select` | loop | `(state: LoopState, params) -> int` — номер выбранной итерации | `last`, `best {path}` | `record` — `last`, `polish` — `best` |
| `on_item_error` | map | `(item: T, error: MapItemError, params) -> Skip \| Fail \| Default[O]` | `skip`, `fail`, `default {value}` | `vote` — `skip` |
| `checks[]`, `scorers[]` | inference, eval | оценщик, §6.5 | §6.5 | §7, §10 |

Отдельного `on_branch_error` нет: обработка ошибок веток — параметр политики `join`. check: ссылка резолвится
(`E_POLICY_UNKNOWN`, `E_CODE_REF_UNRESOLVED`), заданы ровно одно из `use` и `run`, `with` проходит модель параметров функции
(`E_POLICY_PARAMS`, у оценщиков — `E_CHECK_PARAMS`), сигнатура совпадает с контрактом слота и типами узла: `T` у `join` —
выход веток, `O` у `on_item_error` — выход тела map, `value` и `context` оценщика — модели `out` и `in` инференса
(`E_CODE_SIGNATURE_MISMATCH`); пути `RefPath` в `with` резолвятся в области узла, у встроенных проверяется и их тип
(`threshold` — число, `max_words` — Text).

Свои политики примера лежат в `<узел>.py` рядом с узлом, который их использует, ссылка — голое имя:
`flows/judge_panel/nodes/judges/judges.py` —
`agreeing_verdicts(state: JoinState[JudgeVerdict], params: AgreementParams) -> JoinDecision[JudgeVerdict]`,
`flows/support_case/nodes/record/record.py` — `no_issues(state: LoopState, params: EmptyListParams) -> StopDecision`.

## 7. Инференсы примера

Пути в столбце «Файлы» — от `flows/support_case/nodes/`, кроме `tie_break` и `research_policy`.

| Инференс (файлы) | Уровень | `in` | `out` | Особое | Агенты |
|---|---|---|---|---|---|
| `triage` (`triage/triage.inference.yaml`, `.prompt.md`) | 2 | `message: Text` (4000), `channel: Channel`, `customer: Customer`, `product: ProductRef?`, `signals: SignalDef[]` (20), `intake_fields: FieldSpec[]` (10), `photo: Image?`, `voice_note: Audio?`, `video: Video?`, `invoice: Document?` | `summary: Text` (600), `category: ProductCategory`, `observations: Observation[]` (12), `safety_risk: Bool`, `intake_extra: Dynamic` (`schema_from: $in.intake_fields`, `limits {max_fields 10, max_depth 1, max_text_length 200, max_items 5}`) | allowed-set `SignalKey` ← `$in.signals[*].key` / `label`; проверки (параметры в `with`) `unique_items {field: $out.observations, key: key}` retry, `not_empty {field: $out.summary}` retry; `{% message %}`, `{% case channel %}`, `{% if %}` по медиа и `product`, `{% for %}` по `signals` и `intake_fields`, фрагменты `fragments/safety_escalation`, `fragments/untrusted_input` | `gemini` |
| `ballot` (`vote/ballot.inference.yaml`, `.prompt.md`) | 2 | `summary: Text` (600), `observations: Observation[]` (12), `safety_risk: Bool`, `perspective: VotePerspective?` | `rationale: Text` (300), `intent: CaseIntent`, `confidence: Score` | `{% if perspective %}{% case perspective %}` без `else`; два `examples` (`flicker_defect`, `crushed_box`); фрагмент `fragments/untrusted_input` | `llama`, `deepseek` |
| `extract` (`record/extract.inference.yaml`, `.prompt.md`) | 2 | `message: Text` (4000), `summary: Text` (600), `form_fields: FieldSpec[]` (30), `feedback: Issue[]?` (10), `photo: Image?`, `invoice: Document?` | `record: Dynamic` (`schema_from: $in.form_fields`, `limits {max_fields 30, max_depth 2, max_text_length 400, max_items 10}`) | `{% for %}` по полям формы и замечаниям; даты в формате ГГГГ-ММ-ДД; фрагмент `fragments/untrusted_input` | `gemini` |
| `resolve` (`route/resolve.inference.yaml`, `.prompt.md`) | 2 | `customer: Customer`, `order_id: OrderId`, `symptom: DefectSymptom`, `purchased_on: Date?`, `safety_risk: Bool`, `intake_extra: Dynamic`, `policies: Policy[]` (20) | `resolution: Resolution` | allowed-set `PolicyId` ← `$in.policies[*].policy_id` / `title` (коды `prefixed_ordinal`); `{{ intake_extra }}` целиком; фрагменты `fragments/untrusted_input`, `fragments/safety_escalation` под `{% if safety_risk %}` | `resolver` |
| `research_policy` (`agents/resolver/research_policy.inference.yaml`, `.prompt.md`) | 1 | `question: Text` (500), `category: ProductCategory` | `answer: Text` (800), `sources: Text[]` (5 × 120) | инструкция одним текстом без переменных; промт по соглашению рядом с инференсом | `researcher` |
| `revise` (`polish/revise.inference.yaml`, `.prompt.md`, `.variants/`) | 2 | `summary: Text` (600), `customer: Customer`, `locale: Locale`, `channel: Channel`, `product: ProductRef?`, `resolution: Resolution`, `chunks: KbChunk[]` (80), `previous: ReplyDraft?`, `critique: Critique?` | `reply: ReplyDraft` | индексный выбор `KbChunkId`; слот вариантов `lamp_guide` по `product.lamp_kind`: `revise.variants/lamp_guide/{mains,rechargeable,smart_wifi,smart_zigbee,unknown}.md`, `default: unknown`; проверки `citations_in_sources` retry, `max_words {field: $out.reply.text, max: 220}` retry, `no_pii {fields: [$out.reply.text]}` fail, `language {field: $out.reply.text, locale: $in.locale}` flag, `run: @root.code.support_case:promises_match_resolution` retry; фрагменты `fragments/brand_voice`, `fragments/citation_rules`, `fragments/untrusted_input`; прошлая версия и критика — под `{% if previous %}` | `gpt`, `mistral`, `gemini` |
| `tie_break` (`flows/judge_panel/nodes/decide/tie_break.inference.yaml`, `.prompt.md`) | 1 | `summary: Text` (600), `candidates: ReplyDraft[]` (3), `chunks: KbChunk[]` (80), `panel: JudgeVerdict[]?` (3) | `rationale: Text` (600), `scores: CriterionScore[]` (3), `best_index: Int` 0..2 | обоснование раньше оценок | `deepseek`, `qwen`, `llama`, `gpt` |
| `critique` (`polish/critique.inference.yaml`, `.prompt.md`, `.py`) | 2 | `summary: Text` (600), `resolution: Resolution`, `chunks: KbChunk[]` (80), `reply: ReplyDraft` | `rationale: Text` (600), `score: Score`, `blocking: Text[]` (5 × 200) — поля `Critique` | фрагменты `fragments/judge_protocol`, `fragments/citation_rules`, `fragments/untrusted_input`; проверка `run: critique_consistent` (`critique.py`) flag; судья eval `reply_quality`: входы находятся по имени, оценка — `score` | `mistral`, `deepseek` (eval) |
| `illustrate` (`illustrate/illustrate.inference.yaml`, `.py`) | 3 | `text: Text` (1500), `category: ProductCategory`, `photo: Image?` | `image: Image` | `prompt: illustrate_prompt` (`illustrate.py` рядом); медиа дописывает адаптер | `painter` |

Уровень 2 соблюдает правила ADR-0029 §8: каждая переменная — вход, каждый вход использован, `{{ output_format }}` ровно раз,
медиа только в условиях, `case` без `else`, `for` один уровень и только по массиву с `maxItems`, фильтров нет, `message` на
верхнем уровне.

## 8. Типы

Файл типа — `types/<вид>/<snake_name>.yaml`, id — PascalCase имени. Папка `types/` одна — в корне модуля, у воркфлоу, узлов и
инференсов её нет; подпапка — вид типа (O21, O22):

| Папка | Типы |
|---|---|
| `types/enums/` (17) | `Agreement`, `ApprovalDecision`, `CascadeTier`, `CaseIntent`, `CaseStatus`, `Channel`, `CurrencyCode`, `CustomerTier`, `DefectSymptom`, `DeliveryDamage`, `IssueSeverity`, `LampKind`, `Marketplace`, `ProductCategory`, `ReplyCriterion`, `ResolutionAction`, `VotePerspective` |
| `types/ids/` (6) | `CustomerId`, `KbChunkId`, `OrderId`, `PolicyId`, `SignalKey`, `SkuId` |
| `types/records/` (23) | `CaseOutcome`, `CaseRequest`, `Citation`, `CriterionScore`, `Critique`, `Customer`, `IntentBallot`, `Issue`, `JudgeVerdict`, `KbChunk`, `MediaApproval`, `Money`, `Observation`, `PanelOutcome`, `PanelRequest`, `PanelVerdict`, `Policy`, `ProductRef`, `ReplyApproval`, `ReplyDraft`, `ReplyMedia`, `Resolution`, `SignalDef` |
| `types/unions/` (2) | `CaseOrigin`, `CaseRecord` |
| `types/values/` (1, ограниченные скаляры) | `Score` |

`Customer` — `pii: pii`; `customer_id`, `display_name`, `email?`, `tier`, `locale`. `LampKind` — enum `mains`, `rechargeable`,
`smart_wifi`, `smart_zigbee` (O10). `ProductRef` — `sku`, `name`, `category`, `lamp_kind: LampKind?` (`null` у аксессуаров).
`Score` — Float 0..1. `Issue` — `path: Text[]` (8 × 64), `code`, `message`, `severity: IssueSeverity`, `expected?`,
`observed?`, `repair_hint?`.

| Тип | Вид | Поля или значения |
|---|---|---|
| `Marketplace` | enum | amazon, ozon |
| `CaseOrigin` | union `kind` | `storefront {page: Text 200}`, `marketplace {marketplace: Marketplace, order_ref: Text 40}` |
| `CaseRequest` | record | `customer: Customer`, `origin: CaseOrigin`, `message: Text 4000`, `order_id: OrderId?`, `product: ProductRef?`, `tags: Text[]` (5 × 40), `urgent: Bool`, `photo: Image?`, `voice_note: Audio?`, `video: Video?`, `invoice: Document?` |
| `Channel` | enum | storefront, amazon, ozon |
| `SignalKey` | id | `pattern ^[a-z][a-z0-9_]{0,39}$`, `allowed_set: dynamic`, `code_format: identity` |
| `SignalDef` | record | `key: SignalKey`, `label: Text 80` |
| `Observation` | record | `key: SignalKey`, `value: Text 200` |
| `VotePerspective` | enum | words, evidence, risk |
| `CaseIntent` | enum | defect, delivery, question |
| `IntentBallot` | record | `rationale: Text 300`, `intent: CaseIntent`, `confidence: Score` |
| `Agreement` | enum | agreed, split |
| `CascadeTier` | enum | cheap, strong |
| `DefectSymptom` | enum | no_power, flicker, dead_segment, overheating, app_offline, physical_damage |
| `DeliveryDamage` | enum | crushed_box, broken_item, missing_item |
| `CaseRecord` | union `kind` | `defect {order_id: OrderId, symptom: DefectSymptom, purchased_on: Date?, safety_risk: Bool}`, `delivery {order_id: OrderId, damage: DeliveryDamage, carrier_ref: Text? 40}`, `question {topic: Text 200, order_id: OrderId?}` |
| `KbChunkId` | id | `pattern ^kb_[a-z0-9]{10}$`, `allowed_set: dynamic` |
| `KbChunk` | record | `chunk_id: KbChunkId`, `title: Text 120`, `text: Text 1500` |
| `PolicyId` | id | UUID `pattern`, `allowed_set: dynamic`, `code_format: prefixed_ordinal` |
| `Policy` | record | `policy_id: PolicyId`, `title: Text 120`, `text: Text 1200` |
| `ResolutionAction` | enum | store_credit, replacement, reship, advice |
| `Resolution` | record | `action: ResolutionAction`, `summary: Text 400`, `credit: Money?`, `policy: PolicyId?` |
| `Citation` | record | `chunk_id: KbChunkId`, `quote: Text 300` |
| `ReplyDraft` | record | `text: Text 1500`, `citations: Citation[]` (6) |
| `Critique` | record | `rationale: Text 600`, `score: Score`, `blocking: Text[]` (5 × 200); вход `revise.critique` ← `$acc.critique.out` — выход инференса `critique` с теми же полями |
| `ReplyCriterion` | enum | grounded, helpful, tone |
| `CriterionScore` | record | `criterion: ReplyCriterion`, `score: Int` 1..5 |
| `JudgeVerdict` | record | `rationale: Text 600`, `scores: CriterionScore[]` (3), `best_index: Int` 0..2 |
| `PanelVerdict` | record | `verdict: JudgeVerdict`, `tie_broken: Bool`, `spread: Float` 0..4 |
| `PanelRequest` | record | `summary: Text 600`, `candidates: ReplyDraft[]` (3), `chunks: KbChunk[]` (80) — вход воркфлоу `judge_panel` |
| `PanelOutcome` | record | `winner: ReplyDraft`, `verdict: PanelVerdict` — выход воркфлоу `judge_panel` |
| `ApprovalDecision` | enum | approve, edit, reject |
| `ReplyApproval` | record | `decision: ApprovalDecision`, `edited_text: Text? 1500`, `note: Text? 400` |
| `MediaApproval` | record | `use_image: Bool`, `use_voice: Bool`, `use_clip: Bool` |
| `CaseStatus` | enum | sent, rejected |
| `ReplyMedia` | record | `image: Image?`, `voice: Audio?`, `clip: Video?` |
| `CaseOutcome` | record | `case_ref: Text` `^CASE-[0-9A-HJKMNP-TV-Z]{26}$`, `status: CaseStatus`, `intent: CaseIntent`, `tier: CascadeTier`, `record: CaseRecord`, `resolution: Resolution`, `reply: ReplyDraft?`, `media: ReplyMedia`, `closed_at: DateTime` |

## 9. Код модуля

**Один источник типов (O19, O22).** Типы описываются только файлами `kind: Type`; модели Pydantic для кода генерируются, руками
не пишутся. `aqven generate` (его же вызывает `aqven check`) пишет в `types.py` корня модуля модели всех типов модуля и входов и
выходов каждого инференса: `<Инференс>In` и `<Инференс>Out` (`TriageIn`, `ReviseOut`, `ResearchPolicyIn`, `TieBreakOut`); каждого
тула с `run`: `<Тул>In` и `<Тул>Out` (`SearchKbOut`, `IssueStoreCreditOut`, `RenderClipOut`); каждого шага `code`:
`<Воркфлоу><Узел>In` и `<Воркфлоу><Узел>Out` (`SupportCasePrepareOut`, `JudgePanelAggregateOut`) — id узла уникален только в
воркфлоу; расхождение файла с описаниями — предупреждение `W_GENERATED_STALE` (правка руками: файл сгенерирован, правки
перезаписываются, меняйте YAML). Первая строка файла — единственный разрешённый комментарий:
`# Generated by aqven generate. DO NOT EDIT: changes are overwritten; edit the YAML and run aqven generate.`
Файл `types.py` — в `.gitignore` примера и попадает в колесо (uv_build не читает `.gitignore`), поэтому `aqven generate` идёт
до `uv build`. У папки `types/` нет `__init__.py`: иначе она заслоняет `types.py`, и `aqven check` сообщает `E_TYPES_PACKAGE`.
Папка модуля сама не должна быть в `sys.path` или `PYTHONPATH`: `types.py` заслонит модуль `types` стандартной библиотеки —
`W_TYPES_SHADOWS_STDLIB`. Перед тестами файл перегенерирует плагин pytest `aqven` по ini-параметру `aqven_project` хоста —
до импорта `tests/conftest.py`. Генератор
повторяет грамматику ссылок на типы: запись — `BaseModel` с `GENERATED_CONFIG` (`extra="forbid"`, `frozen=True`,
`revalidate_instances="always"`, `serialize_by_alias=True`), enum — `type X = Literal[...]`, id — `X = NewType("X", str)` и
`type XField = Annotated[X, StringConstraints(...)]`, value — `type X = Annotated[float, Field(...)]`, union — классы вариантов
`<Тип><Вариант>` (`CaseRecordDefect`) с дискриминатором первым и `type X = Annotated[A | B, Field(discriminator="kind")]`.
Код импортирует типы и модели входов-выходов инференсов, тулов и шагов из `lumen.types`; медиа, `FieldSpec`, `DynamicValue`,
`Locale`, `TenantId`, `RenderedPrompt`, `GENERATED_CONFIG` — из `aqven.spec`; `EvalContext`, `Verdict`, `NoParams`, `RefPath`,
`JoinState`, `LoopState` и решения политик — из `aqven.policies`; `ToolContext`, `JobHandle`, `JobPoll` — из `aqven.runtime`.
Рукописных копий типов и входов-выходов нет нигде; `aqven check` сверяет нормализованные схемы аннотаций функции с `in`/`out`.
Шаг, чей выход по схеме равен типу реестра, возвращает этот тип: `pick` — `PanelOutcome`, `finalize` — `CaseOutcome`.
Рукописные модели остались только у форм, которых YAML не объявляет: параметры своих политик (`AgreementParams`,
`EmptyListParams`) и ответ API видео Together в `tools/functions.py` (`VideoJob`, `VideoOutputs`, `VideoError`). `FieldSpec` в
коде ссылается на тип реестра по id (`OrderId`, `DefectSymptom`, `DeliveryDamage`): ограничения и значения enum берутся из
типа, их копии в `FieldSpec` — `E_TYPE_CONSTRAINT_MISMATCH`.

Функция лежит в `<id>.py` рядом с файлом сущности, которая её использует; Python нескольких мест — в `code/<модуль>.py`; функции
тулов — в `tools/functions.py`. Пути узлов ниже — от `flows/<воркфлоу>/nodes/`:

| Модуль | Ссылка в YAML | Функции |
|---|---|---|
| `tools/functions.py` | `@root.tools.functions:<функция>` у всех тулов | `async search_kb(ctx, query, category, locale, tenant) -> SearchKbOut`, `async synthesize_voice(ctx, text, locale) -> SynthesizeVoiceOut`, `async start_clip(ctx, image, text, seconds) -> JobHandle`, `async poll_clip(ctx, job) -> JobPoll[RenderClipOut]`, `async lookup_order(ctx, order_id) -> LookupOrderOut`, `async issue_store_credit(ctx, customer_id, order_id, amount) -> IssueStoreCreditOut` |
| `code/support_case.py` | `@root.code.support_case:promises_match_resolution` — в `checks` инференса `revise` и в скорере `promises` eval `reply_quality` | оценщик `promises_match_resolution(value: ReviseOut, context: EvalContext[ReviseIn, ReviseOut], params: NoParams) -> Verdict` |
| `support_case`: `prepare/prepare.py` | `prepare` | `prepare(request) -> SupportCasePrepareOut` |
| `support_case`: `tally/tally.py` | `tally` | `tally(ballots) -> SupportCaseTallyOut` |
| `support_case`: `case_form/case_form.py` | `case_form` | `case_form(intent) -> SupportCaseCaseFormOut` |
| `support_case`: `record/record.py` | `no_issues` | политика `no_issues(state: LoopState, params: EmptyListParams) -> StopDecision` |
| `support_case`: `record/validate.py` | `validate_record` | `validate_record(record: DynamicValue, fields, today) -> SupportCaseValidateOut` |
| `support_case`: `polish/critique.py` | `critique_consistent` | оценщик `critique_consistent(value: CritiqueOut, context: EvalContext[CritiqueIn, CritiqueOut], params: NoParams) -> Verdict` |
| `support_case`: `illustrate/illustrate.py` | `illustrate_prompt` | промт уровня 3 `illustrate_prompt(text, category) -> RenderedPrompt` |
| `support_case`: `finalize/finalize.py` | `finalize` | `finalize(intent, tier, record, resolution, reply, lead, media, image, voice, clip) -> CaseOutcome` |
| `judge_panel`: `judges/judges.py` | `agreeing_verdicts` | политика `agreeing_verdicts(state: JoinState[JudgeVerdict], params: AgreementParams) -> JoinDecision[JudgeVerdict]` |
| `judge_panel`: `aggregate/aggregate.py` | `aggregate` | `aggregate(verdicts) -> JudgePanelAggregateOut` |
| `judge_panel`: `pick/pick.py` | `pick` | `pick(candidates, verdict, tie_broken, spread) -> PanelOutcome` |

Параметры функции уровня 3 — немедийные входы инференса; параметры шага — `in` узла; тул — `ctx` и `in` тула; оценщик —
`value`, `context`, `params`; политика — контракт слота (§6.6). **Предложение — нет в ADR** (ADR-0026 §5 фиксирует только шаг `code`).

## 10. Качество, человек, политики

- **PII и доверие.** `Customer` — `pii`; слоты с ним уходят только агентам, чьи провайдеры (модель и фолбэки) разрешают PII.
  Провайдер один — OpenRouter с `allows_pii: true`; `llama` по построению получает только `summary`, наблюдения и
  кандидатов, а негативный тест `E_PII_PROVIDER` выключает `allows_pii` в копии `aqven.yaml`. `trust.default_in: untrusted` и фрагмент
  `untrusted_input` во всех промтах с текстом покупателя.
- **Человек.** Формы `ReplyApproval`, `MediaApproval`; политики `escalate` (`lead`), `default` (`brand`), `fail` (одобрение
  `issue_store_credit`, ожидание `wait_kind: tool_approval` по адресу `route__resolve`, `branch_key: defect`). Сценарные ответы —
  `ScriptedHuman`; форк — на `approvals__lead` (`branch_key: lead`).
- **Кассеты.** `tests/cassettes/support_case/<сценарий>/`, `replay_strict`, `ALLOW_MODEL_REQUESTS = False` (ADR-0029 §5).
  Голоса `vote` различаются входом `perspective`: одинаковые запросы в одном прогоне дали бы один ключ кассеты
  (`AMBIGUOUS_REPLAY`, ADR-0029 §1), а seed на узле O2 не допускает. Все пять сценариев записаны 2026-09-17 на моделях
  агентов с `AQVEN_LIVE=1` (`record_new`):

  | Сценарий | Вход | Что проверяет |
  |---|---|---|
  | `question_agreed` | вопрос про Wi-Fi 5 ГГц с витрины, без вложений | голоса согласны → `tier: cheap`, анкета `question`, `advice`, `sent` |
  | `defect_split_vote` | `lumen/samples/case_request.json`: помятая коробка, мерцание и тёплый контроллер, вопрос «неправильно подключила или повредили при доставке?», дата заказа с опечаткой `03.09.2027`, счёт без даты | голоса расходятся: тест задаёт их напрямую через `node_output("vote__ballot", …, item_index=…)` — `defect`, `delivery`, `question` → `intent__escalate` @ `deepseek` → `tier: strong`; первая анкета берёт будущую дату, `validate_record` даёт `purchase_in_future`, вторая возвращает `null`: два прохода `record__extract`; `store_credit` после одобрения |
  | `tool_approval_denied` | тот же вход; одобрение `issue_store_credit` отклонено с причиной | решение без `store_credit`; узел `illustrate` заменён сценарной `FunctionModel` (`test_denied_tool_approval_withholds_credit_with_scripted_painter`): бюджет записи — не больше трёх генераций картинок |
  | `painter_fallback` | тот же вход; `provider_fault` на основную модель `painter` | ответ `illustrate` даёт `openai/gpt-5-image-mini` |
  | `fork_lead_reject` | тот же вход; руководитель одобряет ответ через `resume`, форк с `approvals__lead` отклоняет | `status: rejected`, `reply: null` |

  Четыре сценария с дефектом делят запросы до одобрения тула: кассеты `defect_split_vote` скопированы в остальные три до
  записи, а неиспользуемые файлы после записи удалены по трассе загрузок реплея. Ролик `clip` и голос `voice` остаются
  заглушками `MockTransport`, MCP хелпдеска — `McpToolStub`. После каждого теста движок останавливается: DBOS ставит свой пул
  потоков пулом по умолчанию цикла событий, а anyio закрывает его в конце теста.
- **Evals.** В корневой `evals/<воркфлоу>/` того воркфлоу, чей инференс оценивают (`evals/support_case/`). Датасет
  `reply_cases.yaml` (id — имя файла, ключа `name` нет) — входы `revise` (с `product` и видом лампы), `metadata.split: train|dev|test`. Eval `reply_quality.yaml`:
  `inference: revise`, `agent: gpt`, `dataset: reply_cases`, скореры — те же ссылки на оценщиков, что у проверок (O11):
  `critique` (continuous) — судья `inference: critique`, `agent: deepseek`, тот же инференс, что у одиночного судьи
  `polish__critique`; `citations` (binary) — `use: citations_in_sources` с тем же `with`, что у проверки `revise`;
  `promises` (binary) — `run: @root.code.support_case:promises_match_resolution`, та же функция из `code/` и та же ссылка, что
  у проверки `retry`; `cost_usd` — `use: cost_usd`. Гейт как в 13 §8 (`primary: [critique]`, `safety: [citations, promises,
  cost_usd]`, `min_dataset: 200` → на примере честный `GATE_UNAVAILABLE`); `optimization {engine: gepa, objective: critique,
  reflection_agent: mistral, max_metric_calls: 400, stop_score: 0.92}` — GEPA правит `revise.prompt.md` и файлы вариантов
  `revise.variants/lamp_guide/` как отдельные текстовые единицы. Цель eval — пара инференс + агент — **предложение — нет в ADR**
  (13 §4, ADR-0029 §9).

## 11. Хост и режимы исполнения

| Режим | Где |
|---|---|
| Импорт в процесс: `run` и `start` → `waits` → `resume` → `result` | `lumen.app.handle_case`: `Project.load(lumen)`, `flow_typed("support_case", CaseRequest, CaseOutcome)`; `tests/support.py` добавляет `resume_request` |
| Приложение ASGI | `main.app` — `create_local_app`: API, Studio, MCP, чат, движок в lifespan, локальный токен; `main.host_application()` монтирует его на `/aqven` в чужое приложение FastAPI через `local_app_lifespan`; `AQVEN_STUDIO`, `AQVEN_HOST`, `AQVEN_PORT`, `AQVEN_OPEN_BROWSER` читаются после `.env` |
| Любой HTTP-клиент | контракт в `/api/openapi.json` и `/api/schemas/events`, SSE и `Authorization: Bearer`; curl-примеры — в [README.md](README.md); наш `AqvenClient` — только удобство, его тесты живут в `packages/aqven/tests/client/` |
| MCP и Claude Code | `.mcp.json` → `http://127.0.0.1:5180/mcp/`; тулы `run_start`, `run_list`, `run_get_node`, `run_resume`, `run_fork` (23 §13.4) |
| Студия | `aqven studio lumen` — сервер на 127.0.0.1 с токеном запуска и браузер; `aqven dev lumen --dev-origin http://localhost:5173` — разработка студии на Vite |
| CLI | работают `generate`, `check` (сначала генерирует типы), `schema`, `tree` (сущности по видам с путями файлов, вывод — в [README.md](README.md)), `refs KIND:ID` (определение, входящие и исходящие ссылки: `refs inference:revise`), `run support_case --root lumen --input lumen/samples/case_request.json --human-answers lumen/samples/answers.json` (локальный прогон без сервера, события печатаются по мере появления), `serve`, `studio`, `dev`, `mcp` (stdio-мост: берёт работающий сервер проекта или запускает его в фоне); отвечают «не реализовано» с кодом выхода 2 — `fmt`, `plan`, `build`, `eval --eval reply_quality`, `optimize --eval reply_quality` |
| pytest без сети | `tests/test_check.py` (негативы в том числе `E_SOURCE_CONFLICT`, `E_VARIANT_MISSING`, `E_POLICY_UNKNOWN`, `E_POLICY_PARAMS`, `E_CODE_NOT_FOUND`, `E_ALIAS_UNKNOWN`), `tests/test_support_case.py` (`aqven_engine`: пять сценариев §10 на кассетах `replay_strict` при `ALLOW_MODEL_REQUESTS = False`, `ScriptedHuman`, одобрение и отказ тула, фолбэк `painter` через `provider_fault`, заглушки MCP, HTTP-тулы на `MockTransport`, форк). Запись кассет — `AQVEN_LIVE=1` с ключом OpenRouter: режим `record_new` проигрывает записанное и дописывает новое на моделях самих агентов, тестового профиля моделей нет; каждый сценарий записывается отдельным запуском pytest |

```
uv run aqven check examples/lumen
uv run aqven tree examples/lumen
uv run aqven serve examples/lumen --port 5180
claude mcp add aqven -- uv run aqven mcp examples/lumen
uv run pytest examples
```

## 12. Изменения библиотеки `aqven`

Цель — меньше кода: удаляется всё, что пример не использует.

| Модуль | Изменение |
|---|---|
| `aqven.spec` | Новые виды `Inference`, `Agent`, `Tool`, `McpServer` (модули `inference.py`, `agent.py`, `tool.py`, `mcp.py`); `profiles.py` (таблица §6.4, `parse_model`, `resolve_profile`); `policy.py` (`PolicyRef {use \| run, with}`, `EvaluatorRef {use \| run \| inference + agent, with}`); `VariantSlot`; `CheckSpec` = `EvaluatorRef` + `on_fail`, `threshold`; `ScorerSpec` = `EvaluatorRef` + `id`, `kind`. `ProjectSpec` без `defaults`, `models`, `roles`, `mcp_servers`; `ProviderSpec.id` — имя провайдера. Узел `llm` = `inference?` (нет — `<узел>.inference.yaml` рядом с `<узел>.node.yaml`) + `agent` + привязки; `tool` = `tool` + привязки; `call` — вызываемый воркфлоу + привязки (O17). Без `determinism` и `ttl_ms` у узлов `code` и тулов (O12). Один `Limits` вместо `Budget`, `AgentLimits`, `timeout_ms`, `retry`. `parallel {body, join}`, `map {over, body, concurrency, on_item_error}`, `loop {body, init, max_iter, stop, select, out}` — без блока итерации, `stop_when`, `stagnation`, `score`, `quorum`, `on_branch_error`; `max_iter` обязателен. У `map` нет `max_items`. Удалены `OutputContract`, `Overrides`, `OutputMode`, `Archetype`, `SchemaProfile`, роли и каталог, `ToolCallRecord`, проекции `via`, общие промты по ключу, `MaxItemsAtMost`, `FlowPolicies`, `NodeDefaults`, `IdType.source`. Билдер: `Inference` вместо `Signature`, `llm(node_id, *, inference, agent, bind, description)`, `tool(node_id, *, tool, bind, description)` |
| `aqven.policies` | Контракты слотов (`JoinPolicy`, `StopPolicy`, `SelectPolicy`, `ItemErrorPolicy`, `Evaluator`), решения (`Wait`, `Done`, `Fail`, `Continue`, `Stop`, `Skip`, `Default`), `EvalContext`, `Verdict`, реестр встроенных `BUILTINS` |
| `aqven.loader` | Сделано (O14, O15, O22): рекурсивный поиск `*.yaml` с `apiVersion: aqven/v1`, разбор по `kind`, id — имя файла до первой точки (у `flow.yaml` — имя папки), `E_KIND_PATH_MISMATCH` по суффиксу, уникальность по виду, узел — ближайшему `flow.yaml` выше, неявный инференс `<узел>.inference.yaml` рядом с `<узел>.node.yaml`, тексты `<инференс>.prompt.md` и `<инференс>.variants/<слот>/*.md` по префиксу инференса, include от файла, папки инференса или корня, голое имя в `run` — `<id>.py` рядом, загрузка по пути файла. Сделано (O17, O18, O20): вызов воркфлоу узлом `call` (`CallNodeSpec.flow`, контракт `requires` у `FlowSpec`); явный `prompt` и вариант — путь к `.md`; `W_PROMPT_SHADOWED`; псевдонимы ссылок на код `aliases.py`. Осталось: `@flow/` в `{% include %}` (§14) |
| `aqven.codegen` | Сделано (O19, O22): `aqven generate` пишет в `types.py` корня модуля модели типов, `<Инференс>In`/`<Инференс>Out` каждого инференса, `<Тул>In`/`<Тул>Out` каждого тула с `run` и `<Воркфлоу><Узел>In`/`<Воркфлоу><Узел>Out` каждого шага `code`, `aqven check` генерирует перед проверкой, `W_GENERATED_STALE`; плагин pytest перегенерирует до conftest |
| `aqven.check` | `registry` (агенты, тулы, MCP, провайдеры, фолбэки, субагенты, одобрение), `inferences` (промт, варианты, примеры, allowed-set), `policies` (политики слотов и оценщики проверок и скореров), `capabilities` (медиа, strict, PII по агенту и фолбэкам) вместо `catalog`, `strict`, `media`, `agents`; привязки узлов сверяются со входами инференса, тула, вызываемого воркфлоу |
| `aqven.diagnostics` | Новые `E_INFERENCE_UNKNOWN`, `E_AGENT_UNKNOWN`, `E_TOOL_UNKNOWN`, `E_INPUT_UNBOUND`, `E_INPUT_UNKNOWN`, `E_CHECK_PARAMS`, `E_EXAMPLE_INVALID`, `E_TEXT_OUTPUT`, `E_APPROVAL_TOOL`, `E_AGENT_RECURSION`, `E_SOURCE_CONFLICT`, `E_VARIANT_MISSING`, `E_VARIANT_NOT_EXHAUSTIVE`, `E_POLICY_UNKNOWN`, `E_POLICY_PARAMS`, `W_PROMPT_SHADOWED` (O18); удаляются `E_PROMPT_MISPLACED` и `E_PROMPT_AMBIGUOUS` (O18: путь в `prompt` законен, рядом лежащий `<инференс>.prompt.md` — предупреждение), `E_COMPONENT_UNKNOWN` и `E_COMPONENT_RECURSION` переходят на воркфлоу (O17); удалены `E_MODEL_ROLE_UNKNOWN`, `E_MODEL_UNKNOWN`, `E_LOOP_UNBOUNDED`, `E_MAP_UNBOUNDED`, `E_APPROVAL_MISSING`, `E_COMPONENT_BINDING`, `E_FLOW_SOURCE_CONFLICT`, резервные `W_DYNAMIC_EXCESS`, `W_LOCK_STALE`, `E_PROMPT_BUDGET` |
| `aqven.runtime` | `NodeExecution.agent`, `.inference`; `CheckOutcome {check, on_fail, passed, feedback, attempt}`; `ForkOverrides.agent` вместо `model_profile`; `ProviderFault.model` — строка модели; удалены `RecordedToolOutput`, `RawHumanMessage`, `narrowing.py`, `issues.py` |
| `aqven.testing` | удалены `recorded_tool_output`, `ScriptedHuman.raw`, `DirectoryBlobStore`, фикстура `blob_store` |
| `aqven.cli`, `aqven.client`, `aqven.evals` | без изменений формы; `EvalSpec` — `inference` + `agent`, судья и reflection — агенты |

## 13. Владение

Раскладка по ролям (O19, O22) делает владельца папки владельцем всего в ней.

| Владелец | Пути (от `examples/lumen/`, корень проекта — `examples/`) |
|---|---|
| config | `aqven.yaml`, `types/`, `agents/` (с папкой `agents/resolver/` и инференсом субагента), `tools/`, `mcp/` |
| workflow | `flows/support_case/`, `flows/judge_panel/` — воркфлоу, узлы, их инференсы, промты, варианты и код; `fragments/`, `code/`, `evals/` |
| host | `app.py`, `__main__.py`, `samples/`, а в корне проекта `tests/`, `.mcp.json`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.gitignore`, `pyproject.toml` |

`types.py` корня модуля не принадлежит никому: его пишет `aqven generate`. Чужие файлы только читаются; импорт типов и моделей
входов-выходов инференсов, тулов и шагов из `lumen.types` и общего кода из `lumen.code` разрешён.

## 14. Открытые вопросы

1. `MCPToolset` в pydantic-ai-slim 2.43.0 требует `fastmcp-slim[client]` и импортирует encode `httpx` (`pydantic_ai/mcp.py`)
   — конфликт с «только httpx2» ADR-0025. Решить в движке: свой клиент MCP на `mcp` 2.2.0 или исключение.
2. Seed на голос self-consistency O2 не выражает; пример разводит голоса входом `perspective`. Нужен ли агенту механизм выборок
   без смены входа (и ключа кассеты) — решает владелец.
3. Модель озвучки и путь опроса видео не сверены. Модели агентов — только OpenRouter, сверены 2026-09-17 (§6.2).
4. Сокращённый срок ожидания человека в тестах отсутствует (23 ОВ 32): таймауты `escalate`/`default` в pytest не проигрываются.
5. Вход `Dynamic` в записи реестра и в выходе воркфлоу пример не использует; правило для полей записей не описано.
6. `init` задаёт входы узла тела только на первой итерации поверх его `in` — трактовка примера; O11 порядок наложения не
   фиксирует.
7. O20 разрешает `@flow/` в путях промтов, но `{% include %}` каркаса понимает только пути от файла, папки инференса и корня и
   префикс `@root/`. Примеру это не мешает: фрагменты лежат в корневой `fragments/` и включаются `fragments/<имя>` с любой
   глубины.
8. Закрыт O22: фрагменты промтов — только `fragments/` корня.
9. Закрыт O22: инференс субагента лежит в папке агента, `agents/resolver/research_policy.inference.yaml`.
10. O19 говорит «перегенерирует conftest»; каркас делает это плагином pytest `aqven` (`pytest_load_initial_conftests` по
    `aqven_project`), до импорта `conftest.py`, который сам импортирует `lumen.types`. Отдельного вызова в conftest
    пример не держит.
11. Генератор пишет строки длиннее 120 символов (`PolicyIdField`); хост снимает для `lumen/types.py` только E501 и исключает файл из `ruff format` своим `pyproject.toml`; заголовок ruff не отмечает.
12. Повторные раунды одобрения тула в одном исполнении `llm` (23 ОВ 30) не решены: второй раунд открывает ожидание с тем же
    адресом и попыткой, сценарный ответ в тот же топик с тем же ключом идемпотентности DBOS не доставляет, и прогон ждёт до
    таймаута. Пример обходит это двумя путями: движок не спрашивает одобрения вызова с невалидными аргументами (сразу
    `ModelRetry`), а отказ в `tool_approval_denied` приходит с причиной, после которой модель не повторяет вызов.
13. `judges__qwen` в сценариях с дефектом не держит `rationale` ≤ 600 и обрывает JSON на `max_tokens: 1500`; панель
    продолжает двумя судьями по политике `agreeing_verdicts`. Поднимать модель или лимит — решает владелец.
14. Строки моделей примера не внесены во встроенную таблицу профилей `aqven.spec.profiles`; `gemini` и `painter` объявляют
    `capabilities` сами.
