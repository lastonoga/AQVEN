import { createFileRoute } from "@tanstack/react-router"
import { SETUP_STEPS, type SetupStep } from "@/domain"
import { OnboardingScreen } from "@/features/setup"
import { parseEnum } from "@/lib/search"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type SetupSearch = { readonly step?: SetupStep }

const parseStep = parseEnum(SETUP_STEPS)

const parseSetupSearch = (raw: RawSearch): SetupSearch => optional("step", parseStep(raw["step"]))

const validateSetupSearch = searchValidator(parseSetupSearch)

export const Route = createFileRoute("/setup")({
  validateSearch: validateSetupSearch,
  loaderDeps: ({ search: { step } }) => ({ step }),
  loader: async ({ context: { api }, deps }) => {
    const step = deps.step ?? SETUP_STEPS[0]
    const [project, flows] = await Promise.all([
      api.project.info(),
      api.project.flows(),
    ])
    const providers = step === "providers" ? await api.settings.providers() : []
    return { project, providers, flows, step }
  },
  component: OnboardingScreen,
})
