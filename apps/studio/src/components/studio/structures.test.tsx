import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ContentPart } from "@/domain"
import { renderInRouter } from "@/test/render-route"
import { ChoiceGroup, ChoiceLink, ChoiceList } from "./choice"
import { Matrix, RowLink, type MatrixField, type MatrixSpanField } from "./matrix"
import { MatrixCell } from "./matrix-cell"
import { MediaPart } from "./media-part"
import { PanelLayout } from "./panel-layout"
import { SidePanel } from "./side-panel"
import { SplitPane } from "./split-pane"
import { Timeline } from "./timeline"

type Row = { readonly id: string; readonly name: string; readonly locked: boolean }

const ROWS: readonly Row[] = [
  { id: "07", name: "Marins", locked: false },
  { id: "12", name: "Rodina Grand", locked: true },
]

const cellsOf = (row: HTMLElement): readonly HTMLElement[] => within(row).getAllByRole("cell")

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Matrix rows", () => {
  const fields: readonly MatrixField<Row>[] = [
    { id: "id", label: "#", track: "40px", render: (row) => row.id },
    { id: "name", label: "hotel.name", verbatim: true, render: (row) => row.name, paint: (row) => (row.id === "07" ? { surface: "llm" } : {}) },
    { id: "rating", label: "rating", align: "end", render: () => "4.8" },
  ]

  it("builds the column template and the header from the fields", () => {
    render(<Matrix orientation="rows" label="Dataset rows" minWidth={600} items={ROWS} itemKey={(row) => row.id} fields={fields} />)
    const table = screen.getByRole("table", { name: "Dataset rows" })
    expect(table.style.gridTemplateColumns).toBe("40px minmax(0,1fr) minmax(0,1fr)")
    expect(table.style.minWidth).toBe("600px")
    const headers = screen.getAllByRole("columnheader")
    expect(headers).toHaveLength(3)
    expect(within(headers[1] ?? table).getByText("hotel.name").className).toContain("normal-case")
    expect(headers[2]?.className).toContain("text-right")
  })

  it("marks the selected row and paints its cells neutral below the field paint", () => {
    render(
      <Matrix orientation="rows" label="rows" items={ROWS} itemKey={(row) => row.id} fields={fields} selected={(row) => row.id !== "12"} />,
    )
    const [, selected, plain] = screen.getAllByRole("row")
    expect(selected?.getAttribute("aria-current")).toBe("true")
    expect(plain?.getAttribute("aria-current")).toBeNull()
    const [idCell, nameCell] = cellsOf(selected ?? document.body)
    expect(idCell?.getAttribute("data-tone")).toBe("neutral")
    expect(nameCell?.getAttribute("data-tone")).toBe("llm")
    expect(cellsOf(plain ?? document.body)[0]?.className).toContain("bg-card")
  })

  it("drops cell grounds under the rows rules", () => {
    render(<Matrix orientation="rows" rules="rows" label="rows" items={ROWS} itemKey={(row) => row.id} fields={fields} />)
    const cell = cellsOf(screen.getAllByRole("row")[1] ?? document.body)[0]
    expect(cell?.className).not.toContain("bg-card")
    expect(cell?.className).toContain("py-3")
  })

  it("lays the template on each row under the rows rules", () => {
    render(<Matrix orientation="rows" rules="rows" label="rows" minWidth={600} items={ROWS} itemKey={(row) => row.id} fields={fields} />)
    const table = screen.getByRole("table", { name: "rows" })
    expect(table.style.gridTemplateColumns).toBe("")
    expect(table.style.minWidth).toBe("600px")
    const [head, body] = screen.getAllByRole("row")
    expect(head?.style.gridTemplateColumns).toBe("40px minmax(0,1fr) minmax(0,1fr)")
    expect(body?.style.gridTemplateColumns).toBe("40px minmax(0,1fr) minmax(0,1fr)")
  })

  it("activates cells only where the item allows it", () => {
    const onActivate = vi.fn()
    render(
      <Matrix
        orientation="rows"
        label="rows"
        items={ROWS}
        itemKey={(row) => row.id}
        fields={[{ id: "name", label: "name", render: (row) => row.name, onActivate, isActivatable: (row) => !row.locked }]}
      />,
    )
    expect(screen.getAllByRole("button")).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Marins" }))
    expect(onActivate).toHaveBeenCalledWith(ROWS[0])
  })

  it("overlays a typed row link above the cells and lifts inner controls", async () => {
    await renderInRouter(
      <Matrix
        orientation="rows"
        label="rows"
        stickyHeader
        items={ROWS}
        itemKey={(row) => row.id}
        fields={[...fields, { id: "open", label: "actions", render: () => <button type="button">Open</button> }]}
        rowLink={(row) => <RowLink to="/" hash={`row-${row.id}`} aria-label={`row ${row.id}`} />}
      />,
    )
    const link = await screen.findByRole("link", { name: "row 07" })
    const row = link.parentElement
    expect(link.getAttribute("href")).toBe("/#row-07")
    expect(link.className).toContain("absolute")
    expect(row?.lastElementChild).toBe(link)
    expect(cellsOf(row ?? document.body)[3]?.className).toContain("[&_:is(a,button)]:z-1")
    expect(screen.getAllByRole("row")[0]?.className).toContain("sticky")
  })
})

describe("Matrix columns", () => {
  const span: MatrixSpanField = { id: "input", kind: "span", label: "Input", sub: "row #07", ground: "subtle", render: () => "shared input" }
  const output: MatrixField<Row> = {
    id: "output",
    label: "Output",
    emphasis: true,
    render: (row) => row.name,
    paint: () => ({ accent: "success" }),
  }

  it("renders label cells, a spanning field, item paint and a trailing summary", () => {
    render(
      <Matrix
        orientation="columns"
        label="Stage"
        minItemWidth={170}
        items={ROWS}
        itemKey={(row) => row.id}
        itemPaint={(row) => (row.locked ? { surface: "destructive" } : {})}
        fields={[span, output]}
        trailing={(fieldId) => `summary ${fieldId}`}
      />,
    )
    const table = screen.getByRole("table", { name: "Stage" })
    expect(table.style.gridTemplateColumns).toBe("128px repeat(2, minmax(170px, 1fr)) minmax(170px, 1fr)")
    const [spanRow, outputRow] = screen.getAllByRole("row")
    const spanCells = cellsOf(spanRow ?? table)
    expect(spanCells).toHaveLength(1)
    expect(spanCells[0]?.style.gridColumn).toBe("2 / -1")
    expect(spanCells[0]?.className).toContain("bg-background-subtle")
    expect(within(spanRow ?? table).getByRole("rowheader").className).toContain("sticky")
    const outputCells = cellsOf(outputRow ?? table)
    expect(outputCells).toHaveLength(3)
    expect(outputCells[1]?.getAttribute("data-tone")).toBe("destructive")
    expect(outputCells[0]?.querySelector("[data-tone=success]")).not.toBeNull()
    expect(outputCells[2]?.textContent).toBe("summary output")
    expect(screen.queryByText("summary input")).toBeNull()
  })
})

describe("MatrixCell", () => {
  it("renders a dash for an empty block list", () => {
    render(<MatrixCell blocks={[]} />)
    expect(screen.getByText("—")).toBeTruthy()
  })

  it("renders every block kind through the handler table", () => {
    const onToggle = vi.fn()
    render(
      <MatrixCell
        blocks={[
          { kind: "heading", size: "cell", title: "pitch_gen_b", dots: ["openai"], dotShape: "square", tags: [{ tone: "success", children: "BEST" }], expander: { label: "loop ×4", ariaLabel: "Toggle nested run for pitch_gen_b", open: false, controls: "path-b", onToggle } },
          { kind: "text", variant: "output", lines: [["line one"]], clamp: true },
          { kind: "inline", role: "small", tone: "destructive", lines: ["✗ < 0.90", "second"] },
          { kind: "refs", items: [{ provenance: "human", text: "brief" }] },
          { kind: "meter", value: "0.83", trail: "+0.17", bar: { value: 0.83, tone: "success" } },
          { kind: "tags", tags: [{ tone: "llm", children: "LLM" }], text: "branch" },
          { kind: "divider" },
        ]}
      />,
    )
    const expander = screen.getByRole("button", { name: "Toggle nested run for pitch_gen_b" })
    expect(expander.getAttribute("aria-controls")).toBe("path-b")
    fireEvent.click(expander)
    expect(onToggle).toHaveBeenCalledOnce()
    expect(screen.getByText("BEST").className).toContain("bg-tone-bg")
    expect(screen.getByText("line one").closest(".line-clamp-5")).not.toBeNull()
    expect(screen.getByText("✗ < 0.90").getAttribute("data-tone")).toBe("destructive")
    expect(screen.getByText(/brief/).className).toContain("border-dashed")
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("0.83")
    expect(screen.getByText("branch")).toBeTruthy()
  })

  it("orders a heading as title, subtitle, expander and keeps the title out of the heading outline", () => {
    const { container } = render(
      <MatrixCell
        blocks={[
          { kind: "heading", size: "item", title: "persona_b2b", subtitle: "B2B · corporate", expander: { label: "loop ×4", ariaLabel: "Toggle nested run for persona_b2b", open: false, controls: "path-b", onToggle: vi.fn() } },
          { kind: "refs", items: [{ provenance: "static", text: "city" }], text: "identical across branches" },
        ]}
      />,
    )
    const [title, subtitle, expander] = Array.from(container.firstElementChild?.children ?? [])
    expect(title?.textContent).toBe("persona_b2b")
    expect(subtitle?.textContent).toBe("B2B · corporate")
    expect(expander?.tagName).toBe("BUTTON")
    expect(screen.queryByRole("heading")).toBeNull()
    expect(screen.getByText("identical across branches").parentElement).toBe(screen.getByText("city").closest("span")?.parentElement)
  })
})

describe("ChoiceGroup", () => {
  const items = [
    { value: "load", label: "Data load" },
    { value: "score", label: "Hotel scoring" },
  ] as const

  it("maps raw values back and ignores deselection when a value is required", () => {
    const onValueChange = vi.fn()
    render(<ChoiceGroup appearance="segmented" label="Stages" items={items} value="load" onValueChange={onValueChange} />)
    fireEvent.click(screen.getByText("Data load"))
    expect(onValueChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText("Hotel scoring"))
    expect(onValueChange).toHaveBeenCalledWith("score")
  })

  it("forwards deselection as null when deselectable", () => {
    const onValueChange = vi.fn()
    render(<ChoiceGroup appearance="chip" deselectable label="Stages" items={items} value="score" onValueChange={onValueChange} />)
    const selected = screen.getByText("Hotel scoring")
    expect(selected.getAttribute("data-tone")).toBe("llm")
    expect(selected.getAttribute("data-state")).toBe("on")
    fireEvent.click(selected)
    expect(onValueChange).toHaveBeenCalledWith(null)
  })
})

describe("ChoiceLink", () => {
  it("lets explicit selection override the router active state", async () => {
    await renderInRouter(
      <ChoiceList appearance="card" label="Runs">
        <ChoiceLink appearance="card" to="/" hash="a">
          active by path
        </ChoiceLink>
        <ChoiceLink appearance="card" to="/" hash="b" selected={false}>
          not selected
        </ChoiceLink>
        <ChoiceLink appearance="card" tone="tool" to="/" hash="c" selected>
          selected
        </ChoiceLink>
      </ChoiceList>,
    )
    expect(screen.getByRole("navigation", { name: "Runs" })).toBeTruthy()
    expect((await screen.findByText("active by path")).getAttribute("aria-current")).toBe("page")
    expect(screen.getByText("not selected").getAttribute("aria-current")).toBeNull()
    const selected = screen.getByText("selected")
    expect(selected.getAttribute("aria-current")).toBe("true")
    expect(selected.getAttribute("data-tone")).toBe("tool")
  })
})

describe("PanelLayout", () => {
  it("renders one tabs root and maps the raw tab back to its value", () => {
    const onValueChange = vi.fn()
    render(
      <PanelLayout
        header="header"
        tabs={{ label: "Inspector", items: [{ value: "prompt", label: "Prompt" }, { value: "output", label: "Output" }], value: "prompt", onValueChange }}
      >
        body
      </PanelLayout>,
    )
    expect(screen.getByRole("tablist", { name: "Inspector" })).toBeTruthy()
    expect(screen.getByRole("tabpanel").textContent).toBe("body")
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Output" }))
    expect(onValueChange).toHaveBeenCalledWith("output")
  })

  it("remounts the scrolling body when the tab changes", () => {
    const tabs = { label: "Sheet", items: [{ value: "model", label: "Model" }, { value: "input", label: "Input" }], onValueChange: vi.fn() } as const
    const { rerender } = render(
      <PanelLayout header="header" tabs={{ ...tabs, value: "model" }}>
        body
      </PanelLayout>,
    )
    const before = screen.getByRole("tabpanel")
    rerender(
      <PanelLayout header="header" tabs={{ ...tabs, value: "input" }}>
        body
      </PanelLayout>,
    )
    expect(screen.getByRole("tabpanel")).not.toBe(before)
  })

  it("renders header and body without tabs", () => {
    render(
      <PanelLayout header="header" inset="lg">
        body
      </PanelLayout>,
    )
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.getByText("body").className).toContain("pb-8")
  })
})

describe("SidePanel", () => {
  it("names the dialog and closes from the button, the backdrop and Escape", () => {
    const onOpenChange = vi.fn()
    const { container } = render(
      <div className="relative">
        <SidePanel open onOpenChange={onOpenChange} title="pitch_gen_b" description="branch b" closeLabel="Close">
          body
        </SidePanel>
      </div>,
    )
    const dialog = screen.getByRole("dialog", { name: "pitch_gen_b" })
    expect(dialog.getAttribute("aria-describedby")).not.toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    const backdrop = container.querySelector("[aria-hidden].absolute.inset-0")
    fireEvent.click(backdrop ?? container)
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(onOpenChange.mock.calls).toEqual([[false], [false], [false]])
  })

  it("drops the description link when there is no description", () => {
    render(
      <SidePanel open onOpenChange={vi.fn()} title="call" closeLabel="Close">
        body
      </SidePanel>,
    )
    expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBeNull()
  })
})

describe("SplitPane", () => {
  it("renders labelled handles between panels even when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied")
    })
    render(
      <SplitPane
        id="test-split"
        orientation="horizontal"
        handle="ghost"
        handleClassName="dark"
        handleLabel="Resize chat"
        panels={[
          { id: "chat", defaultSize: 352, minSize: 280, maxSize: 680, fixed: true, content: "chat" },
          { id: "workspace", content: "workspace" },
        ]}
      />,
    )
    const separators = screen.getAllByRole("separator")
    expect(separators).toHaveLength(1)
    expect(separators[0]?.getAttribute("aria-label")).toBe("Resize chat")
    expect(separators[0]?.className).toContain("dark")
    expect(screen.getByText("workspace")).toBeTruthy()
  })
})

describe("MediaPart", () => {
  const audio: ContentPart = { kind: "audio", name: "voiceover.mp3", meta: "0:41", waveform: [0.5, 1] }
  const image: ContentPart = { kind: "image", name: "hero.png", meta: "1.8 MB", width: 1536, height: 1024, caption: "1536×1024", version: "v3" }
  const video: ContentPart = { kind: "video", name: "teaser.mp4", meta: "8.4 MB", width: 1080, height: 1920, frameTimesS: [0, 4], playhead: 0.34, caption: "0:15" }

  it("scales waveform amplitudes to the strip height", () => {
    const { container } = render(<MediaPart part={audio} />)
    const heights = [...container.querySelectorAll<HTMLElement>("[data-tone=tool].w-0\\.5")].map((bar) => bar.style.height)
    expect(heights).toEqual(["15px", "30px"])
  })

  it("uses the source aspect by default and a fixed frame when compact", () => {
    const { container, rerender } = render(<MediaPart part={image} />)
    const frame = (): HTMLElement | null => container.querySelector(".bg-stripes")
    expect(frame()?.style.aspectRatio).toBe("1536 / 1024")
    expect(screen.getByText("v3")).toBeTruthy()
    rerender(<MediaPart part={image} compact />)
    expect(frame()?.style.aspectRatio).toBe("")
    expect(frame()?.className).toContain("aspect-[4/3]")
  })

  it("labels video frames and moves the meta to a footer when compact", () => {
    const { container } = render(<MediaPart part={video} compact />)
    expect(screen.getByText("0:04")).toBeTruthy()
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("0.34")
    expect(container.firstElementChild?.lastElementChild?.textContent).toBe("8.4 MB")
  })
})

describe("Timeline", () => {
  it("owns both grid columns and anchors each step by id", () => {
    const { container } = render(
      <Timeline
        items={[
          { id: "stage-1", marker: "1", content: "Data load" },
          { id: "stage-2", marker: "2", content: "Hotel scoring" },
        ]}
        end={{ marker: "∎", content: "outcome" }}
      />,
    )
    expect(container.querySelector("#stage-2")?.textContent).toBe("Hotel scoring")
    expect(container.querySelectorAll(".col-start-1")).toHaveLength(3)
    expect(screen.getByText("outcome").className).toContain("col-start-2")
  })
})
