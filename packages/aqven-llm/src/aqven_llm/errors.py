from typing import Final

INSTALL_HINT: Final = 'uv add "aqven[{extra}]"'


def install_hint(extra: str) -> str:
    return INSTALL_HINT.format(extra=extra)


class UnknownProvider(ValueError):
    def __init__(self, model: str, known: tuple[str, ...]) -> None:
        super().__init__(
            f"model {model!r} does not name a supported provider: write provider:model with provider one of "
            f"{', '.join(known)}"
        )
        self.model = model
        self.known = known


class ProviderUnavailable(RuntimeError):
    def __init__(self, provider: str, extra: str) -> None:
        self.provider = provider
        self.extra = extra
        self.hint = install_hint(extra)
        super().__init__(f"provider {provider!r} is not installed: run {self.hint}")


class ProviderNoStreaming(RuntimeError):
    def __init__(self, provider: str, model_class: str) -> None:
        super().__init__(
            f"provider {provider!r} cannot stream: {model_class} has no request_stream, and aqven streams every "
            "model request; choose a model of a provider with streaming support"
        )
        self.provider = provider
        self.model_class = model_class


class MissingProviderKey(LookupError):
    def __init__(self, provider: str, env_var: str) -> None:
        super().__init__(
            f"no API key for provider {provider!r}: set {env_var} in the project .env file or in the environment"
        )
        self.provider = provider
        self.env_var = env_var


class ProviderMisconfigured(ValueError):
    def __init__(self, provider: str, detail: str) -> None:
        super().__init__(f"provider {provider!r} is not configured: {detail}")
        self.provider = provider
        self.detail = detail
