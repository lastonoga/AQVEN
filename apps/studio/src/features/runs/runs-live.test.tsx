import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ApiHumanWait, ApiRun, ApiRunSnapshot } from "@/domain"
import { API_BASE } from "@/api/client"
import { COMPLETED_RUN_ID, liveRuns } from "@/mocks/data/runs"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"
import { completedEvents, completedSnapshot, FakeEventSource, nodeFinished, runFinished } from "./test-support"

vi.mock("@/features/chat", () => ({
  ChatPanel: () => null,
}))

const RUN_PAGE = `/flows/support_case/runs?run=${COMPLETED_RUN_ID}`
const RUN_EVENTS = `/api/runs/${COMPLETED_RUN_ID}/events`
const REF = `#${COMPLETED_RUN_ID.slice(-6)}`

type Phase = "prepare" | "triage" | "done"

const PHASE_NODES: Readonly<Record<Exclude<Phase, "done">, readonly string[]>> = {
  prepare: ["prepare"],
  triage: ["prepare", "triage"],
}

const lastSeq = (): number => Math.max(completedSnapshot().last_seq, ...completedEvents().map((event) => event.seq))

const PHASE_SEQ: Readonly<Record<Phase, number>> = { prepare: 0, triage: 1, done: 2 }

const runningSnapshot = (nodes: readonly string[], seq = 0): ApiRunSnapshot => {
  const snapshot = completedSnapshot()
  return {
    ...snapshot,
    status: "running",
    finished_at: null,
    output_ref: null,
    last_seq: lastSeq() + seq,
    executions: snapshot.executions.filter((execution) => nodes.includes(execution.address.node_id)),
  }
}

const snapshotAt = (phase: Phase): ApiRunSnapshot =>
  phase === "done" ? { ...completedSnapshot(), last_seq: lastSeq() + PHASE_SEQ.done } : runningSnapshot(PHASE_NODES[phase], PHASE_SEQ[phase])

const heading = (): Promise<HTMLElement> => screen.findByRole("heading", { name: `Run ${REF}` })

const statusTags = (title: HTMLElement): string => title.closest("div")?.parentElement?.textContent ?? ""

describe("RunsScreen live events", () => {
  let phase: Phase = "prepare"

  beforeEach(() => {
    phase = "prepare"
    FakeEventSource.reset()
    vi.stubGlobal("EventSource", FakeEventSource)
    server.use(http.get(`${API_BASE}/runs/:runId`, () => HttpResponse.json(snapshotAt(phase))))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("follows a running run, draws new executions and stops on the final event", async () => {
    await renderRoute(RUN_PAGE)
    const title = await heading()
    expect(statusTags(title)).toContain("Live")
    expect(statusTags(title)).toContain("RUNNING")
    const source = FakeEventSource.latestOn(RUN_EVENTS)
    expect(source.url).toBe(`${RUN_EVENTS}?after_seq=${String(lastSeq())}`)
    expect(screen.getByRole("heading", { name: "prepare" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "triage" })).toBeNull()

    phase = "triage"
    act(() => {
      source.emit(nodeFinished(COMPLETED_RUN_ID, lastSeq() + 1, "triage"))
    })
    expect(await screen.findByRole("heading", { name: "triage" })).toBeTruthy()
    expect(source.closed).toBe(false)

    phase = "done"
    act(() => {
      source.emit(runFinished(COMPLETED_RUN_ID, lastSeq() + 2))
    })
    expect(source.closed).toBe(true)
    await waitFor(() => {
      expect(statusTags(screen.getByRole("heading", { name: `Run ${REF}` }))).toContain("Completed · 1 step failed")
    })
    expect(statusTags(screen.getByRole("heading", { name: `Run ${REF}` }))).not.toContain("Live")
    expect(FakeEventSource.on(RUN_EVENTS)).toHaveLength(1)
  })

  it("does not subscribe to a finished run", async () => {
    phase = "done"
    await renderRoute(RUN_PAGE)
    await heading()
    expect(FakeEventSource.on(RUN_EVENTS)).toHaveLength(0)
    expect(screen.queryByRole("button", { name: "Cancel run" })).toBeNull()
  })
})

describe("RunsScreen cancel", () => {
  it("cancels a running run with the optional reason", async () => {
    let cancelled = false
    const bodies: unknown[] = []
    server.use(
      http.get(`${API_BASE}/runs/:runId`, () => HttpResponse.json(cancelled
        ? { ...completedSnapshot(), status: "cancelled" }
        : runningSnapshot(PHASE_NODES.triage))),
      http.post(`${API_BASE}/runs/:runId/cancel`, async ({ request }) => {
        bodies.push(await request.json())
        cancelled = true
        return HttpResponse.json({ status: "cancelled" })
      }),
    )
    await renderRoute(RUN_PAGE)
    await heading()
    fireEvent.click(screen.getByRole("button", { name: "Cancel run" }))
    const popover = await screen.findByRole("dialog")
    fireEvent.change(within(popover).getByLabelText("Reason (optional)"), { target: { value: " wrong input " } })
    fireEvent.click(within(popover).getByRole("button", { name: "Cancel run" }))
    await waitFor(() => {
      expect(statusTags(screen.getByRole("heading", { name: `Run ${REF}` }))).toContain("CANCELLED")
    })
    expect(bodies).toEqual([{ reason: "wrong input" }])
    expect(screen.queryByRole("button", { name: "Cancel run" })).toBeNull()
  })

  it("keeps the form open with the engine error when the run already finished", async () => {
    server.use(
      http.get(`${API_BASE}/runs/:runId`, () => HttpResponse.json(runningSnapshot(PHASE_NODES.prepare))),
      http.post(`${API_BASE}/runs/:runId/cancel`, () => HttpResponse.json({
        ok: false,
        op: "run_cancel",
        code: "RUN_STATE_CONFLICT",
        message: "run is already completed",
        problems: [],
        retry_after_ms: null,
      }, { status: 409 })),
    )
    await renderRoute(RUN_PAGE)
    await heading()
    fireEvent.click(screen.getByRole("button", { name: "Cancel run" }))
    const popover = await screen.findByRole("dialog")
    fireEvent.click(within(popover).getByRole("button", { name: "Cancel run" }))
    expect((await within(popover).findByRole("alert")).textContent).toBe("The run was not cancelled: run is already completed")
  })
})

describe("RunsScreen human waits", () => {
  const wait: ApiHumanWait = {
    address: { node_id: "approvals__lead", branch_key: "lead", iteration: null, item_index: null },
    wait_kind: "form",
    attempt: 1,
    state: "waiting",
    assignee: "support_lead",
    waiting_since: "2026-09-18T02:30:00Z",
    deadline_at: "2026-09-18T06:30:00Z",
    on_timeout: "escalate",
    form_type_id: "ReplyApproval",
  }

  it("embeds the waits of the run instead of a separate review page", async () => {
    const snapshot: ApiRunSnapshot = { ...runningSnapshot(PHASE_NODES.triage), status: "suspended", waits: [wait] }
    const suspended: ApiRun = { ...snapshot }
    const flowRuns = liveRuns.filter((run) => run.flow_id === "support_case")
    server.use(
      http.get(`${API_BASE}/runs/:runId`, () => HttpResponse.json(snapshot)),
      http.get(`${API_BASE}/runs`, ({ request }) => {
        const items = new URL(request.url).searchParams.get("status") === "suspended" ? [suspended] : flowRuns
        return HttpResponse.json({ items, next_cursor: null, total_estimate: items.length })
      }),
    )
    await renderRoute(RUN_PAGE)
    await heading()
    const waits = await screen.findByRole("region", { name: "Steps waiting for a person" })
    expect(within(waits).getByText("Waiting for a person")).toBeTruthy()
    expect(within(waits).getByText("1 step")).toBeTruthy()
    expect(waits.compareDocumentPosition(screen.getByRole("navigation", { name: "Nodes in this run" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
