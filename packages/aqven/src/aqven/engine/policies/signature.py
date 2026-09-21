import inspect
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Final, get_args, get_type_hints

from pydantic import BaseModel, JsonValue, ValidationError

from aqven.engine.policies.errors import PolicyError
from aqven.engine.policies.loading import PolicyFunction

RETURN_HINT: Final = "return"


@dataclass(frozen=True, slots=True)
class PolicySignature:
    label: str
    function: PolicyFunction
    names: tuple[str, ...]
    hints: Mapping[str, object]

    def parameter(self, position: int) -> object:
        return self.hints.get(self.names[position])

    @property
    def returns(self) -> object:
        return self.hints.get(RETURN_HINT)

    def params(self, values: Mapping[str, JsonValue]) -> BaseModel:
        model = self.parameter(-1)
        if not isinstance(model, type) or not issubclass(model, BaseModel):
            raise PolicyError(
                "E_CODE_SIGNATURE_MISMATCH",
                self.label,
                f"parameter {self.names[-1]} must be a Pydantic model of the with parameters",
            )
        try:
            return model.model_validate(dict(values))
        except ValidationError as error:
            raise PolicyError("E_POLICY_PARAMS", self.label, _problems(error)) from error


def inspect_policy(label: str, target: object, arity: int) -> PolicySignature:
    if not callable(target):
        raise PolicyError("E_CODE_SIGNATURE_MISMATCH", label, "reference does not point to a function")
    names = _parameter_names(label, target)
    if len(names) != arity:
        raise PolicyError("E_CODE_SIGNATURE_MISMATCH", label, f"expected {arity} parameters, got {len(names)}")
    return PolicySignature(label, target, names, _hints(label, target))


def type_argument(annotation: object) -> object:
    arguments = get_args(annotation)
    return arguments[0] if arguments else None


def _parameter_names(label: str, target: Callable[..., object]) -> tuple[str, ...]:
    try:
        return tuple(inspect.signature(target).parameters)
    except (TypeError, ValueError) as error:
        raise PolicyError("E_CODE_SIGNATURE_MISMATCH", label, f"cannot read the signature: {error}") from error


def _hints(label: str, target: Callable[..., object]) -> Mapping[str, object]:
    try:
        return get_type_hints(target)
    except Exception as error:
        raise PolicyError("E_CODE_SIGNATURE_MISMATCH", label, f"cannot resolve annotations: {error}") from error


def _problems(error: ValidationError) -> str:
    return "; ".join(f"{'.'.join(str(part) for part in item['loc'])}: {item['msg']}" for item in error.errors())
