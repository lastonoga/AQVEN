import type { Locale } from "@/domain"
import type { formats } from "./formats"
import type { Messages } from "./messages"

declare module "use-intl" {
  interface AppConfig {
    Locale: Locale
    Messages: Messages
    Formats: typeof formats
  }
}
