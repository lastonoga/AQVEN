import { createFileRoute } from "@tanstack/react-router"
import { redirectToLanding } from "@/routes/-landing"

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => redirectToLanding(context),
})
