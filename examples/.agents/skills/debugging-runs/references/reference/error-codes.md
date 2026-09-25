# Error codes

Generated index of run error codes, API error codes and check diagnostics from the AQVEN Python package.

## Contents

- [Run errors](#run-errors)
- [Causes of a model retry](#causes-of-a-model-retry)
- [API errors](#api-errors)
- [Check diagnostics](#check-diagnostics)

Every code below comes from the AQVEN package: the enums of failed steps and runs, the table a series uses to count an attempt, the API error codes and the diagnostics of `aqven check`.

## Run errors

A failed run, step or series attempt carries one of these in `error.code`. The series outcome says how a series counts the attempt; a code not listed here counts as `infra_error`. When more than 5% of a series' attempts end in `infra_error`, its verdict is `invalid`.

| Code | Raised by | Series outcome | Checks of the attempt |
| --- | --- | --- | --- |
| `provider_key_missing` | step | `infra_error` | skipped |
| `input_invalid` | step | `infra_error` | skipped |
| `prompt_invalid` | step | `infra_error` | skipped |
| `allowed_set_invalid` | step | `infra_error` | skipped |
| `media_unavailable` | step | `infra_error` | skipped |
| `code_invalid` | step | `infra_error` | skipped |
| `check_failed` | step | `model_fail` | binary checks fail, other checks are skipped |
| `output_invalid` | step | `schema_invalid` | binary checks fail, other checks are skipped |
| `budget_exceeded` | step | `budget_cut` | skipped |
| `provider_error` | step | `infra_error` | skipped |
| `refusal` | step | `refusal` | binary checks fail, other checks are skipped |
| `truncated` | step | `model_fail` | binary checks fail, other checks are skipped |
| `timeout` | step | `infra_error` | skipped |
| `MODEL_STREAM_STALLED` | step | `infra_error` | skipped |
| `OUTPUT_SCHEMA_REJECTED` | step | `schema_invalid` | binary checks fail, other checks are skipped |
| `approval_missing` | step | `infra_error` | skipped |
| `tool_unknown` | step | `infra_error` | skipped |
| `cassette_miss` | step | `infra_error` | skipped |
| `AMBIGUOUS_REPLAY` | step | `infra_error` | skipped |
| `HUMAN_TIMED_OUT` | step | `infra_error` | skipped |
| `HUMAN_DEFAULT_INVALID` | step | `infra_error` | skipped |
| `MODEL_FEATURE_UNSUPPORTED` | model call | `infra_error` | skipped |
| `MODEL_INVALID_JSON` | model call | `schema_invalid` | binary checks fail, other checks are skipped |
| `MODEL_NO_STRUCTURED_OUTPUT` | model call | `schema_invalid` | binary checks fail, other checks are skipped |
| `MODEL_RETRIES_EXHAUSTED` | model call | `schema_invalid` | binary checks fail, other checks are skipped |
| `MODEL_SCHEMA_MISMATCH` | model call | `schema_invalid` | binary checks fail, other checks are skipped |
| `E_JOIN_FAILED` | container step: parallel, map, loop | `infra_error` | skipped |
| `E_JOIN_UNDECIDED` | container step: parallel, map, loop | `infra_error` | skipped |
| `E_MAP_OVER_NOT_LIST` | container step: parallel, map, loop | `infra_error` | skipped |
| `E_MAP_ITEM_FAILED` | container step: parallel, map, loop | `infra_error` | skipped |
| `E_INPUT_OVERLAY_UNSUPPORTED` | container step: parallel, map, loop | `infra_error` | skipped |
| `E_POLICY_UNKNOWN` | policy or check function | `infra_error` | skipped |
| `E_CODE_REF_UNRESOLVED` | policy or check function | `infra_error` | skipped |
| `E_CODE_SIGNATURE_MISMATCH` | policy or check function | `infra_error` | skipped |
| `E_POLICY_PARAMS` | policy or check function | `infra_error` | skipped |
| `E_POLICY_INPUT` | policy or check function | `infra_error` | skipped |
| `E_POLICY_RAISED` | policy or check function | `infra_error` | skipped |
| `E_POLICY_RESULT` | policy or check function | `infra_error` | skipped |
| `INTERNAL` | run | `infra_error` | skipped |
| `PLAN_MISSING` | run | `infra_error` | skipped |
| `FLOW_NOT_FOUND` | run | `infra_error` | skipped |
| `INPUT_INVALID` | run | `infra_error` | skipped |
| `RETURNS_UNRESOLVED` | run | `infra_error` | skipped |

## Causes of a model retry

A retried or abandoned model call records one of these causes on the attempt of the step.

| Cause |
| --- |
| `rate_limited` |
| `schema_invalid` |
| `truncated` |
| `refusal` |
| `provider_error` |
| `budget_exceeded` |
| `cassette_miss` |
| `invalid_json` |
| `no_structured_output` |
| `feature_unsupported` |

## API errors

The project server answers a refused MCP tool call or REST request with one of these codes and the HTTP status below.

| Code | HTTP status |
| --- | --- |
| `NOT_FOUND` | 404 |
| `REQUEST_INVALID` | 422 |
| `INPUT_INVALID` | 422 |
| `CONTEXT_MISSING` | 422 |
| `BLOCKING_PROBLEMS` | 422 |
| `VIEW_TOO_BROAD` | 422 |
| `STALE_FILE` | 412 |
| `FILE_VANISHED` | 412 |
| `FILE_EXISTS` | 412 |
| `WAIT_ATTEMPT_STALE` | 412 |
| `TREE_DIRTY` | 409 |
| `INDEX_STALE` | 409 |
| `NOT_RUNNABLE` | 409 |
| `DIRTY_WORKTREE` | 409 |
| `ALREADY_RESUMED` | 409 |
| `NOT_WAITING` | 409 |
| `RUN_TIMED_OUT` | 409 |
| `RUN_STATE_CONFLICT` | 409 |
| `SERIES_STATE_CONFLICT` | 409 |
| `CHAT_STATE_CONFLICT` | 409 |
| `PROMPT_IS_CODE` | 409 |
| `LOCK_BUSY` | 423 |
| `UNAUTHORIZED` | 401 |
| `FORBIDDEN` | 403 |
| `HOST_NOT_ALLOWED` | 400 |
| `METHOD_NOT_ALLOWED` | 405 |
| `INTERNAL` | 500 |

## Check diagnostics

`aqven check` reports these codes. A code without a template builds its message where it is found; the message names the file, the path and the fix.

| Code | Severity | Rule | Message template | Hint |
| --- | --- | --- | --- | --- |
| `E_PROJECT_NOT_FOUND` | `error` | — | — | — |
| `E_YAML_SYNTAX` | `error` | — | — | — |
| `E_YAML_DUPLICATE_KEY` | `error` | — | — | — |
| `E_YAML_COMMENT` | `error` | — | — | — |
| `E_YAML_ANCHOR` | `error` | — | — | — |
| `E_YAML_TAG` | `error` | — | — | — |
| `E_YAML_DIRECTIVE` | `error` | — | — | — |
| `E_YAML_FLOW_STYLE` | `error` | — | — | — |
| `E_YAML_BLOCK_SCALAR` | `error` | — | — | — |
| `E_YAML_MULTI_DOCUMENT` | `error` | — | — | — |
| `E_YAML_NOT_MAPPING` | `error` | — | — | — |
| `E_API_VERSION` | `error` | — | — | — |
| `E_KIND_UNKNOWN` | `error` | — | — | — |
| `E_KIND_PATH_MISMATCH` | `error` | — | — | — |
| `E_UNKNOWN_KEY` | `error` | — | — | — |
| `E_SPEC_INVALID` | `error` | — | — | — |
| `E_NODE_KIND_UNSUPPORTED` | `error` | — | — | — |
| `E_BAD_NAME` | `error` | — | — | — |
| `E_ID_DUPLICATE` | `error` | — | — | — |
| `E_PACKAGE_MISMATCH` | `error` | — | — | — |
| `E_SOURCE_CONFLICT` | `error` | — | — | — |
| `E_BUILDER_FAILED` | `error` | — | — | — |
| `E_NODE_UNORDERED` | `error` | — | — | — |
| `E_ORPHAN_FILE` | `error` | — | — | — |
| `E_TYPE_REF_SYNTAX` | `error` | — | — | — |
| `E_TYPE_UNKNOWN` | `error` | — | — | — |
| `E_TYPE_CONSTRAINT_MISMATCH` | `error` | — | — | — |
| `E_TYPE_RECURSIVE` | `error` | R-36 | — | — |
| `E_REF_SYNTAX` | `error` | — | — | — |
| `E_REF_MISSING` | `error` | — | — | — |
| `E_REF_SCOPE` | `error` | — | — | — |
| `E_CYCLE` | `error` | R-44 | — | — |
| `E_BINDING_TYPE` | `error` | R-09 | — | — |
| `E_INPUT_UNBOUND` | `error` | R-09 | — | — |
| `E_INPUT_UNKNOWN` | `error` | R-09 | — | — |
| `E_INFERENCE_UNKNOWN` | `error` | — | — | — |
| `E_AGENT_UNKNOWN` | `error` | — | — | — |
| `E_AGENT_RECURSION` | `error` | — | — | — |
| `E_TOOL_UNKNOWN` | `error` | — | — | — |
| `E_PROVIDER_UNKNOWN` | `error` | R-03 | — | — |
| `E_MODALITY_UNSUPPORTED` | `error` | — | — | — |
| `E_TEXT_OUTPUT` | `error` | — | — | — |
| `E_SECRET_LITERAL` | `error` | R-S16 | — | — |
| `E_SECRET_REF_SYNTAX` | `error` | R-S16 | — | — |
| `E_PII_PROVIDER` | `error` | R-S12 | — | — |
| `E_PROMPT_MISSING` | `error` | — | — | — |
| `E_FRAGMENT_MISSING` | `error` | — | — | — |
| `E_PROMPT_SYNTAX` | `error` | — | — | — |
| `E_PROMPT_TAG_FORBIDDEN` | `error` | — | — | — |
| `E_PROMPT_FILTER_FORBIDDEN` | `error` | — | — | — |
| `E_PROMPT_MESSAGE_NESTED` | `error` | — | — | — |
| `E_PROMPT_VARIABLE_UNDECLARED` | `error` | R-T1 | — | — |
| `E_PROMPT_INPUT_UNUSED` | `error` | R-T2 | — | — |
| `E_PROMPT_OUTPUT_FORMAT` | `error` | R-T6 | — | — |
| `E_PROMPT_CASE_NOT_EXHAUSTIVE` | `error` | R-T4 | — | — |
| `E_PROMPT_MEDIA_RENDERED` | `error` | — | — | — |
| `E_VARIANT_MISSING` | `error` | — | — | — |
| `E_VARIANT_NOT_EXHAUSTIVE` | `error` | — | — | — |
| `E_EXAMPLE_INVALID` | `error` | — | — | — |
| `E_CHECK_PARAMS` | `error` | — | — | — |
| `E_POLICY_UNKNOWN` | `error` | — | — | — |
| `E_POLICY_PARAMS` | `error` | — | — | — |
| `E_CODE_REF_UNRESOLVED` | `error` | — | — | — |
| `E_CODE_SIGNATURE_MISMATCH` | `error` | — | — | — |
| `E_CODE_NOT_FOUND` | `error` | — | — | — |
| `E_ALIAS_UNKNOWN` | `error` | — | — | — |
| `E_ALIAS_RESERVED` | `error` | — | — | — |
| `E_ALIAS_OUTSIDE_PACKAGE` | `error` | — | — | — |
| `E_DOCSTRING` | `error` | — | — | — |
| `E_TOOL_IDEMPOTENCY` | `error` | — | — | — |
| `E_OUTPUT_UNBOUNDED` | `error` | R-42 | — | — |
| `E_SWITCH_NOT_EXHAUSTIVE` | `error` | R-41 | — | — |
| `E_SWITCH_ON_TYPE` | `error` | R-41 | — | — |
| `E_HUMAN_FORM_TYPE` | `error` | — | — | — |
| `E_HUMAN_DEFAULT_INVALID` | `error` | — | — | — |
| `E_APPROVAL_TOOL` | `error` | — | — | — |
| `E_OUTCOME_FALLBACK` | `error` | — | — | — |
| `E_DYNAMIC_LIMITS` | `error` | R-D2 | — | — |
| `E_DYNAMIC_SOURCE` | `error` | R-D3 | — | — |
| `E_DYNAMIC_VALUE_TYPE` | `error` | R-D3 | — | — |
| `E_OPAQUE_ACCESS` | `error` | R-D1 | — | — |
| `E_NARROW_TARGET` | `error` | R-D1 | — | — |
| `E_ALLOWED_SET_TYPE` | `error` | R-37a | — | — |
| `E_FLOW_UNKNOWN` | `error` | — | — | — |
| `E_CONTRACT_VIOLATION` | `error` | R-J2 | — | — |
| `E_FLOW_RECURSION` | `error` | — | — | — |
| `E_MCP_SERVER_UNKNOWN` | `error` | — | — | — |
| `E_DATASET_UNKNOWN` | `error` | — | — | — |
| `E_PROVIDER_EXTRA_MISSING` | `error` | — | model {model} needs provider {provider}, which is not installed | install the extra: uv add "aqven[{extra}]" |
| `E_PROVIDER_NO_STREAMING` | `error` | — | model {model}: provider {provider} does not support streaming, and aqven streams every model request | choose a model of a provider with streaming support |
| `E_PROVIDER_FACTORY_INVALID` | `error` | — | provider {provider}: {problem} | {fix} |
| `E_PROVIDER_ID_RESERVED` | `error` | — | provider id {provider} belongs to a built-in provider and cannot be declared with kind {kind} | rename the provider, for example {suggestion}, and write that name in the model of every agent |
| `E_OUTPUT_MODE_UNSUPPORTED` | `error` | — | output.mode {mode} is not supported by model {model} | set output.mode to one of: {supported} |
| `E_TYPES_PACKAGE` | `error` | — | — | — |
| `E_SIM_NODE_FAILED` | `error` | — | simulated run of flow {flow} (pass {pass}): node {address} failed: {code}: {message} | reproduce it with aqven run, or force the branch with a node output override; simulated flow input: {input} |
| `E_SIM_PROMPT_RENDER` | `error` | — | simulated run of flow {flow} (pass {pass}): node {address} cannot build its prompt: {message} | check the prompt template, its variables and the inputs bound to the node; simulated flow input: {input} |
| `E_SIM_OUTPUT_INVALID` | `error` | — | simulated run of flow {flow} (pass {pass}): node {address} returned an output its schema rejects: {message} | relax the output type or the checks of the node; simulated flow input: {input} |
| `E_SIM_RUN_FAILED` | `error` | — | simulated run of flow {flow} (pass {pass}) did not finish: {code}: {message} | run the flow with aqven run to see the failure; simulated flow input: {input} |
| `E_RANGE_INVALID` | `error` | — | experiment {experiment}: {problem} | {fix} |
| `E_VARIANT_INVALID` | `error` | — | experiment {experiment}: {problem} | {fix} |
| `E_FACTOR_MISSING` | `error` | — | experiment {experiment}: {problem}, but the experiment declares no varies | declare varies with what (agent, prompt, use or flow) and the nodes it changes; each variant sets values of that factor under nodes |
| `E_FACTOR_NODE_UNKNOWN` | `error` | — | experiment {experiment}: varies.nodes names {node}, {problem} | {fix} |
| `E_FACTOR_KIND` | `error` | — | experiment {experiment}: varies.what {what} changes {wanted} nodes, but {node} is a {kind} node | name {wanted} nodes of {subject} ({candidates}) or pick another varies.what |
| `E_VARIANT_OUTSIDE_FACTOR` | `error` | — | experiment {experiment}: variant {variant} sets {node}, which is not in varies.nodes ({nodes}) | add {node} to varies.nodes or remove it from the variant: the variants of an experiment change one factor on the nodes it declares |
| `E_ALTERNATIVE_UNKNOWN` | `error` | — | experiment {experiment}: variant {variant} puts alternative {alternative} at {node}, but {folder} has no such node; its alternatives: {alternatives} | create {folder}/{alternative}.node.yaml or name an existing alternative |
| `E_ALTERNATIVE_ID_TAKEN` | `error` | — | experiment {experiment}: alternative {alternative} has the id of a node of {subject} | rename the alternative file: an alternative runs under the id of its slot, and its own id must not shadow a node of the subject |
| `E_FACTOR_FLOW_CONTRACT` | `error` | — | experiment {experiment}: variant {variant} calls flow {flow} at {node}, whose {side} {own} differs from {side} {expected} of flow {original} | give flow {flow} the {side} type of flow {original}: every variant runs the same cases and checks |
| `E_METRIC_UNKNOWN` | `error` | — | experiment {experiment}: metric {metric} is neither a check id of the experiment nor a series metric | name a check id ({checks}) or a series metric ({metrics}) |
| `E_EXPERIMENT_UNKNOWN` | `error` | — | check {check}: validated_by names experiment {target}, which does not exist in the project | name the experiment that measured this judge on planted defects, or remove validated_by |
| `E_DATASET_MISMATCH` | `error` | — | experiment {experiment}: {problem} | {fix} |
| `E_CASE_DUPLICATE` | `error` | — | case name {name} is already taken by cases[{first}] of dataset {dataset} | rename one of the cases: name is the case key and is unique in a dataset |
| `E_CASES_EMPTY` | `error` | — | experiment {experiment}: tags {tags} select no case of dataset {dataset} | tag the cases of the dataset or relax the tag filter under cases.tags |
| `E_EXPECTED_MISSING` | `error` | — | experiment {experiment}: check {check} uses the built-in expected, but in case {case} {problem} | add {wanted} to case {case} of dataset {dataset}, or narrow cases.tags to cases that carry it |
| `E_CHECK_PATH_UNKNOWN` | `error` | — | experiment {experiment}: check {check}: path {ref} starts with {field}, which is not a field of {side} | name a field of {side}: {fields} |
| `E_FINDING_TAMPERED` | `error` | — | finding {finding} of experiment {experiment}: {problem} | a finding is written once by its series and never edited: restore the file from git or run a new series on holdout cases |
| `W_PROMPT_SHADOWED` | `warning` | — | — | — |
| `W_GENERATED_STALE` | `warning` | — | — | — |
| `W_OUTPUT_MODE_RESOLVED` | `warning` | — | output.mode auto resolves to {mode} for model {model} ({source}) | set output.mode: {mode} to pin it |
| `W_SAMPLING_IGNORED` | `warning` | — | {setting} is ignored by {model} (reasoning model); remove it | Pydantic AI drops sampling settings from every request to a model that reasons by default: steer the answer in the prompt, or pick a model without reasoning to keep {setting} |
| `W_TYPES_SHADOWS_STDLIB` | `warning` | — | generated {module}/types.py shadows the standard library module types while {folder} is on sys.path | remove {folder} from sys.path and PYTHONPATH; import the models as {module}.types |
| `W_SIM_NODE_UNREACHED` | `warning` | — | node {node} does not run in any simulated pass of flow {flow} | no simulated input reaches it: check the switch cases and the conditions above it, or remove the node |
| `W_PROMPT_VALUE_UNREADABLE` | `warning` | — | — | — |
| `W_TOOL_ARG_UNREACHABLE` | `warning` | — | — | — |
| `W_CONTEXT_KEY_UNUSED` | `warning` | — | — | — |
| `W_PLAN_EXCEEDS_CASES` | `warning` | — | experiment {experiment}: plan.cases is {planned}, but dataset {dataset} has {selected} selected cases | add cases to the dataset or lower plan.cases: a series runs each selected case at most once per repeat |
| `W_CHECK_CONTEXT_MISMATCH` | `warning` | — | experiment {experiment}: check {check}: {problem} | {fix} |
| `W_JUDGE_INPUT_UNBOUND` | `warning` | — | experiment {experiment}: judge {judge} of check {check} needs input {field}, which no document of its scope carries in {target} | the judge binds inputs by name from $in, the outputs of the top-level nodes, $out and expected_output: rename the input or make the field optional |
| `W_FINDINGS_STALE` | `warning` | — | FINDINGS.md does not match the finding files: {problem} | FINDINGS.md is generated from experiments/*/findings/*.yaml and is not edited by hand: restore it from git, the next finding on holdout cases rewrites it |
| `W_VARIANT_DUPLICATE` | `warning` | — | experiment {experiment}: variant {variant} sets the same values as variant {first} | change the values of one of them or remove it; to measure noise on purpose, leave every variant as written |
| `W_ALTERNATIVE_UNUSED` | `warning` | — | experiment {experiment}: {entity} is used by no variant | name it in variants[].nodes or delete {file} |
| `W_AGENT_SKILLS_STALE` | `warning` | — | out of sync with the installed aqven {version} in {target}: {problem} | run uv run aqven skills sync {package} in the folder of AGENTS.md: it rewrites the skill copies and the aqven block and keeps your text outside the block, including ## Owner's rules |
