import os
import stat
import subprocess
import sys
import textwrap
from pathlib import Path
from typing import Final

import pytest
from pydantic import JsonValue
from write_helpers import AGENT, FIXTURES, HUMAN

from aqven.client import new_client_op_id
from aqven.loader import file_hash, project_files
from aqven.loader.aliases import AliasScope
from aqven.loader.layout import FLOW_FILES
from aqven.write import (
    LOCK_PATH,
    TXN_FOLDER,
    FileIntentJournal,
    ProjectLock,
    SelfWrites,
    Transaction,
    VersionFile,
    WriteError,
    WriteResult,
    WriteVersion,
    canonical_yaml,
    parse_document,
    pending_transactions,
    recover_transactions,
)

SHOPS: Final = ("standard_shop", "layout_shop", "alias_shop", "fixture_shop")
STAMP: Final = "2026-09-17T12:30:00Z"


@pytest.mark.parametrize("shop_name", SHOPS)
def test_canonical_yaml_is_a_byte_fixpoint_of_fixture_files(shop_name: str) -> None:
    root = FIXTURES / shop_name
    files = project_files(root)
    folders = tuple(sorted({str(Path(path).parent) for path in files if Path(path).name in FLOW_FILES}))
    scope = AliasScope(root.name, folders)
    for path in (path for path in files if path.endswith(".yaml")):
        data = (root / path).read_bytes()
        document = parse_document(path, data)
        assert document is not None, path
        assert canonical_yaml(path, document, scope) == data, path


def test_canonical_yaml_orders_keys_by_model_and_keeps_nulls() -> None:
    document: dict[str, JsonValue] = {
        "out": [{"type": "Text", "name": "text", "description": "Answer", "maxLength": 10}],
        "run": "clean",
        "description": "Step",
        "node": "code",
        "kind": "Node",
        "apiVersion": "aqven/v1",
        "in": [{"name": "text", "type": "Text", "description": "Input", "value": None}],
    }

    text = canonical_yaml("flows/f/nodes/clean/clean.node.yaml", document, AliasScope("shop", ("flows/f",)))

    assert text.decode("utf-8") == textwrap.dedent(
        """\
        apiVersion: "aqven/v1"
        kind: "Node"
        node: "code"
        description: "Step"
        run: "clean"
        in:
        - name: "text"
          type: "Text"
          description: "Input"
          value: null
        out:
        - name: "text"
          type: "Text"
          description: "Answer"
          maxLength: 10
        """
    )


def test_lock_is_exclusive_owner_only_and_released(tmp_path: Path) -> None:
    lock = ProjectLock(tmp_path, timeout_seconds=0.05)
    lease = lock.acquire(AGENT)
    assert stat.S_IMODE((tmp_path / LOCK_PATH).stat().st_mode) == 0o600
    holder = lock.holder()
    assert holder is not None and holder.pid == os.getpid() and holder.actor == AGENT

    with pytest.raises(WriteError) as raised:
        ProjectLock(tmp_path, timeout_seconds=0.05).acquire(HUMAN)
    assert raised.value.code == "LOCK_BUSY"
    assert "claude-code" in raised.value.message

    lease.refresh()
    assert stat.S_IMODE((tmp_path / LOCK_PATH).stat().st_mode) == 0o600
    lease.release()
    assert not (tmp_path / LOCK_PATH).exists()
    ProjectLock(tmp_path, timeout_seconds=0.05).acquire(HUMAN).release()


def test_lock_of_dead_or_expired_holder_is_taken_over(tmp_path: Path) -> None:
    ProjectLock(tmp_path).acquire(AGENT)
    dead = ProjectLock(tmp_path, timeout_seconds=0.5, alive=lambda pid: False)
    dead.acquire(HUMAN).release()

    ProjectLock(tmp_path, ttl_seconds=0.01).acquire(AGENT)
    expired = ProjectLock(tmp_path, timeout_seconds=0.5)
    lease = expired.acquire(HUMAN)
    assert lease.holder.actor == HUMAN
    lease.release()


def test_transaction_publishes_moves_deletes_and_cleans_up(tmp_path: Path) -> None:
    (tmp_path / "old/nested").mkdir(parents=True)
    (tmp_path / "old/nested/a.yaml").write_bytes(b"a")
    (tmp_path / "keep.md").write_bytes(b"k")
    draft = tmp_path / ".aqven/drafts/keep.md.draft"
    draft.parent.mkdir(parents=True)
    draft.write_bytes(b"d")

    changes: dict[str, bytes | None] = {"old/nested/a.yaml": None, "new/a.yaml": b"a2", "keep.md": b"k2"}
    Transaction.begin(tmp_path, changes, (".aqven/drafts/keep.md.draft",), STAMP).run()

    assert (tmp_path / "new/a.yaml").read_bytes() == b"a2"
    assert (tmp_path / "keep.md").read_bytes() == b"k2"
    assert not (tmp_path / "old").exists()
    assert not draft.exists()
    assert pending_transactions(tmp_path) == ()


def test_recovery_rolls_forward_with_intent_and_back_without(tmp_path: Path) -> None:
    (tmp_path / "a.yaml").write_bytes(b"old")
    committed = Transaction.begin(tmp_path, {"a.yaml": b"new", "b.yaml": b"b"}, (), STAMP)
    committed.commit_intent(committed.stage())
    staged_only = Transaction.begin(tmp_path, {"a.yaml": b"never"}, (), STAMP)
    staged_only.stage()

    recovered = {item.txn_id: item for item in recover_transactions(tmp_path)}

    assert recovered[committed.txn_id].outcome == "rolled_forward"
    assert recovered[staged_only.txn_id].outcome == "rolled_back"
    assert (tmp_path / "a.yaml").read_bytes() == b"new"
    assert (tmp_path / "b.yaml").read_bytes() == b"b"
    assert pending_transactions(tmp_path) == ()


def test_process_killed_between_renames_is_completed_on_restart(tmp_path: Path) -> None:
    script = textwrap.dedent(
        f"""
        import os
        from pathlib import Path
        from aqven.write.txn import Transaction, _publish_target
        root = Path({str(tmp_path)!r})
        txn = Transaction.begin(root, {{"first.yaml": b"1", "second.yaml": b"2", "third.yaml": b"3"}}, (), {STAMP!r})
        intent = txn.stage()
        txn.commit_intent(intent)
        _publish_target(root, txn.folder, intent.targets[0])
        os._exit(9)
        """
    )
    finished = subprocess.run([sys.executable, "-c", script], check=False, timeout=60)
    assert finished.returncode == 9
    assert (tmp_path / "first.yaml").is_file()
    assert not (tmp_path / "second.yaml").exists()
    assert len(pending_transactions(tmp_path)) == 1

    recovered = recover_transactions(tmp_path)

    assert [item.outcome for item in recovered] == ["rolled_forward"]
    assert [(tmp_path / name).read_bytes() for name in ("first.yaml", "second.yaml", "third.yaml")] == [
        b"1",
        b"2",
        b"3",
    ]
    assert not (tmp_path / TXN_FOLDER).exists() or pending_transactions(tmp_path) == ()


def test_file_intent_journal_keeps_first_result(tmp_path: Path) -> None:
    journal = FileIntentJournal(tmp_path)
    client_op_id = new_client_op_id()
    first = _result(client_op_id, "a.yaml")
    journal.record(client_op_id, first)
    journal.record(client_op_id, _result(client_op_id, "b.yaml"))

    assert journal.find(client_op_id) == first
    assert journal.find(new_client_op_id()) is None


def test_self_writes_suppress_only_matching_echo_once() -> None:
    now = [0.0]
    writes = SelfWrites(ttl_seconds=5.0, clock=lambda: now[0])
    digest = file_hash(b"x")
    writes.expect("a.yaml", digest)

    assert not writes.is_echo("a.yaml", file_hash(b"y"))
    assert writes.is_echo("a.yaml", digest)
    assert not writes.is_echo("a.yaml", digest)

    writes.expect("b.yaml", digest)
    now[0] = 10.0
    assert not writes.is_echo("b.yaml", digest)


def _result(client_op_id: str, path: str) -> WriteResult:
    return WriteResult.model_validate(
        {
            "op": "flow_patch",
            "dry_run": False,
            "version": WriteVersion.model_validate(
                {
                    "files": [VersionFile(path=path, file_hash=None)],
                    "dirty": True,
                    "actor": AGENT,
                    "client_op_id": client_op_id,
                }
            ),
            "tree_hash": None,
            "changed_paths": [path],
            "applied_ops": [],
            "renames": [],
            "focus": None,
            "problems": [],
        }
    )
