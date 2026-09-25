import type { AuthoringDataset, CaseCount, CaseSelection, CaseSelectionDraft, CaseTags, DatasetId, FlowId } from "@/domain"

export type SubjectOfCases = { readonly flow: FlowId; readonly local: boolean }

const belongsTo = (subject: SubjectOfCases, current: DatasetId | null) => (dataset: AuthoringDataset): boolean =>
  subject.local || dataset.flow === subject.flow || dataset.id === current

const flowFirst = (subject: SubjectOfCases) => (left: AuthoringDataset, right: AuthoringDataset): number =>
  Number(right.flow === subject.flow) - Number(left.flow === subject.flow) || left.id.localeCompare(right.id)

export const datasetsForSubject = (
  datasets: readonly AuthoringDataset[],
  subject: SubjectOfCases,
  current: DatasetId | null = null,
): readonly AuthoringDataset[] => datasets.filter(belongsTo(subject, current)).sort(flowFirst(subject))

export const selectionOf = (cases: Pick<CaseSelection, "dataset" | "tags">): CaseSelectionDraft => ({ dataset: cases.dataset, tags: cases.tags })

const sortedPairs = (tags: CaseTags): string => JSON.stringify(Object.entries(tags).sort(([left], [right]) => left.localeCompare(right)))

export const selectionKey = (selection: CaseSelectionDraft): string => `${selection.dataset}\u0000${sortedPairs(selection.tags)}`

export const sameSelection = (left: CaseSelectionDraft, right: CaseSelectionDraft): boolean => selectionKey(left) === selectionKey(right)

export const withDataset = (dataset: DatasetId): CaseSelectionDraft => ({ dataset, tags: {} })

export const withTag = (selection: CaseSelectionDraft, tag: string, value: string | null): CaseSelectionDraft => {
  const rest = Object.fromEntries(Object.entries(selection.tags).filter(([key]) => key !== tag))
  return { dataset: selection.dataset, tags: value === null ? rest : { ...rest, [tag]: value } }
}

export const findDataset = (datasets: readonly AuthoringDataset[], id: DatasetId): AuthoringDataset | null =>
  datasets.find((dataset) => dataset.id === id) ?? null

export const wholeDataset = (dataset: AuthoringDataset): CaseCount => ({ selected: dataset.total, total: dataset.total, splits: dataset.splits })

const hasValue = (dataset: AuthoringDataset, tag: string, value: string): boolean =>
  dataset.tags.some((options) => options.tag === tag && options.values.some((row) => row.value === value))

export const strayTags = (selection: CaseSelectionDraft, dataset: AuthoringDataset): readonly (readonly [string, string])[] =>
  Object.entries(selection.tags).filter(([tag, value]) => !hasValue(dataset, tag, value))
