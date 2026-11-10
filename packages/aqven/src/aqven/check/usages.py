from collections.abc import Iterator
from dataclasses import dataclass

from aqven.check.context import CheckContext, ResolvedAgent
from aqven.check.nodes import typed_entries
from aqven.check.policies import evaluator_uses
from aqven.loader import YamlPath
from aqven.spec import AgentId, InferenceId, InferenceSpec, LlmNodeSpec


@dataclass(frozen=True, slots=True)
class Usage:
    file: str
    path: YamlPath
    inference_id: InferenceId
    inference: InferenceSpec
    agent_id: AgentId
    agent: ResolvedAgent


def inference_usages(context: CheckContext) -> Iterator[Usage]:
    sites = (
        *(
            (entry.file, ("agent",), spec.inference, spec.agent)
            for entry, spec in typed_entries(context.graph, LlmNodeSpec)
        ),
        *(
            (source.path, ("subagents", index, "agent"), subagent.inference, subagent.agent)
            for source in context.project.agents.values()
            for index, subagent in enumerate(source.spec.subagents or ())
        ),
        *(
            (use.file, (*use.path, "agent"), use.ref.inference, use.ref.agent)
            for use in evaluator_uses(context)
            if use.ref.inference is not None and use.ref.agent is not None
        ),
    )
    for file, path, inference_id, agent_id in sites:
        if inference_id is None:
            continue
        resolved_id = InferenceId(inference_id)
        inference = context.inference(resolved_id)
        agent = context.agents.get(AgentId(agent_id))
        if inference is None or agent is None:
            continue
        yield Usage(file, path, resolved_id, inference, AgentId(agent_id), agent)
