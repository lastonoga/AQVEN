import { useState, type ReactNode } from "react"
import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { noop } from "@/lib/noop"
import { templateLines } from "@/lib/text"
import type { ContentPart, Outcome } from "@/domain"
import {
  ChoiceGroup,
  ChoiceLink,
  ChoiceList,
  Dot,
  Heading,
  Marker,
  Matrix,
  MatrixCell,
  MediaPart,
  OUTCOME_TONE,
  PanelLayout,
  RowLink,
  SectionStack,
  SidePanel,
  SplitPane,
  STAGE_KIND,
  Stat,
  Surface,
  Tag,
  Text,
  Timeline,
  type CellBlock,
  type CellPaint,
  type ChoiceItem,
  type MatrixField,
  type MatrixSpanField,
  type SectionSpec,
  type TimelineItem,
  type Tone,
} from "@/components/studio"

type DemoEntry = { readonly id: string; readonly title: string; readonly content: ReactNode }

type DemoRun = {
  readonly id: string
  readonly status: Outcome
  readonly pass: string
  readonly cost: string
  readonly when: string
  readonly current: boolean
}

type DemoTest = { readonly id: string; readonly scope: string; readonly dataset: string; readonly pass: string; readonly health: Outcome }

type DemoColumn = {
  readonly id: string
  readonly name: string
  readonly status: Outcome
  readonly family: Tone
  readonly model: string
  readonly output: string
  readonly score: number
  readonly best: boolean
}

type InspectorTab = "overview" | "prompt" | "output"
type SheetTab = "model" | "input" | "output"
type Mode = "schema" | "dataflow" | "tests"
type Stage = "load" | "score" | "pitch" | "critic"

const RUNS: readonly DemoRun[] = [
  { id: "8247", status: "degraded", pass: "44/48", cost: "$0.4187", when: "2 h ago", current: true },
  { id: "8241", status: "ok", pass: "46/48", cost: "$0.3102", when: "yesterday", current: false },
  { id: "8233", status: "failed", pass: "31/48", cost: "$0.1904", when: "2 d ago", current: false },
]

const TESTS: readonly DemoTest[] = [
  { id: "pitch_gen_b", scope: "call · stage 4 · divergence", dataset: "pitch_golden_v4 · 48 rows", pass: "44 / 48", health: "failed" },
  { id: "critic_loop", scope: "stage · loop to threshold 0.90", dataset: "loop_regress · 20 rows", pass: "20 / 20", health: "ok" },
  { id: "score_hotel", scope: "call · stage 2 · map", dataset: "hotels_500 · 500 rows", pass: "486 / 500", health: "degraded" },
]

const COLUMNS: readonly DemoColumn[] = [
  { id: "a", name: "pitch_gen_a", status: "ok", family: "anthropic", model: "Anthropic · sonnet-4.5", output: "“Park, pool, quiet”", score: 0.92, best: true },
  { id: "b", name: "pitch_gen_b", status: "failed", family: "openai", model: "OpenAI · gpt-5.1", output: "“A holiday next to the park”\nhooks[2] is an empty string", score: 0.61, best: false },
  { id: "c", name: "pitch_gen_c", status: "cached", family: "google", model: "Google · gemini-3-pro", output: "“Sochi without overpaying”", score: 0.78, best: false },
  { id: "d", name: "pitch_gen_d", status: "ok", family: "mistral", model: "Mistral · large-3", output: "“Meeting room and late checkout”", score: 0.84, best: false },
]

const PARTS: readonly ContentPart[] = [
  { kind: "text", name: "alt_text", meta: "46 chars", text: "“Pool terrace at dusk, family table set for six”" },
  { kind: "json", name: "facts.json", meta: "3 keys", text: "{ \"beach_m\": 240, \"rating\": 4.8 }" },
  { kind: "image", name: "hero.png", meta: "1.8 MB · 2 rejected", width: 1536, height: 1024, caption: "1536×1024 · png · seed 1337", version: "v3" },
  {
    kind: "audio",
    name: "voiceover.mp3",
    meta: "0:41 · 128 kbps",
    waveform: [0.45, 0.8, 0.55, 0.95, 0.6, 0.7, 0.4, 0.85, 0.5, 0.75, 0.9, 0.35, 0.65, 0.8, 0.45, 0.7, 0.55, 0.95, 0.5, 0.6],
  },
  { kind: "document", name: "brand_voice.pdf", meta: "4 pages", caption: "Brand voice guide · tone v4 · 212 KB" },
  { kind: "video", name: "teaser_15s.mp4", meta: "8.4 MB · h264", width: 1080, height: 1920, frameTimesS: [0, 4, 8, 12], playhead: 0.34, caption: "0:15 · 1080×1920 · 24 fps" },
]

const PROMPT = templateLines("Write a pitch for $hotel for a $persona guest.", [
  { provenance: "data", label: "hotel" },
  { provenance: "generated", label: "persona" },
])

const MODES: readonly ChoiceItem<Mode>[] = [
  { value: "schema", label: "Schema" },
  { value: "dataflow", label: "Dataflow" },
  { value: "tests", label: "Tests" },
]

const STAGES: readonly ChoiceItem<Stage>[] = [
  { value: "load", label: "1 · Data load" },
  { value: "score", label: "2 · Hotel scoring" },
  { value: "pitch", label: "4 · Pitch divergence" },
  { value: "critic", label: "5 · Critic loop", disabled: true },
]

const INSPECTOR_TABS: readonly ChoiceItem<InspectorTab>[] = [
  { value: "overview", label: "Overview" },
  { value: "prompt", label: "Prompt" },
  { value: "output", label: "Output" },
]

const SHEET_TABS: readonly ChoiceItem<SheetTab>[] = [
  { value: "model", label: "Model" },
  { value: "input", label: "Input" },
  { value: "output", label: "Output" },
]

const SHEET_SECTIONS: readonly SectionSpec[] = [
  { id: "demo-sheet-model", title: "Model", hint: "attempt 4 of 4", body: { kind: "properties", rows: [{ key: "model", value: "gpt-5.1" }, { key: "verdict", value: "FAIL", tone: "destructive" }] } },
  { id: "demo-sheet-parts", title: "Output parts", count: 2, body: { kind: "parts", parts: PARTS.slice(2, 4) } },
]

const runFields: readonly MatrixField<DemoRun>[] = [
  {
    id: "run",
    label: "Run",
    track: "96px",
    render: (run) => <Text role="cell" weight="semibold">#{run.id}</Text>,
    paint: (run): CellPaint => (run.current ? { surface: "llm" } : {}),
  },
  {
    id: "status",
    label: "Status",
    track: "108px",
    render: (run) => (
      <Tag size="xs" tone={OUTCOME_TONE[run.status]}>
        {run.status}
      </Tag>
    ),
  },
  { id: "when", label: "Started", render: (run) => <Text role="cell" tone="neutral" truncate>{run.when}</Text> },
  { id: "pass", label: "pass_ratio", verbatim: true, track: "96px", align: "end", render: (run) => <Text role="cell">{run.pass}</Text> },
  { id: "cost", label: "Cost", sub: "USD", track: "96px", align: "end", render: (run) => <Text role="cell">{run.cost}</Text> },
]

const testFields: readonly MatrixField<DemoTest>[] = [
  {
    id: "test",
    label: "Test · scope",
    track: "minmax(0,1.4fr)",
    render: (test) => (
      <Heading size="cell" leading={<Dot tone={OUTCOME_TONE[test.health]} />} title={test.id} below={[<Text key="scope" role="meta" truncate>{test.scope}</Text>]} />
    ),
  },
  { id: "dataset", label: "Dataset", track: "minmax(0,1.2fr)", render: (test) => <Text role="small" tone="neutral">{test.dataset}</Text> },
  { id: "pass", label: "Pass", track: "110px", align: "end", render: (test) => <Text role="item" weight="semibold">{test.pass}</Text> },
  {
    id: "actions",
    label: "Actions",
    track: "150px",
    align: "end",
    render: () => (
      <div className="flex justify-end gap-1.5">
        <Button variant="outline" size="sm" onClick={noop}>
          Open
        </Button>
        <Button size="icon-sm" aria-label="Run test" onClick={noop}>
          <Play aria-hidden />
        </Button>
      </div>
    ),
  },
]

const columnPaint = (column: DemoColumn): CellPaint => {
  if (column.status === "failed") return { surface: "destructive" }
  if (column.best) return { surface: "success" }
  if (column.status === "cached") return { surface: "subtle" }
  return {}
}

const cells = (blocks: readonly CellBlock[]): ReactNode => <MatrixCell blocks={blocks} />

const callFields = (openColumn: string | null, onToggle: (id: string) => void): readonly (MatrixField<DemoColumn> | MatrixSpanField)[] => [
  {
    id: "columns",
    label: "Columns",
    sub: "4 in parallel",
    render: (column) =>
      cells([
        {
          kind: "heading",
          size: "cell",
          title: column.name,
          dots: [column.family],
          dotShape: "square",
          expander: { label: "judges ×3", ariaLabel: `Toggle nested run for ${column.id}`, open: openColumn === column.id, controls: `demo-judges-${column.id}`, onToggle: () => { onToggle(column.id) } },
        },
        { kind: "inline", role: "caption", tone: "neutral", lines: [column.model] },
      ]),
  },
  {
    id: "call",
    label: "Call",
    render: (column) =>
      cells([
        {
          kind: "heading",
          size: "cell",
          title: column.name,
          dots: [OUTCOME_TONE[column.status]],
          tags: column.best ? [{ tone: "success", children: "BEST" }] : [],
          menu: true,
        },
        { kind: "tags", tags: [{ tone: "llm", fill: "tint", size: "micro", children: "LLM" }], text: "branch · r42" },
      ]),
    onActivate: noop,
    isActivatable: (column) => column.status !== "cached",
  },
  {
    id: "heads",
    label: "Head sizes",
    render: (column) =>
      cells([
        { kind: "heading", size: "item", title: [{ text: column.name, mono: true }, { text: " · item" }] },
        { kind: "heading", size: "tiny", title: "tiny heading", tags: [{ tone: "loop", children: "LOOP" }] },
      ]),
  },
  {
    id: "agent",
    label: "Agent",
    sub: "model · config",
    render: (column) =>
      cells([
        { kind: "heading", size: "tiny", title: column.model, dots: [column.family], dotShape: "square" },
        { kind: "inline", role: "small", tone: "neutral", lines: [[{ text: "$0.0132", strong: true, tone: "warning" }, { text: " · 1.9 s · 2,014/512" }]] },
        { kind: "inline", role: "caption", tone: "neutral", lines: ["agent · t 0.9 · reasoning medium"] },
      ]),
    onActivate: noop,
  },
  {
    id: "input",
    label: "Input",
    sub: "row #07",
    ground: "subtle",
    kind: "span",
    render: () =>
      cells([
        {
          kind: "refs",
          items: [
            { provenance: "static", text: "city:\"Sochi\"" },
            { provenance: "data", text: "hotel · Hotel" },
            { provenance: "knowledge", text: "facts.beach_m" },
            { provenance: "generated", text: "persona" },
            { provenance: "human", text: "“no nightclubs”" },
          ],
        },
        { kind: "inline", role: "link", lines: ["expand the whole input"] },
      ]),
    onActivate: noop,
  },
  {
    id: "prompt",
    label: "Prompt",
    ground: "subtle",
    render: () => cells([{ kind: "text", variant: "context", lines: PROMPT, muted: true, clamp: true }]),
  },
  {
    id: "output",
    label: "Output",
    emphasis: true,
    render: (column) => cells([{ kind: "text", variant: "output", lines: column.output.split("\n").map((line) => [line]), clamp: true }]),
    paint: (column): CellPaint => ({ accent: OUTCOME_TONE[column.status] }),
    onActivate: noop,
  },
  {
    id: "postCheck",
    label: "Post-check",
    sub: "scorer ≥ 0.90",
    render: (column) =>
      cells([
        { kind: "meter", value: column.score.toFixed(2), trail: "0.83 / 0.52 / 0.78", bar: { value: column.score, tone: column.score < 0.7 ? "warning" : "success" } },
        { kind: "inline", role: "body", lines: [{ glyph: column.score < 0.9 ? "cross" : "check", tone: column.score < 0.9 ? "destructive" : "success", text: "< 0.90" }] },
        { kind: "tags", tags: [{ tone: "success", size: "sm", children: "close" }] },
        { kind: "divider" },
        { kind: "inline", role: "tiny", lines: [{ text: "3 of 3 assertions", strong: true }] },
      ]),
  },
  { id: "empty", label: "Assertions", render: () => cells([]) },
]

const summaryCells: Readonly<Record<string, readonly CellBlock[]>> = {
  call: [{ kind: "inline", role: "small", tone: "default", lines: ["+ 6 calls", "expand"] }],
  agent: [{ kind: "inline", role: "small", tone: "default", lines: [[{ text: "$0.0472", strong: true }, { text: " total" }], "median 1.9 s"] }],
  output: [{ kind: "inline", role: "small", tone: "neutral", lines: ["spread", "0.61 … 0.92"] }],
}

const summary = (fieldId: string): ReactNode => cells(summaryCells[fieldId] ?? [])

const partFields: readonly MatrixField<ContentPart>[] = [
  { id: "part", label: "Parts", render: (part) => cells([{ kind: "parts", parts: [part] }]) },
  { id: "meter", label: "Meter", render: (_, index) => cells([{ kind: "meter", value: `0.${String(70 + index * 4)}`, trail: "+0.17" }]) },
]

const TIMELINE: readonly TimelineItem[] = [
  {
    id: "demo-stage-1",
    marker: <Marker shape={STAGE_KIND.seq.marker} tone={STAGE_KIND.seq.tone}>1</Marker>,
    content: <Heading size="block" title="Data load" tags={[{ tone: STAGE_KIND.seq.tone, children: STAGE_KIND.seq.code }]} description="1 tool call" />,
  },
  {
    id: "demo-stage-2",
    marker: <Marker shape={STAGE_KIND.map.marker} tone={STAGE_KIND.map.tone}>{STAGE_KIND.map.glyph}</Marker>,
    content: (
      <Heading size="block" title="Hotel scoring" tags={[{ tone: STAGE_KIND.map.tone, children: "MAP ×10" }]} description="parallel · concurrency 8">
        <Surface variant="panel" padding="sm">
          <Text role="cell">stage content grows the connector</Text>
        </Surface>
      </Heading>
    ),
  },
  {
    id: "demo-stage-5",
    marker: <Marker shape={STAGE_KIND.loop.marker} tone={STAGE_KIND.loop.tone}>{STAGE_KIND.loop.glyph}</Marker>,
    content: <Heading size="block" title="Critic loop" tags={[{ tone: STAGE_KIND.loop.tone, children: "LOOP ×4" }]} description="stops at 0.90" />,
  },
]

function DemoGrid({ children }: { readonly children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">{children}</div>
}

function DemoLabel({ children }: { readonly children: ReactNode }) {
  return (
    <Text as="div" role="hint" tone="neutral" className="mb-1.5">
      {children}
    </Text>
  )
}

function RowsMatrixDemo() {
  return (
    <div className="flex flex-col gap-4">
      <DemoLabel>rows · grid · sticky header · row links · selected · current run paint</DemoLabel>
      <Surface variant="panel" className="h-40 overflow-auto">
        <Matrix
          orientation="rows"
          label="Runs"
          stickyHeader
          minWidth={620}
          items={[...RUNS, ...RUNS.map((run) => ({ ...run, id: `${run.id}-r`, current: false }))]}
          itemKey={(run) => run.id}
          fields={runFields}
          selected={(run) => run.id === "8241"}
          rowLink={(run) => <RowLink to="." hash={`run-${run.id}`} aria-label={`Open run #${run.id}`} />}
        />
      </Surface>
      <DemoLabel>rows · rules rows · row links with inner buttons</DemoLabel>
      <Surface variant="panel" className="overflow-x-auto">
        <Matrix
          orientation="rows"
          rules="rows"
          label="Tests"
          items={TESTS}
          itemKey={(test) => test.id}
          fields={testFields}
          rowLink={(test) => <RowLink to="." hash={`test-${test.id}`} aria-label={test.id} />}
        />
      </Surface>
    </div>
  )
}

function ColumnsMatrixDemo() {
  const [openColumn, setOpenColumn] = useState<string | null>("a")
  const toggle = (id: string): void => {
    setOpenColumn((current) => (current === id ? null : id))
  }
  return (
    <div className="flex flex-col gap-4">
      <DemoLabel>columns · item paint · accent · activatable · span · trailing summary</DemoLabel>
      <Surface variant="panel" className="overflow-hidden">
        <div className="overflow-x-auto">
          <Matrix
            orientation="columns"
            label="Pitch divergence"
            minItemWidth={170}
            items={COLUMNS}
            itemKey={(column) => column.id}
            itemPaint={columnPaint}
            fields={callFields(openColumn, toggle)}
            trailing={summary}
          />
          <Matrix orientation="columns" label="Parts" minItemWidth={210} labelWidth={96} items={PARTS} itemKey={(part) => part.name} fields={partFields} />
        </div>
      </Surface>
    </div>
  )
}

function ChoiceDemo() {
  const [mode, setMode] = useState<Mode>("dataflow")
  const [compactMode, setCompactMode] = useState<Mode>("tests")
  const [stage, setStage] = useState<Stage | null>("score")
  const [card, setCard] = useState<Stage>("load")
  const [failures, setFailures] = useState<"failures" | null>("failures")
  return (
    <div className="flex flex-col gap-4">
      <DemoLabel>ChoiceGroup · segmented md / sm</DemoLabel>
      <div className="flex flex-wrap items-center gap-3">
        <ChoiceGroup appearance="segmented" label="Mode" items={MODES} value={mode} onValueChange={setMode} />
        <ChoiceGroup appearance="segmented" size="sm" label="Mode compact" items={MODES} value={compactMode} onValueChange={setCompactMode} />
      </div>
      <DemoLabel>ChoiceGroup · chip llm deselectable · card · toggle destructive deselectable</DemoLabel>
      <ChoiceGroup appearance="chip" tone="llm" deselectable label="Stages" items={STAGES} value={stage} onValueChange={setStage} />
      <ChoiceGroup appearance="card" tone="tool" label="Stage cards" items={STAGES} value={card} onValueChange={setCard} />
      <ChoiceGroup
        appearance="toggle"
        tone="destructive"
        deselectable
        label="Failures"
        items={[{ value: "failures", label: "failures only · 4" }]}
        value={failures}
        onValueChange={setFailures}
      />
      <DemoLabel>ChoiceList · segmented links (router active state) · card links (selected)</DemoLabel>
      <ChoiceList appearance="segmented" label="Modes" className="self-start">
        {MODES.map((item) => (
          <ChoiceLink key={item.value} appearance="segmented" to="." hash={`mode-${item.value}`} activeOptions={{ includeHash: true }}>
            {item.label}
          </ChoiceLink>
        ))}
      </ChoiceList>
      <ChoiceList appearance="card" label="Runs">
        {RUNS.map((run) => (
          <ChoiceLink key={run.id} appearance="card" to="." hash={`chip-${run.id}`} selected={run.id === "8247"} resetScroll={false}>
            <Dot tone={OUTCOME_TONE[run.status]} />
            <Text role="cell" weight="semibold">
              #{run.id}
            </Text>
            <Text role="small" tone="neutral">
              {run.pass} · {run.cost}
            </Text>
          </ChoiceLink>
        ))}
      </ChoiceList>
    </div>
  )
}

function PanelDemo() {
  const [tab, setTab] = useState<InspectorTab>("prompt")
  return (
    <DemoGrid>
      <Surface variant="panel" className="h-64 overflow-hidden">
        <PanelLayout
          inset="md"
          header={<Heading size="item" leading={<Tag tone="llm">LLM</Tag>} title="pitch_gen_b" trailing={<Text role="micro" tone="neutral">1…5</Text>} />}
          tabs={{ label: "Inspector", items: INSPECTOR_TABS, value: tab, onValueChange: setTab }}
        >
          <Text as="p" role="prose">
            inset md · tab {tab}
          </Text>
          <div className="h-64" />
        </PanelLayout>
      </Surface>
      <Surface variant="panel" className="h-64 overflow-hidden">
        <PanelLayout inset="lg" header={<Heading size="entity" title="No tabs" description="inset lg" />}>
          <Text as="p" role="prose">
            plain body scrolls on its own
          </Text>
          <div className="h-64" />
        </PanelLayout>
      </Surface>
    </DemoGrid>
  )
}

function SidePanelDemo() {
  const [open, setOpen] = useState(true)
  const [plainOpen, setPlainOpen] = useState(false)
  const [tab, setTab] = useState<SheetTab>("model")
  return (
    <DemoGrid>
      <Surface variant="frame" className="relative h-96 min-h-0">
        <div className="p-3">
          <Button variant="outline" size="sm" onClick={() => { setOpen(true) }}>
            Open call sheet
          </Button>
        </div>
        <SidePanel
          open={open}
          onOpenChange={setOpen}
          leading={<Tag size="md" tone="llm">LLM</Tag>}
          title="pitch_gen_b"
          description="branch b · stage 4 · row #07"
          below={["call_01HT9 · attempt 4 of 4 · $0.0611 total"]}
          aside={<Tag size="xs" tone="warning">DEGRADED</Tag>}
          closeLabel="Close"
          tabs={{ label: "Call sheet", items: SHEET_TABS, value: tab, onValueChange: setTab }}
        >
          <SectionStack sections={SHEET_SECTIONS} gap="lg" />
        </SidePanel>
      </Surface>
      <Surface variant="frame" className="relative h-96 min-h-0">
        <div className="p-3">
          <Button variant="outline" size="sm" onClick={() => { setPlainOpen(true) }}>
            Open plain sheet
          </Button>
        </div>
        <SidePanel open={plainOpen} onOpenChange={setPlainOpen} title="No description, no tabs" closeLabel="Close">
          <Text as="p" role="prose">
            body without tabs
          </Text>
        </SidePanel>
      </Surface>
    </DemoGrid>
  )
}

function MediaDemo() {
  return (
    <div className="grid grid-cols-[minmax(0,488px)_200px] gap-4">
      <div className="flex flex-col gap-2">
        {PARTS.map((part) => (
          <Surface key={part.name} variant="panel" radius="lg" padding="sm">
            <MediaPart part={part} />
          </Surface>
        ))}
      </div>
      <div className="flex flex-col gap-2.25">
        {PARTS.map((part) => (
          <MediaPart key={part.name} part={part} compact />
        ))}
      </div>
    </div>
  )
}

function TimelineDemo() {
  return (
    <Timeline
      items={TIMELINE}
      end={{
        marker: <Marker shape="end" tone="neutral" label="end" />,
        content: <Stat variant="stacked" label="Outcome" value="44 / 48" />,
      }}
    />
  )
}

function SplitPaneDemo() {
  return (
    <div className="flex flex-col gap-3">
      <Surface variant="frame" className="h-56">
        <SplitPane
          id="demo-shell"
          orientation="horizontal"
          handle="ghost"
          handleClassName="dark"
          handleLabel="Resize chat"
          panels={[
            { id: "chat", defaultSize: 220, minSize: 160, maxSize: 360, fixed: true, className: "dark bg-background p-3 text-foreground", content: <Text role="prose">chat · ghost handle · dark</Text> },
            {
              id: "workspace",
              content: (
                <SplitPane
                  id="demo-schema"
                  orientation="vertical"
                  handle="bar"
                  handleLabel="Resize runs"
                  panels={[
                    {
                      id: "canvas",
                      content: (
                        <SplitPane
                          id="demo-canvas"
                          orientation="horizontal"
                          handleLabel="Resize inspector"
                          panels={[
                            { id: "graph", className: "bg-background-subtle p-3", content: <Text role="prose">canvas</Text> },
                            { id: "inspector", defaultSize: 180, minSize: 120, maxSize: 300, fixed: true, className: "bg-card p-3", content: <Text role="prose">inspector · line</Text> },
                          ]}
                        />
                      ),
                    },
                    { id: "runs", defaultSize: 72, minSize: 48, maxSize: 140, fixed: true, className: "bg-card p-3", content: <Text role="prose">runs · bar</Text> },
                  ]}
                />
              ),
            },
          ]}
        />
      </Surface>
    </div>
  )
}

const DEMOS: readonly DemoEntry[] = [
  { id: "matrix-rows", title: "Matrix · rows", content: <RowsMatrixDemo /> },
  { id: "matrix-columns", title: "Matrix · columns · MatrixCell", content: <ColumnsMatrixDemo /> },
  { id: "choice", title: "ChoiceGroup · ChoiceList · ChoiceLink", content: <ChoiceDemo /> },
  { id: "panel-layout", title: "PanelLayout", content: <PanelDemo /> },
  { id: "side-panel", title: "SidePanel", content: <SidePanelDemo /> },
  { id: "media-part", title: "MediaPart", content: <MediaDemo /> },
  { id: "timeline", title: "Timeline", content: <TimelineDemo /> },
  { id: "split-pane", title: "SplitPane", content: <SplitPaneDemo /> },
]

export function StructuresDemo() {
  return (
    <div className="flex flex-col gap-6">
      {DEMOS.map((demo) => (
        <Heading key={demo.id} id={`demo-${demo.id}`} size="section" title={demo.title}>
          <Surface variant="panel" padding="md">
            {demo.content}
          </Surface>
        </Heading>
      ))}
    </div>
  )
}
