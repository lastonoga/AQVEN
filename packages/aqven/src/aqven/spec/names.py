from enum import IntEnum, StrEnum
from typing import Final, NewType

API_VERSION: Final = "aqven/v1"
NAME_PATTERN: Final = r"^[a-z][a-z0-9_]{0,62}$"
TYPE_REF_PATTERN: Final = r"^[A-Z][A-Za-z0-9_]{0,62}(\[\])?\??$"
MODULE_BODY: Final = r"[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*"
FUNCTION_BODY: Final = r"[A-Za-z_][A-Za-z0-9_]*"
CODE_REF_BODY: Final = f"{MODULE_BODY}:{FUNCTION_BODY}"
CODE_ALIAS_BODY: Final = rf"@[a-z_][a-z0-9_]*\.{CODE_REF_BODY}"
TEXT_PATH_BODY: Final = r"(@(flow|root)/|(\.{1,2}/)*)([A-Za-z0-9_][A-Za-z0-9_.-]*/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.md"
CODE_FILE_BODY: Final = rf"@root/([A-Za-z0-9_][A-Za-z0-9_.-]*/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.py:{FUNCTION_BODY}"
CODE_REF_PATTERN: Final = f"^{CODE_REF_BODY}$"
CODE_FILE_PATTERN: Final = f"^{CODE_FILE_BODY}$"
PROMPT_REF_PATTERN: Final = f"^({CODE_REF_BODY}|{CODE_ALIAS_BODY}|{CODE_FILE_BODY}|{FUNCTION_BODY}|{TEXT_PATH_BODY})$"
VARIANT_REF_PATTERN: Final = f"^([a-z][a-z0-9_]{{0,62}}|{TEXT_PATH_BODY})$"
TEXT_SUFFIX: Final = ".md"
SECRET_REF_PATTERN: Final = r"^ref:env/[A-Z][A-Z0-9_]*$"
REF_PATTERN: Final = (
    r"^\$(input|in|out|item|index|case|acc|iter|loop|ok|failed"
    r"|branch\.[a-z][a-z0-9_]{0,62}"
    r"|run\.context\.(date|time_zone|locale|tenant_id)"
    r"|[a-z][a-z0-9_]{0,62}\.out)"
    r"(\.[a-z][a-z0-9_]{0,62}|\[\*\]|\[[0-9]{1,4}\])*$"
)
INSTRUCTIONS_PATTERN: Final = f"^{TEXT_PATH_BODY}$"
PROVIDER_NAME_PATTERN: Final = r"^[a-z][a-z0-9_-]{0,62}$"
MODEL_PATTERN: Final = r"^[a-z][a-z0-9_-]{0,62}:[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$"
BLOB_ID_PATTERN: Final = r"^sha256-[0-9a-f]{64}$"

FlowId = NewType("FlowId", str)
NodeId = NewType("NodeId", str)
TypeId = NewType("TypeId", str)
InferenceId = NewType("InferenceId", str)
AgentId = NewType("AgentId", str)
ToolId = NewType("ToolId", str)
ModelString = NewType("ModelString", str)
McpServerId = NewType("McpServerId", str)
DatasetId = NewType("DatasetId", str)
ExperimentId = NewType("ExperimentId", str)
ArmId = NewType("ArmId", str)
VariantId = NewType("VariantId", str)
SecretRef = NewType("SecretRef", str)
ProviderName = NewType("ProviderName", str)
CodeRef = NewType("CodeRef", str)
BlobId = NewType("BlobId", str)
TimeZone = NewType("TimeZone", str)
Locale = NewType("Locale", str)
TenantId = NewType("TenantId", str)


class SpecKind(StrEnum):
    PROJECT = "Project"
    TYPE = "Type"
    FLOW = "Flow"
    NODE = "Node"
    DATASET = "Dataset"
    EXPERIMENT = "Experiment"
    INFERENCE = "Inference"
    AGENT = "Agent"
    TOOL = "Tool"
    MCP_SERVER = "McpServer"
    FINDING = "Finding"


class NodeKind(StrEnum):
    LLM = "llm"
    CODE = "code"
    TOOL = "tool"
    HUMAN = "human"
    PARALLEL = "parallel"
    MAP = "map"
    SWITCH = "switch"
    LOOP = "loop"
    CALL = "call"
    NARROW = "narrow"


class TypeKind(StrEnum):
    RECORD = "record"
    ENUM = "enum"
    UNION = "union"
    ID = "id"
    VALUE = "value"


class Effect(StrEnum):
    READ = "read"
    WRITE = "write"
    EXTERNAL = "external"


class Modality(StrEnum):
    TEXT = "text"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"
    DOCUMENT = "document"


class ModelFamily(StrEnum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    DEEPSEEK = "deepseek"
    QWEN = "qwen"
    MOONSHOT = "moonshot"
    ZHIPU = "zhipu"
    XAI = "xai"
    META = "meta"
    MISTRAL = "mistral"
    OTHER = "other"


class OnFail(StrEnum):
    RETRY = "retry"
    FAIL = "fail"
    FLAG = "flag"


class OutcomePolicy(StrEnum):
    FAIL = "fail"
    FALLBACK = "fallback"


class LoopStopReason(StrEnum):
    POLICY = "policy"
    MAX_ITER = "max_iter"
    BUDGET = "budget"


class TrustLevel(StrEnum):
    TRUSTED = "trusted"
    UNTRUSTED = "untrusted"


class PiiClass(StrEnum):
    NONE = "none"
    PII = "pii"
    SENSITIVE = "sensitive"


class PiiDetector(StrEnum):
    EMAIL = "email"
    PHONE = "phone"
    CARD_NUMBER = "card_number"
    IBAN = "iban"
    IP_ADDRESS = "ip_address"


class Retention(StrEnum):
    ZERO = "zero"
    LOGGED = "logged"
    UNKNOWN = "unknown"


class RunContextKey(StrEnum):
    DATE = "date"
    TIME_ZONE = "time_zone"
    LOCALE = "locale"
    TENANT_ID = "tenant_id"


class MetricKind(StrEnum):
    BINARY = "binary"
    ORDINAL = "ordinal"
    CONTINUOUS = "continuous"


class MetricDirection(StrEnum):
    HIGHER_IS_BETTER = "higher_is_better"
    LOWER_IS_BETTER = "lower_is_better"


class SeriesMetric(StrEnum):
    SUCCESS_RATE = "success_rate"
    COST_USD = "cost_usd"
    COST_OF_PASS = "cost_of_pass"
    LATENCY_P50_MS = "latency_p50_ms"
    LATENCY_P95_MS = "latency_p95_ms"
    SCHEMA_VALID_FIRST_TRY = "schema_valid_first_try"
    INFRA_ERROR_RATE = "infra_error_rate"


class SeriesSplit(StrEnum):
    DEV = "dev"
    HOLDOUT = "holdout"


class VerdictState(StrEnum):
    CONFIRMED = "confirmed"
    REFUTED = "refuted"
    INCONCLUSIVE = "inconclusive"
    INVALID = "invalid"
    SIGNAL = "signal"


class VerdictReason(StrEnum):
    BELOW_MDE = "below_mde"
    UNINFORMATIVE = "uninformative"
    NO_DISCORDANCE = "no_discordance"
    COMPUTE_CONFOUNDED = "compute_confounded"
    INPUTS_CHANGED = "inputs_changed"
    INFRA_ERRORS = "infra_errors"
    NO_DATA = "no_data"
    BUDGET_CUT = "budget_cut"
    CANCELLED = "cancelled"
    DEV_SPLIT = "dev_split"
    JUDGE_NOT_VALIDATED = "judge_not_validated"


class CellVerdict(StrEnum):
    PASS = "pass"
    FAIL = "fail"
    UNCLEAR = "unclear"
    REFERENCE = "reference"
    NONE = "none"


class PromptLevel(IntEnum):
    INSTRUCTION = 1
    TEMPLATE = 2
    CODE = 3
