import { useState } from "react"
import { replaceEqualDeep } from "@tanstack/react-router"

export function useStableValue<T>(value: T): T {
  const [stable, setStable] = useState(value)
  const next = replaceEqualDeep(stable, value)
  if (next !== stable) setStable(next)
  return next
}
