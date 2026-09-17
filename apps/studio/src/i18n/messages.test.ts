import { describe, expect, it } from "vitest"
import { createTranslator, type MarkupTagsFunction, type MarkupTranslationValues } from "use-intl"
import { LOCALES } from "@/domain"
import { formats } from "./formats"
import { messages } from "./messages"

type LeafMessage = { readonly key: string; readonly message: string }

const NAMESPACES = ["common", "domain", "shell", "chat", "schema", "trace", "dataflow", "callSheet", "nodes", "tests", "testDetail", "review", "setup"]

const ARGUMENT_NAME = /\{\s*(\w+)/g
const TAG_NAME = /<(\w+)>/g
const SAMPLE_ARGUMENT = 2

const echoChunks: MarkupTagsFunction = (chunks) => chunks

const leafMessages = (value: unknown, prefix: string): readonly LeafMessage[] => {
  if (typeof value === "string") return [{ key: prefix, message: value }]
  if (typeof value !== "object" || value === null) return []
  return Object.entries(value).flatMap(([key, child]) => leafMessages(child, prefix === "" ? key : `${prefix}.${key}`))
}

const namesIn = (pattern: RegExp, message: string): readonly string[] => Array.from(message.matchAll(pattern), (match) => match[1] ?? "")

const sampleValues = (message: string): MarkupTranslationValues => ({
  ...Object.fromEntries(namesIn(ARGUMENT_NAME, message).map((name) => [name, SAMPLE_ARGUMENT])),
  ...Object.fromEntries(namesIn(TAG_NAME, message).map((name) => [name, echoChunks])),
})

describe("messages", () => {
  it("ships every namespace for every locale", () => {
    LOCALES.forEach((locale) => {
      expect(Object.keys(messages[locale]).sort()).toEqual([...NAMESPACES].sort())
    })
  })

  it("formats every message without ICU errors", () => {
    const errors: string[] = []
    const t = createTranslator({
      locale: "en",
      messages: messages.en,
      formats,
      onError: (error) => {
        errors.push(error.message)
      },
    })
    const leaves = leafMessages(messages.en, "")
    const keys = leaves.map((leaf) => leaf.key)
    const isMessageKey = (key: string): key is Parameters<typeof t.markup>[0] => keys.includes(key)
    const rendered = leaves.flatMap(({ key, message }) => (isMessageKey(key) ? [t.markup(key, sampleValues(message))] : []))
    expect(rendered).toHaveLength(leaves.length)
    expect(errors).toEqual([])
    expect(rendered).not.toContain("")
    expect(t("domain.check.stop")).toBe("→ stop")
    expect(t("common.units.tokens", { count: 1 })).toBe("1 token")
    expect(t("domain.matrixSub.scorerThreshold", { threshold: "0.90" })).toBe("scorer · threshold 0.90")
  })
})
