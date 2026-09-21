# 98. Аудит версий пакетов

> Статус: ready
> Зависит от: [DECISIONS.md](DECISIONS.md), документы 01–22
> Источники: registry.npmjs.org, срез на 2026-09-11; пакеты Studio после [ADR-0024](adr/0024-studio-on-vite.md) — срез на 2026-09-16; PyPI JSON, срез на 2026-09-16 для Python-движка; PyPI JSON, срез на 2026-09-17 для [ADR-0030](adr/0030-local-browser-backend.md)

## Зачем этот слой

Комплект фиксирует версии пакетов как факты. Версия, которой нет в реестре, всплывёт только на
`pnpm install` у реализатора. Этот документ сверяет каждое упоминание версии в документах 01–22
с содержимым npm и фиксирует расхождения. `00-source-spec.ru.md` (исходник заказчика) из выборки
исключён.

Метод: `grep` по шаблонам `pkg@1.2.3`, `pkg 1.2.3`, «версии 1.2.3» и по ячейкам таблиц
«пакет | версия»; затем полный packument каждого пакета из registry.npmjs.org — заявленная версия
ищется в `versions`, `latest` берётся из `dist-tags`, лицензия — из манифеста `latest`.

## Итог

| Вердикт | Пар пакет→версия |
|---|---|
| СОВПАДАЕТ (заявлено = `latest`) | 161 |
| УСТАРЕЛО (версия реальна, есть новее) | 18 |
| НЕ СУЩЕСТВУЕТ | 2 — исправлены в файлах, таблица показывает состояние после правки |
| ПАКЕТА НЕТ | 0 |

Проверено 176 уникальных пакетов, 179 пар пакет→версия. Ни одного выдуманного имени пакета в комплекте нет.

## Таблица

Столбец «где» — номера документов; `apps/studio` — пакет установлен в Studio и сверен по срезу 2026-09-16.

| Пакет | Заявлено | В npm (`latest`) | Лицензия | Вердикт | Где |
|---|---|---|---|---|---|
| `@ai-sdk/anthropic` | 3.0.117 | 4.0.52 | Apache-2.0 | УСТАРЕЛО (пин: ось `ai@6`); заменено ADR-0025/0029 | 11 |
| `@ai-sdk/google` | 3.0.122 | 4.0.67 | Apache-2.0 | УСТАРЕЛО (пин: ось `ai@6`); заменено ADR-0025/0029 | 11 |
| `@ai-sdk/google-vertex` | 3.0.174 | 5.0.79 | Apache-2.0 | УСТАРЕЛО (пин: ось `ai@6`); заменено ADR-0025/0029 | 11 |
| `@ai-sdk/openai` | 3.0.112 | 4.0.65 | Apache-2.0 | УСТАРЕЛО (пин: ось `ai@6`); заменено ADR-0025/0029 | 11 |
| `@ai-sdk/openai-compatible` | 1.0.54 | 3.0.47 | Apache-2.0 | УСТАРЕЛО (пин: ось `ai@6`); заменено ADR-0025/0029 | 11 |
| `@ai-sdk/openai-compatible` | 2.0.75 | 3.0.47 | Apache-2.0 | УСТАРЕЛО (пин: ось `ai@6`); заменено ADR-0025/0029 | 11 |
| `@ai-sdk/provider` | 3.0.16 | 4.0.13 | Apache-2.0 | УСТАРЕЛО (пин: ось `ai@6`); заменено ADR-0025/0029 | 11 |
| `@ai-sdk/provider-utils` | 4.0.51 | 5.0.39 | Apache-2.0 | УСТАРЕЛО (пин: ось `ai@6`); заменено ADR-0025/0029 | 11 |
| `@ai-sdk/togetherai` | 2.0.81 | 3.0.48 | Apache-2.0 | УСТАРЕЛО (пин: ось `ai@6`); заменено ADR-0025/0029 | 02,11 |
| `@anthropic-ai/tokenizer` | 0.0.4 | 0.0.4 | Apache-2.0 | СОВПАДАЕТ | 07,08 |
| `@arizeai/phoenix-client` | 7.11.0 | 7.11.0 | Apache-2.0 | СОВПАДАЕТ | 12 |
| `@assistant-ui/core` | 0.3.19 | 0.3.19 | MIT | СОВПАДАЕТ | apps/studio |
| `@assistant-ui/react` | 0.15.20 | 0.15.20 | MIT | СОВПАДАЕТ | 15 |
| `@assistant-ui/react-markdown` | 0.14.15 | 0.14.15 | MIT | СОВПАДАЕТ | 15 |
| `@ax-llm/ax` | 24.0.18 | 24.0.18 | Apache-2.0 | СОВПАДАЕТ | 08 |
| `@babel/core` | 7.29.7 | 8.0.5 | MIT | УСТАРЕЛО (пин: `babel-plugin-react-compiler@1.0.0` зависит от `@babel/types ^7`, `@types/babel__core` 7.20.5 описывает Babel 7) | apps/studio |
| `@biomejs/biome` | 2.5.13 | 2.5.13 | MIT OR Apache-2.0 | СОВПАДАЕТ; для движка заменено ADR-0025 | 20 |
| `@boundaryml/baml` | 0.226.2 | 0.226.2 | MIT | СОВПАДАЕТ | 05 |
| `@changesets/cli` | 3.0.2 | 3.0.2 | MIT | СОВПАДАЕТ | 20 |
| `@codemirror/lang-json` | 6.0.2 | 6.0.2 | MIT | СОВПАДАЕТ | 15 |
| `@eslint/js` | 10.0.1 | 10.0.1 | MIT | СОВПАДАЕТ | apps/studio |
| `@fontsource-variable/geist` | 5.3.0 | 5.3.0 | OFL-1.1 | СОВПАДАЕТ | 15 |
| `@fontsource-variable/geist-mono` | 5.3.0 | 5.3.0 | OFL-1.1 | СОВПАДАЕТ | 15 |
| `@helicone/helpers` | 1.8.3 | 1.8.3 | Apache-2.0 | СОВПАДАЕТ | 12 |
| `@hono/zod-openapi` | 1.6.3 | 1.6.3 | MIT | СОВПАДАЕТ; заменено ADR-0025 | 02,15,20 |
| `@hookform/resolvers` | 5.9.1 | 5.9.1 | MIT | СОВПАДАЕТ | 15 |
| `@huggingface/jinja` | 0.5.10 | 0.5.10 | MIT | СОВПАДАЕТ | 08 |
| `@langchain/langgraph` | 1.4.14 | 1.4.14 | MIT | СОВПАДАЕТ | 18 |
| `@langfuse/client` | 5.11.1 | 5.11.1 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 12 |
| `@langfuse/core` | 5.11.1 | 5.11.1 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 12 |
| `@langfuse/otel` | 5.11.1 | 5.11.1 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 02,12,19,20 |
| `@langfuse/tracing` | 5.11.1 | 5.11.1 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 09,12 |
| `@lmnr-ai/lmnr` | 0.8.45 | 0.8.45 | Apache-2.0 | СОВПАДАЕТ | 12 |
| `@mastra/core` | 1.66.0 | 1.66.0 | Apache-2.0 | СОВПАДАЕТ | 18 |
| `@microsoft/fetch-event-source` | 2.0.1 | 2.0.1 | MIT | СОВПАДАЕТ | 15 |
| `@modelcontextprotocol/sdk` | 1.30.0 | 1.30.0 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 01,02,14,20 |
| `@monaco-editor/react` | 4.7.0 | 4.7.0 | MIT | СОВПАДАЕТ | 15 |
| `@noble/hashes` | 2.4.0 | 2.4.0 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 18 |
| `@openrouter/ai-sdk-provider` | 2.10.0 | 3.0.0 | Apache-2.0 | УСТАРЕЛО (пин: ось `ai@6`, peer `ai: ^6`); заменено ADR-0025/0029 | 02,11 |
| `@openrouter/ai-sdk-provider` | 3.0.0 | 3.0.0 | Apache-2.0 | СОВПАДАЕТ; заменено ADR-0025/0029 | 02,11 |
| `@opentelemetry/semantic-conventions` | 1.43.0 | 1.43.0 | Apache-2.0 | СОВПАДАЕТ | 12 |
| `@playwright/test` | 1.63.0 | 1.63.0 | Apache-2.0 | СОВПАДАЕТ | 20 |
| `@pollyjs/core` | 6.0.6 | 6.0.6 | Apache-2.0 | СОВПАДАЕТ | 13 |
| `@rjsf/shadcn` | 6.10.0 | 6.10.0 | MIT | СОВПАДАЕТ | 15 |
| `@rolldown/plugin-babel` | 0.2.4 | 0.2.4 | MIT | СОВПАДАЕТ | 15 |
| `@stdlib/stats-base-dists-chisquare-cdf` | 0.3.1 | 0.3.1 | Apache-2.0 | СОВПАДАЕТ; заменено ADR-0025/0029 | 13 |
| `@stdlib/stats-base-dists-normal-quantile` | 0.3.1 | 0.3.1 | Apache-2.0 | СОВПАДАЕТ; заменено ADR-0025/0029 | 13 |
| `@stdlib/stats-binomial-test` | 0.2.3 | 0.2.3 | Apache-2.0 | СОВПАДАЕТ; заменено ADR-0025/0029 | 13 |
| `@stdlib/stats-ttest` | 0.2.3 | 0.2.3 | Apache-2.0 | СОВПАДАЕТ; заменено ADR-0025/0029 | 13 |
| `@stdlib/stats-wilcoxon` | 0.2.3 | 0.2.3 | Apache-2.0 | СОВПАДАЕТ; заменено ADR-0025/0029 | 13 |
| `@tailwindcss/vite` | 4.3.3 | 4.3.3 | MIT | СОВПАДАЕТ | 15 |
| `@tanstack/react-query` | 5.102.8 | 5.102.8 | MIT | СОВПАДАЕТ | 15 |
| `@tanstack/react-router` | 1.170.36 | 1.170.36 | MIT | СОВПАДАЕТ | 02,15 |
| `@tanstack/react-table` | 9.2.4 | 9.2.4 | MIT | СОВПАДАЕТ | 15 |
| `@tanstack/react-virtual` | 3.14.12 | 3.14.12 | MIT | СОВПАДАЕТ | 15 |
| `@tanstack/router-plugin` | 1.168.38 | 1.168.38 | MIT | СОВПАДАЕТ | 15 |
| `@temporalio/workflow` | 1.23.0 | 1.23.0 | MIT | СОВПАДАЕТ | 18 |
| `@testcontainers/postgresql` | 12.1.0 | 12.1.0 | MIT | СОВПАДАЕТ | 16 |
| `@testing-library/dom` | 10.4.2 | 10.4.2 | MIT | СОВПАДАЕТ | apps/studio |
| `@testing-library/react` | 16.3.3 | 16.3.3 | MIT | СОВПАДАЕТ | apps/studio |
| `@types/babel__core` | 7.20.5 | 7.20.5 | MIT | СОВПАДАЕТ | apps/studio |
| `@types/node` | 24.10.1 | 22.20.3 | MIT | УСТАРЕЛО (`latest` указывает на линию 22; линия Node 24 — 24.13.5) | apps/studio |
| `@types/react` | 19.3.0 | 19.3.0 | MIT | СОВПАДАЕТ | apps/studio |
| `@types/react-dom` | 19.3.0 | 19.3.0 | MIT | СОВПАДАЕТ | apps/studio |
| `@vitejs/plugin-react` | 6.1.1 | 6.1.1 | MIT | СОВПАДАЕТ | 15 |
| `@vitest/coverage-v8` | 5.0.0 | 5.0.0 | MIT | СОВПАДАЕТ | 20 |
| `@voltagent/core` | 2.10.0 | 2.10.0 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 01,02,03,06,08,09,11,12,17,18,19,21 |
| `@voltagent/evals` | 2.0.5 | 2.0.5 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 02,08,13,20 |
| `@voltagent/langfuse-exporter` | 2.0.3 | 2.0.3 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 12,19 |
| `@voltagent/mcp-server` | 2.2.0 | 2.2.0 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 02,06 |
| `@voltagent/postgres` | 2.1.3 | 2.1.3 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 02,09,10,12,16,17 |
| `@voltagent/resumable-streams` | 2.0.1 | 2.0.2 | MIT | УСТАРЕЛО; заменено ADR-0025/0029 | 15 |
| `@voltagent/sandbox-blaxel` | 2.1.1 | 2.1.1 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 19 |
| `@voltagent/sandbox-daytona` | 2.0.3 | 2.0.3 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 19 |
| `@voltagent/sandbox-e2b` | 2.0.3 | 2.0.3 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 19 |
| `@voltagent/scorers` | 2.1.0 | 2.1.0 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 02,13 |
| `@voltagent/server-core` | 2.1.20 | 2.1.20 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 19 |
| `@voltagent/server-hono` | 2.0.14 | 2.0.14 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 02,15 |
| `@xyflow/react` | 12.11.6 | 12.11.6 | MIT | СОВПАДАЕТ | 02,15,20,21 |
| `ai` | 6.0.280 | 7.0.97 | Apache-2.0 | УСТАРЕЛО (пин: ось `ai@6`); заменено ADR-0025/0029 | 01,02,05,06,08,09,10,11,20,21 |
| `ajv` | 8.20.0 | 8.20.0 | MIT | СОВПАДАЕТ | 15 |
| `autoevals` | 0.3.0 | 0.3.0 | MIT | СОВПАДАЕТ | 13 |
| `babel-plugin-react-compiler` | 1.0.0 | 1.0.0 | MIT | СОВПАДАЕТ | 15 |
| `better-auth` | 1.7.4 | 1.7.4 | MIT | СОВПАДАЕТ | 14 |
| `braintrust` | 3.32.0 | 3.32.0 | MIT | СОВПАДАЕТ | 12 |
| `bullmq` | 6.3.4 | 6.3.4 | MIT | СОВПАДАЕТ | 17 |
| `canonicalize` | 5.0.0 | 5.0.0 | Apache-2.0 | СОВПАДАЕТ; заменено ADR-0025/0029 | 02,07,11,12,13,16,17,19,21,22 |
| `class-variance-authority` | 0.7.1 | 0.7.1 | Apache-2.0 | СОВПАДАЕТ | 15 |
| `cmdk` | 1.1.1 | 1.1.1 | MIT | СОВПАДАЕТ | 15 |
| `cn` | 0.3.0 | 0.3.0 | MIT | СОВПАДАЕТ | 15 |
| `compromise` | 14.17.0 | 14.17.0 | MIT | СОВПАДАЕТ | 13 |
| `cytoscape` | 3.34.3 | 3.34.3 | MIT | СОВПАДАЕТ | 15 |
| `d3-scale` | 4.0.2 | 4.0.2 | ISC | СОВПАДАЕТ | 12,15 |
| `dominators` | 1.1.2 | 1.1.2 | MIT | СОВПАДАЕТ | 07,15 |
| `drizzle-kit` | 0.31.10 | 0.31.10 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 02 |
| `drizzle-orm` | 0.45.2 | 0.45.2 | Apache-2.0 | СОВПАДАЕТ; заменено ADR-0025/0029 | 02,16,19,20 |
| `drizzle-zod` | 0.8.3 | 0.8.3 | Apache-2.0 | СОВПАДАЕТ; заменено ADR-0025/0029 | 16 |
| `elkjs` | 0.12.0 | 0.12.0 | EPL-2.0 OR GPL-3.0-or-later | СОВПАДАЕТ | 02,15,20,21 |
| `eslint` | 10.10.0 | 10.10.0 | MIT | СОВПАДАЕТ | 15,20 |
| `eslint-plugin-no-comments` | 1.2.1 | 1.2.1 | MIT | СОВПАДАЕТ | apps/studio |
| `eslint-plugin-react-hooks` | 7.1.1 | 7.1.1 | MIT | СОВПАДАЕТ | 15,20 |
| `eslint-plugin-react-refresh` | 0.5.7 | 0.5.7 | MIT | СОВПАДАЕТ | 15,20 |
| `eta` | 4.6.0 | 4.6.0 | MIT | СОВПАДАЕТ | 08 |
| `evalite` | 0.19.0 | 0.19.0 | — | СОВПАДАЕТ | 13 |
| `eventsource-parser` | 4.1.0 | 4.1.0 | MIT | СОВПАДАЕТ | 15 |
| `fast-check` | 4.10.0 | 4.10.0 | MIT | СОВПАДАЕТ | 20 |
| `fast-json-patch` | 3.1.1 | 3.1.1 | MIT | СОВПАДАЕТ | 16 |
| `fast-json-stable-stringify` | 2.1.0 | 2.1.0 | MIT | СОВПАДАЕТ | 13 |
| `gepa-ts` | 1.0.0 | 1.0.0 | MIT | СОВПАДАЕТ | 08 |
| `globals` | 17.12.0 | 17.12.0 | MIT | СОВПАДАЕТ | apps/studio |
| `gpt-tokenizer` | 4.0.0 | 4.0.0 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 08 |
| `graphile-worker` | 0.18.0 | 0.18.0 | MIT | СОВПАДАЕТ | 17 |
| `graphology-dag` | 0.4.1 | 0.4.1 | MIT | СОВПАДАЕТ | 07 |
| `graphology-traversal` | 0.3.1 | 0.3.1 | MIT | СОВПАДАЕТ | 07 |
| `handlebars` | 4.7.9 | 4.7.9 | MIT | СОВПАДАЕТ | 08 |
| `jsdom` | 30.0.1 | 30.0.1 | MIT | СОВПАДАЕТ | apps/studio |
| `json-canonicalize` | 3.0.1 | 3.0.1 | MIT | СОВПАДАЕТ | 13 |
| `json-edit-react` | 1.30.2 | 1.30.2 | MIT | СОВПАДАЕТ | 15 |
| `jsondiffpatch` | 0.7.6 | 0.7.6 | MIT | СОВПАДАЕТ | 04,15 |
| `jsonrepair` | 3.15.0 | 3.15.0 | ISC | СОВПАДАЕТ; заменено ADR-0025/0029 | 05 |
| `jstat` | 1.9.6 | 1.9.6 | — | СОВПАДАЕТ | 13 |
| `liquidjs` | 10.29.0 | 10.29.0 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 03,05,07,08,10,21 |
| `loro-crdt` | 1.16.1 | 1.16.1 | MIT | СОВПАДАЕТ | 14 |
| `lucide-react` | 1.46.0 | 1.46.0 | ISC | СОВПАДАЕТ | 15 |
| `microdiff` | 1.6.0 | 1.6.0 | MIT | СОВПАДАЕТ | 04 |
| `minhash` | 0.0.9 | 0.0.9 | MIT | СОВПАДАЕТ | 13,21 |
| `msw` | 2.15.0 | 2.15.0 | MIT | СОВПАДАЕТ | 13 |
| `neverthrow` | 8.2.0 | 8.2.0 | MIT | СОВПАДАЕТ | 20 |
| `next` | 16.3.4 | 16.3.5 | MIT | УСТАРЕЛО (не используется: Studio — SPA на Vite, ADR-0024) | 15 |
| `next-themes` | 0.4.6 | 0.4.6 | MIT | СОВПАДАЕТ (не используется, ADR-0024) | 15 |
| `nunjucks` | 3.2.4 | 3.2.4 | BSD-2-Clause | СОВПАДАЕТ | 08 |
| `nuqs` | 2.10.1 | 2.10.1 | MIT | СОВПАДАЕТ (не используется, ADR-0024) | 15 |
| `object-hash` | 3.0.0 | 3.0.0 | MIT | СОВПАДАЕТ | 17 |
| `openapi-fetch` | 0.17.0 | 0.17.0 | MIT | СОВПАДАЕТ | 15 |
| `openapi-typescript` | 7.13.0 | 7.13.0 | MIT | СОВПАДАЕТ | 02,15,20 |
| `opik` | 2.2.59 | 2.2.59 | Apache-2.0 | СОВПАДАЕТ | 12 |
| `pg` | 8.23.0 | 8.23.0 | MIT | СОВПАДАЕТ | 02 |
| `pg-boss` | 12.31.0 | 12.31.0 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 17 |
| `pg-transactional-outbox` | 0.6.5 | 0.6.5 | MIT | СОВПАДАЕТ | 17 |
| `prettier` | 3.9.6 | 3.9.6 | MIT | СОВПАДАЕТ | 18,20 |
| `prisma` | 8.0.0-rc.13 | 8.0.0-rc.13 | Apache-2.0 | СОВПАДАЕТ | 16 |
| `promptfoo` | 0.123.0 | 0.123.0 | MIT | СОВПАДАЕТ | 13 |
| `radix-ui` | 1.6.7 | 1.6.7 | MIT | СОВПАДАЕТ | 15 |
| `react` | 19.3.0 | 19.3.0 | MIT | СОВПАДАЕТ | 02,15 |
| `react-diff-viewer-continued` | 4.4.0 | 4.4.0 | MIT | СОВПАДАЕТ | 15 |
| `react-dom` | 19.3.0 | 19.3.0 | MIT | СОВПАДАЕТ | 15 |
| `react-hook-form` | 7.87.0 | 7.87.0 | MIT | СОВПАДАЕТ | 15 |
| `react-hotkeys-hook` | 5.3.3 | 5.3.3 | MIT | СОВПАДАЕТ | 15 |
| `react-resizable-panels` | 4.12.4 | 4.12.4 | MIT | СОВПАДАЕТ | 15 |
| `recharts` | 3.8.0 | 3.10.1 | MIT | УСТАРЕЛО (пин: пин из `shadcn/chart`) | 15 |
| `redact-pii` | 3.4.0 | 3.4.0 | MIT | СОВПАДАЕТ | 13 |
| `remark-gfm` | 4.0.1 | 4.0.1 | MIT | СОВПАДАЕТ | 15 |
| `rfc6902` | 5.3.0 | 5.3.0 | MIT | СОВПАДАЕТ | 04,07,15 |
| `shadcn` | 4.21.0 | 4.21.0 | MIT | СОВПАДАЕТ | 15 |
| `sigstore` | 5.0.0 | 5.0.0 | Apache-2.0 | СОВПАДАЕТ | 18 |
| `simhash` | 0.1.0 | 0.1.0 | MIT | СОВПАДАЕТ | 13 |
| `simple-statistics` | 7.12.0 | 7.12.0 | ISC | СОВПАДАЕТ | 13 |
| `sonner` | 2.0.8 | 2.0.8 | MIT | СОВПАДАЕТ | 15 |
| `@stryker-mutator/core` | 10.0.0 | 10.0.0 | Apache-2.0 | СОВПАДАЕТ | 07 |
| `tailwindcss` | 4.3.3 | 4.3.3 | MIT | СОВПАДАЕТ | 15 |
| `talisman` | 1.1.4 | 1.1.4 | MIT | СОВПАДАЕТ | 13 |
| `tar-stream` | 3.2.1 | 3.2.1 | MIT | СОВПАДАЕТ; заменено ADR-0025/0029 | 18 |
| `true-myth` | 9.4.0 | 9.4.0 | MIT | СОВПАДАЕТ | 20 |
| `ts-pattern` | 5.9.0 | 5.9.0 | MIT | СОВПАДАЕТ | 20 |
| `tsdown` | 0.23.0 | 0.23.0 | MIT | СОВПАДАЕТ; заменено ADR-0025 | 05,20 |
| `turbo` | 2.10.12 | 2.10.12 | MIT | СОВПАДАЕТ; для движка заменено ADR-0025, монорепо студии — DECISIONS «Студия» | 21 |
| `tw-animate-css` | 1.4.0 | 1.4.0 | MIT | СОВПАДАЕТ | 15 |
| `tw-shimmer` | 0.4.13 | 0.4.13 | MIT | СОВПАДАЕТ | 15 |
| `typescript` | 6.0.3 | 7.0.2 | Apache-2.0 | УСТАРЕЛО (пин: потолок `typescript-eslint@8.70.0` (`<6.1.0`)) | 20 |
| `typescript` | 7.0.2 | 7.0.2 | Apache-2.0 | СОВПАДАЕТ | 18,20 |
| `typescript-eslint` | 8.70.0 | 8.70.0 | MIT | СОВПАДАЕТ | 15,20,21 |
| `use-intl` | 4.14.5 | 4.14.5 | MIT | СОВПАДАЕТ | 15 |
| `vite` | 8.3.0 | 8.3.0 | MIT | СОВПАДАЕТ | 02,15,20,21 |
| `viteval` | 0.5.9 | 0.5.9 | MIT | СОВПАДАЕТ | 13 |
| `vitest` | 5.0.0 | 5.0.1 | MIT | УСТАРЕЛО (5.0.1 вышел 2026-09-15) | 08,15,20,apps/studio |
| `yaml` | 2.9.0 | 2.9.0 | ISC | СОВПАДАЕТ | 04,18 |
| `yjs` | 13.6.32 | 13.6.32 | MIT | СОВПАДАЕТ | 14 |
| `zod` | 4.6.2 | 4.6.2 | MIT | СОВПАДАЕТ; для движка заменено ADR-0025, схемы UI студии — DECISIONS «Студия» | 02,03,04,05,06,07,09,10,14,15 |
| `zustand` | 5.0.15 | 5.0.15 | MIT | СОВПАДАЕТ | 15 |

## Исправлено

Обе правки — случаи «НЕ СУЩЕСТВУЕТ»: имя пакета реально, заявленной версии в npm нет.

| Документ | Было | Стало | Причина |
|---|---|---|---|
| `16-data-model.md` §Решения | `` `prisma@8.0.0-rc` `` | `` `prisma@8.0.0-rc.13` `` | версии `8.0.0-rc` в npm нет; `dist-tags.latest` пакета `prisma` = `8.0.0-rc.13` |
| `18-export-and-conformance.md` §Отчёт потерь (`loss-report.json`) | `"target": "mastra@1.66.0"` | `"target": "@mastra/core@1.66.0"` | `1.66.0` — версия `@mastra/core`, а не CLI-пакета `mastra` (его `latest` = `1.29.0`); таблица решений того же документа уже называет `@mastra/core` 1.66.0 |

## Согласованность между документами

Проверка: один пакет — одна версия во всех документах.

| Пакет | Версии в комплекте | Вердикт |
|---|---|---|
| `ai` | 6.0.280 в 01, 02, 05, 06, 08, 09, 10, 11, 20, 21 | согласовано, совпадает с DECISIONS |
| `@openrouter/ai-sdk-provider` | 2.10.0 как выбор (02, 11); 3.0.0 — только как отвергнутая ветка | согласовано |
| `@ai-sdk/openai-compatible` | 2.0.75 как прямая зависимость; 1.0.54 — вложенная копия внутри `@ai-sdk/google-vertex@3.0.174` | не расхождение, разные роли; в 11-providers оговорено явно |
| `@voltagent/core` | 2.10.0 в 01, 02, 03, 06, 08, 09, 11, 12, 17, 18, 19, 21 | согласовано |
| `zod` | 4.6.2 в 02–07, 09, 10, 14, 15 | согласовано |
| `canonicalize` | 5.0.0 в 02, 07, 11, 12, 13, 16, 17, 19, 21, 22 | согласовано |
| `pgvector` (расширение PostgreSQL, не npm-пакет) | пин 0.8.6 (02, 09, 16); упоминания 0.8.0 — ссылки на релиз, в котором появился `hnsw.iterative_scan` | не расхождение |
| `typescript` | 6.0.3 — пин репозитория (20, 21); 7.0.2 — `tsc --noEmit` в conformance-прогоне сгенерированного кода (18, 20) | расхождение по смыслу оправдано, но не зафиксировано в DECISIONS — см. «Требует решения» |

Одноимённый npm-пакет `pgvector` (latest 0.3.0) в комплекте не используется — это клиентская
библиотека, а у нас расширение PostgreSQL. Аналогично `mastra` (CLI) против `@mastra/core`.

## Проверка ключевых инвариантов

| Инвариант | Результат |
|---|---|
| Нигде `ai@7` не выбран как рабочая версия | подтверждено. 17 упоминаний `ai@7` в 01, 02, 11, 20, 21, 22 — все в роли отвергнутого варианта либо триггера будущей миграции («выход `@voltagent/core` с peer `ai: ^7`»). Выбор везде — `ai@6.0.280` |
| OpenRouter везде 2.10.0 | подтверждено. `@openrouter/ai-sdk-provider@3.0.0` встречается только в 02 §Открытые вопросы и в 11 §1.2/§Открытые вопросы — как несовместимая с VoltAgent ветка |
| Нет несуществующих пакетов | подтверждено, 0 случаев «ПАКЕТА НЕТ» |
| Studio не использует `next` | подтверждено. `next` 16.3.4, `nuqs` 2.10.1, `next-themes` 0.4.6 упоминаются только в 15 как отвергнутые [ADR-0024](adr/0024-studio-on-vite.md); выбор — `vite` 8.3.0, `@tanstack/react-router` 1.170.36, `use-intl` 4.14.5. `eslint-config-next` назван только как неустанавливаемый (15, 20) |

## Требует решения

1. **`typescript` 6.0.3 против 7.0.2.** Репозиторий пинует 6.0.3 (потолок `typescript-eslint@8.70.0`:
   peer `>=4.8.4 <6.1.0`), а conformance-прогон в 18 §Уровни проверки гоняет `tsc --noEmit` на
   `typescript@7.0.2`. В DECISIONS строки про TypeScript нет вообще. Документ 20 сам выносит это в
   ОВ. *Что сделать:* добавить в DECISIONS строку «TypeScript: 6.0.3 — репозиторий, 7.0.2 — эмит
   conformance для экспортированного кода» либо свести обе цифры к 6.0.3.

2. **Ось `@ai-sdk/*` отстала на мажор.** `@ai-sdk/provider` 3.0.16 против 4.0.13, `provider-utils`
   4.0.51 против 5.0.39, провайдеры 3.0.x против 4.0.x–5.0.x. Это прямое следствие пина `ai@6` и
   потому корректно, но в DECISIONS зафиксированы только `provider`/`provider-utils`/`togetherai`;
   версии `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/google-vertex` живут
   только в 11-providers. *Что сделать:* перенести весь набор в таблицу оси DECISIONS одним блоком,
   чтобы миграция на `ai@7` была одним диффом одного файла.

3. **`@voltagent/resumable-streams` 2.0.1 против 2.0.2.** Пакет упомянут в 15 §Стриминг и в ОВ-9
   того же документа как «API не изучен». Патч вышел после написания. *Что сделать:* при закрытии
   ОВ-9 поднять до 2.0.2 и заодно проверить, не поменялся ли API.

4. **`typescript-eslint@8.70.0` фиксирует потолок TS, но сам ESLint 10 живёт только в
   `apps/studio`.** Потолок 6.0.3 распространяется на весь монорепозиторий из-за одного приложения.
   *Что сделать:* проверить, снимается ли потолок после перехода `apps/studio` на Biome type-aware
   линт (документ 20 уже называет это причиной выбора Biome).

5. **`@pollyjs/core` 6.0.6 (`time.modified` 2023-07-20), `dominators` 1.1.2 (2022-04-29),
   `minhash` 0.0.9 (2022-05-09), `simhash` 0.1.0 (2022-06-26), `talisman` 1.1.4 (2022-06-27),
   `jstat` 1.9.6 (2022-11-21), `fast-json-patch` 3.1.1 (2022-06-17).** Версии реальны и являются
   `latest`, но релизов не было 3–4 года. Документ 08 отверг `nunjucks` ровно по этому критерию
   («3 года без релизов»), значит критерий в комплекте применён непоследовательно. *Что сделать:*
   для каждого — либо явное обоснование «функция закончена, поддержка не нужна», либо замена.
   `jstat` дополнительно не объявляет лицензию в манифесте — для 13-evals это блокер комплаенса.

6. **`evalite` 0.19.0 и `jstat` 1.9.6 без поля `license` в манифесте npm.** Конвенции требуют
   лицензию для каждого утверждения о библиотеке. *Что сделать:* взять лицензию из репозитория и
   указать в документе 13 явно, либо пометить как риск.

7. **Dev-зависимости `apps/studio` отстают: `vitest` 5.0.0 против 5.0.1, `@babel/core` 7.29.7 против
   8.0.5, `@types/node` 24.10.1 против 24.13.5 в линии Node 24.** `vitest` — патч, вышедший накануне
   среза; `@babel/core` держится на Babel 7, пока на нём стоят `babel-plugin-react-compiler@1.0.0` и
   `@types/babel__core`; `dist-tags.latest` у `@types/node` указывает на линию 22, поэтому сверка идёт
   по линии рантайма. *Что сделать:* поднять `vitest` до 5.0.1 и `@types/node` до 24.13.5 отдельным
   изменением с прогоном гейтов; `@babel/core` 8 — после выхода компилятора React с поддержкой Babel 8.

## Движок на Python: PyPI

[ADR-0025](adr/0025-python-engine.md) переводит движок на CPython 3.14, Pydantic AI и DBOS,
[ADR-0029](adr/0029-trust-and-quality-python.md) — ядро доверия, evals, статистику гейтов и оптимизацию промтов. Строки
npm-таблицы с пометкой «заменено ADR-0025/0029» или «заменено ADR-0025» остаются срезом 2026-09-11 и версий больше не
фиксируют; пометка «для движка заменено ADR-0025» снимает строку только для движка; строки `apps/studio` действуют. Счётчики раздела «Итог» относятся к npm-таблице.

Метод, срез 2026-09-16: `https://pypi.org/pypi/<пакет>/<версия>/json` — лицензия из `info.license_expression`, при пустом
поле — из `info.license` или классификатора `License ::`; релиз — самая ранняя `upload_time_iso_8601` среди файлов версии;
`latest` — `info.version` из `https://pypi.org/pypi/<пакет>/json`. «Импорт 3.14.7» — установка оси в venv CPython 3.14.7 и
импорт 22 модулей ([ADR-0025](adr/0025-python-engine.md) «Проверка», п. 1). «Проба» — пробы выполнялись вне репозитория
2026-09-16, результаты приведены в названном разделе research. Пробы Pydantic AI, цепочки гарантий, pydantic-evals,
статистики и GEPA шли на CPython 3.12.4, а ось фиксирует 3.14; повтор на 3.14.7 — открытый вопрос 20 ADR-0025 и 24 ADR-0029.

Итог: 30 пакетов оси (`uv` и `uv_build` — два), 13 транзитивных пакетов и 17 отвергнутых и кандидатов на PyPI — заявленная
версия равна `latest` у каждого; несуществующих версий и имён нет. CPython 3.14.7 — последний релиз линии 3.14
(py-stack-runtime §9.1).

### Что заменяет строки npm-таблицы

| Строки npm-таблицы | Замена | Где решено |
|---|---|---|
| `@voltagent/*`, `ai`, `@ai-sdk/*`, `@openrouter/ai-sdk-provider` | `pydantic-ai-slim` 2.43.0, `pydantic-evals` 2.43.0, `dbos` 2.31.1 | [ADR-0025](adr/0025-python-engine.md) §1 |
| `pg-boss` | очереди и расписания `dbos` 2.31.1 | ADR-0025 §4 |
| `drizzle-kit`, `drizzle-orm`, `drizzle-zod` | не выбрано; кандидаты `sqlalchemy` 2.0.54 и `alembic` 1.20.0 | ADR-0025, открытый вопрос 11 |
| `@langfuse/client`, `@langfuse/core`, `@langfuse/otel`, `@langfuse/tracing` | `opentelemetry-sdk` и `opentelemetry-exporter-otlp-proto-http` 1.44.0 | ADR-0025 §8 |
| `@modelcontextprotocol/sdk` | `mcp` 2.2.0 | ADR-0025 §8 |
| `canonicalize`, `@noble/hashes` | `rfc8785` 0.1.4 и `hashlib` стандартной библиотеки | ADR-0025 §7 |
| `tar-stream` | не нужен: экспорт бандла отменён | ADR-0025 §7 |
| `liquidjs` | `python-liquid` 2.3.1 | [ADR-0029](adr/0029-trust-and-quality-python.md) §8 |
| `jsonrepair` | удалён: обрезанный ответ не чиним | ADR-0029 §7 |
| `@stdlib/*` | `scipy` 1.18.1, `statsmodels` 0.15.0, `numpy` 2.5.3 | ADR-0029 §10 |
| `gpt-tokenizer` | токенизатор оценки не выбран | ADR-0029, открытый вопрос 4 |
| `isomorphic-git` 1.42.2 — в npm-таблицу не входил, назван в [02](02-architecture.md) и [files-first/history.md](files-first/history.md) | `dulwich` 1.2.15 за `GitPort` | ADR-0025 §8 |
| `simple-git` 3.36.0 — строки в npm-таблице нет, назван вторым эшелоном git в [02](02-architecture.md) и [files-first/history.md](files-first/history.md) | `dulwich` 1.2.15 за `GitPort`; вторая реализация порта — кандидат `pygit2` 1.20.1 | ADR-0025 §8 |
| `@hono/zod-openapi`, Hono | `fastapi` 0.141.1 и `uvicorn` 0.53.0 | ADR-0025 §1 |
| `tsdown` | `uv_build` 0.12.15 | ADR-0025 §1 |
| `@biomejs/biome` в движке | `ruff` 0.16.7 | ADR-0025 §1, §6 |
| `turbo` в движке | uv workspace с одним `uv.lock` | ADR-0025 §1 |
| `zod` в движке | `pydantic` 2.13.5 | ADR-0025 §1 |

### Ось движка

| Пакет | Версия | Лицензия | Релиз | Источник | Проверка 2026-09-16 | Роль |
|---|---|---|---|---|---|---|
| CPython, `requires-python = ">=3.14,<3.15"` | 3.14.7 | PSF-2.0 | 2026-08-05 | python.org API, `LICENSE.txt` сборки | импорт 3.14.7; на 3.15 ось не разрешается ([research/py-stack-runtime.md](research/py-stack-runtime.md) §9.1) | интерпретатор |
| `pydantic-ai-slim[openai,anthropic,google]` | 2.43.0 | MIT | 2026-09-12 | PyPI JSON | импорт 3.14.7; проба `Agent.run` на 3.14.7 (py-stack-runtime §3), цепочка гарантий на 3.12.4 ([research/py-quality-layer.md](research/py-quality-layer.md) §1); отложенные тулы (`requires_approval=True`) под `DBOSDurability` — проба 3.14.7 на SQLite | вызов моделей |
| `pydantic-evals` | 2.43.0 | MIT | 2026-09-12 | PyPI JSON | импорт 3.14.7; проба 3.12.4 (py-quality-layer §6) | прогонщик экспериментов |
| `pydantic` | 2.13.5 | MIT | 2026-08-28 | PyPI JSON | импорт 3.14.7 | модели данных |
| `dbos` | 2.31.1 | MIT | 2026-09-08 | PyPI JSON | проба 3.14.7 на SQLite: восстановление, fork, история шагов (py-stack-runtime §5.1); ожидание человека — `set_event`, `recv_async` с таймаутом, дедлайн после SIGKILL, дочерние workflow, поток событий прогона (решение владельца от 2026-09-16, [ADR-0025](adr/0025-python-engine.md)); на PostgreSQL 18 не запускался | надёжное исполнение |
| `httpx2` | 2.13.0 | BSD-3-Clause | 2026-09-14 | PyPI JSON, исходник | импорт 3.14.7, `import httpx` → `ImportError` (ADR-0025 «Проверка», п. 1) | HTTP-клиент |
| `openai` | 3.14.1 | Apache-2.0 | 2026-09-15 | PyPI JSON | проба 3.12.4: `max_retries=0`, 429 → 1 HTTP-вызов (py-quality-layer §1.5); построитель модели на 3.14.7 (ADR-0025 §6) | SDK провайдера |
| `anthropic` | 1.6.0 | MIT | 2026-09-15 | PyPI JSON | то же | SDK провайдера |
| `google-genai` | 2.23.0 | Apache-2.0 | 2026-09-10 | PyPI JSON, `Requires-Dist: httpx<1.0.0,>=0.28.1` | проверка `uv.lock` с extra `google` (ADR-0025 §5); ретраи по умолчанию не проверены (ADR-0025, открытый вопрос 5) | SDK провайдера |
| `fastapi` без extras | 0.141.1 | MIT | 2026-07-29 | PyPI JSON | проба 3.14.7: REST, SSE и MCP на одном порту (py-stack-runtime §7, §8) | HTTP API, SSE |
| `uvicorn` | 0.53.0 | BSD-3-Clause | 2026-09-14 | PyPI JSON | проба 3.14.7 (py-stack-runtime §9.6) | ASGI-сервер |
| `mcp`, `MCPServer` | 2.2.0 | MIT | 2026-09-07 | PyPI JSON | проба 3.14.7, streamable HTTP (py-stack-runtime §7) | MCP-сервер |
| `python-liquid` | 2.3.1 | MIT | 2026-08-08 | PyPI JSON | импорт 3.14.7; проба `analyze()` и `ContentNode` на 3.12.4 (py-quality-layer §8.5) | шаблоны промтов |
| `gepa` | 0.1.4 | MIT | 2026-07-15 | PyPI JSON, `Requires-Python: <3.15,>=3.10` | импорт 3.14.7; проба 3.12.4 (py-quality-layer §8) | оптимизация промтов |
| `scipy` | 1.18.1 | BSD (классификатор; поле `license` — полный текст) | 2026-08-21 | PyPI JSON, `Requires-Python: >=3.12` | импорт 3.14.7; проба 3.12.4 (py-quality-layer §7.1, §7.2) | статистика гейта |
| `statsmodels` | 0.15.0 | BSD-3-Clause | 2026-08-27 | PyPI JSON | то же | статистика гейта |
| `numpy` | 2.5.3 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | 2026-09-06 | PyPI JSON | метаданные; транзитивно приходит и через scipy | массивы статистики, своя альфа Криппендорфа (ADR-0029 §10) |
| `ruamel.yaml` | 0.19.1 | MIT | 2026-01-02 | PyPI JSON | импорт 3.14.7; проба строгого предпрохода и канонического писателя (py-quality-layer §5) | YAML |
| `rfc8785` | 0.1.4 | Apache-2.0 (классификатор; `license_expression` пуст) | 2024-09-27 | PyPI JSON, исходник | импорт 3.14.7; проба RFC 8785 без расхождений (py-quality-layer §3.1) | канонизация |
| `dulwich` | 1.2.15 | Apache-2.0 OR GPL-2.0-or-later, берём Apache-2.0 | 2026-09-14 | PyPI JSON, `COPYING` | импорт 3.14.7; проба коммита при `PATH=''` (py-quality-layer §4) | git за `GitPort` |
| `watchfiles` | 1.2.0 | MIT | 2026-05-18 | PyPI JSON | проба 3.14.7 (py-stack-runtime §9.6) | наблюдение за файлами |
| `tenacity` | 9.1.4 | Apache-2.0 (поле `license`: «Apache 2.0») | 2026-02-07 | PyPI JSON | импорт 3.14.7; API для `BackoffModel` не проверен (ADR-0029, открытый вопрос 11) | транспортный ретрай |
| `genai-prices` | 0.1.7 | MIT | 2026-09-15 | PyPI JSON | импорт 3.14.7; проба снимка цен на 3.12.4 (py-quality-layer §1.3) | цены |
| `opentelemetry-sdk` | 1.44.0 | Apache-2.0 | 2026-07-16 | PyPI JSON | импорт 3.14.7; проба 3.12.4 (py-quality-layer §2) | трассы |
| `opentelemetry-exporter-otlp-proto-http` | 1.44.0 | Apache-2.0 | 2026-07-16 | PyPI JSON | то же; экспорт проверен на локальном приёмнике, не на Langfuse (ADR-0025 «Проверка», п. 7) | OTLP в Langfuse |
| `uv`, `uv_build` | 0.12.15 | MIT OR Apache-2.0 | 2026-09-15 | PyPI JSON | проба workspace, lock и wheel (py-stack-runtime §9.2) | workspace, сборка |
| `ruff` | 0.16.7 | MIT | 2026-09-10 | PyPI JSON | проба TID251 (py-stack-runtime §9.3; ADR-0025 «Проверка», п. 2–3) | линт, запреты импортов |
| `pyright`, `typeCheckingMode = "strict"` | 1.1.414 | MIT (обёртка на PyPI) | 2026-09-10 | PyPI JSON | проба strict (py-stack-runtime §9.4) | типы |
| `pytest` | 9.1.1 | MIT | 2026-06-19 | PyPI JSON | проба 3.14.7 (py-stack-runtime §9.5) | тесты |
| `pytest-asyncio` | 1.4.0 | Apache-2.0 | 2026-05-26 | PyPI JSON | то же | async-тесты |
| PostgreSQL | 18 | PostgreSQL License | — | https://www.postgresql.org/about/licence/ | не запускался (ADR-0025, открытый вопрос 9) | хранилище в проде |
| SQLite в сборке CPython 3.14.7 от uv | 3.53.1 | public domain | — | `sqlite3.sqlite_version` | проба DBOS на SQLite (py-stack-runtime §5.1) | системная БД DBOS локально |

### Транзитивные пакеты, важные для правил

| Пакет | Версия | Лицензия | Релиз | Кто тянет (`Requires-Dist`) | Правило |
|---|---|---|---|---|---|
| `pydantic-graph` | 2.43.0 | MIT | 2026-09-12 | pydantic-ai-slim, `==2.43.0` | не импортируем, ruff TID251 |
| `psycopg`, `psycopg-binary` | 3.3.5 | LGPL-3.0-only | 2026-08-31 | dbos, `psycopg[binary]>=3.1` без маркера extra | не импортируем; замечание 1 |
| `sqlalchemy` | 2.0.54 | MIT | 2026-09-15 | dbos, `sqlalchemy[asyncio]>=2.0.43` | — |
| `PyYAML` | 6.0.3 | MIT | 2025-09-25 | dbos (`pyyaml>=6.0.2`), pydantic-evals | не импортируем, TID251 `yaml` |
| `requests` | 2.34.2 | Apache-2.0 | 2026-05-14 | opentelemetry-exporter-otlp-proto-http, tiktoken, google-genai, google-auth | допустим транзитивно, TID251 для нашего кода |
| `tiktoken` | 0.14.0 | MIT | 2026-08-17 | extra `openai` | — |
| `starlette` | 1.6.0 | BSD-3-Clause | 2026-08-08 | fastapi | extra `full` не ставим, замечание 6 |
| `sse-starlette` | 3.4.11 | BSD-3-Clause | 2026-09-05 | mcp | — |
| `anyio` | 4.15.1 | MIT | 2026-09-05 | транзитивно; свой pytest-плагин грузится вместе с pytest-asyncio | — |
| encode `httpx` | 0.28.1 | BSD-3-Clause | 2024-12-06 | прямой пин `aqven` (ADR-0030 §11); google-genai 2.23.0 (extra `google`) в `uv.lock` сейчас нет | наш код не импортирует; потребители `{aqven, google-genai}` проверяются по `uv.lock` (ADR-0025 §5) |
| `pandas` | 3.0.5 | BSD-3-Clause | 2026-07-22 | statsmodels, `pandas!=2.1.0,>=1.4` | попадает в рантайм eval-воркера (ADR-0029 «Последствия») |
| `patsy` | 1.0.3 | BSD-2-Clause (поле `license`: «2-clause BSD») | 2026-08-29 | statsmodels, `patsy>=0.5.6` | версия — `latest` на PyPI, по `uv.lock` не сверялась |

### Отвергнутые и кандидаты

| Пакет | Версия | Лицензия | Релиз | Статус |
|---|---|---|---|---|
| `krippendorff` | 0.8.2 | GPL-3.0-or-later | 2025-11-03 | не в рантайме; замечание 2 |
| `pingouin` | 0.6.1 | GPL-3.0 | 2026-03-28 | не берём: GPL; ICC — своя формула (ADR-0029 §10) |
| `scikit-learn` | 1.9.1 | BSD-3-Clause | 2026-09-10 | не берём: взвешенная каппа без `labels` неверна (ADR-0029 «Альтернативы») |
| `nltk` | 3.10.3 | Apache-2.0 | 2026-08-12 | не берём: нет порядковой дистанции; возможный dev-оракул (ADR-0029, открытый вопрос 1) |
| `langfuse` (Python SDK) | 4.15.3 | MIT | 2026-09-15 | не берём: encode `httpx<1.0`, мутирует общие спаны (ADR-0025 §8) |
| `logfire` | 5.1.0 | MIT | 2026-09-11 | не берём: платформа (ADR-0025 §8); extra `pydantic-ai-slim[logfire]` тянет `logfire[httpx]` (ADR-0025 §5) |
| `temporalio` | 1.33.0 | MIT | 2026-09-15 | альтернатива DBOS (ADR-0025 «Альтернативы») |
| `kitaru` | 0.26.0 | Apache-2.0 | 2026-09-10 | не берём как слой надёжного исполнения (решение владельца от 2026-09-16, [ADR-0025](adr/0025-python-engine.md)): с 0.22.0 (2026-08-18) — платформа записи и реплея прогонов для evals; сервер только на PostgreSQL, без SQLite; нет чекпоинтов шагов, восстановления после падения, ожидания и fork с шага |
| `kitaru-pydantic-ai` | 0.2.1 | Apache-2.0 | 2026-09-10 | не ставится с осью: `Requires-Dist: pydantic-ai-slim<2.41,>=2.14.1` |
| `langgraph` | 1.2.11 | MIT | 2026-08-11 | альтернатива (ADR-0025 «Альтернативы») |
| `dspy` | 3.3.1 | MIT | 2026-08-21 | берём форму сигнатуры, не пакет (ADR-0025 «Альтернативы») |
| `pydantic-monty` | 0.0.23 | MIT | 2026-09-05 | решение владельца от 2026-09-16 (ADR-0025 «Альтернативы») |
| `pygit2` | 1.20.1 | GPLv2 with linking exception | 2026-09-12 | возможная вторая реализация `GitPort` (ADR-0025 §8) |
| `GitPython` | 3.1.62 | BSD-3-Clause | 2026-09-07 | не берём: нужен бинарник git (ADR-0025 §8) |
| `alembic` | 1.20.0 | MIT | 2026-09-11 | кандидат для миграций схемы `app` (ADR-0025, открытый вопрос 11) |
| `mutmut` | 3.8.0 | BSD-3-Clause | 2026-09-12 | кандидат мутационного тестирования (ADR-0025, открытый вопрос 12) |
| `cosmic-ray` | 8.7.0 | MIT (классификатор) | 2026-08-09 | то же |

### Локальный режим: срез 2026-09-17

[ADR-0030](adr/0030-local-browser-backend.md). Метод тот же, `latest` — на 2026-09-17; «`uv.lock`» — потребители в `uv.lock`
workspace `aqven-py` (113 пакетов на исходном срезе, 149 после добавления Codex 2026-09-18). Заявленная версия
равна `latest` у каждой исходной строки, кроме `pydantic-ai-slim` (`latest` 2.44.0); `openai-codex` 0.147.0
пинится ниже 0.154.0 из-за конфликта `packaging>=26.2` с `xai-sdk` (`packaging<26`).

| Пакет | Версия | Лицензия | Релиз | Проверка 2026-09-17 | Статус |
|---|---|---|---|---|---|
| `claude-agent-sdk` | 0.2.154 | MIT (классификатор) | 2026-09-17 | `Requires-Dist: mcp<3.0.0,>=1.23.0`; `uv.lock` ← `aqven`; импорт 3.14.7; колесо везёт Claude Code CLI 2.1.274 | ось: чат студии (ADR-0030 §6) |
| `openai-codex` | 0.147.0 | Apache-2.0 | 2026-09-18 | `uv.lock` ← `aqven`; `Requires-Dist: openai-codex-cli-bin==0.147.0`; импорт 3.14.7, app-server `initialize` с полным строгим профилем | ось: второй адаптер чата Studio (ADR-0034) |
| `python-multipart` | 0.0.32 | Apache-2.0 | 2026-06-04 | `uv.lock` ← `aqven`, `mcp` (`>=0.0.9`) | ось: формы и загрузки FastAPI |
| encode `httpx` | 0.28.1 | BSD-3-Clause | 2024-12-06 | `uv.lock` ← только `aqven`; `pydantic_ai/mcp.py` строка 51 `import httpx` | ось: прямой пин ради `pydantic_ai.mcp` (ADR-0030 §11) |
| `pydantic-ai-slim[mcp]` | 2.43.0 | MIT | 2026-09-12 | extra `mcp` → `fastmcp-slim[client]<5,>=3.3.0`; `latest` на 2026-09-17 — 2.44.0, ось не меняется | ось: `aqven` |
| `pydantic-ai-slim[openrouter]` | 2.43.0 | MIT | 2026-09-12 | extra `openrouter` → `openai>=3.8.0` | ось: `aqven-llm` |
| `fastmcp-slim` | 4.0.4 | Apache-2.0 | 2026-09-16 | `Requires-Dist` объявляет только `httpx2>=2.5.0`, не `httpx`; `uv.lock` ← `pydantic-ai-slim` | транзитивный |
| `platformdirs` | 4.11.9 | MIT | 2026-09-16 | `uv.lock` ← `fastmcp-slim` | транзитивный; каталог данных не на нём (ADR-0030 §1) |
| `pyinstaller` | 6.22.3 | GPLv2-or-later with a special exception | 2026-09-12 | `Requires-Python: <3.16,>=3.8` | отвергнут (ADR-0030 §5) |
| `aiosqlite` | 0.22.1 | MIT (классификатор) | 2025-12-23 | в `uv.lock` нет | не нужен: DBOS на SQLite — синхронный движок |
| `pyodide-py` (Pyodide) | 314.0.7 | MPL-2.0 (классификатор) | 2026-09-14 | `pyodide-lock.json` 314.0.7: Python 3.14.2, `wasm32`, pydantic 2.12.5, нет `httpx2` и `pydantic-ai-slim` | отвергнут для кода проекта (ADR-0030 §12) |
| `mcp-run-python` | 0.0.22 | MIT | 2025-12-11 | репозиторий `pydantic/mcp-run-python` архивирован | отвергнут (ADR-0030 §12) |
| `pydantic-monty` | 0.0.23 | MIT | 2026-09-05 | 18 встроенных модулей стандартной библиотеки | отвергнут для кода проекта (ADR-0030 §12) |
| `marimo` | 0.24.2 | Apache-2.0 | 2026-09-11 | `--token/--no-token`, `default=True` в `marimo/_cli/cli.py` | прецедент, не зависимость |
| `jupyter-server` | 2.21.1 | BSD-3-Clause (поле `license`) | 2026-09-15 | токен `os.urandom(24)`, отказ по нелокальному `Host` | прецедент, не зависимость |

Сняты ADR-0030 §1: PostgreSQL 18 и pgvector 0.8.6 (строки «Ось движка» и npm-таблицы остаются срезом).

### Реализация: срез 2026-09-17, поправки `A1`–`A17` ADR-0030

Метод тот же, `latest` — на 2026-09-17; «`uv.lock`» — потребители в `uv.lock` workspace `aqven-py`, после добавления
extras провайдеров в нём 147 пакетов (было 113).

| Пакет | Версия | Лицензия | Релиз | Проверка 2026-09-17 | Статус |
|---|---|---|---|---|---|
| `python-dotenv` | 1.2.3 | BSD-3-Clause (поле `license`; `license_expression` пуст) | 2026-08-16 | `Requires-Python: >=3.10`, `Requires-Dist` только `click>=5.0; extra == "cli"`; `uv.lock` ← `aqven`; `latest` = 1.2.3 | ось: ключи провайдеров из `.env` (ADR-0030 `A3`) |

**Extras провайдеров** (ADR-0030 `A4`). Имена extras сверены с `provides_extra` у `pydantic-ai-slim` 2.43.0; каждый
`aqven-llm[<extra>]` разворачивается в `pydantic-ai-slim[<extra>]==2.43.0`, `aqven[<extra>]` повторяет `aqven-llm`.

| extra | Объявление pydantic-ai-slim 2.43.0 | SDK в `uv.lock` | Лицензия | Релиз |
|---|---|---|---|---|
| `anthropic` | `anthropic>=1.3.0` | `anthropic` 1.6.0 | MIT | 2026-09-15 |
| `bedrock` | `boto3>=1.42.63` | `boto3` 1.43.96 | Apache-2.0 | 2026-09-16 |
| `cohere` | `cohere>=5.20.6`, маркер `platform_system != "Emscripten"` | `cohere` 7.1.1 | MIT | 2026-08-31 |
| `google` | `google-genai>=2.18.0` | `google-genai` 2.24.0 | Apache-2.0 | 2026-09-16 |
| `groq` | `groq>=0.25.0` | `groq` 1.7.0 | Apache-2.0 | 2026-08-26 |
| `huggingface` | `huggingface-hub<2.0.0,>=1.3.4` и `hf-xet<1.5.0` на x86_64/arm64 | `huggingface-hub` 1.18.0 | Apache-2.0 | 2026-06-05 |
| `mistral` | `mistralai>=2.9.2` | `mistralai` 2.10.1 | **не объявлена** — замечание 9 | 2026-09-15 |
| `xai` | `xai-sdk>=1.16.0` | `xai-sdk` 1.19.0 | Apache-2.0 | 2026-08-18 |

Расхождения с `latest` на 2026-09-17: `boto3` 1.43.97 вышел на день позже среза; `huggingface-hub` `latest` — 1.32.0,
но она требует `hf-xet>=1.5.2`, а extra `huggingface` держит `hf-xet<1.5.0`, поэтому резолвер берёт 1.18.0
(`hf-xet>=1.4.3`). Остальные строки равны `latest`. Колёса cp314/abi3/py3 есть у каждого нового бинарного пакета.

**Просадка базовой установки от extras.** Один `uv.lock` на workspace, поэтому ограничения extras опускают общие
пакеты: `xai-sdk` 1.19.0 требует `packaging<26` и `protobuf<7`, `google-genai` 2.24.0 — `websockets<17`. В lock стало
`packaging` 25.0 (было 26.3), `protobuf` 6.33.6 (было 7.36.1), `websockets` 16.1.1 (было 17.1). `conflicts` в uv не
разделяют базовую установку и extra — ADR-0030 ОВ 18.

**Потребители `httpx` и `requests` после extras** (проверка `uv.lock`, ADR-0025 §5):
`ALLOWED_CONSUMERS["httpx"]` = `{aqven, cohere, google-genai, groq, huggingface-hub, mistralai}`,
`ALLOWED_CONSUMERS["requests"]` = `{cohere, google-auth, google-genai, opentelemetry-exporter-otlp-proto-http, tiktoken, xai-sdk}`.
Каждая запись, кроме `tiktoken`, — реальный потребитель в текущем lock; `tiktoken` в lock не входит и остаётся в списке
по ADR-0025 §5.

**Cohere без потока.** `CohereModel` в pydantic-ai-slim 2.43.0 наследуется прямо от `Model[AsyncClientV2]` и не
определяет `request_stream` (разбор `pydantic_ai/models/cohere.py` через `ast`, SDK ставить не нужно). Это
`E_PROVIDER_NO_STREAMING` в `aqven check`, а не отказ в рантайме.

**Потери OpenRouter в pydantic-ai-slim 2.43.0** (ADR-0030 `A7`, по исходнику `pydantic_ai/models/openrouter.py`):
`_OpenRouterChoiceDelta` (строки 1172–1183) объявляет только `reasoning`, `reasoning_details` и `annotations` — полей
`images` и `audio` нет; `_map_thinking_delta` — генератор, и его ветка `else` делает `return
super()._map_thinking_delta(choice)` (строка 1274), поэтому рассуждение без `reasoning_details` теряется. Цена не
теряется: `provider_details["cost"]` заполняется, когда в chunk с usage есть choice (проверено на 4 живых потоках).

### Замечания

1. **`psycopg` 3.3.5 — LGPL-3.0-only.** Обязательная зависимость dbos 2.31.1: ставится и при SQLite, наш код его не
   импортирует и не вендорит. Юридическая оценка распространения модуля-wheel с этой зависимостью не проводилась
   (ADR-0025, открытый вопрос 10). У `psycopg-binary` 3.3.5 нет колёс cp315: вместе с `gepa` 0.1.4 (`<3.15`) он задаёт
   потолок `requires-python` (py-stack-runtime §9.1).
2. **`krippendorff` 0.8.2 — GPL-3.0-or-later.** Модуль воркфлоу собирается в wheel и встраивается в чужие проекты, поэтому
   в рантайм пакет не входит: alpha — своя реализация на numpy, пакет — только оффлайн-оракул golden-фикстур в dev
   (ADR-0029 §10, [research/py-quality-layer.md](research/py-quality-layer.md) §7.3). Допустимость и такого использования
   юридически не оценена (ADR-0029, открытый вопрос 1).
3. **`rfc8785` 0.1.4 — мало активности.** Последний релиз 2024-09-27, 12 звёзд, коммиты — dependabot и правка
   документации 2026-07-29 (py-quality-layer §3.1). Реализация — 254 строки без зависимостей, её можно вендорить
   (ADR-0025 §1).
4. **`ruamel.yaml` 0.19.1 — один мейнтейнер.** Автор на PyPI — Anthon van der Neut, репозиторий на SourceForge
   (py-quality-layer §5). Замены в оси нет: PyYAML 6.0.3 приходит транзитивно, но для файлов описания запрещён (TID251 `yaml`).
5. **`openapi-typescript` 7.13.0 (npm, `apps/studio`).** MIT, релиз 2026-02-11, `peerDependencies.typescript: ^5.x` при
   TypeScript 6.0.3 студии: npm падает с ERESOLVE, pnpm 10.33.0 предупреждает, генерация и `tsc --noEmit --strict` на 6.0.3
   проходят (py-stack-runtime §6.3, §8; ADR-0025, открытый вопрос 13). Строка npm-таблицы остаётся текущей.
6. **`fastapi` без extras.** По `Requires-Dist` extras `standard`, `standard-no-fastapi-cloud-cli` и `all` у fastapi 0.141.1
   тянут `fastapi-cli` и encode `httpx<1.0.0,>=0.23.0`, extra `full` у starlette 1.6.0 — `httpx<0.29.0,>=0.27.0`. Ставим
   `fastapi` без extras, нарушение ловит проверка `uv.lock` (ADR-0025 §5). По той же причине не ставим
   `pydantic-ai-slim[retries]` (`httpx>=0.27`) и `pydantic-ai-slim[logfire]`.
7. **`pyright` с PyPI — обёртка над Node-версией:** зависит от `nodeenv`, extra `nodejs` ставит `nodejs-wheel-binaries`
   (ADR-0025 §1). Node на машине нужен и студии, и тайпчекеру движка.
8. **`kitaru` 0.26.0 — продукт перестроен в 0.22.0 (2026-08-18).** Development Status 4 - Beta, 52 релиза на PyPI с
   2026-03-06. В 0.26.0 нет модулей `kitaru.flow` и `kitaru.adapters.pydantic_ai`, а страница Kitaru в доке Pydantic AI
   описывает прежний API (`KitaruAgent`, `@kitaru.flow`). Ось от пакета не зависит.
9. **`mistralai` 2.10.1 не объявляет лицензию на PyPI:** поля `license` и `license_expression` пусты, классификатора
   `License ::` нет (срез 2026-09-17). Пакет приходит только с необязательным extra `mistral` и в базовую установку не
   входит. Лицензию надо взять из репозитория и записать сюда до того, как extra станет рекомендованным.
