from pathlib import Path

from set_version import apply, declared, disagreements, main, sibling_pins

ENGINE_SOURCE = """[project]
name = "aqven"
version = "0.0.0"
dependencies = [
    "aqven-llm==0.0.0",
    "pydantic==2.13.5",
]

[project.optional-dependencies]
google = ["aqven-llm[google]==0.0.0"]
xai = ["aqven-llm[xai]==0.0.0"]

[build-system]
requires = ["uv_build==0.12.15"]
"""

PROVIDERS_SOURCE = """[project]
name = "aqven-llm"
version = "0.0.0"
dependencies = ["openai==3.14.1"]
"""


def workspace(tmp_path: Path) -> tuple[Path, Path]:
    engine = tmp_path / "aqven" / "pyproject.toml"
    providers = tmp_path / "aqven-llm" / "pyproject.toml"
    engine.parent.mkdir(parents=True)
    providers.parent.mkdir(parents=True)
    engine.write_text(ENGINE_SOURCE, encoding="utf-8")
    providers.write_text(PROVIDERS_SOURCE, encoding="utf-8")
    return engine, providers


def test_apply_sets_both_versions_and_every_pin(tmp_path: Path) -> None:
    engine, providers = workspace(tmp_path)
    apply("1.4.0", engine, providers)
    assert declared(engine) == "1.4.0"
    assert declared(providers) == "1.4.0"
    assert sibling_pins(engine) == ["1.4.0", "1.4.0", "1.4.0"]


def test_apply_leaves_third_party_pins_alone(tmp_path: Path) -> None:
    engine, providers = workspace(tmp_path)
    apply("1.4.0", engine, providers)
    assert '"pydantic==2.13.5"' in engine.read_text(encoding="utf-8")
    assert '"uv_build==0.12.15"' in engine.read_text(encoding="utf-8")


def test_disagreements_are_empty_when_everything_matches(tmp_path: Path) -> None:
    engine, providers = workspace(tmp_path)
    apply("2.0.0", engine, providers)
    assert disagreements("2.0.0", engine, providers) == []


def test_disagreements_name_a_stale_sibling_pin(tmp_path: Path) -> None:
    engine, providers = workspace(tmp_path)
    apply("2.0.0", engine, providers)
    stale = engine.read_text(encoding="utf-8").replace('"aqven-llm==2.0.0"', '"aqven-llm==1.0.0"')
    engine.write_text(stale, encoding="utf-8")
    assert disagreements("2.0.0", engine, providers) == ["aqven depends on aqven-llm==1.0.0, expected 2.0.0"]


def test_disagreements_name_a_stale_distribution(tmp_path: Path) -> None:
    engine, providers = workspace(tmp_path)
    apply("2.0.0", engine, providers)
    assert disagreements("3.0.0", engine, providers) == [
        "aqven declares 2.0.0, expected 3.0.0",
        "aqven-llm declares 2.0.0, expected 3.0.0",
        "aqven depends on aqven-llm==2.0.0, expected 3.0.0",
    ]


def test_main_rejects_a_value_that_is_not_a_release() -> None:
    assert main(["not-a-version"]) == 1


def test_main_accepts_prerelease_shapes(tmp_path: Path) -> None:
    engine, providers = workspace(tmp_path)
    apply("1.0.0rc1", engine, providers)
    assert declared(engine) == "1.0.0rc1"
