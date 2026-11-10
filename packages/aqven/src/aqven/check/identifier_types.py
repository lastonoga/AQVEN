import re
from collections.abc import Iterable, Mapping
from typing import Final

from aqven.check.context import CheckContext
from aqven.check.nodes import field_sites
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.spec import TEXT, FieldDecl, TypeId, TypeRefSyntaxError, TypeSpec, ValueType, parse_type_ref

IDENTIFIER_NAME: Final = re.compile(r"(?:^id$|_ids?$)")
IDENTIFIER_DESCRIPTION: Final = re.compile(r"(?<![A-Za-z0-9_])ID(?![A-Za-z0-9_])")
HINT: Final = (
    "use an IdType for an entity ID, or an enum for a genuinely closed codebook; "
    "selecting existing entities also requires an appropriate allowed set after the type correction"
)

type Types = Mapping[TypeId, TypeSpec]


def check_identifier_types(context: CheckContext) -> Iterable[Diagnostic]:
    types = {type_id: source.spec for type_id, source in context.project.types.items()}
    return tuple(
        _finding(site.file, (*site.path, "type"), site.decl)
        for site in field_sites(context.graph)
        if _matches(site.decl, types)
    )


def _matches(decl: FieldDecl, types: Types) -> bool:
    lexical = (
        IDENTIFIER_NAME.search(decl.name) is not None
        or IDENTIFIER_DESCRIPTION.search(decl.description) is not None
    )
    return lexical and _text_storage(decl, types)


def _text_storage(decl: FieldDecl, types: Types) -> bool:
    if decl.enum is not None:
        return False
    try:
        ref = parse_type_ref(decl.type)
    except TypeRefSyntaxError:
        return False
    if ref.type_id == TEXT:
        return True
    spec = types.get(ref.type_id)
    return isinstance(spec, ValueType) and spec.base == TEXT and spec.enum is None


def _finding(file: str, path: tuple[str | int, ...], decl: FieldDecl) -> Diagnostic:
    message = (
        f"Field `{decl.name}` self-declares an identifier but uses `Text`; "
        "use an `IdType` for an entity ID, or an enum for a genuinely closed codebook."
    )
    return diagnostic(DiagnosticCode.W_TEXT_IDENTIFIER_TYPE, file, path, message, hint=HINT)
