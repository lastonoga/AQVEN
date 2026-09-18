import { fireEvent, render, screen, within } from "@testing-library/react"
import { IntlProvider } from "use-intl"
import { describe, expect, it, vi } from "vitest"
import { messages } from "@/i18n/messages"
import { StructuredValue } from "./value-display"

const renderValue = (value: unknown, media: readonly {
  slot: string
  mediaType: string
  blobId: string
  bytes: number
  name: string | null
  posterBlobId?: string | null
}[]) => render(
  <IntlProvider locale="en" messages={messages.en} timeZone="UTC">
    <StructuredValue value={value} media={media} />
  </IntlProvider>,
)

describe("StructuredValue media output", () => {
  it("previews an image and opens it at full size", () => {
    const media = { slot: "", mediaType: "image/png", blobId: "sha256-image", bytes: 42, name: "preview.png" }
    renderValue({ $media: "image/png", blob_id: media.blobId, size_bytes: 42, name: media.name }, [media])

    const thumbnail = screen.getByRole("button", { name: /open image/i })
    expect(within(thumbnail).getByRole("img", { name: "preview.png" }).getAttribute("src")).toBe("/api/blobs/sha256-image")
    fireEvent.click(thumbnail)
    expect(within(screen.getByRole("dialog")).getByRole("img", { name: "preview.png" })).toBeTruthy()
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /close/i }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.queryByText("blob_id:")).toBeNull()
  })

  it("plays audio and video from blob URLs with native controls and a poster", () => {
    renderValue({ title: "Demo" }, [
      { slot: "voice", mediaType: "audio/wav", blobId: "sha256-audio", bytes: 16, name: "voice.wav" },
      { slot: "clip", mediaType: "video/mp4", blobId: "sha256-video", bytes: 100, name: "clip.mp4", posterBlobId: "sha256-poster" },
    ])

    const audio = screen.getByLabelText("voice.wav")
    const video = screen.getByLabelText("clip.mp4")
    expect(audio.tagName).toBe("AUDIO")
    expect(audio.getAttribute("src")).toBe("/api/blobs/sha256-audio")
    expect(audio.hasAttribute("controls")).toBe(true)
    expect(video.tagName).toBe("VIDEO")
    expect(video.getAttribute("src")).toBe("/api/blobs/sha256-video")
    expect(video.getAttribute("poster")).toBe("/api/blobs/sha256-poster")
    expect(video.hasAttribute("controls")).toBe(true)
    expect(screen.getByText("title:")).toBeTruthy()
    expect(screen.getByText("Demo")).toBeTruthy()
  })

  it("offers an explicit play button for a video preview", () => {
    renderValue(null, [
      { slot: "clip", mediaType: "video/mp4", blobId: "sha256-video", bytes: 100, name: "clip.mp4" },
    ])

    const video = screen.getByLabelText("clip.mp4")
    if (!(video instanceof HTMLVideoElement)) throw new Error("Expected a video preview")
    const play = vi.spyOn(video, "play").mockResolvedValue()
    fireEvent.click(screen.getByRole("button", { name: "Play video: clip.mp4" }))
    expect(play).toHaveBeenCalledOnce()

    fireEvent.play(video)
    expect(screen.queryByRole("button", { name: "Play video: clip.mp4" })).toBeNull()
    fireEvent.pause(video)
    expect(screen.getByRole("button", { name: "Play video: clip.mp4" })).toBeTruthy()
  })

  it("keeps text alongside nested media and links unsupported files", () => {
    renderValue({ title: "Demo", media: { image: { $media: "image/jpeg", blob_id: "sha256-photo", size_bytes: 5 } } }, [
      { slot: "media.image", mediaType: "image/jpeg", blobId: "sha256-photo", bytes: 5, name: "photo.jpg" },
      { slot: "report", mediaType: "application/pdf", blobId: "sha256-pdf", bytes: 80, name: "report.pdf" },
    ])
    expect(screen.getByText("title:")).toBeTruthy()
    expect(screen.getByRole("img", { name: "photo.jpg" })).toBeTruthy()
    expect(screen.getByRole("link", { name: /report.pdf/i }).getAttribute("href")).toBe("/api/blobs/sha256-pdf")
    expect(screen.queryByText("media.image.blob_id:")).toBeNull()
  })

})
