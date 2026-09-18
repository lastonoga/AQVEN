import { useRef, useState } from "react"
import { PlayIcon } from "lucide-react"
import { useTranslations } from "use-intl"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { API_BASE } from "@/api/client"

export type OutputMedia = {
  readonly slot: string
  readonly mediaType: string
  readonly blobId: string
  readonly bytes: number
  readonly name: string | null
  readonly posterBlobId?: string | null
}

const blobUrl = (blobId: string): string => `${API_BASE}/blobs/${encodeURIComponent(blobId)}`

function MediaFileLink({ media, label }: { readonly media: OutputMedia; readonly label: string }) {
  const t = useTranslations("common.media")
  return <a data-media-interactive href={blobUrl(media.blobId)} target="_blank" rel="noreferrer" className="min-w-0 break-all text-sm text-foreground underline underline-offset-2 hover:text-primary">{t("openFile", { name: label })}</a>
}

function ImageOutput({ media, label, compact }: { readonly media: OutputMedia; readonly label: string; readonly compact: boolean }) {
  const t = useTranslations("common.media")
  const [broken, setBroken] = useState(false)
  if (broken) return <MediaFileLink media={media} label={label} />
  const src = blobUrl(media.blobId)
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" data-media-interactive aria-label={t("openImage", { name: label })} className={`block aspect-video w-full ${compact ? "max-w-[28rem]" : "max-w-[40rem]"} cursor-zoom-in overflow-hidden rounded-md border border-border bg-black focus-visible:outline-2 focus-visible:outline-ring`}>
          <img src={src} alt={label} loading="lazy" onError={() => { setBroken(true) }} className="h-full w-full object-contain" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[96vh] max-w-[min(96vw,1100px)] overflow-auto p-4" aria-describedby={undefined}>
        <DialogTitle className="pr-8">{label}</DialogTitle>
        <img src={src} alt={label} className="max-h-[80vh] w-full rounded-md bg-black object-contain" />
      </DialogContent>
    </Dialog>
  )
}

function AudioOutput({ media, label }: { readonly media: OutputMedia; readonly label: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <MediaFileLink media={media} label={label} />
  return <audio data-media-interactive aria-label={label} src={blobUrl(media.blobId)} controls preload="metadata" onError={() => { setBroken(true) }} className="h-10 w-full max-w-md" />
}

function VideoOutput({ media, label, compact }: { readonly media: OutputMedia; readonly label: string; readonly compact: boolean }) {
  const t = useTranslations("common.media")
  const videoRef = useRef<HTMLVideoElement>(null)
  const [broken, setBroken] = useState(false)
  const [playing, setPlaying] = useState(false)
  if (broken) return <MediaFileLink media={media} label={label} />
  return (
    <div data-media-interactive className={`relative aspect-video w-full ${compact ? "max-w-[28rem]" : "max-w-[40rem]"} overflow-hidden rounded-md border border-border bg-black`}>
      <video
        ref={videoRef}
        data-media-interactive
        aria-label={label}
        src={blobUrl(media.blobId)}
        poster={media.posterBlobId ? blobUrl(media.posterBlobId) : undefined}
        controls
        playsInline
        preload="metadata"
        onPlay={() => { setPlaying(true) }}
        onPause={() => { setPlaying(false) }}
        onEnded={() => { setPlaying(false) }}
        onError={() => { setBroken(true) }}
        className="h-full w-full object-contain"
      />
      {!playing ? (
        <Button
          type="button"
          data-media-interactive
          aria-label={t("playVideo", { name: label })}
          onClick={() => { void videoRef.current?.play().catch(() => { setPlaying(false) }) }}
          className="absolute top-1/2 left-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/95 text-black shadow-lg hover:bg-white focus-visible:ring-white/60"
        >
          <PlayIcon aria-hidden="true" className="size-7 fill-current" />
        </Button>
      ) : null}
    </div>
  )
}

export function MediaOutput({ media, compact = false }: { readonly media: OutputMedia; readonly compact?: boolean }) {
  const label = media.name || (media.slot && media.slot !== media.blobId ? media.slot : media.mediaType)
  const content = media.mediaType.startsWith("image/") ? <ImageOutput media={media} label={label} compact={compact} />
    : media.mediaType.startsWith("audio/") ? <AudioOutput media={media} label={label} />
      : media.mediaType.startsWith("video/") ? <VideoOutput media={media} label={label} compact={compact} />
        : <MediaFileLink media={media} label={label} />
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-1.5 rounded-md border border-border bg-background-subtle p-2">
      {media.slot && media.slot !== media.blobId ? <span className="font-mono text-[11px] text-muted-foreground">{media.slot}</span> : null}
      {content}
      <span className="font-mono text-[11px] text-muted-foreground">{media.mediaType} · {media.bytes.toLocaleString()} B</span>
    </div>
  )
}
