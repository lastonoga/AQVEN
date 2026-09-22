# Проверенные факты об «Интеграциях» для Wave 5

> Параллельный проход по `packages/aqven-llm/`, `packages/aqven/src/aqven/spec/{agent,tool,mcp}.py`
> и связанным местам, 2026-09-22. Часть — с живой перегенерацией showcase-проекта и реальным запуском
> `aqven secrets`. Код меняется быстрее инвентаризации — перепроверять перед публикацией, не доверять
> вслепую.

## 1. Провайдеры моделей — 28 семейств, не 10

`packages/aqven-llm/src/aqven_llm/catalog.py` — 28 записей `ProviderEntry` (`ENTRIES`, строки 62-117),
не 10, как в более ранних заметках. У 8 из них — свой pip/uv extra, у остальных 20 (в основном
OpenAI-совместимые эндпоинты) extra не нужен, они идут с базовым `pydantic-ai-slim`.

**С extra (нужна отдельная установка `aqven-llm[<name>]`)**: `anthropic`, `google`, `groq`, `mistral`,
`cohere`, `bedrock`, `huggingface`, `xai` — те же 8 объявлены в `packages/aqven/pyproject.toml:50-58`.

**Без extra**: `openai`, `openai-chat`, `openai-responses`, `openrouter`, `deepseek`, `together`,
`fireworks`, `moonshotai`, `nebius`, `ovhcloud`, `alibaba`, `sambanova`, `vercel`, `heroku`, `litellm`,
`vllm`, `ollama`, `cerebras`, `crusoe`, `zai`.

**Три реально нестандартных случая credentials** (не «один ключ — одна переменная»):
- **Bedrock** (`catalog.py:107-109`) — `NO_KEY`: в каталоге вообще нет имени переменной окружения.
  Реально credentials берутся через **собственную цепочку boto3/botocore**
  (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_SESSION_TOKEN`, `~/.aws/credentials`, IAM-роль,
  AWS SSO) — `connectors.py:196-203` строит клиент `boto3.Session().client("bedrock-runtime", ...)`
  напрямую, aqven-llm не передаёт `api_key` вовсе.
- **google** (`catalog.py:91-96`) и **alibaba** (`catalog.py:75`) принимают **любую из двух переменных**
  (`GOOGLE_API_KEY` или `GEMINI_API_KEY`; `ALIBABA_API_KEY` или `DASHSCOPE_API_KEY`) — берётся первая
  непустая.
- **litellm** — ключ вообще не нужен (`NO_KEY`, локальный прокси сам разбирается с апстримом);
  **vllm**/**ollama** — ключ опционален (самохостинг часто без ключа).

Прочие 25 семейств — стандартный паттерн: один обязательный `<NAME>_API_KEY` (у cohere он называется
`CO_API_KEY`, не `COHERE_API_KEY` — единственное расхождение имени с семейством).

## 2. Как проект указывает провайдера у агента

Поле `model` агента — строка `"<provider_id>:<model_name>"`, проверяется по regex
(`spec/names.py:28`): `^[a-z][a-z0-9_-]{0,62}:[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$`. `provider_id` —
либо ключ из встроенного каталога aqven-llm выше, либо `id` из `providers:` в `aqven.yaml` проекта
(с `kind: "code"` или `"openai_compatible"` для нестандартных). `model_name` передаётся дальше как
есть — для OpenRouter это сам по себе `vendor/model` (`openai/gpt-oss-20b`).

Реальный showcase: **все 9 агентов используют один провайдер `openrouter`**
(`examples/lumen/agents/*.yaml`, `model: "openrouter:..."`), объявленный в `aqven.yaml`:
```yaml
providers:
  - id: "openrouter"
    api_key: "ref:env/OPENROUTER_API_KEY"
    data_policy: {allows_pii: true, allows_sensitive: false, retention: "unknown"}
    routing: {data_collection: "deny", zdr: false}
    limits: {rpm: 60}
```

## 3. Внешний MCP-сервер как источник инструментов — отдельный, хорошо документированный механизм

Файл `mcp/<server>.yaml`, `kind: "McpServer"` (`spec/mcp.py:14-21`): `description`,
`transport: "streamable_http"` (**единственный поддерживаемый транспорт — нет stdio для внешних
серверов**), `url`, опциональные `headers: [{name, value: SecretRef}]` (формат секрета —
`ref:env/NAME`, тот же, что везде). Это **единственный способ авторизации** — ни OAuth, ни mTLS,
ни query-параметров каталог не поддерживает.

Два способа привязать сервер к агенту:
- **Весь набор инструментов сервера**: `AgentSpec.mcp_servers: list[McpServerId]` — агент получает
  все тулы сервера через `pydantic_ai.mcp.MCPToolset` (`engine/llm/tools.py:35-46`, это реально
  MCP-клиент Pydantic AI, не самописный).
- **Один конкретный инструмент**: `ToolSpec.mcp: {server, tool}` — оборачивает один именованный
  удалённый тул как обычный `Tool` проекта. **MCP-тул не может иметь `wait`/`in`/`out`** — схему
  даёт сам MCP-сервер (проверяется `aqven check`).

Реальный пример (showcase, `examples/lumen/mcp/helpdesk.yaml`):
```yaml
apiVersion: "aqven/v1"
kind: "McpServer"
description: "MCP-сервер хелпдеска: поиск прошлых обращений и макросов ответа"
transport: "streamable_http"
url: "https://helpdesk.lumen.example/mcp"
headers:
  - name: "Authorization"
    value: "ref:env/LUMEN_HELPDESK_TOKEN"
```
Используется двумя способами одновременно в одном проекте: агент `researcher` берёт **весь** сервер
(`mcp_servers: ["helpdesk"]`), а тул `find_tickets.yaml` оборачивает **один** его инструмент
(`mcp: {server: "helpdesk", tool: "search_tickets"}`), который затем подключён к агенту `resolver`
через обычный `tools:`.

**Не документировать как рабочее**: поле `schema_hash` на `McpServerSpec` существует в модели, но нигде
не заполняется и не сверяется в текущем коде (0 мест записи) — вероятно задел на будущее, не реальная
функция валидации схемы.

## 4. Секреты и окружение

`/engine/secrets/` (Wave 2) уже точно описывает `aqven secrets` — живой перезапуск подтвердил
побайтовое совпадение с реальным выводом, расхождений не найдено. **Эта волна не переписывает эту
страницу**, а закрывает то, чего там нет: как **первый раз завести** секрет для каждого из трёх
источников (провайдер, тул, MCP-сервер) — единый формат `ref:env/NAME` везде, файл `.env` в корне
сгенерированного проекта, окружение процесса побеждает `.env` при расхождении.

Три места, где заводится `SecretRef`, все проверяются `aqven check` только на **синтаксис ссылки**
(`ref:env/[A-Z][A-Z0-9_]*`), не на то, установлено ли значение реально:
- `providers[].api_key` (`aqven.yaml`)
- `Tool.secrets: [{name, ref}]` (`spec/tool.py:32`)
- `McpServer.headers: [{name, value}]` (`spec/mcp.py:20`)

У агента своего поля `secrets` нет — его провайдерский секрет выводится из `model`/`fallback_models`
(`app/secret_declarations.py:31-42`).
