import { authoringOf } from "./factor"
import { furtherVariants, type NewExperimentForm } from "./form-state"
import type { FormProblem } from "./problems"
import { promptName, specOf, specPath } from "./spec"

const PLACEHOLDER_ID = "<experiment_id>"
const JSON_INDENT = 2

const idOf = (form: NewExperimentForm): string => (form.id.length === 0 ? PLACEHOLDER_ID : form.id)

const promptLines = (form: NewExperimentForm): readonly string[] => {
  if (authoringOf(form.factor) !== "text") return []
  return furtherVariants(form)
    .filter((variant) => variant.prompt.trim().length > 0)
    .flatMap((variant) => [`--- experiments/${idOf(form)}/prompts/${promptName(variant)}.md`, variant.prompt])
}

const alternativeLines = (form: NewExperimentForm): readonly string[] => {
  if (authoringOf(form.factor) !== "chat") return []
  return [
    `The factor is use on ${form.nodes.join(", ") || "nodes still to pick"}: write each alternative node under experiments/${idOf(form)}/nodes/<alternative>/ as ordinary node files and set variants[].nodes to the alternative ids.`,
  ]
}

const problemLines = (problems: readonly FormProblem[], describe: (problem: FormProblem) => string): readonly string[] => {
  if (problems.length === 0) return []
  return ["Still open in the form:", ...problems.map((problem) => `- ${describe(problem)}`)]
}

export const draftPrompt = (form: NewExperimentForm, problems: readonly FormProblem[], describe: (problem: FormProblem) => string): string =>
  [
    "Draft a new experiment from the form I started in Research > New experiment.",
    `Write ${specPath(idOf(form))} per ADR-0056 (one factor: varies.what and varies.nodes; each variant sets only values of that factor), then run aqven check and fix what it reports.`,
    "Keep what I already chose unless aqven check rejects it, fill in what is missing and tell me what you changed.",
    ...alternativeLines(form),
    ...problemLines(problems, describe),
    "The experiment as the form has it now (JSON of experiment.yaml):",
    JSON.stringify(specOf(form), null, JSON_INDENT),
    ...promptLines(form),
  ].join("\n")
