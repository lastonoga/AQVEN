import pkgutil
from collections.abc import Callable, Mapping
from functools import cache
from typing import Final, cast

from aqven.spec import ProviderCapabilitiesSpec, ProviderKind, ProviderSpec, SecretRef
from aqven_llm import OPENAI_COMPATIBLE, ProviderCapabilities, ProviderFactory, ProviderOptions

type FactoryOfKind = Callable[[ProviderSpec], ProviderFactory | None]

ENV_REF_PREFIX: Final = "ref:env/"
CUSTOM_KINDS: Final[frozenset[ProviderKind]] = frozenset({"code", "openai_compatible"})


class ProviderFactoryUnavailable(LookupError):
    def __init__(self, provider: str, ref: str, detail: str) -> None:
        super().__init__(f"provider {provider}: factory {ref} is not usable: {detail}")
        self.provider = provider
        self.ref = ref
        self.detail = detail


@cache
def resolve_factory(provider: str, ref: str) -> ProviderFactory:
    try:
        loaded: object = pkgutil.resolve_name(ref)
    except Exception as error:
        raise ProviderFactoryUnavailable(provider, ref, f"{type(error).__name__}: {error}") from error
    if not callable(loaded):
        raise ProviderFactoryUnavailable(provider, ref, f"{type(loaded).__name__} is not callable")
    return cast(ProviderFactory, loaded)


def key_variable(ref: SecretRef | None) -> str | None:
    return None if ref is None else ref.removeprefix(ENV_REF_PREFIX)


def declared_capabilities(spec: ProviderCapabilitiesSpec | None) -> ProviderCapabilities | None:
    if spec is None:
        return None
    default = ProviderCapabilities()
    return ProviderCapabilities(
        tools=default.tools if spec.tools is None else spec.tools,
        json_schema_output=default.json_schema_output if spec.json_schema_output is None else spec.json_schema_output,
    )


def _catalog_factory(spec: ProviderSpec) -> ProviderFactory | None:
    return None


def _code_factory(spec: ProviderSpec) -> ProviderFactory | None:
    if spec.run is None:
        raise ProviderFactoryUnavailable(spec.id, "", "kind code needs run: module:function in aqven.yaml")
    return resolve_factory(spec.id, spec.run)


def _openai_compatible_factory(spec: ProviderSpec) -> ProviderFactory | None:
    return OPENAI_COMPATIBLE


FACTORY_BY_KIND: Final[Mapping[ProviderKind, FactoryOfKind]] = {
    "catalog": _catalog_factory,
    "code": _code_factory,
    "openai_compatible": _openai_compatible_factory,
}


def provider_factory(spec: ProviderSpec) -> ProviderFactory | None:
    return FACTORY_BY_KIND[spec.kind](spec)


def custom_options(spec: ProviderSpec) -> ProviderOptions:
    return ProviderOptions(
        base_url=spec.base_url,
        factory=provider_factory(spec),
        params=spec.params or {},
        capabilities=declared_capabilities(spec.capabilities),
        api_key_env=key_variable(spec.api_key),
    )
