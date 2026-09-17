import { createFileRoute } from "@tanstack/react-router"
import { SETUP_STEPS, type SetupStep } from "@/domain"
import { OnboardingScreen } from "@/features/setup"
import { parseEnum } from "@/lib/search"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type SetupSearch = { readonly step?: SetupStep }

const parseStep = parseEnum(SETUP_STEPS)

const parseSetupSearch = (raw: RawSearch): SetupSearch => optional("step", parseStep(raw["step"]))

const validateSetupSearch = searchValidator(parseSetupSearch)

export const Route = createFileRoute("/$locale/setup")({
  validateSearch: validateSetupSearch,
  loaderDeps: ({ search: { step } }) => ({ step }),
  loader: async ({ context: { sources }, deps }) => {
    const [overview, templates] = await Promise.all([sources.setup.overview(), sources.setup.templates()])
    return { overview, templates, step: deps.step ?? SETUP_STEPS[0] }
  },
  component: OnboardingScreen,
})
