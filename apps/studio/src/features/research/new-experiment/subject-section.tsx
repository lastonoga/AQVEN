import { Link } from "@tanstack/react-router"
import { ArrowUpRight } from "lucide-react"
import { useTranslations } from "use-intl"
import { FACTOR_KINDS, type AuthoringFlow, type AuthoringNode, type FactorKind, type FlowId } from "@/domain"
import { ChoiceGroup, Text } from "@/components/studio"
import { Toggle } from "@/components/ui/toggle"
import { HandoffButton } from "@/features/chat-handoff"
import { ROUTE_PATH } from "@/lib/routes"
import { ResearchSection } from "../layout"
import { datasetsForSubject } from "../authoring"
import { authoringOf, flowById, slotsOf, type ValueChoice } from "./factor"
import { Field, Panel, Problems } from "./form-field"
import { OptionPicker } from "./option-picker"
import { visibleAt, type FormView } from "./view"

const LINK = "inline-flex items-center gap-1 self-start rounded-xs underline-offset-3 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"

const contract = (flow: AuthoringFlow): string => `${flow.input ?? "?"} → ${flow.output ?? "?"}`

const flowChoices = (flows: readonly AuthoringFlow[]): readonly ValueChoice[] =>
  flows.map((flow) => ({ value: flow.id, label: flow.id, detail: contract(flow) }))

const NODE_DETAIL: Readonly<Record<FactorKind, (node: AuthoringNode) => string | null>> = {
  agent: (node) => node.agent,
  prompt: (node) => node.inference ?? node.agent,
  use: (node) => node.kind,
  flow: (node) => node.calls,
}

function FlowLink({ flow, label }: { readonly flow: FlowId; readonly label: string }) {
  return (
    <Text role="link" tone="neutral" asChild>
      <Link to={ROUTE_PATH.canvas} params={{ flowId: flow }} aria-label={label} className={LINK}>
        {flow}
        <ArrowUpRight aria-hidden className="size-3" />
      </Link>
    </Text>
  )
}

function FlowAbout({ flow, label }: { readonly flow: AuthoringFlow | null; readonly label: string }) {
  if (flow === null) return null
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <FlowLink flow={flow.id} label={label} />
      {flow.description.length === 0 ? null : (
        <Text as="p" role="hint" tone="default" className="wrap-anywhere">
          {flow.description}
        </Text>
      )}
    </div>
  )
}

function FlowField({ view }: { readonly view: FormView }) {
  const t = useTranslations("research.newExperiment.subject")
  const { form, options, dispatch, disabled } = view
  const problems = visibleAt(view, "subject")
  const choose = (value: string): void => {
    const flow = options.flows.find((item) => item.id === value)
    if (flow === undefined || flow.id === form.flow) return
    const [dataset] = datasetsForSubject(options.datasets, { flow: flow.id, local: false })
    dispatch({ type: "chooseFlow", flow: flow.id, dataset: dataset?.id ?? null })
  }
  return (
    <Field label={t("flow")} hint={t("flowHint")} problems={problems}>
      <OptionPicker
        choices={flowChoices(options.flows)}
        value={form.flow}
        invalid={problems.length > 0}
        disabled={disabled}
        copy={{
          trigger: form.flow === null ? t("chooseFlow") : t("flowAria", { flow: form.flow }),
          placeholder: t("chooseFlow"),
          search: t("searchFlows"),
          count: t("flowCount", { count: options.flows.length }),
          empty: t("noFlowMatches"),
        }}
        onChoose={choose}
      />
      <FlowAbout flow={flowById(options, form.flow)} label={t("openFlow", { flow: form.flow ?? "" })} />
    </Field>
  )
}

function FactorChoice({ view }: { readonly view: FormView }) {
  const t = useTranslations("research.newExperiment.subject")
  const vocabulary = useTranslations("research.vocabulary.factor")
  const { form, dispatch } = view
  return (
    <Field label={t("factor")} hint={t(`factorHint.${form.factor}`)}>
      <ChoiceGroup
        appearance="segmented"
        label={t("factor")}
        items={FACTOR_KINDS.map((what) => ({ value: what, label: vocabulary(what), disabled: view.disabled }))}
        value={form.factor}
        onValueChange={(what) => {
          dispatch({ type: "chooseFactor", what })
        }}
        className="self-start"
      />
    </Field>
  )
}

function NodeToggle({ view, node, flow }: { readonly view: FormView; readonly node: AuthoringNode; readonly flow: FlowId }) {
  const t = useTranslations("research.newExperiment.subject")
  const detail = NODE_DETAIL[view.form.factor](node)
  return (
    <li className="flex min-w-0 items-center gap-1.5">
      <Toggle
        variant="outline"
        size="sm"
        pressed={view.form.nodes.includes(node.id)}
        disabled={view.disabled}
        aria-label={t("nodeAria", { node: node.id })}
        title={node.description.length === 0 ? undefined : node.description}
        className="font-mono"
        onPressedChange={() => {
          view.dispatch({ type: "toggleNode", node: node.id })
        }}
      >
        {node.id}
        {detail === null ? null : <span className="font-sans text-xs text-muted-foreground">{detail}</span>}
      </Toggle>
      <Text role="link" tone="neutral" asChild>
        <Link to={ROUTE_PATH.canvas} params={{ flowId: flow }} search={{ node: node.flowNode }} aria-label={t("openNode", { node: node.id, flow })} className={LINK}>
          <ArrowUpRight aria-hidden className="size-3" />
        </Link>
      </Text>
    </li>
  )
}

function NodesField({ view }: { readonly view: FormView }) {
  const t = useTranslations("research.newExperiment.subject")
  const flow = flowById(view.options, view.form.flow)
  if (flow === null) {
    return (
      <Field label={t("nodes")}>
        <Text as="p" role="hint" tone="neutral">
          {t("flowFirst")}
        </Text>
      </Field>
    )
  }
  const slots = slotsOf(flow, view.form.factor)
  return (
    <Field label={t("nodes")} hint={t(`nodesHint.${view.form.factor}`)}>
      {slots.length === 0 ? (
        <Text as="p" role="hint" tone="warning">
          {t(`noSlots.${view.form.factor}`, { flow: flow.id })}
        </Text>
      ) : (
        <ul aria-label={t("nodesAria", { flow: flow.id })} className="flex min-w-0 flex-wrap gap-x-3 gap-y-2">
          {slots.map((node) => (
            <NodeToggle key={node.flowNode} view={view} node={node} flow={flow.id} />
          ))}
        </ul>
      )}
    </Field>
  )
}

function UseNote({ view }: { readonly view: FormView }) {
  const t = useTranslations("research.newExperiment.subject")
  if (authoringOf(view.form.factor) !== "chat") return null
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Text as="p" role="hint" tone="neutral" className="wrap-anywhere">
        {t("useNote")}
      </Text>
      <HandoffButton label={t("useHandoff")} prompt={view.draft} />
      <Problems problems={visibleAt(view, "factor")} />
    </div>
  )
}

export function SubjectSection({ view }: { readonly view: FormView }) {
  const t = useTranslations("research.newExperiment.subject")
  return (
    <ResearchSection title={t("title")} description={t("description")}>
      <Panel>
        <FlowField view={view} />
        <FactorChoice view={view} />
        <NodesField view={view} />
        <UseNote view={view} />
      </Panel>
    </ResearchSection>
  )
}
