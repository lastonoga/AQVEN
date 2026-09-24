from decimal import Decimal
from pathlib import Path
from typing import Final

from pydantic import JsonValue

from aqven.client.ids import new_client_op_id
from aqven.loader import PROJECT_FILE, file_hash
from aqven.runtime.address import JsonObject, RequestModel, ResourceModel
from aqven.series.model import CapSource
from aqven.series.settings import DEFAULT_SPEND_CAP, InvalidSpendCap, research_of, resolved_cap
from aqven.server.errors import ApiFailure, not_found
from aqven.server.resources import FileRef
from aqven.server.views.files import file_ref
from aqven.server.workspace import WorkspaceState
from aqven.spec import ResearchSettings
from aqven.write import WriteService
from aqven.write.model import ExpectedFile, FilesWriteRequest, WriteActor
from aqven.write.paths import FileHash
from aqven.write.round_trip import ProjectYamlInvalid, with_research

RESEARCH_INTENT: Final = "research spend cap in aqven.yaml"
PROJECT_ENCODING: Final = "utf-8"


class ResearchBudgetView(ResourceModel):
    spend_cap_usd: Decimal | None
    source: CapSource
    project_usd: Decimal | None
    default_usd: Decimal
    override_problem: str | None
    project_file: FileRef | None


class ResearchBudgetWrite(RequestModel):
    research: ResearchSettings
    file_hash: FileHash


def budget_view(state: WorkspaceState, override: JsonValue) -> ResearchBudgetView:
    research = research_of(state.report.project)
    try:
        cap = resolved_cap(override, research)
    except InvalidSpendCap as error:
        return shown_budget(state, research, None, "override", str(error))
    return shown_budget(state, research, cap.usd, cap.source, None)


def shown_budget(
    state: WorkspaceState,
    research: ResearchSettings | None,
    usd: Decimal | None,
    source: CapSource,
    problem: str | None,
) -> ResearchBudgetView:
    return ResearchBudgetView(
        spend_cap_usd=usd,
        source=source,
        project_usd=None if research is None else research.spend_cap_usd,
        default_usd=DEFAULT_SPEND_CAP,
        override_problem=problem,
        project_file=file_ref(state, PROJECT_FILE),
    )


def edited_project(root: Path, request: ResearchBudgetWrite) -> str:
    location = root / PROJECT_FILE
    if not location.is_file():
        raise not_found(f"{PROJECT_FILE} is not in the project")
    data = location.read_bytes()
    current = file_hash(data)
    if current != request.file_hash:
        conflict: JsonObject = {"path": PROJECT_FILE, "your_hash": request.file_hash, "current_hash": current}
        raise ApiFailure("STALE_FILE", f"{PROJECT_FILE} changed after it was read", conflict=conflict)
    try:
        return with_research(data.decode(PROJECT_ENCODING), request.research)
    except (ProjectYamlInvalid, UnicodeDecodeError) as error:
        raise ApiFailure("REQUEST_INVALID", str(error)) from error


def write_research(writer: WriteService, request: ResearchBudgetWrite, actor: WriteActor) -> None:
    edit = FilesWriteRequest(
        expects=[ExpectedFile(path=PROJECT_FILE, file_hash=request.file_hash)],
        files={PROJECT_FILE: edited_project(writer.root, request)},
        client_op_id=new_client_op_id(),
        intent=RESEARCH_INTENT,
    )
    writer.write_files(edit, actor)
