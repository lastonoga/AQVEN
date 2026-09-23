import { createFileRoute } from "@tanstack/react-router"
import { SETTINGS_SECTIONS, type SettingsSection } from "@/domain"
import { SettingsScreen } from "@/features/setup"
import { parseEnum } from "@/lib/search"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type SettingsSearch = { readonly section?: SettingsSection }

const parseSection = parseEnum(SETTINGS_SECTIONS)

const parseSettingsSearch = (raw: RawSearch): SettingsSearch => optional("section", parseSection(raw["section"]))

const validateSettingsSearch = searchValidator(parseSettingsSearch)

export const Route = createFileRoute("/_project/settings")({
  validateSearch: validateSettingsSearch,
  loaderDeps: ({ search: { section } }) => ({ section }),
  loader: async ({ context: { api }, deps }) => {
    const [project, flows] = await Promise.all([api.project.info(), api.project.flows()])
    return { project, flows, section: deps.section ?? SETTINGS_SECTIONS[0] }
  },
  component: SettingsScreen,
})
