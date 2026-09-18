import { notFound } from "@tanstack/react-router"
import { isNotFound } from "@/api/client"

export const orNotFound = async <T>(load: Promise<T>): Promise<T> =>
  load.catch((error: unknown) => {
    if (isNotFound(error)) throw notFound()
    throw error
  })
