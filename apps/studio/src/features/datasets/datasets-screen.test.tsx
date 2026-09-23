import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { API_BASE } from "@/api/client"
import { liveDatasets } from "@/mocks/data/datasets"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

describe("DatasetsScreen", () => {
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
    await renderRoute("/flows/support_case/datasets")
    fireEvent.click(await screen.findByRole("button", { name: "Upload CSV" }))
    const dialog = screen.getByRole("dialog", { name: "Upload CSV dataset" })
    const record = await within(dialog).findByRole("region", { name: "Context for record__validate" })
    const search = within(dialog).getByRole("region", { name: "Context for search_kb" })
    expect(within(record).getByText("context.date")).toBeTruthy()
    expect(within(search).getByText("context.tenant_id")).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "Download example CSV" })).toHaveProperty("disabled", false)
    expect(within(dialog).getByRole("button", { name: "Check CSV" })).toHaveProperty("disabled", true)
  })

  it("shows the selected dataset and case count on one line, with the project count in the dropdown", async () => {
    const router = await renderRoute("/flows/support_case/datasets?dataset=support_case_cases&case=strip_flicker_credit")
    const trigger = await screen.findByRole("combobox", { name: /Selected dataset support_case_cases, 3 cases/u })
    const name = within(trigger).getByText("support_case_cases")
    const cases = within(trigger).getByText("3 cases")
    expect(name.parentElement).toBe(trigger)
    expect(cases.parentElement).toBe(trigger)
    expect(trigger.textContent).not.toContain("2 datasets in project")
    expect(screen.queryByText("2 datasets in project")).toBeNull()
    expect(screen.queryByText("datasets/support_case_cases.yaml")).toBeNull()
    expect(screen.queryByRole("heading", { name: "support_case_cases" })).toBeNull()
    expect(screen.getByRole("heading", { name: "Datasets", level: 1 })).toBeTruthy()
    expect(screen.getByText("Reusable cases for flow runs and experiments")).toBeTruthy()
    expect(screen.getByText("Flow · support_case")).toBeTruthy()
    const create = screen.getByRole("button", { name: "Upload CSV" })
    expect(create.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(create.getAttribute("data-size")).toBe("sm")
    expect(trigger.getAttribute("data-size")).toBe("sm")
    expect(trigger.className).toContain("w-64")
    expect(trigger.className).not.toContain("min-h-10")

    fireEvent.click(trigger)
    const list = await screen.findByRole("listbox", { name: "Datasets in this project" })
    expect(list.querySelectorAll('[cmdk-item][data-selected="true"]')).toHaveLength(0)
    expect(screen.getByText("2 datasets in project")).toBeTruthy()
    const selectedOption = within(list).getByRole("option", { name: /support_case_cases.*3 cases.*Flow · support_case/u })
    const otherOption = within(list).getByRole("option", { name: /planted_defect_replies.*3 cases.*No flow/u })
    expect(selectedOption.getAttribute("data-checked")).toBe("true")
    expect(selectedOption.className).toContain("data-[checked=true]:bg-[color-mix(in_oklab,var(--popover)_70%,var(--foreground))]")
    expect(otherOption.getAttribute("data-checked")).toBe("false")

    const search = screen.getByRole("combobox", { name: "Search datasets" })
    fireEvent.keyDown(search, { key: "ArrowDown" })
    expect(list.querySelectorAll('[cmdk-item][data-selected="true"]')).toHaveLength(1)
    fireEvent.change(search, { target: { value: "planted_defect_replies" } })
    expect(within(list).getAllByRole("option")).toHaveLength(1)
    fireEvent.click(within(list).getByRole("option", { name: /planted_defect_replies/u }))
    await waitFor(() => { expect(router.state.location.search).toEqual({ dataset: "planted_defect_replies" }) })
    const nextTrigger = await screen.findByRole("combobox", { name: /Selected dataset planted_defect_replies, 3 cases/u })
    expect(within(nextTrigger).getByText("planted_defect_replies").parentElement).toBe(nextTrigger)
    expect(within(nextTrigger).getByText("3 cases").parentElement).toBe(nextTrigger)
    expect(screen.queryByRole("heading", { name: "planted_defect_replies" })).toBeNull()
    expect(screen.getByText("No flow")).toBeTruthy()
    expect(screen.getByText(/Experiments run its cases through an arm/u)).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Run this dataset" })).toBeNull()
    fireEvent.click(nextTrigger)
    const nextList = await screen.findByRole("listbox", { name: "Datasets in this project" })
    const nextSelectedOption = within(nextList).getByRole("option", { name: /planted_defect_replies.*3 cases.*No flow/u })
    expect(nextSelectedOption.getAttribute("data-checked")).toBe("true")
    expect(nextSelectedOption.className).toContain("data-[checked=true]:bg-[color-mix(in_oklab,var(--popover)_70%,var(--foreground))]")
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
          file_hash: "sha256-uploaded", cases: 1, splits: {},
        }, { status: 201 })
      }),
      http.get(`${API_BASE}/datasets/uploaded_cases`, () => HttpResponse.json({
        dataset_id: "uploaded_cases", flow_id: "support_case", path: "datasets/uploaded_cases.yaml",
        file_hash: "sha256-uploaded", cases: 1, splits: {},
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

    await renderRoute("/flows/support_case/datasets?dataset=support_case_cases")
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
    await renderRoute("/flows/support_case/datasets")
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
    await renderRoute("/flows/support_case/datasets")
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

  it("shows every case without split controls", async () => {
    await renderRoute("/flows/support_case/datasets?dataset=support_case_cases")
    const cases = await screen.findByRole("table", { name: "Cases" })
    expect(screen.queryByRole("combobox", { name: "Filter by split" })).toBeNull()
    expect(within(cases).queryByRole("columnheader", { name: "Split" })).toBeNull()
    expect(screen.queryByText(/^Split: /u)).toBeNull()
    expect(await within(cases).findByRole("link", { name: "bulb_app_offline_advice" })).toBeTruthy()
    expect(within(cases).getByRole("link", { name: "lamp_crushed_box_reship" })).toBeTruthy()
    expect(within(cases).getByRole("link", { name: "strip_flicker_credit" })).toBeTruthy()
  })

  it("shows the complete flat case data in one scrollable table with a fixed case column", async () => {
    await renderRoute("/flows/support_case/datasets?dataset=support_case_cases&case=bulb_app_offline_advice")
    const table = await screen.findByRole("table", { name: "Cases" })
    await waitFor(() => { expect(within(table).getByRole("columnheader", { name: "customer.customer_id" })).toBeTruthy() })
    const headers = within(table).getAllByRole("columnheader")
    expect(headers[0]?.textContent).toContain("Case name")
    expect(headers[0]?.className).toContain("sticky")
    expect(headers.map((header) => header.textContent)).toContain("customer.customer_id")
    expect(headers.map((header) => header.textContent)).toContain("origin.page")
    expect(headers.map((header) => header.textContent)).toContain("context.date")
    expect(headers.map((header) => header.textContent)).toContain("metadata.split")
    const row = within(table).getByRole("row", { name: /bulb_app_offline_advice/u })
    expect(within(row).getByText("cus_3n8b5v2c6x1a")).toBeTruthy()
    expect(within(row).getByText("support")).toBeTruthy()
    expect(table.closest("[data-case-table-scroll]")?.className).toContain("overflow-auto")
    expect(screen.queryByRole("heading", { name: "Complete case input" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Run context" })).toBeNull()
  })

  it("shows saved upstream node IDs in one compact column without flattening fixture fields", async () => {
    server.use(http.get(`${API_BASE}/datasets/support_case_cases/cases`, () => HttpResponse.json({
      items: [{ name: "stage_case", inputs: { message: "hello" }, node_outputs: { prepare: { message: "prepared" } } }],
      next_cursor: null,
      total_estimate: 1,
    })))

    await renderRoute("/flows/support_case/datasets?dataset=support_case_cases&case=stage_case")
    const table = await screen.findByRole("table", { name: "Cases" })
    await within(table).findByRole("columnheader", { name: "message" })
    expect(within(table).getByRole("columnheader", { name: "Supplied outputs" })).toBeTruthy()
    expect(within(table).getAllByRole("columnheader")[1]?.textContent).toBe("Supplied outputs")
    expect(within(table).queryByRole("columnheader", { name: "node_outputs.prepare.message" })).toBeNull()
    const row = within(table).getByRole("row", { name: /stage_case/u })
    expect(within(row).getByText("prepare")).toBeTruthy()
    expect(within(row).queryByText("prepared")).toBeNull()
  })

  it("keeps media fields in one column and previews the sample image and PDF", async () => {
    await renderRoute("/flows/support_case/datasets?dataset=support_case_cases&case=strip_flicker_credit")
    const table = await screen.findByRole("table", { name: "Cases" })
    await waitFor(() => { expect(within(table).getByRole("columnheader", { name: "photo" })).toBeTruthy() })

    const columns = within(table).getAllByRole("columnheader").map((header) => header.textContent)
    const photoIndex = columns.indexOf("photo")
    const invoiceIndex = columns.indexOf("invoice")
    expect(photoIndex).toBeGreaterThan(0)
    expect(invoiceIndex).toBeGreaterThan(0)
    expect(columns.filter((column) => column.startsWith("photo.") || column.startsWith("invoice."))).toEqual([])

    const row = within(table).getByRole("row", { name: /strip_flicker_credit/u })
    const cells = within(row).getAllByRole("cell")
    const photoCell = cells[photoIndex - 1]
    const invoiceCell = cells[invoiceIndex - 1]
    if (photoCell === undefined || invoiceCell === undefined) throw new Error("Missing media cells")

    expect(within(photoCell).getByRole("button", { name: "Open image: flow_strip_controller.jpg" })).toBeTruthy()
    expect(within(photoCell).getByRole("img", { name: "flow_strip_controller.jpg" }).getAttribute("src"))
      .toBe("/api/blobs/sha256-0606035923b6e819a36fc2581f0d9bdb78ccfabe8bb6f44a98ac3b2cbd65e3b6")
    expect(within(invoiceCell).getByRole("link", { name: /invoice_LUM-20260903\.pdf/u }).getAttribute("href"))
      .toBe("/api/blobs/sha256-73c299df4819d9854d92954932dc86a16fe13c603013316637ad0385d308e712")
  })

  it("gives the multimodal demo audio enough table width for native controls", async () => {
    const dataset = {
      dataset_id: "support_case_multimodal_demo",
      flow_id: "support_case",
      path: "datasets/support_case_multimodal_demo.yaml",
      file_hash: "sha256-demo-multimodal",
      cases: 1,
      splits: { demo: 1 },
    }
    const item = {
      name: "flickering_strip_all_media",
      inputs: {
        message: "The strip flickers",
        voice_note: {
          $media: "audio/wav",
          blob_id: "sha256-627b3f43f925ca8305175adcbfdaef581de4e48f876356f52b744102fbd27675",
          size_bytes: 32044,
          name: "voice.wav",
        },
      },
    }
    server.use(
      http.get(`${API_BASE}/datasets`, () => HttpResponse.json({ items: [...liveDatasets, dataset], next_cursor: null, total_estimate: liveDatasets.length + 1 })),
      http.get(`${API_BASE}/datasets/${dataset.dataset_id}/cases`, () => HttpResponse.json({ items: [item], next_cursor: null, total_estimate: 1 })),
    )

    await renderRoute(`/flows/support_case/datasets?dataset=${dataset.dataset_id}&case=${item.name}`)
    const table = await screen.findByRole("table", { name: "Cases" })
    const audioHeader = await within(table).findByRole("columnheader", { name: "voice_note" })
    const textHeader = within(table).getByRole("columnheader", { name: "message" })
    const columns = within(table).getAllByRole("columnheader")
    const row = within(table).getByRole("row", { name: /flickering_strip_all_media/u })
    const audioCell = within(row).getAllByRole("cell")[columns.indexOf(audioHeader) - 1]
    if (audioCell === undefined) throw new Error("Missing voice_note cell")

    expect(audioHeader.className).toContain("min-w-[24rem]")
    expect(audioCell.className).toContain("min-w-[24rem]")
    expect(textHeader.className).toContain("min-w-44")
    expect(textHeader.className).not.toContain("min-w-[24rem]")
    const audio = within(audioCell).getByLabelText("voice.wav")
    expect(audio.tagName).toBe("AUDIO")
    expect(audio.hasAttribute("controls")).toBe(true)
  })
})
