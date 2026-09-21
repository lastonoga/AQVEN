# Inference presentation formatters

> Historical proposal. The implemented design uses typed Liquid component tags for the common case, retains a
> Python `run` formatter for exceptional cases, and presents Runs with the user-selected **Formatted/Raw** switch.
> See [the current flow guide](../../../aqven-py/docs/building-flows.md#5-presenting-inference-values-in-studio).

## Original proposal

## Goal

Let a project supply a reusable Python formatter for an inference's input, output, or both. The formatter returns a versioned JSON document describing approved Studio display elements. Runs can show either the existing Default value view or the Formatted view. The recorded input and output remain the source of truth.

## Scope

The first release applies to individual inference executions in Runs: input and output matrix cells and their call sheet sections. The flow-level run output has no single inference owner and continues to use Default. Presentation does not write run state, and rendered elements cannot initiate actions. A formatter is trusted project Python; AQVEN validates its return value but does not sandbox the function against external side effects. Formatter code should be synchronous and side-effect free.

## Declaration and formatter API

`InferenceSpec` gains an optional `display` object with independent `input` and `output` entries. Each entry names a project Python function through the existing code-reference syntax. Both entries may name the same function. Each entry may supply named `variables` whose values are resolved through the existing inference reference syntax (`$in`, `$out`, and `$run.context`) when the view is requested. The compiler validates the references and places the declaration in `CompiledInference` so a run can select it through its plan snapshot.

The callable receives `(value, context)` and returns a `DisplayDocument`. `value` is the complete value of the selected side. The context contains `side`, the complete recorded inference input and output when present, resolved display variables, selected prompt variants when recorded, the actual model from the execution, the inference ID, execution address, and UI locale. An output may be absent while the inference is running or failed. An input may be absent for runs made before input capture existed. Missing data is explicit `None`.

`DisplayDocument` is a strict Pydantic model with protocol version 1 and a tagged tree of `section`, `text`, `field`, `list`, `badge`, and `media` elements. Textual elements may contain a literal value or a JSON Pointer into the focused value. A literal may name source leaf paths that it represents. Media elements reference existing media values or blob IDs. The document contains no HTML, JavaScript, CSS classes, component import paths, or arbitrary URLs. Studio maps element kinds and semantic tones to its local components. Unknown versions or invalid documents cause a per-value fallback to Default.

## Recording data for both sides

The engine currently records execution output and actual model but projects `input_ref`, `agent`, and `inference` as `None`. To support input formatting and failed-run inspection, the inference executor records bound input before validation. After successful preparation it records normalized input and selected prompt variants. The execution projection uses normalized input when available and bound input otherwise. These events only enrich observation data; formatter results are never used by checks, retries, references, or replay.

Existing runs keep their recorded outputs. Their missing inference input remains unavailable; Studio uses Default for the input when no canonical input can be read and does not reconstruct it from upstream values.

## Presentation API and Studio

The Python server adds a read-only batch endpoint under a run ID. Each request target identifies an execution address and side (`input` or `output`). The service loads the run's compiled plan and execution snapshot, resolves the inference declaration, hydrates complete values including text blobs, resolves display variables, invokes the Python formatter, validates its document, and returns one result per target. A formatter failure is isolated to its target. The endpoint does not modify the run or its output references.

Studio adds `Formatted` as an alternative to `Default` for an inference value. Default remains the existing renderer, including its Flat/JSON choice. The mode selection is shared between the Runs matrix and call sheet. When the formatter is unavailable or fails, Studio displays Default with a small explanation in the detail panel. Text is wrapped and complete; the formatted view has no inner scroll area in the matrix. Original Flat and JSON remain accessible. Studio compares the document's represented leaf paths with the complete value and appends every unrepresented leaf as compact Flat rows under “Additional data”, so the formatted view cannot silently hide recorded data. A pointer to a container does not mark its descendants as represented unless a dedicated media element renders the whole media value.

The backend's document describes semantic content. Studio decides spacing for narrow matrix cells and wider detail panels. Existing media rendering continues to use the blob endpoint. The batch request is made only for visible inference values when the user selects Formatted; results are cached by run, execution address, side, formatter identity, and locale. Values without a display declaration use Default.

## History and failure policy

The compiled plan retains the formatter declaration, but AQVEN does not snapshot Python formatter source. Version 1 treats the formatter as a current project presentation of historical immutable data. A future requirement for exact historical appearance would require storing the generated display document as a separate run artifact. The API reports the formatter identity and version so a changed or missing formatter is diagnosable. No formatter failure changes run status.

## Verification

Python tests cover declaration validation, compilation, both input capture stages, success and preparation failure, batch presentation, full blob hydration, and per-target formatter failure. Studio tests cover Default/Formatted switching in matrix and call sheet, the same formatter on both sides, complete text, media, unknown document fallback, and click handling inside a matrix cell. A Lumen inference uses the same formatter for input and output as an end-to-end example.
