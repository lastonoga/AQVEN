from collections.abc import Iterable, Iterator

from pydantic import ValidationError

from aqven.check.context import CheckContext
from aqven.check.graph import NodeEntry
from aqven.check.nodes import typed_entries
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.spec import DefaultOnTimeout, HumanNodeSpec, RecordType, TypeId, TypeModelError


def check_human(context: CheckContext) -> Iterable[Diagnostic]:
    return tuple(
        item for entry, spec in typed_entries(context.graph, HumanNodeSpec) for item in _human(context, entry, spec)
    )


def _human(context: CheckContext, entry: NodeEntry, spec: HumanNodeSpec) -> Iterator[Diagnostic]:
    source = context.project.types.get(TypeId(spec.form))
    if source is None:
        return
    if not isinstance(source.spec, RecordType):
        message = f"form {spec.form} is {source.spec.type}, but a human form must be a registry record"
        yield diagnostic(DiagnosticCode.E_HUMAN_FORM_TYPE, entry.file, ("form",), message)
        return
    policy = spec.on_timeout
    if not isinstance(policy, DefaultOnTimeout):
        return
    yield from _default_value(context, entry, spec.form, policy)


def _default_value(
    context: CheckContext, entry: NodeEntry, form: str, policy: DefaultOnTimeout
) -> Iterator[Diagnostic]:
    try:
        model = context.type_models.model(TypeId(form))
    except TypeModelError:
        return
    try:
        model.model_validate(policy.value)
    except ValidationError as error:
        problems = "; ".join(f"{'.'.join(str(part) for part in item['loc'])}: {item['msg']}" for item in error.errors())
        message = f"on_timeout.value does not pass the model of form {form}: {problems}"
        yield diagnostic(DiagnosticCode.E_HUMAN_DEFAULT_INVALID, entry.file, ("on_timeout", "value"), message)
