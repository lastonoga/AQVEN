import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { API_BASE } from "@/api/client"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

describe("CsvImport", () => {
  beforeEach(() => {
    server.use(http.get(`${API_BASE}/datasets/import-csv/template`, () => HttpResponse.json({
      flow_id: "support_case",
      fields: [
        { column: "name", kind: "name", type: "string", required: true, description: "Case ID", example: "example_case" },
        { column: "inputs.message", kind: "input", type: "string", required: true, description: "Message", example: "Hello" },
        { column: "context.date", kind: "context", type: "date", required: true, description: "Run date", example: "2026-09-18" },
        { column: "context.tenant_id", kind: "context", type: "string", required: true, description: "Tenant", example: "lumen" },
        { column: "node_outputs.prepare.message", kind: "node_outputs", type: "string", required: false, description: "Optional saved output", example: "" },
      ],
      nodes: [
        { node_id: "prepare", parent_node_id: null, input_columns: ["inputs.message"], context_columns: [], fixture_columns: ["node_outputs.prepare.message"] },
        { node_id: "record__validate", parent_node_id: "record", input_columns: [], context_columns: ["context.date"], fixture_columns: [] },
        { node_id: "search_kb", parent_node_id: null, input_columns: ["inputs.message"], context_columns: ["context.tenant_id"], fixture_columns: [] },
      ],
      csv: "name,inputs.message,context.date,context.tenant_id,node_outputs.prepare.message\nexample_case,Hello,2026-09-18,lumen,\n",
    })))
  })

  it("shows node-specific context and a downloadable example before file selection", async () => {
    await renderRoute("/flows/support_case/cases")
    fireEvent.click(await screen.findByRole("button", { name: "Upload CSV" }))
    const dialog = screen.getByRole("dialog", { name: "Upload CSV dataset" })
    const record = await within(dialog).findByRole("region", { name: "Context for record__validate" })
    const search = within(dialog).getByRole("region", { name: "Context for search_kb" })
    expect(within(record).getByText("context.date")).toBeTruthy()
    expect(within(search).getByText("context.tenant_id")).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "Download example CSV" })).toHaveProperty("disabled", false)
    expect(within(dialog).getByRole("button", { name: "Check CSV" })).toHaveProperty("disabled", true)
  })

  it("shows CSV column and node checks before allowing dataset creation", async () => {
    let previews = 0
    let imports = 0
    server.use(
      http.post(`${API_BASE}/datasets/import-csv/preview`, () => {
        previews += 1
        return HttpResponse.json({
          dataset_id: "uploaded_cases",
          flow_id: "support_case",
          row_count: 1,
          columns: [
            { source: "name", target: "name", kind: "case" },
            { source: "inputs.message", target: "message", kind: "input" },
            { source: "context.date", target: "date", kind: "context" },
          ],
          rows: [{ number: 2, name: "sample_case", ready: true, full_flow_ready: true, full_flow_missing: [], problems: [], nodes: [
            { node_id: "prepare", ready: true, missing: [] },
            { node_id: "triage", ready: false, missing: ["$nodes.prepare.output: missing upstream output"] },
          ] }],
          media_count: 0, media: [],
          problems: [],
          ready: true,
        })
      }),
      http.post(`${API_BASE}/datasets/import-csv`, () => {
        imports += 1
        return HttpResponse.json({
          dataset_id: "uploaded_cases", flow_id: "support_case", path: "datasets/uploaded_cases.yaml",
          file_hash: "sha256-uploaded", cases: 1, splits: {}, used_by: [],
        }, { status: 201 })
      }),
      http.get(`${API_BASE}/datasets/uploaded_cases`, () => HttpResponse.json({
        dataset_id: "uploaded_cases", flow_id: "support_case", path: "datasets/uploaded_cases.yaml",
        file_hash: "sha256-uploaded", cases: 1, splits: {}, used_by: [],
      })),
      http.get(`${API_BASE}/datasets/uploaded_cases/cases`, () => HttpResponse.json({
        items: [{ name: "sample_case", inputs: { message: "Hello" }, context: { date: "2026-09-18" } }],
        next_cursor: null,
        total_estimate: 1,
      })),
      http.get(`${API_BASE}/datasets/uploaded_cases/case-names`, () => HttpResponse.json({
        items: ["sample_case"], next_cursor: null, total_estimate: 1,
      })),
      http.post(`${API_BASE}/flows/support_case/dataset-range`, () => HttpResponse.json({
        order: ["prepare", "triage"],
        ranges: [
          { start_node: "prepare", end_node: "prepare", available: true, missing: [] },
          { start_node: "prepare", end_node: "triage", available: true, missing: [] },
          { start_node: "triage", end_node: "triage", available: false, missing: [{ case_name: "sample_case", reference: "$prepare.out", reason: "missing upstream output" }] },
        ],
      })),
    )

    await renderRoute("/flows/support_case/cases?dataset=support_case_cases")
    fireEvent.click(await screen.findByRole("button", { name: "Upload CSV" }))
    const dialog = screen.getByRole("dialog", { name: "Upload CSV dataset" })
    const create = within(dialog).getByRole("button", { name: "Create dataset" })
    expect(create).toHaveProperty("disabled", true)
    fireEvent.change(within(dialog).getByLabelText("Dataset ID"), { target: { value: "uploaded_cases" } })
    fireEvent.change(within(dialog).getByLabelText("CSV file"), {
      target: { files: [new File(["name,inputs.message,context.date\nsample_case,Hello,2026-09-18\n"], "cases.csv", { type: "text/csv" })] },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Check CSV" }))
    await waitFor(() => { expect(previews).toBe(1) })
    expect(await within(dialog).findByText("1 valid case")).toBeTruthy()
    expect(within(dialog).getAllByText("inputs.message").length).toBeGreaterThan(0)
    expect(within(dialog).getByText("Entire flow")).toBeTruthy()
    expect(within(dialog).getByText("1 / 1 cases can launch")).toBeTruthy()
    expect(within(dialog).getAllByText("prepare").length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText("triage").length).toBeGreaterThan(0)
    expect(create).toHaveProperty("disabled", false)
    fireEvent.click(create)
    await waitFor(() => { expect(imports).toBe(1) })
    expect(await within(dialog).findByText("Saved dataset verified: 1 case")).toBeTruthy()
    expect(within(dialog).getByText("Entire flow: can launch")).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "Open dataset" })).toBeTruthy()
  })

  it("keeps dataset creation blocked when CSV pre-check finds invalid rows", async () => {
    let imports = 0
    server.use(
      http.post(`${API_BASE}/datasets/import-csv/preview`, () => HttpResponse.json({
        dataset_id: "invalid_cases", flow_id: "support_case", row_count: 1,
        columns: [{ source: "inputs.unknown", target: "", kind: "unmatched" }],
        rows: [{ number: 2, name: "bad_case", ready: false, problems: ["inputs.customer is required"], nodes: [] }],
        media_count: 0, media: [],
        problems: ["column inputs.unknown does not match flow input"], ready: false,
      })),
      http.post(`${API_BASE}/datasets/import-csv`, () => { imports += 1; return HttpResponse.error() }),
    )
    await renderRoute("/flows/support_case/cases")
    fireEvent.click(await screen.findByRole("button", { name: "Upload CSV" }))
    const dialog = screen.getByRole("dialog", { name: "Upload CSV dataset" })
    fireEvent.change(within(dialog).getByLabelText("Dataset ID"), { target: { value: "invalid_cases" } })
    fireEvent.change(within(dialog).getByLabelText("CSV file"), {
      target: { files: [new File(["name,inputs.message\nbad_case,Hi\n"], "bad.csv", { type: "text/csv" })] },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Check CSV" }))
    expect(await within(dialog).findByText("Row 2: inputs.customer is required")).toBeTruthy()
    expect(within(dialog).getByText("Unmatched")).toBeTruthy()
    expect(within(dialog).getByText("column inputs.unknown does not match flow input")).toBeTruthy()
    const create = within(dialog).getByRole("button", { name: "Create dataset" })
    expect(create).toHaveProperty("disabled", true)
    expect(imports).toBe(0)
  })

  it("does not reuse a completed pre-check after the CSV file changes", async () => {
    let release = (): void => {}
    const pending = new Promise<void>((resolve) => { release = resolve })
    server.use(http.post(`${API_BASE}/datasets/import-csv/preview`, async () => {
      await pending
      return HttpResponse.json({
        dataset_id: "changed_cases", flow_id: "support_case", row_count: 1,
        columns: [{ source: "name", target: "name", kind: "name" }],
        rows: [{ number: 2, name: "first_case", ready: true, problems: [], nodes: [] }],
        media_count: 0, media: [],
        problems: [], ready: true,
      })
    }))
    await renderRoute("/flows/support_case/cases")
    fireEvent.click(await screen.findByRole("button", { name: "Upload CSV" }))
    const dialog = screen.getByRole("dialog", { name: "Upload CSV dataset" })
    fireEvent.change(within(dialog).getByLabelText("Dataset ID"), { target: { value: "changed_cases" } })
    const fileInput = within(dialog).getByLabelText("CSV file")
    fireEvent.change(fileInput, { target: { files: [new File(["name\nfirst_case\n"], "first.csv")] } })
    fireEvent.click(within(dialog).getByRole("button", { name: "Check CSV" }))
    fireEvent.change(fileInput, { target: { files: [new File(["name\nsecond_case\n"], "second.csv")] } })
    release()
    await waitFor(() => { expect(within(dialog).getByRole("button", { name: "Check CSV" })).toHaveProperty("disabled", false) })
    expect(within(dialog).getByRole("button", { name: "Create dataset" })).toHaveProperty("disabled", true)
  })
})
