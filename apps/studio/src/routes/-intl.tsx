import type { ReactNode } from "react"
import { IntlProvider } from "use-intl"
import type { Locale } from "@/domain"
import { formats } from "@/i18n/formats"
import { messages } from "@/i18n/messages"

export type StudioIntlProps = { readonly locale: Locale; readonly now: Date; readonly children: ReactNode }

export function StudioIntl({ locale, now, children }: StudioIntlProps) {
  return (
    <IntlProvider locale={locale} messages={messages[locale]} formats={formats} now={now} timeZone="UTC">
      {children}
    </IntlProvider>
  )
}
