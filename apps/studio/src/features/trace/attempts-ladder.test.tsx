import { render, screen } from "@testing-library/react"
import { IntlProvider, useTranslations } from "use-intl"
import { describe, expect, it } from "vitest"
import { messages } from "@/i18n/messages"
import { AttemptsLadder } from "./attempts-ladder"

const attempt = (rawExcerpt: string | null) => ({
  attempt: 1,
  kind: "schema_invalid",
  code: "MODEL_SCHEMA_MISMATCH",
  action: "repair",
  message: "Invalid schema",
  hint: null,
  rawExcerpt,
  problems: [],
})

function Ladder({ rawExcerpt }: { readonly rawExcerpt: string | null }) {
  const t = useTranslations()
  return <AttemptsLadder ladder={{ columnId: "gpt", callLabel: "gpt", attempts: [attempt(rawExcerpt)] }} t={t} />
}

const renderAttempt = (rawExcerpt: string | null): void => {
  render(<IntlProvider locale="en" messages={messages.en} timeZone="UTC"><Ladder rawExcerpt={rawExcerpt} /></IntlProvider>)
}

describe("AttemptsLadder", () => {
  it("shows the complete raw output supplied by the run", () => {
    const full = "answer ".repeat(500)
    renderAttempt(full)

    const label = screen.getByText("Raw excerpt")
    expect(label.parentElement?.querySelector("dd")?.textContent).toBe(full)
  })

  it("still shows the recorded excerpt from an older run", () => {
    renderAttempt("short preview…")

    expect(screen.getByText("short preview…")).toBeTruthy()
    expect(screen.getByText("Raw excerpt")).toBeTruthy()
  })

  it("shows one answer when the response repeats the same answer, whatever the key order", () => {
    const answers = [JSON.stringify({ intent: "refund", confidence: 0.4 }), JSON.stringify({ confidence: 0.4, intent: "refund" })]
    renderAttempt([...answers, ...answers, ...answers].join("\n"))

    const value = screen.getByText("Raw excerpt").parentElement?.querySelector("dd")
    expect(value?.firstChild?.textContent).toBe(answers[0])
    expect(screen.getByText("×6 identical answers in one response")).toBeTruthy()
  })

  it("keeps different answers of one response as recorded", () => {
    const raw = [JSON.stringify({ intent: "refund" }), JSON.stringify({ intent: "defect" })].join("\n")
    renderAttempt(raw)

    expect(screen.getByText("Raw excerpt").parentElement?.querySelector("dd")?.textContent).toBe(raw)
    expect(screen.queryByText(/identical answers/)).toBeNull()
  })
})
