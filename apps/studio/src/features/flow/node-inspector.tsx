import type { ReactNode } from "react"
import { useTranslations } from "use-intl"
import type { ApiNodeDetail, ApiPromptDetail, ApiPromptSlot, FlowId } from "@/domain"
import * as ids from "@/data/ids"
import { Empty, PropertyList, SectionStack, StructuredValue, Surface, Tag, type PropertyRow, type SectionSpec } from "@/components/studio"
import { SchemaCard, ScrollBox } from "@/features/call-sheet"
import { isJsonObject, schemaTypeLabel } from "@/features/nodes"
import { InspectorPanel, type InspectorPage } from "./inspector-panel"
import { specDescription, specFacts } from "./node-facts"
import { AgentSections } from "./node-agent-sections"
import { NodeDisplayExample } from "./node-display-example"

type InspectorTranslator = ReturnType<typeof useTranslations<"flow.inspector">>
type InspectorTab = "definition" | "input" | "prompt" | "output" | "config" | "problems"
type DisplaySide = "input" | "output"
type FieldInfo = { readonly types: Readonly<Record<string, string>>; readonly descriptions: Readonly<Record<string, string>> }
type PromptContext = { readonly descriptions: Readonly<Record<string, string>>; readonly variants: readonly SectionSpec[] }

const NO_FIELDS: FieldInfo = { types: {}, descriptions: {} }
const NO_PROMPT_CONTEXT: PromptContext = { descriptions: {}, variants: [] }

const TABS: readonly InspectorTab[] = ["definition", "input", "prompt", "output", "config", "problems"]

const properties = (id: string, title: string, rows: readonly PropertyRow[]): readonly SectionSpec[] =>
  rows.length === 0 ? [] : [{ id, title, body: { kind: "properties", rows } }]

const valueSection = (id: string, title: string, value: unknown): readonly SectionSpec[] =>
  value === null || value === undefined ? [] : [{
    id,
    title,
    body: { kind: "node", node: <Surface variant="panel" padding="sm" className="min-w-0" role="region" aria-label={title}><StructuredValue value={value} /></Surface> },
  }]

const textSection = (id: string, title: string, value: string | null): readonly SectionSpec[] =>
  value === null || value === "" ? [] : [{ id, title, body: { kind: "node", node: <ScrollBox text={value} /> } }]

const plainSection = (id: string, title: string, value: string): readonly SectionSpec[] =>
  value === "" ? [] : [{ id, title, body: { kind: "text", lines: [[value]], variant: "plain" } }]

const schemaSection = (id: string, title: string, schema: unknown, raw: boolean, fields: FieldInfo, showAllowedValues = false, fieldDetails: Readonly<Record<string, ReactNode>> = {}): readonly SectionSpec[] =>
  schema === null || schema === undefined ? [] : [{
    id,
    title,
    body: { kind: "node", node: <SchemaCard schema={schema} raw={raw} fieldTypes={fields.types} fieldDescriptions={fields.descriptions} fieldDetails={fieldDetails} showAllowedValues={showAllowedValues} /> },
  }]

const optionalRow = (key: string, value: string | null | undefined): readonly PropertyRow[] =>
  value === null || value === undefined || value === "" ? [] : [{ key, value: { text: value, mono: true } }]

const declaredFields = (detail: ApiNodeDetail, side: "in" | "out"): unknown => {
  if (detail.inference_spec !== null && detail.inference_spec !== undefined) return detail.inference_spec[side]
  const spec: Readonly<Record<string, unknown>> = detail.spec
  return spec[side] ?? null
}

const fieldInfo = (detail: ApiNodeDetail, side: "in" | "out"): FieldInfo => {
  const fields = declaredFields(detail, side)
  if (!Array.isArray(fields)) return { types: {}, descriptions: {} }
  const entries = fields.filter((field: unknown) => field !== null && typeof field === "object" && "name" in field)
  return {
    types: Object.fromEntries(entries.flatMap((field: Record<string, unknown>) => typeof field.type === "string" ? [[String(field.name), field.type]] : [])),
    descriptions: Object.fromEntries(entries.flatMap((field: Record<string, unknown>) => typeof field.description === "string" ? [[String(field.name), field.description]] : [])),
  }
}

const nodeLinks = (id: string, title: string, nodes: readonly string[]): readonly SectionSpec[] =>
  nodes.length === 0 ? [] : [{
    id,
    title,
    body: { kind: "node", node: <div className="flex flex-wrap gap-1.5">{nodes.map((node) => <Tag key={node} size="sm" tone="neutral">{node}</Tag>)}</div> },
  }]

const displaySections = (detail: ApiNodeDetail, side: DisplaySide, t: InspectorTranslator): readonly SectionSpec[] => {
  const formatter = detail.inference_spec?.display?.[side]
  if (formatter === null || formatter === undefined) return []
  const source = detail.display_sources?.[side]
  const kind = formatter.template === null || formatter.template === undefined ? t("function") : t("template")
  return [
    ...properties(`${side}-display`, t("display"), [
      { key: t("format"), value: kind },
    ]),
    ...valueSection(`${side}-display-variables`, t("variables"), Object.keys(formatter.variables ?? {}).length === 0 ? null : formatter.variables),
    ...textSection(`${side}-display-source`, t("templateSource"), source?.text ?? null),
  ]
}

const definitionSections = (detail: ApiNodeDetail, t: InspectorTranslator): readonly SectionSpec[] => [
  ...plainSection("description", t("description"), specDescription(detail)),
  ...properties("facts", t("facts"), specFacts(detail).map((fact) => ({ key: fact.key, value: fact.value }))),
  ...nodeLinks("upstream", t("upstream"), detail.upstream),
  ...nodeLinks("downstream", t("downstream"), detail.downstream),
]

const bindingRows = (detail: ApiNodeDetail): readonly PropertyRow[] => detail.bindings.map((binding) => ({
  key: binding.slot,
  value: { text: binding.ref ?? (binding.value === undefined ? "—" : typeof binding.value === "string" ? binding.value : JSON.stringify(binding.value)), mono: true },
}))

const inputSections = (detail: ApiNodeDetail, t: InspectorTranslator, raw: boolean): readonly SectionSpec[] => [
  ...schemaSection("input-schema", t("inSchema"), detail.in_schema, raw, fieldInfo(detail, "in")),
  ...(raw || detail.in_schema === null ? valueSection("declared-inputs", t("declaredInputs"), declaredFields(detail, "in")) : []),
  ...(raw ? valueSection("bindings", t("bindings"), detail.bindings) : properties("bindings", t("bindings"), bindingRows(detail))),
  ...schemaSection("form-schema", t("formSchema"), detail.form_schema, raw, NO_FIELDS),
  ...displaySections(detail, "input", t),
]

function PromptSlots({ slots, descriptions, t }: { readonly slots: readonly ApiPromptSlot[]; readonly descriptions: Readonly<Record<string, string>>; readonly t: InspectorTranslator }) {
  return <Surface variant="panel" className="overflow-hidden">
    <ul className="divide-y divide-border" aria-label={t("promptInputs")}>
      {slots.map((slot) => <li key={slot.name} className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-xs font-semibold text-foreground">{slot.name}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{slot.type_id}</span>
          <Tag size="micro" tone={slot.used ? "success" : "warning"}>{t(slot.used ? "used" : "unused")}</Tag>
        </div>
        {descriptions[slot.name] ? <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{descriptions[slot.name]}</p> : null}
      </li>)}
    </ul>
  </Surface>
}

const promptVariants = (detail: ApiNodeDetail, t: InspectorTranslator, raw: boolean): readonly SectionSpec[] => {
  const variants = detail.inference_spec?.variants
  if (variants === null || variants === undefined || Object.keys(variants).length === 0) return []
  const summary = Object.fromEntries(Object.entries(variants).map(([name, variant]) => [name, {
    selected_by: variant.on,
    cases: Object.keys(variant.cases),
    default: variant.default === null || variant.default === undefined ? null : variant.default,
  }]))
  if (raw) return valueSection("prompt-variants", t("variants"), summary)
  return Object.entries(variants).map(([name, variant]): SectionSpec => ({
    id: `prompt-variant-${name}`,
    title: t("variant", { name }),
    body: { kind: "properties", rows: [
      { key: t("selectedBy"), value: variant.on },
      { key: t("cases"), value: Object.keys(variant.cases).join(", ") },
      ...(variant.default === null || variant.default === undefined ? [] : [{ key: t("defaultCase"), value: variant.default }]),
    ] },
  }))
}

const promptSections = (prompt: ApiPromptDetail | null, t: InspectorTranslator, raw: boolean, context: PromptContext): readonly SectionSpec[] => {
  if (prompt === null) return []
  if (raw) return [...valueSection("prompt-raw", t("prompt"), {
    inference: prompt.inference_id,
    level: prompt.level,
    format: prompt.path === null ? "function" : "template",
    source: prompt.source?.text ?? null,
    slots: prompt.slots,
    unused_inputs: prompt.unused_inputs,
    analysis: prompt.analysis,
  }), ...context.variants]
  return [
    ...properties("prompt-kind", t("promptKind"), [
      { key: t("format"), value: prompt.path === null ? t("function") : t("template") },
      ...optionalRow(t("inference"), prompt.inference_id),
      ...optionalRow(t("level"), prompt.level === null ? null : String(prompt.level)),
    ]),
    ...(prompt.slots.length === 0 ? [] : [{ id: "prompt-slots", title: t("promptInputs"), body: { kind: "node" as const, node: <PromptSlots slots={prompt.slots} descriptions={context.descriptions} t={t} /> } }]),
    ...context.variants,
    ...textSection("prompt-source", t("templateSource"), prompt.source?.text ?? null),
  ]
}

const inputRef = (ref: string): { readonly input: string; readonly property: string | null } | null => {
  const match = /^\$in\.([\w-]+)(?:\[\*\])?(?:\.([\w-]+))?$/.exec(ref)
  return match?.[1] === undefined ? null : { input: match[1], property: match[2] ?? null }
}

type DynamicSlot = ApiNodeDetail["dynamic_slots"][number]
type ValueShape = NonNullable<ApiNodeDetail["value_shapes"]>[string]

type ShapeField = {
  readonly name: string
  readonly type: string
  readonly description: string | null
  readonly required: boolean
  readonly nullable: boolean
  readonly choices: readonly string[]
  readonly constraints: readonly string[]
}

type ShapeVariant = { readonly name: string; readonly description: string | null; readonly fields: readonly ShapeField[] }

const textOf = (value: unknown): string | null => typeof value === "string" ? value : null

const valueShape = (detail: ApiNodeDetail, field: string): ValueShape | null => detail.value_shapes?.[field] ?? null

const hasNull = (schema: unknown): boolean => {
  if (!isJsonObject(schema)) return false
  if (schema.type === "null") return true
  return Array.isArray(schema.anyOf) && schema.anyOf.some((option: unknown) => isJsonObject(option) && option.type === "null")
}

const fieldConstraints = (schema: unknown, t: InspectorTranslator): readonly string[] => {
  if (!isJsonObject(schema)) return []
  const selected: unknown = Array.isArray(schema.anyOf) ? schema.anyOf.find((option: unknown) => isJsonObject(option) && option.type !== "null") : schema
  if (!isJsonObject(selected)) return []
  return [
    ...(typeof selected.maxLength === "number" ? [t("shapeMaxLength", { count: selected.maxLength })] : []),
    ...(typeof selected.maxItems === "number" ? [t("shapeMaxItems", { count: selected.maxItems })] : []),
    ...(typeof selected.minimum === "number" ? [t("shapeMinimum", { value: selected.minimum })] : []),
    ...(typeof selected.maximum === "number" ? [t("shapeMaximum", { value: selected.maximum })] : []),
    ...(typeof selected.pattern === "string" ? [t("shapePattern", { pattern: selected.pattern })] : []),
    ...(typeof selected.format === "string" ? [t("shapeFormat", { format: selected.format })] : []),
  ]
}

const shapeFields = (schema: unknown, declarations: unknown, discriminator: string, t: InspectorTranslator): readonly ShapeField[] => {
  const properties = isJsonObject(schema) && isJsonObject(schema.properties) ? schema.properties : {}
  const required = new Set(isJsonObject(schema) && Array.isArray(schema.required) ? schema.required : [])
  const fields = Array.isArray(declarations) ? declarations.filter(isJsonObject) : []
  const declared = new Map<string, Readonly<Record<string, unknown>>>()
  for (const field of fields) if (typeof field.name === "string") declared.set(field.name, field)
  return Object.entries(properties).map(([name, property]) => {
    const declaration = declared.get(name)
    const propertyObject = isJsonObject(property) ? property : {}
    const constant = propertyObject.const
    const choices = Array.isArray(propertyObject.enum) ? propertyObject.enum.map(String) : []
    return {
      name,
      type: name === discriminator && constant !== undefined ? JSON.stringify(constant) : textOf(declaration?.type) ?? schemaTypeLabel(property),
      description: textOf(declaration?.description) ?? textOf(propertyObject.description),
      required: required.has(name),
      nullable: hasNull(property) || (textOf(declaration?.type)?.endsWith("?") ?? false),
      choices,
      constraints: fieldConstraints(property, t),
    }
  })
}

const valueVariants = (shape: ValueShape, t: InspectorTranslator): readonly ShapeVariant[] => {
  if (!isJsonObject(shape.json_schema)) return []
  if (shape.spec.type === "union") {
    const discriminator = shape.spec.discriminator
    const options = Array.isArray(shape.json_schema.oneOf) ? shape.json_schema.oneOf : []
    return shape.spec.variants.map((variant, index) => {
      const schema: unknown = options.find((option: unknown) => isJsonObject(option) && isJsonObject(option.properties) &&
        isJsonObject(option.properties[discriminator]) && option.properties[discriminator].const === variant.name) ?? options[index]
      return { name: variant.name, description: variant.description, fields: shapeFields(schema, variant.fields, discriminator, t) }
    })
  }
  if (shape.spec.type !== "record") return []
  const fields = shapeFields(shape.json_schema, shape.spec.fields, "kind", t)
  return fields.length === 0 ? [] : [{ name: shape.type_id, description: shape.spec.description, fields }]
}

function ValueShapePreview({ field, shape, t }: { readonly field: string; readonly shape: ValueShape; readonly t: InspectorTranslator }) {
  const variants = valueVariants(shape, t)
  if (variants.length === 0) return null
  return <div className="mt-4" aria-label={t("shapePreview", { field })}>
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-xs font-semibold text-foreground">{field}.value</span>
      <Tag size="micro" tone="neutral">{shape.type_id}</Tag>
    </div>
    {variants.map((variant) => <section key={variant.name} className="mt-4" aria-label={t("shapeVariantAria", { variant: variant.name })}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h4 className="font-mono text-xs font-semibold text-foreground">{variant.name}</h4>
        {variant.description === null ? null : <span className="text-[11px] text-muted-foreground">{variant.description}</span>}
      </div>
      <ul className="mt-1 divide-y divide-border border-y border-border">
        {variant.fields.map((item) => <li key={item.name} className="py-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs font-semibold text-foreground">{item.name}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{item.type}</span>
            <Tag size="micro" tone="neutral">{t(item.required ? "shapeRequiredKey" : "shapeOptionalKey")}</Tag>
            {item.nullable ? <Tag size="micro" tone="neutral">{t("shapeNullableValue")}</Tag> : null}
          </div>
          {item.description === null ? null : <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.description}</p>}
          {item.choices.length === 0 ? null : <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[11px] text-muted-foreground">{t("shapeAllowedValues")}</span>
            {item.choices.map((choice) => <Tag key={choice} size="micro" tone="neutral">{choice}</Tag>)}
          </div>}
          {item.constraints.length === 0 ? null : <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.constraints.join(" · ")}</p>}
        </li>)}
      </ul>
    </section>)}
  </div>
}

const dataSource = (ref: string | null | undefined): string | null => {
  if (ref === null || ref === undefined) return null
  const iterationOutput = /^\$iter\.([\w-]+)\.out\.([\w-]+)$/.exec(ref)
  if (iterationOutput?.[1] !== undefined && iterationOutput[2] !== undefined) return `${iterationOutput[1]} → ${iterationOutput[2]}`
  const nodeOutput = /^\$([\w-]+)\.out\.([\w-]+)$/.exec(ref)
  return nodeOutput?.[1] === undefined || nodeOutput[2] === undefined ? ref : `${nodeOutput[1]} → ${nodeOutput[2]}`
}

function DynamicContents({ field, value, fields, t }: { readonly field: string; readonly value: string; readonly fields: string; readonly t: InspectorTranslator }) {
  const rows: PropertyRow[] = [
    { key: "value", value },
    { key: "fields", value: fields },
    { key: "schema_hash", value: t("dynamicSchemaHash") },
  ]
  return <>
    <p className="mt-3 text-[11px] font-medium text-muted-foreground">{t("dynamicContents", { field })}</p>
    <div className="mt-1 overflow-hidden rounded-md border border-border"><PropertyList rows={rows} variant="grid" /></div>
  </>
}

function DynamicOutputDetail({ detail, slot, field, t }: { readonly detail: ApiNodeDetail; readonly slot: DynamicSlot; readonly field: string; readonly t: InspectorTranslator }) {
  const input = inputRef(slot.schema_from)?.input
  const producer = dataSource(detail.bindings.find((binding) => binding.slot === input)?.ref)
  const shape = valueShape(detail, field)
  return <div className="mt-3 border-t border-border pt-3">
    {shape === null ? <>
      <p className="text-xs leading-relaxed text-foreground">{t("dynamicExplanation", { field, input: input ?? slot.schema_from })}</p>
      {producer === null ? null : <p className="mt-1 text-[11px] text-muted-foreground">{t("dynamicProducer", { input: input ?? slot.schema_from, producer })}</p>}
    </> : <p className="text-xs leading-relaxed text-foreground">{producer === null
      ? t("shapeResolvedInput", { type: shape.type_id, input: input ?? slot.schema_from })
      : t("shapeResolvedProducer", { type: shape.type_id, input: input ?? slot.schema_from, producer })}</p>}
    {shape === null ? null : <ValueShapePreview field={field} shape={shape} t={t} />}
    <DynamicContents field={field} value={t("dynamicValue", { input: input ?? slot.schema_from })} fields={t("dynamicFieldSpecs", { input: input ?? slot.schema_from })} t={t} />
    {slot.limits === null ? null : <p className="mt-2 text-[11px] text-muted-foreground">{t("dynamicLimits", {
      fields: slot.limits.max_fields,
      depth: slot.limits.max_depth,
      text: slot.limits.max_text_length,
      items: slot.limits.max_items,
    })}</p>}
  </div>
}

function ForwardedDynamicDetail({ detail, field, source, t }: { readonly detail: ApiNodeDetail; readonly field: string; readonly source: string | null; readonly t: InspectorTranslator }) {
  const shape = valueShape(detail, field)
  return <div className="mt-3 border-t border-border pt-3">
    <p className="text-xs leading-relaxed text-foreground">{source === null ? t("dynamicForwardedUnknown", { field }) : t("dynamicForwarded", { field, source })}</p>
    {shape === null ? null : <ValueShapePreview field={field} shape={shape} t={t} />}
    <DynamicContents field={field} value={t("dynamicForwardedValue")} fields={t("dynamicForwardedFields")} t={t} />
  </div>
}

const dynamicOutputFields = (detail: ApiNodeDetail, t: InspectorTranslator): {
  readonly types: Readonly<Record<string, string>>;
  readonly details: Readonly<Record<string, ReactNode>>;
} => {
  const slots = detail.dynamic_slots.filter((slot) => slot.path[0] === "out")
  const slotFields = new Set(slots.map((slot) => slot.path[1]))
  const forwarded = declaredFields(detail, "out")
  const candidates: readonly unknown[] = Array.isArray(forwarded) ? forwarded : []
  const forwardedFields = candidates.filter((entry): entry is { name: string; type: string; from?: string } =>
    entry !== null && typeof entry === "object" && "name" in entry && typeof entry.name === "string" &&
    "type" in entry && entry.type === "Dynamic" && !slotFields.has(entry.name))
  const types: [string, string][] = slots.flatMap((slot) => slot.path[1] === undefined ? [] : [[slot.path[1], t("dynamicObject")]])
  const details: [string, ReactNode][] = slots.flatMap((slot) => slot.path[1] === undefined ? [] : [[slot.path[1], <DynamicOutputDetail key={slot.path[1]} detail={detail} slot={slot} field={slot.path[1]} t={t} />]])
  return {
    types: Object.fromEntries([...types, ...forwardedFields.map((entry): [string, string] => [entry.name, t("dynamicObject")])]),
    details: Object.fromEntries([...details, ...forwardedFields.map((entry): [string, ReactNode] => [entry.name, <ForwardedDynamicDetail key={entry.name} detail={detail} field={entry.name} source={dataSource(entry.from)} t={t} />])]),
  }
}

const allowedSetSections = (detail: ApiNodeDetail, t: InspectorTranslator, raw: boolean): readonly SectionSpec[] => {
  const sets = detail.inference_spec?.allowed_sets ?? []
  if (sets.length === 0) return []
  if (raw) return valueSection("allowed-sets", t("allowedSets"), sets)
  return sets.map((set, index): SectionSpec => {
    const value = inputRef(set.from)
    const label = set.labels_from === null || set.labels_from === undefined ? null : inputRef(set.labels_from)
    const description = detail.allowed_set_descriptions?.[set.type]
    const rows: PropertyRow[] = [
      { key: t("valueType"), value: set.type },
      ...(description === undefined ? [] : [{ key: t("typeMeaning"), value: description }]),
      { key: t("allowedMeaning"), value: t("allowedMeaningText", { type: set.type }) },
      { key: t("choicesFrom"), value: value === null ? set.from : t("eachInputItem", { input: value.input }) },
      ...(value?.property === null || value === null ? [] : [{ key: t("storedValue"), value: value.property }]),
      ...(label?.property === null || label === null ? [] : [{ key: t("displayLabel"), value: label.property }]),
      { key: t("resolution"), value: t("resolvedPerRun") },
    ]
    return { id: `allowed-set-${String(index)}`, title: t("allowedChoicesFor", { type: set.type }), body: { kind: "properties", rows, variant: "grid" } }
  })
}

const dynamicSlotSections = (detail: ApiNodeDetail, t: InspectorTranslator, raw: boolean): readonly SectionSpec[] => {
  if (detail.dynamic_slots.length === 0) return []
  if (raw) return valueSection("dynamic-slots", t("dynamicSlots"), detail.dynamic_slots)
  return detail.dynamic_slots.map((slot, index): SectionSpec => {
    const source = inputRef(slot.schema_from)
    const rows: PropertyRow[] = [
      { key: t("shapeFrom"), value: source === null ? slot.schema_from : source.input },
      { key: t("resolution"), value: t("dynamicPerRun") },
      ...(slot.limits === null ? [] : [
        { key: t("maxFields"), value: String(slot.limits.max_fields) },
        { key: t("maxDepth"), value: String(slot.limits.max_depth) },
        { key: t("maxItems"), value: String(slot.limits.max_items) },
        { key: t("maxTextLength"), value: String(slot.limits.max_text_length) },
      ]),
    ]
    return { id: `dynamic-slot-${String(index)}`, title: t("dynamicField", { field: slot.path.slice(1).join(".") }), body: { kind: "properties", rows, variant: "grid" } }
  })
}

const outputSections = (detail: ApiNodeDetail, t: InspectorTranslator, raw: boolean, flowId: FlowId): readonly SectionSpec[] => {
  const fields = fieldInfo(detail, "out")
  const dynamic = dynamicOutputFields(detail, t)
  const outputTemplate = detail.inference_spec?.display?.output?.template
  return [
    ...schemaSection("output-schema", t("outSchema"), detail.out_schema, raw,
      { ...fields, types: { ...fields.types, ...dynamic.types } }, true, dynamic.details),
    ...(raw || detail.out_schema === null ? valueSection("declared-outputs", t("declaredOutputs"), declaredFields(detail, "out")) : []),
    ...(raw && Object.keys(detail.value_shapes ?? {}).length > 0 ? valueSection("value-shapes", t("valueShapes"), detail.value_shapes) : []),
    ...allowedSetSections(detail, t, raw),
    ...(raw || detail.out_schema === null ? dynamicSlotSections(detail, t, raw) : []),
    ...displaySections(detail, "output", t),
    ...(outputTemplate && detail.display_sources?.output ? [{
      id: "output-display-example",
      title: t("templateDisplay"),
      body: { kind: "node" as const, node: <NodeDisplayExample flowId={flowId} nodeId={ids.nodeId(detail.node_id)} /> },
    }] : []),
  ]
}

const checkSections = (detail: ApiNodeDetail, t: InspectorTranslator, raw: boolean): readonly SectionSpec[] => {
  const checks = detail.inference_spec?.checks ?? []
  if (checks.length === 0) return []
  if (raw) return valueSection("checks", t("checks"), checks.map((check) => ({
    name: check.use ?? (check.run === null || check.run === undefined ? check.inference : check.run.slice(check.run.lastIndexOf(":") + 1)),
    agent: check.agent ?? null,
    inputs: check.with ?? null,
    on_fail: check.on_fail,
    threshold: check.threshold ?? null,
  })))
  return checks.map((check, index): SectionSpec => {
    const name = check.use ?? (check.run === null || check.run === undefined ? check.inference ?? t("check") : check.run.slice(check.run.lastIndexOf(":") + 1))
    const rows: PropertyRow[] = [
      ...Object.entries(check.with ?? {}).map(([key, value]): PropertyRow => ({ key, value: typeof value === "string" ? value : JSON.stringify(value) })),
      { key: t("onFailure"), value: t(`checkPolicy.${check.on_fail}`) },
      ...(check.threshold === null || check.threshold === undefined ? [] : [{ key: t("threshold"), value: String(check.threshold) }]),
      ...(check.agent === null || check.agent === undefined ? [] : [{ key: t("agent"), value: check.agent }]),
    ]
    return { id: `check-${String(index)}`, title: name.replaceAll("_", " "), body: { kind: "properties", rows } }
  })
}

const configSections = (detail: ApiNodeDetail, t: InspectorTranslator, raw: boolean): readonly SectionSpec[] => [
  ...checkSections(detail, t, raw),
  ...valueSection("examples", t("examples"), detail.inference_spec?.examples),
  ...(detail.agent_spec !== null && detail.agent_spec !== undefined ? [] : properties("node-settings", t("nodeSettings"), specFacts(detail).map((fact) => ({ key: fact.key, value: fact.value })))),
  ...(raw && (detail.agent_spec === null || detail.agent_spec === undefined) ? valueSection("config-raw", t("configData"), {
    description: detail.spec.description,
    limits: detail.spec.limits,
    checks: detail.inference_spec?.checks ?? null,
    examples: detail.inference_spec?.examples ?? null,
  }) : []),
]

const problemSections = (detail: ApiNodeDetail, t: InspectorTranslator): readonly SectionSpec[] =>
  detail.problems.map((problem, index): SectionSpec => ({
    id: `problem-${String(index)}`,
    title: problem.code,
    body: { kind: "properties", rows: [{ key: t("problem"), value: problem.message, tone: "destructive" }] },
  }))

const nodePromptSections = (detail: ApiNodeDetail, prompt: ApiPromptDetail | null, t: InspectorTranslator, raw: boolean): readonly SectionSpec[] =>
  promptSections(prompt, t, raw, { descriptions: fieldInfo(detail, "in").descriptions, variants: promptVariants(detail, t, raw) })

const hasAgent = (detail: ApiNodeDetail): boolean => detail.agent_spec !== null && detail.agent_spec !== undefined

type TabBodyProps = { readonly flowId: FlowId; readonly detail: ApiNodeDetail; readonly prompt: ApiPromptDetail | null; readonly raw: boolean }

const TAB_SECTIONS: Readonly<Record<InspectorTab, (props: TabBodyProps, t: InspectorTranslator) => readonly SectionSpec[]>> = {
  definition: ({ detail }, t) => definitionSections(detail, t),
  input: ({ detail, raw }, t) => inputSections(detail, t, raw),
  prompt: ({ detail, prompt, raw }, t) => nodePromptSections(detail, prompt, t, raw),
  output: ({ detail, raw, flowId }, t) => outputSections(detail, t, raw, flowId),
  config: ({ detail, raw }, t) => configSections(detail, t, raw),
  problems: ({ detail }, t) => problemSections(detail, t),
}

function NodeTabBody({ tab, ...props }: TabBodyProps & { readonly tab: InspectorTab }) {
  const t = useTranslations("flow.inspector")
  const sections = TAB_SECTIONS[tab](props, t)
  const agent = tab === "config" && hasAgent(props.detail)
  return (
    <div className="space-y-6">
      {agent ? <AgentSections detail={props.detail} raw={props.raw} /> : null}
      {sections.length === 0 && !agent ? <Empty title={t("noPrompt")} /> : null}
      {sections.length > 0 ? <SectionStack sections={sections} gap="lg" /> : null}
    </div>
  )
}

function InspectorContent({ flowId, detail, prompt, onClose }: { readonly flowId: FlowId; readonly detail: ApiNodeDetail; readonly prompt: ApiPromptDetail | null; readonly onClose: () => void }) {
  const t = useTranslations("flow.inspector")
  const available = TABS.filter((tab) => (tab !== "prompt" || detail.prompt !== null) && (tab !== "problems" || detail.problems.length > 0))
  const label = (tab: InspectorTab): string => (tab === "config" && hasAgent(detail) ? t("tabs.agent") : t(`tabs.${tab}`))
  const pages: readonly InspectorPage<InspectorTab>[] = available.map((tab) => ({
    value: tab,
    label: label(tab),
    render: (raw) => <NodeTabBody tab={tab} flowId={flowId} detail={detail} prompt={prompt} raw={raw} />,
  }))
  return (
    <InspectorPanel
      kind={detail.kind}
      title={detail.node_id}
      description={specDescription(detail)}
      closeLabel={t("closeAria")}
      tabsLabel={t("tabsAria")}
      pages={pages}
      onClose={onClose}
    />
  )
}

export function PromptBody({ prompt, raw }: { readonly prompt: ApiPromptDetail; readonly raw: boolean }) {
  const t = useTranslations("flow.inspector")
  return <SectionStack sections={promptSections(prompt, t, raw, NO_PROMPT_CONTEXT)} gap="lg" />
}

export type SchemaBodyProps = { readonly id: string; readonly title: string; readonly schema: unknown; readonly raw: boolean; readonly allowedValues?: boolean }

export function SchemaBody({ id, title, schema, raw, allowedValues = false }: SchemaBodyProps) {
  const t = useTranslations("flow.inspector")
  const sections = schemaSection(id, title, schema, raw, NO_FIELDS, allowedValues)
  if (sections.length === 0) return <Empty title={t("noSchema")} />
  return <SectionStack sections={sections} gap="lg" />
}

export function NodeInspector({ flowId, detail, prompt, onClose }: { readonly flowId: FlowId; readonly detail: ApiNodeDetail | null; readonly prompt: ApiPromptDetail | null; readonly onClose: () => void }) {
  if (detail === null) return null
  return <InspectorContent key={`${flowId}/${detail.node_id}`} flowId={flowId} detail={detail} prompt={prompt} onClose={onClose} />
}
