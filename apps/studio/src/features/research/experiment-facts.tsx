import { Link } from "@tanstack/react-router"
import { ArrowUpRight, Check, Code, Gauge, Scale, type LucideIcon } from "lucide-react"
import { useTranslations } from "use-intl"
import { SERIES_SPLITS, type CheckSource, type CheckSourceKind, type ExperimentCheck, type ExperimentDetail, type SplitCounts } from "@/domain"
import { Dot, Tag, Text, Tile, TileNote, TileValue } from "@/components/studio"
import { ROUTE_PATH } from "@/lib/routes"
import { rangeText, splitShare, tagPairs } from "./presenters"
import { SPLIT_TONE } from "./tones"
import { whereOf, whereView, type WhereView } from "./variant-table"

const CHECK_ICON: Readonly<Record<CheckSourceKind, LucideIcon>> = {
  judge: Scale,
  code: Code,
  builtin: Gauge,
}

const TILE_CLASS = "flex-1 basis-64"

function SplitBar({ splits }: { readonly splits: SplitCounts }) {
  const t = useTranslations("research.experiment.what.facts")
  const choice = useTranslations("research.vocabulary.splitChoice")
  const total = splits.dev + splits.holdout
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div role="img" aria-label={t("splitAria", { dev: splits.dev, holdout: splits.holdout })} className="flex h-1.5 overflow-hidden rounded-xs bg-border">
        {SERIES_SPLITS.map((split) => (
          <div key={split} data-tone={SPLIT_TONE[split]} className="h-full bg-tone" style={{ width: splitShare(splits[split], total) }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {SERIES_SPLITS.map((split) => (
          <span key={split} className="inline-flex items-center gap-1.5">
            <Dot tone={SPLIT_TONE[split]} shape="square" />
            <Text role="hint" tone="default" weight="semibold">
              {splits[split]}
            </Text>
            <Text role="hint" tone="neutral">
              {choice(split)}
            </Text>
          </span>
        ))}
      </div>
    </div>
  )
}

function CaseTags({ pairs }: { readonly pairs: readonly string[] }) {
  const t = useTranslations("research.experiment.what.facts")
  if (pairs.length === 0) return <TileNote>{t("allTags")}</TileNote>
  return (
    <ul aria-label={t("tagsAria")} className="flex min-w-0 flex-wrap gap-1">
      {pairs.map((pair) => (
        <li key={pair}>
          <Tag size="sm" fill="ground">
            {pair}
          </Tag>
        </li>
      ))}
    </ul>
  )
}

function CasesTile({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.what.facts")
  const { cases } = experiment
  const pairs = tagPairs(cases.tags)
  const flowId = cases.flow ?? experiment.flow
  return (
    <Tile label={t("cases")} className={TILE_CLASS}>
      <TileValue trail={t("ofTotal", { total: cases.total })}>{cases.selected}</TileValue>
      <Text role="cell" tone="neutral" truncate title={cases.dataset}>
        {cases.dataset}
      </Text>
      <SplitBar splits={cases.splits} />
      <CaseTags pairs={pairs} />
      {flowId === null ? null : (
        <Text role="link" tone="neutral" asChild>
          <Link to={ROUTE_PATH.cases} params={{ flowId }} search={{ dataset: cases.dataset, ...(pairs.length === 0 ? {} : { tag: pairs }) }} className="inline-flex items-center gap-1 self-start">
            {t("openCases")}
            <ArrowUpRight aria-hidden className="size-3" />
          </Link>
        </Text>
      )}
    </Tile>
  )
}

function JudgeMark({ source }: { readonly source: CheckSource }) {
  const t = useTranslations("research.experiment.what.facts")
  if (source.kind !== "judge") return null
  if (source.validatedBy === null) {
    return (
      <Tag size="xs" tone="warning" fill="tint">
        {t("notValidated")}
      </Tag>
    )
  }
  return (
    <Tag size="xs" tone="success" fill="tint" title={t("validatedBy", { by: source.validatedBy })} leading={<Check aria-hidden className="size-3" />}>
      {t("validated")}
    </Tag>
  )
}

function CheckLine({ check }: { readonly check: ExperimentCheck }) {
  const source = useTranslations("research.vocabulary.checkSource")
  const Icon = CHECK_ICON[check.source.kind]
  return (
    <li className="flex min-w-0 items-center gap-2">
      <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <Text role="item" tone="default" weight="semibold" truncate title={check.id}>
        {check.id}
      </Text>
      <Text role="hint" tone="neutral" className="shrink-0">
        {source(check.source.kind)}
      </Text>
      <JudgeMark source={check.source} />
    </li>
  )
}

function MeasuredTile({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.what.facts")
  return (
    <Tile label={t("measuredBy")} className={TILE_CLASS}>
      {experiment.checks.length === 0 ? (
        <TileNote>{t("noChecks")}</TileNote>
      ) : (
        <ul aria-label={t("checksAria")} className="flex min-w-0 flex-col gap-2">
          {experiment.checks.map((check) => (
            <CheckLine key={check.id} check={check} />
          ))}
        </ul>
      )}
    </Tile>
  )
}

function WhereScope({ view }: { readonly view: WhereView }) {
  const t = useTranslations("research.experiment.what.facts")
  if (view.kind === "arms") return null
  if (view.range === null) return <TileNote>{t("everyStep")}</TileNote>
  return (
    <>
      <Text role="item" tone="default">
        {t("only", { range: rangeText(view.range) })}
      </Text>
      <TileNote>{t("fromCase")}</TileNote>
    </>
  )
}

function WhereTile({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.what.facts")
  const view = whereView(whereOf(experiment))
  return (
    <Tile label={t("where")} className={TILE_CLASS}>
      <div className="flex min-w-0 items-center gap-2">
        <Tag size="sm" tone="neutral" fill="outline">
          {t(`whereKind.${view.kind}`)}
        </Tag>
        <Text role="entity" tone="default" weight="semibold" truncate title={view.name}>
          {view.name}
        </Text>
      </div>
      <WhereScope view={view} />
    </Tile>
  )
}

export function ExperimentFacts({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.what.facts")
  return (
    <section aria-label={t("aria")} className="flex min-w-0 flex-wrap items-stretch gap-3">
      <CasesTile experiment={experiment} />
      <MeasuredTile experiment={experiment} />
      <WhereTile experiment={experiment} />
    </section>
  )
}
