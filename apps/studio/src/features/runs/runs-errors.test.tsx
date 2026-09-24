import type { ReactNode } from "react"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ApiExecutionDetail, ApiRunSnapshot } from "@/domain"
import { API_BASE } from "@/api/client"
import { server } from "@/mocks/node"
import { COMPLETED_RUN_ID, FAILED_RUN_ID, liveRuns } from "@/mocks/data/runs"
import { renderRoute } from "@/test/render-route"
import { FACE_RUN_ID, faceDetail, faceEvents, faceSnapshot, legacyProviderError } from "./test-support"

vi.mock("@/features/chat", () => ({
  ChatPanel: ({ header }: { readonly header: ReactNode }) => header,
  useChatThread: () => [],
  useChatScope: () => "flow",
}))

const RUNS = "/flows/support_case/runs"
const REF_TAIL = 6
const ref = (id: string): string => `#${id.slice(-REF_TAIL)}`
const PARTIAL = "Completed · 1 step failed"
const GEMINI_TITLE = "The model rejected the output type"
const QWEN_TITLE = "The model's answer never matched the output type"
const CASSETTE_TITLE = "The replay has no recorded answer for this call"

const toneOf = (element: Element | null | undefined): string | null => element?.closest("[data-tone]")?.getAttribute("data-tone") ?? null

const failedStepsBanner = (): Promise<HTMLElement> => screen.findByRole("region", { name: "Failed steps" })

const serveFaceRun = (snapshot: ApiRunSnapshot = faceSnapshot(), detail: ApiExecutionDetail = faceDetail()): void => {
  server.use(
    http.get(`${API_BASE}/runs/:runId`, ({ params }) => (params["runId"] === FACE_RUN_ID ? HttpResponse.json(snapshot) : undefined)),
    http.get(`${API_BASE}/runs/:runId/events/log`, ({ params }) =>
      params["runId"] === FACE_RUN_ID ? HttpResponse.json({ items: faceEvents(), next_cursor: null, total_estimate: faceEvents().length }) : undefined),
    http.get(`${API_BASE}/runs/:runId/executions/detail`, ({ params }) => (params["runId"] === FACE_RUN_ID ? HttpResponse.json(detail) : undefined)),
    http.post(`${API_BASE}/runs/:runId/presentation`, ({ params }) => (params["runId"] === FACE_RUN_ID ? HttpResponse.json({ results: [] }) : undefined)),
  )
}

describe("a completed run with failed steps", () => {
  it("reads as a warning in the run header and in the run list", async () => {
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const title = await screen.findByRole("heading", { name: `Run ${ref(COMPLETED_RUN_ID)}` })
    const header = title.closest("div")?.parentElement ?? null
    if (header === null) throw new Error("missing run header")
    expect(toneOf(within(header).getByText(PARTIAL))).toBe("warning")
    fireEvent.click(screen.getByRole("combobox", { name: `Run ${ref(COMPLETED_RUN_ID)}` }))
    const list = await screen.findByRole("listbox", { name: "Runs of this flow" })
    const partial = within(list).getByRole("option", { name: new RegExp(`^${ref(COMPLETED_RUN_ID)}`) })
    expect(toneOf(within(partial).getByText(PARTIAL))).toBe("warning")
    const clean = liveRuns.find((run) => run.flow_id === "support_case" && run.status === "completed" && run.node_counts.failed === 0)
    if (clean === undefined) throw new Error("missing clean completed run fixture")
    const cleanOption = within(list).getByRole("option", { name: new RegExp(`^${ref(clean.run_id)}`) })
    expect(toneOf(within(cleanOption).getByText("COMPLETED"))).toBe("success")
  })

  it("lists the failed branch with a readable title, the message and the hint, and opens its details", async () => {
    const router = await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const banner = await failedStepsBanner()
    expect(toneOf(within(banner).getByText("Failed steps"))).toBe("warning")
    expect(within(banner).getByText("The run still completed, without the results of these steps.")).toBeTruthy()
    expect(within(banner).getByText(QWEN_TITLE)).toBeTruthy()
    expect(within(banner).getByText("MODEL_RETRIES_EXHAUSTED")).toBeTruthy()
    expect(within(banner).getByText("panel__judges__qwen · branch qwen")).toBeTruthy()
    expect(within(banner).getByText(/gave no valid output for agent qwen after 2 failed attempts/)).toBeTruthy()
    expect(within(banner).getByText("Hint: set output.mode: native or prompted in agents/qwen.yaml; aqven models check qwen shows which modes work")).toBeTruthy()
    fireEvent.click(within(banner).getByRole("button", { name: "Open step panel__judges__qwen · branch qwen" }))
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ run: COMPLETED_RUN_ID, node: "panel__judges__qwen", branch: "qwen", tab: "model" })
    })
    const panel = await screen.findByRole("dialog", {}, { timeout: 10_000 })
    const error = await within(panel).findByRole("group", { name: QWEN_TITLE })
    expect(within(error).getByText("MODEL_RETRIES_EXHAUSTED")).toBeTruthy()
    expect(within(error).getByText(/gave no valid output for agent qwen/)).toBeTruthy()
    expect(within(error).getByText(/Hint: set output.mode: native or prompted/)).toBeTruthy()
  })

  it("badges the parallel node that lost a branch and marks its stage in the navigator", async () => {
    await renderRoute(`${RUNS}?run=${COMPLETED_RUN_ID}`)
    const nested = await screen.findByRole("heading", { name: "Inside judges" })
    expect(within(nested.parentElement ?? nested).getByText("1 of 3 failed")).toBeTruthy()
    fireEvent.click(screen.getByRole("combobox", { name: "Jump to node" }))
    const panelOption = await screen.findByRole("option", { name: /panel/ })
    expect(within(panelOption).getByText("OK · 1 failed inside")).toBeTruthy()
  })
})

describe("the schema rejection of a map item", () => {
  beforeEach(() => {
    serveFaceRun()
  })

  it("shows the rejected item on the run page instead of a green run", async () => {
    await renderRoute(`/runs/${FACE_RUN_ID}`)
    const banner = await failedStepsBanner()
    expect(within(banner).getByText(GEMINI_TITLE)).toBeTruthy()
    expect(within(banner).getByText("OUTPUT_SCHEMA_REJECTED")).toBeTruthy()
    expect(within(banner).getByText("assess__look · item 0")).toBeTruthy()
    expect(within(banner).getByText(/Hint: LookOut is too complex for the structured output of this model/)).toBeTruthy()
    expect(toneOf(screen.getByText(PARTIAL))).toBe("warning")
    const stage = screen.getByRole("heading", { name: "assess" })
    expect(within(stage.parentElement ?? stage).getByText("1 of 5 failed")).toBeTruthy()
  })

  it("opens the step with the same title and keeps the provider response collapsed", async () => {
    const router = await renderRoute(`/runs/${FACE_RUN_ID}`)
    const banner = await failedStepsBanner()
    fireEvent.click(within(banner).getByRole("button", { name: "Open step assess__look · item 0" }))
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ node: "assess__look", item: 0, tab: "model" })
    })
    const panel = await screen.findByRole("dialog", {}, { timeout: 10_000 })
    const error = await within(panel).findByRole("group", { name: GEMINI_TITLE })
    expect(within(error).getByText(/rejected the output type LookOut of step assess__look/)).toBeTruthy()
    expect(within(error).getByText(/Hint: LookOut is too complex/)).toBeTruthy()
    expect(within(error).getByText("openrouter:google/gemini-2.5-flash-lite · Google AI Studio · HTTP 400 · INVALID_ARGUMENT")).toBeTruthy()
    const summary = within(error).getByText("Provider response")
    const details = summary.closest("details")
    expect(details?.open).toBe(false)
    expect(details?.textContent).toContain("too many states for serving")
    expect(within(error).getByText(/rejected the output type LookOut/).textContent).not.toContain("Provider returned error")
  })

  it("folds the provider dump that older runs kept in the message", async () => {
    serveFaceRun(faceSnapshot(), faceDetail(legacyProviderError))
    await renderRoute(`/runs/${FACE_RUN_ID}?node=assess__look&item=0&tab=model`)
    const panel = await screen.findByRole("dialog", {}, { timeout: 10_000 })
    const error = await within(panel).findByRole("group", { name: "The model provider returned an error" })
    const headline = within(error).getByText(/^status_code: 400, model_name: google\/gemini-2.5-flash-lite/, { selector: "p" })
    expect(headline.textContent.endsWith("…")).toBe(true)
    const full = within(error).getByText("Full message").closest("details")
    expect(full?.open).toBe(false)
    expect(full?.textContent).toContain("previous_errors previous_errors")
  })

  it("shows the formatted error in the checks tab and the raw record in Raw", async () => {
    await renderRoute(`/runs/${FACE_RUN_ID}?node=assess__look&item=0&tab=checks`)
    const panel = await screen.findByRole("dialog", {}, { timeout: 10_000 })
    expect(await within(panel).findByRole("group", { name: GEMINI_TITLE })).toBeTruthy()
    fireEvent.click(within(panel).getByRole("radio", { name: "Raw" }))
    expect(await within(panel).findByText("Error, raw")).toBeTruthy()
    expect(within(panel).queryByRole("group", { name: GEMINI_TITLE })).toBeNull()
  })
})

describe("a failed run", () => {
  it("names the failed step once, in the banner, when the run error repeats it", async () => {
    await renderRoute(`${RUNS}?run=${FAILED_RUN_ID}`)
    const banner = await failedStepsBanner()
    expect(toneOf(within(banner).getByText("Failed steps"))).toBe("destructive")
    expect(within(banner).getByText(CASSETTE_TITLE)).toBeTruthy()
    expect(within(banner).getByText("The run stopped because of these failures.")).toBeTruthy()
    expect(screen.queryByRole("group", { name: CASSETTE_TITLE })).toBeNull()
  })

  it("keeps a run error that no step explains in its own panel", async () => {
    serveFaceRun({
      ...faceSnapshot(),
      status: "failed",
      error: { code: "INTERNAL", message: "the executor crashed", address: null, hint: null, details: null },
    })
    await renderRoute(`/runs/${FACE_RUN_ID}`)
    const error = await screen.findByRole("group", { name: "The engine failed" })
    expect(within(error).getByText("the executor crashed")).toBeTruthy()
    const banner = await failedStepsBanner()
    expect(within(banner).getByText(GEMINI_TITLE)).toBeTruthy()
  })
})
