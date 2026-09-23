import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import { Empty, Heading, Page, Surface, Tag, Text, Toolbar } from "@/components/studio"
import { isoDateTime } from "@/data/ids"
import { HandoffButton } from "@/features/chat-handoff"
import { useRelativeTime } from "@/i18n/format"
import { flowsRouteApi, projectRouteApi, ROUTE_PATH } from "@/lib/routes"
import { flowListRows, type FlowListRow } from "./presenters"

const WRITE_FLOW_PROMPT = [
  "Help me write a new flow for this project.",
  "First ask me what the flow should take in, what it should return and which steps it needs.",
  "Then create flows/<flow_id>/flow.yaml with its nodes, prompts and types, run aqven check and report the result in this chat.",
].join("\n")

const writeFlowPrompt = (): string => WRITE_FLOW_PROMPT

function WriteFlowButton() {
  const t = useTranslations("project.list")
  return <HandoffButton label={t("ask")} prompt={writeFlowPrompt} variant="default" />
}

function FlowRow({ row }: { readonly row: FlowListRow }) {
  return (
    <Surface variant="panel" padding="xs" interactive asChild>
      <Link to={ROUTE_PATH.canvas} params={{ flowId: row.id }} className="grid grid-cols-[minmax(9rem,14rem)_minmax(0,1fr)_auto] items-center gap-x-4 px-3.5">
        <Text role="item" weight="semibold" truncate>{row.id}</Text>
        <Text role="meta" tone="neutral" truncate title={row.description ?? undefined}>{row.description}</Text>
        <span className="flex shrink-0 items-center gap-3">
          <Text role="meta" tone="neutral" className="whitespace-nowrap">{row.meta}</Text>
          {row.problems === null ? null : <Tag size="xs" tone={row.problems.tone}>{row.problems.label}</Tag>}
        </span>
      </Link>
    </Surface>
  )
}

function FlowList({ rows }: { readonly rows: readonly FlowListRow[] }) {
  const t = useTranslations("project.list")
  if (rows.length === 0) return <Empty title={t("empty")} hint={t("emptyHint")} />
  return (
    <nav aria-label={t("navAria")} className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <FlowRow key={row.id} row={row} />
      ))}
    </nav>
  )
}

export function FlowsScreen() {
  const t = useTranslations("project.list")
  const { project } = projectRouteApi.useLoaderData()
  const { flows, descriptions, experiments } = flowsRouteApi.useLoaderData()
  const since = useRelativeTime("narrow")
  const rows = flowListRows(flows, descriptions, experiments, {
    nodes: (count) => t("nodes", { count }),
    lastRun: (startedAt) => t("lastRun", { time: since(isoDateTime(startedAt)) }),
    neverRun: t("neverRun"),
    experiments: (count) => t("experiments", { count }),
    problems: (count) => t("problems", { count }),
  })
  return (
    <Page
      width="lg"
      header={
        <Toolbar wrap className="items-start gap-2.5" end={<WriteFlowButton />}>
          <Heading size="page" title={t("title")} below={[t("subtitle", { project: project.package ?? project.root })]} />
        </Toolbar>
      }
    >
      <FlowList rows={rows} />
    </Page>
  )
}
