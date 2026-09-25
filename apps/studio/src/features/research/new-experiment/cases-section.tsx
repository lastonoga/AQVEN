import { useTranslations } from "use-intl"
import { Text } from "@/components/studio"
import { ResearchSection } from "../layout"
import { CasesPicker, datasetsForSubject } from "../authoring"
import { Panel, Problems } from "./form-field"
import { visibleAt, type FormView } from "./view"

function CasesBody({ view }: { readonly view: FormView }) {
  const t = useTranslations("research.newExperiment.cases")
  const { form, options, dispatch, disabled } = view
  if (form.flow === null) {
    return (
      <Text as="p" role="hint" tone="neutral">
        {t("flowFirst")}
      </Text>
    )
  }
  return (
    <CasesPicker
      datasets={datasetsForSubject(options.datasets, { flow: form.flow, local: false })}
      value={form.cases}
      casesFlow={form.flow}
      disabled={disabled}
      onChange={(cases) => {
        dispatch({ type: "chooseCases", cases })
      }}
    />
  )
}

export function CasesSection({ view }: { readonly view: FormView }) {
  const t = useTranslations("research.newExperiment.cases")
  return (
    <ResearchSection title={t("title")} description={t("description")}>
      <Panel>
        <CasesBody view={view} />
        <Problems problems={visibleAt(view, "cases")} />
      </Panel>
    </ResearchSection>
  )
}
