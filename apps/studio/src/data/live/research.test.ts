import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { API_BASE, isNotFound } from "@/api/client"
import * as ids from "@/data/ids"
import { RESEARCH_SERIES } from "@/mocks/data/research"
import { server } from "@/mocks/node"
import { readSeriesEvent, research, seriesEventsUrl } from "./research"

const SERIES = ids.seriesId(RESEARCH_SERIES.noninferiorHoldout)

describe("live research source", () => {
  it("lists the experiments with the filter in the query", async () => {
    const queries: Readonly<Record<string, string>>[] = []
    server.events.on("request:start", ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname === `${API_BASE}/experiments`) queries.push(Object.fromEntries(url.searchParams))
    })
    const experiments = await research.experiments({ flow: ids.flowId("judge_panel"), question: "compare" })
    server.events.removeAllListeners()
    expect(experiments.map((item) => item.id)).toEqual(["judge_panel_agents", "panel_aa_noise", "panel_single_judge"])
    expect(queries[0]).toMatchObject({ flow_id: "judge_panel", question: "compare" })
  })

  it("rejects a missing experiment or series with a not found error", async () => {
    await expect(research.experiment(ids.experimentId("nope"))).rejects.toSatisfy(isNotFound)
    await expect(research.series(ids.seriesId("nope"))).rejects.toSatisfy(isNotFound)
  })

  it("starts a series and a look and returns their ids", async () => {
    const started = await research.startSeries(ids.experimentId("reply_noninferior_mistral"), { on: "holdout", cases: 2, repeats: 1 })
    expect(await research.series(started)).toMatchObject({ id: started, on: "holdout", cases: 2, repeats: 1, status: "running" })
    const look = await research.startLook(ids.flowId("support_case"), ids.datasetId("support_case_cases"), ["strip_flicker_credit"])
    expect(await research.series(look)).toMatchObject({ origin: { kind: "look", cases: ["strip_flicker_credit"] }, question: { kind: "look" } })
  })

  it("filters the case rows through the query", async () => {
    const all = await research.seriesCases(SERIES)
    const failing = await research.seriesCases(SERIES, { failures: true })
    expect(all).toHaveLength(6)
    expect(failing.every((row) => row.failing)).toBe(true)
  })

  it("sends the cancel reason and surfaces a state conflict", async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(`${API_BASE}/series/:seriesId/cancel`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ ok: false, op: "series_cancel", code: "SERIES_STATE_CONFLICT", message: "series is done", problems: [], retry_after_ms: null }, { status: 409 })
      }),
    )
    await expect(research.cancelSeries(SERIES, "enough")).rejects.toMatchObject({ status: 409, code: "SERIES_STATE_CONFLICT" })
    expect(bodies).toEqual([{ reason: "enough" }])
  })

  it("reads only well-formed events of the watched series", () => {
    const read = readSeriesEvent(SERIES)
    expect(read({ seq: 4, at: "2026-09-23T10:00:00Z", series_id: SERIES, type: "series_status", status: "running" })).toEqual({ kind: "status", seq: 4, status: "running" })
    expect(read({ seq: 4, at: "2026-09-23T10:00:00Z", series_id: "other", type: "series_status", status: "running" })).toBeNull()
    expect(read({ seq: 4, series_id: SERIES, type: "node_finished" })).toBeNull()
    expect(read(null)).toBeNull()
    expect(seriesEventsUrl(SERIES, 7)).toBe(`${API_BASE}/series/${SERIES}/events?after_seq=7`)
  })
})
