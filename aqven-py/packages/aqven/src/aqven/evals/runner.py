from pathlib import Path
from typing import Final

from aqven.evals.gate import GateReport
from aqven.runtime import Project

EVALS_UNAVAILABLE_MESSAGE: Final = "eval runs and prompt optimization are not implemented"


class EvalsUnavailable(NotImplementedError):
    def __init__(self, eval_id: str) -> None:
        super().__init__(f"{EVALS_UNAVAILABLE_MESSAGE}: {eval_id}")
        self.eval_id = eval_id


async def run_eval(project: Project, eval_id: str) -> GateReport:
    raise EvalsUnavailable(eval_id)


async def run_optimization(project: Project, eval_id: str) -> Path:
    raise EvalsUnavailable(eval_id)
