import asyncio
from pathlib import Path
from typing import Final

from claude_agent_sdk import PermissionResultAllow, ToolUseBlock
from pydantic import JsonValue

from aqven.chat.questions import QUESTION_TOOL, answered_input
from aqven.chat.testing import ApprovalStep, ScriptedClientFactory, ScriptStep
from aqven.ports.chat import ApprovalAnswer, ChatApprovalRequested, ChatEvent

from .fixtures import assistant, chat_harness, init_message, next_event, result, tool_result, until_turn_finished
from .test_chat_backend import message

QUESTIONS: Final[list[JsonValue]] = [
    {
        "question": "Which provider should the flow call?",
        "header": "Provider",
        "multiSelect": False,
        "options": [
            {"label": "OpenRouter", "description": "One key for every model."},
            {"label": "OpenAI", "description": "Direct, no routing hop."},
        ],
    },
    {
        "question": "Which checks belong in the gate?",
        "header": "Gate",
        "multiSelect": True,
        "options": [
            {"label": "Citations", "description": "Every claim carries a source."},
            {"label": "Latency", "description": "p95 under the budget."},
        ],
    },
]
ASKED: Final[dict[str, JsonValue]] = {"questions": QUESTIONS}
ANSWERS: Final[dict[str, str]] = {
    "Which provider should the flow call?": "OpenRouter",
    "Which checks belong in the gate?": "Citations, Latency",
}


def question_turn(project_root: Path) -> list[ScriptStep]:
    return [
        init_message(project_root),
        assistant("msg_ask", [ToolUseBlock(id="toolu_ask", name=QUESTION_TOOL, input=ASKED)]),
        ApprovalStep(tool_name=QUESTION_TOOL, tool_use_id="toolu_ask", tool_input=ASKED),
        tool_result("toolu_ask", "Your questions have been answered."),
        assistant("msg_final", []),
        result(),
    ]


def test_answers_reach_the_tool_as_the_input_it_reads() -> None:
    merged = answered_input(QUESTION_TOOL, ASKED, ANSWERS)

    assert merged == {"questions": QUESTIONS, "answers": ANSWERS}


def test_a_tool_that_asks_nothing_keeps_the_input_the_model_wrote() -> None:
    assert answered_input("Edit", {"file_path": "lumen/code.py"}, ANSWERS) is None


def test_skipping_every_question_leaves_the_input_alone() -> None:
    assert answered_input(QUESTION_TOOL, ASKED, {}) is None
    assert answered_input(QUESTION_TOOL, ASKED, None) is None


def test_the_batch_of_answers_reaches_the_agent_in_one_allow(tmp_path: Path) -> None:
    factory = ScriptedClientFactory([question_turn(tmp_path)])
    harness = chat_harness(tmp_path, factory)

    async def scenario() -> list[ChatEvent]:
        session = await harness.backend.start_session(harness.options())
        events = harness.backend.events(session.session_id)
        await harness.backend.send_message(session.session_id, message("build me a flow", "op-1"))
        request, before = await next_event(events, ChatApprovalRequested)
        await harness.backend.answer_approval(
            session.session_id,
            ApprovalAnswer(approval_id=request.approval_id, decision="allow", answers=ANSWERS),
        )
        _, rest = await until_turn_finished(events)
        await harness.backend.aclose()
        return [*before, *rest]

    seen = asyncio.run(scenario())
    granted = factory.clients[0].permissions[0]

    assert [event.tool_name for event in seen if isinstance(event, ChatApprovalRequested)] == [QUESTION_TOOL]
    assert isinstance(granted, PermissionResultAllow)
    assert granted.updated_input == {"questions": QUESTIONS, "answers": ANSWERS}
