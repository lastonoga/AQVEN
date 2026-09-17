import type { ReactNode } from "react"
import { Surface, Toolbar } from "@/components/studio"
import { BarCaption, ContainerTag, ContainerTitle, SectionCaption, type ContainerViewProps } from "./container-parts"
import type { CanvasSize, GroupFrame } from "./to-flow"

const HEADER_LAYOUT: Readonly<Record<CanvasSize, string>> = {
  md: "h-12 gap-2.25 px-4.5",
  sm: "h-11 gap-2.25 px-4",
}

function FramedContainer({ data, variant }: ContainerViewProps & { readonly variant: "tinted" | "outlined" }) {
  return (
    <Surface variant={variant} tone={data.tone} className="h-full w-full">
      <Toolbar className={HEADER_LAYOUT[data.size]}>
        <ContainerTag data={data} />
        <ContainerTitle data={data} />
        <BarCaption data={data} />
      </Toolbar>
    </Surface>
  )
}

function DashedContainer({ data }: ContainerViewProps) {
  return (
    <Surface variant="dashed" className="relative h-full w-full">
      <Toolbar className="absolute top-2.5 left-4 gap-1.75">
        <ContainerTag data={data} />
        <ContainerTitle data={data} />
      </Toolbar>
    </Surface>
  )
}

function SectionContainer({ data }: ContainerViewProps) {
  return (
    <div className="h-full w-full">
      <Toolbar wrap className="max-w-310 gap-2.25 pb-3.5">
        <ContainerTag data={data} />
        <ContainerTitle data={data} />
        <SectionCaption data={data} />
      </Toolbar>
    </div>
  )
}

const CONTAINER_VIEW: Readonly<Record<GroupFrame, (props: ContainerViewProps) => ReactNode>> = {
  tinted: ({ data }) => <FramedContainer data={data} variant="tinted" />,
  outlined: ({ data }) => <FramedContainer data={data} variant="outlined" />,
  dashed: DashedContainer,
  none: SectionContainer,
}

export function ContainerView({ data }: ContainerViewProps) {
  const View = CONTAINER_VIEW[data.frame]
  return <View data={data} />
}
