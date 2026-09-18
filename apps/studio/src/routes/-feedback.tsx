import { useState } from "react"
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"

export function RoutePending() {
  return (
    <div role="status" aria-label="Loading page" className="flex h-full min-h-72 flex-col gap-4 bg-background-subtle p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden="true" />Loading page…</div>
      <Skeleton aria-hidden className="h-8 w-1/3 max-w-64" />
      <Skeleton aria-hidden className="h-32 w-full" />
      <Skeleton aria-hidden className="h-48 w-full" />
    </div>
  )
}

export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  const detail = error instanceof Error ? error.message : String(error)
  return (
    <div className="flex h-full min-h-72 items-start justify-center bg-background-subtle p-6">
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>This page could not be loaded</AlertTitle>
        <AlertDescription className="break-words">{detail}</AlertDescription>
        <Button type="button" variant="outline" size="sm" disabled={retrying} className="mt-3" onClick={() => {
          setRetrying(true)
          void router.invalidate().finally(() => { setRetrying(false) })
        }}>
          {retrying ? <Spinner aria-hidden="true" /> : null}
          Try again
        </Button>
      </Alert>
    </div>
  )
}
