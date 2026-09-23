import os
import sys
from collections.abc import Callable, Iterable, Iterator, Mapping
from typing import Final, assert_never

from aqven.check.context import CheckContext
from aqven.codegen import (
    GENERATED_MODULE,
    GENERATED_TYPES,
    TYPES_PACKAGE_INIT,
    ArmStepShape,
    GeneratedTypes,
    InferenceShape,
    ShapeOwner,
    ShapeRecord,
    StepShape,
    ToolShape,
    project_plan,
    render_plan,
)
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic, templated_diagnostic
from aqven.loader import LoadedProject

PYTHONPATH_VARIABLE: Final = "PYTHONPATH"

type PathEntries = Callable[[], Iterable[str]]


def sys_path_entries() -> Iterable[str]:
    return tuple(sys.path)


def pythonpath_entries() -> Iterable[str]:
    return tuple(entry for entry in os.environ.get(PYTHONPATH_VARIABLE, "").split(os.pathsep) if entry)


PATH_SOURCES: Final[tuple[PathEntries, ...]] = (sys_path_entries, pythonpath_entries)

GENERATE_HINT: Final = "change the YAML source and run aqven generate"
STALE_TEXTS: Final[Mapping[bool, tuple[str, str]]] = {
    True: (
        f"{GENERATED_TYPES} does not match the YAML sources: this file is generated, edits are overwritten, "
        "change the YAML source",
        GENERATE_HINT,
    ),
    False: (
        f"{GENERATED_TYPES} is missing: it is generated from the YAML sources",
        f"run aqven generate to write {GENERATED_TYPES}",
    ),
}


def check_generated(context: CheckContext) -> Iterable[Diagnostic]:
    plan = project_plan(context.project)
    return (
        *_conflicts(context, plan.conflicts),
        *_stale(context, plan),
        *_types_package(context),
        *_module_on_path(context),
    )


def _stale(context: CheckContext, plan: GeneratedTypes) -> Iterator[Diagnostic]:
    target = context.project.root / GENERATED_TYPES
    exists = target.is_file()
    current = target.read_text(encoding="utf-8") if exists else ""
    if current == render_plan(plan):
        return
    message, hint = STALE_TEXTS[exists]
    yield diagnostic(DiagnosticCode.W_GENERATED_STALE, GENERATED_TYPES, (), message, hint=hint)


def _types_package(context: CheckContext) -> Iterator[Diagnostic]:
    if not (context.project.root / TYPES_PACKAGE_INIT).is_file():
        return
    models = f"{context.project.root.name}.{GENERATED_MODULE}"
    message = (
        f"{TYPES_PACKAGE_INIT} turns types/ into a regular package that shadows the generated {GENERATED_TYPES}, "
        f"so imports from {models} no longer reach the generated models"
    )
    hint = f"delete {TYPES_PACKAGE_INIT}: the types/ folder holds YAML type files only, models come from {models}"
    yield diagnostic(DiagnosticCode.E_TYPES_PACKAGE, TYPES_PACKAGE_INIT, (), message, hint=hint)


def _module_on_path(context: CheckContext) -> Iterator[Diagnostic]:
    root = os.path.realpath(context.project.root)
    if not any(root in _resolved(entries()) for entries in PATH_SOURCES):
        return
    values = {"module": context.project.root.name, "folder": root}
    yield templated_diagnostic(DiagnosticCode.W_TYPES_SHADOWS_STDLIB, GENERATED_TYPES, (), values)


def _resolved(entries: Iterable[str]) -> frozenset[str]:
    return frozenset(os.path.realpath(entry or os.curdir) for entry in entries)


def _conflicts(context: CheckContext, conflicts: Iterable[ShapeRecord]) -> Iterator[Diagnostic]:
    for record in conflicts:
        file, owner = _owner_site(context.project, record.owner)
        message = (
            f"input or output model {record.name} of {owner} collides with a name already taken in {GENERATED_TYPES}: "
            "it is missing from the generated file, rename the spec or the type"
        )
        yield diagnostic(DiagnosticCode.E_ID_DUPLICATE, file, (), message)


def _owner_site(project: LoadedProject, owner: ShapeOwner) -> tuple[str, str]:
    match owner:
        case InferenceShape(inference_id=inference_id):
            source = project.inferences[inference_id].source
            return (source.path if source is not None else GENERATED_TYPES), f"inference {inference_id}"
        case ToolShape(tool_id=tool_id):
            return project.tools[tool_id].path, f"tool {tool_id}"
        case StepShape(flow_id=flow_id, node_id=node_id):
            return project.flows[flow_id].nodes[node_id].path, f"code node {flow_id}.{node_id}"
        case ArmStepShape(experiment_id=experiment_id, arm_id=arm_id, node_id=node_id):
            node = project.experiments[experiment_id].arms[arm_id].nodes[node_id]
            return node.path, f"code node {node_id} of arm {arm_id} in experiment {experiment_id}"
        case _:
            assert_never(owner)
