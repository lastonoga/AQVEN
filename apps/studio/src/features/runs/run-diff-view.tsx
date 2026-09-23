import { useState, type ReactNode } from "react"
import { X } from "lucide-react"
import { useNow, useTranslations } from "use-intl"
import { EXECUTION_STATUS_TONE, Expander, Heading, Surface, Text, TitledPanel, type TagSpec, type Tone } from "@/components/studio"
import { Button } from "@/components/ui/button"
import type { Translator } from "@/i18n/translator"
import { joinMeta, orNone, runRef, usd } from "@/lib/format"
import { FieldTable, FieldText, type FieldTableRow } from "./field-table"
import { latencyText, tokensText } from "./presenters"
import { diffRuns, FACT_ASPECTS, type ExecutionFacts, type FactAspect, type NodeDiff, type RunSide, type RunTotals } from "./run-diff"
import type { FieldDiff, FieldState } from "./value-diff"

export type RunDiffViewProps = {
  readonly left: RunSide
  readonly right: RunSide
  readonly onStop: () => void
}

type SideTones = { readonly leftTone?: Tone; readonly rightTone?: Tone }

type DiffCopy = { readonly t: Translator<"runs.compare">; readonly domain: Translator<"domain"> }

const STATE_TONES: Readonly<Record<FieldState, SideTones>> = {
  same: {},
  changed: { leftTone: "warning", rightTone: "warning" },
  onlyLeft: { leftTone: "destructive" },
  onlyRight: { rightTone: "success" },
}

const FACT_TEXT: Readonly<Record<FactAspect, (facts: ExecutionFacts, copy: DiffCopy) => string>> = {
  status: (facts, { domain }) => domain(`executionStatus.${facts.status}`),
  model: (facts, { t }) => orNone(joinMeta([facts.agent, facts.model]), t("noModel")),
  cost: (facts) => usd(facts.costUsd),
  checks: (facts, { t }) => orNone(joinMeta([
    ...facts.checks.map((check) => t(check.passed ? "checkPassed" : "checkFailed", { name: check.name })),
    facts.failedAttempts === 0 ? null : t("failedAttempts", { count: facts.failedAttempts }),
  ]), t("noChecks")),
}

const factCell = (facts: ExecutionFacts | null, aspect: FactAspect, copy: DiffCopy): ReactNode =>
  <FieldText value={facts === null ? null : FACT_TEXT[aspect](facts, copy)} absent={copy.t("notRun")} />

const factRow = (node: NodeDiff, aspect: FactAspect, copy: DiffCopy): FieldTableRow => ({
  id: `fact-${aspect}`,
  label: copy.t(aspect),
  left: factCell(node.left, aspect, copy),
  right: factCell(node.right, aspect, copy),
  ...STATE_TONES[node.facts[aspect]],
})

type ValueAspect = "input" | "output"

const fieldRow = (aspect: ValueAspect, diff: FieldDiff, copy: DiffCopy): FieldTableRow => ({
  id: `${aspect}-${diff.path}`,
  label: diff.path.length === 0 ? copy.t(aspect) : joinMeta([copy.t(aspect), diff.path]),
  left: <FieldText value={diff.left} absent={copy.t("absent")} />,
  right: <FieldText value={diff.right} absent={copy.t("absent")} />,
  ...STATE_TONES[diff.state],
})

const nodeRows = (node: NodeDiff, copy: DiffCopy): readonly FieldTableRow[] => [
  ...FACT_ASPECTS.map((aspect) => factRow(node, aspect, copy)),
  ...node.input.map((diff) => fieldRow("input", diff, copy)),
  ...node.output.map((diff) => fieldRow("output", diff, copy)),
]

const presenceTag = (node: NodeDiff, leftRef: string, rightRef: string, t: Translator<"runs.compare">): TagSpec | null => {
  if (node.left === null) return { children: t("onlyIn", { ref: rightRef }), tone: "success" }
  if (node.right === null) return { children: t("onlyIn", { ref: leftRef }), tone: "destructive" }
  return null
}

const statusTag = (facts: ExecutionFacts | null, domain: Translator<"domain">): TagSpec | null =>
  facts === null ? null : { children: domain(`executionStatus.${facts.status}`), tone: EXECUTION_STATUS_TONE[facts.status] }

const sameFieldsText = (node: NodeDiff, t: Translator<"runs.compare">): string => joinMeta([
  node.sameInput === 0 ? null : t("sameInput", { count: node.sameInput }),
  node.sameOutput === 0 ? null : t("sameOutput", { count: node.sameOutput }),
])

function NodeDiffCard({ node, leftRef, rightRef, copy }: { readonly node: NodeDiff; readonly leftRef: string; readonly rightRef: string; readonly copy: DiffCopy }) {
  const { t } = copy
  const tags = [presenceTag(node, leftRef, rightRef, t), statusTag(node.left ?? node.right, copy.domain)].filter((tag): tag is TagSpec => tag !== null)
  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <div className="px-2.75 py-2.25">
        <Heading
          size="cell"
          titleAs="h3"
          title={node.nodeId}
          tags={tags}
          description={node.coordinate ?? undefined}
          trailing={<Text role="caption" tone="neutral">{sameFieldsText(node, t)}</Text>}
        />
      </div>
      <div className="border-t border-border">
        <FieldTable label={t("nodeAria", { node: node.nodeId })} heads={{ label: t("field"), left: leftRef, right: rightRef }} rows={nodeRows(node, copy)} />
      </div>
    </Surface>
  )
}

const totalRows = (left: RunTotals, right: RunTotals, copy: DiffCopy): readonly FieldTableRow[] => {
  const none = copy.t("absent")
  const rows: readonly (readonly [string, string, string | null, string | null])[] = [
    ["status", copy.t("status"), copy.domain(`runStatus.${left.status}`), copy.domain(`runStatus.${right.status}`)],
    ["cost", copy.t("cost"), usd(left.costUsd), usd(right.costUsd)],
    ["duration", copy.t("duration"), latencyText(left.durationMs), latencyText(right.durationMs)],
    ["tokens", copy.t("tokens"), tokensText(left.tokensIn, left.tokensOut), tokensText(right.tokensIn, right.tokensOut)],
  ]
  return rows.map(([id, label, leftText, rightText]) => ({
    id,
    label,
    left: <FieldText value={leftText} absent={none} />,
    right: <FieldText value={rightText} absent={none} />,
    ...(leftText === rightText ? {} : STATE_TONES.changed),
  }))
}

function SameNodes({ nodes, t }: { readonly nodes: readonly NodeDiff[]; readonly t: Translator<"runs.compare"> }) {
  const [open, setOpen] = useState(false)
  if (nodes.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        <Expander open={open} label={t("sameNodes", { count: nodes.length })} onClick={() => { setOpen(!open) }} />
      </div>
      {open ? (
        <Text as="p" role="data" tone="neutral">
          {nodes.map((node) => joinMeta([node.nodeId, node.coordinate])).join(", ")}
        </Text>
      ) : null}
    </div>
  )
}

function OutputDiff({ output, same, leftRef, rightRef, copy }: { readonly output: readonly FieldDiff[]; readonly same: number; readonly leftRef: string; readonly rightRef: string; readonly copy: DiffCopy }) {
  const { t } = copy
  return (
    <TitledPanel
      size="block"
      title={t("runOutput")}
      description={t("sameOutputFields", { count: same })}
      empty={output.length === 0 ? t("outputSame") : undefined}
    >
      <FieldTable label={t("runOutput")} heads={{ label: t("field"), left: leftRef, right: rightRef }} rows={output.map((diff) => fieldRow("output", diff, copy))} />
    </TitledPanel>
  )
}

export function RunDiffView({ left, right, onStop }: RunDiffViewProps) {
  const t = useTranslations("runs.compare")
  const domain = useTranslations("domain")
  const now = useNow()
  const copy: DiffCopy = { t, domain }
  const diff = diffRuns(left, right, now)
  const leftRef = runRef(left.snapshot.run_id)
  const rightRef = runRef(right.snapshot.run_id)
  return (
    <section aria-label={t("aria")} className="flex min-w-0 flex-col gap-3.5">
      <Heading
        size="section"
        title={t("title", { left: leftRef, right: rightRef })}
        tags={[{ children: t("summary", { changed: diff.changedNodes.length, total: diff.nodes.length }), tone: diff.changedNodes.length === 0 ? "success" : "warning" }]}
        trailing={
          <Button type="button" variant="outline" size="sm" onClick={onStop}>
            <X aria-hidden />
            {t("stop")}
          </Button>
        }
      />
      <TitledPanel size="block" title={t("run")}>
        <FieldTable label={t("run")} heads={{ label: t("field"), left: leftRef, right: rightRef }} rows={totalRows(diff.left, diff.right, copy)} />
      </TitledPanel>
      <div className="flex flex-col gap-2.5">
        {diff.changedNodes.map((node) => <NodeDiffCard key={node.key} node={node} leftRef={leftRef} rightRef={rightRef} copy={copy} />)}
      </div>
      <SameNodes nodes={diff.sameNodes} t={t} />
      <OutputDiff output={diff.output} same={diff.sameOutput} leftRef={leftRef} rightRef={rightRef} copy={copy} />
    </section>
  )
}

