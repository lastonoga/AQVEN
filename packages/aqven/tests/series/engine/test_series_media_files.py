import asyncio
import hashlib
import json
import struct
import zlib
from collections.abc import AsyncIterator, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

import pytest
from pydantic import JsonValue
from pydantic_ai.messages import BinaryContent, ModelMessage, ModelRequest, UserPromptPart
from pydantic_ai.models import Model
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, DeltaToolCalls, FunctionModel
from series_fixture import ABOVE_PROJECT_CAP, FILES, PACKAGE, WRITER_MODEL, forget_package
from series_harness import WRITER_NAME, ScriptedModels, SeriesHarness, series_engine, settled

from aqven.check import check_project
from aqven.codegen import generate_types
from aqven.engine.loading import CodeLoader
from aqven.series.model import AttemptRecord, CaseSnapshot, CheckState, OutcomeClass, SeriesRecord, SeriesStatus
from aqven.series.planner import PlannedSeries, PlanningState, SeriesPlanner, plan_request
from aqven.series.views import LookTarget, SeriesStartRequest
from aqven.server.errors import ApiFailure
from aqven.server.workspace import take_snapshot
from aqven.spec import DatasetId, ExperimentId, FlowId, VerdictReason, VerdictState
from aqven.testing import MemoryBlobStore
from aqven.write.model import WriteActor

AGENT: Final = WriteActor(kind="agent", id="mcp")
HUMAN: Final = WriteActor(kind="human", id="kir")
PNG_SIGNATURE: Final = b"\x89PNG\r\n\x1a\n"
PHOTO_FILE: Final = "datasets/photo_cases/shelf.png"
SAMPLE_FILE: Final = "datasets/photo_cases/sample_loader.py"
LOOK: Final = LookTarget(flow_id=FlowId("photos"), dataset_id=DatasetId("photo_cases"), case_names=("shelf",))

PHOTO_TICKET: Final = """apiVersion: "aqven/v1"
kind: "Type"
type: "record"
description: "A support ticket with a photo of the product"
fields:
- name: "text"
  type: "Text"
  description: "Ticket text"
  maxLength: 200
- name: "photo"
  type: "Image"
  description: "Photo of the product"
"""

PHOTOS_FLOW: Final = """apiVersion: "aqven/v1"
kind: "Flow"
description: "Label a ticket from its photo"
input: "PhotoTicket"
output: "Label"
returns:
- name: "label"
  from: "$look.out.label"
order:
- "look"
"""

LOOK_NODE: Final = """apiVersion: "aqven/v1"
kind: "Node"
node: "llm"
description: "Label the ticket from its photo"
agent: "writer"
in:
- name: "text"
  from: "$input.text"
- name: "photo"
  from: "$input.photo"
"""

LOOK_INFERENCE: Final = """apiVersion: "aqven/v1"
kind: "Inference"
description: "One label for a ticket with a photo"
in:
- name: "text"
  type: "Text"
  description: "Ticket text"
  maxLength: 200
- name: "photo"
  type: "Image"
  description: "Photo of the product"
out:
- name: "label"
  type: "Text"
  description: "Label"
  maxLength: 50
"""

LOOK_PROMPT: Final = """Label the support ticket from its photo.
<ticket>{{ text }}</ticket>
{{ output_format }}
"""

PHOTO_CASES: Final = """apiVersion: "aqven/v1"
kind: "Dataset"
flow: "photos"
cases:
- name: "shelf"
  inputs:
    text: "the lamp arrived broken"
    photo:
      $media: "image/png"
      file: "shelf.png"
  expected_output:
    label: "ok"
"""

PHOTO_EXPERIMENT: Final = """apiVersion: "aqven/v1"
kind: "Experiment"
description: "Labels from the photo match the expected label"
subject:
  flow: "photos"
cases:
  dataset: "photo_cases"
variants:
- id: "writer"
checks:
- id: "matches"
  kind: "binary"
  use: "expected"
  with:
    fields:
    - "label"
question:
  kind: "threshold"
  metric: "matches"
  above: 0.5
  margin: 0.05
plan:
  repeats: 1
"""

PHOTO_FILES: Final[Mapping[str, str]] = {
    "types/photo_ticket.yaml": PHOTO_TICKET,
    "flows/photos/flow.yaml": PHOTOS_FLOW,
    "flows/photos/nodes/look/look.node.yaml": LOOK_NODE,
    "flows/photos/nodes/look/look.inference.yaml": LOOK_INFERENCE,
    "flows/photos/nodes/look/look.prompt.md": LOOK_PROMPT,
    "datasets/photo_cases.yaml": PHOTO_CASES,
    "experiments/photo_labels/experiment.yaml": PHOTO_EXPERIMENT,
}


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def png(red: int) -> bytes:
    header = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    pixels = zlib.compress(bytes((0, red, 0, 0)))
    return PNG_SIGNATURE + png_chunk(b"IHDR", header) + png_chunk(b"IDAT", pixels) + png_chunk(b"IEND", b"")


def blob_id(data: bytes) -> str:
    return f"sha256-{hashlib.sha256(data).hexdigest()}"


def write_photo_project(parent: Path, photo: bytes) -> Path:
    forget_package(parent.resolve())
    root = parent / PACKAGE
    for relative, text in {**FILES, **PHOTO_FILES}.items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    (root / PHOTO_FILE).parent.mkdir(parents=True, exist_ok=True)
    (root / PHOTO_FILE).write_bytes(photo)
    generated = generate_types(root)
    assert generated.project is not None, generated.diagnostics
    return root


def attached_images(messages: Sequence[ModelMessage]) -> list[bytes]:
    parts = (
        part
        for message in messages
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, UserPromptPart) and not isinstance(part.content, str)
    )
    return [item.data for part in parts for item in part.content if isinstance(item, BinaryContent)]


@dataclass(slots=True)
class PhotoModels:
    images: list[bytes] = field(default_factory=list[bytes])
    others: ScriptedModels = field(default_factory=ScriptedModels)

    async def stream(self, messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str | DeltaToolCalls]:
        self.images.extend(attached_images(messages))
        payload = json.dumps({"label": "ok"})
        if info.output_tools:
            yield {0: DeltaToolCall(name=info.output_tools[0].name, json_args=payload, tool_call_id="call_1")}
            return
        yield payload

    def mapping(self) -> Mapping[str, Model]:
        writer = FunctionModel(stream_function=self.stream, model_name=WRITER_NAME)
        return {**self.others.mapping(), WRITER_MODEL: writer}


@dataclass(frozen=True, slots=True)
class LookedSeries:
    record: SeriesRecord
    attempts: tuple[AttemptRecord, ...]
    cases: tuple[CaseSnapshot, ...]
    stored: bytes


async def looked(harness: SeriesHarness, photo_blob: str) -> LookedSeries:
    started = await harness.service.start(SeriesStartRequest(look=LOOK), AGENT)
    await settled(harness.service, started.series_id)
    record = await harness.services.store.series(started.series_id)
    assert record is not None
    attempts = await harness.services.store.attempts(started.series_id)
    cases = await harness.services.store.cases(started.series_id)
    return LookedSeries(record, attempts, tuple(cases), harness.runtime.services.blobs.read(photo_blob))


async def swapped_midway(harness: SeriesHarness, root: Path) -> SeriesRecord:
    request = SeriesStartRequest(experiment_id=ExperimentId("photo_labels"), cap_usd=ABOVE_PROJECT_CAP)
    started = await harness.service.start(request, AGENT)
    (root / PHOTO_FILE).write_bytes(png(99))
    await harness.service.approve(started.series_id, HUMAN)
    await settled(harness.service, started.series_id)
    record = await harness.services.store.series(started.series_id)
    assert record is not None
    return record


def planned(root: Path, store: MemoryBlobStore) -> PlannedSeries:
    planner = SeriesPlanner(
        types=CodeLoader(root), engine_version="test", holdout_share=0.5, blobs=lambda project: store
    )
    state = PlanningState(check_project(root), take_snapshot(root))
    return asyncio.run(planner.plan(plan_request(SeriesStartRequest(look=LOOK)), state, None))


def photo_input(case: CaseSnapshot) -> JsonValue:
    assert isinstance(case.inputs, dict)
    return case.inputs["photo"]


def test_a_look_series_sends_the_case_file_to_the_model_as_a_stored_blob(tmp_path: Path) -> None:
    photo = png(200)
    root = write_photo_project(tmp_path, photo)
    models = PhotoModels()

    with series_engine(root, models) as harness:
        series = asyncio.run(looked(harness, blob_id(photo)))

    assert [attempt.outcome for attempt in series.attempts] == [OutcomeClass.OK]
    assert [check.state for check in series.attempts[0].checks] == [CheckState.PASSED]
    assert models.images == [photo]
    assert series.stored == photo
    assert [photo_input(case) for case in series.cases] == [
        {"$media": "image/png", "blob_id": blob_id(photo), "size_bytes": len(photo), "name": "shelf.png"}
    ]


def test_replacing_the_case_file_changes_the_cases_fingerprint_and_nothing_else(tmp_path: Path) -> None:
    root = write_photo_project(tmp_path, png(10))
    store = MemoryBlobStore()
    first = planned(root, store)

    (root / PHOTO_FILE).write_bytes(png(250))
    second = planned(root, store)

    assert second.snapshot.cases_sha256 != first.snapshot.cases_sha256
    assert second.snapshot.dataset_sha256 == first.snapshot.dataset_sha256
    assert second.snapshot.code_sha256 == first.snapshot.code_sha256
    assert set(store.stored.values()) == {png(10), png(250)}
    assert photo_input(second.cases[0]) == {
        "$media": "image/png",
        "blob_id": blob_id(png(250)),
        "size_bytes": len(png(250)),
        "name": "shelf.png",
    }


def test_rewriting_the_same_bytes_keeps_the_cases_fingerprint(tmp_path: Path) -> None:
    root = write_photo_project(tmp_path, png(10))
    first = planned(root, MemoryBlobStore())

    (root / PHOTO_FILE).unlink()
    (root / PHOTO_FILE).write_bytes(png(10))
    second = planned(root, MemoryBlobStore())

    assert second.snapshot.cases_sha256 == first.snapshot.cases_sha256


def test_a_python_file_in_the_dataset_folder_is_not_project_code(tmp_path: Path) -> None:
    root = write_photo_project(tmp_path, png(10))
    first = planned(root, MemoryBlobStore())

    (root / SAMPLE_FILE).write_text("def load() -> bytes:\n    return b''\n", encoding="utf-8")
    second = planned(root, MemoryBlobStore())

    assert second.snapshot.code_sha256 == first.snapshot.code_sha256
    assert second.snapshot.cases_sha256 == first.snapshot.cases_sha256


def test_a_case_file_gone_after_the_check_stops_the_series_before_it_starts(tmp_path: Path) -> None:
    root = write_photo_project(tmp_path, png(10))
    planner = SeriesPlanner(types=CodeLoader(root), engine_version="test", holdout_share=0.5)
    state = PlanningState(check_project(root), take_snapshot(root))
    (root / PHOTO_FILE).unlink()

    with pytest.raises(ApiFailure) as raised:
        asyncio.run(planner.plan(plan_request(SeriesStartRequest(look=LOOK)), state, None))

    assert raised.value.code == "NOT_RUNNABLE"
    assert [(problem.path, problem.code) for problem in raised.value.problems] == [
        (("cases", "shelf", "inputs", "photo"), "E_MEDIA_FILE_MISSING")
    ]


def test_a_case_file_replaced_during_a_series_makes_it_invalid(tmp_path: Path) -> None:
    root = write_photo_project(tmp_path, png(10))

    with series_engine(root, PhotoModels()) as harness:
        record = asyncio.run(swapped_midway(harness, root))
        changed = [source.inputs_changed for source in harness.analyst.inputs if source.status is SeriesStatus.DONE]

    assert changed == [True]
    assert record.verdict is not None
    assert (record.verdict.state, record.verdict.reason) == (VerdictState.INVALID, VerdictReason.INPUTS_CHANGED)
