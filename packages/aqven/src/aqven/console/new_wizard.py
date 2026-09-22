import os
import sys
from dataclasses import dataclass
from typing import Final

from aqven.engine.throttle import MINIMUM_WORKERS
from aqven_llm.catalog import PROVIDERS

FALLBACK_WORKERS: Final = 4


@dataclass(frozen=True, slots=True)
class WizardAnswers:
    provider_id: str
    provider_env_var: str
    api_key: str | None
    allows_pii: bool
    budget_usd_micros: int | None
    max_parallel: int


PROVIDER_SHORTLIST: Final[tuple[str, ...]] = (
    "openrouter",
    "anthropic",
    "openai",
    "google",
    "mistral",
    "deepseek",
)


class UnknownProvider(ValueError):
    def __init__(self, provider_id: str) -> None:
        available = ", ".join(sorted(PROVIDERS))
        super().__init__(f"unknown provider {provider_id!r}; available providers: {available}")


def should_run_wizard(explicit_provider: str | None) -> bool:
    if explicit_provider is not None:
        return False
    return sys.stdin.isatty()


def wizard_from_provider(provider_id: str) -> WizardAnswers:
    entry = PROVIDERS.get(provider_id)
    if entry is None:
        raise UnknownProvider(provider_id)
    return WizardAnswers(
        provider_id=provider_id,
        provider_env_var=entry.key.primary or "",
        api_key=None,
        allows_pii=False,
        budget_usd_micros=None,
        max_parallel=computed_max_parallel(),
    )


def ask_provider() -> tuple[str, str, str | None]:
    print("Which model provider do you have a key for?")
    for index, provider_id in enumerate(PROVIDER_SHORTLIST, start=1):
        print(f"  {index}. {provider_id}")
    other_index = len(PROVIDER_SHORTLIST) + 1
    print(f"  {other_index}. something else")
    provider_id = ask_provider_id(other_index)
    entry = PROVIDERS[provider_id]
    env_var = entry.key.primary
    if env_var is None:
        return provider_id, "", None
    key = input(f"Paste the {env_var} value now, or press Enter to add it later: ").strip()
    return provider_id, env_var, key or None


def ask_provider_id(other_index: int) -> str:
    while True:
        choice = input("> ").strip()
        if choice.isdigit() and 1 <= int(choice) <= other_index - 1:
            return PROVIDER_SHORTLIST[int(choice) - 1]
        if choice == str(other_index):
            return ask_catalog_provider_id()
        print(f"Enter a number from 1 to {other_index}.")


def ask_catalog_provider_id() -> str:
    while True:
        provider_id = input("Provider id from the catalog (e.g. cerebras): ").strip()
        if provider_id in PROVIDERS:
            return provider_id
        print(f"Unknown provider {provider_id!r}; try again.")


def ask_pii() -> bool:
    answer = (
        input(
            "Will this project ever handle personal or sensitive data (names, emails, health or financial info)? [y/N] "
        )
        .strip()
        .lower()
    )
    return answer in ("y", "yes")


def ask_budget_usd_micros() -> int | None:
    while True:
        answer = input("Budget per run, in USD (press Enter for no limit): ").strip()
        if not answer:
            return None
        dollars = parse_dollars(answer)
        if dollars is not None:
            return round(dollars * 1_000_000)
        print("Enter a number, or press Enter for no limit.")


def parse_dollars(answer: str) -> float | None:
    try:
        return float(answer)
    except ValueError:
        return None


def computed_max_parallel() -> int:
    return max(MINIMUM_WORKERS, os.cpu_count() or FALLBACK_WORKERS)


def run_wizard() -> WizardAnswers:
    provider_id, env_var, api_key = ask_provider()
    allows_pii = ask_pii()
    budget = ask_budget_usd_micros()
    return WizardAnswers(
        provider_id=provider_id,
        provider_env_var=env_var,
        api_key=api_key,
        allows_pii=allows_pii,
        budget_usd_micros=budget,
        max_parallel=computed_max_parallel(),
    )
