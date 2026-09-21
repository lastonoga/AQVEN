# ADR-0024. Studio — SPA на Vite, а не приложение Next.js

> Статус: **частично изменено [ADR-0025](0025-python-engine.md), [ADR-0028](0028-studio-api-contract.md)** (2026-09-16)
> Дата: 2026-09-16
>
> ADR-0025 §8 и ADR-0028 меняют обоснование моков и SPA-фолбэк: бэкенд — FastAPI, поэтому довод за целевой слой
> `@aqven/mock-server` на `OpenAPIHono` + MSW с общими с бэкендом `createRoute` пропадает; источник моков — OpenAPI
> от FastAPI, моки типизируются из `schema.d.ts`, инструмент — открытый вопрос 9 ADR-0028; `aqven dev` отдаёт
> `index.html` на путь вне `/api` и `/mcp/`, потому что MCP живёт на том же порту (ADR-0028 §3). Остаются верными и
> действуют: `apps/studio` — SPA на Vite без серверного рантайма, выбранный стек сборки, маршрутов, локализации и
> компонентов; данные через порты с адаптерами; `aqven dev` раздаёт `apps/studio/dist` и API с одного порта;
> правило «в `apps/studio` нет импортов `next`, `ai`, `@ai-sdk/*`, `@openrouter/*`».
> Зависит от: [ADR-0017](0017-files-as-source-of-truth.md)
> Меняет: [DECISIONS.md](../DECISIONS.md) — строка «Фронтенд»; [15. Studio](../15-studio-frontend.md) §1–§2, [20. Репозиторий](../20-repo-and-tooling.md) — раскладка `apps/studio`

## Контекст

Выбор Next.js 16 в [15. Studio](../15-studio-frontend.md) опирался на признаки размещённого
мультитенантного продукта: RSC-оболочка маршрута, Server Actions с `updateTag` для реестров,
`proxy.ts` с сессией, прокси `app/api` с подстановкой `Authorization`.

[ADR-0017](0017-files-as-source-of-truth.md) сделал основным режимом локальный инструмент: определения —
файлы в рабочем дереве пользователя, `aqven dev` поднимает API на одном порту, режим `hosted` — второй
приоритет. Владелец зафиксировал: мультитенантный SaaS не нужен.

Дизайн Workflow Studio почти целиком клиентский: канвас React Flow, чат assistant-ui, тянущиеся
сплиты, шторка вызова, раскрывающиеся матрицы прогона. В Next каждый такой регион требует
`'use client'` или `dynamic(..., { ssr: false })`, а серверный рендер ничего не даёт: SEO нет,
анонимного пользователя нет.

## Решение

**`apps/studio` — SPA на Vite, статическая сборка раздаётся `aqven dev`.** Прежний `apps/playground`
удалён, Studio его полностью заменяет.

| Слой | Что берём | Версия | Лицензия |
|---|---|---|---|
| Сборка | `vite` + `@vitejs/plugin-react` + `@rolldown/plugin-babel` с `reactCompilerPreset` | 8.3.0 / 6.1.1 / 0.2.4 | MIT |
| Маршруты и состояние в URL | `@tanstack/react-router` + `@tanstack/router-plugin`, файловые маршруты, `validateSearch` | 1.170.36 / 1.168.38 | MIT |
| Локализация | `use-intl` (ядро next-intl без Next), локали `en`, `ru` | 4.14.5 | MIT |
| Компоненты | shadcn CLI, стиль `radix-nova`, `radix-ui`, `cn` | 4.21.0 / 1.6.7 / 0.3.0 | MIT |
| Чат | `@assistant-ui/react` + `@assistant-ui/react-markdown`, `useLocalRuntime` | 0.15.20 / 0.14.15 | MIT |
| Стили | `tailwindcss` + `@tailwindcss/vite` | 4.3.3 | MIT |
| Шрифты | `@fontsource-variable/geist`, `@fontsource-variable/geist-mono` | 5.3.0 | OFL-1.1 |

Состояние, которым можно поделиться ссылкой, живёт в search-параметрах маршрута через
`validateSearch`; `nuqs` не нужен. Данные идут через порты (Port/Adapter): сейчас адаптеры на
фикстурах дизайна, позже — HTTP-адаптер к API `aqven dev`. В режиме разработки Vite проксирует `/api`
на `aqven dev`.

## Альтернативы

| Вариант | Почему отвергнут |
|---|---|
| Next.js 16 (App Router) | Его преимущества — RSC, Server Actions, `proxy.ts`, серверные проверки прав — нужны размещённому мультитенантному продукту. Локальному инструменту они добавляют второй серверный процесс рядом с `aqven dev` и границы `'use client'` вокруг каждого региона |
| Next.js со `output: 'export'` | Теряются `proxy.ts` и Server Actions, а динамические сегменты (`workflowId`, `runId`) требуют перечисления на сборке — это SPA с лишними ограничениями |
| React Router 8 | Годится, но у TanStack Router типизированные search-параметры встроены, это закрывает правило «ссылка на узел, вкладку и строку обязана работать» без `nuqs` |
| `react-i18next` | Сообщения ICU и API `use-intl` совпадают с next-intl; компоненты не привязаны к фреймворку |

## Последствия

- `aqven dev` раздаёт `apps/studio/dist` и API с одного порта, отдельного процесса фронтенда нет.
- Vitest 5 и Studio используют один Vite-конфиг.
- Разделы [15. Studio](../15-studio-frontend.md) про RSC-оболочку, Server Actions, `proxy.ts`
  и `app/api` больше не действуют; остальные решения (React Flow, shadcn, Tailwind v4, правила
  разделения состояния) сохраняются.
- `eslint-config-next` не ставится; ESLint 10 в `apps/studio` остаётся ради правил хуков React.
- Пункт 5 [ADR-0007](0007-single-operation-contract.md) (Server Actions для UI-состояния) больше не применим:
  серверного рантайма у Studio нет, UI-состояние живёт в search-параметрах и локальных сторах.
- Адаптеры на фикстурах за портами — промежуточный шаг переноса дизайна. Целевой слой моков из
  [frontend/mocks.md](../frontend/mocks.md) (`@aqven/mock-server` на `OpenAPIHono` + MSW, честные задержки
  и ошибки) не отменён: он подключается HTTP-адаптером за теми же портами, экраны не меняются.

## Проверка

- `pnpm --filter @aqven/studio build` собирает статический бандл без серверного рантайма.
- `aqven dev` отдаёт `index.html` для любого пути вне `/api`.
- В `apps/studio` нет импортов `next`, `ai`, `@ai-sdk/*`, `@openrouter/*` — правило `no-restricted-imports`.

## Пересмотр

Если размещённый мультитенантный режим станет основным: сессии, права до отрисовки, серверные
мутации реестров. Компоненты и `use-intl` не зависят от фреймворка, переезд затрагивает маршруты.
