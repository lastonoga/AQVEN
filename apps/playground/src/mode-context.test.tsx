import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ModeProvider, useMode } from "./mode-context.js"
import type { FlowMode } from "./routing/route.js"

function Probe() {
  const { mode, flowId, runId, hrefOfMode, hrefOfRun } = useMode()
  return (
    <ul>
      <li>{`mode:${mode}`}</li>
      <li>{`flow:${flowId}`}</li>
      <li>{`run:${runId ?? "-"}`}</li>
      <li>{`schema:${hrefOfMode("schema")}`}</li>
      <li>{`run-mode:${hrefOfMode("run")}`}</li>
      <li>{`pick:${hrefOfRun("r2")}`}</li>
      <li>{`drop:${hrefOfRun(null)}`}</li>
    </ul>
  )
}

const markup = (mode: FlowMode, runId: string | null): string =>
  renderToStaticMarkup(
    <ModeProvider flowId="f1" mode={mode} runId={runId}>
      <Probe />
    </ModeProvider>,
  )

describe("ModeProvider", () => {
  it("отдаёт режим и прогон", () => {
    const html = markup("run", "r1")
    expect(html).toContain("mode:run")
    expect(html).toContain("flow:f1")
    expect(html).toContain("run:r1")
  })

  it("переключение режима не теряет прогон", () => {
    const html = markup("run", "r1")
    expect(html).toContain("schema:#/flow/f1?run=r1")
    expect(html).toContain("run-mode:#/flow/f1/run/r1")
  })

  it("выбор прогона остаётся в текущем режиме", () => {
    expect(markup("run", "r1")).toContain("pick:#/flow/f1/run/r2")
    expect(markup("schema", "r1")).toContain("pick:#/flow/f1?run=r2")
    expect(markup("run", "r1")).toContain("drop:#/flow/f1/run")
  })

  it("без провайдера падает явно", () => {
    expect(() => renderToStaticMarkup(<Probe />)).toThrow(/ModeProvider/)
  })
})
