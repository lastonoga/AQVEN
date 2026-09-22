from aqven.engine.llm.allowed import resolve_allowed_sets
from aqven.ir import CompiledInference
from aqven.policies.paths import read
from aqven.runtime.executions import AllowedSetMember, ResolvedAllowedSet
from aqven.runtime.values import InlineValue
from aqven.spec import RefRoot


def allowed_set_views(inference: CompiledInference, input_ref: InlineValue) -> tuple[ResolvedAllowedSet, ...]:
    """Describe allowed sets resolved from the input recorded for an inference call."""
    resolved = resolve_allowed_sets(inference, lambda path: read({RefRoot.IN: input_ref.value}, path))
    return tuple(
        ResolvedAllowedSet(
            type_id=spec.type_id,
            source=spec.source,
            labels_from=spec.labels_from,
            members=tuple(
                AllowedSetMember(value=value, label=label)
                for value, label in zip(allowed.values, allowed.labels, strict=True)
            ),
        )
        for spec, allowed in zip(inference.allowed_sets, resolved, strict=True)
    )
