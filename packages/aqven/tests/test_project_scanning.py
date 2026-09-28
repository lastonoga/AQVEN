import os
from pathlib import Path
from typing import Final

from aqven.loader import SPEC_SUFFIXES, is_spec_path, load_project, project_files, spec_files
from aqven.loader import project as loader_project
from aqven.loader.digests import DigestCache
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parent / "fixtures" / "fixture_shop"


def write_bytes(root: Path, relative: str, data: bytes) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


def test_the_listing_skips_hidden_and_cache_folders_without_entering_them(tmp_path: Path) -> None:
    write_bytes(tmp_path, "flows/intake/flow.yaml", b"kind: Flow\n")
    write_bytes(tmp_path, "samples/photo.jpg", b"jpeg")
    write_bytes(tmp_path, ".aqven/blobs/sha256-1", b"blob")
    write_bytes(tmp_path, ".git/HEAD", b"ref")
    write_bytes(tmp_path, "code/__pycache__/step.cpython-314.pyc", b"pyc")
    write_bytes(tmp_path, "node_modules/left-pad/index.js", b"js")
    write_bytes(tmp_path, "samples/.DS_Store", b"finder")

    assert project_files(tmp_path) == ("flows/intake/flow.yaml", "samples/photo.jpg")


def test_the_listing_does_not_follow_a_linked_folder(tmp_path: Path) -> None:
    outside = tmp_path / "outside"
    write_bytes(outside, "big.mp4", b"video")
    root = tmp_path / "project"
    write_bytes(root, "aqven.yaml", b"kind: Project\n")
    os.symlink(outside, root / "linked")

    assert project_files(root) == ("aqven.yaml",)


def test_spec_files_keep_only_the_suffixes_the_loader_reads(tmp_path: Path) -> None:
    root = copy_project(FIXTURE, tmp_path)
    write_bytes(root, "samples/raw/photo_0001.jpg", b"jpeg")
    write_bytes(root, "samples/raw/clip.mp4", b"mp4")
    write_bytes(root, "samples/notes.md", b"# notes\n")

    listed = spec_files(root)

    assert "samples/notes.md" in listed
    assert not any(path.startswith("samples/raw/") for path in listed)
    assert all(is_spec_path(path) for path in listed)


def test_the_loader_reads_exactly_the_spec_suffixes() -> None:
    assert frozenset(loader_project.FILE_READERS) == SPEC_SUFFIXES


def test_the_loaded_project_carries_the_spec_files_it_was_read_from(tmp_path: Path) -> None:
    root = copy_project(FIXTURE, tmp_path)
    write_bytes(root, "samples/raw/photo_0001.jpg", b"jpeg")

    loaded = load_project(root).project

    assert loaded is not None
    assert loaded.sources == spec_files(root)


def test_a_digest_is_reused_until_the_file_changes(tmp_path: Path) -> None:
    target = tmp_path / "clip.mp4"
    target.write_bytes(b"first take")
    cache = DigestCache()

    first = cache.file_hash(target)
    again = cache.file_hash(target)
    target.write_bytes(b"other take")
    changed = cache.file_hash(target)

    assert first == again
    assert changed != first
    assert changed == DigestCache().file_hash(target)


def test_a_full_digest_cache_starts_over(tmp_path: Path) -> None:
    cache = DigestCache(limit=2)
    for index in range(3):
        write_bytes(tmp_path, f"clip_{index}.mp4", bytes([index]))
        cache.file_hash(tmp_path / f"clip_{index}.mp4")

    assert len(cache.known) == 1
