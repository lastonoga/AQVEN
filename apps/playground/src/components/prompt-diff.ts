export type DiffPart = { text: string; same: boolean }

export const DIFF_CELLS_LIMIT = 1_000_000

type Pair = readonly [number, number]

const tokenize = (text: string): string[] => text.split(/(\s+)/).filter((token) => token !== "")

const affixPairs = (base: readonly string[], other: readonly string[]): Pair[] => {
  const limit = Math.min(base.length, other.length)
  const pairs: Pair[] = []
  let head = 0
  while (head < limit && base[head] === other[head]) {
    pairs.push([head, head])
    head += 1
  }
  let tail = 0
  while (tail < limit - head && base[base.length - 1 - tail] === other[other.length - 1 - tail]) {
    pairs.push([base.length - 1 - tail, other.length - 1 - tail])
    tail += 1
  }
  return pairs
}

const lcsPairs = (base: readonly string[], other: readonly string[]): Pair[] => {
  const cols = other.length + 1
  const table = new Uint32Array((base.length + 1) * cols)
  const at = (row: number, column: number): number => table[row * cols + column] ?? 0
  for (let row = base.length - 1; row >= 0; row -= 1) {
    for (let column = other.length - 1; column >= 0; column -= 1) {
      const same = base[row] === other[column]
      table[row * cols + column] = same ? at(row + 1, column + 1) + 1 : Math.max(at(row + 1, column), at(row, column + 1))
    }
  }
  const pairs: Pair[] = []
  let row = 0
  let column = 0
  while (row < base.length && column < other.length) {
    if (base[row] === other[column]) {
      pairs.push([row, column])
      row += 1
      column += 1
      continue
    }
    if (at(row + 1, column) >= at(row, column + 1)) {
      row += 1
      continue
    }
    column += 1
  }
  return pairs
}

const pairsOf = (base: readonly string[], other: readonly string[]): Pair[] => {
  if (base.length * other.length > DIFF_CELLS_LIMIT) return affixPairs(base, other)
  return lcsPairs(base, other)
}

const merge = (tokens: readonly string[], flags: readonly boolean[]): DiffPart[] =>
  tokens.reduce<DiffPart[]>((parts, token, index) => {
    const same = flags[index] === true
    const last = parts[parts.length - 1]
    if (last !== undefined && last.same === same) {
      last.text += token
      return parts
    }
    return [...parts, { text: token, same }]
  }, [])

const allSame = (tokens: readonly string[]): DiffPart[] => merge(tokens, tokens.map(() => true))

export const diffPrompts = (texts: readonly string[]): DiffPart[][] => {
  const tokens = texts.map(tokenize)
  const base = tokens[0]
  if (base === undefined) return []
  if (tokens.length === 1) return [allSame(base)]

  const pairs = tokens.slice(1).map((other) => pairsOf(base, other))
  const baseHits = pairs.map((list) => new Set(list.map(([index]) => index)))
  const baseFlags = base.map((_, index) => baseHits.every((hits) => hits.has(index)))

  const others = tokens.slice(1).map((other, branch) => {
    const links = new Map((pairs[branch] ?? []).map(([from, to]): [number, number] => [to, from]))
    const flags = other.map((_, index) => {
      const source = links.get(index)
      return source !== undefined && baseFlags[source] === true
    })
    return merge(other, flags)
  })

  return [merge(base, baseFlags), ...others]
}

export const promptParts = (prompts: readonly (string | null)[]): DiffPart[][] => {
  const texts = prompts.map((prompt) => prompt ?? "")
  const parts = diffPrompts(texts)
  return prompts.map((prompt, index) => (prompt === null ? [] : parts[index] ?? []))
}
