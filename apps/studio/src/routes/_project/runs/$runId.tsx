import { createFileRoute, redirect } from "@tanstack/react-router"
import * as ids from "@/data/ids"
import { listOfMode, listSearch, readRunBlobs, RunScreen, snapshotRefs } from "@/features/runs"
import { ROUTE_PATH } from "@/lib/routes"
import { orNotFound } from "@/routes/-api-error"
import { isProjectFlowRun, loadExperimentFlow, loadExpected } from "@/routes/-run-load"
import { addressOf, parseRunAddressSearch } from "@/routes/-run-search"
import { searchValidator } from "@/routes/-search"

const validateRunSearch = searchValidator(parseRunAddressSearch)

export const Route = createFileRoute("/_project/runs/$runId")({
  params: {
    parse: ({ runId }) => ({ runId: ids.runId(runId) }),
    stringify: ({ runId }) => ({ runId }),
  },
  validateSearch: validateRunSearch,
  loaderDeps: ({ search }) => ({ address: addressOf(search) }),
  loader: async ({ context: { api }, params, deps }) => {
    const snapshot = await orNotFound(api.run.snapshot(params.runId))
    if (await isProjectFlowRun(api, snapshot)) {
      throw redirect({ to: ROUTE_PATH.runs, params: { flowId: ids.flowId(snapshot.flow_id) }, search: { run: params.runId, ...listSearch(listOfMode(snapshot.mode)) } })
    }
    const [events, execution, experimentFlow] = await Promise.all([
      api.run.events(params.runId),
      deps.address === null ? null : api.run.execution(params.runId, deps.address, "full"),
      loadExperimentFlow(api, snapshot),
    ])
    const [blobs, expected] = await Promise.all([
      readRunBlobs(api.blob, [...snapshotRefs(snapshot), execution?.input_ref ?? null, execution?.output_ref ?? null, execution?.human?.answer_ref ?? null]),
      loadExpected(api, snapshot),
    ])
    return { snapshot, events, execution, blobs, expected, experimentFlow }
  },
  component: RunScreen,
})
