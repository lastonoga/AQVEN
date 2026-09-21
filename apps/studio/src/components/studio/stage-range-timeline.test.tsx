import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { StageRangeTimeline } from "./stage-range-timeline"

const order = ["prepare", "triage", "vote", "finalize"]
const labels = {
  selectOnlyNode: (node: string) => `Select only ${node}`,
  moveRange: "Move selected range",
  moveRangeHint: "Drag to move the selected stages.",
  startNode: "Start node",
  endNode: "End node",
}

function Example({ withAvailability = false }: { readonly withAvailability?: boolean }) {
  const [range, setRange] = useState<readonly [number, number]>([0, 3])
  return (
    <StageRangeTimeline
      order={order}
      range={range}
      onRangeChange={setRange}
      labels={labels}
      stageStatus={withAvailability ? (node) => ({
        canStart: node !== "vote",
        compatible: node !== "vote",
        unavailableReason: node === "vote" ? "Missing input" : null,
      }) : undefined}
      rangeAvailable={withAvailability ? false : null}
    />
  )
}

describe("StageRangeTimeline", () => {
  it("lets a manually entered run select one stage without dataset availability", () => {
    render(<Example />)

    fireEvent.click(screen.getByRole("button", { name: "Select only vote" }))
    expect(screen.getByRole("slider", { name: "Start node" }).getAttribute("aria-valuetext")).toBe("vote")
    expect(screen.getByRole("slider", { name: "End node" }).getAttribute("aria-valuetext")).toBe("vote")
    expect(screen.getByRole("button", { name: "Select only vote" }).getAttribute("aria-pressed")).toBe("true")

    fireEvent.keyDown(screen.getByRole("button", { name: "Move selected range" }), { key: "ArrowLeft" })
    expect(screen.getByRole("slider", { name: "Start node" }).getAttribute("aria-valuetext")).toBe("triage")
    expect(screen.getByRole("slider", { name: "End node" }).getAttribute("aria-valuetext")).toBe("triage")
  })

  it("shows pair availability while keeping an unavailable stage selectable", () => {
    render(<Example withAvailability />)

    const vote = screen.getByRole("button", { name: "Select only vote" })
    expect(vote.getAttribute("data-start-available")).toBe("false")
    expect(vote.getAttribute("title")).toContain("Missing input")
    fireEvent.click(vote)
    expect(screen.getByRole("slider", { name: "Start node" }).getAttribute("aria-valuetext")).toBe("vote")
  })
})
