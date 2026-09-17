import { createTranslator } from "use-intl"
import type { ReviewDetail, ReviewQueueItem } from "@/domain"
import { formats } from "@/i18n/formats"
import { messages } from "@/i18n/messages"
import { FIXTURE_NOW } from "@/mocks/data/clock"
import { WORKFLOWS, workflowKey } from "@/mocks/data/keys"
import { reviewDetails, reviewQueues } from "@/mocks/data/review"
import type { ReviewCopy } from "./presenters"

export const NOW = new Date(FIXTURE_NOW)

export const copy: ReviewCopy = {
  t: createTranslator({ locale: "en", messages: messages.en, formats, namespace: "review" }),
  common: createTranslator({ locale: "en", messages: messages.en, formats, namespace: "common" }),
}

export const pitchQueue: readonly ReviewQueueItem[] = reviewQueues[workflowKey(WORKFLOWS.pitchPipeline)] ?? []

export const queueItem = (index: number): ReviewQueueItem => {
  const item = pitchQueue[index]
  if (item === undefined) throw new Error(`No queue item at ${String(index)}`)
  return item
}

export const reviewDetail = (item: ReviewQueueItem): ReviewDetail => {
  const detail = reviewDetails[workflowKey(WORKFLOWS.pitchPipeline, item.id)]
  if (detail === undefined) throw new Error(`No detail for ${item.id}`)
  return detail
}
