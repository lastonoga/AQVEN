import { createTranslator } from "use-intl"
import type { DatasetRow, TestDetail } from "@/domain"
import { rowId } from "@/data/ids"
import { formats } from "@/i18n/formats"
import { messages } from "@/i18n/messages"
import { WORKFLOWS, workflowKey } from "@/mocks/data/keys"
import { testDetails } from "@/mocks/data/test-detail"
import type { Translator } from "@/i18n/translator"

export const testDetailT: Translator<"testDetail"> = createTranslator({ locale: "en", messages: messages.en, formats, namespace: "testDetail" })

export const pitchTestDetail = (testId: string): TestDetail => {
  const detail = testDetails[workflowKey(WORKFLOWS.pitchPipeline, testId)]
  if (detail === undefined) throw new Error(`No test detail for ${testId}`)
  return detail
}

export const datasetRow = (id: string, ordinal: number, verdict: DatasetRow["verdict"]): DatasetRow => ({
  id: rowId(id),
  ordinal,
  values: {},
  assertionCount: 3,
  verdict,
  context: [],
})
