import hashlib
from enum import StrEnum
from typing import Final, NewType

import rfc8785
from pydantic import BaseModel, JsonValue

IrHash = NewType("IrHash", str)

IR_HASH_PREFIX: Final = "sha256-"
IR_HASH_PATTERN: Final = r"^sha256-[0-9a-f]{64}$"
DOMAIN_SEPARATOR: Final = b"\x00"


class HashDomain(StrEnum):
    PROJECT = "aqven/project-ir/v1"
    FLOW_SPEC = "aqven/flow-spec/v1"
    NODE_BODY = "aqven/node-body/v1"
    NODE_BEHAVIOR = "aqven/node-behavior/v1"
    PROMPT = "aqven/prompt/v1"
    RELEASE = "aqven/release/v1"


def canonical_json(value: JsonValue) -> bytes:
    return rfc8785.dumps(value)


def hash_of(domain: HashDomain, value: JsonValue) -> IrHash:
    digest = hashlib.sha256()
    digest.update(domain.value.encode())
    digest.update(DOMAIN_SEPARATOR)
    digest.update(canonical_json(value))
    return IrHash(f"{IR_HASH_PREFIX}{digest.hexdigest()}")


def model_json(model: BaseModel) -> JsonValue:
    return model.model_dump(mode="json", by_alias=True)


def model_hash(domain: HashDomain, model: BaseModel) -> IrHash:
    return hash_of(domain, model_json(model))
