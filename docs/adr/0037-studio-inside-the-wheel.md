# ADR-0037. Studio едет внутри wheel `aqven`: установка одной командой

> Статус: принято
> Дата: 2026-09-21
> Зависит от: [ADR-0024](0024-studio-on-vite.md), [ADR-0025](0025-python-engine.md) §1, [ADR-0030](0030-local-browser-backend.md), [ADR-0036](0036-single-root-monorepo.md)
> Закрывает открытый вопрос 1 [ADR-0036](0036-single-root-monorepo.md) в части состава wheel; источник версии и публикация остаются открытыми
> Источники: проверено запуском в этом репозитории 2026-09-21 — сборка wheel, установка в чистое окружение, запрос Studio по HTTP; практика других проектов — [Streamlit build system](https://deepwiki.com/streamlit/streamlit/2-build-system-and-monorepo), [marimo](https://github.com/marimo-team/marimo), [uv build backend](https://docs.astral.sh/uv/concepts/build-backend/)

## Контекст

[ADR-0030](0030-local-browser-backend.md) зафиксировал: настольного приложения нет, AQVEN запускается локально
в браузере, как Jupyter и marimo. Но способ доставки не был назван. Сегодня Studio берётся из рабочей копии:
`aqven serve --studio-dist <путь>` принимает каталог снаружи, а [static.py](../../packages/aqven/src/aqven/server/static.py)
падает обратно на поиск `apps/studio/dist` вверх по родительским каталогам. И то и другое работает только
внутри чекаута репозитория. Пользователь, поставивший пакет, Studio не получает.

Решение владельца от 2026-09-21: **установка одной командой; проект создаётся Python-CLI, Studio приезжает
пакетом.** То есть собранная Studio должна лежать внутри wheel, а не собираться у пользователя — иначе
установка требует Node, pnpm и сборки фронтенда, и «одна команда» не существует.

**Механизм в коде уже заложен.** `static.py` объявляет `PACKAGED_STUDIO = Path(__file__).parent / "static"`,
и `default_studio()` возвращает `packaged_studio() or development_studio()`. Каталога `aqven/server/static/`
не существовало — его никто не наполнял.

**Как это делают другие.** Проверено по исходникам и документации 2026-09-21:

| Проект | Приём |
|---|---|
| Streamlit | сборка фронтенда `frontend/app/build/` копируется в `lib/streamlit/static/` внутри Python-пакета — тот же приём, что принимается здесь |
| marimo | TypeScript/React на Vite, собранный фронтенд едет в дистрибутиве |
| JupyterLab | `hatch-jupyter-builder` — хук сборки hatchling, запускающий npm при сборке из исходников |
| hatchling вообще | build hooks и `shared-data` дают запустить внешнюю команду во время сборки колеса |

**uv_build хуков не имеет принципиально.** Документация: «While the backend supports a number of options for
configuring your project structure, when build scripts or a more flexible project layout are required, consider
using the hatchling build backend instead». Значит копирование бандла в пакет обязано быть отдельным явным
шагом до `uv build`, а не частью бекенда.

## Решение

**Собранная Studio копируется в `packages/aqven/src/aqven/server/static/` отдельным шагом и едет в wheel как
данные модуля.** Ось версий [ADR-0025](0025-python-engine.md) §1 не трогается: бекенд остаётся `uv_build` 0.12.15.

| Что | Как |
|---|---|
| Копирование | [tools/bundle_studio.py](../../tools/bundle_studio.py): `apps/studio/dist` → `packages/aqven/src/aqven/server/static/`, режим `--check` сверяет sha256 каждого файла |
| Состав wheel | uv_build кладёт неpython-файлы каталога модуля в wheel по умолчанию; **`.gitignore` на это не влияет** (проверено: заигноренный каталог попал в колесо) |
| Git | `packages/aqven/src/aqven/server/static/` в `.gitignore` — это артефакт сборки, в истории ему не место |
| Оркестрация | `mise run bundle` и `mise run package`; в CI — джоба `package` |
| Защита от пустого колеса | CI после сборки открывает wheel и падает, если в нём нет `aqven/server/static/index.html` |

**Установка и первый запуск** после публикации дистрибутивов:

```bash
uvx aqven new my_project        # проект создан, окружение синхронизировано, модели сгенерированы
cd my_project
uv run aqven dev                # Studio из пакета открывается в браузере
```

`aqven new` уже делает всё сам: создаёт проект из шаблона, выполняет `uv sync` и генерирует `types.py`
(`aqven new --help`). Node у пользователя не нужен ни на одном шаге.

**Режим разработки не меняется.** `development_studio()` по-прежнему ищет `apps/studio/dist` вверх по дереву,
а `--studio-dist` по-прежнему перекрывает всё; `packaged_studio()` проверяется первым, поэтому в чекауте с
собранным бандлом внутри пакета приоритет у него — это и есть проверяемое состояние релиза.

## Альтернативы

| Вариант | Почему не он |
|---|---|
| Перевести `aqven` на hatchling с хуком, запускающим pnpm при сборке | единственный способ собрать фронтенд автоматически при `pip install .` из исходников, но меняет бекенд сборки в оси версий [ADR-0025](0025-python-engine.md) §1 и добавляет плагин. У нас исходники собирает CI, а не пользователь: пользователь ставит готовое колесо |
| `hatch-jupyter-builder` | то же самое, плюс заточен под раскладку Jupyter |
| `tool.uv.build-backend.data` (shared-data) | кладёт файлы в `<venv>/share/...`, вне пакета; `packaged_studio()` ищет каталог рядом с модулем, и путь от `__file__` не зависит от схемы установки |
| Отдельный дистрибутив `aqven-studio` только с бандлом | развязал бы версии фронта и движка, но добавляет вторую публикацию и вводит риск рассинхрона с контрактом API ([ADR-0028](0028-studio-api-contract.md)), который у нас проверяется одним `check:api` |
| Тянуть Studio из npm в рантайме | требует Node у пользователя — прямо противоречит установке одной командой |
| Отдавать Studio с CDN | локальное приложение перестаёт работать без сети; [ADR-0030](0030-local-browser-backend.md) строит всё вокруг локального запуска |

## Последствия

- Колесо `aqven` вырастает с ~0.6 до **1.6 МБ**: 37 файлов Studio, из них самый крупный чанк `chat` — 487 КБ.
- **Собрать колесо без Studio по-прежнему возможно**: `uv build` из чистого чекаута, где `bundle_studio.py` не
  запускали, даст колесо без каталога `static/`, и сервер ответит `MISSING_BUNDLE` с кодом 404. Это молчаливый
  класс ошибки, поэтому проверка содержимого колеса в CI обязательна и вынесена отдельным шагом.
- `apps/studio/dist` и `packages/.../static/` — оба артефакты сборки вне git; единственный источник — `pnpm --filter @aqven/studio build`.
- Каждый релиз движка тянет за собой релиз фронтенда: версия у них одна. Это осознанная цена за один
  проверяемый контракт API вместо двух независимо версионируемых артефактов.

## Проверка

Выполнено 2026-09-21. Колесо собрано из этого репозитория, установлено в venv **вне репозитория**, где
`development_studio()` ничего найти не может.

| Шаг | Результат |
|---|---|
| `pnpm --filter @aqven/studio build` | собрано |
| `python tools/bundle_studio.py` | Studio packaged: 37 files |
| `python tools/bundle_studio.py --check` | matches the build: 37 files |
| `uv build --package aqven --wheel` | `aqven-0.0.0-py3-none-any.whl`, 1.6 МБ, 37 файлов под `aqven/server/static/` |
| проверка влияния `.gitignore` | заигноренный каталог попал в колесо: uv_build `.gitignore` не читает |
| установка двух колёс в чистый venv | `packaged_studio()` → путь в `site-packages`; `development_studio()` → `None` |
| `aqven new demo --template minimal --with-tests --no-sync` | проект создан, `types.py` сгенерирован, без сети |
| `aqven serve demo --no-browser` → `GET /` | 200, `text/html`, 854 байта, разметка Studio с `id="root"` |
| `GET /assets/index-DsNUw-kD.js` | 200, `text/javascript`, 321 883 байта |
| `GET /api/project` | 200, `application/json` |
| `ruff check tools/`, `pyright tools/bundle_studio.py` | чисто, 0 ошибок |

Замечание, найденное проверкой: флаг `--headless` выключает монтирование Studio (`serve_studio=not launch.headless`
в [composition.py](../../packages/aqven/src/aqven/app/composition.py)), и `GET /` отвечает 404. Это задуманное
поведение режима «API, SSE и MCP без статики», а не дефект упаковки.

## Пересмотр

Запись пересматривается, если Studio перестанет быть единственным фронтендом движка, если размер бандла
станет проблемой для установки, или если появится настольная оболочка, которой нужен тот же бандл в другой
форме — последнее требует отдельного ADR, отменяющего часть [ADR-0030](0030-local-browser-backend.md).

## Открытые вопросы

1. **Источник версии и публикация.** Оба дистрибутива имеют `version = "0.0.0"`, источник версии не назначен,
   trusted publishing PyPI не настроен, аккаунт проекта не заведён. До этого «установка одной командой»
   выполнима только из локально собранного колеса. Закрыть: решение владельца об имени на PyPI и схеме
   версионирования, затем workflow релиза по тегу.
2. **Стоит ли `aqven new` сразу поднимать стек.** Сейчас команда печатает следующие шаги. Флаг вида
   `aqven new my_project --start` сократил бы путь до одной команды целиком. Закрыть: решение владельца —
   это расширение поверхности CLI, а значит и справочника сайта.
3. **Размер колеса.** 1.6 МБ приемлемо, но чанк `chat` в 487 КБ доминирует. Закрыть: отдельная работа по
   разбиению бандла, если размер станет заметен.
