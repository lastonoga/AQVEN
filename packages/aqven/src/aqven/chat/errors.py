from typing import Literal

type ChatFailureCode = Literal["NOT_FOUND", "CHAT_STATE_CONFLICT", "NOT_WAITING"]


class ChatFailure(Exception):
    def __init__(self, code: ChatFailureCode, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code: ChatFailureCode = code
        self.message = message
