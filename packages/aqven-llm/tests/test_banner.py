import importlib

import pydantic_ai


def test_importing_aqven_llm_turns_off_the_pydantic_ai_banner() -> None:
    pydantic_ai.BANNER_ENABLED = True
    importlib.reload(importlib.import_module("aqven_llm"))
    assert pydantic_ai.BANNER_ENABLED is False
