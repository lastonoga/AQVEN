import json
import re
from collections.abc import Mapping, Sequence
from typing import Annotated, Final

from pydantic import BaseModel, Field, JsonValue, TypeAdapter

from aqven.policies.contracts import POLICY_CONFIG, EvalContext, NoParams, RefPath, Verdict
from aqven.policies.paths import items, json_of, member, read, text
from aqven.spec import NAME_PATTERN, PiiDetector, RefRoot

CYRILLIC: Final = re.compile(r"[\u0400-\u04ff]")
LATIN: Final = re.compile(r"[a-zA-Z\u00c0-\u024f]")
LETTER: Final = re.compile(r"[^\W\d_]")
LANGUAGE_SHARE: Final = 0.6
LOCALE_SEPARATOR: Final = "-"
SCRIPTS: Final[Mapping[str, re.Pattern[str]]] = {
    "ru": CYRILLIC,
    "uk": CYRILLIC,
    "be": CYRILLIC,
    "kk": CYRILLIC,
    "en": LATIN,
    "de": LATIN,
    "fr": LATIN,
    "es": LATIN,
    "it": LATIN,
    "pt": LATIN,
    "pl": LATIN,
}
DETECTORS: Final[Mapping[PiiDetector, re.Pattern[str]]] = {
    PiiDetector.EMAIL: re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),
    PiiDetector.PHONE: re.compile(r"\+?\d[\d\s()-]{8,}\d"),
    PiiDetector.CARD_NUMBER: re.compile(r"\b(?:\d[ -]?){13,19}\b"),
    PiiDetector.IBAN: re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b"),
    PiiDetector.IP_ADDRESS: re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
}

JSON_ADAPTER: Final = TypeAdapter[JsonValue](JsonValue)
EXPECTED_CHECK: Final = "expected"
NO_EXPECTED_OUTPUT: Final = "there is no expected_output to compare with"

type Context = EvalContext[BaseModel, BaseModel]
type ExpectationContext = EvalContext[BaseModel, object]
type FieldName = Annotated[str, Field(pattern=NAME_PATTERN)]


class FieldParams(BaseModel):
    model_config = POLICY_CONFIG

    field: RefPath


class MaxWordsParams(FieldParams):
    max: int = Field(ge=1)


class LanguageParams(FieldParams):
    locale: RefPath


class NoPiiParams(BaseModel):
    model_config = POLICY_CONFIG

    fields: list[RefPath] = Field(min_length=1)
    detectors: list[PiiDetector] | None = None


class RegexParams(FieldParams):
    pattern: str = Field(min_length=1)


class UniqueItemsParams(FieldParams):
    key: str


class IdsInAllowedSetParams(FieldParams):
    allowed: RefPath


class CitationsInSourcesParams(BaseModel):
    model_config = POLICY_CONFIG

    citations: RefPath
    sources: RefPath
    id: str
    quote: str
    text: str


class ExpectedParams(BaseModel):
    model_config = POLICY_CONFIG

    fields: list[FieldName] | None = Field(default=None, min_length=1)


def not_empty(value: BaseModel, context: Context, params: FieldParams) -> Verdict:
    found = _read(value, context, params.field)
    filled = bool(found.strip()) if isinstance(found, str) else bool(found)
    return verdict(filled, f"{params.field} is empty")


def max_words(value: BaseModel, context: Context, params: MaxWordsParams) -> Verdict:
    count = len(text(_read(value, context, params.field)).split())
    return verdict(count <= params.max, f"{params.field}: {count} words, at most {params.max} allowed")


def language(value: BaseModel, context: Context, params: LanguageParams) -> Verdict:
    letters = LETTER.findall(text(_read(value, context, params.field)))
    code = text(_read(value, context, params.locale)).split(LOCALE_SEPARATOR)[0].lower()
    script = SCRIPTS.get(code)
    if script is None or not letters:
        return Verdict(passed=True, reason=f"language {code or '—'} is not supported by this check")
    share = sum(1 for letter in letters if script.fullmatch(letter)) / len(letters)
    return verdict(
        share >= LANGUAGE_SHARE, f"{params.field} is not in language {code}: alphabet letter share {share:.2f}"
    )


def no_pii(value: BaseModel, context: Context, params: NoPiiParams) -> Verdict:
    texts = [text(_read(value, context, path)) for path in params.fields]
    detectors = params.detectors or list(PiiDetector)
    found = sorted({item.value for item in detectors for part in texts if DETECTORS[item].search(part)})
    return verdict(not found, f"personal data found: {', '.join(found)}")


def regex(value: BaseModel, context: Context, params: RegexParams) -> Verdict:
    matched = re.search(params.pattern, text(_read(value, context, params.field))) is not None
    return verdict(matched, f"{params.field} does not match {params.pattern}")


def unique_items(value: BaseModel, context: Context, params: UniqueItemsParams) -> Verdict:
    keys = [json.dumps(member(item, params.key), sort_keys=True) for item in items(_read(value, context, params.field))]
    return verdict(len(set(keys)) == len(keys), f"{params.field}: key {params.key} is duplicated")


def ids_in_allowed_set(value: BaseModel, context: Context, params: IdsInAllowedSetParams) -> Verdict:
    found = _read(value, context, params.field)
    allowed = items(_read(value, context, params.allowed))
    outside = [item for item in (items(found) if isinstance(found, list) else [found]) if item not in allowed]
    return verdict(not outside, f"{params.field}: values outside the allowed set: {', '.join(map(str, outside))}")


def citations_in_sources(value: BaseModel, context: Context, params: CitationsInSourcesParams) -> Verdict:
    sources = {
        text(member(source, params.id)): text(member(source, params.text))
        for source in items(_read(value, context, params.sources))
    }
    citations = items(_read(value, context, params.citations))
    broken = [text(member(item, params.id)) for item in citations if not _cited(item, sources, params)]
    return verdict(not broken, f"quotes not found in sources: {', '.join(broken)}")


def expected(value: BaseModel, context: ExpectationContext, params: ExpectedParams) -> Verdict:
    wanted = _expected_output(context)
    gap = expectation_gap(wanted, params.fields)
    if gap is not None:
        return Verdict(passed=False, reason=gap)
    actual = json_of(value)
    if not isinstance(wanted, dict):
        return verdict(actual == wanted, "the output differs from expected_output")
    names = params.fields or list(wanted)
    differing = [name for name in names if member(actual, name) != member(wanted, name)]
    return verdict(not differing, f"fields differ from expected_output: {', '.join(differing)}")


def expectation_gap(wanted: JsonValue, fields: Sequence[str] | None) -> str | None:
    if wanted is None:
        return NO_EXPECTED_OUTPUT
    if fields is None:
        return None
    if not isinstance(wanted, dict):
        return f"expected_output is not an object with the fields {', '.join(fields)}"
    absent = [name for name in fields if name not in wanted]
    return f"expected_output lacks the fields {', '.join(absent)}" if absent else None


def cost_usd(value: BaseModel, context: Context, params: NoParams) -> Verdict:
    return Verdict(passed=True, score=context.cost_usd)


def latency_ms(value: BaseModel, context: Context, params: NoParams) -> Verdict:
    return Verdict(passed=True, score=float(context.latency_ms))


def verdict(passed: bool, reason: str) -> Verdict:
    return Verdict(passed=passed, reason=None if passed else reason)


def _cited(citation: JsonValue, sources: Mapping[str, str], params: CitationsInSourcesParams) -> bool:
    source = sources.get(text(member(citation, params.id)))
    return source is not None and text(member(citation, params.quote)) in source


def _expected_output(context: ExpectationContext) -> JsonValue:
    found = context.expected_output
    if isinstance(found, BaseModel):
        return json_of(found)
    return JSON_ADAPTER.validate_python(found)


def _read(value: BaseModel, context: Context, path: str) -> JsonValue:
    return read({RefRoot.OUT: json_of(value), RefRoot.IN: json_of(context.inputs)}, path)
