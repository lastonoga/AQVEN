import posixpath
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from liquid.exceptions import LiquidError, TemplateNotFoundError

from aqven.check.inferences import variant_file
from aqven.check.templates import SERVICE_TAGS, IncludeLoader, prompt_environment
from aqven.compiler.context import CompileContext
from aqven.compiler.errors import compile_failure
from aqven.diagnostics import DiagnosticCode
from aqven.ir import CodePrompt, CompiledPrompt, CompiledVariantSlot, TemplatePrompt
from aqven.loader import VARIANTS_FOLDER, LoadedInference, SourceSpec, YamlPath, include_candidates, text_file
from aqven.spec import InferenceSpec, VariantSlot

PROMPT_KEY: Final = "prompt"
CASES_KEY: Final = "cases"
DEFAULT_KEY: Final = "default"
REF_PREFIX: Final = "$"
IN_PREFIX: Final = "$in."
INSTRUCTION_LEVEL: Final = 1
TEMPLATE_LEVEL: Final = 2


@dataclass(frozen=True, slots=True)
class PromptParts:
    prompt: CompiledPrompt
    variants: dict[str, CompiledVariantSlot]


@dataclass(frozen=True, slots=True)
class ParsedText:
    file: str
    text: str
    dynamic: bool
    served: Mapping[str, str]


@dataclass(frozen=True, slots=True)
class CompiledSlot:
    slot: CompiledVariantSlot
    texts: tuple[ParsedText, ...]


def inference_prompt(
    context: CompileContext, loaded: LoadedInference, source: SourceSpec[InferenceSpec]
) -> PromptParts:
    spec = source.spec
    if spec.prompt_code is not None:
        return PromptParts(CodePrompt(run=context.code(spec.prompt_code, source.path, (PROMPT_KEY,))), {})
    main = parse_text(context, loaded, _main_file(context, loaded, source))
    slots = {name: _slot(context, loaded, source, name, slot) for name, slot in (spec.variants or {}).items()}
    parsed = (main, *(text for compiled in slots.values() for text in compiled.texts))
    template = TemplatePrompt(
        level=TEMPLATE_LEVEL if main.dynamic or slots else INSTRUCTION_LEVEL,
        template=main.text,
        partials=_partials(context, source.path, parsed),
    )
    return PromptParts(template, {name: compiled.slot for name, compiled in slots.items()})


def parse_text(context: CompileContext, loaded: LoadedInference, file: str) -> ParsedText:
    text = context.project.texts[file]
    loader = IncludeLoader(context.project.texts, (posixpath.dirname(file), loaded.folder))
    try:
        analysis = prompt_environment(loader).from_string(text, name=file).analyze(include_partials=True)
    except TemplateNotFoundError as error:
        raise compile_failure(DiagnosticCode.E_FRAGMENT_MISSING, file, (), f"fragment not found: {error}") from error
    except LiquidError as error:
        raise compile_failure(DiagnosticCode.E_PROMPT_SYNTAX, file, (), f"template does not parse: {error}") from error
    dynamic = bool(analysis.globals) or bool(set(analysis.tags) - SERVICE_TAGS)
    return ParsedText(file=file, text=text, dynamic=dynamic, served=dict(loader.served))


def variant_selector(on: str) -> str:
    return on if on.startswith(REF_PREFIX) else f"{IN_PREFIX}{on}"


def _main_file(context: CompileContext, loaded: LoadedInference, source: SourceSpec[InferenceSpec]) -> str:
    written = source.spec.prompt_path
    candidates = (
        (text_file(loaded.stem, PROMPT_KEY),) if written is None else include_candidates((loaded.folder,), written)
    )
    missing = f"prompt not found: looked for {', '.join(candidates)}"
    return context.text_file(candidates, source.path, (PROMPT_KEY,), missing)


def _slot(
    context: CompileContext,
    loaded: LoadedInference,
    source: SourceSpec[InferenceSpec],
    name: str,
    slot: VariantSlot,
) -> CompiledSlot:
    path: YamlPath = (VARIANTS_FOLDER, name)
    cases = {
        value: _variant(context, loaded, source, name, variant, (*path, CASES_KEY, value))
        for value, variant in slot.cases.items()
    }
    default = (
        _variant(context, loaded, source, name, slot.default, (*path, DEFAULT_KEY))
        if slot.default is not None
        else None
    )
    compiled = CompiledVariantSlot(
        on=variant_selector(slot.on),
        cases={value: parsed.text for value, parsed in cases.items()},
        default=default.text if default is not None else None,
    )
    return CompiledSlot(compiled, (*cases.values(), *((default,) if default is not None else ())))


def _variant(
    context: CompileContext,
    loaded: LoadedInference,
    source: SourceSpec[InferenceSpec],
    slot: str,
    variant: str,
    path: YamlPath,
) -> ParsedText:
    file = variant_file(context.check, loaded, slot, variant)
    if file is None:
        message = f"variant {variant} of slot {slot} does not exist"
        raise compile_failure(DiagnosticCode.E_VARIANT_MISSING, source.path, path, message)
    return parse_text(context, loaded, file)


def _partials(context: CompileContext, file: str, parsed: Sequence[ParsedText]) -> dict[str, str]:
    served = sorted({(name, found) for text in parsed for name, found in text.served.items()})
    names = [name for name, _ in served]
    conflicts = sorted({name for name in names if names.count(name) > 1})
    if conflicts:
        message = f"fragments {', '.join(conflicts)} resolve to different files from the prompt and the variants"
        raise compile_failure(DiagnosticCode.E_SOURCE_CONFLICT, file, (PROMPT_KEY,), message)
    return {name: context.project.texts[found] for name, found in served}
