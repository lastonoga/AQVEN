import type { ReactNode } from "react"
import { http, HttpResponse } from "msw"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import { liveNodeDetails } from "@/mocks/data/nodes"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

vi.mock("@/features/chat", () => ({
  ChatPanel: ({ header }: { readonly header: ReactNode }) => header,
  useChatThread: () => [],
  useChatScope: () => "flow",
}))

describe("CanvasScreen", () => {
  it("opens the flow graph without a selected node", async () => {
    await renderRoute("/flows/support_case/canvas")
    expect(await screen.findByRole("application", { name: "Workflow graph" })).toBeTruthy()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: "Fit to view" })).toBeTruthy()
  })

  it("draws the steps, their agents and the containers of the flow", async () => {
    await renderRoute("/flows/support_case/canvas")
    expect(await screen.findByText("triage")).toBeTruthy()
    expect(screen.getByText("gemini · triage")).toBeTruthy()
    expect(screen.getByText("drafts")).toBeTruthy()
    expect(screen.getByText("3 nodes")).toBeTruthy()
    expect(screen.getAllByText("LOOP")).toHaveLength(2)
  })

  it("opens the inspector when a graph node is clicked", async () => {
    await renderRoute("/flows/support_case/canvas")
    const graph = await screen.findByRole("application", { name: "Workflow graph" })
    fireEvent.click(within(graph).getByText("triage"))
    const dialog = await screen.findByRole("dialog", { name: "triage" })
    expect(within(dialog).getByRole("tablist", { name: "Node details" })).toBeTruthy()
    expect(within(dialog).getByRole("radiogroup", { name: "Presentation" })).toBeTruthy()
  })

  it("shows the selected node's contracts, prompt, runtime choices and agent settings without file paths", async () => {
    await renderRoute("/flows/support_case/canvas?node=triage")
    const dialog = await screen.findByRole("dialog", { name: "triage" })
    expect(within(dialog).queryByText(/triage\.node\.yaml/)).toBeNull()
    const tabs = within(dialog)
    fireEvent.mouseDown(tabs.getByRole("tab", { name: "Input" }))
    expect(screen.getByText("Input schema")).toBeTruthy()
    expect(within(tabs.getByRole("list", { name: "Schema fields" })).getByText("message")).toBeTruthy()
    fireEvent.click(tabs.getByRole("radio", { name: "Raw" }))
    expect(screen.getByText("Declared inputs")).toBeTruthy()
    fireEvent.click(tabs.getByRole("radio", { name: "Formatted" }))
    fireEvent.mouseDown(tabs.getByRole("tab", { name: "Prompt" }))
    expect(screen.getAllByText("Template").length).toBeGreaterThan(0)
    expect(within(dialog).getByRole("list", { name: "Prompt inputs" })).toBeTruthy()
    expect(within(dialog).getByText("SignalDef[]")).toBeTruthy()
    expect(within(dialog).getByText("Разрешённые сигналы")).toBeTruthy()
    expect(within(dialog).queryByText(/triage\.prompt\.md/)).toBeNull()
    fireEvent.click(tabs.getByRole("radio", { name: "Raw" }))
    expect(within(dialog).queryByText(/triage\.prompt\.md/)).toBeNull()
    fireEvent.click(tabs.getByRole("radio", { name: "Formatted" }))
    fireEvent.mouseDown(tabs.getByRole("tab", { name: "Output" }))
    expect(screen.getByText("Choices for SignalKey")).toBeTruthy()
    expect(screen.getByText("Ключ сигнала дефекта из справочника категории товара")).toBeTruthy()
    expect(screen.getByText("Each item in the signals input")).toBeTruthy()
    expect(screen.getByText("The available choices are read from the input on every run")).toBeTruthy()
    expect(screen.getByText("intake_extra contains")).toBeTruthy()
    expect(screen.getByText("schema_hash")).toBeTruthy()
    expect(screen.getByText(/The keys and types inside intake_extra\.value come from intake_fields on each run/)).toBeTruthy()
    fireEvent.mouseDown(tabs.getByRole("tab", { name: "Agent" }))
    expect(screen.getByText("google/gemini-2.5-flash-lite")).toBeTruthy()
    expect(screen.getByText("Provider")).toBeTruthy()
    expect(screen.getByText("Response policy")).toBeTruthy()
    expect(within(dialog).queryByText(/agents\/gemini\.yaml/)).toBeNull()
    fireEvent.click(tabs.getByRole("radio", { name: "Raw" }))
    expect(within(dialog).queryByText(/agents\/gemini\.yaml/)).toBeNull()
    expect(within(dialog).queryByText(/triage\.inference\.yaml/)).toBeNull()
  })

  it("shows the output template and its rendered component example in order", async () => {
    const base = liveNodeDetails["support_case/triage"]
    if (base === undefined || base.inference_spec === null) throw new Error("Missing triage node fixture")
    server.use(http.get(`${API_BASE}/flows/support_case/nodes/triage`, () => HttpResponse.json({
      ...base,
      inference_spec: { ...base.inference_spec, display: { input: null, output: { run: null, template: "triage.output.display.liquid", variables: {} } } },
      display_sources: { output: { path: "flows/support_case/nodes/triage/triage.output.display.liquid", text: "{% section %}{% card title: 'Revised answer' %}{% text path: '/reply/text' %}{% endcard %}{% endsection %}" } },
    })), http.get(`${API_BASE}/flows/support_case/nodes/triage/display-preview`, () => HttpResponse.json({
      source: "schema",
      example_name: null,
      sample_output: { reply: { text: "Example reply", citations: [] } },
      document: { version: 1, root: { kind: "section", title: "Customer reply", children: [
        { kind: "card", title: "Revised answer", description: null, tone: "positive", children: [
          { kind: "text", path: "/reply/text", tone: "neutral" },
        ] },
      ] } },
    })))
    await renderRoute("/flows/support_case/canvas?node=triage")
    const dialog = await screen.findByRole("dialog", { name: "triage" })
    fireEvent.mouseDown(within(dialog).getByRole("tab", { name: "Output" }))
    const source = within(dialog).getByRole("heading", { name: "Template source" })
    const display = within(dialog).getByRole("heading", { name: "Template display" })
    expect(source.compareDocumentPosition(display) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(await within(dialog).findByText("Example reply")).toBeTruthy()
    expect(within(dialog).getByText("Revised answer")).toBeTruthy()
    expect(within(dialog).getByText("Example values generated from the output schema")).toBeTruthy()
  })

  it("shows every field of every declared dynamic output form", async () => {
    const base = liveNodeDetails["support_case/triage"]
    if (base === undefined) throw new Error("Missing triage node fixture")
    const detail = {
      ...base,
      node_id: "record__extract",
      local_id: "extract",
      prompt: null,
      out_schema: { type: "object", properties: { record: { type: "object" } }, required: ["record"] },
      dynamic_slots: [{ path: ["out", "record"], schema_from: "$in.form_fields", limits: null }],
      bindings: [{ slot: "form_fields", ref: "$case_form.out.fields", value: null }],
      value_shapes: { record: {
        type_id: "CaseRecord",
        spec: { type: "union", discriminator: "kind", variants: [
          { name: "defect", description: "Defective item", fields: [
            { name: "order_id", type: "OrderId", description: "Order number" },
            { name: "symptom", type: "DefectSymptom", description: "Main symptom" },
            { name: "purchased_on", type: "Date?", description: "Purchase date" },
            { name: "safety_risk", type: "Bool", description: "Safety risk" },
          ] },
          { name: "delivery", description: "Delivery problem", fields: [
            { name: "order_id", type: "OrderId", description: "Order number" },
            { name: "damage", type: "DeliveryDamage", description: "Damage" },
            { name: "carrier_ref", type: "Text?", description: "Carrier reference" },
          ] },
          { name: "question", description: "Customer question", fields: [
            { name: "topic", type: "Text", description: "Question topic" },
            { name: "order_id", type: "OrderId?", description: "Optional order number" },
          ] },
        ] },
        json_schema: { oneOf: [
          { type: "object", properties: {
            kind: { const: "defect", type: "string" },
            order_id: { type: "string", pattern: "^LUM-[0-9]{8}$" },
            symptom: { type: "string", enum: ["flicker", "no_power"] },
            purchased_on: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
            safety_risk: { type: "boolean" },
          }, required: ["kind", "order_id", "symptom", "purchased_on", "safety_risk"] },
          { type: "object", properties: {
            kind: { const: "delivery", type: "string" }, order_id: { type: "string" },
            damage: { type: "string", enum: ["missing_item", "broken_item"] },
            carrier_ref: { anyOf: [{ type: "string", maxLength: 40 }, { type: "null" }] },
          }, required: ["kind", "order_id", "damage", "carrier_ref"] },
          { type: "object", properties: {
            kind: { const: "question", type: "string" }, topic: { type: "string", maxLength: 200 },
            order_id: { anyOf: [{ type: "string" }, { type: "null" }] },
          }, required: ["kind", "topic", "order_id"] },
        ] },
      } },
    }
    server.use(http.get(`${API_BASE}/flows/support_case/nodes/record__extract`, () => HttpResponse.json(detail)))
    await renderRoute("/flows/support_case/canvas?node=record__extract")
    const dialog = await screen.findByRole("dialog", { name: "record__extract" })
    fireEvent.mouseDown(within(dialog).getByRole("tab", { name: "Output" }))
    expect(within(dialog).getByLabelText("Expected fields in record.value")).toBeTruthy()
    const defect = within(dialog).getByRole("region", { name: "defect fields" })
    const delivery = within(dialog).getByRole("region", { name: "delivery fields" })
    const question = within(dialog).getByRole("region", { name: "question fields" })
    for (const region of [defect, delivery, question]) expect(within(region).getByText("kind")).toBeTruthy()
    for (const field of ["order_id", "symptom", "purchased_on", "safety_risk"]) expect(within(defect).getByText(field)).toBeTruthy()
    for (const field of ["order_id", "damage", "carrier_ref"]) expect(within(delivery).getByText(field)).toBeTruthy()
    for (const field of ["topic", "order_id"]) expect(within(question).getByText(field)).toBeTruthy()
    expect(within(defect).getByText("flicker")).toBeTruthy()
    expect(within(delivery).getByText("missing_item")).toBeTruthy()
    expect(within(defect).getByText("Pattern: ^LUM-[0-9]{8}$")).toBeTruthy()
    const dateRow = within(defect).getByText("purchased_on").closest("li")
    if (dateRow === null) throw new Error("Missing purchased_on field row")
    expect(within(dateRow).getByText("required key")).toBeTruthy()
    expect(within(dateRow).getByText("can be null")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("radio", { name: "Raw" }))
    expect(within(dialog).queryByLabelText("Expected fields in record.value")).toBeNull()
    expect(within(dialog).getByText("Declared value shapes")).toBeTruthy()
  })

  it("closes the node details and clears the selected node", async () => {
    const router = await renderRoute("/flows/support_case/canvas?node=triage")
    const dialog = await screen.findByRole("dialog", { name: "triage" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Close node details" }))
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "triage" })).toBeNull()
      expect(router.state.location.search).toEqual({})
    })
  })

  it("opens a second flow on the same screen", async () => {
    await renderRoute("/flows/judge_panel/canvas")
    expect(await screen.findByText("judges")).toBeTruthy()
    expect(screen.getAllByText("pick").length).toBeGreaterThan(0)
    expect(screen.queryByText("triage")).toBeNull()
  })
})
