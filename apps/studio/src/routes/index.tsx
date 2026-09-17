import { createFileRoute } from "@tanstack/react-router"
import { DEFAULT_LOCALE } from "@/routes/-defaults"
import { redirectToLanding } from "@/routes/-landing"

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => redirectToLanding(context, DEFAULT_LOCALE),
})
