from pathlib import Path

from risk_warnings import replace, shop

from aqven.check import CodeResolver, build_context
from aqven.check.usages import inference_usages
from aqven.loader import load_project

SUBAGENT = '''subagents:
- name: "research"
  description: "Checks the same inference"
  agent: "cheap"
  inference: "classify"
'''
JUDGE = '''  on_fail: "flag"
- inference: "classify"
  agent: "cheap"
  on_fail: "flag"
'''


def usages(root: Path) -> list[tuple[str, tuple[str | int, ...], str, str]]:
    loaded = load_project(root).project
    assert loaded is not None
    code = CodeResolver(root)
    with code.session():
        context = build_context(loaded, code)
        found = list(inference_usages(context))
    return [(item.file, item.path, item.inference_id, item.agent_id) for item in found]


def test_llm_node_subagent_and_judge_share_one_usage_enumerator(tmp_path: Path) -> None:
    root = shop(tmp_path)
    replace(root, "shared/writer.yaml", "settings:\n", f"{SUBAGENT}settings:\n")
    replace(root, "triage/classify.inference.yaml", '  on_fail: "flag"\n', JUDGE)

    assert usages(root) == [
        ("triage/classify.node.yaml", ("agent",), "classify", "writer"),
        ("shared/writer.yaml", ("subagents", 0, "agent"), "classify", "cheap"),
        ("triage/classify.inference.yaml", ("checks", 2, "agent"), "classify", "cheap"),
    ]


def test_unresolved_usages_are_skipped(tmp_path: Path) -> None:
    root = shop(tmp_path)
    replace(
        root,
        "shared/writer.yaml",
        "settings:\n",
        f'{SUBAGENT.replace('inference: "classify"', 'inference: "missing"')}settings:\n',
    )
    replace(
        root,
        "triage/classify.inference.yaml",
        '  on_fail: "flag"\n',
        JUDGE.replace('agent: "cheap"', 'agent: "missing"'),
    )

    assert usages(root) == [("triage/classify.node.yaml", ("agent",), "classify", "writer")]
