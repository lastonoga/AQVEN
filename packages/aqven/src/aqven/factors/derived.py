import hashlib
from collections.abc import Callable
from dataclasses import replace
from typing import Final

from aqven.loader import ROOT_PATH_PREFIX, ExperimentPrompt, LoadedInference, SourceSpec
from aqven.spec import InferenceId, InferenceSpec

DERIVED_MARK: Final = "_p"
HASH_LENGTHS: Final = (8, 12, 16, 24, 32)
MAX_ID_LENGTH: Final = 63
SEPARATOR: Final = "\0"


def derived_inference(
    origin: LoadedInference,
    source: SourceSpec[InferenceSpec],
    prompt: ExperimentPrompt,
    taken: Callable[[InferenceId], bool],
) -> LoadedInference:
    base = origin.origin or origin.inference_id
    spec = source.spec.model_copy(update={"prompt": f"{ROOT_PATH_PREFIX}{prompt.path}"})
    return LoadedInference(
        inference_id=derived_inference_id(base, prompt.path, taken),
        folder=origin.folder,
        source=replace(source, spec=spec),
        builder_path=None,
        texts={},
        origin=base,
    )


def derived_inference_id(origin: InferenceId, prompt_path: str, taken: Callable[[InferenceId], bool]) -> InferenceId:
    digest = hashlib.sha256(f"{origin}{SEPARATOR}{prompt_path}".encode()).hexdigest()
    candidates = tuple(_candidate(origin, digest[:length]) for length in HASH_LENGTHS)
    return next((candidate for candidate in candidates if not taken(candidate)), candidates[-1])


def _candidate(origin: InferenceId, digest: str) -> InferenceId:
    head = origin[: MAX_ID_LENGTH - len(DERIVED_MARK) - len(digest)]
    return InferenceId(f"{head}{DERIVED_MARK}{digest}")
