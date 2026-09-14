import { isRecord } from "./ir-value.js"

export type ParamRow = { key: string; label: string; value: string }

const ru = new Intl.NumberFormat("ru-RU")

export const paramLabels: Record<string, string> = {
  fn: "Функция",
  tool: "Инструмент",
  component: "Компонент",
  form: "Форма",
  effect: "Эффект",
  pure: "Чистая функция",
  timeoutMs: "Таймаут",
  timeoutSeconds: "Таймаут",
  ttlSeconds: "Кэш (TTL)",
  onTimeout: "По таймауту",
  concurrency: "Параллельность",
  onItemError: "Ошибка элемента",
  maxItems: "Максимум элементов",
  itemType: "Тип элемента",
  onType: "Тип ключа",
  default: "По умолчанию",
  modelRole: "Роль модели",
  trustIn: "Доверие входа",
  typeArgs: "Типовые аргументы",
  body: "Тело",
  over: "Коллекция",
  on: "Ключ",
  budget: "Бюджет",
  usdMicros: "Стоимость",
  seconds: "Время",
  tokens: "Токены",
  overrides: "Переопределения",
  maxOutputTokens: "Лимит токенов",
  temperature: "Температура",
  seed: "Seed",
  outputContract: "Контракт вывода",
  mode: "Режим",
  maxRepairs: "Попыток починки",
  onTruncated: "При обрыве",
  onRefusal: "При отказе",
  maxIter: "Итераций",
  threshold: "Порог",
  select: "Выбор",
  retries: "Повторы",
  attempts: "Попыток",
  backoff: "Задержка",
}

const enumLabels: Record<string, string> = {
  "onItemError:skip": "пропустить",
  "onItemError:fail": "прервать прогон",
  "onItemError:retry": "повторить",
  "effect:read": "чтение",
  "effect:write": "запись",
  "effect:pure": "без эффектов",
  "onTimeout:escalate": "эскалация",
  "onTimeout:fail": "прервать",
  "onTimeout:skip": "пропустить",
  "trustIn:trusted": "доверенный",
  "trustIn:untrusted": "недоверенный",
  "mode:strict": "строгий",
  "mode:lenient": "мягкий",
  "onTruncated:fail": "прервать",
  "onTruncated:repair": "починить",
  "onRefusal:fail": "прервать",
  "onRefusal:retry": "повторить",
  "backoff:exponential": "экспоненциальная",
  "select:best": "лучший",
}

const secondUnits: ReadonlyArray<{ limit: number; unit: string }> = [
  { limit: 86400, unit: "сут" },
  { limit: 3600, unit: "ч" },
  { limit: 60, unit: "мин" },
  { limit: 1, unit: "с" },
]

const fromSeconds = (value: number): string => {
  const unit = secondUnits.find((entry) => value >= entry.limit && value % entry.limit === 0)
  if (unit === undefined) return `${ru.format(value)} с`
  return `${ru.format(value / unit.limit)} ${unit.unit}`
}

const fromMillis = (value: number): string => {
  if (value < 1000) return `${ru.format(value)} мс`
  return fromSeconds(value / 1000)
}

const fromMicros = (value: number): string => `$${(value / 1_000_000).toFixed(2)}`

const numeric = (format: (value: number) => string) => (value: unknown): string =>
  typeof value === "number" ? format(value) : ""

const formatters: Record<string, (value: unknown) => string> = {
  timeoutMs: numeric(fromMillis),
  baseDelayMs: numeric(fromMillis),
  ttlSeconds: numeric(fromSeconds),
  timeoutSeconds: numeric(fromSeconds),
  seconds: numeric(fromSeconds),
  usdMicros: numeric(fromMicros),
}

const booleanLabels: Record<string, string> = { true: "да", false: "нет" }

const generic = (key: string, value: unknown): string => {
  if (typeof value === "string") return enumLabels[`${key}:${value}`] ?? value
  if (typeof value === "number") return ru.format(value)
  if (typeof value === "boolean") return booleanLabels[String(value)] ?? ""
  if (Array.isArray(value)) return value.map((item) => generic(key, item)).filter((item) => item !== "").join(", ")
  return ""
}

export const formatParamValue = (key: string, value: unknown): string => {
  const formatter = formatters[key]
  if (formatter !== undefined) return formatter(value)
  return generic(key, value)
}

export const labelOf = (key: string): string => paramLabels[key] ?? key

const joinLabel = (prefix: string, key: string): string =>
  prefix === "" ? labelOf(key) : `${prefix} · ${labelOf(key)}`

const MAX_DEPTH = 2

export const flattenParams = (
  body: Record<string, unknown>,
  hidden: ReadonlySet<string>,
  prefix = "",
  depth = 0,
): ParamRow[] =>
  Object.entries(body).flatMap(([key, value]) => {
    if (depth === 0 && hidden.has(key)) return []
    if (value === null || value === undefined) return []
    if (isRecord(value) && depth >= MAX_DEPTH) return []
    if (isRecord(value)) return flattenParams(value, hidden, joinLabel(prefix, key), depth + 1)
    const text = formatParamValue(key, value)
    if (text === "") return []
    return [{ key: `${prefix}${key}`, label: joinLabel(prefix, key), value: text }]
  })
