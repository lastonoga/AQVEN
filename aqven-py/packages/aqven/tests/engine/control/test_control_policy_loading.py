import sys
from collections.abc import Iterator
from pathlib import Path

import pytest

from aqven.engine.assembly.code import LoaderCode
from aqven.engine.loading import CodeLoader
from aqven.engine.policies import ImportCodeLoader, PolicyError, PolicyFactory
from aqven.ir import CodePolicy
from aqven.spec import CodeRef

POLICY_REF = CodeRef("policy_shop.rules:keep_all")
POLICY_SOURCE = """from pydantic import BaseModel

from aqven.policies import Done, JoinDecision, JoinState


class KeepParams(BaseModel):
    pass


def keep_all(state: JoinState[object], params: KeepParams) -> JoinDecision[object]:
    return Done(state.values)
"""


@pytest.fixture
def policy_project(tmp_path: Path) -> Iterator[Path]:
    root = tmp_path / "policy_shop"
    root.mkdir(parents=True, exist_ok=True)
    (root / "rules.py").write_text(POLICY_SOURCE, encoding="utf-8")
    (root / "aqven.yaml").write_text('apiVersion: "aqven/v1"\nkind: "Project"\n', encoding="utf-8")
    yield root
    sys.path.remove(str(root.parent.resolve()))


def test_the_project_loader_resolves_a_code_policy_that_is_not_on_the_path(policy_project: Path) -> None:
    factory = PolicyFactory(loader=LoaderCode(CodeLoader(policy_project)))

    rule = factory.join(CodePolicy(run=POLICY_REF))

    assert rule.label == "policy_shop.rules:keep_all"
    assert str(policy_project.parent.resolve()) in sys.path


def test_the_bare_import_loader_cannot_reach_a_project_that_is_not_installed(tmp_path: Path) -> None:
    root = tmp_path / "unreachable_shop"
    root.mkdir()
    (root / "rules.py").write_text(POLICY_SOURCE, encoding="utf-8")
    factory = PolicyFactory(loader=ImportCodeLoader())

    with pytest.raises(PolicyError) as failure:
        factory.join(CodePolicy(run=CodeRef("unreachable_shop.rules:keep_all")))

    assert failure.value.code == "E_CODE_REF_UNRESOLVED"
