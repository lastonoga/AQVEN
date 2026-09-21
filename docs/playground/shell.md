# Плейграунд: техническая оболочка

Срез: оболочка. Соседние — `scope.md`, `data.md`, `references.md`, `build-order.md`.

## 1. Запуск: `aqven dev`

Одна команда в корне проекта: один процесс, один порт, ни докера, ни внешнего хоста.
```
$ aqven dev
aqven dev -> http://localhost:5180   project ~/hotel-project   flows 3   synth 31 ms
```

Шаги: (1) поиск корня вверх от cwd до `aqven.yaml`, нет — ошибка `aqven init`, не дефолт на cwd;
(2) открытие `.aqven/playground.db`, WAL, `CREATE TABLE IF NOT EXISTS`, чистка старых прогонов;
(3) первый синтез `src/**/*.flow.ts` в изоляте (ADR-0018) → IR в памяти → компилятор → диагностика;
(4) раздача собранного `apps/studio/dist` (в разработке UI — отдельный `vite dev`, проксирующий `/api` на 5180, [ADR-0024](../adr/0024-studio-on-vite.md)); (5) watcher; (6) печать URL и открытие браузера (`--no-open`
и `$BROWSER=none` отключают). Ошибка синтеза не роняет процесс: флоу помечается `broken`,
сервер стартует, экран показывает файл и строку. **Порт 5180, фиксированный, без автоподбора**
(занят — падаем с текстом `aqven dev --port N`): скачущий порт ломает закладку и историю браузера,
а это половина удобства дебаг-панели; 5180 свободен от 5173 (Vite), 4000 (Cube), 4983 (Drizzle
Studio), 3141 (VoltAgent). **Слушаем только `127.0.0.1`**: панель читает ФС проекта и ходит в провайдеров с ключами из `.env`.

| | Cube | Drizzle Studio | Наше |
|---|---|---|---|
| Порт / где UI | 4000, тот же процесс | 4983, но UI на **внешнем хосте** `local.drizzle.studio` | 5180, тот же процесс |
| Ориджин | один | два, CORS | один, без CORS |

Модель Drizzle Studio — то же, за что отвергнута консоль VoltAgent: фронтенд на чужом домене,
подключённый к localhost. Берём модель Cube ([docs](https://docs.cube.dev/docs/explore-analyze/playground)) — UI и API в одном процессе, офлайн, нулевая настройка.

## 2. Сервер и эндпоинты

**Решение: голый `node:http` плюс роутер на ~40 строк. Ни Hono, ни плагина Vite.** Эндпоинтов семь, все под `/api/*`, тела JSON, аутентификации нет, CORS нет, OpenAPI нет. Из того,
что даёт Hono, нужен только роутинг. Зато `@voltagent/server-hono` втаскивает в dev-инструмент
рантайм-зависимость, которой он не пользуется, и версионную связку там, где её быть не должно.
`vite.config.ts` с `configureServer` отпадает по другой причине: тогда жизненным циклом владеет
Vite, а владеть должны синтезатор и watcher. Поэтому наоборот — наш сервер главный, Vite внутри.
Пересмотр решения: второй ориджин, загрузка файлов или больше ~15 эндпоинтов — переходим на Hono.

```ts
const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
http.createServer((req, res) => route(req, res) ?? vite.middlewares(req, res)).listen(5180, "127.0.0.1");

```ts
"GET  /api/flows"                  => FlowSummary[]
"GET  /api/flows/:id"              => { id: string; ir: Ir; layout: Layout; synthMs: number }
"GET  /api/flows/:id/diagnostics"  => Diagnostic[]
"GET  /api/flows/:id/prompt/:node" => RenderedPrompt
"POST /api/runs"   { flow: string; input: unknown }  => { runId: string }
"GET  /api/runs/:runId"            => { run: Run; events: RunEvent[]; renders: Record<string, Render> }
"GET  /api/events"                 => EventSource

type FlowSummary = { id: string; version: number; file: string; nodes: number; status: "ok" | "diagnostics" | "broken" };
type Diagnostic = { severity: "error" | "warn"; code: string; message: string; at: { node?: string; slot?: string }; source?: { file: string; line: number } };
type RenderedPrompt = { messages: Message[]; slots: Record<string, Provenance>; tokens: number; cachePrefixEnd: number };
type ServerEvent = { t: "synth"; flows: string[]; ms: number } | { t: "diagnostics"; flow: string; diagnostics: Diagnostic[] }
  | { t: "synth_error"; flow: string; file: string; line: number; message: string } | { t: "run"; runId: string; event: RunEvent };
```

**`GET /api/events` — один SSE-канал на всё.** Не канал на прогон и не WebSocket: клиент один,
поток односторонний, SSE переподключается сам и читается глазами в devtools. `POST /api/runs`
отвечает `runId` до исполнения, ход прогона идёт событиями `{ t: "run" }` туда же. Мокаются только
вызовы моделей и внешних тулов (`data.md`), остальное — настоящий рантайм по настоящему IR.

## 3. Watcher и hot reload

`@parcel/watcher@2.6.0`, подписка на корень, `ignore: ["node_modules", ".git", ".aqven"]`; нативный
FSEvents/inotify, chokidar здесь лишний слой. Цепочка: файл → debounce 50 мс → пересинтез
затронутых флоу в горячем изоляте → компилятор → дифф по `irHash` → SSE `synth` \| `diagnostics`
\| `synth_error` → мерж IR на клиенте, elk, перерисовка.

**Бюджет.** Синтез 200 узлов — 27,6 мс вхолодную, 1,9–2,3 мс прогретый (ADR-0018); реальные флоу
на 10–20 узлов — единицы миллисекунд. Дорога не работа, а загрузка модуля: полный `tsx synth.ts` — 0,80 с,
поэтому процесс держит изолят горячим и инвалидирует только изменённый модуль и зависимых; «сохранил →
перерисовалось» — **30–60 мс**. Debounce 50 мс съедает половину бюджета осознанно: редакторы пишут
файл в 2–3 системных вызова, без склейки получаем двойной синтез.
**Гранулярность.** Равные `irHash` до и после — правка была в прозе, не перерисовываем ничего.
Разные — мержим IR и пересчитываем раскладку. Вьюпорт, выделенный узел и вкладка инспектора
сохраняются: потеря места после каждого сохранения убивает дебаг-панель. **Ошибка синтеза
не гасит канвас**: граф остаётся прежним, поверх — баннер с файлом и строкой, следующий удачный
синтез его снимает; пустой экран на каждой опечатке делает инструмент бесполезным. Правка `.tsx`
панели — это HMR самого Vite, правка `.flow.ts` проекта — наш SSE; пути независимы.

## 4. SQLite и ORM

**Драйвер — `better-sqlite3@12.11.1`**, не 13.x и не `node:sqlite`.

| Кандидат | Вердикт |
|---|---|
| `node:sqlite` | **Нет.** В пробе Node 20.19.0 модуля нет: `No such built-in module`, флага `--experimental-sqlite` тоже нет (проверено запуском). Требовать Node 22+ ради дебаг-панели — тот же докер сбоку. |
| `better-sqlite3@13.0.3` | **Нет.** `engines: { node: '>=22' }`. |
| `better-sqlite3@12.11.1` | **Да.** `engines: 20.x \|\| 22.x \|\| … \|\| 26.x` — единственная линия, покрывающая и 20.19, и будущий 22+. Синхронный API: транзакция на событие без пула и await. |

**ORM — `drizzle-orm@0.45.2`**, тот же пин, что в DECISIONS, только импорт
`drizzle-orm/better-sqlite3` и схемы из `drizzle-orm/sqlite-core`. Один навык на команду.
`drizzle-kit` не нужен: миграций нет, схема применяется при старте. БД — `.aqven/playground.db`
в `.gitignore`, `PRAGMA journal_mode = WAL`, `foreign_keys = ON`. **IR, граф и диагностика
в БД не попадают** — выводятся из файлов за десятки миллисекунд и живут в памяти. Храним
только непересчитываемое:

| Таблица | Колонки |
|---|---|
| `runs` | `id` pk, `flow`, `ir_hash`, `input` json, `status` running/ok/error, `started_at`, `ended_at` |
| `events` | `id` autoinc, `run_id` fk, `seq`, `node_id`, `type` start/finish/fail, `at`, `payload` json; индекс `(run_id, seq)` |
| `renders` | pk `(run_id, node_id)`, `messages` json, `input` json, `output` json, `provenance` json |

`renders` — та тройка «промт + вход + выход», ради которой консоль VoltAgent не годится; `provenance` —
карта `слот → источник` (`$in.hotels`, `$score.out`) из IR, её даёт синтез, не рантайм. При старте
удаляются прогоны старше 7 дней (`--keep-runs` отключает, `--reset` сносит файл).

## 5. Пакеты фронтенда

`vite@8.3.0` (`engines: ^20.19.0 || >=22.12.0` — ровно наш Node), `@vitejs/plugin-react@6.1.1`,
`react`/`react-dom@19.3.0`, `@xyflow/react@12.11.6`, `@dagrejs/dagre@3.1.1`, `tailwindcss` и
`@tailwindcss/vite@4.3.3`, `typescript@6.0.3`, `vitest@5.0.0` — всё, кроме Vite, пины DECISIONS.

**Канвас — `@xyflow/react`, не свой SVG.** Честный счёт: read-only не значит статичный. Нужны
pan/zoom с инерцией, хит-тест, куллинг вне вьюпорта, маркеры и маршрутизация рёбер, узлы как
React-компоненты с состоянием прогона, фит-вью, миникарта — своим SVG это 400+ строк возни
с матрицами и событиями указателя, дороже зависимости. Решающий довод: `@xyflow/react` и так пин
DECISIONS для Studio, значит компоненты узлов и рёбер переиспользуются, а не выбрасываются.
Раскладка — `@dagrejs/dagre` 3.1.1 (MIT, 1,3 МБ); веб-воркер не нужен, в отличие от кадр.
elkjs (7,7 МБ, EPL/GPL) отложен до Studio — см. 00-canvas-decision.md. **Чего нет:** `shadcn/ui` (на шесть экранов
нужны три примитива), `@tanstack/react-table`, роутер (состояние в hash), TanStack Query.

## 6. Что из DECISIONS отменяется для плейграунда

| Строка DECISIONS | В плейграунде |
|---|---|
| `next 16.3.4` (до ADR-0024) | Vite 8.3.0 + React 19.3.0. Отмена по решению заказчика; [ADR-0024](../adr/0024-studio-on-vite.md) перенёс это в DECISIONS для всей Studio, отмены больше нет |
| PostgreSQL 18 + pgvector, драйвер `pg 8.23.0` | SQLite через `better-sqlite3@12.11.1` |
| `drizzle-kit 0.31.10`, миграции, схемы `app`/`idx` | одна БД, три таблицы, `CREATE TABLE IF NOT EXISTS` |
| Hono + `@hono/zod-openapi` → `openapi-typescript` | `node:http`, типы руками |
| `pg-boss`, чекпоинты, кассеты, Langfuse 5.11.1 | нет очереди и возобновления; события в SQLite |
| Tailwind v4 + shadcn/ui, `@tanstack/react-table` | Tailwind остаётся; shadcn и таблицы нет |
| ADR-0018, кодмод «правка IR → TS» | не реализуется; решение остаётся принятым на будущее |
| ADR-0017, запись через staging и CAS по хешу | только чтение файлов |
| `@xyflow/react` 12.11.6, `@dagrejs/dagre` 3.1.1, `drizzle-orm` 0.45.2, `typescript` 6.0.3, `vitest` 5.0.0 | **остаются как есть** |

Строки, которых таблица не касается, действуют без изменений; расхождение сверх неё — ошибка.
