const storageKey = (projectRoot: string): string => `aqven:flow:last:${projectRoot}`

export const rememberFlow = (projectRoot: string, flowId: string): void => {
  try {
    localStorage.setItem(storageKey(projectRoot), flowId)
  } catch {
    return
  }
}

export const rememberedFlow = (projectRoot: string): string | null => {
  try {
    return localStorage.getItem(storageKey(projectRoot))
  } catch {
    return null
  }
}
