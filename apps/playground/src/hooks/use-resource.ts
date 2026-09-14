import { useEffect, useRef, useState } from "react"

export type Resource<T> = {
  data: T | null
  error: string | null
  loading: boolean
}

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

export function useResource<T>(load: () => Promise<T>, key: string): Resource<T> {
  const [state, setState] = useState<Resource<T>>({ data: null, error: null, loading: true })
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let alive = true
    setState((prev) => ({ data: prev.data, error: null, loading: true }))
    loadRef
      .current()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((cause: unknown) => alive && setState({ data: null, error: messageOf(cause), loading: false }))
    return () => {
      alive = false
    }
  }, [key])

  return state
}
