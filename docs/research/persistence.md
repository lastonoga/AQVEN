# Хранилище (Postgres) и слой доступа

Статус секций: TODO = не начато, WIP = в работе, DONE = закрыто.

- [x] 1. Drizzle 0.45 / drizzle-kit 0.31 + сравнение с Prisma 7 и Kysely — DONE
- [x] 2. Схема БД — DONE
- [x] 3. Большие блобы — DONE
- [x] 4. pgvector — DONE
- [x] 5. Мультитенантность — DONE
- [x] 6. Локальная разработка — DONE

---

## 1. Drizzle ORM 0.45.2 + drizzle-kit 0.31.10 — реальный API. DONE

Источник: реально установленные пакеты в
`/private/tmp/claude-501/-Users-kirunya-Projects-my-ai-workflows-automate/f7b68ecb-d2f6-4f40-91f0-83ca8b26df64/scratchpad/probe/node_modules/drizzle-orm|drizzle-kit`.
`npm i drizzle-orm@0.45.2 drizzle-kit@0.31.10 pg` ставится в то же дерево, что VoltAgent 2.10 + ai@6,
без ERESOLVE — конфликтов peer-зависимостей нет (у drizzle-orm все драйверы в `peerDependenciesMeta.optional`).

### Версии и лицензии (npm view, 2026-09-11)

| Пакет | Версия | Лицензия | time.modified |
|---|---|---|---|
| drizzle-orm | 0.45.2 | **Apache-2.0** | 2026-09-09 |
| drizzle-kit | 0.31.10 | **MIT** | 2026-09-09 |
| pg (node-postgres) | 8.23.0 | MIT | 2026-08-08 |
| @prisma/client | 7.10.0 (prisma CLI stable 7.x; в npm dist-tag latest уже `prisma@8.0.0-rc.13`) | Apache-2.0 | 2026-09-01 / 2026-09-11 |
| kysely | 0.29.5 | MIT | 2026-08-10 |
| kysely-ctl (миграции для Kysely) | 0.21.0 | MIT | 2026-05-10 |
| pgvector (JS-хелпер) | 0.3.0 | MIT | 2026-05-31 |
| testcontainers / @testcontainers/postgresql | 12.1.0 | MIT | 2026-08-04 |

Все живые, риска «заброшено» нет ни у кого. Ближе всех к границе — kysely-ctl (4 месяца, ок).

### Что подтверждено в .d.ts (не по памяти)

**Колонки.** `node_modules/drizzle-orm/pg-core/columns/` — полный набор pg-типов файлами:
`jsonb`, `json`, `uuid`, `timestamp`, `numeric`, `bigint`, `bigserial`, `cidr`, `interval`,
`vector` (см. §4), `custom` и др.

`jsonb.d.ts` (дословно):
```ts
export declare function jsonb(): PgJsonbBuilderInitial<''>;
export declare function jsonb<TName extends string>(name: TName): PgJsonbBuilderInitial<TName>;
// data: unknown, driverParam: unknown; mapToDriverValue(value) => string (JSON.stringify)
```
Важно: базовый `data` — `unknown`. Типизация делается через `.$type<T>()`:
`jsonb('ir').$type<WorkflowIR>().notNull()`. Это **чистый compile-time каст, без рантайм-валидации**
— валидация IR остаётся на Zod 4 в слое домена. Это ровно то, что нам нужно (одно место правды),
но надо явно написать в доке, чтобы никто не думал, что БД проверит форму JSON.

**Custom types.** `pg-core/columns/custom.d.ts`:
```ts
customType<{ data: T; driverData?: D; config?: Record<string, any>; configRequired?: boolean;
             notNull?: boolean; default?: boolean }>({
  dataType(config) { return 'sql type string' },
  toDriver(value) {...}, fromDriver(value) {...}
})
```
Нужен нам для `tstzrange`, `citext`, `ltree` и (если не хватит встроенного `vector`) для `halfvec`.

**Транзакции.** `pg-core/db.d.ts:281` и `node-postgres/session.d.ts:50`:
```ts
transaction<T>(fn: (tx: PgTransaction<...>) => Promise<T>, config?: PgTransactionConfig): Promise<T>;
// PgTransactionConfig (pg-core/session.d.ts:31):
interface PgTransactionConfig {
  isolationLevel?: 'read uncommitted'|'read committed'|'repeatable read'|'serializable';
  accessMode?: 'read only'|'read write';
  deferrable?: boolean;
}
```
Вложенные транзакции есть (`NodePgTransaction.transaction(...)` — savepoints), `tx.rollback()` кидает
исключение-сигнал. `serializable` понадобится для «занять следующий run из очереди» и для
compare-and-swap версий спеки.

**Prepared statements.** `query-builders/select.d.ts:607` и `insert.d.ts:173`: `prepare(name: string)`.
Плюс плейсхолдеры `sql.placeholder('id')`. Для горячего пути `run_nodes`/`checkpoints` это даёт
серверный PREPARE у pg — прямой выигрыш на высокочастотной записи. У Prisma аналога с таким контролем нет.

**Индексы** — `pg-core/indexes.d.ts`, дословно:
```ts
export type PgIndexMethod = 'btree'|'hash'|'gist'|'spgist'|'gin'|'brin'|'hnsw'|'ivfflat'|(string & {});
export type PgIndexOpClass = ... 'jsonb_ops' ... 'vector_l2_ops'|'vector_ip_ops'|'vector_cosine_ops'
                             |'vector_l1_ops'|'bit_hamming_ops'|'halfvec_l2_ops'|...
index('name').using('brin', t.createdAt)          // BRIN есть нативно
index().using('hnsw', t.embedding.op('vector_cosine_ops')).with({ m: 16, ef_construction: 64 })
index().on(...).where(sql`...`)                    // partial
index().concurrently()                             // CREATE INDEX CONCURRENTLY
```
Это закрывает всё, что нам нужно по §2 и §4 **без сырого SQL** — редкий случай, когда ORM реально
покрывает pg-специфику.

**Multi-schema.** `pg-core/schema.d.ts`: `pgSchema('tenant_x')` → `.table()`, `.enum()`, `.sequence()`,
`.view()`, `.materializedView()`. Значит schema-per-tenant технически возможен (см. §5), но схемы
статичны в коде — динамическое создание схемы под нового тенанта потребует генерации/сырого SQL.

**RLS — из коробки.** `pg-core/policies.d.ts` и `roles.d.ts`:
```ts
pgPolicy(name, { as?: 'permissive'|'restrictive', for?: 'all'|'select'|'insert'|'update'|'delete',
                 to?: 'public'|'current_role'|'current_user'|'session_user'|PgRole|string|[],
                 using?: SQL, withCheck?: SQL })
pgRole(name, { createDb?, createRole?, inherit? }).existing()
```
drizzle-kit генерирует политики и роли в миграции (`entities.roles` в конфиге). Это сильный аргумент
за Drizzle в нашем профиле — см. §5.

**Relations.** В 0.45 живёт **v1 API**: `relations(table, ({ one, many }) => ({...}))` из
`drizzle-orm/relations.d.ts:173` + relational query API `db.query.x.findMany({ with: {...} })`.
`defineRelations` (Relations v2) в этой версии **не экспортируется** — файла/символа нет.
UNVERIFIED: v2 анонсирован в ветке 1.0; на 0.45.2 планировать надо на v1.

**Прочее, что пригодится:** `db.$count(table, filter)` (db.d.ts:69), `db.$with()` CTE,
`db.execute(sql\`...\`)` для сырого SQL, `generatedAlwaysAs(...)` (генерируемые колонки — полезно
для вытаскивания скалярных полей из jsonb в индексируемый столбец),
`refreshMaterializedView(view)`, встроенный кеш-слой `drizzle-orm/cache/core|upstash`.

### drizzle-kit: конфиг (дословный тип, `drizzle-kit/index.d.mts:112`)

```ts
type Config = {
  dialect: Dialect; out?: string; schema?: string|string[];
  breakpoints?: boolean;                       // ставить --> statement-breakpoint
  tablesFilter?: string|string[];
  extensionsFilters?: 'postgis'[];
  schemaFilter?: string|string[];              // многосхемность при introspect/push
  verbose?: boolean; strict?: boolean;
  casing?: 'camelCase'|'snake_case';
  migrations?: { table?: string; schema?: string; prefix?: Prefix };
  introspect?: { casing: 'camel'|'preserve' };
  entities?: { roles?: boolean | { provider?: 'supabase'|'neon'|string; exclude?: string[]; include?: string[] } };
} & ({ dialect; dbCredentials } | ...)
```
Команды: `generate` (SQL-файлы в `out/`, версионируются в git), `migrate` (применить),
`push` (напрямую синхронизировать — только dev), `studio`, `pull`/`introspect`, `check`, `up`.

**Подводные камни drizzle-kit, которые надо записать в доку:**
1. `generate` — это диффер по снапшотам (`out/meta/_journal.json` + `NNNN_snapshot.json`). Снапшоты
   **обязаны лежать в git**; при мердже двух веток с миграциями журнал конфликтует и его чинят руками.
2. Диффер не понимает переименований без подсказки — в интерактиве спрашивает
   «renamed or created?». В CI (`--config` без tty) это надо ловить: генерируем миграции только локально,
   в CI — `drizzle-kit check` + `migrate`.
3. Партиционирование, TOAST-настройки (`ALTER TABLE ... SET STORAGE`), `CREATE EXTENSION`, триггеры,
   `ALTER DEFAULT PRIVILEGES` — **не в модели**. Пишем руками в кастомную миграцию
   (`drizzle-kit generate --custom --name=...` создаёт пустой .sql). Для нас это §2 (партиции run_nodes)
   и §4 (`CREATE EXTENSION vector`) — значит миграции всё равно частично ручные, и это нормально.
4. `push` ломает данные на проде — в доке запретить вне dev.
5. `migrate` не умеет откат (down-миграций нет вообще). Политика: только forward-only + expand/contract.

### Вердикт: **Drizzle ORM 0.45 + drizzle-kit**. Обоснование под наш профиль

Профиль: много JSONB, неизменяемые версии (append-only), высокочастотная запись чекпоинтов/шагов,
pgvector, RLS для будущего SaaS, партиционирование по времени.

| Критерий | Drizzle 0.45 | Prisma 7 | Kysely 0.29 |
|---|---|---|---|
| JSONB с типом TS | `.$type<T>()`, compile-time | `Json`/`JsonValue`, типизация слабее, нужен каст | `JSONColumnType<T>` в интерфейсе БД, хорошо |
| Индексы GIN/BRIN/HNSW из схемы | **да, нативно** (`.using('brin'/'hnsw')`, opclass, `.with({m,ef_construction})`) | нет, только `@@index(type: Gin)` частично; HNSW/opclass — сырой SQL | нет схемы вообще → всё сырым SQL в миграциях |
| RLS / policies / roles в схеме | **да** (`pgPolicy`, `pgRole`, kit генерирует) | частично (preview `postgresqlExtensions`/`rls`) | нет |
| Партиционирование | руками в custom-миграции | руками | руками |
| prepared statements, контроль SQL | полный, `prepare(name)` + плейсхолдеры | скрыт за движком | полный |
| Оверхед на запись | тонкий слой поверх `pg`, один round-trip | до 7.x был Rust-движок; в 7 — TS-движок, но всё равно слой | минимальный |
| Миграции | свои, forward-only, снапшоты | зрелые, лучший DX, но свой DSL (.prisma) | внешний kysely-ctl |
| Совместимость с VoltAgent 2.10 | ставится рядом, конфликтов нет | конфликтов нет, но второй источник правды о схеме | конфликтов нет |
| Bundle/edge | ок | тяжелее | легчайший |

Решающие доводы:
- **HNSW/BRIN/GIN + opclass прямо в TS-схеме** — у нас минимум три таких индекса, и держать их
  вне модели значит, что diff-миграции их затрут.
- **pgPolicy/pgRole** — закладка под SaaS (§5) без второго инструмента.
- **Один язык схемы = TS**, тот же, на котором описан IR; Zod-схемы и Drizzle-таблицы живут рядом,
  `drizzle-zod` даёт мост (UNVERIFIED: не ставил, версию не проверял).
- Prisma отпадает не из-за качества, а из-за второго DSL и слабого контроля над pg-специфичным
  DDL, которого у нас много. Дополнительный риск: в npm `latest` у `prisma` сейчас `8.0.0-rc.13` —
  мажор на подходе, брать на старте проекта мажор-в-RC не хочется.
- Kysely отпадает как **единственный** слой: нет декларативной схемы → миграции целиком руками.
  Но Kysely — хороший второй инструмент, если понадобятся сложные аналитические запросы;
  Drizzle это закрывает через `db.execute(sql\`\`)`, так что на v1 второй библиотеки не берём.

---

## 1b. КРИТИЧНО: что `@voltagent/postgres` 2.1.3 сам создаёт в нашей базе

Спека §«Хранилище» (00-source-spec.ru.md:1519) говорит: история исполнений и память VoltAgent —
через `@voltagent/postgres`, наши таблицы — в той же базе. Проверено по
`node_modules/@voltagent/postgres/dist/index.js` (dist, не по памяти).

Опции адаптера (`dist/index.d.ts`): `connection` (строка URL или объект), `tablePrefix`,
**`schema?: string`** («PostgreSQL schema to use for all tables»), `maxConnections` (по умолчанию 10),
опциональный `searchPath` на соединение.
Дефолты префиксов: `tablePrefix = "voltagent_memory"` (память) и `"voltagent_vector"` (векторы).

DDL, который адаптер выполняет сам (`CREATE TABLE IF NOT EXISTS`, дословно):

```sql
${prefix}_users          (id TEXT PK, metadata JSONB, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
${prefix}_conversations  (id TEXT PK, resource_id TEXT NOT NULL, user_id TEXT NOT NULL, title TEXT NOT NULL,
                          metadata JSONB NOT NULL, created_at, updated_at)
${prefix}_messages       (conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
                          message_id TEXT, user_id TEXT, role TEXT, parts JSONB, metadata JSONB,
                          format_version INTEGER DEFAULT 2, created_at,
                          PRIMARY KEY (conversation_id, message_id))
${prefix}_workflow_states(id TEXT PK, workflow_id TEXT, workflow_name TEXT, status TEXT,
                          input JSONB, context JSONB, workflow_state JSONB, suspension JSONB,
                          events JSONB, output JSONB, cancellation JSONB,
                          user_id TEXT, conversation_id TEXT, metadata JSONB, created_at, updated_at)
${prefix}_steps          (id TEXT PK, conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
                          user_id TEXT, agent_id TEXT, agent_name TEXT, operation_id TEXT,
                          step_index INTEGER, type TEXT, role TEXT, content TEXT,
                          arguments JSONB, result JSONB, usage JSONB,
                          sub_agent_id TEXT, sub_agent_name TEXT, created_at)
${vectorPrefix}_...      (id TEXT PK, vector BYTEA NOT NULL, dimensions INTEGER NOT NULL,
                          metadata JSONB, content TEXT, created_at, updated_at)
```

**Следствия для нашей архитектуры (записать в доку явно):**
1. **Два владельца схемы в одной БД.** VoltAgent делает `CREATE TABLE IF NOT EXISTS` в рантайме,
   drizzle-kit — версионированные миграции. Мешать их в одной схеме нельзя: drizzle-kit при
   `generate`/`push` увидит чужие таблицы как «лишние» и предложит их снести.
   **Решение: `schema: 'voltagent'` в опциях адаптера + `schemaFilter: ['app']` в drizzle.config.ts.**
   Наши таблицы — в схеме `app`, VoltAgent — в `voltagent`. Схему `voltagent` создаём миграцией
   (`CREATE SCHEMA IF NOT EXISTS voltagent`) до старта приложения; адаптер сам схему не создаёт
   (UNVERIFIED: проверял только `CREATE TABLE`, `CREATE SCHEMA` в dist не искал).
2. `workflow_states.workflow_state` / `suspension` — то, что мы уже описали в §«Workflow state»
   лида: чекпоинты suspend/resume живут ТАМ, а не у нас. Наша таблица `checkpoints` — про другое
   (наши снимки для time-travel/replay), дублировать не надо, надо связать по `executionId`.
3. `${prefix}_workflow_states.id` — TEXT (это `executionId`). Все наши FK на исполнение держим как
   `text execution_id`, **без настоящего FK** через границу схемы (иначе миграции сцепятся с
   рантайм-DDL чужого пакета). Ссылочная целостность — логическая.
4. **Векторное хранилище VoltAgent — НЕ pgvector**: колонка `vector BYTEA`, поиск идёт как
   `SELECT id, vector, dimensions, metadata, content FROM <table>` (полный скан) и затем
   `cosineSimilarity` **в JS-процессе** (`dist/index.js:1523 async search(queryVector, options)`,
   опции `{limit=10, threshold=0, filter}`). Никаких HNSW/IVFFlat и никакого ANN.
   Это годится на сотни-тысячи векторов и разваливается на сотнях тысяч. См. §4.

---

## 2. Схема БД: наброски DDL. DONE

Все наши таблицы — в схеме `app` (см. §1b). Ниже DDL как SQL (это то, что реально уедет в
`drizzle-kit generate --custom` там, где Drizzle не умеет), рядом — как это выражается в Drizzle.

### Общие правила

- **PK — `uuid` со значением `uuidv7()`.** Подтверждено: PostgreSQL 18 добавил встроенную функцию
  `uuidv7()` (time-ordered UUID, Unix-время в мс + 12 бит субмиллисекундной части, монотонность в
  рамках сессии) и `uuid_extract_timestamp()` для v7; `uuidv4()` — алиас.
  Источник: https://www.postgresql.org/docs/release/18.0/ , https://www.postgresql.org/about/news/postgresql-18-released-3142/
  → v7 даёт локальность вставки в B-tree (нет random-IO как у v4) **и** корреляцию со временем,
  без которой BRIN бесполезен. Это ключ к §«высокочастотная запись».
  Для PG < 18 — расширение `pg_uuidv7` или генерация в приложении (`uuid` npm ≥ 11 умеет v7).
- **Время — `timestamptz`, всегда UTC.** Совпадает с тем, что делает `@voltagent/postgres`
  (`timezone('utc', now())`).
- **Деньги/стоимость — `numeric(18,8)`**, не float. Токены — `integer`/`bigint`.
- **Контентная адресация — `bytea` (32 байта sha256), не hex-текст.** В 2 раза компактнее, индекс
  меньше. В API отдаём hex через `encode(hash,'hex')`.
- **Неизменяемость** обеспечиваем не только дисциплиной: на `spec_versions`, `cassettes`, `journal`
  вешаем `REVOKE UPDATE, DELETE` для роли приложения (или BEFORE UPDATE триггер `RAISE EXCEPTION`).
  Drizzle это не выразит — custom-миграция.

### projects, specs, spec_versions (content-addressed)

```sql
CREATE TABLE app.projects (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id     uuid NOT NULL,                 -- см. §5
  slug          text NOT NULL,
  title         text NOT NULL,
  settings      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz,
  UNIQUE (tenant_id, slug)
);

-- "спека" = движущаяся ссылка (голова ветки); версии неизменяемы
CREATE TABLE app.specs (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  project_id    uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  kind          text NOT NULL,                 -- 'workflow' | 'component' | 'prompt' | 'brief'
  name          text NOT NULL,
  head_version  uuid,                          -- FK ставим отложенно (циклическая ссылка)
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, kind, name)
);

CREATE TABLE app.spec_versions (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  spec_id       uuid NOT NULL REFERENCES app.specs(id) ON DELETE CASCADE,
  version       integer NOT NULL,              -- монотонный номер внутри spec_id
  content_hash  bytea NOT NULL,                -- sha256 канонического JSON (JCS/RFC 8785)
  ir            jsonb NOT NULL,                -- сам IR
  parent_id     uuid REFERENCES app.spec_versions(id),
  compiled      jsonb,                         -- план/развёртка до примитивов
  diagnostics   jsonb NOT NULL DEFAULT '[]',
  author        text NOT NULL,                 -- 'claude' | user id
  message       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (spec_id, version),
  UNIQUE (spec_id, content_hash)               -- дедуп: повторная публикация того же контента
);
ALTER TABLE app.specs ADD CONSTRAINT specs_head_fk
  FOREIGN KEY (head_version) REFERENCES app.spec_versions(id) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX spec_versions_hash_idx ON app.spec_versions USING hash (content_hash);
CREATE INDEX spec_versions_ir_gin   ON app.spec_versions USING gin (ir jsonb_path_ops);
```
Публикация версии = одна транзакция `serializable`:
`INSERT ... ON CONFLICT (spec_id, content_hash) DO NOTHING RETURNING id` → если пусто, версия уже
есть, отдаём существующую (идемпотентность). `version` берём как
`(SELECT coalesce(max(version),0)+1 FROM spec_versions WHERE spec_id=$1)` внутри той же транзакции;
уникальный индекс `(spec_id, version)` ловит гонку, ретраим.

**Про `jsonb_path_ops` vs `jsonb_ops`:** `jsonb_path_ops` индекс в 2-3 раза меньше и быстрее, но
поддерживает только оператор `@>` (containment). Для «найти все воркфлоу, где есть узел типа X»
этого достаточно. Если нужны `?`/`?|`/`?&` (существование ключа) — тогда `jsonb_ops`.
В Drizzle: `index('...').using('gin', sql\`\${t.ir} jsonb_path_ops\`)`.

### components и реестры

```sql
CREATE TABLE app.components (              -- версионируемые переиспользуемые узлы/подграфы
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  project_id    uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  name          text NOT NULL,
  version       integer NOT NULL,
  contract      jsonb NOT NULL,              -- input/output JSON Schema + инварианты
  body          jsonb NOT NULL,              -- IR подграфа
  content_hash  bytea NOT NULL,
  status        text NOT NULL DEFAULT 'draft', -- draft|approved|deprecated
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name, version)
);

-- Реестры типов/профилей/агентов/тулов: ОДНА таблица с дискриминатором.
-- Почему одна: у всех одинаковый жизненный цикл (propose -> approve -> version -> deprecate),
-- одинаковый аудит и одинаковые MCP-ручки registry.propose_* (spec:1191). Четыре почти
-- одинаковых таблицы = четыре копии логики аппрува. Разделять — только если разойдутся индексы.
CREATE TABLE app.registry_entries (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  project_id    uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  kind          text NOT NULL,               -- 'type'|'profile'|'agent'|'tool'
  key           text NOT NULL,               -- стабильный идентификатор внутри kind
  version       integer NOT NULL,
  definition    jsonb NOT NULL,
  content_hash  bytea NOT NULL,
  status        text NOT NULL DEFAULT 'proposed', -- proposed|approved|rejected|deprecated
  proposed_by   text NOT NULL,
  approved_by   text,
  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, kind, key, version)
);
CREATE INDEX registry_active_idx ON app.registry_entries (project_id, kind, key)
  WHERE status = 'approved';                 -- partial index: горячий путь резолва
CREATE INDEX registry_def_gin ON app.registry_entries USING gin (definition jsonb_path_ops);
```

### runs и run_nodes — горячая запись

```sql
CREATE TABLE app.runs (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  project_id       uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  spec_version_id  uuid NOT NULL REFERENCES app.spec_versions(id),
  execution_id     text NOT NULL,            -- = voltagent.<prefix>_workflow_states.id, БЕЗ FK
  mode             text NOT NULL,            -- 'live'|'replay'|'experiment'|'dryrun'
  status           text NOT NULL,            -- running|suspended|completed|failed|cancelled
  input            jsonb NOT NULL,
  output           jsonb,
  error            jsonb,
  seed             bigint,
  cassette_id      uuid REFERENCES app.cassettes(id),
  budget           jsonb NOT NULL DEFAULT '{}',   -- лимиты и остаток
  cost_usd         numeric(18,8) NOT NULL DEFAULT 0,
  tokens_in        bigint NOT NULL DEFAULT 0,
  tokens_out       bigint NOT NULL DEFAULT 0,
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz
);
CREATE UNIQUE INDEX runs_execution_uidx ON app.runs (execution_id);
CREATE INDEX runs_project_started_idx ON app.runs (project_id, started_at DESC);
CREATE INDEX runs_active_idx ON app.runs (status, started_at) WHERE status IN ('running','suspended');
```

`run_nodes` — самая горячая таблица (запись на каждый шаг каждого узла, включая итерации циклов
и элементы foreach). **Партиционируем по времени (RANGE по `started_at`), помесячно.**

```sql
CREATE TABLE app.run_nodes (
  id            uuid NOT NULL DEFAULT uuidv7(),
  run_id        uuid NOT NULL,
  node_id       text NOT NULL,            -- ID узла в IR
  attempt       integer NOT NULL DEFAULT 0,
  iteration     integer NOT NULL DEFAULT 0,   -- номер итерации цикла/индекс foreach
  parent_span   text,                          -- OTel span id для склейки с трассой
  status        text NOT NULL,
  input_ref     jsonb NOT NULL,                -- либо значение, либо {blob_id} (см. §3)
  output_ref    jsonb,
  provenance    jsonb NOT NULL DEFAULT '{}',   -- откуда взялось каждое поле входа
  model         text, profile text,
  tokens_in     integer, tokens_out integer,
  cost_usd      numeric(18,8),
  latency_ms    integer,
  error         jsonb,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  PRIMARY KEY (started_at, id)               -- ключ партиционирования обязан входить в PK
) PARTITION BY RANGE (started_at);

-- BRIN на времени: таблица append-only и физически упорядочена по времени => корреляция ~1.
-- BRIN здесь в сотни раз меньше btree и покрывает "все шаги за окно".
CREATE INDEX run_nodes_time_brin ON app.run_nodes USING brin (started_at)
  WITH (pages_per_range = 32, autosummarize = on);
-- Главный горячий доступ - "все узлы одного run": btree.
CREATE INDEX run_nodes_run_idx ON app.run_nodes (run_id, node_id, iteration, attempt);
```

Партиции создаём заранее — **`pg_partman` (BSD-3), либо cron-джоб на 20 строк SQL**. Для v1 хватает
джоба «создать партиции на 3 месяца вперёд, отцепить старше N»; pg_partman берём, когда появится
retention-политика и `DETACH CONCURRENTLY`. Не изобретаем: `pg_partman` — живой, в составе
большинства образов/облаков.
**UNVERIFIED:** версию pg_partman и наличие его в docker-образе `pgvector/pgvector` не проверял.

**Порог, когда партиционирование реально нужно:** до ~50-100 млн строк в `run_nodes` обычный
BRIN+btree справляется. Партиции берём ради дешёвого **удаления** (`DROP PARTITION` вместо
`DELETE` + VACUUM) и ради того, чтобы autovacuum работал по частям. Т.е. вводим сразу — ретрофит
партиционирования живой таблицы дороже.

**Батчинг записи (иначе high-write убьёт нас не размером, а числом round-trip):**
не `INSERT` на каждый шаг, а очередь в памяти + flush пачкой 50-200 строк через
`INSERT ... VALUES (...), (...)` или `COPY FROM STDIN` (у `pg` — `pg-copy-streams`).
Flush по таймеру (100-250 мс) или по размеру. На `onStepEnd` (хук VoltAgent) кладём в очередь,
не ждём БД. Потеря хвоста при падении процесса компенсируется тем, что источник правды о статусе
исполнения — `voltagent_memory_workflow_states`, а `run_nodes` — наблюдаемость.
**UNVERIFIED:** `pg-copy-streams` не ставил, версию не проверял.

### checkpoints

```sql
CREATE TABLE app.checkpoints (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  run_id        uuid NOT NULL REFERENCES app.runs(id) ON DELETE CASCADE,
  seq           integer NOT NULL,
  node_id       text NOT NULL,
  kind          text NOT NULL,          -- 'step'|'suspend'|'manual'
  state         jsonb NOT NULL,         -- снимок workflow state (наш, для time-travel/replay)
  state_hash    bytea NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, seq)
);
CREATE INDEX checkpoints_time_brin ON app.checkpoints USING brin (created_at);
```
Дедупликация: одинаковые `state_hash` между соседними чекпоинтами — не пишем новый, инкрементим
счётчик. Если состояние большое (см. §3), пишем **дельту** (RFC 6902 JSON Patch) от последнего
полного снимка, полный снимок — каждые N шагов. Библиотека для дельт: `fast-json-patch` (MIT) или
`rfc6902`. **UNVERIFIED:** версии/свежесть не проверял.

### datasets, experiments, scores

```sql
CREATE TABLE app.datasets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  project_id uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  name text NOT NULL, version integer NOT NULL,
  node_id text,                          -- датасет привязан к узлу (spec:1222)
  schema jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name, version)
);
CREATE TABLE app.dataset_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  dataset_id uuid NOT NULL REFERENCES app.datasets(id) ON DELETE CASCADE,
  split text NOT NULL DEFAULT 'train',   -- train|dev|test
  input jsonb NOT NULL,
  expected jsonb,
  labels jsonb NOT NULL DEFAULT '{}',
  source_run_id uuid,                    -- dataset.add_from_run (spec:1193)
  content_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, content_hash)      -- дедуп кейсов
);
CREATE INDEX dataset_items_split_idx ON app.dataset_items (dataset_id, split);

CREATE TABLE app.experiments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  project_id uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  dataset_id uuid NOT NULL REFERENCES app.datasets(id),
  spec_version_id uuid NOT NULL REFERENCES app.spec_versions(id),
  node_id text,
  matrix jsonb NOT NULL,                 -- модели/параметры (experiment.model_matrix, spec:1168)
  status text NOT NULL,
  summary jsonb,                         -- агрегаты, граница Парето
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE TABLE app.scores (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  experiment_id uuid NOT NULL REFERENCES app.experiments(id) ON DELETE CASCADE,
  dataset_item_id uuid NOT NULL REFERENCES app.dataset_items(id),
  run_id uuid,
  scorer text NOT NULL,                  -- ключ скорера/судьи
  value double precision,
  passed boolean,
  detail jsonb,
  cost_usd numeric(18,8),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scores_exp_idx ON app.scores (experiment_id, scorer, dataset_item_id);
```

### cassettes, journal, model_catalog

```sql
-- Кассета = набор записанных ответов, адресуемых по хэшу нормализованного запроса (spec:1322)
CREATE TABLE app.cassettes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  project_id uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  name text NOT NULL, version integer NOT NULL,
  source_run_id uuid,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name, version)
);
CREATE TABLE app.cassette_entries (
  cassette_id uuid NOT NULL REFERENCES app.cassettes(id) ON DELETE CASCADE,
  request_hash bytea NOT NULL,           -- sha256 нормализованного запроса
  kind text NOT NULL,                    -- 'model'|'tool'|'human'
  request jsonb NOT NULL,                -- нормализованный запрос (для отладки промаха)
  response_ref jsonb NOT NULL,           -- значение или {blob_id} (§3)
  seq integer NOT NULL,                  -- порядок записи; нужен для последовательных повторов
  PRIMARY KEY (cassette_id, request_hash, seq)
);
```
Ключевое решение: PK `(cassette_id, request_hash, seq)`, а не `(cassette_id, request_hash)` —
один и тот же промпт может вызываться несколько раз с разными ответами (цикл-ревизор), и реплей
обязан отдавать их по порядку. Это ровно то, что ломает наивные VCR-реализации.

```sql
CREATE TABLE app.journal (                 -- журнал решений (spec:1195, 1225)
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  project_id uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  kind text NOT NULL,                      -- decision|approval|incident|note
  title text NOT NULL,
  body text NOT NULL,                      -- markdown
  refs jsonb NOT NULL DEFAULT '[]',        -- ссылки на spec_version/run/experiment
  author text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journal_fts ON app.journal USING gin (to_tsvector('simple', title || ' ' || body));
CREATE INDEX journal_time_brin ON app.journal USING brin (created_at);

-- Снимок каталога моделей (spec: providers/), сам по себе версионируется
CREATE TABLE app.model_catalog (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  snapshot_at timestamptz NOT NULL,
  provider text NOT NULL,                  -- 'openrouter'|'anthropic'|...
  model_id text NOT NULL,
  display_name text,
  context_length integer,
  modalities jsonb NOT NULL DEFAULT '{}',
  capabilities jsonb NOT NULL DEFAULT '{}',-- tools, json_mode, reasoning...
  price_in  numeric(18,10),                -- $/токен, как отдаёт OpenRouter
  price_out numeric(18,10),
  raw jsonb NOT NULL,                      -- сырой ответ провайдера
  UNIQUE (snapshot_at, provider, model_id)
);
CREATE INDEX model_catalog_lookup ON app.model_catalog (provider, model_id, snapshot_at DESC);
```
`model_catalog` держим как **срезы во времени**, а не «текущее состояние»: воспроизводимость
требует знать, какие цены/лимиты действовали на момент прогона. `runs.budget` ссылается на
конкретный `snapshot_at`.

### Сводка по индексной стратегии

| Таблица | Основной индекс | Дополнительно |
|---|---|---|
| spec_versions | btree (spec_id, version) | hash(content_hash), gin(ir jsonb_path_ops) |
| registry_entries | partial btree WHERE status='approved' | gin(definition jsonb_path_ops) |
| runs | btree (project_id, started_at DESC) | unique(execution_id), partial по активным |
| run_nodes | btree (run_id, node_id, iteration, attempt) | **BRIN(started_at)**, партиции по месяцам |
| checkpoints | unique (run_id, seq) | BRIN(created_at) |
| cassette_entries | PK (cassette_id, request_hash, seq) | — |
| journal | GIN FTS | BRIN(created_at) |
| embeddings (§4) | HNSW | — |

**Когда BRIN, а когда btree:** BRIN выигрывает только при физической корреляции значения со
страницей. Это верно для append-only таблиц с временной колонкой (`run_nodes`, `checkpoints`,
`journal`) и **ломается**, если по таблице идут UPDATE (HOT-апдейты раскидывают строки).
`run_nodes.finished_at` мы дописываем UPDATE'ом — это уже риск. Альтернатива, которую стоит
записать: писать в `run_nodes` одну строку **после** завершения шага (а не start+update), тогда
таблица строго append-only и BRIN остаётся честным. Рекомендация: **одна запись на завершённый
шаг**, а «сейчас выполняется» держать в памяти/в workflow_states.

---

## 3. Большие блобы: jsonb+TOAST против S3/MinIO. DONE

### Как это реально работает в Postgres (матчасть, без которой порог берётся с потолка)

- Страница — 8 КБ. Значение, не влезающее в страницу, уходит в TOAST-таблицу
  (`pg_toast.pg_toast_<oid>`), порог срабатывания `TOAST_TUPLE_THRESHOLD` ≈ **2 КБ на кортеж**.
- `jsonb` по умолчанию `EXTENDED`: сначала сжатие (по умолчанию **pglz**; с PG14 доступен
  **lz4**, `ALTER TABLE ... ALTER COLUMN x SET COMPRESSION lz4` или `default_toast_compression=lz4`),
  потом вынос в TOAST чанками по ~2000 байт.
- **Главная цена: TOAST не поддерживает частичное чтение jsonb.** Любое обращение к полю
  (`->>`, `@>`) де-TOAST'ит и распаковывает значение **целиком**. Чтение одного поля из 5-мегабайтного
  jsonb стоит как чтение 5 МБ. Это и есть аргумент против «свалим всё в jsonb».
- Жёсткий предел значения — 1 ГБ, но практически всё разваливается на порядки раньше.
- Второй эффект: TOAST-таблица не входит в основную, поэтому `SELECT` без этих колонок дёшев.
  То есть **вред от больших jsonb локализуется, если не делать `SELECT *`**.

### Рекомендация и порог

**Правило трёх зон:**

| Размер значения | Куда | Почему |
|---|---|---|
| **< 8 КБ** | `jsonb` в строке | влезает/почти влезает в страницу, индексируется GIN, транзакционно |
| **8 КБ - 1 МБ** | `jsonb` в **отдельной таблице-сателлите** `app.blobs`, в горячей таблице — только `{blob_id}` | TOAST справляется, но не должен мешать сканам горячей таблицы |
| **> 1 МБ** | внешнее объектное хранилище (S3/MinIO), в БД — метаданные + ключ + sha256 | де-TOAST целиком становится дорогим; WAL-амплификация (каждая версия строки пишется в WAL целиком) |

Порог **1 МБ** — рабочая граница. Обоснование именно для нас: отрисованные промты обычно 2-50 КБ,
сырые ответы моделей 1-100 КБ, а вот **кассеты целого прогона** и мультимодальные вложения легко
дают мегабайты. Т.е. по факту: промты и ответы — в Postgres, кассеты целиком и артефакты — в S3.

```sql
CREATE TABLE app.blobs (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  project_id   uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  sha256       bytea NOT NULL,
  size_bytes   integer NOT NULL,
  media_type   text NOT NULL,
  storage      text NOT NULL,            -- 'inline' | 's3'
  inline_data  jsonb,                    -- storage='inline'
  s3_key       text,                     -- storage='s3'
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, sha256)            -- контентная адресация => дедуп «одинаковый промпт»
);
ALTER TABLE app.blobs ALTER COLUMN inline_data SET COMPRESSION lz4;
```
Дедуп по `sha256` — не украшение: в матрице моделей (`experiment.model_matrix`) один и тот же
отрисованный промт уходит в N моделей, храним один раз.

**Порог — конфиг, а не константа в коде** (`BLOB_INLINE_MAX_BYTES`, дефолт 1 МБ). Слой доступа
(`BlobStore`) прячет выбор: один интерфейс `put(bytes, meta) -> blobId` / `get(blobId)`, две
реализации, выбор по размеру. Это единственное место, где решение о хранилище знают.

**Что берём для S3, не изобретая:** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
(Apache-2.0) — работает и с MinIO (`forcePathStyle: true`, `endpoint: http://localhost:9000`).
**UNVERIFIED:** версии `@aws-sdk/client-s3` не проверял в этом заходе.

**На v1 можно НЕ поднимать MinIO:** реализовать `BlobStore` с бэкендом `postgres` и бэкендом `s3`,
включить `postgres` по умолчанию, а MinIO завести сразу в docker-compose (§6), чтобы путь был
проверен. Это дешевле, чем ретрофит.

**Чего точно НЕ делать:** Postgres Large Objects (`lo_*`, `pg_largeobject`). Они вне MVCC-логики
таблиц, требуют явного `lo_unlink` (иначе утечка), не реплицируются логической репликацией и
плохо дружат с ORM. Мёртвая ветка.

---

## 4. pgvector. DONE

### Версия и образ (проверено 2026-09-11)

- pgvector — последний тег **v0.8.6** (`gh api repos/pgvector/pgvector/tags`).
  У проекта на GitHub нет GitHub Releases, только теги — версию берём из тегов.
- Docker: **`pgvector/pgvector:0.8.6-pg18`** (и `...-pg18-trixie`), опубликован **2026-08-13**
  (Docker Hub API `/v2/repositories/pgvector/pgvector/tags`). Есть сборки под pg13...pg18,
  варианты bookworm/trixie. Живой проект, риска «заброшен» нет.
- JS-хелпер `pgvector@0.3.0` (MIT, 2026-05-31) — сериализация массива в формат `vector`;
  с Drizzle он **не нужен**, Drizzle умеет сам.

### Поддержка в Drizzle 0.45 (проверено в .d.ts)

`node_modules/drizzle-orm/pg-core/columns/vector_extension/` содержит **`vector.d.ts`,
`halfvec.d.ts`, `sparsevec.d.ts`, `bit.d.ts`** — то есть все типы pgvector 0.7+.
`vector('embedding', { dimensions: 1536 })`. Операторы расстояния и opclass'ы есть в
`pg-core/indexes.d.ts` (`vector_l2_ops`, `vector_ip_ops`, `vector_cosine_ops`, `vector_l1_ops`,
`halfvec_l2_ops`, `bit_hamming_ops`, `bit_jaccard_ops`) и методы `'hnsw' | 'ivfflat'`.

```ts
export const embeddings = appSchema.table('embeddings', {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  projectId: uuid().notNull(),
  kind: text().notNull(),                 // 'component'|'journal'|'dataset_item'|'doc'
  refId: uuid(),
  content: text().notNull(),
  embedding: vector({ dimensions: 1536 }).notNull(),
}, (t) => [
  index('embeddings_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops'))
    .with({ m: 16, ef_construction: 64 }),
  index('embeddings_scope').on(t.projectId, t.kind),
]);
```
`CREATE EXTENSION IF NOT EXISTS vector;` — руками в первой миграции
(`drizzle-kit generate --custom`), drizzle-kit расширения не создаёт.

### HNSW vs IVFFlat — как выбирать

| | HNSW | IVFFlat |
|---|---|---|
| Строится | без данных, инкрементально | **требует уже загруженных данных** (иначе плохие центроиды) |
| Recall/скорость | лучше на том же recall | хуже |
| Память | больше (граф в RAM) | меньше |
| Время построения | дольше | быстрее |
| Тюнинг | `m`, `ef_construction` (build), `hnsw.ef_search` (query) | `lists` (build), `ivfflat.probes` (query) |
| Поведение при дозаписи | деградирует мягко | деградирует, нужен REINDEX после роста |

**Вердикт для нас: HNSW, всегда.** У нас данные добавляются непрерывно (каждый журнал, каждый
компонент, каждый кейс), объёмы небольшие, а IVFFlat требует «сначала загрузи, потом индексируй» —
операционно неудобно. IVFFlat имеет смысл только при десятках миллионов векторов и дефиците RAM.
Старт: `m=16, ef_construction=64`, на запросе `SET hnsw.ef_search = 40..100` (крутим по recall).

**Важный подводный камень (пишем в доку):** фильтрация + ANN. Запрос вида
`WHERE project_id = $1 ORDER BY embedding <=> $2 LIMIT 10` при обычном HNSW сначала берёт top-k
по вектору, потом фильтрует → можно получить меньше 10 строк или мусор.
Лечится (а) итеративными сканами индекса — есть с pgvector **0.8.0**
(`hnsw.iterative_scan = strict_order|relaxed_order`), (б) **партиционированием таблицы embeddings
по `project_id`/`tenant_id`**, что у нас и так напрашивается из §5. Берём (а)+(б).
UNVERIFIED: точное поведение `iterative_scan` на 0.8.6 руками не воспроизводил, беру из
changelog-описания версии 0.8.0.

### Когда pgvector хватает и когда нужен Qdrant

pgvector **достаточно** при: до ~1-5 млн векторов на инстанс, обновления умеренные, нужна
транзакционность вместе с бизнес-данными (вектор и его источник в одной транзакции — у нас именно
так), нужен join с фильтрами по проекту/типу/времени.
Qdrant/выделенный ANN нужен при: десятки миллионов+ векторов, требуется квантование/шардирование,
гибридный поиск с плотным управлением, отдельный SLA на latency.

**Наш случай — это заведомо pgvector.** Оценка: даже 10k компонентов × 10 чанков = 100k векторов.
Отдельная база — лишняя операционная сущность и второй источник правды. Записываем как
архитектурное решение с явным критерием выхода: «>5 млн векторов или p95 поиска >150 мс при
корректном HNSW — тогда пересматриваем».

### Ретриверы VoltAgent — что с ними делать

**КРИТИЧНО (см. §1b, п.4):** встроенное векторное хранилище `@voltagent/postgres` — это
`vector BYTEA` + полный скан + `cosineSimilarity` в JS. Оно **не использует pgvector**, ANN там нет.
Поэтому:
- Для памяти агента (короткий контекст разговора) встроенное хранилище приемлемо — объёмы малы.
- Для нашего поиска по компонентам/журналу/датасетам **пишем свой ретривер** поверх таблицы
  `app.embeddings` с HNSW. VoltAgent позволяет подключить произвольный retriever
  (UNVERIFIED: интерфейс `BaseRetriever`/`retriever` в @voltagent/core 2.10 в этом заходе не читал —
  проверить `dist/index.d.ts` на `Retriever`).
- Эмбеддинги считаем через AI SDK v6 `embedMany` (у нас ai@6, см. 00-verified-by-lead.md).
  UNVERIFIED: сигнатуру `embed/embedMany` в ai@6 не проверял.

---

## 5. Мультитенантность: RLS vs schema-per-tenant vs tenant_id. DONE

### Три варианта, честно

| | `tenant_id` в колонке (shared) | RLS поверх `tenant_id` | schema-per-tenant | database-per-tenant |
|---|---|---|---|---|
| Изоляция | только код приложения | **БД гарантирует** | сильная | максимальная |
| Цена ошибки (забыли WHERE) | утечка данных | нет утечки | нет | нет |
| Миграции | одна | одна | **× число тенантов** | × N |
| Число объектов в БД | O(таблиц) | O(таблиц) | O(таблиц × тенантов) — каталог пухнет, autovacuum страдает | — |
| Пул соединений | один | один (+`SET LOCAL`) | один, но `search_path` на запрос | пул на тенанта — не масштабируется |
| Аналитика по всем тенантам | тривиально | тривиально (BYPASSRLS-роль) | UNION ALL по N схемам | ETL |
| Партиционирование по тенанту | `PARTITION BY LIST (tenant_id)` при необходимости | то же | не нужно | не нужно |

### Выбор на v1: **`tenant_id` во всех таблицах + RLS, включённая сразу**

Обоснование:
1. **`tenant_id` всё равно нужен** во всех трёх вариантах, кроме db-per-tenant. Добавить колонку
   позже — самая дорогая миграция из возможных (перелопатить все PK/FK/индексы). Ставим сразу,
   даже пока тенант ровно один.
2. **RLS — это страховка, а не архитектура.** Она стоит почти ничего в разработке (Drizzle
   генерирует политики), но снимает целый класс инцидентов «забыли `WHERE tenant_id`» — а у нас
   запросы будут частично генерироваться LLM-инструментами, т.е. вероятность такой ошибки выше
   обычного. Это решающий довод именно для нашего продукта.
3. **schema-per-tenant отпадает** из-за миграций: у нас forward-only drizzle-kit, и прогонять
   N миграций по N схемам с частичными отказами — источник постоянной боли. Плюс `@voltagent/postgres`
   создаёт свои таблицы в **одной** схеме (`schema?: string` — одна строка, не функция от тенанта),
   т.е. VoltAgent-часть всё равно осталась бы общей — изоляция получилась бы дырявой.

### Как это выглядит в Drizzle 0.45 (API подтверждён в .d.ts, см. §1)

```ts
export const appRole = pgRole('app_user').existing();   // роль создаём миграцией, не kit'ом

export const runs = appSchema.table('runs', { /* ... tenantId: uuid().notNull() ... */ }, (t) => [
  pgPolicy('runs_tenant_isolation', {
    as: 'permissive',
    for: 'all',
    to: appRole,
    using: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
    withCheck: sql`${t.tenantId} = current_setting('app.tenant_id', true)::uuid`,
  }),
]);
```
Плюс custom-миграция:
```sql
ALTER TABLE app.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.runs FORCE ROW LEVEL SECURITY;   -- иначе владелец таблицы политики обходит
```
`FORCE` обязателен — типичная ошибка: политики написаны, приложение ходит под владельцем схемы,
RLS не применяется, все довольны до первого инцидента.

**Установка контекста — только `SET LOCAL` внутри транзакции:**
```ts
await db.transaction(async (tx) => {
  await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`); // true = local
  // ... запросы
});
```
`set_config(..., true)` = `SET LOCAL`, действует до конца транзакции. Это единственный вариант,
который корректен **и** при пулере в режиме transaction pooling (PgBouncer/pgcat): сессионный
`SET` там протечёт в чужой запрос. Записать в доку как жёсткое правило.

Оборачиваем это в один хелпер `withTenant(tenantId, fn)` — единственная точка входа в БД для
прикладного кода. Всё остальное (фоновые джобы, миграции, аналитика) ходит под отдельной ролью
с `BYPASSRLS` и явно помечено.

**Цена RLS:** политика — это дополнительный предикат в каждом плане. При `tenant_id` в ведущих
колонках индексов планировщик его использует, накладные расходы близки к нулю. Правило: **везде,
где есть RLS-политика по `tenant_id`, этот столбец должен быть первым в составном индексе.**
Мои индексы из §2 это уже частично нарушают (`runs_project_started_idx (project_id, started_at)`)
— `project_id` уникален глобально и функционально определяет `tenant_id`, так что в горячих
таблицах политику можно писать через `project_id IN (SELECT id FROM app.projects WHERE tenant_id = ...)`.
UNVERIFIED: план такого подзапроса в политике не проверял — при внедрении измерить `EXPLAIN`;
при плохом плане денормализовать `tenant_id` в горячие таблицы и поставить его первым в индекс.

**Задел на SaaS:** когда крупный клиент потребует физической изоляции — переезд
`tenant_id`-модели в отдельную БД тривиален (дамп по фильтру), а из schema-per-tenant — нет.
Т.е. выбранная схема не закрывает дорогу, а schema-per-tenant закрыла бы.

---

## 6. Локальная разработка: docker-compose, миграции, testcontainers. DONE

### КРИТИЧНО: MinIO больше не вариант «по умолчанию»

Проверено: Docker Hub `minio/minio` — последний тег `latest` и
`RELEASE.2025-09-07T16-13-09Z` от **2025-09-07**, т.е. образ не обновлялся больше года
(Docker Hub API `/v2/repositories/minio/minio/tags`). По правилу «12+ месяцев без релизов = риск»
это **красный флаг**, и причина известна: MinIO прекратил публикацию Docker-образов в октябре
2025, в декабре 2025 перевёл community-репозиторий в maintenance mode, а **12 февраля 2026
репозиторий архивирован** с пометкой «THIS REPOSITORY IS NO LONGER MAINTAINED»; community-версия
распространяется только исходниками, готовых бинарников нет.
Источники: https://www.minimus.io/post/minio-docker-image-changes-how-to-find-a-secure-minio-alternative ,
https://github.com/minio/minio , https://rmoff.net/2026/01/14/alternatives-to-minio-for-single-node-local-s3/

**Что вместо MinIO (в порядке предпочтения для нашей задачи — локальный одноузловой S3):**
1. **Не поднимать объектное хранилище на v1 вовсе** — `BlobStore` с бэкендом `postgres` (§3).
   Самый дешёвый и честный ответ: пока блобы < 1 МБ, S3 не нужен.
2. **SeaweedFS** (`chrislusf/seaweedfs`, Apache-2.0) — живой, S3 API с 2018 года, один контейнер.
3. **Garage** (`dxflrs/garage`, AGPL-3.0) — маленький, специально для одноузловых/edge сценариев.
4. **LocalStack** (`localstack/localstack`) — если уже используется для другого AWS.
5. Форк Pigsty `pgsty/minio` или образы Chainguard — если нужен именно MinIO-API.
UNVERIFIED: конкретные теги/версии SeaweedFS и Garage в этом заходе не проверял — проверить перед
тем, как класть в compose.

### docker-compose.dev.yml (версии проверены)

```yaml
services:
  postgres:
    image: pgvector/pgvector:0.8.6-pg18      # проверено: Docker Hub, опубликован 2026-08-13
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: awa
    command:
      - postgres
      - -c
      - shared_preload_libraries=pg_stat_statements
      - -c
      - default_toast_compression=lz4        # §3
      - -c
      - max_connections=100
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d awa"]
      interval: 2s
      timeout: 3s
      retries: 30

  # объектное хранилище — только когда включим BlobStore=s3; см. выше про MinIO
  # s3:
  #   image: chrislusf/seaweedfs:<pin>       # UNVERIFIED: тег не проверял
  #   command: "server -s3 -dir=/data"

volumes: { pgdata: {} }
```
`pgvector/pgvector:0.8.6-pg18` даёт сразу и PG18 (нужен для `uuidv7()`, §2), и расширение vector
(§4) — один образ вместо двух. Это причина брать именно его, а не официальный `postgres:18`.

### Миграции: порядок и правила

1. `000_bootstrap.sql` (custom, руками): `CREATE SCHEMA app; CREATE SCHEMA voltagent;
   CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`
   + роли `app_user`, `app_migrator`, `app_analytics` (BYPASSRLS).
2. Далее `drizzle-kit generate` из `src/db/schema/*.ts` → SQL в `drizzle/`, всё в git вместе со
   снапшотами `drizzle/meta/`.
3. `drizzle-kit migrate` на старте контейнера приложения **или** отдельным job'ом — но не из N
   реплик одновременно: drizzle-kit не берёт advisory lock (UNVERIFIED: не проверял; если так —
   обернуть в `SELECT pg_advisory_lock(<const>)` самим). Безопасное правило: миграции — отдельный
   шаг деплоя.
4. Что пишем руками в `--custom` миграциях: партиции `run_nodes`, `ENABLE/FORCE ROW LEVEL SECURITY`,
   `ALTER ... SET COMPRESSION lz4`, `REVOKE UPDATE/DELETE` на immutable-таблицы, `CREATE EXTENSION`,
   `GRANT`ы.
5. **Forward-only, expand/contract.** Никаких down-миграций (drizzle-kit их не умеет в принципе).
   Схема меняется в два шага: добавили новое и пишем в оба места → переключили чтение → удалили старое.

```ts
// drizzle.config.ts
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  schemaFilter: ['app'],            // КРИТИЧНО: не трогать схему voltagent (§1b)
  casing: 'snake_case',
  entities: { roles: { include: ['app_user'] } },
  migrations: { table: '__drizzle_migrations', schema: 'app' },
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

### Интеграционные тесты: testcontainers

Проверено: `testcontainers@12.1.0` и `@testcontainers/postgresql@12.1.0`, MIT, обновлены 2026-08-04 — живые.

```ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const container = await new PostgreSqlContainer('pgvector/pgvector:0.8.6-pg18')
  .withDatabase('awa').withUsername('test').withPassword('test')
  .start();
// затем drizzle migrate(db, { migrationsFolder: './drizzle' })
```
UNVERIFIED: точную сигнатуру `PostgreSqlContainer` в 12.x (конструктор vs `new PostgreSqlContainer()` +
`.withImage()`) не проверял — в 11.x конструктор принимает image строкой; уточнить по .d.ts перед
написанием доки.

**Стратегия изоляции тестов (важнее, чем сам контейнер):** один контейнер на весь прогон vitest,
миграции один раз, а каждый тест — в транзакции с откатом (`db.transaction(async tx => { ...;
tx.rollback() })`). На порядок быстрее, чем контейнер на файл. Что НЕ откатывается транзакцией:
DDL из тестов и `SET` (сессионные) — поэтому в тестах тоже только `SET LOCAL`.
Для тестов RLS нужен отдельный коннект под ролью `app_user` (под владельцем политики не сработают,
если забыли `FORCE`, — и это как раз то, что тест должен ловить).

Альтернатива testcontainers для CI, если Docker-in-Docker недоступен: `pg-mem` не годится
(нет jsonb-операторов, нет pgvector), поднимать service-container в GitHub Actions — годится.
Рекомендация: testcontainers локально + service-container в CI на том же образе.

---

## Addendum: закрытые UNVERIFIED + версии вспомогательных пакетов

### `@voltagent/postgres` сам создаёт схему — подтверждено
В `dist/index.js` найден ровно один `CREATE SCHEMA IF NOT EXISTS ...`. Значит при
`schema: 'voltagent'` адаптер создаст схему сам, отдельная миграция под неё не обязательна.
Но роль приложения должна иметь `CREATE` на базе — либо создаём схему миграцией заранее и
выдаём `USAGE`, что предпочтительнее (меньше прав у рантайм-роли).

### `@testcontainers/postgresql@12.1.0` — точная сигнатура (из `build/postgresql-container.d.ts`)
```ts
class PostgreSqlContainer extends GenericContainer {
  constructor(image: string);                 // образ — аргумент конструктора, .withImage() не нужен
  withDatabase(db): this; withUsername(u): this; withPassword(p): this;
  withSSL(certFile, keyFile, caCertFile?): this;
  start(): Promise<StartedPostgreSqlContainer>;
}
class StartedPostgreSqlContainer {
  getPort(); getDatabase(); getUsername(); getPassword();
  getConnectionUri(): string;                 // postgres://user:pass@host:port/db
  withSnapshotName(name): this;
  snapshot(name?): Promise<void>;             // дефолт имени — "migrated_template"
  restoreSnapshot(name?): Promise<void>;
}
```
**Это меняет рекомендацию по изоляции тестов в §6 в лучшую сторону.** Вместо «транзакция с
откатом» правильный паттерн теперь встроен:
1. поднять контейнер один раз на прогон,
2. прогнать миграции,
3. `await container.snapshot()` — снимок в виде template-базы,
4. перед каждым тест-файлом `await container.restoreSnapshot()`.
Плюс против транзакционного отката: **работает с DDL и с несколькими соединениями** (а значит и с
тестами RLS под разными ролями, и с тестами партиционирования), чего откат транзакции не умеет.
Транзакционный откат оставляем как быстрый путь для юнит-уровня внутри одного файла.

### Версии вспомогательных пакетов (npm view, 2026-09-11)

| Пакет | Версия | Лицензия | time.modified | Вердикт |
|---|---|---|---|---|
| drizzle-zod | 0.8.3 | Apache-2.0 | 2026-06-17 | брать: мост Drizzle-таблица ↔ Zod-схема, снимает дублирование |
| @aws-sdk/client-s3 | 3.1130.0 | Apache-2.0 | 2026-09-10 | брать, когда включим S3-бэкенд BlobStore |
| pg-copy-streams | 7.0.0 | MIT | 2025-05-27 | ~15 мес без релиза — **жёлтый флаг**, но пакет крошечный и стабильный; для батч-вставки run_nodes можно обойтись многострочным INSERT и не тянуть зависимость |
| fast-json-patch | 3.1.1 | MIT | **2022-06-17** | **красный флаг: 4 года без релиза.** Для дельт чекпоинтов искать замену (`rfc6902`, `json-joy`) или не делать дельты вовсе на v1 — дедупликации по `state_hash` хватит |

### Пересмотр по итогам addendum
- Дельты чекпоинтов (§2) — **выносим из v1**. Основание: единственная очевидная библиотека
  заброшена, а выигрыш неочевиден, пока не измерен реальный размер состояния. На v1: полный снимок
  + дедуп по `state_hash` + lz4-компрессия колонки.
- Батч-вставка `run_nodes` (§2) — на v1 многострочный `INSERT`, без `pg-copy-streams`.
  COPY вводим по результатам нагрузочного теста, а не заранее.

## Итоговые решения (шпаргалка для писателя)

1. **Drizzle ORM 0.45.2 + drizzle-kit 0.31.10.** Решающее: HNSW/BRIN/GIN с opclass прямо в
   TS-схеме + `pgPolicy`/`pgRole` для RLS. Prisma — второй DSL и мажор в RC; Kysely — нет схемы.
2. **PostgreSQL 18** (`uuidv7()` встроен) в образе `pgvector/pgvector:0.8.6-pg18`.
3. **Две схемы в одной БД:** `app` (наши миграции) и `voltagent` (рантайм-DDL адаптера),
   разделены через `schema` у адаптера и `schemaFilter: ['app']` у drizzle-kit. Связь по
   `execution_id: text` без FK через границу схемы.
4. **`run_nodes` — партиции RANGE по месяцам + BRIN(started_at) + btree(run_id,...)**,
   строго append-only (одна запись на завершённый шаг).
5. **Блобы: < 8 КБ inline, 8 КБ-1 МБ в `app.blobs` (lz4), > 1 МБ — объектное хранилище.**
   Порог — конфиг. За интерфейсом `BlobStore`. На v1 S3-бэкенд не включаем.
6. **pgvector 0.8.6, только HNSW** (`m=16, ef_construction=64`), `hnsw.iterative_scan` для
   фильтрованных запросов. Qdrant не нужен; критерий выхода — >5 млн векторов или p95 >150 мс.
   **Встроенный vector store VoltAgent (BYTEA + скан + JS-косинус) для нашего поиска не годится —
   пишем свой retriever поверх `app.embeddings`.**
7. **`tenant_id` везде + RLS с `FORCE` + `SET LOCAL app.tenant_id` через `set_config(...,true)`
   внутри транзакции.** schema-per-tenant отклонён (миграции × N, и VoltAgent-часть всё равно общая).
8. **MinIO мёртв** (репозиторий архивирован 2026-02-12, образы не публикуются с 2025-10).
   В compose его не кладём; альтернативы — SeaweedFS / Garage / Chainguard-образы, или вообще
   ничего на v1.
9. **Тесты: testcontainers 12.1.0 + `snapshot()`/`restoreSnapshot()`**, миграции один раз на прогон.
