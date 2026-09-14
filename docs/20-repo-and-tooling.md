# 20. Репозиторий, сборка, тесты, CI

> Статус: draft
> Зависит от: [02. Архитектура](02-architecture.md), [04. Схема IR](04-ir-schema.md), [07. Компилятор](07-compiler.md), [13. Evals и гейты](13-evals-and-gates.md), [18. Экспорт и конформанс](18-export-and-conformance.md)
> Источники: research/monorepo-quality.md, research/determinism-export.md, DECISIONS.md, спека §15.1, §18.1, §20

## Зачем этот слой

Ядро доверия (IR, компилятор, правила `R-*`) стоит ровно столько, сколько стоит машинерия, которая его
проверяет. Этот документ фиксирует, как физически разложены пакеты, чем принуждается правило
зависимостей (домен не знает адаптеров), какими флагами компилятора закрываются классы ошибок L1, и
какие гейты CI не дают выпустить релиз с выжившим мутантом или разъехавшимся round-trip. Спека §18.1
требует «компилятор ловит 100% мутантов» — здесь описано, чем этот критерий исполняется.

## Решения

| Решение | Что берём | Версия | Лицензия | Почему |
|---|---|---|---|---|
| Менеджер пакетов | pnpm workspaces | 12 | MIT | `workspace:*` + `catalog:` фиксируют версии в одной точке; жёсткий node_modules не даёт импортировать недекларированное |
| Оркестратор задач | turborepo | 2.10.12 | MIT | только кэш+граф поверх npm-скриптов, нулевая инвазия; Nx 23 окупается от ~30 пакетов |
| Сборка библиотек | tsdown (Rolldown) | 0.23.0, пин без `^` | MIT | tsup не публиковался с 2025-11-12 и сам рекомендует tsdown; `exports: true` пишет корректную exports map |
| Компилятор типов | typescript | 6.0.3 | Apache-2.0 | потолок `typescript-eslint@8.70.0` — `<6.1.0`; у TS 7.0 нет стабильного программного API до 7.1 |
| Быстрый чекер | typescript 7 (tsgo) | 7.0.2 | Apache-2.0 | отдельная non-blocking джоба, 8–12× быстрее на полном чеке |
| Тест-раннер | vitest (`test.projects`) | 5.0.0 | MIT | Node ≥ 22.12, Vite ≥ 6.4; `vitest.workspace.ts` устарел |
| Покрытие | @vitest/coverage-v8 | 5.0.0 (peer ровно `vitest 5.0.0`) | MIT | двигается только вместе с vitest, одним changeset-ом |
| Property-based | fast-check + @fast-check/vitest | 4.10.0 + 0.5.0 | MIT | инварианты IR и компилятора, воспроизводимый seed |
| Интеграционные | testcontainers + @testcontainers/postgresql | 12.1.0 | MIT | реальный Postgres 18, только Linux-раннеры |
| E2E | @playwright/test | 1.63.0 | Apache-2.0 | сквозные сценарии Studio |
| Гигиена тест-сьюта | @stryker-mutator/core + vitest-runner + typescript-checker | 10.0.0 | Apache-2.0 | nightly, только `packages/compiler` и `packages/ir` |
| Kill-критерий 1 | **свой доменный IR-мутатор** в `@wf/conformance` | наш | — | Stryker мутирует наш код, спека §18.1 требует мутировать IR |
| Линт и формат | @biomejs/biome | 2.5.13 | MIT OR Apache-2.0 | type-aware линт без `ts.Program` → не привязывает к потолку версии TS; один бинарник вместо 10 пакетов |
| Линт React | eslint + eslint-plugin-react-hooks + eslint-config-next | 10.10.0 | MIT | только `apps/studio`, правила хуков Biome покрывает не полностью |
| Форматтер | Biome (Prettier **не ставим**) | — | — | Biome форматирует TS, JSX и CSS; `eslint-config-prettier` не нужен. Исключение — `prettier@3.9.6` внутри `@wf/export` как часть кодогенератора |
| Релизы | @changesets/cli | 3.0.2 | MIT | `linked`-группа формата бандла, provenance при публикации |
| CI | GitHub Actions | — | — | матрица Node 22.12/24, remote cache с `signature: true` |

Отвергнуто с обоснованием: **Nx 23** (цена плагинного слоя не окупается на нашем размере, плоская
структура читается агентом), **tsup** (не поддерживается), **unbuild** (13 месяцев без релиза),
**двойная сборка CJS** (dual-package hazard молча ломает branded types и `instanceof`),
**Effect 3.22** (второй рантайм рядом с VoltAgent, красит все сигнатуры), **Prettier** (дублирует Biome),
**`paths: {"@wf/*": ["packages/*/src"]}`** (делает «всё видит всё» и ломает границы пакетов).

## 1. Дерево монорепо

Правило именования: каталог `packages/<name>` ↔ пакет `@wf/<name>`, каталог `apps/<name>` ↔
приложение (не публикуется). Слои ровно те же, что в [02. Архитектура](02-architecture.md):
L0 контракты → L1 домен → L2 адаптеры → L3 композиция. Стрелка вверх по слоям запрещена физически.

```
ai-workflows-automate/
├─ apps/
│  ├─ studio/           Next.js 16.3.4 + React 19.3.0, канвас, инспектор, трассы
│  ├─ api/              Hono + @hono/zod-openapi 1.6.3, VoltAgent server-hono, монтирует @wf/mcp-server
│  └─ worker/           процесс pg-boss 12: джобы, дедлайны, cron, возобновление по таймауту
├─ packages/
│  ├─ ir/               L0  схемы IR, branded ids, семантический дифф
│  ├─ types/            L0  реестр предметных типов (см. 05), зависит только от ir
│  ├─ contracts/        L0  zod-схемы границы: MCP-конверт, REST DTO, события стрима
│  ├─ ports/            L0  интерфейсы портов: ModelPort, ToolPort, SpecStore, RunStore, TraceSink…
│  ├─ canon/            L0  RFC 8785 канонизация, sha256 с доменной сепарацией
│  ├─ compiler/         L1  правила R-*, статические оценки, план цепочки
│  ├─ prompts/          L1  liquidjs-визитор, теги message/case, оценка размера gpt-tokenizer
│  ├─ registries/       L1  профили моделей, агенты, тулы, архетипы
│  ├─ stats/            L1  бутстрап BCa, McNemar, Wilcoxon, Holm/BH, power/MDE, kappa, alpha
│  ├─ usecases/         L1  сценарии приложения поверх портов
│  ├─ runtime-volt/     L2  сборка цепочек VoltAgent 2.10.0, исполнители узлов
│  ├─ llm/              L2  ai@6.0.280, @openrouter, @ai-sdk/togetherai, replay-кэш
│  ├─ tools/            L2  createTool, needsApproval, MCPConfiguration к внешним серверам
│  ├─ store/            L2  рабочее дерево: CAS по sha256 байтов, txn на N файлов, isomorphic-git 1.42.2
│  ├─ index/            L2  индексатор дерева в схему idx, @parcel/watcher 2.6.0
│  ├─ db/               L2  drizzle-orm 0.45.2, схемы app и idx, RLS
│  ├─ blob/             L2  content-addressed хранилище по sha256, правило трёх зон
│  ├─ queue/            L2  pg-boss 12: sendAfter, singletonKey
│  ├─ trace/            L2  OTel + @langfuse/otel 5.11.1 как элемент spanProcessors
│  ├─ evals/            L2  @voltagent/evals 2.0.5, эксперименты, гейт
│  ├─ export/           L2  бандл, детерминированный tar, codegen в VoltAgent TS
│  ├─ conformance/      L2  golden-фикстуры, IR-мутатор, раннер конформанса (не публикуется)
│  ├─ mcp-server/       L3  @modelcontextprotocol/sdk 1.30.0, тулы flow_*/run_*/experiment_*
│  ├─ sdk/              L3  типизированный клиент: openapi-typescript 7.13.0 + openapi-fetch
│  ├─ cli/              L3  wf check/fmt/init/export/import/verify/replay/eval, запуск mcp-server по stdio
│  ├─ graph-view/       L3  @xyflow/react 12.11.6 + elkjs 0.12.0, общий с Studio
│  ├─ testkit/          инфраструктура тестов: фабрики IR, контейнеры, кассеты (не публикуется)
│  └─ tsconfig/         базовые tsconfig (не публикуется)
├─ .changeset/
├─ .github/workflows/
├─ biome.json
├─ pnpm-workspace.yaml
├─ turbo.json
└─ tsconfig.base.json
```

### Ответственность, публичный API, границы

| Пакет | Слой | Ответственность | Публичный API (entry) | Зависит от | НЕ имеет права зависеть от |
|---|---|---|---|---|---|
| `@wf/ir` | L0 | схема IR, branded ids, инварианты, семантический дифф | `.`, `./diff`, `./testing` | `zod`, `jsondiffpatch`, `rfc6902` | всего остального в репозитории |
| `@wf/types` | L0 | реестр предметных типов и их совместимость | `.` | `@wf/ir`, `zod` | L1+ |
| `@wf/contracts` | L0 | zod-схемы границы: конверт MCP, DTO REST, события стрима | `.`, `./mcp`, `./http` | `@wf/ir`, `zod` | L1+, любой адаптер |
| `@wf/ports` | L0 | интерфейсы портов (Port/Adapter) | `.` | `@wf/ir`, `zod` | любой реализации порта |
| `@wf/canon` | L0 | канонизация RFC 8785, sha256, Merkle | `.` | `canonicalize`, `@noble/hashes` | всего остального |
| `@wf/compiler` | L1 | правила `R-*`, план цепочки, статические оценки | `.`, `./rules`, `./testing` | `@wf/ir`, `@wf/types`, `@wf/prompts`, `@wf/registries`, `@wf/ports` (только типы), `ts-pattern` | `@voltagent/*`, `ai`, `drizzle-orm`, `pg`, `@langfuse/*` |
| `@wf/prompts` | L1 | liquidjs-визитор, теги `message`/`case`, точки кэширования, оценка размера | `.` | `@wf/ir`, `liquidjs`, `gpt-tokenizer` | `ai`, рантайма, БД |
| `@wf/registries` | L1 | профили моделей, агенты, тулы, архетипы (паттерн Registry) | `.` | `@wf/ir`, `@wf/types`, `@wf/ports` | адаптеров |
| `@wf/stats` | L1 | чистая статистика гейтов | `.` | ноль рантайм-зависимостей | VoltAgent, Langfuse, БД |
| `@wf/usecases` | L1 | сценарии приложения поверх портов | `.` | домен + `@wf/ports` | конкретных адаптеров |
| `@wf/runtime-volt` | L2 | сборка `Workflow` из плана, исполнители узлов, suspend/resume | `.` | `@voltagent/core`, `@wf/ports`, `@wf/ir` | `apps/*`, `@wf/mcp-server` |
| `@wf/llm` | L2 | единственная точка входа к моделям, replay-кэш как `LanguageModelMiddleware` | `.`, `./middleware` | `ai`, `@ai-sdk/*`, `@openrouter/*`, `@wf/ports` | других адаптеров |
| `@wf/tools` | L2 | вызов инструмента, таймаут, одобрение, внешние MCP-серверы | `.` | `@voltagent/core`, `@wf/ports` | `@wf/llm` |
| `@wf/store` | L2 | `FileTreePort` и `GitPort`: чтение и атомарная запись определений, CAS по sha256 байтов, `.wf/lock`, коммит эпизода | `.`, `./git` | `isomorphic-git`, `@parcel/watcher`, `@wf/ir`, `@wf/canon`, `@wf/ports` | `@wf/db`, домена, `apps/*` |
| `@wf/index` | L2 | `IndexPort`: разбор дерева, инкрементальная и полная переиндексация в схему `idx`, запросы влияния | `.` | `@wf/store`, `@wf/ir`, `@wf/db`, `@wf/ports` | `apps/*`, `@wf/llm` |
| `@wf/db` | L2 | схемы `app` и `idx`, миграции, RLS, репозитории; **определения не пишет** | `.`, `./schema`, `./migrations` | `drizzle-orm`, `pg`, `@wf/ports` | доменной логики |
| `@wf/blob` | L2 | правило трёх зон, адресация по sha256 | `.` | `@wf/canon`, `@wf/ports` | `@wf/db` напрямую |
| `@wf/queue` | L2 | джобы, дедлайны, идемпотентность | `.` | `pg-boss`, `@wf/ports` | домена |
| `@wf/trace` | L2 | спаны `wf.*`, экспорт в Langfuse и OTLP | `.` | `@langfuse/tracing`, `@langfuse/otel`, `@opentelemetry/*`, `@wf/ports` | домена |
| `@wf/evals` | L2 | эксперимент, node-level агрегация, гейт, отчёты | `.` | `@voltagent/evals`, `@wf/stats`, `@wf/ports` | `apps/*` |
| `@wf/export` | L2 | бандл, детерминированный tar, импорт, codegen | `.`, `./codegen`, `./cjs-shim` | `@wf/ir`, `@wf/canon`, `tar-stream`, `yaml`, `prettier` | БД напрямую (только через порты) |
| `@wf/conformance` | L2 | golden-фикстуры, IR-мутатор, раннер, отчёт | `.`, `./mutator` | `@wf/ir`, `@wf/compiler`, `@wf/export` | `apps/*` |
| `@wf/mcp-server` | L3 | тулы `flow_*`/`run_*`/`experiment_*`, фазовое раскрытие | `.`, `./stdio` | `@modelcontextprotocol/sdk`, `@wf/usecases`, `@wf/contracts` | `@wf/db`, `@wf/llm` напрямую |
| `@wf/sdk` | L3 | типизированный HTTP-клиент из OpenAPI | `.` | `openapi-fetch`, сгенерированные типы | серверных пакетов |
| `@wf/cli` | L3 | `wf check/fmt/init` над деревом проекта, `wf export/import/verify/replay/eval`, запуск MCP по stdio | `.` (bin `wf`) | `@wf/usecases`, `@wf/store`, `@wf/export`, `@wf/mcp-server` | — |
| `@wf/graph-view` | L3 | канвас графа, авто-раскладка | `.` | `@xyflow/react`, `elkjs`, `@wf/ir`, `@wf/contracts` | серверных адаптеров |
| `@wf/utils` | L0 | мелкие чистые хелперы без доменных знаний | `.` | ноль рантайм-зависимостей | всего остального |
| `@wf/graph-algos` | L1 | алгоритмы над графом: доминаторы, топосорт, критический путь, достижимость | `.` | `@wf/ir` | адаптеров, `apps/*` |
| `@wf/nodes` | L2 | исполнители узлов по видам (`llm`, `tool`, `switch`, `loop`, `map`) | `.` | `@wf/ir`, `@wf/ports`, `@wf/prompts` | `apps/*`, `@wf/db` |
| `@wf/datasets` | L2 | датасеты, сплиты, покрытие, генерация | `.` | `@wf/ir`, `@wf/ports` | `apps/*` |
| `@wf/scorers` | L2 | детерминированные скореры и судьи | `.` | `@voltagent/scorers`, `@wf/ports` | `apps/*` |
| `@wf/blame` | L2 | атрибуция падения метрики на узел | `.` | `@wf/stats`, `@wf/ir`, `@wf/ports` | `apps/*` |
| `@wf/model-matrix` | L2 | матрица моделей и граница Парето «качество × цена × латентность» | `.` | `@wf/evals`, `@wf/registries`, `@wf/ports` | `apps/*` |
| `@wf/sandbox` | L2 | изоляция кодовых проверок и тулов с побочными эффектами | `.` | `@wf/ports` | домена |
| `@wf/obs-langfuse` | L2 | адаптер `TraceSink` на Langfuse | `.` | `@langfuse/tracing`, `@langfuse/client`, `@wf/ports` | домена |
| `@wf/obs-otel` | L2 | адаптер `TraceSink` на OTLP | `.` | `@opentelemetry/*`, `@wf/ports` | домена |
| `@wf/api-types` | L3 | типы REST, сгенерированные `openapi-typescript` из схемы `apps/api` | `.` | сгенерированные типы | рантайм-зависимостей |
| `@wf/virtual-data-table` | L3 | виртуализованная таблица трасс и элементов датасета | `.` | `@tanstack/react-table`, `@tanstack/react-virtual` | серверных адаптеров |
| `@wf/testkit` | L3 (dev) | фикстуры, testcontainers-хелперы, фабрики IR | `.` | `testcontainers`, `@wf/ir` | продакшен-кода |
| `@wf/tsconfig` | — | общие `tsconfig`-пресеты | — | — | — |
| `apps/api` | L3 | HTTP-фасад, композиция адаптеров, монтирование MCP | — | всё L0–L3 | — |
| `apps/worker` | L3 | исполнение джоб, таймеры, cron | — | `@wf/queue`, `@wf/usecases`, `@wf/runtime-volt` | `apps/api`, `apps/studio` |
| `apps/studio` | L3 | UI: канвас, инспектор, трассы, эксперименты | — | `@wf/sdk`, `@wf/graph-view`, `@wf/contracts` | любого серверного адаптера (`@wf/db`, `@wf/llm`, `@wf/queue`, `@wf/runtime-volt`) |

Дерево проекта пользователя (`flows/`, `prompts/`, `components/`, `types/`, `agents/`, `tools/`,
`context/`, `.wf/`) — **не часть монорепо**: это данные, которые продукт читает и пишет. Его раскладка
описана в [ADR-0017](adr/0017-files-as-source-of-truth.md); в монорепо от неё есть только фикстуры
в `packages/conformance/fixtures/`.

Четыре границы, нарушение которых считается архитектурной регрессией, а не стилем:

1. **`ai`, `@ai-sdk/*`, `@openrouter/*` импортирует ровно один пакет — `@wf/llm`.** Это то, что делает
   миграцию на `ai@7` одним коммитом (DECISIONS, ось версий).
2. **Домен (L1) не импортирует `@voltagent/*`.** Компилятор выдаёт сериализуемый план; в `Workflow`
   его превращает `@wf/runtime-volt`.
3. **Studio не импортирует серверные адаптеры.** Единственная дверь на сервер — `@wf/sdk` поверх
   сгенерированных из OpenAPI типов.
4. **Определения пишет ровно один пакет — `@wf/store`; в схему `idx` пишет ровно один — `@wf/index`.**
   `@wf/db` под ролью приложения имеет на `idx` только `SELECT`; `INSERT`/`UPDATE` даёт роль `wf_indexer`.

## 2. Конфиги

### pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"

catalog:
  typescript: "6.0.3"
  zod: "4.6.2"
  vitest: "5.0.0"
  "@vitest/coverage-v8": "5.0.0"
  tsdown: "0.23.0"
  "@types/node": "^24.0.0"
  ai: "6.0.280"
  "@voltagent/core": "2.10.0"
  "drizzle-orm": "0.45.2"

catalogs:
  react19:
    react: "19.3.0"
    react-dom: "19.3.0"

onlyBuiltDependencies:
  - esbuild
  - "@biomejs/biome"
  - sharp

overrides: {}
```

Внутренние ссылки — только `"@wf/ir": "workspace:*"`, внешние версии ядра — только `"zod": "catalog:"`
и `"react": "catalog:react19"`. Прямая запись версии внешнего пакета в `package.json` библиотечного
пакета запрещена для всего, что перечислено в `catalog:` — это и есть защита от «разъехались minor
одной либы в двух пакетах ядра».

`tsdown` и `typescript` пинуются **точной** версией: tsdown в мажоре 0.x ломает semver-минором,
а TypeScript двигается отдельным ADR (см. §5).

### turbo.json

```jsonc
{
  "$schema": "https://turborepo.com/schema.json",
  "ui": "tui",
  "globalDependencies": ["pnpm-lock.yaml", "tsconfig.base.json", "biome.json"],
  "globalEnv": ["CI"],
  "globalPassThroughEnv": ["NODE_OPTIONS"],
  "remoteCache": { "signature": true },
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "!**/*.test.ts", "!**/*.test-d.ts", "!**/*.md"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "typecheck": { "dependsOn": ["^build"], "outputs": ["*.tsbuildinfo"] },
    "lint": { "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "test:integration": { "dependsOn": ["^build"], "cache": false },
    "test:conformance": {
      "dependsOn": ["^build"],
      "outputs": ["conformance-report.json"]
    },
    "test:mutation": {
      "dependsOn": ["^build"],
      "outputs": ["reports/mutation/**"],
      "env": ["STRYKER_DASHBOARD_API_KEY"]
    },
    "test:e2e": { "dependsOn": ["build"], "cache": false },
    "eval": { "cache": false, "env": ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "EVAL_BUDGET_USD"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

Три ловушки Turbo, каждая из которых даёт «зелёный CI на чужом артефакте»:

| Ловушка | Что на самом деле | Что делаем |
|---|---|---|
| `"outputs": []` | значит «кэшировать только логи», а не «не кэшировать» | отключение кэша — только `"cache": false` |
| переменная окружения не указана в `env`/`globalEnv` | не входит в хэш → кэш-хит от прогона с другим ключом | всё, что ходит к провайдерам и в БД, помечено `"cache": false` |
| перекрёстные `inputs` за пределы пакета | работают, но невидимы в графе | фикстуры конформанса — отдельный пакет `@wf/conformance` и обычный `dependsOn` |

### tsconfig.base.json

```jsonc
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "useUnknownInCatchVariables": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "isolatedDeclarations": true,
    "erasableSyntaxOnly": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "composite": true,
    "incremental": true
  }
}
```

Пакетный `tsconfig.json` — три строки плюс `references` на пакеты, от которых он зависит:

```jsonc
{
  "extends": "../tsconfig/base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"],
  "references": [{ "path": "../ir" }, { "path": "../ports" }]
}
```

`references` + `composite: true` дают инкрементальный `turbo typecheck` по пакетам и запрещают импорт
из чужого `src/` мимо публичного входа — это дешёвый заменитель Nx boundary rules. `apps/studio`
наследует отдельный base: `"module": "preserve"`, `"moduleResolution": "bundler"`, `"jsx": "preserve"`,
`"noEmit": true`, `"lib": ["ES2024", "DOM", "DOM.Iterable"]`, **без** `isolatedDeclarations`.

### packages/ir/package.json и tsdown.config.ts

```jsonc
{
  "name": "@wf/ir",
  "version": "0.1.0",
  "type": "module",
  "sideEffects": false,
  "files": ["dist"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./diff": { "types": "./dist/diff.d.ts", "default": "./dist/diff.js" },
    "./testing": { "types": "./dist/testing.d.ts", "default": "./dist/testing.js" },
    "./package.json": "./package.json"
  },
  "publishConfig": { "access": "public", "provenance": true },
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "catalog:",
    "jsondiffpatch": "0.7.6",
    "rfc6902": "5.3.0"
  },
  "devDependencies": {
    "tsdown": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/diff.ts", "src/testing.ts"],
  format: ["esm"],
  platform: "neutral",
  sourcemap: true,
  clean: true,
  treeshake: true,
  exports: true,
  unused: true,
  nodeProtocol: "strip",
  deps: { dts: { neverBundle: [/^@wf\//] } },
});
```

Существенные детали, проверенные на установленном `tsdown@0.23.0` (`rolldown-plugin-dts`):

- ключа `dts.isolatedDeclarations` **нет**; генератор выбирается сам — `oxc` при включённом
  `isolatedDeclarations` в tsconfig, `tsgo` при TypeScript 7, иначе `tsc`. Поэтому мы просто включаем
  `isolatedDeclarations` и не трогаем `dts`;
- `exports` по умолчанию **`false`** — включаем явно, тогда tsdown сам держит exports map в актуальном
  состоянии и снимает класс ошибок «собрали, а импорт не резолвится»;
- `unused: true` требует отдельно установленного `unplugin-unused`, иначе сборка падает на отсутствующем
  пакете;
- типы `workspace:*`-зависимостей в `.d.ts` не инлайним (`deps.dts.neverBundle`) — они публикуются рядом.

**CJS не собираем.** Node 24 умеет `require()` ESM, Next 16 и VoltAgent 2.10 — ESM-first, а двойная
сборка даёт dual-package hazard: два экземпляра модуля → два реестра и два `Symbol`, branded types и
`instanceof` ломаются молча. Единственное исключение — entry `./cjs-shim` в `@wf/export` для
встраивания экспортированного проекта в чужой CJS-код.

## 3. Правило зависимостей и как оно принуждается

Правило одно: **импорт разрешён только вниз по слоям и только через публичный вход пакета.**
Оно принуждается четырьмя независимыми механизмами — ни один из них не полагается на дисциплину автора.

| Механизм | Что ловит | Где падает |
|---|---|---|
| pnpm workspace (жёсткий `node_modules`) | импорт пакета, которого нет в `dependencies` | `pnpm build`, сразу |
| `exports` map пакета | импорт `@wf/compiler/src/internal/x` мимо публичного входа | резолв модуля |
| TS `references` без `paths` | тот же случай на уровне типов | `tsc --noEmit` |
| Biome `noRestrictedImports` | запрещённая пара «слой → слой» и запрещённые внешние либы | `biome ci .` |
| `scripts/check-graph.mjs` | цикл в графе пакетов, ребро против слоёв, `@wf/llm`-исключение | джоба `verify` |

Правило зависимостей в Biome задаётся не абстрактно, а поимённо. В корневом `biome.json` лежит общий
запрет, во вложенных `biome.json` пакетов — точечные:

```jsonc
{
  "root": false,
  "extends": "//",
  "linter": {
    "rules": {
      "style": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": {
              "ai": "Провайдеры моделей только через @wf/llm.",
              "@ai-sdk/openai": "Провайдеры моделей только через @wf/llm.",
              "@openrouter/ai-sdk-provider": "Провайдеры моделей только через @wf/llm.",
              "@voltagent/core": "Домен не знает рантайма: план исполняет @wf/runtime-volt.",
              "drizzle-orm": "Доступ к данным только через порты @wf/ports.",
              "pg-boss": "Очередь только через @wf/queue."
            }
          }
        }
      }
    }
  }
}
```

Линтер ловит текст импорта, но не ловит «пакет A положил B в `dependencies` и теперь может его
импортировать легально, хотя слой запрещает». Это закрывает проверка графа: она читает `package.json`
всех пакетов, строит рёбра по `workspace:*` и сверяет с таблицей слоёв. Реализация — плоская,
таблица вместо ветвлений:

```ts
const LAYER: Record<string, number> = {
  ir: 0, types: 0, contracts: 0, ports: 0, canon: 0,
  compiler: 1, prompts: 1, registries: 1, stats: 1, usecases: 1,
  "runtime-volt": 2, llm: 2, tools: 2, db: 2, blob: 2, queue: 2, trace: 2, evals: 2,
  export: 2, conformance: 2,
  "mcp-server": 3, sdk: 3, cli: 3, "graph-view": 3,
};

const EXTERNAL_OWNER: Record<string, string> = {
  ai: "llm",
  "@voltagent/core": "runtime-volt",
  "drizzle-orm": "db",
  "pg-boss": "queue",
};

const violations = (pkgs: readonly Pkg[]): readonly string[] => [
  ...pkgs.flatMap(edgesAgainstLayers),
  ...pkgs.flatMap(externalsOutsideOwner),
  ...cycles(pkgs).map(describeCycle),
];
```

`externalsOutsideOwner` — это ровно та проверка, которая делает миграцию на `ai@7` дешёвой: если `ai`
появился в `dependencies` любого пакета кроме `@wf/llm` (и `@ai-sdk/*`, `@openrouter/*` — там же),
джоба `verify` падает с текстом, называющим владельца зависимости. Сценарий «поднять мажор одной
библиотеки» из [02. Архитектура](02-architecture.md) держится этим гвоздём, а не договорённостью.

Исключения из правила слоёв не допускаются «по месту»: разрешённое ребро добавляется в `LAYER`/
`EXTERNAL_OWNER` отдельным PR с ADR. Это делает нарушение видимым в дифе.

## 4. TypeScript: строгость, бренды, исчерпываемость, ошибки

### Флаги, которые работают на ядро доверия

Полный набор — в `tsconfig.base.json` выше. Четыре флага из него не косметические, каждый закрывает
конкретный класс дефектов:

| Флаг | Что физически меняется | Какой класс дефектов закрывает |
|---|---|---|
| `noUncheckedIndexedAccess` | `nodes[id]` имеет тип `Node \| undefined` | компилятор постоянно ходит по мапам узлов и слотов; без флага «узел не найден» проваливается в рантайм как `undefined.kind` — протечка L1 → L2 |
| `exactOptionalPropertyTypes` | различает «поля нет» и «поле есть, равно `undefined`» | round-trip бандла (kill 13): именно это определяет, совпадут ли байты после `export → import → export` |
| `isolatedDeclarations` | требует явный тип возврата у каждого экспорта | публичный контракт не зависит от инференса, внутренний тип не может «протечь» наружу, `.d.ts` генерится пофайлово (tsdown выбирает `oxc`) |
| `erasableSyntaxOnly` | запрещает `enum`, `namespace`, parameter properties | enum предметной области живёт в реестре как данные; флаг физически не даёт завести второй источник истины (kill 6) |

### Branded types для идентификаторов

Один источник истины — Zod-схема, тип выводится из неё; ручной `unique symbol`-бренд остаётся только
там, где рантайм-валидации нет в принципе.

```ts
import { z } from "zod";

export const NodeId = z.string().min(1).brand<"NodeId">();
export type NodeId = z.infer<typeof NodeId>;

export const SlotId = z.string().min(1).brand<"SlotId">();
export type SlotId = z.infer<typeof SlotId>;

export const WorkflowId = z.uuid().brand<"WorkflowId">();
export type WorkflowId = z.infer<typeof WorkflowId>;

export type IdMap<K extends string, V> = ReadonlyMap<K, V>;
```

Zod 4 навешивает `$brand`, поэтому `NodeId` и `SlotId` взаимно несовместимы, а голый `string` не
присваивается ни одному. `NodeId.parse(x)` — единственный легальный вход. Для коллекций по id берём
`Map<NodeId, Node>`, а не `Record<NodeId, Node>`: `get()` возвращает `Node | undefined` по сигнатуре,
без опоры на флаг компилятора.

### Исчерпываемость

Базовый инструмент — `switch` по дискриминанту + `assertNever`. ts-pattern 5.9.0 — точечно и только
в `@wf/compiler`, где матч идёт по нескольким полям сразу.

```ts
export class UnreachableError extends Error {
  constructor(readonly value: never) {
    super(`Unreachable variant: ${JSON.stringify(value)}`);
  }
}

export const assertNever = (value: never): never => {
  throw new UnreachableError(value);
};

export const compileNode = (node: Node): Fragment => {
  switch (node.kind) {
    case "llm": return compileLlm(node);
    case "code": return compileCode(node);
    case "branch": return compileBranch(node);
    case "loop": return compileLoop(node);
    case "tool": return compileTool(node);
    case "human": return compileHuman(node);
    default: return assertNever(node);
  }
};
```

Это одновременно и «плоский код» (одна таблица ветвей, каждая ветка — вызов чистой функции, нулевая
вложенность), и бесплатная реализация kill-критерия 6: добавили вариант в IR — **все** такие `switch`
падают на компиляции, и список затронутых мест выдаёт `tsc`, а не человек.

Там, где ветвление идёт по кортежу условий и `switch` выродился бы в лестницу `if/else` — правила `R-*`:

```ts
import { match, P } from "ts-pattern";

const diagnose = (edge: Edge): Diagnostic | null =>
  match(edge)
    .with({ from: { kind: "llm" }, to: { kind: "code" }, binding: P.nullish }, () => rule("R-09", edge))
    .with({ from: { kind: "branch" }, guard: P.nullish }, () => rule("R-14", edge))
    .otherwise(() => null);
```

`.exhaustive()` даёт ту же гарантию, что `assertNever`, но на составных паттернах. ts-pattern держим
в одном пакете, чтобы при необходимости выпилить одним PR: последняя публикация — 2025-10-26.

### Типизированные ошибки: разный подход на разных слоях

Единого `Result` на весь репозиторий нет, и это осознанно.

| Слой | Подход | Почему именно так |
|---|---|---|
| Домен: `@wf/ir`, `@wf/compiler`, `@wf/registries`, `@wf/stats` | размеченные объединения, **без** `Result`-библиотеки | компилятор не «падает на первой ошибке», он собирает список диагностик. Короткое замыкание `Result.andThen` спрятало бы 9 ошибок из 10, а продукт ровно в том, чтобы вернуть агенту все ошибки с кандидатами |
| Границы I/O: `@wf/mcp-server`, `@wf/llm`, `@wf/db`, `@wf/export`, `apps/*` | `Result`-библиотека (**true-myth 9.4.0**) | здесь короткое замыкание как раз нужно, и оно убирает вложенные `try/catch` |
| Везде | **Effect 3.22 — нет** | Effect это не библиотека ошибок, а второй рантайм (планировщик, файберы, Layer-DI). Рантайм у нас уже есть — VoltAgent. Плюс `Effect<A, E, R>` красит все сигнатуры, а ядро доверия обязано читаться без спец-нотации |

```ts
export type CompileOutcome =
  | { readonly ok: true; readonly plan: Plan; readonly warnings: readonly Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };
```

`Diagnostic` — форма из спеки §9: `{ rule, node, slot, message, candidates }`. Ноль зависимостей,
сериализуется в конверт MCP как есть. Плоскость на границах достигается генераторным синтаксисом,
а не лестницей `.andThen(...)`:

```ts
const importBundle = (raw: Uint8Array) =>
  safeTry(async function* () {
    const bundle = yield* unpack(raw);
    const verified = yield* verifyMerkle(bundle);
    const ir = yield* parseIr(verified);
    return ok(yield* persist(ir));
  });
```

Выбор true-myth вместо neverthrow — по релизному потоку: neverthrow 8.2.0 не публиковался с 2025-02-21
(19 месяцев), true-myth 9.4.0 — 2026-05-25, при том же zero-dep минимализме.

## 5. Версия TypeScript

Решение: **источник истины для emit и тулинга — `typescript@6.0.3`**, пин точной версией в `catalog:`.
`typescript@7.0.2` (Go-порт, `tsgo`) стоит рядом как **не блокирующий** быстрый чекер в отдельной
джобе CI с `continue-on-error: true`.

Честная картина на 2026-09-11:

| Факт | Следствие |
|---|---|
| `typescript@latest` = 7.0.2, Go-порт, 8–12× быстрее на полном чеке | как чекер он полезен уже сейчас |
| У TS 7.0 нет стабильного программного API (обещан в 7.1) | не работают `typescript-eslint`, `ts-morph`, `ts-jest`, template-чекеры фреймворков |
| `typescript-eslint@8.70.0` объявляет peer `typescript ">=4.8.4 <6.1.0"` | типизированный ESLint не поддерживает даже 6.1 |
| `@stryker-mutator/typescript-checker@10` использует программный API TS | мутационная джоба тоже требует линии ≤ 6.x |
| Последняя 6.x = 6.0.3 | это максимум, совместимый со всем перечисленным |

Отсюда второй аргумент за Biome: он не использует API TypeScript вообще, поэтому не привязывает
репозиторий к потолку `<6.1.0`. Единственные наши потребители API TS — `typescript-eslint` в
`apps/studio` и `typescript-checker` в nightly-мутациях.

**Триггер пересмотра** (переключаем источник истины одним changeset-ом, когда выполнены все три):
1. вышел TypeScript 7.1 со стабильным программным API;
2. `typescript-eslint` объявил поддержку этой линии в `peerDependencies` (либо ESLint в `apps/studio`
   к тому моменту заменён на Biome целиком, и потребитель API остался один);
3. `@stryker-mutator/typescript-checker` работает на нашем tsconfig без ложных «не компилируется».

До этого момента джоба `tsgo` служит ранним предупреждением: если она краснеет на коде, который
зелёный на 6.0.3, это заявка на правку до миграции, а не после.

## 6. Тесты

Vitest 5.0.0 требует Node ≥ 22.12 и Vite ≥ 6.4. Ломающие изменения, которые нас касаются напрямую:
поиск конфига **больше не поднимается по родительским каталогам** (каждый пакет обязан иметь свой
`vitest.config.ts` либо запускаться из корня через `projects`), файл `vitest.workspace.ts` заменён на
`test.projects`, репортер `basic` удалён, а inline-записи `test.projects` теперь наследуют корневые
плагины Vite и `setupFiles`.

### Уровни

| Уровень | Проект vitest | Что тестируем | Чем | Где живёт |
|---|---|---|---|---|
| Юнит на чистые функции | `core` | правила `R-*` по одной, нормализация IR, статистика `@wf/stats`, оценка размера промта | обычные `expect`, таблицы кейсов | `packages/*/src/**/*.test.ts` |
| Типовые тесты | `core` (`typecheck.enabled`) | branded types не смешиваются, `assertNever` ловит новый вариант, публичные сигнатуры | `*.test-d.ts`, `expectTypeOf` | рядом с кодом |
| Property-based | `core` | инварианты IR и компилятора (таблица ниже) | fast-check 4.10.0 + `@fast-check/vitest` | `packages/ir`, `packages/compiler`, `packages/export` |
| Golden-фикстуры | `core` | компиляция эталонных воркфлоу, отрисованные промты | `toEqual` против файла, `toMatchFileSnapshot` для текста промта | `packages/conformance/fixtures` |
| Конформанс и мутанты | `conformance` | kill-критерий 1: 100% мутантов IR убиты | свой раннер, отчёт JSON | `packages/conformance` |
| Интеграционные | `integration` | миграции drizzle, RLS, партиции `run_nodes`, pg-boss, чекпоинты VoltAgent | testcontainers 12.1 + Postgres 18 | `packages/*/test/integration` |
| Компонентные UI | `ui` | канвас, инспектор, формы | vitest browser mode, provider playwright | `apps/studio/**/*.browser.test.tsx` |
| E2E | вне vitest | сценарии: открыть трассу и найти шаг с ошибкой; поправить промт и перезапустить с шага; экспортировать бандл и проверить round-trip | Playwright 1.63 | `apps/studio/e2e` |

Инварианты, закрываемые property-тестами (каждый — проекция kill-критерия):

| Инвариант | Свойство | Kill |
|---|---|---|
| Round-trip сериализации | `parse(serialize(ir))` глубоко равен `ir` | 13 |
| Round-trip экспорта | `export(import(export(x)))` даёт побайтово тот же `.tar` | 13 |
| Идемпотентность компиляции | `compile(ir)` совпадает сам с собой при фиксированном seed | — |
| Тотальность компилятора | для валидного IR `compile` возвращает `ok: true` и никогда не бросает | доверие к L1 |
| Тотальность диагностики | у каждой диагностики непустой `candidates` | §9: ошибка без кандидатов — баг компилятора |
| Устойчивость топосорта | порядок шагов не зависит от порядка ключей в JSON | 5 |
| Монотонность типов | сужение типа слота не может превратить ошибку в успех | L1 |
| Полнота списка затронутых | добавление значения enum даёт полный список затронутых узлов | 6, 9 |

Round-trip экспорта проверяется до **фикспойнта со второго прохода**: первый проход имеет право
нормализовать авторский ввод, дальше байты обязаны совпадать (см. [18. Экспорт и конформанс](18-export-and-conformance.md)).

### Корневой vitest.config.ts

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          root: "./packages",
          include: ["*/src/**/*.test.ts"],
          environment: "node",
          pool: "threads",
          typecheck: { enabled: true, include: ["*/src/**/*.test-d.ts"] },
        },
      },
      {
        test: {
          name: "conformance",
          root: "./packages/conformance",
          include: ["src/**/*.conformance.test.ts"],
          environment: "node",
          testTimeout: 120_000,
        },
      },
      {
        test: {
          name: "integration",
          include: ["packages/*/test/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 120_000,
          globalSetup: ["./test/pg-container.ts"],
        },
      },
      {
        test: {
          name: "ui",
          root: "./apps/studio",
          include: ["**/*.browser.test.tsx"],
          browser: {
            enabled: true,
            provider: "playwright",
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      include: ["packages/*/src/**"],
      exclude: ["**/*.test.ts", "**/dist/**"],
      thresholds: {
        "packages/ir/src/**": { statements: 95, branches: 90, functions: 95, lines: 95 },
        "packages/compiler/src/**": { statements: 95, branches: 90, functions: 95, lines: 95 },
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

Репортеры и покрытие задаются **только** в корне, проекты их не переопределяют. Запуск подмножеств:
`vitest --project core`, `vitest --project '!ui'`.

`globalSetup` интеграционного проекта поднимает один контейнер на весь прогон; изоляция между тестами —
схема-на-тест или `TRUNCATE`, а не контейнер-на-тест:

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

let container: StartedPostgreSqlContainer;

export const setup = async (): Promise<void> => {
  container = await new PostgreSqlContainer("pgvector/pgvector:0.8.6-pg18").withReuse().start();
  process.env.DATABASE_URL = container.getConnectionUri();
};

export const teardown = async (): Promise<void> => {
  await container.stop();
};
```

Ловушки, каждая из которых уже стоила времени в других проектах:

- `@vitest/coverage-v8@5.0.0` объявляет peer `vitest: "5.0.0"` — **точную**, не `^`. Апгрейд Vitest
  обязан двигать coverage тем же changeset-ом, иначе pnpm падает на peer-резолве.
- `.withReuse()` требует `testcontainers.reuse.enable=true` в `~/.testcontainers.properties`; в CI
  reuse не работает и не нужен. Docker есть на `ubuntu-latest` и нет на macOS-раннерах — интеграционная
  джоба только на Linux.
- Снапшоты: для промтов — **файловые** (`toMatchFileSnapshot`), они видны в дифе PR. Для
  скомпилированного IR — **не снапшот, а golden-фикстура** с `toEqual`: снапшот обновляется флагом
  `-u`, и агент сделает это не задумываясь, а фикстура требует осознанного коммита.
- В CI обязательно `vitest run --allowOnly=false` и `CI=true`.
- Seed property-тестов фиксируется и печатается: `fc.configureGlobal({ numRuns: process.env.CI ? 1000 : 100, seed: Number(process.env.FC_SEED) || Date.now() })`. Падение без воспроизводящего seed бесполезно.
- `WorkflowRegistry` у VoltAgent — глобальный синглтон (`globalThis.___voltagent_workflow_registry`);
  в тестах между кейсами обязателен `reset()`, иначе прогоны видят чужие регистрации.

## 7. Мутационное тестирование как kill-критерий

Две разные вещи, которые нельзя путать:

| | Что мутируем | Что спрашиваем | Метрика | Инструмент |
|---|---|---|---|---|
| Kill-критерий 1 (спека §18.1) | **данные — валидный IR** | поймает ли это наш **компилятор** | полнота правил `R-*` | **наш IR-мутатор** |
| Гигиена тест-сьюта | **наш исходный код** | поймают ли это наши **тесты** | качество тестов | Stryker 10 |

Stryker второе не умеет в принципе — он ничего не знает про IR. Поэтому kill-критерий 1 закрывается
собственным доменным мутатором в `@wf/conformance`, а Stryker берётся дополнительно, узко и nightly.

### Домен мутатора

Сигнатуры типов `Mutant`/`Mutate` и полная таблица классов с кодами правил — в
[07. Компилятор](07-compiler.md) §8. Здесь фиксируется состав прогона: **20 классов** в пяти группах.

| Группа | Классы | Кол-во |
|---|---|---|
| Структурные | `dangling-edge`, `duplicate-id`, `cycle`, `converge-without-diverge`, `drop-node` | 5 |
| Контрактные | `unbound-slot`, `type-mismatch`, `schema-widening`, `invented-enum-value`, `unknown-node`, `unknown-tool`, `duplicate-type`, `dropped-context` | 8 |
| Управляющие | `branch-without-guard`, `non-exhaustive-branch`, `missing-loop-budget`, `untyped-stop-condition`, `unbound-feedback-slot` | 5 |
| Промтовые | `prompt-raw-interpolation` (обязан быть **невыразим**: падает `Ir.parse`, а не компилятор) | 1 |
| Версионные | `stale-component-version`, `version-drift` | 2 |

Мутация — это `structuredClone` фикстуры плюс точечная правка по JSON-указателю; `origin` каждого
мутанта хранит фикстуру и указатель, поэтому выживший локализуется без отладки.

### Как устроен прогон

Вход: golden-фикстуры `packages/conformance/fixtures/*.json` × классы мутаций × seeded RNG.
Seed в CI — `FC_SEED=${{ github.run_id }}`, печатается в отчёт, любой прогон воспроизводим.

Мутант считается **убитым** только при выполнении трёх условий одновременно:

1. `outcome.ok === false`;
2. среди диагностик есть **ожидаемое** правило `mutant.expectRule` (пойман «не тем» правилом — значит
   не пойман: правило, которое сработало, говорит агенту неправду о причине);
3. у этой диагностики `candidates.length > 0` (спека §9: диагностика без кандидатов — баг компилятора).

Отчёт `conformance-report.json`:

```jsonc
{
  "seed": "1739284",
  "total": 214,
  "killed": 214,
  "byClass": { "unbound-slot": { "total": 18, "killed": 18 } },
  "survivors": [],
  "wrongRule": [],
  "noCandidates": []
}
```

**Гейт (блокирующий, каждый PR):** `survivors.length === 0 && wrongRule.length === 0 &&
noCandidates.length === 0 && total >= 50`. Порог `total ≥ 50` — дословно из §18.1; фактический прогон
на полном наборе фикстур даёт существенно больше, но нижняя граница защищает от «случайно выключили
половину классов». Каждый выживший печатается GitHub-аннотацией с готовым шаблоном issue: либо новое
правило `R-*`, либо баг компилятора. Релиз при непустом `survivors` не выпускается.

Побочная ценность: тот же мутатор отдаётся в Studio («проверь устойчивость своего воркфлоу») и в
eval-датасеты как генератор негативных примеров. Это продукт, а не тест.

### Stryker: узко и nightly

Конфиг `packages/compiler/stryker.config.json`, зеркально — в `packages/ir`:

```jsonc
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "pnpm",
  "testRunner": "vitest",
  "vitest": { "configFile": "vitest.config.ts", "related": true },
  "reporters": ["html", "clear-text", "progress", "json"],
  "mutate": ["src/**/*.ts", "!src/**/*.test.ts", "!src/generated/**"],
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "incremental": true,
  "incrementalFile": "reports/stryker-incremental.json",
  "concurrency": 4,
  "timeoutMS": 20000,
  "thresholds": { "high": 90, "low": 80, "break": 75 }
}
```

Ограничения `@stryker-mutator/vitest-runner@10`, которые определяют конфигурацию тестов:
поддерживается **только `pool: "threads"`** (а дефолт Vitest — `forks`, поэтому `pool` выставлен явно
в проекте `core`); **browser mode не поддерживается** → проект `ui` под Stryker не идёт;
`coverageAnalysis` игнорируется, всегда `perTest`; плагин принудительно ставит single-thread и
bail-on-first-failure. `checkers: ["typescript"]` отсеивает мутанты, не проходящие компиляцию — на
строгом tsconfig это заметная доля шума, но это же и привязка к TS ≤ 6.x (§5).

Время прогона ≈ (число мутантов) × (время релевантных тестов), для компилятора это десятки минут.
Поэтому Stryker — nightly или по метке `run-mutation` на PR, с `--incremental` и кэшем
`reports/stryker-incremental.json` в Actions.

## 8. Линт и формат

**Biome 2.5.13 — форматтер и линтер на весь репозиторий. ESLint 10.10.0 остаётся только в
`apps/studio` и только ради `eslint-plugin-react-hooks` и `eslint-config-next`. Prettier не ставим
вообще** — Biome форматирует TS, JSX и CSS, поэтому `eslint-config-prettier` не нужен. Единственное
исключение — `prettier@3.9.6` как рантайм-зависимость `@wf/export`: он форматирует **сгенерированный**
код, и там важна не наша стилистика, а детерминизм (`format(x) === format(format(x))`, проверено).

Почему Biome именно у нас:

1. Biome 2 делает type-aware линт **без `ts.Program`** (свой мультифайловый скан-индекс). Это снимает
   блокирующую зависимость от потолка `typescript-eslint` (`<6.1.0`, см. §5).
2. Один бинарник вместо `eslint + prettier + typescript-eslint + плагины`. Линт инвалидируется чаще
   всего, и кэш Turbo тут не спасает.
3. Монорепо-конфиг из коробки: вложенные `biome.json` с `"root": false` и `"extends": "//"`,
   наследование без относительных путей.

Честное ограничение: type-aware правила Biome слабее; `noFloatingPromises` ловит порядка 75% случаев
относительно `typescript-eslint`. Принимаем, потому что наши главные инварианты — не правила линтера
(см. ниже). Митигация для реального класса багов «плавающий промис»: правило включено как `error`,
а в адаптерах функции с побочными эффектами возвращают `ResultAsync`, а не `void`.

```jsonc
{
  "$schema": "https://biomejs.dev/schemas/2.5.13/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["**", "!**/dist", "!**/.next", "!**/*.gen.ts"] },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "javascript": { "formatter": { "quoteStyle": "double", "semicolons": "always" } },
  "assist": { "actions": { "source": { "organizeImports": "on" } } },
  "linter": {
    "enabled": true,
    "domains": { "project": "all", "test": "all", "next": "all", "react": "all" },
    "rules": {
      "recommended": true,
      "complexity": {
        "noExcessiveCognitiveComplexity": { "level": "error", "options": { "maxAllowedComplexity": 10 } }
      },
      "suspicious": { "noExplicitAny": "error", "noFloatingPromises": "error" },
      "style": {
        "noNonNullAssertion": "error",
        "useConsistentArrayType": { "level": "error", "options": { "syntax": "shorthand" } }
      }
    }
  }
}
```

`noExcessiveCognitiveComplexity: 10` — машинная реализация требования «не вкладывать if/else»: метрика
растёт именно от вложенности и заставляет выносить ветки в чистые функции, что совпадает с
`switch + assertNever` из §4. `noExplicitAny` и `noNonNullAssertion` как `error` закрывают два
стандартных способа обойти строгость.

### Что из наших правил НЕ линтер, а компилятор

| Проверка | Кто отвечает | Артефакт нарушения |
|---|---|---|
| Стиль, импорты, сложность, `any`, плавающие промисы — в **нашем** коде | Biome | сообщение линтера, код правила Biome |
| Хуки React | ESLint в `apps/studio` | сообщение линтера |
| Границы пакетов (слои, владелец внешней зависимости) | Biome `noRestrictedImports` + `scripts/check-graph.mjs` | падение джобы `verify` |
| **Всё про пользовательский воркфлоу**: непривязанный слот, несовместимый тип, ветка без предиката, цикл без бюджета, неполный `switch` по enum, промт с сырой интерполяцией | `@wf/compiler`, правила `R-*` | `Diagnostic { rule, node, slot, message, candidates }` в конверте MCP |

Граница жёсткая: линтер не знает про IR, компилятор не ругается на форматирование. Защищающий тест:
множества кодов правил `R-*` и правил Biome не пересекаются, и **каждое правило `R-*` имеет хотя бы
один класс мутации** (§7) — иначе правило не проверено ничем.

### Комплект, который держит инвариант файлового дерева

Определения лежат файлами, и Claude Code правит их нативными `Write`/`Edit`, минуя `flow_patch`.
Транзакция с валидатором до записи в этом пути отсутствует, поэтому инвариант держат четыре вещи —
и только они. Комплект ставится в проект пользователя командой `wf init`.

| Средство | Что даёт | Где живёт |
|---|---|---|
| JSON Schema 2020-12, генерируется из IR ([04](04-ir-schema.md) §2) | `$schema` в шапке файла: редактор и агент ловят структурные ошибки **до** записи | `.wf/schema/<formatVersion>.json` в проекте |
| `wf check [пути] --format json` | полная проверка тем же `@wf/compiler`, что у сервера; `problems[]` в формате конверта MCP; ненулевой exit code | `@wf/cli` |
| `wf fmt` / `wf fmt --check` | канонический YAML: убивает классы конфликтов «порядок ключей» и «стиль», держит kill 13 | `@wf/cli` |
| Хук `flow_check` на `PostToolUse` (`Write`, `Edit` по маске `flows/**/*.yaml`, `prompts/**/*.md`) | агент получает `problems[]` в том же ходу, без опроса и без второго тула | `.claude/settings.json` проекта |
| Хук `pre-commit`: `wf check --staged` + `wf fmt --check` + детектор маркеров конфликта | битое не уезжает в ветку | `.githooks/`, ставится `wf init` |
| Секция в `CLAUDE.md` проекта, генерируемая `wf init` | правила словами: файлы править можно; после правки — `wf check`; `.wf/` и раскладку канваса не трогать; пины в `wf.lock.yaml` руками не редактировать — `wf pin`; конфликт путей — к человеку | корень проекта |

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "wf check --changed --format json" }]
      }
    ]
  }
}
```

Расхождение диагностик между CLI и сервером исключается конформанс-тестом: `wf check` и `flow_compile`
на одном входе обязаны дать идентичный `problems[]`. Ядро компилятора одно, оболочек две.

## 9. CI: GitHub Actions

Принципы: один прогон ставит зависимости и греет кэш, остальные его переиспользуют; тяжёлое и денежное
(Stryker, evals) — вне PR-гейта; конформанс блокирует всегда.

| Джоба | Триггер | Блокирует PR | Таймаут | Что делает |
|---|---|---|---|---|
| `verify` | PR, push | да | 25 мин | матрица Node 22.12 / 24: `biome ci`, `check-graph`, `typecheck`, `build`, `test` |
| `tsgo` | PR, push | нет (`continue-on-error`) | 10 мин | TypeScript 7 как ранний предупредитель (§5) |
| `flow-check` | PR, push | да | 10 мин | `wf check` и `wf fmt --check` по деревьям-фикстурам проектов |
| `conformance` | PR, push | да | 20 мин | IR-мутанты (kill 1), round-trip бандла (kill 13), проверка сгенерированного проекта (kill 15) |
| `integration` | PR, push | да | 30 мин | testcontainers + Postgres 18, только Linux; в том числе `DROP SCHEMA idx CASCADE` + переиндексация с нуля и сверка «индекс == файлы» |
| `e2e` | PR, push | да | 30 мин | Playwright, артефакт отчёта при падении |
| `mutation` | nightly или метка `run-mutation` | нет | 90 мин | Stryker по `@wf/compiler` и `@wf/ir`, инкрементально |
| `evals` | `workflow_dispatch` или nightly | нет | 45 мин | прогон датасетов с бюджетом, `environment: evals` |
| `release` | push в `main`, после `verify` и `conformance` | — | — | changesets: версии, changelog, публикация с provenance |

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

env:
  TURBO_TELEMETRY_DISABLED: 1
  DO_NOT_TRACK: 1
  TURBO_API: ${{ vars.TURBO_API }}
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  verify:
    name: verify (node ${{ matrix.node }})
    runs-on: ubuntu-latest
    timeout-minutes: 25
    strategy:
      fail-fast: false
      matrix:
        node: ["22.12", "24"]
    steps:
      - uses: actions/checkout@v6
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with: { node-version: "${{ matrix.node }}", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ matrix.node }}-${{ github.sha }}
          restore-keys: turbo-${{ matrix.node }}-
      - run: pnpm biome ci .
      - run: node scripts/check-graph.mjs
      - run: pnpm changeset status --since=origin/main
        if: github.event_name == 'pull_request'
      - run: pnpm turbo run typecheck build test --cache-dir=.turbo
      - uses: actions/upload-artifact@v4
        if: matrix.node == '24'
        with: { name: coverage, path: coverage/ }

  tsgo:
    name: typecheck (TS 7 preview, non-blocking)
    runs-on: ubuntu-latest
    continue-on-error: true
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with: { node-version: "24", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm dlx typescript@7 tsgo --noEmit -p tsconfig.json

  flow-check:
    name: flow-check (дерево проекта)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with: { node-version: "24", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run build --filter=@wf/cli...
      - run: pnpm --filter @wf/cli exec wf fmt --check packages/conformance/fixtures/projects
      - run: pnpm --filter @wf/cli exec wf check packages/conformance/fixtures/projects --format json

  conformance:
    name: conformance (kill 1, 13, 15)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with: { node-version: "24", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run build --filter=@wf/conformance...
      - name: IR mutants
        run: pnpm --filter @wf/conformance run test:conformance
        env: { FC_SEED: "${{ github.run_id }}" }
      - name: bundle round-trip
        run: pnpm --filter @wf/export run test:roundtrip
      - name: generated project builds and typechecks
        run: pnpm --filter @wf/export run test:codegen
      - name: gate
        run: node scripts/gate-conformance.mjs conformance-report.json
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: conformance-report, path: conformance-report.json }

  integration:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with: { node-version: "24", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm vitest run --project integration

  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with: { node-version: "24", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm turbo run build --filter=studio...
      - run: pnpm --filter studio run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: apps/studio/playwright-report/ }

  mutation:
    name: stryker (nightly, not a PR gate)
    if: github.event_name == 'schedule' || contains(github.event.pull_request.labels.*.name, 'run-mutation')
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with: { node-version: "24", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - uses: actions/cache@v4
        with:
          path: packages/compiler/reports/stryker-incremental.json
          key: stryker-${{ github.sha }}
          restore-keys: stryker-
      - run: pnpm --filter @wf/compiler exec stryker run --incremental

  evals:
    name: evals (budgeted)
    if: github.event_name == 'workflow_dispatch' || github.event_name == 'schedule'
    runs-on: ubuntu-latest
    timeout-minutes: 45
    environment: evals
    concurrency: { group: evals, cancel-in-progress: false }
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with: { node-version: "24", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @wf/evals run eval -- --budget-usd "${{ vars.EVAL_BUDGET_USD }}" --dataset golden-15
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          LANGFUSE_PUBLIC_KEY: ${{ secrets.LANGFUSE_PUBLIC_KEY }}
          LANGFUSE_SECRET_KEY: ${{ secrets.LANGFUSE_SECRET_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: eval-report, path: reports/evals/ }

  release:
    if: github.ref == 'refs/heads/main'
    needs: [verify, conformance]
    runs-on: ubuntu-latest
    permissions: { contents: write, pull-requests: write, id-token: write }
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with: { node-version: "24", cache: "pnpm", registry-url: "https://registry.npmjs.org" }
      - run: pnpm install --frozen-lockfile
      - uses: changesets/action@v1
        with:
          version: pnpm changeset version
          publish: pnpm changeset publish
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_CONFIG_PROVENANCE: "true"
```

Детали, которые ломаются чаще всего:

- **`fetch-depth: 0`** обязателен для `turbo run ... --filter=...[origin/main]` и для
  `changeset status --since=origin/main`: без полной истории нет базы сравнения.
- **Кэш `.turbo` по `github.sha` с `restore-keys`** — это «промах с восстановлением». Правильная цель —
  удалённый кэш (`TURBO_API` или Vercel), `actions/cache` остаётся резервом.
  `"remoteCache": { "signature": true }` + `TURBO_REMOTE_CACHE_SIGNATURE_KEY` защищает от подмены
  артефакта; для ядра доверия это не паранойя.
- **Секреты не входят в хэш Turbo.** Задача, которая их читает, обязана быть `"cache": false`, иначе
  будет кэш-хит от прогона с другим ключом.
- **`concurrency` у `evals` без `cancel-in-progress`**: отменённый прогон уже потратил деньги, отмена
  теряет только отчёт. `environment: evals` даёт required reviewers на бюджет и прячет ключи
  провайдеров от прогонов из форков.
- **Бюджет evals** передаётся явным флагом `--budget-usd`, раннер останавливается по достижению и
  помечает результат `GATE_UNAVAILABLE`, а не выдаёт частичный PASS (см. [13. Evals и гейты](13-evals-and-gates.md)).
- **Пин actions по SHA** (`actions/checkout@<sha> # v6`) обязателен, если репозиторий станет публичным:
  теги мутабельны.
- Docker есть на `ubuntu-latest` и отсутствует на macOS-раннерах — интеграционная джоба только Linux.
- **`flow-check` блокирует PR**, потому что при файловом источнике истины это последний рубеж: невалидное
  дерево коммитится (у git нет точки отказа слияния), и только CI не даёт ему стать релизом.

## 10. Версионирование и релизы

`@changesets/cli@3.0.2`. Конфиг `.changeset/config.json`:

```jsonc
{
  "$schema": "https://unpkg.com/@changesets/config/schema.json",
  "changelog": ["@changesets/changelog-github", { "repo": "org/ai-workflows-automate" }],
  "commit": false,
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "linked": [["@wf/ir", "@wf/compiler", "@wf/export"]],
  "ignore": ["studio", "api", "worker", "@wf/conformance", "@wf/testkit", "@wf/tsconfig"]
}
```

### Linked-группа формата бандла

`@wf/ir`, `@wf/compiler`, `@wf/export` определяют формат бандла и обязаны иметь **одну** версию. Это
техническая реализация kill-критерия 13: бандл, помеченный версией `X`, читается ровно связкой версии
`X`, и невозможна ситуация «новый экспортёр × старый парсер IR» внутри одного релиза.

### Целочисленная версия формата

Semver пакетов и версия формата — разные вещи. В `manifest.json` бандла лежит `formatVersion` —
**целое число**, не semver, потому что у формата нет «патчей»: он либо читается, либо нет.

| Правило | Как принуждается |
|---|---|
| `formatVersion` меняется только вместе с major-changeset у `@wf/ir` | тест в `@wf/conformance`, сверяет `formatVersion` с `.changeset/*.md` |
| На каждый исторический `formatVersion` в `packages/conformance/fixtures/` лежит бандл, который обязан читаться текущим кодом | тест обратной совместимости чтения, блокирующий |
| Импорт бандла с несовместимым мажором `formatVersion` — отказ с внятным текстом, а не частичный разбор | первый шаг процедуры импорта (см. [18. Экспорт и конформанс](18-export-and-conformance.md)) |
| `manifest.signatures` зарезервирован пустым массивом и **не входит** в `merkleRoot` | подпись добавляется позже без смены `formatVersion` |

### Гейты релиза

| Гейт | Где | Что проверяет |
|---|---|---|
| `changeset status --since=origin/main` | джоба `verify`, PR | тронут публикуемый пакет — есть changeset |
| `conformance` | блокирующая джоба | мутанты, round-trip, сборка сгенерированного проекта |
| `pack-smoke` | часть `conformance` | `pnpm pack` пакета и импорт из чистого проекта: страховка от того, что `tsdown@0.x` сломал exports map минором |
| npm provenance | джоба `release`, `id-token: write` + `publishConfig.provenance` | подписанное происхождение артефакта из Actions |

Обновление `tsdown` и `typescript` — всегда отдельный changeset и отдельный PR: обе зависимости
пинуются точной версией и могут менять то, что попадает в `dist`.

## Открытые вопросы

1. **Дата выхода TypeScript 7.1 со стабильным программным API неизвестна** (в заметке помечено как
   непроверенное). От неё зависит план миграции с 6.0.3. Что сделать: повесить nightly-проверку
   `npm view typescript versions` на линию 7.1 и держать джобу `tsgo` зелёной, чтобы переход был
   одним changeset-ом.
2. **`isolatedDeclarations` × Zod 4.** Главный технический риск связки: `export type X = z.infer<typeof S>`
   и ре-экспорты выведенных типов исторически конфликтуют с isolated declarations, а от этого флага
   зависит и скорость `.d.ts` (генератор `oxc`), и запрет на протечку внутренних типов. Что сделать:
   спайк на `@wf/ir` — собрать пакет tsdown-ом с `isolatedDeclarations: true` и проверить, что `.d.ts`
   содержит полные типы IR, а не `unknown`. Если не проходит — решить, что уступает: флаг или
   выведение типов из Zod.
3. **`@stryker-mutator/typescript-checker@10` на нашем tsconfig** (`isolatedDeclarations` +
   `erasableSyntaxOnly`) вживую не проверен: возможны ложные «не компилируется», которые раздуют
   долю отсечённых мутантов. Что сделать: прогнать один раз на `@wf/ir` и зафиксировать долю
   `CompileError` в отчёте; при ложных срабатываниях — отключить checker и принять шум.
4. **Экшен установки pnpm 12 в Actions.** В заметке фигурирует `pnpm/setup@v1` как замена
   `pnpm/action-setup` для pnpm 11+, но это не подтверждено; в YAML выше стоит проверенный
   `pnpm/action-setup@v4`. Что сделать: сверить README `pnpm/action-setup` перед первым запуском CI.
5. **Противоречие в заметке по версии TypeScript.** Пример `pnpm-workspace.yaml` пинует
   `typescript: "5.9.3"`, а вердикт §3.0 той же заметки — `6.0.3`. Принято `6.0.3` (совпадает с
   [21. Дорожная карта](21-roadmap.md), F0-1). Что сделать: зафиксировать в DECISIONS строку
   «TypeScript 6.0.3» — сейчас её там нет.
6. **Версия TypeScript для проверки сгенерированного проекта.** Заметка по детерминизму предписывает
   `tsc --noEmit` сгенерированного проекта на `typescript@7.0.2`, наш репозиторий пинует 6.0.3.
   Формально конфликта нет (в сгенерированном проекте нет потребителей API TS), но две версии в одном
   CI — источник расхождения диагностик. Что сделать: решить ADR-ом — либо проверять генерат тем же
   6.0.3, либо явно зафиксировать 7.0.2 и объяснить, почему различие безопасно.
7. **Разнобой в именах пакетов между документами.** `@wf/trace` ([02](02-architecture.md)) против
   `@wf/obs-otel` / `@wf/obs-langfuse` ([12](12-observability.md)); `@wf/registries` ([02]) против
   `packages/types` ([05](05-type-system.md)). Реестр пакетов в разделе «Ответственность, публичный
   API, границы» сведён с упоминаниями в 05, 07, 09, 12, 13, 15, 16, 19, 22 и считается полным:
   `@wf/sdk` и `@wf/api-types` — разные пакеты (клиент против сгенерированных типов)
   в дереве §1 не выделены. Что сделать: завести в этом документе единственный нормативный реестр имён
   пакетов и привести остальные документы к нему одним PR; до тех пор дерево §1 считать черновиком в
   части имён адаптеров наблюдаемости и evals.
8. **Библиотека `Result` на границах не зафиксирована в DECISIONS.** Здесь выбрана true-myth 9.4.0
   (против neverthrow 8.2.0 — 19 месяцев без релиза). Что сделать: ADR с решением и, если берём
   neverthrow, явная строка риска «кандидат на вендоринг».
9. **Тип удалённого кэша Turbo не выбран**: self-hosted эндпоинт (`TURBO_API`) или Vercel Remote Cache.
   От этого зависит, нужен ли `actions/cache` вообще и кто держит `TURBO_REMOTE_CACHE_SIGNATURE_KEY`.
   Что сделать: решить до первого прогона CI, иначе сборки будут холодными.
10. **Нижняя граница Node не зафиксирована в DECISIONS.** Vitest 5 требует ≥ 22.12, матрица CI —
    22.12 и 24, прод-образы предполагаются на 24. Что сделать: записать в DECISIONS «Node 24 в
    продакшене, 22.12 — минимум в `engines`», либо убрать 22.12 из матрицы и не платить за неё временем.
11. **Состав linked-группы формата.** Сейчас это `@wf/ir + @wf/compiler + @wf/export`, но байты бандла
    определяет ещё и `@wf/canon` (канонизация и хеш). Что сделать: решить, входит ли `@wf/canon` в
    linked-группу; если нет — добавить тест, что смена мажора `@wf/canon` обязана менять `formatVersion`.
12. **Порог `total >= 50` для мутантов — из §18.1, но он нижний.** Не зафиксировано, сколько мутантов
    на класс считается достаточным (сейчас число задаётся seeded RNG и размером набора фикстур).
    Что сделать: добавить в гейт минимум по каждому классу (например, `byClass[*].total >= 3`), чтобы
    редкий класс не выродился в один мутант.
