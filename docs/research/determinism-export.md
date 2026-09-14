# Детерминизм, канонизация, экспорт-бандл и конформанс (§15.1, kill 13-15)

Статус: ГОТОВО (все 8 секций). Дата проверки: 2026-09-11.

## 1. Канонический JSON и хеширование — см. ниже
## 2. Семантический дифф IR — см. ниже
## 3. YAML vs JSONB, round-trip байт-в-байт (kill 13) — см. ниже
## 4. Бандл, manifest, Merkle, подпись — см. ниже
## 5. Нормативная семантика + эталонный интерпретатор (prior art) — см. ниже
## 6. Кассеты (record/replay LLM+tools) — см. ниже
## 7. Codegen в VoltAgent TS — см. ниже
## 8. Цели миграции: Mastra / LangGraph JS / Temporal TS — см. ниже

---
## 2. Семантический дифф IR (ПРОВЕРЕНО на живой пробе)

### Что даёт каждая библиотека
| пакет | версия / лицензия / свежесть | модель диффа | detect move | patch/unpatch | вердикт |
|---|---|---|---|---|---|
| `jsondiffpatch` | 0.7.6 / MIT / 2026-05-14 | свой дельта-формат, **`objectHash` — идентичность элементов массива по нашему полю** | ДА (`arrays.detectMove`) | ДА, обратимый | **БЕРЁМ как движок** |
| `microdiff` | 1.6.0 / MIT / 2026-08-02 | плоский список CREATE/REMOVE/CHANGE с `path[]` | НЕТ (чисто позиционный) | нет | берём для «дёшево сравнить два объекта настроек» |
| `rfc6902` | 5.3.0 / MIT / 2026-07-23 | RFC 6902 JSON Patch, `createPatch`/`applyPatch` | нет (генерит add/remove) | ДА (стандарт) | **берём для wire-формата патчей в MCP/БД** |
| `fast-json-patch` | 3.1.1 / MIT / **2022-06** | RFC 6902 + observe() | нет | да | мёртвый 3+ года, НЕ берём |
| `deep-object-diff` | 1.1.9 / MIT / **2022-11** | объект-дельта | нет | нет | мёртвый, НЕ берём |

### Живая проба: перемещение узла в массиве
Сценарий: `score` и `top3` меняются местами, у `top3` меняется `k: 3→5`, у `score` `concurrency: 8→16`, вставлен новый `guard`.

**`jsondiffpatch` БЕЗ `objectHash`** — катастрофа: 60+ строк дельты, узлы «превращаются» друг в друга (`id: ["score","top3"]`, `kind: ["map","code"]`). То же у `microdiff` (11 операций, все — ложные) и у `rfc6902` (12 операций, `replace /seq/1/id`). Для UI-диффа это мусор: человек увидит «изменились 4 узла», хотя изменились 2 поля и один узел переехал.

**`jsondiffpatch` С `objectHash: o => o.id`** — ровно то, что нужно:
```json
{"seq":{"1":{"in":{"k":[3,5]}},      // top3: k 3->5
        "2":{"concurrency":[8,16]},  // score: concurrency 8->16
        "3":[{"id":"guard","kind":"code"}], // добавлен guard
        "_t":"a","_2":["",1,3]}}     // узел с исх. индексом 2 переехал на индекс 1 (3 = MOVE)
```
Конфиг, который это даёт:
```ts
const differ = jsondiffpatch.create({
  objectHash: (o: any) => (o && typeof o === 'object' && 'id' in o ? String(o.id) : undefined),
  arrays: { detectMove: true, includeValueOnMove: false },
  textDiff: { minLength: Number.MAX_SAFE_INTEGER }, // выключить diff-match-patch для промтов
});
```
`patch(a, diff) === b` и `unpatch(b, diff) === a` — оба вернули `true`. Обратимость есть, значит дельту можно хранить в БД как единицу версии и откатывать (R11).

**Важно:** `textDiff` по умолчанию включает diff-match-patch для строк > 60 символов и даёт **не JSON-совместимую** дельту для длинных промтов. Для хранения и для канонизации это яд — выключаем порогом `MAX_SAFE_INTEGER`. Для UI можно завести отдельный инстанс с textDiff, но никогда не мешать их в персистентном слое.

### Что дописываем сверху (библиотека не даёт)
1. **Граф, а не дерево.** IR — DAG, а рёбра живут в биндингах (`"$score.out"`). Перемещение узла не меняет структуру графа, а переименование узла меняет ВСЕ биндинги на него. Наш слой: перед диффом строим `NodeId → {spec, inEdges, outEdges}` и диффим три вещи отдельно:
   - `nodes`: по id, полем-в-поле (jsondiffpatch по `Record<id, NodeSpec>`, не по массиву — тогда move вообще не возникает);
   - `edges`: множество `{fromNodeId, fromPort, toNodeId, toSlot}`, диффим как set (add/remove), не как список;
   - `order`: топологический порядок — отдельная секция, чтобы «переехал в графе» не путалось с «переставили в YAML».
2. **Детект переименования (rename vs delete+add).** jsondiffpatch по `id` этого не умеет: смена `id` = удалить+добавить. Наша эвристика: узел `A` удалён, узел `B` добавлен, `hashOf('node-body/v1', omit(A,'id')) === hashOf('node-body/v1', omit(B,'id'))` и множества входящих/исходящих рёбер совпадают по позиции → это RENAME. Показываем одной строкой и предлагаем автопочинку биндингов.
3. **Переattach слотов.** Биндинг — строка `"$score.out.items[*].price"`. Текстовый дифф даст «строка изменилась». Наш слой парсит биндинг в структуру `{sourceNodeId, port, path[]}` и диффит структурно: тогда `$score.out → $rescore.out` при том же `path` классифицируется как REBIND (смена источника), а `$score.out.price → $score.out.cost` как RESLICE (смена пути). Разные классы риска: REBIND может сломать типы, RESLICE точно требует перепроверки схемы.
4. **Классификация по влиянию** (для UI и для гейтов §12): `COSMETIC` (описания, позиции на канвасе) → не инвалидирует кэш; `BEHAVIORAL` (промт, модель, параметры) → инвалидирует replay-кэш этого узла и всех вниз по течению; `STRUCTURAL` (узлы/рёбра) → инвалидирует весь прогон + требует пересборки плана.

### Алгоритм нашего диффа (псевдокод, flat)
```
diffSpecs(a, b):
  ra, rb = toRecordForm(a), toRecordForm(b)      // Record<NodeId, NodeSpec>, Set<Edge>, order[]
  nodeDelta  = differ.diff(ra.nodes, rb.nodes)   // jsondiffpatch по Record -> нет ложных move
  renames    = detectRenames(ra, rb)             // по body-hash + изоморфизму окрестности
  edgeDelta  = setDiff(ra.edges, rb.edges)       // add/remove, после применения renames
  bindDelta  = classifyBindings(ra, rb)          // REBIND / RESLICE / unchanged
  impact     = propagateDownstream(nodeDelta, edgeDelta)  // какие узлы теряют кэш
  return { renames, nodeDelta, edgeDelta, bindDelta, impact, wire: rfc6902.createPatch(ra, rb) }
```
`wire` — RFC 6902 патч для передачи по MCP (стандарт, любой клиент применит), остальное — для UI и гейтов.

---
## 3. YAML vs JSON(B) и round-trip байт-в-байт — kill-критерий 13 (ПРОВЕРЕНО)

`yaml@2.9.0`, ISC, последняя публикация 2026-05-11 (жив, автор eemeli). Альтернатив нет: `js-yaml` не даёт AST с комментариями и не умеет 1.2 core по умолчанию так же аккуратно.

### Вердикт по хранению
- **БД — JSONB.** Источник истины, индексируется, `jsonb_path_query` по биндингам, дешёвые частичные апдейты.
- **YAML — только транспорт** (экспорт-бандл + авторинг вручную) и только в одном направлении: `YAML → JS → Zod-валидация → JSONB`. Обратно `JSONB → YAML` строго через канонический stringify.
- **Внутри бандла** `flows/*.yaml`, `prompts/*.yaml` для читаемых git-диффов, но `manifest.json` и `conformance/*.json` — строго JSON (хеши считаются по JSON, не по YAML).

### Точные опции `YAML.stringify`, при которых round-trip байт-в-байт (ПРОВЕРЕНО: `c1 === c2 === c3 === true`)
```ts
export const YAML_CANON: YAML.ToStringOptions & YAML.DocumentOptions & YAML.SchemaOptions = {
  version: '1.2',                 // core schema: yes/on/off — СТРОКИ, не булевы
  indent: 2,
  indentSeq: false,               // элементы списка на уровне ключа
  lineWidth: 0,                   // НИКОГДА не сворачивать строки (иначе ширина терминала влияет на байты)
  minContentWidth: 0,
  defaultStringType: 'QUOTE_DOUBLE',
  defaultKeyType: 'PLAIN',
  doubleQuotedAsJSON: true,       // экранирование как в JSON -> совпадает с JCS
  singleQuote: false,
  blockQuote: false,              // НЕТ | и > : многострочные строки едут как "a\nb"
  collectionStyle: 'block',       // никаких flow {a: 1}
  flowCollectionPadding: false,
  nullStr: 'null',
  simpleKeys: true,
  sortMapEntries: true,           // тот же порядок ключей, что даёт JCS? НЕТ, см. ловушку ниже
  directives: false,              // без %YAML 1.2 и ---
};
```
Проба: `YAML.stringify(js, YAML_CANON)` → parse → stringify даёт **идентичные байты на 2-м и 3-м проходе**, и `canonicalize(js) === canonicalize(YAML.parse(c1))`. Это и есть техническая основа kill-критерия 13.

### Ловушки, каждая из которых ломает round-trip
1. **`sortMapEntries: true` сортирует через `Array.prototype.sort` по строке ключа — это НЕ порядок JCS** (JCS сортирует по UTF-16 code units через `<`; JS `sort()` по умолчанию тоже сравнивает строки через `<`, так что для наших ASCII-ключей совпадает, но для ключей с не-ASCII **не гарантировано**). **Правило: ключи IR — только `[a-z0-9_]`, это запрещено JSON Schema-валидацией на импорте.** Тогда вопрос закрыт навсегда.
2. **Якоря и merge keys (`&base`, `<<: *base`) уничтожаются.** Проба: `hot: {<<: *base, temperature: 1.1}` после parse стал `{temperature:1.1, top_p:1}` — merge развёрнут, якорь потерян. Если человек написал якоря руками, экспорт вернёт развёрнутую версию → байты не совпадут. **Правило: якоря запрещены в авторском YAML (валидатор ругается), переиспользование — только через наши `fragments`/`components`.**
3. **Комментарии не переживают `parse → stringify`.** Проба через `YAML.parseDocument` + `String(doc)`: `doc->string identical to source? false` (нормализуется `{ usd: 0.40 }` → `{ usd: 0.4 }`, `&base` теряется). **Правило: комментарии в экспортируемых спеках не хранятся; описания — явное поле `description` в IR.** Это одновременно и требование R15 (контекст описан в данных, а не в комментариях).
4. **YAML-скаляры — минное поле.** Проба `version: '1.2'` (core schema):
   `1h`→string, `yes`/`no`/`on`/`NO`→**string** (в 1.2 ок), `0.40`→`0.4` (**число, ведущие нули теряются**), `012`→`12` (число!), `1_000`→string, `2026-09-11`→string (в 1.2), `~`→null, `1e3`→1000, `.inf`→null(!), `08:30`→string.
   При `version: '1.1'`: `yes`/`on` → **`true`** — классический norway-bug. **Правило: `version: '1.2'` жёстко, и всё, что должно быть строкой, в каноническом выводе цитируется (`defaultStringType: 'QUOTE_DOUBLE'` это и делает).**
5. **`.inf` парсится в `null`, а не в `Infinity`** у `yaml@2.9` при core schema — то есть YAML не умеет то, что JCS всё равно запрещает. Совпадает с нашей политикой «нет NaN/Infinity в IR».
6. **Порядок ключей в JSONB.** Postgres `jsonb` **не хранит порядок ключей** (сортирует по длине, затем побайтово) и схлопывает дубликаты. Это не проблема, потому что канонический вывод всё равно пересортировывает, но означает: **нельзя хранить «исходный YAML как есть» в jsonb и надеяться получить те же байты**. Если нужен исходник — отдельная колонка `text` + его sha256.

### Процедура round-trip (kill 13), которую гоняем в CI
```
export(projectId) -> bundleA (tar, детерминированный, см. §4)
import(bundleA)   -> projectId2   (полная Zod+JSON Schema валидация)
export(projectId2)-> bundleB
assert sha256(bundleA) === sha256(bundleB)              // байты
assert merkleRoot(bundleA) === merkleRoot(bundleB)      // и по-файлово, чтобы было видно ГДЕ разошлось
```
Плюс property-тест: генерим случайный валидный IR (fast-check), гоняем export→import→export 3 раза, требуем стабилизации со 2-го прохода (1-й проход может нормализовать авторский ввод — это законно, дальше обязан быть фикспойнт).

---
## 4. Бандл: структура, manifest, Merkle, упаковка, подпись

### Структура — как в §15.1, с уточнениями
Каталоги из спеки оставляем один в один. Добавляем правила, без которых round-trip не держится:
- **Имена файлов детерминированы**: `flows/<flowId>@<specVersion>.yaml`, `prompts/<promptId>@<version>.yaml`. Никаких временных меток и uuid в именах.
- **Ровно один файл на сущность**, никаких «индексов», которые дублируют содержимое (индекс = вычисляемый артефакт, он в `manifest.json`).
- **`conformance/cases/<caseId>.json` + `conformance/cassettes/<sha256>.json`** — кассета адресуется хешем запроса, поэтому одна и та же запись переиспользуется несколькими кейсами (дедуп).
- **`reference/`** — эталонный интерпретатор: сборка **без зависимостей на наш монорепо**, только `zod` и `canonicalize` в `dependencies`, чтобы `npm i && npm test` в распакованном бандле работал у любого.

### manifest.json
```jsonc
{
  "formatVersion": "1.0.0",      // semver самого формата бандла; мажор = несовместимость импорта
  "generator": { "name": "aiwf", "version": "0.4.2" },  // информационно, НЕ входит в merkleRoot
  "project": { "id": "...", "slug": "hotel-pitch" },
  "specVersions": [{ "flowId": "hotel_pitch", "version": 7, "specHash": "sha256-..." }],
  "hashAlgorithm": "sha256",
  "files": [                     // отсортирован по path (UTF-16 code units), пути POSIX, без "./"
    { "path": "README.md", "size": 4211, "hash": "sha256-..." },
    { "path": "flows/hotel_pitch@7.yaml", "size": 8130, "hash": "sha256-..." }
  ],
  "merkleRoot": "sha256-...",
  "capabilities": { "hasCassettes": true, "hasDatasets": true, "piiMasked": true }
}
```
**`merkleRoot` считается так** (описать в `semantics/`, иначе чужая реализация не воспроизведёт):
```
leaf_i   = sha256(0x00 || utf8(path_i) || 0x00 || fileBytes_i)   // path включён -> перестановка файлов ломает корень
листья отсортированы по path
node     = sha256(0x01 || left || right)                          // нечётный остаток поднимается наверх как есть (НЕ дублируется — защита от CVE-2012-2459 style)
merkleRoot = корень; для 0 файлов = sha256(0x02)
```
Зачем Merkle, а не один хеш конкатенации: при расхождении round-trip сразу видно, **какой файл** разошёлся (спускаемся по дереву), и можно проверить один файл, не качая бандл целиком (пригодится, когда targets/ весит десятки МБ).

### Упаковка: tar, не zip
- **zip хранит локальные заголовки с mtime и порядком записи, и разные реализации кладут разные extra-поля** → байтовый детерминизм достижим, но требует ручного контроля каждого поля.
- **tar (ustar/pax) проще сделать детерминированным**: `tar-stream@3.2.1` (MIT, 2026-08-25) пишет ровно то, что дали. Правила: `mtime: new Date(0)`, `uid: 0, gid: 0, uname: '', gname: ''`, `mode: 0o644` (0o755 для директорий — лучше вообще не писать записи директорий), `type: 'file'`, записи в порядке сортировки `path`, **без pax-заголовков** (значит пути ≤ 100 байт и размеры < 8 ГБ — у нас так; если путь длиннее, это баг именования).
- Сжатие — **опционально и вне хеша**: хешируем `.tar`, а `.tar.gz` отдаём для удобства. gzip недетерминирован между версиями zlib (уровень, mtime в заголовке); если всё же нужен `.tar.gz` с фиксированными байтами — `zlib.gzipSync(buf, { level: 9, mtime: 0 })`, но **kill-критерий 13 проверяем на `.tar`, а не на `.tar.gz`**. Это надо записать в спеке критерия явно, иначе он будет ложно падать.
- Git-дружественность (§15.1 «порядок детерминирован для диффов в git»): бандл в git кладём **распакованным**, tar — только для передачи.

### Проверка на импорте (порядок операций, любой шаг = отказ)
1. `formatVersion` мажор совместим → иначе отказ с внятным текстом.
2. Пересчитать хеш каждого файла из `manifest.files` и `merkleRoot`. Лишние файлы, не перечисленные в манифесте, = ошибка (защита от «подложили кассету»).
3. JSON Schema-валидация каждого файла по `schema/` (схемы тоже в бандле и тоже в манифесте — самоописываемость).
4. Zod-парсинг IR → проверка ссылочной целостности (каждый биндинг указывает на существующий узел/порт, каждый `componentRef@version` есть в `components/`).
5. Пересчитать `specHash` каждой спеки из содержимого и сверить с `manifest.specVersions` — ловит правку файла с обновлением манифеста, но без пересборки.
6. Прогнать `conformance/` на эталонном интерпретаторе из `reference/` — если бандл не проходит собственный конформанс, он битый до всякого импорта.
7. Только после этого писать в БД, одной транзакцией.

### Подпись (sigstore) — честный ответ
**В v1 не нужна.** Обоснование:
- Угроза, которую закрывает подпись, — «бандл подменили по дороге». В v1 бандл не ходит по недоверенным каналам: его экспортирует и импортирует один человек/его же CI, откуда есть git и его собственные подписи коммитов.
- Merkle-корень уже даёт **целостность**; подпись добавляет только **аутентичность источника**, а источник в v1 — ты сам.
- `sigstore@5.0.0` / `@sigstore/sign@5.0.0` (Apache-2.0, 2026-06-01) — живые и адекватные, keyless-подпись через OIDC + Rekor. Интеграция не бесплатна: нужен OIDC-провайдер, сетевой доступ к Fulcio/Rekor на подпись И на проверку, обработка offline-режима.
- **Что закладываем сейчас, чтобы потом не ломать формат:** поле `manifest.signatures: []` (пустой массив) и правило «`signatures` не входит в `merkleRoot`». Тогда подпись добавляется без смены `formatVersion`.
- **Что стоит сделать вместо подписи уже сейчас (дёшево):** `merkleRoot` печатать в вывод CLI и в UI, и хранить в БД при импорте — тогда «этот прод собран из вот этого бандла» доказуемо без криптоинфраструктуры.

---
## 6. Кассеты: формат записи вызовов моделей и тулов

### Заимствовать ли готовое — вердикт
| кандидат | версия / лицензия / свежесть | почему не подходит |
|---|---|---|
| `@pollyjs/core` | 6.0.6 / Apache-2.0 / **2023-07 — 3 года без релиза** | мёртв; плюс пишет HAR, т.е. HTTP-уровень |
| `nock` | 14.0.17 / MIT / 2026-07-30 | жив, но перехват на уровне `http.ClientRequest`; SSE-стримы и fetch в Node 24 — боль; матчинг по URL+body, а нам нужен матчинг по **семантическому** хешу |
| `msw` + `@mswjs/interceptors` | 2.15.0 / 0.42.5 / MIT / 2026-09-10 | самый живой; хорош для тестов Studio, но опять HTTP-уровень |
| HAR | формат W3C, не библиотека | описывает HTTP, не «вызов модели»; стрим представлен как один ответ |

**ВЕРДИКТ: HTTP-уровень не годится — пишем свой формат на уровне порта.**
Причины, каждая сама по себе достаточная:
1. **Ключ должен быть семантическим.** §15.1 прямо говорит: «кассета отвечает по хешу **нормализованного запроса**». На HTTP-уровне тот же логический вызов к OpenRouter и к Anthropic — разные URL, разные тела. Кассета, записанная на одном провайдере, обязана проигрываться на другом (это и есть агностичность R12), а HTTP-матчер этого не умеет в принципе.
2. **Цель конформанса — чужая реализация в чужом фреймворке** (kill 14). Она не обязана ходить по HTTP теми же запросами; она обязана сделать логически тот же вызов. Значит контракт — на уровне «модель + сообщения + схема + тулы», а не байтов HTTP.
3. Тулы и MCP — вообще не HTTP (stdio-транспорт).

Но **HTTP-запись оставляем как второй, отладочный слой**: `msw`/`@mswjs/interceptors` пишет сырой HTTP рядом (`conformance/raw-http/`), вне merkleRoot, для разбора «провайдер ответил не то». Это не часть контракта.

### Нормализованный запрос и ключ
```ts
type NormalizedModelRequest = {
  kind: 'model';
  modelProfile: string;        // НАШ логический профиль ("strong-json"), НЕ "gpt-4o-2024-11-20"
  messages: Array<{ role: 'system'|'user'|'assistant'|'tool'; content: NormalizedContent[] }>;
  tools?: Array<{ name: string; schemaHash: string }>;   // порядок: отсортирован по name
  outputSchemaHash?: string;
  params: { temperature?: number; topP?: number; maxTokens?: number; seed?: number; stop?: string[] };
  // НЕ входят: apiKey, baseUrl, request-id, user, метаданные трассировки, timestamp
};
const key = hashOf('cassette-req/v1', normalize(req));
```
Нормализация текста перед хешем (та же функция, что в §15.1 «совпадают после нормализации пробелов»):
`NFC` → `\r\n`/`\r` → `\n` → trim по концам каждой строки → схлопывание 3+ пустых строк в 2 → trim документа.
**Нормализация применяется ТОЛЬКО к ключу и к сравнению, а не к тому, что уходит в модель** — иначе мы меняем поведение прода ради тестов.

**Вторичный ключ (fallback).** Если точного попадания нет, кассета может ответить по `(modelProfile, nodeId, callIndex)` — «N-й вызов этого узла». Это спасает чужую реализацию, у которой промт отличается на пробел, который наша нормализация не покрыла. Режим `strict: false` разрешаем только в отладке; kill-критерий 14 засчитывается **только в strict**.

### Формат записи (`conformance/cassettes/<key>.json`)
```jsonc
{
  "key": "sha256-...", "kind": "model",
  "request": { /* NormalizedModelRequest, целиком — чтобы кассета читалась человеком и LLM */ },
  "response": {
    "finishReason": "tool-calls",
    "text": "...",                       // склеенный текст (для не-стриминга это он и есть)
    "object": { /* при structured output — уже распарсенный, канонизированный */ },
    "toolCalls": [{ "id": "call_1", "name": "db.hotels", "args": { } }],
    "usage": { "inputTokens": 812, "outputTokens": 140, "reasoningTokens": 0 },
    "chunks": [                          // СТРИМИНГ: только если запись велась в стриме
      { "t": 0,   "type": "text-delta", "delta": "Hel" },
      { "t": 120, "type": "tool-call-delta", "id": "call_1", "argsDelta": "{\"ci" },
      { "t": 300, "type": "finish" }
    ]
  },
  "recordedAt": "2026-09-11T00:00:00.000Z",   // НЕ входит в хеш файла? входит — см. правило ниже
  "provider": { "id": "openrouter", "model": "anthropic/claude-sonnet-4.5" }  // информационно
}
```
**Правила, без которых kill 13 упадёт:** `recordedAt` и `provider` — это содержимое файла, значит они ВХОДЯТ в хеш файла и в merkleRoot. Поэтому перезапись кассеты = изменение бандла. Это правильно (запись прогона — часть артефакта), но значит: **перезаписывать кассеты нельзя «на всякий случай»**, только по явной команде `record --refresh`.

**Стриминг.** `chunks[]` хранит относительные `t` в мс от начала ответа, округлённые до 10 мс — иначе байты записи меняются от прогона к прогону. При воспроизведении по умолчанию `t` игнорируется (мгновенная отдача); режим `--realtime` нужен только для отладки UI. **Конформанс сравнивает склеенный результат и последовательность типов чанков, но НЕ тайминги.**

**Тулы.** `kind: 'tool'`, `request: { toolName, toolSchemaHash, args }`, `response: { result | error }`. Недетерминированные тулы (`now()`, `random()`, обращения к БД) — **это не тулы, а источники окружения**: у них отдельный раздел `conformance/env/<caseId>.json` с `now`, `seed`, `randomStream`, `humanInputs[]`. Эталонный интерпретатор обязан брать время и случайность только оттуда — иначе нет kill 5 (воспроизводимость).

**Коллизии и множественные ответы.** Один ключ = один ответ. Если узел в цикле вызывает модель с одинаковым промтом дважды и ожидает разные ответы — промты на самом деле различаются (в них входит история итераций); если реально совпадают, это баг спеки, и кассета обязана **упасть с ошибкой `AMBIGUOUS_REPLAY`**, а не молча вернуть тот же ответ. Иначе мы маскируем бесконечный цикл.

---
## 8. Цели миграции: актуальные API (ПРОВЕРЕНО по установленным .d.ts, 2026-09-11)

### Версии и примитивы
**Mastra `@mastra/core@1.66.0`** (Apache-2.0, опубликован **2026-09-11**, т.е. сегодня — очень живой).
Фабрики: `createWorkflow({ id, inputSchema, outputSchema, stateSchema?, requestContextSchema?, steps })`, `createStep(...)`, `cloneStep/cloneWorkflow`.
Методы чейна (из `dist/workflows/workflow.d.ts`, подтверждены грепом): **`.then()` `.parallel(steps[])` `.branch([[cond, step], ...])` `.map()` `.foreach()` `.dowhile()` `.dountil()` `.sleep()` `.sleepUntil()` `.waitForEvent()` `.sendEvent()` `.commit()`**; рантайм: `.createRun()` `.start()/.startAsync()` `.resume()/.resumeAsync()/.resumeStream()` `.stream()` `.watch()` `.timeTravel()/.timeTravelStream()` `.restart()` `.cancel()` `.bail()` `.abort()`. Есть `stateSchema` (типизированное состояние воркфлоу) и `requestContextSchema`. Схемы — `PublicSchema`/Standard Schema, не только Zod.

**LangGraph JS `@langchain/langgraph@1.4.14`** (MIT, 2026-09-06).
Граф-API: `StateGraph` (`.addNode` с `AddNodeOptions`/`NodePolicyOptions`, `.addEdge`, `.addConditionalEdges` с `ConditionalEdgeRouter`, `.compile()` → `CompiledStateGraph`), `START`/`END`, состояние через `Annotation`/`AnnotationRoot` **или новый `StateSchema` (`state/schema.js`, поддерживает Standard Schema — `isStandardSchema`)**, каналы `LastValue`/`BinaryOperatorAggregate`/`Topic`/`NamedBarrierValue`/`DynamicBarrierValue`/`EphemeralValue`/`DeltaChannel`.
Управление потоком: **`Send`** (динамический fan-out, наш `map`), **`Command`** (переход + апдейт состояния из узла), **`interrupt()`** (human-in-the-loop), `writer()` (кастомный стрим).
Функциональный API: **`entrypoint` / `task`**.
Политики: `RetryPolicy`, `CachePolicy`, `TimeoutPolicy`, `GraphRecursionError` (лимит итераций), чекпоинтеры.

**Temporal `@temporalio/workflow@1.23.0`** (MIT, 2026-08-26).
Примитивы (из `lib/*.d.ts`): `proxyActivities` / `proxyLocalActivities` / `scheduleActivity`, `startChild` / `executeChild` (подворкфлоу), `condition()` (ждать предиката), `sleep()`, `continueAsNew` / `makeContinueAsNewFunc`, `defineSignal` / `defineQuery` / `defineUpdate` + `setHandler` / `setDefaultSignalHandler` / `setDefaultUpdateHandler`, `allHandlersFinished`, `workflowInfo()`, `patched` / `deprecatePatch` (версионирование кода!), `upsertSearchAttributes` / `upsertMemo`, `getExternalWorkflowHandle`, `uuid()`, детерминированный PRNG (`alea`, `getRandomStream`, `currentRandom`, `deriveAleaSeed`) и `overrideGlobals` (патчит `Date.now`/`Math.random`). Параллелизм — обычный `Promise.all` внутри детерминированного рантайма.

### Таблица соответствия наших примитивов
Легенда: **N** — ложится нативно, **E** — эмулируется нашим кодом поверх, **L** — теряется (идёт в отчёт потерь §15.1).

| наш примитив/комбинатор | VoltAgent 2.10 | Mastra 1.66 | LangGraph JS 1.4 | Temporal TS 1.23 |
|---|---|---|---|---|
| `llm` (structured output) | **N** `andAgent(prompt, agent, {schema})` | **N** `createStep` + `agent.generate({structuredOutput})` | **E** узел, внутри — вызов модели вручную | **E** activity (LLM-вызов обязан быть activity, не в воркфлоу) |
| `tool` | **N** тул агента / `andThen` | **N** `.tool()` / step | **E** узел | **N** `proxyActivities` |
| `code` | **N** `andThen` | **N** `.then(createStep)` | **N** узел | **N** activity (в воркфлоу только детерминированный код) |
| `const` | **N** | **N** | **N** | **N** |
| `map` (fan-out по коллекции) | **N** `andForEach` | **N** `.foreach()` (есть `concurrency`) | **N** `Send` — родной динамический fan-out | **N** `Promise.all(items.map(...))` |
| `parallel` (фиксированные ветки) | **N** `andAll` | **N** `.parallel([...])` | **N** несколько рёбер из одного узла + барьерный канал | **N** `Promise.all` |
| `switch` / `gate` | **E** цепочка `andWhen` (нет родного switch, см. volt-primitives.md) | **N** `.branch([[cond, step],...])` | **N** `addConditionalEdges` | **N** обычный `if` |
| `loop` (while/until) | **N** `andLoop` | **N** `.dowhile()/.dountil()` | **E** условное ребро назад + `GraphRecursionError` как предохранитель | **N** `while` + `condition()` |
| `race` / timeout | **N** `andRace` (тип результата — **union**, не кортеж) | **E** `.parallel` + свой первый-победил | **E** | **N** `Promise.race` + `sleep` |
| `try` / retry | **N** `retries`/`attempts` на шаге (без backoff/предиката — см. volt-durability.md) | **N** retry на step | **N** `RetryPolicy` на узле | **N** RetryPolicy активности — **самый богатый** (backoff, non-retryable types, heartbeat) |
| подворкфлоу по версии | **N** воркфлоу как шаг | **N** вложенный workflow (`isNestedWorkflowStep`) | **N** субграф | **N** `executeChild` |
| ожидание человека (§11) | **N** suspend/resume | **N** `.waitForEvent()/.sendEvent()`, `.resume()` | **N** `interrupt()` + `Command({resume})` | **N** `defineSignal`/`defineUpdate` + `condition()` |
| чекпоинты / durability | **N** memory/чекпоинты | **N** + `.timeTravel()` | **N** checkpointer | **N** event sourcing — **эталон отрасли** |
| типизированный контракт входа/выхода шага | **N** Zod на каждом шаге | **N** Standard Schema | **E** состояние-канал типизирован, но контракт узла — нет | **L** только TS-типы, без рантайм-схем |
| **провенанс каждого куска контекста (R15)** | **L** | **L** | **L** | **L** — **ни у кого нет; это наш слой, эмулируется через метаданные в state** |
| **наши гарантии компилятора (§8 L0/L1)** | **L** | **L** | **L** | **L** — статические; в целевом коде превращаются в рантайм-ассерты |
| **replay-кэш по хешу узла** | **E** наш слой | **E** | **E** (CachePolicy ≠ наш ключ) | **E** |
| **бюджет по стоимости/токенам** | **E** `state.usage` копится только по `andAgent` | **E** | **E** | **E** |
| **эффективная конфигурация вызова (R22)** | **N** override на вызове | **N** | **E** | **E** |

### Практические выводы для §15.1
- **Mastra — самая близкая цель для kill 14**: у неё есть ровно наши комбинаторы (`branch`, `parallel`, `foreach`, `dowhile/dountil`, `waitForEvent`), поэтому карта соответствия почти 1:1 и LLM воссоздаёт механически. Берём Mastra как обязательную вторую цель.
- **LangGraph — самая непохожая** (граф с каналами вместо чейна): хороший стресс-тест «нормативная семантика достаточна, а не просто пересказ VoltAgent-API». Именно на LangGraph видно, дописана ли семантика join-политик честно (у них барьер — это канал, и порядок мержа определяется reducer'ом, который надо вывести из нашей join-политики).
- **Temporal — цель для durability, но не для LLM-семантики**: все LLM- и тул-вызовы обязаны стать activity, а внутри воркфлоу — только детерминированный код. Это ровно наше разделение «примитивы vs эффекты», так что экспорт в Temporal — хороший **валидатор чистоты IR**: если что-то из нашего `code`-узла не переживает `overrideGlobals` (дергает `Date.now`/`Math.random` напрямую), значит у нас дырка в детерминизме.
- **Отчёт потерь обязателен во всех трёх.** Постоянно теряются: провенанс, статические гарантии компилятора, наш replay-ключ, бюджеты. Их переносим как рантайм-обвязку, и конформанс это проверяет только косвенно.

---
## 5. «Нормативная семантика + эталонный интерпретатор» как исполняемая спецификация

### Prior art и что из него брать
| проект | как устроено | что заимствуем |
|---|---|---|
| **WebAssembly spec** | нормативный текст (формальные правила редукции) + **reference interpreter на OCaml** + `spec/test/core/*.wast` — текстовые тесты, которые гоняет и интерпретатор, и все браузеры | **главная модель**: текст → эталонный интерпретатор → корпус тестов, и все три в одном репозитории; тест-корпус — единственный арбитр |
| **JSON Schema Test Suite** | `tests/draft2020-12/*.json`: массив `{description, schema, tests:[{description, data, valid}]}`; **реализация-агностичный** формат, десятки реализаций на разных языках гоняют один корпус; есть `optional/` для необязательных частей | **формат файла кейса** (описание + фикстура + ожидание), разделение **обязательное / optional**, и «harness на стороне реализации» |
| **CommonMark spec** | `spec.txt`: примеры внутри самого текста спеки (` ```````example `` `), `spec_tests.py` их извлекает → в тест | **идея вшивать примеры прямо в `semantics/*.md`** и извлекать их скриптом: тогда текст физически не может разойтись с тестами |
| **SQLite sqllogictest** | текстовые файлы с командами и **хешем ожидаемого результата** вместо самого результата (для больших выдач); режим сравнения с эталонной БД | **хеш вместо полной выдачи** для тяжёлых кейсов — прямо ложится на наш канонический JSON + sha256 |
| UNVERIFIED (по памяти, не проверял в этот заход): точные пути файлов и имена полей в перечисленных проектах могут отличаться; при реализации свериться с их репозиториями |

**Главный урок из всех четырёх:** корпус тестов — это и есть спецификация. Текст нужен людям, интерпретатор — чтобы корпус можно было расширять дёшево, но арбитр — корпус. Поэтому в §15.1 `conformance/` важнее, чем `semantics/`, и kill 14 формулируется через корпус, а не через «LLM понял текст».

### Формат файла конформанс-кейса (наш, JSON)
`conformance/cases/<caseId>.json`:
```jsonc
{
  "caseId": "hotel_pitch/basic-3-hotels",
  "specRef": { "flowId": "hotel_pitch", "version": 7, "specHash": "sha256-..." },
  "tier": "required",                    // required | optional (как optional/ в JSON Schema Test Suite)
  "features": ["map", "diverge", "judge_panel", "loop"],  // какие примитивы нужны -> реализация может честно скипнуть optional-кейс
  "env": {                                // единственный источник недетерминизма
    "now": "2026-03-01T12:00:00.000Z",
    "seed": 42,
    "humanInputs": [{ "atNode": "approve", "iteration": 0, "value": { "approved": true } }]
  },
  "input": { },
  "cassetteKeys": ["sha256-...", "sha256-..."],   // подмножество кассет, нужное кейсу (для частичной выгрузки)
  "expect": {
    "nodeOutputs": {                      // канонический JSON выхода каждого узла
      "load_hotels": { "mode": "exact", "valueHash": "sha256-..." },
      "score":       { "mode": "unordered-by-key", "keyPath": "$.hotelId", "valueHash": "sha256-..." },
      "pitches":     { "mode": "exact", "value": { } }     // мелкие кладём значением, крупные — хешем (урок sqllogictest)
    },
    "renderedPrompts": { "pitch_gen#0": { "mode": "normalized-text", "valueHash": "sha256-..." } },
    "toolCalls": [{ "node": "load_hotels", "name": "db.hotels", "argsHash": "sha256-..." }],
    "controlFlow": {                      // «те же ветки, то же число итераций» из §15.1
      "branchesTaken": [{ "node": "route", "branch": "premium" }],
      "loopIterations": { "verify_fix": 2 },
      "nodesSkipped": ["fallback_cheap"]
    },
    "finalOutput": { "mode": "exact", "valueHash": "sha256-..." }
  }
}
```

### Контракт адаптера для чужой реализации
Чужая реализация поставляет **один исполняемый файл-харнесс** (как в JSON Schema Test Suite), общающийся по stdin/stdout построчным JSON (NDJSON) — язык и фреймворк неважны:
```jsonc
// → harness
{"op":"load","specPath":"flows/hotel_pitch@7.yaml"}
{"op":"run","caseId":"...","input":{...},"env":{...},"cassetteDir":"conformance/cassettes"}
// ← harness (одна строка на событие)
{"ev":"node.end","node":"load_hotels","output":{...}}
{"ev":"prompt.rendered","node":"pitch_gen","index":0,"messages":[{"role":"user","content":"..."}]}
{"ev":"tool.call","node":"load_hotels","name":"db.hotels","args":{...}}
{"ev":"branch","node":"route","branch":"premium"}
{"ev":"loop.iteration","node":"verify_fix","n":2}
{"ev":"run.end","output":{...}}
```
Требования к харнессу — ровно пять, и все проверяемы:
1. модели и тулы вызываются **только** через кассету (сеть в песочнице запрещена — гоняем с отключённым сетевым доступом, это автоматическая проверка);
2. время и случайность — только из `env`;
3. каждое событие выдаётся **до** того, как его результат использован (иначе нельзя локализовать расхождение);
4. падение = событие `{"ev":"error", "node":..., "code":...}`, а не молчание;
5. харнесс не читает `expect` — файл кейса ему передаётся **без секции `expect`** (сравнивает наш ранер).

### Правила сравнения (нормативные, в `semantics/comparison.md`)
1. **Выходы узлов** сравниваются как `canonicalize(output)` байт-в-байт. Никакого «примерно равно» для не-LLM узлов.
2. **Промты**: нормализация `NFC → \r\n|\r → \n → rtrim каждой строки → 3+ пустых строки → 2 → trim документа`, затем точное сравнение. Роли и порядок сообщений — точно. Порядок тулов в запросе — по `name` (мы сортируем, реализация обязана тоже — это записано в семантике).
3. **Параллельные ветки** (`parallel`, `map`, `diverge`) сравниваются **как мультимножество по ключу**, не по порядку. Ключ объявлен в спеке узла (`keyPath`, напр. `$.hotelId`; для `diverge` — индекс варианта, потому что варианты различимы по `vary`-параметрам). Если ключ не объявлен — сравниваем по `canonicalize` каждого элемента как мультимножество (сортируем канонические строки). **Никогда не сравниваем параллельные результаты по индексу массива** — это встроенный ложноположительный провал.
4. **Числа** сравниваются после канонизации, т.е. по ECMAScript-представлению. Значит `1.0` и `1` равны, а `0.1+0.2` и `0.3` — нет. Для агрегатов (`avg`, `score`) семантика обязана задать округление явно (`round(x, 4)` в узле), иначе реализация на Python даст другой последний бит.
5. **Ошибки** сравниваются по нашему коду ошибки (`E_SCHEMA_INVALID`, `E_BUDGET_EXCEEDED`), не по тексту.
6. **Usage/стоимость/латентность НЕ сравниваются** — они не часть семантики.
7. **Расхождение локализуется на первом различии в топологическом порядке** и отчёт печатает: узел, режим сравнения, canonical-diff (см. §2) — иначе LLM, чинящий свою реализацию, не сойдётся за разумное число итераций.

### Эталонный интерпретатор
- Пишем на TS, **тот же код, что в проде** (не вторая реализация!) — но собранный в изолированный пакет: `zod` + `canonicalize` в зависимостях, порты (модель, тул, время, случайность, человек) — интерфейсы, реализованные кассетой.
- Это даёт бесплатно: kill 5 (replay), генерацию `expect`-секций кейсов (кейс записывается прогоном, а не пишется руками), и проверку самого бандла на импорте (§4, шаг 6).
- Риск честно: «эталонный = продовый» означает, что баг ядра попадёт и в спеку, и в тесты. Противовес — мутационные тесты компилятора (kill 1) и то, что вторая реализация (Mastra, kill 14) ловит расхождения между текстом семантики и кодом.

---
## 7. Codegen в VoltAgent TS (ПРОВЕРЕНО живой пробой `probe-fe/codegen-probe.mjs`)

### Выбор инструмента
| подход | версия/лицензия/свежесть | плюсы | минусы | вердикт |
|---|---|---|---|---|
| **шаблонные строки + `prettier`** | prettier 3.9.6 / MIT / 2026-07-21 | нулевая сложность; сгенерированный код читается в диффе шаблона; детерминизм печати гарантирует prettier; **идемпотентность проверена: `format(format(x)) === format(x)` → true** | нет проверки синтаксиса на этапе сборки строки — опечатка вылезет только в `tsc` | **БЕРЁМ** |
| `ts-morph` | 28.0.0 / MIT / 2026-04-12 | строит настоящее TS-AST, умеет менять существующий файл, даёт типовую информацию | тянет весь `typescript` как рантайм-зависимость; API многословный; форматирование всё равно доводить prettier'ом; наш кейс — **генерация с нуля**, не рефакторинг чужого кода | НЕ для codegen; **держим на примете для «умного апдейта» ранее сгенерированного файла с ручными правками** — но это анти-паттерн (см. ниже) |
| `@babel/generator` | 8.0.5 / MIT / 2026-09-10 | быстрый принтер AST | AST надо ещё построить (`@babel/types`), TS-типы в Babel — граждане второго сорта, придётся собирать `TSTypeAnnotation` руками; ради чего — неясно | НЕТ |

**Решающий довод.** Генерируемый файл — **артефакт, а не исходник**: он помечен `/* GENERATED … DO NOT EDIT */`, содержит хеш спеки, и перегенерируется целиком. В этом режиме AST-инструменты не дают ничего, кроме веса. ts-morph был бы нужен, если бы мы правили код, написанный человеком, — а мы этого делать не собираемся именно потому, что kill 15 требует «собирается и запускается **без ручных правок**».

### Живой результат
Из списка узлов IR (`tool` → `andThen`, `map` → `andForEach`, `llm` → `andAgent`) генератор на 25 строк даёт:
```ts
import { createWorkflowChain } from "@voltagent/core";
import { z } from "zod";
/* GENERATED from spec hotel_pitch@7 sha256-deadbeef — DO NOT EDIT */
export const hotel_pitch = createWorkflowChain({
  id: "hotel_pitch",
  name: "Hotel Pitch",
  purpose: "pitch hotels",
  input: z.object({ filters: z.record(z.string(), z.unknown()) }),
  result: z.object({ pitch: z.string() }),
})
  .andThen({
    id: "load_hotels",
    execute: async ({ data }) => ({
      ...data,
      load_hotels: await tools.hotelsByFilters(data.filters),
    }),
  })
  .andForEach({
    id: "score",
    items: ({ data }) => data.hotels,
    concurrency: 8,
    step: scoreStep,
  })
  .andAgent(async ({ data }) => `Pitch these: ${JSON.stringify(data.top)}`, pitchAgent, {
    schema: z.object({ pitch: z.string() }),
  });
```
Ядро генератора — **диспетчеризация по `kind` через таблицу эмиттеров** (Strategy, никаких `if/else`):
```ts
type Emitter = (n: IRNode, ctx: EmitCtx) => string;
const EMITTERS: Record<IRNode['kind'], Emitter> = {
  const:    emitConst,   code:  emitCode,     tool:   emitTool,    llm:      emitAgent,
  map:      emitForEach, parallel: emitAll,   switch: emitWhenChain, loop:   emitLoop,
  race:     emitRace,    try:   emitTry,      subflow: emitSubflow,
};
const emitChain = (ir: IRFlow) =>
  ir.nodes.map((n) => EMITTERS[n.kind](n, ctx)).join('');
```
Фиксированные опции prettier (входят в бандл как `targets/voltagent/.prettierrc`, иначе байты зависят от машины):
`{ parser: 'typescript', printWidth: 100, semi: true, singleQuote: false, trailingComma: 'all', arrowParens: 'always', endOfLine: 'lf' }`.

### Что генератор обязан делать сверх «перевести узлы»
1. **Zod-схемы из реестра типов** (`types/`) — генерятся в отдельный `schemas.ts`, шаг ссылается на `S.HotelScore`, а не инлайнит. Иначе один enum размазан по 15 местам и kill 6 (распространение enum) не выполняется.
2. **Стабильный порядок всего**: узлы — в топологическом порядке спеки, импорты — отсортированы, ключи объектных литералов — в фиксированном порядке эмиттера. Тогда дифф сгенерированного кода между версиями спеки читается человеком.
3. **Заголовок с `specHash`** — при запуске проверяется, что `specHash` в коде совпадает с тем, что в `manifest.json` (защита от «отредактировали спеку, забыли перегенерить»).
4. **`switch` → цепочка `andWhen`** (у VoltAgent нет родного switch — подтверждено в `volt-primitives.md`), причём ветка `else` эмитится как `andWhen` с отрицанием конъюнкции всех предыдущих условий; генератор обязан выписать это явно, а не полагаться на порядок.
5. **Ручные вызовы агента в `andThen` вместо `andAgent`**, когда узлу нужен стриминг или инспекция tool-calls (`volt-primitives.md`: docs VoltAgent прямо это предписывают). Выбор делает генератор по флагам узла, а не человек.
6. **Дописывание usage**: `state.usage` копится только по `andAgent`; для узлов, ушедших в `andThen`, генератор эмитит явный учёт токенов, иначе бюджет врёт.

### Проверка сгенерированного (kill 15) — три уровня, все в CI
1. **`tsc --noEmit`** на сгенерированном проекте (`typescript@7.0.2`) — ловит несовпадение типов между Zod-схемами шагов. Это самая ценная проверка: она статически доказывает, что биндинги IR типо-корректны в целевом коде.
2. **`npm i && npm run build`** в распакованном бандле из чистого кэша — доказывает, что `targets/voltagent/package.json` самодостаточен (у VoltAgent peer `ai@^6` — пин обязателен).
3. **Прогон `conformance/` через тот же NDJSON-харнесс (§5)**: генератор дополнительно эмитит `harness.ts`, который подключает кассету вместо провайдера (`andTap` — штатное место для записи/сверки, он не ломает поток при ошибке) и печатает события. 100% кейсов — и есть kill 15.
4. Плюс дешёвая проверка детерминизма самого генератора: `codegen(spec) === codegen(spec)` на 100 прогонах и `prettier.format(x) === prettier.format(prettier.format(x))` (**проверено: true**).

---
## Сводка решений (для ведущего)

| вопрос | решение | версия/лицензия |
|---|---|---|
| канонический JSON | `canonicalize` (RFC 8785, автор — соавтор RFC) | 5.0.0 / Apache-2.0 / 2026-09-08 |
| хеш | `@noble/hashes` sha256, домен-сепарация, префикс `sha256-` | 2.4.0 / MIT / 2026-08-27 |
| дифф-движок | `jsondiffpatch` с `objectHash: o=>o.id`, `detectMove`, `textDiff` выключен | 0.7.6 / MIT / 2026-05-14 |
| wire-формат патчей | `rfc6902` (RFC 6902) | 5.3.0 / MIT / 2026-07-23 |
| YAML | `yaml` v1.2 core + фиксированные `ToStringOptions` (round-trip проверен) | 2.9.0 / ISC / 2026-05-11 |
| упаковка бандла | детерминированный `tar` (`tar-stream`), хеш по `.tar`, не по `.tar.gz` | 3.2.1 / MIT / 2026-08-25 |
| подпись | **не в v1**; зарезервировать `manifest.signatures` вне merkleRoot | sigstore 5.0.0 / Apache-2.0 |
| кассеты | **свой формат на уровне порта**, не HTTP; msw только как отладочный второй слой | msw 2.15.0 / MIT |
| codegen | шаблонные строки + `prettier` с фиксированным конфигом; ts-morph/babel — нет | prettier 3.9.6 / MIT |
| вторая цель миграции (kill 14) | **Mastra** (почти 1:1 по комбинаторам), LangGraph — как стресс-тест семантики | @mastra/core 1.66.0 / Apache-2.0 / 2026-09-11 |

**НЕ БРАТЬ (мёртвые/опасные):** `fast-json-patch` (2022), `deep-object-diff` (2022), `@pollyjs/core` (2023), `safe-stable-stringify` для хешей (молча коэрсит BigInt/NaN/циклы), `fast-json-stable-stringify` для хешей (NaN→null молча, 3 года без релиза).
