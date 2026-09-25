import { useId, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { Plus, Trash2 } from "lucide-react"
import { useTranslations } from "use-intl"
import type { AuthoringNode, FlowId } from "@/domain"
import { Surface, Tag, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ROUTE_PATH } from "@/lib/routes"
import { ResearchSection } from "../layout"
import { authoringOf, choicesFor, chosenSlots, flowById, writtenValue, type FactorAuthoring, type ValueChoice } from "./factor"
import { Field, Problems } from "./form-field"
import type { VariantDraft } from "./form-state"
import { OptionPicker } from "./option-picker"
import type { ProblemCode } from "./problems"
import { promptPath } from "./spec"
import { visibleAt, type FormView } from "./view"

const AS_WRITTEN_VALUE = ""
const ID_PROBLEMS: ReadonlySet<ProblemCode> = new Set(["variantIdPattern", "variantIdDuplicate"])
const NODE_LINK = "rounded-xs font-mono underline-offset-3 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"

type RowProps = { readonly view: FormView; readonly variant: VariantDraft; readonly slots: readonly AuthoringNode[]; readonly flow: FlowId | null }

function NodeLink({ flow, slot }: { readonly flow: FlowId | null; readonly slot: AuthoringNode }) {
  const t = useTranslations("research.newExperiment.variants")
  if (flow === null) return <span className="font-mono">{slot.id}</span>
  return (
    <Link to={ROUTE_PATH.canvas} params={{ flowId: flow }} search={{ node: slot.flowNode }} aria-label={t("openNode", { node: slot.id })} className={NODE_LINK}>
      {slot.id}
    </Link>
  )
}

function WrittenValues({ view, slots, flow }: Omit<RowProps, "variant">) {
  const t = useTranslations("research.newExperiment.variants")
  if (slots.length === 0) {
    return (
      <Text as="p" role="hint" tone="neutral">
        {flow === null ? t("writtenNoFlow") : t("writtenFlow", { flow })}
      </Text>
    )
  }
  return (
    <ul className="flex min-w-0 flex-col gap-1">
      {slots.map((slot) => (
        <li key={slot.id} className="flex min-w-0 flex-wrap items-baseline gap-1.5">
          <Text role="cell" tone="default">
            <NodeLink flow={flow} slot={slot} />
          </Text>
          <Text role="hint" tone="neutral">
            {writtenValue(view.form.factor, slot) ?? t("writtenPrompt")}
          </Text>
        </li>
      ))}
    </ul>
  )
}

function useValueChoices(view: FormView, slot: AuthoringNode): readonly ValueChoice[] {
  const t = useTranslations("research.newExperiment.variants")
  const written = writtenValue(view.form.factor, slot)
  const asWritten: ValueChoice = { value: AS_WRITTEN_VALUE, label: t("asWritten"), detail: written }
  return [asWritten, ...choicesFor(view.form.factor, { slot, options: view.options, subject: view.form.flow })]
}

function SlotPicker({ view, variant, slot, flow }: Omit<RowProps, "slots"> & { readonly slot: AuthoringNode }) {
  const t = useTranslations("research.newExperiment.variants")
  const choices = useValueChoices(view, slot)
  const value = variant.values[slot.id] ?? AS_WRITTEN_VALUE
  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      <Text role="cell" tone="default">
        <NodeLink flow={flow} slot={slot} />
      </Text>
      {choices.length > 1 ? (
        <OptionPicker
          choices={choices}
          value={value}
          disabled={view.disabled}
          copy={{
            trigger: t("valueAria", { node: slot.id, variant: variant.id }),
            placeholder: t("asWritten"),
            search: t(`search.${view.form.factor}`),
            count: t("choiceCount", { count: choices.length - 1 }),
            empty: t("noMatches"),
          }}
          onChoose={(next) => {
            view.dispatch({ type: "setValue", key: variant.key, node: slot.id, value: next })
          }}
        />
      ) : (
        <Text as="p" role="hint" tone="warning">
          {t(`noChoices.${view.form.factor}`, { node: slot.id })}
        </Text>
      )}
    </li>
  )
}

function PickValues({ view, variant, slots, flow }: RowProps) {
  return (
    <ul className="flex min-w-0 flex-col gap-3">
      {slots.map((slot) => (
        <SlotPicker key={slot.id} view={view} variant={variant} slot={slot} flow={flow} />
      ))}
    </ul>
  )
}

function PromptValue({ view, variant, slots }: RowProps) {
  const t = useTranslations("research.newExperiment.variants")
  const id = useId()
  const experiment = view.form.id.length === 0 ? "<id>" : view.form.id
  return (
    <Field id={id} label={t("prompt")} hint={t("promptHint", { path: promptPath(experiment, variant), nodes: slots.map((slot) => slot.id).join(", ") })}>
      <Textarea
        id={id}
        value={variant.prompt}
        disabled={view.disabled}
        placeholder={t("promptPlaceholder")}
        className="min-h-32 font-mono text-sm"
        onChange={(event) => {
          view.dispatch({ type: "setPrompt", key: variant.key, text: event.target.value })
        }}
      />
    </Field>
  )
}

function ChatValue() {
  const t = useTranslations("research.newExperiment.variants")
  return (
    <Text as="p" role="hint" tone="neutral">
      {t("useValue")}
    </Text>
  )
}

const VALUE_EDITOR: Readonly<Record<FactorAuthoring, (props: RowProps) => ReactNode>> = {
  pick: PickValues,
  text: PromptValue,
  chat: ChatValue,
}

function FurtherValues(props: RowProps) {
  const t = useTranslations("research.newExperiment.variants")
  if (props.slots.length === 0) {
    return (
      <Text as="p" role="hint" tone="neutral">
        {t("pickNodes")}
      </Text>
    )
  }
  const Editor = VALUE_EDITOR[authoringOf(props.view.form.factor)]
  return <Editor {...props} />
}

function VariantHead({ view, variant, index }: { readonly view: FormView; readonly variant: VariantDraft; readonly index: number }) {
  const t = useTranslations("research.newExperiment.variants")
  const id = useId()
  const first = index === 0
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Text role="label" tone="neutral" asChild>
        <label htmlFor={id}>{t("variant", { number: index + 1 })}</label>
      </Text>
      <Input
        id={id}
        value={variant.id}
        disabled={view.disabled}
        spellCheck={false}
        autoComplete="off"
        className="w-56 font-mono"
        aria-invalid={visibleAt(view, `variant:${String(variant.key)}`).some((problem) => ID_PROBLEMS.has(problem.code))}
        onChange={(event) => {
          view.dispatch({ type: "renameVariant", key: variant.key, id: event.target.value })
        }}
      />
      {first ? (
        <Tag size="xs" tone="neutral" fill="outline">
          {t("asWritten")}
        </Tag>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={view.disabled}
          aria-label={t("remove", { variant: variant.id })}
          className="ml-auto"
          onClick={() => {
            view.dispatch({ type: "removeVariant", key: variant.key })
          }}
        >
          <Trash2 aria-hidden />
        </Button>
      )}
    </div>
  )
}

function VariantRow({ view, variant, index, slots, flow }: RowProps & { readonly index: number }) {
  const t = useTranslations("research.newExperiment.variants")
  return (
    <li>
      <Surface variant="panel" padding="sm" className="flex min-w-0 flex-col gap-3" aria-label={t("variantAria", { variant: variant.id })} role="group">
        <VariantHead view={view} variant={variant} index={index} />
        {index === 0 ? <WrittenValues view={view} slots={slots} flow={flow} /> : <FurtherValues view={view} variant={variant} slots={slots} flow={flow} />}
        <Problems problems={visibleAt(view, `variant:${String(variant.key)}`)} />
      </Surface>
    </li>
  )
}

export function VariantsSection({ view }: { readonly view: FormView }) {
  const t = useTranslations("research.newExperiment.variants")
  const flow = flowById(view.options, view.form.flow)
  const slots = chosenSlots(flow, view.form.nodes)
  return (
    <ResearchSection title={t("title")} description={t("description")}>
      <ul className="flex min-w-0 flex-col gap-3">
        {view.form.variants.map((variant, index) => (
          <VariantRow key={variant.key} view={view} variant={variant} index={index} slots={slots} flow={flow?.id ?? null} />
        ))}
      </ul>
      <Button
        type="button"
        variant="dashed"
        size="sm"
        disabled={view.disabled}
        className="self-start"
        onClick={() => {
          view.dispatch({ type: "addVariant" })
        }}
      >
        <Plus aria-hidden />
        {t("add")}
      </Button>
    </ResearchSection>
  )
}
