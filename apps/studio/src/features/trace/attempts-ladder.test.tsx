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
})
