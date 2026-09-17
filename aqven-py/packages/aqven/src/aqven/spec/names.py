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
MODEL_PATTERN: Final = r"^(openai|anthropic|google|openrouter|together):[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$"
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
EvalId = NewType("EvalId", str)
SecretRef = NewType("SecretRef", str)
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
    EVAL = "Eval"
    INFERENCE = "Inference"
    AGENT = "Agent"
    TOOL = "Tool"
    MCP_SERVER = "McpServer"


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


class ProviderName(StrEnum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    OPENROUTER = "openrouter"
    TOGETHER = "together"


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


class GateAction(StrEnum):
    RELEASE = "release"
    REQUIRE_APPROVAL = "require_approval"
    REJECT = "reject"


class PromptLevel(IntEnum):
    INSTRUCTION = 1
    TEMPLATE = 2
    CODE = 3
