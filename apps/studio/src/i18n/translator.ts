import type { Messages, NamespaceKeys, NestedKeyOf, useTranslations } from "use-intl"

export type TranslationNamespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>

export type Translator<Namespace extends TranslationNamespace = never> = ReturnType<typeof useTranslations<Namespace>>
