# Канвас графа и визуализация прогонов (research)
Статус: DONE (2026-09-11). Все 7 разделов закрыты; открытые вопросы помечены UNVERIFIED/TODO в конце.


---
## Версии и лицензии (проверено npm view, 2026-09-11)
| пакет | версия | lic | last publish | вердикт |
|---|---|---|---|---|
| @xyflow/react | 12.11.6 | MIT | 2026-09-01 | живой, берём |
| elkjs | 0.12.0 | **EPL-2.0 OR GPL-3.0-or-later** | 2026-07-17 | живой; лицензия — см. ниже |
| @dagrejs/dagre | 3.1.1 | MIT | 2026-08-08 | живой (форк ожил) |
| d3-dag | 1.2.2 | MIT | 2026-07-05 | живой |
| graphology | 0.26.0 | MIT | 2025-01-26 | ~20 мес без релиза — RISK (но API стабилен, зрелый) |
| graphology-dag | 0.4.1 | MIT | 2023-12-09 | ~33 мес — RISK, код крошечный |
| graphology-traversal | 0.3.1 | MIT | 2022-05-04 | ~4.5 года — RISK |
| @dagrejs/graphlib | 4.0.5 | MIT | 2026-08-03 | живой |
| dominators | 1.1.2 | MIT | 2022-04-29 | ~4 года — RISK, но 200 строк |
| cytoscape | 3.34.3 | MIT | 2026-09-07 | очень живой |
| sigma | 3.0.3 | MIT | 2026-08-20 | живой |
| rete | 2.0.6 | MIT | 2025-06-30 | 14 мес — RISK |
| @visx/visx | 4.0.0 | MIT | 2026-06-11 | живой |
| @nivo/core | 0.99.0 | MIT | 2025-05-23 | 15 мес — RISK |

**ЛИЦЕНЗИЯ elkjs = EPL-2.0 OR GPL-3.0-or-later.** Это НЕ MIT. EPL-2.0 — weak copyleft на уровне файла:
использование как невзаимодействующей npm-зависимости (мы не модифицируем elk.bundled.js) для проприетарного
продукта допустимо, модификации самого elkjs надо открывать. Практика: Sprotty/Eclipse, reactflow-примеры,
n8n(*UNVERIFIED*) используют elkjs в коммерческих продуктах. Но юристам показать надо — это единственная
не-MIT зависимость в стеке канваса. Альтернатива без этого риска: @dagrejs/dagre (MIT), но он не умеет
вложенность/порты (см. §2).

---
# 2. Автораскладка: elkjs 0.12 — ПРОВЕРЕНО НА РЕАЛЬНЫХ ПРОГОНАХ

## 2.1 Готовый JSON опций под наш случай (стадии → параллельные ветки → вложенные компоненты)
Проверено: `node elk-probe2.mjs` — иерархия + порты + ORTHOGONAL + back-edge работают.

```ts
// корень
const rootLayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',                       // слева направо = стадии
  'elk.layered.layering.strategy': 'NETWORK_SIMPLEX', // компактнее LONGEST_PATH
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  'elk.edgeRouting': 'ORTHOGONAL',                // манхэттен, совпадает со SmoothStepEdge
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',    // КЛЮЧЕВОЕ: рёбра сквозь границы компонента
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES', // стабильность между перекладками
  'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
  'elk.spacing.nodeNode': '60',
  'elk.layered.spacing.nodeNodeBetweenLayers': '90',
  'elk.spacing.edgeNode': '30',
  'elk.padding': '[top=48,left=24,bottom=24,right=24]', // top больше — под заголовок группы
  'elk.portConstraints': 'FIXED_ORDER',
};
// вложенный компонент (child-узел с children)
const groupLayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.hierarchyHandling': 'INHERIT',   // наследовать от корня
  'elk.padding': '[top=44,left=20,bottom=20,right=20]',
};
// узел с типизированными портами
{ id:'a', width:180, height:56,
  layoutOptions: { 'elk.portConstraints': 'FIXED_ORDER' },
  ports: [
    { id:'a.in',  width:8, height:8, layoutOptions:{ 'elk.port.side':'WEST' } },
    { id:'a.err', width:8, height:8, layoutOptions:{ 'elk.port.side':'EAST','elk.port.index':'0' } },
    { id:'a.ok',  width:8, height:8, layoutOptions:{ 'elk.port.side':'EAST','elk.port.index':'1' } },
  ] }
```

### Что реально вернул ELK (факты, не догадки)
- Координаты детей **относительные к родителю** (`sub.x=330`, внутри него `b.x=20`).
  → Точно совпадает с моделью React Flow (`parentId` + относительный `position`). **Маппинг 1:1, без пересчёта.**
- Рёбра внутри группы лежат в `group.edges`, их `sections` тоже **относительны к группе**.
  → В React Flow рёбра живут в плоском массиве в АБСОЛЮТНЫХ координатах. Для кастомного edge с
    `sections`-геометрией нужно прибавить абсолютный оффсет предка. Это единственное реальное несовпадение.
- Cross-hierarchy рёбра (`in.out → sub.in`) при `INCLUDE_CHILDREN` получают `sections` — проверено, `true`.
- `elk.port.index` реально задаёт порядок портов на стороне (`a.err` index=0 сверху, `a.ok` index=1 ниже).
  Внимание: индекс идёт **против часовой стрелки**, на EAST это сверху вниз = 0,1,2.
- Back-edge (`b → a`, петля цикла) раскладывается без ошибок, ORTHOGONAL даёт bendPoints в обход.
- `measureExecutionTime: true` вторым аргументом `elk.layout(graph, opts)` — есть.

### Производительность (замер elk-perf.mjs, node 2026-09-11, цепочки+скип-рёбра, вложенные группы)
```
nodes=60   groups=4   ->  81 ms
nodes=200  groups=10  ->  76 ms
nodes=500  groups=20  -> 146 ms
nodes=1000 groups=40  -> 180 ms
```
Вывод: **ELK не узкое место** даже на 1000 узлах. Синхронный вызов в main thread на 200 узлах ~80-150 мс —
это один пропущенный кадр, терпимо, но worker всё равно нужен (см. 2.2), т.к. на плотных графах
(много cross-edges) crossing minimization растёт нелинейно. UNVERIFIED: не мерил граф с высокой
плотностью рёбер (|E| ~ 4|V|).

## 2.2 Web worker
elkjs даёт worker из коробки, отдельный воркер-скрипт писать не надо:
- `elkjs/lib/elk.bundled.js` — всё в одном, синхронно в текущем потоке.
- `elkjs/lib/elk-api.js` + `elkjs/lib/elk-worker.min.js` — API-обёртка, которая грузит воркер.

Next.js 16 / Turbopack — рабочий вариант (URL-воркер, без copy в public):
```ts
import ELK from 'elkjs/lib/elk-api';
const elk = new ELK({
  workerFactory: () =>
    new Worker(new URL('elkjs/lib/elk-worker.min.js', import.meta.url), { type: 'classic' }),
});
```
Подводные камни:
- `type: 'classic'` обязателен — elk-worker.min.js не ESM.
- Модуль воркера тянет ~1.4 МБ. Делать `dynamic(() => import(...), { ssr:false })` на весь модуль раскладки,
  иначе он попадёт в initial bundle страницы.
- `elk.layout()` в worker-режиме возвращает Promise, API идентичен. Отменять раскладку нельзя —
  делаем debounce (~150 мс) + игнорируем устаревший результат по generation-счётчику.
- UNVERIFIED: не проверял реальную сборку Next 16 Turbopack с этим Worker-URL (нет FE-проекта в пробе).
  Fallback, который точно работает: положить `elk-worker.min.js` в `public/` и
  `new Worker('/elk-worker.min.js')`.

## 2.3 Сравнение с dagre и d3-dag
| критерий | elkjs 0.12 | @dagrejs/dagre 3.1.1 | d3-dag 1.2.2 |
|---|---|---|---|
| вложенность (compound) | **ДА**, нативно + cross-hierarchy рёбра | `setParent()` есть в graphlib, но **dagre игнорирует вложенность при раскладке** (clusters были в dagre-d3, не в dagre) | **НЕТ** |
| порты / portConstraints | **ДА**: side, index, FIXED_ORDER/FIXED_POS | нет | нет |
| ORTHOGONAL routing | ДА (+ POLYLINE, SPLINES) | только точки перегиба по центрам | только точки |
| циклы/back-edges | ДА | ДА (acyclic phase) | **НЕТ — строго DAG, кидает ошибку** |
| размер | ~1.4 МБ (GWT-транспиляция Java) | ~80 КБ | ~90 КБ |
| лицензия | EPL-2.0/GPL-3 | MIT | MIT |
| скорость 1000 узлов | 180 мс | быстрее (~50 мс), но задача проще | быстро |

**Вердикт: elkjs.** dagre и d3-dag отпадают по одному и тому же пункту — нет вложенности и нет портов,
а у нас и то и другое в спеке (раскрытие компонентов + типизированные порты ok/err). Если EPL-2.0
зарубят юристы — это редизайн раскладки, а не замена одной строки.

---
# 1. @xyflow/react 12.11.6 — API-факты (из .d.ts в node_modules, не по памяти)

## 1.1 Что экспортируется (dist/esm/index.d.ts, проверено)
Компоненты: `ReactFlow`, `ReactFlowProvider`, `Handle`, `Panel`, `EdgeLabelRenderer`, `ViewportPortal`,
`BaseEdge`, `EdgeText`, `StraightEdge/StepEdge/BezierEdge/SimpleBezierEdge/SmoothStepEdge`.
additional-components: `Background`, `Controls`, `MiniMap`, `NodeResizer`, `NodeToolbar`, **`EdgeToolbar`**
(EdgeToolbar — относительно новое, есть в 12.11.6).
Хуки: `useReactFlow`, `useUpdateNodeInternals`, `useNodes`, `useEdges`, `useViewport`, `useKeyPress`,
`useNodesState`, `useEdgesState`, `useStore`, `useStoreApi`, `useOnViewportChange`, `useOnSelectionChange`,
`useNodesInitialized`, `useHandleConnections` (deprecated в пользу…), **`useNodeConnections`**,
**`useNodesData`**, `useConnection`, `useInternalNode`, `useNodeId`.
Экспериментальное: `experimental_useOnNodesChangeMiddleware`, `experimental_useOnEdgesChangeMiddleware`
— перехват NodeChange[] до применения. Полезно, чтобы запретить недопустимые изменения в read-only режиме
централизованно, вместо расстановки флагов по узлам.
Утилиты: `applyNodeChanges`, `applyEdgeChanges`, `addEdge`, `reconnectEdge`, `getNodesBounds`,
`getViewportForBounds`, `getIncomers`, `getOutgoers`, `getConnectedEdges`, `getSmoothStepPath`,
`getBezierPath`, `getStraightPath`, `isNode`, `isEdge`.

## 1.2 Типизированный узел со слотами — реальный рабочий паттерн
Ключ: `Node<Data, TypeLiteral>` + дискриминированный union + `NodeProps<ThatNode>`.

```tsx
import { Handle, Position, type Node, type NodeProps, type IsValidConnection } from '@xyflow/react';

// 1. Порт = данные, а не разметка. Тип порта нужен и валидации, и раскладке ELK.
type PortKind = 'data' | 'control' | 'error';
type Port = { id: string; kind: PortKind; schemaId: string; label: string };

// 2. Дискриминированный union узлов
export type LlmNode   = Node<{ title: string; model: string; inputs: Port[]; outputs: Port[] }, 'llm'>;
export type ToolNode  = Node<{ title: string; toolName: string; inputs: Port[]; outputs: Port[] }, 'tool'>;
export type GroupNode = Node<{ title: string; collapsed: boolean }, 'group'>;
export type AppNode = LlmNode | ToolNode | GroupNode;

// 3. Кастомный компонент. Слоты = маппинг Port[] -> Handle[]
export function LlmNodeView({ id, data, selected }: NodeProps<LlmNode>) {
  return (
    <div data-selected={selected} className="rounded-lg border bg-card w-[220px]">
      <header className="px-3 py-2 text-sm font-medium truncate">{data.title}</header>
      {data.inputs.map((p, i) => (
        <Handle key={p.id} id={p.id} type="target" position={Position.Left}
          style={{ top: 40 + i * 20 }} data-kind={p.kind} />
      ))}
      {data.outputs.map((p, i) => (
        <Handle key={p.id} id={p.id} type="source" position={Position.Right}
          style={{ top: 40 + i * 20 }} data-kind={p.kind} />
      ))}
    </div>
  );
}
export const nodeTypes = { llm: LlmNodeView, tool: ToolNodeView, group: GroupNodeView };
// ВАЖНО: nodeTypes/edgeTypes объявлять ВНЕ компонента (или useMemo).
// Новый объект каждый рендер = полный ремоунт всех узлов. Это ошибка №1 в React Flow.
```

## 1.3 Валидация соединений — два независимых уровня (оба в типах, проверено)
```ts
// system/dist/esm/types/general.d.ts:125
type IsValidConnection<EdgeType extends EdgeBase = EdgeBase> = (edge: EdgeType | Connection) => boolean;
```
- Проп `isValidConnection` на `<ReactFlow>` — глобально.
- Проп `isValidConnection` на **самом `<Handle>`** (`system/types/handles.d.ts:51`) — локально, per-port.
  Так и делаем: логика «этот выход отдаёт string, этот вход ждёт number» живёт рядом с портом.
```tsx
const canConnect: IsValidConnection = (c) => {
  const src = portOf(c.source, c.sourceHandle);      // из нашего store
  const dst = portOf(c.target, c.targetHandle);
  return !!src && !!dst && src.kind === dst.kind && schemaCompatible(src.schemaId, dst.schemaId);
};
```
Подводный камень: `isValidConnection` вызывается на КАЖДОМ движении мыши при протяжке связи —
держать её чистой и синхронной, схемы предрасчитать в Map, не звать zod внутри.
Визуальная обратная связь: React Flow ставит классы `.connecting`/`.valid` на handle → красим в CSS,
дополнительно `useConnection()` даёт `{ inProgress, fromHandle, toHandle }` для подсветки совместимых портов.

## 1.4 Вложенность / раскрытие компонентов (NodeBase, проверено)
Поля узла: `parentId?: string`, `extent?: 'parent' | CoordinateExtent | null`, `expandParent?: boolean`,
`hidden?: boolean`, `zIndex?: number`, `draggable/selectable/connectable/deletable?: boolean`,
`measured?: {width,height}`, `handles?: NodeHandle[]`.
- `position` ребёнка — **относительно родителя** (совпадает с выдачей ELK, см. §2).
- ПОРЯДОК В МАССИВЕ: родитель ОБЯЗАН идти раньше детей, иначе React Flow бросает ошибку #005/логирует.
  При сортировке узлов после раскладки — сначала группы, потом дети.
- Сворачивание компонента = `hidden: true` детям + `hidden: true` внутренним рёбрам + подмена
  габаритов группы. Рёбра, идущие наружу, надо **перецепить на сам group-узел** (иначе исчезнут):
  держим в data ребра `originalSource/originalTarget` и пересобираем при collapse/expand.
- `extent: 'parent'` запирает ребёнка внутри — включаем в редакторе, выключаем во время раскладки.

## 1.5 Производительность на 200+ узлах — что реально помогает
1. `onlyRenderVisibleElements` (проп есть, проверено) — не рендерит узлы вне вьюпорта. Главный рычаг.
   Цена: во время пана на слабой машине заметны «доезжающие» узлы; не включать, если узлов < 100.
2. `nodeTypes`/`edgeTypes` вне рендера + `React.memo` на каждом компоненте узла.
3. **Никогда не класть в `data` объекты, которые пересоздаются.** Узел ререндерится по ссылочному
   неравенству `data`. Данные прогона (статус, стоимость) держать в отдельном zustand store и читать
   через `useStore(selector, shallow)` внутри узла, а не прокидывать через `data`.
4. `useNodesData(nodeId)` — подписка на данные конкретного узла без ререндера остальных.
5. `useUpdateNodeInternals(id)` — ОБЯЗАТЕЛЬНО звать после динамического добавления/удаления Handle
   или смены их position, иначе рёбра цепляются к старым координатам. Частый баг при раскрытии компонента.
6. Убрать анимацию рёбер (`animated: true`) на больших графах — это CSS-анимация на каждом path.
7. `elevateNodesOnSelect`, `nodesFocusable` — мелочи, но каждая подписка стоит.
8. Порог: по опыту сообщества 1000+ DOM-узлов начинает лагать; 200-300 с memo — комфортно.
   *UNVERIFIED: своего бенчмарка рендера не делал — нет FE-проекта в пробе.*

## 1.6 Controlled / uncontrolled и read-only
- Uncontrolled: `defaultNodes`/`defaultEdges` — состояние внутри React Flow. Для вьюера прогона годится.
- Controlled: `nodes`+`edges`+`onNodesChange`+`onEdgesChange` (через `applyNodeChanges`). ОБЯЗАТЕЛЬНО
  для нас: граф — это документ, который правит и человек, и Claude через MCP; нужен единый source of truth
  (zustand) + undo/redo + оптимистичные апдейты.
- Read-only режим прогона (не редактируем, только смотрим) — один набор пропов:
  `nodesDraggable={false} nodesConnectable={false} elementsSelectable={true}
   edgesFocusable={false} zoomOnDoubleClick={false} deleteKeyCode={null}`
  (`elementsSelectable` оставить true — иначе не кликнуть по узлу, чтобы открыть его спан).

## 1.7 Лицензия / что платное
`@xyflow/react` 12.11.6 — **MIT**, вся библиотека целиком, включая MiniMap/NodeResizer/NodeToolbar/
Controls/Background. См. §1.8 после проверки страницы Pro.

## 1.8 React Flow Pro — что именно платное (проверено reactflow.dev/pro, 2026-09-11)
Платного КОДА в библиотеке нет. `@xyflow/react` MIT целиком, «forever» по заявлению мейнтейнеров.
Подписка Pro: Starter $169/мес, Professional $289/мес, Enterprise — по запросу.
Что даёт: доступ к Pro Examples и **Templates (в т.ч. «workflow editor» и «AI workflow editor»)**,
приоритет по GitHub issues, email/voice поддержка, места в команде.
**Вердикт: Pro не нужен для работоспособности.** Единственный аргумент «за» — готовый темплейт
AI workflow editor как референс, чтобы не изобретать (что прямо созвучно правилу заказчика).
Это разовая покупка одного месяца ($169) ради кода-референса, не постоянная статья расходов.
Решение — за заказчиком, техблокера нет.

---
# 3. Когда React Flow перестанет тянуть — честный порог

React Flow рендерит **каждый узел как DOM-элемент** (div + React-компонент), рёбра — SVG path.
Отсюда потолок физический, а не от качества кода.

| узлов на экране | состояние |
|---|---|
| < 150 | всё работает без ухищрений |
| 150–500 | нужны `onlyRenderVisibleElements`, memo, store-вместо-data. Работает. |
| 500–1500 | пан/зум начинает дёргаться; спасают сворачивание групп и LOD (прятать содержимое узла при zoom < 0.5, оставлять прямоугольник) |
| > 2000 одновременно видимых | **уходить с DOM-рендера** |

Для НАШЕГО продукта порог практически недостижим: воркфлоу с >500 узлами в одном
раскрытом виде — это провал продуктового дизайна, а не технический предел. Иерархия
(свёрнутые компоненты) держит число видимых узлов в десятках.

**Куда уходить, если всё-таки упрёмся (без лишних рекомендаций — только факты):**
- **Cytoscape.js 3.34.3 (MIT, релиз 2026-09-07, очень живой)** — canvas-рендер, десятки тысяч узлов,
  встроенные алгоритмы (BFS/DFS, dijkstra, pageRank, а также compound-узлы = вложенность нативно).
  Цена перехода: нет React-компонентов внутри узлов — узел рисуется стилями Cytoscape.
  Весь наш продуктовый UI внутри узла (инпуты, бейджи стоимости, shadcn) придётся выкинуть.
- **sigma 3.0.3 + graphology (MIT, 2026-08-20)** — WebGL, сотни тысяч узлов. Заточен под
  network exploration (форс-раскладки, кластеры), **НЕ под редактор с портами и ортогональными рёбрами**.
  Для нашего сценария не подходит на любом масштабе.
- **rete.js 2.0.6 (MIT, 2025-06-30, 14 мес без релиза — RISK)** — это не «быстрее React Flow»,
  это другой продукт: фреймворк node-editor с собственным движком графа/выполнения.
  Он бы конкурировал с React Flow на старте, но переходить на него ради производительности
  бессмысленно (React-рендер-плагин рисует те же DOM-узлы).

**Вердикт: остаёмся на React Flow, порог ухода не планируем.** Если графы разрастутся — первым делом
LOD и агрессивное сворачивание, а не смена библиотеки. Реальный сигнал к миграции —
не число узлов в документе, а число ОДНОВРЕМЕННО ВИДИМЫХ > 1500 после всех сворачиваний.

---
# 5. Графовые алгоритмы (сервер + UI) — ПРОВЕРЕНО ЗАПУСКОМ

Запущено `node algos.mjs`, вывод реальный.

## 5.1 graphology 0.26.0 + graphology-dag 0.4.1 + graphology-traversal 0.3.1 (все MIT)
```js
import Graph from 'graphology';
import { topologicalSort, hasCycle, willCreateCycle } from 'graphology-dag';
import { bfsFromNode, dfsFromNode } from 'graphology-traversal';

const g = new Graph({ type: 'directed' });
// start->a, start->b, a->c, b->join, c->join, join->end
topologicalSort(g)            // => ['start','a','b','c','join','end']   ✔
hasCycle(g)                   // => false                                 ✔
willCreateCycle(g,'end','start') // => true                               ✔  <- ИМЕННО ЭТО нужно в isValidConnection
bfsFromNode(g,'a',n=>reach.push(n)) // => ['a','c','join','end']          ✔  достижимость
```
`willCreateCycle(source, target)` — готовый ответ на «можно ли протянуть это ребро», O(V+E),
вызывается прямо из `isValidConnection`. Изобретать не надо.
Также в экосистеме: `graphology-shortest-path` 2.1.0 (dijkstra/bidirectional, MIT, 2024-03),
`graphology-simple-path`, `graphology-components` (connected components).

**Свежесть — риск, но приемлемый:** graphology 0.26.0 от 2025-01, graphology-dag 0.4.1 от 2023-12,
graphology-traversal 0.3.1 от **2022-05** (4.5 года). Код зрелый, без зависимостей, API заморожен.
Митигация: это ~300 строк на всё, что мы используем; в худшем случае вендорим. Не блокер,
но в реестре зависимостей пометить «unmaintained-but-stable».

## 5.2 Доминаторы — ГОТОВОЕ НА NPM ЕСТЬ, писать не надо
Пакет **`dominators` 1.1.2 (MIT, 2022-04-29)** — проверено запуском.
Экспорты (реальные, из `Object.keys`):
```
lt                  // Lengauer-Tarjan, O(E·α(V))  <- то, что искали
iterative           // Cooper-Harvey-Kennedy, проще, на малых графах не медленнее
frontiers_from_preds, frontiers_from_succs   // dominance frontiers
create_dom_tree, create_dj_graph, create_levels, create_j_edges, normalize, make_dom
reverse_graph, succs_to_preds, preds_to_succs, arrayOfArrays, simpleRefToSelf
```
API: граф — массив массивов int-индексов (succs), root = индекс.
```js
const succs = [[1,2],[3],[4],[4],[5],[]];   // start,a,b,c,join,end
dominators.iterative(succs, 0)  // => [null, 0, 0, 1, 0, 4]   ✔ проверено
// idom[i] — непосредственный доминатор узла i. idom[join=4] = 0 (start), НЕ a и НЕ b — корректно.
```
**Ответ на «гарантированно ли B выполнился до A»:** B доминирует A ⟺ B лежит на пути вверх по
dom-дереву от A к корню. Реализация — 5 строк поверх idom:
```ts
const dominates = (b: number, a: number, idom: (number|null)[]) => {
  for (let x: number|null = a; x !== null; x = idom[x]) if (x === b) return true;
  return false;
};
```
Предпосчитать dom-дерево + глубины → ответ за O(1) через ancestor-check. Объём своего кода: ~20 строк.
Если пакет `dominators` смущает возрастом (4 года) — **свой Lengauer-Tarjan ~120-150 строк**,
итеративный Cooper-Harvey-Kennedy ~40 строк и для наших размеров графа (сотни узлов) достаточно быстр.
Рекомендация: взять `iterative` алгоритм, но **написать своим кодом** (40 строк, покрывается тестами
за час) — чтобы не тащить 4-летнюю зависимость в ядро доверия. Это ровно тот случай, когда
«не изобретать велосипед» не применяется: велосипед тут — 40 строк, а зависимость — риск.

## 5.3 @dagrejs/graphlib 4.0.5 (MIT, 2026-08-03) — живой
Даёт: `alg.topsort`, `alg.isAcyclic`, `alg.findCycles` (**возвращает сами циклы**, а не только флаг —
у graphology этого нет), `alg.dijkstra`, `alg.floydWarshall`, `alg.tarjan` (SCC),
`alg.preorder/postorder`, `alg.components`. Поддерживает compound через `setParent`/`children`.
**Свежее graphology.** Если не хочется двух графовых библиотек — graphlib закрывает всё,
кроме `willCreateCycle` (но он = `isAcyclic` после виртуального добавления ребра, либо
достижимость target→source через DFS).

## 5.4 Критический путь
Готового пакета под «critical path по DAG со взвешенными узлами» на npm нет (есть CPM-калькуляторы
для project management, мертвые). **Пишем сами, ~25 строк** поверх топосорта:
```ts
function criticalPath(order: string[], preds: Map<string,string[]>, dur: Map<string,number>) {
  const end = new Map<string, number>(), from = new Map<string, string|null>();
  for (const n of order) {                       // order = topologicalSort
    let best = 0, bestPrev: string|null = null;
    for (const p of preds.get(n) ?? []) { const e = end.get(p)!; if (e > best) { best = e; bestPrev = p; } }
    end.set(n, best + (dur.get(n) ?? 0)); from.set(n, bestPrev);
  }
  let tail = [...end.entries()].reduce((a,b) => b[1] > a[1] ? b : a)[0];
  const path: string[] = []; for (let x: string|null = tail; x; x = from.get(x)!) path.unshift(x);
  return { path, total: end.get(tail)! };
}
```
Для реального прогона `dur` = фактическая латентность спана; для оценки — p50 из истории.
Подсветка критического пути на канвасе = класс на рёбрах из `path`.

## 5.5 Итог по §5 — что берём
| задача | решение | свой код |
|---|---|---|
| топосорт | `graphology-dag.topologicalSort` или `graphlib.alg.topsort` | 0 |
| детект цикла | `hasCycle` / `alg.isAcyclic`; найти сам цикл — `alg.findCycles` | 0 |
| «не создаст ли ребро цикл» | `graphology-dag.willCreateCycle` | 0 |
| достижимость | `bfsFromNode`; для массовых запросов — предпосчёт reachability-битсетов | ~15 строк |
| доминаторы | алгоритм Cooper-Harvey-Kennedy | **~40 строк своих** (пакет `dominators` есть, но 4 года) |
| «B гарантированно до A» | ancestor-check по dom-дереву | ~20 строк |
| критический путь | своё поверх топосорта | ~25 строк |
Общий объём своего графового кода: **~100 строк + тесты**. Один изоморфный пакет `@app/graph-algos`,
используется и сервером (валидация воркфлоу), и UI (подсветка).

---
# 4. Визуализация прогона: водопад спанов и таймлайн цикла

## 4.1 Что требует спека (§11 — перечитал, строки 1093-1118)
Не просто «водопад»: живой граф прогона со статусами узлов; агрегированный вид (повторы свёрнуты,
циклы нарисованы циклами) vs развёрнутый (каждый вызов отдельно); инспектор узла с **провенансом входа
(клик ведёт к источнику)**; отрисованный промт с подсветкой слотов; результаты проверок/ретраев/фолбэков;
**дифф двух прогонов по узлам**; точки останова; панель «почему»; водопад стоимости+латентности
и **ширина параллелизма**; lineage значения по стадиям; таймлайн цикла; согласие панели судей.

## 4.2 Путь A — deep-link в Langfuse (без своего UI)
ПРОВЕРЕНО, API есть: `@langfuse/client` 5.11.1 даёт
```ts
langfuse.getTraceUrl(traceId): Promise<string>   // готовый deep-link на trace в UI Langfuse
```
Плюсы: ноль работы, готовый профессиональный span-viewer, поиск, фильтры, сравнение.
Минусы (и они убийственные для §11):
- Langfuse рисует **дерево OTel-спанов**, а не НАШ граф. Циклы, стадии, свёрнутые повторы, ширина
  параллелизма — этих понятий у него нет.
- Нет провенанса «клик ведёт к источнику значения» — это наша модель данных, не OTel.
- Нет диффа двух прогонов по узлам, нет breakpoints, нет replay-с-правкой-входа.
- Уводит пользователя из продукта в чужой UI с другим логином. Для платформы это регресс UX.

## 4.3 Путь B — свой UI поверх данных Langfuse
ПРОВЕРЕНО, API чтения есть (из `@langfuse/client/dist/index.d.ts`, современные имена —
старые `fetchTrace/fetchObservations` помечены `@deprecated`):
```ts
langfuse.api.trace.get(traceId)          // трейс целиком
langfuse.api.trace.list({...})           // список трейсов
langfuse.api.observations.getMany({...}) // спаны/генерации с фильтрами
langfuse.api.sessions.get(...)
langfuse.api.datasets.getRun / getRuns   // для §12 (эксперименты)
```
То есть Langfuse — **хранилище и бэкенд**, UI — наш. Это же и ответ на «не изобретать велосипед»:
мы не пишем свой OTel-коллектор и не хранилище, мы пишем только отрисовку своей доменной модели.

## 4.4 Чем рисовать водопад — оценка библиотек
| вариант | версия/дата | вердикт |
|---|---|---|
| **d3-scale 4.0.2 (ISC) + свой SVG/div** | 2024, стабилен как камень | **БЕРЁМ** |
| @visx/* 4.0.0 (MIT, 2026-06-11) | живой, модульный | избыточен для водопада, полезен для §14.10 (Парето модели) |
| @nivo/* 0.99.0 (MIT, 2025-05-23) | 15 мес без релиза — RISK | не берём |
| recharts | — | не берём: не умеет вложенный/иерархический waterfall |

Почему свой SVG, а не готовый чарт: **водопад спанов — это не чарт, это таблица с позиционированными
полосками.** Нужна только одна вещь — линейная шкала времени:
```ts
import { scaleLinear } from 'd3-scale';
const x = scaleLinear().domain([run.startedAt, run.endedAt]).range([0, width]);
// строка спана = div с left = x(span.start), width = x(span.end) - x(span.start)
```
Дальше это обычная виртуализированная таблица shadcn/Tailwind: строка = узел, отступ = глубина,
две полоски (латентность серая / стоимость цветом или второй бар), клик = раскрыть, hover = tooltip.
Любая чарт-библиотека здесь будет мешать: нужны sticky-заголовки, виртуализация на 1000+ спанов,
раскрытие поддеревьев, синхронное выделение с канвасом — это UI-таблица, а не визуализация.
CSS-only позиционирование (`left: %`, `width: %`) вообще снимает вопрос: **d3-scale можно не брать**,
проценты считаются в 3 строки. Берём d3-scale только если появятся тики/оси/log-шкала.

## 4.5 «Ширина параллелизма» и «таймлайн цикла»
- Ширина параллелизма = по отсортированным событиям start/end считаем текущее число активных спанов →
  step-график (sparkline над водопадом). ~20 строк, sweep-line. Готовой библиотеки не нужно.
- Таймлайн цикла (итерации агентного цикла) = swimlane: строка на итерацию, внутри — спаны.
  Та же примитивная модель, что и водопад, другой группирующий ключ. Один компонент, два режима.

## 4.6 ВЕРДИКТ по §4
**Свой UI (путь B), Langfuse — хранилище + запасной deep-link.**
Конкретно:
1. Водопад/таймлайн — свой компонент на CSS-позиционировании (+ d3-scale при необходимости осей).
   Оценка: 2-3 дня на компонент с виртуализацией. Это не «изобретение велосипеда» — готового
   «waterfall-компонента с доменной иерархией» на npm нет.
2. Данные тянем `langfuse.api.trace.get` / `api.observations.getMany`, кэш — TanStack Query 5.102.8.
3. В инспекторе узла — кнопка **«Открыть в Langfuse»** через `getTraceUrl(traceId)`. Дешёвая страховка:
   всё, что мы не успели отрисовать (сырые payload'ы, вложенные LLM-вызовы), доступно в один клик.
4. **Не** пытаться заменить Langfuse полностью: поиск по трейсам, фильтры, ретеншен — оставляем ему.
   Свой UI рисует только «прогон одного воркфлоу», всё остальное — deep-link.

---
# 6. Граф контекста (§14.8) и карта промтов (§14.9)

Спека (строки 1266-1268):
- §14.8 «Граф контекста: потребности и источники, окрашенные по видам — статика, данные, база знаний,
  генерация, человек».
- §14.9 «Карта промтов: какие шаблоны и фрагменты какими узлами и процессами используются,
  какие выходы в какие промты приходят, как собирается каждый промт».

## Можно ли переиспользовать тот же React Flow — ДА, и нужно
Оба экрана — это **двудольные направленные графы**, ровно та же модель, что канвас:
- §14.8: узлы `{need}` и `{source}`, ребро = «потребность закрывается источником».
- §14.9: узлы `{prompt-template}`, `{fragment}`, `{node}`, `{output}`; рёбра = использование/подстановка.

Что переиспользуется 1:1: `<ReactFlow>` + ELK (тот же worker, другие опции), MiniMap, Controls,
пан/зум, выделение, hover-подсветка соседей. Что различается — только `nodeTypes`/`edgeTypes` и раскладка.
Архитектурно: один пакет `@app/graph-view` с пропами `{nodes, edges, nodeTypes, layoutPreset}`,
три экрана (канвас воркфлоу / граф контекста / карта промтов) — три пресета. Это и есть
OCP: новый вид графа = новый пресет + свои node-компоненты, ядро не трогаем.

## Визуальные кодировки (конкретно)
§14.8 «вид источника» — 5 категорий. Кодировка **формой + иконкой + цветом**, не только цветом
(5 цветов на графе теряются, плюс дальтонизм):
| вид | форма | иконка | цвет (Tailwind) |
|---|---|---|---|
| статика | прямоугольник, сплошная рамка | Lock | slate-500 |
| данные (БД/API) | прямоугольник, скошенный угол | Database | blue-500 |
| база знаний (RAG) | скруглённый | BookOpen | violet-500 |
| генерация (LLM) | скруглённый + двойная рамка | Sparkles | amber-500 |
| человек | шестиугольник/пунктир | User | emerald-500 |
Непокрытая потребность = **красная пунктирная рамка + красный бейдж**, это главный сигнал экрана
(«чем не закрыта потребность»). Насыщенность/толщина ребра = частота использования.
Дополнительно: ребро пунктиром = источник опциональный; двойное ребро = несколько источников (конфликт).

§14.9 «как собирается промт»: две проекции на одном экране.
- Слева React Flow: граф «фрагмент → шаблон → узел».
- Справа панель сборки одного промта: отрисованный текст с **подсвеченными слотами**, где цвет слота
  = вид источника из §14.8 (сквозная кодировка между экранами — это критично, иначе два языка).
Ребро «выход узла X → слот S шаблона T» — подписанное ребро (`EdgeText`/`EdgeLabelRenderer`, оба есть).
Раскладка для §14.9 — тоже ELK layered RIGHT, но `elk.direction: 'DOWN'` читается лучше для
«сборка сверху вниз». Проверять на реальных данных.

Подводный камень: граф контекста у реального воркфлоу плотнее канваса (один источник закрывает
десятки потребностей → hub-узлы, звёзды). Митигация: фильтр по стадии/узлу по умолчанию,
а не «весь граф сразу»; при hover — затемнение всего, кроме 1-hop соседей (`useStore` + класс dimmed).

---
# 7. Тестирование графового UI — что реально работает

## 7.1 Playwright — основной инструмент, но с оговорками
Работает:
- Узлы React Flow — обычные DOM-элементы. Селекторы: `[data-id="<nodeId>"]` (React Flow сам ставит
  `data-id` на обёртку узла), `.react-flow__node`, `.react-flow__edge[data-testid]`.
  На узел добавляем свои атрибуты через `domAttributes` (поле есть в `Node`, проверено в types) —
  это официальная escape-hatch: `domAttributes: { 'data-testid': 'node-llm-summary' }`.
- Drag: `page.locator('[data-id=x]').dragTo(...)` часто НЕ срабатывает (React Flow слушает pointer-события
  с промежуточными move). Рабочий рецепт — ручная последовательность:
  `mouse.move(x,y); mouse.down(); mouse.move(x2,y2,{steps:10}); mouse.up();`
  **steps обязателен**, иначе React Flow не увидит drag.
- Соединение портов: то же самое от `.react-flow__handle[data-handleid="out"]` к целевому handle.

Не работает / хрупко:
- Скриншот-сравнение всего канваса. Причины: ELK даёт субпиксельные координаты (в наших замерах
  `y: 89.33333333333334`), CSS transform на viewport, разный рендер шрифтов на CI vs локально.
  **Вывод: НЕ делать visual regression на канвас целиком.** Делать на отдельный узел
  (`locator('[data-id=x]').screenshot()`) с `maxDiffPixelRatio`.
- Ожидание «раскладка закончилась». Рецепт: после layout ставим на контейнер `data-layout="ready"`
  и ждём `expect(locator).toHaveAttribute('data-layout','ready')`. Без этого — флейк 100%.

## 7.2 Чистые unit-тесты — туда уходит максимум логики (главный вывод)
React Flow в jsdom **не работает нормально**: нет ResizeObserver, нет измерений → узлы имеют нулевые
размеры, рёбра не считаются. Стандартный хак — мокать ResizeObserver и `getBoundingClientRect`,
но тестируешь фикцию.
Правильный ответ: **вынести всё, что можно, из React**:
- маппинг `spec → ElkGraph` и `ElkResult → Nodes/Edges` — чистые функции, vitest 5.0.0, без DOM;
- `isValidConnection` — чистая функция, тесты таблицей;
- графовые алгоритмы (§5) — чистые, property-based тесты (fast-check) на «топосорт согласован с рёбрами»,
  «доминатор транзитивен»;
- collapse/expand-редьюсер — чистый редьюсер над `{nodes, edges}`.
После этого на Playwright остаётся ~10 сценариев, а не 100.

## 7.3 Storybook — да, но как визуальная песочница, не как тест-раннер
Реально полезно: стори на каждый тип узла (состояния: idle / running / ok / failed / skipped /
cached / needs-approval), на инспектор, на водопад с фикстурой прогона. Это ускоряет дизайн
и даёт стабильный таргет для visual regression (**узел отдельно** — стабильно, в отличие от канваса).
Оговорка: Storybook 9 + Next 16 + Tailwind v4 — связка, которую надо проверить на нашей версии.
*UNVERIFIED: не ставил Storybook в пробу, версии Next 16.3/React 19.3 свежие.*
Если настройка окажется дорогой — заменяется страницей `/dev/gallery` в самом Next-приложении
(все состояния узлов на одной странице). Дешевле и без лишней зависимости.

## 7.4 Рекомендуемая пирамида
1. vitest, чистые функции: ELK-маппинг, валидация связей, графовые алгоритмы, collapse-редьюсер — 80%.
2. Playwright, реальный Chromium, ~10 сценариев: открыть воркфлоу → раскладка готова → развернуть
   компонент → узлы появились; протянуть валидную/невалидную связь; открыть прогон → узлы окрашены
   по статусу → клик по узлу → инспектор с правильным спаном; водопад синхронизирован с канвасом.
3. Скриншоты — только отдельные узлы/панели, никогда канвас целиком.

---
# ИТОГ: решения одной страницей

| вопрос | решение | почему |
|---|---|---|
| канвас | `@xyflow/react` 12.11.6, MIT, controlled-режим | React-компоненты внутри узлов = наш продуктовый UI на shadcn; Pro не нужен |
| React Flow Pro | не покупать (опционально $169 разово за темплейт AI workflow editor) | платного кода нет, только примеры/поддержка |
| раскладка | `elkjs` 0.12.0, `layered` + `INCLUDE_CHILDREN` + `ORTHOGONAL`, в web worker | единственный, кто умеет вложенность И порты; 1000 узлов = 180 мс |
| dagre / d3-dag | отклонены | нет compound-раскладки и нет портов; d3-dag ещё и циклы не умеет |
| порог ухода с React Flow | >1500 одновременно видимых узлов; тогда Cytoscape.js | практически недостижимо при иерархии/сворачивании |
| водопад прогона | свой компонент (CSS-позиционирование, при нужде d3-scale) | §11 требует доменную модель (циклы, стадии, провенанс), которой нет ни у одного чарта |
| Langfuse | хранилище + `api.trace.get`/`api.observations.getMany` + `getTraceUrl()` как deep-link | не пишем свой коллектор; не уводим пользователя в чужой UI |
| графовые алгоритмы | graphology-dag (топосорт/циклы/willCreateCycle) + ~100 строк своих (доминаторы, крит.путь) | готовое есть на 70%, остальное дешевле написать, чем тащить 4-летние пакеты |
| §14.8 / §14.9 | тот же React Flow + ELK, один пакет `@app/graph-view`, три пресета | одна модель данных (направленный граф), разные nodeTypes |
| тесты | vitest на чистые функции (80%) + ~10 Playwright-сценариев; скриншоты только отдельных узлов | React Flow в jsdom не измеряется; ELK даёт субпиксельные координаты → визуальные диффы флейкуют |

## КРИТИЧЕСКИЕ НАХОДКИ (то, что ломает планы, если не учесть)
1. **elkjs — EPL-2.0 OR GPL-3.0-or-later, НЕ MIT.** Единственная не-MIT зависимость канваса.
   Использование как немодифицированной npm-зависимости в проприетарном продукте допустимо,
   но это юридическое решение, а не техническое. Показать заказчику ДО начала работ.
   Замены с тем же функционалом (вложенность + порты) на MIT нет.
2. **Рёбра внутри ELK-групп приходят в координатах группы, а React Flow рисует рёбра в абсолютных.**
   Узлы маппятся 1:1 (обе модели относительные), рёбра — нет. Если строим кастомные рёбра по
   `sections`, нужен пересчёт по цепочке предков. Не заметить это на плоском графе и словить
   на первом же раскрытии компонента — типовой сценарий.
3. **`nodeTypes`/`edgeTypes` объявить вне рендера.** Новый объект каждый рендер = ремоунт всех узлов.
   Ошибка №1 в React Flow, убивает производительность мгновенно.
4. **Данные прогона НЕ прокидывать через `node.data`.** Статус/стоимость/латентность обновляются
   стримом; ссылочное неравенство `data` ререндерит узел. Отдельный zustand store + `useStore(selector)`
   внутри компонента узла.
5. **`useUpdateNodeInternals(id)` обязателен** после динамической смены Handle (раскрытие компонента,
   изменение числа портов) — иначе рёбра цепляются к старым координатам.
6. **Родитель обязан идти в массиве nodes раньше детей** — иначе ошибка React Flow.
7. **Visual regression на канвас целиком не делать.** ELK возвращает `y: 89.33333333333334`;
   субпиксели + CSS transform + шрифты CI = вечный флейк.
8. graphology-traversal последний релиз 2022-05 (4.5 года), graphology-dag — 2023-12,
   `dominators` — 2022-04. Работают, но в реестре зависимостей пометить как unmaintained-but-stable;
   доминаторы лучше написать своими 40 строками.

## ОТКРЫТЫЕ / UNVERIFIED
- TODO: не проверена реальная сборка Next 16.3 + Turbopack с `new Worker(new URL('elkjs/lib/elk-worker.min.js', import.meta.url))`. Фолбэк (файл в `public/`) точно рабочий.
- TODO: не мерил ELK на плотном графе (|E| ≈ 4|V|) — crossing minimization там растёт нелинейно.
- TODO: не делал своего бенчмарка рендера React Flow на 200-500 узлах (нет FE-проекта в пробе); цифры §1.5 — из практики сообщества.
- TODO: Storybook 9 + Next 16.3 + Tailwind v4 — совместимость не проверена; есть дешёвая замена (страница `/dev/gallery`).
- TODO: не проверял точную форму ответа `langfuse.api.trace.get` (поля observations, usage, cost) — только наличие метода в .d.ts.
