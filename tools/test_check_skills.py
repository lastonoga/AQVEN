from pathlib import Path

from check_skills import MAX_BODY_LINES, always_on_tokens, load_tree, problems

MUST = "## MUST\n\n- Load the skill before you write.\n- Run aqven check.\n"
REFERENCES = "\n## References\n\n- `references/engine/experiments.md`: the experiment file.\n"


def skill_text(
    name: str,
    description: str = "Builds flows. Use when you write a flow.",
    body: str = MUST + REFERENCES,
    extra: str = "",
) -> str:
    return f'---\nname: "{name}"\ndescription: "{description}"\n{extra}---\n\n{body}'


def plugin(tmp_path: Path, skills: dict[str, str], manifest: str = "engine/experiments.md\n") -> Path:
    root = tmp_path / "agent_plugin"
    for name, text in skills.items():
        folder = root / "skills" / name
        folder.mkdir(parents=True)
        (folder / "SKILL.md").write_text(text, encoding="utf-8")
        (folder / "references.txt").write_text(manifest, encoding="utf-8")
    return root


def found(tmp_path: Path, skills: dict[str, str], names_module: str | None = None) -> list[str]:
    module = tmp_path / "agent_plugin.py"
    if names_module is not None:
        module.write_text(names_module, encoding="utf-8")
    return problems(load_tree(plugin(tmp_path, skills), module))


def test_a_well_formed_skill_passes(tmp_path: Path) -> None:
    assert found(tmp_path, {"building-flows": skill_text("building-flows")}) == []


def test_an_extra_front_matter_key_is_reported(tmp_path: Path) -> None:
    text = skill_text("building-flows", extra='when_to_use: "always"\n')
    assert found(tmp_path, {"building-flows": text}) == [
        "building-flows: front matter keys must be exactly name and description, found "
        "['description', 'name', 'when_to_use']"
    ]


def test_a_name_that_differs_from_the_folder_is_reported(tmp_path: Path) -> None:
    assert found(tmp_path, {"building-flows": skill_text("build-flows")}) == [
        "building-flows: name 'build-flows' differs from the folder name"
    ]


def test_a_folder_name_outside_the_alphabet_is_reported(tmp_path: Path) -> None:
    assert found(tmp_path, {"Building_Flows": skill_text("Building_Flows")}) == [
        "Building_Flows: name must be 1 to 64 characters of a-z, 0-9 and -"
    ]


def test_a_long_description_is_reported(tmp_path: Path) -> None:
    text = skill_text("building-flows", description="x" * 401)
    assert found(tmp_path, {"building-flows": text}) == [
        "building-flows: description has 401 characters, the limit is 400"
    ]


def test_descriptions_share_one_budget(tmp_path: Path) -> None:
    skills = {f"skill-{index:02d}": skill_text(f"skill-{index:02d}", description="x" * 400) for index in range(13)}
    assert found(tmp_path, skills) == ["descriptions add up to 5200 characters, the limit is 4800"]


def test_a_missing_front_matter_is_reported(tmp_path: Path) -> None:
    assert found(tmp_path, {"building-flows": MUST}) == [
        "building-flows/SKILL.md: no front matter: the first line must be ---"
    ]


def test_the_body_opens_with_the_must_block(tmp_path: Path) -> None:
    text = skill_text("building-flows", body="# Building flows\n\n" + MUST + REFERENCES)
    assert found(tmp_path, {"building-flows": text}) == [
        "building-flows: the body must open with ## MUST, found '# Building flows'"
    ]


def test_a_long_must_block_is_reported(tmp_path: Path) -> None:
    must = "## MUST\n\n" + "".join(f"- rule {index}\n" for index in range(16))
    text = skill_text("building-flows", body=must + REFERENCES)
    assert found(tmp_path, {"building-flows": text}) == ["building-flows: the MUST block has 16 lines, the limit is 15"]


def test_a_long_body_is_reported(tmp_path: Path) -> None:
    body = MUST + REFERENCES + "".join(f"line {index}\n" for index in range(MAX_BODY_LINES))
    problem = found(tmp_path, {"building-flows": skill_text("building-flows", body=body)})
    assert problem == [f"building-flows: body has {len(body.strip().splitlines())} lines, the limit is 250"]


def test_forbidden_words_are_reported_in_every_file_of_the_skills(tmp_path: Path) -> None:
    text = skill_text("building-flows", body=MUST + "\nCompare two arms of the experiment.\n" + REFERENCES)
    root = plugin(tmp_path, {"building-flows": text})
    script = root / "skills" / "building-flows" / "scripts" / "agent.yaml"
    script.parent.mkdir()
    script.write_text('model: "openrouter:x"\ncapabilities:\n  vision: true\nusd_source: "catalog"\n', encoding="utf-8")
    assert problems(load_tree(root, tmp_path / "absent.py")) == [
        "building-flows/SKILL.md:11: forbidden 'arms'",
        "building-flows/scripts/agent.yaml:2: forbidden 'capabilities:'",
        "building-flows/scripts/agent.yaml:4: forbidden 'usd_source'",
    ]


def test_words_that_only_contain_arm_are_allowed(tmp_path: Path) -> None:
    text = skill_text("building-flows", body=MUST + "\nAlarm, harm and warm are fine; so is armour.\n" + REFERENCES)
    assert found(tmp_path, {"building-flows": text}) == []


def test_skill_names_come_from_the_chat_module(tmp_path: Path) -> None:
    module = 'SKILL_NAMES: Final = ("building-flows", "running-series")\n'
    assert found(tmp_path, {"building-flows": skill_text("building-flows")}, module) == [
        "SKILL_NAMES names running-series, which has no skill folder"
    ]


def test_a_folder_missing_from_skill_names_is_reported(tmp_path: Path) -> None:
    skills = {name: skill_text(name) for name in ("building-flows", "running-series")}
    assert found(tmp_path, skills, 'SKILL_NAMES = ["building-flows"]\n') == [
        "SKILL_NAMES lacks the skill folder running-series"
    ]


def test_citations_and_the_manifest_agree(tmp_path: Path) -> None:
    body = MUST + "\n- `references/reference/flows.md`: every flow key.\n"
    assert found(tmp_path, {"building-flows": skill_text("building-flows", body=body)}) == [
        "building-flows: SKILL.md cites references/reference/flows.md, which references.txt does not list",
        "building-flows: references.txt lists engine/experiments.md, which SKILL.md never cites",
    ]


def test_the_always_on_line_is_read_with_thousands_separators() -> None:
    details = "Projected token cost\n  Always-on:   ~1,725 tok   added to every session\n"
    assert always_on_tokens(details) == 1725


def test_a_missing_always_on_line_reads_as_none() -> None:
    assert always_on_tokens("Component inventory\n") is None


def owner_domain_found(tmp_path: Path, sentence: str) -> list[str]:
    text = skill_text("building-flows", body=MUST + f"\n{sentence}\n" + REFERENCES)
    return found(tmp_path, {"building-flows": text})


def test_owner_project_words_are_reported(tmp_path: Path) -> None:
    sentence = "Crop each Zone of the face, grade SKIN redness and wrinkles, check dermatologist notes."
    assert owner_domain_found(tmp_path, sentence) == [
        "building-flows/SKILL.md:11: owner-project word 'Zone', 'face', 'SKIN', 'dermatologist', 'redness', 'wrinkles'"
    ]


def test_owner_project_identifiers_are_reported(tmp_path: Path) -> None:
    sentence = "Open my_flow, fill zone_groups, ask the lookers, follow the dose ladder, compare with SCIN cosmetics."
    assert owner_domain_found(tmp_path, sentence) == [
        "building-flows/SKILL.md:11: owner-project word 'my_flow', 'zone_groups', 'lookers', 'cosmetics', "
        "'dose ladder', 'SCIN'"
    ]


def test_gather_as_a_node_name_is_reported_in_yaml(tmp_path: Path) -> None:
    root = plugin(tmp_path, {"building-flows": skill_text("building-flows")})
    example = root / "skills" / "building-flows" / "examples" / "flow.yaml"
    example.parent.mkdir()
    example.write_text(
        'nodes:\n  gather:\n    after: ["split", "gather"]\n  reply:\n    after: [gather]\n', encoding="utf-8"
    )
    assert problems(load_tree(root, tmp_path / "absent.py")) == [
        "building-flows/examples/flow.yaml:2: owner-project word 'gather:'",
        "building-flows/examples/flow.yaml:3: owner-project word '\"gather\"'",
        "building-flows/examples/flow.yaml:5: owner-project word '[gather]'",
    ]


def test_gather_as_a_node_name_is_reported_in_prose(tmp_path: Path) -> None:
    assert owner_domain_found(tmp_path, "The `gather` node reads nodes/gather.yaml.") == [
        "building-flows/SKILL.md:11: owner-project word '`gather`', 'nodes/gather', 'gather.yaml'"
    ]


def test_innocent_words_pass_the_owner_domain_guard(tmp_path: Path) -> None:
    sentence = (
        "The interface surfaces facets; together they gather context. Timezone, ozone, skinny, "
        "Facebook, prefaced, lookup and ladders are fine."
    )
    assert owner_domain_found(tmp_path, sentence) == []
