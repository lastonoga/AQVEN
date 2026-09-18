import inspect
import posixpath
from collections.abc import Iterable, Iterator

from aqven.check.context import CheckContext
from aqven.check.resolver import CodeFailure
from aqven.check.scopes import InferenceScope, Unresolved
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import include_candidates
from aqven.runtime.display_template import validate_presentation_template
from aqven.spec import DisplayFormatterSpec, RefRoot, parse_ref


def check_display(context: CheckContext) -> Iterable[Diagnostic]:
    return tuple(
        issue
        for loaded in context.project.inferences.values()
        if loaded.source is not None and loaded.source.spec.display is not None
        for side, formatter in (
            ("input", loaded.source.spec.display.input),
            ("output", loaded.source.spec.display.output),
        )
        if formatter is not None
        for issue in _formatter(context, loaded.inference_id, loaded.source.path, side, formatter)
    )


def _formatter(
    context: CheckContext, inference_id: str, file: str, side: str, formatter: DisplayFormatterSpec
) -> Iterator[Diagnostic]:
    if formatter.run is not None:
        run_path = ("display", side, "run")
        resolved = context.code.resolve(formatter.run)
        if isinstance(resolved, CodeFailure):
            yield diagnostic(
                DiagnosticCode.E_CODE_REF_UNRESOLVED,
                file,
                run_path,
                f"formatter {formatter.run} does not resolve: {resolved.message}",
            )
        elif not _valid_signature(resolved.value):
            yield diagnostic(
                DiagnosticCode.E_CODE_SIGNATURE_MISMATCH,
                file,
                run_path,
                f"formatter {formatter.run} must be a synchronous function taking (value, context)",
            )
    if formatter.template is not None:
        path = ("display", side, "template")
        candidates = include_candidates((posixpath.dirname(file),), formatter.template)
        found = next((candidate for candidate in candidates if candidate in context.project.texts), None)
        if found is None:
            yield diagnostic(
                DiagnosticCode.E_PROMPT_MISSING, file, path, f"display template {formatter.template} is missing"
            )
        else:
            try:
                templates = {key: value for key, value in context.project.texts.items() if key.endswith(".liquid")}
                validate_presentation_template(context.project.texts[found], templates, found)
            except Exception as error:
                yield diagnostic(DiagnosticCode.E_PROMPT_SYNTAX, file, path, f"invalid display template: {error}")
    for name, ref in formatter.variables.items():
        path = ("display", side, "variables", name)
        parsed = parse_ref(ref)
        if parsed.root is RefRoot.RUN_CONTEXT:
            continue
        if parsed.root not in (RefRoot.IN, RefRoot.OUT):
            message = f"display variable {name} must use $in, $out, or $run.context"
            yield diagnostic(DiagnosticCode.E_REF_SCOPE, file, path, message)
            continue
        result = context.refs.resolve_inference(InferenceScope(inference_id), ref)
        if isinstance(result, Unresolved):
            yield diagnostic(result.code, file, path, result.message)


def _valid_signature(value: object) -> bool:
    if not inspect.isfunction(value) or inspect.iscoroutinefunction(value):
        return False
    parameters = tuple(inspect.signature(value).parameters.values())
    return (
        len(parameters) == 2
        and all(parameter.kind is inspect.Parameter.POSITIONAL_OR_KEYWORD for parameter in parameters)
        and tuple(parameter.name for parameter in parameters) == ("value", "context")
    )
