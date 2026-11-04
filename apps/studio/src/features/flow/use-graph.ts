import { useEffect, useState } from "react"
import type { ApiNode } from "@/domain"
import { buildGraph, type CanvasGraph } from "./layout"

export const useGraph = (nodes: readonly ApiNode[], order: readonly string[]): CanvasGraph | null => {
  const [graph, setGraph] = useState<CanvasGraph | null>(null)
  useEffect(() => {
    let cancelled = false
    void buildGraph(nodes, order).then((next) => {
      if (!cancelled) setGraph(next)
    })
    return () => {
      cancelled = true
    }
  }, [nodes, order])
  return graph
}
