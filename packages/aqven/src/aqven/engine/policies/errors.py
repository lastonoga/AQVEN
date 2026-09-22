from typing import Literal

type PolicyErrorCode = Literal[
    "E_POLICY_UNKNOWN",
    "E_CODE_REF_UNRESOLVED",
    "E_CODE_SIGNATURE_MISMATCH",
    "E_POLICY_PARAMS",
    "E_POLICY_INPUT",
    "E_POLICY_RAISED",
    "E_POLICY_RESULT",
]


class PolicyError(Exception):
    def __init__(self, code: PolicyErrorCode, label: str, message: str) -> None:
        super().__init__(f"{code}: {label}: {message}")
        self.code: PolicyErrorCode = code
        self.label = label
        self.message = f"{label}: {message}"
