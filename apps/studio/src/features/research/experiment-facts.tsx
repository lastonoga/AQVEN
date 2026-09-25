import { Link } from "@tanstack/react-router"
import { ArrowUpRight, Check, Code, Gauge, Scale, type LucideIcon } from "lucide-react"
import { useTranslations } from "use-intl"
import type { CheckSource, CheckSourceKind, ExperimentCheck, ExperimentDetail } from "@/domain"
import { Tag, Text, Tile, TileNote, TileValue } from "@/components/studio"
import { ROUTE_PATH } from "@/lib/routes"
import { casesSearch, rangeText, tagPairs } from "./presenters"
import { SplitBar } from "./split-bar"
import { whereView, type WhereView } from "./variant-table"

const CHECK_ICON: Readonly<Record<CheckSourceKind, LucideIcon>> = {
  judge: Scale,
  code: Code,
  builtin: Gauge,
}

const TILE_CLASS = "flex-1 basis-64"

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
          <Link to={ROUTE_PATH.cases} params={{ flowId }} search={casesSearch(cases.dataset, cases.tags)} className="inline-flex items-center gap-1 self-start">
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

const FLOW_JOIN = ", "

function OtherFlows({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.what.facts")
  const others = experiment.flows.filter((flow) => flow.id !== experiment.subject.flow).map((flow) => flow.id)
  if (others.length === 0) return null
  return <TileNote>{t("localFlows", { flows: others.join(FLOW_JOIN) })}</TileNote>
}

function WhereTile({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.what.facts")
  const view = whereView(experiment.subject)
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
      <OtherFlows experiment={experiment} />
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
