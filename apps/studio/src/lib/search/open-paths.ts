import { useNavigate, useSearch } from "@tanstack/react-router"
import type { ColumnPath } from "@/domain"
import { noop } from "@/lib/noop"
import { ROUTE_ID } from "@/lib/routes"

export type OpenPaths = { readonly isOpen: (path: ColumnPath) => boolean; readonly toggle: (path: ColumnPath) => void }

const PATH_SEPARATOR = "/"

export const CLOSED_PATHS: OpenPaths = { isOpen: () => false, toggle: noop }

const parentOf = (path: string): string => {
  const index = path.lastIndexOf(PATH_SEPARATOR)
  return index < 0 ? "" : path.slice(0, index)
}

const isWithin = (path: string, ancestor: string): boolean => path === ancestor || path.startsWith(`${ancestor}${PATH_SEPARATOR}`)

export const togglePath = (open: readonly ColumnPath[], path: ColumnPath): readonly ColumnPath[] => {
  if (open.includes(path)) return open.filter((entry) => !isWithin(entry, path))
  const parent = parentOf(path)
  const siblings = open.filter((entry) => parentOf(entry) === parent)
  return [...open.filter((entry) => !siblings.some((sibling) => isWithin(entry, sibling))), path]
}

export function useOpenPaths(defaultOpen: readonly ColumnPath[]): OpenPaths {
  const navigate = useNavigate({ from: ROUTE_ID.dataflow })
  const open = useSearch({ from: ROUTE_ID.dataflow }).open ?? defaultOpen
  return {
    isOpen: (path) => open.includes(path),
    toggle: (path) => {
      void navigate({
        search: (prev) => ({ ...prev, open: togglePath(prev.open ?? defaultOpen, path) }),
        replace: true,
        resetScroll: false,
      })
    },
  }
}
