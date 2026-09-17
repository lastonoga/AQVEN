# Showcase: поддержка Lumen

Воркфлоу `support_case` и вызываемый им воркфлоу `judge_panel` показывают все паттерны и режимы исполнения aqven. Проект —
в [DESIGN.md](DESIGN.md), модуль — `lumen/src/lumen/`, хост — `app/` и `tests/`.

```
prepare → triage → vote(map) → tally → intent(switch: cascade) → case_form → record(loop: extract-validate-repair)
→ to_record(narrow) → search_kb → route(switch: router, agent) → drafts(parallel) → panel(call judge_panel)
→ polish(loop: critic-revise) → illustrate → voice → clip(wait) → approvals(parallel humans) → finalize
```

## Критик и правка: `polish`

Победитель панели судей правится, пока критик другого семейства не поставит 0.85 или оценка не перестанет расти.
Итерация — это выходы узлов тела, отдельного блока состояния нет; остановка и выбор — встроенные политики.
Файл — `flows/support_case/nodes/polish/polish.node.yaml`.

```yaml
node: "loop"
body:
- "revise"
- "critique"
init:
  revise:
  - name: "previous"
    from: "$panel.out.winner"
max_iter: 3
stop:
- use: "threshold"
  with:
    path: "$iter.critique.out.score"
    gte: 0.85
- use: "stagnation"
  with:
    path: "$iter.critique.out.score"
    window: 1
    min_delta: 0.02
select:
  use: "best"
  with:
    path: "$iter.critique.out.score"
```

Узлы тела лежат плоско в той же папке `nodes/polish/`. `revise.node.yaml` — свой инференс `revise` @ `gpt`
(`revise.inference.yaml`, `revise.prompt.md`, `revise.variants/lamp_guide/`): на первой итерации `previous` приходит из
`init`, дальше `previous ← $acc.revise.out.reply` и `critique ← $acc.critique.out`. `critique.node.yaml` — свой инференс
`critique` @ `mistral`, его проверка `critique_consistent` — в `critique.py` рядом. Тот же `critique` судит `revise` в eval
`evals/support_case/reply_quality.yaml`, а оценщик `promises_match_resolution` из `code/support_case.py` — одновременно
проверка `revise` и скорер этого eval.

## Раскладка

Загрузчик находит описания по `kind` в любом месте модуля, фиксирован только `aqven.yaml`; стандартная раскладка даёт каждому
виду одно место. Id — имя файла до первой точки (у `flow.yaml` — имя папки), сопутствующие файлы сущности лежат рядом с тем же
префиксом. Агент одним файлом — `agents/<агент>.yaml`, агент с сопутствующими файлами — папка `agents/<агент>/`. У каждого узла
верхнего уровня своя папка `nodes/<узел>/`, все его потомки на любой глубине лежат в ней плоско.

```
lumen/src/lumen/
  aqven.yaml
  types.py                           модели всех типов и входов-выходов инференсов, тулов и шагов code: aqven generate,
                                     не коммитится, первая строка — заголовок DO NOT EDIT
  agents/<agent>.yaml                deepseek, gemini, gpt, llama, mistral, painter, qwen, researcher
  agents/resolver/                   resolver.yaml, resolver.instructions.md,
                                     research_policy.inference.yaml, research_policy.prompt.md — инференс субагента
  tools/<tool>.yaml, functions.py    тулы и их функции
  mcp/helpdesk.yaml
  types/enums/, ids/, records/, unions/, values/
  fragments/                         brand_voice, citation_rules, judge_protocol, safety_escalation, untrusted_input
  code/support_case.py               Python нескольких мест: проверка инференса revise и скорер eval
  evals/support_case/                reply_cases.yaml, reply_quality.yaml
  flows/
    support_case/
      flow.yaml
      nodes/triage/                  triage.node.yaml, triage.inference.yaml, triage.prompt.md — без ключа inference
      nodes/prepare/                 prepare.node.yaml, prepare.py — run: "prepare"
      nodes/record/                  record.node.yaml, record.py, extract.node.yaml, extract.inference.yaml,
                                     extract.prompt.md, validate.node.yaml, validate.py
      nodes/polish/                  polish.node.yaml, revise.node.yaml, revise.inference.yaml, revise.prompt.md,
                                     revise.variants/lamp_guide/, critique.node.yaml, critique.inference.yaml,
                                     critique.prompt.md, critique.py
      nodes/vote/, tally/, intent/, case_form/, to_record/, search_kb/, route/, drafts/, panel/, illustrate/, voice/,
            clip/, approvals/, finalize/
    judge_panel/
      flow.yaml
      nodes/judges/, aggregate/, decide/, pick/
```

| Что | Где |
|---|---|
| Инференс одного узла | рядом с узлом под его именем: `nodes/triage/triage.inference.yaml`, `nodes/record/extract.inference.yaml`, `nodes/route/resolve.inference.yaml`, `nodes/illustrate/illustrate.inference.yaml` |
| Общий инференс | у первого узла-владельца, остальные ссылаются `inference: <id>`: `revise` — `drafts__gpt`, `drafts__mistral`, `drafts__gemini` и eval; `ballot` — `intent__escalate`; `tie_break` — `judges__deepseek`, `judges__qwen`, `judges__llama`; `critique` — скорер eval |
| Инференс субагента | в папке агента: `agents/resolver/research_policy.inference.yaml` |
| Потомки узла | плоско в папке узла верхнего уровня: `nodes/route/resolve.node.yaml`, `flows/judge_panel/nodes/judges/deepseek.node.yaml`; развёрнутый id — `route__resolve`, `judges__deepseek` |
| Промт | `<инференс>.prompt.md` рядом с `<инференс>.inference.yaml`; уровень 3 — `prompt: "illustrate_prompt"` из `nodes/illustrate/illustrate.py` |
| Варианты по виду лампы | `flows/support_case/nodes/polish/revise.variants/lamp_guide/` |
| Фрагменты промтов | `fragments/` корня, `{% include "fragments/untrusted_input" %}` с любой глубины |
| Политики: встроенные `use`, свои `run` | `join`, `stop`, `select`, `on_item_error` в узлах; свои — `flows/judge_panel/nodes/judges/judges.py`, `flows/support_case/nodes/record/record.py` |
| Оценщики: проверки и скореры | `checks` в `<инференс>.inference.yaml`, `scorers` в `evals/support_case/reply_quality.yaml` |
| Типы | только YAML в `types/` корня; код импортирует модели типов и входов-выходов инференсов (`ReviseIn`, `ReviseOut`), тулов (`SearchKbOut`) и шагов `code` (`SupportCasePrepareOut`) из `lumen.types` (`from lumen.types import CaseRequest`); шаг, чей выход равен типу реестра, возвращает этот тип (`pick` — `PanelOutcome`, `finalize` — `CaseOutcome`) |
| Ссылки на код | `run: "tally"` — `tally.py` рядом с `tally.node.yaml`, загрузка по пути файла; `@root.tools.functions:…` и `@root.code.support_case:…` — путь импорта от корня пакета; полный путь `lumen.code.support_case:promises_match_resolution` тоже работает |

`aqven tree` перечисляет сущности по видам с путями файлов и режимом вывода агентов; промты, варианты, фрагменты и Python в него не входят.

```
$ uv run aqven tree examples/showcase/lumen/src/lumen
project (1)
  lumen  aqven.yaml
agent (9)
  deepseek    agents/deepseek.yaml           output.mode auto -> tool (profile)
  gemini      agents/gemini.yaml             output.mode auto -> tool (profile)
  gpt         agents/gpt.yaml                output.mode auto -> tool (profile)
  llama       agents/llama.yaml              output.mode auto -> tool (profile)
  mistral     agents/mistral.yaml            output.mode auto -> tool (profile)
  painter     agents/painter.yaml            output.mode prompted -> prompted (declared)
  qwen        agents/qwen.yaml               output.mode tool -> tool (declared)
  researcher  agents/researcher.yaml         output.mode auto -> tool (profile)
  resolver    agents/resolver/resolver.yaml  output.mode native -> native (declared)
tool (6)
  find_tickets        tools/find_tickets.yaml
  issue_store_credit  tools/issue_store_credit.yaml
  lookup_order        tools/lookup_order.yaml
  render_clip         tools/render_clip.yaml
  search_kb           tools/search_kb.yaml
  synthesize_voice    tools/synthesize_voice.yaml
mcp_server (1)
  helpdesk  mcp/helpdesk.yaml
type (49)
  Agreement         types/enums/agreement.yaml
  ApprovalDecision  types/enums/approval_decision.yaml
  CascadeTier       types/enums/cascade_tier.yaml
  CaseIntent        types/enums/case_intent.yaml
  CaseOrigin        types/unions/case_origin.yaml
  CaseOutcome       types/records/case_outcome.yaml
  CaseRecord        types/unions/case_record.yaml
  CaseRequest       types/records/case_request.yaml
  CaseStatus        types/enums/case_status.yaml
  Channel           types/enums/channel.yaml
  Citation          types/records/citation.yaml
  CriterionScore    types/records/criterion_score.yaml
  Critique          types/records/critique.yaml
  CurrencyCode      types/enums/currency_code.yaml
  Customer          types/records/customer.yaml
  CustomerId        types/ids/customer_id.yaml
  CustomerTier      types/enums/customer_tier.yaml
  DefectSymptom     types/enums/defect_symptom.yaml
  DeliveryDamage    types/enums/delivery_damage.yaml
  IntentBallot      types/records/intent_ballot.yaml
  Issue             types/records/issue.yaml
  IssueSeverity     types/enums/issue_severity.yaml
  JudgeVerdict      types/records/judge_verdict.yaml
  KbChunk           types/records/kb_chunk.yaml
  KbChunkId         types/ids/kb_chunk_id.yaml
  LampKind          types/enums/lamp_kind.yaml
  Marketplace       types/enums/marketplace.yaml
  MediaApproval     types/records/media_approval.yaml
  Money             types/records/money.yaml
  Observation       types/records/observation.yaml
  OrderId           types/ids/order_id.yaml
  PanelOutcome      types/records/panel_outcome.yaml
  PanelRequest      types/records/panel_request.yaml
  PanelVerdict      types/records/panel_verdict.yaml
  Policy            types/records/policy.yaml
  PolicyId          types/ids/policy_id.yaml
  ProductCategory   types/enums/product_category.yaml
  ProductRef        types/records/product_ref.yaml
  ReplyApproval     types/records/reply_approval.yaml
  ReplyCriterion    types/enums/reply_criterion.yaml
  ReplyDraft        types/records/reply_draft.yaml
  ReplyMedia        types/records/reply_media.yaml
  Resolution        types/records/resolution.yaml
  ResolutionAction  types/enums/resolution_action.yaml
  Score             types/values/score.yaml
  SignalDef         types/records/signal_def.yaml
  SignalKey         types/ids/signal_key.yaml
  SkuId             types/ids/sku_id.yaml
  VotePerspective   types/enums/vote_perspective.yaml
inference (9)
  ballot           flows/support_case/nodes/vote/ballot.inference.yaml
  critique         flows/support_case/nodes/polish/critique.inference.yaml
  extract          flows/support_case/nodes/record/extract.inference.yaml
  illustrate       flows/support_case/nodes/illustrate/illustrate.inference.yaml
  research_policy  agents/resolver/research_policy.inference.yaml
  resolve          flows/support_case/nodes/route/resolve.inference.yaml
  revise           flows/support_case/nodes/polish/revise.inference.yaml
  tie_break        flows/judge_panel/nodes/decide/tie_break.inference.yaml
  triage           flows/support_case/nodes/triage/triage.inference.yaml
flow (2)
  judge_panel   flows/judge_panel/flow.yaml
  support_case  flows/support_case/flow.yaml
node (38)
  judge_panel.aggregate          flows/judge_panel/nodes/aggregate/aggregate.node.yaml
  judge_panel.decide             flows/judge_panel/nodes/decide/decide.node.yaml
  judge_panel.decide__tie_break  flows/judge_panel/nodes/decide/tie_break.node.yaml
  judge_panel.judges             flows/judge_panel/nodes/judges/judges.node.yaml
  judge_panel.judges__deepseek   flows/judge_panel/nodes/judges/deepseek.node.yaml
  judge_panel.judges__llama      flows/judge_panel/nodes/judges/llama.node.yaml
  judge_panel.judges__qwen       flows/judge_panel/nodes/judges/qwen.node.yaml
  judge_panel.pick               flows/judge_panel/nodes/pick/pick.node.yaml
  support_case.approvals         flows/support_case/nodes/approvals/approvals.node.yaml
  support_case.approvals__brand  flows/support_case/nodes/approvals/brand.node.yaml
  support_case.approvals__lead   flows/support_case/nodes/approvals/lead.node.yaml
  support_case.case_form         flows/support_case/nodes/case_form/case_form.node.yaml
  support_case.clip              flows/support_case/nodes/clip/clip.node.yaml
  support_case.drafts            flows/support_case/nodes/drafts/drafts.node.yaml
  support_case.drafts__gemini    flows/support_case/nodes/drafts/gemini.node.yaml
  support_case.drafts__gpt       flows/support_case/nodes/drafts/gpt.node.yaml
  support_case.drafts__mistral   flows/support_case/nodes/drafts/mistral.node.yaml
  support_case.finalize          flows/support_case/nodes/finalize/finalize.node.yaml
  support_case.illustrate        flows/support_case/nodes/illustrate/illustrate.node.yaml
  support_case.intent            flows/support_case/nodes/intent/intent.node.yaml
  support_case.intent__escalate  flows/support_case/nodes/intent/escalate.node.yaml
  support_case.panel             flows/support_case/nodes/panel/panel.node.yaml
  support_case.polish            flows/support_case/nodes/polish/polish.node.yaml
  support_case.polish__critique  flows/support_case/nodes/polish/critique.node.yaml
  support_case.polish__revise    flows/support_case/nodes/polish/revise.node.yaml
  support_case.prepare           flows/support_case/nodes/prepare/prepare.node.yaml
  support_case.record            flows/support_case/nodes/record/record.node.yaml
  support_case.record__extract   flows/support_case/nodes/record/extract.node.yaml
  support_case.record__validate  flows/support_case/nodes/record/validate.node.yaml
  support_case.route             flows/support_case/nodes/route/route.node.yaml
  support_case.route__resolve    flows/support_case/nodes/route/resolve.node.yaml
  support_case.search_kb         flows/support_case/nodes/search_kb/search_kb.node.yaml
  support_case.tally             flows/support_case/nodes/tally/tally.node.yaml
  support_case.to_record         flows/support_case/nodes/to_record/to_record.node.yaml
  support_case.triage            flows/support_case/nodes/triage/triage.node.yaml
  support_case.voice             flows/support_case/nodes/voice/voice.node.yaml
  support_case.vote              flows/support_case/nodes/vote/vote.node.yaml
  support_case.vote__ballot      flows/support_case/nodes/vote/ballot.node.yaml
dataset (1)
  reply_cases  evals/support_case/reply_cases.yaml
eval (1)
  reply_quality  evals/support_case/reply_quality.yaml
```

## Модели

Пример работает на самых дешёвых моделях OpenRouter с возможностями узлов агента (решение владельца от 2026-09-17), в
`aqven.yaml` один провайдер `openrouter` с `routing {data_collection: deny, zdr: false}`: самые дешёвые эндпоинты части моделей
и фолбэк `painter` не ZDR. Таблица агентов, отклонения и причины — в [DESIGN.md](DESIGN.md) §6.1–§6.2.

| Агент | Модель |
|---|---|
| `gpt`, `resolver` | `openrouter:openai/gpt-oss-20b` |
| `gemini` | `openrouter:google/gemini-2.5-flash-lite` |
| `mistral`, `researcher` | `openrouter:mistralai/mistral-nemo` |
| `deepseek` | `openrouter:deepseek/deepseek-v4-flash-0731` |
| `qwen` | `openrouter:qwen/qwen3-30b-a3b-instruct-2507` |
| `llama` | `openrouter:meta-llama/llama-3.1-8b-instruct` |
| `painter` | `openrouter:google/gemini-3.1-flash-lite-image`, фолбэк `openrouter:openai/gpt-5-image-mini` |

Ключ — `OPENROUTER_API_KEY` в `.env` проекта или в окружении процесса. `uv run aqven models check --project
examples/showcase/lumen/src/lumen` показывает режим вывода каждого агента, `--live` шлёт по короткому запросу на режим.

## Запуск

```
uv run aqven generate examples/showcase/lumen/src/lumen
uv run aqven check examples/showcase/lumen/src/lumen
uv run aqven tree examples/showcase/lumen/src/lumen
uv run aqven refs inference:revise examples/showcase/lumen/src/lumen
uv run pytest examples/showcase
```

Тесты сценариев идут на кассетах `tests/cassettes/support_case/<сценарий>/` без сети. Перезапись сценария — отдельным
запуском pytest с ключом OpenRouter: `AQVEN_LIVE=1 uv run pytest examples/showcase/tests/test_support_case.py -k <сценарий>`;
режим `record_new` проигрывает записанное и дописывает только новые запросы.

`run`, `serve`, `studio`, `dev` и `mcp` работают; `fmt`, `plan`, `build`, `eval` и `optimize` пока отвечают «не реализовано» с кодом выхода 2.
