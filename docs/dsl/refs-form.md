# Форма DSL на лексических ссылках (срез 1)

Статус: проба. Ответ на прочтение №1 вопроса «DI вместо строковых ключей»: ссылка на узел — обращение к
значению (`load_hotels.out`), а не строка `"$load_hotels.out"`. Всё проверено запуском:
`scratchpad/probe-dsl`, TypeScript 6.0.3 `--strict`, Node 20.19.0, ts-morph 28.0.0. IR остаётся строковым —
грамматика 04 §3.1 не меняется ни на символ.

## 1. Откуда берётся id узла

| Источник id | Что даёт | Что ломается |
|---|---|---|
| Имя переменной | id не дублируется | в рантайме синтеза имени нет: его читает только AST, синтез перестаёт быть функцией значений |
| Ключ записи `nodes: { load_hotels }` | id и членство одной записью | сокращённая запись делает id псевдонимом переменной (проба ниже) |
| Явный первый аргумент `tool("load_hotels", {…})` | id — литерал, независимый от имени переменной | согласованность id и имени держит линтер |

Проба `cm.mjs`, `VariableDeclaration.rename("hotels_raw")` через language service: при shorthand запись `nodes: { load_hotels }` превращается в `nodes: { hotels_raw, top3 }` — **`rename` переписал и ключ**, то есть локальный
рефакторинг переменной молча сменил бы `node_id` в IR (ловушка CDK из обязательств ADR-0018: «идентичность
узла не выводить из пути в дереве конструктов»). При явном id строка не тронута, а её отдельная правка
локальна: `changed bytes [25,36) "load_hotels" -> "hotels_raw"`.

**Решение: id — явный первый аргумент фабрики; членство и порядок — массив `nodes: [a, b, …]`.** Массив не
заводит третьего имени, переименование переменной правит его через LS автоматически, добавление узла —
`insertElement` (жест уже есть в canvas-edit §1). Якорь кодмода оттуда же — «`CallExpression`, первый аргумент
которого строковый литерал id» — сохраняется дословно.

## 2. Ссылка вперёд: `final_pitch` → `fix`

Проба `src/fwd.ts`, `final_pitch` объявлен выше `fix`:

```
src/fwd.ts(9,33): error TS2448: Block-scoped variable 'fix' used before its declaration.
src/fwd.ts(9,33): error TS2454: Variable 'fix' is used before being assigned.
```

**Ошибка компиляции, а не TDZ в рантайме синтеза** — до исполнения дело не доходит, позиция точная.
Альтернативы — thunk `() => fix` (ссылка перестаёт быть литеральной цепочкой) и record-параметр `flow(($) =>
…)`, форма (в) type-ergonomics, где удаление узла переписывает биндинги. **Берём топологический порядок
объявлений**: для DAG он есть всегда, в `hotel_pitch` — перенос трёх строк, `order` задаёт массив `nodes`.
Остаточный риск: `$<node>.in.<slot>` (04 §3.1) даёт лексический цикл там, где цикла в данных нет, —
единственное место, где линтер разрешает thunk.

## 3. `$item` в `map` и `loop`

Проба `neg/e-item.ts`, обращение к параметру `map.do` снаружи: `neg/e-item.ts(7,88): error TS2304: Cannot find
name 'hotel'.`

Правило 9 из 04 §3.3 («тела не адресуются извне») и строка «`$item` вне тела типы не ловят» из shape.md §3
**ловятся типами бесплатно** — областью видимости замыкания; символ `map.item` этого не даёт, он виден всему
файлу. Вызов замыкания ровно один раз символическим `$item` уже разрешён в ADR-0018 §Синтез. **Берём
замыкание**, линтер ограничивает тело стрелки одним вызовом фабрики с объектным литералом — без `?:`, `&&`,
блоков и `return`; «код не порождает форму» (ADR-0019) остаётся истинным синтаксически, тело — литералом под
кодмодом.

## 4. Вложенные тела

`map.do` и `loop.body` — замыкания. `switch.cases`, `parallel.branches`, `try.catch` — записи литералов: ветка
либо значение (`accept: pick.out.best`), либо узел-переход (`revise: fix`), различает их синтез по метке.
Наружу ссылка обычная лексическая, внутрь невозможна: `const` внутри стрелки не экспортируется, вложенный
литерал анонимен. Входы компонента — `root<…>("in")`.

## 5. Синтез в IR

Обход `nodes: [...]` по порядку, `id` из первого аргумента фабрики, карта `объект узла → id` (то же для
компонентов). Обход тела вглубь: `Ref` (Proxy с меткой `REF`) заменяется строкой — корень `$<id>.out` для
узла, `$input`/`$in`/`$item` для свободных корней, дальше сегменты `.field` и `[*]`. `map.do` вызывается один
раз с `root("item")` и даёт анонимный вложенный узел; узел в `switch.cases` → `{ node: id }`, компонент в
`params` → `{ component: name }`. Ссылка на узел вне массива `nodes` — **ошибка синтеза, не типов**:
`src/orphan.ts` даёт `ref is Ref: true | target registered: false` → `unregistered node: … absent from
'nodes'`. Прогон `dist/synth.js` дал IR, совпадающий с shape.md §4 дословно: `over: "$load_hotels.out"`,
`do.in: { hotel: "$item", request: "$input" }`, `cases: { accept: "$pick.out.best", revise: { node: "fix" }
}`, `output.from: "$render.out"`, `allowedSets[0].from: "$in.hotels[*].features[*].id"`; два прогона —
побайтово идентичный файл (`cmp ir3.json ir4.json`), требование ADR-0018. `[*]` эмитится по явному сегменту
`$all`: рантайм типов не видит, поэтому подъём пишется в исходнике, а не угадывается.

## 6. `hotel_pitch` целиком на ссылках

```ts
import { defineFlow, defineComponent, tool, llm, code, call, human, map, branch, root, c } from "@aqven/dsl"
import { diverge, judge, criticLoop } from "@aqven/std"
import { hotelsByFilters } from "@aqven/lib/db"
import { pickTopK, renderPitch } from "./code/pitch.js"
import { scoreHotel, pitchGen as pitchGenFn } from "./prompts/index.js"
import { t, Hotel, TourRequest } from "./types.js"

const $p = root<{ hotels: Hotel[]; request: TourRequest }>("in")
const gen = llm("gen", { description: "Генерация питча по трём отелям", fn: pitchGenFn, modelRole: "writer",
  overrides: { maxOutputTokens: 1200 }, trustIn: "trusted",
  allowedSets: [{ type: t.FeatureId, from: $p.hotels.$all.features.$all.id }],
  outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
  in: { hotels: $p.hotels, request: $p.request } })
const pitchGen = defineComponent({ name: "pitch_gen", in: { hotels: t.HotelArr, request: t.TourRequest },
  out: { type: t.Pitch, from: gen.out }, nodes: [gen] })

const $input = root<TourRequest>("input")

const load_hotels = tool("load_hotels", { description: "Отели по фильтрам заявки", effect: "read",
  tool: hotelsByFilters, ttlSeconds: 3600, timeoutMs: 10_000, out: t.HotelArr, in: { filters: $input.filters } })
const score_hotels = map("score_hotels", { description: "Оценка каждого отеля под заявку", itemType: t.Hotel,
  over: load_hotels.out, concurrency: 8, onItemError: "skip", maxItems: 200, budget: { usdMicros: 80_000 },
  do: (hotel) => llm("score", { fn: scoreHotel, modelRole: "small_fast", trustIn: "trusted",
    overrides: { seed: 7, maxOutputTokens: 400 },
    outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
    in: { hotel, request: $input } }) })
const top3 = code("top3", { description: "Топ-3 отеля по оценкам", fn: pickTopK, pure: true, timeoutMs: 5_000,
  out: t.HotelArr, in: { scores: score_hotels.out, hotels: load_hotels.out, k: c(3, t.Int) } })
const pitches = call("pitches", { description: "Три питча с разной температурой", component: diverge,
  typeArgs: [t.Pitch], params: { body: pitchGen }, out: t.PitchArr,
  in: { hotels: top3.out, request: $input, n: c(3, t.Int), vary: c({ temperature: [0.4, 0.8, 1.1] }, t.VaryPlan) } })
const pick = call("pick", { description: "Попарное сравнение с перестановкой позиций", component: judge,
  typeArgs: [t.Pitch], out: t.PitchVerdict, in: { candidates: pitches.out, request: $input,
    mode: c("pairwise", t.JudgeMode), swapPositions: c(true, t.Bool), modelRole: c("judge_strong", t.ModelRole) } })
const fix = call("fix", { description: "Критика и правка до порога оценки", component: criticLoop,
  typeArgs: [t.Pitch], out: t.Pitch, budget: { usdMicros: 100_000 },
  in: { pitch: pick.out.best, request: $input, maxIter: c(2, t.Int), threshold: c(0.8, t.Score),
    select: c("best", t.LoopSelect), modelRole: c("writer", t.ModelRole) } })
const review = human("review", { description: "Ручной разбор конфликта фактов", form: t.PitchReviewForm,
  timeoutSeconds: 86_400, onTimeout: "escalate", out: t.Pitch, in: { pitch: pick.out.best, verdict: pick.out } })
const final_pitch = branch("final_pitch", { description: "Решение судьи", on: pick.out.decision,
  onType: t.PitchDecision, default: null, cases: { accept: pick.out.best, revise: fix, escalate: review } })
const render = code("render", { description: "Подстановка фактов отелей по FeatureId", fn: renderPitch,
  pure: true, timeoutMs: 5_000, out: t.PitchText, in: { pitch: final_pitch.out, hotels: load_hotels.out } })

export default defineFlow({ flow: "hotel_pitch", version: 7, input: t.TourRequest,
  output: { type: t.PitchText, from: render.out }, context: ["date", "locale"],
  budget: { usdMicros: 400_000, seconds: 120, tokens: null },
  policies: { visibility: { divergeBranches: "isolated", judgeSeesProvenance: false }, trust: { defaultIn: "trusted" },
    pii: { maskInTraces: true, allowlistProfile: "pii_safe" }, escalation: { role: "manager" } },
  defaults: { retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full",
      retryOn: ["timeout", "rate_limit", "server_error"] }, timeoutMs: 60_000 },
  components: [pitchGen],
  nodes: [load_hotels, score_hotels, top3, pitches, pick, fix, review, final_pitch, render] })
```

Отличия от shape.md §4: `fix` и `review` выше `final_pitch`; `"$pick.out.best"` → `pick.out.best`; `{ node: "fix" }` → `fix`; `"$item"` → параметр `hotel`; `nodes` — массив.

## 7. Ошибки `tsc`: ссылки против строк

| Что проверяем | Ссылки (проба `neg/*.ts`) | Строки (shape.md §3) |
|---|---|---|
| Нет такого узла | `TS2552: Cannot find name 'lod_hotels'. Did you mean 'load_hotels'?` | `TS2322: … not assignable to '"$nope.out" & Err<"unknown node: nope">'` |
| Несовместимый тип слота | `TS2322: Type 'Ref<Hotel[]>' is not assignable to type 'In<Hotel>'` + 7 строк каскада до `__t` | `SlotTypeMismatch<from, slot, want, got>` — одна строка, но читать надо аргументы бренда |
| Нет такого поля в выходе | `TS2551: Property 'decisionn' does not exist on type 'Ref<PitchVerdict>'. Did you mean 'decision'?` | тип-level резолв пути, бренд без подсказки |
| `$item` вне тела | `TS2304: Cannot find name 'hotel'` | не ловится, правило компилятора |

Ссылки возвращают **спеллчек** (`Did you mean`), записанный в type-ergonomics как осознанная потеря строковой
формы, и дают его на двух уровнях — узел и поле. Проигрывают на несовместимом типе: каскад `not assignable`
разворачивается до фантомного поля; лечится инвариантным брендом — **UNVERIFIED**. Тайпчек 50 × 20 на ссылках:
Types 9 711, Instantiations 56 720, Check 0,24 с, 89 МБ; строковая форма с общим реестром — 49 182 / 191 185 /
0,38 с / 148 МБ (type-ergonomics). Замеры не эквивалентны (там zod, здесь TS-типы), но порядок один и ссылки
не дороже: тип-level парсер грамматики путей исчезает вместе с инстанцированиями.

## 8. Вердикт

**Берём форму ссылок.** Записанные причины отказа от прокси не переносятся на лексическую ссылку: билдера с
замыканиями нет (узлы — `const` с литералами, `map.do` — единственное замыкание, и оно ограничено линтером),
id узла живёт **в одном месте** — в строковом литерале первого аргумента, а не в трёх. Якорь кодмода
canvas-edit §1 сохраняется без изменений, IR не меняется вовсе.

| | Что | Доказательство |
|---|---|---|
| + | Переименование и поиск ссылок — операции IDE | `rename` правит все ссылки, `findReferencesAsNodes` их находит; id-литерал отдельно, 11 байт (§1) |
| + | Опечатка невозможна, со спеллчеком | TS2552 / TS2551 `Did you mean` (§7) |
| + | Тип-level парсер грамматики путей исчезает | §7: одна реализация грамматики вместо трёх |
| + | `$item` вне тела ловится типами | TS2304 (§3) |
| − | Топологический порядок объявлений обязателен | TS2448/TS2454 (§2) |
| − | Добавление узла — две правки (объявление + `nodes`) | §1, обе локальные, одной транзакцией |
| − | Ссылка на незарегистрированный узел — ошибка синтеза | §5, `src/orphan.ts` |
| − | Подъём `[*]` пишется явно (`$all`); каскад `not assignable` длиннее бренда | §5, §7 |

Открытое: поведение в tsserver (подсветка, тултип над `Ref<T>`) не замерялось — **UNVERIFIED**.
