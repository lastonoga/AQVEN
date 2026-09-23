import { createFileRoute, redirect } from "@tanstack/react-router"
import { ROUTE_PATH } from "@/lib/routes"

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: ROUTE_PATH.flows })
  },
})
