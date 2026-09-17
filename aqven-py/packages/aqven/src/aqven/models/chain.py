from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Final

from pydantic import SecretStr
from pydantic_ai.concurrency import AbstractConcurrencyLimiter
from pydantic_ai.models import Model
from pydantic_ai.settings import ModelSettings

from aqven.models.backoff import BackoffModel, BackoffPolicy, Sleep
from aqven.models.cassette import (
    CASSETTE_BEHAVIORS,
    LIVE_BEHAVIOR,
    CassetteBehavior,
    CassetteModel,
    CassettePolicy,
    CassetteStore,
    DirectoryCassetteStore,
    MemoryCassetteStore,
)
from aqven.models.limiter import LimiterModel, UsageBudget
from aqven.models.outcome import OutcomeGateModel
from aqven.models.redaction import RedactingModel, RedactionPolicy
from aqven.models.usage import DiscardUsage, UsageSink
from aqven.ports.models import PROVIDER_KEY_ENV, ModelFactory, model_provider
from aqven.ports.settings import SettingsStore, provider_key_setting, resolve_secret
from aqven.runtime.options import CassetteConfig

CHAIN_ORDER: Final = (OutcomeGateModel, RedactingModel, CassetteModel, LimiterModel, BackoffModel)


class NoRedaction:
    def redact(self, text: str) -> str:
        return text


NO_REDACTION: Final = RedactionPolicy(redactor=NoRedaction())


@dataclass(frozen=True, slots=True)
class CallPolicy:
    cassettes: CassettePolicy
    redaction: RedactionPolicy = NO_REDACTION
    concurrency: AbstractConcurrencyLimiter | None = None
    budget: UsageBudget | None = None
    backoff: BackoffPolicy = field(default_factory=BackoffPolicy)
    backoff_sleep: Sleep | None = None
    usage_sink: UsageSink = field(default_factory=DiscardUsage)


def cassette_policy(
    config: CassetteConfig | None,
    *,
    redaction: RedactionPolicy | None = None,
    secrets: tuple[SecretStr, ...] = (),
) -> CassettePolicy:
    if config is None:
        return CassettePolicy(store=MemoryCassetteStore(), behavior=LIVE_BEHAVIOR, redaction=redaction, secrets=secrets)
    behavior: CassetteBehavior = CASSETTE_BEHAVIORS[config.mode]
    store: CassetteStore = DirectoryCassetteStore(config.directory)
    return CassettePolicy(store=store, behavior=behavior, redaction=redaction, secrets=secrets)


def guard_model(provider_model: Model, *, model_ref: str, policy: CallPolicy) -> Model:
    backoff = BackoffModel(provider_model, policy=policy.backoff, sleep=policy.backoff_sleep)
    limited = LimiterModel(
        backoff,
        model_ref=model_ref,
        concurrency=policy.concurrency,
        budget=policy.budget,
        usage_sink=policy.usage_sink,
    )
    cassette = CassetteModel(limited, model_ref=model_ref, policy=policy.cassettes, usage_sink=policy.usage_sink)
    redacting = RedactingModel(cassette, policy=policy.redaction)
    return OutcomeGateModel(redacting)


def chain_links(model: Model) -> tuple[type[Model], ...]:
    links: list[type[Model]] = []
    current: Model | None = model
    while isinstance(current, CHAIN_ORDER):
        links.append(type(current))
        current = current.wrapped
    return tuple(links)


class MissingProviderKey(LookupError):
    def __init__(self, model: str, env_var: str) -> None:
        super().__init__(
            f"no API key for {model}: set it in project or studio settings, or in the {env_var} environment variable"
        )
        self.model = model
        self.env_var = env_var


class ProviderKeyResolver:
    def __init__(self, store: SettingsStore, environ: Mapping[str, str]) -> None:
        self.store = store
        self.environ = environ

    async def key_for(self, model: str) -> SecretStr:
        provider = model_provider(model)
        env_var = PROVIDER_KEY_ENV[provider]
        resolved = await resolve_secret(self.store, provider_key_setting(provider), env_var, self.environ)
        if resolved is None:
            raise MissingProviderKey(model, env_var)
        return resolved.value


class GuardedModelFactory:
    def __init__(self, provider_models: ModelFactory, keys: ProviderKeyResolver) -> None:
        self.provider_models = provider_models
        self.keys = keys

    async def build(
        self,
        model: str,
        *,
        settings: ModelSettings | None,
        policy: CallPolicy,
        model_ref: str | None = None,
    ) -> Model:
        api_key = await self.keys.key_for(model)
        provider_model = self.provider_models.build(model, settings=settings, api_key=api_key)
        secured = with_secret(policy, api_key)
        return guard_model(provider_model, model_ref=model_ref or model, policy=secured)


def with_secret(policy: CallPolicy, secret: SecretStr) -> CallPolicy:
    cassettes = policy.cassettes
    guarded = CassettePolicy(
        store=cassettes.store,
        behavior=cassettes.behavior,
        redaction=cassettes.redaction or policy.redaction,
        secrets=(*cassettes.secrets, secret),
        session=cassettes.session,
    )
    return CallPolicy(
        cassettes=guarded,
        redaction=policy.redaction,
        concurrency=policy.concurrency,
        budget=policy.budget,
        backoff=policy.backoff,
        backoff_sleep=policy.backoff_sleep,
        usage_sink=policy.usage_sink,
    )
