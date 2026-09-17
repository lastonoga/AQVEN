from typing import Final

EXECUTOR_PROTOCOL_VERSION: Final = "aqven-executor-1"
APPLICATION_NAME: Final = "aqven"
RUN_EVENTS_STREAM: Final = "run_events"
RUN_FLOW_WORKFLOW: Final = "aqven.run_flow"
RUN_BRANCH_WORKFLOW: Final = "aqven.run_branch"
EXECUTE_NODE_STEP: Final = "aqven.execute_node"
NODE_BOUNDARY_STEP: Final = "aqven.node_boundary"
POLLING_INTERVAL_SECONDS: Final = 0.05
STATE_DIRECTORY: Final = ".aqven"
DBOS_DATABASE_FILE: Final = "dbos.sqlite"
PLANS_DIRECTORY: Final = "plans"
BLOBS_DIRECTORY: Final = "blobs"
DBOS_LOG_LEVEL: Final = "WARNING"
