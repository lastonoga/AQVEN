from pathlib import Path
from typing import Final

import pytest
from write_helpers import AGENT, patch, planned_patch, read

from aqven.write import WriteError, WriteService

CRITIC: Final = "agents/critic.yaml"
WRITER: Final = "agents/writer/writer.yaml"
REDO_NODE: Final = "flows/intake/nodes/review/redo.node.yaml"
REPLY_NODE: Final = "flows/intake/nodes/reply/reply.node.yaml"


def rename(agent_id: str, to: str) -> dict[str, object]:
    return {"op": "rename_agent", "agent_id": agent_id, "to": to}


def delete(agent_id: str) -> dict[str, object]:
    return {"op": "delete_agent", "agent_id": agent_id}


def apply(service: WriteService, ops: list[dict[str, object]]) -> tuple[str, ...]:
    request = planned_patch(service, "intake", ops, AGENT)
    return service.patch_flow(request, AGENT).changed_paths


def refused(service: WriteService, ops: list[dict[str, object]]) -> WriteError:
    request = patch("intake", ops, ("aqven.yaml",), service.root, dry_run=True)
    with pytest.raises(WriteError) as raised:
        service.patch_flow(request, AGENT)
    return raised.value


def test_rename_agent_moves_the_file_and_every_reference(service: WriteService, shop: Path) -> None:
    changed = apply(service, [rename("critic", "reviewer")])

    assert not (shop / CRITIC).exists()
    assert (shop / "agents/reviewer.yaml").is_file()
    assert 'agent: "reviewer"' in read(shop, REDO_NODE)
    assert 'agent: "reviewer"' in read(shop, WRITER)
    assert set(changed) >= {CRITIC, "agents/reviewer.yaml", REDO_NODE, WRITER, "aqven.yaml"}


def test_rename_agent_journals_the_rename(service: WriteService, shop: Path) -> None:
    request = planned_patch(service, "intake", [rename("critic", "reviewer")], AGENT)

    result = service.patch_flow(request, AGENT)

    entry = result.renames[0]
    assert (entry.kind, entry.from_, entry.to) == ("agent", "critic", "reviewer")
    assert "critic" in read(shop, "aqven.yaml")


def test_rename_agent_renames_its_folder_and_companions(service: WriteService, shop: Path) -> None:
    apply(service, [rename("writer", "author")])

    assert not (shop / "agents/writer").exists()
    assert (shop / "agents/author/author.yaml").is_file()
    assert (shop / "agents/author/author.instructions.md").is_file()
    assert (shop / "agents/author/lookup.inference.yaml").is_file()
    assert 'agent: "author"' in read(shop, REPLY_NODE)


def test_rename_agent_keeps_a_taken_name(service: WriteService) -> None:
    error = refused(service, [rename("critic", "writer")])

    assert error.code == "FILE_EXISTS"
    assert error.candidates == ({"agent_id": "writer_2"}, {"agent_id": "writer_copy"}, {"agent_id": "writer_new"})


def test_rename_agent_reports_an_unknown_agent(service: WriteService) -> None:
    assert refused(service, [rename("ghost", "reviewer")]).code == "NOT_FOUND"


def test_delete_agent_refuses_a_referenced_agent(service: WriteService) -> None:
    error = refused(service, [delete("critic")])

    assert error.code == "REQUEST_INVALID"
    assert error.candidates == ({"path": WRITER}, {"path": REDO_NODE})


def test_delete_agent_removes_an_unused_agent(service: WriteService, shop: Path) -> None:
    (shop / WRITER).write_text(read(shop, WRITER).partition("subagents:")[0], encoding="utf-8")

    apply(service, [{"op": "set", "path": "nodes/redo/agent", "value": "writer"}, delete("critic")])

    assert not (shop / CRITIC).exists()
    assert 'agent: "writer"' in read(shop, REDO_NODE)


def test_delete_agent_removes_the_whole_agent_folder(service: WriteService, shop: Path) -> None:
    changed = apply(service, [{"op": "set", "path": "nodes/reply/agent", "value": "critic"}, delete("writer")])

    assert not (shop / "agents/writer").exists()
    assert set(changed) >= {WRITER, "agents/writer/writer.instructions.md", "agents/writer/lookup.inference.yaml"}
