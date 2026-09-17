from pathlib import Path
from typing import Final
from urllib.parse import urlencode

from pydantic import Field, ValidationError

from aqven.app.access import ACCESS_TOKEN_PARAMETER
from aqven.app.host_os import write_private_text
from aqven.app.locations import ProjectState
from aqven.runtime.address import ResourceModel

MCP_PATH: Final = "/mcp/"


def http_base(host: str, port: int) -> str:
    bracketed = f"[{host}]" if ":" in host else host
    return f"http://{bracketed}:{port}"


class ServerRecord(ResourceModel):
    host: str
    port: int = Field(ge=1, le=65535)
    token: str = Field(repr=False)
    pid: int = Field(ge=1)
    url: str
    mcp_url: str
    project_root: str

    def browser_url(self, origin: str | None = None) -> str:
        base = (origin or self.url).rstrip("/")
        return f"{base}/?{urlencode({ACCESS_TOKEN_PARAMETER: self.token})}"

    def authorization(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}


def server_record(*, host: str, port: int, token: str, pid: int, root: Path) -> ServerRecord:
    base = http_base(host, port)
    return ServerRecord(
        host=host,
        port=port,
        token=token,
        pid=pid,
        url=base,
        mcp_url=f"{base}{MCP_PATH}",
        project_root=str(root),
    )


def write_server_record(state: ProjectState, record: ServerRecord) -> Path:
    return write_private_text(state.server_record, record.model_dump_json())


def read_server_record(state: ProjectState) -> ServerRecord | None:
    try:
        return ServerRecord.model_validate_json(state.server_record.read_bytes())
    except OSError, ValidationError:
        return None


def remove_server_record(state: ProjectState, pid: int) -> bool:
    current = read_server_record(state)
    if current is None or current.pid != pid:
        return False
    state.server_record.unlink(missing_ok=True)
    return True
