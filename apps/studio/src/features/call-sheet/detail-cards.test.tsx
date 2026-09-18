import { render, screen, within } from "@testing-library/react"
import { IntlProvider } from "use-intl"
import { describe, expect, it } from "vitest"
import type { ApiExecutionDetail } from "@/domain"
import { messages } from "@/i18n/messages"
import { CheckCards, PromptMessages, SchemaCard } from "./detail-cards"

const withIntl = (element: React.ReactNode): void => {
  render(<IntlProvider locale="en" messages={messages.en} timeZone="UTC">{element}</IntlProvider>)
}

describe("call detail cards", () => {
  it("shows input contract fields and marks a current-schema fallback", () => {
    withIntl(<SchemaCard schema={{ type: "object", required: ["question"], properties: {
      question: { type: "string", description: "Customer question" },
      locale: { type: "string" },
      source: { type: "string" },
      status: { type: "string" },
      perspective: { type: "string" },
    } }} source="current" raw={false} />)
    expect(screen.getByText("Current flow schema; the original run plan is unavailable.")).toBeTruthy()
    const fields = screen.getByRole("list", { name: "Schema fields" })
    expect(within(fields).getByText("question")).toBeTruthy()
    expect(within(fields).getByText("Customer question")).toBeTruthy()
    expect(within(fields).getByText("required")).toBeTruthy()
    expect(within(fields).getByText("perspective")).toBeTruthy()
    expect(screen.queryByText(/Show .* more fields/u)).toBeNull()
  })

  it("shows nested allowed values in the effective output schema", () => {
    withIntl(<SchemaCard schema={{
      type: "object",
      properties: {
        category: { type: "string", enum: ["desk_lamp", "smart_bulb"] },
        observations: { type: "array", items: { $ref: "#/$defs/Observation" } },
      },
      $defs: { Observation: { type: "object", properties: { key: { type: "string", enum: ["flicker", "app_offline"] } } } },
    }} source="run" raw={false} showAllowedValues />)

    const category = screen.getByText("category").closest("li")
    const observations = screen.getByText("observations").closest("li")
    if (category === null || observations === null) throw new Error("Missing schema field")
    expect(within(category).getByText("desk_lamp")).toBeTruthy()
    expect(within(category).getByText("smart_bulb")).toBeTruthy()
    expect(within(observations).getByText("observations[].key")).toBeTruthy()
    expect(within(observations).getByText("flicker")).toBeTruthy()
    expect(within(observations).getByText("app_offline")).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Allowed values" })).toBeNull()
  })

  it("does not present input schema enums as an allowed set", () => {
    withIntl(<SchemaCard schema={{ type: "object", properties: {
      channel: { type: "string", enum: ["storefront", "amazon"] },
    } }} source="run" raw={false} />)

    expect(screen.getByText("channel")).toBeTruthy()
    expect(screen.queryByText("storefront")).toBeNull()
  })

  it("shows the generated message text and its raw trace", () => {
    const prompt = {
      level: 2,
      template_sha256: null,
      rendered_sha256: "sha256-test",
      rendered_ref: null,
      messages: [
        { role: "system", parts: [{ kind: "text", text: "Handle the case", media: null }] },
        { role: "user", parts: [{ kind: "text", text: "Answer for Alice", media: null }] },
      ],
      slot_ranges: [],
      variants: { tone: "calm" },
      output_schema_sent: null,
    } satisfies NonNullable<ApiExecutionDetail["prompt"]>
    withIntl(<><PromptMessages prompt={prompt} raw={false} /><PromptMessages prompt={prompt} raw /></>)
    expect(screen.getByText("Answer for Alice")).toBeTruthy()
    expect(screen.getByText(/tone: calm/u)).toBeTruthy()
    expect(screen.getByText(/"Answer for Alice"/u)).toBeTruthy()
  })

  it("presents every recorded role in message order as a timeline", () => {
    const prompt = {
      level: 2,
      template_sha256: null,
      rendered_sha256: "sha256-test",
      rendered_ref: null,
      messages: [
        { role: "system", parts: [{ kind: "text", text: "Instructions", media: null }] },
        { role: "user", parts: [{ kind: "text", text: "Question", media: null }] },
        { role: "assistant", parts: [{ kind: "text", text: "Calling a tool", media: null }] },
        { role: "tool", parts: [{ kind: "text", text: "Tool result", media: null }] },
      ],
      slot_ranges: [],
      variants: {},
      output_schema_sent: null,
    } satisfies NonNullable<ApiExecutionDetail["prompt"]>

    withIntl(<PromptMessages prompt={prompt} raw={false} />)

    const timeline = screen.getByRole("list", { name: "Message timeline" })
    const steps = within(timeline).getAllByRole("listitem")
    expect(steps).toHaveLength(4)
    for (const [index, role, content] of [
      [0, "system", "Instructions"],
      [1, "user", "Question"],
      [2, "assistant", "Calling a tool"],
      [3, "tool", "Tool result"],
    ] as const) {
      const step = steps[index]
      if (step === undefined) throw new Error(`Missing message ${String(index + 1)}`)
      expect(within(step).getByText(String(index + 1).padStart(2, "0"))).toBeTruthy()
      expect(within(step).getByText(role)).toBeTruthy()
      expect(within(step).getByText(content)).toBeTruthy()
    }
  })

  it("shows check outcome, attempt, policy, and feedback", () => {
    withIntl(<CheckCards checks={[{ check: "answer_quality", on_fail: "retry", passed: false, feedback: "Missing evidence", attempt: 2 }]} />)
    expect(screen.getByText("answer_quality")).toBeTruthy()
    expect(screen.getByText("failed")).toBeTruthy()
    expect(screen.getByText("Missing evidence")).toBeTruthy()
    expect(screen.getByText(/attempt 2/u)).toBeTruthy()
  })
})
