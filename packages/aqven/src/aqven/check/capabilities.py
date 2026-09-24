from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass
from typing import Final

from aqven.check.context import CheckContext, ResolvedAgent
from aqven.check.nodes import typed_entries
from aqven.check.policies import evaluator_uses
from aqven.check.typeinfo import PII_RANK, contained_types, decl_type_id, fields_contained_types, pii_class
from aqven.diagnostics import Diagnostic, DiagnosticCode, diagnostic
from aqven.loader import SourceSpec, YamlPath
from aqven.spec import (
    AUDIO,
    IMAGE,
    VIDEO,
    AgentId,
    InferenceSpec,
    LlmNodeSpec,
    PiiClass,
    ProviderSpec,
    TypeId,
    TypeSpec,
)

FORBIDDEN_OUTPUTS: Final = frozenset({AUDIO, VIDEO})

type Types = Mapping[TypeId, TypeSpec]


@dataclass(frozen=True, slots=True)
class Usage:
    file: str
    path: YamlPath
    inference: InferenceSpec
    agent_id: AgentId
    agent: ResolvedAgent


def check_capabilities(context: CheckContext) -> Iterable[Diagnostic]:
    types: Types = {type_id: source.spec for type_id, source in context.project.types.items()}
    usages = (item for usage in _usages(context) for item in _pii(usage, types))
    outputs = (
        item
        for loaded in context.project.inferences.values()
        if loaded.source is not None
        for item in _inference_outputs(loaded.source, types)
    )
    return (*usages, *outputs)


def _usages(context: CheckContext) -> Iterator[Usage]:
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
        inference = context.inference(inference_id)
        agent = context.agents.get(AgentId(agent_id))
        if inference is None or agent is None:
            continue
        yield Usage(file, path, inference, AgentId(agent_id), agent)


def _pii(usage: Usage, types: Types) -> Iterator[Diagnostic]:
    inference = usage.inference
    level = pii_class(fields_contained_types((*inference.in_, *inference.out), types), types)
    if PII_RANK[level] == 0:
        return
    refused = [
        model.model for model in usage.agent.models if model.provider is not None and not _allows(model.provider, level)
    ]
    if not refused:
        return
    message = (
        f"inference slots carry {level.value} data, but the provider of models {', '.join(refused)} "
        f"of agent {usage.agent_id} does not allow it"
    )
    yield diagnostic(DiagnosticCode.E_PII_PROVIDER, usage.file, usage.path, message)


def _allows(provider: ProviderSpec, level: PiiClass) -> bool:
    policy = provider.data_policy
    return policy.allows_sensitive if level is PiiClass.SENSITIVE else policy.allows_pii


def _inference_outputs(source: SourceSpec[InferenceSpec], types: Types) -> Iterator[Diagnostic]:
    outputs = source.spec.out
    for index, decl in enumerate(outputs):
        type_id = decl_type_id(decl)
        media = contained_types(type_id, types) if type_id is not None else frozenset[TypeId]()
        path: YamlPath = ("out", index, "type")
        for forbidden in sorted(media & FORBIDDEN_OUTPUTS):
            message = (
                f"output {decl.name} carries {forbidden}: an inference does not produce audio or video, a tool does"
            )
            yield diagnostic(DiagnosticCode.E_MODALITY_UNSUPPORTED, source.path, path, message)
        if IMAGE in media and (decl.type != IMAGE or len(outputs) != 1):
            message = (
                "an inference Image output is exactly one out field of type Image, with no list, record or other fields"
            )
            yield diagnostic(DiagnosticCode.E_MODALITY_UNSUPPORTED, source.path, path, message)
