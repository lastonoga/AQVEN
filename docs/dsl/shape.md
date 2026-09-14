# DSL: форма определения воркфлоу (срез 1)

> Статус: draft
> Зависит от: [canvas-edit.md](canvas-edit.md), [refs-form.md](refs-form.md), [refs-codemod.md](refs-codemod.md), [refs-types.md](refs-types.md)
> Источники: ADR-0017 (файлы, журнал `renames`), ADR-0018 (TS — язык авторинга), ADR-0019 (escape hatch), `03-core-language`, `04-ir-schema`, `08-prompts`

Узлы связываются **лексическими ссылками на значения**: `load_hotels.out`, а не строковый путь; IR остаётся строковым,
грамматику [04 §3.1](../04-ir-schema.md) печатает синтез. Проверено компиляцией: `probe-dsl/doc`, TypeScript 5.9.3
и 6.0.3, `--strict` — пример §5 и негативные пробы §3.

## 1. Форма объявления

Один файл — один воркфлоу. Узел — `const`, инициализированный **вызовом фабрики**: первый аргумент — строковый литерал
`node_id`, второй — объектный литерал полей узла. Членство и порядок — массив `nodes`.

```ts
const load_hotels = tool("load_hotels", { description: "Отели по фильтрам заявки", effect: "read",
  tool: hotelsByFilters, ttlSeconds: 3600, timeoutMs: 10_000, out: t.HotelArr, in: { filters: $input.filters } })
export default defineFlow({ flow, version, input, output, context, budget, policies, defaults, components,
  nodes: [load_hotels, score_hotels, top3] })
```

**Узел IR = один элемент `nodes`**, поле IR = свойство литерала, `camelCase` ↔ `snake_case` механически; `uses` и хеши
не пишутся — пины версий синтез берёт из `wf.lock.yaml`.

| Источник `node_id` | Что даёт | Что ломается |
|---|---|---|
| имя переменной, сокращённый ключ `nodes: { load_hotels }` | id не дублируется | `VariableDeclaration.rename()` переписывает и ключ: рефакторинг переменной молча меняет `node_id` в IR (проба `cm.mjs`, [refs-form §1](refs-form.md)) |
| **явный первый аргумент** `tool("load_hotels", {…})` | id — литерал, независимый от имени переменной, его правка локальна: `changed bytes [25,36)` | согласованность id и имени держит линтер |

`node_id` — доменный идентификатор: он попадает в IR, трассы, кассеты, датасеты и историю прогонов, поэтому вывод id
из имени переменной — ловушка логических ID AWS CDK, которую чинили восемь лет (`cdk refactor`), а ADR-0018 требует её
не повторять. Отсюда: **переименование узла — намеренная операция из двух частей** — `rename` переменной через language
service плюс правка id-литерала, одной транзакцией и с записью в журнал `renames` (ADR-0017, он же переносит координату
LWW), а не побочный эффект рефакторинга в IDE.

## 2. Примитивы и комбинаторы

| Ядро (03) | Запись в DSL |
|---|---|
| `llm` | `llm("score", { fn: scoreHotel, modelRole, overrides, outputContract, trustIn, allowedSets, in })` |
| `tool` | `tool("load_hotels", { tool: hotelsByFilters, effect: "read", ttlSeconds, timeoutMs, out, in })` |
| `code` | `code("top3", { fn: pickTopK, pure: true, timeoutMs, out, in })` |
| `human` | `human("review", { form: t.PitchReviewForm, timeoutSeconds, onTimeout: "escalate", out, in })` |
| `call` | `call("fix", { component: criticLoop, typeArgs: [t.Pitch], params, budget, out, in })` |
| `map` | `map("score_hotels", { over: load_hotels.out, itemType, concurrency, onItemError, maxItems, do: (hotel) => … })` |
| `switch` | `branch("final_pitch", { on: pick.out.decision, onType, cases: { accept, revise }, default: null })` |
| `loop` | `loop("refine", { body: (acc, iter) => …, carry, stopWhen, maxIter, select, score })` |
| `parallel` | `parallel("draft", { join: "quorum", k: 2, onBranchError: "skip", branches: { a, b } })` |
| `race`, `gate`, `try` | `race("fetch", { timeoutMs, branches })`, `gate("approve", { when, timeoutSeconds, onTimeout })`, `attempt("guarded", { body, catch, finally })` |
| `const`, `seq` | не узлы: константа — форма привязки `c(3, t.Int)`, последовательность — порядок массива `nodes` |

`switch` и `try` — зарезервированные слова JS, поэтому фабрики зовутся `branch` и `attempt`. JS-цикла, порождающего узлы,
нет: повтор выражается `map` (по данным) и `loop` (по условию), ветвление — `branch` по enum. `score_hotels` в §5 — один
вызов `map` с одним телом — даёт один узел IR при любой длине коллекции: то самое один-к-одному, ради которого канвас
правит определение ([canvas-edit §1](canvas-edit.md)).

## 3. Привязки слотов: ссылка — это значение

`load_hotels.out` — значение типа `Ref<Hotel[]>`, `Proxy` с меткой `REF`; поле выхода — обычное обращение
`pick.out.decision`. Корни объявляются один раз: `root<TourRequest>("input")` → `$input`, `root<…>("in")` → `$in`
внутри компонента; `$item` и `$iter` даёт параметр замыкания.

| Что пишем | Что печатает синтез |
|---|---|
| `load_hotels.out`, `pick.out.decision` | `"$load_hotels.out"`, `"$pick.out.decision"` |
| `$p.hotels.$all.features.$all.id` | `"$in.hotels[*].features[*].id"` |
| `c(3, t.Int)`, `{ from: pick.out.best, via: [{ pick: ["title"] }] }` | `{ const: 3, type: "Int" }`, проекция остаётся данными |

Подъём по массиву пишется **явно** сегментом `$all`: рантайм типов не видит, поэтому `[*]` эмитится по написанному, а не
угадывается по форме типа. Слоты типизирует мапленный тип `Slots<I>` над входами фабрики, `In<T> = Ref<T> | Const<T>`;
тип-level парсера грамматики путей нет вовсе — минус одна из трёх её реализаций и минус 266 700 инстанциаций на 1000
узлов ([refs-types §2](refs-types.md)). Что ловит `tsc` — тексты дословно, пробы в `doc/neg`:

| Что проверяем | Ошибка |
|---|---|
| нет такого узла | `TS2552: Cannot find name 'lod_hotels'. Did you mean 'load_hotels'?` |
| нет такого поля выхода | `TS2551: Property 'decisionn' does not exist on type 'Ref<PitchVerdict>'. Did you mean 'decision'?` |
| несовместимый тип слота | `TS2322: Type 'Ref<Hotel[]>' is not assignable to type 'In<Hotel>'` плюс 7 строк каскада до `__t` |
| параметр тела адресован снаружи | `TS2304: Cannot find name 'hotel'` |
| неполный `cases` по enum | `TS2741: Property 'escalate' is missing in type …` |

Достижимость по топологии и единственность выхода из `branch` типы не ловят — это правила компилятора (04 §3.3).

### Тела комбинаторов

`map.do` и `loop.body` — **замыкания**: `do: (hotel) => llm("score", { …, in: { hotel, request: $input } })`. Элемент —
параметр стрелки, поэтому «тела не адресуются извне» (04 §3.3, правило 9) держится областью видимости. Линтер ограничивает
тело **одним вызовом фабрики с объектным литералом** — без `?:`, `&&`, блока и `return`: «код не порождает форму»
(ADR-0019) остаётся истинным синтаксически, тело — литералом под кодмодом, а вызывается замыкание ровно один раз,
символическим `$item` (ADR-0018, §Синтез). `branch.cases`, `parallel.branches`, `attempt.catch` — записи литералов: ветка
либо значение (`accept: pick.out.best`), либо узел-переход (`revise: fix`), различает их синтез по метке `REF`.

## 4. Порядок объявлений топологический

`const` нельзя использовать до объявления — ошибка компиляции, а не TDZ в рантайме синтеза: проба `src/fwd.ts` даёт
`TS2448: Block-scoped variable 'fix' used before its declaration.` и `TS2454: Variable 'fix' is used before being
assigned.` Для DAG порядок есть всегда; в `hotel_pitch` он стоит переноса `fix` и `review` выше `final_pitch`. Позицию
вставки кодмод считает механически — `max(индекс объявления зависимости) + 1`, не больше индекса первого использования;
конфликт означает цикл и даёт отказ жеста ([refs-codemod §4](refs-codemod.md)). Настоящий цикл — `goto` назад через
`branch` и обращение `$<node>.in.<slot>` (04 §3.1) — лексически невыразим.
