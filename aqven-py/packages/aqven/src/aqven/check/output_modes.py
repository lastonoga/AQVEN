import re
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from functools import cache
from typing import Final

from pydantic_ai.exceptions import UserError
from pydantic_ai.models import infer_model_profile
from pydantic_ai.profiles import ModelProfile as ProviderProfile

from aqven.check.context import CheckContext, ResolvedAgent
from aqven.diagnostics import Diagnostic, DiagnosticCode, templated_diagnostic
from aqven.loader import YamlPath
from aqven.models.providers import declared_capabilities
from aqven.spec import OutputModeSetting, OutputModeSource, ProviderSpec, StructuredMode
from aqven_llm import ProviderCapabilities

MODE_PREFERENCE: Final[tuple[StructuredMode, ...]] = ("tool", "native", "prompted")
UNIVERSAL_MODE: Final[StructuredMode] = "prompted"
PROFILE_DEFAULT_MODE: Final[StructuredMode] = "tool"
MODE_PATH: Final[YamlPath] = ("output", "mode")
MODE_SEPARATOR: Final = ", "
DECLARED_REASON: Final = "output.mode is set explicitly"

JSON_ONLY_INSTRUCTION: Final = (
    "Give the final answer as the JSON object only: no Markdown fences, no text before or after it, "
    "and never put the answer into a tool call."
)


@dataclass(frozen=True, slots=True)
class KnownModel:
    pattern: re.Pattern[str]
    mode: StructuredMode
    reason: str
    instruction: str | None = None


KNOWN_MODELS: Final[tuple[KnownModel, ...]] = (
    KnownModel(
        pattern=re.compile(r"^openrouter:qwen/qwen3-30b-a3b-instruct-2507$"),
        mode="tool",
        reason="aqven models check --live on 2026-09-17: the model called the output tool in 4 of 4 requests",
    ),
    KnownModel(
        pattern=re.compile(r"^openrouter:qwen/"),
        mode="prompted",
        reason="qwen models via OpenRouter write the JSON as text instead of calling the output tool",
        instruction=JSON_ONLY_INSTRUCTION,
    ),
)


@dataclass(frozen=True, slots=True)
class ModelModes:
    model: str
    tool: bool
    native: bool
    default: StructuredMode
    known: KnownModel | None = None

    def supports(self, mode: StructuredMode) -> bool:
        return SUPPORT_CHECKS[mode](self)

    @property
    def supported(self) -> tuple[StructuredMode, ...]:
        return tuple(mode for mode in MODE_PREFERENCE if self.supports(mode))

    @property
    def profile_mode(self) -> StructuredMode:
        if self.supports(self.default):
            return self.default
        return next(mode for mode in MODE_PREFERENCE if self.supports(mode))

    def auto(self) -> ModeResolution:
        if self.known is not None and self.supports(self.known.mode):
            return ModeResolution(
                declared=OutputModeSetting.AUTO,
                mode=self.known.mode,
                source="known_model",
                reason=self.known.reason,
                instruction=self.known.instruction,
            )
        mode = self.profile_mode
        reason = (
            f"Pydantic AI profile default for {self.model}"
            if mode == self.default
            else f"{self.model} does not support {self.default} output, first supported mode"
        )
        return ModeResolution(declared=OutputModeSetting.AUTO, mode=mode, source="profile", reason=reason)


def _tool(modes: ModelModes) -> bool:
    return modes.tool


def _native(modes: ModelModes) -> bool:
    return modes.native


def _prompted(modes: ModelModes) -> bool:
    return True


SUPPORT_CHECKS: Final = {"tool": _tool, "native": _native, "prompted": _prompted}


@dataclass(frozen=True, slots=True)
class ModeResolution:
    declared: OutputModeSetting
    mode: StructuredMode
    source: OutputModeSource
    reason: str
    instruction: str | None = None


@dataclass(frozen=True, slots=True)
class AgentModes:
    declared: OutputModeSetting
    models: tuple[ModelModes, ...]

    @property
    def primary(self) -> ModelModes:
        return self.models[0]

    def unsupported(self) -> tuple[ModelModes, ...]:
        explicit = EXPLICIT_MODES.get(self.declared)
        if explicit is None:
            return ()
        return tuple(model for model in self.models if not model.supports(explicit))

    def resolve(self) -> ModeResolution:
        explicit = EXPLICIT_MODES.get(self.declared)
        if explicit is not None:
            return ModeResolution(
                declared=self.declared,
                mode=explicit,
                source="declared",
                reason=DECLARED_REASON,
                instruction=_instruction(self.models, explicit),
            )
        autos = tuple(model.auto() for model in self.models)
        modes = frozenset(item.mode for item in autos)
        if len(modes) == 1:
            first = autos[0]
            return ModeResolution(
                declared=self.declared,
                mode=first.mode,
                source=first.source,
                reason=first.reason,
                instruction=_instruction(self.models, first.mode),
            )
        listed = MODE_SEPARATOR.join(
            f"{model.model} -> {item.mode}" for model, item in zip(self.models, autos, strict=True)
        )
        return ModeResolution(
            declared=self.declared,
            mode=UNIVERSAL_MODE,
            source="fallback_models",
            reason=f"models of the agent resolve to different modes ({listed}); {UNIVERSAL_MODE} works for all",
            instruction=_instruction(self.models, UNIVERSAL_MODE),
        )

    def reported(self, resolution: ModeResolution) -> bool:
        if self.declared is not OutputModeSetting.AUTO:
            return False
        return resolution.source != "profile" or resolution.mode != self.primary.default


EXPLICIT_MODES: Final[Mapping[OutputModeSetting, StructuredMode]] = {
    OutputModeSetting.TOOL: "tool",
    OutputModeSetting.NATIVE: "native",
    OutputModeSetting.PROMPTED: "prompted",
}


def known_model(model: str, table: Sequence[KnownModel] = KNOWN_MODELS) -> KnownModel | None:
    return next((entry for entry in table if entry.pattern.search(model)), None)


@cache
def provider_profile(model: str) -> ProviderProfile:
    try:
        return infer_model_profile(model)
    except ImportError, UserError, ValueError:
        return ProviderProfile()


def model_modes(model: str, declared: ProviderCapabilities | None = None) -> ModelModes:
    if declared is not None:
        return ModelModes(
            model=model,
            tool=declared.tools,
            native=declared.json_schema_output,
            default=PROFILE_DEFAULT_MODE if declared.tools else UNIVERSAL_MODE,
            known=known_model(model),
        )
    profile = provider_profile(model)
    return ModelModes(
        model=model,
        tool=profile.get("supports_tools", True),
        native=profile.get("supports_json_schema_output", False),
        default=profile.get("default_structured_output_mode", PROFILE_DEFAULT_MODE),
        known=known_model(model),
    )


def agent_modes(declared: OutputModeSetting, models: Iterable[str]) -> AgentModes:
    return AgentModes(declared=declared, models=tuple(model_modes(model) for model in models))


def provider_capabilities(spec: ProviderSpec | None) -> ProviderCapabilities | None:
    return None if spec is None else declared_capabilities(spec.capabilities)


def resolved_agent_modes(agent: ResolvedAgent) -> AgentModes:
    models = tuple(model_modes(item.model, provider_capabilities(item.provider)) for item in agent.models)
    return AgentModes(declared=agent.agent.output.mode, models=models)


def mode_note(modes: AgentModes) -> str:
    resolution = modes.resolve()
    return f"output.mode {modes.declared.value} -> {resolution.mode} ({resolution.source})"


def check_output_modes(context: CheckContext) -> Iterable[Diagnostic]:
    return tuple(
        item
        for agent_id, resolved in context.agents.items()
        for item in _agent_diagnostics(context.project.agents[agent_id].path, resolved_agent_modes(resolved))
    )


def _agent_diagnostics(file: str, modes: AgentModes) -> Iterator[Diagnostic]:
    for model in modes.unsupported():
        values = {
            "mode": modes.declared.value,
            "model": model.model,
            "supported": MODE_SEPARATOR.join(model.supported),
        }
        yield templated_diagnostic(DiagnosticCode.E_OUTPUT_MODE_UNSUPPORTED, file, MODE_PATH, values)
    resolution = modes.resolve()
    if not modes.reported(resolution):
        return
    values = {"mode": resolution.mode, "model": modes.primary.model, "source": resolution.reason}
    yield templated_diagnostic(DiagnosticCode.W_OUTPUT_MODE_RESOLVED, file, MODE_PATH, values)


def _instruction(models: Sequence[ModelModes], mode: StructuredMode) -> str | None:
    return next(
        (
            model.known.instruction
            for model in models
            if model.known is not None and model.known.mode == mode and model.known.instruction is not None
        ),
        None,
    )
