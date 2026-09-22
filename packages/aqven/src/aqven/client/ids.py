import secrets
import time
from typing import Final

from aqven.runtime import ClientOpId

CROCKFORD_ALPHABET: Final[str] = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
ULID_LENGTH: Final[int] = 26
ULID_RANDOM_BITS: Final[int] = 80
ULID_TIME_BITS: Final[int] = 48


def encode_ulid(milliseconds: int, randomness: int) -> ClientOpId:
    timestamp = milliseconds % (1 << ULID_TIME_BITS)
    value = (timestamp << ULID_RANDOM_BITS) | (randomness % (1 << ULID_RANDOM_BITS))
    shifts = range(5 * (ULID_LENGTH - 1), -1, -5)
    return ClientOpId("".join(CROCKFORD_ALPHABET[(value >> shift) & 0b11111] for shift in shifts))


def new_client_op_id() -> ClientOpId:
    return encode_ulid(time.time_ns() // 1_000_000, secrets.randbits(ULID_RANDOM_BITS))
