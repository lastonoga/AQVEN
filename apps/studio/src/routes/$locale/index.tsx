import { createFileRoute } from "@tanstack/react-router"
import { redirectToLanding } from "@/routes/-landing"

export const Route = createFileRoute("/$locale/")({
  beforeLoad: ({ context, params }) => redirectToLanding(context, params.locale),
})
