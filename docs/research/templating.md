# Движок шаблонов промтов со статическим анализом (§7.6, R-T1..R-T12)

Статус: ГОТОВО (все 6 подвопросов закрыты). Автор: research-subagent. Дата: 2026-09-11.





## 4. Из одного шаблона — массив сообщений + точки кэширования
TODO


## 0. Требования из спеки (§7.6, /Users/kirunya/Projects/my/ai-workflows-automate/docs/00-source-spec.ru.md:750-811)

Синтаксис в спеке — **Liquid/Jinja-подобный**: `{{ date }}`, `{% if %}`, `{% switch %}`, `{% for %}`,
`{% include fragment@v %}`, спец-плейсхолдер `{{ output_format }}`.
Прямая цитата: «Произвольных выражений и функций в шаблоне нет — только разрешённые фильтры» (строка 798).

Что обязан уметь статический анализатор (строки 800-811):
- R-T1 плейсхолдер → объявленный слот, поле существует, тип совместим;
- R-T2 каждый слот использован либо помечен `unused` с причиной (обратная задача: собрать множество использованных путей);
- R-T3 условия только по bool/optional/enum, сравнение enum — со значениями реестра;
- R-T4 `switch` полный по enum (конструкции `{% switch %}` НЕТ ни в одном движке из коробки — это наш кастомный тег);
- R-T5 `for` только по массивам, внутри — поля элемента (нужен scope-tracking переменной цикла);
- R-T6 `output_format` ровно один раз + запрет ручного описания формата/JSON-примеров в статическом тексте;
- R-T7 enum-значения, упомянутые в **статическом тексте**, сверяются с реестром (анализ текстовых узлов, не выражений);
- R-T8 нет данных-литералов в статическом тексте (тоже анализ текстовых узлов);
- R-T9 верхняя оценка размера отрисовки ≤ окно профиля (нужен обход с max-оценкой по ветвям);
- R-T10 политики видимости (проверка на уровне слотов/views, не синтаксиса);
- R-T11 шаблон объявляет язык вывода;
- R-T12 запрет фраз «используй свои знания» и т.п. (текстовые узлы).

**Вывод по требованиям:** нам нужен не «шаблонизатор», а **парсер с доступом к AST, где текстовые узлы,
выражения и теги различимы**, плюс возможность зарегистрировать собственные теги (`switch`/`case`,
`include fragment@v`) и **выключить произвольные выражения**. Рендер — вторичная задача.

## 1. Сравнение движков (npm view, 2026-09-11)

| Пакет | Версия | Лицензия | time.modified | unpacked | Публичный parse→AST | Кастомные теги | Произвольные выражения | sync |
|---|---|---|---|---|---|---|---|---|
| `liquidjs` | 10.29.0 | MIT | 2026-08-11 | 1.89 MB | **да**, `liquid.parse()` → `Template[]` с `.token` (kind/name/args/**begin,end,input**) | **да**, `registerTag(name, {parse, render})` | нет (Liquid — не язык выражений; только фильтры) | `renderSync` есть |
| `nunjucks` | 3.2.4 | BSD-2 | **2023-04-13 → 3 года без релизов, РИСК** | 1.77 MB | да, `nunjucks.parser.parse(src, ext, opts)` → `nodes.Root` | да, `Extension.parse()` | **да** (`{{ a if b else c }}`, вызовы) | да |
| `handlebars` | 4.7.9 | MIT | 2026-03-26 | 2.81 MB | **да, документированный AST-spec + `loc` у каждого узла** | хелперы/partials, новых блочных синтаксисов нет | нет выражений, но всё — вызовы хелперов | да |
| `eta` | 4.6.0 | MIT | 2026-04-25 | 0.21 MB | **нет дерева**: `eta.parse()` → плоский список `{t:'e'\|'i'\|'r', val:'<сырой JS>'}` | — | **ДА, произвольный JS** | да |
| `@huggingface/jinja` | 0.5.10 | MIT | **2026-09-04, самый свежий** | 0.40 MB | **да**, экспортирует `tokenize()` и `parse()` → `Program` (классы из `ast.d.ts`) | **нет** (нельзя добавить свой тег) | да (подмножество Jinja: арифметика, вызовы, тесты) | да |

Дисквалификация сразу:
- **eta** — плоский список токенов с сырым JS внутри (`{"t":"e","val":"if (it.kids) {"}`). Статический анализ
  невозможен без парсинга JS; произвольный JS прямо противоречит «произвольных выражений и функций нет» (§7.6:798).
- **nunjucks** — 3 года без релизов (time.modified 2023-04-13) + богатый язык выражений, который пришлось бы
  урезать чёрным списком узлов. Риск сопровождения.
- **@huggingface/jinja** — отличный компактный AST, но **нельзя зарегистрировать кастомный тег**
  (`export { Environment, Interpreter, tokenize, parse }` из `dist/index.d.ts` — API расширения тегов нет).
  Наши `{% switch %}` и `{% include fragment@v %}` не выразить. Годится только как reference-парсер
  для чужих chat-template (если когда-нибудь понадобится читать HF-шаблоны моделей).
- **handlebars** — AST лучший по качеству (`loc` у каждого узла), но синтаксис `{{#if}}/{{#each}}` вместо
  `{% %}` из спеки, а любая новая конструкция — это «хелпер», т.е. `{{#switch}}` с `{{#case}}` выглядит
  чужеродно и в AST не отличается от вызова функции. Плюс тащит компилятор в 2.8 МБ.

Финалист — **liquidjs**.

## 2. ДОКАЗАТЕЛЬСТВО: реально запущенный парс AST

Скрипт: `/private/tmp/claude-501/.../scratchpad/probe/ast-probe.cjs` (запущен `node ast-probe.cjs`).
Шаблон (Liquid-диалект), один и тот же для liquidjs/nunjucks/jinja:

```liquid
Ты подбираешь отель. Сегодня {{ date }}.
{{ request }}
{% if request.with_kids %}Оцени детскую инфраструктуру.{% endif %}
{% for h in hotels %}- {{ h.name }} / {{ h.price | round }}
{% endfor %}
{% include 'tone@3' %}
{{ output_format }}
```

### liquidjs 10.29.0 — реальный вывод

```
HTML begin=0
Output content="date" begin=29
HTML begin=39
Output content="request" begin=41
HTML begin=54
IfTag name=if args="request.with_kids" content="if request.with_kids" begin=55
  branch cond=...
    HTML begin=81
HTML begin=121
ForTag name=for args="h in hotels" content="for h in hotels" begin=122
  HTML begin=143
  Output content="h.name" begin=145
  HTML begin=157
  Output content="h.price | round" begin=160
  HTML begin=181
HTML begin=194
IncludeTag name=include args="'tone@3'" content="include 'tone@3'" begin=195
HTML begin=217
Output content="output_format" begin=218
-- фильтры разобраны отдельно --
  Output token.content= "date"            filters= []
  Output token.content= "request"         filters= []
  Output token.content= "h.name"          filters= []
  Output token.content= "h.price | round" filters= [ 'round' ]
  Output token.content= "output_format"   filters= []
```

Ключевое, что отсюда следует:
- узлы различимы по `constructor.name`: `HTML` (статический текст → R-T7/R-T8/R-T12),
  `Output` (плейсхолдер → R-T1/R-T6), `IfTag` (→ R-T3), `ForTag` (→ R-T5), `IncludeTag` (→ версии фрагментов);
- у **каждого** токена есть `begin`/`end`/`input` → диагностику можно привязать к позиции в YAML (offset→line:col);
- `IfTag.branches[i].templates` и `ForTag.templates` дают вложенность → scope-tracking переменной цикла `h`;
- `Output.value.filters` — массив `{name, args}` → белый список фильтров проверяется по имени напрямую;
- `token.args` у тега — сырой текст аргументов (`"request.with_kids"`, `"h in hotels"`, `"'tone@3'"`),
  т.е. для `include` мы сами разбираем `fragment@version`.

### handlebars 4.7.9 — реальный вывод (для сравнения качества AST)

```
Program @1:0
  ContentStatement text="Ты подбираешь отель. Сегодня" @1:0
  MustacheStatement @1:29
    PathExpression path=date @1:32
  BlockStatement helper=if @3:0
    PathExpression path=request.with_kids @3:6
    Program @3:25
      ContentStatement text="Оцени детскую инфраструктуру" @3:25
  BlockStatement helper=each @4:0
    PathExpression path=hotels @4:8
    Program @4:16
      MustacheStatement @4:18
        PathExpression path=this.name @4:21
      MustacheStatement @4:36
        PathExpression path=this.price @4:45
        PathExpression path=round @4:39
  PartialStatement partial=tone_v3 @6:0
  MustacheStatement @7:0
    PathExpression path=output_format @7:3
```
(`loc` строка:колонка у каждого узла — лучше, чем offset у liquidjs, но это единственное преимущество.)

### @huggingface/jinja 0.5.10 — реальный вывод

```
Program
  StringLiteral value="Ты подбираешь отель. Сегодня"
  Identifier value="date"
  If
    MemberExpression
      Identifier value="request"
      Identifier value="with_kids"
    StringLiteral value="Оцени детскую инфраструктуру"
  For
    Identifier value="h"
    Identifier value="hotels"
    MemberExpression
      Identifier value="h"
      Identifier value="name"
    FilterExpression
      MemberExpression
        Identifier value="h"
        Identifier value="price"
      Identifier value="round"
  Identifier value="output_format"
```
(чистейший AST, но `{% include %}` он вообще не понимает — пришлось вырезать из шаблона, и своего тега не добавить.)

### eta 4.6.0 — реальный вывод (дисквалификация)

```
Eta.parse('Hi <%= it.date %> <% if (it.kids) { %>K<% } %>')
[ "Hi ", {"t":"i","val":"it.date"}, " ", {"t":"e","val":"if (it.kids) {"}, "K", {"t":"e","val":"}"} ]
```
Плоский список, `val` — сырой JS-текст. Дерева нет, анализировать нечего.

### nunjucks 3.2.4 — парсится (`Root/Output/If/For/LookupVal/Filter/Symbol/TemplateData`), AST нормальный,
но пакет заморожен с 2023 и язык выражений шире, чем нам нужно.

## 3. ВЕРДИКТ: liquidjs 10.29.0 + собственный визитор. Свой парсер НЕ пишем.

Главное открытие, которое закрывает вопрос: **у liquidjs есть встроенный статический анализ и
встроенный `case/when` = наш `switch`.** Оба проверены запуском (`probe/ast-probe2.cjs`).

### 3.1. Встроенный статический анализ — реальный вывод

```
--- liquid.parseAndAnalyzeSync(SRC, 'score_hotel.liquid', { partials: false }) ---
globals: date@1:12 | request@1:24,2:7 | hotels@3:13 | output_format@4:4
fullVariables:      [ 'date','request','request.with_kids','hotels','h.name','h.price','output_format' ]
variableSegments:   [["date"],["request"],["request","with_kids"],["hotels"],["h","name"],["h","price"],["output_format"]]
globalFullVariables:[ 'date','request','request.with_kids','hotels','output_format' ]
```

Сигнатуры (`node_modules/liquidjs/dist/liquid.d.ts`, `dist/template/analysis.d.ts`):

```ts
analyzeSync(template: Template[], options?: StaticAnalysisOptions): StaticAnalysis;
parseAndAnalyzeSync(html: string, filename?: string, options?: StaticAnalysisOptions): StaticAnalysis;
fullVariablesSync(t: string | Template[], o?): string[];          // 'request.with_kids'
variableSegmentsSync(t, o?): SegmentArray[];                       // [['request','with_kids']]
globalFullVariablesSync(t, o?): string[];                          // только НЕ-локальные (без h.name из for)
interface StaticAnalysis { variables: Variables; globals: Variables; locals: Variables }
type Variables = { [rootName: string]: Variable[] };
class Variable { segments: Array<string|number|Variable>; location: { row, col, file? } }
```

Что это даёт даром:
- **R-T1**: `globalFullVariablesSync` = ровно множество внешних путей → сверяем с объявленными слотами и
  типами из реестра. Переменные цикла (`h.name`) исключены автоматически — они в `locals`, не в `globals`.
- **R-T2**: обратное сравнение того же множества с `in:` → неиспользованные слоты.
- Диагностика с `row/col` из коробки (`variable.location`), не надо самим считать offset→line:col.
- `StaticAnalysisOptions.partials` (по умолчанию `true`) — анализ **проходит внутрь `{% include %}`/`{% render %}`,
  подгружая их через `fs`-loader. Для фрагментов `fragment@v` мы подставляем свой loader
  (`LiquidOptions.fs`) и получаем сквозной анализ шаблон+фрагменты одним вызовом.

### 3.2. `switch` по enum — это встроенный `case/when`, кастомный тег не нужен

Реальный вывод (`ast-probe2.cjs`):

```
--- case/when AST ---
CaseTag name=case args="status"
  branch values=[QuotedToken]   → HTML
  branch values=[QuotedToken]   → HTML
  else: HTML
when values: [{"kind":"QuotedToken","content":"approved","getText":"'approved'"}]
when values: [{"kind":"QuotedToken","content":"needs_revision"},{"kind":"QuotedToken","content":"minor"}]
```

Типы (`dist/tags/case.d.ts`):
```ts
export default class extends Tag {
  value: Value;                                                  // субъект switch
  branches: { values: (ValueToken|FilteredValueToken)[]; templates: Template[] }[];
  elseTemplates: Template[];
}
```
→ **R-T4** = `union(branches[].values[].content) == enumValues(typeof(subject))`, плюс правило
«`{% else %}` в `case` запрещён» (иначе неполнота маскируется).

### 3.3. Условия — доступ к токенам в RPN, реальный вывод

`{% if a.b == "x" and c.d > 3 %}` → `IfTag.branches[i] = { value: Value, templates: Template[] }`
(ВАЖНО: ключ называется `value`, не `cond`), `value.initial.postfix` — обратная польская запись:

```
[ PropertyAccessToken text='a.b' props=['a','b'],
  QuotedToken        text='"x"'  content='x',
  OperatorToken      text='==',
  PropertyAccessToken text='c.d' props=['c','d'],
  NumberToken        text='3'    content=3,
  OperatorToken      text='>' , ... ]
```

→ **R-T3** пишется как линейная проверка списка токенов, без собственного парсера выражений:
белый список операторов (`==`, `!=`, `and`, `or`, `contains`? — решаем), запрет `NumberToken`/арифметики,
проверка что `PropertyAccessToken.props` указывает на bool/optional/enum-поле, а `QuotedToken.content`
для enum-сравнения ∈ значений реестра.

### 3.4. Ужесточение движка — проверено запуском

```js
new Liquid({ strictVariables: true, strictFilters: true, ownPropertyOnly: true, jsTruthy: false })
// strictVariables -> UndefinedVariableError: undefined variable: nope, line:1, col:4
// strictFilters   -> ParseError: undefined filter: nofilter, line:1, col:1
// registered filters count = 88
```
88 встроенных фильтров — **слишком много** (`date`, `where`, `sort`, `map`, `default`, `json`...).
Наш белый список ≈ 8-10 → на старте вызываем `liquid.unregisterFilter(name)` для всего, чего нет в списке,
и дополнительно проверяем `Output.value.filters[].name` в визиторе (двойная защита: unregister + AST-чек).
Запрещённые теги (`assign`, `capture`, `increment`, `decrement`, `cycle`, `layout`, `block`, `tablerow`,
`liquid`, `echo`, `raw`, `render`) — тоже удаляем/запрещаем (`liquid.tags` — публичное поле
`Record<string, TagClass>`, а визитор ловит остаток). Разрешаем ровно: `if/elsif/else`, `unless`(?),
`case/when`, `for`, `include`, `comment`, `#`, плюс наш `message`.

### 3.5. Кастомный тег — проверен запуском (нужен для ролей, §4)

```js
const { Liquid, Tag } = require('liquidjs');
class MessageTag extends Tag {
  constructor(token, remainTokens, liquid, parser) {
    super(token, remainTokens, liquid);
    this.role = token.args.trim();            // 'system' | 'user' | 'assistant'
    this.templates = [];
    const stream = parser.parseStream(remainTokens)
      .on('tag:endmessage', () => stream.stop())
      .on('template', (tpl) => this.templates.push(tpl))
      .on('end', () => { throw new Error('{% endmessage %} not found'); });
    stream.start();
  }
  *render(ctx, emitter) { yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter); }
}
liquid.registerTag('message', MessageTag);
```
Реальный вывод:
```
MessageTag role=system children=HTML
MessageTag role=user   children=Output
render: Ты судья.|привет
```
Сигнатура из `dist/template/tag.d.ts`: `new (token: TagToken, tokens: TopLevelToken[], liquid: Liquid, parser: Parser): Tag`,
`registerTag(name: string, tag: TagClass | TagImplOptions): void`.

### 3.6. Карта правил → механика обхода

| Правило | Механика |
|---|---|
| R-T1 | `globalFullVariablesSync` ∖ объявленные слоты → ошибка; тип поля берём из реестра по сегментам |
| R-T2 | объявленные слоты ∖ `globalFullVariablesSync` → ошибка, если нет `unused: причина` |
| R-T3 | визитор `IfTag.branches[].value.initial.postfix`: белый список `OperatorToken`, тип левого `PropertyAccessToken`, `QuotedToken.content` ∈ enum |
| R-T4 | `CaseTag.branches[].values[].content` == полный enum; `elseTemplates.length === 0` |
| R-T5 | `ForTag.token.args` → `h in hotels`; тип `hotels` обязан быть array; внутри тела `h.*` резолвится к типу элемента (scope-стек визитора) |
| R-T6 | считаем `Output`, где путь == `output_format`, по всему дереву **включая ветви** → ровно 1; плюс регексп-эвристики по `HTML`-узлам (```json, "type":, Return JSON) |
| R-T7/R-T8/R-T12 | сканируем **только `HTML`-узлы** (`n.constructor.name === 'HTML'`, текст `token.input.slice(token.begin, token.end)`): enum-подобные слова не из реестра, литералы из справочников, стоп-фразы |
| R-T9 | рекурсивная max-оценка (см. §5) |
| R-T10 | не синтаксис: сверка `in:`-слотов и `view`-полей с политикой видимости узла |
| R-T11 | поле `lang` в YAML-заголовке промта, не в тексте |

**Свой мини-парсер не пишем.** Оценка была бы ~1.5-2.5 тыс. строк (лексер + теги + выражения + позиции +
рендер + стриминг) плюс вечное сопровождение; liquidjs даёт это + 88 фильтров + анализ + позиции при
1.9 МБ и живом релизном цикле (2026-08-11). Наш код — только визитор (~400-600 строк) и правила.

**Подводные камни liquidjs:**
- `liquid.parser` помечен `@deprecated` в `liquid.d.ts` («In tags use `this.parser` instead») — в кастомных
  тегах брать `parser` из аргумента конструктора.
- `IfTag` ветка — `{ value, templates }`, НЕ `{ cond, ... }` (в старых статьях встречается `cond`).
- `Output.value.initial.postfix` — итератор/массив токенов; копировать через `[...]` перед анализом.
- `unless`, `{% liquid %}` (инлайн-режим) и `{% raw %}` надо явно запретить, иначе обход мимо правил.
- Анализ partials по умолчанию ВКЛЮЧЁН и лезет в файловую систему → задать свой `fs`-loader или
  `{ partials: false }` + собственный обход `IncludeTag`.

## 4. Один шаблон → массив сообщений + точки кэширования

### 4.1. Куда это отдаётся (VoltAgent 2.10, проверено в d.ts и docs пакета)

`node_modules/@voltagent/core/dist/index.d.ts:2949`:
```ts
interface PromptContent {
  type: "text" | "chat";
  text?: string;
  messages?: ChatMessage[];   // ChatMessage = BaseMessage
  metadata?: { prompt_id?, prompt_version_id?, name?, version?, labels?, tags?, source?, ... };
}
type InstructionsDynamicValue = string | DynamicValue<string | PromptContent>;  // :8051
```
`docs/agents/prompts.md:104-158` — дословный пример с ролями и провайдерными опциями:
```ts
instructions: async () => ({
  type: "chat",
  messages: [
    { role: "system",
      content: "Long system prompt that should be cached...",
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral", ttl: "5m" } } } },
  ],
})
```
→ **наш рендерер возвращает ровно `PromptContent{type:'chat'}`**, метаданные (`name`, `version`)
заполняем из заголовка промта — это бесплатно даёт связь трейса с версией шаблона.

Подтверждение на уровне провайдера (`@ai-sdk/anthropic/dist/index.d.ts:237`):
```ts
cacheControl: z.ZodOptional<z.ZodObject<{
  type: z.ZodLiteral<"ephemeral">;
  ttl: z.ZodOptional<z.ZodUnion<["5m", "1h"]>>;
}>>
```
То есть в AI SDK v6 доступны **оба TTL: 5m и 1h**, через `providerOptions.anthropic.cacheControl`.

### 4.2. Как из ОДНОГО шаблона получить массив сообщений

Решение: кастомный блочный тег `{% message %}` (реализация и запуск — §3.5) + правила компилятора.

```liquid
{% message system cache %}
  {% include 'role_judge@3' %}
  {% include 'tone@2' %}
  {{ output_format }}
{% endmessage %}
{% message user %}
  Запрос: {{ request }}
  Кандидаты:
  {% for c in candidates %}[{{ c.label }}] {{ c.text }}
  {% endfor %}
{% endmessage %}
```

Рендер: обходим верхний уровень AST; каждый `MessageTag` рендерим **отдельно**
(`liquid.renderer.renderTemplates(tag.templates, ctx, emitter)` — как в §3.5) и кладём в `messages[]`
с его `role`. Текст вне `{% message %}` на верхнем уровне = неявное `system` (совместимость с простыми
шаблонами вида §7.6-примера, где ролей нет вообще).

Правила компилятора поверх этого (дополнение к R-T1..R-T12):
- роли только `system|user|assistant`, порядок `system*` → (`user`|`assistant`)*, ровно один `user` последним
  для одношотовых узлов;
- `{{ output_format }}` обязан быть в **последнем** сообщении или в `system` — решаем один раз для всех
  архетипов, иначе R-T6 проходит, а модель формат игнорирует;
- `{% message %}` нельзя вкладывать в `{% if %}`/`{% for %}` (иначе число сообщений зависит от данных
  и ломаются кэш-префиксы) — проверяется визитором: `MessageTag` встречается только на верхнем уровне.

### 4.3. Точки кэширования — схема

Инвариант: **кэшируемый префикс = всё, что не зависит от входных данных**. AST это даёт напрямую —
поддерево `MessageTag` «статично», если в нём нет ни одного `Output`/`IfTag`/`ForTag`/`CaseTag`
(только `HTML` + `IncludeTag` со статичными фрагментами + `{{ output_format }}`, который детерминирован
типом выхода, а не данными).

Порядок сборки, он же порядок кэш-выгоды:
1. `system` (роль, тон, доменные фрагменты, `output_format`) — статичен → **точка кэша**;
2. few-shot `examples` — статичны в рамках версии шаблона → вторая точка кэша, если ретривер не динамический;
3. `user` с данными — не кэшируется.

Провайдерные различия:
- **Anthropic**: кэш **явный**. Ставим `providerOptions.anthropic.cacheControl = { type:'ephemeral', ttl:'5m'|'1h' }`
  на последнее статичное сообщение (ПРОВЕРЕНО по докам, см. 4.5: максимум **4** breakpoint'а, минимум префикса зависит от модели).
- **OpenAI**: кэш **автоматический** по префиксу, включается примерно с 1024 токенов, управлять нечем
  (ПРОВЕРЕНО, см. 4.5; есть `prompt_cache_key` только для учёта/шардирования).
  Наша задача сводится к **стабильности префикса**: детерминированный порядок полей во views,
  никаких дат/ID/random в начале промта, `{{ date }}` — только в `user`-сообщении.
- Отсюда правило компилятора **R-T13 (новое, предложение)**: системные слоты (`run.date`, `locale`, `tz`)
  запрещены в сообщениях, помеченных `cache`.

### 4.4. Что именно кэшируем — решение
Одна кнопка в профиле модели: `cache: none | system | system+examples`. Компилятор проверяет, что
помеченный блок статичен, и оценивает его размер (§5); если меньше порога провайдера — предупреждение
«кэш не сработает, блок мал».

### 4.5. Цифры кэша — проверено по официальным докам (2026-09-11)

**Anthropic** — https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching
- Максимум **4 явных `cache_control` breakpoint'а** на запрос.
- TTL: `{"type":"ephemeral"}` = 5 мин (дефолт), `{"type":"ephemeral","ttl":"1h"}` = 1 час.
- Минимальная длина кэшируемого префикса **зависит от модели**: 512 (Fable 5.1 / Mythos 5.1 / Opus 5 /
  Fable 5 / Mythos 5), 1024 (Sonnet 5 / 4.6 / 4.5, Opus 4.8), 2048 (Mythos Preview, Opus 4.7, Haiku 3.5),
  4096 (Opus 4.6 / 4.5, Haiku 4.5).
- Цена: запись 5m = **1.25×** input, запись 1h = **2.0×** input, чтение = **0.1×** input
  (у Fable 5.1 / Mythos 5.1 чтение 0.025×).
→ **Следствие для нас:** порог «кэш не сработает, блок мал» берётся из профиля модели (512…4096),
а не константой. Это поле в реестре профилей: `cache_min_tokens`, `cache_max_breakpoints: 4`.

**OpenAI** — https://developers.openai.com/api/docs/guides/prompt-caching
- Кэш **включён по умолчанию**, управлять нечем.
- Минимум для GPT-5.6+ — **1024 видимых входных токена**; у более ранних моделей зависит от наличия
  tools/images/schema/reasoning effort.
- Учёт кэшированных токенов у ранних моделей округляется вниз до кратного **128**.
- `prompt_cache_key` — только разделение учёта/маршрутизация, на сам кэш не влияет.
- Цена GPT-5.6+: чтение **0.1×**, запись **1.25×**. Удержание: минимум 30 мин через
  `prompt_cache_options.ttl` (ранние — «обычно ~30 мин», in-memory 5-10 мин).
→ **Следствие:** для OpenAI единственный рычаг — стабильный префикс. Отсюда требование
детерминированной сериализации views (фиксированный порядок полей) и запрет `{{ date }}` в system.

## 5. Оценка размера промта (R-T9): токенизаторы в TS

### 5.1. Реальный замер (`probe/tok-bench.cjs`, node 20, запущено)

```
┌─────────┬───────┬─────────────────────┬───────────────────┬──────────────────┬───────────────────┐
│ (index) │ chars │ gpt-tokenizer o200k │ js-tiktoken o200k │ anthropic legacy │ chars/4 heuristic │
├─────────┼───────┼─────────────────────┼───────────────────┼──────────────────┼───────────────────┤
│ RU      │ 297   │ 86                  │ 86                │ 161              │ 75                │
│ EN      │  77   │ 15                  │ 15                │  15              │ 20                │
│ JSONISH │  78   │ 29                  │ 29                │  28              │ 20                │
└─────────┴───────┴─────────────────────┴───────────────────┴──────────────────┴───────────────────┘
load ms: gpt-tokenizer=80  js-tiktoken=303  anthropic=16
gpt-tokenizer: 34400 tokens, 20x118800 chars in  126 ms
js-tiktoken  : 34400 tokens, 20x118800 chars in 2923 ms
anthropic    : 64400 tokens, 20x118800 chars in  816 ms
```

Выводы из замера:
- `gpt-tokenizer@4.0.0` и `js-tiktoken@1.0.21` дают **идентичные** числа на o200k_base (86/15/29 и 34400) —
  разница только в скорости: **gpt-tokenizer в ~23 раза быстрее** (126 мс против 2923 мс на 2.4 МБ текста).
- `@anthropic-ai/tokenizer@0.0.4` на русском даёт **161 против 86 — почти 2× завышение**. Это старый
  Claude-2-токенайзер (пакет так и описан: «Claude tokenizer», версия 0.0.4, последняя модификация 2026-06-04
  — по факту не обновлялся под Claude 3+/4+/5). **Не использовать для расчётов**, кроме грубой верхней границы.
- Эвристика `chars/4` на русском **занижает** (75 против 86) — как верхняя оценка не годится вообще.

### 5.2. Пакеты

| Пакет | Версия | Лицензия | time.modified | unpacked | Вердикт |
|---|---|---|---|---|---|
| `gpt-tokenizer` | 4.0.0 | MIT | 2026-08-16 | 27.2 MB | **берём**; импорт только нужного энкодинга `gpt-tokenizer/encoding/o200k_base` (иначе тянется всё) |
| `js-tiktoken` | 1.0.21 | MIT | 2025-08-09 (**13 мес — риск**) | 22.4 MB | не берём: в 23 раза медленнее при тех же числах |
| `@anthropic-ai/tokenizer` | 0.0.4 | Apache-2.0 | 2026-06-04 | 1.4 MB | не берём для точности; устаревший BPE |
| `tokenizers` (HF, napi) | 0.23.2 | Apache-2.0 | 2026-09-03 | 66.7 MB | нативный бинарь под платформу; нужен только если будем считать open-weight модели по их `tokenizer.json` |

### 5.3. Точность для не-OpenAI моделей и что с этим делать

- Для Claude точного локального токенайзера нет. Точное число даёт **эндпоинт Anthropic
  `/v1/messages/count_tokens`** (UNVERIFIED: подтвердить сигнатуру и лимиты по докам перед публикацией) —
  это сетевой вызов, в компиляторе по каждому изменению шаблона его гонять нельзя.
- Для Gemini/Llama/Qwen o200k тоже приблизителен.
→ **Решение: двухуровневая оценка.**
  1. **Компилятор (offline, R-T9)** — `gpt-tokenizer` o200k_base + коэффициент запаса из профиля модели
     (`token_ratio`, по умолчанию 1.15 для латиницы, **1.3 для кириллицы/CJK**) + фиксированный резерв на
     `output_format`, tool-схемы и max_output. Проверка: `upper_bound <= context_window * 0.9`.
  2. **Рантайм (точно)** — фактические `usage.inputTokens` из ответа модели пишем в трейс; если факт
     превысил offline-оценку больше чем на X%, калибруем `token_ratio` профиля. Это самонастройка,
     а не ручная константа.

### 5.4. Как считать **верхнюю** оценку по AST (а не по отрисовке)

Рекурсивный обход с функцией `maxTokens(node, typeEnv)`:
- `HTML` → токенизируем статический текст один раз (кэшируется по хэшу узла);
- `Output` → `maxTokens(type)` из реестра: скаляры — по типу (enum → самое длинное значение; строка —
  по `maxLength` из схемы, обязателен), view сущности — сумма полей view;
- `IfTag` → `max(ветвей)` (не сумма!), `else` учитывается как ветвь;
- `CaseTag` → `max(branches)`;
- `ForTag` → `maxItems` массива (обязателен в схеме) × `maxTokens(тело)`;
- `IncludeTag` → рекурсия во фрагмент версии `@v`.
Отсюда жёсткое требование к реестру типов: **у каждой строки — `maxLength`, у каждого массива — `maxItems`**,
иначе R-T9 недоказуемо. Это надо записать как правило реестра (R-R?), а не шаблонов.

## 6. GEPA / оптимизация промтов в TypeScript (фаза 2)

### 6.1. `gepa-ts@1.0.0` — МЁРТВЫЙ, не брать

`npm view gepa-ts`:
```
time = { created: '2025-09-05T11:31:14.205Z', '1.0.0': '2025-09-05T11:31:14.424Z',
         modified: '2025-09-05T11:31:14.719Z' }        // ровно 12 месяцев, одна-единственная версия
repository.url = 'git+https://github.com/yourusername/gepa-ts.git'   // ПЛЕЙСХОЛДЕР, не заменён автором
maintainers = 'drewstone <drewstone329@gmail.com>'
dependencies = { '@ax-llm/ax': '^14.0.20', commander: '^14', dotenv: '^16', openai: '^4.52', zod: '^3.22' }
```
Скачиваний за месяц: **136** (`api.npmjs.org/downloads/point/last-month/gepa-ts`).
Зависит от `@ax-llm/ax@^14`, при живом мажоре **24**. Заявлено «100% feature parity» с питоновским GEPA,
но одна публикация, плейсхолдер в репозитории и мёртвая зависимость → **дисквалификация**.

### 6.2. `@ax-llm/ax@24.0.18` — живой, GEPA есть

- Лицензия Apache-2.0, `time.modified = 2026-09-09` (вчера), **221 583** загрузки за месяц,
  репозиторий `github.com/ax-llm/ax`.
- README (raw.githubusercontent.com/ax-llm/ax/main/README.md) содержит класс **`AxGEPA`**:

```ts
const optimizer = new AxGEPA({
  studentAI: student, teacherAI: teacher,
  numTrials: 16, minibatch: true, minibatchSize: 6, seed: 42,
});
const result = await optimizer.compile(
  emailFlow, trainSet,
  async ({ prediction, example }) => ({
    accuracy: prediction.priority === example.priority ? 1 : 0,
    brevity: (prediction.rationale?.length ?? 0) <= 60 ? 1 : 0.4,
  }),
  { auto: 'medium', validationExamples: valSet, maxMetricCalls: 240 },
);
```
Также упомянут `AxBootstrapFewShot` (few-shot bootstrapping). MiPRO в README не найден.

### 6.3. Вердикт для фазы 2

**Не тащить `ax` в рантайм.** Ax — это целый DSPy-подобный фреймворк со своими сигнатурами, своим слоем
провайдеров и своей генерацией промтов; он конкурирует с нашим ядром доверия (IR + компилятор + шаблоны),
а не дополняет его. Взять его как рантайм = отдать формат вывода и структуру промта чужой библиотеке,
что прямо противоречит §7.6 («платформа владеет данными, типами и форматом»).

**Что берём:**
1. **Метрику и цикл** — наш: `@voltagent/evals@2.0.5` + golden-тесты узла (см. заметку по evals).
2. **Оптимизируемая единица** — не «промт целиком», а **текстовые узлы `HTML` в AST шаблона**
   (см. §3): GEPA мутирует только их, а слоты, `{% if %}`, `output_format` и типы неприкосновенны и
   после каждой мутации перепроверяются компилятором (R-T1..R-T12). Это и есть наше преимущество перед
   ax/DSPy: мутант, нарушивший контракт, отбраковывается статически, ещё до запуска модели.
3. **`AxGEPA` — опционально, как оффлайн-процесс** в фазе 2: отдельный CLI, который читает наши шаблоны,
   гоняет эволюцию на train/val-выборке и возвращает кандидатов текста → они входят обратно через
   обычную операцию правки промта с версией и диффом. Изоляция в отдельном процессе снимает конфликт
   зависимостей (`ax` тянет свой стек; наш рантайм прибит к `ai@6` из-за VoltAgent).
4. Если `AxGEPA` не подойдёт — сам алгоритм GEPA (reflective mutation + Pareto-фронт по метрикам)
   реализуется поверх нашего IR в ~300-500 строк, потому что вся дорогая часть (метрики, прогон,
   кассеты, трейсы) у нас уже будет.

**Риск-заметка:** `@ax-llm/ax` — мажорная версия 24 при возрасте проекта ~2 года, т.е. **ломающие релизы
идут часто**. Пинить точную версию, не `^`.

---

## Сводка вердиктов (для техписателя)

| Вопрос | Вердикт |
|---|---|
| Движок шаблонов | **liquidjs 10.29.0** (MIT, 7.93 млн загрузок/мес), строгий режим + вычищенный список фильтров/тегов |
| Свой парсер | **не пишем**; наш код — визитор ~400-600 строк + правила |
| `switch` по enum | встроенный `{% case %}/{% when %}`, `{% else %}` внутри `case` запрещаем |
| R-T1/R-T2 | встроенный `liquid.globalFullVariablesSync()` / `analyzeSync()` с `row/col` |
| Роли сообщений | кастомный тег `{% message role %}` → `PromptContent{type:'chat'}` VoltAgent |
| Кэш | Anthropic — явный `cacheControl{type:'ephemeral',ttl:'5m'|'1h'}`, ≤4 breakpoint'а, порог 512-4096 ток. по модели; OpenAI — автоматом, наша задача только стабильный префикс |
| Токенайзер | **gpt-tokenizer 4.0.0**, импорт `gpt-tokenizer/encoding/o200k_base`, в 23× быстрее js-tiktoken при тех же числах; коэффициент запаса 1.3 для кириллицы; калибровка по факту из трейсов |
| GEPA | `gepa-ts` мёртв (136 dl/мес, 1 версия, плейсхолдер в repo); `@ax-llm/ax` жив (`AxGEPA`), но только как **оффлайн-CLI фазы 2**, не в рантайме |
