import hashlib
import importlib
import inspect
import json
import sys
from collections.abc import Callable, Iterator
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from types import ModuleType
from typing import Final, cast

from pydantic import JsonValue

from aqven.engine.addressing import NODE_ID_SEPARATOR
from aqven.engine.errors import CodeLoadError
from aqven.engine.loading import CodeLoader
from aqven.engine.projection import RunFold
from aqven.ir import CompiledCallNode, CompiledLlmNode, CompiledNode, CompiledProject
from aqven.policies.paths import pick
from aqven.runtime.address import JsonObject
from aqven.runtime.display_template import CompiledPresentationTemplate, compile_presentation_template
from aqven.runtime.presentation import (
    DisplayCard,
    DisplayDocument,
    DisplayElement,
    DisplayList,
    DisplayMedia,
    DisplayScalar,
    DisplaySection,
    PresentationContext,
    PresentationRequest,
    PresentationResponse,
    PresentationResult,
    PresentationTarget,
    pointer_value,
)
from aqven.runtime.values import InlineValue, ValueRef
from aqven.spec import FlowId, InferenceId, MediaValue, NodeId, RefRoot, parse_ref

type FormatterLoader = Callable[[str], Callable[..., object] | FormatterHandle]
type TemplateLoader = Callable[[str], TemplateHandle]
type BlobReader = Callable[[str], bytes]

FORMATTER_LOAD_LOCK: Final = Lock()


@dataclass(frozen=True, slots=True)
class FormatterHandle:
    function: Callable[..., object]
    version: str


@dataclass(frozen=True, slots=True)
class TemplateHandle:
    source: str
    templates: dict[str, str]
    version: str
    program: CompiledPresentationTemplate


@dataclass(frozen=True, slots=True)
class CurrentTemplateLoader:
    root: Path

    def load(self, ref: str) -> TemplateHandle:
        root = self.root.resolve()
        selected = (root / ref).resolve()
        if not ref.endswith(".display.liquid") or not selected.is_relative_to(root) or not selected.is_file():
            raise FileNotFoundError(f"display template {ref} is unavailable in the current project")
        templates: dict[str, str] = {}
        for path in sorted(root.rglob("*.liquid")):
            if not path.resolve().is_relative_to(root) or not path.is_file():
                continue
            name = path.relative_to(root).as_posix()
            source = path.read_text(encoding="utf-8")
            templates[name] = source
        if ref not in templates:
            raise FileNotFoundError(f"display template {ref} is unavailable in the current project")
        program = compile_presentation_template(templates[ref], templates, ref)
        digest = hashlib.sha256()
        for name in sorted(program.dependencies):
            source = templates[name]
            digest.update(name.encode("utf-8"))
            digest.update(b"\0")
            digest.update(source.encode("utf-8"))
            digest.update(b"\0")
        return TemplateHandle(
            source=templates[ref], templates=templates, version=f"sha256-{digest.hexdigest()}", program=program
        )


@dataclass(frozen=True, slots=True)
class CurrentFormatterLoader:
    loader: CodeLoader

    def load(self, ref: str) -> FormatterHandle:
        module_name, separator, attribute = ref.partition(":")
        if not separator or not module_name or not attribute:
            raise CodeLoadError(ref, "expected a module:function reference")
        path = self.loader.module_file(module_name)
        if path is None or not path.resolve().is_relative_to(self.loader.root.resolve()):
            raise CodeLoadError(ref, "formatter module is not in the current project")
        source = path.read_bytes()
        digest = hashlib.sha256(source).hexdigest()
        module = self._module(module_name, path, source, digest)
        function = getattr(module, attribute, None)
        if not callable(function):
            raise CodeLoadError(ref, f"module {module_name} has no function {attribute}")
        return FormatterHandle(function=function, version=f"sha256-{digest}")

    def _module(self, module_name: str, path: Path, source: bytes, digest: str) -> ModuleType:
        unique_name = f"{module_name}__aqven_display_{digest}"
        with FORMATTER_LOAD_LOCK:
            cached = sys.modules.get(unique_name)
            if cached is not None:
                return cached
            search_path = str(self.loader.search_path)
            if search_path not in sys.path:
                sys.path.append(search_path)
                importlib.invalidate_caches()
            package_name = module_name.rpartition(".")[0]
            if package_name:
                importlib.import_module(package_name)
            module = ModuleType(unique_name)
            module.__file__ = str(path)
            module.__package__ = package_name
            sys.modules[unique_name] = module
            try:
                exec(compile(source, str(path), "exec"), module.__dict__)
            except Exception:
                sys.modules.pop(unique_name, None)
                raise
            return module


def hydrate_ref(ref: ValueRef | None, read_blob: BlobReader) -> JsonValue:
    if ref is None:
        return None
    if isinstance(ref, InlineValue):
        return deepcopy(ref.value)
    mime_type = ref.media_type.partition(";")[0].strip().lower()
    text_value = mime_type == "application/json" or mime_type.endswith("+json") or mime_type.startswith("text/")
    if not text_value:
        return {"$media": mime_type, "blob_id": ref.blob_id, "size_bytes": ref.size_bytes, "name": None}
    raw = read_blob(ref.blob_id)
    text = raw.decode("utf-8")
    if mime_type == "application/json" or mime_type.endswith("+json"):
        return cast(JsonValue, json.loads(text))
    return text


def resolve_variables(
    refs: dict[str, str], input_value: JsonValue, output_value: JsonValue, run_context: JsonObject
) -> JsonObject:
    values: JsonObject = {}
    for name, text in refs.items():
        ref = parse_ref(text)
        match ref.root:
            case RefRoot.IN:
                head = input_value
            case RefRoot.OUT:
                head = output_value
            case RefRoot.RUN_CONTEXT:
                head = run_context.get(ref.key or "")
            case _:
                raise ValueError(f"{text} is not a display variable reference")
        values[name] = pick(head, ref.steps)
    return values


def _elements(root: DisplaySection | DisplayList | DisplayCard) -> Iterator[DisplayElement]:
    for child in root.children:
        yield child
        if isinstance(child, DisplaySection | DisplayList | DisplayCard):
            yield from _elements(child)


def validate_document(document: DisplayDocument, value: JsonValue) -> None:
    for element in _elements(document.root):
        if isinstance(element, DisplayMedia):
            media = pointer_value(value, element.path)
            if not isinstance(media, dict):
                raise ValueError(f"media path {element.path} does not reference a recorded media value")
            MediaValue.model_validate({**media, "name": media.get("name")})
        elif isinstance(element, DisplayScalar):
            paths = (element.path,) if element.path is not None else element.represented_paths
            for path in paths:
                found = pointer_value(value, path)
                if isinstance(found, dict | list):
                    raise ValueError(f"scalar path {path} points to a container")


def _unavailable(target: PresentationTarget, reason: str, formatter: str | None = None) -> PresentationResult:
    return PresentationResult(target=target, status="unavailable", formatter=formatter, error=reason)


def _node_for_address(plan: CompiledProject, flow_id: FlowId, address_node_id: str) -> CompiledNode | None:
    flow = plan.flows.get(flow_id)
    if flow is None:
        return None
    direct = flow.nodes.get(NodeId(address_node_id))
    if direct is not None:
        return direct
    calls = sorted(
        (node for node in flow.nodes.values() if isinstance(node, CompiledCallNode)),
        key=lambda node: len(node.node_id),
        reverse=True,
    )
    for call in calls:
        prefix = f"{call.node_id}{NODE_ID_SEPARATOR}"
        if address_node_id.startswith(prefix):
            return _node_for_address(plan, call.flow, address_node_id.removeprefix(prefix))
    return None


def present_batch(
    plan: CompiledProject,
    flow_id: FlowId,
    run_context: JsonObject,
    fold: RunFold,
    request: PresentationRequest,
    load_formatter: FormatterLoader,
    read_blob: BlobReader,
    load_template: TemplateLoader | None = None,
) -> PresentationResponse:
    template_cache: dict[str, TemplateHandle] = {}

    def cached_template(ref: str) -> TemplateHandle:
        if ref not in template_cache:
            if load_template is None:
                raise RuntimeError("display template loader is unavailable")
            template_cache[ref] = load_template(ref)
        return template_cache[ref]

    return PresentationResponse(
        results=tuple(
            _present_target(
                plan, flow_id, run_context, fold, request.locale, target, load_formatter, read_blob, cached_template
            )
            for target in request.targets
        )
    )


def _present_target(
    plan: CompiledProject,
    flow_id: FlowId,
    run_context: JsonObject,
    run_fold: RunFold,
    locale: str,
    target: PresentationTarget,
    load_formatter: FormatterLoader,
    read_blob: BlobReader,
    load_template: TemplateLoader,
) -> PresentationResult:
    fold = run_fold.execution(target.address)
    if fold is None:
        return _unavailable(target, "execution is not recorded")
    node = _node_for_address(plan, flow_id, target.address.node_id)
    if not isinstance(node, CompiledLlmNode):
        return _unavailable(target, "execution is not an inference")
    inference_id = InferenceId(fold.inference or node.inference)
    inference = plan.inferences.get(inference_id)
    declaration = inference.display if inference is not None else None
    formatter = getattr(declaration, target.side) if declaration is not None else None
    if formatter is None:
        return _unavailable(target, "no formatter declared")
    identity = formatter.run or formatter.template
    ref = fold.input_ref if target.side == "input" else fold.output_ref
    if ref is None:
        return _unavailable(target, f"recorded {target.side} is unavailable", identity)
    try:
        input_value = hydrate_ref(fold.input_ref, read_blob)
        output_value = hydrate_ref(fold.output_ref, read_blob)
        value = input_value if target.side == "input" else output_value
        context = PresentationContext(
            side=target.side,
            input=input_value,
            output=output_value,
            variables=resolve_variables(formatter.variables, input_value, output_value, run_context),
            variants=dict(fold.variants),
            model=fold.model,
            inference_id=inference_id,
            address=target.address,
            locale=locale,
        )
        if formatter.template is not None:
            loaded_template = load_template(formatter.template)
            document = loaded_template.program.render(context)
            version = loaded_template.version
        elif formatter.run is not None:
            loaded = load_formatter(formatter.run)
            function = loaded.function if isinstance(loaded, FormatterHandle) else loaded
            version = loaded.version if isinstance(loaded, FormatterHandle) else None
            raw = function(value, context)
            if inspect.isawaitable(raw):
                raise TypeError("formatter must be synchronous")
            document = DisplayDocument.model_validate(raw)
        else:
            raise ValueError("display declaration has no source")
        validate_document(document, value)
        return PresentationResult(
            target=target, status="formatted", formatter=identity, formatter_version=version, document=document
        )
    except Exception as error:
        return PresentationResult(target=target, status="error", formatter=identity, error=str(error))
