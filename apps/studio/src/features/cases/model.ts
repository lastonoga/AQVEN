import type { ApiDatasetCase, ApiDatasetSummary, CaseTags, ExperimentDetail, FlowId } from "@/domain"

export type DatasetScope = "flow" | "otherFlow" | "inference"

export type CasesSearch = {
  readonly dataset?: string
  readonly case?: string
  readonly tag?: readonly string[]
}

export type TagValue = { readonly value: string; readonly count: number }

export type TagFacet = { readonly key: string; readonly values: readonly TagValue[] }

export type CaseFilter = { readonly tags: readonly string[]; readonly query: string }

type TagPair = { readonly key: string; readonly value: string }

const TAG_SEPARATOR = "="
const NO_TAGS: CaseTags = {}

export const tagToken = (key: string, value: string): string => `${key}${TAG_SEPARATOR}${value}`

const tagPair = (token: string): TagPair | null => {
  const at = token.indexOf(TAG_SEPARATOR)
  if (at <= 0) return null
  return { key: token.slice(0, at), value: token.slice(at + 1) }
}

export const isTagToken = (token: string): boolean => tagPair(token) !== null

export const caseTags = (item: ApiDatasetCase): CaseTags => item.tags ?? NO_TAGS

export const tagTokens = (tags: CaseTags): readonly string[] => Object.entries(tags).map(([key, value]) => tagToken(key, value))

export const hasExpected = (item: ApiDatasetCase): boolean => item.expected_output !== undefined && item.expected_output !== null

export const nodeOutputIds = (item: ApiDatasetCase): readonly string[] => Object.keys(item.node_outputs ?? {})

export const hasContext = (item: ApiDatasetCase): boolean => Object.keys(item.context ?? {}).length > 0

const byCountThenValue = (left: TagValue, right: TagValue): number => right.count - left.count || left.value.localeCompare(right.value)

export const tagFacets = (cases: readonly ApiDatasetCase[]): readonly TagFacet[] => {
  const counts = new Map<string, Map<string, number>>()
  cases.forEach((item) => {
    Object.entries(caseTags(item)).forEach(([key, value]) => {
      const values = counts.get(key) ?? new Map<string, number>()
      values.set(value, (values.get(value) ?? 0) + 1)
      counts.set(key, values)
    })
  })
  return [...counts].map(([key, values]) => ({
    key,
    values: [...values].map(([value, count]) => ({ value, count })).sort(byCountThenValue),
  }))
}

const groupByKey = (tokens: readonly string[]): ReadonlyMap<string, ReadonlySet<string>> => {
  const groups = new Map<string, Set<string>>()
  tokens.forEach((token) => {
    const pair = tagPair(token)
    if (pair === null) return
    const values = groups.get(pair.key) ?? new Set<string>()
    values.add(pair.value)
    groups.set(pair.key, values)
  })
  return groups
}

export const matchesTags = (tags: CaseTags, selected: readonly string[]): boolean =>
  [...groupByKey(selected)].every(([key, values]) => {
    const value = tags[key]
    return value !== undefined && values.has(value)
  })

const matchesQuery = (name: string, query: string): boolean => name.toLowerCase().includes(query.trim().toLowerCase())

export const filterCases = (cases: readonly ApiDatasetCase[], filter: CaseFilter): readonly ApiDatasetCase[] =>
  cases.filter((item) => matchesTags(caseTags(item), filter.tags) && matchesQuery(item.name, filter.query))

export const toggleToken = (tokens: readonly string[], token: string): readonly string[] =>
  tokens.includes(token) ? tokens.filter((item) => item !== token) : [...tokens, token]

export const toggleName = (names: ReadonlySet<string>, name: string): ReadonlySet<string> => {
  const next = new Set(names)
  if (!next.delete(name)) next.add(name)
  return next
}

export const withNames = (names: ReadonlySet<string>, shown: readonly string[], selected: boolean): ReadonlySet<string> => {
  const next = new Set(names)
  shown.forEach((name) => {
    if (selected) next.add(name)
    else next.delete(name)
  })
  return next
}

export const orderedSelection = (cases: readonly ApiDatasetCase[], names: ReadonlySet<string>): readonly string[] =>
  cases.filter((item) => names.has(item.name)).map((item) => item.name)

export const usesCase = (experiment: ExperimentDetail, datasetId: string, tags: CaseTags): boolean =>
  experiment.cases.dataset === datasetId && Object.entries(experiment.cases.tags).every(([key, value]) => tags[key] === value)

export const experimentsUsing = (experiments: readonly ExperimentDetail[], datasetId: string, item: ApiDatasetCase): readonly ExperimentDetail[] =>
  experiments.filter((experiment) => usesCase(experiment, datasetId, caseTags(item)))

export const datasetScope = (dataset: ApiDatasetSummary, flowId: FlowId): DatasetScope => {
  if (dataset.flow_id === flowId) return "flow"
  if (dataset.flow_id === null || dataset.flow_id === undefined) return "inference"
  return "otherFlow"
}

export const pickDataset = (datasets: readonly ApiDatasetSummary[], requested: string | undefined, flowId: FlowId): ApiDatasetSummary | null =>
  datasets.find((item) => item.dataset_id === requested)
    ?? datasets.find((item) => item.flow_id === flowId)
    ?? datasets[0]
    ?? null

const ADD_CASES_STEPS: readonly string[] = [
  "First ask me which situations the new cases should cover and how many cases I need.",
  "Give each new case a unique snake_case name, tags with the same keys as the other cases, and an expected_output when the right answer is known.",
  "For a whole-flow run include the complete flow input and the context it needs. For a run that starts in the middle add node_outputs for the earlier top-level nodes it reads.",
  "Run aqven check and report the new cases and any problems in this chat.",
]

const addCasesHead = (flowId: FlowId, dataset: ApiDatasetSummary | null): string => {
  if (dataset === null) {
    return `Write a new dataset file datasets/${flowId}_cases.yaml with cases for flow ${flowId}: apiVersion aqven/v1, kind Dataset, flow ${flowId}.`
  }
  return `Add cases to the dataset ${dataset.dataset_id} in ${dataset.path} for flow ${flowId}. Keep the existing cases as they are.`
}

export const withTags = (previous: CasesSearch, tags: readonly string[]): CasesSearch => {
  const { tag: _tag, ...rest } = previous
  return tags.length === 0 ? rest : { ...rest, tag: tags }
}

export const withCase = (previous: CasesSearch, name: string | null): CasesSearch => {
  const { case: _case, ...rest } = previous
  return name === null ? rest : { ...rest, case: name }
}

export const addCasesPrompt = (flowId: FlowId, dataset: ApiDatasetSummary | null): string =>
  [addCasesHead(flowId, dataset), ...ADD_CASES_STEPS].join("\n")
