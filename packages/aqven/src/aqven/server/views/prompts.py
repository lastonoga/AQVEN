import posixpath
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Final

from liquid.exceptions import LiquidError
from liquid.static_analysis import TemplateAnalysis

from aqven.check.templates import OUTPUT_FORMAT, IncludeLoader, prompt_environment
from aqven.diagnostics import Diagnostic
from aqven.loader import LoadedFlow, LoadedInference, LoadedProject, include_candidates, text_file
from aqven.runtime.runs import Page
from aqven.server.errors import not_found
from aqven.server.resources import (
    PromptAnalysis,
    PromptDetail,
    PromptLevel,
    PromptSlot,
    PromptSourceText,
    PromptSummary,
)
from aqven.server.views.common import diagnostics_in, loaded_flow, loaded_project, page_of
from aqven.server.workspace import WorkspaceState
from aqven.spec import InferenceId, InferenceSpec, LlmNodeSpec, NodeId, NodeSpec

PROMPT_KEY: Final = "prompt"
VARIANTS_PREFIX: Final = "variants/"
SERVICE_VARIABLES: Final = frozenset({OUTPUT_FORMAT, "variants"})


@dataclass(frozen=True, slots=True)
class PromptFacts:
    inference_id: str
    level: PromptLevel | None
    path: str | None
    text: str | None
    builder_ref: str | None
    analysis: TemplateAnalysis | None
    variant_files: tuple[str, ...]
    spec: InferenceSpec | None
    source_path: str | None


def prompt_candidates(loaded: LoadedInference, spec: InferenceSpec) -> tuple[str, ...]:
    if spec.prompt is None:
        return (text_file(loaded.stem, PROMPT_KEY),)
    path = spec.prompt_path
    return include_candidates((loaded.folder,), path) if path is not None else ()


def analyze(project: LoadedProject, loaded: LoadedInference, path: str, text: str) -> TemplateAnalysis | None:
    loader = IncludeLoader(project.texts, (posixpath.dirname(path), loaded.folder))
    try:
        return prompt_environment(loader).from_string(text, name=path).analyze(include_partials=True)
    except LiquidError:
        return None


def template_level(analysis: TemplateAnalysis | None, spec: InferenceSpec) -> PromptLevel | None:
    if analysis is None:
        return None
    variables = set(analysis.globals) - SERVICE_VARIABLES
    return 2 if variables or spec.variants else 1


def variant_files(loaded: LoadedInference) -> tuple[str, ...]:
    return tuple(sorted(text_file(loaded.stem, key) for key in loaded.texts if key.startswith(VARIANTS_PREFIX)))


def prompt_facts(project: LoadedProject, loaded: LoadedInference) -> PromptFacts:
    source = loaded.source
    if source is None:
        return PromptFacts(loaded.inference_id, None, None, None, None, None, (), None, None)
    spec = source.spec
    variants = variant_files(loaded)
    if spec.prompt_code is not None:
        return PromptFacts(loaded.inference_id, 3, None, None, spec.prompt_code, None, variants, spec, source.path)
    path = next((candidate for candidate in prompt_candidates(loaded, spec) if candidate in project.texts), None)
    if path is None:
        return PromptFacts(loaded.inference_id, None, None, None, None, None, variants, spec, source.path)
    text = project.texts[path]
    analysis = analyze(project, loaded, path, text)
    level = template_level(analysis, spec)
    return PromptFacts(loaded.inference_id, level, path, text, None, analysis, variants, spec, source.path)


def inference_facts(project: LoadedProject, inference_id: str | None) -> PromptFacts | None:
    if inference_id is None:
        return None
    loaded = project.inferences.get(InferenceId(inference_id))
    return None if loaded is None else prompt_facts(project, loaded)


def fact_paths(facts: PromptFacts) -> tuple[str, ...]:
    return tuple(path for path in (facts.source_path, facts.path, *facts.variant_files) if path is not None)


def prompt_problems(state: WorkspaceState, facts: PromptFacts) -> tuple[Diagnostic, ...]:
    return diagnostics_in(state, fact_paths(facts))


def summary_of(state: WorkspaceState, flow_id: str, node_id: str, facts: PromptFacts) -> PromptSummary:
    stat = state.snapshot.get(facts.path) if facts.path is not None else None
    return PromptSummary(
        flow_id=flow_id,
        node_id=node_id,
        inference_id=facts.inference_id,
        level=facts.level,
        path=facts.path,
        file_hash=None if stat is None else stat.file_hash,
        builder_ref=facts.builder_ref,
        has_draft=False,
        draft_stale=False,
        problems_count=len(prompt_problems(state, facts)),
    )


def llm_facts(project: LoadedProject, spec: NodeSpec) -> PromptFacts | None:
    return inference_facts(project, spec.inference) if isinstance(spec, LlmNodeSpec) else None


def flow_llm_facts(project: LoadedProject, flow: LoadedFlow) -> Iterator[tuple[str, PromptFacts]]:
    for node_id, node in sorted(flow.nodes.items()):
        facts = llm_facts(project, node.spec)
        if facts is not None:
            yield node_id, facts


def llm_prompts(state: WorkspaceState) -> Iterator[tuple[str, str, PromptFacts]]:
    project = loaded_project(state)
    for flow_id, flow in sorted(project.flows.items()):
        for node_id, facts in flow_llm_facts(project, flow):
            yield flow_id, node_id, facts


def prompt_summaries(
    state: WorkspaceState,
    flow_id: str | None,
    level: PromptLevel | None,
    cursor: str | None,
    limit: int,
) -> Page[PromptSummary]:
    rows = (summary_of(state, flow, node, facts) for flow, node, facts in llm_prompts(state))
    chosen = [row for row in rows if flow_id in (None, row.flow_id) and level in (None, row.level)]
    return page_of(chosen, lambda row: f"{row.flow_id}/{row.node_id}", cursor, limit)


def node_facts(state: WorkspaceState, flow_id: str, node_id: str) -> PromptFacts:
    node = loaded_flow(state, flow_id).nodes.get(NodeId(node_id))
    spec = None if node is None else node.spec
    if not isinstance(spec, LlmNodeSpec):
        raise not_found(f"node {flow_id}/{node_id} has no prompt: only llm nodes have prompts")
    facts = inference_facts(loaded_project(state), spec.inference)
    if facts is None:
        raise not_found(f"inference of node {flow_id}/{node_id} is not in the project")
    return facts


def analysis_view(analysis: TemplateAnalysis | None) -> PromptAnalysis | None:
    if analysis is None:
        return None
    return PromptAnalysis(
        variables=tuple(sorted(analysis.variables)),
        globals=tuple(sorted(analysis.globals)),
        filters=tuple(sorted(analysis.filters)),
        tags=tuple(sorted(analysis.tags)),
    )


def prompt_slots(facts: PromptFacts) -> tuple[PromptSlot, ...]:
    if facts.spec is None:
        return ()
    used = frozenset(facts.analysis.globals) if facts.analysis is not None else frozenset[str]()
    return tuple(PromptSlot(name=decl.name, type_id=decl.type, used=decl.name in used) for decl in facts.spec.in_)


def prompt_detail(state: WorkspaceState, flow_id: str, node_id: str) -> PromptDetail:
    return detail_of(state, flow_id, node_id, node_facts(state, flow_id, node_id))


def flow_prompt_details(state: WorkspaceState, flow: LoadedFlow) -> dict[str, PromptDetail]:
    project = loaded_project(state)
    return {node_id: detail_of(state, flow.flow_id, node_id, facts) for node_id, facts in flow_llm_facts(project, flow)}


def detail_of(state: WorkspaceState, flow_id: str, node_id: str, facts: PromptFacts) -> PromptDetail:
    summary = summary_of(state, flow_id, node_id, facts)
    slots = prompt_slots(facts)
    source = None if facts.text is None else PromptSourceText(text=facts.text, file_hash=summary.file_hash)
    unused = tuple(slot.name for slot in slots if not slot.used) if facts.analysis is not None else ()
    return PromptDetail(
        **summary.model_dump(),
        source=source,
        analysis=analysis_view(facts.analysis),
        slots=slots,
        unused_inputs=unused,
        variant_files=facts.variant_files,
        problems=prompt_problems(state, facts),
    )
