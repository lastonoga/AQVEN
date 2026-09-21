# ADR-0036. Один корень монорепозитория: `apps`, `packages`, `examples`, `tools`, `docs`

> Статус: принято
> Дата: 2026-09-21
> Зависит от: [ADR-0024](0024-studio-on-vite.md), [ADR-0025](0025-python-engine.md) §2, §6, [ADR-0030](0030-local-browser-backend.md)
> Меняет в части раскладки пакетов и корня workspace: [ADR-0025](0025-python-engine.md) §6 — корень uv-workspace теперь корень репозитория, а не каталог `aqven-py`
> Меняет: [20. Репозиторий](../20-repo-and-tooling.md) — документ описывает TS-эпоху (pnpm 12, turborepo, tsdown, пакеты dsl/synth/std/cli) и после [ADR-0025](0025-python-engine.md) недействителен целиком; настоящая запись фиксирует действующую раскладку до его переписывания. [DECISIONS.md](../DECISIONS.md) — ссылки на документацию библиотеки
> Источники: раскладка проверена запуском в этом репозитории 2026-09-21 — `uv sync --all-packages --frozen`, `ruff check .`, `pyright`, три набора pytest, `aqven check`, `pnpm` lint/typecheck/test студии, сборка сайта; конвенции — [uv workspaces](https://docs.astral.sh/uv/concepts/projects/workspaces/), [pnpm workspaces](https://pnpm.io/workspaces)

## Контекст

Репозиторий держал **два независимых корня workspace, вложенных друг в друга**: pnpm-корень в корне
репозитория (`apps/*`, `packages/*`, `site`) и uv-корень в каталоге `aqven-py` (`packages/aqven`,
`packages/aqven-llm`, `examples`). Следствия, измеренные до переезда:

| Что | Факт |
|---|---|
| Два каталога `packages/` | корневой пуст, настоящий — `aqven-py/packages/`; любой путь требовал уточнения, в каком он корне |
| Кросс-корневые относительные пути | `site/package.json`: `cd ../aqven-py && uv run python ../site/scripts/generate_reference.py` — Python-скрипт лежал в TS-пакете и запускался из третьего каталога |
| `site` вне `apps/` | отдельная строка-исключение в `pnpm-workspace.yaml`, хотя это такое же приложение, как `apps/studio` |
| Документация в трёх местах | `docs/`, `site/src/content/docs/`, `aqven-py/docs/` — без правила, куда писать новое |
| Скрипты в четырёх местах | `scripts/`, `aqven-py/scripts/`, `site/scripts/`, `apps/studio/scripts/` |
| CI | только `pages.yml`; ни линта, ни типов, ни тестов — при том что [CLAUDE.md](../../CLAUDE.md) обещает, что инвариант `aqven check` держат хук и CI |
| `pages.yml` | собирает сайт, чья сборка вызывает `reference:check` на Python, но шага установки `uv` в workflow не было |

Распределение кода на момент решения: 1265 файлов Python, 365 студии, 152 документации, 22 сайта.

## Решение

**Корень репозитория — единственный корень обоих workspace.** Каталоги `aqven-py` и `site` упраздняются.

```
pyproject.toml          uv virtual root: members = ["packages/*", "examples"]
uv.lock                 один lock на весь Python
package.json            pnpm root
pnpm-workspace.yaml     packages: [apps/*]
mise.toml               пины python/node/uv/pnpm и задачи поверх обоих стеков

apps/studio             React SPA (@aqven/studio)
apps/site               Astro Starlight (@aqven/site)      ← был /site
packages/aqven          Python-дистрибутив                  ← был aqven-py/packages/aqven
packages/aqven-llm      Python-дистрибутив                  ← был aqven-py/packages/aqven-llm
examples                эталонный проект lumen             ← был aqven-py/examples
tools                   кросс-стековые скрипты обоих языков
docs                    вся документация проекта
```

**`packages/` — только Python.** Глоб `members = ["packages/*"]` соответствует [ADR-0025](0025-python-engine.md) §6
и подхватывает новый дистрибутив без правки конфигурации. uv падает на члене без `pyproject.toml`, поэтому
JS-библиотеке там не место: появится первая — uv переводится на явный список членов, это правка в две строки.
Сегодня общих JS-библиотек нет, `pnpm-workspace.yaml` содержит только `apps/*`.

**Документация — один каталог `docs/`** (решение владельца от 2026-09-21). Документация библиотеки переехала
из `aqven-py/docs/` в `docs/library/`; внутри пакетов каталогов документации нет. Публикуемый продуктовый
контент остаётся частью приложения сайта в `apps/site/src/content/docs/`: это контент-коллекция Astro со своим
frontmatter, а не место для рукописной документации проекта.

**Глубина путей сохранена там, где от неё зависят конфигурации.** `examples` остался на прежнем уровне
вложенности относительно корня workspace, поэтому `extend = "../pyproject.toml"` в `examples/pyproject.toml` и
`extend = "../../../../pyproject.toml"` во вложенном `packages/aqven-llm/src/aqven_llm/ruff.toml`
([ADR-0025](0025-python-engine.md) §6) остались верны без правок, как и `[tool.pyright] extraPaths`.

**CI появляется отдельным workflow `ci.yml`** с четырьмя задачами: `engine` (ruff, `check_uv_lock`, четыре
набора pytest, `aqven check examples/lumen`), `types` (pyright, non-blocking — см. «Последствия»), `studio`
(eslint, tsc, vitest, `check:api`), `site` (полная сборка). `pages.yml` получает установку `uv`, без которой
его шаг сборки сайта не мог выполнить `reference:check`.

## Альтернативы

| Вариант | Почему не он |
|---|---|
| Оставить два корня, переименовав `aqven-py` → `engine` и подняв pnpm в `web/` | симметрично и изолированно, но сохраняет кросс-корневые относительные пути и два разных ответа на вопрос «где корень» |
| Bazel / Pants как полиглот-сборка | из пушки по воробьям: два языка, четыре пакета, один продукт; hermetic build здесь ничего не окупает |
| Turborepo поверх pnpm | граф из трёх JS-пакетов, сборка секунды; turborepo не видит Python и не решает задачу оркестрации двух стеков |
| `mise` как единственный раннер задач | выбран, но как удобство, а не зависимость: `mise.toml` инертен, если mise не установлен, и все команды остаются вызываемыми напрямую |

## Последствия

- Команды выполняются из корня: `uv run ...` и `pnpm --filter ...` без `cd`.
- `tools/generate_reference.py` впервые попал под ruff и pyright — раньше он лежал в `site/scripts/`, вне
  Python-корня. Исправлено: сортировка импортов, типизация рефлексии над `vars(owner)` через `cast` на границе
  рефлексии; длинные строки генерируемой английской прозы — в `per-file-ignores` (`E501`), тем же приёмом, что
  уже применён к `lumen/types.py`.
- **pyright красный и был красным до переезда: 95 ошибок в `packages/`.** Счёт подтверждён прогоном на
  worktree с коммита-чекпоинта до перемещений — до и после переезда ровно 95. Поэтому задача `types` в CI
  помечена `continue-on-error`. Снять пометку — после отдельной работы по зачистке; это не входило в переезд.
- Дата­рованные записи в `docs/superpowers/plans/` и `docs/superpowers/specs/` сохраняют старые пути: это
  исторические протоколы выполненной работы, а не действующие инструкции.
- Каталог виртуального окружения переехал в корень: `.venv` вместо `aqven-py/.venv`. Записанные пути в
  `.aqven/server.json` и производный порт в `tools/dev.mjs` меняются вместе с путём проекта — это ожидаемо.

## Проверка

Выполнено в репозитории 2026-09-21 после переезда:

| Проверка | Результат |
|---|---|
| `uv sync --all-packages --frozen` | успешно, lock валиден в новом корне без перегенерации |
| `uv run ruff check .` | All checks passed |
| `uv run pyright tools/` | 0 ошибок |
| `uv run pyright` | 102 ошибки: 95 в `packages/` (были до переезда), 7 в `tools/` — устранены, см. «Последствия» |
| `pytest packages/aqven` | 1571 passed, 7 skipped |
| `pytest packages/aqven-llm` | 111 passed, 26 skipped |
| `pytest examples` | 36 passed |
| `pytest tools` | 5 passed |
| `aqven check examples/lumen` | errors: 0, warnings: 0 |
| `python tools/check_uv_lock.py` | uv.lock: ok |
| студия: eslint, `tsc -b`, vitest | чисто; 63 файла, 456 тестов passed |
| `pnpm --filter @aqven/site reference:check` | Reference is current |
| `pnpm --filter @aqven/site build` | 180 страниц собрано |

## Пересмотр

Запись пересматривается, если появится вторая JS-библиотека, общая для студии и будущей настольной оболочки
(тогда uv переходит на явный список членов, а `packages/` перестаёт быть только Python-овым), либо если
настольное приложение будет принято отдельным ADR и потребует `apps/desktop` со своей схемой сборки.

## Открытые вопросы

1. **CD не определён.** Обе Python-дистрибуции имеют `version = "0.0.0"`, источник версии не назначен, способ
   публикации не выбран, и не решено, попадает ли собранная студия в wheel (`aqven serve --studio-dist`
   сегодня принимает путь снаружи). Закрыть: отдельный ADR о релизе — источник версии, trusted publishing
   PyPI, состав wheel.
2. **95 ошибок pyright в `packages/`.** Закрыть: отдельная работа по зачистке, после неё снять
   `continue-on-error` с задачи `types` в `ci.yml`.
3. **`apps/desktop`.** [ADR-0030](0030-local-browser-backend.md) отверг Tauri 2.11.4 + PyInstaller как sidecar
   решением владельца от 2026-09-17. Раскладка к появлению оболочки готова, но её сборка требует нового ADR,
   отменяющего эту часть 0030. Закрыть: решение владельца о настольной версии.
4. **[20. Репозиторий](../20-repo-and-tooling.md) не переписан.** Документ описывает несуществующий TS-стек.
   Закрыть: переписать по настоящей записи и [ADR-0025](0025-python-engine.md) §2, §6.
