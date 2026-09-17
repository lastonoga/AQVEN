from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

type PromptRole = Literal["system", "user", "assistant"]


class PromptMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    role: PromptRole
    text: str = Field(min_length=1)


class RenderedPrompt(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    messages: tuple[PromptMessage, ...] = Field(min_length=1)


def system(text: str) -> PromptMessage:
    return PromptMessage(role="system", text=text)


def user(text: str) -> PromptMessage:
    return PromptMessage(role="user", text=text)


def assistant(text: str) -> PromptMessage:
    return PromptMessage(role="assistant", text=text)
