from collections.abc import AsyncIterable, Awaitable, Callable, Sequence
from dataclasses import dataclass
from types import NoneType
from typing import Annotated, Final

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from pydantic_ai import Agent, RunContext, capture_run_messages
from pydantic_ai.messages import AgentStreamEvent, ModelMessage
from pydantic_ai.models import Model

from aqven.check.output_modes import MODE_PREFERENCE, ModelModes, model_modes
from aqven.engine.llm.errors import failure_code
from aqven.engine.llm.failures import FailureAnalysis, FailureContext
from aqven.engine.llm.instructions import join_instructions, output_limits
from aqven.engine.llm.output import output_plan
from aqven.spec import StructuredMode

PROBE_AGENT: Final = "models_check"
PROBE_INFERENCE: Final = "probe"
PROBE_PROMPT: Final = (
    "Classify the customer message 'The lamp arrived broken, I want a refund'. "
    "Return label: a short topic label, and rating: how urgent the message is, from 1 to 5."
)
PROBE_RETRIES: Final = 0
LABEL_LIMIT: Final = 20
RATING_MIN: Final = 1
RATING_MAX: Final = 5
UNKNOWN_ERROR: Final = "MODEL_REQUEST_FAILED"


class ProbeAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: Annotated[str, StringConstraints(max_length=LABEL_LIMIT)]
    rating: Annotated[int, Field(ge=RATING_MIN, le=RATING_MAX)]


type ModelBuilder = Callable[[str], Awaitable[Model]]


@dataclass(frozen=True, slots=True)
class ModeProbe:
    mode: StructuredMode
    ok: bool
    code: str | None = None
    message: str | None = None
    hint: str | None = None
    excerpt: str | None = None


@dataclass(frozen=True, slots=True)
class ModelProbe:
    model: str
    modes: ModelModes
    results: tuple[ModeProbe, ...]

    @property
    def working(self) -> tuple[StructuredMode, ...]:
        return tuple(result.mode for result in self.results if result.ok)

    def recommended(self) -> StructuredMode | None:
        auto = self.modes.auto().mode
        if auto in self.working:
            return auto
        return next(iter(self.working), None)


async def drain(ctx: RunContext[None], events: AsyncIterable[AgentStreamEvent]) -> None:
    async for _ in events:
        continue


@dataclass(frozen=True, slots=True)
class ModeProber:
    build: ModelBuilder

    async def probe(self, model: str, modes: Sequence[StructuredMode] = MODE_PREFERENCE) -> ModelProbe:
        resolved = model_modes(model)
        results = tuple([await self.probe_mode(model, resolved, mode) for mode in modes])
        return ModelProbe(model=model, modes=resolved, results=results)

    async def probe_mode(self, model: str, resolved: ModelModes, mode: StructuredMode) -> ModeProbe:
        plan = output_plan(mode, ProbeAnswer, strict=True)
        known = resolved.known
        instruction = known.instruction if known is not None and known.mode == mode else None
        agent = Agent[None, object](
            await self.build(model),
            output_type=[plan.spec],
            deps_type=NoneType,
            instructions=join_instructions((output_limits(ProbeAnswer.model_json_schema()), instruction)),
            name=PROBE_AGENT,
            retries={"output": PROBE_RETRIES},
        )
        context = FailureContext(
            agent_id=PROBE_AGENT,
            model=model,
            mode=mode,
            output_tools=plan.output_tools,
            schema=ProbeAnswer.model_json_schema(),
            inference_id=PROBE_INFERENCE,
        )
        with capture_run_messages() as captured:
            try:
                result = await agent.run(PROBE_PROMPT, event_stream_handler=drain)
            except Exception as error:
                return _failed(mode, context, captured, error)
        if isinstance(result.output, ProbeAnswer):
            return ModeProbe(mode=mode, ok=True)
        return ModeProbe(mode=mode, ok=False, code=UNKNOWN_ERROR, message=f"unexpected output {type(result.output)}")


def _failed(
    mode: StructuredMode, context: FailureContext, messages: Sequence[ModelMessage], error: Exception
) -> ModeProbe:
    analysis = FailureAnalysis(context)
    analysis.collect(messages, 0, 0)
    analysis.collect_final(messages, 0, 0, error)
    code = failure_code(error)
    final = analysis.final_error(error, UNKNOWN_ERROR if code is None else code.value, str(error))
    last = analysis.failures[-1][1] if analysis.failures else None
    details = final.details
    return ModeProbe(
        mode=mode,
        ok=False,
        code=final.code if last is None else last.code,
        message=final.message if last is None else last.message,
        hint=final.hint,
        excerpt=None if details is None else details.raw_excerpt,
    )
