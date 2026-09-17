from pathlib import Path


class EngineNotLaunched(RuntimeError):
    def __init__(self) -> None:
        super().__init__("engine is not running: call EngineLifecycle.launch() first")


class EngineBusy(RuntimeError):
    def __init__(self, active: Path, requested: Path) -> None:
        super().__init__(
            f"this process already runs the engine of project {active}; cannot start a second project {requested}"
        )
        self.active = active
        self.requested = requested


class CodeLoadError(ImportError):
    def __init__(self, ref: str, reason: str) -> None:
        super().__init__(f"cannot load code {ref}: {reason}")
        self.ref = ref
        self.reason = reason


class CodeSignatureError(TypeError):
    def __init__(self, ref: str, reason: str) -> None:
        super().__init__(f"function {ref}: {reason}")
        self.ref = ref
        self.reason = reason


class SecretUnavailable(LookupError):
    def __init__(self, name: str) -> None:
        super().__init__(f"secret {name} is not declared by the tool or not set in the project .env or the environment")
        self.name = name


class ToolJobFailed(RuntimeError):
    def __init__(self, tool_id: str, message: str) -> None:
        super().__init__(f"long-running job of tool {tool_id} failed: {message}")
        self.tool_id = tool_id


class ToolJobTimedOut(TimeoutError):
    def __init__(self, tool_id: str, seconds: int) -> None:
        super().__init__(f"long-running job of tool {tool_id} did not finish within {seconds} s")
        self.tool_id = tool_id
        self.seconds = seconds
