from collections.abc import Iterator

from aqven.check.context import CheckContext
from aqven.diagnostics import Diagnostic, DiagnosticCode, templated_diagnostic
from aqven.loader import LoadedInference
from aqven.spec.output_enums import OutputEnumDefinition, collect_output_enums


def check_enum_definitions(context: CheckContext) -> Iterator[Diagnostic]:
    types = {type_id: source.spec for type_id, source in context.project.types.items()}
    for loaded in context.project.inferences.values():
        source = loaded.source
        if source is None or source.spec.enum_definitions != "manual":
            continue
        enums = collect_output_enums(source.spec.out, types)
        if not enums:
            continue
        yield _manual_warning(loaded, enums)


def _manual_warning(loaded: LoadedInference, enums: tuple[OutputEnumDefinition, ...]) -> Diagnostic:
    source = loaded.source
    assert source is not None
    targets = ", ".join(f"`{item.type_id}` (`{', '.join(item.paths)}`)" for item in enums)
    return templated_diagnostic(
        DiagnosticCode.W_ENUM_DEFINITIONS_MANUAL,
        source.path,
        ("enum_definitions",),
        {"inference": str(loaded.inference_id), "enums": targets},
    )
