# UI-кит и инвентарь компонентов под экраны §14

Дата проверки: 2026-09-11. Непроверенное помечено "UNVERIFIED:".
Проба: /private/tmp/claude-501/-Users-kirunya-Projects-my-ai-workflows-automate/f7b68ecb-d2f6-4f40-91f0-83ca8b26df64/scratchpad/probe-fe

---

## 0. ФАКТ: полный реестр @shadcn на 2026-09-11 (471 item, через mcp__shadcn__list_items_in_registries)

### registry:ui — ВСЕ существующие компоненты (61 шт., это исчерпывающий список)
accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button,
**button-group**, calendar, card, carousel, **chart**, checkbox, collapsible, combobox,
command, context-menu, dialog, drawer, dropdown-menu, **empty**, **field**, form,
hover-card, input, **input-group**, input-otp, **item**, label, menubar, navigation-menu,
pagination, popover, progress, radio-group, resizable, scroll-area, select, separator,
sheet, sidebar, skeleton, slider, sonner, **spinner**, switch, table, tabs, textarea,
toggle, toggle-group, tooltip, **kbd**, **native-select**, **direction**,
+ AI-чат примитивы: **attachment**, **bubble**, **marker**, **message**, **message-scroller**

### ЧЕГО В РЕЕСТРЕ НЕТ (частая галлюцинация — НЕ пытаться `shadcn add`)
- `data-table` — НЕТ как ui. Есть только example `data-table-demo` (это рецепт на TanStack Table, копируется руками из доки).
- `toast` / `use-toast` — УДАЛЁН, заменён на `sonner`.
- `typography` — только examples (`typography-h1`, `typography-table`, ...), не компонент.
- `tree` / `file-tree` — НЕТ. Ближайшее: блок `sidebar-11` ("A sidebar with a collapsible file tree") + `collapsible`.
- `timeline`, `stepper`, `code-block`, `json-viewer`, `diff`, `data-grid`, `virtual-table`,
  `split-pane`, `multi-select`, `tags-input`, `color-picker`, `date-range-picker` — НЕТ.
  (`date-picker` тоже не ui: это examples `date-picker-demo`/`-with-range`/`-with-presets` на `calendar`+`popover`.)
- `chart` — ЕСТЬ как ui, но это тонкая обёртка над Recharts (ChartContainer/ChartTooltip/ChartLegend), не самостоятельный график.

### registry:block — блоки
dashboard-01 (sidebar + charts + data table), sidebar-01..sidebar-16, login-01..05, signup-01..05,
плюс ~90 chart-* блоков (chart-area-*, chart-bar-*, chart-line-*, chart-pie-*, chart-radar-*,
chart-radial-*, chart-tooltip-*). Никаких "eval"/"table"/"diff" блоков нет.

### registry:theme
theme-stone, theme-zinc, theme-neutral, theme-gray, theme-slate.

### registry:font (новое в 2026)
font-<name> и font-heading-<name>: geist, inter, noto-sans, nunito-sans, figtree, roboto,
raleway, dm-sans, public-sans, outfit, oxanium, manrope, space-grotesk, montserrat,
ibm-plex-sans, source-sans-3, instrument-sans, jetbrains-mono, geist-mono, noto-serif,
roboto-slab, merriweather, lora, playfair-display, eb-garamond, instrument-serif.
=> `npx shadcn@latest add @shadcn/font-geist-mono` ставит шрифт как registry-item (важно для моно в логах/диффах).

### registry:hook / lib
use-mobile, utils. Всё.

### ВАЖНО: form теперь мульти-рантаймовый
Examples идут четырьмя семействами: `form-rhf-*` (react-hook-form), `form-tanstack-*`
(@tanstack/react-form), `form-formisch-*` (formisch), `form-next-*` (нативные Server Actions/
React 19 `useActionState`). Компонент `form` (registry:ui) один, адаптеры разные.
=> Для Studio: `form-next-*` для серверных мутаций, `form-rhf-*` для сложных клиентских
редакторов (редактор шаблонов, конфиг агента). UNVERIFIED: какой именно адаптер стоит
по умолчанию в `form` в new-york style — надо смотреть view_items_in_registries.

---

## ФАКТ: версии/лицензии/свежесть (npm view, 2026-09-11)

| пакет | версия | последний релиз | лиц. | вердикт |
|---|---|---|---|---|
| shadcn (CLI) | **4.21.0** | 2026-09-04 | MIT | активен |
| tailwindcss | **4.3.3** | 2026-09-08 | MIT | активен |
| @tanstack/react-table | **9.2.4** | 2026-08-28 | MIT | **МАЖОР v9! не v8** |
| @tanstack/react-virtual | **3.14.12** | 2026-09-11 | MIT | активен (релиз сегодня) |
| react-resizable-panels | **4.12.4** | 2026-09-06 | MIT | **мажор v4**, активен |
| cmdk | 1.1.1 | 2025-08-27 | MIT | ~12.5 мес тишины — ПОГРАНИЧНЫЙ РИСК |
| vaul | 1.1.2 | **2024-12-14** | MIT | **~21 мес тишины — РИСК, почти заброшен** |
| sonner | 2.0.8 | 2026-08-09 | MIT | активен |
| recharts | **3.10.1** | 2026-09-09 | MIT | активен |
| @visx/visx | **4.0.0** | 2026-06-11 | MIT | активен (мажор v4) |
| echarts | **6.1.0** | 2026-05-19 | Apache-2.0 | активен |
| echarts-for-react | 3.0.6 | 2026-05-19 | MIT | активен |
| @observablehq/plot | 0.6.17 | 2026-04-06 | ISC | активен, но 0.x |
| @nivo/core | 0.99.0 | 2025-05-23 | MIT | ~15 мес тишины — РИСК |
| react-diff-viewer-continued | **4.4.0** | 2026-07-14 | MIT | активен |
| @git-diff-view/react | 0.1.7 | 2026-07-13 | MIT | активен, но 0.x API |
| diff2html | 3.4.56 | 2026-01-31 | MIT | ~7 мес — ок |
| jsondiffpatch | 0.7.6 | 2026-05-14 | MIT | активен |
| @monaco-editor/react | 4.7.0 | 2025-11-21 | MIT | ~10 мес — ок |
| @textea/json-viewer | 4.0.1 | **2024-12-15** | MIT | **~21 мес — РИСК** |
| json-edit-react | **1.30.2** | 2026-09-07 | MIT | активен |
| react-json-tree | 0.20.0 | 2025-03-01 | MIT | ~18 мес — РИСК |
| react-hotkeys-hook | **5.3.3** | 2026-06-26 | MIT | активен (мажор v5) |
| tailwind-merge | 3.6.0 | 2026-09-06 | MIT | активен |
| class-variance-authority | 0.7.1 | **2024-11-26** | Apache-2.0 | ~21 мес тишины, но стабилен и shadcn его тянет |
| lucide-react | **1.45.0** | 2026-09-11 | ISC | активен (мажор v1) |
| radix-ui (unified) | 1.6.7 | 2026-07-31 | MIT | активен |

---

## 1. shadcn/ui в 2026 — состояние

### CLI (пакет `shadcn@4.21.0`, MIT)
```bash
npx shadcn@latest init                      # создаёт components.json, ставит базу
npx shadcn@latest add button table tooltip  # из дефолтного @shadcn
npx shadcn@latest add @shadcn/sidebar-16    # явный namespace
npx shadcn@latest add @acme/run-inspector   # сторонний реестр
npx shadcn@latest view @shadcn/chart        # посмотреть item без установки
npx shadcn@latest search @shadcn -q "chart" # поиск по реестру
npx shadcn@latest migrate cn                # НОВОЕ (сент.2026), см. ниже
npx shadcn@latest build                     # собрать свой registry из registry.json
```

### components.json (фактический, из пробы; Tailwind v4 — `tailwind.config` ПУСТОЙ)
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true, "tsx": true,
  "tailwind": { "config": "", "css": "app/globals.css",
                "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "iconLibrary": "lucide",
  "aliases": { "components":"@/components","utils":"@/lib/utils","ui":"@/components/ui",
               "lib":"@/lib","hooks":"@/hooks" },
  "registries": {}
}
```
- `tailwind.config: ""` — именно так для Tailwind v4 (CSS-first). Файла `tailwind.config.js` НЕТ.
- `"style": "new-york"` — единственный поддерживаемый стиль (default удалён ещё в 2025).
- `registries` — словарь namespace→URL, туда кладём свои/сторонние реестры.

### Реестры и namespaces (2026)
- Namespace-синтаксис `@registry/item` — штатный способ адресации.
- **Приватные GitHub-реестры** (авг. 2026): можно ставить прямо из приватного репо по
  GitHub-креденшелам — «если ты можешь читать репозиторий, CLI может из него ставить».
  => наш внутренний UI-кит (нодовые карточки канваса, вьюер прогона) публикуем как приватный
  registry и раздаём командам через `npx shadcn add @aiwf/<item>`.
- **Dynamic search** (июль 2026): реестр может обрабатывать серверный поиск через query-параметры,
  каталог целиком не скачивается. Актуально, если наш реестр разрастётся.
- `registry:font` как тип item (см. §0) — шрифты ставятся как компоненты.

### `cn` package (сентябрь 2026) — ВАЖНОЕ ИЗМЕНЕНИЕ
Все компоненты shadcn теперь импортируют `cn` из отдельного npm-пакета `cn`, а не из
локального `@/lib/utils`. Для нового проекта это дефолт; для существующего есть
`npx shadcn@latest migrate cn`.
=> В `aliases.utils` всё ещё `@/lib/utils`, но новые компоненты могут тянуть `import { cn } from "cn"`.
UNVERIFIED: точное имя/версия пакета `cn` в npm — проверить `npm view cn version` перед стартом.

### Human-in-the-loop helpers (авг. 2026)
`@shadcn/helpers` поддерживает скриптованные диалоги, которые ставят генерацию на паузу
и ждут подтверждения пользователя. Прямо ложится на наш сценарий «Claude предлагает правку
воркфлоу → человек аппрувит в Studio». Стоит посмотреть при проектировании MCP-моста.

### `questionnaire` (авг. 2026)
Многошаговая форма, объявлена в чейнджлоге для Base UI / React Aria / Radix с 8 вариантами
стилей. **В реестре `@shadcn` её НЕТ** (проверено search_items_in_registries → 0 items).
Значит живёт в отдельных namespace-реестрах (base-ui/react-aria варианты). Перед использованием
найти точный namespace, а не гадать.

### React 19 / Tailwind v4
- Все ключевые зависимости объявляют peer `react: ^19` (проверено, см. таблицу версий).
- `radix-ui@1.6.7` — единый пакет вместо россыпи `@radix-ui/react-*`; shadcn новые компоненты
  тянут именно его.
- Tailwind v4.3.3: конфиг в CSS (`@import "tailwindcss"; @theme { ... }`), PostCSS-плагин
  `@tailwindcss/postcss`. Никакого `tailwind.config.js`.

---

## 3. Тяжёлые таблицы: ВНИМАНИЕ — TanStack Table v9, не v8

**Главный подводный камень всего фронта.** `@tanstack/react-table@latest` = **9.2.4**
(v8 замёрз на 8.21.3). v9 — переписан на TanStack Store (атомы), API другой.
Документация shadcn `data-table` написана под v8 — копировать её дословно НЕЛЬЗЯ.

### Что изменилось (проверено по .d.ts в probe-ds)
| v8 | v9 |
|---|---|
| `useReactTable(options)` | **`useTable(options, selector?)`** |
| `getCoreRowModel()` и прочие row-models в опциях | **`features: {...}` — явная регистрация фич (tree-shaking)** |
| `flexRender(def, ctx)` | **`<table.FlexRender cell={cell} />`** (flexRender ещё экспортируется) |
| ререндер на любой смене стейта | **`<table.Subscribe selector={...}>` / `table.atoms.<slice>`** — точечные подписки |
| — | **`createTableHook()` / `createTableHookContexts()`** — типизированный per-app хук |
| — | **`@tanstack/react-table/legacy`**: `useLegacyTable`, `getCoreRowModel`, `getSortedRowModel`, ... — мост для v8-кода |
| — | **`@tanstack/table-core/experimental-worker-plugin`** — row-models в Web Worker |

Реальные сигнатуры:
```ts
declare function useTable<TFeatures extends TableFeatures, TData extends RowData, TSelected = TableState<TFeatures>>(
  tableOptions: TableOptions<TFeatures, TData>,
  selector?: (state: TableState<TFeatures>) => TSelected,
): ReactTable<TFeatures, TData, TSelected>
// table.state   — Readonly<TSelected> (то, что выбрал selector)
// table.atoms.rowSelection — атом среза
// table.store   — @deprecated для чтения в рендере
```

Фичи `@tanstack/table-core@9` (точные имена экспортов, проверено):
`coreFeatures`, `stockFeatures`, `tableFeatures`, и по отдельности —
`coreCellsFeature`, `coreColumnsFeature`, `coreHeadersFeature`, `coreRowsFeature`,
`coreRowModelsFeature`, `coreTablesFeature`, `cellSelectionFeature`, `cellSpanningFeature`,
`columnFacetingFeature`, `columnFilteringFeature`, `columnGroupingFeature`,
`columnOrderingFeature`, `columnPinningFeature`, `columnResizingFeature`,
`columnSizingFeature`, `columnVisibilityFeature`, `globalFilteringFeature`,
`rowAggregationFeature`, `rowExpandingFeature`, `rowPaginationFeature`, `rowPinningFeature`,
`rowSelectionFeature`, `rowSortingFeature`.

Экспорт-мапы:
- `@tanstack/react-table`: `.`, `./legacy`, `./flex-render`, `./static-functions`, `./experimental-worker-plugin`
- `@tanstack/table-core`: те же + `./reactivity`, `./store-reactivity-bindings`

### Worker-плагин для журнала на 10k+ (эксперим., но именно наш кейс)
`@tanstack/table-core/experimental-worker-plugin` экспортирует:
`createTableWorker`, `initTableWorker`, `syncTableWorker`, `getTableWorkerBridge`,
`createWorkerRowModel`, `workerRowModelsFeature`, `tableWorkerPipeline`,
типы `TableWorker`, `TableWorkerBridge`, `TableWorkerConfig`, `TableWorkerRequest/Response/Result`,
`TableWorkerStage`, `TableState_WorkerRowModels`.
=> сортировка/фильтрация/группировка журнала прогонов уходит в воркер, главный поток свободен.
UNVERIFIED: стабильность API (помечено experimental) — не класть в критический путь v1.

### Паттерн виртуализации (TanStack Table v9 + @tanstack/react-virtual@3.14.12)
Ключ: виртуализируем **только тело**, шапка — sticky вне скроллера. `overflow-anchor: none`
на контейнере обязателен, иначе браузер дёргает скролл.

```tsx
"use client"
import { useRef } from "react"
import { useTable, tableFeatures } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"

const features = tableFeatures({ rowSortingFeature: true, columnFilteringFeature: true,
                                 rowSelectionFeature: true, columnVisibilityFeature: true })

export function RunLogTable({ data, columns }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const table = useTable({ features, data, columns },
                         (s) => ({ sorting: s.sorting, rowSelection: s.rowSelection }))

  const rows = table.getRowModel().rows
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 12,
    getItemKey: (i) => rows[i].id,
  })
  const items = rowVirtualizer.getVirtualItems()

  return (
    <div ref={scrollRef} className="h-[70vh] overflow-auto [overflow-anchor:none]">
      <table className="w-full table-fixed border-separate border-spacing-0">
        <thead className="sticky top-0 z-10 bg-background">…</thead>
        <tbody style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {items.map((v) => {
            const row = rows[v.index]
            return (
              <tr key={row.id} data-index={v.index}
                  ref={rowVirtualizer.measureElement}
                  style={{ position: "absolute", transform: `translateY(${v.start}px)`, width: "100%" }}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}><table.FlexRender cell={cell} /></td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```
Подводные камни:
1. `<tbody>` с `position:relative` + абсолютные `<tr>` ломает нативный layout таблицы —
   обязателен `table-fixed` и явные ширины колонок (`columnSizingFeature`).
   Альтернатива без хаков: рендерить не `<table>`, а grid-разметку из div'ов с `role="grid"`.
2. Динамическая высота строк (развёрнутый JSON в ячейке) — только через
   `rowVirtualizer.measureElement` как ref, и `estimateSize` как первое приближение.
3. Горизонтальная виртуализация колонок (матрица моделей, покрытие датасетов) — второй
   `useVirtualizer({ horizontal: true })`; нужна только если колонок > ~50.
4. shadcn `table` (registry:ui) — это просто стилизованные `<table>`-обёртки; он совместим,
   но `data-table` как готовый компонент НЕ существует, пишем свой на v9.

---

## ФАКТ: реальные зависимости shadcn-компонентов (view_items_in_registries, 2026-09-11)
```
drawer    -> cn, vaul
chart     -> cn, recharts@3.8.0     (ПИН точной версии! latest recharts = 3.10.1)
resizable -> cn, react-resizable-panels@^4
command   -> cn, cmdk
table     -> cn                      (только стили, никакой логики)
```
`cn@0.2.6` (MIT, github.com/shadcn-ui/cn, релиз 2026-09-06) — «Fast, small, compiled
class-name merging for Tailwind CSS. Drop-in replacement for clsx + tailwind-merge».
=> **clsx и tailwind-merge больше не нужны**, `@/lib/utils` с самописным `cn` — legacy.

---

## 4. Каркас приложения

| задача | пакет | версия | вердикт |
|---|---|---|---|
| сплиты канвас/инспектор/логи | `react-resizable-panels` | **4.12.4** | БЕРЁМ. shadcn `resizable` уже на `^4`. Есть `autoSaveId` → раскладка панелей в localStorage per-screen. |
| командная палитра (⌘K) | `cmdk` | 1.1.1 | БЕРЁМ через shadcn `command` + `command-dialog`. РИСК: тишина ~12.5 мес. Мейнтейнер — pacocoursey; API стабилен, но следить. |
| мобильные шторки | `vaul` | 1.1.2 | **СЛАБОЕ ЗВЕНО**: релиз 2024-12-14, ~21 мес. shadcn `drawer` жёстко на нём. Studio — десктопный инструмент; ставим `drawer` только там, где реально нужна мобильная шторка, иначе `sheet` (чистый Radix Dialog, без vaul). |
| тосты | `sonner` | 2.0.8 | БЕРЁМ (shadcn `sonner`). `toast`/`use-toast` удалены из реестра. |
| тултипы | shadcn `tooltip` → `radix-ui`/`@radix-ui/react-tooltip` 1.2.16 | — | БЕРЁМ. Для плотного UI ставить один `<TooltipProvider delayDuration={200} skipDelayDuration={300}>` на корень. |
| хоткеи | `react-hotkeys-hook` | **5.3.3** | БЕРЁМ. v5 — мажор. Есть `HotkeysProvider` + scopes: критично, чтобы хоткеи канваса (`Del`, `⌘D`) не стреляли внутри редактора шаблонов/Monaco. `useHotkeys('mod+k', fn, { scopes: ['global'], enableOnFormTags: false })`. |
| отображение клавиш | shadcn `kbd` (registry:ui, НОВЫЙ) | — | БЕРЁМ, есть `kbd-group`, `kbd-tooltip`, `kbd-input-group` examples. |
| пустые состояния | shadcn `empty` (НОВЫЙ) | — | БЕРЁМ — «нет прогонов», «датасет пуст», «нет диффов». |
| загрузка | shadcn `spinner` + `skeleton` | — | БЕРЁМ. |
| группы кнопок/инпутов | shadcn `button-group`, `input-group` | — | БЕРЁМ — тулбары канваса, поля с префиксом/суффиксом и спиннером. |
| строка списка | shadcn `item` (+ `item-group`, `item-header`) | — | БЕРЁМ — унифицированная строка для реестров вместо самописных карточек. |
| поля формы | shadcn `field` (+ `field-group`, `field-choice-card`) | — | БЕРЁМ — новый слой над label/description/error, заменяет ручную вёрстку. |
| навигация-шелл | shadcn `sidebar` + блок `sidebar-16` (sticky header) / `sidebar-15` (левая+правая) | — | `sidebar-15` под Studio: слева навигация, справа инспектор. |
| дерево (граф контекста, вложенный JSON-путь) | реестр НЕ содержит `tree`. `react-arborist@3.16.0` (MIT, 2026-07-25, живой) ИЛИ блок `sidebar-11` + `collapsible` | — | Для легковесных деревьев — `collapsible`; для дерева с виртуализацией на 1000+ узлов — `react-arborist`. |
| данные | `@tanstack/react-query@5.102.8` | — | согласовано с проверенными версиями ведущего |

---

## 5. Графики — рекомендация ПО ТИПАМ

### Кандидаты (все проверены npm, см. таблицу версий)
- **Recharts 3.10.1** MIT, активен. Интегрирован в shadcn `chart` (пин `recharts@3.8.0`),
  даёт `ChartContainer`/`ChartTooltipContent`/`ChartLegendContent` + ~90 готовых блоков
  `chart-*`. Цвета берёт из CSS-переменных `--chart-1..5` — темы и dark mode «из коробки».
  Слабость: SVG, тормозит от ~2-3k точек; нет heatmap и нормального scatter-brush.
- **visx 4.0.0** MIT, активен (@visx/xychart, @visx/heatmap, @visx/scale — все 4.0.0, 2026-06).
  Не библиотека графиков, а набор D3-примитивов под React. Полный контроль, включая heatmap.
  Цена: каждый график пишем руками (оси, легенды, тултипы).
- **ECharts 6.1.0** Apache-2.0 + `echarts-for-react@3.0.6` MIT, активны. Canvas/WebGL,
  держит десятки тысяч точек, есть `dataZoom`, `visualMap`, `heatmap`, `brush`, `boxplot`
  из коробки. Цена: +~1 МБ бандла (лечится tree-shaken импортом `echarts/core`), своя тема
  вместо CSS-переменных, императивный API поверх React.
- **Observable Plot 0.6.17** ISC, активен, но 0.x и не React (императивный `Plot.plot()`
  → вставка DOM-узла в `useEffect`). Грамматика графики — отлично для разведочных
  распределений, плохо для интерактивных продуктовых виджетов.
- **Nivo 0.99.0** MIT — **тишина с 2025-05-23 (~15 мес), 0.x. НЕ БЕРЁМ.** Единственный
  плюс — готовый `@nivo/heatmap`, но он не стоит риска заброшенности.

### Вердикт по каждому требуемому типу
| график | чем рисуем | почему |
|---|---|---|
| **Водопад стоимости/латентности по шагам прогона** | **Recharts** (`BarChart` + stacked, прозрачный «offset»-сегмент + `Bar`) | Водопад = stacked bar с невидимой базой. Шагов в воркфлоу десятки, не тысячи. Даёт tooltip/легенду shadcn бесплатно, цвета = наши семантические токены. |
| **Граница Парето (стоимость↔качество, scatter)** | **Recharts `ScatterChart`** до ~1.5k точек; **ECharts `scatter` + `dataZoom` + `brush`** если точек больше или нужен lasso-select конфигураций | Парето на матрице моделей — это десятки-сотни точек ⇒ Recharts хватает. Линию фронта рисуем отдельным `Line`/`ReferenceLine` по вычисленному фронту. Brush-выделение подмножества конфигураций Recharts не умеет — это триггер на ECharts. |
| **Распределения оценок (гистограмма / violin / box)** | **Recharts** для гистограммы (бины считаем сами через `simple-statistics`, уже в probe); **ECharts `boxplot`** если нужен настоящий box/violin по каждому судье | Recharts не имеет boxplot вообще. Гистограмма = обычный `BarChart`, это нормально. |
| **Хитмап согласия судей (judge agreement)** | **visx (`@visx/heatmap` + `@visx/scale`)** или **ECharts `heatmap`** | Recharts heatmap НЕ УМЕЕТ — это дисквалификация. visx: матрица судья×судья/судья×критерий обычно ≤ 20×20, SVG-ячейки рисуются тривиально, полный контроль над цветовой шкалой (диверген­тная вокруг κ=0). ECharts — если матрица большая (критерий×пример на 10k ячеек). |
| **Спарклайны в ячейках таблиц (тренд метрики по версиям)** | Recharts `<Line>` в `ChartContainer` без осей, ИЛИ инлайновый `<svg>` руками | На 1000 строк Recharts-спарклайн убьёт рендер ⇒ в виртуализированных таблицах рисуем самописный `<path>` (10 строк кода), Recharts только в детальных карточках. |
| **Таймлайны циклов / Gantt прогона** | **НЕ график.** Самописный div/absolute-layout на CSS Grid + `@tanstack/react-virtual` | Все библиотеки дают Gantt плохо. Таймлайн шагов — это позиционированные полоски с известными t_start/t_end; CSS справляется лучше и даёт hover/клик на реальных DOM-узлах. ECharts `custom` series — запасной вариант. |

### ИТОГОВОЕ РЕШЕНИЕ
**Основа — Recharts через shadcn `chart`** (единый визуальный язык, токены, dark mode).
**Точечно visx** — только хитмап согласия.
**ECharts держим в резерве** за фича-флагом для двух сценариев: >5k точек на scatter и boxplot.
Не тащим ECharts в v1 — это +1 МБ и вторая система тем.
Nivo и Observable Plot — не берём.

ПОДВОДНЫЙ КАМЕНЬ: shadcn `chart` пинит `recharts@3.8.0`, а latest — 3.10.1. Если ставить
recharts отдельно, будет расхождение. Ставить строго `npx shadcn add @shadcn/chart` и не
апгрейдить recharts вручную без прогона визуальных тестов.

---

## 6. Диффы — вердикт

| пакет | версия | свежесть | вердикт |
|---|---|---|---|
| **react-diff-viewer-continued** | **4.4.0** | 2026-07-14 — **ЖИВОЙ** | **БЕРЁМ для текстового/промтового side-by-side.** Это поддерживаемый форк мёртвого `react-diff-viewer` (оригинал заброшен с 2020). v4 — мажор. Умеет split/unified, word-level diff, `renderContent` (подсветка своим highlighter), кастомные стили. |
| @git-diff-view/react | 0.1.7 | 2026-07-13 — живой | Запасной. Красивее (git-подобный UI, виджеты комментариев), но **0.x** — API может поехать. Требует на вход unified diff, а не две строки, т.е. нужен `diff`/`jsdiff` рядом. Берём только если понадобятся инлайн-комментарии к диффу. |
| diff2html | 3.4.56 | 2026-01-31 — ок | **НЕ БЕРЁМ.** Работает со строкой unified-diff, выдаёт HTML-строку → `dangerouslySetInnerHTML`, свой CSS вне нашей токен-системы, React-интеграции нет. Плохо стыкуется с Tailwind v4. |
| **jsondiffpatch** | **0.7.6** | 2026-05-14 — **ЖИВОЙ** | **БЕРЁМ для структурного JSON/YAML-диффа.** Уже стоит в probe-fe. Важно: в 0.7.x формáттеры — отдельные суб-экспорты `jsondiffpatch/formatters/html`, `…/annotated`, `…/console`; `html` даёт готовый визуальный дифф дерева с move-детекцией массивов (`objectHash`). Для YAML — парсим `yaml@2.9.0` → JS-объект → тот же diff (дифф структуры, не текста). |
| monaco (`@monaco-editor/react` 4.7.0) | 4.7.0 | 2025-11-21 — ок | **БЕРЁМ ТОЛЬКО для редактора шаблонов**, где всё равно нужен полноценный редактор, и там `DiffEditor` уже включён бесплатно. **НЕ тащить monaco ради одного диффа** — это ~3-5 МБ, web-workers, отдельный настрой под Next.js 16 (RSC/`ssr:false`). |

**Итоговая стратегия диффов (разделение ответственности):**
1. Промты/текстовые поля шаблона → `react-diff-viewer-continued@4` (side-by-side, word-level).
2. Конфиги воркфлоу / эффективная конфигурация / версии графа → `jsondiffpatch@0.7` delta,
   рендерим **своим** React-компонентом поверх delta (не их HTML-форматтером), чтобы
   попасть в наши токены и уметь «показать провенанс поля». Для генерации JSON-Patch на
   запись — `rfc6902@5.3.0` (уже в probe-fe).
3. Внутри редактора шаблонов → monaco `DiffEditor`.
4. `microdiff@1.6.0` (в probe-fe) — для быстрых «изменилось/нет» проверок, не для UI.

---

## 7. Просмотр JSON с аннотациями провенанса — вердикт

| пакет | версия | свежесть | кастомизация узлов | вердикт |
|---|---|---|---|---|
| @textea/json-viewer | 4.0.1 | **2024-12-15, ~21 мес** | Мощная: `valueTypes` — регистрация своих рендереров по предикату `is(value)`, плюс MUI-темы | **НЕ БЕРЁМ.** Тянет **MUI** как peer — это вторая дизайн-система в проекте на Tailwind v4 + shadcn. Плюс почти 2 года без релизов. Двойной дисквалификатор. |
| **json-edit-react** | **1.30.2** | **2026-09-07 — самый живой** | `customNodeDefinitions` (свой компонент по `condition`), `customText`, `customButtons`, `CollectionKey`, фильтры `restrictEdit/restrictDelete`, поиск, темы через CSS-переменные, без MUI | **БЕРЁМ.** Единственный активно развиваемый и при этом с настоящим API расширения узлов. Умеет и read-only просмотр, и редактирование — закрывает и «просмотр выхода шага», и «правка входа при ре-ране». |
| react-json-tree | 0.20.0 | 2025-03-01, ~18 мес | Скудная: `valueRenderer`, `labelRenderer`, `getItemString`. Хватает для бейджа провенанса рядом со значением | Запасной. Крошечный и стабильный; если json-edit-react окажется тяжёлым — откат сюда. Но редактирования нет вообще. |

**Как вешаем провенанс.** Провенанс — это боковая карта `JSONPointer -> { kind, sourceStepId, ... }`
(kind ∈ static/data/knowledge/generated/human). В `json-edit-react` собираем путь из
`nodeData.path` (массив ключей) → JSON Pointer → лукап в карте → рендерим бейдж
семантическим цветом (см. §8) через `customNodeDefinitions`:
```tsx
customNodeDefinitions={[{
  condition: ({ path }) => provenance.has(toPointer(path)),
  element: ProvenanceValue,        // рисует значение + <Badge> с цветом вида контекста
  showOnView: true, showOnEdit: false,
  customNodeProps: { provenance },
}]}
```
UNVERIFIED: точные имена полей `nodeData` в 1.30.x — проверить по .d.ts перед реализацией
(в probe-ds не ставил, бюджет).

---

## 8. Токены дизайна: Tailwind v4 `@theme` + семантические роли

Tailwind v4 = CSS-first. Никакого `tailwind.config.js`. Всё в `app/globals.css`.
`@theme` объявляет токены, из которых Tailwind **генерирует утилиты**
(`--color-ctx-data` → `bg-ctx-data`, `text-ctx-data`, `border-ctx-data`).
Для значений, которые меняются в dark mode, используем связку
`@theme` (ссылка на var) + `:root` / `.dark` (значения) — иначе dark-режим не переключится,
т.к. содержимое `@theme` статично.

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));   /* v4-способ, вместо darkMode:'class' */

/* 1. Сырые значения — переключаемые по теме. OKLCH, как в shadcn baseColor neutral. */
:root {
  /* виды контекста (§. граф контекста, карта промтов, JSON-провенанс) */
  --ctx-static:     oklch(0.55 0.02 250);   /* нейтрально-серый: литералы в шаблоне   */
  --ctx-data:       oklch(0.62 0.16 250);   /* синий:   вход прогона / переменные      */
  --ctx-knowledge:  oklch(0.62 0.14 165);   /* зелёный: RAG / retrieval / база знаний  */
  --ctx-generated:  oklch(0.63 0.17 300);   /* фиолет:  выход предыдущего шага LLM     */
  --ctx-human:      oklch(0.70 0.15 70);    /* янтарь:  правка человеком / HITL        */
  --ctx-static-fg:    oklch(0.98 0 0);
  --ctx-data-fg:      oklch(0.98 0 0);
  --ctx-knowledge-fg: oklch(0.98 0 0);
  --ctx-generated-fg: oklch(0.98 0 0);
  --ctx-human-fg:     oklch(0.20 0 0);

  /* статусы прогона (§11 отладка, журнал, таймлайны циклов) */
  --run-pending:   oklch(0.60 0.01 250);
  --run-running:   oklch(0.65 0.15 230);
  --run-succeeded: oklch(0.62 0.15 150);
  --run-failed:    oklch(0.58 0.20 25);
  --run-skipped:   oklch(0.68 0.02 250);
  --run-cancelled: oklch(0.55 0.03 300);
  --run-retrying:  oklch(0.70 0.15 70);
  --run-cached:    oklch(0.66 0.10 195);    /* попадание в кеш — отличать от succeeded */

  /* дифф */
  --diff-added:    oklch(0.62 0.15 150);
  --diff-removed:  oklch(0.58 0.20 25);
  --diff-changed:  oklch(0.70 0.15 70);
  --diff-moved:    oklch(0.63 0.17 300);
}
.dark {
  --ctx-static:     oklch(0.68 0.02 250);
  --ctx-data:       oklch(0.72 0.15 250);
  --ctx-knowledge:  oklch(0.74 0.13 165);
  --ctx-generated:  oklch(0.74 0.15 300);
  --ctx-human:      oklch(0.80 0.14 70);
  --run-running:    oklch(0.74 0.14 230);
  --run-succeeded:  oklch(0.72 0.14 150);
  --run-failed:     oklch(0.68 0.19 25);
  /* … остальные по тому же принципу */
}

/* 2. @theme ССЫЛАЕТСЯ на переменные — так утилиты генерируются, а значения тематизируются */
@theme inline {
  --color-ctx-static:     var(--ctx-static);
  --color-ctx-data:       var(--ctx-data);
  --color-ctx-knowledge:  var(--ctx-knowledge);
  --color-ctx-generated:  var(--ctx-generated);
  --color-ctx-human:      var(--ctx-human);
  --color-ctx-static-foreground:    var(--ctx-static-fg);
  --color-ctx-data-foreground:      var(--ctx-data-fg);
  --color-ctx-knowledge-foreground: var(--ctx-knowledge-fg);
  --color-ctx-generated-foreground: var(--ctx-generated-fg);
  --color-ctx-human-foreground:     var(--ctx-human-fg);

  --color-run-pending:   var(--run-pending);
  --color-run-running:   var(--run-running);
  --color-run-succeeded: var(--run-succeeded);
  --color-run-failed:    var(--run-failed);
  --color-run-skipped:   var(--run-skipped);
  --color-run-cancelled: var(--run-cancelled);
  --color-run-retrying:  var(--run-retrying);
  --color-run-cached:    var(--run-cached);

  --color-diff-added:   var(--diff-added);
  --color-diff-removed: var(--diff-removed);
  --color-diff-changed: var(--diff-changed);
  --color-diff-moved:   var(--diff-moved);

  /* графики: shadcn chart читает именно --color-chart-N */
  --color-chart-1: var(--ctx-data);
  --color-chart-2: var(--ctx-knowledge);
  --color-chart-3: var(--ctx-generated);
  --color-chart-4: var(--ctx-human);
  --color-chart-5: var(--ctx-static);

  --font-mono: var(--font-jetbrains-mono), ui-monospace, monospace;
}
```

Правила использования:
- `@theme inline` — обязательно `inline`, иначе Tailwind заинлайнит значение на момент
  компиляции и `.dark` не переопределит.
- `@custom-variant dark (&:where(.dark, .dark *))` — v4-замена `darkMode: 'class'`.
- Цвет НИКОГДА не единственный носитель смысла: вид контекста дублируем иконкой lucide
  (static=`Type`, data=`Database`, knowledge=`BookOpen`, generated=`Sparkles`, human=`User`),
  статус прогона — иконкой + текстом в `<Badge>`. Иначе провал по доступности и по
  дальтонизму (failed/succeeded — красный/зелёный).
- OKLCH — потому что shadcn baseColor `neutral` в 2026 уже в OKLCH; смешивать hsl/oklch нельзя.
- Шрифт моно ставим как registry item: `npx shadcn add @shadcn/font-jetbrains-mono`
  (или `font-geist-mono`) — он сам заведёт `--font-*` переменную.

---

## 2. ИНВЕНТАРЬ: экран Studio (§14) → компоненты

Все имена ниже ПРОВЕРЕНЫ по mcp__shadcn__list_items_in_registries (§0). Колонка «своё»
— то, чего в реестре нет и что придётся писать (и потом опубликовать в свой namespace-реестр).

| # | Экран §14 | shadcn (проверено, существует) | внешние либы | своё (в реестре НЕТ) |
|---|---|---|---|---|
| 1 | **Канвас** (стадии, порты, привязки, ошибки на узлах) | `resizable`, `sidebar`, `button-group`, `toggle-group`, `tooltip`, `context-menu`, `hover-card`, `popover`, `badge`, `command` (палитра «добавить узел»), `kbd`, `separator`, `empty`, `alert` | `@xyflow/react@12.11.6`, `elkjs@0.12.0` | `StageNode`, `SubworkflowNode` (свёрнутый), `TypedPort` (цвет по типу), `BindingEdge`, `CompileErrorOverlay`, `MiniMapLegend` |
| 2 | **Отладчик прогона** (§11) | `resizable`, `tabs`, `scroll-area`, `accordion`, `collapsible`, `badge`, `progress`, `spinner`, `alert`, `separator`, `tooltip`, `button-group`, `kbd`, `empty`, `skeleton` | `@tanstack/react-virtual` (лог), `json-edit-react` (вход/выход шага), `react-diff-viewer-continued` (ожид. vs факт.) | `RunTimeline` (Gantt шагов), `StepStatusDot`, `TokenCostMeter`, `RetryLadder`, `BreakpointGutter`, `StreamTail` (live-хвост лога) |
| 3a | **Реестр типов** (поиск использования, анализ влияния) | `table`, `input-group` (поиск), `command`, `item`+`item-group`, `badge`, `hover-card`, `tabs`, `sheet` (панель деталей), `empty`, `pagination` | `@tanstack/react-table@9` + `react-virtual` | `TypeSchemaView`, `UsageList`, `ImpactTree` (кто сломается при правке) |
| 3b | **Реестр моделей** (профили, лимиты, фолбэки, стоимость) | `table`, `card`, `field`+`field-group`, `switch`, `native-select`, `badge`, `tooltip`, `dialog`, `alert-dialog` (опасные правки) | `@tanstack/react-table@9` | `CapabilityMatrixCell`, `FallbackChain` (цепочка фолбэков), `PriceTierBadge` |
| 3c | **Реестр агентов** | `item`, `card`, `tabs`, `form`+`field`, `textarea`, `select`, `slider` (temperature), `badge`, `accordion` | — | `AgentCard`, `ToolBindingList` |
| 3d | **Реестр тулов** (закреплённые MCP-схемы) | `table`, `collapsible`, `badge`, `alert` (схема разъехалась), `hover-card`, `dialog` | `json-edit-react` (JSON Schema), `jsondiffpatch` (pinned vs live) | `McpSchemaPin`, `SchemaDriftBanner` |
| 4a | **Evals: датасеты** | `table`, `input-group`, `checkbox`, `dropdown-menu`, `sheet`, `progress`, `empty`, `pagination` | `@tanstack/react-table@9` + virtual (10k+ строк!) | `DatasetRowPreview`, `SplitBadge` (train/dev/test) |
| 4b | **Evals: сравнение экспериментов** | `chart` (+ блоки `chart-bar-multiple`, `chart-line-multiple`, `chart-tooltip-advanced`), `table`, `tabs`, `toggle-group`, `card`, `badge` | Recharts (через `chart`) | `ExperimentDiffTable` (стат-значимость), `WinLossTieBar`, `SignificanceBadge` (p-value из `@stdlib/stats-*`) |
| 4c | **Evals: очередь разметки (annotation)** | `card`, `radio-group`, `field-choice-card`, `textarea`, `button-group`, `kbd` (хоткеи 1/2/3), `progress`, `separator`, `alert-dialog` | `react-hotkeys-hook` (scoped!) | `AnnotationTask`, `SideBySideVerdict`, `QueueProgressRail` |
| 4d | **Evals: калибровка судей** | `chart`, `table`, `slider`, `tabs`, `tooltip`, `alert` | **visx `@visx/heatmap` + `@visx/scale`** (хитмап согласия) | `AgreementHeatmap` (κ Коэна), `JudgeDriftChart`, `ConfusionCell` |
| 5 | **Версии и семантический дифф** (доказательства, аппрув, откат, lineage) | `tabs`, `resizable`, `card`, `badge`, `alert-dialog` (аппрув/откат), `avatar`, `timeline→НЕТ`, `separator`, `scroll-area`, `hover-card` | `jsondiffpatch@0.7.6`, `rfc6902@5.3.0`, `react-diff-viewer-continued@4` | `SemanticDiffTree`, `EvidencePanel`, `ApprovalGate`, `LineageGraph` (React Flow, read-only), `VersionRail` |
| 6 | **Журнал решений** | `table`, `item`, `accordion`, `input-group`, `badge`, `calendar`+`popover` (диапазон дат), `select`, `scroll-area`, `empty` | `@tanstack/react-table@9` + virtual (+ worker-plugin) | `DecisionEntry`, `DecisionFilterBar`, `RationaleExcerpt` |
| 7 | **Редактор шаблонов промтов** (подсветка слотов, превью на фикстурах, дифф отрисовки) | `resizable` (3 панели), `tabs`, `select` (фикстура), `field`, `alert`, `badge`, `tooltip`, `button-group` | **`@monaco-editor/react@4.7.0`** (редактор + `DiffEditor`) | `SlotDecorator` (Monaco decorations по слотам), `RenderPreview`, `FixturePicker`, `RenderDiffPane` |
| 8 | **Граф контекста** (потребности/источники по видам) | `sidebar`, `resizable`, `badge`, `tooltip`, `toggle-group` (фильтр по видам), `hover-card`, `legend→НЕТ` | `@xyflow/react`, `elkjs` | `ContextKindLegend`, `NeedNode`/`SourceNode` (цвета из §8 токенов), `UnsatisfiedNeedBadge` |
| 9 | **Карта промтов** | `resizable`, `accordion`, `collapsible`, `item`, `badge`, `scroll-area`, `hover-card`, `breadcrumb` | `@xyflow/react` (sankey-подобный граф) ИЛИ `react-arborist@3.16.0` (дерево) | `PromptAssemblyTrace` (как собран промт), `FragmentUsageList`, `OutputToPromptEdge` |
| 10 | **Матрица моделей** (качество × цена × латентность, Парето) | `chart`, `table`, `toggle-group` (оси), `select`, `card`, `tooltip`, `badge`, `switch` | Recharts `ScatterChart`; ECharts в резерве при >1.5k точек | `ParetoFrontier` (вычисление + линия фронта), `AxisPicker`, `ConfigScatterPoint`, `TradeoffCallout` |
| 11a | **Покрытие датасетов** | `table`, `progress`, `tooltip`, `badge`, `tabs`, `scroll-area` | `@tanstack/react-table@9` + **горизонтальная виртуализация** (много колонок) | `CoverageMatrix` (кейс × ветка/узел), `CoverageCell`, `UncoveredPathList` |
| 11b | **Таймлайны циклов** | `scroll-area`, `tooltip`, `hover-card`, `badge`, `toggle-group`, `slider` (зум) | `@tanstack/react-virtual` (много дорожек) | `CycleTimeline`, `IterationLane`, `SpanBar`, `TimeAxis` — **писать самим на CSS Grid, не библиотекой** |
| 12 | **Раскрытие компонентов до примитивов** | `context-menu`, `collapsible`, `breadcrumb` (глубина раскрытия), `button-group`, `tooltip` | `@xyflow/react` (вложенные/parent-узлы), `elkjs` (перераскладка) | `ExpandToPrimitives`, `DepthBreadcrumb`, `CollapseBoundary` |
| 13 | **Эффективная конфигурация вызова** (происхождение каждого поля, дифф с определением) | `table`, `accordion`, `hover-card` (источник поля), `badge`, `tabs`, `alert` | `json-edit-react` + `jsondiffpatch` | `EffectiveConfigView`, `ProvenanceBadge` (§8 цвета), `OverrideChain` (default→agent→node→run) |
| 14 | **Экспорт** (цель, отчёт потерь, конформанс-прогон) | `dialog`, `radio-group`, `field-choice-card`, `alert`, `progress`, `table`, `badge`, `accordion`, `sonner`, `empty` | — | `ExportTargetPicker`, `LossReport` (что не переносится), `ConformanceRunReport` |
| — | **Шелл (все экраны)** | `sidebar` (блок `sidebar-15`: левая+правая), `breadcrumb`, `command`+`command-dialog` (⌘K), `sonner`, `tooltip` (один Provider), `dropdown-menu`, `avatar`, `kbd`, `separator`, `skeleton`, `spinner` | `react-hotkeys-hook@5` (HotkeysProvider + scopes), `next-themes` для `.dark` | `AppShell`, `GlobalCommandPalette`, `RunStatusIndicator` |

### Сводка: что придётся написать самим (кандидаты в приватный registry `@aiwf`)
Канвас-узлы и порты; `RunTimeline`/`CycleTimeline` (Gantt на CSS Grid);
`VirtualDataTable` (обёртка TanStack v9 + react-virtual, одна на всё приложение);
`SemanticDiffTree` + `ProvenanceBadge` (ядро доверия, по ТЗ пишем сами);
`AgreementHeatmap` (visx); `ParetoFrontier`; `CoverageMatrix`; `EffectiveConfigView`.
Всё остальное — берём готовым.

### Компоненты реестра, которые в Studio НЕ нужны (чтобы не ставить лишнего)
`carousel`, `input-otp`, `aspect-ratio`, `menubar`, `navigation-menu`, `drawer` (см. риск vaul),
`attachment`/`bubble`/`marker`/`message`/`message-scroller` (AI-чат — только если появится
чат-панель «спроси Claude о прогоне»; тогда берём их, а не пишем чат сами).

---

## 9. Реальные команды установки

```bash
# База shadcn (Next.js 16.3 / React 19.3 / Tailwind v4 уже стоят)
npx shadcn@latest init          # style=new-york, baseColor=neutral, cssVariables=true,
                                # tailwind.config = "" (v4!), iconLibrary=lucide

# Ядро UI — один заход
npx shadcn@latest add button button-group input input-group field form label \
  select native-select checkbox switch radio-group slider textarea \
  table tabs card badge item separator scroll-area skeleton spinner empty \
  dialog alert-dialog sheet popover hover-card tooltip dropdown-menu context-menu \
  command accordion collapsible progress alert breadcrumb pagination avatar \
  resizable sidebar sonner kbd toggle toggle-group calendar combobox chart

# Шрифты как registry items
npx shadcn@latest add @shadcn/font-inter @shadcn/font-jetbrains-mono

# Блоки как отправная точка
npx shadcn@latest add @shadcn/sidebar-15 @shadcn/dashboard-01

# Внешние либы
npm i @tanstack/react-table@^9.2.4 @tanstack/react-virtual@^3.14.12 \
      @tanstack/react-query@^5.102.8 \
      @xyflow/react@^12.11.6 elkjs@^0.12.0 \
      react-hotkeys-hook@^5.3.3 \
      react-diff-viewer-continued@^4.4.0 jsondiffpatch@^0.7.6 rfc6902@^5.3.0 \
      json-edit-react@^1.30.2 \
      @visx/heatmap@^4.0.0 @visx/scale@^4.0.0 @visx/group@^4.0.0 \
      @monaco-editor/react@^4.7.0 \
      next-themes

# ВНИМАНИЕ: recharts НЕ ставим руками — его тянет `shadcn add chart` с пином 3.8.0.
# ВНИМАНИЕ: clsx / tailwind-merge НЕ ставим — их заменил пакет `cn@^0.2.6` (тянется сам).
```

---

## 10. Топ-рисков (по убыванию)

1. **TanStack Table v9 ≠ v8.** Вся публичная документация «shadcn data-table» — под v8
   (`useReactTable`, `getCoreRowModel()`, `flexRender`). Слепое копирование = не соберётся.
   Решение: одна своя обёртка `VirtualDataTable` на v9 API, все 6+ таблиц через неё.
   Fallback на месяц: `@tanstack/react-table/legacy` (`useLegacyTable`) — но это долг.
2. **vaul (1.1.2, тишина с 2024-12)** под shadcn `drawer`. Минимизируем использование,
   предпочитаем `sheet`.
3. **cmdk (1.1.1, тишина ~12.5 мес)** под `command`/⌘K. Риск средний (API стабилен),
   но палитра — центральный элемент UX, держать план Б.
4. **Пин `recharts@3.8.0` в shadcn `chart`** против latest 3.10.1 — не апгрейдить вручную.
5. **Переезд на пакет `cn@0.2.6`** (сент. 2026): новые компоненты импортируют из `cn`,
   старый `@/lib/utils` — legacy. Начинать сразу на `cn`, не плодить два пути.
6. **Recharts не умеет heatmap и boxplot** — под калибровку судей заранее закладываем visx;
   это не «потом добавим», это отдельный рендер-стек.
7. **`questionnaire`, `data-table`, `tree`, `timeline`, `toast`, `typography` — в @shadcn
   их НЕТ.** Не планировать фичи «возьмём готовый компонент» на этих именах.
8. **@textea/json-viewer тянет MUI** — вторая дизайн-система. Запрещено.
9. **`@theme` без `inline`** ломает dark mode для семантических токенов — частая ошибка на v4.
10. **Monaco в Next.js 16 / RSC**: только `"use client"` + динамический импорт без SSR;
    не тащить его на экраны, где нужен лишь дифф.

## Статус секций
Все 8 пунктов задания закрыты. Помечено UNVERIFIED: (а) какой form-адаптер стоит в `form`
по умолчанию; (б) namespace реестра с `questionnaire`; (в) точные поля `nodeData` в
json-edit-react 1.30.x; (г) стабильность `experimental-worker-plugin` в table-core v9.
