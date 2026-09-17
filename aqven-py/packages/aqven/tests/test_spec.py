import json
from collections.abc import Mapping
from pathlib import Path
from typing import Annotated, Literal, NewType

import pytest
from pydantic import BaseModel, ConfigDict, Field, JsonValue, StringConstraints, TypeAdapter, ValidationError

from aqven.diagnostics import (
    SEVERITY_BY_CODE,
    Diagnostic,
    DiagnosticCode,
    Severity,
    diagnostic,
    format_json,
    format_text,
    has_errors,
    sort_diagnostics,
)
from aqven.policies import EvalContext, Verdict
from aqven.spec import (
    API_VERSION,
    MODEL_PROFILES,
    SPEC_MODEL_BY_KIND,
    AgentSpec,
    BlobId,
    BuilderError,
    CallNodeSpec,
    CapabilityOverride,
    CheckSpec,
    CodeNodeSpec,
    DynamicLimits,
    EscalateOnTimeout,
    EvalSpec,
    FieldDecl,
    FieldSpec,
    FieldSpecTypeIssue,
    FieldStep,
    FlowSpec,
    HumanNodeSpec,
    Image,
    In,
    IndexStep,
    Inference,
    InferenceSpec,
    LiftStep,
    LlmNodeSpec,
    Locale,
    LoopNodeSpec,
    MapNodeSpec,
    McpServerSpec,
    Modality,
    ModelFamily,
    ModelRef,
    ModelSyntaxError,
    NarrowNodeSpec,
    NodeId,
    OnFail,
    Out,
    ParallelNodeSpec,
    PolicyRef,
    ProjectSpec,
    ProviderName,
    RefRoot,
    RefSyntaxError,
    RunContextKey,
    SpecKind,
    SwitchNodeSpec,
    ToolNodeSpec,
    ToolSpec,
    TypeId,
    TypeModelError,
    TypeRef,
    TypeRefSyntaxError,
    TypeSpec,
    build_type_models,
    code,
    editor_schema,
    field_spec_type_problem,
    flow,
    inference_spec,
    llm,
    normalized_schema,
    parse_model,
    parse_ref,
    parse_type_ref,
    resolve_profile,
    tool,
    write_editor_schemas,
)

NODE_ADAPTER = SPEC_MODEL_BY_KIND[SpecKind.NODE]
TYPE_ADAPTER: TypeAdapter[TypeSpec] = TypeAdapter(TypeSpec)
MIRROR = ConfigDict(extra="forbid", frozen=True, revalidate_instances="always")

type CurrencyCode = Literal["eur", "usd"]
OrderId = NewType("OrderId", str)
type OrderIdField = Annotated[OrderId, StringConstraints(pattern=r"^LUM-[0-9]{8}$")]


class Money(BaseModel):
    model_config = MIRROR
    amount_minor: Annotated[int, Field(ge=0, le=1_000_000)]
    currency: CurrencyCode


class Refund(BaseModel):
    model_config = MIRROR
    kind: Literal["refund"]
    amount: Money


class Reject(BaseModel):
    model_config = MIRROR
    kind: Literal["reject"]
    reason: Annotated[str, StringConstraints(max_length=400)]


type Decision = Annotated[Refund | Reject, Field(discriminator="kind")]


class Order(BaseModel):
    model_config = MIRROR
    order_id: OrderIdField
    total: Money
    notes: Annotated[list[Annotated[str, StringConstraints(max_length=64)]], Field(max_length=8)] | None
    locale: Locale
    receipt: Image | None


class Totals(BaseModel):
    model_config = MIRROR
    total: Money = Field(description="Итог в евро")
    lines: Annotated[int, Field(ge=0, le=500)] = Field(description="Число строк")


class Resolve(Inference):
    order: Order = In(description="Заказ покупателя")
    tags: list[str] = In(description="Метки обращения", max_items=5, max_length=40)
    reasoning: str = Out(description="Обоснование решения", max_length=600)
    decision: Decision = Out(description="Решение")


class Undescribed(Inference):
    order: Order


class OrderStatusRequest(BaseModel):
    model_config = MIRROR
    order_id: OrderIdField


class OrderStatusReply(BaseModel):
    model_config = MIRROR
    reasoning: str
    decision: Decision


def normalize_totals(
    order: Annotated[Order, Field(description="Разобранный заказ")],
    currency: Annotated[CurrencyCode, Field(description="Целевая валюта")],
) -> Totals:
    return Totals(total=order.total, lines=0 if currency == "eur" else 1)


def normalize_silent(order: Order) -> Totals:
    return Totals(total=order.total, lines=0)


def node_document(node: str, **body: JsonValue) -> dict[str, JsonValue]:
    return {"apiVersion": API_VERSION, "kind": "Node", "node": node, "description": "Узел примера", **body}


def type_document(kind: str, **body: JsonValue) -> dict[str, JsonValue]:
    return {"apiVersion": API_VERSION, "kind": "Type", "type": kind, "description": "Тип примера", **body}


def document(kind: str, **body: JsonValue) -> dict[str, JsonValue]:
    return {"apiVersion": API_VERSION, "kind": kind, "description": f"{kind} примера", **body}


def field(name: str, type_ref: str, **extra: JsonValue) -> JsonValue:
    return {"name": name, "type": type_ref, "description": f"Поле {name}", **extra}


def binding(name: str, source: str) -> JsonValue:
    return {"name": name, "from": source}


def validation_errors[T](
    adapter: TypeAdapter[T], data: Mapping[str, JsonValue]
) -> list[tuple[str, tuple[str | int, ...]]]:
    with pytest.raises(ValidationError) as caught:
        adapter.validate_python(data)
    return [(error["type"], tuple(error["loc"])) for error in caught.value.errors()]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Text", TypeRef(TypeId("Text"), is_list=False, is_optional=False)),
        ("Money[]", TypeRef(TypeId("Money"), is_list=True, is_optional=False)),
        ("Image?", TypeRef(TypeId("Image"), is_list=False, is_optional=True)),
        ("Text[]?", TypeRef(TypeId("Text"), is_list=True, is_optional=True)),
        ("Refund_V2", TypeRef(TypeId("Refund_V2"), is_list=False, is_optional=False)),
    ],
)
def test_type_ref_parses_and_round_trips(text: str, expected: TypeRef) -> None:
    parsed = parse_type_ref(text)
    assert parsed == expected
    assert str(parsed) == text


@pytest.mark.parametrize(
    ("text", "position", "fragment"),
    [
        ("", 0, "PascalCase"),
        ("text", 0, "PascalCase"),
        ("Text?[]", 5, "T?[]"),
        ("Text[][]", 6, "T[][]"),
        ("Text??", 5, "? suffix"),
        ("Te-xt", 2, "invalid character"),
        ("A" * 64, 63, "longer than 63"),
    ],
)
def test_type_ref_rejects_bad_notation(text: str, position: int, fragment: str) -> None:
    with pytest.raises(TypeRefSyntaxError) as caught:
        parse_type_ref(text)
    assert caught.value.position == position
    assert fragment in caught.value.reason


def test_ref_parses_roots_and_steps() -> None:
    node_ref = parse_ref("$load_queue.out.tickets[*].id")
    assert node_ref.root is RefRoot.NODE
    assert node_ref.node_id == NodeId("load_queue")
    assert node_ref.steps == (FieldStep("tickets"), LiftStep(), FieldStep("id"))
    assert parse_ref("$run.context.tenant_id").key == "tenant_id"
    assert parse_ref("$branch.legal").key == "legal"
    assert parse_ref("$ok[12].answer").steps == (IndexStep(12), FieldStep("answer"))
    assert parse_ref("$index").root is RefRoot.INDEX
    assert parse_ref("$out.reply.citations").root is RefRoot.OUT
    assert parse_ref("$output_parser.out").root is RefRoot.NODE


@pytest.mark.parametrize(
    "text",
    ["$input", "$decide.out.decision.kind", "$ok[*].answer", "$run.context.date", "$branch.brand", "$out.reply.text"],
)
def test_ref_round_trips(text: str) -> None:
    assert str(parse_ref(text)) == text


@pytest.mark.parametrize(
    ("text", "position"),
    [
        ("input", 0),
        ("$", 1),
        ("$decide.output", 7),
        ("$decide", 7),
        ("$run.context.weather", 13),
        ("$branch", 7),
        ("$load.out.", 9),
        ("$load.out[a]", 9),
    ],
)
def test_ref_rejects_bad_syntax(text: str, position: int) -> None:
    with pytest.raises(RefSyntaxError) as caught:
        parse_ref(text)
    assert caught.value.position == position


def test_llm_node_names_inference_and_agent_only() -> None:
    spec = NODE_ADAPTER.validate_python(
        node_document("llm", inference="resolve_defect", agent="resolver", **{"in": [binding("order", "$input")]})
    )
    assert isinstance(spec, LlmNodeSpec)
    assert (spec.inference, spec.agent, spec.in_[0].from_) == ("resolve_defect", "resolver", "$input")
    missing_agent = node_document("llm", inference="resolve_defect")
    assert ("missing", ("llm", "agent")) in validation_errors(NODE_ADAPTER, missing_agent)
    colocated = NODE_ADAPTER.validate_python(node_document("llm", agent="resolver"))
    assert isinstance(colocated, LlmNodeSpec)
    assert colocated.inference is None
    configured = node_document("llm", inference="i", agent="a", prompt="./prompt.md", model_role="writer")
    errors = validation_errors(NODE_ADAPTER, configured)
    assert {("extra_forbidden", ("llm", "prompt")), ("extra_forbidden", ("llm", "model_role"))} <= set(errors)


def test_every_node_kind_validates() -> None:
    documents: list[tuple[type[BaseModel], dict[str, JsonValue]]] = [
        (
            CodeNodeSpec,
            node_document("code", run="m.x:f", out=[field("totals", "ExtractTotals")]),
        ),
        (ToolNodeSpec, node_document("tool", tool="render_clip", **{"in": [binding("text", "$polish.out.text")]})),
        (
            HumanNodeSpec,
            node_document(
                "human",
                form="RefundApproval",
                assignee="operator",
                timeout_seconds=86400,
                on_timeout={"policy": "default", "value": {"verdict": "reject"}},
            ),
        ),
        (
            ParallelNodeSpec,
            node_document(
                "parallel",
                body={"brand": "brand_review", "legal": "legal_review"},
                join={"use": "quorum", "with": {"min_ok": 1, "on_error": "skip"}},
                out=[field("brand", "PromoReview?", **{"from": "$branch.brand"})],
            ),
        ),
        (
            MapNodeSpec,
            node_document(
                "map",
                over="$load.out.tickets",
                body="answer",
                concurrency=8,
                on_item_error={"use": "skip"},
                out=[field("failures", "MapItemError[]", maxItems=200, **{"from": "$failed"})],
            ),
        ),
        (
            SwitchNodeSpec,
            node_document(
                "switch",
                on="$decide.out.decision",
                cases={
                    "refund": {"node": "pay", "bind": [binding("resolution", "$pay.out.resolution")]},
                    "reject": {"bind": [{"name": "resolution", "value": None}]},
                },
                out=[field("resolution", "RefundResolution?")],
            ),
        ),
        (
            LoopNodeSpec,
            node_document(
                "loop",
                body=["write", "critique"],
                init={"write": [binding("previous", "$panel.out.winner")]},
                max_iter=3,
                stop=[
                    {"use": "threshold", "with": {"path": "$iter.critique.out.score", "gte": 0.85}},
                    {"run": "lumen.code.policies:no_blocking"},
                ],
                select={"use": "best", "with": {"path": "$iter.critique.out.score"}},
                limits={"usd_micros": 120000},
                out=[field("iterations", "Int", **{"from": "$loop.iterations"})],
            ),
        ),
        (CallNodeSpec, node_document("call", flow="judge_panel", **{"in": [binding("t", "$item")]})),
        (NarrowNodeSpec, node_document("narrow", to="CaseRecord", **{"from": "$record.out.record"})),
    ]
    for expected, data in documents:
        assert isinstance(NODE_ADAPTER.validate_python(data), expected)


HEADER_KEYS: tuple[str, ...] = ("apiVersion", "kind", "node", "description", "limits")

CANONICAL_NODE_KEYS: dict[type[BaseModel], tuple[str, ...]] = {
    LlmNodeSpec: (*HEADER_KEYS, "inference", "agent", "in"),
    CodeNodeSpec: (*HEADER_KEYS, "run", "in", "out"),
    ToolNodeSpec: (*HEADER_KEYS, "tool", "in"),
    HumanNodeSpec: (*HEADER_KEYS, "form", "assignee", "timeout_seconds", "on_timeout", "in"),
    ParallelNodeSpec: (*HEADER_KEYS, "body", "join", "out"),
    MapNodeSpec: (*HEADER_KEYS, "over", "body", "concurrency", "on_item_error", "out"),
    SwitchNodeSpec: (*HEADER_KEYS, "on", "cases", "out"),
    LoopNodeSpec: (*HEADER_KEYS, "body", "init", "max_iter", "stop", "select", "out"),
    CallNodeSpec: (*HEADER_KEYS, "flow", "in"),
    NarrowNodeSpec: (*HEADER_KEYS, "from", "to"),
    InferenceSpec: (
        "apiVersion",
        "kind",
        "description",
        "in",
        "out",
        "prompt",
        "variants",
        "allowed_sets",
        "examples",
        "checks",
    ),
    CheckSpec: ("use", "run", "inference", "agent", "with", "on_fail", "threshold"),
    PolicyRef: ("use", "run", "with"),
    AgentSpec: (
        "apiVersion",
        "kind",
        "description",
        "model",
        "fallback_models",
        "settings",
        "output",
        "instructions",
        "tools",
        "mcp_servers",
        "subagents",
        "approval",
        "limits",
        "capabilities",
    ),
    ToolSpec: (
        "apiVersion",
        "kind",
        "description",
        "run",
        "mcp",
        "effect",
        "idempotency_key",
        "secrets",
        "wait",
        "in",
        "out",
    ),
    ProjectSpec: ("apiVersion", "kind", "description", "package", "providers", "policies", "limits", "renames"),
    FlowSpec: (
        "apiVersion",
        "kind",
        "description",
        "input",
        "output",
        "returns",
        "context",
        "limits",
        "order",
        "requires",
    ),
}


@pytest.mark.parametrize("model", list(CANONICAL_NODE_KEYS), ids=lambda model: model.__name__)
def test_key_order_matches_canonical_samples(model: type[BaseModel]) -> None:
    keys = tuple(info.alias or name for name, info in model.model_fields.items())

    assert keys == CANONICAL_NODE_KEYS[model]


def test_editor_schema_lists_tool_keys_in_canonical_order() -> None:
    schema = editor_schema(SpecKind.TOOL)
    properties = schema["properties"]
    assert isinstance(properties, dict)

    assert tuple(properties) == CANONICAL_NODE_KEYS[ToolSpec]


def test_policy_reference_names_exactly_one_source() -> None:
    loop = node_document(
        "loop",
        body=["write"],
        max_iter=2,
        select={"use": "last"},
        out=[field("score", "Score", **{"from": "$iter.write.out.score"})],
    )
    spec = NODE_ADAPTER.validate_python(loop)
    assert isinstance(spec, LoopNodeSpec)
    assert (spec.select.use, spec.select.run, spec.select.with_, spec.stop) == ("last", None, None, None)
    unbounded = {key: value for key, value in loop.items() if key != "max_iter"}
    assert ("missing", ("loop", "max_iter")) in validation_errors(NODE_ADAPTER, unbounded)
    both: JsonValue = {"use": "last", "run": "m:f"}
    assert validation_errors(NODE_ADAPTER, {**loop, "select": both})[0] == ("value_error", ("loop", "select"))
    assert validation_errors(NODE_ADAPTER, {**loop, "select": {"with": {}}})[0] == ("value_error", ("loop", "select"))
    assert validation_errors(NODE_ADAPTER, {**loop, "select": "last"})[0] == ("model_type", ("loop", "select"))


def test_node_errors_are_precise() -> None:
    assert validation_errors(NODE_ADAPTER, node_document("seq"))[0][0] == "union_tag_invalid"
    camel = node_document("code", run="m:f", out=[field("a", "Text", max_length=3)])
    assert ("extra_forbidden", ("code", "out", 0, "max_length")) in validation_errors(NODE_ADAPTER, camel)
    conflicting: JsonValue = [{"name": "a", "value": "x", "from": "$input"}]
    both = node_document("call", flow="c", **{"in": conflicting})
    assert validation_errors(NODE_ADAPTER, both)[0][0] == "value_error"
    typed = node_document("tool", tool="t", **{"in": [field("a", "Text", **{"from": "$input"})]})
    assert ("extra_forbidden", ("tool", "in", 0, "type")) in validation_errors(NODE_ADAPTER, typed)
    empty_case = node_document("switch", on="$a.out.b", cases={"x": {}}, out=[field("a", "Bool")])
    assert validation_errors(NODE_ADAPTER, empty_case)[0][0] == "value_error"
    escalate_value = node_document(
        "human",
        form="F",
        assignee="a",
        timeout_seconds=1,
        on_timeout={"policy": "escalate", "assignee": "b", "timeout_seconds": 1, "value": 1},
    )
    assert ("extra_forbidden", ("human", "on_timeout", "escalate", "value")) in validation_errors(
        NODE_ADAPTER, escalate_value
    )
    mapped = node_document("map", over="$a.out.b", max_items=10, body="x", on_item_error={"use": "skip"}, out=[])
    assert ("extra_forbidden", ("map", "max_items")) in validation_errors(NODE_ADAPTER, mapped)


INFERENCE_ADAPTER = SPEC_MODEL_BY_KIND[SpecKind.INFERENCE]


def test_inference_binds_input_output_variants_and_checks() -> None:
    spec = INFERENCE_ADAPTER.validate_python(
        document(
            "Inference",
            **{
                "in": [field("chunks", "KbChunk[]", maxItems=80), field("product", "ProductRef")],
                "out": [field("reply", "ReplyDraft")],
            },
            variants={"lamp_guide": {"on": "product.category", "cases": {"desk_lamp": "desk"}, "default": "generic"}},
            allowed_sets=[
                {"type": "KbChunkId", "from": "$in.chunks[*].chunk_id", "labels_from": "$in.chunks[*].title"}
            ],
            examples=[{"name": "flicker", "in": {"chunks": []}, "out": {"reply": {"text": "x"}}}],
            checks=[
                {"use": "max_words", "with": {"field": "$out.reply.text", "max": 220}, "on_fail": "retry"},
                {"run": "lumen.code.prompting:promises_match_resolution", "on_fail": "flag"},
                {"inference": "judge_reply", "agent": "deepseek", "on_fail": "flag", "threshold": 3},
            ],
        )
    )
    assert isinstance(spec, InferenceSpec)
    assert spec.prompt is None
    assert (spec.variants or {})["lamp_guide"].cases == {"desk_lamp": "desk"}
    use, run, judge = spec.checks or []
    assert (use.use, use.with_, use.on_fail) == ("max_words", {"field": "$out.reply.text", "max": 220}, OnFail.RETRY)
    assert (run.run, run.on_fail) == ("lumen.code.prompting:promises_match_resolution", OnFail.FLAG)
    assert (judge.inference, judge.agent, judge.threshold) == ("judge_reply", "deepseek", 3)
    assert (spec.examples or [])[0].in_ == {"chunks": []}


def test_inference_prompt_is_a_markdown_path_or_code_reference() -> None:
    base = document("Inference", out=[field("answer", "Text", maxLength=200)])
    references = {
        "./prompt.md": (None, "./prompt.md"),
        "../research_policy.md": (None, "../research_policy.md"),
        "agents/research_policy.md": (None, "agents/research_policy.md"),
        "lumen.illustrate.code:illustrate_prompt": ("lumen.illustrate.code:illustrate_prompt", None),
        "@flow/prompts/reply.md": (None, "@flow/prompts/reply.md"),
        "@root/prompts/reply.md": (None, "@root/prompts/reply.md"),
        "illustrate_prompt": ("illustrate_prompt", None),
        "@here.code:illustrate_prompt": ("@here.code:illustrate_prompt", None),
        "@root/flows/support/nodes/illustrate.py:illustrate_prompt": (
            "@root/flows/support/nodes/illustrate.py:illustrate_prompt",
            None,
        ),
    }
    for prompt, expected in references.items():
        spec = INFERENCE_ADAPTER.validate_python({**base, "prompt": prompt})
        assert isinstance(spec, InferenceSpec)
        assert (spec.prompt_code, spec.prompt_path) == expected
    for prompt in (
        "Ответь покупателю",
        "prompt.txt",
        "/abs/prompt.md",
        "@team/prompt.md",
        "@here:illustrate",
        "@root/illustrate.py",
        "@root/../illustrate.py:illustrate_prompt",
    ):
        assert ("string_pattern_mismatch", ("prompt",)) in validation_errors(
            INFERENCE_ADAPTER, {**base, "prompt": prompt}
        )
    slot: dict[str, JsonValue] = {"on": "product.lamp_kind", "cases": {"mains": "mains", "wifi": "../guides/wifi.md"}}
    with_slot = INFERENCE_ADAPTER.validate_python({**base, "variants": {"lamp_guide": slot}})
    assert isinstance(with_slot, InferenceSpec)
    invalid_slot: dict[str, JsonValue] = {**slot, "default": "Mains Guide"}
    assert ("string_pattern_mismatch", ("variants", "lamp_guide", "default")) in validation_errors(
        INFERENCE_ADAPTER, {**base, "variants": {"lamp_guide": invalid_slot}}
    )


def test_inference_rejects_mixed_checks() -> None:
    base = document("Inference", out=[field("answer", "Text", maxLength=200)])
    mixed: list[JsonValue] = [
        {"use": "not_empty", "run": "m:f", "on_fail": "retry"},
        {"inference": "judge", "on_fail": "retry"},
        {"inference": "judge", "agent": "a", "with": {"scale": 5}, "on_fail": "retry"},
        {"with": {"field": "$out.answer"}, "on_fail": "retry"},
    ]
    for check in mixed:
        assert validation_errors(INFERENCE_ADAPTER, {**base, "checks": [check]})[0] == ("value_error", ("checks", 0))
    without_out = {key: value for key, value in base.items() if key != "out"}
    assert ("missing", ("out",)) in validation_errors(INFERENCE_ADAPTER, without_out)


class ReplyIn(BaseModel):
    model_config = MIRROR
    summary: Annotated[str, StringConstraints(max_length=600)]


def test_eval_context_and_verdict() -> None:
    context = EvalContext[ReplyIn, ReplyIn](inputs=ReplyIn(summary="Мерцает лента"), attempt=2)
    assert (context.inputs.summary, context.expected_output, dict(context.metadata)) == ("Мерцает лента", None, {})
    assert Verdict(passed=False, reason="remove the promise").model_dump() == {
        "passed": False,
        "score": None,
        "reason": "remove the promise",
    }
    with pytest.raises(ValidationError):
        Verdict.model_validate({"passed": True, "feedback": "x"})


AGENT_ADAPTER = SPEC_MODEL_BY_KIND[SpecKind.AGENT]


def test_agent_carries_model_configuration() -> None:
    spec = AGENT_ADAPTER.validate_python(
        document(
            "Agent",
            model="openai:gpt-5.4-mini",
            fallback_models=["openrouter:openai/gpt-5.4-image-2"],
            settings={"temperature": 0.2, "max_tokens": 1500, "provider_options": {"reasoning": "low"}},
            instructions="./resolver.md",
            tools=["lookup_order", "issue_store_credit"],
            subagents=[
                {
                    "name": "research",
                    "description": "Исследует политику",
                    "agent": "researcher",
                    "inference": "research",
                }
            ],
            approval={
                "tools": ["issue_store_credit"],
                "assignee": "support_lead",
                "timeout_seconds": 3600,
                "on_timeout": {"policy": "escalate", "assignee": "manager", "timeout_seconds": 1800},
            },
            limits={"requests": 8, "usd_micros": 80000},
            capabilities={"family": "openai", "input": ["text", "image"]},
        )
    )
    assert isinstance(spec, AgentSpec)
    assert spec.output.strict is True
    assert spec.output.retries == 1
    assert spec.approval is not None
    assert isinstance(spec.approval.on_timeout, EscalateOnTimeout)
    minimal = AGENT_ADAPTER.validate_python(document("Agent", model="together:meta-llama/Llama-3.3-70B-Instruct-Turbo"))
    assert isinstance(minimal, AgentSpec)
    assert (minimal.limits, minimal.tools, minimal.settings) == (None, None, None)


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ({"model": "gpt-5.4-mini"}, ("string_pattern_mismatch", ("model",))),
        ({"model": "google-gla:gemini-3.8-flash"}, ("string_pattern_mismatch", ("model",))),
        ({"model": "openai:gpt", "instructions": "Отвечай вежливо"}, ("string_pattern_mismatch", ("instructions",))),
        ({"model": "openai:gpt", "output": {"mode": "text"}}, ("enum", ("output", "mode"))),
        ({"model": "openai:gpt", "output": {"retries": 9}}, ("less_than_equal", ("output", "retries"))),
    ],
    ids=["no_provider", "legacy_provider", "inline_instructions", "text_mode", "retries"],
)
def test_agent_rejects_bad_configuration(
    body: dict[str, JsonValue], expected: tuple[str, tuple[str | int, ...]]
) -> None:
    assert expected in validation_errors(AGENT_ADAPTER, document("Agent", **body))


TOOL_ADAPTER = SPEC_MODEL_BY_KIND[SpecKind.TOOL]


def test_tool_is_code_or_mcp() -> None:
    code_tool = TOOL_ADAPTER.validate_python(
        document(
            "Tool",
            run="lumen.code.tools:start_clip",
            effect="external",
            idempotency_key=["image", "text"],
            secrets=[{"name": "together_api_key", "ref": "ref:env/TOGETHER_API_KEY"}],
            wait={"poll": "lumen.code.tools:poll_clip", "interval_seconds": 20, "timeout_seconds": 1800},
            **{"in": [field("image", "Image")], "out": [field("clip", "Video")]},
        )
    )
    mcp_tool = TOOL_ADAPTER.validate_python(
        document("Tool", mcp={"server": "helpdesk", "tool": "search_tickets"}, effect="read")
    )
    assert isinstance(code_tool, ToolSpec)
    assert isinstance(mcp_tool, ToolSpec)
    both = document("Tool", run="m:f", mcp={"server": "s", "tool": "t"}, effect="read")
    no_out = document("Tool", run="m:f", effect="read")
    mcp_schema = document("Tool", mcp={"server": "s", "tool": "t"}, effect="read", out=[field("a", "Bool")])
    for broken in (both, no_out, mcp_schema):
        assert validation_errors(TOOL_ADAPTER, broken) == [("value_error", ())]
    cached = document("Tool", run="m:f", effect="read", determinism="stable", ttl_ms=1000, out=[field("a", "Bool")])
    assert set(validation_errors(TOOL_ADAPTER, cached)) == {
        ("extra_forbidden", ("determinism",)),
        ("extra_forbidden", ("ttl_ms",)),
    }


def test_mcp_server_and_project_documents() -> None:
    server = SPEC_MODEL_BY_KIND[SpecKind.MCP_SERVER].validate_python(
        document(
            "McpServer",
            transport="streamable_http",
            url="https://helpdesk.lumen.example/mcp",
            headers=[{"name": "Authorization", "value": "ref:env/LUMEN_HELPDESK_TOKEN"}],
        )
    )
    assert isinstance(server, McpServerSpec)
    project = SPEC_MODEL_BY_KIND[SpecKind.PROJECT].validate_python(
        document(
            "Project",
            package="lumen",
            providers=[
                {
                    "id": "openrouter",
                    "api_key": "ref:env/OPENROUTER_API_KEY",
                    "data_policy": {"allows_pii": True, "allows_sensitive": False, "retention": "zero"},
                    "routing": {"data_collection": "deny", "zdr": True},
                }
            ],
        )
    )
    assert isinstance(project, ProjectSpec)
    assert project.providers[0].id is ProviderName.OPENROUTER
    assert project.limits is None
    errors = validation_errors(
        SPEC_MODEL_BY_KIND[SpecKind.PROJECT],
        {**document("Project", package="lumen", providers=[]), "apiVersion": "aqven/v9", "models": []},
    )
    assert {("literal_error", ("apiVersion",)), ("too_short", ("providers",)), ("extra_forbidden", ("models",))} <= set(
        errors
    )


def test_other_documents_validate() -> None:
    flow_spec = SPEC_MODEL_BY_KIND[SpecKind.FLOW].validate_python(
        document(
            "Flow",
            input="RefundRequest",
            output="RefundOutcome",
            returns=[binding("decision", "$decide.out.decision")],
            context=["date"],
            order=["decide"],
        )
    )
    assert isinstance(flow_spec, FlowSpec)
    panel = SPEC_MODEL_BY_KIND[SpecKind.FLOW].validate_python(
        document(
            "Flow",
            input="PanelRequest",
            output="PanelDecision",
            returns=[binding("winner", "$pick.out.winner")],
            order=["judges", "pick"],
            requires=[
                {"rule": "families_distinct", "nodes": ["judges__deepseek", "judges__qwen"], "min": 2},
                {"rule": "field_before", "nodes": ["judges__deepseek"], "first": "rationale", "second": "scores"},
                {"rule": "family_disjoint_from_input", "nodes": ["judges__qwen"], "input": "candidates"},
            ],
        )
    )
    assert isinstance(panel, FlowSpec)
    assert len(panel.requires or ()) == 3
    evaluation = SPEC_MODEL_BY_KIND[SpecKind.EVAL].validate_python(
        document(
            "Eval",
            inference="write_reply",
            agent="gpt",
            dataset="write_reply",
            scorers=[
                {"id": "cost", "kind": "continuous", "use": "cost_usd"},
                {"id": "groundedness", "kind": "ordinal", "inference": "judge_groundedness", "agent": "deepseek"},
                {"id": "citations", "kind": "binary", "run": "lumen.code.evaluators:citations_resolve"},
            ],
            optimization={
                "engine": "gepa",
                "objective": "groundedness",
                "train_split": "train",
                "dev_split": "dev",
                "reflection_agent": "claude",
                "max_metric_calls": 400,
                "max_repairs": 1,
                "stop_score": 0.92,
            },
        )
    )
    assert isinstance(evaluation, EvalSpec)
    assert [tuple(scorer.model_dump(by_alias=True, exclude_none=True)) for scorer in evaluation.scorers] == [
        ("id", "kind", "use"),
        ("id", "kind", "inference", "agent"),
        ("id", "kind", "run"),
    ]
    assert evaluation.optimization is not None
    assert evaluation.optimization.limits is None


def test_model_strings_parse_into_provider_and_name() -> None:
    assert parse_model("openrouter:qwen/qwen3.8-max-0902") == ModelRef(ProviderName.OPENROUTER, "qwen/qwen3.8-max-0902")
    assert parse_model("together:meta-llama/Llama-3.3-70B-Instruct-Turbo").provider is ProviderName.TOGETHER
    for bad in ("gpt-5", "google-gla:gemini", "mistral:large", "openai:"):
        with pytest.raises(ModelSyntaxError):
            parse_model(bad)


def test_profile_table_marks_only_openrouter_rows_verified() -> None:
    assert {model for model, profile in MODEL_PROFILES.items() if profile.verified} == {
        model for model in MODEL_PROFILES if model.startswith("openrouter:")
    }
    gemini = MODEL_PROFILES["google:gemini-3.8-flash"]
    assert gemini.input == frozenset(Modality)
    assert gemini.strict
    painter = MODEL_PROFILES["google:gemini-3-pro-image"]
    assert Modality.IMAGE in painter.output
    assert not painter.strict


@pytest.mark.parametrize(
    ("model", "family"),
    [
        ("together:meta-llama/Llama-4-Maverick", ModelFamily.META),
        ("together:Qwen/Qwen3.8-Flash", ModelFamily.QWEN),
        ("openrouter:z-ai/glm-5.3", ModelFamily.ZHIPU),
        ("openrouter:moonshotai/kimi-k3", ModelFamily.MOONSHOT),
        ("anthropic:claude-haiku-5", ModelFamily.ANTHROPIC),
        ("openrouter:nousresearch/hermes-5", ModelFamily.OTHER),
    ],
)
def test_unknown_model_gets_text_only_profile_and_family_by_prefix(model: str, family: ModelFamily) -> None:
    profile = resolve_profile(model, None)

    assert (profile.family, profile.input, profile.output, profile.strict, profile.verified) == (
        family,
        frozenset({Modality.TEXT}),
        frozenset({Modality.TEXT}),
        False,
        False,
    )


def test_agent_capabilities_override_the_profile() -> None:
    override = CapabilityOverride(family=ModelFamily.MISTRAL, input=[Modality.TEXT, Modality.AUDIO], strict=True)

    profile = resolve_profile("openrouter:deepseek/deepseek-v4-pro-0813", override)

    assert profile.family is ModelFamily.MISTRAL
    assert profile.input == frozenset({Modality.TEXT, Modality.AUDIO})
    assert profile.output == frozenset({Modality.TEXT})
    assert profile.strict


def test_types_validate_and_keep_field_order() -> None:
    record = TYPE_ADAPTER.validate_python(
        type_document("record", pii="pii", fields=[field("email", "Text?", maxLength=254)])
    )
    assert list(type(record).model_fields)[:4] == ["api_version", "kind", "type", "description"]
    value = TYPE_ADAPTER.validate_python(type_document("value", base="Float", minimum=0, maximum=1))
    assert list(type(value).model_fields)[:6] == ["api_version", "kind", "type", "description", "pii", "base"]
    assert validation_errors(TYPE_ADAPTER, type_document("view"))[0][0] == "union_tag_invalid"
    assert ("extra_forbidden", ("id", "source")) in validation_errors(TYPE_ADAPTER, type_document("id", source="x"))


def build_models() -> Mapping[str, object]:
    specs = {
        "CurrencyCode": type_document(
            "enum", values=[{"value": "eur", "description": "Евро"}, {"value": "usd", "description": "Доллар"}]
        ),
        "OrderId": type_document("id", pattern=r"^LUM-[0-9]{8}$"),
        "Money": type_document(
            "record",
            fields=[field("amount_minor", "Int", minimum=0, maximum=1_000_000), field("currency", "CurrencyCode")],
        ),
        "Decision": type_document(
            "union",
            discriminator="kind",
            variants=[
                {"name": "refund", "description": "Возврат", "fields": [field("amount", "Money")]},
                {"name": "reject", "description": "Отказ", "fields": [field("reason", "Text", maxLength=400)]},
            ],
        ),
        "Order": type_document(
            "record",
            fields=[
                field("order_id", "OrderId"),
                field("total", "Money"),
                field("notes", "Text[]?", maxItems=8, maxLength=64),
                field("locale", "Locale"),
                field("receipt", "Image?"),
            ],
        ),
    }
    models = build_type_models({TypeId(name): TYPE_ADAPTER.validate_python(spec) for name, spec in specs.items()})
    assert dict(models.failures) == {}
    return {name: models.resolve(TypeId(name)) for name in specs}


def test_generated_models_match_mirrors() -> None:
    generated = build_models()
    mirrors: Mapping[str, object] = {
        "CurrencyCode": CurrencyCode,
        "OrderId": OrderIdField,
        "Money": Money,
        "Decision": Decision,
        "Order": Order,
    }
    for name, mirror in mirrors.items():
        assert normalized_schema(generated[name]) == normalized_schema(mirror), name


def dynamic_registry() -> dict[TypeId, TypeSpec]:
    specs = {
        "OrderId": type_document("id", pattern=r"^LUM-[0-9]{8}$", maxLength=12),
        "Symptom": type_document(
            "enum", values=[{"value": "flicker", "description": "Мерцает"}, {"value": "no_power", "description": "Нет"}]
        ),
        "Score": type_document("value", base="Float", minimum=0, maximum=1),
        "Address": type_document("record", fields=[field("line", "Text", maxLength=200)]),
        "Channel": type_document(
            "union",
            discriminator="kind",
            variants=[{"name": "store", "description": "Витрина"}, {"name": "market", "description": "Площадка"}],
        ),
        "Evidence": type_document("record", fields=[field("photo", "Image?")]),
    }
    return {TypeId(name): TYPE_ADAPTER.validate_python(spec) for name, spec in specs.items()}


def test_dynamic_record_expands_registry_types_with_their_constraints() -> None:
    models = build_type_models(dynamic_registry())
    shared = [field("order_id", "OrderId"), field("symptoms", "Symptom[]", maxItems=2), field("score", "Score?")]
    specs = [
        *shared,
        field("address", "Record", fields=[field("line", "Text", maxLength=200)]),
        field("note", "Text", maxLength=40),
    ]
    declared = [*shared, field("address", "Address"), field("note", "Text", maxLength=40)]

    dynamic = models.dynamic_record("CaseForm", TypeAdapter(list[FieldSpec]).validate_python(specs))
    record = models.record("CaseForm", TypeAdapter(list[FieldDecl]).validate_python(declared))

    assert normalized_schema(dynamic) == normalized_schema(record)
    valid: dict[str, JsonValue] = {
        "order_id": "LUM-20260917",
        "symptoms": ["flicker"],
        "score": 0.5,
        "address": {"line": "Тверская, 1"},
        "note": "срочно",
    }
    assert dynamic.model_validate(valid).model_dump(mode="json") == valid
    for key, broken in (("order_id", "LUM-1"), ("symptoms", ["burning"]), ("score", 2)):
        with pytest.raises(ValidationError):
            dynamic.model_validate({**valid, key: broken})


@pytest.mark.parametrize(
    ("type_ref", "issue"),
    [
        ("Ghost", FieldSpecTypeIssue.UNKNOWN),
        ("Channel", FieldSpecTypeIssue.FORBIDDEN),
        ("Evidence[]", FieldSpecTypeIssue.FORBIDDEN),
    ],
    ids=["unknown", "union", "record_with_media"],
)
def test_dynamic_record_rejects_types_outside_the_field_spec_language(type_ref: str, issue: FieldSpecTypeIssue) -> None:
    registry = dynamic_registry()
    type_id = parse_type_ref(type_ref).type_id
    problem = field_spec_type_problem(type_id, registry)

    assert problem is not None
    assert problem.issue is issue
    assert field_spec_type_problem(TypeId("Address"), registry) is None
    with pytest.raises(TypeModelError, match=type_id):
        build_type_models(registry).dynamic_record("Form", [FieldSpec.model_validate(field("value", type_ref))])


def test_generated_models_validate_values() -> None:
    models = build_type_models(
        {
            TypeId("Batch"): TYPE_ADAPTER.validate_python(
                type_document("record", fields=[field("copy", "Text[]", maxItems=2, maxLength=5)])
            )
        }
    )
    batch = models.model(TypeId("Batch"))
    assert batch.model_validate({"copy": ["a", "b"]}).model_dump() == {"copy": ["a", "b"]}
    with pytest.raises(ValidationError):
        batch.model_validate({"copy": ["a", "b", "c"]})
    with pytest.raises(ValidationError):
        batch.model_validate(batch.model_construct(copy_=["a", "b", "c"]))


def test_type_model_failures_are_recorded() -> None:
    specs = {
        TypeId("Loop"): TYPE_ADAPTER.validate_python(type_document("record", fields=[field("next", "Loop?")])),
        TypeId("Orphan"): TYPE_ADAPTER.validate_python(type_document("record", fields=[field("x", "Missing")])),
        TypeId("Code"): TYPE_ADAPTER.validate_python(type_document("id", maxLength=12)),
    }
    models = build_type_models(specs)
    assert set(models.failures) == {TypeId("Loop"), TypeId("Orphan")}
    with pytest.raises(TypeModelError):
        models.model(TypeId("Orphan"))
    with pytest.raises(TypeModelError):
        models.model(TypeId("Code"))
    assert TypeId("Code") in models
    assert normalized_schema(models.annotation(TypeRef(TypeId("Code"), is_list=True, is_optional=True))) == {
        "anyOf": [{"items": {"maxLength": 12, "type": "string"}, "type": "array"}, {"type": "null"}]
    }


def test_normalized_schema_keeps_user_property_names() -> None:
    class Titled(BaseModel):
        title: str = Field(description="Заголовок")
        description: str
        default: int = 3

    assert normalized_schema(Titled) == {
        "properties": {"title": {"type": "string"}, "description": {"type": "string"}, "default": {"type": "integer"}},
        "required": ["title", "description"],
        "type": "object",
    }


def test_field_spec_and_media_values() -> None:
    spec = FieldSpec.model_validate(
        {"name": "serial", "type": "Text", "description": "Серийный номер", "maxLength": 40}
    )
    assert spec.max_length == 40
    with pytest.raises(ValidationError):
        FieldSpec.model_validate({"name": "photo", "type": "Image", "description": "Фото"})
    with pytest.raises(ValidationError):
        FieldSpec.model_validate({"name": "address", "type": "Record", "description": "Адрес"})
    blob = "sha256-" + "a" * 64
    image = Image.model_validate({"$media": "image/png", "blob_id": blob, "size_bytes": 10, "name": None})
    assert image.model_dump(mode="json") == {"$media": "image/png", "blob_id": blob, "size_bytes": 10, "name": None}
    assert Image(media_type="image/jpeg", blob_id=BlobId(blob), size_bytes=1, name="a.jpg").media_type == "image/jpeg"
    with pytest.raises(ValidationError):
        Image.model_validate({"$media": "video/mp4", "blob_id": blob, "size_bytes": 10, "name": None})
    with pytest.raises(ValidationError):
        DynamicLimits.model_validate({"max_fields": 1, "max_depth": 4, "max_text_length": 1, "max_items": 1})


def test_field_spec_takes_registry_types_and_their_constraints_from_the_registry() -> None:
    order = FieldSpec.model_validate({"name": "order_id", "type": "OrderId?", "description": "Заказ"})
    tags = FieldSpec.model_validate({"name": "tags", "type": "Tag[]", "description": "Метки", "maxItems": 3})

    assert (order.type, tags.max_items) == ("OrderId?", 3)
    with pytest.raises(ValidationError, match="pattern"):
        FieldSpec.model_validate({"name": "order_id", "type": "OrderId", "description": "З", "pattern": "^LUM-"})
    with pytest.raises(ValidationError, match="enum"):
        FieldSpec.model_validate({"name": "symptom", "type": "Symptom", "description": "С", "enum": ["flicker"]})


def test_editor_schemas_cover_every_kind(tmp_path: Path) -> None:
    node_schema = editor_schema(SpecKind.NODE)
    discriminator = node_schema["discriminator"]
    assert isinstance(discriminator, dict)
    mapping = discriminator["mapping"]
    assert isinstance(mapping, dict)
    assert set(mapping) == {"llm", "code", "tool", "human", "parallel", "map", "switch", "loop", "call", "narrow"}
    written = write_editor_schemas(tmp_path)
    assert {path.name for path in written} == {f"{kind.value.lower()}.schema.json" for kind in SpecKind}
    agent_schema = json.loads((tmp_path / ".aqven" / "schema" / "agent.schema.json").read_text(encoding="utf-8"))
    assert agent_schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert "model" in agent_schema["properties"]


def test_builder_inference_matches_yaml_form() -> None:
    built = inference_spec(Resolve, description="Решение по заказу")
    expected = INFERENCE_ADAPTER.validate_python(
        document(
            "Inference",
            description="Решение по заказу",
            **{
                "in": [
                    field("order", "Order", description="Заказ покупателя"),
                    field("tags", "Text[]", description="Метки обращения", maxLength=40, maxItems=5),
                ],
                "out": [
                    field("reasoning", "Text", description="Обоснование решения", maxLength=600),
                    field("decision", "Decision", description="Решение"),
                ],
            },
        )
    )
    assert built == expected
    coded = inference_spec(Resolve, description="Решение по заказу", prompt="lumen.code.prompting:resolve_prompt")
    assert coded.prompt == "lumen.code.prompting:resolve_prompt"


def test_builder_llm_and_tool_nodes_only_bind() -> None:
    node = llm("resolve", inference="resolve", agent="writer", bind={"order": "$input"}, description="Решение")
    assert node.node_id == NodeId("resolve")
    assert node.spec == NODE_ADAPTER.validate_python(
        node_document(
            "llm", description="Решение", inference="resolve", agent="writer", **{"in": [binding("order", "$input")]}
        )
    )
    tool_node = tool("lookup", tool="lookup_order", bind={"order_id": "$input.order_id"}, description="Поиск заказа")
    assert [(item.name, item.from_) for item in tool_node.spec.in_] == [("order_id", "$input.order_id")]


def test_builder_translates_python_types() -> None:
    node = code(
        "normalize",
        normalize_totals,
        bind={"order": "$extract.out.order", "currency": "$input.currency"},
        description="Пересчёт",
    )
    assert node.spec.run.endswith(":normalize_totals")
    assert [(item.name, item.type, item.enum) for item in node.spec.in_] == [
        ("order", "Order", None),
        ("currency", "CurrencyCode", None),
    ]
    assert [(item.name, item.type, item.minimum, item.maximum) for item in node.spec.out] == [
        ("total", "Money", None, None),
        ("lines", "Int", 0, 500),
    ]


def test_builder_errors() -> None:
    with pytest.raises(BuilderError, match="In"):
        inference_spec(Undescribed, description="d")
    with pytest.raises(BuilderError, match="no description"):
        code("n", normalize_silent, bind={"order": "$input"}, description="d")
    with pytest.raises(BuilderError, match="bind"):
        code("n", normalize_totals, bind={"order": "$input"}, description="d")


def test_builder_flow() -> None:
    resolve = llm("resolve", inference="resolve", agent="writer", bind={"order": "$input"}, description="Решение")
    built = flow(
        description="Статус заказа",
        input=OrderStatusRequest,
        output=OrderStatusReply,
        returns={"decision": "$resolve.out.decision", "reasoning": "$resolve.out.reasoning"},
        nodes=[resolve],
        context=[RunContextKey.DATE],
    )
    assert [item.name for item in built.spec.returns] == ["reasoning", "decision"]
    assert built.spec.order == [NodeId("resolve")]
    assert built.spec.limits is None
    assert isinstance(built.nodes[NodeId("resolve")], LlmNodeSpec)
    with pytest.raises(BuilderError, match="duplicate node ids"):
        flow(
            description="d",
            input=OrderStatusRequest,
            output=OrderStatusReply,
            returns={"decision": "$a.out.b", "reasoning": "$a.out.c"},
            nodes=[resolve, resolve],
        )
    with pytest.raises(BuilderError, match="returns"):
        flow(description="d", input=OrderStatusRequest, output=OrderStatusReply, returns={}, nodes=[resolve])


def test_every_spec_kind_has_a_model() -> None:
    assert set(SPEC_MODEL_BY_KIND) == set(SpecKind)


def test_diagnostic_tables_and_text() -> None:
    warnings = {code for code, severity in SEVERITY_BY_CODE.items() if severity is Severity.WARNING}
    assert warnings == {
        DiagnosticCode.W_PROMPT_SHADOWED,
        DiagnosticCode.W_GENERATED_STALE,
        DiagnosticCode.W_OUTPUT_MODE_RESOLVED,
        DiagnosticCode.W_TYPES_SHADOWS_STDLIB,
    }
    assert all(code.value.startswith("W_") == (code in warnings) for code in DiagnosticCode)
    unbounded = diagnostic(
        DiagnosticCode.E_OUTPUT_UNBOUNDED,
        "flows/a/nodes/b.yaml",
        ["out", 0, "type"],
        "output is unbounded",
        line=12,
        column=9,
    )
    assert unbounded.rule == "R-42"
    assert diagnostic(DiagnosticCode.E_INPUT_UNBOUND, "a.yaml", ["in"], "m").rule == "R-09"
    notice = unbounded.model_copy(update={"severity": Severity.WARNING, "file": "aqven.yaml", "line": None})
    assert not has_errors([notice])
    assert has_errors([notice, unbounded])
    assert format_text([unbounded]).splitlines() == [
        "flows/a/nodes/b.yaml:12:9: error E_OUTPUT_UNBOUNDED R-42 out[0].type: output is unbounded",
        "errors: 1, warnings: 0",
    ]
    report = json.loads(format_json([unbounded, notice]))
    assert report["ok"] is False
    assert (report["errors"], report["warnings"]) == (1, 1)
    assert report["diagnostics"][0]["path"] == ["out", 0, "type"]


def test_sort_diagnostics_orders_by_file_line_code() -> None:
    items = [
        diagnostic(DiagnosticCode.E_REF_MISSING, "b.yaml", [], "m", line=1),
        diagnostic(DiagnosticCode.E_CYCLE, "a.yaml", [], "m", line=5),
        diagnostic(DiagnosticCode.E_BAD_NAME, "a.yaml", [], "m", line=5),
        diagnostic(DiagnosticCode.E_API_VERSION, "a.yaml", [], "m", line=2),
    ]
    ordered = sort_diagnostics(items)
    assert [(item.file, item.line, item.code) for item in ordered] == [
        ("a.yaml", 2, DiagnosticCode.E_API_VERSION),
        ("a.yaml", 5, DiagnosticCode.E_BAD_NAME),
        ("a.yaml", 5, DiagnosticCode.E_CYCLE),
        ("b.yaml", 1, DiagnosticCode.E_REF_MISSING),
    ]
    with pytest.raises(ValidationError):
        Diagnostic.model_validate({"code": "E_NOPE", "severity": "error", "file": "a", "path": [], "message": "m"})
