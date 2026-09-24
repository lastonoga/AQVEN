import asyncio
import json
import os
from dataclasses import dataclass, field
from pathlib import Path

import pytest
from dbos._dbos_config import translate_dbos_config_to_config_file
from engine_core_plan import relay_project
from pydantic import JsonValue

from aqven.engine import AddressContext, FileBlobStore, PlanMissing, PlanRegistry, PlanStore, RefUnresolved
from aqven.engine.addressing import address_key, child_workflow_id
from aqven.engine.config import EnginePaths, dbos_config, executor_threads
from aqven.engine.executors import idempotency_key, matching_case
from aqven.engine.interpreter import visible_node
from aqven.engine.protocol import EXECUTOR_PROTOCOL_VERSION
from aqven.engine.reader import decode_event
from aqven.engine.values import RefSources, evaluate_ref
from aqven.ir import CompiledProject, CompiledSwitchNode, HashDomain, IrHash, hash_of, project_hash
from aqven.ports.execution import ChildEntry, ScopeFrame
from aqven.runtime import node_address
from aqven.runtime.address import RunId
from aqven.spec import FlowId, NodeId


def sources(frame: ScopeFrame) -> RefSources:
    outputs: dict[str, JsonValue] = {"normalize": {"text": "hi", "tags": [{"name": "a"}, {"name": "b"}]}}

    def read(name: str) -> JsonValue:
        if name not in outputs:
            raise RefUnresolved(f"${name}.out", "no")
        return outputs[name]

    return RefSources(
        flow_input={"text": "x", "items": [1, 2]},
        run_context={"locale": "ru-RU"},
        frame=frame,
        node_output=read,
    )


def test_refs_walk_fields_lists_and_frames() -> None:
    frame = ScopeFrame(item={"id": 7}, index=0, branch={"left": {"text": "L"}})
    assert evaluate_ref("$input.items[1]", sources(frame)) == 2
    assert evaluate_ref("$normalize.out.tags[*].name", sources(frame)) == ["a", "b"]
    assert evaluate_ref("$item.id", sources(frame)) == 7
    assert evaluate_ref("$index", sources(frame)) == 0
    assert evaluate_ref("$branch.left.text", sources(frame)) == "L"
    assert evaluate_ref("$run.context.locale", sources(frame)) == "ru-RU"
    with pytest.raises(RefUnresolved):
        evaluate_ref("$case", sources(frame))
    with pytest.raises(RefUnresolved):
        evaluate_ref("$missing.out", sources(frame))


def test_addresses_nest_and_encode_canonically() -> None:
    entered = AddressContext(branch_key="warm").enter(ChildEntry(iteration=1))
    address = entered.at("review__recheck__redo")
    assert address == node_address("review__recheck__redo", branch_key="warm", iteration=1)
    assert address_key(node_address("a", iteration=0)) != address_key(node_address("a"))
    assert child_workflow_id("run", node_address("a")).startswith("run::{")


def test_switch_takes_first_matching_case_and_scopes_see_inner_nodes() -> None:
    flow = relay_project().flow(FlowId("relay"))
    route = flow.node(NodeId("route"))
    assert isinstance(route, CompiledSwitchNode)
    assert matching_case(route, "high") == "high"
    assert matching_case(route, {"kind": "low", "note": "high"}) == "high"
    assert matching_case(route, "unknown") is None
    assert visible_node(flow, NodeId("route"), "loud") == "route__loud"
    assert visible_node(flow, NodeId("stamp"), "loud") is None
    assert visible_node(flow, NodeId("route__loud"), "normalize") == "normalize"


def test_plans_survive_restart_by_hash(tmp_path: Path) -> None:
    plan = relay_project()
    ir_hash = PlanRegistry(PlanStore(tmp_path)).register(plan)
    reopened = PlanRegistry(PlanStore(tmp_path))
    assert reopened.plan(ir_hash) == plan
    with pytest.raises(PlanMissing):
        reopened.plan(IrHash("sha256-" + "0" * 64))


@dataclass(frozen=True, slots=True)
class CountingStore(PlanStore):
    loads: list[IrHash] = field(default_factory=list[IrHash])

    def load(self, ir_hash: IrHash) -> CompiledProject | None:
        self.loads.append(ir_hash)
        return PlanStore.load(self, ir_hash)


def saved_under_older_ir(directory: Path, plan: CompiledProject) -> IrHash:
    document = plan.model_dump(mode="json", by_alias=True)
    assert document.pop("limits") is None
    ir_hash = hash_of(HashDomain.PROJECT, document)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"{ir_hash}.json").write_text(json.dumps(document), encoding="utf-8")
    return ir_hash


def test_a_plan_saved_under_an_older_ir_loads_by_the_hash_it_was_saved_under(tmp_path: Path) -> None:
    plan = relay_project()
    ir_hash = saved_under_older_ir(tmp_path, plan)
    assert project_hash(plan) != ir_hash
    assert PlanRegistry(PlanStore(tmp_path)).plan(ir_hash) == plan


def test_a_plan_file_that_does_not_match_its_hash_is_rejected(tmp_path: Path) -> None:
    plan = relay_project()
    ir_hash = PlanStore(tmp_path).save(plan)
    renamed = plan.model_copy(update={"package": "renamed"})
    (tmp_path / f"{ir_hash}.json").write_bytes(renamed.model_dump_json(by_alias=True).encode())
    assert PlanStore(tmp_path).load(ir_hash) is None


def test_plan_misses_are_cached_until_the_plan_file_changes(tmp_path: Path) -> None:
    plan = relay_project()
    ir_hash = PlanStore(tmp_path).save(plan)
    target = tmp_path / f"{ir_hash}.json"
    target.write_bytes(b"{}")
    store = CountingStore(tmp_path)
    registry = PlanRegistry(store)
    missing = IrHash("sha256-" + "1" * 64)
    assert (registry.find(ir_hash), registry.find(ir_hash), registry.find(missing), registry.find(missing)) == (
        None,
        None,
        None,
        None,
    )
    assert store.loads == [ir_hash, missing]
    target.write_bytes(plan.model_dump_json(by_alias=True).encode())
    assert registry.find(ir_hash) == plan
    assert registry.find(ir_hash) == plan
    assert store.loads == [ir_hash, missing, ir_hash]


def test_blobs_are_content_addressed(tmp_path: Path) -> None:
    store = FileBlobStore(tmp_path)
    media = asyncio.run(store.put(b"payload", "text/plain", "a.txt"))
    again = asyncio.run(store.put(b"payload", "text/plain", "b.txt"))
    assert media.blob_id == again.blob_id and asyncio.run(store.get(media)) == b"payload"
    assert sorted(path.suffix for path in tmp_path.iterdir()) == [".bin", ".json"]


def test_dbos_config_targets_project_sqlite(tmp_path: Path) -> None:
    config = dbos_config(EnginePaths(tmp_path))
    assert config.get("system_database_url") == f"sqlite:///{(tmp_path / '.aqven' / 'dbos.sqlite').resolve()}"
    assert (config.get("use_listen_notify"), config.get("application_version")) == (False, EXECUTOR_PROTOCOL_VERSION)


def test_dbos_executor_threads_are_bounded() -> None:
    assert [executor_threads(cpus) for cpus in (None, 1, 4, 6, 8, 64)] == [16, 16, 16, 24, 32, 32]


def test_dbos_config_caps_the_executor_pool_dbos_builds(tmp_path: Path) -> None:
    config = dbos_config(EnginePaths(tmp_path))
    expected = executor_threads(os.process_cpu_count())
    assert config.get("max_executor_threads") == expected
    runtime = translate_dbos_config_to_config_file(config).get("runtimeConfig", {})
    assert runtime.get("max_executor_threads") == expected


def test_idempotency_key_depends_on_run_address_and_attempt() -> None:
    first = idempotency_key(RunId("r1"), node_address("stamp"), 1, {})
    assert first == idempotency_key(RunId("r1"), node_address("stamp"), 1, {})
    assert first != idempotency_key(RunId("r2"), node_address("stamp"), 1, {})
    assert first != idempotency_key(RunId("r1"), node_address("stamp"), 2, {})


def test_stored_events_take_seq_from_stream_offset_and_run_from_the_stream() -> None:
    payload = {
        "type": "run_resumed",
        "seq": 99,
        "at": "2026-09-17T10:00:00Z",
        "run_id": "r1",
        "address": {"node_id": "a", "branch_key": None, "iteration": None, "item_index": None},
    }
    event = decode_event(payload, 4, RunId("fork-1"))
    assert event is not None and (event.seq, event.run_id) == (5, "fork-1")
    assert decode_event("garbage", 0, RunId("fork-1")) is None
