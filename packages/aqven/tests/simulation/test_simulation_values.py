import re

from pydantic import JsonValue

from aqven.check.simulation.regex import sample_text
from aqven.check.simulation.values import MEDIA_SAMPLES, ValueFactory
from aqven.testing.blobs import blob_id_for


def values() -> ValueFactory:
    return ValueFactory()


def test_text_respects_length_and_pattern() -> None:
    schema: dict[str, JsonValue] = {"type": "string", "pattern": r"^cus_[a-z0-9]{12}$"}
    built = values().value(schema, "customer_id")
    assert isinstance(built, str)
    assert re.fullmatch(r"^cus_[a-z0-9]{12}$", built)


def test_text_fits_max_length() -> None:
    schema: dict[str, JsonValue] = {"type": "string", "maxLength": 4, "minLength": 3}
    built = values().value(schema, "short_field_with_a_long_name")
    assert isinstance(built, str)
    assert 3 <= len(built) <= 4


def test_enum_and_const_are_taken_from_the_schema() -> None:
    assert values().value({"enum": ["calm", "warm"]}, "mood") == "calm"
    assert values().value({"const": "storefront"}, "kind") == "storefront"


def test_numbers_stay_inside_their_bounds() -> None:
    assert values().value({"type": "number", "minimum": 0, "maximum": 1}, "score") == 0.5
    assert values().value({"type": "integer", "minimum": 3, "maximum": 9}, "count") == 6
    assert values().value({"type": "integer"}, "count") == 1
    assert values().value({"type": "boolean"}, "urgent") is True


def test_array_items_are_distinct_and_bounded() -> None:
    schema: dict[str, JsonValue] = {
        "type": "array",
        "items": {"type": "object", "properties": {"key": {"type": "string"}}},
        "maxItems": 5,
    }
    built = values().value(schema, "observations")
    assert isinstance(built, list)
    assert len(built) == 2
    assert built[0] != built[1]


def test_array_of_enums_cycles_through_the_options() -> None:
    schema: dict[str, JsonValue] = {"type": "array", "items": {"enum": ["a", "b", "c"]}}
    assert values().value(schema, "keys") == ["b", "c"]


def test_array_length_respects_min_items() -> None:
    schema: dict[str, JsonValue] = {"type": "array", "items": {"type": "string"}, "minItems": 3}
    built = values().value(schema, "tags")
    assert isinstance(built, list)
    assert len(built) == 3


def test_references_and_nullable_unions_resolve() -> None:
    schema: dict[str, JsonValue] = {
        "$defs": {"Note": {"type": "object", "properties": {"text": {"type": "string", "maxLength": 20}}}},
        "type": "object",
        "properties": {
            "note": {"$ref": "#/$defs/Note"},
            "maybe": {"anyOf": [{"type": "integer", "minimum": 2, "maximum": 2}, {"type": "null"}]},
        },
    }
    built = values().record(schema, "input")
    assert built["maybe"] == 2
    note = built["note"]
    assert isinstance(note, dict)
    assert isinstance(note["text"], str)


def test_media_values_point_at_a_known_blob() -> None:
    schema: dict[str, JsonValue] = {
        "type": "object",
        "properties": {
            "$media": {"type": "string", "pattern": r"^image/[a-z0-9.+-]+$"},
            "blob_id": {"type": "string", "pattern": r"^sha256-[0-9a-f]{64}$"},
            "size_bytes": {"type": "integer", "minimum": 0},
            "name": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        },
    }
    built = values().record(schema, "photo")
    sample = next(item for item in MEDIA_SAMPLES if item.media_type == "image/png")
    assert built["$media"] == "image/png"
    assert built["blob_id"] == blob_id_for(sample.data)
    assert built["size_bytes"] == len(sample.data)


def test_regex_samples_match_their_pattern() -> None:
    patterns = (
        r"^[a-z][a-z0-9_]{0,62}$",
        r"^LUM-[0-9]{8}$",
        r"^sha256-[0-9a-f]{64}$",
        r"^(application|text)/[a-z0-9.+-]+$",
        r"^\d{2,4}-[A-Z]+$",
        r"^[^0-9]{2}$",
        r"^ref:env/[A-Z][A-Z0-9_]*$",
    )
    for pattern in patterns:
        drawn = sample_text(pattern, 0)
        assert drawn is not None, pattern
        assert re.fullmatch(pattern, drawn), (pattern, drawn)


def test_regex_sample_grows_to_the_wanted_length() -> None:
    drawn = sample_text(r"^[a-z]{1,40}$", 12)
    assert drawn is not None
    assert len(drawn) == 12


def test_unsupported_pattern_has_no_sample() -> None:
    assert sample_text(r"(a)\1", 0) is None
    assert sample_text(r"[a-", 0) is None
