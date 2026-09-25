import { useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { ApiDatasetCase, CaseTags, ExperimentDetail } from "@/domain"
import {
  ChoiceGroup,
  Expander,
  flattenValueWithMedia,
  SectionStack,
  StructuredValue,
  Surface,
  Tag,
  Text,
  useValueMode,
  ValueDisplayProvider,
  type MediaFileLocator,
  type SectionSpec,
  type ValueMode,
} from "@/components/studio"
import { MediaOutput, mediaKey, type OutputMedia } from "@/components/studio/media-output"
import { ROUTE_PATH } from "@/lib/routes"
import { mediaFileLocator } from "./media-files"
import { caseTags, hasContext, hasExpected, tagTokens, toggleName } from "./model"

export type CaseDetailProps = {
  readonly id: string
  readonly item: ApiDatasetCase
  readonly mediaFolder: string
  readonly experiments: readonly ExperimentDetail[]
  readonly attach: ReactNode
  readonly run: ReactNode
}

const NO_NODES: ReadonlySet<string> = new Set()

const mediaOf = (value: unknown, locate: MediaFileLocator): readonly OutputMedia[] =>
  flattenValueWithMedia(value, locate).flatMap((entry) => ("media" in entry ? [entry.media] : []))

const fieldCount = (value: unknown): number => (typeof value === "object" && value !== null ? Object.keys(value).length : 1)

function CaseValue({ value, locate }: { readonly value: unknown; readonly locate: MediaFileLocator }) {
  const mode = useValueMode()
  const media = mediaOf(value, locate)
  return (
    <Surface variant="well" padding="sm" className="max-h-80 overflow-auto">
      <div className="flex min-w-0 flex-col gap-2">
        {mode === "json" ? media.map((item) => <MediaOutput key={mediaKey(item)} media={item} compact />) : null}
        <StructuredValue value={value} media={media} />
      </div>
    </Surface>
  )
}

function Hint({ children }: { readonly children: ReactNode }) {
  return <Text as="p" role="hint" tone="neutral">{children}</Text>
}

function TagsLine({ tags }: { readonly tags: CaseTags }) {
  const t = useTranslations("cases.detail")
  const tokens = tagTokens(tags)
  if (tokens.length === 0) return null
  return (
    <div role="group" aria-label={t("tags")} className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Text role="label" tone="neutral" className="mr-1">{t("tags")}</Text>
      {tokens.map((token) => (
        <Tag key={token} size="sm" fill="ground">{token}</Tag>
      ))}
    </div>
  )
}

function NodeOutputs({ outputs, locate }: { readonly outputs: Readonly<Record<string, unknown>>; readonly locate: MediaFileLocator }) {
  const t = useTranslations("cases.detail")
  const [open, setOpen] = useState<ReadonlySet<string>>(NO_NODES)
  const entries = Object.entries(outputs)
  if (entries.length === 0) return <Hint>{t("noNodeOutputs")}</Hint>
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([node, value]) => (
          <Expander
            key={node}
            open={open.has(node)}
            size="xs"
            label={
              <>
                <span className="font-mono">{node}</span>
                <span className="text-muted-foreground">{t("fields", { count: fieldCount(value) })}</span>
              </>
            }
            onClick={() => {
              setOpen(toggleName(open, node))
            }}
          />
        ))}
      </div>
      {entries.filter(([node]) => open.has(node)).map(([node, value]) => (
        <div key={node} className="flex min-w-0 flex-col gap-1">
          <Text role="cell" weight="semibold">{node}</Text>
          <CaseValue value={value} locate={locate} />
        </div>
      ))}
    </div>
  )
}

function ExperimentUses({ experiments }: { readonly experiments: readonly ExperimentDetail[] }) {
  const t = useTranslations("cases.detail")
  const vocabulary = useTranslations("research.vocabulary")
  if (experiments.length === 0) return <Hint>{t("noExperiments")}</Hint>
  return (
    <Surface variant="panel" radius="lg" asChild>
      <ul className="divide-y divide-border">
        {experiments.map((experiment) => {
          const filter = tagTokens(experiment.cases.tags)
          return (
            <li key={experiment.id} className="flex min-w-0 items-center gap-2.5 px-3 py-2">
              <Link to={ROUTE_PATH.experiment} params={{ experimentId: experiment.id }} className="shrink-0 font-mono text-xs font-semibold hover:underline">
                {experiment.id}
              </Link>
              <Tag size="sm" tone="neutral">{vocabulary(`question.${experiment.question.kind}`)}</Tag>
              <Text role="caption" tone="neutral" className="shrink-0 font-mono">{filter.length === 0 ? t("allCases") : filter.join(" ")}</Text>
              <Text role="caption" tone="neutral" truncate>{experiment.description}</Text>
            </li>
          )
        })}
      </ul>
    </Surface>
  )
}

const valueSection = (id: string, title: string, value: unknown, locate: MediaFileLocator, actions?: ReactNode, below?: ReactNode): SectionSpec => ({
  id,
  title,
  actions,
  body: {
    kind: "node",
    node: (
      <div className="flex min-w-0 flex-col gap-2">
        <CaseValue value={value} locate={locate} />
        {below}
      </div>
    ),
  },
})

function ValueModeChoice({ mode, onChange }: { readonly mode: ValueMode; readonly onChange: (mode: ValueMode) => void }) {
  const t = useTranslations("common.valueMode")
  return (
    <ChoiceGroup
      appearance="segmented"
      size="sm"
      label={t("label")}
      items={[{ value: "json", label: t("json") }, { value: "flat", label: t("flat") }]}
      value={mode}
      onValueChange={onChange}
    />
  )
}

export function CaseDetail({ id, item, mediaFolder, experiments, attach, run }: CaseDetailProps) {
  const t = useTranslations("cases.detail")
  const [mode, setMode] = useState<ValueMode>("json")
  const outputs = item.node_outputs ?? {}
  const locate = mediaFileLocator(mediaFolder)
  const sections: readonly SectionSpec[] = [
    valueSection(`${id}-input`, t("input"), item.inputs, locate, <ValueModeChoice mode={mode} onChange={setMode} />, attach),
    ...(hasContext(item) ? [valueSection(`${id}-context`, t("context"), item.context, locate)] : []),
    hasExpected(item)
      ? valueSection(`${id}-expected`, t("expected"), item.expected_output, locate)
      : { id: `${id}-expected`, title: t("expected"), body: { kind: "node", node: <Hint>{t("noExpected")}</Hint> } },
    { id: `${id}-outputs`, title: t("nodeOutputs"), count: Object.keys(outputs).length, body: { kind: "node", node: <NodeOutputs outputs={outputs} locate={locate} /> } },
    { id: `${id}-experiments`, title: t("experiments"), count: experiments.length, body: { kind: "node", node: <ExperimentUses experiments={experiments} /> } },
  ]
  return (
    <section id={id} aria-label={t("aria", { name: item.name })} className="flex flex-col gap-4 border-t border-border bg-background-subtle px-4 py-3.5">
      <TagsLine tags={caseTags(item)} />
      <ValueDisplayProvider mode={mode}>
        <SectionStack sections={sections} gap="md" />
      </ValueDisplayProvider>
      {run}
    </section>
  )
}
