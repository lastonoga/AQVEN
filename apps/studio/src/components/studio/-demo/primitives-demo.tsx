import type { ReactNode } from "react"
import { codeLines, diffLines, templateLines } from "@/lib/text"
import { noop } from "@/lib/noop"
import type { TextLine, TextMark } from "@/domain"
import {
  Dot,
  Empty,
  GATEWAY,
  PROVENANCE,
  STAGE_KIND,
  TONES,
  Expander,
  Heading,
  Marker,
  MetaLine,
  Page,
  PropertyList,
  Rich,
  SectionStack,
  Stat,
  Surface,
  Tag,
  Text,
  TextBlock,
  TextRuns,
  Toolbar,
  type DotProps,
  type HeadingProps,
  type Inline,
  type MarkerProps,
  type PropertyRow,
  type SectionSpec,
  type StatProps,
  type SurfaceProps,
  type TagFill,
  type TagProps,
  type TagSize,
  type TextProps,
  type TextRole,
} from "@/components/studio"

type DemoEntry = { readonly id: string; readonly title: string; readonly content: ReactNode }

const TAG_FILLS: readonly TagFill[] = ["soft", "tint", "outline", "stroke", "solid", "ground"]
const TAG_SIZES: readonly TagSize[] = ["micro", "xs", "sm", "md", "lg", "canvas", "edge", "ref"]
const TEXT_ROLES: readonly TextRole[] = [
  "display",
  "page",
  "section",
  "block",
  "entity",
  "item",
  "cell",
  "tiny",
  "body",
  "code",
  "small",
  "prose",
  "meta",
  "hint",
  "caption",
  "micro",
  "label",
  "column",
  "row",
  "link",
]

const TAG_SHAPES: readonly (TagProps & { readonly id: string })[] = [
  { id: "box", shape: "box", children: "box" },
  { id: "round", shape: "round", tone: "warning", children: "round" },
  { id: "pill", shape: "pill", size: "md", tone: "destructive", leading: "↑", children: "35 %" },
  { id: "square-micro", shape: "square", size: "micro", fill: "tint", tone: "llm", children: "◆" },
  { id: "square-xs", shape: "square", size: "xs", fill: "solid", tone: "primary", children: "W" },
  { id: "square-sm", shape: "square", size: "sm", fill: "solid", tone: "primary", children: "W" },
  { id: "dashed", dashed: true, tone: "warning", leading: PROVENANCE.human.glyph, children: "reviewer" },
  { id: "ref", size: "ref", fill: "stroke", shape: "round", tone: PROVENANCE.generated.tone, leading: PROVENANCE.generated.glyph, children: "ranked·3 ← rank_hotels" },
  { id: "edge", size: "edge", fill: "ground", tone: "loop", children: "needs_human" },
  { id: "canvas", size: "canvas", fill: "solid", tone: "llm", children: "4 · Critic loop" },
  { id: "hollow", size: "md", fill: "outline", leading: <Dot tone="neutral" hollow />, children: "iterations 3 / 8" },
]

const DOTS: readonly (DotProps & { readonly id: string })[] = [
  { id: "xs", tone: "warning", size: "xs" },
  { id: "sm", tone: "success" },
  { id: "md", tone: "destructive", size: "md" },
  { id: "square", tone: "google", size: "md", shape: "square" },
  { id: "hollow", tone: "neutral", hollow: true },
  { id: "pulse", tone: "llm", pulse: true, label: "running" },
  { id: "anthropic", tone: "anthropic" },
  { id: "openai", tone: "openai" },
  { id: "mistral", tone: "mistral" },
]

const MARKERS: readonly (MarkerProps & { readonly id: string })[] = [
  { id: "seq", shape: "circle", tone: STAGE_KIND.seq.tone, children: "1" },
  { id: "map", shape: "diamond", tone: STAGE_KIND.map.tone, children: STAGE_KIND.map.glyph },
  { id: "diverge", shape: "diamond", tone: STAGE_KIND.diverge.tone, children: STAGE_KIND.diverge.glyph },
  { id: "parallel", shape: "circle", tone: STAGE_KIND.parallel.tone, children: "3" },
  { id: "loop", shape: "diamond", tone: STAGE_KIND.loop.tone, children: STAGE_KIND.loop.glyph },
  { id: "switch", shape: "diamond", tone: STAGE_KIND.switch.tone, children: STAGE_KIND.switch.glyph },
  { id: "end", shape: "end", tone: "neutral", label: "end" },
  { id: "canvas-circle", shape: "circle", tone: "llm", size: "canvas", children: "7" },
  { id: "canvas-all", shape: "diamond", tone: GATEWAY.all.tone, size: "canvas", children: GATEWAY.all.glyph },
  { id: "canvas-one", shape: "diamond", tone: GATEWAY.one.tone, size: "canvas", children: GATEWAY.one.glyph },
  { id: "canvas-end", shape: "end", tone: "neutral", size: "canvas" },
]

const TEXT_AXES: readonly (TextProps & { readonly id: string })[] = [
  { id: "inherit", role: "cell", children: "inherit" },
  { id: "default", role: "cell", tone: "default", children: "default" },
  { id: "neutral", role: "cell", tone: "neutral", children: "neutral" },
  { id: "llm", role: "cell", tone: "llm", children: "llm" },
  { id: "destructive", role: "cell", tone: "destructive", children: "destructive" },
  { id: "normal", role: "cell", weight: "normal", children: "normal" },
  { id: "medium", role: "cell", weight: "medium", children: "medium" },
  { id: "semibold", role: "cell", weight: "semibold", children: "semibold" },
  { id: "bold", role: "cell", weight: "bold", children: "bold" },
  { id: "verbatim", role: "label", verbatim: true, children: "judge_facts" },
]

const RICH_VALUES: readonly { readonly id: string; readonly value: Inline }[] = [
  { id: "string", value: "plain string" },
  { id: "tone", value: { text: "12/12", tone: "success", strong: true } },
  { id: "mono", value: { text: "pitch_gen_b", mono: true } },
  { id: "check", value: { glyph: "check", tone: "success", text: "0.92 ≥ 0.90" } },
  { id: "cross", value: { glyph: "cross", tone: "destructive", text: "< 0.90" } },
  { id: "literal", value: { glyph: PROVENANCE.static.glyph, text: "city" } },
  { id: "legend", value: { glyph: "◆ +", tone: "llm", text: "all branches" } },
  {
    id: "list",
    value: [{ text: "regress_truncated" }, { text: " · " }, { text: "12/12", tone: "success" }, { text: " · $0.18" }],
  },
]

const HEADINGS: readonly (HeadingProps & { readonly key: string })[] = [
  { key: "page", size: "page", title: "Nodes", below: ["Every node of pitch_pipeline with its contract."], trailing: <Tag size="md">r42</Tag> },
  { key: "section", size: "section", title: "Tests", description: "5 tests", tags: [{ tone: "llm", children: "LLM" }] },
  {
    key: "block",
    size: "block",
    title: "Pitch generation",
    tags: [{ tone: "tool", children: "MAP ×10" }],
    description: "Generates one pitch per hotel",
    trailing: <Text role="tiny" weight="medium" tone="default">$0.2104</Text>,
  },
  { key: "entity", size: "entity", leading: <Tag size="md" tone="llm">LLM</Tag>, title: "pitch_gen_b", description: "attempt 2 of 4", below: ["claude-sonnet-4.5 · 2,104/684"] },
  { key: "item", size: "item", leading: [<Tag key="depth">L2</Tag>, <Tag key="kind" tone="loop">LOOP</Tag>], title: "critic_loop · persona_b2b", description: "stops at 0.90" },
  { key: "cell", size: "cell", leading: <Dot tone="llm" />, title: "pitch_pipeline", trailing: <Rich value={{ text: "OPEN", tone: "llm", mono: true }} />, below: [<Text key="meta" role="caption" truncate>12 nodes · edited 2 h ago</Text>] },
  { key: "tiny", size: "tiny", leading: <Tag tone="warning" size="micro">DEGRADED</Tag>, title: "pitch_gen_b · 4 attempts", description: "timeout → retry → ok" },
  { key: "label-count", size: "label", title: "Signatures", description: 5, trailing: <Expander open={false} label="new" onClick={noop} /> },
  { key: "label-hint", size: "label", title: "Input", description: "3 slots", children: <Text role="body">body follows the heading</Text> },
]

const SURFACES: readonly (SurfaceProps & { readonly key: string; readonly name: string })[] = [
  { key: "panel", name: "panel", variant: "panel", padding: "sm" },
  { key: "raised", name: "raised", variant: "raised", padding: "md" },
  { key: "well", name: "well", variant: "well", padding: "sm" },
  { key: "frame", name: "frame", variant: "frame", padding: "sm" },
  { key: "popover", name: "popover", variant: "popover", padding: "sm" },
  { key: "bubble", name: "bubble", variant: "bubble", padding: "sm" },
  { key: "sheet", name: "sheet", variant: "sheet", padding: "sm" },
  { key: "bar", name: "bar", variant: "bar", padding: "sm" },
  { key: "footer", name: "footer", variant: "footer", padding: "sm" },
  { key: "tray", name: "tray", variant: "tray", padding: "sm" },
  { key: "callout", name: "callout warning", variant: "callout", tone: "warning", padding: "sm" },
  { key: "tinted", name: "tinted llm", variant: "tinted", tone: "llm", padding: "sm" },
  { key: "outlined", name: "outlined tool", variant: "outlined", tone: "tool", padding: "sm" },
  { key: "dashed", name: "dashed", variant: "dashed", padding: "sm" },
  { key: "plain", name: "plain dark", variant: "plain", padding: "sm", className: "dark" },
  { key: "padding-lg", name: "padding lg", variant: "raised", padding: "lg" },
  { key: "radius-md", name: "radius md", variant: "panel", radius: "md", padding: "xs" },
  { key: "radius-lg", name: "radius lg", variant: "panel", radius: "lg", padding: "xs" },
  { key: "accent-left-3", name: "accent left-3", variant: "well", accent: "left-3", tone: "loop", padding: "sm" },
  { key: "accent-left-4", name: "accent left-4", variant: "raised", radius: "lg", accent: "left-4", tone: "llm", padding: "xs" },
  { key: "accent-top-2", name: "accent top-2", variant: "panel", radius: "md", accent: "top-2", tone: "destructive", padding: "xs" },
  { key: "interactive", name: "interactive", variant: "raised", tone: "llm", interactive: true, padding: "sm", tabIndex: 0 },
  { key: "selected", name: "interactive selected", variant: "raised", tone: "llm", interactive: true, selected: true, padding: "sm", tabIndex: 0 },
]

const MARK_NAMES: readonly TextMark[] = [
  "static",
  "data",
  "knowledge",
  "generated",
  "human",
  "text",
  "json",
  "image",
  "audio",
  "document",
  "video",
  "add",
  "remove",
  "issue",
  "comment",
  "code",
]

const markLine = (mark: TextMark): TextLine => [" ", { text: `$${mark}`, mark }]

const TEMPLATE = templateLines("Write a pitch for $hotel in $city.\nUse $persona and $brief.", [
  { provenance: "data", label: "hotel" },
  { provenance: "static", label: "city" },
  { provenance: "generated", label: "persona" },
  { provenance: "human", label: "brief" },
])

const SOURCE = codeLines("const score = judge(pitch) // 0..1\nif (score < 0.9) retry()\n\nreturn pitch # final")

const DIFF = diffLines([
  { op: "remove", text: "Use a formal tone." },
  { op: "add", text: "Use a warm, concise tone." },
])

const OUTPUT_TEXT =
  "Line one of a long output.\nLine two continues the answer.\nLine three.\nLine four.\nLine five.\nLine six is clamped away.\nLine seven is clamped away."

const PROPERTY_ROWS: readonly PropertyRow[] = [
  { key: "model", value: "claude-sonnet-4.5" },
  { key: { glyph: PROVENANCE.static.glyph, text: "city" }, value: "Lisbon" },
  { key: "tokens", value: [{ text: "2,104" }, { text: " / " }, { text: "684", strong: true }] },
  { key: "verdict", value: "FAIL", tone: "destructive" },
]

const SECTIONS: readonly SectionSpec[] = [
  { id: "demo-properties", title: "Model", hint: "attempt 2", body: { kind: "properties", rows: PROPERTY_ROWS } },
  { id: "demo-grid", title: "Trigger", count: 4, body: { kind: "properties", rows: PROPERTY_ROWS, variant: "grid" } },
  { id: "demo-text", title: "Template", actions: <Expander open label="expand" onClick={noop} />, body: { kind: "text", lines: TEMPLATE } },
  { id: "demo-node", title: "Custom", body: { kind: "node", node: <Empty title="No data for this call" /> } },
]

const STATS: readonly (StatProps & { readonly key: string })[] = [
  { key: "metric-up", variant: "metric", label: "Run cost", badge: { tone: "destructive", arrow: "up", children: "35 %" }, value: "$0.4187", note: "$0.11 over estimate", hint: "including discarded branches and retries" },
  { key: "metric-down", variant: "metric", label: "Tokens", badge: { tone: "neutral", fill: "outline", arrow: "down", children: "×0.8" }, value: "34,218" },
  { key: "metric-plain", variant: "metric", label: "Assertions", badge: { tone: "destructive", children: "4 FAIL" }, value: "44 / 48" },
  { key: "stacked", variant: "stacked", label: "Pass", value: "44 / 48" },
  { key: "meter", variant: "meter", value: "0.83", trail: "0.83 / 0.52 / 0.78", bar: { value: 0.83, tone: "success" }, note: "threshold 0.90" },
  { key: "meter-loop", variant: "meter", value: "0.61", trail: "+0.17", bar: { value: 0.61, tone: "loop" } },
]

function DemoRow({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>
}

function DemoGrid({ children }: { readonly children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">{children}</div>
}

function TagDemo() {
  return (
    <div className="flex flex-col gap-3">
      {TAG_FILLS.map((fill) => (
        <DemoRow key={fill}>
          <Text role="hint" tone="neutral" className="w-16">{fill}</Text>
          {TONES.map((tone) => (
            <Tag key={tone} fill={fill} tone={tone}>
              {tone}
            </Tag>
          ))}
        </DemoRow>
      ))}
      <Surface variant="plain" radius="lg" padding="sm" className="dark">
        <DemoRow>
          {TONES.map((tone) => (
            <Tag key={tone} tone={tone} leading={<Dot tone={tone} />}>
              {tone}
            </Tag>
          ))}
          <Marker shape="diamond" tone="loop">
            {STAGE_KIND.loop.glyph}
          </Marker>
          <Text role="prose" tone="neutral">
            dark scope
          </Text>
        </DemoRow>
      </Surface>
      <DemoRow>
        {TAG_SIZES.map((size) => (
          <Tag key={size} size={size} tone="llm">
            {size}
          </Tag>
        ))}
      </DemoRow>
      <DemoRow>
        {TAG_SHAPES.map(({ id, ...tag }) => (
          <Tag key={id} {...tag} />
        ))}
      </DemoRow>
      <DemoRow>
        <Tag tone="warning" size="md" wrap interactive asChild detail="v7 · r42">
          <button type="button" onClick={noop}>
            write_pitch
          </button>
        </Tag>
        <Tag tone="neutral" size="md" wrap className="max-w-40">
          a long wrapped tag that breaks onto several lines
        </Tag>
      </DemoRow>
    </div>
  )
}

function DotMarkerDemo() {
  return (
    <div className="flex flex-col gap-3">
      <DemoRow>
        {DOTS.map(({ id, ...dot }) => (
          <Dot key={id} {...dot} />
        ))}
      </DemoRow>
      <DemoRow>
        {MARKERS.map(({ id, ...marker }) => (
          <Marker key={id} {...marker} />
        ))}
      </DemoRow>
    </div>
  )
}

function TextDemo() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-4 gap-y-2">
        {TEXT_ROLES.map((role) => (
          <Text key={role} as="div" role={role}>
            {role} Pitch 0.83
          </Text>
        ))}
      </div>
      <DemoRow>
        {TEXT_AXES.map(({ id, ...text }) => (
          <Text key={id} {...text} />
        ))}
      </DemoRow>
      <div className="w-40">
        <Text as="div" role="cell" truncate>
          truncate a very long node identifier
        </Text>
      </div>
    </div>
  )
}

function RichDemo() {
  return (
    <div className="flex flex-col gap-2">
      {RICH_VALUES.map(({ id, value }) => (
        <Text key={id} as="div" role="cell">
          <Rich value={value} />
        </Text>
      ))}
      <Text as="div" role="meta" tone="neutral">
        <MetaLine parts={["pitch_pipeline", null, "12 nodes", false, "", undefined, "2 h ago"]} />
      </Text>
    </div>
  )
}

function HeadingDemo() {
  return (
    <div className="flex flex-col gap-4">
      {HEADINGS.map(({ key, ...heading }) => (
        <Heading key={key} {...heading} />
      ))}
      <Heading size="block" wrap title="Wrapped heading" tags={[{ tone: "llm", children: "DIVERGE ×4" }, { tone: "neutral", children: "SEQ" }]} description="wrap allows the row to break onto a second line when narrow" />
    </div>
  )
}

function ToolbarDemo() {
  return (
    <div className="flex flex-col gap-3">
      <Surface variant="bar" asChild>
        <Toolbar size="lg" end={<Tag tone="warning" size="xs">DEGRADED</Tag>}>
          <Text role="prose">size lg · end</Text>
        </Toolbar>
      </Surface>
      <Surface variant="footer" asChild>
        <Toolbar size="sm" wrap end={<Expander open={false} label="collapse attempts" onClick={noop} />}>
          {TONES.map((tone) => (
            <Tag key={tone} size="md" fill="outline" tone={tone} leading={<Dot tone={tone} />}>
              {tone}
            </Tag>
          ))}
        </Toolbar>
      </Surface>
      <Surface variant="bar" asChild>
        <Toolbar size="md" scroll>
          {TAG_SIZES.concat(TAG_SIZES).map((size, index) => (
            <Tag key={`${size}-${String(index)}`} size="sm">
              scroll {size}
            </Tag>
          ))}
        </Toolbar>
      </Surface>
      <Surface variant="tray" asChild>
        <Toolbar size="sm" stack>
          <Heading size="tiny" title="stack" description="children stretch vertically" />
          <Text role="small">second row</Text>
        </Toolbar>
      </Surface>
    </div>
  )
}

function SurfaceDemo() {
  return (
    <div className="flex flex-col gap-4">
      <DemoGrid>
        {SURFACES.map(({ key, name, ...surface }) => (
          <Surface key={key} {...surface}>
            <Text role="cell">{name}</Text>
          </Surface>
        ))}
      </DemoGrid>
      <div className="relative h-32 overflow-hidden">
        <Text role="prose" as="p" className="p-3">
          spotlight dims everything around its rectangle
        </Text>
        <Surface variant="spotlight" tone="llm" className="absolute top-6 left-10 h-16 w-64" />
      </div>
    </div>
  )
}

function TextBlockDemo() {
  return (
    <div className="flex flex-col gap-3">
      <DemoGrid>
        <Surface variant="well" padding="sm">
          <TextBlock lines={SOURCE} />
        </Surface>
        <Surface variant="well" padding="sm">
          <TextBlock lines={DIFF} variant="plain" />
        </Surface>
        <Surface variant="panel" padding="sm">
          <TextBlock text={OUTPUT_TEXT} variant="output" clamp />
        </Surface>
        <Surface variant="panel" padding="sm">
          <TextBlock lines={TEMPLATE} variant="context" muted clamp />
        </Surface>
        <Surface variant="panel" padding="sm">
          <TextBlock text="" variant="plain" />
        </Surface>
        <Surface variant="panel" padding="sm">
          <TextBlock lines={[]} variant="plain" empty="no output" />
        </Surface>
      </DemoGrid>
      <Text as="div" role="body">
        {MARK_NAMES.map((mark) => (
          <TextRuns key={mark} line={markLine(mark)} />
        ))}
      </Text>
    </div>
  )
}

function DataDemo() {
  return (
    <div className="flex flex-col gap-4">
      <DemoGrid>
        <Surface variant="panel" radius="lg" className="overflow-hidden">
          <PropertyList rows={PROPERTY_ROWS} />
        </Surface>
        <Surface variant="panel" radius="lg" className="overflow-hidden">
          <PropertyList rows={PROPERTY_ROWS} variant="grid" />
        </Surface>
      </DemoGrid>
      <DemoGrid>
        <SectionStack sections={SECTIONS} />
        <SectionStack sections={SECTIONS} gap="lg" />
      </DemoGrid>
    </div>
  )
}

function StatDemo() {
  return (
    <div className="flex flex-col gap-4">
      <DemoGrid>
        {STATS.map(({ key, ...stat }) => (
          <Surface key={key} variant="raised" padding="md">
            <Stat {...stat} />
          </Surface>
        ))}
      </DemoGrid>
      <DemoRow>
        <Expander open={false} label="loop ×4" onClick={noop} />
        <Expander open label="judges ×3" onClick={noop} />
        <Expander open={false} size="sm" label="Legend" onClick={noop} />
        <Expander open size="sm" label="map ×3" controls="demo-controlled" onClick={noop} />
      </DemoRow>
      <DemoGrid>
        <Empty title="No trace for this row" />
        <Empty title="No data for this call" hint="call_unknown" />
      </DemoGrid>
    </div>
  )
}

function PageDemo() {
  return (
    <div className="flex flex-col gap-3">
      <Surface variant="frame" className="h-72">
        <Page
          width="md"
          header={<Heading size="page" title="Review" below={["Page with header, aside and below"]} />}
          aside={{ content: <Surface variant="panel" padding="sm"><Text role="cell">aside 240</Text></Surface>, width: 240 }}
          below={<Surface variant="dashed" padding="sm"><Text role="cell">below</Text></Surface>}
        >
          <Surface variant="raised" padding="md" className="h-96">
            <Text role="cell">children scroll inside the page</Text>
          </Surface>
        </Page>
      </Surface>
      <DemoGrid>
        <Surface variant="frame" className="h-24">
          <Page width="lg">
            <Text role="cell">width lg</Text>
          </Page>
        </Surface>
        <Surface variant="frame" className="h-24">
          <Page width="xl">
            <Text role="cell">width xl</Text>
          </Page>
        </Surface>
      </DemoGrid>
    </div>
  )
}

const DEMOS: readonly DemoEntry[] = [
  { id: "tag", title: "Tag", content: <TagDemo /> },
  { id: "dot-marker", title: "Dot · Marker", content: <DotMarkerDemo /> },
  { id: "text", title: "Text", content: <TextDemo /> },
  { id: "rich", title: "Rich · MetaLine", content: <RichDemo /> },
  { id: "heading", title: "Heading", content: <HeadingDemo /> },
  { id: "toolbar", title: "Toolbar", content: <ToolbarDemo /> },
  { id: "surface", title: "Surface", content: <SurfaceDemo /> },
  { id: "text-block", title: "TextBlock · TextRuns", content: <TextBlockDemo /> },
  { id: "data", title: "PropertyList · SectionStack", content: <DataDemo /> },
  { id: "stat", title: "Stat · Meter · Expander · Empty", content: <StatDemo /> },
  { id: "page", title: "Page", content: <PageDemo /> },
]

export function PrimitivesDemo() {
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
