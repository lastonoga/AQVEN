import type { Component, Fn, Id, Type } from "@wf/dsl";

export type FieldPath = string;

export type AgreementLevel = "unanimous" | "majority" | "conflict";

export type ConflictPolicy = "escalate" | "majority" | "drop_field";

export type FieldAgreement = { field: FieldPath; level: AgreementLevel; share: number };

export type Agreement = { level: AgreementLevel; share: number; fields: FieldAgreement[] };

export type Consensus<T> = { value: T; agreement: Agreement };

export type ConsensusExtractorIn<DocT> = {
  doc: DocT;
  n: number;
  criticalFields: FieldPath[];
  threshold: number;
  onConflict: ConflictPolicy;
};

export const consensusExtractor = <T, DocT>(): Component<ConsensusExtractorIn<DocT>, Consensus<T>> => ({
  name: "consensus_extractor",
});

export type IssueSeverity = "error" | "warning";

export type ValidationIssue = { field: FieldPath; severity: IssueSeverity; rule: string; hint: string };

export type ValidationReport = { valid: boolean; issues: ValidationIssue[] };

export const validateFields = <T>(): Fn<{ value: T; rules: FieldPath[] }, ValidationReport> => ({
  name: "validate_fields",
});

export type IdCheckStatus = "ok" | "unknown_ids";

export type NearestId<TId> = { used: TId; candidates: TId[] };

export type IdCheck<TId> = { status: IdCheckStatus; unknown: TId[]; nearest: NearestId<TId>[] };

export const collectIds = <T, TId extends Id<string>>(): Fn<{ value: T; path: FieldPath }, TId[]> => ({
  name: "collect_ids",
});

export const checkIds = <TId extends Id<string>>(): Fn<{ used: TId[]; allowed: TId[] }, IdCheck<TId>> => ({
  name: "check_allowed_ids",
});

export type Citation<TId> = { chunkId: TId; quote: string };

export type Grounded<T, TId> = { value: T; citations: Citation<TId>[] };

export type GroundingDecision = "grounded" | "revise" | "escalate";

export type GroundingVerdict<TId> = {
  why: string;
  score: number;
  decision: GroundingDecision;
  unsupported: Citation<TId>[];
};

export const groundingCheck = <T, TId>(): Component<
  { answer: T; chunks: Grounded<T, TId>["citations"]; threshold: number; modelRole: string },
  GroundingVerdict<TId>
> => ({ name: "grounding_check" });

const ty = <T>(name: string): Type<T> => ({ name });

export const extractTypes = {
  Agreement: ty<Agreement>("Agreement"),
  AgreementLevel: ty<AgreementLevel>("AgreementLevel"),
  ValidationReport: ty<ValidationReport>("ValidationReport"),
  IdCheckStatus: ty<IdCheckStatus>("IdCheckStatus"),
  GroundingDecision: ty<GroundingDecision>("GroundingDecision"),
};
