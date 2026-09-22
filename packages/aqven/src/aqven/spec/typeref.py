import re
from dataclasses import dataclass
from typing import Final

from aqven.spec.names import TypeId

TYPE_ID_PREFIX: Final = re.compile(r"[A-Z][A-Za-z0-9_]{0,62}")
SUFFIX: Final = re.compile(r"(?P<list>\[\])?(?P<optional>\?)?")
IDENTIFIER_CHAR: Final = re.compile(r"[A-Za-z0-9_]")
TYPE_ID_MAX_LENGTH: Final = 63

TRAILING_REASONS: Final[tuple[tuple[str, str], ...]] = (
    ("[]", "nested lists T[][] and lists of optional values T?[] are not allowed"),
    ("?", "the ? suffix is allowed only once and only at the end"),
)
TRAILING_FALLBACK: Final = "invalid character: expected the end of the type reference, [] or ?"


class TypeRefSyntaxError(ValueError):
    def __init__(self, text: str, position: int, reason: str) -> None:
        super().__init__(f"{text!r}, position {position}: {reason}")
        self.text = text
        self.position = position
        self.reason = reason


@dataclass(frozen=True, slots=True)
class TypeRef:
    type_id: TypeId
    is_list: bool
    is_optional: bool

    def __str__(self) -> str:
        list_suffix = "[]" if self.is_list else ""
        optional_suffix = "?" if self.is_optional else ""
        return f"{self.type_id}{list_suffix}{optional_suffix}"

    @property
    def item(self) -> TypeRef:
        return TypeRef(self.type_id, is_list=False, is_optional=False)

    @property
    def required(self) -> TypeRef:
        return TypeRef(self.type_id, is_list=self.is_list, is_optional=False)


def parse_type_ref(text: str) -> TypeRef:
    head = TYPE_ID_PREFIX.match(text)
    if head is None:
        raise TypeRefSyntaxError(text, 0, "a type reference starts with a PascalCase identifier")
    suffix = SUFFIX.match(text, head.end())
    if suffix is None:
        raise TypeRefSyntaxError(text, head.end(), TRAILING_FALLBACK)
    if suffix.end() == len(text):
        return TypeRef(
            TypeId(head.group()),
            is_list=suffix.group("list") is not None,
            is_optional=suffix.group("optional") is not None,
        )
    raise TypeRefSyntaxError(text, suffix.end(), _trailing_reason(text, head.end(), suffix.end()))


def _trailing_reason(text: str, head_end: int, suffix_end: int) -> str:
    rest = text[suffix_end:]
    if suffix_end == head_end and IDENTIFIER_CHAR.match(text, head_end):
        return f"type id is longer than {TYPE_ID_MAX_LENGTH} characters"
    return next((reason for prefix, reason in TRAILING_REASONS if rest.startswith(prefix)), TRAILING_FALLBACK)
