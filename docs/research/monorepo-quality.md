# Монорепо и машинерия качества (ядро доверия)

Дата проверки: 2026-09-11. Все версии — `npm view <pkg> version` в этот день.

## Реестр версий (проверено npm)

| Пакет | Версия | Лицензия | Последняя публикация |
|---|---|---|---|
| turbo | 2.10.12 | MIT | 2026-09-10 |
| nx | 23.2.1 | MIT | 2026-09-10 |
| tsup | 8.5.1 | MIT | **2025-11-12 (10 мес назад)** |
| tsdown | 0.23.0 | MIT | 2026-09-03 |
| unbuild | 3.6.1 | MIT | **2025-08-15 (13 мес назад — риск)** |
| neverthrow | 8.2.0 | MIT | **2025-02-21 (19 мес назад — риск)** |
| ts-pattern | 5.9.0 | MIT | 2025-10-26 (11 мес) |
| effect | 3.22.2 | MIT | 2026-09-10 |
| @biomejs/biome | 2.5.13 | MIT OR Apache-2.0 | 2026-09-10 |
| eslint | 10.10.0 | MIT | 2026-09-04 |
| prettier | 3.9.6 | MIT | 2026-07-21 |
| vitest | 5.0.0 | MIT | 2026-09-05 |
| @playwright/test | 1.63.0 | Apache-2.0 | 2026-09-11 |
| testcontainers | 12.1.0 | MIT | 2026-08-04 |
| fast-check | 4.10.0 | MIT | 2026-09-11 |
| @stryker-mutator/core | 10.0.0 | Apache-2.0 | 2026-08-14 |
| @changesets/cli | 3.0.2 | MIT | 2026-09-04 |
| typescript | **7.0.2** | Apache-2.0 | 2026-09-11 |

ВАЖНО: `typescript@latest` = 7.0.2 (Go-порт, "tsgo"). Требует отдельной проверки совместимости — см. §3.

## Секции
- [x] 1. Монорепо: pnpm workspaces + Turborepo vs Nx
- [x] 2. Сборка библиотек: tsup / tsdown / unbuild / tsc
- [x] 3. TypeScript для строгого ядра
- [x] 4. Тесты
- [x] 5. Мутационное тестирование
- [x] 6. Линт/формат
- [x] 7. CI GitHub Actions

---

## 1. Монорепо: pnpm workspaces + Turborepo 2.10 vs Nx 23

### Вердикт: **pnpm@12 workspaces + Turborepo 2.10.12**. Nx — нет.

Обоснование под наш профиль (~10 библиотечных пакетов + 1 Next.js приложение + 1 MCP-сервер):

- Turborepo — это **только** кэш+граф задач поверх npm-скриптов. Нулевая инвазия: каждый пакет остаётся обычным пакетом со своим `package.json`/`tsconfig.json`. Ничего не нужно «переносить в Nx-плагины».
- Nx 23 силён там, где нужны генераторы кода, миграции (`nx migrate`), module boundary rules (`@nx/enforce-module-boundaries`), граф с автодетектом зависимостей и распределённое выполнение (Nx Cloud/DTE). Цена — inferred tasks / project crystal, плагины на каждый инструмент, свой executor-слой. На 10 пакетах эта цена не окупается, а для агента (Claude через MCP) плоская структура «пакет = папка + package.json + скрипты» читается и чинится проще, чем `nx.json` + плагинные таргеты.
- Boundary rules — единственное, чего реально не хватит от Turbo. Закрываем двумя способами: (а) `dependsOn`/граф pnpm — пакет физически не может импортировать то, чего нет в его `dependencies`; (б) правило линтера (Biome `noRestrictedImports` / ESLint `import-x/no-restricted-paths`) на пути.
- Turbo 2.10 активно релизится (2026-09-10), Nx 23 тоже. Оба MIT. Риска заброшенности нет ни у одного.

### pnpm-workspace.yaml (pnpm 12)

```yaml
packages:
  - "apps/*"
  - "packages/*"

# pnpm 10+ : поднять сюда версии, чтобы не разъезжались между пакетами
catalog:
  typescript: "5.9.3"
  zod: "4.6.2"
  vitest: "5.0.0"
  "@types/node": "^24.0.0"
  ai: "^6.0.0"

catalogs:
  react19:
    react: "19.3.0"
    react-dom: "19.3.0"

# безопасность supply-chain: скрипты установки только у явно разрешённых пакетов
onlyBuiltDependencies:
  - esbuild
  - "@biomejs/biome"
  - sharp

# ядро доверия не должно случайно поднять разные minor одной либы
# (pnpm 10+, ключ верхнего уровня в pnpm-workspace.yaml)
overrides: {}
```

Пакеты ссылаются друг на друга через `"@wf/ir": "workspace:*"` и на каталог через `"zod": "catalog:"` / `"react": "catalog:react19"`.

Раскладка:
```
apps/studio          # Next.js 16.3
apps/mcp             # MCP-сервер (stdio + http)
packages/ir          # Zod-схемы IR + branded ids   <- ядро доверия
packages/compiler    # IR -> VoltAgent workflow      <- ядро доверия
packages/conformance # золотые фикстуры + раннер
packages/runtime     # обвязка VoltAgent
packages/providers   # каталог моделей
packages/evals       # прогон датасетов/скореров
packages/export      # §15.1 экспорт в standalone-проект
packages/telemetry   # Langfuse/OTel
packages/ui          # shadcn-компоненты, общие для studio
packages/tsconfig    # базовые tsconfig (не публикуется)
```

### turbo.json (schema 2.x — ключ `tasks`, не `pipeline`)

```jsonc
{
  "$schema": "https://turborepo.com/schema.json",
  "ui": "tui",
  "globalDependencies": ["pnpm-lock.yaml", "tsconfig.base.json"],
  "globalEnv": ["CI"],
  "globalPassThroughEnv": ["NODE_OPTIONS"],
  "remoteCache": { "signature": true },
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "!**/*.test.ts", "!**/*.md"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "typecheck": { "dependsOn": ["^build"], "outputs": ["*.tsbuildinfo"] },
    "lint": { "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "test:conformance": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", "../conformance/fixtures/**"],
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

Подводные камни Turbo:
- **`outputs: []` не значит «не кэшировать»** — значит «кэшировать только логи». Отключение кэша — `"cache": false`.
- Переменные окружения, не перечисленные в `env`/`globalEnv`, **не входят в хэш** → возможен «кэш-хит с чужим конфигом». Для eval-задач и всего, что ходит к провайдерам, ставим `"cache": false` явно.
- `$TURBO_DEFAULT$` в `inputs` = «все файлы пакета по gitignore-правилам», плюс можно добавлять исключения — так исключаем тесты из хэша build.
- Перекрёстные `inputs` за пределы пакета (как `../conformance/fixtures/**`) работают, но лучше оформить conformance-фикстуры отдельным пакетом и повесить обычный `dependsOn`.

### TS project references vs единый tsconfig

Вердикт: **`tsconfig.base.json` + per-package `tsconfig.json` с `references`, но БЕЗ опоры на `tsc -b` в сборке.**

- Сборка артефактов — tsdown (см. §2). `tsc` у нас только `--noEmit` для typecheck и `--emitDeclarationOnly` там, где нужен максимально точный `.d.ts`.
- `references` + `composite: true` дают: (а) быстрый инкрементальный `turbo typecheck` (каждый пакет чекается отдельно, Turbo кэширует по пакету), (б) **запрет на импорт из чужого `src/` мимо публичного входа** — это и есть дешёвый заменитель Nx boundary rules.
- Анти-паттерн, который надо запретить: `paths: { "@wf/*": ["packages/*/src"] }` в корневом tsconfig. Он делает «всё видит всё», ломает границы и расходится с тем, что реально попадёт в `dist`. Границы держим на `workspace:*` + `exports`, а не на `paths`.

---

## 2. Сборка библиотек: tsdown

### Вердикт: **tsdown (Rolldown) для всех публикуемых пакетов. tsup — нет.**

Проверено 2026-09-11:
- `tsup@8.5.1`, последняя публикация **2025-11-12** — почти 10 месяцев без релиза. В README самого tsup написано, что проект больше активно не поддерживается и рекомендуется tsdown. Есть issue `egoist/tsup#1391` «Consider surfacing the maintenance status more prominently». Экосистема мигрирует (mcp inspector #1492, git-cliff #1384).
- `tsdown@0.23.0`, публикация 2026-09-03, репозиторий `github.com/rolldown/tsdown`, официальный проект Rolldown, доки `tsdown.dev`. Есть гайд `tsdown.dev/guide/migrate-from-tsup`.
- `unbuild@3.6.1` — последняя публикация **2025-08-15, 13 месяцев назад → риск**. Хорош для UnJS-стиля (stub-режим через jiti), но темп поддержки нам не подходит.
- Чистый `tsc` — годится только для пакетов без бандлинга. Медленнее на `.d.ts` и не умеет сам собрать exports map.

**Риск tsdown: версия 0.x** — semver-минор может ломать. Митигация: пин точной версии (`"tsdown": "0.23.0"` в catalog, без `^`), обновление отдельным changeset-ом, а как страховка — conformance-тест «собранный пакет импортируется из чистого проекта» (см. §7 job `pack-smoke`).

### Типовой tsdown.config.ts для пакета ядра

```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/testing.ts"],
  format: ["esm"],
  platform: "neutral",
  dts: { generator: "oxc" },   // см. поправку ниже
  sourcemap: true,
  clean: true,
  treeshake: true,
  exports: true,
  unused: true,
});
```

- `exports: true` — tsdown сам записывает корректный `exports` map в `package.json`. Это снимает целый класс ошибок «собрали, а импорт не резолвится».
- `dts.isolatedDeclarations: true` требует `isolatedDeclarations` в tsconfig (см. §3) — заставляет писать явные возвращаемые типы у публичного API. Для ядра доверия это плюс, а не минус: публичный контракт перестаёт «вытекать» из инференса, а генерация `.d.ts` становится O(файл) вместо полного type-check.
- `unused: true` — падает, если в `dependencies` висит то, что не импортируется (и наоборот). **Требует отдельно поставить `unplugin-unused`** — иначе tsdown ругнётся на отсутствующий пакет.

**ПОПРАВКА, проверено установкой tsdown@0.23.0 в probe-fe (`node_modules/rolldown-plugin-dts/dist/*.d.mts`):**
- У `dts` **нет** ключа `isolatedDeclarations`. Есть `dts.generator: "tsc" | "oxc" | "tsgo"`. Плагин выбирает сам: **`oxc`** — если в tsconfig включён `isolatedDeclarations`; **`tsgo`** — если стоит TypeScript 7; **`tsc`** — иначе. То есть правильный способ получить быстрый dts — включить `isolatedDeclarations: true` в tsconfig (§3.1) и не трогать `dts` вовсе, либо задать `generator: "oxc"` явно.
- Прочие реально существующие ключи конфига (проверено в `.d.mts`): `exports` (по умолчанию **`false`**, поэтому его надо включать явно), `unbundle`, `nodeProtocol: "strip" | boolean`, `dts.eager`, `dts.parallel`, `dts.incremental`, `report: { gzip, brotli, summary, maxCompressSize }`, `css` (экспериментально, требует `@tsdown/css`).
- Полезно для монорепо: `deps.dts: { alwaysBundle, neverBundle }` — управление тем, какие типы зависимостей инлайнить в `.d.ts`. Для `workspace:*`-пакетов типы обычно НЕ инлайним (они публикуются рядом).

### Нужен ли CJS

**Нет, кроме одного пакета.** Обоснование:
- Node 20+ (а мы на Node 24) умеет `require()` ESM-модулей без top-level await — `require(esm)` стабилен с Node 22.12/20.19. Next.js 16 и VoltAgent 2.10 — ESM-first.
- Двойная сборка даёт dual-package hazard: два экземпляра модуля → два реестра/два Symbol → branded types и `instanceof` ломаются молча. Для ядра доверия это неприемлемо.
- Единственное исключение — `packages/export`, если шаблон экспортируемого standalone-проекта должен уметь встраиваться в чужой CJS-код. Решаем не двойной сборкой, а отдельным entry `./cjs-shim`.

### package.json публикуемого пакета

```jsonc
{
  "name": "@wf/ir",
  "version": "0.1.0",
  "type": "module",
  "sideEffects": false,
  "files": ["dist"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./testing": { "types": "./dist/testing.d.ts", "default": "./dist/testing.js" },
    "./package.json": "./package.json"
  },
  "publishConfig": { "access": "public", "provenance": true },
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```
`"provenance": true` + публикация из GitHub Actions с `id-token: write` даёт подписанный npm-provenance — для «ядра доверия» это буквально по теме.

---

## 3. TypeScript для строгого ядра

### 3.0 КРИТИЧНО: какую версию TypeScript ставить

`typescript@latest` = **7.0.2** — это Go-порт компилятора (tsgo), выпущенный в 2026. Он в 8–12× быстрее на полном чеке. НО:

- **У TS 7.0 нет стабильного программного API** (обещан в 7.1). Из-за этого на нём не работают `typescript-eslint`, `ts-morph`, `ts-jest`, template-чекеры Vue/Svelte/Astro.
- Проверено npm 2026-09-11: `typescript-eslint@8.70.0` → `peerDependencies.typescript: ">=4.8.4 <6.1.0"`. То есть типизированный линт **не поддерживает даже TS 6.1**, не то что 7.
- Последняя 6.x = **6.0.3**. Последняя 5.x = 5.9.3.

**Вердикт:** источник истины для emit и тулинга — **`typescript@6.0.3`**, пин точной версией в `catalog:`. Отдельно в CI (и локально) держим **`typescript@7` как не блокирующий быстрый чекер**: `tsgo --noEmit -p .` в отдельной GH-job с `continue-on-error: true`. Как только выйдет 7.1 со стабильным API и `typescript-eslint` его поддержит — переключаем источник истины одним changeset-ом. Это ещё один аргумент за Biome (§6): Biome не использует API TS вообще, поэтому не привязывает нас к потолку `<6.1.0`.

UNVERIFIED: точная дата выхода TS 7.1 (поиск говорит «несколько месяцев» от августа 2026).

### 3.1 tsconfig.base.json

```jsonc
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "nodenext",
    "moduleResolution": "nodenext",

    // --- строгость ---
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "useUnknownInCatchVariables": true,   // включён strict-ом, пишем явно как документацию
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,

    // --- корректность модулей / emit ---
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "isolatedDeclarations": true,        // нужен для быстрого dts в tsdown
    "erasableSyntaxOnly": true,          // TS 5.8+: запрещает enum/namespace/parameter properties
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true,

    // --- монорепо ---
    "composite": true,
    "incremental": true
  }
}
```

Почему именно эти четыре «неочевидных» флага критичны для ядра доверия:

- **`noUncheckedIndexedAccess`** — `nodes[id]` становится `Node | undefined`. Компилятор IR постоянно ходит по мапам узлов/слотов; без флага «узел не найден» проваливается в рантайм как `undefined.type`. Это ровно наш класс L1→L2-протечки.
- **`exactOptionalPropertyTypes`** — различает «поля нет» и «поле есть и равно `undefined`». Для сериализуемого IR и round-trip-теста (kill-критерий №13 «экспорт → импорт → экспорт даёт идентичный бандл») это буквально определяет, совпадут ли байты.
- **`isolatedDeclarations`** — заставляет писать явные типы возврата у экспортов. Публичный контракт ядра перестаёт зависеть от инференса, `.d.ts` генерится пофайлово (быстро, tsdown это использует), и невозможно нечаянно «протечь» внутренним типом наружу.
- **`erasableSyntaxOnly`** — убивает `enum` и `namespace`. Для нас важно: enum'ы предметной области живут в реестре типов (§6/§7 спеки) как данные, а не как TS-конструкции. Флаг физически не даёт агенту завести второй источник истины для enum (перекликается с kill-критерием №6).

Per-package `tsconfig.json`:
```jsonc
{
  "extends": "../tsconfig/base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"],
  "references": [{ "path": "../ir" }]
}
```
Для `apps/studio` (Next.js 16) — отдельный base с `"module": "preserve"`, `"moduleResolution": "bundler"`, `"jsx": "preserve"`, `"noEmit": true`, `"lib": ["ES2024","DOM","DOM.Iterable"]` и **без** `isolatedDeclarations` (в UI он только мешает).

### 3.2 Branded types для идентификаторов

Один источник истины — Zod-схема, тип выводится из неё:

```ts
// packages/ir/src/ids.ts
import { z } from "zod";

export const NodeId = z.string().min(1).brand<"NodeId">();
export type NodeId = z.infer<typeof NodeId>;

export const SlotId = z.string().min(1).brand<"SlotId">();
export type SlotId = z.infer<typeof SlotId>;

export const WorkflowId = z.uuid().brand<"WorkflowId">();
export type WorkflowId = z.infer<typeof WorkflowId>;
```

Zod 4 навешивает `$brand`, поэтому `NodeId` и `SlotId` несовместимы, а `string` не присваивается ни одному из них. Плюсы против ручного `unique symbol`-бренда: валидация и тип не расходятся, и `NodeId.parse(x)` — единственный легальный вход. Ручной бренд оставляем только для типов, у которых нет рантайм-валидации.

Для мап по id — `Record<NodeId, Node>` небезопасен (`noUncheckedIndexedAccess` спасает, но ключ всё ещё `string`). Заводим тонкую обёртку:
```ts
export type IdMap<K extends string, V> = ReadonlyMap<K, V>;
```
`Map<NodeId, Node>` даёт типобезопасный `get(): Node | undefined` без лишних флагов.

### 3.3 Проверка исчерпываемости: `switch` + `never` по умолчанию, ts-pattern точечно

**Вердикт: базовый инструмент — `switch` + `assertNever`. ts-pattern 5.9.0 — только в правилах компилятора, где матч идёт по нескольким полям сразу.**

```ts
// packages/ir/src/assert-never.ts
export class UnreachableError extends Error {
  constructor(readonly value: never) {
    super(`Unreachable variant: ${JSON.stringify(value)}`);
  }
}
export const assertNever = (value: never): never => { throw new UnreachableError(value); };
```

```ts
export const compileNode = (node: Node): Fragment => {
  switch (node.kind) {
    case "llm":     return compileLlm(node);
    case "code":    return compileCode(node);
    case "branch":  return compileBranch(node);
    case "loop":    return compileLoop(node);
    case "tool":    return compileTool(node);
    default:        return assertNever(node);
  }
};
```

Это и есть «плоский код»: один `switch`, каждая ветка — вызов чистой функции, нулевая вложенность, и при добавлении варианта в IR **все** такие switch падают на компиляции (kill-критерий №6 «одна правка → список всех затронутых мест» реализуется именно так, бесплатно).

ts-pattern нужна там, где ветвление идёт по кортежу условий и `switch` выродился бы в `if/else`-лестницу — типично для правил `R-<номер>`:

```ts
import { match, P } from "ts-pattern";

const diagnose = (edge: Edge): Diagnostic | null =>
  match(edge)
    .with({ from: { kind: "llm" }, to: { kind: "code" }, binding: P.nullish },
          () => rule("R-09", edge))
    .with({ from: { kind: "branch" }, guard: P.nullish },
          () => rule("R-14", edge))
    .otherwise(() => null);
```
`.exhaustive()` даёт ту же гарантию, что `assertNever`, но на составных паттернах. Риск: последняя публикация ts-pattern — 2025-10-26 (~11 мес). Библиотека зрелая и типо-ориентированная (почти весь вес в `.d.ts`), API стабилен с 5.0; допустимый риск, но держим её только в `packages/compiler`, чтобы при необходимости выпилить одним PR.

### 3.4 Типизированные ошибки: честная рекомендация

Проверено npm 2026-09-11:

| Кандидат | Версия | Последняя публикация | Оценка |
|---|---|---|---|
| neverthrow | 8.2.0 | **2025-02-21 (19 мес) — риск** | минималистичный `Result`/`ResultAsync`, zero-dep |
| effect | 3.22.2 | 2026-09-10, очень живой | полноценный рантайм |
| true-myth | 9.4.0 | 2026-05-25 | `Result`+`Maybe`, живой, zero-dep |
| ts-results-es | 7.1.0 | 2026-07-01 | форк ts-results, живой |
| @praha/byethrow | 0.12.0 | 2026-06-08 | tree-shakeable Result, 0.x |

**Рекомендация — три уровня, не один:**

1. **Домен (IR, компилятор, валидатор) — размеченные объединения, БЕЗ `Result`-библиотеки.**
   Компилятор не «фейлится на первой ошибке», он **собирает список диагностик**. Семантика `Result.andThen` (короткое замыкание) здесь просто неправильная — она бы прятала 9 из 10 ошибок от агента, а наш продукт ровно в том, чтобы вернуть агенту все ошибки с кандидатами на исправление.
   ```ts
   export type CompileOutcome =
     | { readonly ok: true;  readonly bundle: Bundle; readonly warnings: readonly Diagnostic[] }
     | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };
   ```
   `Diagnostic` — ровно форма из §9 спеки: `{ rule, node, slot, message, candidates }`. Ноль зависимостей, сериализуется в MCP-ответ как есть, читается агентом.

2. **Границы I/O (MCP-хендлеры, вызовы провайдеров, БД, экспорт) — `Result`-библиотека.**
   Здесь короткое замыкание как раз нужно, и она убирает вложенные `try/catch`. Берём **true-myth 9.4.0** вместо neverthrow: тот же zero-dep минимализм, но живой релизный поток (2026-05 против 2025-02). Если команда уже знает neverthrow — это приемлемо, но зафиксируйте риск: 19 месяцев без релиза при живых issue = кандидат на вендоринг (там ~600 строк типов, zero-dep, скопировать реально).
   Плоскость кода достигается генераторным синтаксисом (`safeTry` у neverthrow / аналог у true-myth), который заменяет лестницу `.andThen(...)`:
   ```ts
   const run = (input: unknown) => safeTry(async function* () {
     const spec   = yield* parseSpec(input);
     const bundle = yield* compile(spec);
     const run    = yield* execute(bundle);
     return ok(run);
   });
   ```

3. **Effect 3.22 — НЕТ.** Обоснование, а не вкусовщина:
   - Effect — это не библиотека ошибок, а **второй рантайм**: свой планировщик, файберы, Layer-DI, Scope, Schedule. У нас рантайм уже есть — VoltAgent (шаги, ретраи, suspend/resume, конкурентность). Два конкурирующих effect-системы в одном процессе — это не «не изобретать велосипед», это поставить второй велосипед рядом.
   - Effect «красит» все сигнатуры (`Effect<A, E, R>`). Ядро доверия обязано читаться агентом и человеком без знания спец-нотации; `CompileOutcome` читает любой.
   - Цена входа несовместима с «SOLID + плоский код»: Effect требует своей идиоматики (`pipe`, `gen`, Layers), и через полгода половина кода — это Effect, а не предметная область.
   - Когда Effect был бы прав: если бы мы сами писали движок исполнения с ретраями/таймаутами/конкурентностью. Мы его не пишем — берём VoltAgent.

---

## 4. Тесты

Проверенные версии (npm, 2026-09-11): `vitest@5.0.0` (релиз 2026-09-03), `@vitest/coverage-v8@5.0.0` (peer: `vitest 5.0.0` **точная**, плюс peer `@vitest/browser 5.0.0` — опциональный), `@vitest/browser@5.0.0`, `@playwright/test@1.63.0`, `testcontainers@12.1.0` + `@testcontainers/postgresql@12.1.0`, `fast-check@4.10.0`, `@fast-check/vitest@0.5.0` (peer `vitest ^4.1.0 || ^5.0.0`), `msw@2.15.0`, `vitest-mock-extended@5.1.1`.

**Требования Vitest 5:** Node **>= 22.12.0**, Vite **>= 6.4.0**. Ломающие изменения, важные для монорепо:
- **Поиск конфига больше не поднимается по родительским каталогам** — каждый пакет обязан иметь свой `vitest.config.ts` либо запускаться из корня через `projects`.
- `@vitest/runner` инлайнится и больше не публикуется отдельно.
- Reporter `'basic'` удалён.
- Inline-записи `test.projects` теперь наследуют корневые Vite-плагины и `setupFiles` (в 4.x не наследовали) — при миграции возможны «внезапно поехавшие» сетапы.
- `workspace` (файл `vitest.workspace.ts`) устарел с 3.2 и заменён на `test.projects`. Новый код пишем только на `projects`.
- Новое в 5: Trace View для browser mode — пошаговый реплей взаимодействий/ассертов через DOM-снапшоты.

### 4.1 Корневой vitest.config.ts

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
          pool: "threads",           // требование Stryker, см. §5
          typecheck: { enabled: true, include: ["*/src/**/*.test-d.ts"] },
        },
      },
      {
        test: {
          name: "integration",
          include: ["packages/*/test/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 120_000,      // testcontainers поднимает Postgres
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
    // reporters и coverage задаются ТОЛЬКО в корне — проекты их не переопределяют
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      include: ["packages/*/src/**"],
      exclude: ["**/*.test.ts", "**/dist/**"],
      thresholds: {
        // ядро доверия держим выше остального
        "packages/ir/src/**":       { statements: 95, branches: 90, functions: 95, lines: 95 },
        "packages/compiler/src/**": { statements: 95, branches: 90, functions: 95, lines: 95 },
        statements: 80, branches: 75, functions: 80, lines: 80,
      },
    },
  },
});
```
Запуск отдельных проектов: `vitest --project core`, `vitest --project '!ui'`, `vitest --project 'unit*'`.

**Подводный камень coverage:** `@vitest/coverage-v8@5.0.0` имеет peer `vitest: "5.0.0"` — точную, не `^`. Любой апгрейд Vitest обязан двигать coverage-пакет тем же changeset-ом, иначе pnpm упадёт на peer-резолве. Для browser-mode покрытия v8 требует ещё и `@vitest/browser`.

### 4.2 Снапшоты — где они уместны, а где вредны

По §8 спеки качество формулировок промтов ловится снапшотами отрисованных промтов. Практика:
- `toMatchFileSnapshot("__snapshots__/prompt-<node>.txt")` — **файловые** снапшоты, не инлайновые. Их видно в дифе PR (это и есть механизм ревью из спеки), и агент не может «случайно перезаписать» их вместе с кодом.
- Снапшоты скомпилированного IR → **не снапшот, а golden-фикстура** в `packages/conformance/fixtures/*.json` со строгим `expect(actual).toEqual(golden)`. Разница принципиальна: снапшот обновляется флагом `-u` (агент это сделает не задумываясь), золотая фикстура — обычный файл, её изменение — осознанный коммит.
- В CI обязательно `vitest run --allowOnly=false` и `CI=true` (Vitest не создаёт новые снапшоты в CI, падает на отсутствующем).

### 4.3 Playwright 1.63 для E2E Studio

Отдельный пакет `apps/studio/e2e`, не мешать с browser-mode Vitest (они решают разные задачи: Vitest browser — компонентные тесты, Playwright — сквозные сценарии §14).
```ts
// playwright.config.ts
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://127.0.0.1:3000", trace: "on-first-retry" },
  webServer: { command: "pnpm --filter studio start", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```
E2E-сценарии, которые обязаны быть (по §11/§14): «открыть трассу прогона и найти шаг с ошибкой», «поправить промт в инспекторе и перезапустить с шага», «экспортировать бандл и убедиться в round-trip».

### 4.4 testcontainers 12.1 для Postgres

```ts
// test/pg-container.ts — globalSetup проекта "integration"
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

let container: StartedPostgreSqlContainer;

export const setup = async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine")
    .withReuse()                       // локально переиспользует контейнер между прогонами
    .start();
  process.env.DATABASE_URL = container.getConnectionUri();
};

export const teardown = async () => { await container.stop(); };
```
Подводные камни:
- `.withReuse()` требует `testcontainers.reuse.enable=true` в `~/.testcontainers.properties`; в CI reuse не работает и не нужен.
- В GitHub Actions Docker есть на `ubuntu-latest` из коробки, на macOS-раннерах — нет. Интеграционный job держим только на Linux.
- Один контейнер на весь проект + `TRUNCATE`/схема-на-тест вместо контейнера-на-тест, иначе прогон уедет в десятки минут.

### 4.5 fast-check 4.10 — property-based тесты инвариантов IR и компилятора

Ставим `fast-check@4.10.0` + `@fast-check/vitest@0.5.0` (даёт `test.prop`, интегрируется с `--seed` и репортерами Vitest).

Генератор валидного IR (рекурсивный граф — `fc.letrec`):
```ts
import fc from "fast-check";
import { test } from "@fast-check/vitest";

const nodeArb = fc.letrec((tie) => ({
  node: fc.oneof(
    { depthSize: "small" },
    fc.record({ kind: fc.constant("llm"),  id: idArb, prompt: fc.string(), out: typeRefArb }),
    fc.record({ kind: fc.constant("code"), id: idArb, fn: fc.constantFrom("map", "filter", "reduce") }),
    fc.record({ kind: fc.constant("branch"), id: idArb, cases: fc.array(tie("node"), { maxLength: 3 }) }),
  ),
})).node;
```

Инварианты, которые надо закрыть property-тестами (каждый — прямая проекция kill-критерия):

| Инвариант | Свойство | Kill-критерий |
|---|---|---|
| Round-trip сериализации | `parse(serialize(ir)) === ir` (deep equal) | №13 |
| Round-trip экспорта | `import(export(bundle))` даёт побайтово тот же бандл | №13 |
| Идемпотентность компиляции | `compile(ir) === compile(ir)` при фиксированном seed | — |
| Тотальность компилятора | для любого валидного IR `compile` возвращает `ok:true` — никогда не бросает | доверие к L1 |
| Тотальность диагностики | для любого **невалидного** IR каждая диагностика несёт непустой `candidates` | §9 «ошибка без кандидатов = баг компилятора» |
| Устойчивость топосорта | порядок шагов не зависит от порядка ключей в JSON | воспроизводимость, №5 |
| Монотонность типов | сужение типа слота не может превратить ошибку в успех | L1 |
| Детерминизм замены enum | добавление значения enum → список затронутых узлов полон | №6, №9 |

В CI обязательно фиксируем и логируем seed: `fc.configureGlobal({ numRuns: process.env.CI ? 1000 : 100, seed: Number(process.env.FC_SEED) || Date.now() })`, и падение печатает воспроизводящий seed/path — иначе property-тест в CI бесполезен.

---

## 5. МУТАЦИОННОЕ ТЕСТИРОВАНИЕ (kill-критерий №1)

Спека, §18.1: «Не меньше 50 мутантов по классам L0/L1 — компилятор ловит 100%». §9: «корректные воркфлоу автоматически портятся типовыми ошибками агента, и компилятор обязан поймать 100% мутантов своих классов. Каждый пропуск — это новое правило или баг».

### 5.1 Это ДВЕ разные вещи, и путать их нельзя

- **Stryker** мутирует **наш исходный код** и спрашивает «поймают ли это наши тесты». Метрика — качество тест-сьюта.
- **Kill-критерий №1** мутирует **данные (валидный IR)** и спрашивает «поймает ли это наш компилятор». Метрика — полнота правил `R-<номер>`.

Это ортогональные оси. Спека требует второе. Stryker второе **не умеет в принципе** — он не знает про наш IR.

### 5.2 Вердикт

**Строим свой доменный IR-мутатор — он и есть kill-критерий №1. Stryker берём дополнительно и узко: только `packages/compiler` и `packages/ir`, как гигиену тест-сьюта, по nightly-расписанию, не в PR-гейте.**

Stryker 10.0.0 (Apache-2.0, публикация 2026-08-14) — живой. `@stryker-mutator/vitest-runner@10.0.0`, peer `vitest >=2.0.0` (Vitest 5 проходит). Реальные ограничения, проверено в доках:
- поддерживается **только `pool: "threads"`** (не `forks` — а это дефолт Vitest начиная с v2 → надо явно выставить `pool: "threads"` в конфиге, который скармливается Stryker);
- **browser mode не поддерживается** → проект `ui` под Stryker не пойдёт;
- `coverageAnalysis` игнорируется, всегда `perTest`;
- плагин принудительно ставит single-thread, bail-on-first-failure и выключает coverage (параллелизацией управляет сам Stryker);
- `vitest.related: true` (дефолт) гоняет только тесты, импортирующие мутированный файл — выключать для интеграционных тестов, которые ходят через API.

Производительность — главный ограничитель: время ≈ (число мутантов) × (время прогона релевантных тестов). Для ~2–4 тыс. мутантов компилятора это десятки минут даже с `perTest`-анализом. Поэтому: `mutate` только по ядру, `--incremental` с файлом `reports/stryker-incremental.json` в кэше Actions, и PR-гейт только по **изменённым** файлам.

```jsonc
// packages/compiler/stryker.config.json
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
`checkers: ["typescript"]` (пакет `@stryker-mutator/typescript-checker@10.0.0`, peer `typescript >=3.6`) отсеивает мутанты, не проходящие компиляцию — на строгом tsconfig это выкидывает заметную долю шума. Но он использует программный API TS → **ещё одна причина держать `typescript@6.0.3`, а не 7** (§3.0).

### 5.3 Наш IR-мутатор: устройство

Пакет `packages/conformance/src/mutator`. Это чистая функция над данными, без магии:

```ts
export type MutationClass =
  | "unbound-slot" | "type-mismatch" | "unknown-node" | "unknown-tool"
  | "invented-enum-value" | "dangling-edge" | "cycle" | "duplicate-id"
  | "missing-loop-budget" | "untyped-stop-condition" | "unbound-feedback-slot"
  | "converge-without-diverge" | "branch-without-guard" | "non-exhaustive-branch"
  | "prompt-raw-interpolation" | "duplicate-type" | "version-drift"
  | "dropped-context" | "stale-component-version" | "schema-widening";

export interface Mutant {
  readonly id: string;
  readonly class: MutationClass;
  readonly level: "L0" | "L1";
  readonly expectRule: RuleCode;          // какое правило ОБЯЗАНО сработать
  readonly ir: Ir;                         // испорченный IR
  readonly origin: { fixture: string; path: string };  // где именно испортили
}

export type Mutate = (ir: Ir, rng: Rng) => readonly Mutant[];
```

Раскладка по классам мутаций (каждый — типовая ошибка агента из таблицы §8 спеки):

**Структурные (граф):**
1. `dangling-edge` — ребро на несуществующий `nodeId`.
2. `duplicate-id` — продублировать id узла.
3. `cycle` — добавить ребро назад, создав цикл вне `loop`.
4. `converge-without-diverge` — узел конвергенции без соответствующей дивергенции.
5. `drop-node` — удалить узел, на который есть ссылки.

**Контрактные (слоты и типы) — ядро L1:**
6. `unbound-slot` — снять привязку слота (правило `R-09` из §9, формат ошибки с `candidates`).
7. `type-mismatch` — привязать слот к выходу несовместимого типа.
8. `schema-widening` — заменить конкретный тип на `any`/`string` (проверка, что «расширение» — тоже ошибка).
9. `invented-enum-value` — подставить значение enum, которого нет в реестре.
10. `unknown-node` / `unknown-tool` / `unknown-param` — сослаться на то, чего нет в каталоге (§8 строка 3).
11. `duplicate-type` — объявить тип, дублирующий существующий в реестре (§8 строка 2).

**Управляющие (ветки и циклы):**
12. `branch-without-guard` — убрать типизированный предикат ветки.
13. `non-exhaustive-branch` — удалить ветку из `switch` по enum (перекликается с kill-критерием №9).
14. `missing-loop-budget` — снести `max_iter`/бюджет (правило `R-L1`).
15. `untyped-stop-condition` — заменить типизированный предикат на строку (`R-L3`).
16. `unbound-feedback-slot` — отвязать выход верификатора от слота обратной связи генератора (`R-L2`).

**Промтовые (L0):**
17. `prompt-raw-interpolation` — вставить данные в текст промта мимо типизированного плейсхолдера (§8 строка 1). Обязан быть **невыразим** — то есть мутант не должен даже сериализоваться в валидный IR; тест проверяет, что `Ir.parse` падает.

**Версионные:**
18. `stale-component-version` — сослаться на старую версию компонента.
19. `version-drift` — разойтись версией бандла и версией формата.

Раннер:
```ts
for (const fixture of goldenFixtures) {
  for (const mutant of mutate(fixture.ir, seededRng(SEED))) {
    const outcome = compile(mutant.ir);
    // 1. мутант ОБЯЗАН быть отвергнут
    expect(outcome.ok, `survivor ${mutant.id} (${mutant.class})`).toBe(false);
    // 2. отвергнут ИМЕННО ТЕМ правилом, которым должен
    expect(outcome.diagnostics.map(d => d.rule)).toContain(mutant.expectRule);
    // 3. диагностика обязана нести кандидатов на исправление (§9)
    const d = outcome.diagnostics.find(x => x.rule === mutant.expectRule)!;
    expect(d.candidates.length, `no candidates for ${mutant.id}`).toBeGreaterThan(0);
  }
}
```

Три уровня проверки — важная деталь: проверять только «упало» недостаточно. Мутант, пойманный «не тем» правилом или с пустым `candidates`, по §9 считается **выжившим** (баг компилятора), даже если формально компиляция не прошла.

Отчёт `conformance-report.json`: `{ total, killed, survivors: [{ id, class, level, fixture }], byClass: {...} }`. **Гейт: `survivors.length === 0` и `total >= 50`** — ровно формулировка §18.1. Каждый выживший по спеке порождает либо новое правило, либо баг-репорт — в CI печатаем его как annotation с готовым шаблоном issue.

Почему свой мутатор дешевле, чем кажется: мутации — это `structuredClone` + точечная правка по JSON-пути. ~20 классов × ~30 строк = меньше дня работы, и это **тестируемый продукт**, а не тест: тот же мутатор можно отдать в Studio как «проверь устойчивость своего воркфлоу» и в eval-датасеты как источник негативных примеров.

---

## 6. Линт и формат

### Вердикт: **Biome 2.5.13 — форматтер + линтер для всего репозитория. ESLint оставляем ТОЛЬКО в `apps/studio` и только ради `eslint-plugin-react-hooks` + `eslint-config-next`.**

Проверено npm 2026-09-11: `@biomejs/biome@2.5.13` (MIT OR Apache-2.0, публикация 2026-09-10), `eslint@10.10.0`, `prettier@3.9.6`, `typescript-eslint@8.70.0`.

Аргументы за Biome именно у нас:

1. **Biome 2 делает type-aware линт без компилятора TypeScript** — свой мультифайловый скан-индекс вместо `ts.Program`. Это снимает блокирующую зависимость: `typescript-eslint@8.70.0` имеет peer `typescript ">=4.8.4 <6.1.0"` и физически не даст нам двигаться к TS 7 (§3.0). Biome такого потолка не ставит.
2. Один бинарник вместо `eslint + prettier + typescript-eslint + 8 плагинов + eslint-config-prettier`. На 12 пакетах это разница «lint за секунды» против «lint за минуты», и Turbo-кэш тут не спасёт: линт часто инвалидируется.
3. **Монорепо-конфиг из коробки (Biome 2):** вложенные `biome.json` с `"root": false` / `"extends": "//"` — наследование без относительных путей.
4. Ревамп организатора импортов: слияние импортов из одного модуля, настраиваемые группы — это то, что ESLint требовал через `eslint-plugin-import-x` + `simple-import-sort`.

Честное ограничение, которое надо принять: **type-aware правила Biome слабее**. По собственным замерам Biome `noFloatingPromises` ловит ~75% случаев относительно `typescript-eslint`. Для нас это терпимо, потому что наши главные инварианты — **не правила линтера**, а правила компилятора `R-<номер>` и тесты. Но «плавающий промис» — реальный класс багов в рантайм-обвязке, поэтому митигация: `noFloatingPromises` включён в Biome **и** в `apps/mcp` держим `await`-дисциплину через типы (`ResultAsync` возвращается всегда, void-функций с побочными эффектами в ядре нет).

### biome.json (корень)

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
      "complexity": { "noExcessiveCognitiveComplexity": { "level": "error", "options": { "maxAllowedComplexity": 10 } } },
      "suspicious": { "noExplicitAny": "error", "noFloatingPromises": "error" },
      "style": {
        "noNonNullAssertion": "error",
        "useConsistentArrayType": { "level": "error", "options": { "syntax": "shorthand" } },
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": {
              "@wf/compiler/src": "Импорт мимо публичного входа пакета запрещён.",
              "ai": "Провайдеры только через @wf/providers."
            }
          }
        }
      }
    }
  }
}
```

`noExcessiveCognitiveComplexity: 10` — это машинная реализация требования «не вкладывать if/else». Оно ловит именно вложенность, а не длину, и заставляет выносить ветки в чистые функции (что совпадает с `switch + assertNever` из §3.3).

Во вложенном `apps/studio/biome.json`: `{ "root": false, "extends": "//" }` плюс локальные послабления для JSX.

### Что остаётся ESLint

Только `apps/studio/eslint.config.mjs` (flat) с `eslint-plugin-react-hooks` (правила хуков Biome покрывает не полностью) и `eslint-config-next`. **Prettier не ставим вообще** — форматирует Biome, включая JSX и CSS; `eslint-config-prettier` тогда не нужен.

### Граница «правило компилятора vs правило линтера»

Линтер отвечает за стиль и механические ошибки в **нашем** коде. Всё, что про **пользовательский воркфлоу**, — это `R-<номер>` в `packages/compiler` с кодом ошибки, сообщением и `candidates` (§9). Линтер не должен «знать» про IR, а компилятор не должен ругаться на форматирование. Тест, который это защищает: реестр правил `R-*` и реестр правил Biome не пересекаются по кодам, а каждое `R-*` имеет хотя бы один мутант (§5.3).

---

## 7. CI на GitHub Actions

Принципы: (1) один прогон устанавливает зависимости и греет Turbo-кэш, остальные его переиспользуют; (2) тяжёлое и денежное (mutation, evals) — не в PR-гейте; (3) конформанс-гейт блокирующий и всегда.

```yaml
# .github/workflows/ci.yml
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
  # self-hosted remote cache; при использовании Vercel Remote Cache — TURBO_TOKEN/TURBO_TEAM
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
        with: { fetch-depth: 0 }          # нужен для turbo --filter=...[origin/main]
      - uses: pnpm/setup@v1               # pnpm 11+ ; для pnpm<=10 — pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with: { node-version: "${{ matrix.node }}", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - name: turbo cache
        uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ matrix.node }}-${{ github.sha }}
          restore-keys: turbo-${{ matrix.node }}-
      - run: pnpm biome ci .
      - run: pnpm turbo run typecheck build test --cache-dir=.turbo
      - name: coverage summary
        if: matrix.node == '24'
        uses: actions/upload-artifact@v4
        with: { name: coverage, path: coverage/ }

  tsgo:
    name: typecheck (TS 7 preview, non-blocking)
    runs-on: ubuntu-latest
    continue-on-error: true
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/setup@v1
      - uses: actions/setup-node@v6
        with: { node-version: "24", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm dlx typescript@7 tsgo --noEmit -p tsconfig.json

  conformance:
    name: conformance + IR mutants (kill-criterion 18.1)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/setup@v1
      - uses: actions/setup-node@v6
        with: { node-version: "24", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run build --filter=@wf/compiler...
      - name: run IR mutants
        run: pnpm --filter @wf/conformance run test:conformance
        env: { FC_SEED: ${{ github.run_id }} }
      - name: gate — zero survivors, >= 50 mutants
        run: node scripts/gate-conformance.mjs conformance-report.json
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: conformance-report, path: conformance-report.json }

  integration:
    name: integration (postgres via testcontainers)
    runs-on: ubuntu-latest     # только Linux: на macOS-раннерах нет Docker
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/setup@v1
      - uses: actions/setup-node@v6
        with: { node-version: "24", cache: "pnpm" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm vitest run --project integration

  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/setup@v1
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
      - uses: pnpm/setup@v1
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
    name: evals (budgeted, manual/nightly)
    if: github.event_name == 'workflow_dispatch' || github.event_name == 'schedule'
    runs-on: ubuntu-latest
    timeout-minutes: 45
    environment: evals            # environment хранит ключи провайдеров + required reviewers
    concurrency: { group: evals, cancel-in-progress: false }   # НЕ отменять — деньги уже потрачены
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/setup@v1
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
    permissions: { contents: write, pull-requests: write, id-token: write }  # id-token -> npm provenance
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/setup@v1
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

### Детали, которые обычно ломаются

- **`fetch-depth: 0`** обязателен, если используете `turbo run test --filter=...[origin/main]` (фильтр по изменённым пакетам). Без полной истории Turbo не найдёт базу сравнения.
- **Кэш `.turbo` по `github.sha` + `restore-keys`** — классический «промах-с-восстановлением». Лучше сразу поднять **удалённый кэш** (self-hosted `TURBO_API` или Vercel), тогда `actions/cache` нужен только как резерв. `"remoteCache": { "signature": true }` + `TURBO_REMOTE_CACHE_SIGNATURE_KEY` защищает от подмены артефактов — для ядра доверия это не паранойя.
- **Секреты не попадают в хэш Turbo** — если задача их читает, она обязана быть `"cache": false` (в turbo.json у `eval` так и сделано). Иначе получите кэш-хит от прогона с другим ключом.
- **`concurrency` у evals без `cancel-in-progress`** — отменённый прогон evals уже потратил деньги; отмена только теряет отчёт.
- **`environment: evals`** даёт required reviewers на трату бюджета и изолирует ключи провайдеров от PR-прогонов форков.
- Пин actions по SHA (`actions/checkout@<sha> # v6`) — обязателен, если репозиторий станет публичным; tag-пин мутируем.

### Changesets для версии формата бандла

`@changesets/cli@3.0.2` (MIT, публикация 2026-09-04). Конфиг:
```jsonc
// .changeset/config.json
{
  "$schema": "https://unpkg.com/@changesets/config/schema.json",
  "changelog": ["@changesets/changelog-github", { "repo": "org/ai-workflows" }],
  "commit": false,
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "linked": [["@wf/ir", "@wf/compiler", "@wf/export"]],
  "ignore": ["studio", "@wf/conformance"]
}
```

- **`linked`** для `ir + compiler + export` — эти три пакета определяют формат бандла и обязаны иметь одну версию. Это техническая реализация kill-критерия №13 (round-trip): бандл, помеченный версией `X`, читается ровно связкой версии `X`.
- В самом бандле держим отдельное поле `formatVersion` (целое, не semver), а в репозитории — тест: `formatVersion` меняется **только** вместе с major-changeset у `@wf/ir`, и на каждый `formatVersion` в `packages/conformance/fixtures/` лежит бандл, который обязан читаться текущим кодом (тест обратной совместимости чтения).
- `ignore` для `studio` и `conformance` — они не публикуются, версии им не нужны.
- Гейт в PR: `pnpm changeset status --since=origin/main` падает, если тронут публикуемый пакет без changeset-а.

---

## Сводка вердиктов

| Вопрос | Вердикт | Главный аргумент |
|---|---|---|
| Монорепо | pnpm 12 workspaces + Turborepo 2.10.12 | Нулевая инвазия, читаемость для агента; Nx окупается от ~30 пакетов |
| Сборка | tsdown 0.23 (пин точной версии) | tsup не поддерживается с 2025-11; tsdown — официальный преемник от Rolldown |
| CJS | Нет (кроме одного entry в `@wf/export`) | dual-package hazard ломает branded types молча |
| TypeScript | **6.0.3** как источник истины, TS 7 (tsgo) — non-blocking job | `typescript-eslint@8.70` peer `<6.1.0`; у TS 7.0 нет стабильного API до 7.1 |
| Исчерпываемость | `switch` + `assertNever`; ts-pattern только в `@wf/compiler` | Даёт kill-критерий №6 бесплатно |
| Ошибки | Домен — размеченные объединения; I/O — true-myth 9.4; **Effect — нет** | Компилятор собирает список диагностик, а не короткозамыкается |
| Тесты | Vitest 5.0 (`projects`), Playwright 1.63, testcontainers 12.1, fast-check 4.10 | Node >=22.12, Vite >=6.4 |
| Мутации | **Свой IR-мутатор = kill-критерий №1**; Stryker 10 — nightly, только ядро | Stryker мутирует наш код, спека требует мутировать IR |
| Линт | Biome 2.5.13; ESLint только в `apps/studio` | Biome не привязан к потолку версии TS |
| CI | Матрица Node 22.12/24, remote cache, блокирующий conformance, evals за `environment` | Деньги и время — вне PR-гейта |

## Открытые TODO
- UNVERIFIED: дата выхода TypeScript 7.1 со стабильным программным API — от этого зависит план перехода.
- UNVERIFIED: точное имя/версия экшена `pnpm/setup@v1` для pnpm 12 (документация pnpm упоминает его как замену `pnpm/action-setup` для pnpm 11+); перед внедрением проверить README репозитория pnpm/action-setup.
- Не проверено вживую: работает ли `@stryker-mutator/typescript-checker@10` на `isolatedDeclarations` + `erasableSyntaxOnly` без ложных «не компилируется».
- Проверено (probe-fe): tsdown 0.23 выбирает генератор dts автоматически — `oxc` при `isolatedDeclarations`, `tsgo` при TypeScript 7. Осталось проверить вживую, что `oxc`-генератор переваривает наши re-export'ы `z.infer<typeof X>` из Zod 4 (isolated declarations и инференс из Zod исторически конфликтуют — это главный технический риск связки `isolatedDeclarations` + Zod, требует спайка на одном пакете).
