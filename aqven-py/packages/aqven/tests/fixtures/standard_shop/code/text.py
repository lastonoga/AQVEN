from typing import Final

NOTE_LIMIT: Final = 200


def squash(text: str) -> str:
    return " ".join(text.split())[:NOTE_LIMIT]
