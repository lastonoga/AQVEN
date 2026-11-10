from pathlib import Path
from typing import Final

from risk_warnings import field, id_type, inference, install, record_type, shop, union_type

from aqven.check.value_paths import ValuePath, walk_inference
from aqven.loader import load_project
from aqven.spec import InferenceId, TypeId

NESTED_TYPES: Final = {
    "zone_id.yaml": id_type(),
    "zone.yaml": record_type(field("zone_id", "ZoneId")),
    "group.yaml": record_type(field("zones", "Zone[]", extra="  maxItems: 20\n")),
    "zone_result.yaml": record_type(field("zone_id", "ZoneId")),
}


def paths(root: Path) -> list[ValuePath]:
    loaded = load_project(root).project
    assert loaded is not None
    source = loaded.inferences[InferenceId("work")].source
    assert source is not None
    types = {type_id: item.spec for type_id, item in loaded.types.items()}
    return list(walk_inference(types, source.spec))


def test_nested_keyed_list_retains_path_capacity_and_output_anchor(tmp_path: Path) -> None:
    root = shop(tmp_path)
    source = inference(
        field("groups", "Group[]", extra="  maxItems: 10\n"),
        field("result", "ZoneResult[]", extra="  maxItems: 50\n"),
    )
    install(root, NESTED_TYPES, source)

    found = paths(root)
    input_id = next(item for item in found if item.path == "groups[*].zones[*].zone_id")
    output_id = next(item for item in found if item.path == "result[*].zone_id")

    assert (input_id.type_id, input_id.key_name, input_id.list_path) == (
        TypeId("ZoneId"),
        "zone_id",
        "groups[*].zones[*]",
    )
    assert (input_id.capacity, input_id.list_count, input_id.capacity_factors) == (200, 2, (10, 20))
    assert input_id.required and input_id.container_required and input_id.key_required
    assert (output_id.capacity, output_id.capacity_anchor) == (50, ("out", 0, "maxItems"))


def test_registry_capacity_limit_anchors_at_type_instead_of_a_non_limiting_top_level_bound(
    tmp_path: Path,
) -> None:
    root = shop(tmp_path)
    types = {
        **NESTED_TYPES,
        "result_group.yaml": record_type(field("zones", "ZoneResult[]", extra="  maxItems: 1\n")),
    }
    source = inference(
        field("groups", "Group[]", extra="  maxItems: 10\n"),
        field("result", "ResultGroup[]", extra="  maxItems: 100\n"),
    )
    install(root, types, source)

    output_id = next(item for item in paths(root) if item.path == "result[*].zones[*].zone_id")

    assert (output_id.capacity, output_id.capacity_factors) == (100, (100, 1))
    assert output_id.capacity_anchor == ("out", 0, "type")


def test_union_key_requires_every_variant_and_unknown_capacity_does_not_leak(tmp_path: Path) -> None:
    root = shop(tmp_path)
    types = {
        "review_id.yaml": id_type(),
        "review_union.yaml": union_type(
            ("first", field("review_id", "ReviewId")),
            ("second", field("review_id", "ReviewId")),
        ),
        "partial_union.yaml": union_type(
            ("first", field("review_id", "ReviewId")),
            ("second", field("other", "Text", extra="  maxLength: 20\n")),
        ),
        "optional_union.yaml": union_type(
            ("first", field("review_id", "ReviewId?")),
            ("second", field("review_id", "ReviewId")),
        ),
    }
    source = inference(
        field("reviews", "ReviewUnion[]", extra="  maxItems: 4\n")
        + field("partials", "PartialUnion[]", extra="  maxItems: 4\n")
        + field("optionals", "OptionalUnion[]", extra="  maxItems: 4\n"),
        field("answer", "Text", extra="  maxLength: 20\n"),
    )
    install(root, types, source)

    found = paths(root)
    required = next(item for item in found if item.path == "reviews[*].review_id")
    partial = next(item for item in found if item.path == "partials[*].review_id")
    optional = next(item for item in found if item.path == "optionals[*].review_id")

    assert required.required and required.container_required and required.key_required
    assert required.capacity == 4
    assert not partial.required and not partial.container_required and not partial.key_required
    assert partial.capacity is None
    assert not optional.required and not optional.key_required


def test_dynamic_unresolved_and_recursive_branches_return_no_occurrences(tmp_path: Path) -> None:
    root = shop(tmp_path)
    recursive = record_type(field("loop", "Loop?"))
    source = inference(
        field("dynamic", "Dynamic")
        + field("unknown", "MissingType")
        + field("loop", "Loop"),
        field("answer", "Text", extra="  maxLength: 20\n"),
    )
    install(root, {"loop.yaml": recursive}, source)

    found = paths(root)

    assert [(item.path, item.type_id) for item in found if item.side == "in"] == []


def test_nested_media_is_distinct_from_direct_media_and_text_is_resolved(tmp_path: Path) -> None:
    root = shop(tmp_path)
    source = inference(
        field("case", "Case") + field("photo", "Image") + field("documents", "Document[]?"),
        field("answer", "Text", extra="  maxLength: 20\n"),
    )
    install(
        root,
        {"case.yaml": record_type(field("photo", "Image") + field("title", "Text", extra="  maxLength: 40\n"))},
        source,
    )

    found = paths(root)

    assert next(item for item in found if item.path == "case.photo").nested
    assert not next(item for item in found if item.path == "photo").nested
    assert not next(item for item in found if item.path == "documents[*]").nested
    assert next(item for item in found if item.path == "answer").type_id == TypeId("Text")
