from collections.abc import Iterable

from aqven.check.context import CheckContext
from aqven.check.usages import Usage, inference_usages
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.spec import CheckSpec, OnFail

HINT = "raise output.retries, or deliberately choose a non-retry failure policy"


def check_usage_risks(context: CheckContext) -> Iterable[Diagnostic]:
    return tuple(item for usage in inference_usages(context) for item in _retry_unavailable(usage))


def _retry_unavailable(usage: Usage) -> Iterable[Diagnostic]:
    if usage.agent.agent.output.retries != 0:
        return
    checks = sorted(_name(check) for check in usage.inference.checks or () if check.on_fail is OnFail.RETRY)
    if not checks:
        return
    message = (
        f"Inference `{usage.inference_id}` has retry checks {', '.join(f'`{name}`' for name in checks)}, but agent "
        f"`{usage.agent_id}` has `output.retries: 0`; a rejected output cannot start another model attempt."
    )
    yield diagnostic(
        DiagnosticCode.W_CHECK_RETRY_UNAVAILABLE,
        usage.file,
        usage.path,
        message,
        hint=HINT,
    )


def _name(check: CheckSpec) -> str:
    return check.use or check.run or check.inference or ""
