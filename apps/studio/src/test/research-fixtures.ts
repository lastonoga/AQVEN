import { researchStore } from "@/data/live/research"

export { APPROVAL_WAIT_RUN, FORM_WAIT_RUN, RESEARCH_FIXTURE_SERIES } from "@/data/fixtures/research"

export const resetResearchFixtures = (): void => {
  researchStore.reset()
}
