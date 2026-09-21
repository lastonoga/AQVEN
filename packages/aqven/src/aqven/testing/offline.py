from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Final

import httpx2

from aqven.runtime import (
    BlobStore,
    CassetteConfig,
    CassetteMode,
    McpToolStub,
    ModelProfile,
    NodeOutputOverride,
    ProviderFault,
    ProviderFaultKind,
    RunContext,
    RunOptions,
    node_address,
)
from aqven.testing.human import ScriptedHuman

PROVIDER_ERROR: ProviderFaultKind = "provider_error"
LIVE_VARIABLE: Final = "AQVEN_LIVE"
LIVE_ENABLED: Final = "1"


def offline_options(
    *,
    cassettes: CassetteConfig,
    human: ScriptedHuman | None = None,
    context: RunContext | None = None,
    tool_http: httpx2.AsyncBaseTransport | None = None,
    mcp_stubs: Sequence[McpToolStub] = (),
    blobs: BlobStore | None = None,
    faults: Sequence[ProviderFault] = (),
    models: ModelProfile | None = None,
    outputs: Sequence[NodeOutputOverride] = (),
) -> RunOptions:
    script = ScriptedHuman() if human is None else human
    return RunOptions(
        mode="replay",
        context=context,
        cassettes=cassettes,
        human_answers=script.answers(),
        tool_http=tool_http,
        mcp_stubs=tuple(mcp_stubs),
        blobs=blobs,
        faults=tuple(faults),
        models=models,
        outputs=tuple(outputs),
    )


def provider_fault(
    node_id: str,
    *,
    model: str,
    kind: ProviderFaultKind = PROVIDER_ERROR,
    attempt: int = 1,
    branch_key: str | None = None,
    iteration: int | None = None,
    item_index: int | None = None,
) -> ProviderFault:
    address = node_address(node_id, branch_key=branch_key, iteration=iteration, item_index=item_index)
    return ProviderFault(address=address, model=model, kind=kind, attempt=attempt)


def cassette_mode(environ: Mapping[str, str]) -> CassetteMode:
    return CassetteMode.RECORD_NEW if environ.get(LIVE_VARIABLE) == LIVE_ENABLED else CassetteMode.REPLAY_STRICT


def cassette_directory(test_file: Path) -> Path:
    return test_file.parent / "cassettes" / test_file.stem.removeprefix("test_")


def replay_cassettes(test_file: Path) -> CassetteConfig:
    return CassetteConfig(directory=cassette_directory(test_file), mode=CassetteMode.REPLAY_STRICT)
