import type { ApiRunSnapshot, ApiValueRef, BlobId } from "@/domain"
import * as ids from "@/data/ids"
import type { BlobText } from "@/features/call-sheet"
import { isBinaryMedia } from "@/features/trace"

export type BlobReader = { readonly read: (blobId: BlobId) => Promise<string> }

type BlobRef = Extract<ApiValueRef, { kind: "blob" }>

const readableBlob = (ref: ApiValueRef | null): ref is BlobRef => ref?.kind === "blob" && !isBinaryMedia(ref)

const blobIdsOf = (refs: readonly (ApiValueRef | null)[]): readonly BlobId[] =>
  [...new Set(refs.filter(readableBlob).map((ref) => ids.blobId(ref.blob_id)))]

export const snapshotRefs = (snapshot: ApiRunSnapshot | null): readonly (ApiValueRef | null)[] => {
  if (snapshot === null) return []
  return [
    snapshot.input_ref,
    snapshot.output_ref,
    ...snapshot.executions.flatMap((execution) => [execution.input_ref, execution.output_ref]),
  ]
}

export const readRunBlobs = async (blob: BlobReader, refs: readonly (ApiValueRef | null)[], known: readonly BlobText[] = []): Promise<readonly BlobText[]> => {
  const loaded = new Set(known.map((item) => item.blobId))
  const wanted = blobIdsOf(refs).filter((blobId) => !loaded.has(blobId))
  const results = await Promise.allSettled(wanted.map(async (blobId) => ({ blobId, text: await blob.read(blobId) })))
  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
}
