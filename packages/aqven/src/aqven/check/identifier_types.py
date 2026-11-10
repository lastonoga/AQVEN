from collections.abc import Iterable

from aqven.check.context import CheckContext
from aqven.diagnostics import Diagnostic


def check_identifier_types(context: CheckContext) -> Iterable[Diagnostic]:
    return ()
