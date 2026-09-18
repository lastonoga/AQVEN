import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse, type JsonBodyType } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"
import { approvalExecution, approvalRun, formRun, replyApprovalSchema } from "./test-support"

type ResumeCall = { readonly runId: string; readonly body: unknown }
type RunQuery = Readonly<Record<string, string>>

const REVIEW_PATH = "/flows/support_case/review"

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

const CHAT_SESSION = {
  session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
  backend: "claude",
  project_root: "/tmp/lumen",
  model: null,
  permission_mode: "default",
  created_at: "2026-09-17T21:55:49.808312Z",
  last_seq: 0,
}

const chatSession = () => http.post("*/api/chat/sessions", () => HttpResponse.json(CHAT_SESSION, { status: 201 }))

const queueCards = async (): Promise<readonly HTMLElement[]> =>
  within(await screen.findByRole("navigation", { name: "Review queue" })).getAllByRole("link")

const selectedFlags = (cards: readonly HTMLElement[]): readonly boolean[] => cards.map((card) => card.getAttribute("aria-current") !== null)

describe("ReviewScreen", () => {
  beforeEach(() => {
    runQueries.length = 0
    server.use(chatSession())
  })

  it("asks the engine for the suspended runs ordered by deadline and selects the first", async () => {
    server.use(suspended(approvalRun, formRun), executionDetail())
    await renderRoute(REVIEW_PATH)
    const cards = await queueCards()
    expect(runQueries[0]).toMatchObject({ flow_id: "support_case", status: "suspended", sort: "deadline_at" })
    expect(runQueries[0]?.["overdue"]).toBeUndefined()
    expect(cards.map((card) => card.textContent)).toEqual([
      "past the deadlinerun #b56d92overdue 1 h 19 mroute__resolve · defecttool approval · assigned to support_lead",
      "run #2347783 h 32 m leftapprovals__lead · leadform · assigned to support_lead",
    ])
    expect(selectedFlags(cards)).toEqual([true, false])
    expect(screen.getByText("run #b56d92 · attempt 3 · ToolApprovalAnswer")).toBeDefined()
    expect(screen.getByText("issue_store_credit")).toBeDefined()
    expect(screen.getByText("cus_7k2m9p4q1x8z")).toBeDefined()
  })

  it("asks the engine for the overdue waits only", async () => {
    server.use(suspended(approvalRun, formRun), executionDetail())
    const router = await renderRoute(REVIEW_PATH)
    fireEvent.click(await screen.findByRole("link", { name: "Overdue" }))
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ overdue: true })
    })
    await waitFor(() => {
      expect(runQueries.at(-1)).toMatchObject({ status: "suspended", sort: "deadline_at", overdue: "true" })
    })
  })

  it("switches the detail from a queue card", async () => {
    server.use(suspended(approvalRun, formRun), missingDetail(), replyApprovalType())
    const router = await renderRoute(REVIEW_PATH)
    const [, formCard] = await queueCards()
    fireEvent.click(formCard ?? document.body)
    expect(await screen.findByText("Your answer · ReplyApproval")).toBeDefined()
    expect(router.state.location.search).toEqual({ run: formRun.run_id, node: "approvals__lead", branch: "lead" })
  })

  it("builds the form from the registered type when the wait has no execution row yet", async () => {
    server.use(suspended(formRun), missingDetail(), replyApprovalType())
    await renderRoute(REVIEW_PATH)
    expect(await screen.findByRole("radiogroup", { name: "decision" })).toBeDefined()
    expect(screen.getByLabelText("edited_text")).toBeDefined()
    expect(screen.getByLabelText("note")).toBeDefined()
  })

  it("resumes the run with the waiting attempt and a stable client op id", async () => {
    const calls = acceptResume()
    server.use(suspended(formRun), missingDetail(), replyApprovalType())
    await renderRoute(REVIEW_PATH)
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
  })

  it("marks the field the engine rejected and keeps the draft", async () => {
    rejectResume(422, INVALID_BODY)
    server.use(suspended(formRun), missingDetail(), replyApprovalType())
    await renderRoute(REVIEW_PATH)
    const note = await screen.findByLabelText("note")
    fireEvent.change(note, { target: { value: "keep me" } })
    fireEvent.click(screen.getByRole("button", { name: "Submit and resume" }))
    expect(await screen.findByText("Field required")).toBeDefined()
    expect(screen.getByLabelText("note")).toHaveProperty("value", "keep me")
  })

  it("explains a stale attempt without clearing the form", async () => {
    rejectResume(412, STALE_BODY)
    server.use(suspended(formRun), missingDetail(), replyApprovalType())
    await renderRoute(REVIEW_PATH)
    fireEvent.click(await screen.findByRole("button", { name: "Submit and resume" }))
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The answer was not accepted: form was rendered for attempt 5, but attempt 1 is waiting",
    )
  })

  it("shows an empty queue when nothing waits for a person", async () => {
    server.use(suspended())
    await renderRoute(REVIEW_PATH)
    expect(await screen.findByText("Nothing waiting for review")).toBeDefined()
    expect(screen.getByText("Select a step to review")).toBeDefined()
  })
})
