from collections.abc import Iterable

from aqven.check.context import CheckContext
from aqven.diagnostics import Diagnostic


def check_inference_risks(context: CheckContext) -> Iterable[Diagnostic]:
    return ()
