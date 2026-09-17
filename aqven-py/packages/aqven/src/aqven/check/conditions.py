from collections.abc import Callable, Mapping, Sequence
from typing import Final

from liquid.builtin.expressions import BooleanExpression, Nil, Path, StringLiteral
from liquid.builtin.expressions.logical import EqExpression, LogicalAndExpression, LogicalOrExpression, NeExpression
from liquid.builtin.expressions.primitive import FalseLiteral, FloatLiteral, IntegerLiteral, TrueLiteral
from liquid.expression import Expression

from aqven.check.shapes import (
    LIST_PROPERTIES,
    Missing,
    NotList,
    Opaque,
    enum_values,
    is_list,
    is_media,
    is_optional,
    step_element,
    step_field,
    unwrap,
)

type TemplateScope = Mapping[str, object | None]
type ConditionRule = Callable[[Expression, TemplateScope], tuple[str, ...]]
type LiteralRule = Callable[[Path, Expression, object], tuple[str, ...]]

SIZE_PROPERTY: Final = "size"


def path_annotation(expression: object, scope: TemplateScope) -> object | None:
    if not isinstance(expression, Path):
        return None
    segments = list(expression.path)
    head = segments[0] if segments else None
    if not isinstance(head, str) or head not in scope:
        return None
    annotation = scope[head]
    return follow(annotation, segments[1:]) if annotation is not None else None


def follow(annotation: object, segments: Sequence[object]) -> object:
    current: object = annotation
    for segment in segments:
        current = _segment(current, segment)
        if isinstance(current, Missing | Opaque | NotList):
            return current
    return current


def resolved(annotation: object | None) -> object | None:
    if annotation is None or isinstance(annotation, Missing | Opaque | NotList):
        return None
    return annotation


def condition_problems(expression: Expression, scope: TemplateScope) -> tuple[str, ...]:
    rule = CONDITION_RULES.get(type(expression))
    if rule is None:
        return (
            f"expression '{expression}' is not allowed in a condition: use a field, a field compared "
            "with a literal through == or !=, and, or",
        )
    return rule(expression, scope)


def condition_typed(annotation: object) -> bool:
    core = unwrap(annotation).core
    return is_optional(annotation) or core is bool or enum_values(annotation) is not None or is_media(annotation)


def _segment(annotation: object, segment: object) -> object:
    if isinstance(segment, str) and segment in LIST_PROPERTIES and is_list(annotation):
        return step_element(annotation) if segment != SIZE_PROPERTY else int
    if isinstance(segment, str):
        return step_field(annotation, segment)
    return step_element(annotation)


def _boolean(expression: Expression, scope: TemplateScope) -> tuple[str, ...]:
    if not isinstance(expression, BooleanExpression):
        return ()
    return condition_problems(expression.expression, scope)


def _logical(expression: Expression, scope: TemplateScope) -> tuple[str, ...]:
    if not isinstance(expression, LogicalAndExpression | LogicalOrExpression):
        return ()
    return (*condition_problems(expression.left, scope), *condition_problems(expression.right, scope))


def _truthy(expression: Expression, scope: TemplateScope) -> tuple[str, ...]:
    annotation = resolved(path_annotation(expression, scope))
    if annotation is None or condition_typed(annotation):
        return ()
    return (f"condition on {expression}: the field type is not Bool, T?, enum or a media slot",)


def _constant(expression: Expression, scope: TemplateScope) -> tuple[str, ...]:
    return (f"condition '{expression}' is a constant: a condition checks an input field",)


def _comparison(expression: Expression, scope: TemplateScope) -> tuple[str, ...]:
    if not isinstance(expression, EqExpression | NeExpression):
        return ()
    operands = (expression.left, expression.right)
    paths = [operand for operand in operands if isinstance(operand, Path)]
    literals = [operand for operand in operands if not isinstance(operand, Path)]
    if len(paths) != 1:
        return (f"comparison '{expression}': compare exactly one field with a literal",)
    path, literal = paths[0], literals[0]
    annotation = resolved(path_annotation(path, scope))
    if annotation is None:
        return ()
    rule = LITERAL_RULES.get(type(literal))
    if rule is None:
        return (
            f"literal {literal} is not allowed in a condition: compare only with an enum value, true, false or nil",
        )
    return rule(path, literal, annotation)


def _enum_literal(path: Path, literal: Expression, annotation: object) -> tuple[str, ...]:
    values = enum_values(annotation)
    text = literal.value if isinstance(literal, StringLiteral) else str(literal)
    if values is not None and text in values:
        return ()
    if values is None:
        return (f"comparison of {path} with string {text!r}: the field is not an enum",)
    return (f"comparison of {path} with value {text!r}, which is not in the enum: {', '.join(values)}",)


def _bool_literal(path: Path, literal: Expression, annotation: object) -> tuple[str, ...]:
    if unwrap(annotation).core is bool:
        return ()
    return (f"comparison of {path} with {literal}: the field is not Bool",)


def _nil_literal(path: Path, literal: Expression, annotation: object) -> tuple[str, ...]:
    if is_optional(annotation):
        return ()
    return (f"comparison of {path} with nil: the field is not T?",)


def _numeric_literal(path: Path, literal: Expression, annotation: object) -> tuple[str, ...]:
    return (
        f"comparison of {path} with number {literal}: numeric literals are not allowed in conditions, "
        "derive a Bool field for the threshold",
    )


CONDITION_RULES: Final[Mapping[type, ConditionRule]] = {
    BooleanExpression: _boolean,
    LogicalAndExpression: _logical,
    LogicalOrExpression: _logical,
    EqExpression: _comparison,
    NeExpression: _comparison,
    Path: _truthy,
    StringLiteral: _constant,
    TrueLiteral: _constant,
    FalseLiteral: _constant,
    Nil: _constant,
    IntegerLiteral: _constant,
    FloatLiteral: _constant,
}

LITERAL_RULES: Final[Mapping[type, LiteralRule]] = {
    StringLiteral: _enum_literal,
    TrueLiteral: _bool_literal,
    FalseLiteral: _bool_literal,
    Nil: _nil_literal,
    IntegerLiteral: _numeric_literal,
    FloatLiteral: _numeric_literal,
}
