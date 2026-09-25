from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Final

from aqven.datasets import (
    BlobWriter,
    CaseMediaResolver,
    MediaFileError,
    MediaFileMissing,
    MediaFileRefInvalid,
    MediaPathInvalid,
    MediaRefUnresolved,
    has_media_file_refs,
    with_media_placeholders,
)
from aqven.diagnostics import DiagnosticCode
from aqven.runtime.address import Problem
from aqven.server.errors import ApiFailure
from aqven.spec import DatasetCase

CASES_KEY: Final = "cases"

type BlobWriters = Callable[[Path], BlobWriter]

MEDIA_PROBLEM_CODES: Final[Mapping[type[MediaFileError], DiagnosticCode]] = {
    MediaFileMissing: DiagnosticCode.E_MEDIA_FILE_MISSING,
    MediaPathInvalid: DiagnosticCode.E_MEDIA_PATH_INVALID,
    MediaFileRefInvalid: DiagnosticCode.E_SPEC_INVALID,
}


def case_media_resolver(root: Path, blobs: BlobWriters) -> CaseMediaResolver:
    return CaseMediaResolver(root, blobs(root))


def media_problem(case: DatasetCase, error: MediaRefUnresolved) -> Problem:
    code = MEDIA_PROBLEM_CODES.get(type(error.reason), DiagnosticCode.E_SPEC_INVALID)
    return Problem(path=(CASES_KEY, case.name, *error.location), code=code.value, message=str(error.reason))


async def case_with_media(resolver: CaseMediaResolver, case: DatasetCase, dataset_path: str) -> DatasetCase:
    try:
        return await resolver.resolve_case(case, dataset_path)
    except MediaRefUnresolved as error:
        message = f"{dataset_path}: {error}: a case runs only when every media file it points at can be read"
        raise ApiFailure("NOT_RUNNABLE", message, problems=(media_problem(case, error),)) from error


def case_with_placeholders(case: DatasetCase) -> DatasetCase:
    if not has_media_file_refs(case):
        return case
    node_outputs = {node: with_media_placeholders(value) for node, value in (case.node_outputs or {}).items()}
    return case.model_copy(
        update={
            "inputs": with_media_placeholders(case.inputs),
            "node_outputs": node_outputs if case.node_outputs is not None else None,
            "expected_output": with_media_placeholders(case.expected_output),
        }
    )
