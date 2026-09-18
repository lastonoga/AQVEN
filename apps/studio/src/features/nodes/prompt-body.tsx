import { useTranslations } from "use-intl"
import type { ApiPromptDetail, ApiPromptSlot } from "@/domain"
import { Matrix, SectionStack, Surface, Tag, Text, type MatrixField, type PropertyRow, type SectionSpec } from "@/components/studio"
import { plainLines } from "@/lib/text"

type PromptTranslator = ReturnType<typeof useTranslations<"nodes.prompt">>

const SLOTS_MIN_WIDTH = 420
const LIST_SEPARATOR = ", "

const properties = (id: string, title: string, rows: readonly PropertyRow[]): readonly SectionSpec[] => {
  if (rows.length === 0) return []
  return [{ id, title, body: { kind: "properties", rows } }]
}

const textSection = (id: string, title: string, text: string | null): readonly SectionSpec[] => {
  if (text === null || text === "") return []
  return [{ id, title, body: { kind: "text", lines: plainLines(text), variant: "code" } }]
}

const row = (key: string, value: string | null): readonly PropertyRow[] => {
  if (value === null || value === "") return []
  return [{ key, value: { text: value, mono: true } }]
}

const draftRow = (prompt: ApiPromptDetail, t: PromptTranslator): readonly PropertyRow[] => {
  if (!prompt.has_draft) return []
  return [{ key: t("draft"), value: prompt.draft_stale ? t("draftStale") : t("draftFresh"), tone: "warning" }]
}

const factRows = (prompt: ApiPromptDetail, t: PromptTranslator): readonly PropertyRow[] => [
  ...row(t("inference"), prompt.inference_id),
  ...row(t("level"), prompt.level === null ? null : String(prompt.level)),
  ...draftRow(prompt, t),
]

const analysisRows = (prompt: ApiPromptDetail, t: PromptTranslator): readonly PropertyRow[] => {
  const analysis = prompt.analysis
  if (analysis === null) return []
  return [
    ...row(t("variables"), analysis.variables.join(LIST_SEPARATOR)),
    ...row(t("globals"), analysis.globals.join(LIST_SEPARATOR)),
    ...row(t("filters"), analysis.filters.join(LIST_SEPARATOR)),
    ...row(t("tags"), analysis.tags.join(LIST_SEPARATOR)),
  ]
}

const slotFields = (t: PromptTranslator): readonly MatrixField<ApiPromptSlot>[] => [
  {
    id: "name",
    label: t("column.name"),
    track: "minmax(140px,1fr)",
    render: (slot) => (
      <Text role="body" weight="semibold">
        {slot.name}
      </Text>
    ),
  },
  {
    id: "type",
    label: t("column.type"),
    track: "minmax(120px,1fr)",
    render: (slot) => (
      <Text role="data" tone="neutral">
        {slot.type_id}
      </Text>
    ),
  },
  {
    id: "used",
    label: t("column.used"),
    track: "110px",
    render: (slot) => (
      <Tag tone={slot.used ? "success" : "warning"} size="sm">
        {slot.used ? t("used") : t("unused")}
      </Tag>
    ),
  },
]

function SlotsBody({ slots, t }: { readonly slots: readonly ApiPromptSlot[]; readonly t: PromptTranslator }) {
  return (
    <Surface variant="panel" radius="lg" className="overflow-x-auto">
      <Matrix
        orientation="rows"
        label={t("slots")}
        minWidth={SLOTS_MIN_WIDTH}
        items={slots}
        itemKey={(slot) => slot.name}
        fields={slotFields(t)}
      />
    </Surface>
  )
}

const slotsSection = (prompt: ApiPromptDetail, t: PromptTranslator): readonly SectionSpec[] => {
  if (prompt.slots.length === 0) return []
  return [{ id: "prompt-slots", title: t("slots"), count: prompt.slots.length, body: { kind: "node", node: <SlotsBody slots={prompt.slots} t={t} /> } }]
}

const promptSections = (prompt: ApiPromptDetail, t: PromptTranslator): readonly SectionSpec[] => [
  ...properties("prompt-facts", t("facts"), factRows(prompt, t)),
  ...textSection("prompt-source", t("source"), prompt.source?.text ?? null),
  ...slotsSection(prompt, t),
  ...textSection("prompt-unused", t("unused"), prompt.unused_inputs.join(LIST_SEPARATOR)),
  ...properties("prompt-analysis", t("analysis"), analysisRows(prompt, t)),
]

export function PromptBody({ prompt }: { readonly prompt: ApiPromptDetail }) {
  const t = useTranslations("nodes.prompt")
  return <SectionStack sections={promptSections(prompt, t)} framed gap="base" />
}
