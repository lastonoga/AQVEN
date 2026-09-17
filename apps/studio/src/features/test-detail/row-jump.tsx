import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import type { RowId } from "@/domain"
import { Button } from "@/components/ui/button"
import { ROUTE_ID } from "@/lib/routes"
import { selectRowSearch } from "./navigation"

export type RowJumpProps = {
  readonly target: RowId | null
  readonly label: string
  readonly variant: "outline" | "default"
  readonly size: "icon" | "sm"
  readonly children: ReactNode
}

export function RowJump({ target, label, variant, size, children }: RowJumpProps) {
  if (target === null) {
    return (
      <Button variant={variant} size={size} aria-label={label} disabled>
        {children}
      </Button>
    )
  }
  return (
    <Button variant={variant} size={size} aria-label={label} asChild>
      <Link from={ROUTE_ID.testDetail} to="." search={selectRowSearch(target)} resetScroll={false}>
        {children}
      </Link>
    </Button>
  )
}
