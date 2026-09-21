import keyword
import re
from pathlib import PurePosixPath
from typing import Final

from aqven.loader import code_file_parts
from aqven.spec import CODE_FILE_PATTERN, CODE_REF_PATTERN, CodeRef

CODE_FILE: Final = re.compile(CODE_FILE_PATTERN)
CODE_REF: Final = re.compile(CODE_REF_PATTERN)
MODULE_PART: Final = re.compile(r"[a-z_][a-z0-9_]*")
MODULE_SEPARATOR: Final = "."
FUNCTION_SEPARATOR: Final = ":"
PYTHON_SUFFIX: Final = ".py"


def absolute_code_ref(package: str, ref: str) -> CodeRef | None:
    if CODE_FILE.fullmatch(ref) is None:
        return CodeRef(ref) if CODE_REF.fullmatch(ref) is not None else None
    path, function = code_file_parts(ref)
    parts = (package, *PurePosixPath(path.removesuffix(PYTHON_SUFFIX)).parts)
    if not all(_module_part(part) for part in parts):
        return None
    return CodeRef(f"{MODULE_SEPARATOR.join(parts)}{FUNCTION_SEPARATOR}{function}")


def code_function(ref: CodeRef) -> str:
    return ref.rpartition(FUNCTION_SEPARATOR)[2]


def _module_part(part: str) -> bool:
    return MODULE_PART.fullmatch(part) is not None and not keyword.iskeyword(part)
