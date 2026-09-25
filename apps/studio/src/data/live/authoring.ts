import type { AuthoringOptions, CaseCount, CaseSelectionDraft, ContentHash, CreatedExperiment, ExperimentCreate, ExperimentId, FilePath, FlowId, WrittenFile } from "@/domain"
import { api, unwrap } from "@/api/client"
import * as ids from "@/data/ids"
import { authoringOptionsOf, caseCountOf, casesBody, createdExperimentOf, specBody, writtenFileOf } from "./authoring-adapter"

export type AuthoringSource = {
  readonly options: (flow: FlowId | null) => Promise<AuthoringOptions>
  readonly count: (selection: CaseSelectionDraft) => Promise<CaseCount>
  readonly fileHash: (path: FilePath) => Promise<ContentHash>
  readonly saveCases: (experiment: ExperimentId, selection: CaseSelectionDraft, fileHash: ContentHash) => Promise<WrittenFile>
  readonly create: (draft: ExperimentCreate) => Promise<CreatedExperiment>
}

export const authoring: AuthoringSource = {
  options: async (flow) => authoringOptionsOf(unwrap(await api.GET("/api/research/authoring", { params: { query: { flow } } }))),
  count: async (selection) =>
    caseCountOf(unwrap(await api.POST("/api/research/authoring/count", { body: { dataset_id: selection.dataset, tags: { ...selection.tags } } }))),
  fileHash: async (path) => ids.contentHash(unwrap(await api.GET("/api/files/{path}", { params: { path: { path } } })).file_hash),
  saveCases: async (experiment, selection, fileHash) =>
    writtenFileOf(
      unwrap(
        await api.PUT("/api/experiments/{experiment_id}/cases", {
          params: { path: { experiment_id: experiment } },
          body: { cases: casesBody(selection), expects: { file_hash: fileHash }, client_op_id: ids.writeOpId() },
        }),
      ),
    ),
  create: async (draft) =>
    createdExperimentOf(
      unwrap(
        await api.POST("/api/experiments", {
          body: { experiment_id: draft.experiment, spec: specBody(draft.spec), prompts: { ...draft.prompts }, client_op_id: ids.writeOpId() },
        }),
      ),
    ),
}
