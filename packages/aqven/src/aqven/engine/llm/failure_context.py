from dataclasses import dataclass
from typing import Final

from aqven.engine.llm.instructions import Schema
from aqven.ir.nodes import OutputMode
from aqven.runtime.executions import ModelErrorDetails

TITLE_KEY: Final = "title"
PROVIDER_SEPARATOR: Final = ":"


@dataclass(frozen=True, slots=True)
class FailureContext:
    agent_id: str
    model: str
    mode: OutputMode
    output_tools: frozenset[str]
    schema: Schema
    inference_id: str
    agent_file: str | None = None
    inference_file: str | None = None
    node_id: str | None = None
    models: tuple[str, ...] = ()

    @property
    def agent_location(self) -> str:
        return self.agent_file or f"agent {self.agent_id}"

    @property
    def inference_location(self) -> str:
        return self.inference_file or f"inference {self.inference_id}"

    @property
    def step(self) -> str:
        return self.node_id or self.inference_id

    @property
    def output_type(self) -> str:
        title = self.schema.get(TITLE_KEY)
        return title if isinstance(title, str) and title else self.inference_id

    def models_check(self) -> str:
        return f"aqven models check {self.agent_id}"

    def models_shapes(self) -> str:
        return f"aqven models shapes {self.agent_id} --live"

    def declared_model(self, reported: str | None) -> str:
        if not reported:
            return self.model
        candidates = (self.model, *self.models)
        return next((item for item in candidates if _same_model(item, reported)), reported)


@dataclass(frozen=True, slots=True)
class FinalError:
    code: str
    message: str
    hint: str | None = None
    details: ModelErrorDetails | None = None


def _same_model(declared: str, reported: str) -> bool:
    return declared == reported or declared.partition(PROVIDER_SEPARATOR)[2] == reported
