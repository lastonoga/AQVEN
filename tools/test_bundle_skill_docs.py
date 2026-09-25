from pathlib import Path, PurePosixPath

import pytest
from bundle_skill_docs import (
    DOCS_TOKENS,
    ManifestError,
    PageContext,
    current_bundle,
    differences,
    docs_tokens,
    expected_bundle,
    heading_slug,
    render_page,
    write_bundle,
)

TOKENS = {"CLI_COMMAND": "aqven"}
EXPERIMENTS = PurePosixPath("engine/experiments.md")
SERIES = PurePosixPath("engine/run-a-series.md")
CONTEXT = PageContext(EXPERIMENTS, frozenset({EXPERIMENTS, SERIES, PurePosixPath("reference/flows.md")}), TOKENS)


def page(body: str, title: str = "How to write an experiment", description: str = "One factor.") -> str:
    return f"---\ntitle: {title}\ndescription: {description}\nsidebar:\n  order: 2\n---\n\n{body}"


def test_front_matter_becomes_a_title_and_a_lead() -> None:
    assert render_page(page("## Steps\n\nWrite it.\n"), CONTEXT) == (
        "# How to write an experiment\n\nOne factor.\n\n## Steps\n\nWrite it.\n"
    )


def test_a_link_to_a_bundled_page_points_at_its_copy() -> None:
    body = "See [How to run a series](/engine/run-a-series/#the-first-snapshot) and [flows](/reference/flows/).\n"
    assert render_page(page(body), CONTEXT).endswith(
        "See [How to run a series](run-a-series.md#the-first-snapshot) and [flows](../reference/flows.md).\n"
    )


def test_a_link_to_a_page_outside_the_skill_keeps_only_its_text() -> None:
    body = "See [the schema](/reference/schemas/FlowSpec.json) and [Studio](/studio/series/).\n"
    assert render_page(page(body), CONTEXT).endswith("See the schema and Studio.\n")


def test_a_link_broken_over_two_lines_is_rewritten() -> None:
    body = "Read [How to run\na series](/engine/run-a-series/) first.\n"
    assert render_page(page(body), CONTEXT).endswith("Read [How to run\na series](run-a-series.md) first.\n")


def test_external_and_anchor_links_stay() -> None:
    body = "[OpenRouter](https://openrouter.ai/docs) and [below](#steps).\n"
    assert render_page(page(body), CONTEXT).endswith(body)


def test_code_blocks_keep_links_and_comments_but_get_tokens() -> None:
    body = "```text\n[x](/studio/series/)\n<!-- kept -->\n{{CLI_COMMAND}} check\n```\n<!-- dropped -->\nDone.\n"
    assert render_page(page(body), CONTEXT).endswith(
        "```text\n[x](/studio/series/)\n<!-- kept -->\naqven check\n```\nDone.\n"
    )


def test_unknown_tokens_stay_visible() -> None:
    assert render_page(page("Run `{{UNKNOWN}}`.\n"), CONTEXT).endswith("Run `{{UNKNOWN}}`.\n")


def test_a_long_page_gets_contents_with_site_anchors() -> None:
    filler = "".join(f"line {index}\n" for index in range(100))
    body = f"## When you need this\n\n{filler}\n## `look`: see the cases\n\n### Example\n\n## Example\n"
    rendered = render_page(page(body), CONTEXT)
    assert (
        "## Contents\n\n"
        "- [When you need this](#when-you-need-this)\n"
        "- [`look`: see the cases](#look-see-the-cases)\n"
        "  - [Example](#example)\n"
        "- [Example](#example-1)\n\n"
        "## When you need this\n"
    ) in rendered


def test_a_short_page_has_no_contents() -> None:
    assert "## Contents" not in render_page(page("## Steps\n"), CONTEXT)


def test_headings_inside_code_are_not_contents() -> None:
    filler = "".join(f"line {index}\n" for index in range(100))
    body = f"## Steps\n\n```python\n# /// script\n## not a heading\n```\n{filler}"
    assert "not a heading](" not in render_page(page(body), CONTEXT)


def test_slugs_follow_the_site() -> None:
    assert heading_slug("What `aqven check` catches") == "what-aqven-check-catches"
    assert heading_slug("Fields, keys & values (v2)") == "fields-keys--values-v2"
    assert heading_slug("snake_case stays") == "snake_case-stays"


def site(tmp_path: Path) -> tuple[Path, Path]:
    docs = tmp_path / "docs"
    skills = tmp_path / "skills"
    (docs / "engine").mkdir(parents=True)
    (docs / "engine" / "experiments.md").write_text(page("Use [series](/engine/run-a-series/).\n"), encoding="utf-8")
    (docs / "engine" / "run-a-series.md").write_text(page("Run it.\n", title="Run a series"), encoding="utf-8")
    (skills / "designing-experiments").mkdir(parents=True)
    (skills / "designing-experiments" / "references.txt").write_text(f"{EXPERIMENTS}\n", encoding="utf-8")
    return docs, skills


def test_the_bundle_follows_each_manifest(tmp_path: Path) -> None:
    docs, skills = site(tmp_path)
    expected = expected_bundle(skills, docs, TOKENS)
    assert expected == {
        PurePosixPath("designing-experiments/references/engine/experiments.md"): (
            b"# How to write an experiment\n\nOne factor.\n\nUse series.\n"
        )
    }


def test_writing_removes_stale_copies_and_leaves_nothing_to_report(tmp_path: Path) -> None:
    docs, skills = site(tmp_path)
    stale = skills / "designing-experiments" / "references" / "old" / "page.md"
    stale.parent.mkdir(parents=True)
    stale.write_text("old\n", encoding="utf-8")
    expected = expected_bundle(skills, docs, TOKENS)
    assert differences(expected, current_bundle(skills)) == (
        "missing: designing-experiments/references/engine/experiments.md",
        "extra: designing-experiments/references/old/page.md",
    )
    write_bundle(skills, expected)
    assert differences(expected, current_bundle(skills)) == ()
    assert not stale.parent.exists()


def test_a_changed_site_page_is_drift(tmp_path: Path) -> None:
    docs, skills = site(tmp_path)
    write_bundle(skills, expected_bundle(skills, docs, TOKENS))
    (docs / "engine" / "experiments.md").write_text(page("Changed.\n"), encoding="utf-8")
    assert differences(expected_bundle(skills, docs, TOKENS), current_bundle(skills)) == (
        "changed: designing-experiments/references/engine/experiments.md",
    )


def test_a_manifest_naming_a_missing_or_repeated_page_fails(tmp_path: Path) -> None:
    docs, skills = site(tmp_path)
    manifest = skills / "designing-experiments" / "references.txt"
    manifest.write_text(f"{EXPERIMENTS}\n{EXPERIMENTS}\nengine/gone.md\n", encoding="utf-8")
    with pytest.raises(ManifestError) as raised:
        expected_bundle(skills, docs, TOKENS)
    assert str(raised.value) == (
        "designing-experiments/references.txt: engine/gone.md: no such site page\n"
        "designing-experiments/references.txt: engine/experiments.md: listed more than once"
    )


def test_site_tokens_are_read_from_the_site_config() -> None:
    assert docs_tokens(DOCS_TOKENS)["CLI_COMMAND"] == "aqven"
