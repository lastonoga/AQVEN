# React Flow: гайдлайны отрисовки воркфлоу (срез 1)

2026-09-14. `@xyflow/react` 12.11.6 (последний, 2026-09-01), `@dagrejs/dagre` 3.1.1, React 19.

## 1. Подграфы и группы

| Инвариант | Значение | Цена нарушения |
|---|---|---|
| `parentId: string` | id родителя (в v12 `parentNode` переименован) | — |
| позиция ребёнка | **относительно родителя**, `{x:0,y:0}` = его левый верх | «съехавшие» узлы |
| порядок в `nodes` | **родитель строго раньше детей** | дети не привязываются; дословно из доки: «It's important that your parent nodes appear before their children in the `nodes`/`defaultNodes` array» |
| `extent: "parent"` | только при наличии `parentId` | warning #005 «Only child nodes can use a parent extent» |
| размер родителя | явный `style: { width, height }` | группа не растёт — React Flow её не измеряет |
| `type: "group"` | служебный тип **без хендлов** | у нас свой `wfgroup` с хендлами — осознанное отличие |

У нас это уже верно: `scene.ts:54-55` ставит `parentId`/`extent`, `scene.ts:100`
`.sort((l, r) => l.depth - r.depth)` даёт нужный порядок. **Вложенность глубже одного уровня** официально не ограничена: `parentId` рекурсивен, координаты
складываются по цепочке. Ограничение не в React Flow, а в dagre — отсюда `frame-layout.ts`.
**`expandParent: true`** ставится на *ребёнка* (родитель растёт при выносе за границу) — нам
не нужен при `draggable: false`, но это единственный официальный «группа растёт сама».

**Padding группы React Flow не считает** — свойства нет. Закладывать в раскладку:
`GROUP_PAD = { top: 44, right: 20, bottom: 20, left: 20 }`, где `top` — высота шапки `GroupNode`.
Дефект 3 (пустота в `merged`) — завышенные `ranksep`/`nodesep` внутреннего прогона dagre плюс pad,
а не свойство React Flow: внутри группы `ranksep: 48`, `nodesep: 24` против корневых `90` и `40`.

## 2. Рёбра: тип и геометрия

| `type` | Когда для LR-графа |
|---|---|
| `"smoothstep"` | **дефолт для нас**: ортогональные сегменты, читается как схема |
| `"step"` | то же без скругления — для «границы компонента» |
| `"straight"` | только соседние ранги, прямая видимость |
| `"default"` (bezier) | **источник дефекта 1**: кривая уходит вбок и проходит под соседними карточками |
| `"simplebezier"` | мягче, но так же не обходит препятствия |

Действие: в `edges.ts` у `data` заменить `type: "default"` → `"smoothstep"`. **`pathOptions`**
валидны только для своего типа:

```ts
type: "smoothstep",
pathOptions: { borderRadius: 8, offset: 24 },
```

`borderRadius` (default 5) — радиус углов. `offset` (default 20) — длина прямого «уса» от хендла
до первого поворота; главный рычаг против «вышло из узла и сразу режет соседа». `curvature`
(default 0.25) — только у bezier. `interactionWidth` (default 20) — невидимая широкая линия для
мыши. У `markerEnd` держать `color` равным `stroke`, иначе маркер чёрный.

**Промежуточные точки.** Официального waypoints API нет — только свой edge-тип, где `channelX`
кладётся при раскладке как x свободного межрангового коридора dagre:

```tsx
const OrthoEdge = ({ id, sourceX, sourceY, targetX, targetY, data, markerEnd, style }: EdgeProps) => {
  const gap = data.channelX
  const path = `M ${sourceX},${sourceY} L ${gap},${sourceY} L ${gap},${targetY} L ${targetX},${targetY}`
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
}
```

## 3. Обход узлов (дефект 1): официального решения нет

Мейнтейнеры xyflow в discussion #2806: «probably not provide an edge algorithm in the near future
(maybe never)». Issue #4766 про orthogonal routing **закрыт как not planned**.
| Решение | Свежесть | Механика | Вердикт |
|---|---|---|---|
| свой `OrthoEdge` по коридорам dagre | — | 3 сегмента через межранговый зазор | первый шаг: детерминированно, тестируемо |
| `avoid-nodes-edge` 0.3.2 | 2026-06-17; peer `@xyflow/react >=12`, `libavoid-js 0.4.5`, `zustand >=4` | libavoid (C++→WASM) в Web Worker: ортогональные пути, nudging параллельных рёбер | самое живое; **UNVERIFIED:** React 19 и вложенные группы не проверял |
| `@jalez/react-flow-smart-edge` 4.0.0 | 2025-06-25; peer `react >=17`, `@xyflow/react >=12` | A* по сетке: `SmartBezierEdge`, `SmartStraightEdge`, `SmartStepEdge` | форк архивного `@tisoap/...`; `nodePadding` ≥16, `gridRatio` 10 (меньше = точнее и медленнее) |

Порядок действий: `smoothstep` + `offset` + свой `OrthoEdge`; `avoid-nodes-edge` — только если
после этого пересечения остались.

## 4. Границы групп (дефект 2)

«Порта группы» в React Flow нет — это делается моделью графа. Правило: **ребро извне не целится
в узел внутри группы**, вместо этого `target: groupId` + `targetHandle: "in"`, а внутри — отдельное
ребро от входа группы к первому узлу тела. У `GroupNode` (строки 89–115) хендлы без `id`: дать им
`id="in"` / `id="out"` и проставлять `sourceHandle`/`targetHandle` в `toFlowEdge` — тогда вход и
выход группы становятся точками, а не случайным местом на рамке.

## 5. Подписи на рёбрах (дефект 4)

`edges.ts` уже использует штатный путь (`label` + `labelStyle` + `labelBgStyle` +
`labelBgPadding: [4,2]` + `labelBgBorderRadius: 3`), который ставит подпись в центр пути, а не
сбоку. Столбик `best_of`/`merge`/`rank`/`vote` на пунктире — значит их рисует `StageRail`:
убрать оттуда. Для HTML-подписи (иконка вида связи, hover по нашему правилу 4) —
`EdgeLabelRenderer`:

```tsx
const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 8, offset: 24 })

<BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
<EdgeLabelRenderer>
  <div
    className="nodrag nopan"
    style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
  >
    {data.label}
  </div>
</EdgeLabelRenderer>
```

Типовые поломки: без `position: "absolute"` подпись улетает в угол; без `nodrag nopan` канвас
панится по клику; `EdgeLabelRenderer` по умолчанию `pointer-events: none`, для hover нужен явный
`pointerEvents: "all"`. Для веера центр пути бесполезен — брать точку у источника.

## 6. Порты (Handles)

`<Handle type="source"|"target" position={Position} id="slot" />`. При **нескольких хендлах одного
типа `id` обязателен**, иначе warning «Couldn't create edge for source/target handle id» и ребро не
рисуется. У нас `id` нет нигде (`FlowNode.tsx:47,63,70,112`, `FanNode.tsx:24,32`, `GroupNode.tsx:89–115`)
— под именованные слоты добавить `id={"in:" + slot}` на target, `id="out"` на source, и `targetHandle`
в ребре.

Хендл прячут `opacity: 0` / `visibility: hidden`, **никогда `display: none`** — иначе позиция
не измеряется. После программного изменения набора хендлов — `useUpdateNodeInternals()(nodeId)`.
`isValidConnection` официально рекомендуют держать на `<ReactFlow>`, а не на хендле.

## 7. Производительность

| Проп | Default | Что ставить |
|---|---|---|
| `onlyRenderVisibleElements` | `false` | `true` от ~200 узлов; требует известных размеров узла |
| `elevateNodesOnSelect` | `true` | оставить |
| `elevateEdgesOnSelect` | `false` | `true` — иначе выбранное ребро остаётся под группой |
| `defaultEdgeOptions` | — | `{ zIndex: 1 }` — см. §8 |
| `minZoom` / `maxZoom` | `0.5` / `2` | `minZoom: 0.1` для крупных воркфлоу (правило 2: без сворачивания) |
| `nodeTypes` / `edgeTypes` | — | **объект вне рендера** (у нас `FlowCanvas.tsx:27` — верно) |

Кастомные узлы оборачивать в `memo`, `data` собирать через `useMemo` (стабильная ссылка).

## 8. Частые ошибки из обсуждений

- **`zIndex`.** По умолчанию (`zIndexMode: "basic"`) ребро, привязанное к узлу с `parentId`,
  поднимается **над** этим узлом: `getElevatedEdgeZIndex` прибавляет к `edge.zIndex` максимальный
  `z` концов, у которых есть родитель. Из-за этого ребро внутри группы перекрывает и рамки, и
  карточки, какие бы роли ни расставили. Лечится `zIndexMode="manual"` на `<ReactFlow>`: тогда
  `z` берётся ровно тот, что проставлен в сцене, и порядок задаёт **лестница по глубине**
  (`scene.ts`, шаг 10): рамка группы `(depth + 1) * 10`, карточка `+4`, ребро `−4` от уровня
  меньшего из концов. Следствия: вложенная рамка выше родительской, но ниже своих узлов; ребро
  выше рамки, внутри которой лежит, и ниже любой рамки своего уровня и глубже. Свёрнутая группа
  рисуется как карточка и берёт `+4`. Баг #4831 (дети прыгают на `zIndex` 1000 при выборе) в
  ручном режиме не срабатывает: `elevateNodesOnSelect` и `elevateEdgesOnSelect` там игнорируются.
- **Группа не растёт** — нет `style.width/height` либо `expandParent` у ребёнка.
- **Позиции съезжают** — ребёнку дали абсолютные координаты, либо родитель стоит в массиве позже.
- **Рёбра не видны** — нет `@xyflow/react/dist/style.css`, нет хендлов, либо контейнер без
  ширины/высоты («React Flow parent container needs width and height»).
- **`nodeTypes` пересоздан в рендере** — warning и ремоунт всех узлов каждый кадр.
- **Ребро внутри группы не кликается** — перекрыто телом группы, тот же `zIndex`.

## Дефект → действие

| Дефект | Что применить | Свойство и значение |
|---|---|---|
| 1. Линия сквозь `deduped` | сменить тип, увести в коридор | `type: "smoothstep"`, `pathOptions: { borderRadius: 8, offset: 24 }`; при остатке — `avoid-nodes-edge` 0.3.2 |
| 2. Рёбра режут границы групп | входить в группу, а не в её содержимое | `target: groupId`, `sourceHandle: "out"`, `targetHandle: "in"` на `GroupNode` |
| 3. Пустота внутри группы | разные параметры dagre по уровням | внутри: `ranksep: 48`, `nodesep: 24`; корень: `ranksep: 90`, `nodesep: 40`; `GROUP_PAD.top = 44`, остальные 20 |
| 4. Подписи столбиком сбоку | убрать из `StageRail`, вернуть на ребро | `label` + `labelBgPadding: [6,3]` или `EdgeLabelRenderer` с `position:"absolute"`, `nodrag nopan`, `pointerEvents:"all"` |
| 5. `map` оторван от `call` | это не разрыв связи, а pad и z-порядок | `extent: "parent"` уже есть; добавить `zIndex` по глубине и `GROUP_PAD` от глубины |
| Каша слоёв | явный порядок отрисовки | `defaultEdgeOptions={{ zIndex: 1 }}`, `elevateEdgesOnSelect` |

**Источники:** reactflow.dev — sub-flows, common-errors, Edge, EdgeLabelRenderer, Handle,
`<ReactFlow>` props; xyflow/xyflow discussions #2806, #3660, #4285, issues #4766, #4831, #4060;
npm: `avoid-nodes-edge@0.3.2`, `@jalez/react-flow-smart-edge@4.0.0`, `@xyflow/react@12.11.6`.
