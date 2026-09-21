from pathlib import Path
from typing import Final

from pydantic import BaseModel

from aqven.client import new_client_op_id
from aqven.runtime import FlowHandle, HumanWait, Project, ResumeRequest
from lumen.types import CaseOutcome, CaseRequest

SAMPLES_DIR: Final = Path(__file__).resolve().parents[1] / "lumen" / "samples"
FLOW_ID: Final = "support_case"


def read_request(path: Path) -> CaseRequest:
    return CaseRequest.model_validate_json(path.read_bytes())


def case_flow(project: Project) -> FlowHandle[CaseRequest, CaseOutcome]:
    return project.flow_typed(FLOW_ID, CaseRequest, CaseOutcome)


def resume_request(wait: HumanWait, answer: BaseModel) -> ResumeRequest:
    return ResumeRequest(
        address=wait.address,
        attempt=wait.attempt,
        payload=answer.model_dump(mode="json", by_alias=True),
        client_op_id=new_client_op_id(),
    )
