from dataclasses import dataclass
from pathlib import Path
from typing import Final

from aqven.loader import LoadedProject, include_candidates, load_project, local_node_id, text_file
from aqven.spec import FlowId, InferenceId, LlmNodeSpec, NodeId, NodeSpec
from aqven.write.errors import WriteError, not_found, request_invalid

PROMPT_KEY: Final = "prompt"


@dataclass(frozen=True, slots=True)
class PromptFile:
    flow_id: FlowId
    node_id: NodeId
    path: str


def node_prompt(root: Path, flow_id: str, node_id: str) -> PromptFile:
    loaded = load_project(root)
    if loaded.project is None:
        raise request_invalid("project does not load: fix aqven.yaml")
    project = loaded.project
    node_key, spec = _node(project, flow_id, node_id)
    if not isinstance(spec, LlmNodeSpec) or spec.inference is None:
        raise request_invalid(f"node {node_key} has no prompt: only llm nodes with an inference have prompts")
    return PromptFile(FlowId(flow_id), node_key, _prompt_path(project, spec.inference))


def _node(project: LoadedProject, flow_id: str, node_id: str) -> tuple[NodeId, NodeSpec]:
    flow = project.flows.get(FlowId(flow_id))
    if flow is None:
        raise not_found(f"flow {flow_id} not found")
    exact = flow.nodes.get(NodeId(node_id))
    if exact is not None:
        return NodeId(node_id), exact.spec
    matches = tuple((key, source.spec) for key, source in flow.nodes.items() if local_node_id(key) == node_id)
    if len(matches) != 1:
        raise not_found(f"flow {flow_id} has no node {node_id}")
    return matches[0]


def _prompt_path(project: LoadedProject, inference_id: InferenceId) -> str:
    loaded = project.inferences.get(inference_id)
    if loaded is None:
        raise not_found(f"inference {inference_id} not found")
    source = loaded.source
    if source is None:
        raise _prompt_is_code(loaded.builder_path or inference_id)
    code = source.spec.prompt_code
    if code is not None:
        raise _prompt_is_code(code)
    path = source.spec.prompt_path
    candidates = (text_file(loaded.stem, PROMPT_KEY),) if path is None else include_candidates((loaded.folder,), path)
    existing = next((candidate for candidate in candidates if candidate in project.texts), None)
    return existing or candidates[0]


def _prompt_is_code(builder_ref: str) -> WriteError:
    message = f"prompt is built by code {builder_ref}: a level 3 prompt has no draft and cannot be saved"
    return WriteError("PROMPT_IS_CODE", message, candidates=({"builder_ref": builder_ref},))
