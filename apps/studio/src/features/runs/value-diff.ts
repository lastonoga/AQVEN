export const FIELD_STATES = ["same", "changed", "onlyLeft", "onlyRight"] as const

export type FieldState = (typeof FIELD_STATES)[number]

export type FieldDiff = {
  readonly path: string
  readonly left: string | null
  readonly right: string | null
  readonly state: FieldState
}

type Leaf = { readonly identity: string; readonly text: string }

type Leaves = ReadonlyMap<string, Leaf>

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isContainer = (value: unknown): value is Readonly<Record<string, unknown>> | readonly unknown[] =>
  Array.isArray(value) || isRecord(value)

const keyPath = (parent: string, key: string): string => (parent.length === 0 ? key : `${parent}.${key}`)

const indexPath = (parent: string, index: number): string => `${parent}[${String(index)}]`

const leafOf = (value: unknown): Leaf => {
  const identity = JSON.stringify(value)
  return { identity, text: typeof value === "string" ? value : identity }
}

const childrenOf = (value: Readonly<Record<string, unknown>> | readonly unknown[], path: string): readonly (readonly [string, unknown])[] =>
  Array.isArray(value)
    ? value.map((item: unknown, index) => [indexPath(path, index), item] as const)
    : Object.entries(value).map(([key, item]) => [keyPath(path, key), item] as const)

const collect = (value: unknown, path: string, into: Map<string, Leaf>): void => {
  if (value === undefined) return
  const children = isContainer(value) ? childrenOf(value, path) : []
  if (children.length === 0) {
    into.set(path, leafOf(value))
    return
  }
  children.forEach(([childPath, child]) => {
    collect(child, childPath, into)
  })
}

export const leavesOf = (value: unknown): Leaves => {
  const into = new Map<string, Leaf>()
  collect(value, "", into)
  return into
}

const stateOf = (left: Leaf | undefined, right: Leaf | undefined): FieldState => {
  if (left === undefined) return "onlyRight"
  if (right === undefined) return "onlyLeft"
  return left.identity === right.identity ? "same" : "changed"
}

const unionPaths = (left: Leaves, right: Leaves): readonly string[] => [
  ...left.keys(),
  ...[...right.keys()].filter((path) => !left.has(path)),
]

export const diffValues = (left: unknown, right: unknown): readonly FieldDiff[] => {
  const leftLeaves = leavesOf(left)
  const rightLeaves = leavesOf(right)
  return unionPaths(leftLeaves, rightLeaves).map((path) => {
    const leftLeaf = leftLeaves.get(path)
    const rightLeaf = rightLeaves.get(path)
    return { path, left: leftLeaf?.text ?? null, right: rightLeaf?.text ?? null, state: stateOf(leftLeaf, rightLeaf) }
  })
}

export const isChanged = (diff: FieldDiff): boolean => diff.state !== "same"

export const changedFields = (diffs: readonly FieldDiff[]): readonly FieldDiff[] => diffs.filter(isChanged)
