from collections.abc import AsyncIterable, Callable, Sequence
from dataclasses import dataclass
from enum import StrEnum
from types import NoneType
from typing import Final, cast

from pydantic import BaseModel, ConfigDict, Field, JsonValue, create_model
from pydantic_ai import Agent, ModelSettings, RunContext, capture_run_messages
from pydantic_ai.messages import AgentStreamEvent, ModelMessage

from aqven.engine.llm.errors import LlmFailureCode, failure_code
from aqven.engine.llm.failures import FailureAnalysis, FailureContext
from aqven.engine.llm.output import output_plan
from aqven.engine.llm.probe import ModelBuilder
from aqven.runtime.address import JsonObject
from aqven.spec import StructuredMode

SHAPE_AGENT: Final = "models_shapes"
SHAPE_INFERENCE: Final = "shape_probe"
UNKNOWN_ERROR: Final = "MODEL_REQUEST_FAILED"
MISMATCH_ERROR: Final = "MODEL_SCHEMA_MISMATCH"
OUTPUT_RETRIES: Final = 0
MAX_INCONCLUSIVE_STREAK: Final = 2

STRUCTURAL_CODES: Final = frozenset({MISMATCH_ERROR, LlmFailureCode.OUTPUT_INVALID.value})

DEPTH_LEVELS: Final[tuple[int, ...]] = (1, 2, 3, 4, 5)
DEPTH_TOKENS: Final[tuple[str, ...]] = ("Q7-XRAY", "M4-PLUTO", "R9-TAU", "ZV3-OMEGA", "K8-DELTA")
LIST_LEVELS: Final[tuple[int, ...]] = (1, 3, 6)
LIST_TOKENS: Final[tuple[str, ...]] = ("ALPHA-1", "BRAVO-2", "CHARLIE-3", "DELTA-4", "ECHO-5", "FOXTROT-6")
ENUM_LEVELS: Final[tuple[int, ...]] = (5, 25, 100)


@dataclass(frozen=True, slots=True)
class ShapeCaseSpec:
    output_type: type[BaseModel]
    prompt: str
    verify: Callable[[BaseModel], bool]


@dataclass(frozen=True, slots=True)
class ShapeAxis:
    name: str
    levels: tuple[int, ...]
    spec: Callable[[int], ShapeCaseSpec]


@dataclass(frozen=True, slots=True)
class ShapeCase:
    level: int
    ok: bool
    structural: bool = True
    code: str | None = None
    message: str | None = None
    excerpt: str | None = None


@dataclass(frozen=True, slots=True)
class ShapeAxisResult:
    axis: str
    cases: tuple[ShapeCase, ...]

    @property
    def boundary(self) -> int | None:
        passed = [case.level for case in self.cases if case.ok]
        return max(passed) if passed else None


@dataclass(frozen=True, slots=True)
class ShapeReport:
    model: str
    mode: StructuredMode
    axes: tuple[ShapeAxisResult, ...]


def _depth_model(depth: int) -> type[BaseModel]:
    model: type[BaseModel] = create_model(
        "ShapeDepthLeaf",
        __config__=ConfigDict(extra="forbid"),
        token=(str, Field(description="Copy this slot's token exactly, unmodified.")),
    )
    for level in range(depth - 1, 0, -1):
        model = create_model(f"ShapeDepthLevel{level}", __config__=ConfigDict(extra="forbid"), next=(model, ...))
    return model


def _dumped(instance: BaseModel) -> JsonObject:
    return cast(JsonObject, instance.model_dump())


def _depth_value(instance: BaseModel, depth: int) -> str | None:
    node: JsonValue = _dumped(instance)
    for _ in range(depth - 1):
        node = node.get("next") if isinstance(node, dict) else None
    token = node.get("token") if isinstance(node, dict) else None
    return token if isinstance(token, str) else None


def _depth_spec(depth: int) -> ShapeCaseSpec:
    token = DEPTH_TOKENS[depth - 1]
    prompt = (
        f"Copy the token {token!r} into the schema exactly {depth} level(s) deep, unmodified: "
        "do not translate it, summarize it, or add anything to it."
    )
    return ShapeCaseSpec(_depth_model(depth), prompt, lambda value: _depth_value(value, depth) == token)


def _list_item_type() -> type[BaseModel]:
    return create_model(
        "ShapeListItem",
        __config__=ConfigDict(extra="forbid"),
        token=(str, Field(description="Copy this item's own token exactly, unmodified.")),
    )


def _list_model(count: int) -> type[BaseModel]:
    item = _list_item_type()
    return create_model(
        "ShapeListProbe",
        __config__=ConfigDict(extra="forbid"),
        items=(list[item], Field(min_length=count, max_length=count)),
    )


def _list_ok(value: BaseModel, tokens: Sequence[str]) -> bool:
    items = _dumped(value).get("items")
    if not isinstance(items, list) or len(items) != len(tokens):
        return False
    values = [item.get("token") if isinstance(item, dict) else None for item in items]
    return values == list(tokens)


def _list_spec(count: int) -> ShapeCaseSpec:
    tokens = LIST_TOKENS[:count]
    listed = ", ".join(f"{index + 1}: {token!r}" for index, token in enumerate(tokens))
    prompt = (
        f"Return exactly {count} item(s) in `items`, in this order, one token each copied exactly, "
        f"unmodified: {listed}."
    )
    return ShapeCaseSpec(_list_model(count), prompt, lambda value: _list_ok(value, tokens))


def _enum_type(size: int) -> type[StrEnum]:
    names: list[str] = [f"code_{index:03d}" for index in range(size)]
    return StrEnum("ShapeEnumChoice", names)


def _enum_model(choice: type[StrEnum]) -> type[BaseModel]:
    leaf = create_model("ShapeEnumLeaf", __config__=ConfigDict(extra="forbid"), choice=(choice, ...))
    return create_model("ShapeEnumProbe", __config__=ConfigDict(extra="forbid"), nested=(leaf, ...))


def _enum_ok(value: BaseModel, chosen: StrEnum) -> bool:
    nested = _dumped(value).get("nested")
    return isinstance(nested, dict) and nested.get("choice") == chosen.value


def _enum_spec(size: int) -> ShapeCaseSpec:
    choice = _enum_type(size)
    chosen = list(choice)[size // 2]
    prompt = (
        f"Set `nested.choice` to exactly {chosen.value!r} — it is one of the {size} allowed catalog codes; "
        "copy it exactly, do not invent a different one."
    )
    return ShapeCaseSpec(_enum_model(choice), prompt, lambda value: _enum_ok(value, chosen))


SHAPE_AXES: Final[tuple[ShapeAxis, ...]] = (
    ShapeAxis("nesting_depth", DEPTH_LEVELS, _depth_spec),
    ShapeAxis("list_of_objects", LIST_LEVELS, _list_spec),
    ShapeAxis("enum_at_depth", ENUM_LEVELS, _enum_spec),
)


async def drain(ctx: RunContext[None], events: AsyncIterable[AgentStreamEvent]) -> None:
    async for _ in events:
        continue


@dataclass(frozen=True, slots=True)
class ShapeProber:
    build: ModelBuilder
    model_settings: ModelSettings | None = None

    async def probe(self, model: str, mode: StructuredMode, axes: Sequence[ShapeAxis] = SHAPE_AXES) -> ShapeReport:
        results = tuple([await self._axis(model, mode, axis) for axis in axes])
        return ShapeReport(model=model, mode=mode, axes=results)

    async def _axis(self, model: str, mode: StructuredMode, axis: ShapeAxis) -> ShapeAxisResult:
        cases: list[ShapeCase] = []
        inconclusive_streak = 0
        for level in axis.levels:
            case = await self._case(model, mode, axis, level)
            cases.append(case)
            if case.ok:
                inconclusive_streak = 0
                continue
            if case.structural:
                break
            inconclusive_streak += 1
            if inconclusive_streak >= MAX_INCONCLUSIVE_STREAK:
                break
        return ShapeAxisResult(axis=axis.name, cases=tuple(cases))

    async def _case(self, model: str, mode: StructuredMode, axis: ShapeAxis, level: int) -> ShapeCase:
        case_spec = axis.spec(level)
        plan = output_plan(mode, case_spec.output_type, strict=True)
        agent = Agent[None, object](
            await self.build(model),
            output_type=[plan.spec],
            deps_type=NoneType,
            name=SHAPE_AGENT,
            retries={"output": OUTPUT_RETRIES},
            model_settings=self.model_settings,
        )
        context = FailureContext(
            agent_id=SHAPE_AGENT,
            model=model,
            mode=mode,
            output_tools=plan.output_tools,
            schema=case_spec.output_type.model_json_schema(),
            inference_id=SHAPE_INFERENCE,
        )
        with capture_run_messages() as captured:
            try:
                result = await agent.run(case_spec.prompt, event_stream_handler=drain)
            except Exception as error:
                return _failed(level, context, captured, error)
        if isinstance(result.output, case_spec.output_type) and case_spec.verify(result.output):
            return ShapeCase(level=level, ok=True)
        return ShapeCase(level=level, ok=False, code=MISMATCH_ERROR, message="the model filled the shape incorrectly")


def _failed(level: int, context: FailureContext, messages: Sequence[ModelMessage], error: Exception) -> ShapeCase:
    analysis = FailureAnalysis(context)
    analysis.collect(messages, 0, 0)
    analysis.collect_final(messages, 0, 0, error)
    code = failure_code(error)
    final = analysis.final_error(error, UNKNOWN_ERROR if code is None else code.value, str(error))
    last = analysis.failures[-1][1] if analysis.failures else None
    details = final.details
    reported_code = final.code if last is None else last.code
    return ShapeCase(
        level=level,
        ok=False,
        structural=reported_code in STRUCTURAL_CODES,
        code=reported_code,
        message=final.message if last is None else last.message,
        excerpt=None if details is None else details.raw_excerpt,
    )
