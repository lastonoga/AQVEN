import sys
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class WizardAnswers:
    provider_id: str
    provider_env_var: str
    api_key: str | None
    allows_pii: bool
    budget_usd_micros: int | None
    max_parallel: int


def should_run_wizard(explicit_provider: str | None) -> bool:
    if explicit_provider is not None:
        return False
    return sys.stdin.isatty()
