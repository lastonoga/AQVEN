import json
import os
import shutil
from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Final

from pydantic import BaseModel, ConfigDict, ValidationError

from aqven.agent_files.place import ENCODING, Action, AgentPlace, Change, Drift, disk_digest, file_digest, write_text

COPIES_FOLDER: Final = PurePosixPath(".agents", "skills")
LINKS_FOLDER: Final = PurePosixPath(".claude", "skills")
MANIFEST_FILE: Final = COPIES_FOLDER / ".aqven-skills.json"
LINK_TARGET: Final = PurePosixPath("..", "..") / COPIES_FOLDER
SKIPPED_NAMES: Final = frozenset({"references.txt", ".DS_Store"})
SKIPPED_PARTS: Final = frozenset({"__pycache__"})
SKIPPED_SUFFIXES: Final = frozenset({".pyc"})
SKILL_FILE: Final = "SKILL.md"


class SkillManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    aqven: str
    files: dict[str, str]


@dataclass(frozen=True, slots=True)
class SkillFile:
    relative: PurePosixPath
    content: bytes

    @property
    def skill(self) -> str:
        return self.relative.parts[0]

    @property
    def digest(self) -> str:
        return file_digest(self.content)


def packaged(relative: PurePosixPath) -> bool:
    if relative.name in SKIPPED_NAMES or relative.suffix in SKIPPED_SUFFIXES:
        return False
    return not SKIPPED_PARTS.intersection(relative.parts)


def skill_files(skills: Path) -> tuple[SkillFile, ...]:
    found = (
        (PurePosixPath(path.relative_to(skills).as_posix()), path)
        for path in sorted(skills.rglob("*"))
        if path.is_file()
    )
    return tuple(SkillFile(relative, path.read_bytes()) for relative, path in found if packaged(relative))


def skill_names(found: tuple[SkillFile, ...]) -> tuple[str, ...]:
    return tuple(sorted({item.skill for item in found if item.relative.name == SKILL_FILE}))


def expected_manifest(place: AgentPlace, found: tuple[SkillFile, ...]) -> SkillManifest:
    return SkillManifest(aqven=place.version, files={item.relative.as_posix(): item.digest for item in found})


def read_manifest(place: AgentPlace) -> SkillManifest | None:
    path = place.path(MANIFEST_FILE)
    if not path.is_file():
        return None
    try:
        return SkillManifest.model_validate_json(path.read_bytes())
    except ValidationError:
        return None


def manifest_text(manifest: SkillManifest) -> str:
    return json.dumps(manifest.model_dump(mode="json"), indent=2, sort_keys=True) + "\n"


def recorded_skills(manifest: SkillManifest | None) -> frozenset[str]:
    if manifest is None:
        return frozenset()
    return frozenset(PurePosixPath(path).parts[0] for path in manifest.files)


def files_text(count: int) -> str:
    return "1 file" if count == 1 else f"{count} files"


def copy_path(place: AgentPlace, relative: PurePosixPath | str) -> Path:
    return place.path(COPIES_FOLDER / relative)


def changed_files(place: AgentPlace, found: tuple[SkillFile, ...]) -> tuple[SkillFile, ...]:
    return tuple(item for item in found if disk_digest(copy_path(place, item.relative)) != item.digest)


def stale_files(place: AgentPlace, previous: SkillManifest | None, found: tuple[SkillFile, ...]) -> tuple[str, ...]:
    if previous is None:
        return ()
    current = frozenset(item.relative.as_posix() for item in found)
    return tuple(path for path in sorted(previous.files) if path not in current and copy_path(place, path).exists())


def remove_empty_parents(path: Path, stop: Path) -> None:
    folder = path.parent
    while folder != stop and folder.is_dir() and not any(folder.iterdir()):
        folder.rmdir()
        folder = folder.parent


def per_skill(paths: Iterable[PurePosixPath]) -> Mapping[str, int]:
    return Counter(path.parts[0] for path in paths)


@dataclass(frozen=True, slots=True)
class SkillCopies:
    previous: SkillManifest | None

    def drift(self, place: AgentPlace) -> tuple[Drift, ...]:
        found = skill_files(place.skills)
        return (
            *self.manifest_drift(place, found),
            *(self.file_drift(place, item) for item in changed_files(place, found)),
            *(
                Drift(self.shown(path), "is no longer part of the engine")
                for path in stale_files(place, self.previous, found)
            ),
        )

    def manifest_drift(self, place: AgentPlace, found: tuple[SkillFile, ...]) -> tuple[Drift, ...]:
        manifest = read_manifest(place)
        if manifest is None:
            return (Drift(MANIFEST_FILE.as_posix(), "is missing: the skills were never synced"),)
        if manifest.aqven != place.version:
            return (Drift(MANIFEST_FILE.as_posix(), f"was written by aqven {manifest.aqven}"),)
        if manifest != expected_manifest(place, found):
            return (Drift(MANIFEST_FILE.as_posix(), "lists other files than the installed engine ships"),)
        return ()

    def file_drift(self, place: AgentPlace, item: SkillFile) -> Drift:
        exists = copy_path(place, item.relative).is_file()
        problem = "differs from the installed engine" if exists else "is missing"
        return Drift(self.shown(item.relative.as_posix()), problem)

    def shown(self, relative: str) -> str:
        return (COPIES_FOLDER / relative).as_posix()

    def sync(self, place: AgentPlace) -> tuple[Change, ...]:
        found = skill_files(place.skills)
        written = changed_files(place, found)
        for item in written:
            destination = copy_path(place, item.relative)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(item.content)
        removed = stale_files(place, self.previous, found)
        for path in removed:
            target = copy_path(place, path)
            target.unlink()
            remove_empty_parents(target, place.path(COPIES_FOLDER))
        manifest = self.write_manifest(place, found)
        return (
            *self.per_skill_changes(Action.WROTE, per_skill(item.relative for item in written)),
            *self.per_skill_changes(Action.REMOVED, per_skill(PurePosixPath(path) for path in removed)),
            *manifest,
        )

    def per_skill_changes(self, action: Action, counts: Mapping[str, int]) -> tuple[Change, ...]:
        return tuple(Change(action, self.shown(skill), files_text(count)) for skill, count in sorted(counts.items()))

    def write_manifest(self, place: AgentPlace, found: tuple[SkillFile, ...]) -> tuple[Change, ...]:
        text = manifest_text(expected_manifest(place, found))
        path = place.path(MANIFEST_FILE)
        if path.is_file() and path.read_text(encoding=ENCODING) == text:
            return ()
        write_text(path, text)
        return (Change(Action.WROTE, MANIFEST_FILE.as_posix(), f"aqven {place.version}"),)


def link_target(skill: str) -> PurePosixPath:
    return LINK_TARGET / skill


def copy_matches(folder: Path, found: tuple[SkillFile, ...]) -> bool:
    expected = {item.relative.relative_to(item.skill).as_posix(): item.digest for item in found}
    present = {
        path.relative_to(folder).as_posix(): file_digest(path.read_bytes())
        for path in folder.rglob("*")
        if path.is_file()
    }
    return present == expected


def removed_entry(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink()
        return
    shutil.rmtree(path)


@dataclass(frozen=True, slots=True)
class SkillLinks:
    previous: SkillManifest | None

    def drift(self, place: AgentPlace) -> tuple[Drift, ...]:
        found = skill_files(place.skills)
        problems = ((skill, self.problem(place, skill, found)) for skill in skill_names(found))
        current = (Drift(self.shown(skill), problem) for skill, problem in problems if problem is not None)
        return (
            *current,
            *(Drift(self.shown(skill), "is no longer part of the engine") for skill in self.stale(place, found)),
        )

    def problem(self, place: AgentPlace, skill: str, found: tuple[SkillFile, ...]) -> str | None:
        path = place.path(LINKS_FOLDER / skill)
        if path.is_symlink():
            target = PurePosixPath(os.readlink(path))
            return None if target == link_target(skill) else f"links to {target.as_posix()}"
        if not path.exists():
            return "is missing"
        own = tuple(item for item in found if item.skill == skill)
        return None if path.is_dir() and copy_matches(path, own) else "differs from the installed engine"

    def stale(self, place: AgentPlace, found: tuple[SkillFile, ...]) -> tuple[str, ...]:
        current = frozenset(skill_names(found))
        old = sorted(recorded_skills(self.previous) - current)
        return tuple(skill for skill in old if self.present(place.path(LINKS_FOLDER / skill)))

    def present(self, path: Path) -> bool:
        return path.is_symlink() or path.exists()

    def shown(self, skill: str) -> str:
        return (LINKS_FOLDER / skill).as_posix()

    def sync(self, place: AgentPlace) -> tuple[Change, ...]:
        found = skill_files(place.skills)
        broken = tuple(skill for skill in skill_names(found) if self.problem(place, skill, found) is not None)
        placed = tuple(self.place_skill(place, skill) for skill in broken)
        stale = self.stale(place, found)
        for skill in stale:
            removed_entry(place.path(LINKS_FOLDER / skill))
        return (*placed, *(Change(Action.REMOVED, self.shown(skill)) for skill in stale))

    def place_skill(self, place: AgentPlace, skill: str) -> Change:
        path = place.path(LINKS_FOLDER / skill)
        if self.present(path):
            removed_entry(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            path.symlink_to(link_target(skill), target_is_directory=True)
        except OSError:
            shutil.copytree(copy_path(place, skill), path)
            return Change(Action.COPIED, self.shown(skill), "this system refused a symbolic link")
        return Change(Action.LINKED, self.shown(skill), f"to {link_target(skill).as_posix()}")
