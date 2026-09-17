import type { Ratio, RowId, RunId } from "@/domain"

type UsdDigits = 2 | 3 | 4

const LOCALE = "en-US"
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60

const usdFormat = (digits: UsdDigits): Intl.NumberFormat =>
  new Intl.NumberFormat(LOCALE, { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits })

const USD: Readonly<Record<UsdDigits, Intl.NumberFormat>> = { 2: usdFormat(2), 3: usdFormat(3), 4: usdFormat(4) }
const SCORE = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 3 })
const SIGNED = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 3, signDisplay: "always" })
const COUNT = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const DURATION = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 2, useGrouping: false })
const GROUPED = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 })
const SIGNED_COUNT = new Intl.NumberFormat(LOCALE, { signDisplay: "exceptZero", maximumFractionDigits: 0 })
const PARAM = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 3, useGrouping: false })
const THOUSANDS = /,/g
const DIGIT_GROUP = " "
const FACTOR_SIGN = "×"
const PLAIN_USD_DIGITS = 4

const fixedFormat = (digits: number): Intl.NumberFormat =>
  new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })

export const SEPARATOR = " · "

export const PAIR_SEPARATOR = " / "

export const joinMeta = (parts: readonly (string | null | undefined)[]): string =>
  parts.filter((part): part is string => typeof part === "string" && part.length > 0).join(SEPARATOR)

export const usd = (value: number, digits: UsdDigits = 4): string => USD[digits].format(value)

export const seconds = (value: number, digits = 1): string => `${value.toFixed(digits)} s`

export const duration = (value: number): string => `${DURATION.format(value)} s`

export const score = (value: number): string => SCORE.format(value)

export const signed = (value: number): string => SIGNED.format(value)

export const count = (value: number): string => COUNT.format(value)

export const tokensPair = (input: number, output: number): string => `${count(input)}/${count(output)}`

export const ratio = (value: Ratio, spaced = true): string => [value.passed, value.total].join(spaced ? PAIR_SEPARATOR : PAIR_SEPARATOR.trim())

export const orNone = (value: string, none: string): string => (value.length === 0 ? none : value)

export const fixed = (value: number, digits: number): string => fixedFormat(digits).format(value)

export const groupedCount = (value: number): string => GROUPED.format(value).replace(THOUSANDS, DIGIT_GROUP)

export const signedCount = (value: number): string => SIGNED_COUNT.format(value)

export const param = (value: number): string => PARAM.format(value)

export const factor = (value: number, digits = 1): string => `${FACTOR_SIGN}${fixed(value, digits)}`

export const plainUsd = (value: number): string => fixed(value, PLAIN_USD_DIGITS)

export const percentChange = (value: number, previous: number): string =>
  `${String(Math.abs(Math.round(((value - previous) / previous) * 100)))} %`

export const runRef = (id: RunId): string => `#${id}`

export const rowRef = (id: RowId): string => `#${id}`

const twoDigits = (value: number): string => String(value).padStart(2, "0")

export const minutesClock = (minutes: number): string =>
  `${String(Math.floor(minutes / MINUTES_PER_HOUR))} h ${twoDigits(minutes % MINUTES_PER_HOUR)} m`

export const playTime = (totalSeconds: number): string => {
  const whole = Math.floor(totalSeconds)
  return `${String(Math.floor(whole / SECONDS_PER_MINUTE))}:${twoDigits(whole % SECONDS_PER_MINUTE)}`
}
