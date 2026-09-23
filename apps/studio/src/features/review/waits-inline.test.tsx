import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse, type JsonBodyType } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import * as ids from "@/data/ids"
import { server } from "@/mocks/node"
import { renderInStudio } from "@/test/render-route"
import { RESEARCH_SERIES } from "@/mocks/data/research"
import { approvalExecution, approvalRun, formRun, replyApprovalSchema } from "./test-support"
import { WaitsInline } from "./waits-inline"

type ResumeCall = { readonly runId: string; readonly body: unknown }
type RunQuery = Readonly<Record<string, string>>

const SUPPORT_CASE = ids.flowId("support_case")
const LOOK_SERIES = ids.seriesId(RESEARCH_SERIES.lookWaiting)

const ofSeries = <T extends object>(run: T) => ({ ...run, mode: "experiment", series_id: LOOK_SERIES })

const page = <T,>(items: readonly T[]) => ({ items, next_cursor: null, total_estimate: items.length })

const runQueries: RunQuery[] = []

const suspended = (...runs: readonly JsonBodyType[]) =>
  http.get("*/api/runs", ({ request }) => {
    runQueries.push(Object.fromEntries(new URL(request.url).searchParams))
    return HttpResponse.json(page(runs))
  })

const executionDetail = () => http.get("*/api/runs/:runId/executions/detail", () => HttpResponse.json(approvalExecution))

const missingDetail = () =>
  http.get("*/api/runs/:runId/executions/detail", () =>
    HttpResponse.json({ ok: false, op: "run_executions_detail", code: "NOT_FOUND", message: "no execution", problems: [], retry_after_ms: null }, { status: 404 }),
  )

const replyApprovalType = () =>
  http.get("*/api/types/:typeId", () =>
    HttpResponse.json({ type_id: "ReplyApproval", path: "types/records/reply_approval.yaml", file_hash: "sha256-1", spec: {}, json_schema: replyApprovalSchema, enum_values: [] }),
  )

const acceptResume = (): ResumeCall[] => {
  const calls: ResumeCall[] = []
  server.use(
    http.post("*/api/runs/:runId/resume", async ({ params, request }) => {
      calls.push({ runId: String(params["runId"]), body: await request.json() })
      server.use(suspended())
      return HttpResponse.json({ outcome: "accepted", status: "running", address: formRun.waits[0]?.address, attempt: 1 })
    }),
  )
  return calls
}

const rejectResume = (status: number, body: JsonBodyType) => {
  server.use(http.post("*/api/runs/:runId/resume", () => HttpResponse.json(body, { status })))
}

const INVALID_BODY = {
  ok: false,
  op: "run_resume",
  code: "INPUT_INVALID",
  message: "payload does not match the form model",
  problems: [{ path: ["payload", "note"], code: "missing", message: "Field required" }],
  retry_after_ms: null,
}

const STALE_BODY = {
  ok: false,
  op: "run_resume",
  code: "WAIT_ATTEMPT_STALE",
  message: "form was rendered for attempt 5, but attempt 1 is waiting",
  problems: [],
  retry_after_ms: null,
}

const waitsSection = (): Promise<HTMLElement> => screen.findByRole("region", { name: "Steps waiting for a person" })

const rowButtons = async (): Promise<readonly HTMLElement[]> =>
  within(await waitsSection()).getAllByRole("button").filter((button) => button.hasAttribute("aria-expanded"))

describe("WaitsInline", () => {
  beforeEach(() => {
    runQueries.length = 0
  })

  it("lists the waits of a series from the experiment runs of that series and opens the first", async () => {
    server.use(suspended(ofSeries(approvalRun), ofSeries(formRun), { ...formRun, run_id: "01a0c1ff-0000-7000-8000-0000000000aa", series_id: "another" }), executionDetail())
    await renderInStudio(<WaitsInline seriesId={LOOK_SERIES} flowId={SUPPORT_CASE} />)
    const section = await waitsSection()
    expect(within(section).getByText("2 steps")).toBeTruthy()
    expect(runQueries[0]).toMatchObject({ mode: "experiment", status: "suspended", sort: "deadline_at" })
    expect(runQueries[0]?.["flow_id"]).toBeUndefined()
    const rows = within(section).getAllByRole("button", { expanded: true })
    expect(rows.map((row) => row.textContent)).toEqual([
      "past the deadlinerun #b56d92overdue 1 h 19 mroute__resolve · defecttool approval · assigned to support_lead",
    ])
    expect(await within(section).findByText("run #b56d92 · attempt 3 · ToolApprovalAnswer")).toBeDefined()
    expect(within(section).getByText("issue_store_credit")).toBeDefined()
    expect(within(section).getByText("cus_7k2m9p4q1x8z")).toBeDefined()
  })

  it("keeps only the waits of the given run", async () => {
    server.use(suspended(approvalRun, formRun), missingDetail(), replyApprovalType())
    await renderInStudio(<WaitsInline runId={ids.runId(formRun.run_id)} flowId={SUPPORT_CASE} />)
    const rows = await rowButtons()
    expect(rows.map((row) => row.textContent)).toEqual(["run #2347783 h 32 m leftapprovals__lead · leadform · assigned to support_lead"])
    expect(await screen.findByText("Your answer · ReplyApproval")).toBeDefined()
  })

  it("renders nothing when the run waits for nobody", async () => {
    server.use(suspended(approvalRun))
    await renderInStudio(<WaitsInline runId={ids.runId(formRun.run_id)} flowId={SUPPORT_CASE} />)
    await waitFor(() => {
      expect(runQueries).toHaveLength(1)
    })
    expect(screen.queryByRole("region", { name: "Steps waiting for a person" })).toBeNull()
  })

  it("collapses and expands a wait from its row", async () => {
    server.use(suspended(ofSeries(approvalRun), ofSeries(formRun)), executionDetail())
    await renderInStudio(<WaitsInline seriesId={LOOK_SERIES} flowId={SUPPORT_CASE} />)
    const [first] = within(await waitsSection()).getAllByRole("button", { expanded: true })
    fireEvent.click(first ?? document.body)
    expect(within(await waitsSection()).queryAllByRole("button", { expanded: true })).toHaveLength(0)
  })

  it("resumes the run with the waiting attempt and drops the answered wait", async () => {
    const calls = acceptResume()
    server.use(suspended(formRun), missingDetail(), replyApprovalType())
    await renderInStudio(<WaitsInline runId={ids.runId(formRun.run_id)} flowId={SUPPORT_CASE} />)
    fireEvent.change(await screen.findByLabelText("note"), { target: { value: "looks good" } })
    fireEvent.click(screen.getByRole("button", { name: "Submit and resume" }))
    await waitFor(() => {
      expect(calls).toHaveLength(1)
    })
    expect(calls[0]?.runId).toBe(formRun.run_id)
    expect(calls[0]?.body).toMatchObject({
      address: { node_id: "approvals__lead", branch_key: "lead", iteration: null, item_index: null },
      attempt: 1,
      payload: { decision: "approve", edited_text: null, note: "looks good" },
    })
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Steps waiting for a person" })).toBeNull()
    })
  })

  it("marks the field the engine rejected and keeps the draft", async () => {
    rejectResume(422, INVALID_BODY)
    server.use(suspended(formRun), missingDetail(), replyApprovalType())
    await renderInStudio(<WaitsInline runId={ids.runId(formRun.run_id)} flowId={SUPPORT_CASE} />)
    fireEvent.change(await screen.findByLabelText("note"), { target: { value: "keep me" } })
    fireEvent.click(screen.getByRole("button", { name: "Submit and resume" }))
    expect(await screen.findByText("Field required")).toBeDefined()
    expect(screen.getByLabelText("note")).toHaveProperty("value", "keep me")
  })

  it("explains a stale attempt without clearing the form", async () => {
    rejectResume(412, STALE_BODY)
    server.use(suspended(formRun), missingDetail(), replyApprovalType())
    await renderInStudio(<WaitsInline runId={ids.runId(formRun.run_id)} flowId={SUPPORT_CASE} />)
    fireEvent.click(await screen.findByRole("button", { name: "Submit and resume" }))
    expect((await screen.findByRole("alert")).textContent).toBe("The answer was not accepted: form was rendered for attempt 5, but attempt 1 is waiting")
  })

  it("offers a retry when the waits cannot be loaded", async () => {
    server.use(http.get("*/api/runs", () => HttpResponse.error()))
    await renderInStudio(<WaitsInline runId={ids.runId(formRun.run_id)} flowId={SUPPORT_CASE} />)
    expect((await screen.findByRole("alert")).textContent).toContain("Could not load the waiting steps")
    server.use(suspended(formRun), missingDetail(), replyApprovalType())
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(await screen.findByText("Your answer · ReplyApproval")).toBeDefined()
  })
})
