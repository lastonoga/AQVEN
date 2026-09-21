# Срез 7: наш дизайн — TypeScript как язык авторинга IR

> Вопрос среза: как выглядит конкретная архитектура, где TS строит граф, а не исполняет его, и что она ломает.

## Что нашли

| Факт | Значение для нас | Источник |
|---|---|---|
| CDK: `cdk synth` даёт cloud assembly (CFN-шаблон + ассеты) в `cdk.out`; `cdk.out` держат в `.gitignore` | Модель «код → артефакт» реальна, но артефакт **не коммитят** | [configure-synth](https://docs.aws.amazon.com/cdk/v2/guide/configure-synth.html), [ref-cli-cmd-synth](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-synth.html) |
| Pulumi: программа **не** синтезируется в статический артефакт; language host исполняет её и шлёт `RegisterResource` движку **во время деплоя** | Pulumi — контрпример гипотезе, а не подтверждение. Брать CDK-ветку, не Pulumi-ветку | [resource-registration](https://pulumi-developer-docs.readthedocs.io/latest/docs/architecture/deployment-execution/resource-registration.html), [how-pulumi-works](https://www.pulumi.com/docs/iac/guides/basics/how-pulumi-works/) |
| Cube: JS-модель исполняется **в фазе компиляции модели**, `asyncModule()` — async-функция «в конце compile phase», может ходить в API | Cube — тоже не чистый synth: модель может зависеть от сети на компиляции. Наш синтез обязан быть оффлайн | [dynamic/javascript](https://docs.cube.dev/docs/data-modeling/dynamic/javascript) |
| Проба: построение 100-узлового графа билдером + канонизация — **0.07 мс**; весь `npx tsx synth.ts` — **0.80 с** холодный, **0.29 с** тёплый, node v20.19.0, tsx 4.23.13 | Синтез бесплатен, цена — старт процесса и трансформация TS | проба `scratchpad/probe-ts/synth.ts` |
| `tsx` 4.23.13 (MIT, 2026-08-30), `jiti` 2.7.0 (MIT), `ts-blank-space` 0.9.0 (Apache-2.0), `@swc/core` 1.16.2 (2026-09-13) — все живые | Загрузчик TS есть и он не риск | `npm view` |
| Kill 14/15 опирается на бандл: LLM даётся **развёрнутая до примитивов** версия и эффективная конфигурация, а не исходник; ADR-0017 (идентичность = путь в ФС, промт отдельным файлом) TS-файлам не противоречит | Экспорт вообще не видит TS, если IR коммитится; раскладка `flows/<id>/` переживает смену YAML→TS | [18 §11](../18-export-and-conformance.md), [ADR-0017](../adr/0017-files-as-source-of-truth.md) |

## 1. Форма DSL

Правило одно: **функция-билдер вызывается ровно один раз на синтезе и возвращает не значения, а типизированные ссылки** (`Ref<T>`). Замыкание `map(over, item => …)` вызывается на синтезе с символическим `$item` — тело строит узел, а не считает. Это CDK-ветка, не Pulumi-ветка.

```ts
import { flow, tool, map, code, call, llm, sw, human, component, goto, konst } from "@aqven/dsl";
import { diverge, judge, criticLoop } from "@aqven/std";
import { hotelsByFilters } from "@aqven/lib/db";
import { pickTopK, renderPitch } from "./code/pitch.js";
import * as T from "./types.js";

const pitchGen = component("pitch_gen",
  { in: { hotels: T.Hotel.array(), request: T.TourRequest }, out: T.Pitch })(
  (p) => llm("gen", {
    description: "Генерация питча по трём отелям", archetype: "generator",
    prompt: "pitch_gen", modelRole: "writer", overrides: { maxOutputTokens: 1200 },
    allowedSets: [{ type: T.FeatureId, from: p.hotels.at("*").features.at("*").id }],
    outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
    in: { hotels: p.hotels, request: p.request }, out: T.Pitch,
  }));

export default flow("hotel_pitch", {
  input: T.TourRequest, output: T.PitchText, context: ["date", "locale"],
  budget: { usdMicros: 400_000, seconds: 120, tokens: null }, components: { pitchGen },
})(($) => {
  const loadHotels = tool("load_hotels", {
    description: "Отели по фильтрам заявки", tool: hotelsByFilters, effect: "read",
    ttlSeconds: 3600, timeoutMs: 10_000, in: { filters: $.input.filters }, out: T.Hotel.array(),
  });

  const scoreHotels = map("score_hotels", {
    over: loadHotels.out, itemType: T.Hotel, concurrency: 8, onItemError: "skip",
    maxItems: 200, budget: { usdMicros: 80_000 },
  }, (item) => llm({
    archetype: "scorer", prompt: "score_hotel", modelRole: "small_fast",
    overrides: { seed: 7, maxOutputTokens: 400 },
    outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
    in: { hotel: item, request: $.input }, out: T.HotelScore,
  }));

  const top3 = code("top3", { fn: pickTopK, timeoutMs: 5_000, out: T.Hotel.array(),
    in: { scores: scoreHotels.out, hotels: loadHotels.out, k: konst(3, T.Int) } });

  const pitches = call("pitches", diverge(T.Pitch), { params: { body: pitchGen },
    in: { hotels: top3.out, request: $.input, n: konst(3, T.Int),
          vary: konst({ temperature: [0.4, 0.8, 1.1] }, T.VaryPlan) } });

  const pick = call("pick", judge(T.Pitch), {
    in: { candidates: pitches.out, request: $.input, mode: konst("pairwise", T.JudgeMode),
          swapPositions: konst(true, T.Bool), modelRole: konst("judge_strong", T.ModelRole) } });

  const finalPitch = sw("final_pitch", { on: pick.out.decision, onType: T.PitchDecision,
    out: T.Pitch,
    cases: { accept: pick.out.best, revise: goto(() => fix), escalate: goto(() => review) } });

  const fix = call("fix", criticLoop(T.Pitch), { budget: { usdMicros: 100_000 },
    in: { pitch: pick.out.best, request: $.input, maxIter: konst(2, T.Int),
          threshold: konst(0.8, T.Score), select: konst("best", T.LoopSelect),
          modelRole: konst("writer", T.ModelRole) } });

  const review = human("review", { form: T.PitchReviewForm, timeoutSeconds: 86_400,
    onTimeout: "escalate", in: { pitch: pick.out.best, verdict: pick.out }, out: T.Pitch });

  const render = code("render", { fn: renderPitch, timeoutMs: 5_000, out: T.PitchText,
    in: { pitch: finalPitch.out, hotels: loadHotels.out } });

  return render.out;
});

| Что видно в примере | Как выражено |
|---|---|
| Типы | zod-схемы из `types.ts` (zod 4.6.2 по DECISIONS); `Ref<T>` параметризован тем же типом, `in:` типизируется структурно — несовпадение слота ловит `tsc`, а не компилятор IR |
| Где живёт промт | **не здесь**: `prompt: "score_hotel"` — ключ файла `score_hotel.prompt.md`. Текст в TS запрещён линтом |
| Где живёт код | `fn: pickTopK` — импорт именованного экспорта из `code/*.ts`. Тело не инлайнится: синтез пишет в IR `{ library, name, version, hash }` по пути модуля + имени экспорта + хешу исходника |
| Комбинаторы | функции `map/sw/call/human` — то же ядро §03, ни одного нового примитива. `goto(() => fix)` — отложенная ссылка, она же сохраняет `order` = порядок объявления |
| Проекции `via`, и чего в DSL нет | цепочка свойств на `Ref` (`pick.out.best`, `.at("*")`) — Proxy, пишущий путь и печатающий `$ref` §04 §2.1. Обратное — `if/for/await` над `Ref` — невозможно: `Ref` не `Promise` и не число, арифметика и условие над ним типизируются в `never`, а Proxy бросает на `valueOf`/`then` |

## 2. Что остаётся декларативным

Граница проходит по вопросу «правит ли это не-инженер и есть ли у этого своя версия и хеш». Если да — файл-данные, TS на него только ссылается ключом.

| Сущность | Носитель | Почему |
|---|---|---|
| Промты, фрагменты (топология, привязки и комбинаторы — наоборот, только TS) | `*.prompt.md`, `prompts/<key>.md` | ADR-0017: правят чаще всего, дифф прозы должен быть построчным; `prompt_pins` входят в `release_hash` отдельно от `spec_hash` |
| Профили моделей, политики, бюджеты проекта | `models/*.yaml`, `policies.yaml` | меняются в проде без правки воркфлоу; в `uses` они пины `kind: model_profile` |
| Реестр типов | `types/*.ts` (zod) — исключение | тип нужен и `tsc`, и рантайму; zod-схема сразу данные и типы, дублировать в YAML вредно |
| Формы human, view, датасеты, кассеты, `aqven.lock.yaml` | файлы-данные | их читают не-инженеры и внешние тулы; лок генерируется и коммитится |

## 3. Синтез

| Вопрос | Ответ |
|---|---|
| Когда и чем | `aqven synth` в pre-commit и CI; в дев-режиме watcher на `flows/**/*.ts`; внутри `flow_compile` MCP — перед этапом 1 компилятора. `tsx`/`jiti` загружает модуль (без сети, без `fs`, без `Date.now` — синтез гоняется в песочнице модели прав Node с пустым allowlist — UNVERIFIED: на node v20.19.0 флага `--permission` нет (`bad option`), он `--experimental-permission`; целевую версию Node надо зафиксировать отдельно; нарушение = ошибка `SYNTH_IMPURE`) |
| Что на выходе | ровно тот же документ §04: `flows/<flow_id>/flow.yaml` + `nodes/<node_id>.yaml` + `<node_id>.prompt.md` не трогается |
| Коммитим ли | **да, коммитим.** Это единственное расхождение с CDK (`cdk.out` в `.gitignore`), и оно вынужденное: без коммита IR дифф версий, канвас, `spec_hash`, кассеты, бандл и kill 13/14/15 теряют вход. CI-гейт `aqven synth --check` падает, если сгенерированное ≠ закоммиченного |
| Детерминизм | инкрементальный путь §07 §9.2 не меняется (он над IR, классы `COSMETIC/BEHAVIORAL/STRUCTURAL` как раньше); синтез обязан быть фикспойнтом: `synth(ts)` дважды даёт те же байты; `order` = порядок объявления, никаких `Date`, `Math.random`, обхода `Object.keys` по вставке — только явный `order` |
| Как быстро | синтез графа на 100 узлов — **0.07 мс**; весь процесс 0.29 с тёплым, 0.80 с холодным (проба). Внутри демона `flow_compile` TS-модуль уже в кэше модулей — синтез дешевле этапа `resolve` |

## 4. Канвас

Три модели: **(A)** канвас правит TS обратной кодогенерацией; **(B)** канвас правит IR, TS устаревает; **(C)** канвас правит только то, что вне TS. Выбрана **(C)**. (A) отпадает: обратная печать TS — это `ts-morph` над рукописным кодом, который 18 §9 отвергает («генератор пишет артефакт, а не исходник»), и она теряет структуру, ради которой TS и брался. (B) отпадает — две правды и молчаливый откат правки при следующем `aqven synth --check`.

| Канвас может менять | Носитель | Почему безопасно |
|---|---|---|
| Раскладка: позиции, зум, свёртки, группы | Postgres, LWW-канал | не часть определения — прямая строка ADR-0017 |
| Промт узла | `*.prompt.md` | файл вне TS, CAS по хешу байтов; `spec_hash` не меняется, меняется `prompt_pins` |
| `meta` (описания, заметки) | вне `spec_hash` | класс `COSMETIC` |
| Скалярные поля узла из белого списка: `overrides.*`, `concurrency`, `maxItems`, `timeoutMs`, `retry`, `budget`, `ttlSeconds`, `modelRole` | **`flows/<id>/overlay.yaml`**, накладывается поверх синтезированного IR | это и есть точное подмножество: значения-литералы без ссылок. Оверлей коммитится, проходит те же правила компилятора, класс `BEHAVIORAL` |
| Топология: узлы, рёбра, привязки, компоненты, `switch`-ветки | **нельзя** | канвас показывает диалог «нужна правка TS» и передаёт задачу агенту; ручной режим — правка в редакторе кода в той же панели |

Цена: канвас перестаёт быть редактором графа и становится инспектором с ручками. Допустимо только потому, что основной пользователь — инженер в Claude Code (мотив ADR-0017); для продукта, где вход единственный и это UI, выбор был бы обратным.

## 5. Роль агента и `flow_patch`

| Операция | Судьба |
|---|---|
| `flow_patch` (RFC 6902 по IR) | **отмирает как основной путь.** Агент правит `.ts` нативным Edit, дальше `aqven synth`. RFC 6902 по синтезированному IR — запись в генерируемый файл. Остаточно живёт для белого списка §4, но целью становится `overlay.yaml`: переименование в `flow_overlay_patch` |
| `flow_compile` | **растёт в важности.** Вход — путь к `.ts`; тул сам синтезирует и компилирует, возвращает `problems[]` с `instancePath` по IR плюс маппинг обратно на строку TS (source map синтеза: узел → `file:line` места вызова билдера) |
| Новое требование | **позиционный маппинг IR→TS обязателен.** Без него агент получает ошибку «R-15 на `nodes.render.in.pitch`» и не знает, какую строку TS править. Билдер записывает `Error().stack` на каждом вызове узла (в дев-синтезе) — это не в `spec_hash`, это в `.aqven/cache/sourcemap.json` |
| ADR-0007 «одна операция» | сохраняется: `aqven synth` — фаза внутри `flow_compile`, а не отдельный шаг. `flow_read`/`flow_diff`/`flow_estimates` не меняются: они и так над IR |

## 6. Что теряем против YAML

| Потеря | Насколько серьёзно |
|---|---|
| **Синтез — исполнение произвольного кода.** YAML нельзя было выполнить, `.ts` из чужого репозитория — можно | Серьёзно. Закрывается песочницей (права Node, пустой allowlist fs/net, таймаут) и тем, что синтез в облаке гоняется только для доверенных тенантов. Но это новый класс угрозы, которого не было |
| **Статический анализ без исполнения пропал.** Чтобы узнать топологию, надо запустить билдер | Средне. Граф детерминирован, песочница дешёвая, IR коммитится — «холодный» читатель (дифф, канвас, экспорт) берёт закоммиченный IR и кода не запускает вовсе |
| **Дифф стал двухслойным.** Ревьюят TS, а семантику классифицирует дифф IR | Средне. Косметическая правка TS (переименование локальной переменной) даёт нулевой дифф IR — это плюс; но PR содержит два изменённых артефакта, и правило «IR генерируемый, не правь руками» надо держать линтом |
| **Гарантия «нет кода» ослабла**: держится не на формате, а на дисциплине DSL — типы `Ref`, Proxy-ловушки, линт, песочница. Плюс канвас теряет правку топологии | Первое серьёзно и это самое хрупкое место дизайна: один `await` над `Ref`, пропущенный линтом, и мы Temporal. Второе серьёзно для не-инженера, приемлемо для целевого пользователя (§4) |
| **Kill 14 (воссоздание 1:1 в Mastra/LangGraph силами LLM)** | **Не страдает**, как и kill 13/15 — все трое живут над IR. Бандл §18 отдаёт развёрнутую до примитивов IR, `semantics/`, кейсы и кассеты; TS в бандл не попадает. Условие: IR коммитится (§3). Без коммита IR kill 14 требовал бы от чужой реализации нашего синтезатора и был бы провален |

## 7. Что выигрываем

| Выигрыш | Конкретно |
|---|---|
| `tsc` как первый компилятор | несовпадение типа слота, опечатка в имени поля, забытый обязательный слот ловятся в редакторе до `flow_compile`. Это правила R-09, R-10 бесплатно и мгновенно |
| Экстракция, слияние, преобразование — там, где они и должны быть | `code`-узлы становятся обычными импортируемыми функциями с zod-типами, тестируемыми vitest без рантайма воркфлоу. Открытый вопрос §04 «покрывают ли `via` все проекции» снимается: не покрыли — пиши `code` и импортируй |
| Повторное использование без нового примитива IR | цикл `for` в билдере, фабрика компонентов, хелпер — всё раскрывается в плоский IR на синтезе, IR не усложняется ни на поле |
| Навигация, рефакторинг, нативный агент | go-to-definition, find-references, LSP-переименование по всему проекту; Read/Edit/Grep по `.ts` вместо MCP-патчей — прямое усиление мотива ADR-0017 |

## 8. Вердикт

**TypeScript поверх YAML-IR, не вместо.** Формально: TS — язык авторинга, IR остаётся форматом хранения, обмена, диффа, канваса, экспорта и конформанса, и **коммитится вместе с TS**. Гипотеза заказчика подтверждается CDK и Cube, но не Pulumi — и именно различие Pulumi/CDK и есть линия, которую нельзя перейти: у нас нет «language host, исполняющего программу во время прогона», у нас `synth → артефакт → рантайм`. Рантайм не видит TS никогда.

YAML не умирает, а меняет роль: из авторского формата в транспортный и генерируемый. `flow-spec.authoring.json` (§04 §1.3) живёт для импорта чужих бандлов и правки без TS-тулчейна, но перестаёт быть главным входом.

| ADR | Что делать |
|---|---|
| Новый ADR-0018 «TypeScript как язык авторинга, IR как артефакт» | обязателен: фиксирует synth-контракт, требование коммитить IR, песочницу синтеза, запрет обратной кодогенерации |
| ADR-0007 (единый контракт операции) | **менять**: `flow_patch` перестаёт быть главной операцией записи; вход операций — путь к `.ts` плюс `overlay.yaml` |
| ADR-0016 (git как граница релиза) | **уточнить**: `aqven synth --check` становится обязательным гейтом релиза наравне с `aqven check` |
| ADR-0017 (файлы — источник истины) | **не менять**, усиливается; добавить строку «синтезированный IR — генерируемый файл, коммитится, руками не правится» |
| Новый ADR по канвасу (модель C) | нужен: белый список полей `overlay.yaml` и явный отказ от правки топологии мышью. ADR-0009/0011/0013/0014/0015 не затрагиваются — всё над IR и рантаймом |

Откат, если гарантия «нет кода» (§6) провалится на первом реальном воркфлоу: вернуться к YAML и вынести кастомную логику в `code`-узлы с zod-контрактами — это снимает исходную боль заказчика на 80% и не создаёт ни одной из шести потерь.
