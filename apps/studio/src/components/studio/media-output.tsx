import { useRef, useState, type ReactNode } from "react"
import { PlayIcon } from "lucide-react"
import { useTranslations } from "use-intl"
import type { FilePath } from "@/domain"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { API_BASE } from "@/api/client"

export type BlobMedia = {
  readonly slot: string
  readonly mediaType: string
  readonly blobId: string
  readonly bytes: number
  readonly name: string | null
  readonly posterBlobId?: string | null
}

export type FileMedia = {
  readonly slot: string
  readonly mediaType: string
  readonly file: string
  readonly path: FilePath | null
  readonly name: string | null
}

export type OutputMedia = BlobMedia | FileMedia

type PreviewProps = {
  readonly src: string
  readonly poster: string | undefined
  readonly label: string
  readonly compact: boolean
}

type PreviewRender = (props: PreviewProps) => ReactNode

const LINK_CLASS = "min-w-0 break-all text-sm text-foreground underline underline-offset-2 hover:text-primary"
const META_CLASS = "font-mono text-[11px] text-muted-foreground"
const MEDIA_FAMILY_SEPARATOR = "/"

export const isFileMedia = (media: OutputMedia): media is FileMedia => "file" in media

export const mediaKey = (media: OutputMedia): string => `${media.slot}-${isFileMedia(media) ? media.file : media.blobId}`

export const rawFileUrl = (path: FilePath): string => `${API_BASE}/raw/${path.split("/").map(encodeURIComponent).join("/")}`

const blobUrl = (blobId: string): string => `${API_BASE}/blobs/${encodeURIComponent(blobId)}`

const mediaSrc = (media: OutputMedia): string | null => {
  if (!isFileMedia(media)) return blobUrl(media.blobId)
  return media.path === null ? null : rawFileUrl(media.path)
}

const posterSrc = (media: OutputMedia): string | undefined =>
  !isFileMedia(media) && media.posterBlobId ? blobUrl(media.posterBlobId) : undefined

const mediaIdentity = (media: OutputMedia): string => (isFileMedia(media) ? media.file : media.blobId)

const slotShown = (media: OutputMedia): boolean => media.slot.length > 0 && media.slot !== mediaIdentity(media)

const mediaLabel = (media: OutputMedia): string => media.name || (slotShown(media) ? media.slot : media.mediaType)

function MediaFileLink({ src, label }: { readonly src: string; readonly label: string }) {
  const t = useTranslations("common.media")
  return <a data-media-interactive href={src} target="_blank" rel="noreferrer" className={LINK_CLASS}>{t("openFile", { name: label })}</a>
}

function ImagePreview({ src, label, compact }: PreviewProps) {
  const t = useTranslations("common.media")
  const [broken, setBroken] = useState(false)
  if (broken) return <MediaFileLink src={src} label={label} />
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

function AudioPreview({ src, label }: PreviewProps) {
  const [broken, setBroken] = useState(false)
  if (broken) return <MediaFileLink src={src} label={label} />
  return <audio data-media-interactive aria-label={label} src={src} controls preload="metadata" onError={() => { setBroken(true) }} className="h-10 w-full max-w-md" />
}

function VideoPreview({ src, poster, label, compact }: PreviewProps) {
  const t = useTranslations("common.media")
  const videoRef = useRef<HTMLVideoElement>(null)
  const [broken, setBroken] = useState(false)
  const [playing, setPlaying] = useState(false)
  if (broken) return <MediaFileLink src={src} label={label} />
  return (
    <div data-media-interactive className={`relative aspect-video w-full ${compact ? "max-w-[28rem]" : "max-w-[40rem]"} overflow-hidden rounded-md border border-border bg-black`}>
      <video
        ref={videoRef}
        data-media-interactive
        aria-label={label}
        src={src}
        poster={poster}
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

const PREVIEWS: Readonly<Record<string, PreviewRender>> = {
  image: (props) => <ImagePreview {...props} />,
  audio: (props) => <AudioPreview {...props} />,
  video: (props) => <VideoPreview {...props} />,
}

const linkPreview: PreviewRender = ({ src, label }) => <MediaFileLink src={src} label={label} />

const renderPreview = (mediaType: string, props: PreviewProps): ReactNode =>
  (PREVIEWS[mediaType.split(MEDIA_FAMILY_SEPARATOR)[0] ?? ""] ?? linkPreview)(props)

function UnreadablePath({ file }: { readonly file: string }) {
  const t = useTranslations("common.media")
  return <span role="alert" className="text-sm text-destructive">{t("pathInvalid", { file })}</span>
}

function FileFooter({ media }: { readonly media: FileMedia }) {
  const t = useTranslations("common.media")
  if (media.path === null) return <span className={META_CLASS}>{media.file} · {media.mediaType}</span>
  return (
    <span className={META_CLASS}>
      <a data-media-interactive href={rawFileUrl(media.path)} target="_blank" rel="noreferrer" title={t("openPath", { path: media.path })} className="underline underline-offset-2 hover:text-primary">{media.path}</a>
      {" · "}{media.mediaType}
    </span>
  )
}

function BlobFooter({ media }: { readonly media: BlobMedia }) {
  return <span className={META_CLASS}>{media.mediaType} · {media.bytes.toLocaleString()} B</span>
}

function MediaFooter({ media }: { readonly media: OutputMedia }) {
  return isFileMedia(media) ? <FileFooter media={media} /> : <BlobFooter media={media} />
}

export function MediaOutput({ media, compact = false }: { readonly media: OutputMedia; readonly compact?: boolean }) {
  const label = mediaLabel(media)
  const src = mediaSrc(media)
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-1.5 rounded-md border border-border bg-background-subtle p-2">
      {slotShown(media) ? <span className={META_CLASS}>{media.slot}</span> : null}
      {src === null ? <UnreadablePath file={mediaIdentity(media)} /> : renderPreview(media.mediaType, { src, poster: posterSrc(media), label, compact })}
      <MediaFooter media={media} />
    </div>
  )
}
