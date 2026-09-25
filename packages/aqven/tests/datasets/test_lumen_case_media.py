from collections.abc import Iterator
from pathlib import Path
from typing import Final

from pydantic import JsonValue

from aqven.check import check_project
from aqven.datasets import CaseMediaResolver, case_media_file_refs
from aqven.diagnostics import render_path
from aqven.loader import LoadedProject, load_project
from aqven.spec import DatasetCase
from aqven.testing import MemoryBlobStore

LUMEN: Final = Path(__file__).resolve().parents[4] / "examples" / "lumen"
PHOTO: Final[dict[str, JsonValue]] = {
    "$media": "image/jpeg",
    "blob_id": "sha256-0606035923b6e819a36fc2581f0d9bdb78ccfabe8bb6f44a98ac3b2cbd65e3b6",
    "size_bytes": 1865,
    "name": "flow_strip_controller.jpg",
}
VOICE: Final[dict[str, JsonValue]] = {
    "$media": "audio/wav",
    "blob_id": "sha256-627b3f43f925ca8305175adcbfdaef581de4e48f876356f52b744102fbd27675",
    "size_bytes": 32044,
    "name": "voice.wav",
}
VIDEO: Final[dict[str, JsonValue]] = {
    "$media": "video/mp4",
    "blob_id": "sha256-56e4ab6809017822c002e780d3ad85a74e58457ba23c3a25696f4fa545401c5a",
    "size_bytes": 6129,
    "name": "clip.mp4",
}
INVOICE: Final[dict[str, JsonValue]] = {
    "$media": "application/pdf",
    "blob_id": "sha256-73c299df4819d9854d92954932dc86a16fe13c603013316637ad0385d308e712",
    "size_bytes": 633,
    "name": "invoice_LUM-20260903.pdf",
}
ALL_MEDIA: Final = {"photo": PHOTO, "voice_note": VOICE, "video": VIDEO, "invoice": INVOICE}
BEFORE_FILES: Final[dict[tuple[str, str, str], dict[str, JsonValue]]] = {
    ("support_case_cases", "strip_flicker_credit", "inputs.photo"): PHOTO,
    ("support_case_cases", "strip_flicker_credit", "inputs.invoice"): INVOICE,
    **{
        (dataset, case, f"inputs.{field}"): media
        for dataset, case in (
            ("support_case_multimodal_demo", "flickering_strip_all_media"),
            ("support_case_csv_review", "imported_multimodal_case"),
            ("support_case_csv_ui_demo", "imported_multimodal_case"),
        )
        for field, media in ALL_MEDIA.items()
    },
}


def lumen() -> LoadedProject:
    loaded = load_project(LUMEN).project
    assert loaded is not None
    return loaded


def resolved_media(project: LoadedProject) -> Iterator[tuple[tuple[str, str, str], JsonValue]]:
    resolver = CaseMediaResolver(LUMEN, MemoryBlobStore())
    for dataset_id, source in sorted(project.datasets.items()):
        for case in source.spec.cases:
            yield from case_media(dataset_id, case, resolver.resolve_case_sync(case, source.path))


def case_media(
    dataset_id: str, case: DatasetCase, resolved: DatasetCase
) -> Iterator[tuple[tuple[str, str, str], JsonValue]]:
    inputs = resolved.inputs if isinstance(resolved.inputs, dict) else {}
    for location, _ in case_media_file_refs(case):
        yield (dataset_id, case.name, render_path(location)), inputs[str(location[-1])]


def test_lumen_cases_keep_their_media_as_files_that_resolve_to_the_former_blobs() -> None:
    project = lumen()

    resolved = dict(resolved_media(project))

    assert resolved == BEFORE_FILES


def test_lumen_datasets_hold_no_blob_ids_and_check_clean() -> None:
    texts = [path.read_text(encoding="utf-8") for path in sorted((LUMEN / "datasets").glob("*.yaml"))]

    assert texts
    assert not any("blob_id" in text for text in texts)
    assert [item for item in check_project(LUMEN).diagnostics if item.file.startswith("datasets/")] == []
