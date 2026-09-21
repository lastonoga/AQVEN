import asyncio
import shutil
from pathlib import Path
from typing import Final

import pytest
from models_support import FailingModel, ScriptedModel, text_script
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, UserPromptPart
from pydantic_ai.models import Model, ModelRequestParameters

from aqven.models import (
    CallPolicy,
    CassettePolicy,
    CassetteStore,
    DirectoryCassetteStore,
    call_site,
    guard_model,
)
from aqven.models.backoff import BackoffPolicy
from aqven.models.cassette import CASSETTE_BEHAVIORS, read_recording
from aqven.models.cassette_blobs import (
    BLOB_KEY,
    BLOB_SUFFIX,
    BlobMissing,
    BlobVault,
    blob_root,
    pack_directory,
)
from aqven.runtime import CassetteMode, node_address

MODEL_REF: Final = "openrouter:openai/gpt-oss-20b"
LONG_TEXT: Final = "payload " * 400
EXAMPLE_CASSETTES: Final = Path(__file__).parents[4] / "examples" / "tests" / "cassettes"
NO_WAIT: Final = BackoffPolicy(attempts=1, initial_seconds=0.0, jitter_seconds=0.0)


def policy(store: CassetteStore, mode: CassetteMode) -> CallPolicy:
    return CallPolicy(
        cassettes=CassettePolicy(store=store, behavior=CASSETTE_BEHAVIORS[mode]),
        backoff=NO_WAIT,
    )


def prompt(text: str) -> list[ModelMessage]:
    return [ModelRequest(parts=[UserPromptPart(text)])]


def answer(model: Model, text: str) -> ModelResponse:
    return asyncio.run(model.request(prompt(text), None, ModelRequestParameters()))


def record(store: CassetteStore, text: str, node: str) -> ModelResponse:
    inner = ScriptedModel([text_script(LONG_TEXT)])
    with call_site(node_address(node), 1):
        return answer(guard_model(inner, model_ref=MODEL_REF, policy=policy(store, CassetteMode.RECORD)), text)


def replay(store: CassetteStore, text: str, node: str) -> ModelResponse:
    with call_site(node_address(node), 1):
        return answer(
            guard_model(FailingModel(), model_ref=MODEL_REF, policy=policy(store, CassetteMode.REPLAY_STRICT)), text
        )


def cassette_files(directory: Path) -> list[Path]:
    return sorted(path for path in directory.rglob("*.json"))


def test_a_recorded_payload_moves_into_the_blobs_folder(tmp_path: Path) -> None:
    store = DirectoryCassetteStore(tmp_path)

    recorded = record(store, "hello", "reply")

    written = cassette_files(tmp_path)[0].read_text(encoding="utf-8")
    blobs = sorted(blob_root(tmp_path).glob(f"*{BLOB_SUFFIX}"))
    assert LONG_TEXT not in written
    assert BLOB_KEY in written
    assert len(blobs) == 1
    assert replay(store, "hello", "reply").parts == recorded.parts


def test_one_payload_is_stored_once_for_every_cassette(tmp_path: Path) -> None:
    store = DirectoryCassetteStore(tmp_path)

    record(store, "first", "reply")
    record(store, "second", "review")

    assert len(cassette_files(tmp_path)) == 2
    assert len(sorted(blob_root(tmp_path).glob(f"*{BLOB_SUFFIX}"))) == 1


def test_scenario_folders_share_one_blobs_folder(tmp_path: Path) -> None:
    cassettes = tmp_path / "cassettes"
    first = cassettes / "support_case" / "question_agreed"
    second = cassettes / "support_case" / "painter_fallback"

    assert blob_root(first) == blob_root(second) == cassettes / "blobs"
    assert blob_root(tmp_path / "loose") == tmp_path / "loose" / "blobs"


def test_a_missing_blob_is_reported(tmp_path: Path) -> None:
    store = DirectoryCassetteStore(tmp_path)
    record(store, "hello", "reply")
    for blob in blob_root(tmp_path).glob(f"*{BLOB_SUFFIX}"):
        blob.unlink()

    with pytest.raises(BlobMissing):
        replay(store, "hello", "reply")


def test_packing_keeps_every_example_cassette_replayable(tmp_path: Path) -> None:
    if not EXAMPLE_CASSETTES.is_dir():
        pytest.skip("the example cassettes are not in this checkout")
    copy = tmp_path / "cassettes"
    shutil.copytree(EXAMPLE_CASSETTES, copy)
    vault = BlobVault(blob_root(copy))
    before = {path.relative_to(copy): read_recording(path, vault) for path in cassette_files(copy)}

    report = pack_directory(copy)
    again = pack_directory(copy)

    after = {path.relative_to(copy): read_recording(path, vault) for path in cassette_files(copy)}
    assert after == before
    assert report.files == len(before)
    assert report.blobs > 0
    assert again.rewritten == 0
    assert again.bytes_after == report.bytes_after
