from dataclasses import dataclass

from aqven.server.views.dataset_batches import DatasetBatchJobs
from aqven.server.views.evals import EvalJobs


class ServicesUnavailable(RuntimeError):
    def __init__(self, name: str) -> None:
        super().__init__(f"{name} is not available: the server application was not built yet")


@dataclass(slots=True)
class StudioServices:
    evals: EvalJobs | None = None
    batches: DatasetBatchJobs | None = None

    def eval_jobs(self) -> EvalJobs:
        if self.evals is None:
            raise ServicesUnavailable("eval jobs")
        return self.evals

    def batch_jobs(self) -> DatasetBatchJobs:
        if self.batches is None:
            raise ServicesUnavailable("dataset batch jobs")
        return self.batches
