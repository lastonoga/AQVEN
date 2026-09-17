export const loadWhen = <T, R>(id: T | null | undefined, load: (id: T) => Promise<R | null>): Promise<R | null> => {
  if (id === null || id === undefined) return Promise.resolve(null)
  return load(id)
}
