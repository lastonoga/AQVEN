from pathlib import Path
from typing import Final

from aqven.testing import copy_project

FIXTURES: Final = Path(__file__).parent / "fixtures"
STANDARD_SHOP: Final = FIXTURES / "standard_shop"
FIXTURE_SHOP: Final = FIXTURES / "fixture_shop"
TRIAGE_ENUM_BLOCK: Final = (
    "Enum values of TriageCategory (category):\n- billing: Billing and refunds\n- delivery: Delivery"
)


def write(root: Path, relative: str, text: str) -> None:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace(root: Path, relative: str, old: str, new: str) -> None:
    target = root / relative
    text = target.read_text(encoding="utf-8")
    assert text.count(old) == 1, (relative, old)
    target.write_text(text.replace(old, new), encoding="utf-8")


def nested_shop(destination: Path, mode: str | None = None) -> Path:
    root = copy_project(STANDARD_SHOP, destination)
    write(
        root,
        "types/enums/priority.yaml",
        'apiVersion: "aqven/v1"\n'
        'kind: "Type"\n'
        'type: "enum"\n'
        'description: "Urgency"\n'
        "values:\n"
        '- value: "high"\n'
        '  description: "Handle today"\n'
        '- value: "low"\n'
        '  description: "Handle later"\n',
    )
    write(
        root,
        "types/records/scorecard.yaml",
        'apiVersion: "aqven/v1"\n'
        'kind: "Type"\n'
        'type: "record"\n'
        'description: "One scored answer"\n'
        "fields:\n"
        '- name: "criterion"\n'
        '  type: "Mood"\n'
        '  description: "Tone criterion"\n'
        '- name: "priorities"\n'
        '  type: "Priority[]"\n'
        '  description: "Priorities"\n'
        "  maxItems: 2\n"
        '- name: "note"\n'
        '  type: "Text"\n'
        '  description: "Short note"\n'
        "  maxLength: 40\n",
    )
    write(
        root,
        "types/unions/assessment.yaml",
        'apiVersion: "aqven/v1"\n'
        'kind: "Type"\n'
        'type: "union"\n'
        'description: "Assessment variants"\n'
        'discriminator: "kind"\n'
        "variants:\n"
        '- name: "full"\n'
        '  description: "Full assessment"\n'
        "  fields:\n"
        '  - name: "score"\n'
        '    type: "Scorecard"\n'
        '    description: "Scorecard"\n'
        '  - name: "tie_break"\n'
        '    type: "Mood"\n'
        '    description: "Tie-break tone"\n'
        '- name: "brief"\n'
        '  description: "Brief assessment"\n'
        "  fields:\n"
        '  - name: "priority"\n'
        '    type: "Priority?"\n'
        '    description: "Optional priority"\n',
    )
    enum_line = "" if mode is None else f'enum_definitions: "{mode}"\n'
    write(
        root,
        "agents/writer/lookup.inference.yaml",
        'apiVersion: "aqven/v1"\n'
        'kind: "Inference"\n'
        'description: "Exercise nested output enums"\n'
        "in:\n"
        '- name: "question"\n'
        '  type: "Text"\n'
        '  description: "Question"\n'
        "  maxLength: 200\n"
        '- name: "schema"\n'
        '  type: "FieldSpec[]"\n'
        '  description: "Runtime output fields"\n'
        "  maxItems: 4\n"
        "out:\n"
        '- name: "direct"\n'
        '  type: "Mood?"\n'
        '  description: "Optional direct mood"\n'
        '- name: "scores"\n'
        '  type: "Scorecard[]"\n'
        '  description: "Scorecards"\n'
        "  maxItems: 2\n"
        '- name: "assessment"\n'
        '  type: "Assessment"\n'
        '  description: "Assessment"\n'
        '- name: "dynamic"\n'
        '  type: "Dynamic"\n'
        '  description: "Runtime scorecard"\n'
        '  schema_from: "$in.schema"\n'
        '  value_type: "Scorecard"\n'
        "  limits:\n"
        "    max_fields: 4\n"
        "    max_depth: 2\n"
        "    max_text_length: 100\n"
        "    max_items: 2\n"
        '- name: "inline"\n'
        '  type: "Text"\n'
        '  description: "Inline closed value"\n'
        "  maxLength: 20\n"
        "  enum:\n"
        '  - "other"\n'
        f"{enum_line}",
    )
    replace(
        root,
        "agents/writer/lookup.prompt.md",
        "{{ output_format }}",
        "Schema: {{ schema }}\n{{ output_format }}",
    )
    return root


def input_only_inline_shop(destination: Path) -> Path:
    root = copy_project(STANDARD_SHOP, destination)
    write(
        root,
        "flows/intake/nodes/review/redo.inference.yaml",
        'apiVersion: "aqven/v1"\n'
        'kind: "Inference"\n'
        'description: "Input enum and inline output only"\n'
        "in:\n"
        '- name: "text"\n'
        '  type: "Text"\n'
        '  description: "Original reply"\n'
        "  maxLength: 200\n"
        '- name: "mood"\n'
        '  type: "Mood"\n'
        '  description: "Requested tone"\n'
        "out:\n"
        '- name: "text"\n'
        '  type: "Text"\n'
        '  description: "Calm reply"\n'
        "  maxLength: 200\n"
        "  enum:\n"
        '  - "calm"\n'
        '- name: "score"\n'
        '  type: "Score"\n'
        '  description: "Confidence"\n'
        'enum_definitions: "manual"\n',
    )
    write(
        root,
        "flows/intake/nodes/review/redo.prompt.md",
        "Rewrite the reply more calmly.\n<reply>{{ text }}</reply>\nTone: {{ mood }}\n{{ output_format }}\n",
    )
    replace(
        root,
        "flows/intake/nodes/review/redo.node.yaml",
        '- name: "text"\n  from: "$reply.out.text"\n',
        '- name: "text"\n  from: "$reply.out.text"\n- name: "mood"\n  value: "calm"\n',
    )
    return root


def recursive_shop(destination: Path, *, sibling: bool = False, wrapper: bool = False) -> Path:
    root = copy_project(STANDARD_SHOP, destination)
    write(
        root,
        "types/records/node.yaml",
        'apiVersion: "aqven/v1"\n'
        'kind: "Type"\n'
        'type: "record"\n'
        'description: "Recursive node"\n'
        "fields:\n"
        '- name: "next"\n'
        '  type: "Node?"\n'
        '  description: "Next"\n'
        '- name: "mood"\n'
        '  type: "Mood"\n'
        '  description: "Mood"\n',
    )
    if wrapper:
        write(
            root,
            "types/records/wrapper.yaml",
            'apiVersion: "aqven/v1"\n'
            'kind: "Type"\n'
            'type: "record"\n'
            'description: "Nonrecursive wrapper"\n'
            "fields:\n"
            '- name: "node"\n'
            '  type: "Node"\n'
            '  description: "Recursive branch"\n'
            '- name: "mood"\n'
            '  type: "Mood"\n'
            '  description: "Wrapper mood"\n',
        )
    sibling_field = "" if not sibling else '- name: "good"\n  type: "Mood"\n  description: "Valid sibling"\n'
    write(
        root,
        "flows/intake/nodes/review/redo.inference.yaml",
        'apiVersion: "aqven/v1"\n'
        'kind: "Inference"\n'
        'description: "Recursive output"\n'
        "in:\n"
        '- name: "text"\n'
        '  type: "Text"\n'
        '  description: "Input"\n'
        "  maxLength: 100\n"
        "out:\n"
        '- name: "result"\n'
        f'  type: "{"Wrapper" if wrapper else "Node"}"\n'
        '  description: "Result"\n'
        f"{sibling_field}"
        'enum_definitions: "manual"\n',
    )
    return root


def broken_shop(destination: Path) -> Path:
    root = copy_project(STANDARD_SHOP, destination)
    write(
        root,
        "flows/intake/nodes/review/redo.inference.yaml",
        'apiVersion: "aqven/v1"\n'
        'kind: "Inference"\n'
        'description: "Broken output type"\n'
        "in:\n"
        '- name: "text"\n'
        '  type: "Text"\n'
        '  description: "Original reply"\n'
        "  maxLength: 200\n"
        "out:\n"
        '- name: "text"\n'
        '  type: "MissingType"\n'
        '  description: "Broken reply"\n'
        '- name: "score"\n'
        '  type: "Score"\n'
        '  description: "Confidence"\n'
        'enum_definitions: "manual"\n',
    )
    return root


def manual_liquid_shop(destination: Path) -> Path:
    root = copy_project(FIXTURE_SHOP, destination)
    replace(
        root,
        "triage/classify.inference.yaml",
        "examples:\n",
        'enum_definitions: "manual"\nexamples:\n',
    )
    replace(
        root,
        "triage/classify.prompt.md",
        "{{ output_format }}",
        TRIAGE_ENUM_BLOCK + "\n\n{{ output_format }}",
    )
    return root


def code_prompt_shop(destination: Path, mode: str | None = None) -> Path:
    root = copy_project(STANDARD_SHOP, destination)
    enum_line = "" if mode is None else f'enum_definitions: "{mode}"\n'
    write(
        root,
        "flows/intake/nodes/reply/reply.inference.yaml",
        'apiVersion: "aqven/v1"\n'
        'kind: "Inference"\n'
        'description: "Short reply to a note in the given tone"\n'
        "in:\n"
        '- name: "text"\n'
        '  type: "Text"\n'
        '  description: "Note"\n'
        "  maxLength: 200\n"
        '- name: "mood"\n'
        '  type: "Mood"\n'
        '  description: "Reply tone"\n'
        "out:\n"
        '- name: "text"\n'
        '  type: "Text"\n'
        '  description: "Reply"\n'
        "  maxLength: 200\n"
        '- name: "mood"\n'
        '  type: "Mood"\n'
        '  description: "Tone the reply came out in"\n'
        '- name: "score"\n'
        '  type: "Score"\n'
        '  description: "Confidence in the reply"\n'
        f'{enum_line}prompt: "reply_prompt"\n'
        "checks:\n"
        '- run: "reply_is_short"\n'
        '  on_fail: "flag"\n',
    )
    (root / "flows/intake/nodes/reply/reply.prompt.md").unlink()
    for case in ("calm", "warm"):
        (root / f"flows/intake/nodes/reply/reply.variants/tone/{case}.md").unlink()
    write(
        root,
        "flows/intake/nodes/reply/reply.py",
        "from typing import Annotated\n\n"
        "from pydantic import StringConstraints\n\n"
        "from aqven.policies import EvalContext, NoParams, Verdict\n"
        "from aqven.spec import RenderedPrompt, system, user\n"
        "from standard_shop.types import Mood, ReplyIn, ReplyOut\n\n\n"
        "def reply_is_short(\n"
        "    value: ReplyOut, context: EvalContext[ReplyIn, ReplyOut], params: NoParams\n"
        ") -> Verdict:\n"
        "    return Verdict(passed=len(value.text) <= len(context.inputs.text) + 100)\n\n\n"
        "def reply_prompt(\n"
        "    text: Annotated[str, StringConstraints(max_length=200)], mood: Mood\n"
        ") -> RenderedPrompt:\n"
        "    return RenderedPrompt(\n"
        "        messages=(\n"
        '            system("You reply to customer notes"),\n'
        '            user(f"{text}\\nTone: {mood}"),\n'
        "        )\n"
        "    )\n",
    )
    return root


def plain_shop(destination: Path) -> Path:
    root = copy_project(STANDARD_SHOP, destination)
    write(
        root,
        "flows/intake/nodes/reply/reply.inference.yaml",
        'apiVersion: "aqven/v1"\n'
        'kind: "Inference"\n'
        'description: "Short reply to a note in the given tone"\n'
        "in:\n"
        '- name: "text"\n'
        '  type: "Text"\n'
        '  description: "Note"\n'
        "  maxLength: 200\n"
        '- name: "mood"\n'
        '  type: "Mood"\n'
        '  description: "Reply tone"\n'
        "out:\n"
        '- name: "text"\n'
        '  type: "Text"\n'
        '  description: "Reply"\n'
        "  maxLength: 200\n"
        '- name: "mood"\n'
        '  type: "Mood"\n'
        '  description: "Tone the reply came out in"\n'
        '- name: "score"\n'
        '  type: "Score"\n'
        '  description: "Confidence in the reply"\n'
        "checks:\n"
        '- run: "reply_is_short"\n'
        '  on_fail: "flag"\n',
    )
    write(
        root,
        "flows/intake/nodes/reply/reply.prompt.md",
        "Reply to the note in one sentence.\n",
    )
    for case in ("calm", "warm"):
        (root / f"flows/intake/nodes/reply/reply.variants/tone/{case}.md").unlink()
    return root
