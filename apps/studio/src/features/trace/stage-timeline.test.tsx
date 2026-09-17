import type { ReactNode } from "react"
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { IntlProvider } from "use-intl"
import { describe, expect, it, vi } from "vitest"
import type { AttemptLadder, StageRun } from "@/domain"
import { columnId, stageId } from "@/data/ids"
import { formats } from "@/i18n/formats"
import { messages } from "@/i18n/messages"
import { CLOSED_PATHS, type OpenPaths } from "@/lib/search"
import { StageTimeline } from "./stage-timeline"
import { PERSONA_GROUP, ROW_07_STAGES } from "./test-support"
import { openPaths } from "./test-support"

const TEST_DETAIL_URL = "/en/hotel_pitch/pitch_pipeline/tests/pitch_gen_b?row=07"

const mountAt = async (url: string, ui: ReactNode): Promise<void> => {
  const rootRoute = createRootRoute()
  const hostRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/$locale/$workspaceId/$workflowId/tests/$testId",
    component: () => (
      <IntlProvider locale="en" messages={messages.en} formats={formats} timeZone="UTC">
        {ui}
      </IntlProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([hostRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  await act(async () => {
    render(<RouterProvider router={router} />)
    await router.load()
  })
}

const cellButton = (text: string): HTMLElement => {
  const button = screen.getByText(text).closest("button")
  if (button === null) throw new Error(`no activatable cell for ${text}`)
  return button
}

const LADDER: AttemptLadder = {
  columnId: columnId("pitch_gen_b"),
  callLabel: "pitch_gen_b",
  chain: "429 → schema failed → truncated 4096 → fallback_profile (gpt-5.1-mini)",
  billedUsd: 0.0611,
  failedUsd: 0.01,
  attempts: [
    { n: 1, durationS: 0, outcome: "429 Too Many Requests", link: "retry · backoff 400 ms", tokens: { input: 0, output: 0 }, costUsd: 0, result: "failed" },
    { n: 4, durationS: 2.4, outcome: "ok / DEGRADED", link: "fallback_profile → mini", tokens: { input: 2104, output: 902 }, costUsd: 0.011, result: "degraded" },
  ],
}

const PITCH_DECISION: StageRun = {
  id: stageId("pitch_decision"),
  kind: "switch",
  title: "Pitch decision",
  description: { kind: "text", text: "exactly one branch by verdict · needs_human selected" },
  costUsd: 0,
  durationS: null,
  groups: [PERSONA_GROUP],
  attempts: LADDER,
}

describe("StageTimeline under the test-detail route", () => {
  it("renders the trace variant without any Dataflow-bound hook", async () => {
    const onOpenCall = vi.fn()
    await mountAt(TEST_DETAIL_URL, <StageTimeline stages={ROW_07_STAGES} variant="trace" open={CLOSED_PATHS} onOpenCall={onOpenCall} />)

    expect(screen.getByRole("heading", { name: "Pitch divergence" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Critic loop" })).toBeTruthy()
    expect(document.getElementById("stage-pitch_divergence")).not.toBeNull()
    expect(screen.getByText("DIVERGE ×4")).toBeTruthy()
    expect(screen.getByText("4 model families on row #07 input · join all")).toBeTruthy()
    expect(screen.queryByText("run stage")).toBeNull()
    expect(screen.getByText("$0.0471 · 2.4 s")).toBeTruthy()
    expect(screen.getAllByRole("table")).toHaveLength(2)
  })

  it("opens the call sheet tab of the activated cell", async () => {
    const onOpenCall = vi.fn()
    await mountAt(TEST_DETAIL_URL, <StageTimeline stages={ROW_07_STAGES} variant="trace" open={CLOSED_PATHS} onOpenCall={onOpenCall} />)

    fireEvent.click(cellButton("Anthropic · sonnet-4.5"))
    fireEvent.click(cellButton("verdicts of 3 judges"))
    fireEvent.click(cellButton("expand the whole input"))
    const pitchA = ROW_07_STAGES[0]?.groups[0]?.columns.find((column) => column.name === "pitch_gen_a")?.callId
    expect(onOpenCall.mock.calls).toEqual([
      [pitchA, "model"],
      ["call_01HT9", "assertions"],
      [pitchA, "input"],
    ])
  })

  it("renders the join and exit condition footers", async () => {
    await mountAt(TEST_DETAIL_URL, <StageTimeline stages={ROW_07_STAGES} variant="trace" open={CLOSED_PATHS} onOpenCall={vi.fn()} />)

    expect(screen.getByRole("button", { name: "Compare 4 outputs" })).toBeTruthy()
    expect(screen.getByText("pitch_gen_c", { selector: "code" }).parentElement?.textContent).toBe(
      "judges selected pitch_gen_c (0.81) — branch b dropped on an assertion, but its tokens were billed",
    )
    expect(screen.getByText("threshold 0.88 ≥ 0.90 after fix · FIRED").getAttribute("data-tone")).toBe("success")
    expect(screen.getByText("iterations 3 / 8").getAttribute("data-tone")).toBe("neutral")
  })

  it("renders the end slot after the stages", async () => {
    await mountAt(
      TEST_DETAIL_URL,
      <StageTimeline stages={ROW_07_STAGES} variant="trace" open={CLOSED_PATHS} onOpenCall={vi.fn()} end={{ marker: "∎", content: "Row #07 · FAIL" }} />,
    )
    expect(screen.getByText("Row #07 · FAIL")).toBeTruthy()
  })
})

describe("StageTimeline run variant", () => {
  it("mounts open nested blocks recursively and toggles through the open paths", async () => {
    const toggle = vi.fn()
    const base = openPaths(["personas/persona_b2b", "personas/persona_b2b/iteration_3"])
    const open: OpenPaths = { isOpen: base.isOpen, toggle }
    await mountAt(TEST_DETAIL_URL, <StageTimeline stages={[PITCH_DECISION]} variant="run" open={open} onOpenCall={vi.fn()} />)

    expect(screen.getByRole("button", { name: /run stage/ })).toBeTruthy()
    expect(screen.getByText("$0.0000 · waiting")).toBeTruthy()
    const loopBlock = document.getElementById("personas/persona_b2b")
    expect(loopBlock?.getAttribute("data-tone")).toBe("loop")
    expect(within(loopBlock ?? document.body).getByText("critic_loop · persona_b2b")).toBeTruthy()
    const judgesBlock = document.getElementById("personas/persona_b2b/iteration_3")
    expect(within(judgesBlock ?? document.body).getByText("quorum 2 of 3")).toBeTruthy()

    const expander = screen.getByRole("button", { name: "Toggle nested run for persona_b2b" })
    expect(expander.getAttribute("aria-expanded")).toBe("true")
    fireEvent.click(expander)
    expect(toggle).toHaveBeenCalledWith("personas/persona_b2b")
  })

  it("collapses and reopens the attempts ladder", async () => {
    await mountAt(TEST_DETAIL_URL, <StageTimeline stages={[PITCH_DECISION]} variant="run" open={CLOSED_PATHS} onOpenCall={vi.fn()} />)

    expect(document.getElementById("attempts-pitch_gen_b")).not.toBeNull()
    expect(screen.getByText("429 Too Many Requests")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "collapse attempts" }))
    expect(screen.queryByText("429 Too Many Requests")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "expand 2 attempts" }))
    expect(screen.getByText("429 Too Many Requests")).toBeTruthy()
  })
})
