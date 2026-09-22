import sys
from dataclasses import dataclass
from typing import Final

from aqven_llm.catalog import PROVIDERS


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


def should_run_wizard(explicit_provider: str | None) -> bool:
    if explicit_provider is not None:
        return False
    return sys.stdin.isatty()


def ask_provider() -> tuple[str, str, str | None]:
    print("Which model provider do you have a key for?")
    for index, provider_id in enumerate(PROVIDER_SHORTLIST, start=1):
        print(f"  {index}. {provider_id}")
    other_index = len(PROVIDER_SHORTLIST) + 1
    print(f"  {other_index}. something else")
    choice = input("> ").strip()
    if choice == str(other_index):
        provider_id = input("Provider id from the catalog (e.g. cerebras): ").strip()
    else:
        provider_id = PROVIDER_SHORTLIST[int(choice) - 1]
    entry = PROVIDERS[provider_id]
    env_var = entry.key.primary
    if env_var is None:
        return provider_id, "", None
    key = input(f"Paste the {env_var} value now, or press Enter to add it later: ").strip()
    return provider_id, env_var, key or None
