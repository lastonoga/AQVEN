import { createFileRoute, Outlet } from "@tanstack/react-router"
import { LOCALES } from "@/domain"
import { parseEnum } from "@/lib/search"
import { StudioIntl } from "@/routes/-intl"

const parseLocale = parseEnum(LOCALES)

export const Route = createFileRoute("/$locale")({
  params: {
    parse: ({ locale }) => {
      const parsed = parseLocale(locale)
      if (parsed === undefined) return false
      return { locale: parsed }
    },
    stringify: ({ locale }) => ({ locale }),
  },
  component: LocaleLayout,
})

function LocaleLayout() {
  const { locale } = Route.useParams()
  const { now } = Route.useRouteContext()
  return (
    <StudioIntl locale={locale} now={now}>
      <Outlet />
    </StudioIntl>
  )
}
