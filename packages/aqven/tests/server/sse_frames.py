from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Frame:
    event: str | None
    data: str | None
    id: str | None


def parse_frames(text: str) -> tuple[Frame, ...]:
    blocks = (block for block in text.replace("\r\n", "\n").split("\n\n") if block.strip())
    return tuple(frame for block in blocks if (frame := parse_block(block)).event or frame.data)


def parse_block(block: str) -> Frame:
    fields: dict[str, str] = {}
    for line in block.split("\n"):
        name, _, value = line.partition(": ")
        if name in ("event", "data", "id"):
            fields[name] = value
    return Frame(event=fields.get("event"), data=fields.get("data"), id=fields.get("id"))
