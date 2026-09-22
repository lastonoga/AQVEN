import type { DiffOp, Provenance, ProvenancedValue, TextLine, TextRun } from "@/components/studio"

export const LINE_BREAK = "\n"
const INLINE_CODE = /`([^`]+)`/
const TRAILING_COMMENT = /(?:^|(?<=\s))(?:\/\/|#).*$/
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g
const DIFF_PREFIX: Readonly<Record<DiffOp, string>> = { add: "+ ", remove: "− " }

const escapeRegex = (value: string): string => value.replace(REGEX_SPECIAL, "\\$&")

const isNonEmptyRun = (run: TextRun): boolean => typeof run !== "string" || run.length > 0

const alternate = (parts: readonly string[], mark: (match: string) => TextRun): TextLine =>
  parts.map((part, index) => (index % 2 === 1 ? mark(part) : part)).filter(isNonEmptyRun)

const slotPattern = (labels: readonly string[]): RegExp =>
  new RegExp(`(${[...labels].sort((left, right) => right.length - left.length).map((label) => escapeRegex(`$${label}`)).join("|")})`)

export const templateLines = (text: string, slots: readonly ProvenancedValue[]): readonly TextLine[] => {
  const lines = text.split(LINE_BREAK)
  if (slots.length === 0) return lines.map((line) => [line].filter(isNonEmptyRun))
  const provenance = new Map<string, Provenance>(slots.map((slot) => [`$${slot.label}`, slot.provenance]))
  const pattern = slotPattern(slots.map((slot) => slot.label))
  const markSlot = (match: string): TextRun => ({ text: match, mark: provenance.get(match) ?? "static" })
  return lines.map((line) => alternate(line.split(pattern), markSlot))
}

const splitComment = (line: string): TextLine => {
  const comment = TRAILING_COMMENT.exec(line)
  if (comment === null) return [line].filter(isNonEmptyRun)
  const runs: TextLine = [line.slice(0, comment.index), { text: comment[0], mark: "comment" }]
  return runs.filter(isNonEmptyRun)
}

export const plainLines = (text: string): readonly TextLine[] => {
  if (text.length === 0) return []
  return text.split(LINE_BREAK).map((line) => [line])
}

export const codeLines = (source: string): readonly TextLine[] => source.split(LINE_BREAK).map(splitComment)

export const diffLines = (diff: readonly { readonly op: DiffOp; readonly text: string }[]): readonly TextLine[] =>
  diff.map((entry) => [{ text: `${DIFF_PREFIX[entry.op]}${entry.text}`, mark: entry.op }])

export const comparisonLines = (
  actual: string,
  expected: string,
  labels: { readonly actual: string; readonly expected: string },
): readonly TextLine[] => {
  const width = Math.max(labels.actual.length, labels.expected.length)
  return [
    [`${labels.actual.padEnd(width - 1)} ${actual}`],
    [`${labels.expected.padEnd(width - 1)} ${expected}`],
  ]
}

export const splitInlineCode = (text: string): TextLine =>
  alternate(text.split(INLINE_CODE), (code) => ({ text: code, mark: "code" }))
