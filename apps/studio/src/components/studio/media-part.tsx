import type { CSSProperties, ReactNode } from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import { Play } from "lucide-react"
import type { ContentPart, PartKind } from "@/domain"
import { playTime } from "@/lib/format"
import { PART_KIND } from "./presets"
import { Meter } from "./stat"
import { Tag } from "./tag"
import { Text } from "./text"
import { TextBlock } from "./text-block"

export type MediaPartProps = { readonly part: ContentPart; readonly compact?: boolean }

type PartOf<K extends PartKind> = ContentPart & { readonly kind: K }

type PreviewProps<K extends PartKind> = { readonly part: PartOf<K>; readonly compact: boolean }

type PreviewViews = { readonly [K in PartKind]: (props: PreviewProps<K>) => ReactNode }

type PartLayoutProps = { readonly part: ContentPart }

const WAVEFORM_HEIGHT_PX = 30

const imageFrameVariants = cva("relative flex w-full items-end rounded-md border border-border bg-stripes p-1.5", {
  variants: {
    compact: {
      true: "aspect-[4/3] max-w-[132px]",
      false: "max-w-[224px]",
    },
  },
})

const videoFrameVariants = cva("relative min-w-0 flex-1 rounded-sm border border-border bg-stripes-sm", {
  variants: {
    compact: {
      true: "aspect-video",
      false: "",
    },
  },
})

const sourceAspect = (compact: boolean, width: number, height: number): CSSProperties | undefined => {
  if (compact) return undefined
  return { aspectRatio: `${String(width)} / ${String(height)}` }
}

const barHeight = (amplitude: number): CSSProperties => ({
  height: `${String(Math.round(amplitude * WAVEFORM_HEIGHT_PX))}px`,
})

function OverlayTag({ children, className }: { readonly children: string; readonly className?: string }) {
  return (
    <span className={cn("inline-flex rounded-xs bg-card", className)}>
      <Tag fill="outline" size="micro">
        {children}
      </Tag>
    </span>
  )
}

function VersionTag({ version }: { readonly version: string | undefined }) {
  if (version === undefined) return null
  return <OverlayTag className="absolute top-1.25 right-1.25">{version}</OverlayTag>
}

function TextPreview({ part }: PreviewProps<"text" | "json">) {
  return <TextBlock variant="plain" text={part.text} />
}

function ImagePreview({ part, compact }: PreviewProps<"image">) {
  return (
    <div className={imageFrameVariants({ compact })} style={sourceAspect(compact, part.width, part.height)}>
      <OverlayTag>{part.caption}</OverlayTag>
      <VersionTag version={part.version} />
    </div>
  )
}

function AudioPreview({ part }: PreviewProps<"audio">) {
  return (
    <div className="flex h-10 items-center gap-0.5 rounded-md border border-border bg-background-subtle px-2">
      <Play aria-hidden className="mr-1.5 size-3 shrink-0 fill-current text-muted-foreground" />
      {part.waveform.map((amplitude, index) => (
        <span
          key={index}
          aria-hidden
          data-tone={PART_KIND.audio.tone}
          className="w-0.5 shrink-0 rounded-xs bg-tone opacity-65"
          style={barHeight(amplitude)}
        />
      ))}
    </div>
  )
}

function DocumentPreview({ part }: PreviewProps<"document">) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background-subtle px-2.25 py-2">
      <span
        aria-hidden
        data-tone={PART_KIND.document.tone}
        className="h-6.75 w-5.5 shrink-0 rounded-xs border border-tone-border bg-tone-bg"
      />
      <Text role="small" tone="neutral" className="min-w-0 wrap-anywhere">
        {part.caption}
      </Text>
    </div>
  )
}

function FramePlay({ index }: { readonly index: number }) {
  if (index > 0) return null
  return <Play aria-hidden className="absolute top-1/2 left-1/2 size-3.5 -translate-1/2 fill-current text-foreground" />
}

function VideoPreview({ part, compact }: PreviewProps<"video">) {
  return (
    <div className="min-w-0">
      <div className="flex gap-1">
        {part.frameTimesS.map((time, index) => (
          <div key={index} className={videoFrameVariants({ compact })} style={sourceAspect(compact, part.width, part.height)}>
            <FramePlay index={index} />
            <Text role="micro" tone="neutral" className="absolute bottom-0.75 left-0.75 text-5xs">
              {playTime(time)}
            </Text>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Meter track="muted" tone={PART_KIND.video.tone} value={part.playhead} className="flex-1" />
        <Text role="small" tone="neutral" className="shrink-0">
          {part.caption}
        </Text>
      </div>
    </div>
  )
}

const PREVIEW: PreviewViews = {
  text: TextPreview,
  json: TextPreview,
  image: ImagePreview,
  audio: AudioPreview,
  document: DocumentPreview,
  video: VideoPreview,
}

const renderPreview = <K extends PartKind>(kind: K, part: PartOf<K>, compact: boolean): ReactNode => {
  const view: (props: PreviewProps<K>) => ReactNode = PREVIEW[kind]
  return view({ part, compact })
}

function PartHead({ part, children }: { readonly part: ContentPart; readonly children?: ReactNode }) {
  const kind = PART_KIND[part.kind]
  return (
    <div className="flex min-w-0 items-center gap-1.75">
      <Tag size="micro" tone={kind.tone}>
        {kind.code}
      </Tag>
      <Text role="body" weight="medium" truncate className="leading-none">
        {part.name}
      </Text>
      {children}
    </div>
  )
}

function InlineMetaPart({ part }: PartLayoutProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.75">
      <PartHead part={part}>
        <Text role="small" tone="neutral" className="ml-auto shrink-0">
          {part.meta}
        </Text>
      </PartHead>
      {renderPreview(part.kind, part, false)}
    </div>
  )
}

function FooterMetaPart({ part }: PartLayoutProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.25">
      <PartHead part={part} />
      {renderPreview(part.kind, part, true)}
      <Text as="div" role="small" tone="neutral" className="mt-1 wrap-anywhere">
        {part.meta}
      </Text>
    </div>
  )
}

export function MediaPart({ part, compact = false }: MediaPartProps) {
  const Layout = compact ? FooterMetaPart : InlineMetaPart
  return <Layout part={part} />
}
