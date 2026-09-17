from pathlib import Path
from typing import Final

import pytest
from write_helpers import AGENT, HUMAN, PassingValidator, current_hash, make_service, patch, planned_patch, read

from aqven.check import check_project
from aqven.diagnostics import DiagnosticCode
from aqven.loader import file_hash
from aqven.write import (
    CollectingSink,
    ExclusiveBegan,
    ExclusiveEnded,
    FilesChanged,
    FlowPatchRequest,
    Transaction,
    TransactionRecovered,
    WriteError,
    WriteService,
    pending_transactions,
)

FLOW: Final = "flows/intake/flow.yaml"
CLEAN: Final = "flows/intake/nodes/clean/clean.node.yaml"
REPLY: Final = "flows/intake/nodes/reply/reply.node.yaml"
REVIEW_FOLDER: Final = "flows/intake/nodes/review"
PROJECT: Final = "aqven.yaml"


def test_set_rewrites_file_canonically_and_reports_version(
    service: WriteService, shop: Path, sink: CollectingSink
) -> None:
    request = patch(
        "intake",
        [
            {"op": "set", "path": "nodes/clean/limits/seconds", "value": 30},
            {"op": "set", "path": "nodes/clean/description", "value": "Squeeze whitespace"},
        ],
        (CLEAN,),
        shop,
    )
    before = current_hash(shop, CLEAN)

    result = service.patch_flow(request, AGENT)

    text = read(shop, CLEAN)
    assert text.startswith(
        'apiVersion: "aqven/v1"\nkind: "Node"\nnode: "code"\ndescription: "Squeeze whitespace"\n'
        'limits:\n  seconds: 30\nrun: "clean"\n'
    )
    assert result.changed_paths == (CLEAN,)
    assert result.version.files[0].file_hash == file_hash((shop / CLEAN).read_bytes())
    assert result.version.client_op_id == request.client_op_id
    assert result.focus is not None and result.focus.node_id == "clean"
    assert result.tree_hash is not None
    notice = sink.notices[-1]
    assert isinstance(notice, FilesChanged)
    assert notice.changes[0].file_hash_before == before
    assert notice.changes[0].change == "modified"
    assert service.self_writes.is_echo(CLEAN, result.version.files[0].file_hash)
    assert pending_transactions(shop) == ()
    assert not (shop / ".aqven" / "lock").exists()


def test_replayed_client_op_id_returns_first_result_without_writing(service: WriteService, shop: Path) -> None:
    request = patch("intake", [{"op": "set", "path": "nodes/clean/description", "value": "First"}], (CLEAN,), shop)
    first = service.patch_flow(request, AGENT)
    (shop / CLEAN).write_text(read(shop, CLEAN).replace("First", "Outside"), encoding="utf-8")

    second = service.patch_flow(request, AGENT)

    assert second == first
    assert "Outside" in read(shop, CLEAN)


def test_stale_expectation_is_rejected_before_any_change(service: WriteService, shop: Path) -> None:
    request = patch("intake", [{"op": "set", "path": "nodes/clean/description", "value": "New"}], (CLEAN,), shop)
    (shop / CLEAN).write_text(
        read(shop, CLEAN).replace('description: "', 'description: "Outside edit. ', 1), encoding="utf-8"
    )
    disk = current_hash(shop, CLEAN)

    with pytest.raises(WriteError) as raised:
        service.patch_flow(request, AGENT)

    error = raised.value
    assert error.code == "STALE_FILE"
    assert error.status == 412
    assert error.conflict is not None
    assert error.conflict.current_hash == disk
    assert error.conflict.your_hash == request.expects[0].file_hash
    assert error.conflict.rebase == "manual"
    assert "Outside edit." in read(shop, CLEAN)


def test_vanished_and_existing_files_have_their_own_codes(service: WriteService, shop: Path) -> None:
    vanished = patch("intake", [{"op": "set", "path": "nodes/clean/description", "value": "x"}], (CLEAN,), shop)
    (shop / CLEAN).unlink()
    with pytest.raises(WriteError) as missing:
        service.patch_flow(vanished, AGENT)
    assert missing.value.code == "FILE_VANISHED"

    target = "flows/intake/nodes/polish/polish.node.yaml"
    created = patch("intake", [{"op": "set", "path": "flow/description", "value": "x"}], (target,), shop)
    (shop / target).parent.mkdir(parents=True)
    (shop / target).write_text("x", encoding="utf-8")
    with pytest.raises(WriteError) as exists:
        service.patch_flow(created, AGENT)
    assert exists.value.code == "FILE_EXISTS"


def test_touched_paths_outside_expects_are_listed_as_candidates(service: WriteService, shop: Path) -> None:
    request = patch("intake", [{"op": "rename_node", "node_id": "redo", "to": "rewrite"}], (FLOW,), shop)

    with pytest.raises(WriteError) as raised:
        service.patch_flow(request, AGENT)

    assert raised.value.code == "REQUEST_INVALID"
    paths = [candidate.get("path") for candidate in raised.value.candidates if isinstance(candidate, dict)]
    assert f"{REVIEW_FOLDER}/redo.node.yaml" in paths
    assert PROJECT in paths


def test_dry_run_plans_without_touching_disk(service: WriteService, shop: Path) -> None:
    before = read(shop, FLOW)
    request = patch(
        "intake", [{"op": "rename_node", "node_id": "review", "to": "verdict"}], (PROJECT,), shop, dry_run=True
    )

    result = service.patch_flow(request, AGENT)

    assert result.dry_run
    assert f"{REVIEW_FOLDER}/review.node.yaml" in result.changed_paths
    assert "flows/intake/nodes/verdict/verdict.node.yaml" in result.changed_paths
    assert read(shop, FLOW) == before
    assert (shop / REVIEW_FOLDER).is_dir()


def test_rename_top_level_node_moves_folder_rewrites_refs_and_journals(service: WriteService, shop: Path) -> None:
    request = planned_patch(service, "intake", [{"op": "rename_node", "node_id": "review", "to": "verdict"}], AGENT)

    result = service.patch_flow(request, AGENT)

    assert not (shop / REVIEW_FOLDER).exists()
    assert (shop / "flows/intake/nodes/verdict/verdict.node.yaml").is_file()
    assert (shop / "flows/intake/nodes/verdict/trim.py").is_file()
    flow = read(shop, FLOW)
    assert '- "verdict"' in flow
    assert '"$verdict.out.text"' in flow
    project = read(shop, PROJECT)
    assert (
        'renames:\n- kind: "node"\n  from: "intake.review"\n  to: "intake.verdict"\n  at: "2026-09-17T12:30:00Z"\n'
        in project
    )
    assert [entry.to for entry in result.renames] == ["intake.verdict"]
    assert check_project(shop).errors == ()


def test_rename_inner_llm_node_renames_companions_inference_and_iteration_refs(
    service: WriteService, shop: Path
) -> None:
    request = planned_patch(service, "intake", [{"op": "rename_node", "node_id": "redo", "to": "rewrite"}], AGENT)

    result = service.patch_flow(request, AGENT)

    for suffix in ("node.yaml", "inference.yaml", "prompt.md"):
        assert (shop / f"{REVIEW_FOLDER}/rewrite.{suffix}").is_file()
        assert not (shop / f"{REVIEW_FOLDER}/redo.{suffix}").exists()
    recheck = read(shop, f"{REVIEW_FOLDER}/recheck.node.yaml")
    assert '- "rewrite"' in recheck
    assert '"$iter.rewrite.out.score"' in recheck
    assert '"$rewrite.out.text"' in read(shop, f"{REVIEW_FOLDER}/trim.node.yaml")
    assert [(entry.kind, entry.from_, entry.to) for entry in result.renames] == [
        ("node", "intake.review__recheck__redo", "intake.review__recheck__rewrite"),
        ("inference", "redo", "rewrite"),
    ]
    assert "types.py" in result.changed_paths
    assert "class RewriteOut" in read(shop, "types.py")
    assert check_project(shop).errors == ()


def test_blocking_problems_leave_disk_untouched(service: WriteService, shop: Path) -> None:
    request = _remove_clean_request(shop)
    snapshot = {path: current_hash(shop, path) for path in (FLOW, CLEAN, REPLY)}

    with pytest.raises(WriteError) as raised:
        service.patch_flow(request, AGENT)

    assert raised.value.code == "BLOCKING_PROBLEMS"
    assert raised.value.status == 422
    assert any(problem.file == REPLY for problem in raised.value.problems)
    assert {path: current_hash(shop, path) for path in snapshot} == snapshot
    assert pending_transactions(shop) == ()


def _remove_clean_request(shop: Path) -> FlowPatchRequest:
    ops = [{"op": "remove_node", "node_id": "clean"}]
    return patch("intake", ops, (FLOW, CLEAN, "flows/intake/nodes/clean/clean.py"), shop)


def test_rename_that_breaks_project_code_is_blocked(service: WriteService, shop: Path) -> None:
    ops = [{"op": "rename_node", "node_id": "reply", "to": "answer"}]
    probe = patch("intake", ops, (PROJECT,), shop, dry_run=True)

    with pytest.raises(WriteError) as raised:
        service.patch_flow(probe, AGENT)

    assert raised.value.code == "BLOCKING_PROBLEMS"
    assert (shop / REPLY).is_file()


def test_add_node_creates_step_files_and_orders_it(service: WriteService, shop: Path) -> None:
    ops = [
        {
            "op": "add_node",
            "node_id": "polish",
            "index": 2,
            "spec": {
                "node": "llm",
                "description": "Polishes the answer",
                "agent": "critic",
                "in": [{"name": "text", "from": "$reply.out.text"}],
            },
            "inference": {
                "description": "Answer polishing",
                "in": [{"name": "text", "type": "Text", "description": "Answer", "maxLength": 200}],
                "out": [{"name": "text", "type": "Text", "description": "Polished answer", "maxLength": 200}],
            },
            "prompt": "Polish the answer.\n<answer>{{ text }}</answer>\n{{ output_format }}\n",
        }
    ]
    request = planned_patch(service, "intake", ops, HUMAN)

    result = service.patch_flow(request, HUMAN)

    folder = "flows/intake/nodes/polish"
    assert read(shop, f"{folder}/polish.node.yaml").startswith('apiVersion: "aqven/v1"\nkind: "Node"\nnode: "llm"\n')
    assert read(shop, f"{folder}/polish.inference.yaml").startswith('apiVersion: "aqven/v1"\nkind: "Inference"\n')
    assert "{{ output_format }}" in read(shop, f"{folder}/polish.prompt.md")
    assert 'order:\n- "clean"\n- "reply"\n- "polish"\n- "review"\n' in read(shop, FLOW)
    assert result.problems == ()
    assert check_project(shop).errors == ()


def test_add_node_with_taken_name_offers_free_names(service: WriteService, shop: Path) -> None:
    ops = [{"op": "add_node", "node_id": "clean", "spec": {"node": "code", "description": "x"}}]
    request = patch("intake", ops, (FLOW,), shop)

    with pytest.raises(WriteError) as raised:
        service.patch_flow(request, AGENT)

    assert raised.value.code == "FILE_EXISTS"
    assert {"node_id": "clean_2"} in raised.value.candidates


def test_bind_and_unbind_edit_input_slots(service: WriteService, shop: Path) -> None:
    bind = patch("intake", [{"op": "bind", "target": "reply.text", "source": "$input.text"}], (REPLY,), shop)
    service.patch_flow(bind, AGENT)
    assert '- name: "text"\n  from: "$input.text"\n' in read(shop, REPLY)

    unbind = patch("intake", [{"op": "unbind", "target": "reply.mood"}], (REPLY,), shop)
    result = service.patch_flow(unbind, AGENT)
    assert '"mood"' not in read(shop, REPLY)
    assert all(problem.code is DiagnosticCode.E_INPUT_UNBOUND for problem in result.problems if problem.file == REPLY)


def test_move_node_reorders_and_moves_between_flows(shop: Path, sink: CollectingSink) -> None:
    service = make_service(shop, sink, PassingValidator())
    extra = shop / "flows/extra/flow.yaml"
    extra.parent.mkdir(parents=True)
    extra.write_text(read(shop, FLOW).replace('- "clean"\n- "reply"\n- "review"\n', '- "clean"\n'), encoding="utf-8")
    service.patch_flow(patch("intake", [{"op": "move_node", "node_id": "review", "index": 0}], (FLOW,), shop), AGENT)
    assert 'order:\n- "review"\n- "clean"\n- "reply"\n' in read(shop, FLOW)

    ops = [{"op": "move_node", "node_id": "review", "to_flow": "extra", "index": 0}]
    moved = [
        f"{REVIEW_FOLDER}/{name}"
        for name in sorted(path.name for path in (shop / REVIEW_FOLDER).iterdir() if path.is_file())
    ]
    targets = [path.replace("flows/intake", "flows/extra") for path in moved]
    request = patch("intake", ops, (FLOW, "flows/extra/flow.yaml", PROJECT, *moved, *targets), shop)
    result = service.patch_flow(request, AGENT)

    assert (shop / "flows/extra/nodes/review/review.node.yaml").is_file()
    assert not (shop / REVIEW_FOLDER).exists()
    assert 'order:\n- "review"\n- "clean"\n' in read(shop, "flows/extra/flow.yaml")
    assert '"review"' not in read(shop, FLOW).split("order:")[1]
    assert [(entry.from_, entry.to) for entry in result.renames] == [("intake.review", "extra.review")]


def test_rename_flow_moves_folder_and_journals(service: WriteService, shop: Path) -> None:
    request = planned_patch(service, "intake", [{"op": "rename_flow", "to": "inbox"}], AGENT)

    result = service.patch_flow(request, AGENT)

    assert (shop / "flows/inbox/flow.yaml").is_file()
    assert not (shop / "flows/intake").exists()
    assert [(entry.kind, entry.from_, entry.to) for entry in result.renames] == [("flow", "intake", "inbox")]
    assert result.focus is not None and result.focus.flow_id == "inbox"
    assert check_project(shop).errors == ()


def test_set_and_unset_reject_headers_and_bad_indexes(service: WriteService, shop: Path) -> None:
    header = patch("intake", [{"op": "set", "path": "nodes/clean/kind", "value": "Flow"}], (CLEAN,), shop)
    with pytest.raises(WriteError) as raised_header:
        service.patch_flow(header, AGENT)
    assert raised_header.value.code == "REQUEST_INVALID"

    index = patch("intake", [{"op": "unset", "path": "flow/order/9"}], (FLOW,), shop)
    with pytest.raises(WriteError) as raised_index:
        service.patch_flow(index, AGENT)
    assert raised_index.value.code == "REQUEST_INVALID"

    unknown = patch("intake", [{"op": "set", "path": "nodes/ghost/description", "value": "x"}], (FLOW,), shop)
    with pytest.raises(WriteError) as raised_node:
        service.patch_flow(unknown, AGENT)
    assert raised_node.value.code == "NOT_FOUND"


def test_exclusive_patch_is_wrapped_in_notices(service: WriteService, shop: Path, sink: CollectingSink) -> None:
    request = patch(
        "intake", [{"op": "set", "path": "flow/description", "value": "Intake"}], (FLOW,), shop, exclusive=True
    )

    service.patch_flow(request, HUMAN)

    kinds = [type(notice) for notice in sink.notices]
    assert kinds == [ExclusiveBegan, FilesChanged, ExclusiveEnded]


def test_busy_lock_is_reported_with_retry_hint(service: WriteService, shop: Path) -> None:
    held = service.project_lock.acquire(HUMAN)
    request = patch("intake", [{"op": "set", "path": "flow/description", "value": "x"}], (FLOW,), shop)
    try:
        with pytest.raises(WriteError) as raised:
            service.patch_flow(request, AGENT)
    finally:
        held.release()

    assert raised.value.code == "LOCK_BUSY"
    assert raised.value.status == 423
    assert raised.value.retry_after_ms is not None


def test_second_writer_with_the_same_base_gets_stale_file(shop: Path, sink: CollectingSink) -> None:
    studio = make_service(shop, sink)
    agent = make_service(shop, CollectingSink())
    human_edit = patch("intake", [{"op": "set", "path": "nodes/clean/description", "value": "Studio"}], (CLEAN,), shop)
    agent_edit = patch("intake", [{"op": "set", "path": "nodes/clean/description", "value": "Agent"}], (CLEAN,), shop)

    studio.patch_flow(human_edit, HUMAN)
    with pytest.raises(WriteError) as raised:
        agent.patch_flow(agent_edit, AGENT)

    assert raised.value.code == "STALE_FILE"
    assert "Studio" in read(shop, CLEAN)


def test_service_recovery_finishes_interrupted_transaction_and_notifies(
    service: WriteService, shop: Path, sink: CollectingSink
) -> None:
    interrupted = Transaction.begin(shop, {CLEAN: b"recovered"}, (), "2026-09-17T12:30:00Z")
    interrupted.commit_intent(interrupted.stage())

    recovered = service.recover()

    assert [item.outcome for item in recovered] == ["rolled_forward"]
    assert (shop / CLEAN).read_bytes() == b"recovered"
    assert isinstance(sink.notices[-1], TransactionRecovered)
