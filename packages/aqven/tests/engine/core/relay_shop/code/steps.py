import time

from relay_shop.code.trace import gate_open, mark
from relay_shop.types import Reply


def normalize(text: str) -> Reply:
    mark("normalize")
    return Reply(text=" ".join(text.split()))


def shout(text: str) -> Reply:
    mark("shout")
    return Reply(text=text.upper())


def finalize(text: str) -> Reply:
    mark("finalize")
    return Reply(text=f"{text}.")


def wait_gate(text: str) -> Reply:
    mark("gate_started")
    while not gate_open():
        time.sleep(0.05)
    mark("gate_done")
    return Reply(text=f"[{text}]")


def explode(text: str) -> Reply:
    raise ValueError(f"could not process {text}")
