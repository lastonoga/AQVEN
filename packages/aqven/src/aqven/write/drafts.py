from collections.abc import Callable
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from pydantic import ValidationError

from aqven.runtime.address import ResourceModel
from aqven.write.model import DraftView, DraftWrite, WriteActor
from aqven.write.notices import DraftStale
from aqven.write.paths import DRAFTS_FOLDER, checked_path, disk_hash, prune_empty_folders, replace_durable

DRAFT_SUFFIX: Final = ".draft"
META_SUFFIX: Final = ".meta.json"
BASE_SUFFIX: Final = ".base"
SUFFIXES: Final = (DRAFT_SUFFIX, META_SUFFIX, BASE_SUFFIX)


class DraftMeta(ResourceModel):
    base_file_hash: str | None
    updated_at: str
    actor: WriteActor


@dataclass(frozen=True, slots=True)
class DraftStore:
    root: Path
    clock: Callable[[], str]

    def put(self, path: str, write: DraftWrite, actor: WriteActor) -> DraftView:
        checked_path(path)
        current = disk_hash(self.root, path)
        previous = self._meta(path)
        meta = DraftMeta(base_file_hash=write.base_file_hash, updated_at=self.clock(), actor=actor)
        replace_durable(self._location(path, DRAFT_SUFFIX), write.text.encode("utf-8"))
        replace_durable(self._location(path, META_SUFFIX), meta.model_dump_json().encode("utf-8"))
        self._keep_base(path, write.base_file_hash, current, previous)
        return self._view(path, write.text, meta, current)

    def get(self, path: str) -> DraftView | None:
        checked_path(path)
        meta = self._meta(path)
        draft = self._location(path, DRAFT_SUFFIX)
        if meta is None or not draft.is_file():
            return None
        return self._view(path, draft.read_text(encoding="utf-8"), meta, disk_hash(self.root, path))

    def delete(self, path: str) -> bool:
        checked_path(path)
        existed = self._location(path, DRAFT_SUFFIX).is_file()
        for suffix in SUFFIXES:
            with suppress(FileNotFoundError):
                self._location(path, suffix).unlink()
        prune_empty_folders(self.root, self.files(path), DRAFTS_FOLDER)
        return existed

    def files(self, path: str) -> tuple[str, ...]:
        return tuple(f"{DRAFTS_FOLDER}/{path}{suffix}" for suffix in SUFFIXES)

    def base_text(self, path: str) -> str | None:
        base = self._location(path, BASE_SUFFIX)
        return base.read_text(encoding="utf-8") if base.is_file() else None

    def stale_notice(self, path: str, file_hash: str | None) -> DraftStale | None:
        meta = self._meta(path)
        if meta is None or meta.base_file_hash == file_hash:
            return None
        return DraftStale(path=path, base_file_hash=meta.base_file_hash, file_hash=file_hash)

    def _keep_base(self, path: str, base_hash: str | None, current: str | None, previous: DraftMeta | None) -> None:
        if previous is not None and previous.base_file_hash == base_hash:
            return
        base = self._location(path, BASE_SUFFIX)
        if base_hash is None or current != base_hash:
            base.unlink(missing_ok=True)
            return
        replace_durable(base, (self.root / path).read_bytes())

    def _meta(self, path: str) -> DraftMeta | None:
        try:
            return DraftMeta.model_validate_json(self._location(path, META_SUFFIX).read_bytes())
        except FileNotFoundError, ValidationError:
            return None

    def _location(self, path: str, suffix: str) -> Path:
        return self.root / DRAFTS_FOLDER / f"{path}{suffix}"

    def _view(self, path: str, text: str, meta: DraftMeta, current: str | None) -> DraftView:
        return DraftView(
            path=path,
            text=text,
            base_file_hash=meta.base_file_hash,
            updated_at=meta.updated_at,
            actor=meta.actor,
            stale=meta.base_file_hash != current,
            file_hash=current,
        )
