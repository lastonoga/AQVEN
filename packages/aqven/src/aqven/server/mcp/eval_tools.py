from dataclasses import dataclass

from aqven.evals import EvalRunId, EvalRunRecord
from aqven.evals.gate import GateReport
from aqven.runtime.address import RequestModel
from aqven.server.mcp.catalog import Operation, ToolHints, ToolRegistration
from aqven.server.views.dataset_batches import DatasetBatchRecord, DatasetBatchStartRequest
from aqven.server.views.evals import EvalRunRequest
from aqven.server.views.services import StudioServices


class EvalRunLookup(RequestModel):
    eval_run_id: EvalRunId


class DatasetBatchLookup(RequestModel):
    batch_id: str


@dataclass(frozen=True, slots=True)
class EvalTools:
    services: StudioServices

    async def start_batch(self, request: DatasetBatchStartRequest) -> DatasetBatchRecord:
        return await self.services.batch_jobs().start(request)

    async def get_batch(self, request: DatasetBatchLookup) -> DatasetBatchRecord:
        return await self.services.batch_jobs().get(request.batch_id)

    async def start_eval(self, request: EvalRunRequest) -> EvalRunRecord:
        return await self.services.eval_jobs().start(request)

    async def get_eval(self, request: EvalRunLookup) -> EvalRunRecord:
        return await self.services.eval_jobs().run(request.eval_run_id)

    async def gate(self, request: EvalRunLookup) -> GateReport:
        return await self.services.eval_jobs().gate(request.eval_run_id)

    def operations(self) -> tuple[ToolRegistration, ...]:
        return (
            Operation(
                name="dataset_batch_start",
                description=(
                    "Runs the named cases of a flow dataset and returns the batch at once, without waiting. "
                    "selected_nodes, start_node and end_node scope the run the same way run_start does. "
                    "Then call dataset_batch_get for progress."
                ),
                input_model=DatasetBatchStartRequest,
                output_model=DatasetBatchRecord,
                surface="rest_and_mcp",
                hints=ToolHints(title="Start dataset batch", read_only=False, open_world=True),
                use_case=self.start_batch,
            ),
            Operation(
                name="dataset_batch_get",
                description="Progress of a dataset batch: status, counts and the run of every case.",
                input_model=DatasetBatchLookup,
                output_model=DatasetBatchRecord,
                surface="rest_and_mcp",
                hints=ToolHints(title="Dataset batch", read_only=True, open_world=True),
                use_case=self.get_batch,
            ),
            Operation(
                name="eval_run_start",
                description=(
                    "Runs an eval over its dataset and returns the record at once, without waiting. "
                    "baseline_run_id compares against an earlier run and fills the gate report; "
                    "repeats runs every case several times. Then call eval_run_get."
                ),
                input_model=EvalRunRequest,
                output_model=EvalRunRecord,
                surface="rest_and_mcp",
                hints=ToolHints(title="Start eval run", read_only=False, open_world=True),
                use_case=self.start_eval,
            ),
            Operation(
                name="eval_run_get",
                description="Eval run status, scores per evaluator and the gate report when a baseline was given.",
                input_model=EvalRunLookup,
                output_model=EvalRunRecord,
                surface="rest_and_mcp",
                hints=ToolHints(title="Eval run", read_only=True, open_world=True),
                use_case=self.get_eval,
            ),
            Operation(
                name="eval_gate",
                description=(
                    "Gate report of an eval run against its baseline: which metrics moved, by how much and "
                    "whether the gate passes. Fails when the run had no baseline."
                ),
                input_model=EvalRunLookup,
                output_model=GateReport,
                surface="rest_and_mcp",
                hints=ToolHints(title="Eval gate", read_only=True, open_world=True),
                use_case=self.gate,
            ),
        )
