import { useState } from "react"
import type { ReactNode } from "react"
import { KIND_LABELS, mediaLabel } from "../values/index.js"
import type { MediaRef, ValueKind } from "../values/index.js"

const FRAME = "rounded border border-slate-800 bg-slate-950/60"
const CAPTION = "truncate font-mono text-[10.5px] text-slate-500"
const NOTE = "font-mono text-[10.5px] text-amber-300/90"
const LINK = "truncate font-mono text-[11.5px] text-sky-300 underline decoration-slate-700 hover:text-sky-200"
const THUMB = "h-7 w-7 shrink-0 rounded border border-slate-800 bg-slate-900 object-cover"

const MISSING = "источник не задан"
const BROKEN = "не загрузилось"

export type MediaProps = { media: MediaRef; kind: ValueKind }

function Placeholder({ media, kind, reason }: MediaProps & { reason: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 px-2 py-1.5 ${FRAME}`}>
      <span className={NOTE}>{media.note === "" ? reason : media.note}</span>
      <span className={CAPTION}>
        {KIND_LABELS[kind]} · {mediaLabel(media)}
      </span>
      {media.src !== "" && <span className="truncate font-mono text-[10px] text-slate-600">{media.src}</span>}
    </div>
  )
}

function Caption({ media }: { media: MediaRef }) {
  return <span className={CAPTION}>{mediaLabel(media)}</span>
}

function Zoom({ media, onClose }: { media: MediaRef; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-slate-950/95 p-6">
      <img src={media.src} alt={media.name} className="max-h-[80vh] max-w-full object-contain" />
      <Caption media={media} />
      <button
        type="button"
        onClick={onClose}
        className="rounded border border-slate-700 px-2 py-0.5 font-mono text-[11px] text-slate-300 hover:bg-slate-800"
      >
        закрыть
      </button>
      <button type="button" onClick={onClose} className="absolute inset-0 -z-10" aria-label="закрыть просмотр" />
    </div>
  )
}

const useBroken = (src: string): [boolean, () => void] => {
  const [brokenSrc, setBrokenSrc] = useState("")
  return [src !== "" && brokenSrc === src, () => setBrokenSrc(src)]
}

function ImageValue({ media, kind }: MediaProps) {
  const [broken, markBroken] = useBroken(media.src)
  const [zoomed, setZoomed] = useState(false)

  if (media.src === "") return <Placeholder media={media} kind={kind} reason={MISSING} />
  if (broken) return <Placeholder media={media} kind={kind} reason={BROKEN} />

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <button type="button" onClick={() => setZoomed(true)} className={`overflow-hidden ${FRAME}`}>
        <img
          src={media.src}
          alt={media.name}
          onError={markBroken}
          className="max-h-48 max-w-full object-contain"
        />
      </button>
      <Caption media={media} />
      {zoomed && <Zoom media={media} onClose={() => setZoomed(false)} />}
    </div>
  )
}

function VideoValue({ media, kind }: MediaProps) {
  const [broken, markBroken] = useBroken(media.src)

  if (media.src === "") return <PosterFallback media={media} kind={kind} reason={MISSING} />
  if (broken) return <PosterFallback media={media} kind={kind} reason={BROKEN} />

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <video
        src={media.src}
        poster={media.poster === "" ? undefined : media.poster}
        controls
        preload="metadata"
        onError={markBroken}
        className={`max-h-64 max-w-full ${FRAME}`}
      />
      <Caption media={media} />
    </div>
  )
}

function PosterFallback({ media, kind, reason }: MediaProps & { reason: string }) {
  if (media.poster === "") return <Placeholder media={media} kind={kind} reason={reason} />
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <img src={media.poster} alt={media.name} className={`max-h-48 max-w-full object-contain ${FRAME}`} />
      <span className={NOTE}>{media.note === "" ? reason : media.note}</span>
      <Caption media={media} />
    </div>
  )
}

function AudioValue({ media, kind }: MediaProps) {
  const [broken, markBroken] = useBroken(media.src)

  if (media.src === "") return <Placeholder media={media} kind={kind} reason={MISSING} />
  if (broken) return <Placeholder media={media} kind={kind} reason={BROKEN} />

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <audio src={media.src} controls preload="metadata" onError={markBroken} className="h-8 w-64 max-w-full" />
      <Caption media={media} />
    </div>
  )
}

function FileValue({ media, kind }: MediaProps) {
  if (media.src === "") return <Placeholder media={media} kind={kind} reason={MISSING} />
  return (
    <div className={`flex min-w-0 flex-col items-start gap-0.5 px-2 py-1.5 ${FRAME}`}>
      <a href={media.src} download={media.name} className={LINK}>
        скачать {media.name}
      </a>
      <Caption media={media} />
    </div>
  )
}

function LinkValue({ media, kind }: MediaProps) {
  if (media.src === "") return <Placeholder media={media} kind={kind} reason={MISSING} />
  return (
    <a href={media.src} target="_blank" rel="noreferrer" className={LINK}>
      {media.src}
    </a>
  )
}

const RENDERERS: Readonly<Record<string, (props: MediaProps) => ReactNode>> = {
  image: ImageValue,
  video: VideoValue,
  audio: AudioValue,
  file: FileValue,
  link: LinkValue,
}

export function MediaValue({ media, kind }: MediaProps): ReactNode {
  const Render = RENDERERS[kind] ?? FileValue
  return <Render media={media} kind={kind} />
}

export function MediaThumb({ media, kind }: MediaProps): ReactNode {
  const [broken, markBroken] = useBroken(media.src)
  const showable = kind === "image" && media.src !== "" && !broken

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {showable && <img src={media.src} alt="" onError={markBroken} className={THUMB} />}
      {!showable && (
        <span className="shrink-0 rounded border border-slate-800 bg-slate-900 px-1 font-mono text-[10px] text-slate-500">
          {KIND_LABELS[kind]}
        </span>
      )}
      <span className="truncate font-mono text-[11.5px] text-slate-300">{mediaLabel(media)}</span>
    </span>
  )
}
