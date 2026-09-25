import argparse
import sys
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, TextIO

from aqven.client import new_client_op_id
from aqven.console.command import (
    EXIT_FAILED,
    EXIT_OK,
    EXIT_USAGE,
    PATH_HELP,
    Command,
    OutputFormat,
    add_format_argument,
)
from aqven.console.project_env import open_project
from aqven.datasets.materialize import (
    BLOB_PREFIX,
    SHORT_HASH_LENGTH,
    DatasetMaterialization,
    DatasetSource,
    LeftMedia,
    LeftReason,
    MaterializeError,
    MaterializeReport,
    MediaCopy,
    MediaMaterializer,
    ProjectFilesWriter,
    RewrittenMedia,
)
from aqven.diagnostics import format_text, render_path
from aqven.engine.blobs import FileBlobStore
from aqven.engine.config import EnginePaths
from aqven.engine.protocol import BLOBS_DIRECTORY, STATE_DIRECTORY
from aqven.loader import LoadedProject, load_project
from aqven.loader.aliases import AliasScope
from aqven.runtime import ClientOpId
from aqven.spec import DatasetId
from aqven.write import ExpectedFile, WriteActor, WriteError, WriteService
from aqven.write.model import FileBytesWriteRequest

ACTION_DESTINATION: Final = "datasets_action"
PROGRAM: Final = "aqven datasets materialize"
PACKAGE_METAVAR: Final = "PACKAGE"
DATASET_METAVAR: Final = "DATASET_ID"
WRITE_INTENT: Final = "datasets materialize: blob media of cases become files next to their datasets"
CLI_ACTOR: Final = WriteActor(kind="human", id="aqven-cli")
INDENT: Final = "  "
SHORT_BLOB_LENGTH: Final = len(BLOB_PREFIX) + SHORT_HASH_LENGTH
DRY_RUN_HEADER: Final = "dry run: nothing is written"
NOTHING_TO_DO: Final = "no dataset case points at a blob"
DATASET_IDS_HELP: Final = "datasets to go through; every dataset of the project without them"
DRY_RUN_HELP: Final = "print what would be copied and rewritten, write nothing"
BLOBS_HELP: Final = f"blob store folder to copy from; <project>/{STATE_DIRECTORY}/{BLOBS_DIRECTORY} by default"
MATERIALIZE_HELP: Final = (
    "copy the bytes behind blob_id media of dataset cases into datasets/<dataset_id>/ and rewrite those values "
    "as file references; exits 1 when a blob is missing from the store"
)
LEFT_TEXTS: Final[Mapping[LeftReason, str]] = {
    LeftReason.MISSING: "the blob is not in the blob store, the value stays a blob_id",
    LeftReason.EXTRA_FIELDS: "it carries url, poster_blob_id or note, which a file reference cannot hold",
    LeftReason.INVALID: "it is not a valid media value, fix it first",
}

type Failure = WriteError | MaterializeError | OSError | LookupError


@dataclass(frozen=True, slots=True)
class Verbs:
    copy: str
    rewrite: str


VERBS: Final[Mapping[bool, Verbs]] = {
    False: Verbs(copy="copied", rewrite="rewrote"),
    True: Verbs(copy="would copy", rewrite="would rewrite"),
}


class UnknownDatasets(ValueError):
    def __init__(self, missing: Sequence[str], known: Sequence[str]) -> None:
        listed = ", ".join(known) or "none"
        super().__init__(f"not in the project: {', '.join(missing)}; its datasets: {listed}")
        self.missing = tuple(missing)
        self.known = tuple(known)


@dataclass(frozen=True, slots=True)
class MaterializeRequest:
    root: Path
    dataset_ids: tuple[str, ...] = ()
    dry_run: bool = False
    output: OutputFormat = OutputFormat.TEXT
    blobs: Path | None = None

    @property
    def blob_folder(self) -> Path:
        return self.blobs if self.blobs is not None else EnginePaths(self.root).blobs


@dataclass(frozen=True, slots=True)
class ServiceFilesWriter:
    service: WriteService
    actor: WriteActor = CLI_ACTOR
    new_op_id: Callable[[], ClientOpId] = new_client_op_id

    def write(self, files: Mapping[str, bytes], expected: Mapping[str, str | None]) -> None:
        request = FileBytesWriteRequest(
            expects=[ExpectedFile(path=path, file_hash=digest) for path, digest in expected.items()],
            files=dict(files),
            client_op_id=self.new_op_id(),
            intent=WRITE_INTENT,
        )
        self.service.write_bytes(request, self.actor)


def chosen_datasets(project: LoadedProject, wanted: Sequence[str]) -> tuple[DatasetSource, ...]:
    known = tuple(sorted(project.datasets))
    missing = tuple(name for name in wanted if DatasetId(name) not in project.datasets)
    if missing:
        raise UnknownDatasets(missing, known)
    names = tuple(DatasetId(name) for name in dict.fromkeys(wanted)) or known
    return tuple(DatasetSource(name, project.datasets[name].path) for name in names)


def alias_scope(project: LoadedProject) -> AliasScope:
    return AliasScope(project.root.name, tuple(flow.folder for flow in project.flows.values()))


def materialized(
    request: MaterializeRequest, project: LoadedProject, writer: ProjectFilesWriter | None = None
) -> MaterializeReport:
    materializer = MediaMaterializer(request.root, FileBlobStore(request.blob_folder), alias_scope(project))
    plan = materializer.plan(chosen_datasets(project, request.dataset_ids))
    if not request.dry_run:
        materializer.apply(plan, writer or ServiceFilesWriter(WriteService(request.root)))
    return plan.report(dry_run=request.dry_run, blob_store=blob_store_label(request))


def materialize_datasets(
    request: MaterializeRequest, out: TextIO | None = None, writer: ProjectFilesWriter | None = None
) -> int:
    loaded = load_project(request.root)
    if loaded.project is None:
        print(f"{PROGRAM}: the project does not load, run aqven check", file=sys.stderr)
        print(format_text(loaded.diagnostics), file=sys.stderr)
        return EXIT_FAILED
    try:
        report = materialized(request, loaded.project, writer)
    except UnknownDatasets as error:
        print(f"{PROGRAM}: {error}", file=sys.stderr)
        return EXIT_USAGE
    except (WriteError, MaterializeError, OSError, LookupError) as error:
        print(f"{PROGRAM}: {failure_text(error)}", file=sys.stderr)
        return EXIT_FAILED
    print(RENDERERS[request.output](report), file=sys.stdout if out is None else out)
    return EXIT_FAILED if report.missing else EXIT_OK


def failure_text(error: Failure) -> str:
    if isinstance(error, WriteError) and error.problems:
        return f"{error}\n{format_text(error.problems)}"
    return str(error)


def blob_store_label(request: MaterializeRequest) -> str:
    folder = request.blob_folder
    return folder.relative_to(request.root).as_posix() if folder.is_relative_to(request.root) else folder.as_posix()


def render_text(report: MaterializeReport) -> str:
    header = (DRY_RUN_HEADER,) if report.dry_run else ()
    verbs = VERBS[report.dry_run]
    sections = (line for dataset in report.datasets if dataset.touched for line in dataset_lines(dataset, verbs))
    return "\n".join((*header, *sections, summary_line(report)))


def render_json(report: MaterializeReport) -> str:
    return report.model_dump_json(indent=2, by_alias=True)


RENDERERS: Final[Mapping[OutputFormat, Callable[[MaterializeReport], str]]] = {
    OutputFormat.TEXT: render_text,
    OutputFormat.JSON: render_json,
}


def dataset_lines(dataset: DatasetMaterialization, verbs: Verbs) -> Iterator[str]:
    yield f"{dataset.dataset_id}: {dataset.path}"
    yield from (copy_line(copy, verbs) for copy in dataset.copies)
    yield from (rewrite_line(item, verbs) for item in dataset.rewritten)
    yield from (left_line(item) for item in dataset.left)


def copy_line(copy: MediaCopy, verbs: Verbs) -> str:
    if copy.present:
        return f"{INDENT}kept {copy.file}: it already holds {short_blob(copy.blob_id)}"
    return f"{INDENT}{verbs.copy} {short_blob(copy.blob_id)} to {copy.file} ({counted(copy.size_bytes, 'byte')})"


def rewrite_line(item: RewrittenMedia, verbs: Verbs) -> str:
    named = f", name {item.reference.name}" if item.reference.name else ""
    return f"{INDENT}{verbs.rewrite} {place(item)} as file {item.reference.file}{named}"


def left_line(item: LeftMedia) -> str:
    blob = f" {short_blob(item.blob_id)}" if item.blob_id else ""
    return f"{INDENT}left {place(item)}{blob}: {LEFT_TEXTS[item.reason]}"


def place(item: RewrittenMedia | LeftMedia) -> str:
    where = render_path(item.location)
    return f"{where} of case {item.case}" if item.case else where


def summary_line(report: MaterializeReport) -> str:
    if not report.rewritten and not report.left:
        return NOTHING_TO_DO
    return (
        f"{counted(report.rewritten, 'value')} as {counted(report.files, 'file')} "
        f"({report.copied} copied from {report.blob_store}), {counted(report.left, 'value')} left, "
        f"{counted(report.missing, 'blob')} missing"
    )


def short_blob(blob_id: str) -> str:
    return blob_id[:SHORT_BLOB_LENGTH]


def counted(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


@dataclass(frozen=True, slots=True)
class DatasetsMaterializeCommand:
    help: str = MATERIALIZE_HELP

    def configure(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("path", metavar=PACKAGE_METAVAR, help=PATH_HELP)
        parser.add_argument("dataset_ids", nargs="*", metavar=DATASET_METAVAR, help=DATASET_IDS_HELP)
        parser.add_argument("--dry-run", action="store_true", help=DRY_RUN_HELP)
        parser.add_argument("--blobs", type=Path, default=None, metavar="DIR", help=BLOBS_HELP)
        add_format_argument(parser)

    def execute(self, arguments: argparse.Namespace) -> int:
        output = OutputFormat(str(arguments.format))
        root = open_project(Path(str(arguments.path)), output)
        if root is None:
            return EXIT_FAILED
        request = MaterializeRequest(
            root=root,
            dataset_ids=tuple(str(item) for item in arguments.dataset_ids),
            dry_run=bool(arguments.dry_run),
            output=output,
            blobs=arguments.blobs if isinstance(arguments.blobs, Path) else None,
        )
        return materialize_datasets(request)


DATASETS_ACTIONS: Final[Mapping[str, Command]] = {"materialize": DatasetsMaterializeCommand()}


@dataclass(frozen=True, slots=True)
class DatasetsCommand:
    help: str = "dataset files: turn blob media of cases into files next to the dataset"

    def configure(self, parser: argparse.ArgumentParser) -> None:
        actions = parser.add_subparsers(dest=ACTION_DESTINATION, required=True, metavar="ACTION")
        for name, action in DATASETS_ACTIONS.items():
            action.configure(actions.add_parser(name, help=action.help, description=action.help))

    def execute(self, arguments: argparse.Namespace) -> int:
        return DATASETS_ACTIONS[str(getattr(arguments, ACTION_DESTINATION))].execute(arguments)
