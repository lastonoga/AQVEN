from importlib.metadata import distribution, version
from pathlib import Path

from openai_codex.client import CodexClient, CodexConfig

from aqven.runtime.address import JsonObject


def deny(method: str, params: JsonObject | None) -> JsonObject:
    return {"decision": "decline"}


def test_pinned_codex_sdk_exposes_explicit_approval_handler_and_bundled_cli() -> None:
    assert version("openai-codex") == "0.147.0"
    assert version("openai-codex-cli-bin") == "0.147.0"
    assert Path(str(distribution("openai-codex-cli-bin").locate_file("codex_cli_bin/bin/codex"))).is_file()

    client = CodexClient(CodexConfig(), approval_handler=deny)

    assert deny("item/commandExecution/requestApproval", None) == {"decision": "decline"}
    assert callable(client.thread_start)
    assert callable(client.thread_resume)
    assert callable(client.turn_start)
    assert callable(client.turn_interrupt)
    assert callable(client.account_read)
