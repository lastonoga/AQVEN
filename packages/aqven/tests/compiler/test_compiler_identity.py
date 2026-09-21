from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import pytest

from aqven.check import check_project
from aqven.compiler import compile_project, compile_root
from aqven.ir import CompiledProject, IrHash, flow_hash, project_hash
from aqven.spec import FlowId
from aqven.testing import copy_project

FIXTURE: Final = Path(__file__).parents[1] / "fixtures" / "standard_shop"
INTAKE: Final = FlowId("intake")


@dataclass(frozen=True, slots=True)
class Hashes:
    project: IrHash
    flow: IrHash


def hashes(project: CompiledProject) -> Hashes:
    return Hashes(project_hash(project), flow_hash(project, INTAKE))


def compiled(root: Path) -> CompiledProject:
    report = check_project(root)
    assert report.ok, report.errors
    return compile_project(report)


def replace_text(root: Path, relative: str, old: str, new: str) -> None:
    target = root / relative
    source = target.read_text(encoding="utf-8")
    assert source.count(old) == 1, old
    target.write_text(source.replace(old, new), encoding="utf-8")


def edit(relative: str, old: str, new: str) -> Callable[[Path], None]:
    return lambda root: replace_text(root, relative, old, new)


def move_tool_code(root: Path) -> None:
    (root / "tools/functions.py").rename(root / "tools/stamps.py")
    replace_text(root, "tools/stamp.yaml", "@root.tools.functions:stamp", "@root.tools.stamps:stamp")


MUTATIONS: Final[dict[str, Callable[[Path], None]]] = {
    "node_spec": edit("flows/intake/nodes/clean/clean.node.yaml", "Сжатие пробелов в заметке", "Сжатие пробелов"),
    "flow_spec": edit("flows/intake/flow.yaml", "Приём заметки", "Приём одной заметки"),
    "inference_spec": edit("flows/intake/nodes/reply/reply.inference.yaml", '"Ответ"', '"Ответ покупателю"'),
    "agent_spec": edit("agents/writer/writer.yaml", "Ищет похожие заметки", "Ищет заметки"),
    "tool_spec": edit("tools/stamp.yaml", "Штамп прогона на заметке", "Штамп прогона"),
    "prompt": edit("flows/intake/nodes/reply/reply.prompt.md", "одной фразой", "коротко"),
    "variant": edit("flows/intake/nodes/reply/reply.variants/tone/warm.md", "Добавь тепла.", "Добавь много тепла."),
    "fragment": edit("fragments/tone.md", "спокойно и коротко", "спокойно"),
    "instructions": edit("agents/writer/writer.instructions.md", "одной короткой фразой", "коротко"),
    "subagent_prompt": edit("agents/writer/lookup.prompt.md", "похожие на вопрос", "близкие к вопросу"),
    "code_path": move_tool_code,
}


@pytest.fixture(scope="module")
def baseline() -> Hashes:
    return hashes(compile_root(FIXTURE))


def test_the_same_tree_in_two_places_gives_the_same_hashes(tmp_path: Path, baseline: Hashes) -> None:
    first = compiled(copy_project(FIXTURE, tmp_path / "first"))
    second = compiled(copy_project(FIXTURE, tmp_path / "second"))

    assert hashes(first) == hashes(second) == baseline
    assert first.model_dump_json() == second.model_dump_json()


@pytest.mark.parametrize("mutation", sorted(MUTATIONS))
def test_any_change_of_the_tree_changes_both_hashes(tmp_path: Path, baseline: Hashes, mutation: str) -> None:
    root = copy_project(FIXTURE, tmp_path)
    MUTATIONS[mutation](root)

    changed = hashes(compiled(root))

    assert changed.project != baseline.project
    assert changed.flow != baseline.flow


def test_project_description_changes_only_the_project_hash(tmp_path: Path, baseline: Hashes) -> None:
    root = copy_project(FIXTURE, tmp_path)
    replace_text(root, "aqven.yaml", "Модуль в стандартной раскладке", "Модуль")

    changed = hashes(compiled(root))

    assert changed.project != baseline.project
    assert changed.flow == baseline.flow
