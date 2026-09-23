const storageKey = (projectRoot: string): string => `aqven:chat:session:${projectRoot}`

export const rememberSession = (projectRoot: string, sessionId: string): void => {
  try {
    sessionStorage.setItem(storageKey(projectRoot), sessionId)
  } catch {
    return
  }
}

export const rememberedSession = (projectRoot: string): string | null => {
  try {
    return sessionStorage.getItem(storageKey(projectRoot))
  } catch {
    return null
  }
}
