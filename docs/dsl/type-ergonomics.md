# Эргономика типов DSL

> Статус: draft
> Срез 5. Зависит от: [ADR-0018](../adr/0018-typescript-authoring.md), [03. Ядро](../03-core-language.md), [05. Типы](../05-type-system.md)

## Задача

Декларативный литерал ссылается сам на себя: слот узла `B` берёт значение из выхода узла `A`, оба лежат в одном объекте. Нужно, чтобы тип выхода `A` типизировал слот `B` без аннотаций, а опечатка `"lodHotels"` падала на `tsc`. TypeScript не даёт литералу сослаться на собственный выводимый тип — вокруг этого и строятся варианты.

Всё ниже проверено запуском: `scratchpad/probe-erg`, TypeScript 6.0.3, zod 4.6.2, `strict`, `skipLibCheck`, Node 20.19.0.

| Вариант | Вывод типа | Опечатка в id | Порядок объявления | Соответствие IR |
|---|---|---|---|---|
| (а) билдер-цепочка | сквозной на прямой, ломается на развилке | ссылки нет — нет id | жёсткий | линейный, граф не выражает |
| (б) литерал + F-bounded generic | полный, через индексные типы | **ловится**, с брендом | **свободный**, форвард-ссылки работают | один-к-одному |
| (в) фабрика с контекстом | полный, через замыкание | невозможна — `const`-биндинг | жёсткий, цикл через `goto(() => x)` | один-к-одному, обратимость хуже |
| (г) две фазы | `Out<K>` да, слоты нет | ловится, **с подсказкой TS2820** | свободный | узел разорван со связями |

## (а) Билдер-цепочка с накопительным generic

`createWorkflowChain` VoltAgent 2.10: `WorkflowChain<INPUT_SCHEMA, RESULT_SCHEMA, CURRENT_DATA, SUSPEND, RESUME>`, каждый `.andThen` подставляет `NEW_DATA` в `CURRENT_DATA` (`@voltagent/core/dist/index.d.ts:11903, 12069`). Закрываем UNVERIFIED из research/ts-types-flow.md §1: `toWorkflow(): Workflow<INPUT_SCHEMA, RESULT_SCHEMA, SUSPEND_SCHEMA, RESUME_SCHEMA>` (`:12379`) — накопитель **стирается**, анонимный тип цепочки в `.d.ts` пакета не утекает.

Ограничение фатальное: у шага цепочки нет имени, на которое ссылаются. `andWhen` даёт `NEW_DATA | CURRENT_DATA`, `andBranch` — `Array<NEW_DATA | undefined>` (`:12151, 12238`), идентичность ветки теряется. Цепочка выражает порядок, а не граф, — соответствия один-к-одному с IR не получается.

## (б) Объектный литерал + F-bounded generic

Ключ: `const`-параметр выводится из литерала, ограничение проверяется **после** вывода — поэтому мапленный тип `CheckNodes<N>` видит весь `N`, включая узлы, объявленные ниже.

```ts
export type Sig = { readonly in: Readonly<Record<string, Schema>>; readonly out: Schema };
export type NodeSpec = { readonly use: Sig; readonly in: Readonly<Record<string, string>> };
export type Nodes = Readonly<Record<string, NodeSpec>>;

declare const WHY: unique symbol;
export type NoSuchNode<Ref extends string, Declared extends string> =
  { [WHY]: "unknown node id"; ref: Ref; declared: Declared };
export type SlotTypeMismatch<Ref extends string, Slot extends string, Want, Got> =
  { [WHY]: "slot type"; slot: Slot; from: Ref; want: Want; got: Got };

type OutOf<N extends Nodes, K> = K extends keyof N ? z.infer<N[K]["use"]["out"]> : never;

export type CheckNodes<N extends Nodes> = {
  [P in keyof N]: {
    readonly use: N[P]["use"];
    readonly in: {
      [K in keyof N[P]["in"] & keyof N[P]["use"]["in"]]: N[P]["in"][K] extends keyof N
        ? OutOf<N, N[P]["in"][K]> extends z.infer<N[P]["use"]["in"][K]>
          ? N[P]["in"][K]
          : SlotTypeMismatch<N[P]["in"][K] & string, K & string,
              z.infer<N[P]["use"]["in"][K]>, OutOf<N, N[P]["in"][K]>>
        : NoSuchNode<N[P]["in"][K] & string, keyof N & string>;
    };
  };
};

export function defineFlow<const N extends Nodes>(
  spec: { readonly nodes: N & CheckNodes<N> },
): N { return spec.nodes; }
```

Авторинг выглядит ровно как куб — объект с известными ключами, ссылки строками:

```ts
export const flow = defineFlow({ nodes: {
  loadHotels: { use: load, in: {} },
  scoreHotels: { use: score, in: { hotels: "loadHotels" } },
  renderPitch: { use: render, in: { scores: "scoreHotels" } },
} });
```

Что реально выводит `tsc`, дословно:

```
error TS2322: Type '"lodHotels"' is not assignable to type
  '"lodHotels" & NoSuchNode<"lodHotels", "loadHotels" | "scoreHotels">'.
error TS2322: Type '"loadHotels"' is not assignable to type
  '"loadHotels" & SlotTypeMismatch<"loadHotels", "scores",
   { id: string; score: number; }[], { id: string; stars: number; }[]>'.
```

Перестановка узлов (`renderPitch` первым, `loadHotels` последним) компилируется без ошибок — свойство, которого нет ни у (а), ни у (в).

Где ломается: `keyof N[P]["in"] & keyof N[P]["use"]["in"]` молча игнорирует **лишний** слот, которого нет в сигнатуре. Excess property check против обобщённой цели не работает, поэтому лишний слот остаётся правилом компилятора над IR.

## (в) Фабрика с параметром-контекстом

Форма из research/ts-our-design.md §1: `flow(($) => { const a = tool(...); ... })`. Вывод идеальный и бесплатный — обычный `const`-биндинг, `Ref<T>` параметризован выходом; проверено, сквозной тип доезжает до `return`. Опечатка в имени физически невозможна, но ровно поэтому ссылка на узел ниже по тексту требует тонка `goto(() => fix)`, и обратное ребро выражается только им. Для канваса хуже (б): удаление узла переписывает биндинги, а не один ключ объекта.

## (г) Двухфазное объявление

```ts
const nodes = { loadHotels: { out: z.array(Hotel) }, scoreHotels: { out: z.array(Score) } } as const;
type Id = keyof typeof nodes;
const wires: { to: Id; slot: string; from: Id }[] = [{ to: "scoreHotels", slot: "hotels", from: "loadHotels" }];
```

Единственный вариант со спеллчеком: `TS2820: Type '"lodHotels"' is not assignable to type '"loadHotels" | "scoreHotels" | "renderPitch"'. Did you mean '"loadHotels"'?` Цена: `wires` плоский, тип слота не связан с типом выхода — контракт выход→вход не проверяется вовсе, а узел разорван со своими связями. Отвергаем.

## Вердикт

**Берём (б).** Единственный вариант, где оба требования решения заказчика выполняются одновременно: литерал один-к-одному с IR-узлом (кодмод механический, ADR-0018) и порядок объявления свободен (перестановка на канвасе — правка `order`, а не переписывание файла).

Цена, которую платим осознанно:

1. **Спеллчек теряется.** Проверено: если ветку «нет такого узла» отдать как `keyof N & string`, пересечение `"lodHotels" & ("loadHotels" | ...)` схлопывается в `never`, и сообщение деградирует до `Type 'string' is not assignable to type 'never'`. Строка-шаблон вместо объекта не годится по той же причине. Бренд-объект строго лучше обоих.
2. **Лишний слот не ловится типом** — уходит в компилятор IR.
3. **Сообщение длиннее**: читать надо аргументы бренда, а не первую строку.

## Производительность тайпчекера

`tsc -p . --extendedDiagnostics`, генератор `gen2.mjs`, N воркфлоу × D узлов.

| Конфигурация | Схемы | Types | Instantiations | Check | Память |
|---|---|---|---|---|---|
| 50 × 20 | инлайн `z.object` в узле | 645 203 | 1 988 144 | **3,75 s** | 894 MB |
| 50 × 20, без `CheckNodes` | инлайн | 639 505 | 1 832 669 | 3,46 s | 878 MB |
| 50 × 20 | общий реестр | 49 182 | 191 185 | **0,38 s** | 148 MB |
| 50 × 20, без `CheckNodes` | общий реестр | 43 483 | 98 298 | 0,30 s | 136 MB |
| 50 × 40 | общий реестр | 67 082 | 305 345 | 0,53 s | 179 MB |
| 200 × 20 | общий реестр | 83 532 | 463 285 | 0,74 s | 217 MB |

Опасение «самоссылки дороже цепочек» **не подтвердилось**: `CheckNodes<N>` стоит 0,30 → 0,38 s, ~27 % сверху при копеечном абсолюте. Драйвер стоимости — **инлайновые zod-схемы**: те же 50 × 20 дают 3,75 s вместо 0,38 s и 894 MB вместо 148 MB, почти порядок.

Цифра 0,82 s из research/ts-types-flow.md сохраняется и улучшается: 0,38 s против 0,82 s у цепочки VoltAgent — ниже, потому что в базу цепочки входили 679 файлов `.d.ts` пакета. Рост линейный: 20 → 40 узлов ×1,4, 50 → 200 воркфлоу ×1,9.

Отсюда жёсткое правило в `CONVENTIONS.md`: **типы объявляются один раз в реестре (`registry.generated.ts`, ADR-0018) и импортируются**; `z.object({...})` внутри узла воркфлоу запрещён линтом. Это не стилистика, это порядок величины.

## Границы

Проверено запуском (`src/e-switch.ts`):

| Свойство | Типы | Сообщение / причина |
|---|---|---|
| Контракт выход→вход (R-T*) | **да** | `SlotTypeMismatch<..., want, got>` с обоими типами |
| Несуществующий id узла | **да** | `NoSuchNode<ref, declared>` |
| Полнота `switch` по enum (R-41) | **да** | `TS2741: Property 'escalate' is missing in type ...` — читаемее трюка с `never` |
| Nullable | **да** | `TS2322: Type 'null' is not assignable to type '{ id: string; }'` |
| Кардинальность один/много | **да** | `TS2353: ... 'id' does not exist in type '{ id: string; }[]'` |
| «Ровно N», `minItems`/`maxItems` | нет | кортежи ломаются на динамике |
| Лишний слот вне сигнатуры | нет | excess property check не работает против обобщённой цели |
| Ацикличность (R-C6) | **нет** | `{ a: { from: "b" }, b: { from: "a" } }` компилируется без ошибки |
| Доминирование (R-44/R-C6) | нет | в литерале порядка нет вовсе — фича для канваса, потеря для типов |
| Бюджеты, окно профиля (R-C7, R-T9) | нет | значение, а не тип |
| Членство id в `allowed_set` (R-T7/R-T8) | нет | бренд даёт идентичность множества, не членство |

Граница жёстче, чем у (а): свободный порядок объявления, выбранный ради канваса, **снимает даже иллюзию** проверки ацикличности, которую давала цепочка. Достижимость, ацикличность, доминирование, бюджеты и соответствие текста промта реестру — целиком проходы [07-compiler.md](../07-compiler.md) над IR.

## Ошибки для человека

**1. Бренд-объект вместо `never`.** Ветка-ошибка в условном типе возвращает объект с полем-причиной на `unique symbol` и говорящими параметрами. Параметры попадают в текст `tsc` дословно, включая `want`/`got`: человек видит, какой тип ждали и какой пришёл, не разворачивая generic.

**2. `@ts-expect-error` как тест DSL.** Каждое правило из таблицы границ со значением «да» получает файл в `packages/dsl/test-types/`: `@ts-expect-error` над заведомо неверным литералом. Если правило перестало ловиться (регресс `CheckNodes`, апгрейд TS), `tsc` падает на неиспользованном подавлении — тест на типы, который нельзя забыть обновить.

**3. Свои диагностики через синтез.** Всё, что типы не ловят, синтез (TS → IR, чистая функция) сообщает сам: код правила, путь узла, позиция в файле. Позицию берёт тот же `ts-morph` 28.0.0, которым делается кодмод, и кладёт в `meta.source = { file, line, col }` — вне `spec_hash` (04 §1.1, `meta` не хешируется). Формат один и тот же у `tsc` и у нас: `file:line:col: error R-44: ...`.

Чего **не** делаем: не выражаем ацикличность и доминирование рекурсивными типами. Потолок хвостовой рекурсии — `Acc<1000>` проходит, `Acc<1200>` даёт `TS2589` (research/ts-types-flow.md §5); на графе в сотню узлов это выродится в `TS2589` вместо внятного сообщения, то есть в обратное тому, ради чего раздел написан.

## Открытые вопросы

- UNVERIFIED: поведение в tsserver (подсветка в IDE), а не в батчевом `tsc`; длина hover-тултипа над `defineFlow` не замерялась.
- UNVERIFIED: как `CheckNodes<N>` ведёт себя на `switch`/`map`/`parallel` с вложенными телами — проверена только плоская запись узлов.
- Нужно решить, где живёт проверка «лишний слот»: отдельным проходом компилятора IR или нестандартным трюком с excess property check.
