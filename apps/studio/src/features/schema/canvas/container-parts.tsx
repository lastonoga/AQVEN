import { Tag, Text } from "@/components/studio"
import type { ContainerData } from "./to-flow"

export type ContainerViewProps = { readonly data: ContainerData }

export function ContainerTag({ data }: ContainerViewProps) {
  return (
    <Tag size="sm" tone={data.tone}>
      {data.tag}
    </Tag>
  )
}

export function ContainerTitle({ data }: ContainerViewProps) {
  if (data.title === null) return null
  return (
    <Text role="block" weight="semibold" className="shrink-0">
      {data.title}
    </Text>
  )
}

export function BarCaption({ data }: ContainerViewProps) {
  if (data.caption === null) return null
  return (
    <Text role="cell" weight="medium" tone="neutral" truncate>
      {data.caption}
    </Text>
  )
}

export function SectionCaption({ data }: ContainerViewProps) {
  if (data.caption === null) return null
  return (
    <Text role="meta" tone="neutral">
      {data.caption}
    </Text>
  )
}
