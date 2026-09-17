import { createElement } from "react"
import { useLocale, useNow, type RichTagsFunction } from "use-intl"
import type { IsoDateTime } from "@/domain"
import { emphasisVariants, Text, type TextRole, type TextWeight } from "@/components/studio"

export type RelativeTimeStyle = "long" | "narrow"
export type RichTags = { readonly b: RichTagsFunction; readonly v: RichTagsFunction; readonly code: RichTagsFunction }
export type RichEmphasis = { readonly role: TextRole; readonly weight: TextWeight }

type RelativeStep = { readonly unit: Intl.RelativeTimeFormatUnit; readonly seconds: number; readonly below: number }

const MS_PER_SECOND = 1000
const WEEK: RelativeStep = { unit: "week", seconds: 604_800, below: Number.POSITIVE_INFINITY }
const RELATIVE_STEPS: readonly RelativeStep[] = [
  { unit: "minute", seconds: 60, below: 60 },
  { unit: "hour", seconds: 3_600, below: 24 },
  { unit: "day", seconds: 86_400, below: 7 },
  WEEK,
]

const RICH_TAGS: RichTags = {
  b: (chunks) => createElement("b", { className: emphasisVariants({ weight: "semibold" }) }, chunks),
  v: (chunks) => createElement("span", { className: emphasisVariants({ verbatim: true }) }, chunks),
  code: (chunks) => createElement("code", { className: emphasisVariants({ mono: true }) }, chunks),
}

const emphasisTag =
  ({ role, weight }: RichEmphasis): RichTagsFunction =>
  (chunks) =>
    createElement(Text, { role, weight }, chunks)

export const relativeTime = (date: IsoDateTime, now: Date, locale: string, style: RelativeTimeStyle): string => {
  const elapsedSeconds = (Date.parse(date) - now.getTime()) / MS_PER_SECOND
  const step = RELATIVE_STEPS.find((candidate) => Math.abs(elapsedSeconds / candidate.seconds) < candidate.below) ?? WEEK
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto", style }).format(Math.trunc(elapsedSeconds / step.seconds), step.unit)
}

export const useRelativeTime = (style: RelativeTimeStyle): ((date: IsoDateTime) => string) => {
  const locale = useLocale()
  const now = useNow()
  return (date) => relativeTime(date, now, locale, style)
}

export const useRichTags = (emphasis?: RichEmphasis): RichTags => (emphasis === undefined ? RICH_TAGS : { ...RICH_TAGS, b: emphasisTag(emphasis) })
