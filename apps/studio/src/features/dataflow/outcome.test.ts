import { describe, expect, it } from "vitest"
import { createTranslator } from "use-intl"
import { messages } from "@/i18n/messages"
import { outcomeView } from "./outcome"

const t = createTranslator({ locale: "en", messages: messages.en, namespace: "dataflow" })

describe("outcomeView", () => {
  it("describes a run paused on a human with its trace gap", () => {
    expect(outcomeView({ status: "awaiting", billedUsd: 0.4187, traceGap: { seconds: 1.4, fromStage: 5, toStage: 6 } }, t)).toEqual({
      title: "Run paused on a human",
      note: "billed across all attempts and all branches, cancelled ones included:",
      billed: "$0.4187",
      traceGap: "trace gap 1.4 s between stages 5 and 6 — left deliberately",
    })
  })

  it("titles finished and failed runs without a trace gap", () => {
    expect(outcomeView({ status: "ok", billedUsd: 0.3102 }, t)).toMatchObject({ title: "Run finished", billed: "$0.3102", traceGap: null })
    expect(outcomeView({ status: "failed", billedUsd: 0.1904 }, t).title).toBe("Run failed")
  })
})
