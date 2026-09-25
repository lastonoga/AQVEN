import { readViewerItem, writeViewerItem } from "./viewer-storage"

const storageKey = (projectRoot: string): string => `aqven:flow:last:${projectRoot}`

export const rememberFlow = (projectRoot: string, flowId: string): void => {
  writeViewerItem(storageKey(projectRoot), flowId)
}

export const rememberedFlow = (projectRoot: string): string | null => readViewerItem(storageKey(projectRoot))
