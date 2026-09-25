import { describe, expect, it } from "vitest"
import { attachTargets, mediaFilePath } from "./media-files"

const FOLDER = "datasets/photos"

const IMAGE_SCHEMA = {
  type: "object",
  properties: { $media: { type: "string", pattern: "^image/[a-z0-9.+-]+$" }, blob_id: { type: "string" } },
}

const DOCUMENT_SCHEMA = {
  type: "object",
  properties: { $media: { type: "string", pattern: "^(application|text)/[a-z0-9.+-]+$" }, blob_id: { type: "string" } },
}

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    photo: { anyOf: [IMAGE_SCHEMA, { type: "null" }] },
    invoice: DOCUMENT_SCHEMA,
    customer: { type: "object", properties: { name: { type: "string" } } },
  },
}

describe("mediaFilePath", () => {
  it("resolves a relative file from the dataset folder and @root/ from the project root", () => {
    expect(mediaFilePath("photo_01.jpg", FOLDER)).toBe("datasets/photos/photo_01.jpg")
    expect(mediaFilePath("damaged/./photo_01.jpg", FOLDER)).toBe("datasets/photos/damaged/photo_01.jpg")
    expect(mediaFilePath("damaged/../photo_01.jpg", FOLDER)).toBe("datasets/photos/photo_01.jpg")
    expect(mediaFilePath("damaged\\photo_01.jpg", FOLDER)).toBe("datasets/photos/damaged/photo_01.jpg")
    expect(mediaFilePath("@root/samples/flow_strip_controller.jpg", FOLDER)).toBe("samples/flow_strip_controller.jpg")
  })

  it("refuses absolute paths, paths that climb out of their root, empty paths and .aqven/", () => {
    expect(mediaFilePath("/etc/passwd", FOLDER)).toBeNull()
    expect(mediaFilePath("C:/photos/a.jpg", FOLDER)).toBeNull()
    expect(mediaFilePath("../samples/a.jpg", FOLDER)).toBeNull()
    expect(mediaFilePath("sub/../../a.jpg", FOLDER)).toBeNull()
    expect(mediaFilePath("@root/../outside.jpg", FOLDER)).toBeNull()
    expect(mediaFilePath("@root/.aqven/blobs/x.bin", FOLDER)).toBeNull()
    expect(mediaFilePath("@root/.AQVEN/blobs/x.bin", FOLDER)).toBeNull()
    expect(mediaFilePath(" ", FOLDER)).toBeNull()
    expect(mediaFilePath("./", FOLDER)).toBeNull()
  })
})

describe("attachTargets", () => {
  it("offers every media field of the flow input and replaces the ones the case already fills", () => {
    const inputs = { subject: "Lamp", photo: { $media: "image/jpeg", file: "photo_01.jpg" }, invoice: null }

    expect(attachTargets(inputs, INPUT_SCHEMA)).toEqual([
      { field: "photo", location: "inputs.photo", accept: "image/*", filled: true },
      { field: "invoice", location: "inputs.invoice", accept: undefined, filled: false },
    ])
  })

  it("keeps media the schema does not name, with the family of its own type", () => {
    const inputs = {
      clips: [{ $media: "video/mp4", blob_id: "sha256-clip", size_bytes: 10, name: "clip.mp4" }],
      voice: { $media: "audio/wav", file: "@root/samples/voice.wav" },
    }

    expect(attachTargets(inputs, null)).toEqual([
      { field: "clips[0]", location: "inputs.clips[0]", accept: "video/*", filled: true },
      { field: "voice", location: "inputs.voice", accept: "audio/*", filled: true },
    ])
  })

  it("offers nothing for an input that is not a record", () => {
    expect(attachTargets("text input", INPUT_SCHEMA)).toEqual([])
  })
})
