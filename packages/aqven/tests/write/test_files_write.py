from pathlib import Path
from typing import Final

import pytest
from pydantic import ValidationError
from write_helpers import AGENT, current_hash, read

from aqven.client import new_client_op_id
from aqven.runtime.address import ClientOpId
from aqven.write import CollectingSink, FilesChanged, WriteError, WriteService
from aqven.write.model import ExpectedFile, FilesWriteRequest

NOTE: Final = "notes/finding.md"
SUMMARY: Final = "SUMMARY.md"


def files_request(
    expects: dict[str, str | None], files: dict[str, str], client_op_id: ClientOpId | None = None
) -> FilesWriteRequest:
    return FilesWriteRequest(
        expects=[ExpectedFile(path=path, file_hash=digest) for path, digest in expects.items()],
        files=files,
        client_op_id=client_op_id or new_client_op_id(),
        intent="record a note",
    )


def test_files_write_creates_files_in_one_transaction(service: WriteService, shop: Path, sink: CollectingSink) -> None:
    request = files_request({NOTE: None, SUMMARY: None}, {NOTE: "first\n", SUMMARY: "summary\n"})

    result = service.write_files(request, AGENT)

    assert (result.op, result.focus, result.dry_run) == ("files_write", None, False)
    assert result.changed_paths == (SUMMARY, NOTE)
    assert result.tree_hash is not None
    assert (read(shop, NOTE), read(shop, SUMMARY)) == ("first\n", "summary\n")
    [notice] = [notice for notice in sink.notices if isinstance(notice, FilesChanged)]
    assert notice.summary == "record a note"
    assert {change.change for change in notice.changes} == {"added"}


def test_a_file_expected_absent_is_written_once(service: WriteService) -> None:
    service.write_files(files_request({NOTE: None}, {NOTE: "first\n"}), AGENT)

    with pytest.raises(WriteError) as raised:
        service.write_files(files_request({NOTE: None}, {NOTE: "second\n"}), AGENT)

    assert raised.value.code == "FILE_EXISTS"
    assert raised.value.conflict is not None and raised.value.conflict.path == NOTE


def test_a_repeated_client_op_id_replays_the_first_result(service: WriteService, sink: CollectingSink) -> None:
    op = new_client_op_id()
    first = service.write_files(files_request({NOTE: None}, {NOTE: "first\n"}, op), AGENT)

    again = service.write_files(files_request({NOTE: None}, {NOTE: "first\n"}, op), AGENT)

    assert again == first
    assert len([notice for notice in sink.notices if isinstance(notice, FilesChanged)]) == 1


def test_a_stale_hash_refuses_the_whole_write(service: WriteService, shop: Path) -> None:
    service.write_files(files_request({SUMMARY: None}, {SUMMARY: "one\n"}), AGENT)
    stale = current_hash(shop, SUMMARY)
    (shop / SUMMARY).write_text("edited by hand\n", encoding="utf-8")

    with pytest.raises(WriteError) as raised:
        service.write_files(files_request({NOTE: None, SUMMARY: stale}, {NOTE: "n\n", SUMMARY: "two\n"}), AGENT)

    assert raised.value.code == "STALE_FILE"
    assert not (shop / NOTE).exists()
    assert read(shop, SUMMARY) == "edited by hand\n"


def test_every_written_path_needs_an_expectation(service: WriteService, shop: Path) -> None:
    with pytest.raises(WriteError) as raised:
        service.write_files(files_request({NOTE: None}, {NOTE: "n\n", SUMMARY: "s\n"}), AGENT)

    assert raised.value.code == "REQUEST_INVALID"
    assert not (shop / NOTE).exists()


def test_unchanged_bytes_are_not_rewritten(service: WriteService, shop: Path) -> None:
    service.write_files(files_request({SUMMARY: None}, {SUMMARY: "same\n"}), AGENT)
    unchanged = current_hash(shop, SUMMARY)

    result = service.write_files(
        files_request({NOTE: None, SUMMARY: unchanged}, {NOTE: "n\n", SUMMARY: "same\n"}), AGENT
    )

    assert result.changed_paths == (NOTE,)


def test_service_paths_are_refused_before_the_disk() -> None:
    with pytest.raises(ValidationError):
        files_request({".aqven/lock": None}, {".aqven/lock": "x"})
