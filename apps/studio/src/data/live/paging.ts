export const MAX_PAGE = 200

export type CursorPage<T> = { readonly items: readonly T[]; readonly next_cursor: string | null }

export const everyPage = async <T>(read: (cursor: string | null) => Promise<CursorPage<T>>): Promise<readonly T[]> => {
  const items: T[] = []
  const cursors = new Set<string>()
  let cursor: string | null = null
  do {
    const page = await read(cursor)
    items.push(...page.items)
    const next = page.next_cursor
    if (next !== null) {
      if (cursors.has(next)) throw new Error(`Repeated page cursor: ${next}`)
      cursors.add(next)
    }
    cursor = next
  } while (cursor !== null)
  return items
}
