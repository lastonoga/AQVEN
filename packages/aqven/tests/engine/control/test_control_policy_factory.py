from dataclasses import dataclass, field

import control_policies
import pytest
from pydantic import JsonValue

from aqven.engine.policies import JSON_CODEC, AdapterCodec, PolicyError, PolicyFactory, codec_for
from aqven.ir import BuiltinPolicy, CodePolicy
from aqven.policies import BranchResult, Continue, Default, Done, JoinState, LoopState, Stop, Wait
from aqven.spec import CodeRef, MapItemError


@dataclass(slots=True)
class CountingLoader:
    loaded: list[str] = field(default_factory=list[str])

    def load(self, ref: str) -> object:
        self.loaded.append(ref)
        return getattr(control_policies, ref.partition(":")[2])


def test_factory_caches_rules_and_uses_the_injected_loader() -> None:
    loader = CountingLoader()
    factory = PolicyFactory(loader=loader)
    policy = CodePolicy(run=CodeRef("anywhere.policies:no_issues"), params={"path": "$iter.check.out.issues"})

    first = factory.stop(policy)
    second = factory.stop(policy.model_copy())

    assert first is second
    assert loader.loaded == ["anywhere.policies:no_issues"]
    assert first.path == "$iter.check.out.issues"
    empty: JsonValue = {"check": {"out": {"issues": []}}}
    busy: JsonValue = {"check": {"out": {"issues": ["x"]}}}
    assert isinstance(first.decide(LoopState((busy,))), Continue)
    assert isinstance(first.decide(LoopState((busy, empty))), Stop)


def test_builtin_join_rules_work_on_json_values() -> None:
    rule = PolicyFactory().join(BuiltinPolicy(use="quorum", params={"min_ok": 2}))

    waiting = rule.decide(JoinState((BranchResult[JsonValue]("a", {"x": 1}),), ("b", "c")))
    done = rule.decide(JoinState((BranchResult[JsonValue]("a", {"x": 1}), BranchResult[JsonValue]("b", [1])), ("c",)))

    assert isinstance(waiting, Wait)
    assert done == Done(({"x": 1}, [1]))


def test_item_error_rule_encodes_generated_model_defaults() -> None:
    rule = PolicyFactory().item_error(CodePolicy(run=CodeRef("control_policies:abstain"), params={"intent": "none"}))

    decision = rule.decide({"perspective": "buyer"}, MapItemError(index=0, code="refusal", message="no"))

    assert decision == Default({"intent": "none:buyer", "confidence": 0.0})


def test_select_rule_validates_the_returned_index() -> None:
    rule = PolicyFactory().select(BuiltinPolicy(use="best", params={"path": "$iter.critique.out.score"}))
    scores: tuple[JsonValue, ...] = tuple({"critique": {"out": {"score": score}}} for score in (0.2, 0.9, 0.5))

    assert rule.choose(LoopState(scores)) == 1

    broken = PolicyFactory().select(CodePolicy(run=CodeRef("control_policies:out_of_range")))
    with pytest.raises(PolicyError) as raised:
        broken.choose(LoopState(scores))
    assert raised.value.code == "E_POLICY_RESULT"


def test_codecs_pass_json_through_and_validate_models() -> None:
    assert codec_for(object) is JSON_CODEC
    assert codec_for(JsonValue) is JSON_CODEC
    assert JSON_CODEC.encode(control_policies.Vote(intent="refund", confidence=1.0)) == {
        "intent": "refund",
        "confidence": 1.0,
    }
    codec = codec_for(control_policies.Verdict)
    assert isinstance(codec, AdapterCodec)
    decoded = codec.decode({"best_index": 2, "rationale": "better"})
    assert decoded == control_policies.Verdict(best_index=2, rationale="better")
    assert codec.encode(decoded) == {"best_index": 2, "rationale": "better"}


def test_params_must_be_a_pydantic_model_and_arity_must_match() -> None:
    factory = PolicyFactory()
    cases = {
        "control_policies:plain_params": "E_CODE_SIGNATURE_MISMATCH",
        "control_policies:one_argument": "E_CODE_SIGNATURE_MISMATCH",
        "control_policies:NOT_A_FUNCTION": "E_CODE_SIGNATURE_MISMATCH",
        "missing_module_for_policies:run": "E_CODE_REF_UNRESOLVED",
    }
    for ref, code in cases.items():
        with pytest.raises(PolicyError) as raised:
            factory.select(CodePolicy(run=CodeRef(ref)))
        assert raised.value.code == code
