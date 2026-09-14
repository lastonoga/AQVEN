import type { GraphEdge } from "./expand.js"

export type Stage = {
  rank: number
  nodeIds: string[]
  kinds: string[]
  title: string
}

export type Ranking = {
  rankOf: Map<string, number>
  stages: Stage[]
}

const stageWords: Record<string, string> = {
  tool: "Данные",
  llm: "Модель",
  code: "Код",
  map: "Обработка",
  switch: "Ветвление",
  human: "Человек",
  call: "Компонент",
  loop: "Цикл",
}

const titleOf = (kinds: readonly string[]): string => {
  const unique = [...new Set(kinds)]
  if (unique.length === 0) return "Этап"
  if (unique.length > 1) return "Параллельно"
  return stageWords[unique[0] ?? ""] ?? "Этап"
}

const longestPathRanks = (nodeIds: readonly string[], edges: readonly GraphEdge[]): Map<string, number> => {
  const rank = new Map(nodeIds.map((id) => [id, 0]))
  const indegree = new Map(nodeIds.map((id) => [id, 0]))
  const outgoing = new Map<string, string[]>(nodeIds.map((id) => [id, []]))

  for (const edge of edges) {
    if (!rank.has(edge.source) || !rank.has(edge.target)) continue
    outgoing.get(edge.source)?.push(edge.target)
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }

  const queue = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0)
  const settled = new Set<string>()

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor] as string
    settled.add(id)
    const level = rank.get(id) ?? 0
    for (const target of outgoing.get(id) ?? []) {
      rank.set(target, Math.max(rank.get(target) ?? 0, level + 1))
      const left = (indegree.get(target) ?? 0) - 1
      indegree.set(target, left)
      if (left === 0) queue.push(target)
    }
  }

  const cyclic = nodeIds.filter((id) => !settled.has(id))
  if (cyclic.length === 0) return rank

  const tail = Math.max(...[...rank.values()], 0) + 1
  for (const id of cyclic) rank.set(id, tail)
  return rank
}

export const rankNodes = (
  nodes: readonly { id: string; kind: string }[],
  edges: readonly GraphEdge[],
): Ranking => {
  const ids = nodes.map((node) => node.id)
  const rankOf = longestPathRanks(ids, edges)
  const kindOf = new Map(nodes.map((node) => [node.id, node.kind]))
  const buckets = new Map<number, string[]>()

  for (const id of ids) {
    const rank = rankOf.get(id) ?? 0
    const bucket = buckets.get(rank) ?? []
    bucket.push(id)
    buckets.set(rank, bucket)
  }

  const stages = [...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([rank, nodeIds]) => {
      const kinds = nodeIds.map((id) => kindOf.get(id) ?? "")
      return { rank, nodeIds, kinds, title: titleOf(kinds) }
    })

  return { rankOf, stages }
}

export const stepNumber = (rank: number): string => String(rank + 1).padStart(2, "0")
