import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { IntlProvider } from "use-intl"
import type { CallDetail, CallSheetTab } from "@/domain"
import { formats } from "@/i18n/formats"
import { messages } from "@/i18n/messages"
import { callDetails } from "@/mocks/data/calls"
import { CallSheet } from "./call-sheet"

const NOW = new Date("2026-09-16T12:00:00Z")

type Harness = { readonly onTabChange: (tab: CallSheetTab) => void; readonly onClose: () => void }

const designedCall = (): CallDetail => {
  const detail = callDetails["hotel_pitch/pitch_pipeline/call_01HT9"]
  if (detail === undefined) throw new Error("call_01HT9 is missing from the mock backend")
  return detail
}

const withIntl = (children: ReactNode) => (
  <IntlProvider locale="en" messages={messages.en} formats={formats} now={NOW} timeZone="UTC">
    <div className="relative h-full min-h-0">{children}</div>
  </IntlProvider>
)

const harness = (): Harness => ({ onTabChange: vi.fn<(tab: CallSheetTab) => void>(), onClose: vi.fn<() => void>() })

describe("CallSheet", () => {
  it("renders nothing while closed", () => {
    const { container } = render(withIntl(<CallSheet open={false} detail={designedCall()} tab="model" {...harness()} />))
    expect(container.textContent).toBe("")
  })

  it("renders the designed header, tabs and the active tab sections", () => {
    render(withIntl(<CallSheet open detail={designedCall()} tab="assertions" {...harness()} />))
    expect(screen.getByRole("dialog", { name: "pitch_gen_b" })).toBeDefined()
    expect(screen.getByText("branch b · stage 4 · row #07")).toBeDefined()
    expect(screen.getByText("call_01HT9 · attempt 4 of 4 · $0.0611 total")).toBeDefined()
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Model", "Input", "Prompt", "Output", "Assertions"])
    expect(screen.getByText("accepted 2 of 3")).toBeDefined()
  })

  it("reports tab changes and closes from the close button", () => {
    const handlers = harness()
    render(withIntl(<CallSheet open detail={designedCall()} tab="model" {...handlers} />))
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Prompt" }), { button: 0 })
    expect(handlers.onTabChange).toHaveBeenCalledWith("prompt")
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(handlers.onClose).toHaveBeenCalledTimes(1)
  })

  it("closes on Escape", () => {
    const handlers = harness()
    render(withIntl(<CallSheet open detail={designedCall()} tab="model" {...handlers} />))
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(handlers.onClose).toHaveBeenCalledTimes(1)
  })

  it("shows the tab empty state when a call has nothing for that tab", () => {
    const designed = designedCall()
    const promptless: CallDetail = { ...designed, prompt: { ...designed.prompt, template: { ...designed.prompt.template, text: "" }, system: "", user: { text: "", tokens: 0 }, diff: [] } }
    render(withIntl(<CallSheet open detail={promptless} tab="prompt" {...harness()} />))
    expect(screen.getByText("No prompt — this step is not a model call")).toBeDefined()
  })

  it("shows the empty state for an unknown call", () => {
    render(withIntl(<CallSheet open detail={null} tab="model" {...harness()} />))
    expect(screen.getByRole("dialog", { name: "Model call" })).toBeDefined()
    expect(screen.getByText("No data for this call")).toBeDefined()
  })
})
