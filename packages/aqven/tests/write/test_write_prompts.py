from pathlib import Path
from typing import Final

import pytest
from write_helpers import HUMAN, current_hash, read

from aqven.client import new_client_op_id
from aqven.diagnostics import DiagnosticCode
from aqven.write import (
    CollectingSink,
    DraftStale,
    DraftWrite,
    FilesChanged,
    PromptSaveRequest,
    WriteError,
    WriteService,
    node_prompt,
)

PROMPT: Final = "flows/intake/nodes/reply/reply.prompt.md"
REDO_INFERENCE: Final = "flows/intake/nodes/review/redo.inference.yaml"


def save_request(root: Path, base_hash: str | None) -> PromptSaveRequest:
    return PromptSaveRequest.model_validate(
        {
            "flow_id": "intake",
            "node_id": "reply",
            "expects": [{"path": PROMPT, "file_hash": base_hash}],
            "client_op_id": new_client_op_id(),
        }
    )


def test_node_prompt_resolves_the_file_next_to_the_inference(shop: Path) -> None:
    assert node_prompt(shop, "intake", "reply").path == PROMPT
    assert node_prompt(shop, "intake", "redo").path == "flows/intake/nodes/review/redo.prompt.md"


def test_draft_lives_outside_the_tree_and_turns_stale(service: WriteService, shop: Path) -> None:
    base = current_hash(shop, PROMPT)
    draft = service.put_draft("intake", "reply", DraftWrite(text="New text", base_file_hash=base), HUMAN)

    assert not draft.stale
    assert (shop / f".aqven/drafts/{PROMPT}.draft").read_text(encoding="utf-8") == "New text"
    assert read(shop, PROMPT) != "New text"

    (shop / PROMPT).write_text("Agent rewrote", encoding="utf-8")
    fetched = service.get_draft("intake", "reply")
    assert fetched is not None and fetched.stale
    assert service.drafts.stale_notice(PROMPT, current_hash(shop, PROMPT)) == DraftStale(
        path=PROMPT, base_file_hash=base, file_hash=current_hash(shop, PROMPT)
    )

    assert service.delete_draft("intake", "reply")
    assert service.get_draft("intake", "reply") is None
    assert not (shop / ".aqven/drafts/flows").exists()


def test_save_writes_draft_through_transaction_and_removes_it(
    service: WriteService, shop: Path, sink: CollectingSink
) -> None:
    base = current_hash(shop, PROMPT)
    text = read(shop, PROMPT).replace("{{ output_format }}", "Answer in two sentences.\n{{ output_format }}")
    service.put_draft("intake", "reply", DraftWrite(text=text, base_file_hash=base), HUMAN)

    result = service.save_prompt(save_request(shop, base), HUMAN)

    assert read(shop, PROMPT) == text
    assert result.op == "prompt_save"
    assert result.changed_paths == (PROMPT,)
    assert service.get_draft("intake", "reply") is None
    assert not (shop / f".aqven/drafts/{PROMPT}.meta.json").exists()
    notice = next(item for item in sink.notices if isinstance(item, FilesChanged))
    assert notice.changes[0].file_hash_before == base


def test_prompt_problems_are_advisory_and_saved(service: WriteService, shop: Path) -> None:
    base = current_hash(shop, PROMPT)
    text = f"{read(shop, PROMPT)}{{{{ missing }}}}\n"
    service.put_draft("intake", "reply", DraftWrite(text=text, base_file_hash=base), HUMAN)
    assert any(
        item.code is DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED for item in service.draft_problems("intake", "reply")
    )

    result = service.save_prompt(save_request(shop, base), HUMAN)

    assert read(shop, PROMPT) == text
    assert any(item.code is DiagnosticCode.E_PROMPT_VARIABLE_UNDECLARED for item in result.problems)


def test_save_over_changed_disk_returns_three_texts(service: WriteService, shop: Path) -> None:
    base = current_hash(shop, PROMPT)
    original = read(shop, PROMPT)
    service.put_draft("intake", "reply", DraftWrite(text="Draft", base_file_hash=base), HUMAN)
    (shop / PROMPT).write_text("Disk", encoding="utf-8")

    with pytest.raises(WriteError) as raised:
        service.save_prompt(save_request(shop, base), HUMAN)

    conflict = raised.value.conflict
    assert raised.value.code == "STALE_FILE"
    assert conflict is not None and conflict.texts is not None
    assert (conflict.texts.draft, conflict.texts.base, conflict.texts.disk) == ("Draft", original, "Disk")
    assert service.get_draft("intake", "reply") is not None


def test_code_prompt_has_no_draft(service: WriteService, shop: Path) -> None:
    inference = shop / REDO_INFERENCE
    inference.write_text(
        read(shop, REDO_INFERENCE).replace(
            "\nin:\n",
            '\nprompt: "build_prompt"\nin:\n',
        ),
        encoding="utf-8",
    )

    with pytest.raises(WriteError) as raised:
        service.put_draft("intake", "redo", DraftWrite(text="x", base_file_hash=None), HUMAN)

    assert raised.value.code == "PROMPT_IS_CODE"
    assert raised.value.status == 409
