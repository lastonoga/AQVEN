import json
from pathlib import Path

from set_version import apply, declared, disagreements, main, plugin_version, sibling_pins

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


PLUGIN_SOURCE = """{
  "name": "aqven",
  "version": "0.0.0",
  "description": "AQVEN skills",
  "author": {
    "name": "AQVEN"
  }
}
"""


def workspace(tmp_path: Path) -> tuple[Path, Path, Path]:
    engine = tmp_path / "aqven" / "pyproject.toml"
    providers = tmp_path / "aqven-llm" / "pyproject.toml"
    plugin = tmp_path / "aqven" / "agent_plugin" / ".claude-plugin" / "plugin.json"
    for path, source in ((engine, ENGINE_SOURCE), (providers, PROVIDERS_SOURCE), (plugin, PLUGIN_SOURCE)):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(source, encoding="utf-8")
    return engine, providers, plugin


def test_apply_sets_both_versions_and_every_pin(tmp_path: Path) -> None:
    engine, providers, plugin = workspace(tmp_path)
    apply("1.4.0", engine, providers, plugin)
    assert declared(engine) == "1.4.0"
    assert declared(providers) == "1.4.0"
    assert sibling_pins(engine) == ["1.4.0", "1.4.0", "1.4.0"]


def test_apply_leaves_third_party_pins_alone(tmp_path: Path) -> None:
    engine, providers, plugin = workspace(tmp_path)
    apply("1.4.0", engine, providers, plugin)
    assert '"pydantic==2.13.5"' in engine.read_text(encoding="utf-8")
    assert '"uv_build==0.12.15"' in engine.read_text(encoding="utf-8")


def test_disagreements_are_empty_when_everything_matches(tmp_path: Path) -> None:
    engine, providers, plugin = workspace(tmp_path)
    apply("2.0.0", engine, providers, plugin)
    assert disagreements("2.0.0", engine, providers, plugin) == []


def test_disagreements_name_a_stale_sibling_pin(tmp_path: Path) -> None:
    engine, providers, plugin = workspace(tmp_path)
    apply("2.0.0", engine, providers, plugin)
    stale = engine.read_text(encoding="utf-8").replace('"aqven-llm==2.0.0"', '"aqven-llm==1.0.0"')
    engine.write_text(stale, encoding="utf-8")
    assert disagreements("2.0.0", engine, providers, plugin) == ["aqven depends on aqven-llm==1.0.0, expected 2.0.0"]


def test_disagreements_name_a_stale_distribution(tmp_path: Path) -> None:
    engine, providers, plugin = workspace(tmp_path)
    apply("2.0.0", engine, providers, plugin)
    assert disagreements("3.0.0", engine, providers, plugin) == [
        "aqven declares 2.0.0, expected 3.0.0",
        "aqven-llm declares 2.0.0, expected 3.0.0",
        "aqven depends on aqven-llm==2.0.0, expected 3.0.0",
        "agent plugin declares 2.0.0, expected 3.0.0",
    ]


def test_main_rejects_a_value_that_is_not_a_release() -> None:
    assert main(["not-a-version"]) == 1


def test_main_accepts_prerelease_shapes(tmp_path: Path) -> None:
    engine, providers, plugin = workspace(tmp_path)
    apply("1.0.0rc1", engine, providers, plugin)
    assert declared(engine) == "1.0.0rc1"


def test_apply_sets_the_plugin_version_and_keeps_its_other_keys(tmp_path: Path) -> None:
    engine, providers, plugin = workspace(tmp_path)
    apply("1.4.0", engine, providers, plugin)
    assert plugin_version(plugin) == "1.4.0"
    assert json.loads(plugin.read_text(encoding="utf-8")) == {
        "name": "aqven",
        "version": "1.4.0",
        "description": "AQVEN skills",
        "author": {"name": "AQVEN"},
    }


def test_apply_keeps_the_plugin_manifest_layout(tmp_path: Path) -> None:
    engine, providers, plugin = workspace(tmp_path)
    apply("0.0.0", engine, providers, plugin)
    assert plugin.read_text(encoding="utf-8") == PLUGIN_SOURCE


def test_disagreements_name_a_stale_plugin(tmp_path: Path) -> None:
    engine, providers, plugin = workspace(tmp_path)
    apply("2.0.0", engine, providers, plugin)
    plugin.write_text(PLUGIN_SOURCE, encoding="utf-8")
    assert disagreements("2.0.0", engine, providers, plugin) == ["agent plugin declares 0.0.0, expected 2.0.0"]
