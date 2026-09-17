import type { ReactNode } from "react"
import { Text } from "@/components/studio"

export function CellText({ children }: { readonly children: ReactNode }) {
  return (
    <Text as="div" role="body" tone="default" truncate>
      {children}
    </Text>
  )
}
